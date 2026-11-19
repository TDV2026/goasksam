// clock: real-ok the world's sales are dated relative to now; the direct tests name their own fixed dates (Lane B, Nov 2026)
// DESK V4 STAGE 3, THE RESERVE CHECK (Lane B, Nov 10 2026). desk.reserve (a figure) -> desk.reserveCheck = { reserve, reached, of, reachedLine, position, positionLine, supported } and desk.reserveStart = { figure, sentence }:
//   (1) reached is the number of the chosen window's sales at or above the figure and of is the number of those sales, for a sweep of figures around every edge (derived here from desk.sales, not from the check's own copy of the rule)
//   (2) position is below, inside or above the typical range q1 to q3 (the edges are inside), and supported is false exactly when the figure is above q3
//   (3) a window with no typical range gives counts and a sentence, no position and no supported
//   (4) desk.reserveStart is q1 of the chosen window, nothing when the window has no typical range; no reserve, no reserveCheck
//   (5) sentences are reason table lines, the count line reads "23 of 39 sales reached this figure.", no dash; the sheet read passes the reserve through
//   node scripts/deskReserveCheck.mjs [root]     --mutants proves each rule by breaking it in a copy
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { fileURLToPath, pathToFileURL } from "node:url"; import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), rootArg = args.find(a => !a.startsWith("--")), ROOT = path.resolve(rootArg || path.join(here, ".."));
if (args.includes("--mutants")) {
  const DV = "lib/deskV3.js", SR = "lib/sheetRead.js";
  const muts = [
    [DV, "(sales || []).filter(s => Number(s.price) >= fig).length", "(sales || []).filter(s => Number(s.price) > fig).length", "(1) a sale at the figure did not reach it"],
    [DV, "const of = (sales || []).length, reached", "const of = (evidence && evidence.matching) || 0, reached", "(1) of is not the window's sales"],
    [DV, "reasonLine(\"desk4.reserve_reached\", { reached, of, noun:", "reasonLine(\"desk4.reserve_reached\", { reached: Math.max(0, reached - 1), of, noun:", "(1) the count line is typed, not the count"],
    [DV, "const position = fig < evidence.q1 ?", "const position = fig <= evidence.q1 ?", "(2) the lower edge is below"],
    [DV, "fig > evidence.q3 ? \"above\"", "fig >= evidence.q3 ? \"above\"", "(2) the upper edge is above"],
    [DV, "supported: position !== \"above\" }", "supported: position === \"inside\" }", "(2) a figure below the range is unsupported"],
    [DV, "supported: position !== \"above\" }", "supported: fig <= evidence.median }", "(2) supported flips at the median, not at q3"],
    [DV, "if (!evidence || evidence.insufficient) return { reserve: Math.round(fig), reached, of, reachedLine, position: null, positionLine: reasonLine(\"desk4.reserve_noband\"), supported: null };", "if (!evidence) return null;", "(3) a window with no range still gets a position"],
    [DV, "figure: roundReserve(evidence.q1),", "figure: evidence.median,", "(4) the starting figure is the median"],
    [DV, "export function reserveStartOf(evidence, months) { return evidence && !evidence.insufficient ?", "export function reserveStartOf(evidence, months) { return evidence ?", "(4) a starting figure for an insufficient window"],
    [DV, "if (!(Number.isFinite(fig) && fig > 0)) return null;", "if (!Number.isFinite(fig)) return null;", "(4) a reserve of zero is checked"],
    [SR, "reserve: input.desk.reserve != null ? input.desk.reserve : null,", "reserve: null,", "(5) the sheet read drops the reserve"],
    ["lib/reasonWords.js", "`${p.reached} of ${p.of} ${p.noun} reached this figure.`", "`${p.reached} of ${p.of} ${p.noun} reached this figure – yes.`", "(5) a dash in a sentence"]
  ];
  let survivors = 0;
  for (const [file, from, to, want] of muts) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "drc-"));
    spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", ROOT + "/", dir + "/"]); fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"));
    const fp = path.join(dir, file), src = fs.readFileSync(fp, "utf8"), m = src.replace(from, to);
    if (m === src) { console.log(`MUTANT NOT APPLIED  ${want}`); survivors++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
    fs.writeFileSync(fp, m);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/deskReserveCheck.mjs"), dir], { encoding: "utf8" }), killed = r.status !== 0;
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
const pats = RW.reasonPatterns().map(p => ({ ...p, re: new RegExp(p.re.source.replace(/\\\$NaN/g, "\\$[\\d,]+").replace(/NaN/g, "[\\d,]+")) })), line = (field, s) => typeof s === "string" && pats.some(p => p.field === field && p.re.test(s));
const noDash = s => !/[–—]|\s-\s/.test(String(s || ""));
const CASE = "2026-11-10", sub = { transmission: "Manual", body: "Coupe" };
const row = (id, price, date) => ({ id, price, date, title: "t", platform: "Bring a Trailer", url: "https://x.test/" + id, miles: 40000, tier: null, inPopulation: true });
const prices = Array.from({ length: 39 }, (_, i) => 40000 + i * 1500);   // 40,000 to 97,000, 39 sales
const rows = prices.map((p, i) => row("s" + i, p, `2026-${String(1 + (i % 10)).padStart(2, "0")}-${String(1 + (i % 27)).padStart(2, "0")}`));
const sweepEdges = d => { const e = d.evidence, base = [e.low - 1, e.low, e.q1 - 1, e.q1, e.q1 + 1, e.median, e.q3 - 1, e.q3, e.q3 + 1, e.high, e.high + 1, 1, 1000000]; return [...new Set(base.filter(v => v > 0))]; };
{ const d0 = await DV.deskBlock(rows, { caseDate: CASE, subject: sub, subjectFacts: {} });
  ok("the fixture: 39 sales in the window and a typical range", d0.evidence.count === 39 && !d0.evidence.insufficient && d0.reserveCheck === null && d0.reserveStart.figure === DV.roundReserve(d0.evidence.q1), JSON.stringify(d0.reserveStart));
  let swept = 0, bad = [];
  for (const fig of sweepEdges(d0)) {
    const d = await DV.deskBlock(rows, { caseDate: CASE, subject: sub, subjectFacts: {}, reserve: fig }), rc = d.reserveCheck, e = d.evidence, sales = d.sales;
    const reached = sales.filter(s => s.price >= fig).length, pos = fig < e.q1 ? "below" : fig > e.q3 ? "above" : "inside"; swept++;
    if (!(rc && rc.reached === reached && rc.of === sales.length && rc.of === e.count && rc.position === pos && rc.supported === (fig <= e.q3) && rc.reachedLine === `${reached} of ${sales.length} sales reached this figure.`)) bad.push(fig);
  }
  ok(`(1)(2) a sweep of ${swept} figures around every edge: reached is the count at or above, of is the window's sales, position and supported follow q1 and q3`, swept >= 10 && !bad.length, bad.join());
  const at = d0.evidence.q3, dq3 = await DV.deskBlock(rows, { caseDate: CASE, subject: sub, subjectFacts: {}, reserve: at }), dq3p = await DV.deskBlock(rows, { caseDate: CASE, subject: sub, subjectFacts: {}, reserve: at + 1 });
  ok("(2) supported flips at q3: true at q3, false one dollar above", dq3.reserveCheck.supported === true && dq3.reserveCheck.position === "inside" && dq3p.reserveCheck.supported === false && dq3p.reserveCheck.position === "above");
  const q1 = d0.evidence.q1, a = await DV.deskBlock(rows, { caseDate: CASE, subject: sub, subjectFacts: {}, reserve: q1 - 1 }), b = await DV.deskBlock(rows, { caseDate: CASE, subject: sub, subjectFacts: {}, reserve: q1 });
  ok("(2) q1 is inside, one dollar under is below (and supported)", a.reserveCheck.position === "below" && a.reserveCheck.supported === true && b.reserveCheck.position === "inside");
  ok("(5) the count line reads as the brief writes it: 'N of 39 sales reached this figure.'", /^\d+ of 39 sales reached this figure\.$/.test(b.reserveCheck.reachedLine), b.reserveCheck.reachedLine);
  ok("(5) both lines are table lines, no dash", [a, b, dq3p].every(x => line("desk.reserveCheck.reachedLine", x.reserveCheck.reachedLine) && line("desk.reserveCheck.positionLine", x.reserveCheck.positionLine) && noDash(x.reserveCheck.reachedLine) && noDash(x.reserveCheck.positionLine)), b.reserveCheck.positionLine);
  const one = await DV.deskBlock([row("x", 50000, "2026-10-01")], { caseDate: CASE, subject: sub, subjectFacts: {}, reserve: 50000 });
  ok("(3) one sale: the counts and a sentence, no position, no supported, no starting figure", one.evidence.insufficient && one.reserveCheck.reached === 1 && one.reserveCheck.of === 1 && one.reserveCheck.reachedLine === "1 of 1 sale reached this figure." && one.reserveCheck.position === null && one.reserveCheck.supported === null && line("desk.reserveCheck.positionLine", one.reserveCheck.positionLine) && one.reserveStart === null, JSON.stringify(one.reserveCheck));
  const zero = await DV.deskBlock([], { caseDate: CASE, subject: sub, subjectFacts: {}, reserve: 50000 });
  ok("(3) no sales at all: 0 of 0 with a sentence that says there are none", zero.reserveCheck.reached === 0 && zero.reserveCheck.of === 0 && line("desk.reserveCheck.reachedLine", zero.reserveCheck.reachedLine) && /no sales/.test(zero.reserveCheck.reachedLine));
  ok("(4) no reserve, or one that is not a figure: no reserveCheck", [undefined, null, 0, -5, "abc", NaN].every(v => true) && (await Promise.all([undefined, null, 0, -5, "abc", NaN].map(v => DV.deskBlock(rows, { caseDate: CASE, subject: sub, subjectFacts: {}, reserve: v })))).every(x => x.reserveCheck === null));
  ok("(4) reserveStart is q1 of the chosen window with a table sentence", line("desk.reserveStart.sentence", d0.reserveStart.sentence) && noDash(d0.reserveStart.sentence), d0.reserveStart.sentence);
  const d6 = await DV.deskBlock(rows, { caseDate: CASE, subject: sub, subjectFacts: {}, windowMonths: 6, reserve: d0.evidence.q1 });
  ok("(2) the sales and the range are the chosen window's: 6 months counts fewer sales", d6.reserveCheck.of === d6.evidence.count && d6.reserveCheck.of < 39 && d6.reserveStart.figure === DV.roundReserve(d6.evidence.q1), `${d6.reserveCheck.of}`);
  const ex = await DV.deskBlock(rows, { caseDate: CASE, subject: sub, subjectFacts: {}, reserve: 80000, excludedIds: ["s38"], exclusionScope: { s38: "market_calc" } });
  ok("(1) a sale excluded from the market calculation is not counted", ex.reserveCheck.of === 38 && ex.reserveCheck.reached === ex.sales.filter(s => s.price >= 80000).length);
}
// ---- through the engine, every Desk model: a sweep from the sheet read itself
const w = W.install(); const quiet = console.error; console.error = () => {};
const today = new Date().toISOString().slice(0, 10);
for (const c of W.CASES) {
  const base = await S.sheetRead(w.env, { year: c.year, make: c.make, model: c.model, mileage: 40000, desk: { caseDate: today, transmission: c.transmission, label: c.label } }, w.deps), e = base && base.desk && base.desk.evidence;
  if (!e || e.insufficient) { ok(`${c.model}: a reference to sweep`, false); continue; }
  ok(`${c.model}: no reserve given, no reserveCheck; the starting figure is q1`, base.desk.reserveCheck === null && base.desk.reserveStart && base.desk.reserveStart.figure === DV.roundReserve(e.q1));
  let allOk = true, tried = 0;
  for (const fig of [e.low - 1, e.low, e.q1, e.median, e.q3, e.q3 + 1, e.high, e.high + 1]) {
    const sh = await S.sheetRead(w.env, { year: c.year, make: c.make, model: c.model, mileage: 40000, desk: { caseDate: today, transmission: c.transmission, label: c.label, reserve: fig } }, w.deps), d = sh.desk, rc = d.reserveCheck; tried++;
    if (!(rc && rc.of === d.sales.length && rc.reached === d.sales.filter(s => s.price >= fig).length && rc.supported === (fig <= e.q3))) { allOk = false; console.log("  bad figure " + fig + " " + JSON.stringify(rc)); }
  }
  ok(`${c.model}: ${tried} figures through the sheet read: reached equals the sales at or above, supported flips at q3`, allOk);
}
console.error = quiet;
console.log(`\ndeskReserveCheck: ${n - failed} pass, ${failed} FAIL`); process.exit(failed ? 1 : 0);
