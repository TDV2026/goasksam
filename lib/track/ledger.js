// Events taken from the spend ledger (Oct 2026, Lane C). recordUsageEvent (api/_usage.js) calls
// ledgerEvents() once, after an app_usage_events row is written, so model_call matches the ledger row for
// row: same count, same tokens, same cost. pull_run and task_match_sent come from the same write.
import { trackSystem } from "./log.js";

const n = v => Number(v) || 0;

// The product a ledger row's spend belongs to.
export function ledgerProduct(row) {
  const t = String(row.event_type || ""), r = String(row.route || "");
  if (/^buy_/.test(t) || /buy/.test(r)) return "buy";
  if (/^tasks?_/.test(t) || /^tasks/.test(r)) return "tasks";
  if (/^sell_/.test(t) || t === "chat" || t === "seller_decision" || /sell/.test(r)) return "sell";
  if (/market_check|onebox/.test(t + r)) return "market_check";
  return "site";
}

// A ledger row is a model call when it carries model tokens.
export const isModelRow = row => n(row.anthropic_input_tokens) + n(row.anthropic_output_tokens) > 0;

export function ledgerEvents(row) {
  if (!row || typeof row !== "object") return;
  const m = row.metadata || {};
  if (isModelRow(row)) {
    const cacheRead = n(m.cache_read != null ? m.cache_read : m.cacheRead);
    trackSystem("model_call", {
      ledger_type: String(row.event_type || "unknown").slice(0, 60),
      tokens_in: n(row.anthropic_input_tokens), tokens_out: n(row.anthropic_output_tokens),
      cost_usd: n(row.anthropic_cost_usd),
      model: row.anthropic_model ? String(row.anthropic_model).slice(0, 60) : undefined,
      cache_read: cacheRead || undefined, cache_write: n(m.cache_write != null ? m.cache_write : m.cacheWrite) || undefined,
      cache_hit: cacheRead > 0,
      status: row.status ? String(row.status).slice(0, 60) : undefined,
    }, { product: ledgerProduct(row), surface: "api" });
  }
  if (row.event_type === "pull_live_summary") {
    trackSystem("pull_run", {
      added: n(m.newListings), updated: n(m.upserted), ended: n(m.ended),
      requests: m.ocdRequests != null ? n(m.ocdRequests) : undefined,
      failures: m.failures != null ? n(m.failures) : undefined,
    }, { product: "buy", surface: "cron" });
  }
  if (row.event_type === "task_email_run") {
    trackSystem("task_match_sent", {
      emails_sent: n(m.sent), matches: n(m.matches), ended_before_send: n(m.endedBeforeSend), failed: n(m.failed),
    }, { product: "tasks", surface: "cron" });
  }
}
