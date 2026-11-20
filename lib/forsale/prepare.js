// FOR SALE: THE READ IS MADE READY AHEAD OF TIME (Lane D, lane-d-forsale, Nov 2026). api/pullForSale.js?mode=prepare, a scheduled job, never a visitor's request.
// A card never triggers an engine run: this job gives every stored listing (1) the engine's resolved car (the same resolver Find's own cards use, specOf), (2) the engine's read of that car (the same
// listingMarket call a Find card makes, cold compute allowed HERE and stored in spec_market_cache like every other spec), and (3) the car's earlier record by VIN (seenBefore). All three are stored on the row.
// A request then only reads the row. A listing whose read is not ready is not served (read_pending, counted) until the next run makes it ready; it never waits, never computes.
import { specOf, listingFacts, listingMarket, seenBefore, soldLine, specQuery } from "../live/search.js";
import { ENGINE_VERSION } from "../onebox.js";
import { reasonLine } from "../reasonWords.js";
import { statedMiles } from "../placeholderMiles.js";
import { supabaseSelectAll } from "../_supabase.js";
import { liveShape, isFullVin } from "./rules.js";

const hdr = env => ({ apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, "Content-Type": "application/json" });
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const READ_MAX_AGE_MS = 12 * 3600e3;   // a read older than this is made again (the engine's stored answer behind it is refreshed by its own rules)

export async function select(env, query) {
  const r = await fetch(`${env.supabaseUrl}/rest/v1/for_sale_listings?${query}`, { headers: hdr(env) });
  if (!r.ok) throw new Error(`for_sale_listings read ${r.status}`);
  return r.json();
}
async function patchRow(env, id, body) {
  const r = await fetch(`${env.supabaseUrl}/rest/v1/for_sale_listings?id=eq.${id}`, { method: "PATCH", headers: { ...hdr(env), Prefer: "return=minimal" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`for_sale_listings patch ${r.status}`);
}

// THE ENGINE'S READ OF ONE LISTING'S CAR, as stored words (pure of reads): the range the engine's own answer gives, else the engine's honest line. null: the engine has not got it ready.
export function readOf(m, at) {
  if (!m || m.kind === "pending" || m.stillReading === true) return null;
  const fa = m.findAnswer && typeof m.findAnswer === "object" ? m.findAnswer : null;
  const r = fa && fa.range && Number(fa.range.low) > 0 && Number(fa.range.high) > 0 ? { low: Number(fa.range.low), high: Number(fa.range.high) } : (m.kind === "range" && Number(m.low) > 0 && Number(m.high) > 0 ? { low: Number(m.low), high: Number(m.high) } : null);
  if (r) return { kind: "range", low: r.low, high: r.high, sold_line: reasonLine("forsale.range", r), engine_version: ENGINE_VERSION, at };
  let line = null;
  if (m.kind === "refused" && m.refusalLine) line = String(m.refusalLine);
  else if (m.kind === "unmatched" || m.kind === "not_tracked" || m.readFailed) line = reasonLine("find.none");
  else if (fa && Array.isArray(fa.lines) && fa.lines.length) line = fa.lines.join(" ");
  else line = soldLine(m);
  return line ? { kind: "none", low: null, high: null, sold_line: String(line), engine_version: ENGINE_VERSION, at } : null;
}

// THE CAR'S EARLIER RECORD, as the finished line (or none): "This car sold for $36,500 in March 2024." or "This car was bid to $31,000 and did not sell in May 2026."
export function historyOf(seen, at) {
  if (!seen || !seen.date || !(Number(seen.priceUsd) > 0)) return { none: true, at };
  const m = /^(\d{4})-(\d{2})/.exec(String(seen.date)); if (!m) return { none: true, at };
  const when = `${MONTHS[Number(m[2]) - 1]} ${m[1]}`, price = Number(seen.priceUsd);
  const sold = seen.result === "sold";
  return { none: false, result: sold ? "sold" : "unsold", date: String(seen.date).slice(0, 10), price_usd: price, line: reasonLine(sold ? "forsale.sold_for" : "forsale.unsold", { price, when }), at };
}

// THE CATCH UP (Lane D, lane-d-forsale-prepare, Nov 19 2026): the first load left 45,968 live rows and none resolved, and the job did 400 listings an hour. Three changes, none of which changes what a row ends up holding:
//  1. THE RESOLVER, ALONE, FIRST, ONCE PER DISTINCT TITLE: listings that give the resolver the same inputs (title, year, make, model, body, gearbox) are resolved by ONE call and the answer is written to all of them in one patch.
//  2. ONE ENGINE READ PER DISTINCT CAR AND MILEAGE BAND, NOT PER LISTING: the resolved listings that share a car key and a mileage band are read by ONE listingMarket call, and the read is stamped onto every listing of the group (readOf is a pure function of the engine's answer).
//  3. A RUN LEAVES THE REST FOR THE NEXT: it counts what is left, takes a lease so two runs never overlap (so at most three engine reads run at once, the standing limit on heavy reads), and a run with nothing to do ends at once.
// The mileage band is the one a listing's own mileage falls in (bandOf): the same band reads the same engine answer and shares one read. The bands are coarse on purpose (a different band is another read, never a wrong stamp).
export const MILES_BANDS = [10000, 25000, 50000, 100000];
export const bandOf = m => { const n = statedMiles(m); if (!(n > 0)) return "unknown"; const i = MILES_BANDS.findIndex(b => n < b); return i < 0 ? "100000+" : i === 0 ? "0-" + MILES_BANDS[0] : MILES_BANDS[i - 1] + "-" + MILES_BANDS[i]; };
// what the resolver is given: the same inputs specOf reads (its own memo key), so equal inputs are one call
export const resolveKeyOf = (row, facts) => [row.title || "", row.year || "", row.make || "", row.model || "", facts && facts.body || "", facts && facts.gearbox || ""].join("\u0001");
export const readKeyOf = (row, facts) => (row.car_key || (row.car && row.car.key) || "") + "|" + bandOf(facts ? facts.miles : row.mileage);
export function groupRows(rows, keyOf) { const m = new Map(); for (const r of rows) { const k = keyOf(r); (m.get(k) || m.set(k, []).get(k)).push(r); } return m; }

// THE QUEUE BY DEMAND (Lane D, Nov 19 2026): the read groups for the makes and models searched most on Find and Market Check in the last 30 days are read first, then the groups with the most cards, so the cars people type fill in first. Demand is the count of searches
// (search_events: make and model of each search, every surface) in the window; a car nobody searched has demand 0 and keeps the old order (the most cards first). An unreadable demand table is no demand: the order falls back to the old one, never a failed run.
export const DEMAND_DAYS = 30;
export const demandKey = (make, model) => String(make || "").toLowerCase().replace(/[^a-z0-9]+/g, "") + "|" + String(model || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
export async function demandOf(env, now = Date.now()) {
  try {
    const since = new Date(now - DEMAND_DAYS * 864e5).toISOString();
    const rows = await supabaseSelectAll(env, `search_events?created_at=gte.${since}&make=not.is.null&select=make,model&order=id.asc`);
    const m = new Map(); for (const r of Array.isArray(rows) ? rows : []) { const k = demandKey(r.make, r.model); m.set(k, (m.get(k) || 0) + 1); }
    return m;
  } catch { return new Map(); }
}
export const groupDemand = (g, demand) => { const c = (g[0] && g[0].r && g[0].r.car) || {}; return demand.get(demandKey(c.make || g[0].r.make, c.model || g[0].r.model)) || 0; };
export const byDemand = (groups, demand) => groups.slice().sort((a, b) => groupDemand(b, demand) - groupDemand(a, demand) || b.length - a.length);

const PAGE = 1000, IDS = 150;
// every page of a query (the table answers 1,000 rows at most), by id, up to cap rows; the query carries no order and no limit
export async function selectPages(env, query, cap) {
  const out = []; let last = 0;
  while (out.length < cap) { const want = Math.min(PAGE, cap - out.length), page = await select(env, `${query}&id=gt.${last}&order=id.asc&limit=${want}`); out.push(...page); if (page.length < want) break; last = page[page.length - 1].id; }
  return out;
}
async function patchIds(env, ids, body) { for (let i = 0; i < ids.length; i += IDS) { const r = await fetch(`${env.supabaseUrl}/rest/v1/for_sale_listings?id=in.(${ids.slice(i, i + IDS).join(",")})`, { method: "PATCH", headers: { ...hdr(env), Prefer: "return=minimal" }, body: JSON.stringify(body) }); if (!r.ok) throw new Error(`for_sale_listings patch ${r.status}`); } }
async function countOf(env, query) {
  try { const r = await fetch(`${env.supabaseUrl}/rest/v1/for_sale_listings?${query}&select=id`, { method: "HEAD", headers: { ...hdr(env), Prefer: "count=exact", Range: "0-0" } }); const m = /\/(\d+)$/.exec(r.headers.get("content-range") || ""); return m ? Number(m[1]) : null; } catch { return null; }
}
const RESOLVE_Q = () => `gone=eq.false&hidden=eq.false&or=(resolve_state.is.null,car->>engine_version.neq.${encodeURIComponent(ENGINE_VERSION)})&select=*`;
const READ_Q = stale => `gone=eq.false&resolve_state=eq.resolved&hidden=eq.false&asking_price_usd=gt.0&or=(read.is.null,read->>engine_version.neq.${encodeURIComponent(ENGINE_VERSION)},read->>at.lt.${encodeURIComponent(stale)})&select=*`;
const HIST_Q = () => `gone=eq.false&resolve_state=eq.resolved&hidden=eq.false&vin_norm=not.is.null&select=id,vin_norm,history`;

// ONE PREPARE RUN AT A TIME (so the engine reads of a run are the only ones this job has going: at most three): a row in app_usage_events, no new table. A lease lapses by itself (LEASE_MS), so a run that died never blocks the next.
export const LEASE_EVENT = "forsale_prepare_lease", LEASE_MS = 330000;
export async function takeLease(env) {
  const lease = "fp" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8), h = { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, "Content-Type": "application/json" };
  const row = status => [{ event_type: LEASE_EVENT, route: "pull_for_sale", status, metadata: { lease } }];
  try {
    const w = await fetch(`${env.supabaseUrl}/rest/v1/app_usage_events`, { method: "POST", headers: { ...h, Prefer: "return=minimal" }, body: JSON.stringify(row("running")) }); if (!w.ok) return { ok: false, why: "lease_unwritable" };
    const since = new Date(Date.now() - LEASE_MS).toISOString(), r = await fetch(`${env.supabaseUrl}/rest/v1/app_usage_events?select=id,status,metadata&event_type=eq.${LEASE_EVENT}&created_at=gte.${encodeURIComponent(since)}&order=id.asc&limit=200`, { headers: h });
    const rows = r.ok ? await r.json() : null; if (!Array.isArray(rows)) { await release(env, lease); return { ok: false, why: "lease_unreadable" }; }
    const gone = new Set(rows.filter(x => x && x.status === "released").map(x => x.metadata && x.metadata.lease)), live = rows.filter(x => x && x.status === "running" && !gone.has(x.metadata && x.metadata.lease)), rank = live.findIndex(x => x.metadata && x.metadata.lease === lease);
    if (rank !== 0) { await release(env, lease); return { ok: false, why: rank < 0 ? "lease_unreadable" : "already_running" }; }
    return { ok: true, lease };
  } catch { return { ok: false, why: "lease_unwritable" }; }
}
export async function release(env, lease) { try { await fetch(`${env.supabaseUrl}/rest/v1/app_usage_events`, { method: "POST", headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify([{ event_type: LEASE_EVENT, route: "pull_for_sale", status: "released", metadata: { lease } }]) }); } catch { /* it lapses by itself */ } }

// opts: { budgetMs, concurrency (engine reads at once, at most 3: the standing limit of heavy reads), resolveLimit, readLimit, historyLimit, engine: { specOf, listingMarket, seenBefore } (the check's stand-ins), now, noLease }
export async function prepareForSale(env, opts = {}) {
  let L = null; if (!opts.noLease) { L = await takeLease(env); if (!L.ok) return { skipped: L.why, resolved: 0, unresolved: 0, reads: 0, ms: 0 }; }
  try { return await prepareRun(env, opts); } finally { if (L) await release(env, L.lease); }
}
async function prepareRun(env, opts) {
  const t0 = Date.now(), now = opts.now ? Number(opts.now) : Date.now(), at = new Date(now).toISOString();
  const budget = Math.min(270000, Number(opts.budgetMs) || 200000), left = () => budget - (Date.now() - t0);
  const eng = { specOf, listingMarket, seenBefore, ...(opts.engine || {}) };
  const width = Math.max(1, Math.min(3, Number(opts.concurrency) || 3)), RES_WIDTH = Math.max(1, Math.min(24, Number(opts.resolveWidth) || 16));
  const out = { resolved: 0, unresolved: 0, resolveCalls: 0, resolveFailed: 0, reads: 0, readCalls: 0, readsNotReady: 0, readsFailed: 0, histories: 0, historyNone: 0, left: { toResolve: 0, toRead: 0, toReadGroups: 0, toHistory: 0 }, ms: 0 };
  // 1. THE RESOLVER, ALONE, for every listing that could be served (not gone, not hidden as stale): the engine's own car, or "unresolved" (counted, never served). One call per distinct set of inputs, the answer written to every listing that gave them.
  const todo = await selectPages(env, RESOLVE_Q(), Number(opts.resolveLimit) || 6000);
  const groups = [...groupRows(todo.map(r => { const lr = liveShape(r, false); return { r, lr, facts: listingFacts(lr) }; }), x => resolveKeyOf(x.r, x.facts)).values()];
  out.distinctInputs = groups.length;
  let gi = 0;
  const rWorker = async () => {
    while (gi < groups.length && left() > budget * 0.45) {
      const g = groups[gi++], first = g[0], row = first.r;
      let spec = null; out.resolveCalls++;
      try { spec = await eng.specOf(env, first.lr, first.facts); } catch { spec = undefined; }
      if (spec === undefined) continue;   // the resolver did not answer: tried again next run, never marked unresolved on a timeout
      const ids = g.map(x => x.r.id);
      try {
        if (!spec || !spec.key) { await patchIds(env, ids, { resolve_state: "unresolved", car: null, car_key: null, updated_at: at }); out.unresolved += ids.length; continue; }
        const v = spec.v || {}, car = { name: specQuery(spec, "exact"), make: v.make || null, model: v.parentModel || v.model || null, trim: v.trim || null, year: v.year || row.year || null, generation: spec.generation && (spec.generation.code || spec.generation.label) || null, key: spec.key, engine_version: ENGINE_VERSION, title: row.title, at };
        await patchIds(env, ids, { resolve_state: "resolved", car, car_key: spec.key, make: car.make || row.make, model: car.model || row.model, updated_at: at }); out.resolved += ids.length;
      } catch { out.resolveFailed++; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(RES_WIDTH, groups.length) }, rWorker));
  // 2. THE READS: ONE engine read per distinct car (car key) and mileage band among the servable resolved listings whose read is missing, from another engine version or older than READ_MAX_AGE_MS; `width` reads at once
  //    (the standing limit of three heavy reads); the read is stamped onto every listing of the group. The biggest groups first (most listings served per read).
  const stale = new Date(now - READ_MAX_AGE_MS).toISOString();
  const rows = (await selectPages(env, READ_Q(stale), Number(opts.readLimit) || 6000)).filter(r => !(r.read && r.read.engine_version === ENGINE_VERSION && r.read.at >= stale));
  const rgAll = [...groupRows(rows.map(r => { const lr = liveShape(r, false); return { r, lr, facts: listingFacts(lr) }; }), x => readKeyOf(x.r, x.facts)).values()];
  const demand = opts.demand instanceof Map ? opts.demand : rgAll.length > 1 ? await demandOf(env, now) : new Map();
  const rg = byDemand(rgAll, demand); out.demandSearches = [...demand.values()].reduce((a, b) => a + b, 0);
  out.started = rg.slice(0, 20).map(g => ({ car: (g[0].r.car && g[0].r.car.name) || null, listings: g.length, searches: groupDemand(g, demand) }));   // the top of the queue, counts and the engine's own car name
  out.readGroups = rg.length; let ri = 0;
  const worker = async () => {
    while (ri < rg.length && left() > Math.min(8000, budget * 0.15)) {
      const g = rg[ri++], first = g[0];
      try {
        out.readCalls++;
        const m = await eng.listingMarket(env, first.lr, first.facts, { deadlineAt: Date.now() + Math.min(90000, Math.max(5000, left() - 3000)) });
        const read = readOf(m, at);
        if (!read) { out.readsNotReady += g.length; continue; }
        await patchIds(env, g.map(x => x.r.id), { read, updated_at: at }); out.reads += g.length;
      } catch { out.readsFailed += g.length; }
    }
  };
  await Promise.all(Array.from({ length: width }, worker));
  // 3. THE CAR'S EARLIER RECORD by VIN (a full VIN only: a short chassis number is not looked up across houses by guess), the same VIN once, stamped on every listing that carries it
  const hs = (await selectPages(env, HIST_Q(), Number(opts.historyLimit) || 3000)).filter(r => isFullVin(r.vin_norm) && !(r.history && r.history.at >= stale));
  const byVin = [...groupRows(hs, r => r.vin_norm).values()]; let vi = 0;
  const hWorker = async () => { while (vi < byVin.length && left() > Math.min(3000, budget * 0.05)) {
    const g = byVin[vi++];
    try { const h = historyOf(await eng.seenBefore(env, g[0].vin_norm), at); await patchIds(env, g.map(r => r.id), { history: h, updated_at: at }); out.histories += g.length; if (h.none) out.historyNone += g.length; } catch { /* tried again next run */ }
  } };
  await Promise.all(Array.from({ length: Math.min(12, byVin.length) }, hWorker));
  // WHAT IS LEFT, counted from the table (the next run's work), not guessed
  const [a, b, c] = await Promise.all([countOf(env, RESOLVE_Q()), countOf(env, READ_Q(stale)), Promise.resolve(Math.max(0, byVin.length - vi))]);
  out.left = { toResolve: a, toRead: b, toReadGroups: Math.max(0, rg.length - ri), toHistory: c };
  out.ms = Date.now() - t0;
  return out;
}
