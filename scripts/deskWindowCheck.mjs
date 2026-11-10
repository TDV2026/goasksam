// clock: real-ok the world's sales are dated relative to now; the direct tests name their own fixed dates (Lane B, Nov 2026)
// DESK V4 STAGE 1, THE WINDOWS (Lane B, Nov 10 2026). desk.evidence.byWindow["6"|"12"|"24"] = { months, count, matching, q1, median, q3, low, high, periodLine, latestSale, populationLine, insufficient, sentence }:
//   (1) each window holds exactly the dated sales on or after its cutoff (the cutoff day is in, the day before is out), derived here from literal dates, and its figures are the window's own
//   (2) the chosen window (desk.windowMonths, 6, 12 or 24, anything else and none read 12) IS desk.evidence and IS market.meter, for every Desk model
//   (3) a window under the minimum has no number of any kind and says so in a table sentence; a tier needs five
//   (4) sentences are reason table lines; periodLine names the first and last sale dates; latestSale is the newest sale of the window with its price, date in words, platform and link
//   (5) an undated sale is in no window; a sale excluded from the market calculation is in none, and desk.original keeps it
//   node scripts/deskWindowCheck.mjs [root]     --mutants proves each rule by breaking it in a copy
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { fileURLToPath, pathToFileURL } from "node:url"; import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), rootArg = args.find(a => !a.startsWith("--")), ROOT = path.resolve(rootArg || path.join(here, ".."));
if (args.includes("--mutants")) {
  const DV = "lib/deskV3.js", SR = "lib/sheetRead.js";
  const muts = [
    [DV, "medianLine: reasonLine(\"desk4.median\", { median: quant(prices, 0.5) }), q1:", "q1:", "(7) the window has no medianLine"],
    [DV, "median: e.median, medianLine: e.medianLine, q3: e.q3", "median: e.median, q3: e.q3", "(7) the window entry has no medianLine"],
    [DV, "priceLine: reasonLine(\"desk4.price\", { price: Math.round(Number(r.price)) }), dateLine", "dateLine", "(7) a sale has no priceLine"],
    [DV, "d.setUTCMonth(d.getUTCMonth() - months);", "d.setUTCMonth(d.getUTCMonth() - 12);", "(1) every window reads twelve months"],
    [DV, "iso(r.date) >= c); };", "iso(r.date) > c); };", "(1) the cutoff day is out"],
    [DV, "(rows || []).filter(r => iso(r.date) && iso(r.date) >= c)", "(rows || []).filter(r => !iso(r.date) || iso(r.date) >= c)", "(5) an undated sale is in every window"],
    [DV, "export const windowMonthsOf = desk => { const m = Number(desk && desk.windowMonths); return WINDOWS.includes(m) ? m : WINDOW_DEFAULT; };", "export const windowMonthsOf = desk => { const m = Number(desk && desk.windowMonths); return WINDOWS.includes(m) ? m : 24; };", "(2) the default window is not twelve"],
    [DV, "return { ...e, windowMonths: months,", "return { ...evidenceOf(pop, matching, d, env), windowMonths: months,", "(2) the evidence is the whole population, not the chosen window"],
    [SR, "p25: ev.q1, median: ev.median, p75: ev.q3, high: ev.high };", "p25: ev.q1, median: ev.byWindow[\"24\"].median, p75: ev.q3, high: ev.high };", "(2) the meter reads another window"],
    [DV, "const min = desk.tier ? DESK_TIER_MIN : DESK_EVIDENCE_MIN;", "const min = 1;", "(3) one sale gives a reference"],
    [DV, "median: null, medianLine: null, q1: null, q3: null, low: null, high: null, typicalLine", "median: quant(prices, 0.5), medianLine: null, q1: null, q3: null, low: null, high: null, typicalLine", "(3) an insufficient window returns a median"],
    [DV, "reasonLine(\"desk4.period\", { from: deskDateShort(iso(dated[dated.length - 1].date)), to: deskDateShort(asOf) })", "reasonLine(\"desk4.period\", { to: deskDateShort(iso(dated[dated.length - 1].date)), from: deskDateShort(asOf) })", "(4) the period runs backwards"],
    [DV, "const dated = rows.filter(r => iso(r.date)).sort((a, b) => iso(b.date).localeCompare(iso(a.date))), latest = dated[0] || null;", "const dated = rows.filter(r => iso(r.date)).sort((a, b) => iso(a.date).localeCompare(iso(b.date))), latest = dated[0] || null;", "(4) the latest sale is the oldest"],
    [DV, "url: latest.url || null } : null,", "url: null } : null,", "(4) the latest sale has no link"],
    [DV, "const rowsCalc = rows.filter(r => !calc.has(String(r.id)))", "const rowsCalc = rows", "(5) an excluded sale stays in the windows"]
  ];
  let survivors = 0;
  for (const [file, from, to, want] of muts) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dwc-"));
    spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", ROOT + "/", dir + "/"]); fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"));
    const fp = path.join(dir, file), src = fs.readFileSync(fp, "utf8"), m = src.replace(from, to);
    if (m === src) { console.log(`MUTANT NOT APPLIED  ${want}`); survivors++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
    fs.writeFileSync(fp, m);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/deskWindowCheck.mjs"), dir], { encoding: "utf8" }), killed = r.status !== 0;
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
const pats = RW.reasonPatterns(), line = (field, s) => typeof s === "string" && pats.some(p => p.field === field && p.re.test(s));
const q = (a, p) => { const s = a.slice().sort((x, y) => x - y), i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return Math.round(s[lo] + (s[hi] - s[lo]) * (i - lo)); };
// ---- direct, literal dates. case date 2026-11-10: cutoffs are 2026-05-10 (6), 2025-11-10 (12), 2024-11-10 (24)
const CASE = "2026-11-10", sub = { transmission: "Manual", body: "Coupe" };
const row = (id, price, date, extra = {}) => ({ id, price, date, platform: "Bring a Trailer", url: "https://x.test/" + id, miles: 40000, inPopulation: true, ...extra });
const rows = [row("a", 50000, "2026-11-01"), row("b", 51000, "2026-08-15"), row("c", 52000, "2026-05-10"), row("d", 53000, "2026-05-09"), row("e", 54000, "2026-02-01"), row("f", 55000, "2025-11-10"), row("g", 56000, "2025-11-09"), row("h", 57000, "2025-03-01"), row("i", 58000, "2024-11-10"), row("j", 59000, "2024-11-09"), row("k", 60000, "2023-01-01"), row("u", 99999, null)];
const ids = { 6: ["a", "b", "c"], 12: ["a", "b", "c", "d", "e", "f"], 24: ["a", "b", "c", "d", "e", "f", "g", "h", "i"] };
const blk = async (r, d = {}) => (await DV.deskBlock(r, { caseDate: CASE, subject: sub, subjectFacts: {}, ...d })).evidence;
{ const e = await blk(rows, { windowMonths: 24 });
  for (const m of [6, 12, 24]) {
    const w = e.byWindow[String(m)], want = rows.filter(r => ids[m].includes(r.id)), ps = want.map(r => r.price);
    ok(`(1) ${m} months: exactly the sales on or after the cutoff (${want.length}); the cutoff day in, the day before out`, w && w.months === m && w.count === want.length && w.matching === want.length, `${w && w.count}`);
    ok(`(1) ${m} months: q1, median, q3, low, high are the window's own`, w.q1 === q(ps, 0.25) && w.median === q(ps, 0.5) && w.q3 === q(ps, 0.75) && w.low === Math.min(...ps) && w.high === Math.max(...ps), JSON.stringify([w.q1, w.median, w.q3, w.low, w.high]));
  }
  ok("(1) the windows nest: 6 <= 12 <= 24 sales", e.byWindow["6"].count <= e.byWindow["12"].count && e.byWindow["12"].count <= e.byWindow["24"].count);
  ok("(5) the undated sale is in no window", rows.length - 1 === 11 && ["6", "12", "24"].every(k => e.byWindow[k].high !== 99999));
}
{ for (const [ask, want] of [[6, 6], [12, 12], [24, 24], [7, 12], [0, 12], [undefined, 12], ["24", 24]]) {
    const e = await blk(rows, { windowMonths: ask });
    ok(`(2) windowMonths ${JSON.stringify(ask)} reads ${want} months: desk.evidence is that window`, e.windowMonths === want && e.count === e.byWindow[String(want)].count && e.median === e.byWindow[String(want)].median && e.q1 === e.byWindow[String(want)].q1 && e.q3 === e.byWindow[String(want)].q3 && e.low === e.byWindow[String(want)].low && e.high === e.byWindow[String(want)].high, `${e.count}`); }
}
{ const e = await blk(rows, { windowMonths: 6 });
  ok("(4) periodLine names the first and last sale dates in words", e.byWindow["6"].periodLine === "May 10, 2026 to Nov 1, 2026" && line("desk.evidence.byWindow.periodLine", e.byWindow["6"].periodLine), e.byWindow["6"].periodLine);
  const ls = e.byWindow["6"].latestSale;
  ok("(4) latestSale is the newest sale of the window: price, date in words, platform, link", ls && ls.price === 50000 && ls.dateLine === "Nov 1, 2026" && ls.line === "Latest sale $50,000, Nov 1, Bring a Trailer." && ls.platform === "Bring a Trailer" && ls.url === "https://x.test/a", JSON.stringify(ls));
  ok("(4) the population line and every sentence are reason table lines", ["6", "12", "24"].every(k => line("desk.evidence.byWindow.populationLine", e.byWindow[k].populationLine)), e.byWindow["6"].populationLine);
  ok("(4) no dash in any window sentence", ["6", "12", "24"].every(k => !/[–—]|\s-\s/.test([e.byWindow[k].periodLine, e.byWindow[k].populationLine, e.byWindow[k].sentence || ""].join(" "))));
  const b6 = e.byWindow["6"], b12 = e.byWindow["12"], usd = v => "$" + v.toLocaleString("en-US");
  ok("(4) the mockup's market card lines: typical range, lowest to highest, the count, all from the window", b6.typicalLine === usd(b6.q1) + " to " + usd(b6.q3) && b6.extremesLine === "$50,000 to $52,000" && b6.countLine === "3 sales" && b12.countLine === "6 sales" && e.countLine === "3 sales", JSON.stringify([b6.typicalLine, b6.extremesLine, b6.countLine]));
  ok("(4) the evidence note: period, population, before buyer premium, date updated, one sentence", /^Sales from May 10, 2026 to Nov 1, 2026, .+, priced before buyer premium and updated Nov 10, 2026\.$/.test(e.noteLine) && line("desk.evidence.noteLine", e.noteLine), e.noteLine);
  const one = await blk([row("z", 40000, "2026-11-05"), row("y", 41000, "2026-11-05"), row("x", 42000, "2026-11-05")], {});
  ok("(4) all sales on one day: a day line, not a range", one.byWindow["12"].periodLine === "Nov 5, 2026" && line("desk.evidence.byWindow.periodLine", one.byWindow["12"].periodLine), one.byWindow["12"].periodLine);
}
{ const thin = await blk([row("a", 50000, "2026-11-01"), row("b", 51000, "2026-10-01"), row("c", 52000, "2025-12-01"), row("d", 53000, "2025-01-01"), row("e", 54000, "2025-02-01")], {});
  const w6 = thin.byWindow["6"], w12 = thin.byWindow["12"], w24 = thin.byWindow["24"];
  ok("(3) two sales in 6 months: insufficient, no number of any kind, a table sentence", w6.insufficient && [w6.q1, w6.median, w6.q3, w6.low, w6.high].every(v => v === null) && w6.count === 2 && line("desk.evidence.byWindow.sentence", w6.sentence) && !/\$/.test(w6.sentence), w6.sentence);
  ok("(3) three sales in 12 months give a reference; the same 5 in 24 months too", !w12.insufficient && w12.count === 3 && !w24.insufficient && w24.count === 5 && w12.sentence === null);
  const tier = await blk(Array.from({ length: 4 }, (_, i) => row("t" + i, 50000 + i * 1000, "2026-11-01", { tier: 2 })), { tier: 2, tierName: "Excellent" });
  ok("(3) a tier needs five sales in the window: four is insufficient in every window", ["6", "12", "24"].every(k => tier.byWindow[k].insufficient && tier.byWindow[k].median === null));
  ok("(3) the chosen window's sentence is the window's", thin.windowMonths === 12 && thin.insufficient === false);
  const s6 = await blk([row("a", 50000, "2026-11-01")], { windowMonths: 6 });
  ok("(3) the chosen window insufficient: the evidence has no number and says which window", s6.insufficient && s6.median === null && /last 6 months/.test(s6.sentence), s6.sentence);
}
{ const all = await DV.deskBlock(rows, { caseDate: CASE, subject: sub, subjectFacts: {}, windowMonths: 24, excludedIds: ["a", "c"], exclusionScope: { a: "market_calc", c: "report_comps" } });
  ok("(5) a sale excluded from the market calculation is in no window; desk.original keeps it", all.evidence.byWindow["6"].count === 2 && all.original.byWindow["6"].count === 3 && all.evidence.byWindow["24"].count === 8 && all.original.byWindow["24"].count === 9, `${all.evidence.byWindow["6"].count}/${all.original.byWindow["6"].count}`);
  ok("(5) a report only exclusion changes no window", all.evidence.byWindow["12"].count === 5);
}
// ---- through the engine, every Desk model: the meter is the chosen window
const w = W.install(); const quiet = console.error; console.error = () => {};
const today = new Date().toISOString().slice(0, 10);
const eqMeter = (m, e) => m && e && m.count === e.count && m.low === e.low && m.p25 === e.q1 && m.median === e.median && m.p75 === e.q3 && m.high === e.high;
for (const c of W.CASES) {
  const got = {};
  for (const months of [6, 12, 24, undefined]) {
    const sh = await S.sheetRead(w.env, { year: c.year, make: c.make, model: c.model, mileage: 40000, desk: { caseDate: today, transmission: c.transmission, label: c.label, ...(months ? { windowMonths: months } : {}) } }, w.deps), ev = sh && sh.desk && sh.desk.evidence, bw = ev && ev.byWindow;
    if (!ev || !bw) { ok(`${c.model} ${months || "default"}: the sheet read carries desk.evidence.byWindow`, false); continue; }
    got[months || "default"] = ev;
    const chosen = months || 12;
    ok(`${c.model} ${months || "default"}: evidence is the ${chosen} month window`, ev.windowMonths === chosen && ev.count === bw[String(chosen)].count && ev.median === bw[String(chosen)].median);
    ok(`${c.model} ${months || "default"}: market.meter equals the chosen window (count, low, q1, median, q3, high)`, ev.insufficient ? sh.market.meter === null : eqMeter(sh.market.meter, bw[String(chosen)]), JSON.stringify(sh.market.meter && [sh.market.meter.count, bw[String(chosen)].count]));
  }
  ok(`${c.model}: the windows nest (6 <= 12 <= 24), and 24 reads the same as 12 here (the archive runs 10 months)`, got[6] && got[12] && got[24] && got[6].count <= got[12].count && got[12].count === got[24].count, got[6] && [got[6].count, got[12].count, got[24].count].join("/"));
  ok(`${c.model}: no window ever carries a number when it is insufficient`, got[12] && ["6", "12", "24"].every(k => { const x = got[12].byWindow[k]; return !x.insufficient || [x.q1, x.median, x.q3, x.low, x.high].every(v => v === null); }));
}
{ const c = W.CASES[0], sh = a => S.sheetRead(w.env, { year: c.year, make: c.make, model: c.model, mileage: 40000, desk: { caseDate: today, transmission: c.transmission, label: c.label, windowMonths: a } }, w.deps);
  const a = (await sh(6)).desk.evidence, b = (await sh(12)).desk.evidence;
  ok("the 996 world: six months reads fewer sales than twelve", a.count < b.count, `${a.count} < ${b.count}`);
}
console.error = quiet;
// (7) THE LINES A SCREEN PRINTS (Lane S): evidence.medianLine on the chosen window and on each window of byWindow, priceLine and dateLine and milesLine on every sale, all from the reason table (money through moneyWords)
{ const full = await DV.deskBlock(rows, { caseDate: CASE, subject: sub, subjectFacts: {}, windowMonths: 12 }), e = full.evidence, usd = v => "$" + v.toLocaleString("en-US");
  ok("(7) evidence.medianLine is the chosen window's median as money, from the table", e.medianLine === usd(e.median) && e.medianLine === RW.reasonLine("desk4.median", { median: e.median }), e.medianLine);
  ok("(7) every window carries its own medianLine, equal to its median", ["6", "12", "24"].every(k => e.byWindow[k].medianLine === usd(e.byWindow[k].median) && e.byWindow[k].medianLine === RW.reasonLine("desk4.median", { median: e.byWindow[k].median })), JSON.stringify(["6", "12", "24"].map(k => e.byWindow[k].medianLine)));
  ok("(7) the windows' medianLines differ where their medians do", new Set(["6", "12", "24"].map(k => e.byWindow[k].medianLine)).size === new Set(["6", "12", "24"].map(k => e.byWindow[k].median)).size);
  ok("(7) every sale carries priceLine (its price as money), dateLine (its date in words) and milesLine (null when it states none)", full.sales.length > 0 && full.sales.every(x => x.priceLine === usd(x.price) && x.priceLine === RW.reasonLine("desk4.price", { price: x.price }) && /^[A-Z][a-z]{2} \d{1,2}, \d{4}$/.test(x.dateLine) && (x.milesLine === null || /^[\d,]+ miles$/.test(x.milesLine))), JSON.stringify(full.sales[0]));
  const thin = (await DV.deskBlock(rows.slice(0, 2), { caseDate: CASE, subject: sub, subjectFacts: {}, windowMonths: 12 })).evidence;
  ok("(7) an insufficient window has no medianLine (a number is never made up)", thin.insufficient && thin.medianLine === null && Object.values(thin.byWindow).every(w => !w.insufficient || w.medianLine === null)); }
console.log(`\ndeskWindowCheck: ${n - failed} pass, ${failed} FAIL`); process.exit(failed ? 1 : 0);
