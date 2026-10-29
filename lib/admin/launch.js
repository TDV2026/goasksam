// The Launch tab's data (Lane D, Oct 26 2026). READ ONLY: it reads analytics_events, outbound_clicks and the OldCarsData
// ledger (app_usage_events), counts them, and returns plain numbers. It writes nothing and computes no product answer: every
// answer figure it counts was already put in an event by the engine's own result (search_run.answer_type).
//
// Rules this file keeps:
//   - Bots and internal (crew, test) traffic are left out of every number.
//   - Nothing personal leaves this file: visitors are counted, never listed; no id, address or account is returned. The one
//     free text returned is the scrubbed query text of a search that got nothing, which is what the unmet panel is for.
//   - Every read is bounded by a time range and by event names (the (name, ts) index); a page-view read is capped.
//   - Each result is cached on this instance for 60 seconds, so the 60 second auto refresh of several open tabs reads once.
import { supabaseSelectAll } from "../_supabase.js";
import { launchAtMs } from "../launchTime.js";

// The opening moment is the LAUNCH_AT setting (lib/launchTime.js), empty until Sam sets it; nothing here holds a date of its own.
export const launchIso = () => { const t = launchAtMs(); return t ? new Date(t).toISOString() : null; };
const TTL_MS = 60000, PV_CAP = 60000;
const cache = new Map();
async function cached(key, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.v;
  const v = await fn();
  cache.set(key, { at: Date.now(), v });
  if (cache.size > 40) for (const k of cache.keys()) { if (Date.now() - cache.get(k).at > TTL_MS) cache.delete(k); }
  return v;
}

const PRODUCTS = ["buy", "market_check", "sell"];
const SURFACES = ["find", "market_check", "tasks", "tasks_email", "sell"];
const ACTED = new Set(["auction_clickout", "live_car_clicked", "task_created", "introduction_requested"]);
const enc = encodeURIComponent;
const sum = (a, f) => a.reduce((n, x) => n + (Number(f(x)) || 0), 0);
function pctile(sorted, p) { if (!sorted.length) return null; const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1)); return sorted[i]; }
const ratio = (a, b) => (b ? a / b : null);

// r.crew true (the tab's include-crew switch, off by default) leaves crew and test traffic in; bots stay out either way.
const BASE = r => `analytics_events?ts=gte.${enc(r.from)}&ts=lt.${enc(r.to)}&is_bot=eq.false${r.crew ? "" : "&internal=eq.false"}`;
async function read(env, path) {
  const out = await supabaseSelectAll(env, path);
  if (out === null) throw new Error("read failed");   // never a silent empty: a failed read is an error the tab shows
  return out;
}

async function readAll(env, r) {
  // One read at a time, each bounded. Page views are the big one and are capped.
  const pv = await read(env, `${BASE(r)}&name=eq.page_view&select=ts,product,anon_id,session_id,ref_domain,utm_source,utm_medium,device_class,props&order=ts.asc`);
  const ev = await read(env, `${BASE(r)}&name=in.(search_run,identity_question_shown,identity_question_answered,auction_clickout,live_car_clicked,task_created,task_paused,task_cancelled,task_match_sent,sell_started,sell_answer_shown,introduction_requested,signin_started,code_requested,signin,signup_completed,signup_refused,limit_hit,standing_arm,error,busy_shown,feedback_sent,near_me_zip)&select=ts,name,product,anon_id,session_id,device_class,props&order=ts.asc`);
  const mc = await read(env, `${BASE(r)}&name=eq.model_call&select=product,props`);
  const out = await read(env, `outbound_clicks?created_at=gte.${enc(r.from)}&created_at=lt.${enc(r.to)}&outcome=eq.continued&select=platform`).catch(() => null);
  const ocd = await read(env, `app_usage_events?event_type=eq.ocd_call&oldcarsdata_metered_requests=gt.0&created_at=gte.${enc(r.from)}&created_at=lt.${enc(r.to)}&select=oldcarsdata_metered_requests,job:metadata->>job`).catch(() => null);
  // Held at the door: the sealed-site holding page. Bots are kept in this read (the bot share is the point); crew is not.
  const held = await read(env, `analytics_events?ts=gte.${enc(r.from)}&ts=lt.${enc(r.to)}&${r.crew ? "" : "internal=eq.false&"}name=eq.held_at_door&select=ts,is_bot,props`).catch(() => null);
  // Page views are the biggest read; past the cap only the earliest are counted and the tab says so.
  return { pv: pv.length > PV_CAP ? pv.slice(0, PV_CAP) : pv, ev, mc, out, ocd, held, pvCapped: pv.length > PV_CAP };
}

export function build(data, r) {
  const { pv, ev, mc } = data;
  const by = n => ev.filter(e => e.name === n);
  const runs = by("search_run");
  const P = e => e.props || {};
  const key = e => e.anon_id || null;

  // ---- 1. answer rate
  const tier = a => a === "range" ? "real" : a === "identity_question" ? "asked_back" : (a === "not_enough_data" || a === "zero_result") ? "thin" : a === "failed" ? "error" : "other";
  const rate = list => { const o = { asked: list.length, real: 0, asked_back: 0, thin: 0, error: 0, other: 0 }; for (const e of list) o[tier(P(e).answer_type)]++; return o; };
  const answerRate = [...PRODUCTS.map(p => ({ product: p, ...rate(runs.filter(e => e.product === p)) })), { product: "total", ...rate(runs) }];
  const refusals = { limit_hit: by("limit_hit").length, signup_refused: by("signup_refused").length };

  // ---- 2. unmet demand and top cars
  const unmetMap = new Map();
  for (const e of runs) {
    const t = tier(P(e).answer_type); if (t !== "thin" && t !== "error") continue;
    const q = String(P(e).query_text || "-"), k = e.product + "|" + q.toLowerCase();
    const o = unmetMap.get(k) || { product: e.product, query: q, outcome: t, times: 0, last: e.ts };
    o.times++; if (e.ts > o.last) { o.last = e.ts; o.query = q; o.outcome = t; }
    unmetMap.set(k, o);
  }
  const unmet = [...unmetMap.values()].sort((a, b) => (a.last < b.last ? 1 : -1)).slice(0, 100);
  const carMap = new Map();
  for (const e of runs) { const v = P(e).vehicle_key; if (!v) continue; const o = carMap.get(v) || { car: String(v).replace("|", " "), asked: 0, buy: 0, market_check: 0, sell: 0 }; o.asked++; if (o[e.product] != null) o[e.product]++; carMap.set(v, o); }
  const topCars = [...carMap.values()].sort((a, b) => b.asked - a.asked).slice(0, 20);

  // ---- visitors (by anon id; a restricted-region visitor who declined has none and is only in the plain event counts)
  const V = new Map();
  const vis = id => { let v = V.get(id); if (!v) { v = { pages: new Set(), sessions: new Set(), asked: new Set(), real: new Set(), acted: new Set(), first: null, walled: false, signed: null, task: false, watch: false }; V.set(id, v); } return v; };
  for (const e of pv) { const id = key(e); if (!id) continue; const v = vis(id); v.pages.add(e.product); if (e.session_id) v.sessions.add(e.session_id); if (!v.first) v.first = e; }
  for (const e of ev) {
    const id = key(e); if (!id) continue; const v = vis(id);
    if (e.session_id) v.sessions.add(e.session_id);
    if (e.name === "search_run") { v.asked.add(e.product); if (P(e).answer_type === "range") v.real.add(e.product); }
    if (ACTED.has(e.name)) v.acted.add(e.product);
    // The launch-day steps after the first search (Oct 29 2026): the daily-limit wall, the first sign-in, the first Task, the first watch.
    if (e.name === "limit_hit") v.walled = true;
    if (e.name === "signin" && (!v.signed || e.ts < v.signed)) v.signed = e.ts;
    if (e.name === "task_created") v.task = true;
    if (e.name === "standing_arm" && P(e).outcome !== "refused" && P(e).control !== "task") v.watch = true;
  }
  const back = v => v.sessions.size >= 2;

  // ---- 3. funnel (each step is inside the one before it) and the asked-back loop
  const steps = (ids, p) => {
    const a = ids.filter(([, v]) => p ? v.pages.has(p) : v.pages.size > 0);
    const s1 = a.filter(([, v]) => p ? v.asked.has(p) : v.asked.size > 0);
    const s2 = s1.filter(([, v]) => p ? v.real.has(p) : v.real.size > 0);
    const s3 = s2.filter(([, v]) => p ? v.acted.has(p) : v.acted.size > 0);
    const s4 = s3.filter(([, v]) => back(v));
    const n = [a.length, s1.length, s2.length, s3.length, s4.length];
    return { arrived: n[0], asked: n[1], real: n[2], acted: n[3], came_back: n[4], lost: n.slice(1).map((x, i) => (n[i] ? 1 - x / n[i] : null)) };
  };
  const all = [...V.entries()];
  const funnel = [...PRODUCTS.map(p => ({ product: p, ...steps(all, p) })), { product: "total", ...steps(all, null) }];
  const actedNoReal = all.filter(([, v]) => v.acted.size > 0 && v.real.size === 0).length;

  const shown = by("identity_question_shown"), answered = by("identity_question_answered");
  const sid = e => P(e).search_id || null;
  const shownIds = new Set(shown.map(sid).filter(Boolean)), ansIds = new Set(answered.filter(e => P(e).skipped !== true).map(sid).filter(Boolean)), skipIds = new Set(answered.filter(e => P(e).skipped === true).map(sid).filter(Boolean));
  const firstAns = new Map(); for (const e of answered) { const s = sid(e); if (s && !firstAns.has(s)) firstAns.set(s, e.ts); }
  const realAfter = new Set(runs.filter(e => P(e).search_id && P(e).answer_type === "range" && firstAns.has(P(e).search_id) && e.ts >= firstAns.get(P(e).search_id)).map(e => P(e).search_id));
  const loop = { asked: shownIds.size, answered: [...ansIds].filter(i => shownIds.has(i)).length, skipped: [...skipIds].filter(i => shownIds.has(i) && !ansIds.has(i)).length,
    real_after: [...realAfter].filter(i => shownIds.has(i)).length, left: [...shownIds].filter(i => !ansIds.has(i) && !skipIds.has(i)).length, shown_without_id: shown.filter(e => !sid(e)).length };

  // ---- 4. action
  const clicks = by("auction_clickout").concat(by("live_car_clicked").map(e => ({ ...e, props: { platform: P(e).platform || "unknown", surface: "find" } })));
  const plat = new Map();
  const add = (platform, surface) => { const o = plat.get(platform) || { platform, find: 0, market_check: 0, tasks: 0, tasks_email: 0, sell: 0, unlabelled: 0, total: 0 }; if (SURFACES.includes(surface)) o[surface]++; else o.unlabelled++; o.total++; plat.set(platform, o); };
  for (const e of clicks) add(String(P(e).platform || "unknown"), P(e).surface);
  for (const o of (data.out || [])) add(String(o.platform || "unknown"), "sell");
  const outbound = [...plat.values()].sort((a, b) => b.total - a.total);
  const signins = by("signin");
  const signMethod = m => signins.filter(e => (m ? P(e).method === m : !P(e).method)).length;
  const action = {
    tasks_created: by("task_created").length, tasks_paused: by("task_paused").length, tasks_stopped: by("task_cancelled").length,
    task_runs: by("task_match_sent").length, task_emails_sent: sum(by("task_match_sent"), e => P(e).emails_sent), task_emails_failed: sum(by("task_match_sent"), e => P(e).failed),
    sell_started: by("sell_started").length, sell_finished: by("sell_answer_shown").length, introductions: by("introduction_requested").length,
    signin_started: by("signin_started").length, code_requested: by("code_requested").length, signin_completed: signins.length,
    signin_google: signMethod("google"), signin_code: signMethod("email"), signin_method_unknown: signMethod(null), new_accounts: by("signup_completed").length,
    newsletter_ticked: signins.filter(e => P(e).newsletter === true).length, newsletter_not_ticked: signins.filter(e => P(e).newsletter === false).length, newsletter_unknown: signins.filter(e => P(e).newsletter == null).length,
  };

  // ---- 5. came back, and where from
  const srcKey = e => e ? (e.utm_source ? "utm: " + e.utm_source : e.ref_domain ? e.ref_domain : "direct") : "direct";
  const S = new Map();
  for (const [, v] of all) {
    if (!v.first) continue;
    const k = srcKey(v.first) + "|" + v.first.product;
    const o = S.get(k) || { source: srcKey(v.first), product: v.first.product, visitors: 0, asked: 0, walled: 0, signed_in: 0, task: 0, watch: 0, acted: 0, came_back: 0 };
    o.visitors++; if (v.asked.size) o.asked++; if (v.walled) o.walled++; if (v.signed) o.signed_in++; if (v.task) o.task++; if (v.watch) o.watch++; if (v.acted.size) o.acted++; if (back(v)) o.came_back++; S.set(k, o);
  }
  const sources = [...S.values()].sort((a, b) => b.visitors - a.visitors).slice(0, 40);
  // Searches split by whether the visitor had signed in by then. A search row's user_id cannot say this (the sign-in link stamps EARLIER anonymous rows with the
  // account, and later rows carry none), so it is read from the visitor's first signin event. Counts only.
  const vFirst = new Map(all.map(([id, v]) => [id, v.signed]));
  const searchSplit = PRODUCTS.map(pr => { const l = runs.filter(e => e.product === pr); const sIn = l.filter(e => e.anon_id && vFirst.get(e.anon_id) && e.ts >= vFirst.get(e.anon_id)).length; return { product: pr, anonymous: l.length - sIn, signed_in: sIn }; });
  const returning = { visitors: all.filter(([, v]) => v.pages.size > 0).length, returning: all.filter(([, v]) => v.pages.size > 0 && back(v)).length };

  // ---- 7. speed
  const lat = list => { const s = list.map(e => Number(P(e).latency_ms)).filter(Number.isFinite).sort((a, b) => a - b); return { n: s.length, p50: pctile(s, 0.5), p95: pctile(s, 0.95) }; };
  const served = e => P(e).answer_type !== "failed";
  const speed = PRODUCTS.map(p => { const l = runs.filter(e => e.product === p && served(e)); return { product: p, ...lat(l), cold: lat(l.filter(e => P(e).cache === "cold")), warm: lat(l.filter(e => P(e).cache === "warm")), cache_recorded: l.filter(e => P(e).cache).length }; });

  // ---- 8. failures
  const errs = by("error"), busy = by("busy_shown");
  const group = (list, f) => { const m = {}; for (const e of list) { const k = f(e); m[k] = (m[k] || 0) + 1; } return Object.entries(m).map(([k, n]) => ({ k, n })).sort((a, b) => b.n - a.n); };
  const failedRuns = runs.filter(e => P(e).answer_type === "failed");
  const heldRows = data.held || [];
  const heldBots = heldRows.filter(e => e.is_bot).length;
  // last_hour and last_at (Oct 28 2026): the range total keeps the hits of earlier today after the site opens, so the line that goes to zero by itself is the last hour.
  const heldNow = Date.now(), heldTimes = heldRows.map(e => Date.parse(e.ts)).filter(Number.isFinite);
  const held = { total: heldRows.length, bots: heldBots, bot_share: ratio(heldBots, heldRows.length), by_route: group(heldRows, e => (e.props || {}).route || "?"), read: data.held !== null && data.held !== undefined,
    last_hour: heldTimes.filter(t => t >= heldNow - 3600000).length, last_at: heldTimes.length ? new Date(Math.max(...heldTimes)).toISOString() : null };
  const failures = {
    held,
    errors: group(errs, e => `${P(e).route || "?"} ${P(e).status || "?"}`), busy_shown: busy.length, busy_by_reason: group(busy, e => P(e).reason || "busy"),
    limit_hit: group(by("limit_hit"), e => P(e).limit || "?"), signup_refused: group(by("signup_refused"), e => P(e).reason || "?"),
    search_failed: group(failedRuns, e => `${e.product} ${P(e).failure_state || "failed"}`),
    last: [...errs.map(e => ({ ts: e.ts, kind: "error", detail: `${P(e).route || "?"} ${P(e).status || "?"}${P(e).code ? " " + P(e).code : ""}` })),
      ...failedRuns.map(e => ({ ts: e.ts, kind: "search failed", detail: `${e.product} ${P(e).failure_state || "failed"}` })),
      ...busy.map(e => ({ ts: e.ts, kind: "busy line shown", detail: P(e).reason || "busy" }))].sort((a, b) => (a.ts < b.ts ? 1 : -1)).slice(0, 20),
  };


  // ---- 11. where from and what on (round 2): coarse place from the edge headers and the device class, counts only
  const gp = e => (e.props || {});
  const distinctBy = (list, f) => { const m = new Map(); for (const e of list) { const k = f(e); if (k == null) continue; const id = key(e); const o = m.get(k) || { ids: new Set(), n: 0 }; o.n++; if (id) o.ids.add(id); m.set(k, o); } return m; };
  const placeRows = (kf, filt) => { const v = distinctBy(pv.filter(filt || (() => true)), kf), q = distinctBy(runs.filter(filt || (() => true)), kf); const ks = new Set([...v.keys(), ...q.keys()]);
    return [...ks].map(k => ({ k, visitors: v.has(k) ? v.get(k).ids.size : 0, searches: q.has(k) ? q.get(k).n : 0 })).sort((a, b) => b.visitors - a.visitors || b.searches - a.searches); };
  const withGeo = pv.filter(e => gp(e).geo_country).length;
  const where = {
    countries: placeRows(e => gp(e).geo_country || null).slice(0, 30),
    states: placeRows(e => gp(e).geo_region || null, e => gp(e).geo_country === "US").slice(0, 60),
    no_place_page_views: pv.length - withGeo,
    devices: PRODUCTS.map(p => { const v = distinctBy(pv.filter(e => e.product === p), e => e.device_class || "unknown"), q = distinctBy(runs.filter(e => e.product === p), e => e.device_class || "unknown");
      const ks = new Set([...v.keys(), ...q.keys()]); return { product: p, rows: [...ks].map(k => ({ k, visitors: v.has(k) ? v.get(k).ids.size : 0, searches: q.has(k) ? q.get(k).n : 0 })).sort((a, b) => b.visitors - a.visitors) }; }),
    zips: (() => { const m = new Map(); for (const e of by("near_me_zip")) { const z = gp(e).zip; if (!z) continue; const o = m.get(z) || { zip: z, times: 0, ids: new Set(), last: e.ts, place: [gp(e).geo_city, gp(e).geo_region].filter(Boolean).join(", ") }; o.times++; if (key(e)) o.ids.add(key(e)); if (e.ts > o.last) o.last = e.ts; m.set(z, o); }
      return [...m.values()].map(o => ({ zip: o.zip, times: o.times, visitors: o.ids.size, last: o.last })).sort((a, b) => b.times - a.times).slice(0, 50); })(),
  };

  // ---- 9. cost per answer
  const answersServed = runs.filter(served).length;
  const anthropic = sum(mc, e => P(e).cost_usd);
  const jobs = {}; for (const o of (data.ocd || [])) { const j = o.job || "(none)"; jobs[j] = (jobs[j] || 0) + (Number(o.oldcarsdata_metered_requests) || 0); }
  const isSearchJob = j => j === "ocd" || j === "(none)";
  const ocdSearch = sum(Object.entries(jobs).filter(([j]) => isSearchJob(j)), x => x[1]);
  const ocdLive = sum(Object.entries(jobs).filter(([j]) => /^pull_live/.test(j)), x => x[1]);
  const ocdOther = sum(Object.entries(jobs).filter(([j]) => !isSearchJob(j) && !/^pull_live/.test(j)), x => x[1]);
  const cost = { answers_served: answersServed, anthropic_usd: anthropic, anthropic_per_answer: ratio(anthropic, answersServed), model_calls: mc.length,
    ocd_visitor_search: ocdSearch, ocd_live_pull: ocdLive, ocd_nightly_and_other: ocdOther, ocd_total: ocdSearch + ocdLive + ocdOther,
    ocd_per_answer_all: ratio(ocdSearch + ocdLive + ocdOther, answersServed), ocd_per_answer_search_only: ratio(ocdSearch, answersServed), ocd_read: data.ocd !== null, by_job: Object.entries(jobs).map(([job, credits]) => ({ job, credits })).sort((a, b) => b.credits - a.credits) };

  return { range: { from: r.from, to: r.to, key: r.key }, answerRate, refusals, unmet, topCars, funnel, actedNoReal, loop, action, outbound, outbound_sell_read: data.out !== null,
    sources, searchSplit, returning, speed, failures, where, cost, feedback: by("feedback_sent").length, truncated: data.pvCapped, runsTotal: runs.length };
}

export async function launchPanels(env, r) {
  return cached("launch|" + r.key + "|" + r.from.slice(0, 16) + "|" + (r.crew ? "crew" : "visitors"), async () => {
    const data = await readAll(env, r);
    return { ...build(data, r), generatedAt: new Date().toISOString() };
  });
}

// "Right now": the last 15 minutes, whatever date is picked.
export async function rightNow(env, crew = false) {
  return cached("now|" + (crew ? "crew" : "visitors"), async () => {
    const to = new Date(), from = new Date(to.getTime() - 15 * 60000);
    const r = { from: from.toISOString(), to: new Date(to.getTime() + 1000).toISOString(), crew: !!crew };
    const pv = await read(env, `${BASE(r)}&name=eq.page_view&select=anon_id,session_id`);
    const ev = await read(env, `${BASE(r)}&name=in.(search_run,error,busy_shown)&select=name,anon_id,props`);
    const runs = ev.filter(e => e.name === "search_run");
    const ids = new Set([...pv, ...ev].map(e => e.anon_id || e.session_id).filter(Boolean));
    const failed = runs.filter(e => (e.props || {}).answer_type === "failed").length + ev.filter(e => e.name === "error" || e.name === "busy_shown").length;
    return { minutes: 15, visitors: ids.size, answers: runs.filter(e => (e.props || {}).answer_type !== "failed").length, failures: failed, asked: runs.length, generatedAt: to.toISOString() };
  });
}
