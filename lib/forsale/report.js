// FOR SALE: THE REPORT'S COUNTS (Lane D, lane-d-forsale-prepare, Nov 19 2026). Read only, zero vendor queries, counts only (no listing text, no seller).
//  sourceSplit: for EVERY source the table knows (data/forsaleSources.json, held ones too): held, live, resolved, unresolved, not_tried, hidden, gone, with_read and how many have a VIN history match; plus the totals. One count per cell, never a row read.
//  catchUp (opt in, ?cars=1, pages the table): the arithmetic of the prepare job from the table itself: distinct resolver inputs still to resolve, distinct cars and car by mileage band groups among the resolved, how many of those still need their read, and the listings each group covers.
import { SOURCE_TABLE } from "./rules.js";
import { ENGINE_VERSION } from "../onebox.js";
import { selectPages, groupRows, resolveKeyOf, readKeyOf, READ_MAX_AGE_MS } from "./prepare.js";
import { liveShape, onePerCar } from "./rules.js";
import { listingFacts } from "../live/search.js";
import { placeholderFilter } from "../placeholderMiles.js";

const hdr = env => ({ apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}` });
export async function countOf(env, f) {
  try { const r = await fetch(`${env.supabaseUrl}/rest/v1/for_sale_listings?${f}&select=id`, { method: "HEAD", headers: { ...hdr(env), Prefer: "count=exact", Range: "0-0" } }); const m = /\/(\d+)$/.exec(r.headers.get("content-range") || ""); return m ? Number(m[1]) : null; } catch { return null; }
}
export const CELLS = {
  live: "gone=eq.false", resolved: "gone=eq.false&resolve_state=eq.resolved", unresolved: "gone=eq.false&resolve_state=eq.unresolved", not_tried: "gone=eq.false&resolve_state=is.null",
  hidden: "gone=eq.false&hidden=eq.true", gone: "gone=eq.true", with_read: "gone=eq.false&read=not.is.null", vin_history_match: "gone=eq.false&history->>none=eq.false"
};
const sum = (a, b) => a == null || b == null ? null : a + b;
export async function sourceSplit(env, opts = {}) {
  const names = Object.keys(SOURCE_TABLE), cells = Object.keys(CELLS), out = {}, jobs = [];
  for (const s of names) { out[s] = { held: !!SOURCE_TABLE[s].hold, type: SOURCE_TABLE[s].type || null }; for (const c of cells) jobs.push([s, c]); }
  let i = 0; const worker = async () => { while (i < jobs.length) { const [s, c] = jobs[i++]; out[s][c] = await (opts.count || countOf)(env, `source=eq.${encodeURIComponent(s)}&${CELLS[c]}`); } };
  await Promise.all(Array.from({ length: 8 }, worker));
  const total = { held_sources: names.filter(s => out[s].held).length, sources: names.length };
  for (const c of cells) total[c] = names.reduce((a, s) => sum(a, out[s][c]), 0);
  return { bySource: out, total };
}
export async function catchUp(env, opts = {}) {
  const now = opts.now || Date.now(), stale = new Date(now - READ_MAX_AGE_MS).toISOString(), cap = Number(opts.cap) || 80000, pairOf = r => { const lr = liveShape(r, false); return { r, facts: listingFacts(lr) }; };
  const todo = (await selectPages(env, `gone=eq.false&hidden=eq.false&or=(resolve_state.is.null,car->>engine_version.neq.${encodeURIComponent(ENGINE_VERSION)})&select=*`, cap)).map(pairOf);
  const inputs = groupRows(todo, x => resolveKeyOf(x.r, x.facts));
  const res = (await selectPages(env, `gone=eq.false&hidden=eq.false&resolve_state=eq.resolved&asking_price_usd=gt.0&select=*`, cap)).map(pairOf);
  const cars = new Set(res.map(x => x.r.car_key || (x.r.car && x.r.car.key))), groups = groupRows(res, x => readKeyOf(x.r, x.facts));
  const pending = [...groups.values()].filter(g => g.some(x => !(x.r.read && x.r.read.engine_version === ENGINE_VERSION && x.r.read.at >= stale)));
  return { listings_to_resolve: todo.length, distinct_resolver_inputs: inputs.size, resolved_listings: res.length, distinct_cars: cars.size, read_groups: groups.size, read_groups_pending: pending.length, listings_in_pending_groups: pending.reduce((a, g) => a + g.length, 0), listings_per_group_avg: groups.size ? Math.round(res.length / groups.size * 10) / 10 : null };
}

// THE FILLER MILEAGE SWEEP (Lane D, lane-d-placeholder-miles, Nov 19 2026): per source, how many live rows carry a mileage that is no mileage (lib/placeholderMiles.js: 999,999 and its variants, 0, 1, runs of one digit, 12345, 123456, above 500,000). Read only; counts, never a row.
export async function milesSweep(env, opts = {}) {
  const names = Object.keys(SOURCE_TABLE), out = {}; let total = 0, i = 0;
  const worker = async () => { while (i < names.length) { const s = names[i++]; const n = await (opts.count || countOf)(env, `source=eq.${encodeURIComponent(s)}&gone=eq.false&${placeholderFilter()}`); out[s] = n; total += Number(n) || 0; } };
  await Promise.all(Array.from({ length: 3 }, worker));
  return { total, bySource: out };
}
// THE REQUEUE: every row (live or not) that carries a filler mileage has the mileage cleared (the filler is stored as no mileage) and its read and its read time cleared, so the prepare job reads it again as the car with no stated mileage. One source at a time. Returns the rows changed per source.
export async function requeueMiles(env, opts = {}) {
  const names = Object.keys(SOURCE_TABLE), out = {}; let total = 0;
  for (const s of names) {
    const r = await (opts.fetch || fetch)(`${env.supabaseUrl}/rest/v1/for_sale_listings?source=eq.${encodeURIComponent(s)}&${placeholderFilter()}`, { method: "PATCH", headers: { ...hdr(env), "Content-Type": "application/json", Prefer: "count=exact,return=minimal" }, body: JSON.stringify({ mileage: null, read: null, updated_at: new Date().toISOString() }) });
    if (!r.ok) throw new Error(`for_sale_listings requeue ${s} ${r.status}`);
    const m = /\/(\d+)$/.exec(r.headers.get("content-range") || ""); out[s] = m ? Number(m[1]) : 0; total += out[s];
  }
  return { total, bySource: out };
}

// ONE CARD PER CAR, THE SWEEP (Lane D, Nov 20 2026): over the rows that would be served (live, not hidden, resolved, priced), the cars shown twice before the rule: how many are dropped as a twin, by the pair of sources (kept | dropped) and by how it was known (a full VIN, or the match of year, make, model, mileage and asking price).
// Counts only. No listing text, no seller, no VIN.
export async function twinSweep(env, opts = {}) {
  const rows = await (opts.pages || selectPages)(env, "gone=eq.false&hidden=eq.false&resolve_state=eq.resolved&asking_price_usd=gt.0&select=id,source,source_type,vin_norm,year,make,model,mileage,asking_price_usd,state,last_seen", Number(opts.cap) || 80000);
  const one = onePerCar(rows), byPair = {}, byMethod = {};
  for (const p of one.pairs) { const k = `${p.kept.source_type}:${p.kept.source} kept | ${p.dropped.source_type}:${p.dropped.source} dropped`; byPair[k] = (byPair[k] || 0) + 1; byMethod[p.by] = (byMethod[p.by] || 0) + 1; }
  return { compared: rows.length, shown_after_rule: one.rows.length, twins: one.droppedAsTwin, share_of_compared: rows.length ? Math.round(1000 * one.droppedAsTwin / rows.length) / 10 : 0, byMethod, byPair };
}
// LAST SEEN: the live rows the vendor last saw more than 24 hours ago, per source: all of them, how many are not hidden (the stale poll hides what it has seen go quiet), and how many of those would be served (resolved and priced). A source whose polls lapsed is not served at all (the report's sync block says which).
export async function lastSeenSweep(env, opts = {}) {
  const now = opts.now || Date.now(), cut = encodeURIComponent(new Date(now - 24 * 3600e3).toISOString()), names = Object.keys(SOURCE_TABLE), out = {}; let i = 0;
  const worker = async () => { while (i < names.length) { const s = names[i++], base = `source=eq.${encodeURIComponent(s)}&gone=eq.false`, c = opts.count || countOf; out[s] = { live: await c(env, base), over_24h: await c(env, `${base}&last_seen=lt.${cut}`), over_24h_not_hidden: await c(env, `${base}&hidden=eq.false&last_seen=lt.${cut}`), over_24h_servable: await c(env, `${base}&hidden=eq.false&resolve_state=eq.resolved&asking_price_usd=gt.0&last_seen=lt.${cut}`), no_last_seen: await c(env, `${base}&last_seen=is.null`) }; } };
  await Promise.all(Array.from({ length: 3 }, worker));
  const total = {}; for (const k of ["live", "over_24h", "over_24h_not_hidden", "over_24h_servable", "no_last_seen"]) total[k] = names.reduce((a, s) => sum(a, out[s][k]), 0);
  return { total, bySource: out };
}
