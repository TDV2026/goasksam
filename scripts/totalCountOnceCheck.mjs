// THE TOTAL COUNT IS PRINTED ONCE (Lane B, Oct 29 2026). Live Market Check, 1995 Porsche 911: under the title "Cabriolets and coupes, 1995 · 43 sales · latest sale Oct 21, 2026" and in the card footer "43 sales, since October 2025. Updated Oct 28, 2026."
// WHERE EACH LINE CAME FROM: the title line was built by the PAGE (public/js/onebox.js heroScopeLineText) from five engine fields: resolvedCar.bodyStyle and rungLabel (the body words), poolYears (the years), soldCount (the count, as a word or a number)
// and freshness.through (the latest sale). The footer is the engine's own windowLine ("43 sales, since October 2025."), printed by the card (lib/sellsForCard.js) with the date of the last ingest. Two fields, one number.
// FIX: the footer stays the one place that states the total and the window. The engine sends scopeLine (lib/onebox.js scopeLineOf): what the car is and its latest sale, no count; the page prints it. The same class on the Find thin card: its answer line
// ("Six sales, too few for a range.") and its count line ("Six sales since June 2025.") both stated the total; the count line is now the window alone ("Since June 2025."). Option counts ("32 sales" on an option, "3 sales, too few for a range") and pill
// counts are other numbers and stay. This check: for every answer shape, the visible lines the pages print (scopeLine, the footer or basis line, the thin card's answer and count lines, the Find answer lines) state the answer's total at most once.
//   node scripts/totalCountOnceCheck.mjs [repo root]
import fs from "node:fs";
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
// does a line state the total? "43 sales", "Six sales", "17 sales" (the number or its word, then "sale")
const states = (line, n) => { const w = n < 10 ? WORDS[n] : null; return new RegExp(`(^|[^\\d,.])(${n}|${w || "x\u0000"})\\s+sales?\\b`, "i").test(String(line || "")); };
// the visible lines a page prints for an answer, as the pages print them: the title line, then the footer (windowLine) or, when there is none, the basis line, then the thin card's two lines and the Find answer's lines
// (the Find card prints findAnswer.lines when the engine sends them and the thin_sales lines otherwise)
const visible = d => (d.findAnswer && d.findAnswer.lines ? [d.scopeLine, ...d.findAnswer.lines] : [d.scopeLine, d.windowLine || d.basisLine, d.thin_sales && d.thin_sales.answer_line, d.thin_sales && d.thin_sales.count_line]).filter(x => typeof x === "string" && x);
const total = d => Number(d.poolN ?? d.soldCount ?? (d.thin_sales && d.thin_sales.count));
const once = (name, d) => { const n = total(d), lines = visible(d), hits = lines.filter(l => states(l, n)); ok(`${name}: the total (${n}) is stated once in ${lines.length} visible lines`, hits.length <= 1, hits.length > 1 ? JSON.stringify(hits) : ""); return hits.length; };
const base = JSON.parse(fs.readFileSync("scripts/fixtures/m3Answer.json", "utf8"));
const served = (d) => { const r = E.withReadFields(d, "1995 Porsche 911", { year: 1995 }); return r; };
// 1. the 1995 911: pooled, two bodies, 43 sales, a window line
{
  const d = served({ ...base, poolN: 43, soldCount: 43, soldCountN: 43, windowWords: "since October 2025", windowLine: "43 sales, since October 2025.", basisLine: "Based on 43 sales, the latest in October 2026.", poolYears: [1995, 1995],
    rungLabel: "1995 911, cabriolets and coupes", resolvedCar: { year: 1995, make: "Porsche", model: "911", bodyStyle: null }, freshness: { through: "2026-10-21", archiveThrough: "2026-10-21" } });
  ok("scopeLine exists (the engine's title line)", typeof d.scopeLine === "string" && d.scopeLine.length > 0, d.scopeLine);
  ok("the title line states what the car is and its latest sale, with no count (the year is the title's: 1995 911 carries it, so the line does not repeat it)", /Cabriolets and coupes/.test(d.scopeLine || "") && !/1995/.test(d.scopeLine || "") && /latest sale Oct 21, 2026/.test(d.scopeLine || "") && !/\bsales?\b.*\bsales?\b|\d+\s+sales?|(one|two|three|four|five|six|seven|eight|nine)\s+sales?/i.test(d.scopeLine || ""), d.scopeLine);
  once("1995 911, pooled", d);
  // the single option and the split shapes keep their option counts; those are other numbers
  const opt = served({ ...d, optionsState: "split", headlineDimension: "body", cluster: null, options: [{ dimension: "body", label: "Coupe", value: "coupe", n: 32, low: 60000, high: 90000, rangeFloor: false, windowWords: "since October 2025", ownWindow: true }, { dimension: "body", label: "Cabriolet", value: "open", n: 3, low: null, high: null, rangeFloor: true, windowWords: "since October 2025", ownWindow: true }] });
  once("1995 911, split into options", opt);
  ok("the option counts still print (32 sales on an option, 3 sales too few for a range)", (opt.optionLines || []).some(l => /32 sales/.test(l)) && (opt.optionLines || []).some(l => /3 sales, too few for a range/.test(l)), (opt.optionLines || []).join(" | "));
}
// 2. a house pool and a one-year pool
{ const d = served({ ...base, poolN: 12, soldCount: 12, windowLine: "12 sales, since March 2024.", windowWords: "since March 2024", poolYears: [1962, 1964], rungLabel: "250 GT, 1962 to 1964", freshness: { through: "2026-04-10", mode: "house" } });
  once("a house pool", d); ok("a house pool's title line names the month, not a day", /latest sale April 2026/.test(d.scopeLine || ""), d.scopeLine); }
// 3. the thin card (Find): the answer line and the count line state the total once between them
for (const n of [3, 6]) {
  const rawPool = Array.from({ length: n }, (_, i) => ({ id: "t" + i, _usd: 20000 + i * 900, year: 2005, auction_end_date: "2026-0" + (1 + i) + "-10", rtitle: "2005 Porsche 911 Carrera", raw_title: "2005 Porsche 911 Carrera" }));
  const ts = E.thinSalesOf({ tier: "thin", poolN: n, rawPool, windowWords: "since June 2025" });
  const d = { scopeLine: "2005", poolN: n, thin_sales: ts, findAnswer: null };
  once(`a thin pool of ${n} (the Find card's two lines)`, d);
  ok(`thin ${n}: the count line is the window alone`, ts && ts.count_line === "Since June 2025.", ts && ts.count_line);
}
// 4. a pool at the range threshold with no range keeps its count line (the answer line is the engine's reason, not a count)
{ const rawPool = Array.from({ length: 9 }, (_, i) => ({ id: "m" + i, _usd: 20000 + i * 9000, year: 2005, auction_end_date: "2026-03-1" + i, rtitle: "2005 Porsche 911 Carrera" }));
  const ts = E.thinSalesOf({ tier: "result", poolN: 9, rawPool, thinReason: "mixed_prices", windowWords: "since June 2025" });
  once("nine sales, no range", { poolN: 9, thin_sales: ts }); ok("... its count line still carries the count (the answer line is a reason)", ts && /^Nine sales since June 2025\.$/.test(ts.count_line), ts && ts.count_line); }
// 5. the page prints the engine's line and builds none that counts
{ const pg = fs.readFileSync("public/js/onebox.js", "utf8"), i = pg.indexOf("function heroScopeLineText"), body = pg.slice(i, pg.indexOf("function heroMetaLine(", i));
  ok("the page prints d.scopeLine when the engine sends it", /typeof d\.scopeLine === "string" && d\.scopeLine\) return d\.scopeLine/.test(body));
  ok("the page's own title line has no count in it", !/countTxt|obNumWord|" sales?"|\? " sale" : " sales"/.test(body.replace(/\/\/[^\n]*/g, ""))); }
console.log(fail ? `totalCountOnceCheck: ${fail} failure(s)` : "totalCountOnceCheck: all pass");
process.exit(fail ? 1 : 0);
