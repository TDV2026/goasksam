// THE VARIANT ROWS (Lane B, lane-b-variant-rows, Nov 17 2026; order bc85): when a person asks Market Check for a car with no variant stated, and the variants of its family sell apart (the variant question's own test, lib/onebox.js variantsApart), the answer carries variantSplit:
// one sentence and one row per variant of the family's list, so the page can show the split under the blended range. Nothing is asked of the visitor. Every word is the engine's; a page prints it and computes nothing.
// EACH ROW IS THE ENGINE'S ANSWER FOR ITS OWN CAR: the row's car is the same year and the typed words with the variant added, resolved by the same resolver, read by oneEngineAnswer with the same refine a typed mileage makes (withTypedMileage),
// so its range and its sales are the cluster and the pool of the answer Market Check gives when that car is asked for: same pool, same years, same mileage band, same set asides. A variant the engine cannot price on its own sales (its page reads every variant together,
// variants.thin) gets its label and its own sales count and no range: better nothing than a fake number. Replicas and tributes are set aside by the pool and are no row; the sales that name no variant are no row.
import { resolveVehicle as realResolve, sanitizeResolvedVehicle } from "./vehicle.js";
import { findGeneration } from "./generations.js";
import { oneEngineAnswer, withTypedMileage, carStampOf, moneyOf, ENGINE_VERSION } from "./onebox.js";
import { familiesOf, familyOf, variantOfCar, exactName, UNSTATED } from "./variants.js";
import { carWords } from "./carToken.js";
import { countNoun } from "./countNoun.js";
import { reasonLine } from "./reasonWords.js";
import { keepAlive } from "./keepAlive.js";
import { supabaseSelect } from "./_supabase.js";

let RESOLVER = null;   // a check only: the resolver the rows use (the real one reads the live taxonomy tables, which a fake archive has not)
export const __setResolver = f => { RESOLVER = typeof f === "function" ? f : null; };
const cache = new Map(), TTL_MS = 10 * 60 * 1000;
const NONE = { show: false, line: null, rows: [] };
// THE REASON (lane-b-variant-rows-2, crew only): why a split is not shown, as a code and numbers (per variant: sales, middle half p25 to p75, median), so a live read says which condition failed; never listing text
const qt = (a, q) => { const s = [...a].sort((x, y) => x - y); if (!s.length) return null; const i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return Math.round(s[lo] + (s[hi] - s[lo]) * (i - lo)); };
export const statsOf = groups => [...groups.entries()].map(([name, a]) => ({ name, n: a.length, p25: qt(a, 0.25), median: qt(a, 0.5), p75: qt(a, 0.75) }));
const none = (code, ctx, more) => ({ ...NONE, ...(ctx && ctx.crew ? { why: { code, ...(more || {}) } } : {}) });
// the range a read shows: the cluster as the page prints it, or null
export const rangeTextOf = d => d && d.tier === "result" && Array.isArray(d.cluster) && d.cluster.length === 2 && Number(d.cluster[0]) > 0 && Number(d.cluster[1]) > 0 ? `${moneyOf(d.cluster[0])} to ${moneyOf(d.cluster[1])}` : null;
export const salesCountOf = d => { const n = Number(d && (d.poolN != null ? d.poolN : d.soldCount)); return Number.isFinite(n) ? n : 0; };

// THE PURE PARTS (lane-b-variant-split-3): what a row is, whether a variant is built in the asked year, and whether to show; a check feeds them the answers recorded live
// a variant is shown only for the years it was built (the list's years per variant, data); a car with no year, or a variant with no years, is always in
export const builtIn = (v, year) => { const y = Number(year); return !(Array.isArray(v && v.years) && v.years.length === 2 && Number.isFinite(y) && y > 0) || (y >= v.years[0] && y <= v.years[1]); };
// THE ROW OF ONE VARIANT, FROM ITS OWN PAGE'S ANSWER: the range is the range that page prints; the count is the count that page prints (its pool; its own pooled count when it reads every variant together; none when its answer is not a sales answer: a question, no sales tracked, unavailable)
// WHY A CARD HAS NO RANGE, in the engine's words (lane-b-sell-cards-first): "Too few sales for a range." only when its count is under the sales a range needs (the answer's own noRangeFloor, 8); at or above it the card says what its own page says: sold as different cars (its own options price apart) or too spread out.
export function noRangeTextOf(raw, n) {
  const floor = Number(raw && raw.noRangeFloor) > 0 ? Number(raw.noRangeFloor) : 8, code = String((raw && raw.noRangeCode) || "");
  if (n < floor) return reasonLine("variant.row_few");
  return /^(options_apart|mixed_cars)$/.test(code) ? reasonLine("variant.row_apart") : reasonLine("variant.row_spread");
}
export function rowOf(v, raw) {
  const thin = !!(raw && raw.variants && raw.variants.thin), range = thin ? null : rangeTextOf(raw);
  const n = range ? salesCountOf(raw) : (thin && Number.isFinite(Number(raw.variants.pooled)) ? Number(raw.variants.pooled) : (raw && raw.tier === "result" ? salesCountOf(raw) : (raw && (raw.tier === "refusal" || raw.tier === "thin") ? (Number(raw.noRangeTotal) || (Array.isArray(raw.rawPool) ? raw.rawPool.length : 0)) : 0)));   // a page with sales and no range (too few comparable, spread out inside one car) says how many sales it has
  // a row with sales and no range says so in the engine's words (lane-b-sell-nolump-3: the cards of a blended answer that has no range are every variant, and the ones that cannot be priced say "too few"); n is the count the row prints
  return { name: v.name, label: v.name, priced: !!range, rangeText: range, salesText: countNoun(n, "sale"), n, ...(!range && n > 0 ? { fewText: noRangeTextOf(raw, n) } : {}), mileageNote: range && raw && typeof raw.mileageLine === "string" ? raw.mileageLine : null };
}
// THE MILEAGE LINE, ONCE (lane-b-variant-split-4): every row's page says "The range is for all mileages." and under the list it printed once per row. The engine's line is printed ONCE, under the list (split.mileageLine), only when it is the same on every priced row; when the rows differ, a row keeps its own line only if it differs from the line most rows share (the plain majority line, which then prints nowhere because it does not apply to every row).
export function mileageLinesOf(rows) {
  const priced = (rows || []).filter(r => r && r.priced && typeof r.mileageNote === "string" && r.mileageNote);
  if (!priced.length) return { rows: rows || [], line: null };
  const count = new Map(); for (const r of priced) count.set(r.mileageNote, (count.get(r.mileageNote) || 0) + 1);
  const withNote = (rows || []).filter(r => r && r.priced).length;
  if (count.size === 1 && priced.length === withNote) { const line = priced[0].mileageNote; return { rows: rows.map(r => r && r.mileageNote ? { ...r, mileageNote: null } : r), line }; }
  const top = [...count.entries()].sort((x, y) => y[1] - x[1]), major = top.length > 1 && top[0][1] === top[1][1] ? null : (top[0][1] > 1 ? top[0][0] : null);
  return { rows: rows.map(r => r && r.mileageNote && r.mileageNote === major ? { ...r, mileageNote: null } : r), line: null };
}
// WHETHER TO SHOW (the family list is the claim that its variants sell apart: Hagerty's finding and the file's own note; the middle-half test is no longer the gate, because on the asked year's own pages it reads overlapping for the Firebird: 1987 Trans Am $8,500 to $15,500, Formula $10,500 to $16,000, Base $11,000 to $17,000, GTA $11,000 to $24,000):
// two or more variants have a range on their own pages, and those ranges are not all the same range
// lane-b-sell-nolump-3 (no dead ends): when the blended answer declined ONE range because the sales are different cars (blendNoRange: it has no range of its own), the cards are the answer whenever two or more of the variants have sales, each with its range where it has one and the engine's too-few line where it has not; the blended sentence never stands alone.
export function showSplit(rows, blendNoRange = false) {
  const priced = (rows || []).filter(r => r && r.priced && r.rangeText);
  if (blendNoRange === true && (rows || []).filter(r => r && Number(r.n) > 0).length >= 2) return { show: true, code: null };
  if (priced.length < 2) return { show: false, code: "fewer_than_two_priced" };
  if (new Set(priced.map(r => r.rangeText)).size < 2) return { show: false, code: "ranges_identical" };
  return { show: true, code: null };
}
const rowCache = new Map();   // one row per car, kept as each variant's read finishes (a later request finds the rows already read)
export const __clearVariantRowsCache = () => { cache.clear(); rowCache.clear(); };
const DEADLINE_MS = 14000;

// THE SPLIT IS STORED WITH THE ANSWER IT BELONGS TO (lane-b-sell-cards-first, Stage 3). Live, the first read of "1987 BMW 3 Series" took 17.6 s and came back as the blend (Manual and Automatic only); the second took 1.5 s and came back with the cards. CAUSE: the rows (one engine read per variant) were computed in the request, took longer than the deadline (14 s) on a cold read, and the blended answer went out without them; the finished rows lived only in that instance's memory, which is why the second read (the same instance) had them. NOW: the finished split is stored (spec_market_cache, VSPLIT|engine stamp|family|year|model|miles, 12 hours) the moment it is done, by the request or, when the request's clock ran out first, by the compute that is kept alive behind it; every read finds it, on any instance. A read that has to wait for the rows says it is still reading (splitPending, the engine's own computing answer in api/sellerDecision.js) and the page asks again, so a visitor's first read is the second read.
const SPLIT_STORE_MS = 12 * 3600e3, STORE_READ_MS = 2500;
const splitStoreKey = (fam, vehicle, typedMiles) => ["VSPLIT", ENGINE_VERSION, fam.id, vehicle.year || "", String(vehicle.model || "").toLowerCase(), typedMiles || ""].join("|");
async function readSplitStore(env, skey) {
  if (!env || !env.supabaseUrl || !env.supabaseKey) return null;
  try {
    const rows = await Promise.race([supabaseSelect(env, `spec_market_cache?spec_key=eq.${encodeURIComponent(skey)}&select=market,computed_at&limit=1`), new Promise(res => setTimeout(() => res(null), STORE_READ_MS))]);
    const r = Array.isArray(rows) ? rows[0] : null, m = r && r.market;
    if (!m || m.kind !== "vsplit" || m.engineVersion !== ENGINE_VERSION || !m.split || Date.now() - Date.parse(r.computed_at || 0) > SPLIT_STORE_MS) return null;
    return m.split;
  } catch { return null; }
}
async function writeSplitStore(env, skey, split) {
  if (!env || !env.supabaseUrl || !env.supabaseKey || !split) return;
  try { await fetch(`${env.supabaseUrl}/rest/v1/spec_market_cache?on_conflict=spec_key`, { method: "POST", headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([{ spec_key: skey, market: { kind: "vsplit", engineVersion: ENGINE_VERSION, split }, sale_count: 0, computed_at: new Date().toISOString() }]) }); } catch { /* the split is served from memory; the next read computes it again */ }
}
export async function variantSplitFor(d, ctx, vehicle, generation, env, deps = {}) {
  try {
    // THE SPLIT IS THE ANSWER WHENEVER THE BLENDED ANSWER HAS NO ONE RANGE FOR A MIX (lane-b-sell-nolump): a result with its variants block, or a no-range answer (refusal, thin) of a car whose family list names its variants and whose typed words name none (the Ferrari 330 GT: "too spread out", the GTC and the 2+2 pooled)
    const noRangeTier = d && (d.tier === "refusal" || d.tier === "thin"), fam0 = d && d.variants ? familiesOf().find(f => f.id === d.variants.familyId) : (noRangeTier && vehicle && vehicle.make ? familyOf(vehicle.make, vehicle.model, vehicle.year != null ? vehicle.year : vehicle.yearRange) : null);
    if (!d || typeof d !== "object" || !(d.tier === "result" ? !!d.variants : noRangeTier && !!fam0) || (d.variants && (d.variants.applied || (d.variants.stated || []).length || d.variants.chosen)) || (!d.variants && fam0 && variantOfCar(fam0, { vehicle, text: ctx && ctx.text }).names.length)) return d;
    const refine = ctx && ctx.refine, onlyMiles = !refine || Object.entries(refine).every(([k, v]) => v == null || v === "" || k === "miTarget" || k === "miMin" || k === "miMax" || k === "miBand");
    if (!onlyMiles || Number(ctx && ctx.asked) > 0 || !vehicle || !vehicle.make) return { ...d, variantSplit: none(!onlyMiles ? "refine_is_not_miles" : Number(ctx && ctx.asked) > 0 ? "already_asked" : "no_make", ctx) };
    const fam = fam0 || familiesOf().find(f => f.id === d.variants.familyId); if (!fam) return { ...d, variantSplit: none("family_not_in_list", ctx, { familyId: (d.variants && d.variants.familyId) || null }) };
    const typedMiles = Number(vehicle.mileage) > 0 ? Math.round(Number(vehicle.mileage)) : null, key = JSON.stringify([fam.id, vehicle.year || null, vehicle.model, typedMiles, ENGINE_VERSION, env && env.supabaseUrl]), hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return { ...d, variantSplit: hit.split.why && !(ctx && ctx.crew) ? NONE : hit.split };
    const skey = splitStoreKey(fam, vehicle, typedMiles), stored = await readSplitStore(env, skey);
    if (stored) { cache.set(key, { at: Date.now(), split: stored }); return { ...d, variantSplit: stored.why && !(ctx && ctx.crew) ? NONE : stored }; }
    // THE ONE POOL: every variant is read as its own page reads it (the engine's answer for the same year and typed words with the variant added, the same refine, the same fence); the row prints that answer's range and count
    // ONE ARCHIVE READ FOR THE SIX (lane-b-variant-split-3): the six runs share the request's read memo (env._readMemo, lib/onebox.js _memoRead), so a query two variants both ask is read from the archive once and each run still gets its own copy of the rows and runs the whole engine on its own car: a row is exactly what its own page shows, the database is read once
    // (live before this: 3 Series 26 s, Corvette 48 s, Mustang 19 s and, twice, no answer in 60 s: six full reads of a five-year family window). A read that is not done by the deadline leaves the blended answer as it was (why split_timed_out); every row finished is kept for the next request.
    const resolve = deps.resolveVehicle || RESOLVER || realResolve, base = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" "), memo = new Map(), deadline = Number(deps.deadlineMs) > 0 ? Number(deps.deadlineMs) : DEADLINE_MS;
    const list = fam.variants.filter(v => builtIn(v, vehicle.year));
    const work = list.map(async v => {
      const rkey = JSON.stringify([key, v.name]), rhit = rowCache.get(rkey); if (rhit && Date.now() - rhit.at < TTL_MS) return rhit.row;
      // a family with a baseModel (data) reads each variant as the typed car's own identity with the variant stated, on the family's one pool: no resolver reading of the variant words (the Ferrari 330 GT 2+2 is not a model the resolver knows); the words are what a person types for that variant (askBase and the variant's ask)
      const words = fam.baseModel ? [vehicle.year, vehicle.make, exactName(fam, v.name)].filter(Boolean).join(" ") : `${base} ${v.ask || v.name}`;
      const r = fam.baseModel ? { vehicle: { ...vehicle, model: fam.baseModel, trim: undefined, raw: words } } : await resolve(words, {}).catch(() => null), rv0 = r && r.vehicle && r.vehicle.make && r.vehicle.model ? r.vehicle : null;
      if (!rv0) return { name: v.name, label: v.name, priced: false, rangeText: null, salesText: countNoun(0, "sale"), mileageNote: null, car: null };
      const rv = { ...(sanitizeResolvedVehicle(rv0) || rv0), variant: v.name, variantFamily: fam.id, ...(fam.baseModel ? { canonicalLabel: words } : {}), ...(typedMiles ? { mileage: typedMiles } : {}) }, gen = await findGeneration(rv, env).catch(() => null), text = typedMiles ? `${words} ${typedMiles.toLocaleString("en-US")} miles` : words;
      // asked 2: the page's own identity questions (a body, a trim) are not answered here; the card is the range of the variant across them
      const a = await oneEngineAnswer(rv, gen, text, { ...env, asked: 2, _readMemo: memo }, withTypedMileage(rv, null)).catch(() => null), raw = a && a.raw;
      const st = carStampOf(rv, env), row = { ...rowOf(v, raw), car: st ? { token: st.token, words: text, address: "/market-check?q=" + encodeURIComponent(text), sellAddress: "/sell?car=" + encodeURIComponent(st.token), line: st.line, short: st.short } : null };
      rowCache.set(rkey, { at: Date.now(), row });
      return row;
    });
    const all = Promise.all(work);
    // what a finished set of rows is: the split to show (or the reason none is), kept in memory and stored
    const finish = rows => {
      const dec = showSplit(rows, !rangeTextOf(d));
      if (!dec.show) return none(dec.code, { crew: true }, { variants: rows.map(r => ({ name: r.name, priced: r.priced, range: r.rangeText, sales: r.salesText })) });
      const nRep = Number(d.replicasAside) > 0 ? Math.round(Number(d.replicasAside)) : 0, ml = mileageLinesOf(rows);
      return { show: true, line: reasonLine("variant.split_line", { model: (d.resolvedCar && (d.resolvedCar.nameModel || d.resolvedCar.model)) || vehicle.model }), rows: ml.rows, mileageLine: ml.line, asideLine: nRep ? reasonLine("variant.replicas_aside", { n: nRep }) : null };
    };
    let timer = null; const rows = await Promise.race([all, new Promise(res => { timer = setTimeout(() => res(null), deadline); })]); if (timer) clearTimeout(timer);
    if (!rows) {
      // the clock ran out first: the compute goes on behind the response and stores the split; this read says the cards are still being read
      keepAlive(all.then(rs => { const sp = finish(rs); cache.set(key, { at: Date.now(), split: sp }); return ctx && ctx.crew ? null : writeSplitStore(env, skey, sp); }).catch(() => {}));   // a crew read writes nothing to the shared stores
      return { ...d, variantSplit: none("split_timed_out", ctx, { variants: list.length, deadlineMs: deadline }), splitPending: true };
    }
    const split = finish(rows); cache.set(key, { at: Date.now(), split });
    if (!(ctx && ctx.crew)) keepAlive(writeSplitStore(env, skey, split));
    return { ...d, variantSplit: split.why && !(ctx && ctx.crew) ? NONE : split };
  } catch { return d; }
}
