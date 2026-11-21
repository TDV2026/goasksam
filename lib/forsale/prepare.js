// FOR SALE: THE READ IS MADE READY AHEAD OF TIME (Lane D, lane-d-forsale, Nov 2026). api/pullForSale.js?mode=prepare, a scheduled job, never a visitor's request.
// A card never triggers an engine run: this job gives every stored listing (1) the engine's resolved car (the same resolver Find's own cards use, specOf), (2) the engine's read of that car (the same
// listingMarket call a Find card makes, cold compute allowed HERE and stored in spec_market_cache like every other spec), and (3) the car's earlier record by VIN (seenBefore). All three are stored on the row.
// A request then only reads the row. A listing whose read is not ready is not served (read_pending, counted) until the next run makes it ready; it never waits, never computes.
import { specOf, listingFacts, listingMarket, seenBefore, soldLine, specQuery } from "../live/search.js";
import { ENGINE_VERSION } from "../onebox.js";
import { reasonLine } from "../reasonWords.js";
import { statedMiles } from "../placeholderMiles.js";
import { supabaseSelectAll } from "../_supabase.js";
import { liveShape, isFullVin, SOURCE_TABLE } from "./rules.js";
import { BUDGET } from "./budget.js";
import { nightlyLeaseHeld } from "../nightlyLease.js";

const hdr = env => ({ apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, "Content-Type": "application/json" });
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
// A DEALER OR CLASSIFIED READ LIVES 7 DAYS (data/forsaleBudget.json prepare.read_age_hours, 168: Sam, Nov 20 2026; it was 12 hours, which at the catch up's pace left the reads made first stale before the last were made). It is made again earlier only when the listing's asking price changes (lib/forsale/sync.js clears the read of a repriced listing).
export const readAgeMs = (cfg = BUDGET) => { const h = Number(cfg && cfg.prepare && cfg.prepare.read_age_hours); return (h > 0 ? h : 168) * 3600e3; };
export const READ_MAX_AGE_MS = readAgeMs();

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
// THE VIN STAMP'S QUEUE (Lane D, Nov 20 2026): the served rows whose earlier record has not been looked up (history null), whose lookup is older than the read age, or that were marked "no VIN" and now carry one. A row already stamped is NOT in it: the old queue took the first 3,000 rows with a VIN by id, stamped or not,
// so 985 stamped rows and the short chassis numbers (never stamped, never marked) filled the window for good and nothing after them was ever looked at. withVin: rows that carry a VIN (full or short) first; the others only when none is left.
const HIST_Q = (stale, withVin = true) => `gone=eq.false&resolve_state=eq.resolved&hidden=eq.false&vin_norm=${withVin ? "not.is.null" : "is.null"}&or=(history.is.null,history->>at.lt.${encodeURIComponent(stale)}${withVin ? ",and(history->>why.eq.no_vin,vin_norm.not.is.null)" : ""})&select=id,vin_norm,history`;

// THE NIGHTLY LEASE AND THE WIDTH (Lane D, Nov 20 2026): while the nightly job holds its lease (lib/nightlyLease.js) this job makes no read; outside it the width is data/forsaleBudget.json prepare.read_width (3), never wider than a call asks. The failure rules are as they stood (past 5 in 100 drop to two; past 20 stop and post).
export function readWidthCap(cfg = BUDGET) { const set = Math.floor(Number(cfg && cfg.prepare && cfg.prepare.read_width)); return Math.max(1, Math.min(3, set >= 1 ? set : 3)); }
// ONE PREPARE RUN AT A TIME (so the engine reads of a run are the only ones this job has going: at most three): a row in app_usage_events, no new table. A lease lapses by itself (LEASE_MS), so a run that died never blocks the next.
export const LEASE_EVENT = "forsale_prepare_lease", LEASE_MS = 330000, HALT_EVENT = "forsale_prepare_halt", HALT_MS = 3600e3;
export async function takeLease(env) {
  const lease = "fp" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8), h = { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, "Content-Type": "application/json" };
  const row = status => [{ event_type: LEASE_EVENT, route: "pull_for_sale", status, metadata: { lease } }];
  try {
    // A RUN THAT STOPPED ON THE FAILURE RULE (over 20 failed archive reads in 100) HOLDS THE JOB FOR AN HOUR: no run reads until a person has looked (DECISION NEEDED is posted by whoever drives the job)
    const hs = await fetch(`${env.supabaseUrl}/rest/v1/app_usage_events?select=id&event_type=eq.${HALT_EVENT}&created_at=gte.${encodeURIComponent(new Date(Date.now() - HALT_MS).toISOString())}&limit=1`, { headers: h }); if (hs.ok) { const hr = await hs.json(); if (Array.isArray(hr) && hr.length) return { ok: false, why: "halted" }; }
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
  const cfg = opts.cfg || BUDGET, nowMs = opts.now ? Number(opts.now) : Date.now();
  if (!opts.noNightlyCheck) { const nl = await nightlyLeaseHeld(env, nowMs); if (nl.held) return { skipped: "nightly_lease", resumeInMs: nl.expiresInMs, unreadable: nl.unreadable === true || undefined, resolved: 0, unresolved: 0, reads: 0, readCalls: 0, ms: 0 }; }
  let L = null; if (!opts.noLease) { L = await takeLease(env); if (!L.ok) return { skipped: L.why, resolved: 0, unresolved: 0, reads: 0, ms: 0 }; }
  try {
    // BACK TO BACK, UNTIL THE LEASE ENDS (Sam, Nov 20 2026): the run keeps making passes (resolve what is new, read the next groups, the earlier records) until its time is used, not one batch; the reads stay at three at once. The run is 270 s of the 330 s lease. The failure rules ride across the passes (one shared window).
    const t0 = Date.now(), total = Math.min(LEASE_MS - 60000, Number(opts.budgetMs) || LEASE_MS - 60000 ), cap = readWidthCap(cfg), state = { width: Math.max(1, Math.min(cap, Number(opts.concurrency) || cap)), calls: 0, fails: 0, halted: null, lowered: null, tried: new Set() };
    if (opts.stampOnly) {   // THE STAMP ALONE (GET ?mode=prepare&stamp=1): no resolver and no engine read; batch after batch of up to STAMP_VINS VINs until nothing is left to look at, the time is used, the nightly starts or a batch fails. One call at a time (the prepare lease), outside the nightly lease.
      const at = new Date(nowMs).toISOString(), stale = new Date(nowMs - (Number(opts.readAgeMs) > 0 ? Number(opts.readAgeMs) : READ_MAX_AGE_MS)).toISOString(), eng = { seenMany, ...(opts.engine || {}) };
      const sum = { stampOnly: true, resolved: 0, unresolved: 0, reads: 0, readCalls: 0, histories: 0, historyNone: 0, stampedMatched: 0, stampedNoVin: 0, stampBatches: 0, stampFailed: 0, passes: 0 };
      for (;;) {
        if (!opts.noNightlyCheck && sum.passes > 0) { const nl2 = await nightlyLeaseHeld(env); if (nl2.held) { sum.stoppedFor = "nightly_lease"; break; } }
        const sp = await stampPass(env, { at, stale, eng, vins: Number(opts.stampVins) || STAMP_VINS, rowCap: Number(opts.historyLimit) || STAMP_ROWS, left: () => total - (Date.now() - t0) }); sum.passes++;
        for (const k of Object.keys(sp)) sum[k] += sp[k];
        if (sp.stampFailed || sp.histories === 0 || total - (Date.now() - t0) < 15000) break;
      }
      const [toHistory, toMarkNoVin] = await Promise.all([countOf(env, HIST_Q(stale, true)), countOf(env, HIST_Q(stale, false))]);
      sum.left = { toResolve: null, toRead: null, toReadGroups: null, toHistory, toMarkNoVin }; sum.ms = Date.now() - t0; return sum;
    }
    let acc = null, passes = 0, stoppedFor = null;
    for (;;) {
      if (passes > 0 && !opts.noNightlyCheck) { const nl2 = await nightlyLeaseHeld(env); if (nl2.held) { stoppedFor = "nightly_lease"; break; } }   // the nightly started while this run was going: no more reads
      const remaining = total - (Date.now() - t0), o = await prepareRun(env, { ...opts, budgetMs: remaining, _state: state }); passes++;
      acc = acc ? mergeRuns(acc, o) : o;
      const did = (o.resolveCalls || 0) + (o.readCalls || 0) + (o.histories || 0) > 0, more = (o.left.toResolve || 0) + (o.left.toRead || 0) > 0;
      if (opts.onePass || state.halted || !did || !more || total - (Date.now() - t0) < 30000) break;
    }
    if (stoppedFor) acc.stoppedFor = stoppedFor;
    acc.passes = passes; acc.ms = Date.now() - t0; acc.readWidth = state.width;
    if (state.lowered) acc.widthLowered = state.lowered;
    if (state.halted) { acc.halted = state.halted; acc.decisionNeeded = true; await fetch(`${env.supabaseUrl}/rest/v1/app_usage_events`, { method: "POST", headers: { ...hdr(env), Prefer: "return=minimal" }, body: JSON.stringify([{ event_type: HALT_EVENT, route: "pull_for_sale", status: "halted", metadata: state.halted }]) }).catch(() => {}); }
    return acc;
  } finally { if (L) await release(env, L.lease); }
}
const SUMMED = ["resolved", "unresolved", "resolveCalls", "resolveFailed", "reads", "readCalls", "readsNotReady", "readsFailed", "readGroupsFailed", "histories", "historyNone", "stampedMatched", "stampedNoVin", "stampBatches", "stampFailed"];
function mergeRuns(a, b) { const o = { ...b, started: a.started && a.started.length ? a.started : b.started }; for (const k of SUMMED) o[k] = (a[k] || 0) + (b[k] || 0); return o; }
// THE READ WINDOW (Lane D, Nov 20 2026): the listings the read queue looks at. It used to be the first 6,000 pending rows by id, so a source whose rows came late (duPont Registry, Barn Finds: 13,575 cards) was never in the window while an earlier source still had pending rows
// and got no read at all, however much its cars were searched. Now every live source gets its own window (the first READ_PER_SOURCE pending rows of that source, three sources at a time), and the windows are joined in id order; the demand order then runs over all of them.
export const READ_PER_SOURCE = 3000;
export async function readWindow(env, stale, limit) {
  const names = Object.keys(SOURCE_TABLE).filter(s => !SOURCE_TABLE[s].hold), per = Math.min(limit, READ_PER_SOURCE), parts = []; let i = 0;
  const worker = async () => { while (i < names.length) { const s = names[i++]; parts.push(...await selectPages(env, `source=eq.${encodeURIComponent(s)}&${READ_Q(stale)}`, per)); } };
  await Promise.all(Array.from({ length: 3 }, worker));
  return parts.sort((a, b) => a.id - b.id);
}

// THE VIN STAMP (Lane D, Nov 20 2026). A served row carries history: the earlier record of its VIN as a finished line, or none. What stamps a row: this pass, nothing else. It looks up a batch of VINs at once (up to STAMP_VINS, the vinoverlap task's own limit) and stamps every row that carries each VIN.
//   VIN first: the queue takes rows that carry a VIN, and only when none is left the rows that carry none, which are MARKED looked at (history none, why no_vin; a short chassis number why short_id) and not looked up: short numbers repeat across makes and years, so a lookup would join two cars. A marked row is not in the queue
//   again until the read age (7 days) or until it carries a VIN, so a row with no VIN is never retried in a loop.
//   THE LOOKUP: vin_index first (de-duplicated, polluted VINs removed: the same record seenBefore reads), then, for the VINs it does not hold, the archive through lib/ops/vinOverlap.js (the vinoverlap task's own reads, chunked, newest sale and newest attempt); the later of the two is the earlier record, as in seenBefore.
//   A read that fails stamps NOTHING for the batch (never a "none" on a failed read: that would say "new to us" about a car we may hold); the next pass asks again.
export const STAMP_VINS = 2000, STAMP_ROWS = 6000;
export async function seenMany(env, vins, deps = {}) {
  const read = deps.read || (async path => { const r = await fetch(`${env.supabaseUrl}/rest/v1/${path}`, { headers: hdr(env) }); return r.ok ? r.json() : null; });
  const out = new Map(), n = v => { const y = Number(v); return Number.isFinite(y) && y > 0 ? Math.round(y) : null; };
  const missing = [];
  for (let i = 0; i < vins.length; i += 150) {
    const chunk = vins.slice(i, i + 150), rows = await read(`vin_index?vin_norm=in.(${chunk.map(v => `"${v}"`).join(",")})&select=vin_norm,appearance_date,source,result,price_usd,mileage&order=appearance_date.desc.nullslast&limit=${chunk.length * 6}`);
    if (!Array.isArray(rows)) throw new Error("vin_index read failed");
    for (const x of rows) if (!out.has(x.vin_norm)) out.set(x.vin_norm, { result: x.result === "sold" ? "sold" : "unsold", date: String(x.appearance_date || "").slice(0, 10), priceUsd: n(x.price_usd), via: "vin_index" });
  }
  for (const v of vins) if (!out.has(v)) missing.push(v);
  if (missing.length) {
    const { runVinOverlap } = await import("../ops/vinOverlap.js");
    const o = await runVinOverlap({ vins: missing }, read);
    if (o.status !== 200) throw new Error("vinoverlap read failed");
    o.json.rows.forEach((x, i) => {
      const sd = x.lastSaleDate || "", ad = x.lastAttemptDate || "";
      if (x.lastSaleDate && (!x.lastAttemptDate || sd >= ad)) out.set(missing[i], { result: "sold", date: sd, priceUsd: x.lastSalePriceUsd, via: "archive" });
      else if (x.lastAttemptDate) out.set(missing[i], { result: "unsold", date: ad, priceUsd: x.lastHighBidUsd, via: "archive" });
    });
  }
  return out;
}
export async function stampPass(env, { at, stale, eng, vins = STAMP_VINS, rowCap = STAMP_ROWS, left = () => 1e9 }) {
  const out = { histories: 0, historyNone: 0, stampedMatched: 0, stampedNoVin: 0, stampBatches: 0, stampFailed: 0 };
  if (left() < 8000) return out;
  let rows = await selectPages(env, HIST_Q(stale, true), rowCap);
  if (!rows.length) {
    rows = await selectPages(env, HIST_Q(stale, false), rowCap);
    const ids = rows.map(r => r.id); if (ids.length) { await patchIds(env, ids, { history: { none: true, why: "no_vin", at }, updated_at: at }); out.stampedNoVin += ids.length; out.histories += ids.length; out.historyNone += ids.length; }
    return out;
  }
  const full = rows.filter(r => isFullVin(r.vin_norm)), short = rows.filter(r => !isFullVin(r.vin_norm));
  if (short.length) { await patchIds(env, short.map(r => r.id), { history: { none: true, why: "short_id", at }, updated_at: at }); out.stampedNoVin += short.length; out.histories += short.length; out.historyNone += short.length; }
  const byVin = groupRows(full, r => r.vin_norm), keys = [...byVin.keys()].slice(0, vins);
  if (!keys.length) return out;
  try {
    const seen = await (eng.seenMany || (async (e, v) => seenMany(e, v)))(env, keys); out.stampBatches++;
    const noneIds = [];
    for (const k of keys) {
      const g = byVin.get(k), h = historyOf(seen.get(k) || null, at);
      if (h.none) { noneIds.push(...g.map(r => r.id)); continue; }
      await patchIds(env, g.map(r => r.id), { history: h, updated_at: at }); out.histories += g.length; out.stampedMatched += g.length;
    }
    if (noneIds.length) { await patchIds(env, noneIds, { history: { none: true, at }, updated_at: at }); out.histories += noneIds.length; out.historyNone += noneIds.length; }
  } catch { out.stampFailed++; }
  return out;
}

async function prepareRun(env, opts) {
  const t0 = Date.now(), now = opts.now ? Number(opts.now) : Date.now(), at = new Date(now).toISOString();
  const budget = Math.min(270000, Number(opts.budgetMs) || 200000), left = () => budget - (Date.now() - t0);
  const eng = { specOf, listingMarket, seenBefore, ...(opts.engine || {}) };
  const st = opts._state || { width: Math.max(1, Math.min(readWidthCap(opts.cfg || BUDGET), Number(opts.concurrency) || readWidthCap(opts.cfg || BUDGET))), calls: 0, fails: 0, halted: null, lowered: null, tried: new Set() }, width = st.width, RES_WIDTH = Math.max(1, Math.min(24, Number(opts.resolveWidth) || 16));
  const out = { resolved: 0, unresolved: 0, resolveCalls: 0, resolveFailed: 0, reads: 0, readCalls: 0, readsNotReady: 0, readsFailed: 0, readGroupsFailed: 0, histories: 0, historyNone: 0, left: { toResolve: 0, toRead: 0, toReadGroups: 0, toHistory: 0 }, ms: 0 };
  // 1. THE RESOLVER, ALONE, for every listing that could be served (not gone, not hidden as stale): the engine's own car, or "unresolved" (counted, never served). One call per distinct set of inputs, the answer written to every listing that gave them.
  const todo = await selectPages(env, RESOLVE_Q(), Number(opts.resolveLimit) || 6000);
  const groups = [...groupRows(todo.map(r => { const lr = liveShape(r, false); return { r, lr, facts: listingFacts(lr) }; }), x => resolveKeyOf(x.r, x.facts)).entries()].filter(([k]) => !st.tried.has("r|" + k)).map(([k, g]) => (st.tried.add("r|" + k), g));   // a group tried in an earlier pass of this run (a resolver that did not answer) is left for the next run
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
  const stale = new Date(now - (Number(opts.readAgeMs) > 0 ? Number(opts.readAgeMs) : READ_MAX_AGE_MS)).toISOString();
  // 1b. THE EARLIER RECORD, before the reads: rows with a VIN first, up to STAMP_VINS VINs a pass (one batch, one call at a time: the pass runs inside the prepare lease)
  { const sp = await stampPass(env, { at, stale, eng, vins: Number(opts.stampVins) || STAMP_VINS, rowCap: Number(opts.historyLimit) || STAMP_ROWS, left: () => left() }); for (const k of Object.keys(sp)) out[k] = (out[k] || 0) + sp[k]; }
  const rows = (await readWindow(env, stale, Number(opts.readLimit) || 6000)).filter(r => !(r.read && r.read.engine_version === ENGINE_VERSION && r.read.at >= stale));
  const rgAll = [...groupRows(rows.map(r => { const lr = liveShape(r, false); return { r, lr, facts: listingFacts(lr) }; }), x => readKeyOf(x.r, x.facts)).entries()].filter(([k]) => !st.tried.has("d|" + k)).map(([k, g]) => (st.tried.add("d|" + k), g));   // a group tried in an earlier pass of this run (not ready, failed) is left for the next run: the engine's compute continues behind it
  const demand = opts.demand instanceof Map ? opts.demand : rgAll.length > 1 ? await demandOf(env, now) : new Map();
  const rg = byDemand(rgAll, demand); out.demandSearches = [...demand.values()].reduce((a, b) => a + b, 0);
  out.started = rg.slice(0, 20).map(g => ({ car: (g[0].r.car && g[0].r.car.name) || null, listings: g.length, searches: groupDemand(g, demand) }));   // the top of the queue, counts and the engine's own car name
  out.readGroups = rg.length; let ri = 0;
  const worker = async wi => {
    while (ri < rg.length && !st.halted && wi < st.width && left() > Math.min(8000, budget * 0.15)) {
      const g = rg[ri++], first = g[0];
      try {
        out.readCalls++;
        const m = await eng.listingMarket(env, first.lr, first.facts, { deadlineAt: Date.now() + Math.min(90000, Math.max(5000, left() - 3000)) });
        const read = readOf(m, at);
        if (!read) { out.readsNotReady += g.length; continue; }
        await patchIds(env, g.map(x => x.r.id), { read, updated_at: at }); out.reads += g.length;
      } catch { out.readsFailed += g.length; out.readGroupsFailed++; st.fails++; }
      // THE FAILURE RULES, per 100 reads: over 5 failed drops to two at once, over 20 stops the run and holds the job (DECISION NEEDED)
      if (++st.calls >= 100) { const f = st.fails; st.calls = 0; st.fails = 0; if (f > 20) st.halted = { failed: f, of: 100, rule: "over 20 in 100" }; else if (f > 5 && st.width > 2) { st.width = 2; st.lowered = { failed: f, of: 100, rule: "over 5 in 100" }; } }
    }
  };
  await Promise.all(Array.from({ length: width }, (_, i) => worker(i)));
  // 3. (the earlier record is stamped by stampPass, in every pass before the reads: a stamp is a few seconds, the reads use the whole call)
  // WHAT IS LEFT, counted from the table (the next run's work), not guessed
  const [a, b, c] = await Promise.all([countOf(env, RESOLVE_Q()), countOf(env, READ_Q(stale)), countOf(env, HIST_Q(stale, true)), ]);
  const noVinLeft = await countOf(env, HIST_Q(stale, false));
  out.left = { toResolve: a, toRead: b, toReadGroups: Math.max(0, rg.length - ri), toHistory: c, toMarkNoVin: noVinLeft };
  out.ms = Date.now() - t0;
  return out;
}
