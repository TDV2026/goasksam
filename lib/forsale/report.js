// FOR SALE: THE REPORT'S COUNTS (Lane D, lane-d-forsale-prepare, Nov 19 2026). Read only, zero vendor queries, counts only (no listing text, no seller).
//  sourceSplit: for EVERY source the table knows (data/forsaleSources.json, held ones too): held, live, resolved, unresolved, not_tried, hidden, gone, with_read and how many have a VIN history match; plus the totals. One count per cell, never a row read.
//  catchUp (opt in, ?cars=1, pages the table): the arithmetic of the prepare job from the table itself: distinct resolver inputs still to resolve, distinct cars and car by mileage band groups among the resolved, how many of those still need their read, and the listings each group covers.
import { SOURCE_TABLE } from "./rules.js";
import { ENGINE_VERSION } from "../onebox.js";
import { selectPages, groupRows, resolveKeyOf, readKeyOf, READ_MAX_AGE_MS } from "./prepare.js";
import { liveShape } from "./rules.js";
import { listingFacts } from "../live/search.js";

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
