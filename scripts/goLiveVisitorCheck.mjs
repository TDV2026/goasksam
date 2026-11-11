// goLiveVisitorCheck (Lane E, Nov 11 2026): A VISITOR SEES THE EXAMPLES ON THE NEW PAGES.
// CAUSE of the flip's rollback (Lane C, Nov 11): Find and Market Check showed a visitor no examples. Two causes, both invisible to every earlier check because each ran as the CREW, inside api/crewPage.js:
//   (1) the example readers are loaded by a variable path (readField), so they ship only with the function that names them in includeFiles. A public page runs the new design inside ITS OWN function (api/buy.js, api/marketCheck.js, ...), whose bundle had none of them: "Cannot find module", caught, null, the section left out (public mode hides a failed read). scripts/functionBundleCheck.mjs now covers it.
//   (2) Find's page reader (findExamplesField) answers the crew only; a visitor is served the stored pick (the two readers /api/publicExamples serves as find and findSales), which the page did not draw.
// AFFECTS every page with an example: Find, Market Check, Sell (card), Tasks (email), Home (featured history). This check renders each through its real handler as a visitor (no cookie, no query, PUBLIC_EXAMPLES=1, NEW_DESIGN=all) over a stored pick, and asserts each example is on the page and is the one /api/publicExamples answers.
// Flag off: the page stands, no section, no could-not-read line. The crew look shows the visitor's examples, not the crew's.
//   node scripts/goLiveVisitorCheck.mjs [--mutants]
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url"; import { execFileSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.join(here, "..");
if (process.argv.includes("--mutants")) {
  const MUT = [
    ["Find's visitor reader dropped (the page reads the crew only field again)", "api/crewPage.js", "PUBLIC_CTX.getStore() ? publicFindExamples(req) : readField(", "false ? publicFindExamples(req) : readField("],
    ["the look reads examples as the crew (a crew cookie reaches the readers in public mode)", "api/crewPage.js", "const visitorOf = req => PUBLIC_CTX.getStore() ? withoutCrew(req) : req;", "const visitorOf = req => req;"],
    ["a stored sale not moved into the card (Find's fallback sales dropped)", "lib/preview/fieldCompose.js", "const fallback = (Array.isArray(sales) ? sales : []).map(", "const fallback = (Array.isArray(sales) ? [] : []).map("],
    ["Home not printing the engine's endsLine next to the venue", "lib/preview/previewPages.js", '${ends ? ` &middot; <span class="fh-ends">${esc(ends)}</span>` : ""}', ""],
    ["Home not printing the engine's intelligence line", "lib/preview/previewPages.js", '${intel ? `<a class="fh-i"', '${false ? `<a class="fh-i"'],
    ["Home inventing an ends line the field does not carry", "lib/preview/previewPages.js", 'typeof c.endsLine === "string" && c.endsLine.trim() ? c.endsLine : ""', 'typeof c.endsLine === "string" && c.endsLine.trim() ? c.endsLine : "Ends soon"'],
    ["Find not printing the engine's timing line next to the venue", "lib/preview/fieldCompose.js", "venue: it.venue, timing: it.timing,", "venue: it.venue,"],
    ["Find not printing the engine's intelligence line", "lib/preview/fieldCompose.js", "intelligence: it.intelligence, venue: it.venue,", "venue: it.venue,"],
    ["the example readers not shipped with the Find function", "vercel.json", '"api/buy.js": {\n      "includeFiles"', '"api/buy.js": {\n      "maxDuration"']
  ];
  let bad = 0;
  for (const [name, file, from, to] of MUT) {
    const f = path.join(root, file), orig = fs.readFileSync(f, "utf8");
    if (!orig.includes(from)) { console.log("MUTANT NOT APPLICABLE (source changed): " + name); bad++; continue; }
    const isJson = file === "vercel.json"; let code = 0;
    try { fs.writeFileSync(f, orig.replace(from, () => to)); try { execFileSync("node", [isJson ? path.join(here, "functionBundleCheck.mjs") : fileURLToPath(import.meta.url)], { stdio: "pipe" }); } catch (e) { code = e.status || 1; } } finally { fs.writeFileSync(f, orig); }
    console.log((code ? "caught   " : "MISSED   ") + "without " + name); if (!code) bad++;
  }
  console.log(bad ? "goLiveVisitorCheck mutants: " + bad + " not caught" : "goLiveVisitorCheck mutants: all " + MUT.length + " caught"); process.exit(bad ? 1 : 0);
}
process.chdir(root);
let pass = 0, fail = 0; const ok = (name, c, d) => { if (c) pass++; else { fail++; console.log("FAIL " + name + (d ? "  " + d : "")); } };
const { visitorWorld } = await import(pathToFileURL(path.join(here, "_visitorWorld.mjs")).href);
const { W, API, NAMES, CREW } = await visitorWorld(root, ok), CREWCK = CREW;
// ---- the page handlers as a visitor: the database is the fake store (the stored picks above), nothing else
const mkRes = () => ({ h: {}, code: 200, body: "", setHeader(k, v) { this.h[String(k).toLowerCase()] = String(v); return this; }, getHeader(k) { return this.h[String(k).toLowerCase()]; }, removeHeader(k) { delete this.h[String(k).toLowerCase()]; }, writeHead(c) { this.code = c; return this; }, status(c) { this.code = c; return this; }, send(b) { this.body = b == null ? "" : String(b); return this; }, end(b) { if (b != null) this.body = String(b); return this; }, json(o) { this.body = JSON.stringify(o); return this; } });
const page = async (file, url, cookie) => { const m = await import(pathToFileURL(path.join(root, "api", file + ".js")).href), u = new URL(url, "https://goasksam.com"), res = mkRes(), log = console.error; console.error = () => {};
  try { await m.default({ method: "GET", url, query: Object.fromEntries(u.searchParams), headers: { host: "goasksam.com", ...(cookie ? { cookie } : {}) }, socket: {} }, res); } finally { console.error = log; } return res; };
const endpoint = async name => { const res = mkRes(); await API.default({ method: "GET", url: "/api/publicExamples?name=" + name, query: { name }, headers: { host: "goasksam.com" }, socket: {} }, res); return JSON.parse(res.body).data; };
const text = h => String(h).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");

process.env.PUBLIC_EXAMPLES = "1"; process.env.NEW_DESIGN = "all";
const E = {}; for (const k of NAMES) E[k] = await endpoint(k);
ok("the public endpoint answers every example name as a visitor", NAMES.every(k => E[k] != null), NAMES.filter(k => E[k] == null).join(","));
// FIND: the cars the endpoint serves are the cards on the page
{ const r = await page("buy", "/find"), t = text(r.body);
  ok("Find /find as a visitor: the new page (X-Design: new)", r.code === 200 && r.h["x-design"] === "new");
  ok("Find as a visitor: the examples section is on the page with its cards", /data-find-examples="[1-3]"/.test(r.body) && (r.body.match(/class="lc"/g) || []).length >= 1, (r.body.match(/class="lc"/g) || []).length + " cards");
  const titles = [...(E.find || []).map(x => x.title), ...(E.findSales || []).map(x => x.title)];
  ok("Find as a visitor: each car the endpoint serves as find is on the page, with its photo and link", (E.find || []).slice(0, 3).every(x => t.includes(x.title) && r.body.includes(x.photo) && r.body.includes(x.url)), titles.join(" | "));
  ok("Find as a visitor: no could-not-read line", !/data-could-not-read/.test(r.body)); }
// THE ENGINE'S TWO NEW LINES (Lane B, Nov 11 2026), printed as sent: Home's current.endsLine next to the venue and featuredHistory.intelligence as a link; Find's timing line next to the venue and its intelligence row, on every example card. Nothing the field does not carry.
{ const okc = (c, m) => ok(m, c), home = await page("home", "/"), hr = home.body, f = E.featured, c = f && f.current, intel = f && f.intelligence;
  okc(!!c && typeof c.endsLine === "string" && !!intel && !!intel.line, "Home: the engine's featured field carries endsLine and intelligence in this world (" + (c && c.endsLine) + ", " + (intel && intel.line) + ")");
  okc(c && hr.includes(`<span class="fh-ends">${c.endsLine}</span>`) && new RegExp(`<p class="fh-pl">${(c.platform || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} &middot; <span class="fh-ends">`).test(hr), "Home: the card prints the engine's endsLine next to the venue, as sent (" + (c && c.endsLine) + ")");
  okc(intel && hr.includes(`href="${intel.url}">${intel.line.replace(/&/g, "&amp;")}</a>`) && /class="fh-i" data-intel="(sold|listed)_before"/.test(hr), "Home: the card prints the engine's intelligence line as a link to " + (intel && intel.url) + ", as sent (" + (intel && intel.line) + ")");
  const { featuredHistoryHtml } = await import(pathToFileURL(path.join(root, "lib/preview/previewPages.js")).href), strip = x => { const o = JSON.parse(JSON.stringify(x)); return o; }, now = Date.now();
  const none = strip(f); delete none.current.endsLine; delete none.intelligence; const h0 = featuredHistoryHtml(none, { now });
  okc(h0.includes("data-featured-history") && !/fh-ends|fh-i"|Ends /.test(h0), "Home: a field without endsLine and intelligence prints neither (nothing is made up)");
  const bad = strip(f); bad.intelligence = { kind: "other", line: "x", url: "/vin/X" }; bad.current.endsLine = "   "; const hb = featuredHistoryHtml(bad, { now }); okc(!/fh-ends|fh-i"/.test(hb), "Home: a malformed intelligence (an unknown kind) and a blank endsLine print nothing");
  const ext = strip(f); ext.intelligence = { kind: "sold_before", line: "Sold before · $1", url: "https://elsewhere.test/x" }; okc(!/fh-i"/.test(featuredHistoryHtml(ext, { now })), "Home: an intelligence link that leaves the site is not printed");
  const fp = await page("buy", "/find"), fr = fp.body, items = (E.find || []).slice(0, 3);
  okc(items.length > 0 && items.every(it => !it.timing || new RegExp(`<span class="lc-p">[^<]*${it.venue ? it.venue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : ""}[^<]*${it.timing.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(fr) || fr.includes(it.timing)), "Find: every example card prints the engine's timing line next to the venue, as sent (" + items.map(i => i.timing).join(" | ") + ")");
  const drawn = items.filter(it => it.intelligence && ["sold_before", "market_range", "listed_before"].includes(it.intelligence.kind) && it.intelligence.line);   // kind "none" draws no row
  okc(drawn.length > 0 && drawn.every(it => fr.includes(`data-intel="${it.intelligence.kind}"`) && fr.includes(it.intelligence.line.replace(/&/g, "&amp;"))) && (fr.match(/class="lc-i"/g) || []).length === drawn.length, "Find: every example card whose field carries an intelligence line prints it as sent, and no card without one prints a row (" + drawn.map(i => i.intelligence.line).join(" | ") + ")");
  const noTiming = await (async () => { const { publicFindField } = await import(pathToFileURL(path.join(root, "lib/preview/fieldCompose.js")).href), { findHtml } = await import(pathToFileURL(path.join(root, "lib/preview/previewPages.js")).href); const its = items.map(i => { const o = { ...i }; delete o.timing; delete o.intelligence; return o; }); return findHtml({ examples: publicFindField(its, []), now: Date.now() }); })();
  okc(/data-find-examples/.test(noTiming) && !/Ends |data-intel=/.test(noTiming), "Find: a card without a timing line or an intelligence row prints neither (nothing is made up)"); }
// MARKET CHECK, SELL, TASKS, HOME
{ const r = await page("marketCheck", "/market-check"); ok("Market Check as a visitor: the example card is on the page and it is the endpoint's card", r.h["x-design"] === "new" && /data-mc-card/.test(r.body) && text(r.body).includes(E.mcCard.titleLine) && text(r.body).includes(E.mcCard.rangeLine), E.mcCard && E.mcCard.titleLine); }
{ const r = await page("sell", "/sell"); ok("Sell as a visitor: the example card is on the page and it is the endpoint's card", r.h["x-design"] === "new" && /data-sell-card/.test(r.body) && text(r.body).includes(E.sellCard.titleLine), E.sellCard && E.sellCard.titleLine); }
{ const r = await page("tasksPage", "/tasks"); ok("Tasks as a visitor: the email example is on the page", r.h["x-design"] === "new" && /data-task-email/.test(r.body)); }
{ const r = await page("home", "/"); ok("Home as a visitor: the featured history example is on the page", r.h["x-design"] === "new" && /data-featured-history/.test(r.body)); }
// THE CREW LOOK shows the visitor's examples (the flip seen early)
{ const v = await page("buy", "/find"); delete process.env.NEW_DESIGN; const r = await page("buy", "/find?design=new", CREWCK); process.env.NEW_DESIGN = "all"; const n = h => (h.match(/class="lc"/g) || []).length; ok("the crew look of Find draws the same example cars as a visitor sees on the flip", r.h["x-design"] === "new" && /data-find-examples/.test(r.body) && n(r.body) === n(v.body) && n(v.body) >= 1, n(r.body) + " in the look, " + n(v.body) + " as a visitor"); }
// ONE LIVE CAR: the stored completed sales fill the row to three (live first), as the crew preview's row does
{ const keep = W.rows; W.rows = keep.slice(0, 1); const r = await page("buy", "/find"), t = text(r.body), sales = (E.findSales || []).slice(0, 2); W.rows = keep;
  ok("Find as a visitor with one live car: the stored sales fill the row (live first, then the sales, each with its sold words)", /data-fallback="2"/.test(r.body) && sales.length === 2 && sales.every(x => t.includes(x.title) && r.body.includes(x.photo)), (r.body.match(/data-fallback="\d"/) || ["no fallback"])[0]); }
// FLAG OFF: the pages stand, no section, no error line
{ delete process.env.PUBLIC_EXAMPLES; const out = []; for (const [f, u] of [["buy", "/find"], ["marketCheck", "/market-check"], ["sell", "/sell"], ["tasksPage", "/tasks"], ["home", "/"]]) { const r = await page(f, u); out.push(r.code === 200 && r.h["x-design"] === "new" && !/data-find-examples|data-mc-card|data-sell-card|data-task-email|data-featured-history|data-could-not-read/.test(r.body)); }
  ok("PUBLIC_EXAMPLES off: every entry page stands as a visitor sees it, with no example section and no error line", out.every(Boolean), out.join(",")); process.env.PUBLIC_EXAMPLES = "1"; }
{ delete process.env.PUBLIC_EXAMPLES; delete process.env.NEW_DESIGN; const r = await page("buy", "/find?design=new", CREWCK); process.env.NEW_DESIGN = "all"; process.env.PUBLIC_EXAMPLES = "1";
  ok("PUBLIC_EXAMPLES off: the crew look shows what a visitor will see (no example section), not the crew's examples", r.h["x-design"] === "new" && !/data-find-examples/.test(r.body)); }
console.log(`goLiveVisitorCheck: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
