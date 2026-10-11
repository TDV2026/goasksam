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
  // sell_model (Oct 2026, misuse only): every Sell chat call that can reach the model (the live /sell chat before
  // and after the result, and the new Sell's chat and follow-up), per minute and per day. Real use, last 30 days,
  // browsers only (automated callers set apart by user agent): 120 calls from 34 addresses; the busiest address
  // made 10 in a day, 10 in an hour and 3 in one minute; the typical address 1. Set about ten times above that.
  sell_model:    { device: [[60e3, 10], [D, 100]], address: [[60e3, 30], [D, 300]] },
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
    const k = `${hit.what}_${hit.win >= D ? "day" : hit.win >= H ? "hour" : "minute"}`;
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
// CREW ARE EXEMPT from this cap entirely (isCrew(req) check below, same bypass checkCeiling already
// gives crew) - a documented product choice, not an oversight. Proving the cap therefore requires
// testing as a NON-crew visitor (no gas_crew cookie at all); a crew-cookie test would never see the
// limit fire and could hide a real bug.
// The cap itself: an env var for TEST USE ONLY, never trusted from the request (no header/body/query
// can change it) - defaults to 10 when unset or invalid. Read fresh on every call (not cached at
// module load) so a Vercel env change takes effect without a redeploy.
export function marketCheckDailyCarCap() {
  const n = Number(process.env.MARKET_CHECK_DAILY_CARS);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 10;
}
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
  if (total >= marketCheckDailyCarCap()) {
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

// ---------------------------------------------------------------- Buy chat: the model's ceilings (Oct 2026, Sam)
// Protect the intelligence layer, not the search box: searching stays open; what is capped is repeated
// model-assisted questioning. A model-assisted turn is a Buy chat turn that called the model. Past either
// ceiling the turn is answered by the existing no-model search (the page's own fallback), with one sentence.
//
// 1. PER DEVICE, 20 model turns in any 24 hours (crew exempt). A NUISANCE GUARD ONLY: the device is the
//    first-party visitor cookie (or the address and browser stand-in), so clearing browser storage gets a
//    new device. It keeps one ordinary visitor from running up the bill by accident; it is not protection.
// 2. GLOBAL SPEND, $50 of model cost in any 24 hours across Buy chat, Tasks (setup chat, Task updates and
//    the line in every Task email, research) AND the Sell chat (live /sell's chat, logged as "chat"; the new
//    Sell's chat and follow-up), summed from the cost every call logs (app_usage_events buy_chat_turn,
//    tasks_model_turn, chat, sell_chat_turn, sell_followup_turn anthropic_cost_usd, api/_usage.js prices).
//    THIS is the authoritative protection: no number of devices can push past it. Past it, Buy answers with
//    the no-model search, Tasks write their lines in code (lib/tasks/tasks.js modelTurn) and the Sell chat
//    answers with MODEL_PAUSED while the Sell steps carry on. Read at most once a minute per instance; an
//    unreadable ledger fails open, like every ceiling here.
export const BUY_MODEL_TURNS_PER_DAY = 20;
export const BUY_CHAT_SPEND_PER_DAY_USD = 50;
export const BUY_MODEL_PAUSED = "Sam's written answers are paused for the moment. Here are the search results on their own.";
export const TASKS_MODEL_PAUSED = "Sam's written answers are paused for the moment. Try again later today.";
export const MODEL_PAUSED = TASKS_MODEL_PAUSED;   // the one paused sentence (approved Oct 2026), Tasks and Sell
// Per account per day (Oct 2026, crew exempt), the same ledger as the Sell follow-up allowance: Tasks setup chat
// turns (a new Task's conversation and messages about an existing one) and research Tasks started. Measured,
// last 30 days: 5 Tasks from 2 accounts, at most 1 setup message and 0 research per account per day, too little
// to set a number from; so the setup limit matches the Sell follow-up allowance (40, the busiest real use of a
// comparable chat) and research sits at 10 (each is one long model turn).
export const TASKS_SETUP_PER_DAY = 40, TASKS_RESEARCH_PER_DAY = 10;
let spendMemo = { at: 0, usd: null };
async function buyChatSpend24h(env) {
  if (Date.now() - spendMemo.at < 60e3 && spendMemo.usd != null) return spendMemo.usd;
  const since = new Date(Date.now() - D).toISOString();
  let usd = null;
  try {
    let off = 0, sum = 0;
    for (;;) {
      const r = await fetch(`${env.supabaseUrl}/rest/v1/app_usage_events?event_type=in.(buy_chat_turn,tasks_model_turn,chat,sell_chat_turn,sell_followup_turn)&created_at=gte.${encodeURIComponent(since)}&select=anthropic_cost_usd&order=id.asc`, { headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, Range: `${off}-${off + 999}` } });
      if (!r.ok && r.status !== 206) throw new Error("spend read " + r.status);
      const rows = await r.json();
      for (const x of rows) sum += Number(x.anthropic_cost_usd) || 0;
      if (rows.length < 1000) break; off += 1000;
    }
    usd = sum;
  } catch { usd = null; }
  spendMemo = { at: Date.now(), usd };
  return usd;
}
// Test settings, only on a request our own credential signs: x-ceiling-test-turns: <n> runs that request
// under a device cap of n (counted apart from real traffic); x-ceiling-test-spend: <dollars> under that cap.
function buyModelTest(req) {
  if (!hasServerCredential(req)) return null;
  const h = req.headers || {}, n = Number(h["x-ceiling-test-turns"]);
  const turns = n > 0 && n <= 50 ? n : null, hasUsd = h["x-ceiling-test-spend"] != null && Number(h["x-ceiling-test-spend"]) >= 0;
  return turns || hasUsd ? { turns, usd: hasUsd ? Number(h["x-ceiling-test-spend"]) : null } : null;
}
// Before a Sell chat call that can reach the model: crew exempt; the global spend cap, then the sell_model
// ceiling (per minute and per day, per device and per address). { ok } or { ok:false, body } where body is
// what the page shows instead of an answer (the Sell steps carry on around it).
export async function sellModelGuard(env, req) {
  const cred = hasServerCredential(req), lim = testLimits(req, cred);
  if ((cred && !lim) || (isCrew(req) && !lim)) return { ok: true };
  const paused = why => ({ ok: false, why, body: { text: MODEL_PAUSED, reply: MODEL_PAUSED, limited: true, paused: true } });
  const usd = await buyChatSpend24h(env);
  if (usd != null && usd >= BUY_CHAT_SPEND_PER_DAY_USD) {
    await logEvent(env, { event: EVENTS.RATE_LIMIT_HIT, tool: "sell", visitorId: readVisitorId(req), props: { kind: "model_spend", scope: "sell_model" } }).catch(() => {});
    return paused("spend");
  }
  const ce = await checkCeiling(env, req, "sell_model", { tool: "sell", limits: lim });
  return ce.ok ? { ok: true } : paused(ce.kind);
}
// Tasks per account (setup chat turns, research started): { ok } or { ok:false }. Crew and our own jobs exempt.
export async function tasksAllowance(env, req, userId, what) {
  if (isCrew(req) || hasServerCredential(req) || !userId) return { ok: true };
  const per = what === "research" ? TASKS_RESEARCH_PER_DAY : TASKS_SETUP_PER_DAY;
  const al = await checkAllowance(env, userId, "tasks_" + what, per);
  if (!al.ok) await logEvent(env, { event: EVENTS.RATE_LIMIT_HIT, tool: "tasks", userId, props: { kind: "account_day", scope: "tasks_" + what } }).catch(() => {});
  return al;
}
// Before a Tasks model call (no device: Tasks run signed in or from the cron): the global spend cap alone.
export async function modelSpendGuard(env) {
  if (!env || !env.supabaseUrl) return { ok: true };
  const usd = await buyChatSpend24h(env);
  return usd != null && usd >= BUY_CHAT_SPEND_PER_DAY_USD ? { ok: false, why: "spend", usd } : { ok: true };
}
// Before a Buy chat turn: { ok:true } or { ok:false, why:"device"|"spend" }.
export async function buyModelGuard(env, req) {
  const test = buyModelTest(req);
  if (!env || isCrew(req) || (hasServerCredential(req) && !test)) return { ok: true };
  const cap = (test && test.usd != null) ? test.usd : BUY_CHAT_SPEND_PER_DAY_USD;
  const usd = await buyChatSpend24h(env);
  if (usd != null && usd >= cap) {
    await logEvent(env, { event: EVENTS.RATE_LIMIT_HIT, tool: "buy", visitorId: readVisitorId(req), props: { kind: "buy_model_spend", scope: "buy_chat" } }).catch(() => {});
    return { ok: false, why: "spend" };
  }
  const dev = deviceKey(req);
  if (!dev) return { ok: true };
  const n = await countSince(env, dev, test && test.turns ? "m:buy_chat:test" : "m:buy_chat", new Date(Date.now() - D).toISOString());
  if (n != null && n >= ((test && test.turns) || BUY_MODEL_TURNS_PER_DAY)) {
    await logEvent(env, { event: EVENTS.RATE_LIMIT_HIT, tool: "buy", visitorId: readVisitorId(req), props: { kind: "buy_model_device_day", scope: "buy_chat" } }).catch(() => {});
    return { ok: false, why: "device" };
  }
  return { ok: true };
}
// After a Buy chat turn that called the model: one ledger row for the device (the spend is already logged).
export async function recordBuyModelTurn(env, req) {
  const test = buyModelTest(req);
  if (!env || isCrew(req) || (hasServerCredential(req) && !test)) return;
  const dev = deviceKey(req); if (dev) await record(env, [dev], test && test.turns ? "m:buy_chat:test" : "m:buy_chat");
}
// HEAVY USE, logged only (never blocks): a device that searches more than 30 different make|model|year
// combinations within an hour gets one buy_heavy_device row per hour (app_usage_events), so enthusiasts can
// be told apart from someone harvesting answers. The device is stored as a short hash, never the cookie.
export const HEAVY_COMBOS_PER_HOUR = 30;
export async function noteBuySearch(env, req, filters) {
  try {
    const f = filters || {}; if (!env || !f.make) return;
    const dev = deviceKey(req); if (!dev) return;
    const combo = [f.make, f.model || "", f.yearMin || "", f.yearMax || ""].join("|").toLowerCase();
    const kind = "bc:" + crypto.createHash("sha256").update(combo).digest("base64url").slice(0, 16), since = new Date(Date.now() - H).toISOString();
    if (await countSince(env, dev, kind, since)) return;   // this combination already counted this hour
    await record(env, [dev], kind);
    const distinct = await countLikeSince(env, dev, "bc:", since);
    if (distinct == null || distinct <= HEAVY_COMBOS_PER_HOUR) return;
    if (await countSince(env, dev, "bh", since)) return;   // already logged this hour
    await record(env, [dev], "bh");
    const { recordUsageEvent } = await import("../api/_usage.js");
    await recordUsageEvent({ event_type: "buy_heavy_device", route: "/buy", status: "logged", oldcarsdata_metered_requests: 0, metadata: { device: crypto.createHash("sha256").update(dev).digest("base64url").slice(0, 12), distinct, crew: isCrew(req) } }, env.supabaseUrl, env.supabaseKey);
  } catch { /* logging only */ }
}
