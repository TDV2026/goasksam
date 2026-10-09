// Canonical in-house event vocabulary (Oct 2026, open-search policy + admin Stage 1,
// Lane B Step 2). ONE place names every event; every lane/page should log through
// logEvent() here rather than inventing a new event string inline at the call site -
// that fragmentation (4 separate ad-hoc funnel-insert helpers existed before this file:
// sellerDecision.js logFunnel, api/account.js funnel, api/funnel.js's inline insert, plus
// 3 unrelated anonymous-id schemes) is exactly what this file exists to stop.
//
// Writes to funnel_events, which gained visitor_id/tool/props columns additively
// (docs/supabase-visitor-tracking.sql) - old rows and old callers (the pre-existing
// logFunnel/funnel() call sites) are unaffected; they just leave the new columns null.
import { supabaseInsert } from "./_supabase.js";

export const EVENTS = Object.freeze({
  PAGE_VIEW: "page_view",                    // props: { path }. tool null for pages with no product (business).
  SEARCH: "search",                          // props: { query_kind? }. tool required.
  CROSS_PRODUCT_MOVE: "cross_product_move",  // props: { from, to }
  MARKET_CHECK_OPEN: "market_check_open",
  RECEIPT_CLICK: "receipt_click",            // props: { source }
  AUCTION_CLICKOUT: "auction_clickout",      // props: { source, listing_id? }
  TASK_CREATED: "task_created",
  WATCH_CREATED: "watch_created",            // props: { kind: "spec" | "vin" }
  SELL_FOLLOWUP_GATED: "sell_followup_gated",
  SIGN_IN_STARTED: "sign_in_started",        // props: { method: "google" | "email" }
  SIGN_IN_COMPLETED: "sign_in_completed",
  RATE_LIMIT_HIT: "rate_limit_hit",          // props: { kind } (e.g. "ip_hour", "ip_day", "onebox_daily")
});

const EVENT_NAMES = new Set(Object.values(EVENTS));
const TOOLS = new Set(["buy", "market_check", "sell", "tasks"]);

// event: one of EVENTS. tool: "buy"|"market_check"|"sell"|"tasks"|null (null only for
// events that aren't tool-scoped, e.g. sign_in_*). visitorId/userId: either or both, so an
// anonymous-then-signed-in search in the same request can carry both. props: a plain
// JSON-serializable object, or null. dedupKey: optional, same at-most-once semantics as
// the existing logFunnel pattern (unique on (event, dedup_key) where dedup_key is set).
export async function logEvent(env, { event, tool = null, visitorId = null, userId = null, props = null, dedupKey = null, anonSessionId = null }) {
  if (!env || !env.supabaseUrl || !env.supabaseKey) return;
  if (!EVENT_NAMES.has(event)) { console.error("lib/events.js logEvent: unknown event", event); return; }
  if (tool != null && !TOOLS.has(tool)) { console.error("lib/events.js logEvent: unknown tool", tool); return; }
  try {
    await supabaseInsert("funnel_events", [{
      event,
      tool,
      visitor_id: visitorId || null,
      user_id: userId || null,
      anon_session_id: anonSessionId || null,
      props: props || null,
      dedup_key: dedupKey || null,
    }], env.supabaseUrl, env.supabaseKey, "resolution=ignore-duplicates,return=minimal",
      dedupKey ? "?on_conflict=event,dedup_key" : "");
  } catch (e) { /* analytics must never block a real request */ }
}

// Sign-in stitch (Sam's spec: "On sign in, stitch the visitor id to the account... keeping
// the prior history attached"). Upserts visitor_id -> user_id; idempotent, safe to call on
// every /api/account ensure (not just a fresh sign-in) since a repeat upsert of the same
// pair is a no-op. A visitor id already linked to a DIFFERENT account (e.g. a shared
// device, or someone signing into a second account later) is relinked to the latest
// account - last-write-wins, matching how a shared device's cookie realistically works;
// prior events stay attributed to whichever account the visitor_id pointed to AT THE TIME
// they were queried, since admin reads are a join against this table's CURRENT state, not
// a historical snapshot. Acceptable for Stage 1 - flag if per-event-time attribution is
// ever needed (would require denormalizing user_id onto funnel_events at write time for
// signed-in-only events instead of deriving it via this join, which already happens for
// userId-bearing calls above).
export async function stitchVisitorToAccount(env, visitorId, userId) {
  if (!env || !env.supabaseUrl || !env.supabaseKey || !visitorId || !userId) return;
  try {
    await supabaseInsert("visitor_links", [{ visitor_id: visitorId, user_id: userId, linked_at: new Date().toISOString() }],
      env.supabaseUrl, env.supabaseKey, "resolution=merge-duplicates,return=minimal", "?on_conflict=visitor_id");
  } catch (e) { /* best-effort */ }
}
