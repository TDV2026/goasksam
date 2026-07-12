// Thin HTTP wrapper over the shared vehicle resolver (lib/vehicle.js).
// All parsing, alias expansion, typo confirmation, and year validation live
// there. When the deterministic resolver reads NOTHING usable, one Claude
// extraction pass runs as the safety net (cached by input hash): the LLM
// extracts structure, the extraction re-enters the normal resolver pipeline,
// and the canned "year, make and model" line only renders after both fail.

import { createHash } from "node:crypto";
import { resolveVehicle } from "../lib/vehicle.js";
import { supabaseInsert, supabaseSelect } from "../lib/_supabase.js";
import { recordUsageEvent, anthropicCost } from "./_usage.js";

const EXTRACT_MODEL = process.env.SAM_MODEL || "claude-sonnet-4-6";
const EXTRACT_SYS = `Extract vehicle facts from a message someone typed about a car they may sell. Reply with ONLY a JSON object, no prose:
{"make":string|null,"model":string|null,"trim":string|null,"year":number|null,"decade":string|null,"condition_hint":string|null,"location_hint":string|null,"price_hint":string|null,"confidence":"high"|"low"}
Rules: make/model use proper names (lx470 means Lexus LX 470; hellcat alone means Dodge but the model is ambiguous, leave model null). decade like "1980s" when only an era is given. confidence "high" only when make plus model (or an unambiguous nickname) are clear. Never invent details not present.`;

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function nothingUnderstood(result) {
  return result.status === "needs_clarification"
    && !result.vehicle?.make && !result.vehicle?.model;
}

async function llmExtractVehicle(text, env) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const cacheKey = createHash("sha256").update(`vehx|${EXTRACT_MODEL}|${text}`).digest("hex");
  const cached = await supabaseSelect(env, `narration_cache?cache_key=eq.${cacheKey}&select=response_text&limit=1`);
  let jsonText = cached?.[0]?.response_text || null;
  let usage = null;
  if (!jsonText) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: EXTRACT_MODEL,
        max_tokens: 250,
        system: EXTRACT_SYS,
        messages: [{ role: "user", content: text.slice(0, 400) }]
      })
    });
    const data = await response.json();
    if (!response.ok) return null;
    jsonText = data.content?.[0]?.text || "";
    usage = data.usage || null;
    if (jsonText) {
      await supabaseInsert("narration_cache", [{ cache_key: cacheKey, response_text: jsonText, model: EXTRACT_MODEL, created_at: new Date().toISOString() }],
        env?.supabaseUrl, env?.supabaseKey, "resolution=merge-duplicates,return=minimal", "?on_conflict=cache_key");
    }
  }
  try {
    const parsed = JSON.parse(String(jsonText).replace(/^[^{]*/, "").replace(/[^}]*$/, ""));
    return { parsed, usage };
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const raw = req.body?.text || req.body?.car || req.body?.search || req.body?.query;
  if (!raw) return res.status(400).json({ error: "Missing text" });
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  const env = { supabaseUrl, supabaseKey };

  try {
    let result = await resolveVehicle(raw);
    let fallbackUsed = null;

    if (nothingUnderstood(result)) {
      var extraction = await llmExtractVehicle(String(raw), env);
      var parsed = extraction?.parsed;
      if (parsed && (parsed.make || parsed.model)) {
        // The LLM extracts; it never writes state. The rebuilt phrase goes
        // through the full deterministic pipeline (aliases, validation,
        // confirmation, contamination stripping) like any user input.
        const rebuilt = [parsed.year || parsed.decade, parsed.make, parsed.model, parsed.trim].filter(Boolean).join(" ").trim();
        const second = rebuilt ? await resolveVehicle(rebuilt) : null;
        if (second && (second.status !== "needs_clarification" || second.vehicle?.make || second.vehicle?.model)) {
          result = second;
          fallbackUsed = "extraction_resolved";
        } else {
          // Low confidence: one grounded question echoing what WAS read.
          const seen = parsed.make || parsed.model;
          const missing = [!parsed.year && !parsed.decade ? "year" : null, !parsed.model ? "model" : null].filter(Boolean);
          result = {
            status: "needs_clarification",
            vehicle: { ...result.vehicle, make: parsed.make || null, model: parsed.model || null },
            clarification: {
              question: `I can see a ${seen} in there. ${missing.length ? `Which ${missing.join(" and ")}?` : "Give me the year, make and model in one line."}`,
              missing,
              baseVehicle: [parsed.year, parsed.make, parsed.model].filter(Boolean).join(" ") || null,
              chips: ["Change car", "Not sure"]
            },
            corrections: result.corrections
          };
          fallbackUsed = "extraction_grounded_question";
        }
      } else {
        fallbackUsed = "extraction_failed";
      }
      // Failed-resolution logging: real user phrasing becomes the alias and
      // fuzzer backlog, and resolution rate becomes a health metric.
      await recordUsageEvent({
        event_type: "vehicle_resolution_fallback",
        route: "/api/vehicleIdentity",
        status: fallbackUsed || "unknown",
        search_text: String(raw).slice(0, 500),
        anthropic_model: EXTRACT_MODEL,
        anthropic_input_tokens: Number(extraction?.usage?.input_tokens || 0),
        anthropic_output_tokens: Number(extraction?.usage?.output_tokens || 0),
        anthropic_cost_usd: extraction?.usage ? anthropicCost(extraction.usage) : 0,
        oldcarsdata_metered_requests: 0,
        metadata: { extraction: parsed || null, outcome: fallbackUsed }
      }, supabaseUrl, supabaseKey);
    }

    // The wizard treats a typo confirmation like any other clarification: it
    // shows the question and the "Did you mean ..." suggestion chip.
    const status = result.status === "needs_confirmation" ? "needs_clarification" : result.status;
    return res.status(200).json({
      status,
      vehicle: result.vehicle,
      clarification: result.clarification,
      corrections: result.corrections,
      fallback: fallbackUsed || undefined
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Vehicle identity failed" });
  }
}
