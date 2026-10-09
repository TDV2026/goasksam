import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { hasServerCredential } from "../lib/_credential.js";
import { followupGuard, assistGuard } from "../lib/_ceilings.js";
import { anthropicCost, recordUsageEvent, requestMetadata } from "./_usage.js";
import { supabaseInsert, supabaseSelect } from "../lib/_supabase.js";

// Wording layer only. Must never invent market performance (product rule 1).
const CHAT_MODEL = process.env.SAM_MODEL || "claude-sonnet-4-6";

// BANNED WORD BACKSTOP (locked, mirrors lib/live/samChat.js cleanSearchReply's sentence-level
// filter for Buy): this is the only caller of /api/chat (the Sell wizard's SELL_SYS prompt already
// bans these words), but a model reply is never fully trustworthy on its own - any sentence
// carrying one of these words is dropped whole rather than surgically edited, which would risk a
// grammatically broken half-sentence ("a fair value" -> "a fair"). Checked on word boundaries so
// "valuable" or "worthwhile" are not caught.
const SELL_BANNED_WORD_RE = /\b(estimate[sd]?|appraisal|appraise[sd]?|worth|valuation|median)\b|\bvalue\b/i;
function cleanSellReply(text) {
  const parts = String(text || "").replace(/\s+/g, " ").trim().match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
  return parts.map(x => x.trim()).filter(x => x && !SELL_BANNED_WORD_RE.test(x)).join(" ").trim();
}

// Narration cache: identical request payloads (model + prompts + facts +
// conversation) reuse the stored wording at zero Anthropic cost. Any change
// to the facts changes the hash, so invalidation is inherent. Degrades
// silently until docs/supabase-narration-cache.sql is applied.
function narrationCacheKey(system, context, messages) {
  return createHash("sha256")
    .update(JSON.stringify({ model: CHAT_MODEL, system: system || "", context: context || "", messages: messages || [] }))
    .digest("hex");
}

// SERVER-HELD PROMPTS (Oct 2026, open-search policy, spend protection). The page no longer sends a system
// prompt: it names a mode, and the prompt is read here from the SAME files the page uses (js/chat-core.js
// SYS, js/wizard.js SELL_SYS; vercel.json includeFiles), so there is one copy and no open model proxy.
//   mode "assist":   a question before a search (the entry chat). Open, under the invisible ceiling.
//   mode "followup": a question about a result (the Sell follow-up chat). The ONE gated action: a verified
//                    signed-in session (checked here, never a client flag), a daily allowance per account,
//                    and the ceiling. Signed out gets the sign in line.
// Our own jobs (lib/_credential.js header credential) may still send their own prompt, for the smoke tests.
function promptFrom(file, name) {
  try { const s = fs.readFileSync(path.join(process.cwd(), file), "utf8"); const i = s.indexOf("const " + name + "=`"), j = s.indexOf("`;", i); return i < 0 || j < 0 ? null : s.slice(i + name.length + 8, j); } catch { return null; }
}
let PROMPTS = null;
const prompts = () => PROMPTS || (PROMPTS = { assist: promptFrom("js/chat-core.js", "SYS"), followup: promptFrom("js/wizard.js", "SELL_SYS") });
const MAX_MSG = 2000, MAX_TOTAL = 12000, MAX_TURNS = 12, MAX_CONTEXT = 20000, MAX_OUT = 700;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "No API key configured" });
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  // `system` is the static prompt (cached as a prefix by Anthropic); `context`
  // carries per-turn state (wizard step, sell state) so it never breaks the cache.
  const body = req.body || {}, P = prompts(), cred = hasServerCredential(req), env = { supabaseUrl, supabaseKey };
  // The mode, and its server-held prompt. A page still on an older script sends the prompt itself: it is
  // accepted only when it is exactly one of the two held here (so it can never be a different prompt).
  let mode = body.mode === "followup" || body.mode === "assist" ? body.mode
    : (body.system && body.system === P.followup ? "followup" : body.system && body.system === P.assist ? "assist" : null);
  let system = mode ? P[mode] : null;
  if (cred && body.system && !mode) { system = String(body.system); mode = "followup"; }   // our smoke tests only
  if (!system) return res.status(400).json({ error: "Unknown chat." });
  // Size caps: the last 12 turns, 2,000 characters each, 12,000 in all; the result facts up to 20,000.
  let messages = (Array.isArray(body.messages) ? body.messages : []).filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-MAX_TURNS).map(m => ({ role: m.role, content: m.content.slice(0, MAX_MSG) }));
  while (messages.length > 1 && messages.reduce((n, m) => n + m.content.length, 0) > MAX_TOTAL) messages.shift();
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length || messages[messages.length - 1].role !== "user") return res.status(400).json({ error: "Nothing to answer." });
  const context = body.context ? String(body.context).slice(0, MAX_CONTEXT) : undefined;
  // The one guard (lib/_ceilings.js): the follow-up needs a verified session and has a daily allowance; a
  // question before a search is open. Both sit under the invisible ceiling.
  const g = mode === "followup" ? await followupGuard(env, req) : await assistGuard(env, req);
  if (!g.ok) return res.status(200).json(g.body);
  const systemBlocks = [];
  if (system) systemBlocks.push({ type: "text", text: String(system), cache_control: { type: "ephemeral" } });
  if (context) systemBlocks.push({ type: "text", text: String(context) });
  const startedAt = Date.now();
  const latestUserMessage = [...(messages || [])].reverse().find(message => message.role === "user");
  const searchText = typeof latestUserMessage?.content === "string" ? latestUserMessage.content.slice(0, 500) : null;

  const logError = async (errorMessage, httpStatus) => recordUsageEvent({
    event_type: "chat",
    route: "/api/chat",
    status: "error",
    search_text: searchText,
    anthropic_model: CHAT_MODEL,
    anthropic_input_tokens: 0,
    anthropic_output_tokens: 0,
    anthropic_cost_usd: 0,
    oldcarsdata_metered_requests: 0,
    oldcarsdata_cost_1k_usd: 0,
    oldcarsdata_cost_10k_usd: 0,
    duration_ms: Date.now() - startedAt,
    metadata: {
      ...requestMetadata(req),
      error: String(errorMessage || "unknown").slice(0, 500),
      upstream_status: httpStatus || null
    }
  }, supabaseUrl, supabaseKey);

  // Cache lookup. bypassCache exists so the smoke suite keeps exercising the
  // live chat layer: a dead Anthropic key must fail loudly, never be masked
  // by a year-old cached answer.
  const cacheKey = narrationCacheKey(system, context, messages);
  if (!(cred && body.bypassCache)) {
    const cachedRows = await supabaseSelect({ supabaseUrl, supabaseKey }, `narration_cache?cache_key=eq.${cacheKey}&select=response_text&limit=1`);
    const cachedText = cachedRows?.[0]?.response_text;
    if (cachedText) {
      await recordUsageEvent({
        event_type: "chat",
        route: "/api/chat",
        status: "ok",
        search_text: searchText,
        anthropic_model: CHAT_MODEL,
        anthropic_input_tokens: 0,
        anthropic_output_tokens: 0,
        anthropic_cost_usd: 0,
        oldcarsdata_metered_requests: 0,
        oldcarsdata_cost_1k_usd: 0,
        oldcarsdata_cost_10k_usd: 0,
        duration_ms: Date.now() - startedAt,
        metadata: { ...requestMetadata(req), narrationCache: "hit" }
      }, supabaseUrl, supabaseKey);
      return res.status(200).json({ text: cachedText, cached: true, estimatedCostUsd: 0 });
    }
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        max_tokens: MAX_OUT,
        system: systemBlocks.length ? systemBlocks : undefined,
        messages: messages
      })
    });

    const data = await response.json();
    if (!response.ok) {
      const errorMessage = data.error?.message || "Anthropic API error";
      await logError(errorMessage, response.status);
      return res.status(response.status).json({ error: errorMessage });
    }
    const rawText = data.content?.[0]?.text || "";
    if (!rawText) {
      await logError("empty_completion", response.status);
      return res.status(502).json({ error: "Empty completion from model" });
    }
    // Backstop (never the primary defense - SELL_SYS already bans these words): a sentence that
    // still carries one slips out whole, not surgically edited, so the reply never breaks mid-
    // sentence. Applied before caching, so a cached reply is clean too.
    const text = cleanSellReply(rawText);
    const usage = data.usage || {};
    const cost = anthropicCost(usage);
    // Best-effort cache write; a failed insert never blocks the reply.
    await supabaseInsert("narration_cache", [{
      cache_key: cacheKey,
      response_text: text,
      model: CHAT_MODEL,
      created_at: new Date().toISOString()
    }], supabaseUrl, supabaseKey, "resolution=merge-duplicates,return=minimal", "?on_conflict=cache_key");
    const usageLog = await recordUsageEvent({
      event_type: "chat",
      route: "/api/chat",
      status: "ok",
      search_text: searchText,
      anthropic_model: CHAT_MODEL,
      anthropic_input_tokens: Number(usage.input_tokens || 0),
      anthropic_output_tokens: Number(usage.output_tokens || 0),
      anthropic_cost_usd: cost,
      oldcarsdata_metered_requests: 0,
      oldcarsdata_cost_1k_usd: 0,
      oldcarsdata_cost_10k_usd: 0,
      duration_ms: Date.now() - startedAt,
      metadata: {
        ...requestMetadata(req),
        usage
      }
    }, supabaseUrl, supabaseKey);
    return res.status(200).json({ text, usage, estimatedCostUsd: cost, usageLog });
  } catch (err) {
    await logError(err.message, null);
    return res.status(500).json({ error: err.message });
  }
}
