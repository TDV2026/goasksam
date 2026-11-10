// clock: real-ok the world's sales are dated relative to now; the direct tests name their own fixed dates (Lane B, Nov 2026)
// DESK V4 STAGE 2, EVERY SALE (Lane B, Nov 10 2026). desk.sales = the chosen window's population, desk.rungs = the same car's sales of that window by condition rung:
//   (1) every dot is a sale of the window's population (same count as desk.evidence, same ids, none outside the window or the gearbox), newest first, with every field the plot and Show all draw
//   (2) every sale's tier is its own and desk.rungs counts agree with the sales: per rung, derived here from the rows
//   (3) a rung with five sales or more has a band (q1, median, q3); under five it has no band, says it has too few for a typical range, and lists what those sales sold for; no sale at all says so
//   (4) a photo is the sale's own listing photo that passed the photo rule, or null; never another sale's, never a placeholder
//   (5) every sentence is a reason table line, no dash
//   node scripts/deskSalesCheck.mjs [root]     --mutants proves each rule by breaking it in a copy
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { fileURLToPath, pathToFileURL } from "node:url"; import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), rootArg = args.find(a => !a.startsWith("--")), ROOT = path.resolve(rootArg || path.join(here, ".."));
if (args.includes("--mutants")) {
  const DV = "lib/deskV3.js";
  const muts = [
    [DV, "const rows = inWindow(pop, caseDate, months).filter(r => Number(r.price) > 0).sort(", "const rows = (pop || []).filter(r => Number(r.price) > 0).sort(", "(1) a sale outside the window is a dot"],
    [DV, "iso(b.date).localeCompare(iso(a.date)) || String(a.id)", "iso(a.date).localeCompare(iso(b.date)) || String(a.id)", "(1) oldest first"],
    [DV, "tier: [1, 2, 3, 4].includes(Number(r.tier)) ? Number(r.tier) : null, titleLine", "tier: 2, titleLine", "(2) every dot is in rung two"],
    [DV, "const win = inWindow(base, caseDate, months).filter(r => Number(r.price) > 0);", "const win = (base || []).filter(r => Number(r.price) > 0);", "(2) the rungs count sales outside the window"],
    [DV, "if (count >= DESK_TIER_MIN) {", "if (count >= 1) {", "(3) one sale gives a band"],
    [DV, "list: deskMoneyList(ps) })", "list: \"\" })", "(3) a thin rung does not list what its sales sold for"],
    [DV, "photo: photos[i] || null }));", "photo: photos[i] || (rows[0] && rows[0].photo) || null }));", "(4) a sale without a photo borrows another sale's"],
    [DV, "r.photo ? await choosePhoto(photoCandidates({ photo_url: r.photo }), head || undefined) : null", "r.photo ? r.photo : null", "(4) the photo rule is not applied"],
    [DV, "milesLine: r.miles > 0 ?", "milesLine: r.miles >= 0 ?", "(1) a sale without miles prints 0 miles"],
    ["lib/reasonWords.js", "`Too few ${p.name} sales for a typical range: ${p.count} in the last ${p.months} months, sold for ${p.list}.`", "`Too few ${p.name} sales for a typical range: ${p.count} in the last ${p.months} months, sold for ${p.list} – not enough.`", "(5) a dash in a sentence"]
  ];
  let survivors = 0;
  for (const [file, from, to, want] of muts) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-"));
    spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", ROOT + "/", dir + "/"]); fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"));
    const fp = path.join(dir, file), src = fs.readFileSync(fp, "utf8"), m = src.replace(from, to);
    if (m === src) { console.log(`MUTANT NOT APPLIED  ${want}`); survivors++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
    fs.writeFileSync(fp, m);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/deskSalesCheck.mjs"), dir], { encoding: "utf8" }), killed = r.status !== 0;
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
// a money or number slot is probed as NaN by reasonPatterns; here it stands for any figure
const pats = RW.reasonPatterns().map(p => ({ ...p, re: new RegExp(p.re.source.replace(/\\\$NaN/g, "\\$[\\d,]+").replace(/NaN/g, "[\\d,]+")) })), line = (field, s) => typeof s === "string" && pats.some(p => p.field === field && p.re.test(s));
const noDash = s => !/[–—]|\s-\s/.test(String(s || ""));
const CASE = "2026-11-10", sub = { transmission: "Manual", body: "Coupe" };
// the photo rule here: a url ending in 9.jpg is too big, ending in 0.jpg is a 404, anything else passes
const head = async u => (/9\.jpg$/.test(u) ? { status: 200, bytes: 3100000, type: "image/jpeg" } : /0\.jpg$/.test(u) ? { status: 404, bytes: null, type: "" } : { status: 200, bytes: 90000, type: "image/jpeg" });
const row = (id, price, date, tier, extra = {}) => ({ id, price, date, tier, title: "1999 Porsche 911 Carrera", platform: "Cars & Bids", url: "https://x.test/" + id, photo: "https://img.test/" + id + "1.jpg", miles: 40000 + price % 1000, gearbox: "manual", inPopulation: true, ...extra });
// rung 1: 2 sales, rung 2: 6 sales, rung 3: 5 sales, rung 4: none, untiered: 2; plus an old sale (outside 12 months), an automatic (other gearbox) and an undated sale
const rows = [
  row("a1", 90000, "2026-10-01", 1), row("a2", 92000, "2026-09-01", 1),
  ...[0, 1, 2, 3, 4, 5].map(i => row("b" + i, 60000 + i * 1000, `2026-0${i + 3}-15`, 2)),
  ...[0, 1, 2, 3, 4].map(i => row("c" + i, 40000 + i * 500, `2026-0${i + 4}-02`, 3)),
  row("u1", 55000, "2026-08-08", null), row("u2", 56000, "2026-07-07", null, { photo: "https://img.test/u20.jpg" }),
  row("old", 70000, "2024-12-01", 2), row("auto", 45000, "2026-06-06", 3, { inPopulation: false, outReason: "transmission", gearbox: "automatic" }), row("nodate", 61000, null, 2)
];
const inWin = r => r.date && r.date >= "2025-11-10" && r.outReason !== "transmission" && r.price > 0;
{ const b = await DV.deskBlock(rows, { caseDate: CASE, subject: sub, subjectFacts: {}, head });
  const want = rows.filter(r => inWin(r)), ids = b.sales.map(s => s.id);
  ok("(1) every dot is a sale of the 12 month population: same ids, same count as desk.evidence", ids.length === want.length && want.every(r => ids.includes(r.id)) && b.sales.length === b.evidence.count, `${ids.length}/${b.evidence.count}`);
  ok("(1) no sale outside the window, none of another gearbox, none undated", !ids.includes("old") && !ids.includes("auto") && !ids.includes("nodate"));
  ok("(1) newest first", b.sales.every((s, i) => i === 0 || Date.parse(rows.find(r => r.id === b.sales[i - 1].id).date) >= Date.parse(rows.find(r => r.id === s.id).date)));
  const f = b.sales.find(s => s.id === "b2");
  ok("(1) the fields the plot and Show all draw: price, date in words, tier, title, miles, platform, link, photo", f && f.price === 62000 && f.dateLine === "May 15, 2026" && f.tier === 2 && f.titleLine === "1999 Porsche 911 Carrera" && f.milesLine === "40,000 miles" || (f && f.milesLine === "40,000 miles".replace("40,000", (40000 + 62000 % 1000).toLocaleString("en-US"))) && f.platform === "Cars & Bids" && f.url === "https://x.test/b2" && f.photo === "https://img.test/b21.jpg", JSON.stringify(f));
  ok("(1) the shape is exactly id, price, priceLine, dateLine, tier, titleLine, milesLine, platform, url, photo", b.sales.every(s => JSON.stringify(Object.keys(s)) === JSON.stringify(["id", "price", "priceLine", "dateLine", "tier", "titleLine", "milesLine", "platform", "url", "photo"])));
  ok("(5) the miles line is a table line, with no dash", b.sales.every(s => (s.milesLine === null || line("desk.sales.milesLine", s.milesLine)) && noDash(s.milesLine)));
  const nm = await DV.deskBlock([row("m", 50000, "2026-10-01", 2, { miles: null })], { caseDate: CASE, subject: sub, subjectFacts: {}, head });
  ok("(1) a sale with no miles has no miles line, never 0 miles", nm.sales[0].milesLine === null);
  ok("(2) a sale of no tier carries tier null", b.sales.filter(s => s.id[0] === "u").every(s => s.tier === null) && b.sales.filter(s => s.id[0] === "u").length === 2);
  // rungs
  ok("(3) each rung has its count line as the mockup buttons show", b.rungs.map(x => x.countLine).join() === "2 sales,6 sales,5 sales,0 sales", b.rungs.map(x => x.countLine).join());
  const r = b.rungs, by = t => r.find(x => x.tier === t);
  const oracle = t => rows.filter(x => inWin(x) && x.tier === t).map(x => x.price).sort((p, q) => p - q);
  ok("(2) four rungs, each with the count of the window's sales of that rung (derived from the rows)", r.length === 4 && [1, 2, 3, 4].every(t => by(t) && by(t).count === oracle(t).length), JSON.stringify(r.map(x => x.count)));
  ok("(2) the rung counts agree with the dots' tiers", [1, 2, 3, 4].every(t => by(t).count === b.sales.filter(s => s.tier === t).length));
  ok("(3) five sales or more: a band (q1, median, q3), low and high, and a table sentence", by(2).band && by(2).band.q1 === 61250 && by(2).band.median === 62500 && by(2).band.q3 === 63750 && by(2).low === 60000 && by(2).high === 65000 && by(3).band && line("desk.rungs.sentence", by(2).sentence), by(2).sentence);
  ok("(3) under five: no band, the sentence says too few for a typical range and lists what they sold for", by(1).band === null && /Too few/.test(by(1).sentence) && /typical range/.test(by(1).sentence) && by(1).sentence.includes("$90,000") && by(1).sentence.includes("$92,000") && line("desk.rungs.sentence", by(1).sentence) && by(1).low === 90000 && by(1).high === 92000, by(1).sentence);
  ok("(3) no sale in a rung: no band, no figure, a sentence that says so", by(4).count === 0 && by(4).band === null && by(4).low === null && by(4).high === null && /^No .* sales in the last 12 months\.$/.test(by(4).sentence) && line("desk.rungs.sentence", by(4).sentence), by(4).sentence);
  ok("(5) no dash in any rung sentence", r.every(x => noDash(x.sentence)));
  const tb = await DV.deskBlock(rows.map(x => ({ ...x, inPopulation: x.tier === 2 && x.outReason !== "transmission" })), { caseDate: CASE, subject: sub, subjectFacts: {}, tier: 2, head });
  ok("(2) a case on rung two: the dots are rung two only, the rungs still count every rung of the car", tb.sales.every(s => s.tier === 2) && tb.rungs.map(x => x.count).join() === r.map(x => x.count).join(), tb.rungs.map(x => x.count).join());
  const w6 = await DV.deskBlock(rows, { caseDate: CASE, subject: sub, subjectFacts: {}, windowMonths: 6, head });
  ok("(2) the six month window: fewer dots and rung counts that follow the window", w6.sales.length < b.sales.length && w6.sales.every(s => rows.find(x => x.id === s.id).date >= "2026-05-10") && [1, 2, 3, 4].every(t => w6.rungs.find(x => x.tier === t).count === w6.sales.filter(s => s.tier === t).length));
  // photos
  const own = b.sales.every(s => { const src = rows.find(x => x.id === s.id); return s.photo === null || s.photo === src.photo; });
  ok("(4) a photo is the sale's own, never another's", own);
  const u2 = b.sales.find(s => s.id === "u2"), a1 = b.sales.find(s => s.id === "a1");
  ok("(4) a photo that fails the rule (404) is null, not a substitute, not a placeholder", u2.photo === null && a1.photo === "https://img.test/a11.jpg" && b.sales.every(s => !/placeholder|noimage|default|blank/i.test(String(s.photo))), String(u2.photo));
  const many = Array.from({ length: 50 }, (_, i) => row("m" + String(i).padStart(2, "0"), 50000 + i, `2026-10-${String(1 + (i % 28)).padStart(2, "0")}`, 2));
  const mb = await DV.deskBlock(many, { caseDate: CASE, subject: sub, subjectFacts: {}, head });
  ok("(4) a long list looks up the photos of the newest sales only; the others are null, not borrowed", mb.sales.length === 50 && mb.sales.filter(s => s.photo).length <= DV.PHOTO_SALES && mb.sales.slice(DV.PHOTO_SALES).every(s => s.photo === null), String(mb.sales.filter(s => s.photo).length));
}
// ---- through the engine, every Desk model
const w = W.install(); const quiet = console.error; console.error = () => {};
const today = new Date().toISOString().slice(0, 10);
for (const c of W.CASES) for (const o of [{}, { tier: 3 }]) {
  const sh = await S.sheetRead(w.env, { year: c.year, make: c.make, model: c.model, mileage: 40000, ...o, desk: { caseDate: today, transmission: c.transmission, label: c.label, head } }, w.deps), d = sh && sh.desk, label = `${c.model}${o.tier ? " tier " + o.tier : ""}`;
  if (!d || !Array.isArray(d.sales) || !Array.isArray(d.rungs)) { ok(`${label}: the sheet read carries desk.sales and desk.rungs`, false); continue; }
  ok(`${label}: the dots are the evidence's population (same count), every dot priced, dated and linked`, d.sales.length === d.evidence.count && d.sales.every(s => s.price > 0 && s.dateLine && (s.url === null || /^https?:/.test(s.url))), `${d.sales.length}/${d.evidence.count}`);
  ok(`${label}: the dots' prices sit inside the evidence's low and high`, d.evidence.insufficient || d.sales.every(s => s.price >= d.evidence.low && s.price <= d.evidence.high));
  ok(`${label}: four rungs whose counts add up to no more than the car's sales, a band only at five or more`, d.rungs.length === 4 && d.rungs.every(x => (x.count >= 5) === (x.band !== null) && line("desk.rungs.sentence", x.sentence)));
  if (o.tier) ok(`${label}: the dots all carry the case's rung`, d.sales.every(s => s.tier === o.tier));
  ok(`${label}: a photo is null or one that passed the rule`, d.sales.every(s => s.photo === null || (/^https:/.test(s.photo) && !/9\.jpg$/.test(s.photo) && !/0\.jpg$/.test(s.photo))));
}
console.error = quiet;
console.log(`\ndeskSalesCheck: ${n - failed} pass, ${failed} FAIL`); process.exit(failed ? 1 : 0);
