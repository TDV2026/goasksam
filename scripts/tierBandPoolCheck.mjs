// CONDITION TIER BAND POOL (Lane B, Nov 5 2026, ct3). No database, no network. Must hold, for EVERY make with curated generations, not only the Porsche 911 example:
//  (1) one car, one pool: sales of one nameplate filed under different model values (911 / 996 / 997, Corvette / C3, 3-Series / E30 ...) fall in ONE band pool when they are the same family and generation;
//  (2) different generations of one family are different pools (a 1970 911 and a 2015 911 are not banded against each other); a year no generation covers reads the whole family;
//  (3) the pool filter is the Desk's (make + model_family) with the generation's years; a sale with no family reads its raw model; no make or model has no pool;
//  (4) THE JOB: two sales with the same text and miles, filed under "911" and "996", get the same tier, and a pool's quartiles are read once for both;
//  (5) the version is ct3 (the engine reads only the current version, so ct2 rows are re-tiered, never mixed).
// Prints the sweep: every make and model whose raw values fold into one family (the split the job used to see).
//   node scripts/tierBandPoolCheck.mjs [repo root]        (a tree without lib/tierPool.js fails it)
import path from "node:path";
import { pathToFileURL } from "node:url";
const ROOT = path.resolve(process.argv[2] || path.join(path.dirname(new URL(import.meta.url).pathname), ".."));
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href).catch(() => null);
const P = await imp("lib/tierPool.js"), T = await imp("lib/conditionTier.js"), J = await imp("scripts/assignConditionTier.mjs"), GEN = await imp("lib/generations.js"), FK = await imp("lib/desk/familyKey.js");
ok("lib/tierPool.js exists", !!P);
if (!P || !T || !J || !GEN || !FK) { console.log(`\n${failed} FAILED`); process.exit(1); }
const { poolOf, poolKeyOf, poolFilter } = P;
const row = (make, model, year, over = {}) => ({ make, model, year, listing_title: `${year} ${make} ${model}`, ...over });

// (1)+(2) the sweep over every curated generation row
const gens = GEN.CURATED_GENERATIONS;
const byFam = new Map();
for (const g of gens) { const k = `${g.make}|${g.model}`; (byFam.get(k) || byFam.set(k, []).get(k)).push(g); }
let foldedModels = 0, sameGenFail = [], splitFail = [];
const folded = [];
for (const [k, list] of byFam) {
  const [make, model] = k.split("|");
  for (const g of list) {
    const mid = Math.floor((g.yearStart + g.yearEnd) / 2);
    const base = poolOf(row(make, model, mid));
    if (!base) { sameGenFail.push(`${k} ${g.code}: no pool`); continue; }
    const tok = GEN.generationModelToken(g);                       // the chassis code OCD files some of these cars under (996, 997, e46, R32 ...)
    for (const alias of [tok, g.code].filter(x => x && x.toLowerCase() !== model.toLowerCase())) {
      const fam = FK.deskModelFamily({ make, model: alias, title: `${mid} ${make} ${alias}` });
      const other = poolOf(row(make, alias, mid));
      if (fam && fam.toLowerCase() === String(base.family).toLowerCase()) { foldedModels++; folded.push(`${make} ${model}: "${alias}" -> same pool as "${model}" (${base.key})`); if (!other || other.key !== base.key) sameGenFail.push(`${k} "${alias}" ${mid}: ${other && other.key} vs ${base.key}`); }
    }
  }
  // different generations of the family are different pools (only where the generation rows do not overlap)
  const keys = new Map();
  for (const g of list) { const mid = Math.floor((g.yearStart + g.yearEnd) / 2); const p = poolOf(row(make, model, mid)); if (!p) continue; (keys.get(p.key) || keys.set(p.key, []).get(p.key)).push(g.code); }
  const codes = new Set(list.map(g => g.code));
  if (codes.size > 1 && keys.size < 2) splitFail.push(`${k}: ${codes.size} generations share one pool`);
}
for (const l of folded.slice(0, 400)) console.log("  fold  " + l);
console.log(`  sweep: ${byFam.size} make+model families with curated generations, ${foldedModels} raw model values that fold into their family's pool`);
ok(`(1) every raw model value that the Desk folds into a family lands in that family's pool at the same year (${foldedModels} checked over ${byFam.size} families)`, sameGenFail.length === 0 && foldedModels > 0, sameGenFail.slice(0, 3).join("; "));
ok("(2) generations of one family are different pools", splitFail.length === 0, splitFail.slice(0, 3).join("; "));
const p03 = poolOf(row("Porsche", "911", 2003)), p03b = poolOf(row("Porsche", "996", 2003)), p15 = poolOf(row("Porsche", "911", 2015)), p70 = poolOf(row("Porsche", "911", 1970));
ok("(1) Porsche 911 / 996 of 2003: one pool", !!p03 && p03.key === (p03b && p03b.key), `${p03 && p03.key} | ${p03b && p03b.key}`);
ok("(2) a 1970, a 2003 and a 2015 911 are three pools", new Set([p70.key, p03.key, p15.key]).size === 3, [p70.key, p03.key, p15.key].join(" | "));
const gap = poolOf(row("Porsche", "911", 1989));
ok("(2) 1989 (a handover year left unmapped on purpose) reads the whole family", gap.key === "Porsche|911|*" && !gap.code && !/year=/.test(poolFilter(gap)), gap.key);
ok("(2) a sale with no year reads the whole family", poolOf(row("Porsche", "911", null)).key === "Porsche|911|*");
// (3) filters
const f03 = poolFilter(p03);
ok("(3) the pool filter is make + model_family + the generation's years", /^make=eq\.Porsche&model_family=eq\.911&year=gte\.\d{4}&year=lte\.\d{4}$/.test(f03), f03);
ok("(3) a sale with no family reads its raw model, as ct2 did", (() => { const p = poolOf(row("Foo", "Coupe", 2000)); return p && p.key === "Foo|model|Coupe" && poolFilter(p) === "make=eq.Foo&model=eq.Coupe"; })(), JSON.stringify(poolOf(row("Foo", "Coupe", 2000))));
ok("(3) no make or no model has no pool", poolOf({ make: "Porsche", model: "" }) === null && poolOf({ model: "911" }) === null && poolOf(null) === null);
ok("(3) the pool key does not depend on the sale's own year inside a generation", poolOf(row("Porsche", "911", 2000)).key === poolOf(row("Porsche", "996", 2004)).key);
// (4) the job
const env = { supabaseUrl: "https://fake.example", supabaseKey: "k" };
const mk = (i, model) => ({ id: "00000000-0000-4000-8000-" + String(i).padStart(12, "0"), year: 2003, make: "Porsche", model, listing_title: `2003 Porsche ${model}`, description: "One owner, service records, no accidents.", mileage_text: String(3000 + (i % 40) * 2500), stated_mileage: null, title_status: "Clean", modifications: null, project_flag: null, condition_version: null });
const ROWS = Array.from({ length: 80 }, (_, i) => mk(i + 1, i % 2 ? "911" : "996"));
const written = new Map(); let bandReads = 0; const bandFilters = [];
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url)), sp = u.searchParams;
  if (u.pathname.endsWith("/rpc/set_condition_tiers")) { for (const x of JSON.parse(init.body).p) { written.set(x.id, x); ROWS.find(r => r.id === x.id).condition_version = x.version; } return new Response("1", { status: 200 }); }
  if (u.pathname.endsWith("/sales_archive")) {
    if (sp.get("select") === "mileage_text") { bandReads++; bandFilters.push(u.search); const fam = sp.get("model_family"), model = sp.get("model");
      const hit = ROWS.filter(r => (!sp.get("make") || r.make === sp.get("make").slice(3)) && (fam ? FK.deskModelFamily({ make: r.make, model: r.model, title: r.listing_title }) === fam.slice(3) : model ? r.model === model.slice(3) : true));
      return new Response(JSON.stringify(hit.map(r => ({ mileage_text: r.mileage_text }))), { status: 200 }); }
    const cv = sp.get("condition_version") || "", gt = (sp.get("id") || "").replace("gt.", ""), lim = Number(sp.get("limit") || 100);
    const mk2 = (sp.get("make") || "").replace(/^(eq|ilike)\./, ""), md = (sp.get("model") || "").replace(/^(eq|ilike|gt)\./, "");
    let todo = ROWS.filter(r => r.id > gt && (!mk2 || r.make.toLowerCase() === mk2.toLowerCase()) && (!sp.get("model") || !/^eq\.|^ilike\./.test(sp.get("model")) || r.model.toLowerCase() === md.toLowerCase()) && (/is\.null/.test(cv) ? r.condition_version == null : /neq\./.test(cv) ? r.condition_version !== cv.slice(4) : true));
    if (sp.has("or")) todo = [];
    todo = todo.sort((a, b) => (a.model < b.model ? -1 : a.model > b.model ? 1 : a.id < b.id ? -1 : 1)).slice(0, lim);
    return new Response(JSON.stringify(todo), { status: 200 });
  }
  return new Response("[]", { status: 200 });
};
await J.runJob({ env, log: () => {}, sleep: async () => {}, now: () => 0, batch: 100, pause: 0, priority: [] });
const t911 = ROWS.filter(r => r.model === "911").map(r => written.get(r.id)), t996 = ROWS.filter(r => r.model === "996").map(r => written.get(r.id));
ok("(4) every sale was tiered", written.size === ROWS.length, `${written.size}/${ROWS.length}`);
const bandsOf = ROWS.map(r => r.mileage_text);
const expect = r => T.assignTier(r, T.modelMileBands(bandsOf));
ok("(4) '911' and '996' sales of 2003 are banded on one pool: each tier equals assignTier on the pooled quartiles", ROWS.every(r => { const w = written.get(r.id), e = expect(r); return w && w.tier === e.tier && JSON.stringify(w.evidence) === JSON.stringify(e.evidence); }));
ok("(4) the pool's quartiles were read once for both model values", bandReads === 1, `${bandReads} band reads: ${bandFilters.join(" , ").slice(0, 160)}`);
ok("(4) the band read is the family pool, not a raw model", bandFilters.length > 0 && bandFilters.every(f => /model_family=eq\.911/.test(f) && /year=gte\./.test(f)), bandFilters[0]);
// (5) version
ok("(5) the version is ct3, and every stored tier carries it", /^ct3-/.test(T.TIER_VERSION) && [...written.values()].every(w => w.version === T.TIER_VERSION));
console.log(failed ? `\n${failed} FAILED` : "\ntierBandPoolCheck: all passed");
process.exit(failed ? 1 : 0);
