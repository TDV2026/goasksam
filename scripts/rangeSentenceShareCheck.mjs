// THE RANGE SENTENCE NEVER CLAIMS A SHARE THE RANGE DOES NOT COVER (Lane B, Oct 29 2026).
// Live Market Check, 2010 Porsche 911 GT3: range $172,000 to $209,000, "The range is where most sales landed." under eleven sales, five of them inside it. CAUSE: the range is the middle half of the sales
// (r4Cluster: 25th to 75th percentile, rounded to $500), so about half the sales sit inside it, a quarter below and a quarter above; "most" claimed a majority it never covers. The engine now says what the range is
// (reason table footer.range): "The range is the middle of the market: a quarter of sales landed below it and a quarter above." Pages and emails print rangeSentence and write no sentence of their own.
// This check: (1) over many pools of 8 to 120 sales (even, skewed, two-humped, with outliers) the range the engine builds leaves about a quarter below and a quarter above, and the sentence claims exactly that and no majority word;
// (2) the served sentence is never a majority claim whatever the pool; (3) a stored row carrying the old sentence is served the current one; (4) no lib, api or public file prints a "where most sales landed" sentence of its own.
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
let worst = 0, said = new Set();
for (const [name, v] of pools) {
  const rows = v.map((x, i) => ({ id: "s" + i, _usd: x })), cl = r4Cluster(rows), n = v.length;
  const below = v.filter(x => x < cl[0]).length / n, above = v.filter(x => x > cl[1]).length / n, inside = 1 - below - above;
  const d = E.withReadFields({ tier: "result", poolN: n, soldCount: n, cluster: cl, optionsState: null, rawPool: rows, windowWords: "since November 2023" }, "2010 Porsche 911 GT3", { year: 2010 });
  const s = d.rangeSentence; said.add(s); worst = Math.max(worst, below, above);
  ok(`${name}: ${n} sales, ${Math.round(inside * 100)}% inside, ${Math.round(below * 100)}% below, ${Math.round(above * 100)}% above; the sentence claims no majority`, typeof s === "string" && !MAJORITY.test(s), s);
  ok(`${name}: the sentence claims a quarter below and a quarter above, and the range leaves no more than 40% on either side`, /a quarter of sales landed below it and a quarter above/.test(s || "") && below <= 0.4 && above <= 0.4, `${Math.round(below * 100)}/${Math.round(above * 100)}`);
}
ok("one sentence for every pool (the page never has a second wording)", said.size === 1, [...said].join(" | "));
// 3. a stored row with the old sentence
{ const old = E.freshenStoredText({ tier: "result", poolN: 11, cluster: [172000, 209000], rangeSentence: "The range is where most sales landed.", windowWords: "since November 2023" });
  ok("a stored row carrying the old sentence is served the current one", old.rangeSentence && !MAJORITY.test(old.rangeSentence) && /a quarter of sales landed below it/.test(old.rangeSentence), old.rangeSentence); }
// 4. no file prints its own "most sales landed" range definition (comments and the retired-sentence table excepted)
{ const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? (/node_modules|\.git/.test(e.name) ? [] : walk(path.join(d, e.name))) : /\.(js|mjs|html)$/.test(e.name) ? [path.join(d, e.name)] : []);
  const hits = [];
  for (const f of [...walk("lib"), ...walk("api"), ...walk("public")]) { if (f === "lib/reasonWords.js") continue; const t = fs.readFileSync(f, "utf8").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, ""); if (/range is where most sales landed/i.test(t)) hits.push(f); }
  const rw = fs.readFileSync("lib/reasonWords.js", "utf8").split("\n").filter(l => /most sales landed/.test(l) && !/^\s*\/\//.test(l) && !/\{ old:|before:/.test(l));
  ok("no file prints the old range sentence; in the reason table it appears only as a retired line", hits.length === 0 && rw.length === 0, hits.concat(rw).join(" | ")); }
console.log(fail ? `rangeSentenceShareCheck: ${fail} failure(s)` : "rangeSentenceShareCheck: all pass");
process.exit(fail ? 1 : 0);
