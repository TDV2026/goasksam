// A count and its noun (Oct 27 2026): "One sales" on a Market Check card was one line of a class. The class is any line that builds a
// count word and types the noun in the plural. This check covers the class, not the example:
//   1. the one helper (lib/countNoun.js) at counts 0, 1, 2 and 8 for every noun the pages use, zero reading "No sales", never "0 sales";
//   2. the two twins (public/js/onebox.js obCount, lib/sellsForCard.js countNoun) are the same text as the helper;
//   3. the real lines that can print a count, rendered at 0, 1, 2 and 8: the Sell venue line, the Sells-for card footer and quarter row,
//      the Market Check no-chart line and the engine's own basis lines;
//   4. a scan of lib, api and public/js for a count word or a counted expression glued to a plural noun with no one-case: only the
//      lines listed below (each bounded by a floor of two or more) may remain.
//   node scripts/countNounCheck.mjs
import fs from "node:fs";
import path from "node:path";
globalThis.fetch = async () => { throw new Error("no network in this check"); };
let fails = 0, passes = 0;
const ok = (c, what) => { if (c) passes++; else { fails++; console.log("FAIL  " + what); } };
const read = p => fs.readFileSync(new URL("../" + p, import.meta.url), "utf8");
const { countNoun } = await import("../lib/countNoun.js");

// 1. the helper
const NOUNS = [["sale", "sales"], ["car", "cars"], ["listing", "listings"], ["quarter", "quarters"], ["odd sale", "odd sales"], ["sale set aside", "sales set aside"], ["Porsche 911 sale", "Porsche 911 sales"]];
for (const [one, many] of NOUNS) {
  ok(countNoun(0, one, { many }) === "no " + many && countNoun(0, one, { many, cap: true }) === "No " + many, `${one} at 0: "No ${many}" (got ${JSON.stringify(countNoun(0, one, { cap: true }))})`);
  ok(countNoun(1, one, { many }) === "one " + one && countNoun(1, one, { many, cap: true }) === "One " + one && countNoun(1, one, { many, words: false }) === "1 " + one, `${one} at 1`);
  ok(countNoun(2, one, { many }) === "two " + many && countNoun(2, one, { many, words: false }) === "2 " + many, `${one} at 2`);
  ok(countNoun(8, one, { many }) === "eight " + many && countNoun(8, one, { many, words: false }) === "8 " + many, `${one} at 8`);
  for (const k of [0, 1, 2, 8, 11, 3715]) { const t = countNoun(k, one, { many, words: false }); ok(!/\b0 /.test(t) && !(k === 1 && new RegExp("\\b1 " + many + "\\b").test(t)) && !/\bone sales\b/i.test(t), `${one} at ${k}: no "0 x" and no "1 ${many}" (${t})`); }
}
ok(countNoun(11, "sale") === "11 sales" && countNoun(3715, "sale") === "3,715 sales", "eleven and up are digits with a thousands separator");
ok(countNoun(3, "sale", { num: "three" }) === "three sales" && countNoun(1, "person", { many: "people" }) === "one person" && countNoun(2, "person", { many: "people" }) === "two people", "the caller's own number text and an irregular plural");

// 2. the twins
const norm = (src, name) => src.replace(new RegExp("\\b" + name + "\\b"), "F").replace(/^\s*export\s+/, "").replace(/\s+/g, " ").trim();
const grab = (src, name) => { const i = src.indexOf("function " + name + "("); let d = 0, j = src.indexOf("{", i); for (let k = j; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}" && --d === 0) return src.slice(i, k + 1); } return ""; };
const helperSrc = norm(grab(read("lib/countNoun.js"), "countNoun"), "countNoun");
ok(helperSrc.length > 100, "the helper source was found");
ok(norm(grab(read("public/js/onebox.js"), "obCount"), "obCount") === helperSrc, "public/js/onebox.js obCount is the same text as lib/countNoun.js");
ok(norm(grab(read("lib/sellsForCard.js"), "countNoun"), "countNoun") === helperSrc, "lib/sellsForCard.js countNoun is the same text as lib/countNoun.js");

// 3. the real lines at 0, 1, 2 and 8
const bad = t => /\b(one|1) (sales|cars|listings|quarters)\b/i.test(t) || /\b0 (sale|car|listing|quarter)/i.test(t) || /\b(two|three|four|five|six|seven|eight|nine|ten|[2-9]|\d{2,}) (sale|car|listing|quarter)\b(?!s)/i.test(t) || /\bone sales\b/i.test(t);
{ const { pickFacts } = await import("../lib/sell/sellFlow.js");
  const car = { v: { make: "Porsche", model: "911", year: 1995 }, generation: null };
  const BAT = { name: "Bring a Trailer", slug: "bringatrailer", house: false }, CB = { name: "Cars & Bids", slug: "carsandbids", house: false }, S3 = { name: "Site 3", slug: "s3", house: false };
  for (const total of [0, 1, 2, 3, 5, 8, 30]) {
    const places = total === 0 ? [] : total === 1 ? [{ ...BAT, sales: 1 }] : total === 2 ? [{ ...BAT, sales: 1 }, { ...CB, sales: 1 }] : [{ ...BAT, sales: 2 }, { ...CB, sales: 1 }, { ...S3, sales: total - 3 }].filter(p => p.sales > 0);
    const pl = { total, window_label: "in the last 12 months", cohort_name: "993 Carrera", places };
    const w = (await pickFacts({}, car, pl, places[0] || { ...BAT, sales: 0 }, {})).why || "";
    ok(!bad(w), `Sell venue line at ${total} sales reads right: ${JSON.stringify(w)}`);
  } }
{ const m = await import("../lib/sellsForCard.js");
  const qa = c => ({ cluster: [20000, 30000], poolN: 20, trendQuarters: [{ period: "2026-Q3", low: 40000, high: 60000, count: c, thin: false }] });
  for (const c of [0, 1, 2, 8]) { const t = m.latestQuarterRowHtml(qa(c)); ok(t === "" || !bad(t), `Sells-for quarter row at ${c}: ${JSON.stringify(t)}`); if (t) ok(c === 1 ? /\(1 sale\)/.test(t) : c === 0 ? /\(no sales\)/.test(t) : new RegExp("\\(" + c + " sales\\)").test(t), `quarter row at ${c} prints the right noun (${t})`); }
  for (const [bl, pn] of [["Based on one sale, the latest in March 2026.", 1], ["Based on two sales, the latest in March 2026.", 2], ["Based on eight sales, the latest in March 2026.", 8], ["Based on 30 sales, the latest in March 2026.", 30], ["", 1]]) {
    const html = m.sellsForCardHtml({ cluster: [20000, 30000], poolN: pn, basisLine: bl, headline: "x", updated: "2026-10-26" }, { marketHref: "/market-check?car=x" }) || "";
    const foot = (html.match(/sfc-footer-link[^>]*>(.*?)<\/a>/) || [])[1] || "";
    ok(!bad(foot.replace(/<[^>]+>/g, " ")), `Sells-for footer link at "${bl}" reads right: ${JSON.stringify(foot.replace(/<[^>]+>/g, " ").trim())}`);
  } }
{ const src = read("public/js/onebox.js"), body = grab(src, "noChartLineHtml");
  const NW = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"], obNumWord = n => NW[n] || Number(n).toLocaleString("en-US");   // the page's own table, so an old line fails here instead of crashing
  const heldLine = new Function("return (" + grab(src, "chartHeldSentence").replace("function chartHeldSentence", "function") + ")")();   // the page's own withheld-chart line
  const f = new Function("heroPoolSizeNum", "lint", "esc", "obCount", "obNumWord", "chartHeldSentence", "return (" + body.replace("function noChartLineHtml", "function") + ")");
  const ob = new Function("return (" + grab(src, "obCount").replace("function obCount", "function") + ")")();
  const draw = f(d => d.n, (s) => s, s => s, ob, obNumWord, heldLine);
  for (const n of [0, 1, 2, 8]) { const t = draw({ n }); ok(!bad(t) && (n === 1 ? /One sale\. Too few/.test(t) : n === 0 ? /^<p[^>]*>Too few sales to show movement/.test(t) : true), `Market Check no-chart line at ${n}: ${JSON.stringify(t.replace(/<[^>]+>/g, ""))}`); } }
{ const src = read("public/js/onebox.js");
  ok(/obCount\(n, "sale", \{ cap: true \}\) \+ "\. Too few to show movement/.test(src.slice(src.indexOf("function thinHeroHtml"))) || /hero\.thintiles\.said/.test(src) && !/obNumWord\(n\) \+ " sales/.test(src), "the thin hero said-line uses the helper"); }

// 4. the scan
const SAFE = [
  ["lib/onebox.js", "across ${solid.length} sales over", "a cluster needs eight solid sales"],
  ["lib/onebox.js", "count: `${countWord(dts.length)} sales`", "the else of dts.length === 1 (the basis line, built in lib/reasonWords.js)"],
  ["api/usageDashboard.js", "${yrs[y].length} sales, median", "the storedsweep ops task's example line (Lane B, read only): an ops diagnostic read by the crew, never shown to a visitor"],
  ["lib/onebox.js", "prints ${op.n} sales, its own page reads", "the engine's same-set self-check message (sameSetCheck), a diagnostic that is never shown to a visitor"],
  ["lib/onebox.js", "${inBand.length} sales, ${EY_USD(rf.rangeLow)}", "the mixed-trims line returns null under eight sales in the band"],
  ["lib/sell/sellFlow.js", "of the ${dnw(best.n)} sales", "best day needs twenty sales"],
  ["lib/sell/sellFlow.js", "dnw(rs.a.n))} of the ${n} sales", "reserve split needs eight on each side"],
  ["lib/sell/sellFlow.js", "dnw(rs.b.n))} of the ${n} sales", "reserve split needs eight on each side"],
  ["lib/sell/sellFlow.js", "of the ${nw(total)} sales", "reached only with three or more sales"],
  ["lib/sell/sellFlow.js", "${Cnt(total)} sales ${inWin}, but no single venue", "reached only with eight or more sales"],
  ["lib/tasks/tasks.js", "for your Task, live now", "the several-car subject is the helper's count and its noun, then the Task line"],
  ["api/sellerDecision.js", "${landed.sales} sales ${windowLabel", "printed only from ten sales"],
];
const pat = /((?:obNumWord|obNumWordLow|countWord|numWord|dnw|Cnt|low|COUNT_WORDS\[[^\]]*\]|timesWord)\([^()]*\)|\$\{[^}]*(?:\.length|\bn\b|\bcount\b|\btotal\b|\.n\b|\.sales\b|\.count\b)[^}]*\})\s*["'`]?\s*\+?\s*["'`]?\s*(sales|cars|listings|quarters|odd sales|set asides?)\b/g;
const left = [];
for (const root of ["lib", "api", "public/js"]) { const walk = d => { for (const e of fs.readdirSync(new URL("../" + d, import.meta.url), { withFileTypes: true })) { const p = d + "/" + e.name; if (e.isDirectory()) walk(p); else if (p.endsWith(".js")) {
  read(p).split("\n").forEach((l, i) => { if (/^\s*\/\//.test(l)) return; for (const m of l.matchAll(pat)) { const seg = l.slice(Math.max(0, m.index - 100), m.index + m[0].length + 30); if (/(===|==|<=|<)\s*1\b|\?\s*["'`](sale|car|listing)/.test(seg)) continue; if (SAFE.some(([f, s]) => f === p && l.includes(s))) continue; left.push(p + ":" + (i + 1) + " " + l.trim().slice(0, 120)); } }); } } };
  walk(root); }
ok(left.length === 0, "no count word or counted expression is glued to a plural noun without a one-case (" + left.length + " found)" + (left.length ? "\n  " + left.join("\n  ") : ""));
for (const [f, s, why] of SAFE) ok(read(f).includes(s), `the allowed line still exists: ${f} ${s}`);

console.log(`countNounCheck: ${passes} pass, ${fails} FAIL`);
process.exit(fails ? 1 : 0);
