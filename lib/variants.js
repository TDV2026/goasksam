// THE VARIANTS OF A FAMILY (Lane B, lane-b-variant-split, Nov 17 2026; order bc85). Hagerty's analysts found a third generation Pontiac Firebird comes back as ONE market (base, Formula, Trans Am, GTA together), although the variants price apart:
// the GTA was an option package on the Trans Am, so it is in no VIN, only in each sale's own words. ONE reader, here, for every caller: a sale's variant is read from its title and details against the family's variant list in data/variantFamilies.json
// (data, not code); the car being priced takes its variant from the VIN where a family has a VIN rule, else from the typed or seller's words, else it is UNSTATED. The pool rules (lib/onebox.js reads this module and nothing else decides):
//   1. a sale that names no variant of its family is "unstated". It is NEVER counted as base.
//   2. THE PACKAGE RULE (chosen, stated): a package (the GTA on the Trans Am, the IROC-Z on the Z28) is its OWN variant. When the parent is asked for, the package is SET ASIDE, unless the parent's entry says includesPackages true. Why: the packages in the lists
//      price apart from their parents (24 months: GTA $24,000 against $31,250 for the Trans Am that names no package; IROC-Z $22,125 against $14,700 for the Z28 that names no IROC), and the order's own line reads "Priced on Trans Am sales. GTA, Formula and base are set aside."
//      A family where a package sells as the parent flips the flag in the data.
//   3. a car whose variant is unstated is priced on every variant, exactly as before.
//   4. fewer than VARIANT_MIN sales in the variant's pool: every variant is read together and one line says so (the fallback is made by lib/onebox.js runOneBox, which reads again with the variant filter off).
//   5. the analyst's chosen set (variant_set) replaces the car's own variant; "unstated" may be in the set.
import FAMILIES from "../data/variantFamilies.json" with { type: "json" };
import { reasonLine } from "./reasonWords.js";
import { isCrewRequest } from "./_crew.js";
export const VARIANT_MIN = 5;
// THE SWITCH (lane-b-variant-split-4, Nov 18 2026, Sam: the trim cards go public): while true a visitor is served the split exactly as the crew is (the cards, no qualifying question); false returns it to the crew only. The crew's `why` diagnostics stay crew only either way.
export const VARIANT_SPLIT_PUBLIC = true;
export const splitServed = req => VARIANT_SPLIT_PUBLIC === true || isCrewRequest(req) === true;
export const UNSTATED = "Unstated";
const norm = x => String(x || "").toLowerCase().replace(/[^a-z0-9]/g, "");
// THE ORDER OF A LIST IS THE ORDER A PAGE SHOWS (lane-b-variant-split-2). A sale is read against the list MOST SPECIFIC FIRST: a package (the GTA is a package on the Trans Am) or a variant marked matchFirst is tried before the rest, each group in list order, so the list can read in the order a buyer expects (Base, Formula, Trans Am, GTA) and still read a GTA as a GTA.
// unnamedIs (a family's variant name, optional): the variant a sale that names no variant of its list is read as ("Base" for the Firebird: a Firebird sale that does not say Formula, Trans Am, GTA, Firehawk or the anniversary car is the plain car); without it such a sale is "unstated", never base.
const compile = f => { const variants = (f.variants || []).map(v => ({ ...v, res: (v.words || []).map(w => new RegExp(w, "i")) })); const first = variants.map((v, i) => ({ v, i })).filter(x => x.v.package || x.v.matchFirst).sort((a, b) => (a.v.matchRank ?? 99) - (b.v.matchRank ?? 99) || a.i - b.i).map(x => x.v);   // matchRank (optional, lower first) orders the variants tried first when list order is not the order of specificity (a Turbo Cabriolet is a Turbo)
  return { ...f, variants, matchList: [...first, ...variants.filter(v => !(v.package || v.matchFirst))] }; };
let COMPILED = null;
let OVERRIDE = null;
export const __useFamilies = list => { OVERRIDE = Array.isArray(list) ? list.map(compile) : null; };   // a check only: an empty list is the engine as it was before the variants (the control of variantSplitCheck)
export const familiesOf = (list = null) => { if (list) return list.map(compile); if (OVERRIDE) return OVERRIDE; if (!COMPILED) COMPILED = (FAMILIES.families || []).map(compile); return COMPILED; };
// the family a make, model and year (or a year span) belong to, or null
export function familyOf(make, model, year, list = null) {
  const mk = norm(make), md = norm(model); if (!mk || !md) return null;
  const y = Array.isArray(year) ? year.map(Number).filter(Number.isFinite) : (Number.isFinite(Number(year)) && year != null ? [Number(year)] : []);
  return familiesOf(list).find(f => norm(f.make) === mk && (f.models || []).some(m => md === norm(m)) && (!y.length || y.some(v => v >= f.years[0] && v <= f.years[1]) || y.length === 2 && y[0] < f.years[0] && y[1] > f.years[1])) || null;
}
const textOf = r => [r.raw_title, r.rtitle, r.title, r.model].filter(Boolean).join(" ");
// the variant a piece of text names: the first of the family's variants (most specific first) whose words it holds; null when it names none
export function variantNamed(fam, text) { const t = String(text || ""); const v = (fam.matchList || fam.variants).find(x => x.res.some(re => re.test(t))); return v ? v.name : null; }
// a sale's variant, from its own title and details
export const variantOfSale = (fam, row) => variantNamed(fam, textOf(row || {})) || (fam.unnamedIs && fam.variants.some(v => v.name === fam.unnamedIs) ? fam.unnamedIs : UNSTATED);
// the car's variant: the VIN where the family has a rule that reads it, else the typed or seller's words, else unstated (null names)
export function variantOfCar(fam, { vehicle = {}, text = "", vin = null } = {}) {
  const v0 = String(vin || vehicle.vin || "").toUpperCase();
  const rule = fam && fam.vin;
  if (rule && v0.length === 17 && Number(rule.pos) > 0) {
    const y = Number(vehicle.year), okYear = !Array.isArray(rule.years) || !Number.isFinite(y) || (y >= rule.years[0] && y <= rule.years[1]), name = okYear ? rule.map && rule.map[v0[Number(rule.pos) - 1]] : null;
    if (name && fam.variants.some(x => x.name === name)) return { names: [name], source: "vin" };
  }
  const words = [vehicle.trim, vehicle.edition, vehicle.variant, vehicle.series, text].filter(Boolean).join(" ");
  const named = variantNamed(fam, words);
  return named ? { names: [named], source: "words" } : { names: [], source: null };
}
// the names that count as the pool when these variants are asked for: each asked variant, plus the packages of an asked variant that includesPackages
export function poolNames(fam, asked) {
  const set = new Set();
  for (const n of asked || []) { const hit = n === UNSTATED ? UNSTATED : (fam.variants.find(v => norm(v.name) === norm(n)) || {}).name; if (!hit) continue; set.add(hit); const def = fam.variants.find(v => v.name === hit); if (def && def.includesPackages) for (const p of fam.variants) if (p.package === hit) set.add(p.name); }
  return [...set];
}
// the spec's variant fields (lib/onebox.js buildSpec): what the typed car asks for. Nothing when the family is not in the data or no variant is named.
export function variantSpecOf(vehicle, searchText, list = null) {
  const fam = familyOf(vehicle && vehicle.make, vehicle && vehicle.model, vehicle && (vehicle.year != null ? vehicle.year : vehicle.yearRange), list); if (!fam) return null;
  const car = variantOfCar(fam, { vehicle: vehicle || {}, text: searchText || "" }); if (!car.names.length) return { variantFamily: fam.id };
  return { variantFamily: fam.id, variantStated: car.names, variantSet: poolNames(fam, car.names), variantSource: car.source };
}
const joinAnd = a => a.length <= 1 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1];
const noun = n => n === UNSTATED ? "sales that name no variant" : n;
// the pool of a read: rows is the qualified pool; spec carries the asked set. Returns { rows, info } where info is the census (counts of every variant found) whatever was applied.
export function applyVariants(rows, spec, { off = false, list = null, census = null } = {}) {
  const fam = spec && spec.variantFamily ? familiesOf(list).find(f => f.id === spec.variantFamily) : null; if (!fam || !Array.isArray(rows)) return { rows, info: null };
  const kinds = [...fam.variants.map(v => v.name), UNSTATED], counts = Object.fromEntries(kinds.map(k => [k, 0])), of = new Map();
  for (const r of rows) of.set(r, variantOfSale(fam, r));
  for (const r of (Array.isArray(census) ? census : rows)) counts[Array.isArray(census) ? variantOfSale(fam, r) : of.get(r)]++;   // the census is every variant of the family in the read; when the car's own trim narrowed the fetch it is a second read without that narrowing
  const asked = Array.isArray(spec.variantSet) && spec.variantSet.length ? spec.variantSet : null;
  const set = asked && !off ? new Set(asked) : null;
  const kept = set ? rows.filter(r => set.has(of.get(r))) : rows;
  const info = { familyId: fam.id, family: fam.label, source: spec.variantSource || null, stated: spec.variantStated || [], chosen: spec.variantChosen || null, asked: asked || [], applied: !!set, total: Array.isArray(census) ? census.length : rows.length, counts, inPool: kinds.filter(k => !set || set.has(k)), pooled: kept.length, off: !!off };
  return { rows: kept, info };
}
// THE SALES A READ IS BUILT ON, BY VARIANT (lane-b-variant-3): the census counts every sale of the family the read found (the widest fetch: every year, every gearbox); the pool is what the figures are read on (the landed rung, the window and the gearbox of a case). Two counts, two scopes, both served.
export function poolCountsOf(fam, rows) { const c = {}; for (const r of Array.isArray(rows) ? rows : []) { const k = variantOfSale(fam, r); c[k] = (c[k] || 0) + 1; } return c; }
// desk.variants: the contract the pages read (fields in docs/lane-notes.md). Pages compute nothing: every count, flag and line is made here.
export function variantsBlock(info, { thin = false, list = null } = {}) {
  if (!info) return null;
  const fam = familiesOf(list).find(f => f.id === info.familyId); if (!fam) return null;
  const pc = info.poolCounts || null, items = [...fam.variants.map(v => ({ name: v.name, package: v.package || null })), { name: UNSTATED, package: null }].map(it => ({ name: it.name, key: norm(it.name), count: info.counts[it.name] || 0, pool: pc ? (pc[it.name] || 0) : null, inPool: !thin && info.inPool.includes(it.name), package: it.package }));
  const inNames = items.filter(i => i.inPool).map(i => i.name), out = items.filter(i => !i.inPool && i.count > 0).map(i => i.name);
  let line, thinLine = null;
  if (thin) { const asked = info.asked.map(noun); thinLine = reasonLine("desk4.variant_thin", { count: info.pooled, names: joinAnd(asked), sales: info.pooled === 1 ? "sale" : "sales" }); line = thinLine; }
  else if (info.applied) line = reasonLine("desk4.variant_priced", { names: joinAnd(inNames.map(noun)), aside: out.length ? joinAnd(out.map(noun)) : null, were: out.length === 1 ? "is" : "are" });
  else line = reasonLine("desk4.variant_all", {});
  const poolTotal = Number.isFinite(Number(info.poolTotal)) ? Number(info.poolTotal) : null;
  const scopeLine = poolTotal != null ? reasonLine("variant.scope", { census: info.total, sales: info.total === 1 ? "sale" : "sales", pool: poolTotal, window: info.window || "" }) : null;
  return { family: info.family, familyId: info.familyId, source: info.chosen ? "analyst" : info.source, stated: info.stated, chosen: info.chosen, applied: !thin && info.applied, thin: !!thin, thinLine, pooled: Number.isFinite(Number(info.pooled)) ? Number(info.pooled) : null, total: info.total, poolTotal, scopeLine, items, line };
}
// the set an analyst chose, checked against the family: only names the family holds ("Unstated" too); null when nothing valid is left
export function chosenSet(famId, names, list = null) { const fam = familiesOf(list).find(f => f.id === famId); if (!fam || !Array.isArray(names)) return null; const ok = [...new Set(names.map(n => norm(n) === norm(UNSTATED) ? UNSTATED : (fam.variants.find(v => norm(v.name) === norm(n)) || {}).name).filter(Boolean))]; return ok.length ? ok : null; }

// THE KEY OF A VARIANT IN A QUESTION (lane-b-variant-2): the chip of the engine's variant question sends refine.variant = "fv-" + the variant's name as a slug; the prefix keeps it clear of the variant markets of lib/modelRules.js (the Alfa GTA is not the Pontiac GTA)
export const VARIANT_KEY_PREFIX = "fv-";
export const variantKey = name => VARIANT_KEY_PREFIX + String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
export const variantKeyShape = k => typeof k === "string" && /^fv-[a-z0-9-]{1,48}$/.test(k);
// the variant a chip's key names in a family, or null
export function variantOfKey(fam, key) { if (!fam || !variantKeyShape(key)) return null; const hit = [...fam.variants.map(v => v.name), UNSTATED].find(n => variantKey(n) === key); return hit || null; }
