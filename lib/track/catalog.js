// The one list of analytics events (Oct 2026, Lane C). docs/analytics-events.md is the written form;
// this file is what enforces it. No imports: the server uses it directly and GET /api/track?js=1 builds
// the browser helper from it, so the server and the browser can never use different names or fields.
//
// cls "service": logged for everyone, ids stripped when consent is declined. cls "journey": never logged
// for a declined visitor. by: who may fire it ("server", "browser"). req/opt: field name -> type.
// Types: "text" free text (scrubbed, 120 max), "key" short token (60 max, letters digits _ - . | : / space),
// "path" a page path (made a template first by lib/track/log.js), "int", "num", "bool", or an array of allowed values.
export const SCHEMA_VERSION = 1;
export const PRODUCTS = ["buy", "market_check", "sell", "tasks", "site", "email"];
export const SURFACES = ["home", "buy_page", "market_check_page", "spec_page", "sell_page", "tasks_page", "history_page",
  "static_page", "admin_page", "email", "api", "mcp", "cron"];

const ANSWER = ["range", "identity_question", "not_enough_data", "zero_result", "failed"];
const KEYS = { vehicle_key: "key", year: "int" };

export const EVENTS = {
  search_run: { cls: "service", by: ["server"],
    req: { query_text: "text", answer_type: ANSWER, latency_ms: "int" },
    opt: { ...KEYS, result_count: "int", live_count: "int", pool_size: "int", range_low: "num", range_high: "num",
      year_widened: "bool", fallback_rung: "key", reason_flag: "key", model_used: "bool", cost_usd: "num",
      failure_state: ["catching_breath", "rate_limited", "daily_limit"], transmission: ["manual", "auto"] } },
  identity_question_shown: { cls: "journey", by: ["browser"], req: { dimension: "key" }, opt: { option_count: "int", vehicle_key: "key" } },
  identity_question_answered: { cls: "journey", by: ["browser"], req: { dimension: "key" }, opt: { choice: "text", skipped: "bool", vehicle_key: "key" } },
  refinement_applied: { cls: "journey", by: ["browser"], req: { field: "key", value: "text" }, opt: { vehicle_key: "key" } },

  receipt_opened: { cls: "journey", by: ["browser"], req: { sale_id: "key" }, opt: { platform: "key" } },
  auction_clickout: { cls: "journey", by: ["browser", "server"], req: { platform: "key", state: ["live", "sold"] }, opt: { listing_id: "key" } },
  show_more_opened: { cls: "journey", by: ["browser"], req: {}, opt: { list: "key" } },
  how_sam_decides_opened: { cls: "journey", by: ["browser"], req: {}, opt: {} },
  over_time_row_opened: { cls: "journey", by: ["browser"], req: {}, opt: { period: "key" } },
  live_car_clicked: { cls: "journey", by: ["browser"], req: { listing_id: "key" }, opt: { platform: "key" } },
  sell_cta_clicked: { cls: "journey", by: ["browser"], req: {}, opt: { from_product: "key" } },
  // Added by Lane A (Oct 2026): the shared "Keep looking" / "Have Sam keep looking" card
  // (lib/appShell.js keepLookingHtml/KEEPLOOK_JS, Buy's own matching control) has no catalog
  // event to fire on tap - this is the button, not the Task it may or may not lead to.
  keep_looking_clicked: { cls: "journey", by: ["browser"], req: {}, opt: { from_product: "key" } },

  sell_started: { cls: "journey", by: ["browser"], req: {}, opt: {} },
  // Added by Lane A (Oct 2026) alongside sell_step_completed: the wizard asks a question
  // across many scattered call sites (no single dispatcher for every step), so "shown" needed
  // its own name to tell a re-ask (escalateStep, NOT fired) from a genuinely new step.
  sell_step_shown: { cls: "journey", by: ["browser"], req: { step: "key" }, opt: {} },
  sell_step_completed: { cls: "journey", by: ["browser"], req: { step: "key" }, opt: {} },
  sell_answer_shown: { cls: "journey", by: ["server"], req: { recommended_platform: "key" }, opt: { evidence_basis: "key", confidence: "key", vehicle_key: "key" } },
  powerseller_suggested: { cls: "journey", by: ["server"], req: {}, opt: { placement: ["lead", "secondary"] } },
  introduction_requested: { cls: "journey", by: ["server"], req: {}, opt: { destination_type: "key" } },

  task_created: { cls: "journey", by: ["server"], req: {}, opt: { ...KEYS, kind: ["hunt", "research", "exact_car", "sold_car"] } },
  task_paused: { cls: "journey", by: ["server"], req: {}, opt: { via: ["page", "email_link"] } },
  task_cancelled: { cls: "journey", by: ["server"], req: {}, opt: { via: ["page", "email_link"] } },
  // Added by Lane A (Oct 2026): the "How often" email-frequency select (/tasks/mine, api/tasksPage.js
  // data-notify-every) - account-wide, not per-task, but logged under the Tasks product since that
  // is the only surface the control is on.
  task_frequency_changed: { cls: "journey", by: ["browser"], req: { frequency: ["daily", "twice", "thrice", "instant"] }, opt: {} },
  task_match_sent: { cls: "service", by: ["server"], req: { emails_sent: "int" }, opt: { matches: "int", ended_before_send: "int", failed: "int" } },
  // In the list so the name is reserved, never fired: see docs/analytics-events.md (Resend tracking is off).
  task_email_opened: { cls: "journey", by: [], req: {}, opt: {} },
  task_email_clicked: { cls: "journey", by: [], req: {}, opt: {} },

  signup_completed: { cls: "service", by: ["server"], req: {}, opt: { method: ["email", "google"] } },
  signup_refused: { cls: "service", by: ["server"], req: { reason: ["throwaway", "ticket", "cap", "turnstile", "invalid", "other"] }, opt: { stage: ["check", "hook"] } },
  signin: { cls: "journey", by: ["server"], req: {}, opt: { method: ["email", "google"], new_account: "bool" } },
  page_view: { cls: "journey", by: ["browser"], req: { path: "path" }, opt: {} },
  // Once per page view, when the page is first hidden or unloaded: seconds since the page loaded (capped at 6 hours).
  page_hidden: { cls: "journey", by: ["browser"], req: { path: "path", seconds: "int" }, opt: {} },
  // The top of the sign-in funnel: the sign-in card opened, then a code requested (resend: from the code screen).
  signin_started: { cls: "journey", by: ["browser"], req: {}, opt: {} },
  code_requested: { cls: "journey", by: ["browser"], req: {}, opt: { resend: "bool" } },

  model_call: { cls: "service", by: ["server"], req: { ledger_type: "key", tokens_in: "int", tokens_out: "int", cost_usd: "num" },
    opt: { model: "key", cache_read: "int", cache_write: "int", cache_hit: "bool", status: "key" } },
  limit_hit: { cls: "service", by: ["server"], req: { limit: "key" }, opt: { scope: "key" } },
  error: { cls: "service", by: ["server"], req: { route: "key", status: "int" }, opt: { code: "key" } },
  pull_run: { cls: "service", by: ["server"], req: {}, opt: { platforms: "int", added: "int", ended: "int", updated: "int", failures: "int", requests: "int", mode: "key" } },
};

const KEY_RE = /^[A-Za-z0-9_\-.|:/ ]{1,60}$/;

// Checks one event's name and props against the list. Free text is NOT scrubbed here (lib/track/privacy.js
// does that before this runs); this only checks shape. Returns { ok, errors, props } with props limited to
// the fields the event declares, each coerced to its type.
export function validateEvent(name, props, by) {
  const def = EVENTS[name];
  if (!def) return { ok: false, errors: ["unknown event: " + name] };
  if (by && !def.by.includes(by)) return { ok: false, errors: [`${name} is not fired by the ${by}`] };
  const p = props && typeof props === "object" ? props : {};
  const errors = [], out = {};
  for (const k of Object.keys(p)) if (!(k in def.req) && !(k in def.opt)) errors.push(`${name}: unknown field ${k}`);
  const check = (k, type, required) => {
    const v = p[k];
    if (v === undefined || v === null || v === "") { if (required) errors.push(`${name}: missing ${k}`); return; }
    if (Array.isArray(type)) { if (type.includes(v)) out[k] = v; else errors.push(`${name}: ${k} not allowed`); return; }
    if (type === "int") { const n = Number(v); if (Number.isFinite(n)) out[k] = Math.round(n); else errors.push(`${name}: ${k} not a number`); return; }
    if (type === "num") { const n = Number(v); if (Number.isFinite(n)) out[k] = Math.round(n * 1e6) / 1e6; else errors.push(`${name}: ${k} not a number`); return; }
    if (type === "bool") { if (typeof v === "boolean") out[k] = v; else errors.push(`${name}: ${k} not true or false`); return; }
    if (type === "key" || type === "path") { const s = String(v); if (KEY_RE.test(s)) out[k] = s; else errors.push(`${name}: ${k} not a short key`); return; }
    if (type === "text") { out[k] = String(v).slice(0, 120); return; }
  };
  for (const [k, t] of Object.entries(def.req)) check(k, t, true);
  for (const [k, t] of Object.entries(def.opt)) check(k, t, false);
  return { ok: errors.length === 0, errors, props: out };
}

export const isServiceEvent = name => !!(EVENTS[name] && EVENTS[name].cls === "service");
