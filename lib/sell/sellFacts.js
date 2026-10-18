// /sell facts (Lane C, Oct 2026): everything the Sell conversation and page show, computed from the One
// Box engine's own spec pool (buildSpec + fetchQualifying + isQualifying), so Sell reads the same
// numbers as One Box and the spec pages and inherits every engine fix. Archive-only, zero OldCarsData.
//   resolveSellCar(text)   the car + what the seller typed (miles, gearbox, body, colour, state, intent)
//   placesFor(car)         venues ranked by this spec's record: sales, sold-through, middle half, last
//                          sale, next sale + consignment close for houses; the pick
//   tilesFor(car, pick)    reserve / day ending / season, each only past its thin rule, cohort named
//   recentSales(car)       the three latest sales of the spec (cards)
import { resolveVehicle, sanitizeResolvedVehicle } from "../vehicle.js";
import { findGeneration } from "../generations.js";
import { buildSpec, fetchQualifying, isQualifying, oneEngineAnswer, __specEngine, ENGINE_VERSION } from "../onebox.js";
import { specKeyFor } from "../live/search.js";
import { supabaseSelect, supabaseSelectAll } from "../_supabase.js";
import { sourceSlugOf, isHouseSource } from "../_houseComps.js";
import { nextSaleForHouse, HOUSE_CALENDAR, buildHouseComparison } from "../houseCalendar.js";
import { houseName } from "../../api/_historyData.js";
import { __specMeta } from "../specPages.js";
const { gearboxType, hammerUsd, percentile, roundFloor, roundCeil, DISPLAY_FLOOR } = __specEngine;
// A pool row's USD hammer (a house receipt carries it already as _hv).
const val = r => (r._hv != null ? r._hv : hammerUsd(r));
const ttl = r => String(r.raw_title || r.rtitle || "");

// VENUE WINDOW IN WORDS (Lane B job, Oct 2026, Part 6): placesFor's own window (12 then 36 months,
// house tier and display floor) differs BY DESIGN from the engine's headline window, so its venue
// total is not comparable to the engine's headline count for equality (this file's own standing
// comment on the sweep gate says so). The rule this adds: whenever a caller finds the two totals
// differ, the venue line must state its OWN window in words - never a second, unexplained number on
// the page next to the engine's headline. windowWords/needsWindowNote are the one shared wording
// every Sell-page renderer applies for this, not a per-caller guess. placesFor's own return below
// always carries window_label, so the words are available whenever a caller needs them.
export function windowWords(months) {
  const m = Math.round(Number(months) || 0);
  if (m <= 0) return "";
  if (m % 12 === 0) { const y = m / 12; return `in the last ${y === 1 ? "year" : y + " years"}`; }
  return `in the last ${m} months`;
}
export function needsWindowNote(venueTotal, headlineCount) {
  return Number.isFinite(venueTotal) && Number.isFinite(headlineCount) && venueTotal !== headlineCount;
}

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
export async function resolveSellCar(text, env) {
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
  // A Porsche chassis code as the model ("993") is the 911 of that generation, the way the engine and
  // the spec pages read it (model "993" matched "1993 Porsche 968" titles and spanned the wrong years).
  let generation = null;
  // The vehicle exactly as the resolver gave it (model "997", not "911"): the engine is asked with THIS, the way Market Check asks it,
  // so Sell's pool is Market Check's pool (a 997 read as "911" plus a generation window answered with no pool at all).
  const vEngine = { ...v };
  const g911 = String(v.make) === "Porsche" ? __specMeta.GENS_911.find(g => g.code === String(v.model)) : null;
  if (g911) { v.model = "911"; generation = { make: "Porsche", model: "911", code: g911.code, yearStart: g911.y[0], yearEnd: g911.y[1] }; }
  else generation = await findGeneration(v, env || null).catch(() => null);
  const generationEngine = await findGeneration(vEngine, env || null).catch(() => null);
  return { car: { v, generation, vEngine, generationEngine, label: [v.year, v.make, v.model, v.wheelbase, v.trim, v.bodyStyle].filter(Boolean).join(" ") }, said };
}

// ---------------------------------------------------------------- the spec's pool (the engine's)
// A name ending in a badge or code ("Carrera S", "GT3", "AMG", "997") reads as "{name} cars", never
// "Carrera Ses"; a word ending takes the ordinary plural.
const plural = w => (/(?:^|\s)(?:[A-Z0-9][A-Z0-9-]{0,4}|\d[\w.-]*)$/.test(w) ? w + " cars" : /(s|x|z|ch|sh)$/i.test(w) ? w + "es" : w + "s");
// The cohort's head ("997 Carrera S") and body ("coupe"), shared by the plural name and the singular one.
function cohortParts(spec, v, step) {
  const body = step !== "any_body" && v.bodyStyle ? String(v.bodyStyle).toLowerCase() : "";
  // A 911 is named by its generation the way owners say it ("993 Carrera coupes").
  const model = String(v.model) === "911" && spec.genCode ? spec.genCode : v.model;
  const head = [model, v.trim && !new RegExp("\\b" + String(v.trim).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(String(model)) ? v.trim : ""].filter(Boolean).join(" ");
  return { head, body };
}
// The singular name ("997 Carrera S coupe"), for sentences about its SALES ("997 Carrera S coupe sales"),
// so a badge name is never pluralized.
function cohortSingular(spec, v, step) { if (!spec) return null; const { head, body } = cohortParts(spec, v, step); return [head, body].filter(Boolean).join(" ") || null; }
function cohortName(spec, v, step) {
  const yrs = spec.yearMin && spec.yearMax ? (spec.yearMin === spec.yearMax ? `${spec.yearMin}` : `${spec.yearMin} to ${spec.yearMax}`) : (v.year ? String(v.year) : "");
  const { head, body } = cohortParts(spec, v, step);
  const noun = body ? `${head} ${plural(body)}` : (/fastback|coupe|roadster|spider|convertible$/i.test(head) ? plural(head) : plural(head));
  const gb = step === "exact" && v.gearbox ? (v.gearbox === "manual" ? " with a manual gearbox" : " with an automatic gearbox") : "";
  // The noun first, the years after it: a count never sits directly before a year or a generation
  // number ("35 1994 to 1998 993 Carrera coupes" read as one long number).
  return `${noun}${gb}${yrs ? ", " + yrs : ""}`.trim();
}
// The cohort's noun alone ("993 Carrera coupes with a manual gearbox") and its years ("1994 to 1998").
export const cohortNoun = c => String(c || "").replace(/, \d{4}(?: to \d{4})?$/, "");
export const cohortYears = c => ((/, (\d{4}(?: to \d{4})?)$/.exec(String(c || "")) || [])[1] || null);
async function poolFor(car, days, opts = {}) {
  const v = { ...car.v };
  if (opts.noBody) { v.bodyStyle = null; v.raw = String(v.raw || "").replace(BODY_WORDS, " "); }
  const spec = buildSpec(v, car.generation, v.raw || car.label);
  if (car.generation && car.generation.yearStart && car.generation.yearEnd && String(car.v.model) === "911") { spec.yearMin = car.generation.yearStart; spec.yearMax = car.generation.yearEnd; spec.genCode = car.generation.code; }
  spec.houseTier = true;   // the venue ranking counts house sales (named sales, often without a photo)
  const rows = await fetchQualifying(spec, new Date(Date.now() - days * 864e5).toISOString(), { supabaseUrl: car.env.supabaseUrl, supabaseKey: car.env.supabaseKey }, {}).catch(() => null);
  let pool = (rows || []).filter(r => hammerUsd(r) >= DISPLAY_FLOOR);
  // A named trim must be in the sale's own title ("Fastback": a Mecum "Mustang Convertible" is not one),
  // unless no title carries it (then the engine's scoping stands).
  if (v.trim) { const re = new RegExp("\\b" + String(v.trim).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[\s-]+/g, "[\\s-]?") + "\\b", "i"); const kept = pool.filter(r => re.test(ttl(r))); if (kept.length || v._strictTrim) pool = kept; }
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
    const out = { ...r, step, cohort: cohortName(r.spec, vv, step), cohort_name: cohortSingular(r.spec, vv, step), days };
    if (r.pool.length >= 8) return out;
    if (!first && r.pool.length) first = out;
  }
  return first || { pool: [], step: "none", cohort: car.label, days, spec: null };
}

// ---------------------------------------------------------------- places
const midHalf = vals => { const s = vals.slice().sort((a, b) => a - b); return s.length >= 8 ? [roundFloor(percentile(s, 0.25)), roundCeil(percentile(s, 0.75))] : null; };
// THE ENGINE DECIDES WHETHER A RANGE EXISTS (Sam, Oct 18 2026, decision 2 on the 275 GTB thin tier): under eight sales,
// or eight or more too spread out for a cluster, no page prints a range, even where a low and a high could be computed.
// Sell's own middle halves (per venue, the whole pool, the day groups) are set aside whenever the engine's answer carries
// no cluster, so a thin tier prints no range anywhere on Sell: not the page, not the tiles, not the chat's facts.
export const engineHasRange = d => !!(d && Array.isArray(d.cluster) && d.cluster.length === 2 && Number(d.cluster[0]) > 0 && Number(d.cluster[1]) > 0);   // the shared card's own hasRange test
// Sales by the day of the week the sale ended, from the engine's own pool (sold cars only, no failed bids). The day is the
// stored calendar date (the first ten characters of auction_end_date, read as a date, no timezone shift), so a sale
// keeps the day its listing shows. A range (middle half, hammer, as the venue ranges) only for a group of eight or
// more; the groups are the top day and all other days together. Under eight sales in all: nothing.
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export function dayBuckets(rows, rangeOk = true) {
  const by = DAY_NAMES.map(() => []); let undated = 0;
  for (const r of rows || []) {
    const t = Date.parse(String(r.auction_end_date || "").slice(0, 10) + "T12:00:00Z");
    if (isNaN(t)) { undated++; continue; }
    by[new Date(t).getUTCDay()].push(val(r));
  }
  const dated = by.reduce((n, a) => n + a.length, 0);
  if (dated + undated < 8 || dated < 8) return null;
  const days = by.map((a, i) => ({ day: DAY_NAMES[i], count: a.length, vals: a })).filter(g => g.count).sort((a, b) => b.count - a.count);
  const range = vs => { const v = vs.filter(x => x > 0); return rangeOk && v.length >= 8 ? midHalf(v) : null; };
  const topN = days[0].count, tied = days.filter(g => g.count === topN).map(g => g.day);
  const lead = days[0], restVals = days.slice(1).flatMap(g => g.vals);
  return {
    total: dated + undated, dated, undated,
    days: days.map(g => ({ day: g.day, count: g.count, most_sold_between: range(g.vals) })),
    top: tied.length === 1 ? { day: lead.day, count: lead.count, most_sold_between: range(lead.vals) } : null,
    tied: tied.length > 1 ? tied : null,
    other: { count: restVals.length, most_sold_between: range(restVals) }
  };
}
// A venue's unsold attempts for the SAME spec (the engine's own title test), when the venue records them.
async function unsoldFor(car, spec, days, slugs) {
  if (!spec || !slugs.length) return {};
  const y = (spec.yearMin ? `&year=gte.${spec.yearMin}` : "") + (spec.yearMax ? `&year=lte.${spec.yearMax}` : "");
  const rows = await supabaseSelectAll(car.env, `auction_attempts?select=source_slug,attempt_date,high_bid,high_bid_usd,auction_status,has_reserve,year,rtitle:raw_record->>title&make=ilike.${encodeURIComponent("*" + car.v.make + "*")}&attempt_date=gte.${iso(days)}&source_slug=in.(${slugs.join(",")})${y}`).catch(() => null);
  const by = {};
  // The unsold side follows the same title rule as the sales (a named trim must be in the title), or a
  // rate would set fastback sales against every Mustang that didn't sell.
  const trimRe = car.v.trim ? new RegExp("\\b" + String(car.v.trim).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[\s-]+/g, "[\\s-]?") + "\\b", "i") : null;
  for (const a of rows || []) {
    const row = { raw_title: a.rtitle || "", price: Number(a.high_bid_usd || a.high_bid) || 1, image: "attempt", year: a.year };
    if (!isQualifying(row, spec)) continue;
    if (trimRe && !trimRe.test(row.raw_title)) continue;
    if (car.v.gearbox && gearboxType(row) && gearboxType(row) !== car.v.gearbox) continue;
    (by[a.source_slug] = by[a.source_slug] || []).push(a);
  }
  return by;
}
// Venues that record unsold attempts at all (otherwise a rate would read a false 100%).
const covered = new Map();
async function recordsUnsold(env, slug) {
  if (covered.has(slug)) return covered.get(slug);
  const r = await supabaseSelect(env, `auction_attempts?source_slug=eq.${slug}&attempt_date=gte.${iso(365)}&select=source_slug&limit=1`).catch(() => null);
  const ok = Array.isArray(r) && r.length > 0; covered.set(slug, ok); return ok;
}
// Whether a venue records UNSOLD cars of one reserve kind (has_reserve true/false) at all. A side that
// reads 100% sold where the venue never records that side's unsold cars is not a measurement.
const coveredRes = new Map();
async function recordsUnsoldKind(env, slug, hasReserve) {
  const k = slug + "|" + hasReserve; if (coveredRes.has(k)) return coveredRes.get(k).ok;
  // Measured = the venue records a real number of that kind's unsold cars (10+ in 24 months), not one
  // stray row. The count is an exact HEAD count.
  let n = 0;
  try {
    const r = await fetch(`${env.supabaseUrl}/rest/v1/auction_attempts?source_slug=eq.${slug}&has_reserve=eq.${hasReserve}&attempt_date=gte.${iso(730)}&select=source_slug`, { method: "HEAD", headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, Prefer: "count=exact", Range: "0-0" } });
    n = Number((/\/(\d+)$/.exec(r.headers.get("content-range") || "") || [])[1]) || 0;
  } catch { n = 0; }
  const ok = n >= 10; coveredRes.set(k, { ok, n }); return ok;
}
// THE ENGINE'S POOL (Sam, Oct 13 2026: Sell uses the same pool as Market Check). placesFor no longer builds a
// pool of its own: it asks the one engine (oneEngineAnswer, the call api/sellerDecision.js makes for Market
// Check) for the typed car and reads that answer's receipts (rawPool) and window. No query, window, ladder or
// fence lives here any more, so a count printed on Sell is the count Market Check prints for the same words.
// asked: 2 keeps the engine from answering with an identity question (the car is already known here), the
// way lib/live/search.js walkLadder reads it.
const NUM_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const numWord = n => (Number.isInteger(n) && n >= 0 && n <= 10 ? NUM_WORDS[n] : String(n));
const WORD_NUM = Object.fromEntries(NUM_WORDS.map((w, i) => [w, i]));
// The window in words, from the ENGINE's own window label (never a fixed "12 months"): "last twelve months" ->
// "in the last 12 months"; "past 2 years" -> "in the last two years"; a thin pool's 36 months -> "in the last
// three years"; a label that names no span ("the model year itself", "widened years", "all years on record") reads
// from the engine's own windowStart ("since January 2023") or, for all years, says so.
export function engineWindow(d, pool) {
  // The engine's own windowWords win when present (Lane B, Oct 14 2026, Sam: the window reads the same on
  // every product): the one phrase Market Check, Buy and Tasks print ("in the last twelve months", "since
  // January 2023"), with its windowMonths. The label mapping below stays for an answer shape without them.
  if (d && d.windowWords) return { months: Number(d.windowMonths) || 12, label: String(d.windowWords), source: "windowWords" };
  const label = String((d && d.windowLabel) || "");
  const now = Date.now();
  const startIso = (d && d.windowStart) || ((pool || []).map(r => String(r.auction_end_date || "").slice(0, 10)).filter(Boolean).sort()[0]) || null;
  const monthsSince = iso0 => { const t = Date.parse(iso0); return Number.isFinite(t) ? Math.max(1, Math.ceil((now - t) / (30.4 * 864e5))) : null; };
  if (/12 months|twelve/i.test(label)) return { months: 12, label: "in the last 12 months", source: label };
  const yrs = /(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*years?/i.exec(label);
  if (yrs) { const n = /^\d+$/.test(yrs[1]) ? Number(yrs[1]) : WORD_NUM[yrs[1].toLowerCase()]; return { months: n * 12, label: `in the last ${n === 1 ? "year" : numWord(n) + " years"}`, source: label }; }
  const tm = d && d.thin && Number(d.thin.windowMonths || (d.htMeta && d.htMeta.windowMonths));
  const tmeta = tm || (d && d.htMeta && Number(d.htMeta.windowMonths)) || null;
  if (tmeta && !label) { const y = tmeta / 12; return { months: tmeta, label: Number.isInteger(y) ? `in the last ${y === 1 ? "year" : numWord(y) + " years"}` : `in the last ${tmeta} months`, source: `${tmeta} months` }; }
  if (/all years/i.test(label)) return { months: monthsSince(startIso) || 12, label: "across all years on record", source: label };
  const m = startIso ? /^(\d{4})-(\d{2})/.exec(startIso) : null;
  if (m) return { months: monthsSince(startIso) || 12, label: `since ${MONTHS[Number(m[2]) - 1]} ${m[1]}`, source: label || "pool dates" };
  return { months: 12, label: "in the last 12 months", source: "default" };
}
// THE ROWS THE ENGINE USED (Lane D, Oct 16 2026, Sam: the Sell count must equal the Market Check count). The engine's
// receipts (d.cards, the sales every product renders, each carrying the record's own id) are the pool the engine
// decided on; its output gate asserts poolN equals that card count on every result and thin answer. rawPool is the
// same array on today's engine, but it is an additive diagnostic field, so Sell narrows to the receipts' ids whenever
// the two differ (the "258 against 14" report: a wider rawPool printed as the count while the engine used 14). A
// difference is logged loudly (never swallowed) so an engine answer whose rawPool drifts from its receipts is visible,
// and the printed number is the engine's by construction. Nothing here changes what the engine does.
export function engineUsedRows(d) {
  const rows = d && Array.isArray(d.rawPool) ? d.rawPool : [];
  const cards = d && Array.isArray(d.cards) ? d.cards : null;
  if (!cards || cards.length === rows.length) return rows;
  const ids = new Set(cards.map(c => c && c.id).filter(x => x != null));
  const narrowed = ids.size ? rows.filter(r => r && r.id != null && ids.has(r.id)) : rows;
  try { console.error(JSON.stringify({ tag: "sell_pool_count_mismatch", tier: d.tier || null, rawPool: rows.length, receipts: cards.length, usedRows: narrowed.length, narrowedByIds: ids.size > 0 })); } catch {}
  return narrowed;
}
async function enginePool(car) {
  const env = { supabaseUrl: car.env.supabaseUrl, supabaseKey: car.env.supabaseKey };
  const text = car.v.raw || car.label;
  let a = await oneEngineAnswer(car.vEngine || car.v, car.vEngine ? car.generationEngine : car.generation, text, { ...env, asked: 2 }, null).catch(() => null);
  const d = a && a.raw ? a.raw : null;
  const rows = engineUsedRows(d);
  return { d, rows };
}
// THE ENGINE'S QUESTION FIRST (Sam's rule, every product; Lane C as integrator, Lane F's order, Oct 19 2026): the
// engine is asked at asked 0 the way Market Check asks it. When it answers with a body or generation question (a bare
// "1965 Ford Mustang": Convertible, Coupe or Fastback), Sell asks THAT question, in the engine's own prompt and options,
// before any range; enginePool's asked-2 read would otherwise print the pooled range Market Check never shows. Each
// option carries the car words its answer reads next, by Market Check's own chip rule (js/onebox.js renderChoice): a
// body answer appends to the resolved car, a generation answer is the engine's own query. Any other answer: null.
// The same asked-0 read also carries a refusal Sell must show alone (refusalOf below), so one read answers both.
export async function engineFirst(car) {
  const env = { supabaseUrl: car.env.supabaseUrl, supabaseKey: car.env.supabaseKey };
  const a = await oneEngineAnswer(car.vEngine || car.v, car.vEngine ? car.generationEngine : car.generation, car.v.raw || car.label, { ...env, asked: 0 }, null).catch(() => null);
  const d = a && a.raw;
  return { refusal: refusalOf(d), question: choiceOf(d), noRange: noRangeOf(d) };
}
// NO RANGE, THE ENGINE'S OWN CARD (Sam, Oct 19 2026: "when the engine's answer is a refusal of any kind, Sell shows the
// engine's own line and the engine's own sales rows where the engine shows them, exactly as Market Check does"): a
// refusal of any other kind (thin, spread, could not verify) and a thin answer (no range) give Sell the engine's card
// fields only (cardAnswerOf: its line, latest sale and rows). No venue counts, why line, pick, partner or tiles are read
// for it, so no number the engine did not produce. A builder car keeps refusalOf above (the engine's line alone).
export function noRangeOf(d) {
  if (!d || refusalOf(d) || !(d.tier === "refusal" || d.tier === "thin")) return null;
  const card = cardAnswerOf(d);
  const line = d.thinLine || (d.tier === "refusal" ? d.samLine : null) || null;
  return { kind: (d.refusal && d.refusal.kind) || d.tier, line: line ? String(line) : null, card };
}
export async function engineQuestion(car) { return (await engineFirst(car)).question; }
// A BUILDER CAR IS NEVER COMPARED (Sam's Singer rule, Oct 19 2026, e68; Lane C as integrator, Lane F's order): when the
// engine refuses a car as a builder's car, Sell shows the engine's own line and nothing else: no venue counts, no why
// line, no pick, no partner, no card. Narrow to builder_car (Lane F); the other refusal kinds are not changed here.
export function refusalOf(d) {
  if (!d || d.tier !== "refusal" || !d.refusal || d.refusal.kind !== "builder_car" || !d.samLine) return null;
  return { kind: "builder_car", line: String(d.samLine) };
}
export function choiceOf(d) {
  if (!d || !d.prompt) return null;
  if (d.tier === "generation_choice" && Array.isArray(d.generationOptions) && d.generationOptions.length)
    return { tier: d.tier, prompt: String(d.prompt), options: d.generationOptions.filter(o => o && o.label && o.query).map(o => ({ label: String(o.label), car: String(o.query) })) };
  if (d.tier === "body_choice" && Array.isArray(d.bodyOptions) && d.bodyOptions.length) {
    const rc = d.resolvedCar || {};
    const base = [rc.year, rc.make, rc.model, rc.trim].filter(Boolean).join(" ");
    if (!base) return null;
    return { tier: d.tier, prompt: String(d.prompt), options: d.bodyOptions.filter(Boolean).map(b => ({ label: String(b), car: `${base} ${b}` })) };
  }
  return null;
}
// The engine reads a trim out of the typed words ("Defender 90") that the resolver leaves off the vehicle; the scope
// the Sell page names must carry it too, or a 90-only pool is labelled as the whole Defender.
const withEngineTrim = (name, d) => { const t = d && d.poolTrim ? String(d.poolTrim) : ""; const n = name || null; return n && t && !new RegExp("\\b" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(n) ? `${n} ${t}` : n; };
// The scope line names the years the engine's label names (Oct 14 2026, golden cars 6 and 14): a thin answer's scopeLabel is the typed car
// ("2006 Mercedes-Benz CLK DTM") while its rungLabel carries the span it really read ("CLK DTM, 2005 to 2007"). When the label has a
// span the scope lacks, the engine's own label is the scope.
export function scopeWithSpan(d) {
  const scope = (d && d.scopeLabel) || null, rung = (d && d.rungLabel) || null;
  const span = rung && /\b\d{4} to \d{4}\b/.exec(rung);
  if (span && (!scope || !scope.includes(span[0]))) return rung;
  return scope;
}
// The ONLY fields lib/sellsForCard.js reads, lifted off the engine's own answer (Lane A, Oct 2026): never
// the whole `d` (its diagnostic payload is exactly what Lane B's e59 egress job just stopped sending on
// the wire for Market Check - cards/rawPool/dedup/htMeta - so Sell must not reintroduce it by caching or
// shipping the raw object). A field the engine didn't set is left off, never defaulted.
function cardAnswerOf(d) {
  if (!d) return null;
  const out = {};
  for (const k of ["cluster", "poolN", "windowMonths", "bodyLine", "bodyLabel", "setAsideReasons", "setAsideCount", "readAt", "stale", "staleLine", "qualifyingTotal",
    // e63 (Sam's thin card): what the shared card draws on a thin answer, passed through from the engine, the same keys
    // Buy's whitelist (lib/live/search.js cardAnswerOf) passes
    "tier", "thinLine", "thinReason", "latestSaleLine", "samLine",
    // e60/basis line (Sam, approved 2026-10-18): the engine's own basisLine ("Based on N sales, the latest in Month
    // Year.") and includesFromLine ("Includes sales from Year.", only when the oldest included sale is over three
    // years old) - the card prints both verbatim, never reconstructs them.
    "basisLine", "includesFromLine"]) {
    if (d[k] !== undefined) out[k] = d[k];
  }
  if (Array.isArray(d.cards)) out.cards = d.cards.map(c => ({ price: c.price ?? null, date: c.date || null, mi: c.mi ?? null, title: c.title || null, image: c.image || null }));
  // trendQuarters is not a flat field on the raw engine answer - mapEngineAnswer (lib/onebox.js) reshapes
  // it from d.trend.quarters; the same reshape, so Sell's card reads the identical quarters Market
  // Check's does for the same car.
  if (d.trend && Array.isArray(d.trend.quarters)) {
    out.trendQuarters = d.trend.quarters.map(q => ({ period: q.period, low: q.low ?? null, high: q.high ?? null, count: Number(q.count) || 0, thin: !!q.thin }));
  }
  return out;
}
export async function placesFor(car) {
  const { d, rows } = await enginePool(car);
  const spec = buildSpec({ ...car.v }, car.generation, car.v.raw || car.label);
  const win = engineWindow(d, rows);
  const earliest = rows.map(r => String(r.auction_end_date || "").slice(0, 10)).filter(Boolean).sort()[0];
  const days = Math.max(30, earliest ? Math.ceil((Date.now() - Date.parse(earliest)) / 864e5) + 1 : win.months * 30);
  const vv = { ...car.v, gearbox: null };
  let sp = { pool: rows, step: (d && d.tier) || "none", cohort: cohortName(spec, vv, "any_gearbox"), cohort_name: cohortSingular(spec, vv, "any_gearbox"), days, spec, route: (d && d.fallbackRung) || null };
  const rangeOk = engineHasRange(d), mh = vals => (rangeOk ? midHalf(vals) : null);
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
    const vals = g.rows.map(r => val(r)).filter(x => x > 0);
    const last = g.rows.slice().sort((a, b) => String(b.auction_end_date || "").localeCompare(String(a.auction_end_date || "")))[0];
    const un = (unsold[g.slug] || []).length;
    const rate = (await recordsUnsold(car.env, g.slug)) ? { sold: g.rows.length, offered: g.rows.length + un, pct: Math.round(g.rows.length / (g.rows.length + un) * 100) } : null;
    const ns = HOUSE_CALENDAR[g.slug] ? nextSaleForHouse(g.slug, today) : null;
    places.push({ slug: g.slug, name: g.name, house: g.house, sales: g.rows.length, sold_through: rate, most_sold_between: mh(vals),
      last_sale: last ? { date: String(last.auction_end_date || "").slice(0, 10), price: Math.round(val(last)), url: last.srcurl || last.srcurl2 || null } : null,
      next_sale: ns ? { event: ns.event, city: ns.city, month: ns.monthName, year: ns.year, consign: ns.consignApprox } : null });
  }
  // Ranked by the record for this spec: most sales, then the most recent sale.
  places.sort((a, b) => b.sales - a.sales || String((b.last_sale || {}).date || "").localeCompare(String((a.last_sale || {}).date || "")));
  const all = sp.pool.map(r => val(r)).filter(x => x > 0);
  const window_months = win.months;
  return { cohort: sp.cohort, cohort_noun: cohortNoun(sp.cohort), cohort_name: sp.step === "class_era" ? null : withEngineTrim(sp.cohort_name, d), cohort_years: cohortYears(sp.cohort), route: sp.route || sp.step, step: sp.step, window_months, window_label: win.label, scope_label: scopeWithSpan(d), pool_trim: (d && d.poolTrim) || null, engine: { tier: (d && d.tier) || null, fallbackRung: (d && d.fallbackRung) || null, rungLabel: (d && d.rungLabel) || null, windowLabel: (d && d.windowLabel) || null, windowSource: win.source }, too_few_to_compare: sp.pool.length < 8 || !(places[0] && places[0].sales >= 3), total: sp.pool.length, most_sold_between: mh(all), by_day: dayBuckets(sp.pool, rangeOk), places: places.slice(0, 3), others: places.slice(3).map(p => ({ name: p.name, sales: p.sales })), pick: places[0] ? places[0].slug : null,
    // The engine's own answer, slimmed to the fields the shared card reads (Lane A, Oct 2026, one engine /
    // one card job): the same numbers Market Check's card shows for this car, never a second computation.
    // Sell already asks the engine for this spec above (enginePool); this just stops throwing it away.
    engineAnswer: cardAnswerOf(d), _pool: sp.pool, _spec: sp.spec };
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
  // Better nothing than a fake number: a side at 100% where no venue in the cohort records that side's
  // unsold cars hides the whole tile.
  const sideMeasured = async flag => { for (const s of coveredSlugs) if (await recordsUnsoldKind(car.env, s, flag)) return true; return false; };
  const fake100 = (nr.offered && nr.sold === nr.offered && !(await sideMeasured(false))) || (wr.offered && wr.sold === wr.offered && !(await sideMeasured(true)));
  if (!fake100 && nr.offered >= 8 && wr.offered >= 8 && nr.sold && wr.sold) tiles.push({ kind: "reserve", cohort: sp.cohort, window_months: 24,
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
export function recentSales(placesOut, n = 3) {
  const pool = (placesOut && placesOut._pool) || [];
  return pool.slice().sort((a, b) => String(b.auction_end_date || "").localeCompare(String(a.auction_end_date || ""))).slice(0, n).map(r => ({
    title: String(r.raw_title || r.rtitle || ""), date: String(r.auction_end_date || "").slice(0, 10), price: Math.round(val(r)), house: houseName(sourceSlugOf(r.source)) || r.source,
    miles: (r.stated_mileage && Number(r.stated_mileage)) || (Number(String(r.mileage || "").replace(/[^\d]/g, "")) || null), url: r.srcurl || r.srcurl2 || null, photo: r.image || null, vin: r.vin_norm || null }));
}

// ---------------------------------------------------------------- PowerSellers (matched, computed)
export { usd, monthYear };
// The house-by-house comparison for this spec's pool, through the SHARED lib/houseCalendar.js function the
// old /sell uses (buildHouseComparison, its asap reorder included): no ranking here, only the rows handed in.
export async function houseComparisonFor(car, { asap = false } = {}) {
  const pl = await placesFor(car);
  const receipts = (pl._pool || []).map(r => { const slug = sourceSlugOf(r.source) || String(r.source || "").toLowerCase(); return { isHouse: isHouseSource(slug), slug, venue: r.source, hammer: Math.round(val(r)), date: String(r.auction_end_date || "").slice(0, 10), title: r.raw_title || null, url: r.srcurl || null }; });
  return buildHouseComparison(receipts, { todayISO: new Date().toISOString().slice(0, 10), asap });
}
// The engine pool's median (for the partner value gate when cached facts predate value_usd).
export async function poolMedianUsd(car) { const pl = await placesFor(car); const vals = (pl._pool || []).map(r => val(r)).filter(x => x > 0); return vals.length >= 8 ? median(vals) : null; }

// ---------------------------------------------------------------- one day's facts per spec, cached
// Places, tiles and the latest sales for one spec, computed once a day: this instance's memory, then the
// spec_market_cache table (key "sell|v1|{date}|{spec}"), then the engine. A repeat car is fast.
const factsMem = new Map();
export async function sellFactsFor(car) {
  const day = new Date().toISOString().slice(0, 10);
  // The engine version is in the key (Oct 14 2026): a Sell page cached under an older engine printed "ten sales" for a pool the engine now answers 14.
  // e49 (Sam's item 13): the Sell row keys through the one engine key (specKeyFor: make, model, trim, year, generation,
  // body, edition, variant, wheelbase, gearbox and the applied refine), the same function every other cache of an
  // answer keys on, so a Sell row can never cross a body or trim either.
  const key = "sell|v12|" + ENGINE_VERSION + "|" + day + "|" + specKeyFor(car.vEngine || car.v, car.generationEngine || car.generation || null, car.v.gearbox ? { tx: car.v.gearbox } : null) + "|" + JSON.stringify([car.label]);
  if (factsMem.has(key)) return { ...factsMem.get(key), cached: "memory" };
  const env = car.env;
  try {
    const r = await supabaseSelect(env, `spec_market_cache?spec_key=eq.${encodeURIComponent(key)}&select=market&limit=1`);
    if (Array.isArray(r) && r[0] && r[0].market && r[0].market.places) { factsMem.set(key, r[0].market); return { ...r[0].market, cached: "table" }; }
  } catch { /* the table is optional */ }
  const [pl, tl] = await Promise.all([placesFor(car), tilesFor(car).catch(() => ({ tiles: [] }))]);
  const { _pool, _spec, ...places } = pl;
  // value_usd: the median of the engine's own pool, for the PowerSeller value gate only (never shown).
  const vals = (_pool || []).map(r => val(r)).filter(x => x > 0);
  // extraPhoto: the next sale with a photo after the three latest (the Sell landing's example band uses it,
  // so its picture is never one of the cards in its recent sales strip). v5: carries extraPhoto.
  const extra = recentSales(pl, 12).slice(3).find(s => s.photo);
  const facts = { places, tiles: tl.tiles || [], recent: recentSales(pl), extraPhoto: extra ? { photo: extra.photo, title: extra.title } : null, value_usd: vals.length >= 8 ? median(vals) : null };
  factsMem.set(key, facts); if (factsMem.size > 300) factsMem.delete(factsMem.keys().next().value);
  // Only a real answer is stored (an empty result may be a read that didn't come back).
  if (places.total) fetch(`${env.supabaseUrl}/rest/v1/spec_market_cache?on_conflict=spec_key`, { method: "POST",
    headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{ spec_key: key, market: facts, sale_count: places.total, computed_at: new Date().toISOString() }]) }).catch(() => {});
  return { ...facts, cached: null };
}
