// THE MODEL OF THE VALUE DRIVER MINING (Lane B, Nov 17 2026): the model already used by the site (SAM_MODEL, claude-sonnet-4-6 by default; never a dated snapshot), called with the system and user text the miner built. Returns the answer's text and its token usage.
// The usage of each call is logged once to app_usage_events (counts only: tokens and cost, no text).
import { recordUsageEvent, anthropicCost } from "../api/_usage.js";
export const FACT_MODEL = process.env.SAM_MODEL || "claude-sonnet-4-6";
export function makeCallModel(env, tag) {
  return async ({ system, user, maxTokens }) => {
    const key = process.env.ANTHROPIC_API_KEY; if (!key) throw new Error("no ANTHROPIC_API_KEY");
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model: FACT_MODEL, max_tokens: maxTokens || 4000, system, messages: [{ role: "user", content: user }] }) });
    const data = await r.json().catch(() => null);
    if (!r.ok || !data) throw new Error("model " + r.status);
    const usage = data.usage || {};
    try { await recordUsageEvent({ event_type: tag, route: "/api/usageDashboard", status: "ok", anthropic_model: FACT_MODEL, anthropic_input_tokens: Number(usage.input_tokens || 0), anthropic_output_tokens: Number(usage.output_tokens || 0), anthropic_cost_usd: anthropicCost(usage), oldcarsdata_metered_requests: 0, metadata: { tag } }, env.supabaseUrl, env.supabaseKey); } catch { /* the log is a courtesy */ }
    return { text: data.content && data.content[0] ? String(data.content[0].text || "") : "", usage };
  };
}
