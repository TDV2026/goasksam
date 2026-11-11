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
    ["Home printing the take that repeats the mileage row", "lib/preview/previewPages.js", "const takeRepeatsNow = !!now &&", "const takeRepeatsNow = false && !!now &&"],
    ["Home dropping a take that says something else", "lib/preview/previewPages.js", 'String(f.take).includes(f.mileageWords.trim());', 'true;'],
    ["Home not printing the engine's endsLine next to the venue", "lib/preview/previewPages.js", '${ends ? ` &middot; <span class="fh-ends">${esc(ends)}</span>` : ""}', ""],
    ["Home printing the intelligence link that repeats the sold price", "lib/preview/previewPages.js", "figs.every(x => p.priceLine.includes(x))", "false"],
    ["Home dropping the intelligence link of a listed car too (its block carries no price)", "lib/preview/previewPages.js", 'intel = intel0 && !(sold && typeof p.priceLine === "string" && figs.length && figs.every(x => p.priceLine.includes(x))) ? intel0 : null;', "intel = null;"],
    ["Home inventing an ends line the field does not carry", "lib/preview/previewPages.js", 'typeof c.endsLine === "string" && c.endsLine.trim() ? c.endsLine : ""', 'typeof c.endsLine === "string" && c.endsLine.trim() ? c.endsLine : "Ends soon"'],
    ["Find not printing the engine's timing line next to the venue", "lib/preview/fieldCompose.js", "venue: it.venue, timing: it.timing,", "venue: it.venue,"],
    ["Find not printing the engine's intelligence line", "lib/preview/fieldCompose.js", "intelligence: it.intelligence, venue: it.venue,", "venue: it.venue,"],
    ["Find's Sam block given its fixed height again (a longer line is clipped and the button sits over it)", "api/buy.js", ".cgrid .car .tx>.sl{box-sizing:border-box;height:auto;min-height:104px;overflow:visible}", ".cgrid .car .tx>.sl{box-sizing:border-box;height:104px;min-height:104px;overflow:hidden}"],
    ["the last bid label dropped below its photo (an overlay out of its image)", "api/buy.js", ".cgrid .car .ph .mlab{left:10px;bottom:10px;flex-wrap:wrap;row-gap:3px}", ".cgrid .car .ph .mlab{left:10px;bottom:-44px;flex-wrap:wrap;row-gap:3px}"],
    ["the Tasks demo's heading printed twice", "lib/preview/tasksPreview.js", '<div class="em-body">${mail.html}</div>', '<div class="em-body">${mail.html}${(/<h2[^>]*>[^<]*<\\/h2>/.exec(mail.html) || [""])[0]}</div>'],
    ["the email's dark mode left to paint the Tasks demo (a solid dark card under the photo)", "lib/preview/tasksPreview.js", "@media (prefers-color-scheme:dark){.em-body .gc-card{background:#fff!important;", "@media (prefers-color-scheme:light){.em-body .gc-card{background:#fff!important;"],
    ["the example readers not shipped with the Find function", "vercel.json", '"api/buy.js": {\n      "includeFiles"', '"api/buy.js": {\n      "maxDuration"']
  ];
  const PHONE_MUT = new Set(MUT.filter(m => /fixed height again|dropped below its photo|printed twice|left to paint/.test(m[0])).map(m => m[0]));
  let bad = 0;
  for (const [name, file, from, to] of MUT) {
    if (process.env.GLV_ONLY && !new RegExp(process.env.GLV_ONLY).test(name)) continue;   // a subset, by name
    const f = path.join(root, file), orig = fs.readFileSync(f, "utf8");
    if (!orig.includes(from)) { console.log("MUTANT NOT APPLICABLE (source changed): " + name); bad++; continue; }
    const isJson = file === "vercel.json"; let code = 0;
    try { fs.writeFileSync(f, orig.replace(from, () => to)); try { execFileSync("node", [isJson ? path.join(here, "functionBundleCheck.mjs") : fileURLToPath(import.meta.url)], { stdio: "pipe", env: PHONE_MUT.has(name) ? process.env : { ...process.env, GLV_NO_PHONE: "1" } }); } catch (e) { code = e.status || 1; } } finally { fs.writeFileSync(f, orig); }
    console.log((code ? "caught   " : "MISSED   ") + "without " + name); if (!code) bad++;
  }
  console.log(bad ? "goLiveVisitorCheck mutants: " + bad + " not caught" : "goLiveVisitorCheck mutants: all " + MUT.filter(m => !process.env.GLV_ONLY || new RegExp(process.env.GLV_ONLY).test(m[0])).length + " caught"); process.exit(bad ? 1 : 0);
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
  okc(!!intel && !/class="fh-i"/.test(hr), "Home: the Sold before block prints the price, so the intelligence link (" + (intel && intel.line) + ") is not printed as well (one fact, one line, Sam Nov 11 2026)");
  const listed = x => { const o = JSON.parse(JSON.stringify(x)); o.kind = "listed"; o.headline = "Listed before on " + o.previous.platform; o.take = "Listed in " + o.previous.date + " on " + o.previous.platform + "; no completed sale is confirmed."; o.previous.price = null; delete o.previous.priceLine; delete o.mileageWords; delete o.nowLine; o.intelligence = { kind: "listed_before", line: "Listed before · Mar 2023", url: "/vin/VINSOLD0000000001" }; return o; };
  const { featuredHistoryHtml } = await import(pathToFileURL(path.join(root, "lib/preview/previewPages.js")).href), strip = x => { const o = JSON.parse(JSON.stringify(x)); return o; }, now = Date.now(), L = listed(f), hl = featuredHistoryHtml(L, { now });
  okc(/data-featured-history="listed"/.test(hl) && hl.includes(`href="${L.intelligence.url}">${L.intelligence.line}</a>`) && /data-intel="listed_before"/.test(hl), "Home: a listed car's block carries no price, so its intelligence link is printed, as sent (" + L.intelligence.line + ")");
  const none = listed(f); delete none.current.endsLine; delete none.intelligence; const h0 = featuredHistoryHtml(none, { now });
  okc(h0.includes("data-featured-history") && !/fh-ends|fh-i"|Ends /.test(h0), "Home: a field without endsLine and intelligence prints neither (nothing is made up)");
  const bad = listed(f); bad.intelligence = { kind: "other", line: "x", url: "/vin/X" }; bad.current.endsLine = "   "; const hb = featuredHistoryHtml(bad, { now }); okc(!/fh-ends|fh-i"/.test(hb), "Home: a malformed intelligence (an unknown kind) and a blank endsLine print nothing");
  const ext = listed(f); ext.intelligence = { kind: "listed_before", line: "Sold before · $1", url: "https://elsewhere.test/x" }; okc(!/fh-i"/.test(featuredHistoryHtml(ext, { now })), "Home: an intelligence link that leaves the site is not printed");
  const fp = await page("buy", "/find"), fr = fp.body, items = (E.find || []).slice(0, 3);
  okc(items.length > 0 && items.every(it => !it.timing || new RegExp(`<span class="lc-p">[^<]*${it.venue ? it.venue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : ""}[^<]*${it.timing.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(fr) || fr.includes(it.timing)), "Find: every example card prints the engine's timing line next to the venue, as sent (" + items.map(i => i.timing).join(" | ") + ")");
  const drawn = items.filter(it => it.intelligence && ["sold_before", "market_range", "listed_before"].includes(it.intelligence.kind) && it.intelligence.line);   // kind "none" draws no row
  okc(drawn.length > 0 && drawn.every(it => fr.includes(`data-intel="${it.intelligence.kind}"`) && fr.includes(it.intelligence.line.replace(/&/g, "&amp;"))) && (fr.match(/class="lc-i"/g) || []).length === drawn.length, "Find: every example card whose field carries an intelligence line prints it as sent, and no card without one prints a row (" + drawn.map(i => i.intelligence.line).join(" | ") + ")");
  const noTiming = await (async () => { const { publicFindField } = await import(pathToFileURL(path.join(root, "lib/preview/fieldCompose.js")).href), { findHtml } = await import(pathToFileURL(path.join(root, "lib/preview/previewPages.js")).href); const its = items.map(i => { const o = { ...i }; delete o.timing; delete o.intelligence; return o; }); return findHtml({ examples: publicFindField(its, []), now: Date.now() }); })();
  okc(/data-find-examples/.test(noTiming) && !/Ends |data-intel=/.test(noTiming), "Find: a card without a timing line or an intelligence row prints neither (nothing is made up)"); }
// ONE FACT, ONE LINE (Sam, Nov 11 2026): no example card prints the same fact twice. The sweep reads each example card's lines and finds a price, a mileage, a mileage change or a month printed in two of them. Home's intelligence link used to repeat the sold row's price; Sam decided (Nov 11 2026) that Home drops the link when its Sold before block prints the price, so nothing is set aside.
{ const okc = (c, m) => ok(m, c), TOK = /\$[\d,]+k?|[\d,]+(?: more| fewer)? miles?|(?:January|February|March|April|May|June|July|August|September|October|November|December)(?: \d{4})?|\b(?:19|20)\d{2}\b/g;
  const repeats = html => { const leaves = [...String(html).matchAll(/<(p|a|span|h\d|b|div)\b[^>]*>([^<]+)<\/\1>/g)].map(x => x[2].trim()).filter(Boolean), seen = {}, out = []; leaves.forEach((t, i) => { for (const tk of new Set(t.match(TOK) || [])) (seen[tk] = seen[tk] || []).push(i); }); for (const [tk, ls] of Object.entries(seen)) if (ls.length > 1) out.push(tk + " in " + ls.map(i => JSON.stringify(leaves[i])).join(" and ")); return out; };
  const cards = [["Home", "home", "/", /<section class="fh[\s\S]*?<\/section>/], ["Find", "buy", "/find", /<section class="proof fx"[\s\S]*?<\/section>/], ["Market Check", "marketCheck", "/market-check", /<[^>]*data-mc-card[\s\S]*?<\/(?:section|article|div)>\s*<\/(?:section|div)>/], ["Sell", "sell", "/sell", /<[^>]*data-sell-card[\s\S]*?<\/(?:section|article|div)>\s*<\/(?:section|div)>/]];
  for (const [name, file, url, re] of cards) { const r = await page(file, url), m = re.exec(r.body); okc(!!m, `${name}: the example card is on the page`); if (m) { const rep = repeats(m[0]); okc(rep.length === 0, `${name}: no line of the example card repeats another line's fact (${rep.join("; ") || "none"})`); } }
  const hr = (await page("home", "/")).body, hm = /<section class="fh[\s\S]*?<\/section>/.exec(hr), delta = E.featured && E.featured.mileageWords;
  okc(!!hm && !!delta && hm[0].split(delta).length === 2 && !/class="fh-take"/.test(hm[0]), "Home: the mileage change (" + delta + ") is printed once, in the Now row, and the take that repeated it is gone");
  const { featuredHistoryHtml } = await import(pathToFileURL(path.join(root, "lib/preview/previewPages.js")).href), other = JSON.parse(JSON.stringify(E.featured)); other.take = "A different thing the engine says about this car."; okc(/class="fh-take">A different thing/.test(featuredHistoryHtml(other, { now: Date.now() })), "Home: a take that says something else is still printed"); }
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
// THE PHONE PASS (Lane E, Nov 12 2026, Sam's two screenshots at 390). CAUSE: (1) Find's result card gave the Sam block a fixed height (104px, overflow hidden, so every card in a row had the same slot), so a longer engine line ("No sale of a Chevrolet Corvette ZR1X 3LZ has been tracked yet.") was clipped at "tracked" and the View auction button sat over it; (2) the Tasks demo is the real email's card in a white frame, and the email's own dark mode style (written for mail apps) painted it as a solid dark block under the photo on a phone set to dark.
// AFFECTS every card with text in a box or an overlay on its photo: Find results, Find's example cards, the Tasks demo, Home's example, Market Check's and Sell's example cards. Each is drawn at 390 and 360, as served, then with a longer line in every text block, and judged by scripts/_phoneCards.mjs:
// no block clips its words, no words are drawn over other words (a button over a text block, a label on a label), no label is printed twice, no overlay drops out of its image, no card is dark inside the page's light frame, nothing runs past the screen.
{ const P = await import(pathToFileURL(path.join(here, "_phoneCards.mjs")).href);
  if (process.env.GLV_NO_PHONE) { /* a fault injection that is not about the phone: the phone pass (about two minutes) is skipped */ }
  else if (!fs.existsSync(P.CHROME)) console.log("goLiveVisitorCheck: phone pass SKIPPED, no Chrome at " + P.CHROME);
  else {
    const FXT = await import(pathToFileURL(path.join(here, "tasksFixture.mjs")).href), TP = await import(pathToFileURL(path.join(root, "lib/preview/tasksPreview.js")).href);
    const bodies = { Home: (await page("home", "/")).body, "Find examples": (await page("buy", "/find")).body, "Market Check": (await page("marketCheck", "/market-check")).body, Sell: (await page("sell", "/sell")).body, Tasks: TP.tasksPublicHtml({ max: 10, emailExample: FXT.tasksEmailFixture() }) };
    const CARDS = [["Home", "/", "section.fh"], ["Find examples", "/find", "section.proof.fx"], ["Market Check", "/market-check", "[data-mc-card]"], ["Sell", "/sell", "[data-sell-card]"], ["Tasks", "/tasks", ".em"]];
    const b = await P.launch(root); const LONG = "No sale of a Chevrolet Corvette ZR1X 3LZ has been tracked yet.";
    try {
      for (const w of [390, 360]) {
        for (const [name, url, sel] of CARDS) for (const scheme of name === "Tasks" ? ["light", "dark"] : ["light"]) for (const stretch of [false, true]) {
          const p = await P.openPage(b, root, url, bodies[name], { width: w, scheme }); if (stretch) await P.stretchText(p, sel); await new Promise(r => setTimeout(r, 150));
          const pr = P.phoneProblems(await P.probeCard(p, sel), `${name} at ${w}${scheme === "dark" ? " (dark)" : ""}${stretch ? ", a longer line" : ""}`); ok(`${name} at ${w}${scheme === "dark" ? " (dark mode)" : ""}${stretch ? " with a longer line in every text block" : ""}: ${pr.length ? pr[0] : "no clipped block, nothing drawn over words, no doubled label, overlays on their image, no dark card in the light frame"}`, pr.length === 0, pr.join(" | ")); await p.close(); }
        const p = await P.openFindResults(b, root, { width: w }), n = await p.evaluate(() => document.querySelectorAll(".cgrid > article.car").length); ok(`Find results at ${w}: the cards are on the page`, n >= 1, n + " cards");
        for (let i = 1; i <= n; i++) { const sel = ".cgrid > article.car:nth-of-type(" + i + ")";
          let pr = P.phoneProblems(await P.probeCard(p, sel), `Find result ${i} at ${w}`); ok(`Find result ${i} at ${w}: no clipped block, nothing drawn over words, overlay on its photo`, pr.length === 0, pr.join(" | "));
          await p.evaluate((sel, L) => { const e = document.querySelector(sel + " .sl p"); if (e) e.textContent = L; }, sel, LONG); await P.stretchText(p, sel);
          pr = P.phoneProblems(await P.probeCard(p, sel), `Find result ${i} at ${w}, the engine's no-sale line and longer lines`); ok(`Find result ${i} at ${w}: the Sam block grows with its text and the buttons sit below it`, pr.length === 0, pr.join(" | ")); }
        await p.close();
      }
    } finally { await b.close(); }
  } }
console.log(`goLiveVisitorCheck: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
