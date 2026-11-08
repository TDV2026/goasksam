// THE PREVIEW CARDS COME FROM THE ENGINE, NOT FROM THE PAGE (Lane E, Nov 8 2026; Sam's mockup, final form). CAUSE: the Find examples and the Tasks cards on the previews were drawn by the preview's own text and markup, so they could never match what the engine knows; then Sam fixed the exact shape of the Find landing card.
// CLASS: any card or email on any preview page. A preview shows a live component's verdict or a real template's output, fed an engine object, and types nothing of the car:
//   FIND LANDING CARD  Sam's mockup: a white card, the car's real photo cropped 16:9 with rounded corners, the title in bold sans, the platform in small muted text, then ONE discreet link line ("Sold before · See its history ↗" when the engine says sold before, else "Explore this car ↗"). No bid, chips, SAM block or buttons; the whole card is one link to the
//   car's Find result. Every word on it is an engine card field (title, source) and the sold before verdict is the REAL Find card's (lib/findCardKit.js card(l): its history chip), never a rule of the page. The Tasks email is the real template (scripts/tasksPreviewCheck.mjs section 7).
// This check proves (1) the lifted card code is a verbatim slice of the live source, (2) the card's words ARE the engine card's fields and its sold before line follows the real component's chip, (3) no preview source or page carries a card of its own and the Tasks page calls the real email templates, (4) the row is three across (one column on a phone), of equal height, with nothing but photo, title,
// platform and link line, one link per card, and the page height is set by its content (the footer sits within 80px of the cards), (5) the gates (an engine card or nothing; live cars first, then the fallback sales up to three, never empty when the engine sent any), and (6) each failure mode is caught by a mutant. Offline, needs Chrome.
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
const tSrc = fs.readFileSync("lib/preview/tasksPreview.js", "utf8"), pSrc = fs.readFileSync("lib/preview/previewPages.js", "utf8");
ok(!/class="(?:fx-card|fx-photo|fx-ct|sf-photo|sf-bid|sf-req|sf-ct|sf-prev)"/.test(pSrc + tSrc), "3 no preview source holds the old hand drawn card markup");
ok(/window\.GASCARD\.card\(/.test(pSrc) && /taskEmailBody\(/.test(tSrc) && /composeDigest\(/.test(tSrc) && !/GASTASK|compactCard|lookingItem/.test(tSrc), "3 Find asks the live card for its sold before verdict (GASCARD.card); Tasks calls the real email templates (taskEmailBody, composeDigest)");
// the landing card types nothing of the car: no car, platform or price word is written in the page's own code
{ const code = pSrc.replace(/\/\/.*$/gm, "").slice(pSrc.indexOf("const FIND_DRAW"), pSrc.indexOf("// ---- Find\n")); ok(!/Porsche|Ferrari|Camaro|Bring a Trailer|Sotheby|\$\d/.test(code), "3 the landing card's code types no car, platform or price"); }
const WITHSOLD = i => { const x = EX.examplesFixture(); x[i].card.timeline = [{ date: "2023-05-02", result: "sold", price: 21000, miles: 140000, house: "Bring a Trailer", url: null }]; x[i].card.seen_before = { n: 1 }; x[i].card.history_url = "/vin/ABC"; return x; };
const ROWX = WITHSOLD(1); ROWX[1].card.source = "Sotheby's Motorsport"; ROWX[2].findUrl = "/find?q=chevrolet+camaro";
const FIND = PP.findHtml({ examples: ROWX, ...opt });
ok(!ownMarkup(FIND), "3 the served Find page carries no hand drawn card");
ok(FIND.includes(KIT.findCardKitJs()), "3 the page carries the live card kit's own script, byte for byte");
// ---------- 5 gates ----------
const cards = h => (strip(h).match(/data-find-examples="(\d)"/) || [])[1] | 0;
ok(cards(PP.findHtml({ examples: null, ...opt })) === 0 && cards(PP.findHtml({ examples: [], ...opt })) === 0, "5 Find: the engine sent nothing, no section");
ok(cards(FIND) === 3 && cards(PP.findHtml({ examples: EX.examplesFixture().slice(0, 2), ...opt })) === 2 && cards(PP.findHtml({ examples: EX.examplesFixture().concat(EX.examplesFixture()), ...opt })) === 3, "5 Find: three live engine cards show three; fewer show only those; never more than three");
ok(/<h2 class="fx-h">A few cars currently at auction<\/h2>/.test(FIND), "5 Find: the section heading is \"A few cars currently at auction\"");
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
const ROWFN = () => { const q = document.querySelector(".stage"), foot = document.querySelector("footer.ft"), cs = [...document.querySelectorAll("#fx-grid .lc")];
  return { search: q ? Math.round(q.getBoundingClientRect().bottom) : 0, gap: cs.length && foot ? Math.round(foot.getBoundingClientRect().top + scrollY - (Math.max(...cs.map(c => c.getBoundingClientRect().bottom)) + scrollY)) : null, hs: document.documentElement.scrollWidth > innerWidth + 1,
    cards: cs.map(a => { const r = a.getBoundingClientRect(), ph = a.querySelector(".lc-ph"), pr = ph.getBoundingClientRect(), t = a.querySelector(".lc-t"), pl = a.querySelector(".lc-p"), l = a.querySelector(".lc-l"), cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
      const hit = (() => { const sy = scrollY; scrollTo(0, Math.max(0, r.top + sy - 200)); const q2 = a.getBoundingClientRect(), e = document.elementFromPoint(Math.round(q2.left + q2.width / 2), Math.round(q2.top + q2.height / 2)); scrollTo(0, sy); return !!e && (e === a || a.contains(e)); })();
      return { tag: a.tagName, href: a.getAttribute("href"), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), asp: Math.round(pr.width / pr.height * 100) / 100, radius: parseFloat(getComputedStyle(ph).borderTopLeftRadius), img: ph.querySelector("img") ? ph.querySelector("img").getAttribute("src") : "", title: t.textContent, tw: getComputedStyle(t).fontWeight, tf: getComputedStyle(t).fontFamily, plat: pl.textContent, pcolor: getComputedStyle(pl).color, link: l.textContent, sold: l.getAttribute("data-sold") === "1", kids: [...a.children].map(c => c.className).join(","), extras: a.querySelectorAll(".mlab,.sl,.specs,.spec,.acts,button,.chips,.chip,.hchip").length, hit, bg: getComputedStyle(a).backgroundColor, ty: Math.round(t.getBoundingClientRect().top) }; }) }; };
const same = (a, k) => a.every(c => c[k] === a[0][k]);
async function rowAssertions(html, expect) {
  const bad = [];
  for (const w of [1440, 1024, 390]) { const p = await load(html, w), r = await p.evaluate(ROWFN); await p.close(); const c = r.cards;
    if (c.length !== 3) { bad.push(`@${w}: ${c.length} cards`); continue; }
    if (!same(c, "w") || !same(c, "asp")) bad.push(`@${w}: widths ${c.map(x => x.w)} or aspects ${c.map(x => x.asp)} differ`);
    if (w >= 1440 && !(same(c, "y") && same(c, "h") && same(c, "ty"))) bad.push(`@${w}: not three across at equal heights on one baseline (${c.map(x => x.y + "/" + x.h + "/" + x.ty)})`);
    if (w === 390 && !(new Set(c.map(x => x.x)).size === 1 && c[1].y > c[0].y && c[2].y > c[1].y)) bad.push("@390: not stacked");
    if (!c.every(x => x.kids === "lc-ph,lc-t,lc-p,lc-l" && x.extras === 0)) bad.push(`@${w}: a card holds more than the photo, title, platform and one link line (${c[0].kids}, ${c[0].extras} extras)`);
    if (!c.every(x => Math.abs(x.asp - 1.78) <= 0.02 && x.radius >= 8)) bad.push(`@${w}: the photo is not cropped 16:9 with rounded corners (${c.map(x => x.asp + "/" + x.radius)})`);
    if (!c.every(x => Number(x.tw) >= 600 && !/serif|Newsreader|Georgia/i.test(x.tf.split(",")[0]) && x.bg === "rgb(255, 255, 255)")) bad.push(`@${w}: the title is not bold sans on a white card (${c[0].tw} ${c[0].tf.slice(0, 30)} ${c[0].bg})`);
    if (!c.every(x => x.tag === "A" && /^\/find\?q=/.test(x.href) && x.hit)) bad.push(`@${w}: the whole card is not one link to its Find result (${c.map(x => x.tag + "/" + x.href + "/" + x.hit)})`);
    if (expect) { if (!c.every((x, i) => x.title === expect[i].card.title && x.plat === expect[i].card.source && x.img === expect[i].card.photo_url)) bad.push(`@${w}: a word or the photo on a card is not the engine card's own (${c.map(x => x.title + " | " + x.plat)})`);
      if (!c.every((x, i) => x.link === (expect[i].sold ? "Sold before · See its history ↗" : "Explore this car ↗") && x.sold === !!expect[i].sold)) bad.push(`@${w}: the link line does not follow the real card's sold before verdict (${c.map(x => x.link)})`); }
    if (w >= 1440 && !(c.every(x => x.h <= 330) && c[0].y >= r.search)) bad.push(`@${w}: the row is not compact and below the search (card ${c[0].h}px, top ${c[0].y} v search ${r.search})`);
    if (w >= 1440 && !(r.gap != null && r.gap >= 50 && r.gap <= 80)) bad.push(`@${w}: the footer is ${r.gap}px under the cards (60 to 80px: the page height is the content's, no min height)`);
    if (r.hs) bad.push(`@${w}: sideways scroll`); }
  return bad;
}
const EXPECT = ROWX.map((x, i) => ({ card: x.card, sold: i === 1 }));
const badRow = await rowAssertions(FIND, EXPECT); ok(badRow.length === 0, `4 the Find landing row is Sam's mockup: white cards, photo 16:9 rounded, bold sans title, muted platform, one link line, whole card one link, equal heights, three across (one column on a phone), footer within 80px: ${badRow.slice(0, 3).join("; ") || "ok"}`);
{ const html = FILL(1); const p = await load(html, 1440), r = await p.evaluate(ROWFN); await p.close(); const c = r.cards;
  ok(c.length === 3 && c.every(x => x.kids === "lc-ph,lc-t,lc-p,lc-l" && x.extras === 0 && x.link.endsWith("↗")) && same(c, "w") && same(c, "h"), "4 a fallback sale is the same card (photo, title, platform, one link line, equal height)"); }
{ const html = PP.findHtml({ examples: null, ...opt }), p = await load(html, 1440), r = await p.evaluate(() => { const f = document.querySelector("footer.ft").getBoundingClientRect(), s = document.querySelector(".stage").getBoundingClientRect(); return { gap: Math.round(f.top + scrollY - (s.bottom + scrollY)), docH: document.documentElement.scrollHeight, deco: getComputedStyle(document.querySelector(".deco")).position }; }); await p.close();
  ok(r.gap <= 170 && r.deco === "absolute", `4 the empty state's height is set by its content too (the footer ${r.gap}px under the search, the Porsche out of the flow)`); }
// ---------- 6 mutants ----------
{ ok(ownMarkup(FIND.replace('<div class="fx-grid" id="fx-grid">', '<div class="fx-grid" id="fx-grid"><a class="fx-card" href="/find"><span class="fx-photo"></span></a>')), "6 mutant: a Find page that draws its own old card is caught");
  ok(!/window\.GASCARD\.card\(/.test(pSrc.replace(/window\.GASCARD\.card\(/g, "own(")), "6 mutant: a source that no longer asks the live card for its verdict is caught");
  ok(!(/taskEmailBody\(/.test(tSrc.replace(/taskEmailBody\(/g, "ownEmail(")) && /composeDigest\(/.test(tSrc)), "6 mutant: a Tasks page that no longer calls the real email template is caught");
  const run = async (name, from, to, exp = EXPECT) => { const mut = FIND.replace(from, to); const bad = await rowAssertions(mut, exp); ok(mut !== FIND && bad.length > 0, `6 mutant: ${name} is caught (${bad[0] || "NOT CAUGHT"})`); };
  await run("a bid line added to the card", 'a.appendChild(l);', 'var bid=mk("span","mlab","LAST BID SEEN $1,000");a.appendChild(bid);a.appendChild(l);');
  await run("a typed title (not the engine's)", 'a.appendChild(mk("span","lc-t",o.card.title));', 'a.appendChild(mk("span","lc-t","2024 Porsche 911 Carrera T"));');
  await run("a typed platform (not the engine's)", 'a.appendChild(mk("span","lc-p",o.card.source));', 'a.appendChild(mk("span","lc-p","Bring a Trailer"));');
  await run("a sold before line decided by the page (always Explore)", 'var l=mk("span","lc-l",sold?', 'var l=mk("span","lc-l",false?');
  await run("a card that is not one link (a div)", 'var a=mk("a","lc");a.href=o.findUrl;', 'var a=mk("div","lc");a.setAttribute("href",o.findUrl);');
  await run("a photo not cropped 16:9", ".lc-ph{display:block;aspect-ratio:16/9;", ".lc-ph{display:block;aspect-ratio:1/1;");
  await run("a title in serif", ".lc-t{display:block;margin:10px 6px 0;font:700 17px/1.3 var(--sans)}", ".lc-t{display:block;margin:10px 6px 0;font:400 17px/1.3 var(--serif)}");
  await run("two across instead of three", ".fx-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}", ".fx-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}");
  await run("a page with a min height (the footer far below the cards)", ".main{position:relative;padding:0 40px 70px;", ".main{position:relative;min-height:1300px;padding:0 40px 70px;");
  { const mut = pSrc.replace(".slice(0, 3 - live.length)", ".slice(0, 0)"), tmp = "lib/preview/_previewPagesMut.js"; ok(mut !== pSrc, "6 mutant: a page that no longer fills the row from the fallback applies"); fs.writeFileSync(tmp, mut); try { const M = await import(path.join(ROOT, tmp) + "?v=" + Math.random()); const h = M.findHtml({ examples: { cars: [], fallback: EX.fallbackFixture() }, ...opt }); ok(cards(h) !== 3, `6 mutant: a row that goes empty when no live car qualifies is caught (${cards(h)} cards)`); } finally { fs.unlinkSync(tmp); } } }
await b.close();
out.forEach(l => console.log(l)); console.log(`previewRealCardCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
