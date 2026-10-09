// Invisible ceilings (Oct 2026, open-search policy): the ONE guard every public search and chat path calls
// (Buy search and chat, live /sell and the new Sell, the Sell chat). Search is open; these only stop
// automated floods. Numbers come from the last 30 days of real traffic (docs/lane-notes.md, Oct 9): the
// busiest real Buy browser ran 12 searches in a day, the busiest non-crew Sell address about 30, a typical
// chatting address 7 calls a day. Each ceiling sits about ten times above that.
//
// Device aware: the device is Lane B's first-party visitor id (gas_vid, lib/_visitor.js); where that cookie
// is not set (crew, EEA/UK/Switzerland for now) a cookieless stand-in from the address and browser string is
// used. The address ceiling is a much higher backstop, so one shared address (an office, a mobile carrier)
// never blocks the people behind it. Counted in ip_rate_hits (indexed ip, kind, created_at) with keys
// "dev:", "ip:" and "user:". Fail open: an unreadable ledger never blocks anyone. A hit logs rate_limit_hit
// (lib/events.js) and the page shows a calm line, never a sign in demand.
import crypto from "node:crypto";
import { readVisitorId, parseCookieHeader } from "./_visitor.js";
import { logEvent, EVENTS } from "./events.js";
import { validateBearer } from "./_auth.js";
import { hasServerCredential } from "./_credential.js";
import { supabaseSelect } from "./_supabase.js";

import { isCrewRequest } from "./_crew.js";
const H = 3600e3, D = 864e5;
export const CEILINGS = {
  buy_search:    { device: [[H, 150], [D, 600]], address: [[H, 900], [D, 4000]] },
  buy_chat:      { device: [[H, 60], [D, 200]],  address: [[H, 400], [D, 1500]] },
  sell_search:   { device: [[H, 60], [D, 300]],  address: [[H, 400], [D, 2000]] },
  sell_chat:     { device: [[H, 40], [D, 150]],  address: [[H, 300], [D, 1200]] },   // the follow-up chat
  sell_assist:   { device: [[H, 20], [D, 60]],   address: [[H, 200], [D, 800]] },    // a question before a search
  // market_check_search (Oct 2026, Lane A): no Market Check-specific traffic sample was available when
  // this was added (unlike the numbers above, pulled from 30 real days) - set as a reasoned midpoint
  // between buy_search and sell_search (Market Check's usage shape, quick repeated lookups on one car,
  // sits between Buy's browsing and Sell's one-shot decision), same ten-times-busiest-real-use spirit.
  // Replace with real market_check_open/search numbers once logged (docs/lane-notes.md) and this comment.
  market_check_search: { device: [[H, 100], [D, 500]], address: [[H, 700], [D, 3000]] }
};
// Signed-in follow-up allowance per account per day (the only gated model use).
export const FOLLOWUP_PER_DAY = { free: 40, tdv: 80 };
// The calm lines (no sign in demand, no numbers).
export const CALM = {
  search: "Lots of searches from here just now. Give it a minute and try again.",
  chat: "That's a lot of questions in a short time. Give it a few minutes and ask again."
};

export const clientAddress = req => String((req.headers && req.headers["x-forwarded-for"]) || "").split(",")[0].trim() || (req.socket && req.socket.remoteAddress) || null;
export function deviceKey(req) {
  const vid = readVisitorId(req);
  if (vid) return "dev:" + vid;
  const ip = clientAddress(req); if (!ip) return null;
  return "dev:h" + crypto.createHash("sha256").update(ip + "|" + String((req.headers && req.headers["user-agent"]) || "")).digest("base64url").slice(0, 22);
}
export const isCrew = req => isCrewRequest(req);   // the signed crew cookie (lib/_crew.js)

async function countSince(env, key, kind, sinceIso) {
  try {
    const r = await fetch(`${env.supabaseUrl}/rest/v1/ip_rate_hits?ip=eq.${encodeURIComponent(key)}&kind=eq.${encodeURIComponent(kind)}&created_at=gte.${encodeURIComponent(sinceIso)}&select=id`, { method: "HEAD", headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, Prefer: "count=exact", Range: "0-0" } });
    if (!r.ok && r.status !== 206) return null;
    const n = Number((/\/(\d+)$/.exec(r.headers.get("content-range") || "") || [])[1]);
    return Number.isFinite(n) ? n : null;
  } catch { return null; }
}
async function record(env, keys, kind) {
  try {
    await fetch(`${env.supabaseUrl}/rest/v1/ip_rate_hits`, { method: "POST", headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify(keys.map(ip => ({ ip, kind }))) });
  } catch { /* fail open */ }
}
// Same ledger, a `kind=like.<prefix>*` count instead of an exact match - used by the Market Check
// distinct-car limit below to count how many DIFFERENT cars (not raw requests) a device has hit
// today, since each distinct car writes exactly one row (the caller skips the write for a repeat).
async function countLikeSince(env, key, kindPrefix, sinceIso) {
  try {
    const r = await fetch(`${env.supabaseUrl}/rest/v1/ip_rate_hits?ip=eq.${encodeURIComponent(key)}&kind=like.${encodeURIComponent(kindPrefix + "*")}&created_at=gte.${encodeURIComponent(sinceIso)}&select=id`, { method: "HEAD", headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, Prefer: "count=exact", Range: "0-0" } });
    if (!r.ok && r.status !== 206) return null;
    const n = Number((/\/(\d+)$/.exec(r.headers.get("content-range") || "") || [])[1]);
    return Number.isFinite(n) ? n : null;
  } catch { return null; }
}

// Count, then record. scope: a key of CEILINGS. opts.tool: "buy"|"sell" for the event; opts.limits: a test
// override (only from a request our own credential signs, see testLimits). Returns { ok } or { ok:false, kind }.
export async function checkCeiling(env, req, scope, opts = {}) {
  const spec = opts.limits || CEILINGS[scope];
  if (!env || !spec || isCrew(req)) return { ok: true };
  const dev = deviceKey(req), ip = clientAddress(req), kind = "c:" + scope + (opts.limits ? ":test" : "");
  const checks = [];
  for (const [win, max] of spec.device || []) if (dev) checks.push({ key: dev, win, max, what: "device" });
  for (const [win, max] of spec.address || []) if (ip) checks.push({ key: "ip:" + ip, win, max, what: "address" });
  const now = Date.now();
  const counts = await Promise.all(checks.map(c => countSince(env, c.key, kind, new Date(now - c.win).toISOString())));
  const hit = checks.find((c, i) => counts[i] != null && counts[i] >= c.max);
  if (hit) {
    const k = `${hit.what}_${hit.win >= D ? "day" : "hour"}`;
    await logEvent(env, { event: EVENTS.RATE_LIMIT_HIT, tool: opts.tool || null, visitorId: readVisitorId(req), props: { kind: k, scope } }).catch(() => {});
    return { ok: false, kind: k };
  }
  await record(env, [dev, ip ? "ip:" + ip : null].filter(Boolean), kind);
  return { ok: true };
}
// The per-account allowance (signed-in follow-up chat). Same ledger, key "user:<id>", one day.
export async function checkAllowance(env, userId, scope, perDay) {
  if (!env || !userId) return { ok: true };
  const kind = "a:" + scope, key = "user:" + userId;
  const used = await countSince(env, key, kind, new Date(Date.now() - D).toISOString());
  if (used != null && used >= perDay) return { ok: false, used };
  await record(env, [key], kind);
  return { ok: true, used: (used || 0) + 1 };
}
// Market Check daily distinct-car limit (Oct 2026): up to MARKET_CHECK_DAILY_CARS distinct cars per
// device per day. "Distinct" means a genuinely different car, not a request count - the SAME ledger
// (ip_rate_hits) and fail-open/crew-bypass contract as checkCeiling above, dimensioned by car
// identity instead of raw volume, so this is not a second system. carKey is a stable identity string
// (the caller passes lib/live/search.js specKeyFor's own key - the same one the spec cache already
// uses - never raw typed text or a VIN) hashed short for the kind column. The caller is expected to
// skip this entirely for a refinement of the car already on screen (the same "never on a refine tap"
// exemption the existing SEARCH event logging already uses) - this function has no way to know that
// on its own, since it only ever sees one car key per call.
const MARKET_CHECK_DAILY_CARS = 10;
export async function checkMarketCheckCarLimit(env, req, carKey) {
  if (!env || !carKey || isCrew(req)) return { ok: true };
  const dev = deviceKey(req);
  if (!dev) return { ok: true };   // fail open: no device to key on
  const since = new Date(Date.now() - D).toISOString();
  const carKind = "mc_car:" + crypto.createHash("sha256").update(carKey).digest("base64url").slice(0, 16);
  const seenToday = await countSince(env, dev, carKind, since);
  if (seenToday == null) return { ok: true };           // fail open: ledger unreadable
  if (seenToday > 0) return { ok: true };                // the same car again today, never a new count
  const total = await countLikeSince(env, dev, "mc_car:", since);
  if (total == null) return { ok: true };                // fail open
  if (total >= MARKET_CHECK_DAILY_CARS) {
    await logEvent(env, { event: EVENTS.RATE_LIMIT_HIT, tool: "market_check", visitorId: readVisitorId(req), props: { kind: "device_day_cars", scope: "market_check_search" } }).catch(() => {});
    return { ok: false };
  }
  await record(env, [dev], carKind);
  return { ok: true };
}
// A test setting: a request carrying our own credential may send `x-ceiling-test: <n>` to run that request
// under a ceiling of n per hour for its own device, counted apart from real traffic (kind "...:test"). Real
// visitors can never lower or raise anything; production numbers above are untouched.
export function testLimits(req, credentialed) {
  const n = Number(req.headers && req.headers["x-ceiling-test"]);
  return credentialed && n > 0 && n < 50 ? { device: [[H, n]] } : null;
}

// ---------------------------------------------------------------- the gated follow-up, one guard for both Sells
// The Sell follow-up chat (api/chat.js mode "followup" on live /sell; api/sellChat.js on the new Sell) is the
// one action that needs an account: it calls the model. A verified session (checked here, never a client
// flag), the ceiling, then the account's daily allowance (Daily Vroom readers get the larger one). Signed out
// gets the sign in line; our own jobs (header credential) pass, unless they send a test ceiling.
export const FOLLOWUP_SIGNIN = "Want to keep digging into this car? Sign in free so Sam can remember it.";
export const FOLLOWUP_DONE = "That's a lot of questions about this car for one day. Ask again tomorrow and the conversation picks up here.";
async function tierOf(env, userId) {
  const rows = await supabaseSelect(env, `accounts?user_id=eq.${encodeURIComponent(userId)}&select=tier&limit=1`).catch(() => null);
  return (rows && rows[0] && rows[0].tier) || "free";
}
// Returns { ok:true, user } or { ok:false, body } (body: what the page shows instead of an answer).
export async function followupGuard(env, req) {
  const cred = hasServerCredential(req), lim = testLimits(req, cred);
  if (cred && !lim) return { ok: true, user: null };
  const user = await validateBearer(req.headers.authorization || "").catch(() => null);
  if (!user || !user.userId) {
    await logEvent(env, { event: EVENTS.SELL_FOLLOWUP_GATED, tool: "sell", visitorId: readVisitorId(req) }).catch(() => {});
    return { ok: false, body: { text: FOLLOWUP_SIGNIN, reply: FOLLOWUP_SIGNIN, needSignIn: true } };
  }
  if (isCrew(req) && !lim) return { ok: true, user };
  const ce = await checkCeiling(env, req, "sell_chat", { tool: "sell", limits: lim });
  if (!ce.ok) return { ok: false, body: { text: CALM.chat, reply: CALM.chat, limited: true } };
  const per = lim ? Math.max(1, Math.min(10, Number(req.headers["x-allowance-test"]) || 2)) : (FOLLOWUP_PER_DAY[await tierOf(env, user.userId)] || FOLLOWUP_PER_DAY.free);
  const al = await checkAllowance(env, user.userId, lim ? "sell_followup_test" : "sell_followup", per);
  if (!al.ok) return { ok: false, body: { text: FOLLOWUP_DONE, reply: FOLLOWUP_DONE, limited: true } };
  return { ok: true, user };
}
// A question before any search (live /sell's entry chat): open, under the ceiling.
export async function assistGuard(env, req) {
  const cred = hasServerCredential(req), lim = testLimits(req, cred);
  if ((cred && !lim) || (isCrew(req) && !lim)) return { ok: true };
  const ce = await checkCeiling(env, req, "sell_assist", { tool: "sell", limits: lim });
  return ce.ok ? { ok: true } : { ok: false, body: { text: CALM.chat, limited: true } };
}
