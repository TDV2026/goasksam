// EVERY TAXONOMY MODEL WITH SALES EITHER HAS YEARS OR SITS IN A NAMED BUCKET, AND NO YEARS WE HAVE GO UNUSED (Lane B, Oct 29 2026).
// The read of the taxonomy (task taxonomyyears): 1,259 models, 22 with production years, 1,237 without. After the calculator list and the curated rules, 861 had none. Why (scripts/fillModelYears.mjs and lib/modelYears.js), each in one bucket:
//   noise (d) not a car model (a listing title, a list of models, a motorcycle): never offered;  exact (b) in the calculator list under another spelling (exact after folding case, accents, hyphens, spaces): its years;
//   variant (c) a named variant of a model that has years: its parent's years;  absent (a) not in the calculator list: years from a public source where the name matches exactly and our sales agree, else offered only on sales in the window.
// This check: (1) every one of the calculator's entries, as a taxonomy model with no years of its own, is offered in a year inside its span with no sales at all, and not in a year outside it (the list's years are USED);
// (2) each bucket behaves as above; (3) the filled file records a source and a date for every model, and no model is both filled and unfilled; (4) the bucket record sums to the models it lists, each in one bucket.
//   node scripts/modelYearsBucketCheck.mjs [repo root]
import fs from "node:fs";
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2";
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const imp = f => import(pathToFileURL(path.join(root, f)).href).catch(() => null);
const V = await imp("lib/vehicle.js"), C = await imp("lib/calculatorYears.js"), M = await imp("lib/modelYears.js");
ok("lib/modelYears.js exists", !!M);
const D = await imp("lib/vehicleData.js");
const foldC = x => String(x).toLowerCase().replace(/[^a-z0-9]/g, "");
const curated = (make, name) => D && D.PRODUCTION_RULES.some(r => foldC(r.make) === foldC(make) && (foldC(r.model) === foldC(name) || (r.aliases || []).some(a => foldC(a) === foldC(name))));   // a curated rule decides these, not the list
const calc = JSON.parse(fs.readFileSync("data/calculatorModelYears.json", "utf8")).makes;
// 1. every calculator entry is used
let used = 0, unused = [], offAsked = 0, offBad = [];
for (const [make, list] of Object.entries(calc)) {
  if (/^unknown/i.test(make)) continue;
  for (const [name, a, b] of list) {
    if ((C && C.chipYearOverride(make, name)) || /replica|tribute|recreation/i.test(name)) continue;   // posted overrides and non-cars are not offered from the list
    const tax = [{ name, yearRanges: null }];
    const inside = V ? V.buildAskModels(tax, [], make, Math.round((a + b) / 2)) : null;
    if (inside && inside.models.some(m => m.model === name)) used++; else unused.push(`${make} ${name} ${a}-${b}`);
    const span = V && V.productionFill ? V.productionFill(make, name) : null;   // the calculator's spans and the curated generation spans, the list the engine uses
    if (span && !curated(make, name) && b + 5 <= 2026 && !span.some(([x, y]) => b + 5 >= x && b + 5 <= y)) { offAsked++; const out = V.buildAskModels(tax, [], make, b + 5); if (out.models.some(m => m.model === name)) offBad.push(`${make} ${name} offered in ${b + 5}`); }
  }
}
ok(`the calculator's years are used: ${used} of ${used + unused.length} entries are offered inside their span with no sales`, !!V && !!C && unused.length === 0, unused.slice(0, 4).join(" | "));
ok(`and not outside it (${offAsked} entries asked five years past their end)`, offBad.length === 0, offBad.slice(0, 3).join(" | "));
// 2. each bucket
if (V && M) {
  const nz = V.buildAskModels([{ name: "Other Motorcycles", yearRanges: null }, { name: "Civic", yearRanges: [[1972, 2026]] }], Array.from({ length: 30 }, () => ({ model: "Other Motorcycles", model_family: "Other Motorcycles" })), "BMW", 1990);
  ok("noise: a motorcycle or a listing title is never offered, whatever its sales", !nz.models.some(m => /motorcycle/i.test(m.model)));
  const ex = [V.buildAskModels([{ name: "Huracán", yearRanges: null }], [], "Lamborghini", 2016), V.buildAskModels([{ name: "Huracán", yearRanges: null }], [], "Lamborghini", 2010)];
  ok("exact: Huracán (the list spells it Huracan) is offered in 2016 with no sales and not in 2010", ex[0].models.length === 1 && ex[1].models.length === 0, JSON.stringify([ex[0].models.map(m => m.model), ex[1].models.map(m => m.model)]));
  const va = V.buildAskModels([{ name: "Land Cruiser", yearRanges: [[1951, 2026]] }, { name: "Land Cruiser 60 Series", yearRanges: null }], [], "Toyota", 1985);
  ok("variant: Land Cruiser 60 Series inherits the Land Cruiser's years and is ONE chip with it", va.models.length === 1 && va.models[0].model === "Land Cruiser", JSON.stringify(va.models.map(m => m.model)));
  const ab = [V.buildAskModels([{ name: "Vigor", yearRanges: null }], [], "Acura", 1993), V.buildAskModels([{ name: "Vigor", yearRanges: null }], Array.from({ length: 9 }, () => ({ model: "Vigor", model_family: "Vigor" })), "Acura", 1993)];
  ok("absent: a model with no years anywhere is offered only when it has sales in the window", ab[0].models.length === 0 && ab[1].models.length === 1, JSON.stringify([ab[0].models.length, ab[1].models.length]));
  ok("bucketOf names each kind", M.bucketOf("Lamborghini", "Huracán", new Map()).bucket === "exact" && M.bucketOf("BMW", "Other Motorcycles", new Map()).bucket === "noise" && M.bucketOf("Acura", "Vigor", new Map()).bucket === "absent" && M.bucketOf("Toyota", "Land Cruiser 60 Series", new Map([["Land Cruiser", [[1951, 2026]]]])).bucket === "variant");
}
// 3. the filled file records source and date for every model; nothing is both filled and unfilled
{
  const fp = "data/modelYearsFilled.json", up = "data/modelYearsUnfilled.json";
  ok("the filled and unfilled records exist", fs.existsSync(fp) && fs.existsSync(up));
  if (fs.existsSync(fp) && fs.existsSync(up)) {
    const f = JSON.parse(fs.readFileSync(fp, "utf8")).models, u = JSON.parse(fs.readFileSync(up, "utf8")).unfilled; let n = 0, bad = 0, both = 0;
    for (const [mk, ms] of Object.entries(f)) for (const [name, e] of Object.entries(ms)) { n++; if (!(e.source && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && Array.isArray(e.ranges) && e.ranges.length)) bad++; if (u.some(x => x.make.replace(/-/g, "") === mk && x.name === name)) both++; }
    ok(`every filled model records its source and date (${n} filled)`, bad === 0, `${bad} without`);
    ok("no model is both filled and unfilled", both === 0);
    ok("every unfilled model says why", u.every(x => x.why && x.why.length > 10), `${u.length} unfilled`);
  }
}
// 4. the bucket record
{
  const bp = "data/modelYearBuckets.json"; ok("the bucket record exists", fs.existsSync(bp));
  if (fs.existsSync(bp)) { const b = JSON.parse(fs.readFileSync(bp, "utf8")), keys = b.models.map(x => x.make + "|" + x.name), uniq = new Set(keys);
    ok("each row is in exactly one bucket and the counts add up (the taxonomy lists a few names twice: Huracán, Murciélago)", Object.values(b.counts).reduce((t, x) => t + x, 0) === b.models.length && b.models.every(x => ["noise", "exact", "variant", "absent"].includes(x.bucket)), JSON.stringify(b.counts)); }
}
console.log(fail ? `modelYearsBucketCheck: ${fail} failure(s)` : "modelYearsBucketCheck: all pass");
process.exit(fail ? 1 : 0);
