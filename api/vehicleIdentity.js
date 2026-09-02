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
import { testerCodeExpired } from "../lib/_tester.js";
import { vinFeatureActive } from "../lib/_flags.js";

// Privacy (VIN feature): a raw 17-char VIN must never land in a funnel/analytics
// event or a log line. Replace any VIN run with a short truncated marker so the
// event stays useful for debugging without storing the full identifier.
function scrubVin(text) {
  return String(text || "").replace(/\b[A-HJ-NPR-Z0-9]{17}\b/gi, m => `[vin:${m.slice(-4)}]`);
}

// Exact-VIN archive match (VIN feature, 4a). Most recent prior sale of THIS exact
// car in vehicle_market_records, plus how many times it has traded. Evidence only,
// never ranking. Free service-role read; null on any error (feature degrades to no
// callout, never an error).
async function vinArchiveMatch(vin, supabaseUrl, supabaseKey) {
  if (!vin || !supabaseUrl || !supabaseKey) return null;
  try {
    const url = `${supabaseUrl}/rest/v1/vehicle_market_records?raw_record->>vin=eq.${encodeURIComponent(vin)}&select=source,auction_end_date,price,source_url,raw_record&order=auction_end_date.desc.nullslast&limit=25`;
    const r = await fetch(url, { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } });
    if (!r.ok) return null;
    const rows = await r.json();
    if (!Array.isArray(rows) || !rows.length) return null;
    const top = rows[0];
    const rr = top.raw_record || {};
    return {
      count: rows.length,
      source: top.source || null,
      soldDate: top.auction_end_date || null,
      price: Number(top.price) || null,
      url: top.source_url || rr.source_url || rr.url || null,
      mileage: Number(rr.mileage) || null
    };
  } catch { return null; }
}

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

// Model-level all-time count in our archive (vehicle_market_records). Feeds the
// frontend out-of-scope gate and the rarity wording rule. Free service-role read;
// null on any error so the gate fails open (never refuses on a missing count).
async function archiveModelCount(make, model, supabaseUrl, supabaseKey) {
  if (!make || !model || !supabaseUrl || !supabaseKey) return null;
  try {
    const url = `${supabaseUrl}/rest/v1/vehicle_market_records?make=ilike.${encodeURIComponent(make)}&model=ilike.${encodeURIComponent("*" + model + "*")}&select=id`;
    const r = await fetch(url, { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, Prefer: "count=exact", Range: "0-0" } });
    return Number((r.headers.get("content-range") || "*/0").split("/")[1] || 0);
  } catch (e) { return null; }
}

// Dirty input: the deterministic parse dropped conversational tokens. The
// cached extraction arbitrates so meaning (a second year, an "or 88") is
// recovered rather than discarded.
function dirtyInput(result) {
  return Array.isArray(result.vehicle?.dirtyTokens) && result.vehicle.dirtyTokens.length > 0;
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

  // Spec D: server-side curtain seal (same gate as the decision API). Pre-launch,
  // non-crew requests are refused here, not merely hidden by CSS. Env-gated
  // (CURTAIN_SEALED=1), default off; removed on launch day with the curtain.
  // Honor BOTH crew and (non-expired) tester cookies, identically to sellerDecision's
  // seal. The old crew-only check 403'd every tester session on the resolver call, so a
  // real tester-link visitor could never get past vehicle resolution while sealed.
  if (process.env.CURTAIN_SEALED === "1") {
    const cookie = req.headers.cookie || "";
    const testerOk = cookie.indexOf("gas_tester=ok") !== -1 && !testerCodeExpired();
    if (cookie.indexOf("gas_crew=ok") === -1 && !testerOk) {
      return res.status(403).json({ status: "sealed", error: "Not open yet." });
    }
  }

  const raw = req.body?.text || req.body?.car || req.body?.search || req.body?.query;
  if (!raw) return res.status(400).json({ error: "Missing text" });
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  const env = { supabaseUrl, supabaseKey };

  try {
    // VIN feature flag (dark by default): active only for crew/test sessions when
    // app_config vin_input_enabled is on. When off, vinConfirm is false and the
    // resolver's VIN path is byte-identical to today (silent decode).
    const vinActive = await vinFeatureActive(req.headers.cookie, env);
    // keepAsTyped (DEFECT 4): the seller insists on their designation after a
    // near-miss, so skip the "did you mean" confirmation and accept it unverified.
    const resolveOpts = { ...(req.body?.keepAsTyped ? { keepAsTyped: true } : {}), ...(vinActive ? { vinConfirm: true } : {}) };
    let result = await resolveVehicle(raw, resolveOpts);
    let fallbackUsed = null;

    // (b) A misspelled marque must ALWAYS land on the deterministic typo confirmation
    // ("Did you mean the Porsche?"), never the non-deterministic LLM extraction fallback
    // (which, being an LLM call, sometimes returned the "type it in one line" retype
    // prompt for the same input). When the deterministic pass already produced a
    // confident typo confirmation carrying a make, that IS the answer: short-circuit the
    // LLM so the outcome is stable across identical inputs.
    const confidentTypoConfirm = result.status === "needs_confirmation"
      && result.clarification?.kind === "typo_confirmation"
      && !!result.vehicle?.make;

    if (!confidentTypoConfirm && (nothingUnderstood(result) || dirtyInput(result))) {
      const wasDirtyArbitration = !nothingUnderstood(result);
      var extraction = await llmExtractVehicle(String(raw), env);
      var parsed = extraction?.parsed;
      if (wasDirtyArbitration) {
        // Arbitration: prefer the extraction's rebuild only when it resolves
        // at least as cleanly as the deterministic result; otherwise keep the
        // deterministic (already whitelisted) resolution.
        if (parsed && (parsed.make || parsed.model)) {
          const rebuilt = [parsed.year || parsed.decade, parsed.make, parsed.model, parsed.trim].filter(Boolean).join(" ").trim();
          const second = rebuilt ? await resolveVehicle(rebuilt) : null;
          if (second && ["valid", "needs_confirmation"].includes(second.status) && second.vehicle?.make && !second.vehicle?.dirtyTokens) {
            result = second;
            fallbackUsed = "dirty_arbitration_extraction";
          } else {
            fallbackUsed = "dirty_arbitration_kept_deterministic";
          }
        } else {
          fallbackUsed = "dirty_arbitration_kept_deterministic";
        }
      } else if (parsed && (parsed.make || parsed.model)) {
        // The LLM extracts; it never writes state. The rebuilt phrase goes
        // through the full deterministic pipeline (aliases, validation,
        // confirmation, contamination stripping) like any user input.
        const rebuilt = [parsed.year || parsed.decade, parsed.make, parsed.model, parsed.trim].filter(Boolean).join(" ").trim();
        const second = rebuilt ? await resolveVehicle(rebuilt) : null;
        if (second && (second.status !== "needs_clarification" || second.vehicle?.make || second.vehicle?.model)) {
          result = second;
          fallbackUsed = "extraction_resolved";
        } else {
          const seen = parsed.make || parsed.model;
          const missing = [!parsed.year && !parsed.decade ? "year" : null, !parsed.model ? "model" : null].filter(Boolean);
          if (parsed.make && parsed.model && !missing.length) {
            // Unknown-MAKE escape (mirrors the unknown-MODEL seller_designation_unverified
            // path in resolveVehicle): the LLM confidently read a full make+model+year that
            // the deterministic layer can't verify - a low-volume specialty marque like
            // Rossion. Accept it MAKE-LEVEL UNVERIFIED and proceed (the analysis runs
            // honestly at make level and never claims model comps) instead of re-asking for
            // a car the seller already fully described (the infinite re-ask loop).
            const tc = s => String(s || "").trim().replace(/\S+/g, w => (w.length <= 3 || /\d/.test(w)) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
            const yr = Number(parsed.year) || null;
            const mk = tc(parsed.make), md = String(parsed.model).trim();
            result = {
              status: "valid",
              vehicle: { ...result.vehicle, raw: rebuilt || raw, year: yr, make: mk, model: md, trim: parsed.trim || null, unverified: true, confidence: "low", canonicalLabel: [yr, mk, md].filter(Boolean).join(" ") },
              corrections: result.corrections
            };
            fallbackUsed = "extraction_unverified_make";
          } else {
            // Low confidence: one grounded question echoing what WAS read.
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
        }
      } else if (!wasDirtyArbitration) {
        fallbackUsed = "extraction_failed";
      }
      // Failed-resolution logging: real user phrasing becomes the alias and
      // fuzzer backlog, and resolution rate becomes a health metric.
      await recordUsageEvent({
        event_type: "vehicle_resolution_fallback",
        route: "/api/vehicleIdentity",
        status: fallbackUsed || "unknown",
        search_text: scrubVin(String(raw)).slice(0, 500),
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
    // Model-level archive count for the out-of-scope gate + rarity wording (only
    // when a make+model actually resolved). Null if unknown -> gate fails open.
    const modelCount = (result.vehicle?.make && result.vehicle?.model && (result.status === "valid" || result.status === "needs_confirmation"))
      ? await archiveModelCount(result.vehicle.make, result.vehicle.model, supabaseUrl, supabaseKey)
      : null;
    // Exact-VIN archive match (4a): only when the VIN feature decoded a VIN this
    // request. Off-feature or no-VIN requests never carry it, so the response shape
    // is unchanged for every real seller.
    const vinMatch = (vinActive && result.vehicle?.vin)
      ? await vinArchiveMatch(result.vehicle.vin, supabaseUrl, supabaseKey)
      : null;
    return res.status(200).json({
      status,
      vehicle: result.vehicle,
      clarification: result.clarification,
      corrections: result.corrections,
      archiveModelCount: modelCount,
      vinArchiveMatch: vinMatch || undefined,
      fallback: fallbackUsed || undefined
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Vehicle identity failed" });
  }
}
