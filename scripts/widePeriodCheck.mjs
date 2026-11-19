// THE PERIOD SPREAD IN THE WIDE-RANGE SENTENCE (Lane B, Nov 8 2026; the 1987 BMW M6: "wide because mileage runs from 44,000 to 98,000 miles" while the chart showed 2024 and 2025 at $43,500 to $56,000 and 2026 at $35,500 to $83,000).
//   (1) from the SAME bars the chart draws (trend.movement.buckets, yearly, half-yearly or quarterly): when the latest bar's typical range is at least 1.5 times as wide as the bar one year earlier, the engine's sentence says so with both ranges, from the reason table
//   (2) mileage and the period both apply: ONE sentence names both, the cause stays mileage (the question logic reads it); only the period: the cause is "period"; no bar a year earlier, or under 1.5 times: the sentence is the one it was
//   (3) a stored answer gains the sentence on read (withReadFields), no warm; a second read changes nothing
//   (4) the sentence is the engine's: no file the page loads types it, and the field is registered
//   node scripts/widePeriodCheck.mjs [root]      --mutants proves each rule by breaking it in a copy
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { fileURLToPath, pathToFileURL } from "node:url"; import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), rootArg = args.find(a => !a.startsWith("--")), ROOT = path.resolve(rootArg || path.join(here, ".."));
if (args.includes("--mutants")) {
  const OB = "lib/onebox.js", RW = "lib/reasonWords.js";
  const muts = [
    [OB, "export const WIDE_PERIOD_RATIO = 1.5;", "export const WIDE_PERIOD_RATIO = 0;", "(1) the threshold is off: any period is a spread"],
    [OB, "export const WIDE_PERIOD_RATIO = 1.5;", "export const WIDE_PERIOD_RATIO = 9;", "(1) the threshold is too high: the M6 is missed"],
    [OB, "y => String(Number(y) - 1));", "y => String(Number(y) - 2));", "(1) the wrong year is the comparison"],
    [OB, "const prior = bk.find(b => b && b.period === before)", "const prior = bk[0]", "(1) the oldest bar, not the year before, is the comparison"],
    [OB, "const last = bk[bk.length - 1], before", "const last = bk[0], before", "(1) the oldest bar is called the latest"],
    [OB, "wideLine: reasonLine(\"wide.period\", f), widePeriod: ps }", "wideLine: \"The range is wide because \" + f.label + \" spread to $\" + f.low + \" to $\" + f.high + \" from $\" + f.pLow + \" to $\" + f.pHigh + \" the year before.\", widePeriod: ps }", "(4) the sentence is typed in the engine, not the reason table"],
    [OB, "if (base.wideCause === \"mileage\") return { ...base, wideLine: reasonLine(\"wide.mileage_period\", { ...f, lo: _lo, hi: _hi }), widePeriod: ps };", "if (base.wideCause === \"mileage\") return base;", "(2) mileage and the period are not named together"],
    [OB, "if (base.wideCause === \"mods\" || base.wideCause === \"none\") return", "if (base.wideCause === \"none\") return", "(2) a modified-cars sentence hides the period"],
    [OB, "&& out.wideCause !== \"period\" && !out.widePeriod) { try {", "&& false) { try {", "(3) a stored answer does not gain the sentence on read"],
    [OB, "wideOf(d.rawPool, d.cluster, d.trendHeld ? null : d.trend)", "wideOf(d.rawPool, d.cluster)", "(1) a fresh answer is not given the chart's bars"],
    [RW, "from ${money(p.pLow)} to ${money(p.pHigh)} the year before.` },\n  \"wide.mileage_period\"", "from ${money(p.low)} to ${money(p.high)} the year before.` },\n  \"wide.mileage_period\"", "(1) the year before is given the wrong figures"]
  ];
  let survivors = 0;
  for (const [file, from, to, want] of muts) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wpc-"));
    spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", ROOT + "/", dir + "/"]); fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"));
    const fp = path.join(dir, file), src = fs.readFileSync(fp, "utf8"), m = src.replace(from, to);
    if (m === src) { console.log(`MUTANT NOT APPLIED  ${want}`); survivors++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
    fs.writeFileSync(fp, m);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/widePeriodCheck.mjs"), dir], { encoding: "utf8" }), killed = r.status !== 0;
    console.log(`${killed ? "killed  " : "SURVIVED"}  ${want}`); if (!killed) survivors++;
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(survivors ? `\n${survivors} mutant(s) survived` : "\nall mutants killed"); process.exit(survivors ? 1 : 0);
}
process.chdir(ROOT);
let failed = 0, n = 0; const ok = (name, c, d) => { n++; if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${d ? "  " + d : ""}`); };
const E = await import(pathToFileURL(path.join(ROOT, "lib/onebox.js")).href), RW = await import(pathToFileURL(path.join(ROOT, "lib/reasonWords.js")).href);
const bar = (period, low, high, label) => ({ period, label: label || period, low, high, typical: Math.round((low + high) / 2), count: 9 });
const M6 = { movement: { size: "year", buckets: [bar("2024", 43500, 56000), bar("2025", 43500, 56000), bar("2026", 35500, 83000)] } };
const rowsOf = prices => prices.map(p => ({ _usd: p, mods: null, year: 1987, mileage: "50000" }));
const WIDE = [35500, 83000], pool = rowsOf([36000, 44000, 47000, 50000, 52000, 55000, 60000, 70000, 80000]);
{ // (1)
  const ps = E.periodSpreadOf(M6);
  ok("(1) the 1987 M6 bars: 2026 spread, 3.8 times the year before", ps && ps.period === "2026" && ps.priorLow === 43500 && ps.priorHigh === 56000 && ps.low === 35500 && ps.high === 83000 && ps.ratio === 3.8, JSON.stringify(ps));
  const w = E.wideOf(pool, WIDE, M6);
  ok("(1) the sentence: The range is wide because 2026 spread to $35,500 to $83,000 from $43,500 to $56,000 the year before.", w && w.wideLine === "The range is wide because 2026 spread to $35,500 to $83,000 from $43,500 to $56,000 the year before." && w.wideLine === RW.reasonLine("wide.period", { label: "2026", low: 35500, high: 83000, pLow: 43500, pHigh: 56000 }), w && w.wideLine);
  ok("(1) the cause is the period and the figures ride on the answer", w.wideCause === "period" && w.wideLever === null && w.widePeriod && w.widePeriod.ratio === 3.8);
  const q = { movement: { size: "quarter", buckets: [bar("2025-Q3", 40000, 50000, "Q3 2025"), bar("2025-Q4", 40000, 52000, "Q4 2025"), bar("2026-Q3", 30000, 70000, "Q3 2026")] } };
  const wq = E.wideOf(pool, WIDE, q); ok("(1) quarterly bars: Q3 2026 against Q3 2025, the year before", wq && /Q3 2026 spread to \$30,000 to \$70,000 from \$40,000 to \$50,000 the year before\./.test(wq.wideLine), wq && wq.wideLine);
  const under = { movement: { size: "year", buckets: [bar("2024", 40000, 60000), bar("2025", 40000, 60000), bar("2026", 38000, 66000)] } };
  ok("(1) under 1.5 times the year before (1.4): no period sentence", E.periodSpreadOf(under) === null && E.wideOf(pool, WIDE, under).wideCause !== "period");
  const exactly = { movement: { size: "year", buckets: [bar("2024", 40000, 60000), bar("2025", 40000, 60000), bar("2026", 35000, 65000)] } };
  ok("(1) exactly 1.5 times counts", E.periodSpreadOf(exactly) && E.periodSpreadOf(exactly).ratio === 1.5);
  const noYear = { movement: { size: "year", buckets: [bar("2025", 40000, 50000), bar("2026", 30000, 90000), bar("2027", 30000, 90000)] } };
  ok("(1) the latest bar is compared with the bar ONE YEAR EARLIER (2027 with 2026 here, not the oldest)", E.periodSpreadOf(noYear) === null, JSON.stringify(E.periodSpreadOf(noYear)));
  const gap = { movement: { size: "year", buckets: [bar("2023", 40000, 50000), bar("2024", 40000, 50000), bar("2026", 20000, 90000)] } };
  ok("(1) no bar a year earlier (2025 missing): no sentence, nothing invented", E.periodSpreadOf(gap) === null);
}
{ // (2) mileage and the period
  const rows = Array.from({ length: 12 }, (_, i) => ({ _usd: 83000 - i * 4000, mods: null, year: 1987, mileage: String(44000 + i * 5000) }));
  const base = E.wideOf(rows, WIDE, null), w = E.wideOf(rows, WIDE, M6);
  ok("(2) mileage explains the pool (the sentence as it was without the bars)", base && base.wideCause === "mileage" && /^The range is wide because mileage runs from/.test(base.wideLine), base && base.wideLine);
  ok("(2) with the period too: ONE sentence names both, mileage first, and the cause stays mileage", w.wideCause === "mileage" && w.wideLever === "mileage" && /^The range is wide because mileage runs from [\d,]+ to [\d,]+ miles and 2026 spread to \$35,500 to \$83,000 from \$43,500 to \$56,000 the year before\.$/.test(w.wideLine) && w.widePeriod, w.wideLine);
  const mods = rowsOf([30000, 31000, 32000, 60000, 62000, 64000, 66000, 68000, 70000]).map((r, i) => ({ ...r, mods: i < 3 ? "wheels" : null }));
  const wm = E.wideOf(mods, [30000, 70000], M6); ok("(2) modified cars named a smaller cause: the period (the chart's) wins", wm.wideCause === "period", wm.wideLine);
  ok("(2) no field leaks from the mileage figures", !("_lo" in w) && !("_hi" in w) && !("_lo" in base));
}
{ // (3) a stored answer
  const stored = { tier: "result", cluster: WIDE, rawPool: pool, trend: M6, wideCause: "none", wideLine: "x", poolN: 9 };
  const V = { year: 1987, make: "BMW", model: "M6" };
  const out = E.withReadFields(JSON.parse(JSON.stringify(stored)), "1987 BMW M6", V);
  ok("(3) a stored answer gains the period sentence on read, with no warm", out.wideCause === "period" && /2026 spread to \$35,500 to \$83,000/.test(out.wideLine), out.wideLine);
  const again = E.withReadFields(JSON.parse(JSON.stringify(out)), "1987 BMW M6", V);
  ok("(3) a second read changes nothing", again.wideLine === out.wideLine && again.wideCause === "period");
  const held = E.withReadFields({ ...JSON.parse(JSON.stringify(stored)), trendHeld: { reason: "mix_changes" } }, "x", V);
  ok("(3) a chart that was withheld is not read: the sentence stays what it was", held.wideCause === "none" && held.wideLine === "x");
}
{ // (4) the engine's words
  const onebox = fs.readFileSync(path.join(ROOT, "lib/onebox.js"), "utf8").replace(/\/\/[^\n]*/g, "");
  ok("(4) the engine types no 'spread to' sentence: it is the reason table's", !/spread to/.test(onebox));
  const pages = ["api/buy.js", "api/onebox.js", "api/history.js", "lib/findCardKit.js", "lib/tasks/emailCards.js", "lib/desk/reportPdf.js", "public/js/deskvals.js"].filter(f => fs.existsSync(path.join(ROOT, f)));
  const leaks = pages.filter(f => /spread to/.test(fs.readFileSync(path.join(ROOT, f), "utf8")));
  ok("(4) no page, card, email or report types the sentence", leaks.length === 0, leaks.join(", "));
  ok("(1) a fresh answer is given the chart's own bars when it sets the wide line (the answer's final assembly)", /wideOf\(d\.rawPool, d\.cluster, d\.trendHeld \? null : d\.trend\)/.test(onebox));
  ok("(4) widePeriod is a registered engine field", /"widePeriod"/.test(fs.readFileSync(path.join(ROOT, "lib/engineFields.js"), "utf8")));
}
console.log("\nwidePeriodCheck: " + (n - failed) + " pass, " + failed + " FAIL"); process.exit(failed ? 1 : 0);
