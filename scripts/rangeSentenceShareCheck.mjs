// THE RANGE SENTENCE NEVER CLAIMS A SHARE THE RANGE DOES NOT COVER (Lane B, Oct 29 2026; rewritten for Sam's footer ruling the same day).
// Live Market Check, 2010 Porsche 911 GT3: range $172,000 to $209,000, "The range is where most sales landed." under eleven sales, five of them inside it. CAUSE: the range is the middle half of the sales
// (r4Cluster: 25th to 75th percentile, rounded to $500), so about half the sales sit inside it; "most" claimed a majority it never covers. Sam's wording (one field, two sentences, every answer that shows ONE range):
// "Half of the 11 sales since November 2023 landed in this range. The rest ran from $139,000 to $355,500." The lowest and highest are the pool's real sales, never rounded. Never on a thin answer, a refusal or an option block.
// This check: (1) over many pools of 8 to 120 sales (even, skewed, two-humped, with outliers) the sentence says "Half", the share inside the range is about half (within two sales or 10 points: the middle half, rounded to $500) and never a majority word, the lowest and highest
// equal the pool's real cheapest and dearest sale; (2) one wording for every pool; (3) a stored row carrying either earlier sentence is served the current one; (4) no thin answer, refusal or option block carries one, and no spread trigger
// exists (a pool spread of 1.2x prints it too); (5) no lib, api or public file prints "most sales landed", "vary widely" or the middle-of-the-market sentence of its own.
//   node scripts/rangeSentenceShareCheck.mjs [repo root]
import fs from "node:fs";
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2";
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
const { r4Cluster } = E.__specEngine;
const MAJORITY = /\b(most|majority|nearly all|almost all|mostly|\d+\s*(%|percent))\b/i;
let seed = 7; const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
const shapes = {
  even: n => Array.from({ length: n }, () => 40000 + rnd() * 60000),
  skewed: n => Array.from({ length: n }, () => 30000 * Math.exp(rnd() * 1.6)),
  twoHumped: n => Array.from({ length: n }, () => (rnd() < 0.5 ? 60000 : 150000) + rnd() * 20000),
  outliers: n => Array.from({ length: n }, (_, i) => i % 9 === 0 ? 300000 + rnd() * 80000 : 90000 + rnd() * 30000)
};
const gt3 = [355500, 230000, 217500, 209000, 199000, 190000, 180000, 172000, 170000, 150497, 139000];   // the live 2010 GT3 pool as Sam saw it
const pools = [["the live 2010 GT3 eleven", gt3]];
for (const [k, f] of Object.entries(shapes)) for (const n of [8, 11, 16, 25, 40, 80, 120]) pools.push([`${k} ${n}`, f(n)]);
let said = new Set();
const usd = x => "$" + Math.round(x).toLocaleString("en-US");
for (const [name, v0] of pools) {
  const v = v0.map(x => Math.round(x) + 3);   // not round numbers, so a rounded low or high would show
  const rows = v.map((x, i) => ({ id: "s" + i, _usd: x })), cl = r4Cluster(rows), n = v.length;
  const inside = v.filter(x => x >= cl[0] && x <= cl[1]).length / n;
  const d = E.withReadFields({ tier: "result", poolN: n, soldCount: n, cluster: cl, optionsState: null, rawPool: rows, windowWords: "since November 2023" }, "2010 Porsche 911 GT3", { year: 2010 });
  const s = d.rangeSentence, lo = Math.min(...v), hi = Math.max(...v);
  said.add((s || "").replace(/\d[\d,]*/g, "N").replace(/\$N/g, "$N"));
  ok(`${name}: ${n} sales, ${Math.round(inside * 100)}% inside; says Half, no majority word, no "widely"`, typeof s === "string" && /^Half of the /.test(s) && !MAJORITY.test(s) && !/widely|vary|quarter/i.test(s), s);
  ok(`${name}: "Half" is true to a sale or two (within two sales or 10 points of half: the range is the middle half, rounded to $500)`, Math.abs(inside - 0.5) <= Math.max(0.1, 2 / n) + 1e-9, `${Math.round(inside * 100)}%`);
  ok(`${name}: the lowest and highest in the sentence are the pool's real cheapest and dearest sale, unrounded (${usd(lo)}, ${usd(hi)})`, typeof s === "string" && s.endsWith(`The rest ran from ${usd(lo)} to ${usd(hi)}.`) && s.includes(`Half of the ${n} sales since November 2023 landed in this range.`), s);
}
ok("one wording for every pool (the page never has a second wording)", said.size === 1, [...said].join(" | "));
// 3. a stored row with either earlier sentence
for (const oldS of ["The range is where most sales landed.", "The range is the middle of the market: a quarter of sales landed below it and a quarter above."]) {
  const rows = gt3.map((x, i) => ({ id: "g" + i, _usd: x })), srv = E.withReadFields({ tier: "result", poolN: 11, cluster: [172000, 209000], rangeSentence: oldS, windowWords: "since November 2023", rawPool: rows, lowestSaleN: 139000, highestSaleN: 355500 }, "2010 Porsche 911 GT3", { year: 2010 });
  ok(`a stored row carrying "${oldS.slice(0, 34)}..." is served Sam's two sentences`, srv.rangeSentence === "Half of the 11 sales since November 2023 landed in this range. The rest ran from $139,000 to $355,500.", srv.rangeSentence);
}
// 4. only an answer that shows ONE range carries it, and there is no spread trigger
{ const rows = gt3.map((x, i) => ({ id: "g" + i, _usd: x })), one = { tier: "result", poolN: 11, cluster: [172000, 209000], optionsState: null, rawPool: rows, windowWords: "since November 2023" };
  const w = x => E.withReadFields(x, "2010 Porsche 911 GT3", { year: 2010 }).rangeSentence;
  ok("a thin answer, a refusal, an option block and an answer with no range carry none", w({ ...one, tier: "thin" }) == null && w({ tier: "refusal", refusal: { kind: "invariant_failed" }, poolN: 0 }) == null && w({ ...one, optionsState: "split" }) == null && w({ ...one, optionsState: "apart" }) == null && w({ ...one, cluster: null }) == null);
  const tight = Array.from({ length: 12 }, (_, i) => ({ id: "t" + i, _usd: 50000 + i * 400 + 7 }));
  ok("no spread trigger: a pool whose dearest sale is 1.1 times its cheapest prints it too", /^Half of the 12 sales/.test(w({ ...one, poolN: 12, rawPool: tight, cluster: [51000, 53500] }) || ""), w({ ...one, poolN: 12, rawPool: tight, cluster: [51000, 53500] }));
  ok("no spreadLine field is served", !("spreadLine" in E.withReadFields(one, "x", { year: 2010 }))); }
// 5. no file prints its own range definition, a "most" claim, or the retired sentences
{ const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? (/node_modules|\.git/.test(e.name) ? [] : walk(path.join(d, e.name))) : /\.(js|mjs|html)$/.test(e.name) ? [path.join(d, e.name)] : []);
  const strip = f => fs.readFileSync(f, "utf8").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const CLAIM = /\b(most|majority)\b[^.`"'\n]{0,40}\b(sold|landed|went)\b[^.`"'\n]{0,30}\b(between|for|inside)\b|\bMost [^.`"'\n]{0,60}\blanded about\b|\binside where most\b|range most (sales )?(landed|sold)|range is where most sales landed|These sales vary widely|vary widely, from|The range is the middle of the market/i, claims = [];
  for (const f of [...walk("lib"), ...walk("api"), ...walk("public")]) { if (f === "lib/reasonWords.js" || /crewPages/.test(f)) continue; for (const l of strip(f).split("\n")) if (CLAIM.test(l)) claims.push(f + ": " + l.trim().slice(0, 90)); }
  ok("no lib, api or public file says most sales sold or landed in a range, varies widely, or defines the range with the earlier sentences (every page and email prints the engine's rangeSentence)", claims.length === 0, claims.join(" | "));
  const rw = fs.readFileSync("lib/reasonWords.js", "utf8").split("\n").map(l => l.replace(/\s\/\/.*$/, "")).filter(l => /most sales landed|vary widely|quarter of sales landed below/.test(l) && !/^\s*\/\//.test(l) && !/\{ old:|before:/.test(l));
  ok("in the reason table the earlier sentences appear nowhere as live text", rw.length === 0, rw.join(" | ")); }
// 6. one explanation of a wide range (Sam, Oct 29 2026, the live 2001 BMW M3: "The range is wide because mileage runs from 21,000 to 183,000 miles." AND "These sales vary widely, from $13,750 to $76,000."): the mileage sentence stays (it tells the
// reader what to do), the footer carries the lowest and highest once, and no second "wide" explanation prints
{ const C = await import(pathToFileURL(path.join(root, "lib/sellsForCard.js")).href), prices = [13750, 22000, 25500, 27000, 28500, 30000, 31500, 33000, 36000, 41000, 52000, 76000], rows = prices.map((x, i) => ({ id: "m" + i, _usd: x }));
  const d = E.withReadFields({ tier: "result", poolN: 12, soldCount: 12, cluster: [26000, 41500], optionsState: null, rawPool: rows, windowWords: "since November 2025", windowLine: "12 sales, since November 2025.", lowestSaleN: 13750, highestSaleN: 76000,
    wideLine: "The range is wide because mileage runs from 21,000 to 183,000 miles." }, "2001 BMW M3", { year: 2001 });
  const html = C.sellsForCardHtml(d, { updated: "Oct 28, 2026" }), text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "), count = (re) => (text.match(re) || []).length;
  ok("the footer carries the lowest and highest once", d.rangeSentence.endsWith("The rest ran from $13,750 to $76,000.") && count(/\$13,750/g) === 1 && count(/\$76,000/g) === 1, text.slice(-260));
  ok("no \"vary widely\" sentence is served or printed beside the mileage sentence", !/vary widely/i.test(text) && !("spreadLine" in d), text.slice(-260));
  ok("only one explanation of the width prints: the mileage sentence, once", count(/The range is wide because/g) <= 1 && count(/\bwide(ly)?\b/gi) <= 1, String(count(/\bwide(ly)?\b/gi))); }
console.log(fail ? `rangeSentenceShareCheck: ${fail} failure(s)` : "rangeSentenceShareCheck: all pass");
process.exit(fail ? 1 : 0);
