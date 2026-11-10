// goLiveParityCheck (Lane E, Nov 10 2026, go live Stages 2 and 4). For every route in scope, the CURRENT page (NEW_DESIGN off) against the NEW public page (NEW_DESIGN=all), same address:
//   HEAD       title, meta description, meta robots, canonical, Open Graph, Twitter and every JSON-LD block are the current page's, byte for byte (Sam's answer: only the h1 is the new design's).
//              Fails on a noindex the current page lacks, a missing canonical, a missing description, a "preview" title, lost structured data.
//   H1         the new page has exactly one non-empty h1; a site page (its <main> is the current page's own) keeps the current h1.
//   ADDRESSES  no crew preview address (/preview/...), preview title or preview marker in a public response.
//   LINKS      every internal link the current page has is in the new page (plus the new ones), unless it is in docs/go-live-held.json (listed for Sam, stops the go live).
//   SCRIPTS    every script the current page loads (sign in, analytics, results) is loaded by the new page, same rule.
//   CONTROLS   the search box, voice button and search button on the entry pages; the create button on Tasks; the form on Feedback.
// docs/go-live-held.json is the list of things the current page has that the new one lacks. The check passes with them listed, fails on a loss that is NOT listed and on a listed item that is no longer lost
// (a stale entry). With --ready it fails while that list has anything in it: that is the go live gate.
//   node scripts/goLiveParityCheck.mjs [--ready] [--print-held] [--mutants]
import fs from "node:fs"; import path from "node:path"; import { execFileSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2), READY = args.includes("--ready"), PRINT = args.includes("--print-held");

if (args.includes("--mutants")) {
  const MUT = [
    ["a changed title", "lib/_publicHead.js", '["title", /<title\\b[^>]*>[\\s\\S]*?<\\/title>/gi],', ''],
    ["a missing canonical", "lib/_publicHead.js", '["canonical", /<link\\b[^>]*\\brel=["\']canonical["\'][^>]*>/gi],', ''],
    ["a missing description", "lib/_publicHead.js", '["description", META("description")],', ''],
    ["a noindex reaching the public", "lib/_publicHead.js", '["robots", META("robots")],', ''],
    ["lost structured data", "lib/_publicHead.js", '["ld", /<script\\b[^>]*\\btype=["\']application\\/ld\\+json["\'][^>]*>[\\s\\S]*?<\\/script>/gi]', '["ld", /(?!x)x/g]'],
    ["a preview address reaching the public", "lib/_publicHead.js", '  for (const [from, to] of ADDR) h = h.split(from).join(to);', ''],
    ["a dropped control (the voice button on Home)", "lib/preview/previewPages.js", 'aria-label="Speak your search"', 'aria-label="Talk"'],
    ["a lost link (About in the footer)", "lib/preview/previewPages.js", '<a href="/about">', '<a href="/about-us">']
  ];
  let bad = 0;
  for (const [name, file, from, to] of MUT) {
    const f = path.join(ROOT, file), orig = fs.readFileSync(f, "utf8");
    if (!orig.includes(from)) { console.log("MUTANT NOT APPLICABLE (source changed): " + name); bad++; continue; }
    let code = 0;
    try { fs.writeFileSync(f, orig.split(from).join(to)); try { execFileSync("node", [fileURLToPath(import.meta.url)], { stdio: "pipe" }); } catch (e) { code = e.status || 1; } } finally { fs.writeFileSync(f, orig); }
    console.log((code ? "caught   " : "MISSED   ") + "without " + name); if (!code) bad++;
  }
  console.log(bad ? "goLiveParityCheck mutants: " + bad + " not caught" : "goLiveParityCheck mutants: all " + MUT.length + " caught");
  process.exit(bad ? 1 : 0);
}

let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
process.env.LAUNCH_STAGE = "2"; delete process.env.CURTAIN_SEALED; delete process.env.NEW_DESIGN;
process.env.SUPABASE_URL = "https://db.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.SUPABASE_ANON_KEY = "k";
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => [], text: async () => "[]", headers: { get: () => null } });
const origLog = console.log, origErr = console.error;
const quiet = async fn => { console.log = () => {}; console.error = () => {}; try { return await fn(); } finally { console.log = origLog; console.error = origErr; } };
const { headTagsOf } = await import(pathToFileURL(path.join(ROOT, "lib/_publicHead.js")).href);
const mod = async f => (await import(pathToFileURL(path.join(ROOT, "api", f + ".js")).href)).default;

// [name, address, handler file, kind]: kind "landing" (the new design's own page, its h1 is its own), "site" (the current page's <main> carried over, same h1), "results" (the current page inside the new shell)
const ROUTES = [
  ["home", "/", "home", "landing"], ["find", "/find", "buy", "landing"], ["market-check", "/market-check", "marketCheck", "landing"], ["sell", "/sell", "sell", "landing"], ["tasks", "/tasks", "tasksPage", "landing"],
  ["market-check results", "/market-check?q=1995+bmw+m3", "marketCheck", "results"], ["find results", "/find?q=porsche+911", "buy", "landing"],
  ["tasks-mine", "/tasks/mine?app=1", "tasksPage", "results"],
  ["business", "/business", "business", "site"], ["how", "/how-sam-decides", "howSamDecides", "site"], ["about", "/about", "about", "site"], ["whats-new", "/whats-new", "whatsNew", "site"],
  ["feedback", "/feedback", "feedback", "site"], ["terms", "/terms?page=terms", "legal", "site"], ["privacy", "/privacy?page=privacy", "legal", "site"]
];
async function get(handler, url) {
  const res = { h: {}, code: 200, body: "", setHeader(k, v) { this.h[String(k).toLowerCase()] = String(v); return this; }, getHeader(k) { return this.h[String(k).toLowerCase()]; }, removeHeader() {}, writeHead(c) { this.code = c; return this; }, status(c) { this.code = c; return this; }, send(b) { this.body = b == null ? "" : String(b); return this; }, end(b) { if (b != null) this.body = String(b); return this; }, json(o) { this.body = JSON.stringify(o); return this; } };
  const u = new URL(url, "https://goasksam.com");
  await quiet(() => handler({ method: "GET", url, query: Object.fromEntries(u.searchParams), headers: { host: "goasksam.com" }, socket: {} }, res).catch(() => {}));
  return res;
}
const strip = h => String(h).replace(/<script\b[\s\S]*?<\/script>/gi, "").replace(/<style\b[\s\S]*?<\/style>/gi, "");
const linksOf = h => { const o = new Set(); for (const m of strip(h).matchAll(/<a\b[^>]*\bhref="([^"#]+)/gi)) { let x = m[1].replace(/&amp;/g, "&"); if (/^https?:\/\/(www\.)?goasksam\.com/.test(x)) x = x.replace(/^https?:\/\/[^/]+/, ""); if (x.startsWith("/") && !/[+']/.test(x)) o.add(x.split("?")[0]); } return o; };
const scriptsOf = h => new Set([...String(h).matchAll(/<script\b[^>]*\bsrc="([^"]+)"/gi)].map(m => m[1]));
const h1Of = h => { const m = [...strip(h).matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(x => x[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()); return m; };
const held = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "docs/go-live-held.json"), "utf8")); } catch { return []; } })();
const lost = [];   // { route, kind, item }

for (const [name, url, f, kind] of ROUTES) {
  const h = await mod(f);
  delete process.env.NEW_DESIGN; const A = await get(h, url); process.env.NEW_DESIGN = "all"; const B = await get(h, url); delete process.env.NEW_DESIGN;
  if (A.code !== 200) { ok(B.code === A.code, `${name}: today answers ${A.code}, the new answers ${B.code}`); continue; }
  ok(B.h["x-design"] === "new", `${name}: the new page is served (X-Design: new)`);
  if (B.h["x-design"] !== "new") continue;
  const a = headTagsOf(A.body), b = headTagsOf(B.body), t = `${name} ${url}`;
  for (const k of ["title", "description", "robots", "canonical", "og", "twitter", "ld"]) ok(JSON.stringify(a[k]) === JSON.stringify(b[k]), `${t}: ${k} is the current page's, byte for byte (${a[k].length} today, ${b[k].length} new)`);
  ok(!/preview/i.test((b.title[0] || "")), `${t}: no preview title`);
  ok(!b.robots.some(r => /noindex/i.test(r)) || a.robots.some(r => /noindex/i.test(r)), `${t}: no noindex the current page does not have`);
  if (a.canonical.length) ok(b.canonical.length === 1, `${t}: the canonical is there`);
  if (a.description.length) ok(b.description.length === 1, `${t}: the description is there`);
  ok(b.ld.length >= a.ld.length, `${t}: structured data kept (${a.ld.length} blocks today, ${b.ld.length} new)`);
  ok(B.h["x-robots-tag"] === A.h["x-robots-tag"] && B.h["cache-control"] === A.h["cache-control"], `${t}: robots and cache headers are today's`);
  // addresses
  ok(!/["'(=]\s*\/preview(\/|\?|["'])[a-z-]*/.test(B.body.replace(/indexOf\("\/preview\/"\)/g, "")) || /indexOf\("\/preview\/"\)/.test(B.body) && !/(href|src|action)="\/preview/.test(B.body) && !/fetch\("\/preview/.test(B.body), `${t}: no crew preview address in a public response`);
  ok(!/GoAskSam preview|class="gas-preview|data-gas-preview/i.test(B.body), `${t}: no preview marker in a public response`);
  // h1
  const ha = h1Of(A.body), hb = h1Of(B.body), noidx = a.robots.some(r => /noindex/i.test(r));   // a noindex page (the Tasks app) has no search h1 to keep
  if (!noidx) {
  if (ha.length || kind !== "results") ok(hb.length === 1 && hb[0].length > 2, `${t}: exactly one non-empty h1 in the new page (${JSON.stringify(hb)})`);
  if (kind === "site") ok(hb[0] === ha[0] || ha.length === 0 || hb.includes(ha[0]), `${t}: the h1 is the current page's (${ha[0] || "none"})`);
  }
  // links and scripts
  const la = linksOf(A.body), lb = linksOf(B.body), sa = scriptsOf(A.body), sb = scriptsOf(B.body);
  for (const x of la) if (!lb.has(x)) lost.push({ route: name, kind: "link", item: x });
  for (const x of sa) if (!sb.has(x)) lost.push({ route: name, kind: "script", item: x });
  // controls
  if (["home", "find", "market-check", "sell"].includes(name)) {
    const s = strip(B.body);
    ok(/<(textarea|input)\b[^>]*(id="[^"]*(q|input|inp)[^"]*"|placeholder)/i.test(s), `${t}: a search box`);
    ok(/<button\b[^>]*class="mic"/.test(s) || /<button\b[^>]*aria-label="Speak/.test(s), `${t}: the voice button`);
    ok(/<button\b[^>]*type="submit"/.test(s) || /<button\b[^>]*aria-label="Go ask Sam"/.test(s) || /<button\b[^>]*id="[^"]*(go|btn)"/.test(s), `${t}: the search button`);
  }
  if (name === "tasks") ok(/<button\b[^>]*id="tkcta/.test(B.body) || /Start a Task|Tell Sam/.test(strip(B.body)), `${t}: the create control`);
  if (name === "feedback") { const s = strip(B.body); ok(/<form\b/.test(s) && /<textarea\b/.test(s) && /<button\b/.test(s), `${t}: the feedback form`); }
}
// HELD list against what is lost
const key = x => `${x.route}|${x.kind}|${x.item}`, heldKeys = new Set(held.map(key)), lostKeys = new Set(lost.map(key));
if (PRINT) { fs.writeFileSync(path.join(ROOT, "docs/go-live-held.json"), JSON.stringify(lost.map(x => ({ ...x, note: "" })), null, 1) + "\n"); origLog("wrote docs/go-live-held.json with " + lost.length + " items"); process.exit(0); }
for (const x of lost) ok(heldKeys.has(key(x)), `${x.route}: the current page's ${x.kind} ${x.item} is missing from the new page and is not listed in docs/go-live-held.json (list it for Sam, or restore it)`);
for (const x of held) ok(lostKeys.has(key(x)), `docs/go-live-held.json lists ${x.route} ${x.kind} ${x.item}, which the new page now has: take it off the list`);
if (READY) ok(held.length === 0, `GO LIVE GATE: ${held.length} item(s) the current pages have and the new ones lack are still open in docs/go-live-held.json`);
console.log(`goLiveParityCheck: ${pass} passed, ${fail} failed (${held.length} held for Sam${READY ? ", gate on" : ""})`);
process.exit(fail ? 1 : 0);
