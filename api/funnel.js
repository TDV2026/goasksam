// Phase 3 / 2F: lightweight funnel beacon for client-only steps (homepage_view,
// wizard_start, wizard_complete, signup_shown). Server-side steps (rec_shown,
// limit_hit, second_search_attempt, signup_completed, hunt_submitted) are logged
// where they happen and never come through here. Fire-and-forget: always 204,
// never blocks the UI. Idempotent where a dedup_key is supplied (11e).
import { supabaseEnv, supabaseInsert } from "../lib/_supabase.js";
import { recordJourneyEvent, journeyVehicle, CLIENT_JOURNEY_EVENTS } from "../lib/_journey.js";
import { ensureVisitorId } from "../lib/_visitor.js";
import { EVENTS, storeFirstTouchOnce } from "../lib/events.js";

const ALLOWED = new Set(["homepage_view", "wizard_start", "wizard_complete", "signup_shown", "non_us_attempt", "out_of_scope",
  // One Box (T1.7): aggregate-only client events. No raw VIN/chassis ever - only the
  // event name + anon id + a hashed dedup key. onebox_search is logged SERVER-side
  // (authoritative count for the cap); the client sends the outcome/interaction events.
  "onebox_search", "onebox_answer_shown", "onebox_refusal_shown", "onebox_thin_two", "onebox_thin_one",
  "onebox_zero", "onebox_vin_anchor_shown", "onebox_share_clicked", "onebox_sell_handoff_clicked",
  // Canonical cross-product events (Oct 2026, open-search policy, lib/events.js EVENTS) -
  // client-emittable ones only; SEARCH/RATE_LIMIT_HIT/SIGN_IN_COMPLETED are logged
  // server-side where the search/gate/account logic already runs, never through here.
  EVENTS.MARKET_CHECK_OPEN, EVENTS.RECEIPT_CLICK, EVENTS.AUCTION_CLICKOUT,
  EVENTS.TASK_CREATED, EVENTS.WATCH_CREATED, EVENTS.SELL_FOLLOWUP_GATED, EVENTS.SIGN_IN_STARTED, EVENTS.PAGE_VIEW]);

// HARD RULE (VIN feature): a raw 17-char VIN must NEVER be stored in a journey event.
// The client only ever sends booleans/enums in journey metadata, but scrub defensively
// so the invariant is server-enforced, not merely a client convention. Walks the
// metadata object and replaces any VIN-shaped string with a marker.
function scrubMetaVins(v) {
  if (typeof v === "string") return v.replace(/\b[A-HJ-NPR-Z0-9]{17}\b/gi, "[vin]");
  if (Array.isArray(v)) return v.map(scrubMetaVins);
  if (v && typeof v === "object") { const o = {}; for (const k of Object.keys(v)) o[k] = scrubMetaVins(v[k]); return o; }
  return v;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  // Always answer 204 so a beacon never surfaces an error to the user.
  try {
    const body = typeof req.body === "object" && req.body ? req.body : {};
    // ENTRY DIAGNOSTIC (temporary): client-side entry errors / non-interactive snapshots,
    // logged to app_usage_events with the SERVER-read User-Agent (the client can't spoof it
    // and funnel_events has no metadata column). Fires only when the entry path throws or is
    // unhealthy, so volume is near zero for normal sessions. Remove once the cause is found.
    if (body.kind === "client_diag" && body.diag && typeof body.diag === "object") {
      const env = supabaseEnv();
      if (env) {
        const d = body.diag;
        await supabaseInsert("app_usage_events", [{
          created_at: new Date().toISOString(),
          event_type: "entry_diag",
          route: String(d.path || "").slice(0, 80),
          status: String(d.kind || "").slice(0, 40),
          oldcarsdata_metered_requests: 0,
          metadata: { ...scrubMetaVins(d), server_ua: String(req.headers["user-agent"] || "").slice(0, 300), ip_hint: String(req.headers["x-forwarded-for"] || "").split(",")[0].slice(0, 40) }
        }], env.supabaseUrl, env.supabaseKey, "return=minimal", "");
      }
      res.status(204).end(); return;
    }
    // Business-journey event (client-emittable only). Anon-tagged; the account is
    // learned later from the server-side events that carry a bearer. Never blocks.
    if (body.kind === "journey" && body.journeyId && CLIENT_JOURNEY_EVENTS.has(String(body.event || ""))) {
      const env = supabaseEnv();
      if (env) await recordJourneyEvent(env, {
        journeyId: body.journeyId, eventType: String(body.event),
        anonId: body.anonId ? String(body.anonId).slice(0, 64) : null,
        platformId: body.platformId ? String(body.platformId).slice(0, 40) : null,
        powersellerId: body.powersellerId ? String(body.powersellerId).slice(0, 40) : null,
        dedupKey: body.dedupKey ? String(body.dedupKey).slice(0, 128) : null,
        metadata: (body.metadata && typeof body.metadata === "object") ? scrubMetaVins(body.metadata) : {},
        vehicle: body.vehicle ? journeyVehicle(body.vehicle, null) : null
      });
      res.status(204).end(); return;
    }
    const event = String(body.event || "");
    if (ALLOWED.has(event)) {
      const env = supabaseEnv();
      if (env) {
        // Pseudonymous visitor id (Oct 2026): minted/read here so every in-house event gets
        // it without each page needing its own Set-Cookie logic - this beacon is the one
        // place nearly every page already calls on its first interaction. res may already
        // have ended (204) from an earlier branch above, but we're still inside the try
        // before this function's own res.status(204).end() below, so a Set-Cookie here lands.
        const { id: visitorId, minted } = ensureVisitorId(req, res);
        // page_view (Oct 2026, open-search policy Part 1.1): the one event every shell page sends on
        // load (lib/appShell.js SHELL_JS). Its whole purpose is per-visitor counting, so skip the write
        // entirely when there is no visitor id (crew or an EEA/UK/Switzerland visitor) rather than log
        // an untagged row - same "no tracking at all" behavior those jurisdictions already get from GA.
        if (event === EVENTS.PAGE_VIEW && !visitorId) { res.status(204).end(); return; }
        const tool = body.tool && ["buy", "market_check", "sell", "tasks"].includes(body.tool) ? body.tool : null;
        let props = (body.props && typeof body.props === "object") ? scrubMetaVins(body.props) : null;
        // Defensive server-side trim for page_view's path (never trust the client's own promise not to
        // send a query string or typed text): strip any query/hash and re-check it's a bare path.
        if (event === EVENTS.PAGE_VIEW && props && typeof props.path === "string") {
          const bare = props.path.split("?")[0].split("#")[0].slice(0, 200);
          props = { path: /^\/[a-z0-9/_-]*$/i.test(bare) ? bare : "/" };
        }
        // First touch (Oct 2026, open-search policy Part 1.4): stored ONCE, only at the exact moment
        // this visitor id is freshly minted (never on a later page_view for the same, already-existing
        // id) - lib/appShell.js's gasPageView() sends the raw utm_*/referrer it reads off this same
        // first page, since localStorage's own gas_first_touch (js/auth.js gasCaptureTouch) can lag a
        // deferred script on a visitor's very first page load. Carried to the account later via a plain
        // JOIN on visitor_id through visitor_links - no copy onto the account row needed.
        if (event === EVENTS.PAGE_VIEW && minted && visitorId && body.touch && typeof body.touch === "object") {
          storeFirstTouchOnce({ supabaseUrl: env.supabaseUrl, supabaseKey: env.supabaseKey }, visitorId, body.touch).catch(() => {});
        }
        await supabaseInsert("funnel_events", [{
          event,
          anon_session_id: body.anonSessionId ? String(body.anonSessionId).slice(0, 64) : null,
          visitor_id: visitorId,
          tool,
          props,
          user_id: null,
          dedup_key: body.dedupKey ? String(body.dedupKey).slice(0, 128) : null
        }], env.supabaseUrl, env.supabaseKey, "resolution=ignore-duplicates,return=minimal",
          body.dedupKey ? "?on_conflict=event,dedup_key" : "");
      }
    }
  } catch { /* never block */ }
  res.status(204).end();
}
