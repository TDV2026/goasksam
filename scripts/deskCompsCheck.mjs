// clock: real-ok the fixture sales are dated relative to now (days ago); no calendar date is asserted (Lane B, Nov 2026)
// DESK V3 STAGE 2, COMPARABLES AND OUTSIDE GROUPS (Lane B, Nov 8 2026). desk.comparables sorted by relevance (close, similar), desk.outside one entry per excluded gearbox group:
//   (1) relevance comes from the verified year, generation, body, gearbox and miles distance, never the model name: the same model in another generation (or body) is not a comparable
//   (2) every why is a reason table line, and no sentence is typed in the module
//   (3) photo is the URL that passed the photo rule (HEAD, 200, image, under 600 KB) or null, never a placeholder
//   (4) a sale outside the population (another gearbox) is listed with inPopulation false and never counted in the evidence; an outside group under three sales gives no entry
//   node scripts/deskCompsCheck.mjs [root]     --mutants proves each rule by breaking it in a copy
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { fileURLToPath, pathToFileURL } from "node:url"; import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), rootArg = args.find(a => !a.startsWith("--")), ROOT = path.resolve(rootArg || path.join(here, ".."));
if (args.includes("--mutants")) {
  const DV = "lib/deskV3.js";
  const muts = [
    [DV, "if (!sub.generation || !r.generation || r.generation !== sub.generation) return null;", "if (!sub.generation || !r.generation) return null;", "(1) the same model in another generation is a comparable"],
    [DV, "if (!sub.body || !r.body || !sameBody(r.body, sub.body)) return null;", "", "(1) the same model in another body is a comparable"],
    [DV, "return Number(r.year) === Number(sub.year) && boxSame && near ? \"close\" : \"similar\";", "return \"close\";", "(1) every sale is close"],
    [DV, "if (!sub.generation || !r.generation || r.generation !== sub.generation) return null;", "if (!sub.generation || !r.generation || r.generation !== sub.generation) return (String(r.model) === String(sub.model) ? \"similar\" : null);", "(1) the model name alone makes a sale similar"],
    [DV, "return reasonLine(\"desk3.why_nomiles\", { year });", "return `${year}, no mileage on the listing.`;", "(2) a why sentence typed in the module"],
    [DV, "photo: photos[i] || null,", "photo: photos[i] || o.r.photo || \"/img/placeholder.png\",", "(3) a placeholder (or an unchecked photo) where the photo failed"],
    [DV, "const photos = await Promise.all(out.map(async (o, i) => (i < PHOTO_COMPS && o.r.photo ? await choosePhoto(photoCandidates({ photo_url: o.r.photo }), head || undefined) : null)));", "const photos = out.map(o => o.r.photo);", "(3) the photo rule is not applied"],
    [DV, "if (rel === \"other_box\") { rel = \"similar\"; inPop = false; }", "if (rel === \"other_box\") { rel = \"similar\"; inPop = true; }", "(4) an outside sale is marked in the population"],
    [DV, "export const OUTSIDE_MIN = 3;", "export const OUTSIDE_MIN = 1;", "(4) an outside group of one sale gets an entry"],
    [DV, "const id = diff === 0 ? \"desk3.outside_same\" : evidence.median > median ? \"desk3.outside_less\" : \"desk3.outside_more\";", "const id = diff === 0 ? \"desk3.outside_same\" : evidence.median > median ? \"desk3.outside_more\" : \"desk3.outside_less\";", "(4) the outside sentence says more where it is less"],
    [DV, "out.sort((a, b) => (a.rel === b.rel ? 0 : a.rel === \"close\" ? -1 : 1) || a.dist - b.dist ||", "out.sort((a, b) => 0 ||", "(1) comparables are not sorted by relevance"]
  ];
  let survivors = 0;
  for (const [file, from, to, want] of muts) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dcc-"));
    spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", ROOT + "/", dir + "/"]); fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"));
    const fp = path.join(dir, file), src = fs.readFileSync(fp, "utf8"), m = src.replace(from, to);
    if (m === src) { console.log(`MUTANT NOT APPLIED  ${want}`); survivors++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
    fs.writeFileSync(fp, m);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/deskCompsCheck.mjs"), dir], { encoding: "utf8" }), killed = r.status !== 0;
    console.log(`${killed ? "killed  " : "SURVIVED"}  ${want}`); if (!killed) survivors++;
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(survivors ? `\n${survivors} mutant(s) survived` : "\nall mutants killed"); process.exit(survivors ? 1 : 0);
}
process.chdir(ROOT);
let failed = 0, n = 0; const ok = (name, c, d) => { n++; if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${d ? "  " + d : ""}`); };
const W = await import(pathToFileURL(path.join(ROOT, "scripts/_deskV3World.mjs")).href);
const S = await import(pathToFileURL(path.join(ROOT, "lib/sheetRead.js")).href);
const DV = await import(pathToFileURL(path.join(ROOT, "lib/deskV3.js")).href);
const RW = await import(pathToFileURL(path.join(ROOT, "lib/reasonWords.js")).href);
const w = W.install(); console.error = () => {};
const today = new Date().toISOString().slice(0, 10);
const head = async u => (/x\d*[13579]\.jpg$/.test(u) ? { status: 200, bytes: 3100000, type: "image/jpeg" } : /x\d*0\.jpg$/.test(u) ? { status: 404, bytes: null, type: "" } : { status: 200, bytes: 90000, type: "image/jpeg" });
const read = (c, o = {}) => S.sheetRead(w.env, { year: c.year, make: c.make, model: c.model, mileage: o.mileage || 61400, ...o, desk: { caseDate: today, transmission: c.transmission, label: c.label, head } }, w.deps);
const pats = RW.reasonPatterns();
const inTable = (field, line) => pats.some(p => p.field === field && new RegExp(p.re.source.split("\\$NaN").join("\\$[\\d,]+")).test(line));
{ // (1) unit: the same model in another generation or body
  const sub = { year: 1999, model: "911", generation: "996", body: "coupe", gearbox: "manual", miles: 60000, tier: null };
  const row = (o = {}) => ({ id: "x" + Math.random(), year: 1999, generation: "996", body: "coupe", gearbox: "manual", gearboxWord: "Manual", miles: 60000, price: 40000, date: "2026-10-01", platform: "Bring a Trailer", model: "911", tier: null, inPopulation: true, ...o });
  ok("same year, generation, body, gearbox and miles: close", DV.relevanceOf(row(), sub) === "close");
  ok("the same model in the next generation is not a comparable", DV.relevanceOf(row({ generation: "997", year: 2005 }), sub) === null);
  ok("the same model with a verified generation missing is not a comparable", DV.relevanceOf(row({ generation: null }), sub) === null);
  ok("the same model in another body is not a comparable", DV.relevanceOf(row({ body: "open" }), sub) === null);
  ok("a different year of the same generation is similar", DV.relevanceOf(row({ year: 2000 }), sub) === "similar");
  ok("far miles of the same year is similar, not close", DV.relevanceOf(row({ miles: 110000 }), sub) === "similar");
  ok("an unstated gearbox is similar", DV.relevanceOf(row({ gearbox: null }), sub) === "similar");
  ok("another gearbox is listed apart (other_box)", DV.relevanceOf(row({ gearbox: "automatic" }), sub) === "other_box");
  ok("every why variant is a table line (miles known, tier apart, miles missing, gearbox not stated)", [DV.whyOf(row(), sub), DV.whyOf(row({ tier: 2 }), { ...sub, tier: 3 }), DV.whyOf(row({ miles: null }), sub), DV.whyOf(row({ gearbox: null }), sub)].every(x => inTable("desk.comparables.why", x)));
  ok("a missing mileage is said in words, not guessed", /miles not stated/.test(DV.whyOf(row({ miles: null }), sub)));
  const list = await DV.comparablesOf([row({ id: "a" }), row({ id: "b", generation: "997", year: 2005 }), row({ id: "c", body: "open" }), row({ id: "d", year: 2000, miles: 62000 })], sub, head);
  ok("a mixed list keeps the 996 coupes only, close first", list.length === 2 && list[0].id === "a" && list[0].relevance === "close" && list[1].id === "d");
}
const c0 = W.CASES[0], sh = await read(c0), ds = sh.desk;
ok("the 996 sheet read carries desk.comparables and desk.outside", Array.isArray(ds.comparables) && ds.comparables.length > 0 && Array.isArray(ds.outside));
ok("every comparable is the subject's generation and body (never the model name alone)", ds.comparables.every(c => c.generation === "996" && c.body === "coupe"), JSON.stringify(ds.comparables.filter(c => c.generation !== "996").slice(0, 1)));
ok("comparables are sorted close first", ds.comparables.every((c, i, a) => i === 0 || !(a[i - 1].relevance === "similar" && c.relevance === "close")));
ok("a close comparable is the same year", ds.comparables.filter(c => c.relevance === "close").every(c => c.year === 1999));
ok("every comparable carries the shape's fields", ds.comparables.every(c => ["id", "title", "year", "generation", "body", "transmission", "miles", "platform", "soldDate", "price", "url", "photo", "relevance", "why", "inPopulation"].every(k => k in c)));
{ for (const c of [W.CASES[1], W.CASES[2]]) { const r = await read(c), cs = r.desk.comparables;
    ok(`${c.model}: the generation comes from the curated generation list, so comparables are listed (all of the subject's generation)`, cs.length > 0 && cs.every(x => x.generation && x.generation === cs[0].generation), JSON.stringify(cs.slice(0, 1).map(x => [x.generation, x.year]))); } }
// (2)
ok("every why is a reason table line", ds.comparables.every(c => inTable("desk.comparables.why", c.why)), ds.comparables.find(c => !inTable("desk.comparables.why", c.why)) && ds.comparables.find(c => !inTable("desk.comparables.why", c.why)).why);
{ const src = fs.readFileSync(path.join(ROOT, "lib/deskV3.js"), "utf8").split("\n").filter(l => !/^\s*\/\//.test(l)).join("\n").replace(/\/\/.*$/gm, "");
  const typed = (src.match(/["'`][A-Z][a-z]+(?: [a-z,]+){3,}[^"'`]*["'`]/g) || []).filter(x => !/import|from /.test(x));
  ok("lib/deskV3.js types no sentence of its own", typed.length === 0, typed.slice(0, 2).join(" | ")); }
// (3)
ok("a photo is null or a URL that passed the photo rule", ds.comparables.every(c => c.photo === null || (/^https:\/\//.test(c.photo) && !/x\d*[13579]\.jpg$/.test(c.photo) && !/x\d*0\.jpg$/.test(c.photo))), JSON.stringify(ds.comparables.filter(c => c.photo).slice(0, 2).map(c => c.photo)));
ok("a photo that failed the rule is null (3.1 MB, 404), never a placeholder", ds.comparables.some(c => c.photo === null) && ds.comparables.some(c => c.photo) && ds.comparables.every(c => !/placeholder|noimage|default|blank/i.test(String(c.photo))));
// (4)
const out = ds.comparables.filter(c => !c.inPopulation), inn = ds.comparables.filter(c => c.inPopulation);
ok("the Tiptronic sales are listed with inPopulation false", out.length > 0 && out.every(c => /tiptronic/i.test(c.transmission)), String(out.length));
ok("no sale outside the population is inside it (the in-population list holds no Tiptronic)", inn.length > 0 && inn.every(c => !/tiptronic/i.test(c.transmission)));
ok("the evidence counts only the in-population comparables the meter draws", ds.evidence.count <= inn.length && ds.evidence.count >= inn.length - 6, `${ds.evidence.count} of ${inn.length}`);
ok("outside has one entry for Tiptronic with its own count, median and range", ds.outside.length === 1 && ds.outside[0].label === "Tiptronic" && ds.outside[0].count === out.length && ds.outside[0].low <= ds.outside[0].median && ds.outside[0].median <= ds.outside[0].high);
ok("the outside sentence is a table line, says less, and carries the counts", inTable("desk.outside.sentence", ds.outside[0].sentence) && /less than manual ones/.test(ds.outside[0].sentence) && new RegExp(`${ds.outside[0].count} sales against ${ds.evidence.count}`).test(ds.outside[0].sentence), ds.outside[0].sentence);
ok("the outside difference is the medians' difference to the nearest $500", (() => { const m = /about \$([\d,]+) less/.exec(ds.outside[0].sentence); return m && Number(m[1].replace(/,/g, "")) === Math.round((ds.evidence.median - ds.outside[0].median) / 500) * 500; })());
{ const e = { insufficient: false, median: 37000, count: 18 }, sub = { gearbox: "manual" };
  const rows = [1, 2].map(i => ({ inPopulation: false, outReason: "transmission", gearboxWord: "SMG", price: 30000 + i }));
  ok("an outside group of two sales gives no entry", DV.outsideOf(rows, e, sub).length === 0);
  ok("an outside group of three gives one", DV.outsideOf([...rows, { inPopulation: false, outReason: "transmission", gearboxWord: "SMG", price: 31000 }], e, sub).length === 1);
  ok("no reference in the population gives no outside entry", DV.outsideOf(rows, { insufficient: true }, sub).length === 0); }
{ const r = await S.sheetRead(w.env, { year: c0.year, make: c0.make, model: c0.model, mileage: 61400, desk: { caseDate: today, label: c0.label, head } }, w.deps);
  ok("with no gearbox asked there is no outside group and every comparable is in the population", r.desk.outside.length === 0 && r.desk.comparables.every(c => c.inPopulation)); }
console.log("\ndeskCompsCheck: " + (n - failed) + " pass, " + failed + " FAIL"); process.exit(failed ? 1 : 0);
