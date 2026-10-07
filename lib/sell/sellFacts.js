// /sell facts (Lane C, Oct 2026): everything the Sell conversation and page show, computed from the One
// Box engine's own spec pool (buildSpec + fetchQualifying + isQualifying), so Sell reads the same
// numbers as One Box and the spec pages and inherits every engine fix. Archive-only, zero OldCarsData.
//   resolveSellCar(text)   the car + what the seller typed (miles, gearbox, body, colour, state, intent)
//   placesFor(car)         venues ranked by this spec's record: sales, sold-through, middle half, last
//                          sale, next sale + consignment close for houses; the pick
//   tilesFor(car, pick)    reserve / day ending / season, each only past its thin rule, cohort named
//   recentSales(car)       the three latest sales of the spec (cards)
//   powersellersFor(car)   active partners matched on make + region, numbers only when computed
import { resolveVehicle, sanitizeResolvedVehicle } from "../vehicle.js";
import { findGeneration } from "../generations.js";
import { buildSpec, fetchQualifying, isQualifying, __specEngine } from "../onebox.js";
import { supabaseSelect, supabaseSelectAll } from "../_supabase.js";
import { sourceSlugOf, isHouseSource } from "../_houseComps.js";
import { nextSaleForHouse, HOUSE_CALENDAR } from "../houseCalendar.js";
import { computePartnerCareerStats } from "../marketStats.js";
import { houseName } from "../../api/_historyData.js";
const { gearboxType, hammerUsd, percentile, roundFloor, roundCeil, DISPLAY_FLOOR } = __specEngine;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const STATES = ["Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming"];
const BODY_WORDS = /\b(coupe|coupé|cabriolet|convertible|targa|roadster|sedan|wagon)\b/i;
const iso = days => new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
const usd = n => (n == null || !Number.isFinite(Number(n)) ? null : "$" + Math.round(Number(n)).toLocaleString("en-US"));
const monthYear = d => { const m = /^(\d{4})-(\d{2})/.exec(String(d || "")); return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : ""; };

// ---------------------------------------------------------------- the seller's words
export function parseSellerText(text) {
  const t = String(text || "");
  const out = {};
  const mi = /\b(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?\s*k|\d{3,6})\s*(?:-|\s)?(?:miles?|mi\b|k miles)/i.exec(t);
  if (mi) { let x = mi[1].toLowerCase().replace(/,/g, ""); out.miles = /k$/.test(x.trim()) ? Math.round(parseFloat(x) * 1000) : Number(x); }
  if (/\b(manual|stick|\d-speed manual|six-speed|five-speed|6-speed|5-speed|4-speed)\b/i.test(t) && !/\bautomatic\b/i.test(t)) out.gearbox = "manual";
  else if (/\b(automatic|auto|tiptronic|pdk|dct|smg)\b/i.test(t)) out.gearbox = "auto";
  const b = BODY_WORDS.exec(t); if (b) out.body = b[1].toLowerCase().replace("coupé", "coupe");
  const st = STATES.find(s => new RegExp("\\b" + s + "\\b", "i").test(t)); if (st) out.state = st;
  if (/\b(handle it|handled|someone (?:to )?(?:handle|sell)|do it for me|powerseller|consign(?:or)?|white[- ]glove)\b/i.test(t)) out.intent = "handled";
  else if (/\b(myself|sell it myself|on my own|diy)\b/i.test(t)) out.intent = "self";
  const vin = /\b([A-HJ-NPR-Z0-9]{17})\b/.exec(t.toUpperCase()); if (vin && /\d/.test(vin[1]) && /[A-Z]/.test(vin[1])) out.vin = vin[1];
  const url = /https?:\/\/\S+/i.exec(t); if (url) out.url = url[0].replace(/[).,]+$/, "");
  const ask = /\$\s?(\d[\d,]*)(k)?\b|\b(\d{2,3})k\b/i.exec(t.replace(BODY_WORDS, ""));
  if (ask && /\b(want|hoping|asking|ask|get|price)\b/i.test(t)) out.ask = ask[1] ? Number(ask[1].replace(/,/g, "")) * (ask[2] ? 1000 : 1) : Number(ask[3]) * 1000;
  return out;
}
// The car the seller named. A body word the resolver mistook for the model ("CLK DTM cabriolet" ->
// model "Cabriolet") is stripped and kept as the body; location and the seller's other words are
// removed first so they can't reach the resolver.
export async function resolveSellCar(text) {
  const said = parseSellerText(text);
  let carText = String(text || "").replace(/https?:\/\/\S+/g, " ");
  for (const s of STATES) carText = carText.replace(new RegExp("\\b(?:in\\s+)?" + s + "\\b", "ig"), " ");
  carText = carText.replace(/\b(?:with\s+)?\d[\d,.]*\s*k?\s*(?:miles?|mi)\b/ig, " ").replace(/\b(?:want|i want|looking for|would like)\b.*$/i, " ").replace(/[,;]+/g, " ").replace(/\s{2,}/g, " ").trim();
  const go = async t => { const r = await resolveVehicle(t).catch(() => null); return r && r.vehicle ? (sanitizeResolvedVehicle(r.vehicle) || r.vehicle) : null; };
  let v = await go(carText);
  if (v && BODY_WORDS.test(String(v.model || ""))) { const v2 = await go(carText.replace(BODY_WORDS, " ").replace(/\s{2,}/g, " ")); if (v2 && v2.model) v = v2; }
  if (!v || !v.make || !v.model) return { car: null, said };
  if (said.body && !v.bodyStyle) v.bodyStyle = said.body;
  if (said.miles) v.mileage = said.miles;
  v.raw = carText;
  const generation = await findGeneration(v, null).catch(() => null);
  return { car: { v, generation, label: [v.year, v.make, v.model, v.trim, v.bodyStyle].filter(Boolean).join(" ") }, said };
}

// ---------------------------------------------------------------- the spec's pool (the engine's)
const plural = w => (/(s|x|z|ch|sh)$/i.test(w) ? w + "es" : w + "s");
function cohortName(spec, v, step) {
  const yrs = spec.yearMin && spec.yearMax ? (spec.yearMin === spec.yearMax ? `${spec.yearMin}` : `${spec.yearMin} to ${spec.yearMax}`) : (v.year ? String(v.year) : "");
  const body = step !== "any_body" && v.bodyStyle ? String(v.bodyStyle).toLowerCase() : "";
  const head = [v.model, v.trim && !new RegExp("\\b" + String(v.trim).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(String(v.model)) ? v.trim : ""].filter(Boolean).join(" ");
  const noun = body ? `${head} ${plural(body)}` : (/fastback|coupe|roadster|spider|convertible$/i.test(head) ? plural(head) : plural(head));
  const gb = step === "exact" && v.gearbox ? (v.gearbox === "manual" ? " with a manual gearbox" : " with an automatic gearbox") : "";
  return `${yrs} ${noun}${gb}`.trim();
}
async function poolFor(car, days, opts = {}) {
  const v = { ...car.v };
  if (opts.noBody) { v.bodyStyle = null; v.raw = String(v.raw || "").replace(BODY_WORDS, " "); }
  const spec = buildSpec(v, car.generation, v.raw || car.label);
  spec.houseTier = true;   // the venue ranking counts house sales (named sales, often without a photo)
  const rows = await fetchQualifying(spec, new Date(Date.now() - days * 864e5).toISOString(), { supabaseUrl: car.env.supabaseUrl, supabaseKey: car.env.supabaseKey }, {}).catch(() => null);
  const pool = (rows || []).filter(r => hammerUsd(r) >= DISPLAY_FLOOR);
  return { spec, pool: opts.gearbox ? pool.filter(r => gearboxType(r) === opts.gearbox) : pool };
}
// The ladder: exact spec (with the gearbox), any gearbox, any body. The first rung with 8+ sales wins;
// with none, the most specific rung that has any. Cached per car text for the turn.
export async function specPool(car, days) {
  const gb = car.v.gearbox || null;
  const steps = [];
  if (gb) steps.push(["exact", { gearbox: gb }]);
  steps.push(["any_gearbox", {}]);
  if (car.v.bodyStyle) steps.push(["any_body", { noBody: true }]);
  let first = null;
  for (const [step, o] of steps) {
    const r = await poolFor(car, days, o);
    const vv = { ...car.v, gearbox: step === "exact" ? gb : null };
    const out = { ...r, step, cohort: cohortName(r.spec, vv, step), days };
    if (r.pool.length >= 8) return out;
    if (!first && r.pool.length) first = out;
  }
  return first || { pool: [], step: "none", cohort: car.label, days, spec: null };
}

// ---------------------------------------------------------------- places
const midHalf = vals => { const s = vals.slice().sort((a, b) => a - b); return s.length >= 8 ? [roundFloor(percentile(s, 0.25)), roundCeil(percentile(s, 0.75))] : null; };
// A venue's unsold attempts for the SAME spec (the engine's own title test), when the venue records them.
async function unsoldFor(car, spec, days, slugs) {
  if (!spec || !slugs.length) return {};
  const y = (spec.yearMin ? `&year=gte.${spec.yearMin}` : "") + (spec.yearMax ? `&year=lte.${spec.yearMax}` : "");
  const rows = await supabaseSelectAll(car.env, `auction_attempts?select=source_slug,attempt_date,high_bid,high_bid_usd,auction_status,has_reserve,year,rtitle:raw_record->>title&make=ilike.${encodeURIComponent("*" + car.v.make + "*")}&attempt_date=gte.${iso(days)}&source_slug=in.(${slugs.join(",")})${y}`).catch(() => null);
  const by = {};
  for (const a of rows || []) {
    const row = { raw_title: a.rtitle || "", price: Number(a.high_bid_usd || a.high_bid) || 1, image: "attempt", year: a.year };
    if (!isQualifying(row, spec)) continue;
    if (car.v.gearbox && gearboxType(row) && gearboxType(row) !== car.v.gearbox) continue;
    (by[a.source_slug] = by[a.source_slug] || []).push(a);
  }
  return by;
}
// Venues that record unsold attempts at all (otherwise a rate would read a false 100%).
const covered = new Map();
async function recordsUnsold(env, slug) {
  if (covered.has(slug)) return covered.get(slug);
  const r = await supabaseSelect(env, `auction_attempts?source_slug=eq.${slug}&attempt_date=gte.${iso(365)}&select=id&limit=1`).catch(() => null);
  const ok = Array.isArray(r) && r.length > 0; covered.set(slug, ok); return ok;
}
export async function placesFor(car) {
  let sp = await specPool(car, 365);
  if (sp.pool.length < 3) { const wider = await specPool(car, 1095); if (wider.pool.length > sp.pool.length) sp = wider; }
  const by = new Map();
  for (const r of sp.pool) {
    const slug = sourceSlugOf(r.source) || String(r.source || "").toLowerCase();
    const g = by.get(slug) || { slug, name: houseName(slug) || r.source, house: isHouseSource(slug), rows: [] };
    g.rows.push(r); by.set(slug, g);
  }
  const slugs = [...by.keys()];
  const unsold = await unsoldFor(car, sp.spec, sp.days, slugs);
  const today = new Date().toISOString().slice(0, 10);
  const places = [];
  for (const g of by.values()) {
    const vals = g.rows.map(r => hammerUsd(r)).filter(x => x > 0);
    const last = g.rows.slice().sort((a, b) => String(b.auction_end_date || "").localeCompare(String(a.auction_end_date || "")))[0];
    const un = (unsold[g.slug] || []).length;
    const rate = (await recordsUnsold(car.env, g.slug)) ? { sold: g.rows.length, offered: g.rows.length + un, pct: Math.round(g.rows.length / (g.rows.length + un) * 100) } : null;
    const ns = HOUSE_CALENDAR[g.slug] ? nextSaleForHouse(g.slug, today) : null;
    places.push({ slug: g.slug, name: g.name, house: g.house, sales: g.rows.length, sold_through: rate, most_sold_between: midHalf(vals),
      last_sale: last ? { date: String(last.auction_end_date || "").slice(0, 10), price: Math.round(hammerUsd(last)), url: last.srcurl || last.srcurl2 || null } : null,
      next_sale: ns ? { event: ns.event, city: ns.city, month: ns.monthName, year: ns.year, consign: ns.consignApprox } : null });
  }
  // Ranked by the record for this spec: most sales, then the most recent sale.
  places.sort((a, b) => b.sales - a.sales || String((b.last_sale || {}).date || "").localeCompare(String((a.last_sale || {}).date || "")));
  const all = sp.pool.map(r => hammerUsd(r)).filter(x => x > 0);
  return { cohort: sp.cohort, step: sp.step, window_months: Math.round(sp.days / 30.4), total: sp.pool.length, most_sold_between: midHalf(all), places: places.slice(0, 3), others: places.slice(3).map(p => ({ name: p.name, sales: p.sales })), pick: places[0] ? places[0].slug : null, _pool: sp.pool, _spec: sp.spec };
}

// ---------------------------------------------------------------- tiles (24 months, thin rule per side)
const median = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? Math.round(s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const weekend = d => { const x = new Date(String(d || "") + "T12:00:00Z"); if (isNaN(x)) return null; const g = x.getUTCDay(); return g === 0 || g === 6; };
export async function tilesFor(car) {
  const sp = await specPool(car, 730);
  const tiles = [];
  if (!sp.pool.length) return { cohort: sp.cohort, tiles };
  const ids = sp.pool.map(r => r.id).filter(Boolean);
  const flags = {};
  for (let i = 0; i < ids.length; i += 200) { const rs = await supabaseSelect(car.env, `sales_archive?id=in.(${ids.slice(i, i + 200).join(",")})&select=id,has_reserve,source_slug`).catch(() => null); for (const r of rs || []) flags[r.id] = r; }
  const slugs = [...new Set(Object.values(flags).map(f => f.source_slug).filter(Boolean))];
  const coveredSlugs = []; for (const s of slugs) if (await recordsUnsold(car.env, s)) coveredSlugs.push(s);
  const unsoldBy = await unsoldFor(car, sp.spec, 730, coveredSlugs);
  const unsold = Object.values(unsoldBy).flat();
  const sold = sp.pool.filter(r => flags[r.id] && coveredSlugs.includes(flags[r.id].source_slug));
  // Reserve: sold-through and median, with vs without a reserve (both sides 8+ offered).
  const side = flag => { const s = sold.filter(r => flags[r.id].has_reserve === flag), u = unsold.filter(a => a.has_reserve === flag || (flag && a.auction_status === "reserve_not_met")); return { sold: s.length, offered: s.length + u.length, median: median(s.map(r => hammerUsd(r))) }; };
  const nr = side(false), wr = side(true);
  if (nr.offered >= 8 && wr.offered >= 8 && nr.sold && wr.sold) tiles.push({ kind: "reserve", cohort: sp.cohort, window_months: 24,
    no_reserve: { pct: Math.round(nr.sold / nr.offered * 100), median: nr.median, n: nr.offered }, with_reserve: { pct: Math.round(wr.sold / wr.offered * 100), median: wr.median, n: wr.offered } });
  // Day ending: sold-through for weekend vs weekday endings (each side 20+ offered).
  const day = w => { const s = sold.filter(r => weekend(r.auction_end_date) === w).length, u = unsold.filter(a => weekend(a.attempt_date) === w).length; return { pct: s + u ? Math.round(s / (s + u) * 100) : null, n: s + u }; };
  const we = day(true), wd = day(false);
  if (we.n >= 20 && wd.n >= 20) tiles.push({ kind: "day", cohort: sp.cohort, window_months: 24, weekend: we, weekday: wd });
  // Season: the three months with the most sales, only when they hold clearly more than their share.
  const byM = new Array(12).fill(0); for (const r of sp.pool) { const m = Number(String(r.auction_end_date || "").slice(5, 7)); if (m) byM[m - 1]++; }
  const total = byM.reduce((a, b) => a + b, 0);
  const top = byM.map((n, i) => [i, n]).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const topN = top.reduce((a, b) => a + b[1], 0);
  if (total >= 24 && topN / total >= 0.4) tiles.push({ kind: "season", cohort: sp.cohort, window_months: 24, months: top.map(([i]) => MONTHS[i]).sort((a, b) => MONTHS.indexOf(a) - MONTHS.indexOf(b)), share_pct: Math.round(topN / total * 100), n: total });
  return { cohort: sp.cohort, tiles, time_to_sell: null };   // no listing start date in the archive: that tile never shows
}

// ---------------------------------------------------------------- the three latest sales (cards)
export function recentSales(placesOut) {
  const pool = (placesOut && placesOut._pool) || [];
  return pool.slice().sort((a, b) => String(b.auction_end_date || "").localeCompare(String(a.auction_end_date || ""))).slice(0, 3).map(r => ({
    title: String(r.raw_title || r.rtitle || ""), date: String(r.auction_end_date || "").slice(0, 10), price: Math.round(hammerUsd(r)), house: houseName(sourceSlugOf(r.source)) || r.source,
    miles: (r.stated_mileage && Number(r.stated_mileage)) || (Number(String(r.mileage || "").replace(/[^\d]/g, "")) || null), url: r.srcurl || r.srcurl2 || null, photo: r.image || null, vin: r.vin_norm || null }));
}

// ---------------------------------------------------------------- PowerSellers (matched, computed)
let partnersCache = { at: 0, rows: null };
async function activePartners(env) {
  if (partnersCache.rows && Date.now() - partnersCache.at < 600e3) return partnersCache.rows;
  const rows = await supabaseSelect(env, "partners?active=is.true&select=slug,name,display_name,regions,specialties,seller_usernames,min_value_usd&limit=50").catch(() => null);
  partnersCache = { at: Date.now(), rows: rows || [] }; return partnersCache.rows;
}
export async function powersellersFor(env, { make, state }) {
  const all = await activePartners(env);
  const mk = String(make || "").toLowerCase();
  const out = [];
  for (const p of all) {
    const sp = p.specialties || {};
    const makes = (sp.makes || []).map(x => String(x).toLowerCase());
    const regions = (p.regions || []).map(x => String(x).toLowerCase());
    const regionOk = !state || regions.includes("nationwide") || regions.includes(String(state).toLowerCase());
    const career = (p.seller_usernames || []).length ? await computePartnerCareerStats(p.seller_usernames, env).catch(() => null) : null;
    const makeN = career && career.rowsByMake ? Object.entries(career.rowsByMake).filter(([m]) => m && m.toLowerCase() === mk).reduce((a, [, n]) => a + n, 0) : 0;
    const makeOk = makes.includes(mk) || makeN >= 3;
    if (!makeOk || !regionOk) continue;
    const prices = career ? (career.soldMakesPrices || []).filter(r => String(r.make || "").toLowerCase() === mk && r.price > 0).map(r => r.price) : [];
    out.push({ slug: p.slug, name: p.display_name || p.name, specialty: sp.notes || (sp.segments || []).join(", ") || null, regions: p.regions || [],
      on_this_make: makeN >= 3 ? { sales: makeN, median: prices.length >= 5 ? median(prices) : null, median_n: prices.length >= 5 ? prices.length : null } : null });
  }
  return out.sort((a, b) => ((b.on_this_make || {}).sales || 0) - ((a.on_this_make || {}).sales || 0)).slice(0, 2);
}
export { usd, monthYear };
