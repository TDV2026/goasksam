// clock: real-ok the fixture sales are dated relative to now (days ago); the stale test names its own case dates from the data (Lane B, Nov 2026)
// DESK V3 STAGE 1, THE EVIDENCE BLOCK (Lane B, Nov 8 2026). desk.evidence = { asOf, count, matching, median, q1, q3, low, high, period, latestSale, population, stale }:
//   (1) the meter and the evidence agree for every Desk model, with and without a tier, with and without a gearbox
//   (2) a population under the minimum is insufficient: a sentence from the reason table, and NO number (never a 0 median)
//   (3) asOf is the date of the latest sale in the population; stale flips at the threshold (DESK_STALE_DAYS, default 90) and not before
//   (4) every sentence is a reason table line
//   node scripts/deskEvidenceCheck.mjs [root]     --mutants proves each rule by breaking it in a copy
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { fileURLToPath, pathToFileURL } from "node:url"; import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), rootArg = args.find(a => !a.startsWith("--")), ROOT = path.resolve(rootArg || path.join(here, ".."));
if (args.includes("--mutants")) {
  const DV = "lib/deskV3.js", SR = "lib/sheetRead.js";
  const muts = [
    [DV, "flag: gap != null && gap > threshold, sentence: null }", "flag: gap != null && gap >= threshold, sentence: null }", "(3) the stale flag flips one day early"],
    [DV, "const caseDate = iso(desk.caseDate) || iso(new Date().toISOString()), asOf = latest ? iso(latest.date) : null, threshold = staleThreshold(env);", "const caseDate = iso(desk.caseDate) || iso(new Date().toISOString()), asOf = latest ? iso(dated[dated.length - 1].date) : null, threshold = staleThreshold(env);", "(3) asOf is the oldest sale, not the latest"],
    [DV, "export const DESK_STALE_DAYS_DEFAULT = 90;", "export const DESK_STALE_DAYS_DEFAULT = 120;", "(3) the default threshold is not 90"],
    [DV, "if (n < min) return { ...base, insufficient: true, sentence: reasonLine(\"desk3.insufficient\", { what, count: n }), median: null,", "if (n < min) return { ...base, insufficient: true, sentence: reasonLine(\"desk3.insufficient\", { what, count: n }), median: quant(prices, 0.5) || 0,", "(2) an insufficient population returns a median (or a 0)"],
    [DV, "if (base.stale.flag) base.stale.sentence =", "if (false) base.stale.sentence =", "(3) a stale flag with no sentence"],
    [DV, "asOf: deskDateWords(asOf), days:", "asOf: String(asOf), days:", "(3) the date printed raw, not in words"],
    [DV, "threshold: countNoun(threshold, \"day\", { words: false })", "threshold: countNoun(threshold + 1, \"day\", { words: false })", "(3) the limit printed is not the limit used"],
    [DV, "export const DESK_TIER_MIN = 5;", "export const DESK_TIER_MIN = 1;", "(2) a one sale tier gives a reference"],
    [SR, "p25: ev.q1, median: ev.median, p75: ev.q3, high: ev.high };", "p25: ev.q1, median: ev.median + 1, p75: ev.q3, high: ev.high };", "(1) the meter drifts from the evidence"],
    [SR, "out.market.meter = ev.insufficient ? null :", "out.market.meter = false ? null :", "(1) the meter prints a figure for an insufficient population"],
    ["lib/onebox.js", "const txOut = sub.transmission && r.gearbox && r.gearbox !== gearboxClass(sub.transmission);", "const txOut = false;", "(1) the gearbox does not narrow the population"]
  ];
  let survivors = 0;
  for (const [file, from, to, want] of muts) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dev-"));
    spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", ROOT + "/", dir + "/"]); fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"));
    const fp = path.join(dir, file), src = fs.readFileSync(fp, "utf8"), m = src.replace(from, to);
    if (m === src) { console.log(`MUTANT NOT APPLIED  ${want}`); survivors++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
    fs.writeFileSync(fp, m);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/deskEvidenceCheck.mjs"), dir], { encoding: "utf8" }), killed = r.status !== 0;
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
const w = W.install(); const quiet = console.error; console.error = () => {};
const today = new Date().toISOString().slice(0, 10);
const addDays = (d, k) => new Date(Date.parse(d) + k * W.DAY).toISOString().slice(0, 10);
const read = (c, o) => S.sheetRead(w.env, { year: c.year, make: c.make, model: c.model, mileage: 40000, ...o, desk: { caseDate: today, transmission: o && o.noGearbox ? null : c.transmission, label: c.label } }, w.deps);
const eqMeter = (m, e) => m && e && m.count === e.count && m.low === e.low && m.p25 === e.q1 && m.median === e.median && m.p75 === e.q3 && m.high === e.high;
let figures = 0;
for (const c of W.CASES) {
  for (const o of [{}, { noGearbox: true }, { tier: 2 }, { tier: 3 }, { tier: 4 }]) {
    const label = `${c.model}${o.tier ? " tier " + o.tier : ""}${o.noGearbox ? " any gearbox" : ""}`, sh = await read(c, o), ev = sh && sh.desk && sh.desk.evidence;
    if (!ev) { ok(`${label}: the sheet read carries desk.evidence`, false); continue; }
    if (!ev.insufficient) {
      figures++;
      ok(`${label}: meter and evidence agree (count, low, q1, median, q3, high)`, eqMeter(sh.market.meter, ev), JSON.stringify([sh.market.meter && sh.market.meter.count, ev.count]));
      ok(`${label}: asOf is the latest sale of the population`, ev.asOf === ev.latestSale.date && ev.period.to === ev.asOf && ev.period.from <= ev.asOf);
      ok(`${label}: q1 <= median <= q3, low <= high, the count is the meter's`, ev.q1 <= ev.median && ev.median <= ev.q3 && ev.low <= ev.high && ev.count >= (o.tier ? DV.DESK_TIER_MIN : DV.DESK_EVIDENCE_MIN));
    } else {
      ok(`${label}: insufficient evidence has no number and no meter`, ev.median === null && ev.q1 === null && ev.q3 === null && ev.low === null && ev.high === null && sh.market.meter === null && typeof ev.sentence === "string" && ev.sentence.length > 0 && !/\b0\b.*\$/.test(ev.sentence));
    }
    ok(`${label}: a stale flag carries the table's sentence and a fresh one carries none`, ev.stale.flag ? (typeof ev.stale.sentence === "string" && RW.reasonPatterns().some(p => p.field === "desk.evidence.stale.sentence" && p.re.test(ev.stale.sentence)) && ev.stale.sentence.includes(String(ev.stale.days))) : ev.stale.sentence === null, String(ev.stale.sentence));
    ok(`${label}: the population sentence is the table's`, RW.reasonPatterns().some(p => p.field === "desk.evidence.population.sentence" && p.re.test(ev.population.sentence)), ev.population.sentence);
    ok(`${label}: matching counts the whole car, at least the population`, ev.matching >= ev.count);
  }
}
ok("figures were checked on every model", figures >= W.CASES.length * 2, String(figures));
{ // the gearbox narrows: manual only is fewer than every gearbox, and matching is the same
  const c = W.CASES[0], a = (await read(c, {})).desk.evidence, b = (await read(c, { noGearbox: true })).desk.evidence;
  ok("a manual 996 reads fewer sales than every 996, over the same matching set", a.count < b.count && a.matching === b.matching, `${a.count} of ${b.count}`);
  ok("a manual 996 reads dearer than every 996 (manual cars sell for more here)", a.median > b.median, `${a.median} vs ${b.median}`);
}
{ // insufficient, direct
  const e = DV.evidenceOf([{ price: 50000, date: today }, { price: 52000, date: today }], [], { caseDate: today, subject: { body: "Coupe" } });
  ok("two sales: insufficient, no median", e.insufficient && e.median === null && /too few/.test(e.sentence), e.sentence);
  const t = DV.evidenceOf(Array.from({ length: 4 }, () => ({ price: 50000, date: today })), [], { caseDate: today, tier: 2, tierName: "Excellent", subject: {} });
  ok("four sales in a tier: insufficient (a tier needs five)", t.insufficient && t.median === null);
  const f = DV.evidenceOf(Array.from({ length: 5 }, (_, i) => ({ price: 50000 + i * 1000, date: today })), [], { caseDate: today, tier: 2, tierName: "Excellent", subject: {} });
  ok("five sales in a tier: a reference", !f.insufficient && f.median === 52000);
}
{ // the stale flag flips at the threshold
  const rows = Array.from({ length: 5 }, (_, i) => ({ price: 40000 + i * 500, date: i === 0 ? "2026-06-01" : "2026-05-20" }));
  const at = k => DV.evidenceOf(rows, [], { caseDate: addDays("2026-06-01", k), subject: {} });
  ok("stale: 90 days after the latest sale is not stale", at(90).stale.flag === false && at(90).stale.days === 90 && at(90).stale.threshold === 90);
  ok("stale: 91 days after is stale", at(91).stale.flag === true && at(91).stale.days === 91);
  ok("stale: the case date before the latest sale is 0 days and not stale", at(-5).stale.days === 0 && at(-5).stale.flag === false);
  const e30 = DV.evidenceOf(rows, [], { caseDate: addDays("2026-06-01", 31), subject: {} }, { DESK_STALE_DAYS: 30 });
  { const st = at(91).stale, fr = at(90).stale;
    ok("stale: 91 days gives the sentence with the date, the days and the limit", st.sentence === "The evidence runs to June 1, 2026, 91 days before the case date, over the limit of 90 days.", st.sentence);
    ok("stale: at 90 days there is no sentence, so no page has a tag to explain", fr.sentence === null);
    ok("stale: one day over a limit of one reads '1 day' and '1 day'", DV.evidenceOf(rows, [], { caseDate: addDays("2026-06-01", 2), subject: {} }, { DESK_STALE_DAYS: 1 }).stale.sentence === "The evidence runs to June 1, 2026, 2 days before the case date, over the limit of 1 day."); }
  ok("stale: DESK_STALE_DAYS is the threshold when set", e30.stale.threshold === 30 && e30.stale.flag === true);
  ok("stale: the threshold is not the config when it is nonsense", DV.evidenceOf(rows, [], { caseDate: "2026-06-02", subject: {} }, { DESK_STALE_DAYS: "abc" }).stale.threshold === 90);
}
{ // not a Desk case: no desk field
  const E = await import(pathToFileURL(path.join(ROOT, "lib/onebox.js")).href);
  const r = await E.oneEngineAnswer({ year: 1999, make: "Porsche", model: "911", bodyStyle: "Coupe" }, null, "1999 Porsche 911", { ...w.env }, null);
  ok("a call that is not a Desk case carries no desk block", r.raw && !("desk" in r.raw));
}
console.log("\ndeskEvidenceCheck: " + (n - failed) + " pass, " + failed + " FAIL"); process.exit(failed ? 1 : 0);
