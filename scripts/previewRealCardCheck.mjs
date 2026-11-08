// THE PREVIEW CARDS ARE THE REAL CARDS (Lane E, Nov 8 2026; final form the same day). CAUSE: the Find examples and the Tasks cards on the previews were drawn by the preview's own markup, so they could never match what a person sees; then Sam simplified both.
// CLASS: any card or email on any preview page. A preview shows the live component or template fed an engine object, never a copy of it:
//   FIND LANDING ROW  Find's own client card(l) (api/buy.js, lifted by name through lib/findCardKit.js) with the rest of it hidden by CSS: the real photo, the car's own title, the platform tag and the Sold before label; no bid overlay, SAM block, range, spec chips or See the sales; the whole card is one link to the car's Find result.
//   TASKS EMAIL       the real Task match email: lib/tasks/tasks.js taskEmailBody and lib/tasks/digest.js composeDigest, handed the inputs a send is handed (its geometry and content are asserted in scripts/tasksPreviewCheck.mjs, section 7).
// This check proves (1) the lifted card code is a verbatim slice of the live source, (2) the markup on the page is that component's own, (3) no preview source or page carries a card of its own and the Tasks page calls the real email templates, (4) the row is compact, three across (one column on a phone), of one width and aspect, subordinate to the search,
// with the hidden parts hidden and the whole card one link, (5) the gates (an engine card or nothing; live cars only, three at most; a sale is never "at auction"), and (6) each failure mode is caught by a mutant. Offline, needs Chrome.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname); process.chdir(ROOT);
const puppeteer = createRequire(path.join(ROOT, "package.json"))("puppeteer-core");
process.env.LAUNCH_STAGE = "2";
let pass = 0, fail = 0; const out = []; const ok = (c, m) => { if (c) pass++; else { fail++; out.push("FAIL " + m); } };
const PP = await import(ROOT + "/lib/preview/previewPages.js");
const KIT = await import(ROOT + "/lib/findCardKit.js"), BUY = await import(ROOT + "/api/buy.js");
const EX = await import(ROOT + "/scripts/findExamplesFixture.mjs");
const opt = { now: EX.NOW, allowData: true };
const strip = h => h.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<script[\s\S]*?<\/script>/g, "");
// ---------- 1 the lifted code is the live code ----------
{ const kit = KIT.buildKitSource(); const decl = name => { const m = new RegExp("^  function " + name + "\\(", "m").exec(BUY.BUY_CLIENT_SOURCE); return m ? BUY.BUY_CLIENT_SOURCE.slice(m.index) : ""; };
  const cardText = kit.code.slice(kit.code.indexOf("  function card(")).split("\n").slice(0, 6).join("\n");
  ok(BUY.BUY_CLIENT_SOURCE.includes(cardText.split("\n")[0]) && decl("card").startsWith(cardText.split("\n").slice(0, 3).join("\n")), "1 Find's card(l) in the kit is a verbatim slice of the live Find client (api/buy.js)"); }
// ---------- 3 no preview source draws a card or an email of its own ----------
const OWN = /class="(?:[^"]*\s)?(?:fx-card|fx-photo|fx-ct|fx-t|fx-m|fx-b|fx-sb|sf-photo|sf-bid|sf-req|sf-ct|sf-meta|sf-st|sf-prev|sf-pl|sf-pm|sf-pp)(?:\s[^"]*)?"/;
const ownMarkup = html => OWN.test(strip(html)) || /\bfx-card\b|\bsf-photo\b/.test(html.replace(/<script[\s\S]*?<\/script>/g, ""));
const SRC = ["lib/preview/previewPages.js", "lib/preview/tasksPreview.js"].map(f => [f, fs.readFileSync(f, "utf8")]);
for (const [f, t] of SRC) ok(!/class="(?:fx-card|fx-photo|fx-ct|sf-photo|sf-bid|sf-req|sf-ct|sf-prev)"/.test(t) && !/class=\\?"fx-card/.test(t), `3 ${f} holds no card markup of its own`);
const tSrc = fs.readFileSync("lib/preview/tasksPreview.js", "utf8"), pSrc = fs.readFileSync("lib/preview/previewPages.js", "utf8");
ok(/window\.GASCARD\.card\(/.test(pSrc) && /taskEmailBody\(/.test(tSrc) && /composeDigest\(/.test(tSrc) && !/GASTASK|compactCard|lookingItem/.test(tSrc), "3 Find hands its cards to the live card (GASCARD.card); Tasks calls the real email templates (taskEmailBody, composeDigest), and the old Task card and watching row are gone");
const WITHSOLD = i => { const x = EX.examplesFixture(); x[i].card.timeline = [{ date: "2023-05-02", result: "sold", price: 21000, miles: 140000, house: "Bring a Trailer", url: null }]; x[i].card.seen_before = { n: 1 }; x[i].card.history_url = "/vin/ABC"; return x; };
const ROW = WITHSOLD(1); ROW[2].findUrl = "/find?q=chevrolet+camaro";
const FIND = PP.findHtml({ examples: ROW, ...opt });
ok(!ownMarkup(FIND), "3 the served Find page carries no card of its own");
ok(FIND.includes(KIT.findCardKitJs()), "3 the page carries the live card kit's own script, byte for byte");
// ---------- 5 gates ----------
const cards = h => (strip(h).match(/data-find-examples="(\d)"/) || [])[1] | 0;
ok(cards(PP.findHtml({ examples: null, ...opt })) === 0 && cards(PP.findHtml({ examples: [], ...opt })) === 0, "5 Find: the engine sent nothing, no section");
ok(cards(FIND) === 3 && cards(PP.findHtml({ examples: EX.examplesFixture().slice(0, 2), ...opt })) === 2 && cards(PP.findHtml({ examples: EX.examplesFixture().concat(EX.examplesFixture()), ...opt })) === 3, "5 Find: three live engine cards show three; fewer show only those; never more than three");
ok(/<h2 class="fx-h">A few cars currently at auction<\/h2>/.test(FIND) && !/A few cars Sam found/.test(FIND), "5 Find: the section heading is \"A few cars currently at auction\"");
const FILL = n => PP.findHtml({ examples: { cars: EX.examplesFixture().slice(0, n), fallback: EX.fallbackFixture() }, ...opt });
ok(cards(FILL(0)) === 3 && /data-fallback="3"/.test(FILL(0)) && cards(FILL(1)) === 3 && /data-fallback="2"/.test(FILL(1)) && cards(FILL(3)) === 3 && !/data-fallback/.test(FILL(3)), "5 Find: the row never goes empty: live cars first, then the engine's fallback sales up to three (a blank row is worse than a sold car); with three live cars no sale shows");
{ const f = EX.fallbackFixture(); const bad = [{ ...f[0].card, sold: null }, { ...f[0].card, sold: { price: "$1", when: "" } }, { ...f[0].card, sold: { price: "a bargain", when: "x" } }].map(c => ({ card: c })); ok(bad.every(x => cards(PP.findHtml({ examples: { cars: [], fallback: [x] }, ...opt })) === 0), "5 Find: a fallback card with no sale, no date or valuation words is refused"); }
{ const old = [{ title: "1991 Porsche 911 Carrera 2", platform: "Bring a Trailer", url: "https://a.test/1", photo: "https://a.test/p.jpg", live: true, endsAt: new Date(EX.NOW + 3600e3).toISOString(), findUrl: "/find?q=x", priceLabel: "Current bid $1" }];
  ok(cards(PP.findHtml({ examples: old, ...opt })) === 0, "5 Find: an item with no engine card (the old hand drawn shape) is not drawn");
  const c = EX.examplesFixture()[0].card, bad = [{ ...c, id: null }, { ...c, title: "" }, { ...c, url: "http://a.test" }, { ...c, photo_url: "http://a.test/p.jpg" }, { ...c, end_time: new Date(EX.NOW - 3600e3).toISOString() }, { ...c, sold: { price: "$1", when: "x" } }].map(x => ({ card: x }));
  ok(bad.every(b => cards(PP.findHtml({ examples: [b], ...opt })) === 0), "5 Find: a card with no id, no title, a non https link or photo, an ended auction, or a sale in the live slot is refused");
  const u = x => (PP.findHtml({ examples: [{ card: c, findUrl: x }], ...opt }).match(/"findUrl":"([^"]*)"/) || [])[1];
  ok(u("/find?q=a") === "/find?q=a" && u("https://evil.test") === "/find?q=" + encodeURIComponent(c.title) && u("//evil.test") === "/find?q=" + encodeURIComponent(c.title) && u(undefined) === "/find?q=" + encodeURIComponent(c.title), "5 Find: a card links to the engine's findUrl (a Find address only); otherwise to the plain Find search for the card's own title"); }
// ---------- 2 and 4 the rendered row ----------
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
async function load(html, w) { const p = await b.newPage(); await p.setViewport({ width: w, height: 1000 }); p.on("pageerror", e => out.push("FAIL page error: " + e.message)); await p.setContent(html, { waitUntil: "load" }); await new Promise(r => setTimeout(r, 450)); return p; }
const ROWFN = () => { const vis = e => !!e && getComputedStyle(e).display !== "none" && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height > 0, q = document.querySelector(".stage");
  return { search: q ? Math.round(q.getBoundingClientRect().bottom) : 0, cards: [...document.querySelectorAll("#fx-grid .fx-item")].map(it => { const a = it.querySelector("article.car"), r = it.getBoundingClientRect(), vp = innerHeight, ph = a.querySelector(".ph"), pr = ph.getBoundingClientRect(), t = a.querySelector(".ttl"), link = it.querySelector("a.fx-open"), lr = link.getBoundingClientRect(), cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2), hit = (() => { const sy = scrollY; scrollTo(0, Math.max(0, r.top + sy - 200)); const q = it.getBoundingClientRect(), e = document.elementFromPoint(Math.round(q.left + q.width / 2), Math.round(q.top + q.height / 2)); scrollTo(0, sy); return e; })();
    return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), phH: Math.round(pr.height), asp: Math.round(pr.width / pr.height * 100) / 100, imgOk: !!ph.querySelector("img"), title: t.textContent, titleSize: parseFloat(getComputedStyle(t).fontSize), ty: Math.round(t.getBoundingClientRect().top), tag: (a.querySelector(".chip") || {}).textContent || "", tagVis: vis(a.querySelector(".chip")), sold: vis(a.querySelector(".hchip")), soldText: (a.querySelector(".hchip") || {}).textContent || "",
      hidden: { bid: !vis(a.querySelector(".mlab")), sam: !vis(a.querySelector(".sl")), acts: !vis(a.querySelector(".acts")), meta: !vis(a.querySelector(".meta")), chips: [...a.querySelectorAll(".specs .spec:not(.hchip)")].every(s => !vis(s)) }, linkOk: Math.abs(lr.width - r.width) < 2 && Math.abs(lr.height - r.height) < 2, href: link.getAttribute("href"), hitIsLink: hit === link }; }), hs: document.documentElement.scrollWidth > innerWidth + 1 }; };
const same = (a, k) => a.every(c => c[k] === a[0][k]);
async function rowAssertions(html) {
  const bad = [];
  for (const w of [1440, 1024, 390]) { const p = await load(html, w), r = await p.evaluate(ROWFN); await p.close(); const c = r.cards;
    if (c.length !== 3 || !c.every(x => x.imgOk)) { bad.push(`@${w}: ${c.length} cards`); continue; }
    if (!same(c, "w") || !same(c, "asp")) bad.push(`@${w}: widths ${c.map(x => x.w)} or aspects ${c.map(x => x.asp)} differ`);
    if (w >= 1440 && !(same(c, "y") && same(c, "h") && same(c, "ty"))) bad.push(`@${w}: not three across on one baseline (${c.map(x => x.y + "/" + x.h + "/" + x.ty)})`);
    if (w === 390 && !(new Set(c.map(x => x.x)).size === 1 && c[1].y > c[0].y && c[2].y > c[1].y)) bad.push("@390: not stacked");
    if (!c.every(x => x.hidden.bid && x.hidden.sam && x.hidden.acts && x.hidden.meta && x.hidden.chips)) bad.push(`@${w}: a hidden part shows (${JSON.stringify(c[0].hidden)})`);
    if (!c.every(x => x.tagVis && /Bring a Trailer/.test(x.tag) && x.title.length > 5)) bad.push(`@${w}: no platform tag or title`);
    if (!(c[1].sold && /Sold before/.test(c[1].soldText)) || c[0].sold || c[2].sold) bad.push(`@${w}: the Sold before label is not on exactly the verified car (${c.map(x => x.sold)})`);
    if (!c.every(x => x.linkOk && x.hitIsLink && /^\/find\?q=/.test(x.href))) bad.push(`@${w}: the whole card is not one link to Find (${c.map(x => x.linkOk + "/" + x.hitIsLink + "/" + x.href)})`);
    if (w >= 1440 && !(c.every(x => x.phH <= 200 && x.titleSize <= 18 && x.h <= 300) && c[0].y >= r.search)) bad.push(`@${w}: the row is not compact and below the search (card ${c[0].h}px, photo ${c[0].phH}px, title ${c[0].titleSize}px, top ${c[0].y} v search ${r.search})`);
    if (r.hs) bad.push(`@${w}: sideways scroll`); }
  return bad;
}
const badRow = await rowAssertions(FIND); ok(badRow.length === 0, `4 the Find landing row is the real card's photo, title and platform tag with the rest hidden, one link per card, three across and compact (one column on a phone): ${badRow.slice(0, 3).join("; ") || "ok"}`);
{ const p = await load(FIND, 1440); const sk = await p.evaluate(() => { const L = JSON.parse(document.getElementById("fx-data").textContent), d = document.createElement("div"); d.innerHTML = window.GASCARD.card(L[0].card); const f = e => [e, ...e.querySelectorAll("*")].map(x => x.tagName + "." + x.className).join("|"); return [f(d.firstElementChild), f(document.querySelector("#fx-grid article.car"))]; }); await p.close();
  ok(sk[0] === sk[1], "2 the markup on the page is exactly what the live card function returns for the engine card"); }
{ const html = FILL(1); const p = await load(html, 1440), r = await p.evaluate(ROWFN); await p.close(); const c = r.cards;
  ok(c.length === 3 && !/Sold$/.test(c[0].tag) && c[1].tag.endsWith("Sold") && c[2].tag.endsWith("Sold") && c.every(x => x.hidden.bid && x.hidden.sam && x.hidden.acts && x.hidden.meta && x.hidden.chips && x.linkOk) && same(c, "w") && same(c, "y") && same(c, "h"), `4 a sold card is the same card: tag reads Sold, the bid, SAM block and buttons hidden, one link, one size (${c.map(x => x.tag).join(" | ")})`); }
// ---------- 6 mutants ----------
{ ok(ownMarkup(FIND.replace('<div class="fx-grid cgrid" id="fx-grid">', '<div class="fx-grid cgrid" id="fx-grid"><a class="fx-card" href="/find"><span class="fx-photo"></span></a>')), "6 mutant: a Find page that draws its own card is caught");
  ok(!/window\.GASCARD\.card\(/.test(pSrc.replace(/window\.GASCARD\.card\(/g, "own(")), "6 mutant: a source that no longer calls the live card is caught");
  ok(!(/taskEmailBody\(/.test(tSrc.replace(/taskEmailBody\(/g, "ownEmail(")) && /composeDigest\(/.test(tSrc)), "6 mutant: a Tasks page that no longer calls the real email template is caught");
  { const mut = pSrc.replace(".slice(0, 3 - live.length)", ".slice(0, 0)"), tmp = "lib/preview/_previewPagesMut.js"; ok(mut !== pSrc, "6 mutant: a page that no longer fills the row from the fallback applies"); fs.writeFileSync(tmp, mut); try { const M = await import(path.join(ROOT, tmp) + "?v=" + Math.random()); const h = M.findHtml({ examples: { cars: [], fallback: EX.fallbackFixture() }, ...opt }); ok(cards(h) !== 3, `6 mutant: a row that goes empty when no live car qualifies is caught (${cards(h)} cards)`); } finally { fs.unlinkSync(tmp); } }
  const showBid = FIND.replace(".fx-grid .car .mlab,", ".fx-grid .car .zz,"); const m1 = await rowAssertions(showBid); ok(showBid !== FIND && m1.length > 0, `6 mutant: the bid overlay left showing is caught (${m1[0] || "NOT CAUGHT"})`);
  const showSam = FIND.replace(".fx-grid .car .sl,", ".fx-grid .car .zz2,"); const m2 = await rowAssertions(showSam); ok(showSam !== FIND && m2.length > 0, `6 mutant: the SAM block left showing is caught (${m2[0] || "NOT CAUGHT"})`);
  const noLink = FIND.replace(".fx-open{position:absolute;inset:0;z-index:4;", ".fx-open{position:static;display:inline;z-index:4;"); const m3 = await rowAssertions(noLink); ok(noLink !== FIND && m3.length > 0, `6 mutant: a card that is not wholly one link is caught (${m3[0] || "NOT CAUGHT"})`);
  const tall = FIND.replace(".fx-grid .car .ph{aspect-ratio:16/9;", ".fx-grid .car .ph{aspect-ratio:1/1;"); const m4 = await rowAssertions(tall); ok(tall !== FIND && m4.length > 0, `6 mutant: a big photo (not compact) is caught (${m4[0] || "NOT CAUGHT"})`);
  const wide = FIND.replace(".fx-grid.cgrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))", ".fx-grid.cgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))"); const m5 = await rowAssertions(wide); ok(wide !== FIND && m5.length > 0, `6 mutant: two across instead of three is caught (${m5[0] || "NOT CAUGHT"})`); }
await b.close();
out.forEach(l => console.log(l)); console.log(`previewRealCardCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
