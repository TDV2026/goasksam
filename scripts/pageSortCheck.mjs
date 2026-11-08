// PAGES SORT NOTHING (Lane E, Nov 4 2026). Cause: public/js/onebox.js and public/js/result.js (and the partner demo, the History page) sorted the sales list, the
// tiles and the set-aside rows themselves, by price and by date, over the order oneEngineAnswer sent. A page that sorts is computing, and it hid the engine's order
// (newest first, dearer first on a tie; nearest in miles and a buyer's chosen order keep their own).
// 1. THE CLASS: every .sort( / .toSorted( in page code (public/js, and every api file that returns a page) must be in the reviewed list below, each with its reason. A new
//    page-side sort fails here until a person reads it and either removes it or lists it. Engine lists (sales, cards, tiles, rows, aside rows, chips) are never listed.
// 2. THE PAGES: three cars rendered in Chrome from engine answers whose order is NOT sorted any way (so a page sort shows): a mileage-band result card, a thin car with
//    set-aside rows, and the partner page with Highest price chosen. What the page prints is the order the engine sent.     node scripts/pageSortCheck.mjs
import fs from "node:fs";
import path from "node:path";
import { startBrowser, openMC } from "./e98Render.mjs";
import { MC } from "./e98Fixtures.mjs";
import { pageHtml, DUMMY } from "../api/partnerDemo.js";
import { partnerShape, positionAskOf, placedSaleOf } from "../api/partnerAnswer.js";
import { partnerPositionsOf } from "../lib/onebox.js";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

// ---- 1. the class
// [file, a pattern on the 150 characters around the sort, kind, why]. kind: "not an engine list" (layout, chart axis, a fixed example, the page's own words, the data layer's own
// rows) or "DEBT" (the page ranks or picks from engine data; not a sales list; the engine sends no order for it yet, reported in lane-notes).
const REVIEWED = [
  ["api/history.js", /keys\.slice\(\)\.sort\(\(a, b\) => \(salesOf\(b\)/, "not an engine list", "the nightly sitemap build asks the hub gate of the largest hubs first (a work order for the job, never printed on a page)"],
  ["public/js/desk.js", /byReason/, "not an engine list", "Desk (crew analytics): the order of reason keys under a chart, a display order of the page's own labels"],
  ["public/js/desk.js", /cats\.slice\(\)\.sort\(\)/, "not an engine list", "Desk chart axis: year categories in calendar order"],
  ["public/js/desk.js", /rowsByCat\[b\]/, "not an engine list", "Desk chart axis: categories by their own row counts"],
  ["public/js/desk.js", /periods\.sort\(\)/, "not an engine list", "Desk chart axis: period labels in calendar order (two charts)"],
  ["public/js/onebox.js", /withKeys\.sort/, "not an engine list", "the landing page's fixed illustrative example grid (static cards, no engine list), reordered by the chip the visitor taps"],
  ["public/js/result-copy.js", /medianSalePrice/, "DEBT", "legacy /sell wizard: ranks the other routes by their median to say a delta; the engine sends no such order"],
  ["public/js/result.js", /h\.hammers\.slice\(\)\.sort|z\.count-a\.count/, "DEBT", "legacy /sell wizard: groups receipts into venues and ranks the venues (not the sales)"],
  ["public/js/result.js", /hammers\|\|\[\]\)\.filter|hammers\|\|\[\]|\(hammers/, "DEBT", "legacy /sell wizard: sorts hammer prices to take the lowest and highest for a sentence"],
  ["public/js/result.js", /asapLead|mostRecent/, "DEBT", "legacy /sell wizard: orders the houses (asap lead, then most recent); not a sales list"],
  ["public/js/result.js", /hs\.filter|\bhs=|const f=hs/, "DEBT", "legacy /sell wizard: sorts hammer prices to take the lowest and highest for a sentence"],
  ["public/js/result.js", /vmap\)\.sort|Object\.values\(vmap\)/, "DEBT", "legacy /sell wizard: ranks the online venues by their sale count"],
  ["api/_amazonDemo.js", /KNOWN_MAKES/, "not an engine list", "the demo's make word list, longest first, to match the longest make in the typed words"],
  ["api/buy.js", /chips\.slice\(\)\.sort/, "not an engine list", "layout: which chip to hide first when the chip row overflows (the longest)"],
  ["api/history.js", /atts\.filter/, "DEBT", "History page: picks the highest attempt bid from the VIN's own appearances (the data layer's rows, no engine order for it)"],
  ["api/history.js", /otherMulti/, "not an engine list", "History hub: which candidate groups to validate first (the freshest), the data layer's own rows, not a list the page prints in order"],
  ["api/history.js", /okHubs\.sort|r\.fallback/, "not an engine list", "History: the nightly roll-up's own bookkeeping"],
];
function pageFiles() {
  const out = fs.readdirSync(path.join(ROOT, "public/js")).filter(f => f.endsWith(".js")).map(f => "public/js/" + f);
  for (const f of fs.readdirSync(path.join(ROOT, "api")).filter(f => f.endsWith(".js"))) {
    if (["admin.js", "buySearch.js", "tasks.js", "usageDashboard.js"].includes(f)) continue;   // server code: the ops and crew dashboards, the engine's own search, the matching job
    if (/<html|<\/html>|<script|innerHTML/.test(fs.readFileSync(path.join(ROOT, "api", f), "utf8"))) out.push("api/" + f);
  }
  return out;
}
export function unreviewedSorts(root = ROOT) {
  const bad = [];
  for (const f of pageFiles()) {
    const t = fs.readFileSync(path.join(root, f), "utf8");
    for (const m of t.matchAll(/\.sort\(|\.toSorted\(/g)) {
      const ctx = t.slice(Math.max(0, m.index - 80), m.index + 110), line = t.slice(0, m.index).split("\n").length;
      if (!REVIEWED.some(([file, re]) => file === f && re.test(ctx))) bad.push(f + ":" + line);
    }
  }
  return bad;
}
{ const bad = unreviewedSorts(); ok(bad.length === 0, `no page sorts a list it was sent: every sort in page code is reviewed (${bad.join(", ") || "none unreviewed"})`);
  const ctxs = {}; for (const f of pageFiles()) { const t = fs.readFileSync(path.join(ROOT, f), "utf8"); ctxs[f] = [...t.matchAll(/\.sort\(|\.toSorted\(/g)].map(m => t.slice(Math.max(0, m.index - 80), m.index + 110)); }
  const stale = REVIEWED.filter(([file, re]) => !(ctxs[file] || []).some(c => re.test(c))); ok(stale.length === 0, `every reviewed entry still names a sort that exists (${stale.map(e => e[0] + " " + e[1]).join("; ") || "none stale"})`); }{ const t = fs.readFileSync(path.join(ROOT, "public/js/onebox.js"), "utf8"), p = fs.readFileSync(path.join(ROOT, "api/partnerDemo.js"), "utf8");
  ok(!/\.sort\(/.test(p), "the partner page holds no sort at all");
  ok(!/thinCardsFrom\(scope\)\.sort|list\.slice\(\)\.sort|aside\.slice\(\)\.sort|ce\.receipts\.slice\(\)\.sort/.test(t), "Market Check's sales, tiles, set-aside rows and latest sale are printed in the order sent"); }

// ---- 2. the pages
const strip = d => { const { trend, chart, trendHeld, chartCaption, chartWindowLine, ...r } = d; return r; };
const HELD = n => ({ type: "withheld", scope: null, buckets: null, note: null, caption: "Latest sales", withheld: { reason: "too_few", line: "x" }, n });
const b = await startBrowser();
const fx = Object.values(MC)[2];
const PRICES = [52000, 21000, 80000, 33000, 61000, 27000, 90000, 45000, 38000, 70000, 24000], DATES = ["2026-01-05", "2026-09-20", "2026-03-11", "2026-10-02", "2026-02-14", "2026-07-30", "2026-05-05", "2026-08-18", "2026-04-01", "2026-06-12", "2026-10-25"];
const usdOf = n => "$" + Number(n).toLocaleString("en-US");
for (const w of [1440, 390]) {
  // car 1: a result card (11 sales, the mileage-band answer's list), the cards in an order that is neither price nor date
  { const cards = fx.d.cards.slice(0, 11).map((c, i) => ({ ...c, price: PRICES[i], date: DATES[i] }));
    const p = await openMC(b, { ...fx, d: { ...strip(fx.d), cards, poolN: 11, chart: HELD(11) } }, w);
    const got = await p.evaluate(() => [...document.querySelectorAll(".thin-tiles:not(.thin-tiles-aside) .thin-tile-price")].map(e => e.textContent));
    ok(JSON.stringify(got) === JSON.stringify(PRICES.map(usdOf)), `${w}: the result card's 11 sales print in the engine's order (${got.join(" ")})`); await p.close(); }
  // car 2: a thin car (6 sales and 2 set aside), neither list in price or date order
  { const rec = [[52000, "2026-01-05"], [21000, "2026-09-20"], [80000, "2026-03-11"], [33000, "2026-10-02"], [61000, "2026-02-14"], [27000, "2026-07-30"]].map(([h, dt], i) => ({ hammer: h, allIn: h, date: dt, title: "2003 Porsche 911 Carrera " + i, slug: "bringatrailer", venue: "Bring a Trailer", url: "https://bat.test/" + i, id: 900 + i, mileage: 20000 + i, isHouse: false }));
    const aside = [{ price: 30000, date: "2025-12-01", title: "2003 Porsche 911 aside A", reason: "x" }, { price: 90000, date: "2026-08-01", title: "2003 Porsche 911 aside B", reason: "x" }, { price: 41000, date: "2026-02-01", title: "2003 Porsche 911 aside C", reason: "x" }];
    const p = await openMC(b, { ...fx, d: { ...strip(fx.d), tier: "thin", poolN: 6, cards: [], thin: { receipts: rec, intake: null }, setAsideRows: aside } }, w);
    const got = await p.evaluate(() => ({ main: [...document.querySelectorAll(".thin-tiles:not(.thin-tiles-aside) .thin-tile-price")].map(e => e.textContent), aside: [...document.querySelectorAll(".thin-tiles-aside .thin-tile-price")].map(e => e.textContent) }));
    ok(JSON.stringify(got.main) === JSON.stringify(rec.map(r => usdOf(r.hammer))), `${w}: the thin car's sales print in the engine's order (${got.main.join(" ")})`);
    ok(JSON.stringify(got.aside) === JSON.stringify(aside.map(r => usdOf(r.price))), `${w}: the thin car's set-aside rows print in the engine's order (${got.aside.join(" ")})`); await p.close(); }
}
// car 3: the partner page, Highest price chosen: the page asks the engine for that order and prints what comes back, which here is deliberately not in price order
{ const RANGE = { status: "one_box", ...MC["2001 BMW M3 (alike with options)"].d };
  const SCRAMBLED = [24000, 43000, 19500, 38500, 31250];   // the engine's answer for order=price, in an order no sort would give
  const SALES = SCRAMBLED.map((price, i) => ({ id: "00000000-0000-4000-8000-00000000010" + i, date: "2026-10-2" + i, mi: 20000 + i, price, title: "2008 Porsche 911 Carrera S", platform: "Venue One", url: "https://sales.example/s" + i, image: null }));
  const d = { ...RANGE, cards: SALES };
  for (const width of [1440, 390]) {
    const p = await b.newPage(); await p.setViewport({ width, height: 900 }); const asked = [], html = pageHtml("b", DUMMY.q);
    await p.setRequestInterception(true);
    p.on("request", r => { const u = new URL(r.url());
      if (u.host === "goasksam.com" && r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html", body: html });
      if (u.host === "goasksam.com" && u.pathname === "/api/partnerAnswer" && r.method() === "POST") { let bd = {}; try { bd = JSON.parse(r.postData() || "{}"); } catch {}
        asked.push(bd); const ask = positionAskOf(bd), base = { ...partnerShape(d, bd.q || DUMMY.q, 0, {}), updated: null }, px = ask ? partnerPositionsOf(d, ask) : null;
        const sales = bd.order === "price" ? SCRAMBLED.map(price => { const s = SALES.find(x => x.price === price); return { ...placedSaleOf(px.sales.find(r2 => r2.price === price) || px.sales[0]), price }; }) : px.sales.map(placedSaleOf);
        return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ...base, positions: px.positions, placedSales: sales, order: px.order }) }); }
      return r.respond({ status: u.host === "goasksam.com" ? 204 : 204, body: "" }); });
    await p.goto("https://goasksam.com/preview?view=b&car=" + encodeURIComponent(DUMMY.q), { waitUntil: "networkidle2" }).catch(() => {});
    await new Promise(r => setTimeout(r, 600));
    await p.evaluate(() => document.querySelector('#b-out [data-order="price"]').click()); await new Promise(r => setTimeout(r, 900));
    const got = await p.evaluate(() => [...document.querySelectorAll("#b-out .slist li .p")].map(e => e.innerText));
    ok(asked.some(a => a.order === "price"), `partner page ${width}: Highest price asks the engine for that order`);
    ok(JSON.stringify(got) === JSON.stringify(SCRAMBLED.map(usdOf)), `partner page ${width}: Highest price prints the engine's five in the engine's order (${got.join(" ")})`); await p.close(); }
}
await b.close();
console.log(`pageSortCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
