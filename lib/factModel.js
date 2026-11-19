// THE MODEL OF THE VALUE DRIVER MINING (Lane B, Nov 17 2026): the model already used by the site (SAM_MODEL, claude-sonnet-4-6 by default; never a dated snapshot), called with the system and user text the miner built. Returns the answer's text and its token usage.
// The usage of each call is logged once to app_usage_events (counts only: tokens and cost, no text).
import { recordUsageEvent, anthropicCost } from "../api/_usage.js";
export const FACT_TIMEOUT_MS = 150000;   // a call that passes no signal of its own (the topic map) is still cut
export const FACT_MODEL = process.env.SAM_MODEL || "claude-sonnet-4-6";
// A call that fails or is cut is logged too (counts only): the log used to be written only after a response came back, so a call in flight when the function ended left no trace.
async function logFail(env, tag, code) { try { await recordUsageEvent({ event_type: tag, route: "/api/usageDashboard", status: "error", anthropic_model: FACT_MODEL, anthropic_input_tokens: 0, anthropic_output_tokens: 0, anthropic_cost_usd: 0, oldcarsdata_metered_requests: 0, metadata: { tag, code } }, env.supabaseUrl, env.supabaseKey); } catch { /* a courtesy */ } }
export function makeCallModel(env, tag) {
  return async ({ system, user, maxTokens, signal }) => {
    const key = process.env.ANTHROPIC_API_KEY; if (!key) throw new Error("no ANTHROPIC_API_KEY");
    let r; try { r = await fetch("https://api.anthropic.com/v1/messages", { signal: signal || AbortSignal.timeout(FACT_TIMEOUT_MS), method: "POST", headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model: FACT_MODEL, max_tokens: maxTokens || 4000, system, messages: [{ role: "user", content: user }] }) }); } catch (e) { await logFail(env, tag, e && e.name === "AbortError" ? "timeout" : "network"); throw e; }
    const data = await r.json().catch(() => null);
    if (!r.ok || !data) { await logFail(env, tag, "model_" + r.status); throw new Error("model " + r.status); }
    const usage = data.usage || {};
    try { await recordUsageEvent({ event_type: tag, route: "/api/usageDashboard", status: "ok", anthropic_model: FACT_MODEL, anthropic_input_tokens: Number(usage.input_tokens || 0), anthropic_output_tokens: Number(usage.output_tokens || 0), anthropic_cost_usd: anthropicCost(usage), oldcarsdata_metered_requests: 0, metadata: { tag } }, env.supabaseUrl, env.supabaseKey); } catch { /* the log is a courtesy */ }
    return { text: data.content && data.content[0] ? String(data.content[0].text || "") : "", usage, stop_reason: String(data.stop_reason || "") };
  };
}
