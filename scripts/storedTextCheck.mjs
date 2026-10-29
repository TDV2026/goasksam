// A ROW STORED BEFORE THE CHANGE SERVES THE CURRENT TEXT (Lane B, Oct 29 2026, after e2b58967). The warm skips rows already stored at the current epoch and stamp, so a row stored before the Find wording and the title line changed keeps the
// lines it was stored with: thin_sales.answer_line and count_line, a core's answerLine and countLine, and no scopeLine. CAUSE: those lines were built when the row was stored, not when it is read. FIX: lib/onebox.js freshenStoredText restates
// them at read time from the row's own fields (pick/choose becomes the unsaid line, a counted thin card's count line loses the count, thin_sales is rebuilt from rawPool, scopeLine is added), and every reader of a stored row calls it.
// CLASS: every stored shape (a Market Check row that is thin, one split apart, one that is a plain range; a core that is thin, split, a range) and every reader (readWarmAnswer*, marketFromCore, withReadFields). Rows here are built as they were
// STORED before the change; the check reads them through the real readers.
//   node scripts/storedTextCheck.mjs [repo root]
import fs from "node:fs";
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2";
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href), S = await import(pathToFileURL(path.join(root, "lib/live/search.js")).href);
const OLD_PICK = "These sales split into options priced apart, so pick one to see its range.";
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const states = (line, n) => new RegExp(`(^|[^\\d,.])(${n}|${n < 10 ? WORDS[n] : "x\u0000"})\\s+sales?\\b`, "i").test(String(line || ""));
const pool = n => Array.from({ length: n }, (_, i) => ({ id: "r" + i, _usd: 20000 + i * 900, year: 1995, auction_end_date: "2026-0" + (1 + (i % 8)) + "-10", rtitle: "1995 Porsche 911 Carrera", raw_title: "1995 Porsche 911 Carrera" }));
const opts = [{ dimension: "gearbox", label: "Manual", value: "manual", n: 13 }, { dimension: "gearbox", label: "Tiptronic", value: "auto", n: 10 }];
const base = { engineVersion: "e99-20261028-trimfix", resolvedCar: { year: 1995, make: "Porsche", model: "911", bodyStyle: null }, rungLabel: "1995 911", poolYears: [1995, 1995], freshness: { through: "2026-10-21", archiveThrough: "2026-10-21" }, windowWords: "since June 2025" };
// the rows as they were stored before the change: lines with the count twice, the old sentence, no scopeLine
const MC_THIN = { ...base, tier: "thin", poolN: 6, rawPool: pool(6), cluster: null, thin_sales: { count: 6, thin: true, sales: [], answer_line: "Six sales, too few for a range.", count_line: "Six sales since June 2025." } };
const MC_SPLIT = { ...base, tier: "result", poolN: 23, rawPool: pool(23), cluster: null, optionsState: "split", headlineDimension: "gearbox", options: opts, thinReason: "pooled_apart", thinLine: OLD_PICK,
  thin_sales: { count: 23, thin: false, sales: [], answer_line: OLD_PICK, count_line: "23 sales since June 2025." } };
const MC_RANGE = { ...base, tier: "result", poolN: 30, rawPool: pool(30), cluster: [20000, 40000], thin_sales: null };
const CORE_THIN = { kind: "thin", count: 6, countLine: "Six sales since June 2025.", answerLine: "Six sales, too few for a range.", thin_sales: { count: 6, thin: true, sales: [], answer_line: "Six sales, too few for a range.", count_line: "Six sales since June 2025." } };
const CORE_SPLIT = { kind: "thin", count: 23, thinReason: "pooled_apart", thinLine: OLD_PICK, countLine: "23 sales since June 2025.", answerLine: OLD_PICK, thin_sales: { count: 23, thin: false, sales: [], answer_line: OLD_PICK, count_line: "23 sales since June 2025." } };
const ROW = { listing_title: "1995 Porsche 911 Carrera Cabriolet", year: 1995, make: "Porsche", model: "911" };
const find = m => [...new Set([m.countLine, m.answerLine, m.thin_sales && m.thin_sales.answer_line, m.thin_sales && m.thin_sales.count_line].filter(x => typeof x === "string" && x))];
const clean = (name, lines, n) => {
  ok(`${name}: no Find line says pick or choose`, !lines.some(l => /\b(pick|choose)\b/i.test(l)), lines.join(" | "));
  ok(`${name}: no Find line is blank`, lines.length > 0 && lines.every(l => l.trim().length > 3));
  ok(`${name}: the total (${n}) is stated once across the Find lines`, lines.filter(l => states(l, n)).length <= 1, lines.join(" | "));
};
// 1. the Market Check row, through freshenStoredText (the reader's step) and through withReadFields (what Market Check serves)
for (const [name, row, n] of [["mc thin", MC_THIN, 6], ["mc split", MC_SPLIT, 23]]) {
  const f = E.freshenStoredText(row); clean(name + " (freshenStoredText)", find(f), n);
  const w = E.withReadFields(row, "1995 Porsche 911", { year: 1995 }); clean(name + " (withReadFields)", find(w), n);
  ok(`${name}: scopeLine is served (a string with the latest sale, no count, and not the title's year again)`, typeof w.scopeLine === "string" && !/1995/.test(w.scopeLine) && /atest sale Oct 21, 2026/.test(w.scopeLine) && !states(w.scopeLine, n), w.scopeLine);
}
{ const f = E.freshenStoredText(MC_SPLIT); ok("mc split: the unsaid line names the groups from the row's own options", f.thin_sales.answer_line === "Manual and Tiptronic cars sell for different money, and this listing does not say which it is, so there is no single range.", f.thin_sales.answer_line);
  ok("mc split: Market Check's own thinLine is untouched (the pills exist there)", f.thinLine === OLD_PICK); }
{ const w = E.withReadFields(MC_RANGE, "1995 Porsche 911", { year: 1995 }); ok("mc range: scopeLine is served and no thin_sales is invented", typeof w.scopeLine === "string" && w.scopeLine.length > 0 && !w.thin_sales, JSON.stringify([w.scopeLine, w.thin_sales])); }
// 2. the core, through the Find card's market object
for (const [name, core, n] of [["core thin", CORE_THIN, 6], ["core split", CORE_SPLIT, 23]]) {
  const spec = S.specOf(ROW), m = S.marketFromCore(core, ROW, { miles: null }, spec); clean(name + " (marketFromCore)", find(m), n);
}
// 2b. rows stored with a total in the footer, a repeated year and option lines without a since date serve the current footer and title line (Part 3, Oct 29 2026)
{ const old = { ...MC_SPLIT, options: opts.map(o => ({ ...o, low: 30000, high: 50000, rangeFloor: false, windowWords: "since June 2025" })), windowLine: "23 sales, since June 2025.", basisLine: "Based on 23 sales, the latest in October 2026.", latestSaleLine: "The latest sale was October 21, 2026.", countLine: "23 sales since June 2025.", scopeLine: "1995 · 23 latest sale Oct 21, 2026", resolvedCar: { year: 1995, make: "Porsche", model: "911", canonicalLabel: "1995 Porsche 911" } };
  const f = E.freshenStoredText(old), w = E.withReadFields(old, "1995 Porsche 911", { year: 1995 });
  ok("a stored split row serves no total in the footer (windowLine, basisLine, latestSaleLine, countLine null)", !f.windowLine && !f.basisLine && !f.latestSaleLine && !f.countLine, JSON.stringify([f.windowLine, f.basisLine, f.countLine]));
  ok("a stored row's scopeLine is restated without the title's year", f.scopeLine === "Latest sale Oct 21, 2026" || !/1995/.test(f.scopeLine), f.scopeLine);
  ok("a stored row's options print their own count and since date when served", (w.optionLines || []).filter(l => !/too few/.test(l)).every(l => /\d sales? since [A-Z][a-z]+ \d{4}/.test(l)), (w.optionLines || []).join(" | "));
  const oldCore = { ...CORE_SPLIT, optionsState: "split", optionLines: ["Manual $57,000 to $92,500, 18 sales", "Tiptronic $48,000 to $65,500, 13 sales"] }, c = E.freshenStoredText(oldCore);
  ok("a stored core with options serves no total count line", c.countLine === null && c.thin_sales.count_line === null, JSON.stringify([c.countLine, c.thin_sales && c.thin_sales.count_line]));
  const single = { ...MC_RANGE, windowLine: "30 sales, since June 2025.", optionsState: "none", options: [] }, sf = E.withReadFields(single, "1995 Porsche 911", { year: 1995 });
  ok("a stored single range keeps its footer line", sf.windowLine === "30 sales, since June 2025."); }
// 3. idempotent: a row stored with the current text comes back unchanged
{ const cur = E.freshenStoredText(MC_SPLIT), again = E.freshenStoredText(cur); ok("a row with the current text comes back unchanged", JSON.stringify(cur) === JSON.stringify(again));
  const t = E.thinSalesOf(MC_THIN); ok("thin_sales rebuilt from rawPool is the text the engine stores today", E.freshenStoredText(MC_THIN).thin_sales.count_line === t.count_line && E.freshenStoredText(MC_THIN).thin_sales.answer_line === t.answer_line); }
// 4. every reader of a stored row restates: the class, by reading the code that reads rows
{ const src = fs.readFileSync("lib/live/search.js", "utf8"), rd = (src.match(/row\.market\.raw(?![A-Za-z])/g) || []).length, fr = (src.match(/freshenStoredText\(row\.market\.raw\)/g) || []).length;
  ok(`readWarmAnswerDetailed and readWarmAnswer serve the restated raw (${fr} of the 2 places that return row.market.raw)`, fr === 2, `${rd} mentions of row.market.raw`);
  ok("marketFromCore restates the core it is given", /export function marketFromCore\(core, row, facts, spec\) \{\s*core = freshenStoredText\(core\)/.test(src));
  const on = fs.readFileSync("lib/onebox.js", "utf8"); ok("withReadFields restates the row it is given", /export function withReadFields\(d, text, vehicle\) \{[\s\S]{0,200}d = freshenStoredText\(d\)/.test(on));
  const leaks = []; for (const f of ["api/_historyData.js", "api/sellerDecision.js", "lib/live/samChat.js", "lib/live/narrow.js", "lib/platformPick.js"]) { const t = fs.readFileSync(f, "utf8"); if (/market\.raw\b/.test(t) && !/freshenStoredText|readWarmAnswer|withReadFields/.test(t)) leaks.push(f); }
  ok("no other file reads a stored row's raw around the readers", leaks.length === 0, leaks.join(" "));
  // api/usageDashboard.js (read-only ops tasks) looks at the stored raw on purpose
  const direct = []; const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => { const p = path.join(d, e.name); if (e.isDirectory()) { if (!/node_modules|\.git|proofs|scripts|docs/.test(e.name)) walk(p); } else if (/\.(js|mjs)$/.test(e.name) && p !== "lib/live/search.js" && p !== "api/usageDashboard.js") { const t = fs.readFileSync(p, "utf8"); if (/spec_market_cache[^\n]*MCWARM|MCWARM:[^\n]*select=market/.test(t) && /\.market\.raw\b/.test(t) && !/freshenStoredText|withReadFields/.test(t)) direct.push(p); } });
  walk("lib"); walk("api"); ok("no file outside the readers selects an MCWARM row and prints its raw", direct.length === 0, direct.join(" ")); }
console.log(fail ? `storedTextCheck: ${fail} failure(s)` : "storedTextCheck: all pass");
process.exit(fail ? 1 : 0);
