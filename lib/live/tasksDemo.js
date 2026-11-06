// TASKS DEMO (Lane B, Nov 2026, the Tasks page centrepiece, CREW ONLY, NOT LIVE until Sam says so in writing).
// ONE real live car and the plain request that finds it: the request is WRITTEN FROM the car's own stated attributes (make and model, the gearbox and colour only if the listing states them, a mileage ceiling
// above its stated mileage, a price ceiling above its current bid, and a distance from a real city only if the car's location is within it), then READ BACK by the Task's deterministic reader and RUN THROUGH the
// Task matcher (lib/tasks/tasks.js findMatchesDetail: runSearch, trustFilter, taskFits). The car is accepted only if the reader returns every criterion as written AND the matcher returns that car AND each
// stated criterion holds on the car itself. A request the matcher does not honour is never written.
//   tasksDemo = { request, car: { title, platform, url, photo, live: true, endsAt, priceLabel, mileage, location, why }, previous?: { kind, date, platform, mileage, price (sold only), photo, url, historyUrl },
//                 matchedAt, checkedAt, criteria: [..] (extra), whyLines: [..] (extra) }
//   why / criteria come from the engine's own matchReasonList (lib/tasks/tasks.js), deterministic, no model text, no valuation word.
// The car and its earlier record come from the featuredHistory machinery (live at selection and at every serve, a real current photo, a real link; previous only when the earlier record passes every featuredHistory
// rule, a confirmed sale preferred). STABLE: one pick stored under STORE_KEY ("crew_tasks_demo", a crew-only key), kept while it passes every rule again, replaced when its auction ends or a check fails; a pick older
// than MAX_CHECK_AGE_MS is never served; a failed refresh stores nothing and the read returns null. ZERO OldCarsData. Refreshed by the 15 minute pull (api/pullLive.js), which answers with a word, never the car.
// CREW GATE: tasksDemo(env, req) returns null without the signed crew cookie (a plain gas_crew=ok, a forged or tester cookie included). Kill switch: TASKS_DEMO=0. scripts/tasksDemoCheck.mjs fails if any other route,
// page, feed, sitemap or cache key can return it.
import { supabaseSelect, supabaseInsert, supabaseDelete } from "../_supabase.js";
import { vinAppearances } from "../../api/_historyData.js";
import { isCrewRequest } from "../_crew.js";
import { evaluateCandidate, chooseBest, genuinePhoto, liveNow, historyUrlOf } from "./featuredHistory.js";
import { houseName } from "../../api/_historyData.js";
import { reasonLine } from "../reasonWords.js";

export const STORE_KEY = "crew_tasks_demo";
export const STORE_V = 1;
export const MAX_CHECK_AGE_MS = 90 * 60 * 1000;
export const SWEEP_EVERY_MS = 30 * 60 * 1000;
export const MIN_LEFT_MS = 30 * 60 * 1000;
export const MAX_TRIES = 10;
export const VALUATION_WORDS = /\b(worth|values?|valued|valuations?|estimates?|estimated|appraisals?|appraised|deal|bargain|undervalued|overvalued|steal|good buy)\b/i;
// real US cities with their state, used only as the centre of the stated distance; the distance is measured by the matcher's own geo (lib/live/geo.js)
export const CITIES = [["New York", "NY"], ["Los Angeles", "CA"], ["Chicago", "IL"], ["Houston", "TX"], ["Phoenix", "AZ"], ["Philadelphia", "PA"], ["San Antonio", "TX"], ["San Diego", "CA"], ["Dallas", "TX"], ["San Jose", "CA"], ["Austin", "TX"], ["Jacksonville", "FL"], ["Columbus", "OH"], ["Charlotte", "NC"], ["Indianapolis", "IN"], ["San Francisco", "CA"], ["Seattle", "WA"], ["Denver", "CO"], ["Washington", "DC"], ["Boston", "MA"], ["Nashville", "TN"], ["Detroit", "MI"], ["Portland", "OR"], ["Las Vegas", "NV"], ["Atlanta", "GA"], ["Miami", "FL"], ["Minneapolis", "MN"], ["Cleveland", "OH"], ["Tampa", "FL"], ["St. Louis", "MO"], ["Pittsburgh", "PA"], ["Cincinnati", "OH"], ["Kansas City", "MO"], ["Orlando", "FL"], ["Salt Lake City", "UT"], ["Richmond", "VA"], ["Virginia Beach", "VA"], ["Baltimore", "MD"], ["Raleigh", "NC"], ["Sacramento", "CA"], ["Milwaukee", "WI"], ["Hartford", "CT"], ["Louisville", "KY"], ["Oklahoma City", "OK"], ["New Orleans", "LA"]];
export const RADII = [25, 50, 100, 150, 200, 300];

const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const norm = x => String(x || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const usd = n => "$" + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const grp = n => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const ceilTo = (n, step) => Math.ceil(n / step) * step;
// a ceiling above the car's own figure, on a round number
export const milesCeiling = m => ceilTo(m * 1.1 + 1, m < 30000 ? 5000 : 10000);
export const priceCeiling = bid => ceilTo(bid * 1.25 + 1, bid < 20000 ? 1000 : bid < 100000 ? 5000 : 10000);
const article = w => (/^[aeiou]/i.test(w) ? "an" : "a");

// ---- the request, written from the car ----
// facts: listingFacts(row) (gearbox, colour, miles, priceUsd). coord: the car's own coordinates (listingCoord), cityCoord(city, state) the city's. Returns null when the car does not state enough to write a request.
export function requestFor(row, facts, geo = {}) {
  const make = String(row.make || "").trim(), model = String(row.model || "").trim();
  if (!make || !model) return null;
  // THE PRICE IS THE TRUST LAYER'S (lib/live/liveTrust.js, facts.priceUsd): a bid it cannot state in dollars (a currency not stated, a figure that may not be dollars, a $0 bid) is NO price, never current_bid_usd as a fallback; a car with no price has no budget to write, so it is not a demo car.
  const miles = num(facts && facts.miles), bid = num(facts && facts.priceUsd);
  if (!(miles > 0) || !(bid > 0)) return null;
  const f = { make, model };
  if (facts.gearbox === "manual") f.gearbox = "manual"; else if (facts.gearbox === "auto") f.gearbox = "auto";
  if (facts.colour) f.colour = String(facts.colour).toLowerCase();
  f.miles_max = milesCeiling(miles);
  f.budget_max = priceCeiling(bid);
  const here = geo.listingCoord ? geo.listingCoord(row) : null;
  if (here && geo.placeCoord && geo.milesBetween) {
    let best = null;
    for (const [city, st] of CITIES) { const c = geo.placeCoord(city, st); if (!c) continue; const d = geo.milesBetween(c, here); if (d != null && (!best || d < best.d)) best = { city, st, d }; }
    const radius = best ? RADII.find(r => r >= best.d + 5) : null;
    if (best && radius) { f.location = `${best.city}, ${best.st}`; f.radius_miles = radius; }
  }
  const words = [f.gearbox === "manual" ? "manual" : f.gearbox ? "automatic" : null, f.colour, make, model].filter(Boolean).join(" ");
  const text = `Find me ${article(words)} ${words} with under ${grp(f.miles_max)} miles, under ${usd(f.budget_max)}${f.location ? `, within ${f.radius_miles} miles of ${f.location}` : ""}`;
  return { text, filters: f };
}

// ---- the reader: the request's words back into criteria, by the Task's deterministic layer (the resolver and filter reader Buy and Tasks share) ----
export async function readRequest(env, text) {
  const { parseQueryResolved } = await import("./search.js");
  const body = text.replace(/^Find me an? /i, "");
  const place = /within (\d+) miles of ([A-Za-z.' ]+, [A-Z]{2})\b/.exec(body);
  const words = body.replace(/,?\s*within \d+ miles of [A-Za-z.' ]+, [A-Z]{2}/, "");
  const r = await parseQueryResolved(words, env), v = r && r.vehicle ? r.vehicle : {}, f = (r && r.filters) || {};
  return { make: v.make || null, model: v.parentModel || v.model || null, gearbox: f.gearbox || null, colour: (f.colours || [])[0] || null, miles_max: f.miMax || null, budget_max: f.priceMax || null, radius_miles: place ? Number(place[1]) : null, location: place ? place[2] : null };
}
export function readBackAgrees(want, got) {
  const bad = [];
  if (norm(got.make) !== norm(want.make)) bad.push("make");
  const gm = norm(got.model), wm = norm(want.model);
  if (!gm || !(gm === wm || wm.includes(gm) || gm.includes(wm))) bad.push("model");
  if ((want.gearbox || null) !== (got.gearbox || null)) bad.push("gearbox");
  if ((want.colour || null) !== (got.colour ? String(got.colour).toLowerCase() : null)) bad.push("colour");
  if (num(got.miles_max) !== num(want.miles_max)) bad.push("miles_max");
  if (num(got.budget_max) !== num(want.budget_max)) bad.push("budget_max");
  if ((want.location || null) !== (got.location || null) || (num(want.radius_miles) || null) !== (num(got.radius_miles) || null)) bad.push("location");
  return bad;
}
// every stated criterion holds on the car itself (an independent test, not the matcher's own)
export function honoured(f, row, facts, geo = {}) {
  const bad = [];
  if (f.gearbox && facts.gearbox !== f.gearbox) bad.push("gearbox");
  if (f.colour && String(facts.colour || "").toLowerCase() !== f.colour) bad.push("colour");
  if (!(num(facts.miles) > 0) || num(facts.miles) > f.miles_max) bad.push("miles_max");
  const price = num(facts.priceUsd);
  if (!(price > 0) || price > f.budget_max) bad.push("budget_max");
  if (f.location) {
    const here = geo.listingCoord ? geo.listingCoord(row) : null, [city, st] = f.location.split(/,\s*/), c = geo.placeCoord ? geo.placeCoord(city, st) : null;
    const d = here && c && geo.milesBetween ? geo.milesBetween(c, here) : null;
    if (d == null || d > f.radius_miles) bad.push("location");
  }
  if (!(norm(row.make) === norm(f.make))) bad.push("make");
  return bad;
}

const defaultDeps = () => ({
  now: () => Date.now(),
  select: (env, q) => supabaseSelect(env, q),
  write: (env, row) => supabaseInsert("app_config", [row], env.supabaseUrl, env.supabaseKey, "resolution=merge-duplicates,return=minimal", "?on_conflict=key"),
  clear: env => supabaseDelete(env, `app_config?key=eq.${STORE_KEY}`),
  appearances: (env, vin) => vinAppearances(env, vin),
  urlStatus: async u => { try { const c = new AbortController(), t = setTimeout(() => c.abort(), 4000); const r = await fetch(u, { method: "HEAD", redirect: "follow", signal: c.signal }); clearTimeout(t); return r.status; } catch { return null; } },
  read: readRequest,
  facts: async row => (await import("./search.js")).listingFacts(row),
  geo: async () => { const g = await import("./geo.js"); return { listingCoord: g.listingCoord, placeCoord: g.placeCoord, milesBetween: g.milesBetween }; },
  // the Task matcher over the live pool: the same call a stored hunt makes (lib/tasks/tasks.js findMatchesDetail)
  match: async (env, filters) => { const t = await import("../tasks/tasks.js"); const d = await t.findMatchesDetail(env, { filters, reported_ids: [] }, {}, null); return d ? d.matches : null; },
  reasons: async f => { const t = await import("../tasks/tasks.js"); return t.matchReasonList(f); }
});
const LIVE_SELECT = "live_listings?status=eq.live&photo_url=not.is.null&current_bid_usd=gt.0&mileage=not.is.null&select=*";

// ONE car through every rule. Returns { ok, field, why } (field without the stamps).
export async function proveCar(env, row, deps, { appearances = null, nowMs = null, urlStatus = {} } = {}) {
  const d = deps, now = nowMs ?? d.now();
  if (!liveNow(row, now)) return { ok: false, why: "not_live" };
  if (!genuinePhoto(row.photo_url) || !/^https?:\/\//i.test(String(row.url || ""))) return { ok: false, why: "no_photo_or_link" };
  const facts = await Promise.resolve(d.facts(row)), geo = await Promise.resolve(d.geo());
  const req = requestFor(row, facts, geo);
  if (!req) return { ok: false, why: "not_enough_stated" };
  const got = await d.read(env, req.text).catch(() => null);
  if (!got) return { ok: false, why: "reader_failed" };
  const off = readBackAgrees(req.filters, got);
  if (off.length) return { ok: false, why: "reader_disagrees:" + off.join("+") };
  const matches = await d.match(env, req.filters).catch(() => null);
  if (!Array.isArray(matches)) return { ok: false, why: "matcher_failed" };
  const hit = matches.find(x => String(x.r.id) === String(row.id));
  if (!hit) return { ok: false, why: "matcher_does_not_return_the_car" };
  const bad = honoured(req.filters, row, facts, geo);
  if (bad.length) return { ok: false, why: "not_honoured:" + bad.join("+") };
  const criteria = await Promise.resolve(d.reasons(req.filters));
  const why = `Matches: ${criteria.join(", ")}.`;
  if (VALUATION_WORDS.test(why) || VALUATION_WORDS.test(req.text)) return { ok: false, why: "valuation_word" };
  const bid = num(facts.priceUsd);
  const car = { title: [row.year, row.make, row.model].filter(Boolean).join(" ").trim() || String(row.listing_title || "").trim(), platform: houseName(row.source), url: row.url, photo: row.photo_url, live: true, endsAt: new Date(row.end_time).toISOString(),
    priceLabel: reasonLine("tasks.demo_current_bid", { price: bid }), mileage: num(facts.miles), mileageLine: reasonLine("tasks.demo_miles", { miles: num(facts.miles) }), location: row.location || null, why };
  const field = { request: req.text, car, criteria, whyLines: criteria.slice(), matchedAt: null, checkedAt: null };
  // the earlier record, by the featuredHistory rules (a confirmed sale preferred); absent = no previous, never an invented one
  if (appearances) {
    const pre = evaluateCandidate(row, appearances, { nowMs: now });
    if (pre.ok) {
      const us = {}; for (const u of [pre.featured.previous.url, pre.featured.previous.photo]) us[u] = urlStatus[u] !== undefined ? urlStatus[u] : await d.urlStatus(u);
      const e = evaluateCandidate(row, appearances, { nowMs: now, urlStatus: us });
      if (e.ok) { const p = e.featured.previous; field.previous = { kind: e.featured.kind, date: p.date, platform: p.platform, mileage: p.mileage, ...(Number(p.mileage) > 0 ? { mileageLine: reasonLine("tasks.demo_prior_miles", { miles: p.mileage }) } : {}), ...(p.price != null ? { price: p.price, priceLine: reasonLine("tasks.demo_prior_price", { price: p.price }) } : {}), photo: p.photo, url: p.url, historyUrl: p.historyUrl || historyUrlOf(row.vin_norm || row.vin) }; field._rank = [e.featured.kind === "sold" ? 0 : 1, e.earlierCount]; }
    }
  }
  return { ok: true, field };
}

async function readStore(env, d) {
  const rows = await d.select(env, `app_config?key=eq.${STORE_KEY}&select=value&limit=1`);
  if (!Array.isArray(rows)) return { failed: true };
  const v = rows[0] && rows[0].value;
  return { value: v && typeof v === "object" ? v : null };
}
async function liveRow(env, id, d) {
  const rows = await d.select(env, `live_listings?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
  return Array.isArray(rows) ? (rows[0] || false) : null;
}

// SERVE. Crew only. A stored pick is served only when fresh (re-checked within MAX_CHECK_AGE_MS), its auction has not ended, and a keyed read confirms it is still live right now.
export async function tasksDemo(env, reqOrCookie, deps = {}) {
  const d = { ...defaultDeps(), ...deps };
  if (process.env.TASKS_DEMO === "0" || !isCrewRequest(reqOrCookie)) return null;
  const s = await readStore(env, d), st = s.value;
  if (!st || !st.field || !st.listingId || st.v !== STORE_V) return null;
  const now = d.now(), f = st.field;
  if (!(Date.parse(st.checkedAt) > now - MAX_CHECK_AGE_MS) || !(Date.parse(f.car && f.car.endsAt) > now)) return null;
  const row = await liveRow(env, st.listingId, d);
  if (!row || !liveNow(row, now)) return null;
  const out = { ...f, checkedAt: st.checkedAt, matchedAt: st.matchedAt };
  return out;
}

// REFRESH (the cron, never a visitor). Keeps the stored pick while every rule passes again; otherwise searches. A failure stores nothing.
export async function refreshTasksDemo(env, deps = {}) {
  const d = { ...defaultDeps(), ...deps };
  const now = d.now(), iso = new Date(now).toISOString();
  if (process.env.TASKS_DEMO === "0") return { stored: null, why: "off" };
  const drop = async why => { await Promise.resolve(d.clear(env)).catch(() => {}); return { stored: null, why }; };
  const stamp = field => { const { _rank, ...rest } = field; return rest; };
  try {
    const s = await readStore(env, d);
    if (s.failed) return await drop("store_unreadable");
    const st = s.value;
    if (st && st.field && st.listingId && st.v === STORE_V) {
      const row = await liveRow(env, st.listingId, d);
      if (row === null) return await drop("live_unreadable");
      if (row && liveNow(row, now) && Date.parse(st.field.car.endsAt) > now) {
        const apps = row.vin_norm ? await d.appearances(env, row.vin_norm).catch(() => null) : null;
        const again = await proveCar(env, row, d, { appearances: apps && apps.ok ? (apps.appearances || []).map(a => ({ ...a, vinNorm: apps.vinNorm })) : null, nowMs: now });
        if (again.ok) { const keep = { ...st, field: stamp(again.field), checkedAt: iso }; await d.write(env, { key: STORE_KEY, value: keep }); return { stored: keep, why: "kept" }; }
      }
    } else if (st && st.sweptAt && Date.parse(st.sweptAt) > now - SWEEP_EVERY_MS && st.none) return { stored: null, why: "swept_recently" };
    const live = await d.select(env, LIVE_SELECT + `&end_time=gt.${encodeURIComponent(new Date(now + MIN_LEFT_MS).toISOString())}&order=end_time.desc&limit=400`);
    if (!Array.isArray(live)) return await drop("live_unreadable");
    // the cars with an earlier record first (a confirmed sale before a listing), then the rest
    const vinned = live.filter(r => String(r.vin_norm || "").length >= 6);
    const funnel = { live: live.length, withVin: vinned.length, historyRead: 0, withEarlierRecord: 0, tried: 0, failed: {} };   // counts only (the ops task crewkeys prints them); never a car
    const withHist = [], seen = new Set();
    for (const r of vinned.slice(0, 120)) {
      const a = await d.appearances(env, r.vin_norm).catch(() => null);
      if (!a || !a.ok) continue;
      funnel.historyRead++;
      const apps = (a.appearances || []).map(x => ({ ...x, vinNorm: a.vinNorm }));
      const pre = evaluateCandidate(r, apps, { nowMs: now });
      if (pre.ok) { funnel.withEarlierRecord++; withHist.push({ r, apps, rank: [pre.featured.kind === "sold" ? 0 : 1, pre.earlierCount] }); seen.add(String(r.id)); }
    }
    withHist.sort((x, y) => x.rank[0] - y.rank[0] || x.rank[1] - y.rank[1] || Date.parse(y.r.end_time) - Date.parse(x.r.end_time) || String(x.r.id).localeCompare(String(y.r.id)));
    const order = [...withHist.map(x => ({ r: x.r, apps: x.apps })), ...live.filter(r => !seen.has(String(r.id))).sort((a, b) => Date.parse(b.end_time) - Date.parse(a.end_time) || String(a.id).localeCompare(String(b.id))).map(r => ({ r, apps: null }))];
    let tries = 0;
    for (const c of order) {
      if (tries >= MAX_TRIES) break;
      tries++; funnel.tried = tries;
      const p = await proveCar(env, c.r, d, { appearances: c.apps, nowMs: now });
      if (!p.ok) { const k = String(p.why).split(":")[0]; funnel.failed[k] = (funnel.failed[k] || 0) + 1; continue; }
      const value = { v: STORE_V, listingId: c.r.id, field: stamp(p.field), selectedAt: iso, matchedAt: iso, checkedAt: iso };
      value.field = { ...value.field, matchedAt: iso, checkedAt: iso };
      await d.write(env, { key: STORE_KEY, value });
      return { stored: value, why: "selected", tried: tries, history: !!p.field.previous, funnel };
    }
    const none = { none: true, sweptAt: iso }; await d.write(env, { key: STORE_KEY, value: none });
    return { stored: null, why: "none_provable", tried: tries, funnel };
  } catch (e) {
    if (process.env.TD_DEBUG) console.error(e);
    return await drop("error");
  }
}

// OPS, KEYED AND READ ONLY (Lane B, Nov 6 2026): what the two crew keys hold now, and (funnel=1) the counts each refresh finds on the live pool, without writing. api/usageDashboard.js task=crewkeys reaches it through api/pullLive.js behind the ops key; no
// cron branch, route or page calls it. It lives here because this module already reads both stores and is on every allow list.
export async function crewKeysReport(env, { funnel = false } = {}) {
  const fh = await import("./featuredHistory.js"), td = { STORE_KEY, STORE_V, refreshTasksDemo };
  const rows = await supabaseSelect(env, `app_config?key=in.(${fh.STORE_KEY},${td.STORE_KEY})&select=*`);
  if (!Array.isArray(rows)) return { task: "crewkeys", readFailed: true, ocdSpend: 0, writes: 0 };
  const by = k => (rows.find(r => r.key === k) || {}).value || null;
  const prev = p => (p ? { kind: p.kind || null, date: p.date || null, platform: p.platform || null, mileage: p.mileage ?? null, price: p.price ?? null, historyUrl: p.historyUrl || null } : null);
  const one = (v, pick) => (!v ? { held: false } : v.none ? { held: true, none: true, sweptAt: v.sweptAt || null } : { held: true, v: v.v ?? null, listingId: v.listingId ?? null, selectedAt: v.selectedAt || null, checkedAt: v.checkedAt || null, ...pick(v) });
  const out = { task: "crewkeys", ocdSpend: 0, writes: 0, now: new Date().toISOString(),
    [fh.STORE_KEY]: one(by(fh.STORE_KEY), v => ({ kind: v.featured && v.featured.kind || null, car: v.featured && v.featured.current ? { title: v.featured.current.title, platform: v.featured.current.platform, endsAt: v.featured.current.endsAt, mileage: v.featured.current.mileage ?? null } : null, previous: prev(v.featured && v.featured.previous) })),
    [td.STORE_KEY]: one(by(td.STORE_KEY), v => ({ matchedAt: v.matchedAt || null, request: v.field && v.field.request || null, car: v.field && v.field.car ? { title: v.field.car.title, platform: v.field.car.platform, priceLabel: v.field.car.priceLabel, mileage: v.field.car.mileage ?? null, location: v.field.car.location || null, endsAt: v.field.car.endsAt } : null, criteria: v.field && v.field.criteria || null, previous: prev(v.field && v.field.previous) })) };
  if (funnel) {
    // the same selection each refresh runs, with the stored pick hidden and nothing written or cleared: counts only
    const sel = (e, q) => (/^app_config/.test(q) ? Promise.resolve([]) : supabaseSelect(e, q)), noop = async () => {};
    const f1 = await fh.refreshFeaturedHistory(env, { select: sel, write: noop, clear: noop }).catch(e => ({ why: "error", error: String(e && e.message || e) }));
    const f2 = await td.refreshTasksDemo(env, { select: sel, write: noop, clear: noop }).catch(e => ({ why: "error", error: String(e && e.message || e) }));
    out.funnel = { featured: { why: f1.why, funnel: f1.funnel || null, stats: f1.stats || null }, demo: { why: f2.why, tried: f2.tried ?? null, withEarlierRecord: !!f2.history, funnel: f2.funnel || null } };
  }
  return out;
}
