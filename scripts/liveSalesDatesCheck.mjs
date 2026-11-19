// ONE DATE FOR TWO FACTS (Lane E, Oct 31 2026): Find's line read "Live auctions · Updated Oct 28, 2026" and Home's "Live auctions and completed sales, updated Oct 28, 2026." The date was the nightly ingest (the completed sales), so the line told a reader the live
// auctions were Oct 28 when they are pulled every fifteen minutes. THE CLASS: any line that sets a live word next to a date it did not read from the live feed. The two facts now come from their own sources (lib/asOf.js lastLivePullAt for the live pull,
// lastUpdatedDate for the sales) and print as "Live auctions now. Sales to Oct 28, 2026." This check serves the pages a live pull time and a sales date that DIFFER, in three states (live pull fresh, live pull old, live pull unreadable), and fails if
// (1) Home or Find prints the pair wrongly or one date for both, (2) any page's text or meta puts a live word and a date in one phrase outside that pair, (3) any source line interpolates a date beside "live" words other than through the helper.
// Pages swept: Home, Find, Market Check, Sell landing, Sell results shell, Tasks. The admin Launch tab keeps "Sales epoch" as its own tile and prints no live date (source scan covers it). No network.
//   node scripts/liveSalesDatesCheck.mjs     exit 1 on any failure.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
process.env.LAUNCH_STAGE = "2"; process.env.SELL_NEXT_ON = "1";
process.env.SUPABASE_URL = "https://example.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "x";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const ROOT = path.resolve(new URL("..", import.meta.url).pathname); process.chdir(ROOT);
const asOf = await import(pathToFileURL(path.join(ROOT, "lib/asOf.js")).href);
ok(typeof asOf.liveSalesLine === "function" && typeof asOf.lastLivePullAt === "function" && typeof asOf.liveSalesWords === "function", "lib/asOf.js reads the live feed's own refresh (lastLivePullAt) and words both facts (liveSalesWords, liveSalesLine)");
const realFetch = globalThis.fetch, rows = o => new Response(JSON.stringify(o), { status: 200, headers: { "content-type": "application/json" } });
const SALES = "2026-10-28T14:00:00Z";
const serve = live => { globalThis.fetch = async u => { u = String(u); if (u.includes("job_ingest")) return rows([{ created_at: SALES }]); if (u.includes("pull_live")) return live ? rows([{ created_at: live }]) : rows([]); return new Response("[]", { status: 200 }); }; asOf.resetAsOfCache && asOf.resetAsOfCache(); };
const call = async (mod, url) => { const { default: h } = await import(pathToFileURL(path.join(ROOT, "api", mod + ".js")).href);
  return await new Promise(resolve => { const res = { setHeader() {}, getHeader() {}, status() { return res; }, json(b) { resolve(JSON.stringify(b)); }, send(b) { resolve(String(b)); }, end() { resolve(""); } };
    Promise.resolve(h({ method: "GET", url, query: {}, headers: { host: "goasksam.com", cookie: "" }, socket: {} }, res)).catch(e => resolve("ERR " + e)); setTimeout(() => resolve(""), 15000); }); };
const text = h => h.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, "|").replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\|+/g, "|");
const metas = h => [...h.matchAll(/<meta [^>]*content="([^"]*)"/g)].map(m => m[1]);
const DATE = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? \d{1,2}, \d{4}\b/;
const PAIR = /^Live auctions(?: now| updated [A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2} [AP]M PT)?\. Sales to [A-Z][a-z]{2} \d{1,2}, \d{4}\./;   // the pair, as a prefix of a node
const iso = ms => new Date(ms).toISOString();
const STATES = [
  ["live pull ten minutes ago", () => iso(Date.now() - 10 * 60e3), /^Live auctions now\. Sales to Oct 28, 2026\.$/],
  ["live pull two days ago", () => "2026-10-29T23:40:00Z", /^Live auctions updated Oct 29, 4:40 PM PT\. Sales to Oct 28, 2026\.$/],
  ["live pull unreadable", () => null, /^Live auctions\. Sales to Oct 28, 2026\.$/]
];
for (const [name, live, want] of STATES) {
  serve(live());
  const home = await call("home", "/"), find = await call("buy", "/find"), mc = await call("marketCheck", "/market-check"), sell = await call("sellNext", "/api/sellNext");
  const tag = `${name}`;
  const homeLine = (text(home).split("|").find(t => /^Live auctions/.test(t)) || ""), findLine = (text(find).split("|").find(t => /^Live auctions/.test(t)) || "");
  ok(want.test(homeLine), `Home, ${tag}: the line is the two facts (${JSON.stringify(homeLine)})`);
  ok(want.test(findLine), `Find, ${tag}: the line is the two facts (${JSON.stringify(findLine)})`);
  ok(!/Updated Oct 28|updated Oct 28/.test(homeLine + findLine), `${tag}: the sales date is never labelled "Updated" beside live auctions`);
  // the meta description and og carry the same two facts
  const fm = metas(find).filter(t => /ive auctions/.test(t));
  ok(fm.length > 0 && fm.every(t => t.startsWith(findLine)), `Find, ${tag}: the meta description opens with the same two facts (${JSON.stringify((fm[0] || "").slice(0, 70))})`);
  // THE CLASS, on every page that could pair them: a text node (or meta) with a live word and a date must be the pair, nothing else
  for (const [pg, html] of [["Home", home], ["Find", find], ["Market Check", mc], ["Sell landing", sell]]) {
    const nodes = [...text(html).split("|"), ...metas(html)].map(t => t.trim()).filter(Boolean);
    const bad = nodes.filter(t => /\blive\b/i.test(t) && DATE.test(t.replace(PAIR, "")));   // the pair itself may open a node; any other live word beside a date is the bug
    ok(bad.length === 0, `${pg}, ${tag}: no text sets a live word next to a date outside the pair (${bad.slice(0, 2).map(t => JSON.stringify(t.slice(0, 90))).join(" ")})`);
  }
}
// the helper's words on their own: two different dates never print as one
if (typeof asOf.liveSalesWords !== "function") ok(false, "liveSalesWords exists to word the two facts");
else { const w = asOf.liveSalesWords("2026-10-31T21:50:00Z", "October 28, 2026", Date.parse("2026-10-31T22:00:00Z")); ok(w.line === "Live auctions now. Sales to Oct 28, 2026.", "liveSalesWords: a pull ten minutes old reads now, the sales its own date"); 
  const o = asOf.liveSalesWords("2026-10-30T22:40:00Z", "October 28, 2026", Date.parse("2026-10-31T22:00:00Z")); ok(o.line === "Live auctions updated Oct 30, 3:40 PM PT. Sales to Oct 28, 2026.", "liveSalesWords: an old pull prints its own day and time (" + o.line + ")");
  const n = asOf.liveSalesWords(null, null); ok(n.line === "Live auctions." && n.sales === "", "liveSalesWords: nothing readable makes no claim (" + n.line + ")"); }
globalThis.fetch = realFetch;
// THE SOURCE SWEEP: no line anywhere interpolates a date (or an updated date) beside live words except the helper itself
const files = ["api", "lib"].flatMap(d => fs.readdirSync(d, { recursive: true }).filter(f => /\.js$/.test(f)).map(f => path.join(d, f)));
const hits = [];
for (const f of files) { if (f === "lib/asOf.js") continue; fs.readFileSync(f, "utf8").split("\n").forEach((l, i) => { if (/^\s*(\/\/|\*)/.test(l)) return; if (/[Ll]ive (auctions|cars|listings)[^\n]{0,90}(\$\{[^}]*(updated|shortDate|asOf|lastUpdated)[^}]*\}|[Uu]pdated \$\{)/.test(l) || /(\$\{[^}]*(shortDate|lastUpdated)[^}]*\})[^\n]{0,60}[Ll]ive (auctions|cars)/.test(l)) hits.push(f + ":" + (i + 1)); }); }
ok(hits.length === 0, "no source line puts a live word beside a date it read for the sales (" + hits.join(", ") + ")");
const admin = fs.readFileSync("api/admin.js", "utf8");
ok(/\["Sales epoch"/.test(admin) && !/Live[^"']{0,40}Updated|Updated[^"']{0,40}\blive\b/.test(admin.replace(/\/\/.*$/gm, "")), "the admin Launch tab keeps the sales epoch as its own labelled tile and pairs no live word with an updated date");
console.log(`liveSalesDatesCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
