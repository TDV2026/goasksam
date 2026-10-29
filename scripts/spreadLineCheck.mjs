// A RANGE OVER SALES THAT RUN FAR WIDER SAYS SO (Lane B, Oct 29 2026). Live Market Check, 2010 Porsche 911 GT3: range $172,000 to $209,000, eleven sales from $139,000 to $355,500; Sam: "we're giving a range that is not true to the car".
// The range is the middle half of the sales (rangeSentenceShareCheck), so a pool whose top is many times its bottom shows a range that covers little of what the tiles show. The engine now sends spreadLine ("These sales vary widely, from $139,000 to $355,500.")
// for a single range whose sales run more than twice bottom to top; none at 2x or less, none without a single range, none on a refusal. The card prints the engine's line; no page computes a spread. No figure changes.
// This check: (1) the GT3 case reads exactly as above; (2) over many pools the line is present exactly when the ratio is above 2 and a single range is shown, and carries the pool's own low and high; (3) the card footer prints it after the range sentence and
// only from the engine field; (4) a stored row is served the line with no warm; (5) a refusal, an option-blocks answer and a thin answer carry none; (6) the page files build no spread sentence of their own.
//   node scripts/spreadLineCheck.mjs [repo root]
import fs from "node:fs";
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2";
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href), C = await import(pathToFileURL(path.join(root, "lib/sellsForCard.js")).href);
const { r4Cluster, r4Span } = E.__specEngine;
const usd = n => "$" + Math.round(n).toLocaleString("en-US");
const mkRows = v => v.map((x, i) => ({ id: "s" + i, _usd: x, auction_end_date: "2026-0" + (1 + (i % 9)) + "-10", year: 2010 }));
const answer = (v, extra) => { const rows = mkRows(v); return { tier: "result", poolN: v.length, soldCount: v.length, cluster: r4Cluster(rows), span: r4Span(rows), lowestSaleN: Math.min(...v), highestSaleN: Math.max(...v), optionsState: null, rawPool: rows, windowWords: "since November 2023", windowLine: `${v.length} sales, since November 2023.`, cards: rows.map(r => ({ id: r.id, price: r._usd, title: "2010 Porsche 911 GT3", date: r.auction_end_date, month: "Sep 2026" })), ...(extra || {}) }; };
const serve = a => E.withReadFields(a, "2010 Porsche 911 GT3", { year: 2010 });
const GT3 = [355500, 230000, 217500, 209000, 199000, 190000, 180000, 172000, 170000, 150497, 139000];
// 1. the live case
{ const d = serve(answer(GT3)); ok("the 2010 GT3 reads exactly: These sales vary widely, from $139,000 to $355,500.", d.spreadLine === "These sales vary widely, from $139,000 to $355,500.", d.spreadLine); }
// 2. every ratio
let seed = 11; const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
for (const ratio of [1.2, 1.6, 1.99, 2.01, 2.5, 3, 6]) for (const n of [8, 12, 30]) {
  const v = Array.from({ length: n }, (_, i) => 20000 * (1 + (ratio - 1) * (i / (n - 1))) * (0.995 + 0.01 * rnd())); const a = answer(v), d = serve(a), r = a.highestSaleN / a.lowestSaleN;
  ok(`ratio ${ratio}, ${n} sales (span ratio ${r.toFixed(2)}): the line is present exactly when the sales run more than twice bottom to top, with the pool's own low and high`, r > 2 ? d.spreadLine === `These sales vary widely, from ${usd(a.lowestSaleN)} to ${usd(a.highestSaleN)}.` : d.spreadLine == null, String(d.spreadLine));
}
// 3. the card
{ const html = C.sellsForCardHtml(serve(answer(GT3)), { updated: "Oct 28, 2026" }), foot = (html.match(/<div class="sfc-footer">[\s\S]*$/) || [""])[0].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  ok("the card footer prints the spread line once, after the range sentence", (foot.match(/These sales vary widely, from \$139,000 to \$355,500\./g) || []).length === 1 && foot.indexOf("a quarter above") < foot.indexOf("vary widely"), foot.slice(0, 220));
  const tight = C.sellsForCardHtml(serve(answer([30000, 31000, 32000, 33000, 34000, 35000, 36000, 37000])), { updated: "Oct 28, 2026" });
  ok("a tight pool prints no spread line", !/vary widely/.test(tight)); }
// 4. a stored row
{ const st = E.freshenStoredText({ ...answer(GT3), spreadLine: undefined }); ok("a stored row is served the line with no warm", st.spreadLine === "These sales vary widely, from $139,000 to $355,500.", String(st.spreadLine));
  const stale = E.freshenStoredText({ ...answer([30000, 31000, 32000, 33000, 34000, 35000, 36000, 37000]), spreadLine: "These sales vary widely, from $1 to $9." }); ok("a stored line on a tight pool is dropped", stale.spreadLine == null, String(stale.spreadLine)); }
// 5. no single range, no line
{ const a = answer(GT3);
  ok("a refusal carries none", serve({ ...a, tier: "refusal", refusal: { kind: "invariant_failed" } }).spreadLine == null);
  ok("option blocks (split) carry none: each block has its own range", serve({ ...a, cluster: null, optionsState: "split", headlineDimension: "body", options: [{ dimension: "body", label: "Coupe", value: "coupe", n: 6, low: 1, high: 2, rangeFloor: false }, { dimension: "body", label: "Targa", value: "targa", n: 5, low: 1, high: 2, rangeFloor: false }] }).spreadLine == null);
  ok("an answer with no range carries none", serve({ ...a, cluster: null }).spreadLine == null); }
// 6. pages build no spread sentence of their own
{ const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? (/node_modules|\.git/.test(e.name) ? [] : walk(path.join(d, e.name))) : /\.(js|mjs|html)$/.test(e.name) ? [path.join(d, e.name)] : []);
  const hits = [...walk("lib"), ...walk("api"), ...walk("public")].filter(f => f !== "lib/reasonWords.js" && /vary widely/i.test(fs.readFileSync(f, "utf8").replace(/\/\/[^\n]*/g, ""))); ok("no file but the reason table writes the spread sentence", hits.length === 0, hits.join(" | ")); }
console.log(fail ? `spreadLineCheck: ${fail} failure(s)` : "spreadLineCheck: all pass");
process.exit(fail ? 1 : 0);
