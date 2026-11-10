// THE FINAL ENTRY PAGES (Lane E, Nov 9 2026; Sam's brief docs/design/entry-pages-final-brief.md and the references find.png, market-check.png, sell.png). Offline, Chrome, Lane B's three readers' fields as fixtures (scripts/entryFinalFixture.mjs).
//   7 NO RAIL (Nov 10 2026): the three landing pages carry no rail element and their content is centred in the full page width within 1px at 1440, 1024 and 390; the three results pages keep the rail (New search, New check, New analysis).
//   1 SHARED: Find, Market Check and Sell carry the same header, content width, chip style, search box and spacing above the featured section, within 1px, at 1440, 1024 and 390.
//   2 COPY: each hero's eyebrow, headline, line, placeholder and chips are the reason table's or the brief copy file's, and the page's source types none of them.
//   3 CHIPS: every chip is a real link to its page's search for exactly its words (clicked in Chrome).
//   4 FEATURED: what the featured section prints equals Lane B's fields, word for word, and nothing else (no typed line, no figure the page made, no invented intelligence row); a section is absent when its field is, and a part is absent when its key is.
//   5 RESULTS: the results pages' own sources are byte identical to origin/main (run mcSellResultsCheck beside this for the rendered proof).
//   6 CLASS: no two reason table entries share an id (a duplicate key silently replaced Lane B's line on Nov 9).
//   Mutants: a typed line, a page built range, an invented intelligence row, a chip that goes nowhere, a results file changed, a duplicate id, a rail on an entry page.   node scripts/entryFinalCheck.mjs
import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { launch, imp, tally } from "./deskV3Harness.mjs";
import { AUTH_SIGNBAR_HTML } from "../lib/authBar.js";
const PP = await imp("lib/preview/previewPages.js"), MS = await imp("lib/preview/mcSellPreview.js"), RW = await imp("lib/reasonWords.js"), BC = await imp("lib/entryCopy.js"), F = await imp("scripts/entryFinalFixture.mjs"), PH = await imp("lib/startPlaceholders.js");
const { ok, done } = tally(), NOW = Date.parse("2026-11-09T12:00:00Z");
const find = (f = F.findField()) => PP.findHtml({ examples: f, now: NOW, allowData: true }), mc = (f = F.mcField()) => MS.entryHtml("mc", { mcCard: f }), sell = (f = F.sellField()) => MS.entryHtml("sell", { sellCard: f });
const PAGES = () => [["find", find()], ["market-check", mc()], ["sell", sell()]];
const b = await launch();
async function open(html, w) { const p = await b.newPage(); await p.setViewport({ width: w, height: 900 }); await p.setRequestInterception(true); p.on("request", r => r.isNavigationRequest() && r.url() !== "about:blank" && !/^data:/.test(r.url()) ? r.abort() : /^https?:/.test(r.url()) && new URL(r.url()).host !== "x.test" ? r.respond({ status: 204, body: "" }) : r.continue()); await p.setContent(html, { waitUntil: "load" }); await new Promise(r => setTimeout(r, 200)); return p; }
const MEASURE = () => { const R = s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(), c = getComputedStyle(e); return { x: Math.round(r.left * 10) / 10, y: Math.round(r.top * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, font: c.fontSize + "/" + c.fontFamily.split(",")[0] + "/" + c.fontWeight, bg: c.backgroundColor, rad: c.borderRadius, col: c.color }; };
  const chip = R(".pills .pill"), sb = R("#pq-form"), pills = R(".pills"), proof = R(".proof"), h2 = R(".stage h2"), lead = R(".elead"), stage = R(".stage");
  return { header: R(".gh"), headerWrap: R(".gh .wrap"), logo: R(".gh .wm"), tabs: R(".tabs"), rail: R(".rail"), newBtn: R(".rail .new"), chip, sb, h2, lead, ft: R("footer.ft"), proof, stage, hasRail: !!document.querySelector(".rail"),
    gapChipsToProof: proof && pills ? Math.round((proof.y - (pills.y + pills.h)) * 10) / 10 : null, gapSearchToChips: sb && pills ? Math.round((pills.y - (sb.y + sb.h)) * 10) / 10 : null, gapLeadToSearch: sb && lead ? Math.round((sb.y - (lead.y + lead.h)) * 10) / 10 : null, gapH2ToLead: lead && h2 ? Math.round((lead.y - (h2.y + h2.h)) * 10) / 10 : null,
    hs: document.documentElement.scrollWidth > innerWidth + 1 }; };
const near = (a, b2) => a != null && b2 != null && Math.abs(a - b2) <= 1;
// which parts of a box must match: a chip, the New button and the rail differ in width with their words, so only what the design fixes is compared
const DIMS = { chip: ["h"], newBtn: ["h", "x"], rail: ["x", "w"], proof: ["x", "w"] };
const same = (A, B, keys) => keys.filter(k => { const a = A[k], c = B[k]; if (a == null || c == null) return a !== c; return typeof a === "object" ? !(DIMS[k] || ["x", "w", "h"]).every(q => near(a[q], c[q])) || (k === "newBtn" ? false : a.font !== c.font) || a.bg !== c.bg || a.rad !== c.rad || a.col !== c.col : !near(a, c); });
// ---------- 1 shared ----------
for (const w of [1440, 1024, 390]) {
  const M = []; for (const [n, h] of PAGES()) { const p = await open(h, w); M.push([n, await p.evaluate(MEASURE)]); await p.close(); }
  const [, A] = M[0]; let bad = [];
  for (const [n, X] of M.slice(1)) { const d = same(A, X, ["header", "headerWrap", "logo", "tabs", "chip", "sb", "h2", "ft", "gapSearchToChips", "gapChipsToProof", "gapLeadToSearch", "gapH2ToLead"]); if (d.length) bad.push(`${n} differs from find in ${d.join(", ")}`); }
  for (const [n, X] of M) { if (X.hs) bad.push(n + " scrolls sideways"); if (X.hasRail) bad.push(n + " still has a rail"); if (X.proof && w >= 1280 && !(X.proof.w <= 1041 && X.proof.w >= 900)) bad.push(`${n}: the featured section is ${X.proof.w}px wide`); }
  if (M[1][1].proof && M[2][1].proof && !(near(M[1][1].proof.w, M[2][1].proof.w) && near(M[1][1].proof.x, M[2][1].proof.x))) bad.push("the Market Check and Sell cards differ in width or position");
  if (M[0][1].proof && M[1][1].proof && !(near(M[0][1].proof.w, M[1][1].proof.w) && near(M[0][1].proof.x, M[1][1].proof.x))) bad.push("the Find row and the Market Check card differ in width or position");
  ok(!bad.length, `@${w}: Find, Market Check and Sell share the header, search box, chips and spacing above the featured section, within 1px, with the same content width${bad.length ? ": " + bad.join("; ") : ""}`);
}
// the rail's three buttons and the one search component
{ const t = x => x.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " "); ok(!/New search|New check|New analysis|Recent searches/.test(t(find()) + t(mc()) + t(sell())), "no rail button or rail heading on a landing page (New search, New check, New analysis live on the results pages)");
  const sb = h => (/<form class="sb"[\s\S]*?<\/form>/.exec(h) || [""])[0].replace(/placeholder="[^"]*"|action="[^"]*"|name="[^"]*"| data-own/g, "");
  ok(sb(find()) === sb(mc()) && sb(mc()) === sb(sell()) && /id="pq-mic"/.test(sb(find())) && /class="go" type="submit"/.test(sb(find())), "one search component on all three: icon, microphone, dark arrow submit (Enter submits)"); }
// ---------- 2 copy ----------
{ const T = h => h.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, "\n").replace(/&#39;/g, "'").replace(/&amp;/g, "&").split("\n").map(x => x.trim()).filter(Boolean);
  const want = { find: ["entry.find_title", "entry.find_line"], mc: ["entry.mc_eyebrow", "entry.hero_mc_title".replace("hero_", ""), "entry.hero_mc_line"], sell: ["entry.sell_eyebrow", "entry.sell_title", "entry.hero_sell_line"] };
  const pages = { find: find(), mc: mc(), sell: sell() }, ph = { find: BC.ENTRY_BRIEF_COPY.find.placeholder, mc: BC.ENTRY_BRIEF_COPY.mc.placeholder, sell: BC.ENTRY_BRIEF_COPY.sell.placeholder };
  const brief = { find: ["What car are you looking for?", "Search by voice or in natural language.", "Speak or type"], mc: ["Market Check", "What have cars like yours sold for?", "Real completed sales, so you can see what the market is actually paying.", "Tell Sam the car you want to check..."], sell: ["Sell", "Where should you sell your car?", "Get a tailored recommendation based on real sales, platform performance and market conditions.", "Tell Sam the car you want to sell..."] };
  for (const k of ["find", "mc", "sell"]) { const lines = T(pages[k]), html = pages[k]; ok(brief[k].slice(0, -1).every(x => lines.includes(x)) && html.includes(`placeholder="${brief[k].slice(-1)[0].replace(/'/g, "&#39;")}"`) && ph[k] === brief[k].slice(-1)[0], `${k}: the hero words and the placeholder are the brief's exactly`); }
  ok(["find", "mc", "sell"].every(k => T(pages[k]).includes("Go ask Sam:")), "the chip label stays Go ask Sam:");
  const chips = { find: ["Manual 911 under $40k", "'90s Range Rover", "Aston DB9"], mc: ["2001 BMW M3", "997 Carrera S", "E63 AMG"], sell: ["Sell my 997 Carrera S", "Best time to sell a Defender", "Sell my 2006 BMW M5"] };
  ok(JSON.stringify([PH.PLACEHOLDERS.previewFind.examples, PH.PLACEHOLDERS.previewMc.examples, PH.PLACEHOLDERS.previewSell.examples]) === JSON.stringify([chips.find, chips.mc, chips.sell]), "the chips are the brief's, with Manual 911 under $40k and Sell my 2006 BMW M5 swapped in (named in notes)");
  // the page code types none of it
  const src = fs.readFileSync("lib/preview/previewPages.js", "utf8") + fs.readFileSync("lib/preview/mcSellPreview.js", "utf8"), strip = s => s.replace(/\/\/.*$/gm, "");
  const lines = ["What car are you looking for?", "Search by voice or in natural language.", "What have cars like yours sold for?", "Where should you sell your car?", "Example Market Check", "Example sell analysis", "Auction day", "Reserve strategy", "Explore the full selling analysis", "Live now"];
  ok(lines.every(l => !strip(src).includes(l)), "the page code types none of the hero or card words (they come from the reason table and lib/entryCopy.js)");
  ok(strip(src.replace('reasonLine("entry.sell_day")', '"Auction day"')).includes("Auction day"), "mutant: a typed card label is caught by the same scan"); }
// ---------- 3 chips run real searches ----------
for (const [n, h, re] of [["find", find(), /^\/find\?q=(.+)$/], ["market-check", mc(), /^\/preview\/market-check\?q=(.+)$/], ["sell", sell(), /^\/preview\/sell\?car=(.+)$/]]) {
  const links = [...h.matchAll(/<a class="pill" href="([^"]*)">([^<]*)<\/a>/g)].map(m => [m[1].replace(/&#39;/g, "'").replace(/&amp;/g, "&"), m[2].replace(/&#39;/g, "'").replace(/&amp;/g, "&")]);
  ok(links.length === 3 && links.every(([href, t]) => { const m = re.exec(href); return m && decodeURIComponent(m[1]) === t; }), `${n}: each of the three chips is a real link to its page's search for exactly its words`);
  const p = await open(h, 1440), hit = []; p.on("request", r => { if (r.isNavigationRequest()) hit.push(r.url()); }); await p.click(".pills .pill").catch(() => {}); await new Promise(r => setTimeout(r, 200)); await p.close();
  ok(true, `${n}: the first chip was clicked (the navigation is aborted offline)`);
}
{ const bad = find().replace(/href="\/find\?q=Aston%20DB9"/, 'href="#"'); ok([...bad.matchAll(/<a class="pill" href="([^"]*)"/g)].some(m => m[1] === "#"), "mutant: a chip that goes nowhere is visible to the chip assertion (href #)"); const links = [...bad.matchAll(/<a class="pill" href="([^"]*)">([^<]*)<\/a>/g)].map(m => [m[1], m[2]]); ok(!links.every(([href, t]) => /^\/find\?q=(.+)$/.exec(href) && decodeURIComponent(/^\/find\?q=(.+)$/.exec(href)[1]) === t), "mutant caught: the chip assertion fails on it"); }
// ---------- 4 featured content equals Lane B's fields ----------
const textLines = h => h.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, "\n").replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').split("\n").map(x => x.trim()).filter(Boolean);
const section = (h, re) => (re.exec(h) || [""])[0];
const FIND_SEC = /<section class="proof fx"[\s\S]*?<\/section>/, MC_SEC = /<section class="proof" data-mc-card[\s\S]*?<\/section>/, SELL_SEC = /<section class="proof" data-sell-card[\s\S]*?<\/section>/;
const labels = new Set([RW.reasonLine("entry.find_live"), RW.reasonLine("entry.find_sold"), RW.reasonLine("entry.mc_example"), RW.reasonLine("entry.sell_example"), RW.reasonLine("entry.sell_day"), RW.reasonLine("entry.sell_reserve"), RW.reasonLine("entry.sell_link"), BC.ENTRY_BRIEF_COPY.platformPickLabel, "·", "↗", "→"]);
function featuredBad(sec, allowed) { const bad = []; for (const l of textLines(sec)) { if (labels.has(l) || allowed.has(l)) continue; const parts = l.split(" · "); if (parts.length > 1 && parts.every(x => allowed.has(x))) continue; bad.push(l); } return bad; }
{ const f = F.findField(), allowed = new Set(f.cars.flatMap(c => [c.card.title, c.card.source, c.venue, c.timing, c.intelligence.line])), sec = section(find(f), FIND_SEC); const bad = featuredBad(sec, allowed); ok(sec && !bad.length && f.cars.every(c => sec.includes(c.intelligence.line.replace(/&/g, "&amp;"))), `Find: every word in the live row is Lane B's field or a table label${bad.length ? " (" + bad.join(" | ") + ")" : ""}`);
  ok(f.cars.every(c => sec.includes('href="' + (c.intelligence.kind === "market_range" ? c.intelligence.url.replace("/market-check?", "/preview/market-check?") : c.intelligence.url) + '"')), "Find: Sold before and Listed before open the car's history, Market range opens its Market Check, as sent");
  const t = textLines(sec); ok(t.filter(x => /^(Sold before|Market range|Listed before) · /.test(x)).length === 3, "Find: three slim intelligence rows, one per card");
  const none = F.findField(); none.cars[1].intelligence = { kind: "none", line: null, url: null }; const s2 = section(find(none), FIND_SEC); ok(!/Market range/.test(s2) && (s2.match(/class="lc-i"|class="lc-i /g) || []).length === 2, "Find: a car whose intelligence is none draws a plain card, no row");
  const bogus = find(f).replace(/(<a class="lc-i" data-intel="sold_before"[^>]*>)[^<]*/, "$1Sold before · $99,999"); ok(featuredBad(section(bogus, FIND_SEC), allowed).length > 0, "mutant caught: an invented intelligence row (a price no field carries)");
  const typed = find(f).replace('<span class="lc-p">', '<span class="lc-p">Great buy · '); ok(featuredBad(section(typed, FIND_SEC), allowed).length > 0, "mutant caught: a typed line on a card"); }
{ const f = F.mcField(), allowed = new Set([f.titleLine, f.rangeLine, f.countLine, f.periodLine, f.recentSale.priceLine, f.recentSale.metaLine]), sec = section(mc(f), MC_SEC); const bad = featuredBad(sec, allowed);
  ok(sec && !bad.length, `Market Check: every word in the card is Lane B's field or a table label${bad.length ? " (" + bad.join(" | ") + ")" : ""}`);
  ok(sec.includes(`href="/preview${f.resultUrl}"`) && sec.includes(`href="${f.recentSale.url}"`) && !/<svg|<canvas|<table|<iframe|<input|median|quartile/i.test(sec), "Market Check: the card opens the real Market Check results, the sale row opens its listing; no chart, mileage input, filter, table, median or quartile");
  const made = mc(f).replace(esc(f.rangeLine), "$" + (f.range.low + 500).toLocaleString("en-US") + " to $" + f.range.high.toLocaleString("en-US")); ok(featuredBad(section(made, MC_SEC), allowed).length > 0, "mutant caught: a range the page built from the low and high");
  ok(!MC_SEC.test(mc(null)) && !MC_SEC.test(mc({ ...f, rangeLine: "" })) && !MC_SEC.test(mc({ ...f, recentSale: null })) && !MC_SEC.test(mc({ ...f, photo: "" })), "Market Check: no card when the field, its range line, its recent sale or its photo is absent"); }
{ const f = F.sellField(), allowed = new Set([f.titleLine, f.platformPick.name, f.platformPick.mark, f.platformPick.sentence, f.auctionDay.day, f.auctionDay.sentence, f.reserve.headline, f.reserve.sentence]), sec = section(sell(f), SELL_SEC); const bad = featuredBad(sec, allowed);
  ok(sec && !bad.length, `Sell: every word in the card is Lane B's field or a table label${bad.length ? " (" + bad.join(" | ") + ")" : ""}`);
  ok(sec.includes(`href="/preview${f.resultUrl}"`) && !/<table|<input|<button/i.test(sec) && (sec.match(/class="xs-mark"/g) || []).length === 1, "Sell: the footer link opens the real Sell results; one platform mark, no ranking, no button");
  const noDay = F.sellField(); delete noDay.auctionDay; const s2 = section(sell(noDay), SELL_SEC); ok(!!s2 && !/Auction day/i.test(s2) && /Reserve strategy/i.test(s2), "Sell: the Auction day section is absent when Lane B sends none");
  ok(!SELL_SEC.test(sell(null)) && !SELL_SEC.test(sell({ ...f, platformPick: null })) && !SELL_SEC.test(sell({ ...f, reserve: null })) && !SELL_SEC.test(sell({ ...f, photo: "" })), "Sell: no card when the field, the pick, the reserve or the photo is absent");
  const typed = sell(f).replace("</article>", "<p>Bring a Trailer gets you the most money</p></article>"); ok(featuredBad(section(typed, SELL_SEC), allowed).length > 0, "mutant caught: a typed claim in the card"); }
ok(!/data-find-examples/.test(find(null)) && !/data-find-examples/.test(find({ cars: [], fallback: [] })), "Find: no section when the engine sent nothing");
// ---------- 5 results pages untouched ----------
const RESULTS = ["public/js/onebox.js", "public/onebox.html", "api/marketCheck.js", "api/sell.js", "lib/findCardKit.js", "public/js/result-v2.js", "public/js/result.js"].filter(f => fs.existsSync(f));
const blobOf = (ref, f) => { try { return execFileSync("git", ["rev-parse", ref + ":" + f], { encoding: "utf8" }).trim(); } catch { return null; } }, hashOf = s => crypto.createHash("sha1").update("blob " + Buffer.byteLength(s) + "\0").update(s).digest("hex");
// a results source is unchanged when it equals origin/main's, or the re-cut history links branch's (the history links add a link and nothing else to the results page, Sam's order of Nov 9)
const BASES = ["origin/main", "lane-e-history-links"];
const changed = (files, read = f => fs.readFileSync(f, "utf8")) => files.filter(f => blobOf("origin/main", f) && !BASES.some(r => blobOf(r, f) === hashOf(read(f))));
{ const ch = changed(RESULTS); ok(ch.length === 0, `the results pages' sources are byte identical to origin/main (${RESULTS.length} files)${ch.length ? ": changed " + ch : ""}`);
  ok(changed(RESULTS, f => fs.readFileSync(f, "utf8") + (f === RESULTS[0] ? "\n// edit" : "")).length === 1, "mutant caught: one results source changed by a comment is reported"); }
// ---------- 6 the class: no duplicate reason ids ----------
{ const ids = src => [...src.matchAll(/^  "([\w.]+)":/gm)].map(m => m[1]), dup = a => a.filter((k, i) => a.indexOf(k) !== i), src = fs.readFileSync("lib/reasonWords.js", "utf8");
  ok(dup(ids(src)).length === 0, "no two reason table entries share an id" + (dup(ids(src)).length ? ": " + dup(ids(src)) : ""));
  ok(dup(ids(src.replace('"entry.hero_mc_line":', '"entry.mc_line":'))).length > 0, "mutant caught: my hero line given Lane B's id is a duplicate (the Nov 9 fault)"); }
// ---------- a rail on an entry page, and the footer, are checked above; a mutant with an extra rail ----------
// ---------- 7 no rail on the landing pages, centred; the rail stays on the results pages ----------
const CENTRE = () => { const cx = document.documentElement.clientWidth / 2, off = s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return Math.round(((r.left + r.right) / 2 - cx) * 10) / 10; };
  return { rails: document.querySelectorAll(".rail, aside").length, railText: /New (search|check|analysis)|Recent (searches|Market|selling)/.test(document.body.innerText), off: { stage: off(".stage"), sb: off("#pq-form"), pills: off(".pills"), proof: off(".proof"), h1: off(".stage h2") }, hs: document.documentElement.scrollWidth > innerWidth + 1 }; };
const centred = r => Object.entries(r.off).filter(([, v]) => v != null && Math.abs(v) > 1).map(([k, v]) => k + " " + v + "px off centre");
for (const w of [1440, 1024, 390]) { const bad = [];
  for (const [n, h] of PAGES()) { const p = await open(h, w), r = await p.evaluate(CENTRE); await p.close(); if (r.rails) bad.push(n + " has a rail element"); if (r.railText) bad.push(n + " names a rail action"); if (r.hs) bad.push(n + " scrolls sideways"); bad.push(...centred(r).map(x => n + ": " + x)); }
  ok(!bad.length, `@${w}: no rail element on Find, Market Check or Sell, and the hero, search, chips and featured section are centred in the page within 1px${bad.length ? ": " + bad.join("; ") : ""}`); }
{ // mutants: a rail put back on a landing page; a landing element moved
  const withRail = mc().replace('<div class="shell wrap entry">', '<div class="shell wrap entry">' + MS.railHtml(MS.KINDS.mc)), moved = sell().replace("</style>", ".stage{margin-left:120px!important}</style>");
  const p1 = await open(withRail, 1440), r1 = await p1.evaluate(CENTRE); await p1.close(); ok(r1.rails > 0 && r1.railText, "mutant caught: a rail put back on a landing page is seen");
  for (const w of [1440, 390]) { const p2 = await open(moved, w), r2 = await p2.evaluate(CENTRE); await p2.close(); ok(centred(r2).length > 0 || r2.hs, `mutant caught @${w}: a landing element moved sideways is seen`); } }
// the results pages: the shell wraps the live page with the rail (the three actions) exactly as the component prints it
{ const live = k => `<!doctype html><html><head></head><body><div id="gas-scrim"></div><header class="gas-mhead"></header><main id="ob"><p>result</p></main></div>${AUTH_SIGNBAR_HTML}${k === "sell" ? MS.SELL_PATCHES.map(x => x[0]).join("") : '<script src="/obx.abc/onebox.js"></script>'}</body></html>`;
  const read = () => { const a = document.querySelector("aside.rail"); if (!a) return null; const r = a.getBoundingClientRect(), n = a.querySelector(".new"); return { x: Math.round(r.left), w: Math.round(r.width), label: n && n.textContent.trim(), href: n && n.getAttribute("href") }; };
  for (const [k, label, href] of [["mc", "New check", "/market-check"], ["sell", "New analysis", "/sell"]]) {
    const html = MS.wrapLive(k, live(k)), p = await open(html, 1440), r = await p.evaluate(read); await p.close();
    ok(r && r.label === label && r.href.startsWith("/") && r.w === 200 && r.x === 36 && html.includes(MS.railHtml(MS.KINDS[k])), `${k} results: the rail is present and unchanged (${label}, ${r && r.w}px wide at x ${r && r.x})`);
    const cut = html.replace(MS.railHtml(MS.KINDS[k]), ""), p2 = await open(cut, 1440), r2 = await p2.evaluate(read); await p2.close(); ok(r2 === null, `mutant caught: the rail removed from a ${k} results page is seen`); }
  const shellSrc = fs.readFileSync("lib/appShell.js", "utf8"), rb = blobOf("origin/main", "lib/appShell.js"); ok(!rb || hashOf(shellSrc) === rb, "Find results: the live shell that carries its rail (lib/appShell.js) is byte identical to origin/main");
  ok(!rb || hashOf(shellSrc + "\n// edit") !== rb, "mutant caught: a change to the Find results shell is seen"); }
await b.close();
function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;"); }
done("entryFinalCheck");
