// forSalePageCheck (Lane S, Nov 18 2026): dealer cars and classifieds on Find (lib/forSalePage.js), CREW ONLY behind FORSALE_PAGE_PUBLIC, in Chrome, on the LIVE handlers' real output: Lane D's lane-d-forsale engine (api/buySearch.js after the pull and the
// prepare job, over the world scripts/_forSaleWorld.mjs lifts from forSaleCheck.mjs) answers every request the page makes; the page is api/buy.js as the new shell serves it (NEW_DESIGN=1). Nothing is a sample.
//   1 THE PILLS: Auctions, Dealers, Classifieds, All with the engine's counts; Auctions selected; a pill with nothing in it greyed with 0, not hidden
//   2 AUCTIONS as today (the grid untouched) and the quiet "Also for sale: 8 at dealers, 3 classifieds" line under it, each a link that selects its pill; no auctions: that line leads
//   3 DEALERS and CLASSIFIEDS: the card the auction card is (same classes, same type, same photo shape and button size), the engine's label and "Asking $X", the read and the earlier sale line as served, "View listing", no timer, no bid
//   4 ALL: three sections in a fixed order with headings and counts, never one grid
//   5 REMEMBERED: the choice comes back on the next search and the next visit, never hides a pill; storage that throws changes nothing; a remembered pill with nothing in it falls back
//   6 EVERY ROAD: typed words, the car token, the composer's next search, "Show them all": each draws through drawSearch, which keeps the engine's answer on the block (asserted: one place draws a results block)
//   7 PHONE: pills on one row (scrolling inside themselves), no sideways page scroll, cards in one column
//   8 THE PAGE COMPUTES NOTHING (no sort, sum, rounding or parsing in the module); THE CLASS: every file that draws a car card is named; A VISITOR gets the same bytes and no pills
//   node scripts/forSalePageCheck.mjs [--shots]      MUTANTS (in a copy): node scripts/forSalePageCheck.mjs --mutants
import fs from "node:fs"; import path from "node:path"; import { execFileSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url"; import { createRequire } from "node:module";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (!fs.existsSync(CHROME)) { console.log("forSalePageCheck: SKIP no Chrome"); process.exit(0); }
const FILES = { page: "lib/forSalePage.js", buy: "api/buy.js" };
if (process.argv.includes("--mutants")) {
  const MUT = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/fixtures/forsalePageMutants.json"), "utf8")).map(m => [m.name, FILES[m.file], m.edits]);
  let bad = 0;
  for (const [name, file, edits] of MUT) {
    const f = path.join(ROOT, file), src = fs.readFileSync(f, "utf8"); let mut = src, whole = true;
    for (const [from, to] of edits) { if (mut.split(from).length !== 2) { whole = false; console.log("MISSED  " + name + " (the target text is not in " + file + " exactly once: " + from.slice(0, 50) + ")"); break; } mut = mut.replace(from, () => to); }
    if (!whole) { bad++; continue; }
    fs.writeFileSync(f, mut);
    let caught = false; try { execFileSync(process.execPath, [fileURLToPath(import.meta.url)], { cwd: ROOT, stdio: "pipe", timeout: 900000, env: { ...process.env } }); } catch { caught = true; } finally { fs.writeFileSync(f, src); }
    console.log((caught ? "caught   " : "MISSED   ") + name); if (!caught) bad++;
  }
  console.log(bad ? "forSalePageCheck mutants: " + bad + " not caught" : "forSalePageCheck mutants: all " + MUT.length + " caught"); process.exit(bad ? 1 : 0);
}
process.env.NEW_DESIGN = "1"; process.env.LAUNCH_STAGE = "2";
const SHOTS = process.argv.includes("--shots");
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const W = await import(pathToFileURL(path.join(ROOT, "scripts/_forSaleWorld.mjs")).href);
const puppeteer = createRequire(path.join(ROOT, "package.json"))("puppeteer-core");
const BUYPAGE = (await imp("api/buy.js")).default;
let FSP = null; try { FSP = await imp("lib/forSalePage.js"); } catch {}
let pass = 0, fail = 0; const out = []; const ok = (c, m) => { if (c) pass++; else { fail++; out.push("FAIL " + m); } };
const say = s => fs.writeSync(1, s + "\n");

// ---- the engine's own answers for the searches the page will make (read through the live handler, to compare with what the page drew) ----
const ENG = {}; for (const q of ["1987 Porsche 911", "2009 BMW M3", "1986 Porsche 911"]) { W.SERVE.forSaleReset(); ENG[q] = W.json(await W.find({ q })); }
const TOK = W.CT.encodeCar({ year: 1987, make: "Porsche", model: "911", trim: null, canonicalLabel: "1987 Porsche 911" });
const P = ENG["1987 Porsche 911"], M3 = ENG["2009 BMW M3"], P86 = ENG["1986 Porsche 911"];
ok(!!P.forSale && P.forSale.counts.auctions >= 2 && P.forSale.counts.dealers >= 6 && P.forSale.counts.classifieds >= 2, "the engine's real answer for 1987 Porsche 911 has auctions, dealers and classifieds :: " + JSON.stringify(P.forSale && P.forSale.counts));
ok(!!M3.forSale && M3.forSale.counts.auctions === 0 && M3.forSale.counts.dealers >= 1 && M3.forSale.counts.classifieds >= 1, "the engine's real answer for 2009 BMW M3 has no auctions, some dealers and classifieds :: " + JSON.stringify(M3.forSale && M3.forSale.counts));
ok(!!P86.forSale && P86.forSale.counts.dealers === 0 && P86.forSale.counts.classifieds === 0 && P86.forSale.counts.auctions >= 1, "the engine's real answer for 1986 Porsche 911 has auctions only :: " + JSON.stringify(P86.forSale && P86.forSale.counts));

// ---- Chrome, every request answered by the live handlers ----
const IMG = '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="100%" height="100%" fill="#b9c3cc"/></svg>';
async function open(b, url, { crew = true, width = 1440, height = 900, storage = "ok", keep = false, settle = 1800 } = {}) {   // keep: the remembered pill from an earlier page stays; otherwise each page starts with none remembered
  const p = await b.newPage(); await p.setViewport({ width, height }); p._err = []; p._api = [];
  p.on("pageerror", e => p._err.push(String(e).slice(0, 200))); p.on("console", m => { if (m.type() === "error" && !/Failed to load resource|net::ERR/.test(m.text())) p._err.push(m.text().slice(0, 200)); });
  if (storage === "throws") await p.evaluateOnNewDocument("Object.defineProperty(window,'localStorage',{get(){throw new Error('storage blocked')}});window.GAS_WAIT_SCALE=0.05;"); else await p.evaluateOnNewDocument("window.GAS_WAIT_SCALE=0.05;");
  if (!keep) await p.evaluateOnNewDocument("try{localStorage.removeItem('gas_fs_pill')}catch(e){}");
  await p.setRequestInterception(true);
  p.on("request", async r => { try { const u = new URL(r.url()), m = r.method();
    if (u.host !== "goasksam.com") { if (r.resourceType() === "image") return r.respond({ status: 200, contentType: "image/svg+xml", body: IMG }); return r.respond({ status: 204, body: "" }); }
    if (u.pathname === "/api/buySearch" && m === "POST") { const body = JSON.parse(r.postData() || "{}"); p._api.push(body.action); const o = await W.call(W.BUY, "/api/buySearch", { method: "POST", body, crew }); return r.respond({ status: o.code, contentType: o.h["content-type"] || "application/json", headers: { "access-control-allow-origin": "*" }, body: o.body }); }
    if (r.isNavigationRequest()) { const o = await W.call(BUYPAGE, u.pathname + u.search, { crew }); return r.respond({ status: o.code, contentType: o.h["content-type"] || "text/html", body: o.body }); }
    if (/^\/api\//.test(u.pathname) || u.pathname === "/find") return r.respond({ status: 200, contentType: "application/json", body: "{}" });
    return r.respond({ status: 404, body: "" }); } catch (e) { try { r.respond({ status: 500, body: String(e.message) }); } catch {} } });
  await p.goto("https://goasksam.com" + url, { waitUntil: "domcontentloaded" });
  try { await p.waitForSelector(".msg.results[data-done]", { timeout: 20000 }); } catch {}
  await new Promise(r => setTimeout(r, settle)); return p;
}
// what the page drew, read from the DOM
const READ = () => {
  const t = el => (el ? el.textContent.replace(/\s+/g, " ").trim() : null), B = document.querySelector(".msg.results"), vis = el => !!el && !!(el.offsetWidth || el.offsetHeight) && getComputedStyle(el).display !== "none" && getComputedStyle(el).visibility !== "hidden";
  const pills = [...document.querySelectorAll(".fs-pill")].map(x => ({ text: t(x), name: x.getAttribute("data-fs-pill"), pressed: x.getAttribute("aria-pressed"), off: x.getAttribute("aria-disabled") === "true", top: Math.round(x.getBoundingClientRect().top), vis: vis(x) }));
  const card = a => ({ id: a.getAttribute("data-fs-id"), chip: t(a.querySelector(".chip")), mlab: t(a.querySelector(".mlab")), src: t(a.querySelector(".src")), title: t(a.querySelector(".ttl")), meta: t(a.querySelector(".meta")), sl: t(a.querySelector(".sl")), hist: t(a.querySelector(".fs-hist")), btn: t(a.querySelector(".acts a")), href: (a.querySelector(".acts a") || {}).href || null, vis: vis(a), classes: a.className, text: t(a), hasPhoto: !!a.querySelector(".ph") });
  const sec = k => { const s = document.querySelector('.fs-sec[data-fs="' + k + '"]'); return s ? { vis: vis(s), head: t(s.querySelector(".fs-h")), headVis: vis(s.querySelector(".fs-h")), grids: s.querySelectorAll(".cgrid").length, cards: [...s.querySelectorAll("article.car")].map(card) } : null; };
  const grp = document.querySelector(".msg.results .grp"), hauc = document.querySelector(".fs-h-auc"), also = document.querySelector(".fs-also");
  const order = B ? [...B.querySelectorAll(".fs-pills,.fs-h-auc,.grp,.fs-also,.fs-sec,.nonel,.keepl")].map(x => (x.classList.contains("fs-h-auc") ? "fs-h-auc" : x.className.split(" ")[0]) + (x.getAttribute("data-fs") ? ":" + x.getAttribute("data-fs") : "")) : [];
  return { n: document.querySelectorAll(".msg.results").length, pills, mode: B ? (B.className.match(/fs-m-(\w+)/) || [])[1] || null : null, grpVis: vis(grp), grpCards: grp ? [...grp.querySelectorAll("article.car")].filter(a => vis(a)).length : 0, auctionHead: hauc ? { text: t(hauc), vis: vis(hauc) } : null,
    also: also ? { text: t(also), vis: vis(also), links: [...also.querySelectorAll("a")].map(a => ({ text: t(a), pill: a.getAttribute("data-fs-pill") })) } : null, dealers: sec("dealers"), classifieds: sec("classifieds"), order, scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth,
    pillsBox: (() => { const e = document.querySelector(".fs-pills"); return e ? { sw: e.scrollWidth, cw: e.clientWidth, right: Math.round(e.getBoundingClientRect().right) } : null; })(), hasMod: !!document.getElementById("fs-mod"), hasD: !!(B && B.__d), bodyText: document.body.innerText };
};
const click = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); if (e) e.click(); return !!e; }, sel);
const NAMES = ["Auctions", "Dealers", "Classifieds", "All"], fmt = n => Number(n).toLocaleString("en-US");
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const sec = async (name, fn) => { try { await fn(); } catch (e) { ok(false, name + " ran without throwing :: " + String(e && e.stack || e).slice(0, 300)); } };
const cardOf = (c, kind) => ({ chip: kind, mlab: c.askingLine, title: c.name, meta: [c.milesLine, c.location].filter(Boolean).join(" · ") });

// ================= 1 TO 5, the 1987 Porsche 911 (auctions, dealers and classifieds all have cars) =================
await sec("porsche", async () => {
  const p = await open(browser, "/find?q=" + encodeURIComponent("1987 Porsche 911")), s = await p.evaluate(READ), FS = P.forSale;
  ok(s.hasMod && s.hasD, "the crew page carries the module and keeps the engine's answer on the results block");
  ok(s.pills.length === 4 && s.pills.map(x => x.name).join() === "auctions,dealers,classifieds,all", "four pills in the order Auctions, Dealers, Classifieds, All :: " + JSON.stringify(s.pills.map(x => x.name)));
  ok(s.pills.every((x, i) => x.text === NAMES[i] + " " + fmt(FS.counts[x.name]) && x.vis), "each pill is its name and the engine's count :: " + JSON.stringify(s.pills.map(x => x.text)));
  ok(s.pills.filter(x => x.pressed === "true").map(x => x.name).join() === "auctions" && s.mode === "auctions", "Auctions is selected by default :: " + s.mode);
  ok(s.grpVis && s.grpCards >= 1 && s.dealers.vis === false && s.classifieds.vis === false, "Auctions shows the auction grid and neither group");
  ok(s.also && s.also.vis && s.also.text === `Also for sale: ${fmt(FS.counts.dealers)} at dealers, ${fmt(FS.counts.classifieds)} classifieds`, "the quiet line under the auctions :: " + (s.also && s.also.text));
  ok(s.also && s.also.links.map(l => l.pill).join() === "dealers,classifieds", "each part of the line is a link to its pill");
  ok(s.order.indexOf("grp") >= 0 && s.order.indexOf("fs-also") === s.order.indexOf("grp") + 1, "the line sits right under the auction results :: " + s.order.join(">"));
  ok(!/[Tt]imer|Place bid|LAST BID/.test(s.dealers.cards.map(c => c.text).join(" ")), "no group card says bid or timer (hidden here, read below)");
  ok(p._err.length === 0, "no page error on the default view :: " + p._err.join("|"));
  // the line's own link selects its pill
  await p.evaluate(() => document.querySelector('.fs-also a[data-fs-pill="classifieds"]').click()); let t = await p.evaluate(READ);
  ok(t.mode === "classifieds" && t.pills.find(x => x.name === "classifieds").pressed === "true", "the line's classifieds link selects the Classifieds pill :: " + t.mode);
  // DEALERS
  await click(p, '.fs-pill[data-fs-pill="dealers"]'); t = await p.evaluate(READ);
  ok(t.mode === "dealers" && !t.grpVis && t.dealers.vis && !t.classifieds.vis && !t.also.vis, "Dealers shows only the dealer cards (the auction grid and the line are away)");
  ok(t.dealers.cards.length === FS.dealers.cards.length && t.dealers.cards.length >= 6 && t.dealers.grids === 1, "every dealer card the engine sent is drawn, in one grid :: " + t.dealers.cards.length + " of " + FS.dealers.cards.length);
  const same = (a, b) => a.length === b.length && a.every((x, i) => JSON.stringify(x) === JSON.stringify(b[i]));
  ok(same(t.dealers.cards.map(c => ({ chip: c.chip, mlab: c.mlab, title: c.title, meta: c.meta })), FS.dealers.cards.map(c => cardOf(c, "Dealer"))), "each dealer card prints the engine's label, Asking $X, name, miles and place, in the engine's order :: " + JSON.stringify(t.dealers.cards[0]));
  ok(t.dealers.cards.every((c, i) => c.sl.includes(FS.dealers.cards[i].read) && c.sl.startsWith("Sam")), "the read is printed as served, under the car");
  ok(t.dealers.cards.every((c, i) => c.hist === FS.dealers.cards[i].historyLine && c.sl.startsWith("Sam" + FS.dealers.cards[i].read)), "the earlier sale line is printed when served and only then :: " + JSON.stringify(t.dealers.cards.map(c => c.hist)));
  ok(t.dealers.cards.some(c => c.hist && /sold for/.test(c.hist)) && t.dealers.cards.some(c => c.hist === null), "(the real answer has cards with and without the line)");
  ok(t.dealers.cards.every(c => c.btn && /^View listing/.test(c.btn) && /^https:\/\//.test(c.href)), "the button reads View listing and goes to the listing");
  ok(t.dealers.cards.every((c, i) => c.href === FS.dealers.cards[i].url), "the link is the engine's url");
  ok(t.dealers.cards.every(c => !/\b\d+[dhm]\b|left|ends|LAST BID|Place bid|Bid\b/.test(c.text.replace(/Asking \$[\d,]+/g, ""))), "no timer and no bid on a dealer card :: " + t.dealers.cards[0].text);
  ok(t.dealers.cards.every(c => c.src === "Dealer · " + FS.dealers.cards.find(x => "fs-" + x.id.replace(/^fs-/, "") === c.id || x.id === c.id).host), "the small line is the label and the host as sent");
  // CLASSIFIEDS
  await click(p, '.fs-pill[data-fs-pill="classifieds"]'); t = await p.evaluate(READ);
  ok(t.mode === "classifieds" && t.classifieds.vis && !t.dealers.vis && t.classifieds.cards.length === FS.classifieds.cards.length, "Classifieds shows the classified cards :: " + t.classifieds.cards.length);
  ok(same(t.classifieds.cards.map(c => ({ chip: c.chip, mlab: c.mlab, title: c.title, meta: c.meta })), FS.classifieds.cards.map(c => cardOf(c, "Classified"))), "each classified card prints the engine's label and Asking $X :: " + JSON.stringify(t.classifieds.cards[0]));
  ok(t.classifieds.cards.every((c, i) => c.btn && /^View listing/.test(c.btn) && c.sl.includes(FS.classifieds.cards[i].read)), "classified cards: View listing and the read");
  // ALL
  await click(p, '.fs-pill[data-fs-pill="all"]'); t = await p.evaluate(READ);
  ok(t.mode === "all" && t.grpVis && t.dealers.vis && t.classifieds.vis && !t.also.vis, "All shows the three sections and no line");
  ok(t.auctionHead.vis && t.auctionHead.text === "At auction now" + fmt(FS.counts.auctions) && t.dealers.head === "At dealers" + fmt(FS.counts.dealers) && t.classifieds.head === "Classifieds" + fmt(FS.counts.classifieds), "headings with the engine's counts :: " + [t.auctionHead.text, t.dealers.head, t.classifieds.head].join(" | "));
  const o = t.order.filter(x => /^(fs-h-auc|grp|fs-sec:dealers|fs-sec:classifieds)$/.test(x)).join(">");
  ok(o === "fs-h-auc>grp>fs-sec:dealers>fs-sec:classifieds", "fixed order: At auction now, At dealers, Classifieds :: " + o);
  ok(t.dealers.grids === 1 && t.classifieds.grids === 1 && t.dealers.cards.every(c => c.chip === "Dealer") && t.classifieds.cards.every(c => c.chip === "Classified"), "never one mixed grid: each kind in its own");
  // THE CARD IS THE AUCTION CARD: same classes, same type, same photo shape, same button size
  const geo = await p.evaluate(() => { const g = a => { const r = a.getBoundingClientRect(), ph = a.querySelector(".ph"), pr = ph && ph.getBoundingClientRect(), cs = s => { const e = a.querySelector(s); return e ? getComputedStyle(e) : null; };
    return { cls: a.className.replace(/\s*(fs-car|nophoto)/g, ""), kids: [...a.children].map(x => x.className.split(" ")[0]).join(), ph: pr ? Math.round(pr.height / pr.width * 100) : null, ttl: cs(".ttl").fontSize + cs(".ttl").fontFamily, meta: cs(".meta").fontSize, vauc: cs(".vauc").height + cs(".vauc").fontSize, sl: cs(".sl").fontSize + cs(".sl").fontFamily, src: cs(".src").fontSize }; };
    return { auc: g(document.querySelector(".grp article.car")), dealer: g(document.querySelector('.fs-sec[data-fs="dealers"] article.car')), cl: g(document.querySelector('.fs-sec[data-fs="classifieds"] article.car')) }; });
  ok(JSON.stringify(geo.dealer) === JSON.stringify(geo.auc) && JSON.stringify(geo.cl) === JSON.stringify(geo.auc), "a dealer card and a classified card are the auction card: classes, children, photo shape, title, meta, read and button type :: " + JSON.stringify(geo));
  if (SHOTS) { await p.evaluate(() => window.scrollTo(0, 0)); await click(p, '.fs-pill[data-fs-pill="dealers"]'); await new Promise(r => setTimeout(r, 600)); await p.screenshot({ path: path.join(ROOT, "docs/demo-run/for-sale-dealers-desktop-1440.png"), fullPage: false });
    await click(p, '.fs-pill[data-fs-pill="auctions"]'); await new Promise(r => setTimeout(r, 400)); await p.screenshot({ path: path.join(ROOT, "docs/demo-run/for-sale-auctions-desktop-1440.png"), fullPage: false });
    await click(p, '.fs-pill[data-fs-pill="all"]'); await p.evaluate(() => document.querySelector('.fs-sec[data-fs="dealers"] .fs-h').scrollIntoView({ block: "start" })); await new Promise(r => setTimeout(r, 500)); await p.screenshot({ path: path.join(ROOT, "docs/demo-run/for-sale-all-desktop-1440.png") }); }
  await p.close();
});

// ================= zero counts, no auctions, remembered, roads, phone =================
await sec("zero", async () => {
  const p = await open(browser, "/find?q=" + encodeURIComponent("1986 Porsche 911")), s = await p.evaluate(READ), FS = P86.forSale;
  ok(s.pills.length === 4 && s.pills.every(x => x.vis), "a search with no dealer cars still shows all four pills :: " + JSON.stringify(s.pills.map(x => x.text)));
  ok(s.pills.find(x => x.name === "dealers").text === "Dealers 0" && s.pills.find(x => x.name === "dealers").off && s.pills.find(x => x.name === "classifieds").text === "Classifieds 0" && s.pills.find(x => x.name === "classifieds").off, "an empty pill is greyed and says 0");
  ok(!s.pills.find(x => x.name === "auctions").off && s.pills.find(x => x.name === "auctions").text === "Auctions " + fmt(FS.counts.auctions), "the pill with cars is not greyed");
  ok(!s.also, "no 'Also for sale' line when nothing else is for sale");
  await click(p, '.fs-pill[data-fs-pill="dealers"]'); const t = await p.evaluate(READ);
  ok(t.mode === "auctions" && t.grpVis, "a greyed pill does nothing when pressed :: " + t.mode);
  ok(await p.evaluate(() => { try { return localStorage.getItem("gas_fs_pill"); } catch (e) { return "x"; } }) === null, "a greyed pill is not remembered");
  await p.close();
});
await sec("no auctions", async () => {
  const p = await open(browser, "/find?q=" + encodeURIComponent("2009 BMW M3")), s = await p.evaluate(READ), FS = M3.forSale;
  ok(s.pills.length === 4 && s.pills.find(x => x.name === "auctions").text === "Auctions 0" && s.pills.find(x => x.name === "auctions").off, "no auctions: the Auctions pill is greyed with 0 and still there :: " + JSON.stringify(s.pills.map(x => x.text)));
  ok(s.also && s.also.vis && s.also.text === `Also for sale: ${fmt(FS.counts.dealers)} at dealers, ${fmt(FS.counts.classifieds)} classifieds`, "no auctions: the line leads :: " + (s.also && s.also.text));
  ok(s.order.indexOf("fs-also") >= 0 && s.order.indexOf("fs-also") < Math.max(s.order.indexOf("nonel") < 0 ? 99 : s.order.indexOf("nonel"), s.order.indexOf("keepl") < 0 ? 99 : s.order.indexOf("keepl")) && s.order[0] === "fs-pills" && (s.order.indexOf("nonel") < 0 || s.order.indexOf("fs-also") < s.order.indexOf("nonel")), "the pills, then the line, before anything else of the results :: " + s.order.join(">"));
  await p.evaluate(() => document.querySelector('.fs-also a[data-fs-pill="dealers"]').click()); const t = await p.evaluate(READ);
  ok(t.mode === "dealers" && t.dealers.cards.length === FS.dealers.cards.length && t.dealers.cards.length >= 1, "the line's link opens the dealer cars :: " + t.mode);
  ok(await p.evaluate(() => { const n = document.querySelector(".nonel"); return !n || !(n.offsetWidth || n.offsetHeight); }), "the empty-auctions lines are away while the dealer cars show");
  ok(t.dealers.cards.every(c => c.sl.includes(FS.dealers.cards.find(x => x.id === c.id).read)), "(the read as served)");
  await p.close();
});
await sec("remembered", async () => {
  let p = await open(browser, "/find?q=" + encodeURIComponent("1987 Porsche 911")); await click(p, '.fs-pill[data-fs-pill="dealers"]'); await p.close();
  p = await open(browser, "/find?q=" + encodeURIComponent("1987 Porsche 911"), { keep: true }); let s = await p.evaluate(READ);
  ok(s.mode === "dealers" && s.pills.length === 4 && s.pills.every(x => x.vis) && s.dealers.vis, "the choice is remembered on the next visit and every pill is still shown :: " + s.mode);
  await p.close();
  // the next search of the same visit uses it too, and a remembered pill with nothing in it falls back to the default without hiding anything
  p = await open(browser, "/find?q=" + encodeURIComponent("1987 Porsche 911"), { keep: true });
  await p.evaluate(() => { const i = document.querySelector("#q"); i.value = "1986 Porsche 911"; i.dispatchEvent(new Event("input", { bubbles: true })); }); await p.keyboard.press("Enter").catch(() => {});
  await p.focus("#q"); await p.keyboard.press("Enter"); await new Promise(r => setTimeout(r, 3500)); s = await p.evaluate(READ);
  ok(s.n === 1 && s.pills.length === 4 && s.pills.every(x => x.vis), "after another search in the same visit the page has one results block with four pills :: n=" + s.n + " " + s.pills.length);
  ok(s.pills.find(x => x.name === "auctions").pressed === "true" && s.mode === "auctions" && s.pills.find(x => x.name === "dealers").off, "a remembered Dealers with no dealer cars falls back to Auctions, the pill stays, greyed :: " + s.mode);
  await p.close();
  // storage that throws: the page works on the default
  p = await open(browser, "/find?q=" + encodeURIComponent("1987 Porsche 911"), { storage: "throws" }); s = await p.evaluate(READ);
  ok(s.pills.length === 4 && s.mode === "auctions" && s.grpVis, "with storage blocked the page still shows the pills on Auctions :: " + s.mode);
  await click(p, '.fs-pill[data-fs-pill="dealers"]'); s = await p.evaluate(READ);
  ok(s.mode === "dealers" && s.dealers.vis && !p._err.length, "and a pill still works :: " + p._err.join("|"));
  await p.close();
});
await sec("roads", async () => {
  // the car token
  let p = await open(browser, "/find?car=" + encodeURIComponent(TOK)); let s = await p.evaluate(READ);
  ok(s.pills.length === 4 && s.pills.every((x, i) => x.text === NAMES[i] + " " + fmt(P.forSale.counts[x.name])), "the car token road draws the pills with the engine's counts :: " + JSON.stringify(s.pills.map(x => x.text)));
  await click(p, '.fs-pill[data-fs-pill="dealers"]'); s = await p.evaluate(READ); ok(s.dealers.vis && s.dealers.cards.length === P.forSale.dealers.cards.length, "the car token road: Dealers draws the dealer cards");
  await p.close();
  // the composer's next search (the chat road) draws a new block with its own pills
  p = await open(browser, "/find?q=" + encodeURIComponent("1987 Porsche 911"));
  await p.focus("#q"); await p.keyboard.type("2009 BMW M3"); await p.keyboard.press("Enter"); await new Promise(r => setTimeout(r, 3500)); s = await p.evaluate(READ);
  ok(s.n === 1 && s.pills.length === 4 && s.pills.find(x => x.name === "dealers").text === "Dealers " + fmt(M3.forSale.counts.dealers), "the composer's next search replaces the block and its pills follow the new answer :: " + JSON.stringify(s.pills.map(x => x.text)));
  await p.close();
  // ONE PLACE DRAWS A RESULTS BLOCK: every road (typed, token, chat, rerun, a redraw) goes through it, so the one added statement covers them all
  const { BUY_CLIENT_SOURCE } = await imp("api/buy.js");
  ok(BUY_CLIENT_SOURCE.split('className = "msg sam results').length === 2 && FSP && BUY_CLIENT_SOURCE.split(FSP.FORSALE_ANCHOR).length === 2, "Find's client makes a results block in exactly one place, and the anchor is there once");
  ok(FSP && FSP.forSaleClient(BUY_CLIENT_SOURCE, true).split("block.__d = d;").length === 2 && FSP.forSaleClient(BUY_CLIENT_SOURCE, true).length === BUY_CLIENT_SOURCE.length + " block.__d = d;".length, "for the crew the client gets that one statement and nothing else");
});
await sec("phone", async () => {
  const p = await open(browser, "/find?q=" + encodeURIComponent("1987 Porsche 911"), { width: 390, height: 844 }); let s = await p.evaluate(READ);
  ok(new Set(s.pills.map(x => x.top)).size === 1, "pills on one row at 390 :: " + JSON.stringify(s.pills.map(x => x.top)));
  ok(s.scrollW <= s.innerW, "no sideways page scroll at 390 :: " + s.scrollW + " > " + s.innerW);
  ok(s.pillsBox && s.pillsBox.right <= s.innerW, "the pill row stays inside the screen (it scrolls inside itself if it must) :: " + JSON.stringify(s.pillsBox));
  for (const k of ["dealers", "classifieds", "all"]) { await click(p, '.fs-pill[data-fs-pill="' + k + '"]'); s = await p.evaluate(READ); ok(s.scrollW <= s.innerW, "no sideways page scroll at 390 on " + k); }
  const w = await p.evaluate(() => { const a = document.querySelector('.fs-sec[data-fs="dealers"] article.car'), r = a.getBoundingClientRect(); return { w: Math.round(r.width), cols: new Set([...document.querySelectorAll('.fs-sec[data-fs="dealers"] article.car')].map(x => Math.round(x.getBoundingClientRect().left))).size }; });
  ok(w.cols === 1 && w.w <= 390, "cards in one column inside the screen :: " + JSON.stringify(w));
  if (SHOTS) { await click(p, '.fs-pill[data-fs-pill="dealers"]'); await p.evaluate(() => window.scrollTo(0, 0)); await new Promise(r => setTimeout(r, 500)); await p.screenshot({ path: path.join(ROOT, "docs/demo-run/for-sale-dealers-phone-390.png") });
    await click(p, '.fs-pill[data-fs-pill="all"]'); await p.evaluate(() => document.querySelector('.fs-sec[data-fs="classifieds"] .fs-h').scrollIntoView({ block: "start" })); await new Promise(r => setTimeout(r, 500)); await p.screenshot({ path: path.join(ROOT, "docs/demo-run/for-sale-all-phone-390.png") }); }
  await p.close();
});
// ================= the page computes nothing, the class, a visitor =================
await sec("source", async () => {
  const src = FSP ? FSP.FORSALE_JS : "";
  const bad = [/\.sort\(/, /\.reduce\(/, /Math\.(round|floor|ceil|max|abs|random)/, /parseInt|parseFloat|toFixed/, /\.split\(/, /\.match\(|\.exec\(/, /\bNumber\([^)]*\)\s*[-+*\/]/, /\.length\s*[-+*\/]\s*\d/];
  ok(FSP && bad.every(re => !re.test(src)), "the module sorts, sums, rounds and parses nothing :: " + bad.filter(re => re.test(src)).join(" "));
  ok(FSP && !/\.title|listing_title|\.car\b|\.car\./.test(src.replace(/closest\("\.car"\)|\\'\.car\\'|article\.car|class="car/g, "")), "the module never reads a car's own fields to decide anything (name, label, asking, read as sent)");
  ok(FSP && !/asking\b(?!Line)|\.asking\s*[<>=]/.test(src.replace(/askingLine/g, "")), "the module never reads the asking number itself, only the engine's words for it");
  ok(FSP && (src.match(/fetch\s*\(/g) || []).length === 1 && /fetch\("\/api\/buySearch",.*action:"more",.*forSaleGroup:k,forSaleOffset:/.test(src) && !/XMLHttpRequest/.test(src), "the module asks the server for one thing only, the next batch of a group (buySearch action more with forSaleGroup and forSaleOffset, Show more, Nov 20 2026): the answer is otherwise already on the block");
  ok(FSP && /At auction now/.test(src) && /At dealers/.test(src) && /Classifieds/.test(src) && /View listing/.test(src) && /Also for sale:/.test(src), "the fixed words are the ones in the order");
  ok(FSP && !/[\u2013\u2014]/.test(src), "no em or en dash in anything a visitor reads");
});
await sec("class", async () => {
  // EVERY FILE THAT DRAWS A CAR CARD, named: the changed one and the ones left, each with why
  const CARD = /<article class="car|article class=\\"car|"article\.car"/;
  const reg = { "api/buy.js": "CHANGED (Find: the one page both doors serve)", "lib/findCardKit.js": "SWEPT, not changed (Tasks and the alert emails draw Find's own card from api/buy.js; Tasks and the alerts match auctions only, lib/forsale is not named there)", "lib/sell/sellClient.js": "SWEPT, not changed (Sell's sale rows: completed sales, never for-sale cars)", "lib/forSalePage.js": "the new cards (this change)" };
  const found = []; const walk = d => { for (const f of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) { const rel = d + "/" + f.name; if (f.isDirectory()) { if (!/node_modules|docs|proofs|scripts|\.git$/.test(f.name)) walk(rel); } else if (/\.(js|mjs)$/.test(f.name) && CARD.test(fs.readFileSync(path.join(ROOT, rel), "utf8"))) found.push(rel); } };
  for (const d of ["api", "lib", "public/js"]) walk(d);
  const missing = found.filter(f => !reg[f]);
  ok(missing.length === 0, "every file that draws a car card is named in the sweep (a new one fails here) :: " + missing.join(", "));
  const tasks = ["lib/tasks", "lib/live/buyAlerts.js", "lib/live/watches.js"].map(f => { const a = path.join(ROOT, f); return fs.existsSync(a) ? (fs.statSync(a).isDirectory() ? fs.readdirSync(a).map(x => fs.readFileSync(path.join(a, x), "utf8")).join("\n") : fs.readFileSync(a, "utf8")) : ""; }).join("\n");
  ok(!/forSalePage|forsale|forSale/.test(tasks), "Tasks and the alerts name no for-sale code (they match auctions only; their cards are not changed)");
});
await sec("visitor", async () => {
  const v = await W.call(BUYPAGE, "/find?q=" + encodeURIComponent("1987 Porsche 911"), { crew: false }), c = await W.call(BUYPAGE, "/find?q=" + encodeURIComponent("1987 Porsche 911"), { crew: true });
  ok(!/fs-mod|fs-css|__d = d|fs-pill|forSale/.test(v.body), "a visitor's page carries no module, no style and no added statement");
  ok(/id="fs-mod"/.test(c.body) && /__d = d;/.test(c.body), "the crew's page carries them");
  const { BUY_CLIENT_SOURCE } = await imp("api/buy.js");
  ok(FSP && FSP.forSaleHead(false) === "" && FSP.forSaleClient(BUY_CLIENT_SOURCE, false) === BUY_CLIENT_SOURCE && FSP.forSaleClient("x", undefined) === "x" && FSP.forSaleHead(undefined) === "" && FSP.forSaleHead("yes") === "", "for anyone but a verified crew request both parts hand back their input byte for byte");
  ok(FSP && FSP.FORSALE_PAGE_PUBLIC === false, "the one switch is off");
  // the visitor in Chrome: the engine's answer carries no forSale for a visitor, and the page draws no pills
  const p = await open(browser, "/find?q=" + encodeURIComponent("1987 Porsche 911"), { crew: false }); const s = await p.evaluate(READ);
  ok(!s.hasMod && s.pills.length === 0 && s.dealers === null && s.n === 1 && s.grpCards >= 1, "a visitor sees the auctions and no pills :: " + JSON.stringify({ pills: s.pills.length, mod: s.hasMod }));
  await p.close();
});

say("forSalePageCheck: " + pass + " pass, " + fail + " fail"); say(out.join("\n"));
await browser.close(); process.exit(fail ? 1 : 0);
