// THE VARIANT ROWS (Lane B, lane-b-variant-rows, Nov 17 2026; order bc85): when a person asks Market Check for a car with no variant stated, and the variants of its family sell apart (the variant question's own test, lib/onebox.js variantsApart), the answer carries variantSplit:
// one sentence and one row per variant of the family's list, so the page can show the split under the blended range. Nothing is asked of the visitor. Every word is the engine's; a page prints it and computes nothing.
// EACH ROW IS THE ENGINE'S ANSWER FOR ITS OWN CAR: the row's car is the same year and the typed words with the variant added, resolved by the same resolver, read by oneEngineAnswer with the same refine a typed mileage makes (withTypedMileage),
// so its range and its sales are the cluster and the pool of the answer Market Check gives when that car is asked for: same pool, same years, same mileage band, same set asides. A variant the engine cannot price on its own sales (its page reads every variant together,
// variants.thin) gets its label and its own sales count and no range: better nothing than a fake number. Replicas and tributes are set aside by the pool and are no row; the sales that name no variant are no row.
import { resolveVehicle as realResolve, sanitizeResolvedVehicle } from "./vehicle.js";
import { findGeneration } from "./generations.js";
import { oneEngineAnswer, variantsApart, withTypedMileage, carStampOf, moneyOf, ENGINE_VERSION } from "./onebox.js";
import { familiesOf, UNSTATED } from "./variants.js";
import { carWords } from "./carToken.js";
import { countNoun } from "./countNoun.js";
import { reasonLine } from "./reasonWords.js";

let RESOLVER = null;   // a check only: the resolver the rows use (the real one reads the live taxonomy tables, which a fake archive has not)
export const __setResolver = f => { RESOLVER = typeof f === "function" ? f : null; };
const cache = new Map(), TTL_MS = 10 * 60 * 1000;
export const __clearVariantRowsCache = () => cache.clear();
const NONE = { show: false, line: null, rows: [] };
// THE REASON (lane-b-variant-rows-2, crew only): why a split is not shown, as a code and numbers (per variant: sales, middle half p25 to p75, median), so a live read says which condition failed; never listing text
const qt = (a, q) => { const s = [...a].sort((x, y) => x - y); if (!s.length) return null; const i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return Math.round(s[lo] + (s[hi] - s[lo]) * (i - lo)); };
export const statsOf = groups => [...groups.entries()].map(([name, a]) => ({ name, n: a.length, p25: qt(a, 0.25), median: qt(a, 0.5), p75: qt(a, 0.75) }));
const none = (code, ctx, more) => ({ ...NONE, ...(ctx && ctx.crew ? { why: { code, ...(more || {}) } } : {}) });
// the range a read shows: the cluster as the page prints it, or null
export const rangeTextOf = d => d && d.tier === "result" && Array.isArray(d.cluster) && d.cluster.length === 2 && Number(d.cluster[0]) > 0 && Number(d.cluster[1]) > 0 ? `${moneyOf(d.cluster[0])} to ${moneyOf(d.cluster[1])}` : null;
export const salesCountOf = d => { const n = Number(d && (d.poolN != null ? d.poolN : d.soldCount)); return Number.isFinite(n) ? n : 0; };

export async function variantSplitFor(d, ctx, vehicle, generation, env, deps = {}) {
  try {
    if (!d || typeof d !== "object" || d.tier !== "result" || !d.variants || d.variants.applied || (d.variants.stated || []).length || d.variants.chosen) return d;
    const refine = ctx && ctx.refine, onlyMiles = !refine || Object.entries(refine).every(([k, v]) => v == null || v === "" || k === "miTarget" || k === "miMin" || k === "miMax" || k === "miBand");
    if (!onlyMiles || Number(ctx && ctx.asked) > 0 || !vehicle || !vehicle.make) return { ...d, variantSplit: none(!onlyMiles ? "refine_is_not_miles" : Number(ctx && ctx.asked) > 0 ? "already_asked" : "no_make", ctx) };
    const fam = familiesOf().find(f => f.id === d.variants.familyId); if (!fam) return { ...d, variantSplit: none("family_not_in_list", ctx, { familyId: d.variants.familyId || null }) };
    const typedMiles = Number(vehicle.mileage) > 0 ? Math.round(Number(vehicle.mileage)) : null, key = JSON.stringify([fam.id, vehicle.year || null, vehicle.model, typedMiles, ENGINE_VERSION, env && env.supabaseUrl]), hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return { ...d, variantSplit: hit.split.why && !(ctx && ctx.crew) ? NONE : hit.split };
    // THE ONE POOL (lane-b-variant-split-2): every variant is read as its own page reads it (the engine's answer for the same year and typed words with the variant added, the same refine, the same fence); that answer's pool is what the row prints
    // AND what decides whether the variants sell apart (the variant question's own test, middle halves clear of each other). The census of the unstated car (variantCensusFor) is no longer the test: it is the unstated car's fenced pool, which sets aside the very variants
    // that sell apart (live, 1987 Pontiac Firebird: the 20th Anniversary Turbo Trans Am read 0, the GTA a median of $15,950 where its own page reads $24,000), so a test on it never passed.
    const resolve = deps.resolveVehicle || RESOLVER || realResolve, base = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" "), groups = new Map();
    const rows = await Promise.all(fam.variants.map(async v => {
      const words = `${base} ${v.ask || v.name}`, r = await resolve(words, {}).catch(() => null), rv0 = r && r.vehicle && r.vehicle.make && r.vehicle.model ? r.vehicle : null;
      if (!rv0) return { name: v.name, label: v.name, priced: false, rangeText: null, salesText: countNoun(0, "sale"), mileageNote: null, car: null };
      const rv = { ...(sanitizeResolvedVehicle(rv0) || rv0), variant: v.name, ...(typedMiles ? { mileage: typedMiles } : {}) }, gen = await findGeneration(rv, env).catch(() => null), text = typedMiles ? `${words} ${typedMiles.toLocaleString("en-US")} miles` : words;
      const a = await oneEngineAnswer(rv, gen, text, { ...env, asked: 0 }, withTypedMileage(rv, null)).catch(() => null), raw = a && a.raw;
      const st = carStampOf(rv, env), w = carWords(rv), thin = !!(raw && raw.variants && raw.variants.thin), range = thin ? null : rangeTextOf(raw);
      const prices = !thin && raw && raw.tier === "result" && Array.isArray(raw.rawPool) ? raw.rawPool.map(x => Number(x && (x._usd ?? x._allin ?? x._hammer))).filter(u => u > 0) : [];
      groups.set(v.name, prices);
      // the sales that variant's page counts: its pool when it is priced, its own pooled count when its page reads every variant together (thin), else its pool's count
      const n = range ? salesCountOf(raw) : (thin && Number.isFinite(Number(raw.variants.pooled)) ? Number(raw.variants.pooled) : (raw ? salesCountOf(raw) : 0));
      return { name: v.name, label: v.name, priced: !!range, rangeText: range, salesText: countNoun(n, "sale"), mileageNote: range && raw && typeof raw.mileageLine === "string" ? raw.mileageLine : null, car: st ? { token: st.token, words: text, address: "/market-check?q=" + encodeURIComponent(text), line: st.line, short: st.short } : null };
    }));
    if (!variantsApart(groups)) { const no = none("variants_do_not_sell_apart", { crew: true }, { variants: statsOf(groups) }); cache.set(key, { at: Date.now(), split: no }); return { ...d, variantSplit: ctx && ctx.crew ? no : NONE }; }
    const nRep = Number(d.replicasAside) > 0 ? Math.round(Number(d.replicasAside)) : 0;
    const split = { show: true, line: reasonLine("variant.split_line", { model: (d.resolvedCar && (d.resolvedCar.nameModel || d.resolvedCar.model)) || vehicle.model }), rows, asideLine: nRep ? reasonLine("variant.replicas_aside", { n: nRep }) : null };
    cache.set(key, { at: Date.now(), split });
    return { ...d, variantSplit: split };
  } catch { return d; }
}
