// Local screenshots of the eBay demo (views a, b, c) at 1440 and 390 for the 2008 Porsche 911 Carrera S, with the listing form on Auction and on Buy It Now / Fixed Price and no price typed
// (Lane E, Nov 1 2026). The engine is a LOCAL STAND-IN: Market Check's M3 fixture answer with the car renamed, so the FIGURES are the fixture's, not the market's; the sales come from the real
// partnerPositionsOf over five fixture sales. No network. PNGs go to proofs/listing-form/ (and the mock, for comparison, to proofs/listing-form/mock-*.png).
import fs from "node:fs";
import { MC } from "./e98Fixtures.mjs";
import { startBrowser } from "./e98Render.mjs";
import { pageHtml } from "../api/partnerDemo.js";
import { partnerShape, positionAskOf, placedSaleOf } from "../api/partnerAnswer.js";
import { partnerPositionsOf } from "../lib/onebox.js";
const CAR = "2008 Porsche 911 Carrera S";
const CARDS = [
  { id: "00000000-0000-4000-8000-000000000001", date: "2026-10-24", mi: 31200, price: 31250, title: "2008 Porsche 911 Carrera S", image: "https://img.example/ok.svg" },
  { id: "00000000-0000-4000-8000-000000000002", date: "2026-10-19", mi: 18400, price: 39000, title: "2008 Porsche 911 Carrera S Coupe", image: "https://img.example/ok.svg" },
  { id: "00000000-0000-4000-8000-000000000003", date: "2026-10-11", mi: 42900, price: 24000, title: "2008 Porsche 911 Carrera S", image: null },
  { id: "00000000-0000-4000-8000-000000000004", date: "2026-10-03", mi: 55100, price: 22800, title: "2008 Porsche 911 Carrera S", image: "https://img.example/ok.svg" },
  { id: "00000000-0000-4000-8000-000000000005", date: "2026-09-27", mi: 27600, price: 35500, title: "2008 Porsche 911 Carrera S Cabriolet", image: null }
];
const D = { status: "one_box", ...MC["2001 BMW M3 (alike with options)"].d, span: [15000, 60000], cards: CARDS };
const out = "proofs/listing-form/"; fs.mkdirSync(out, { recursive: true });
const browser = await startBrowser();
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="100%" height="100%" fill="#8ab"/><path d="M40 170h240M60 170l25-50h150l25 50" stroke="#fff" stroke-width="8" fill="none"/></svg>';
async function shot(name, view, width, act) {
  const p = await browser.newPage(); await p.setViewport({ width, height: 900 }); const html = pageHtml(view, CAR);
  await p.setRequestInterception(true);
  p.on("request", r => { const u = new URL(r.url());
    if (u.host === "goasksam.com" && r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html", body: html });
    if (u.pathname === "/api/partnerAnswer" && r.method() === "GET" && u.searchParams.get("photo")) return r.respond({ status: 200, contentType: "image/svg+xml", body: svg });
    if (u.pathname === "/api/partnerAnswer" && r.method() === "POST") { let b = {}; try { b = JSON.parse(r.postData() || "{}"); } catch {}
      let o = { ...partnerShape(D, b.q || CAR, 0, {}), updated: null }; const ask = positionAskOf(b);
      if (ask) { const px = partnerPositionsOf(D, ask); o = { ...o, positions: px.positions, placedSales: px.sales.map(placedSaleOf), order: px.order }; }
      return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(o).replace(/2001 BMW M3 \(e46\)|2001 BMW M3/g, CAR) }); }
    return r.respond({ status: 204, body: "" }); });
  await p.goto("https://goasksam.com/preview?view=" + view + "&car=" + encodeURIComponent(CAR), { waitUntil: "networkidle2" }).catch(() => {});
  await new Promise(r => setTimeout(r, 900)); if (act) await act(p);
  await p.screenshot({ path: out + name + "-" + width + ".png", fullPage: true }); await p.close();
}
const toFixed = async p => { await p.select("#b-format", "fixed"); await new Promise(r => setTimeout(r, 900)); };
for (const w of [1440, 390]) {
  await shot("a", "a", w);
  await shot("b-auction", "b", w);
  await shot("b-fixed", "b", w, toFixed);
  await shot("c", "c", w);
}
// the mock, for the side by side
for (const w of [1440, 390]) { const p = await browser.newPage(); await p.setViewport({ width: w, height: 900 }); await p.goto("file://" + process.env.HOME + "/Downloads/listing-form-with-sam-mock.html", { waitUntil: "domcontentloaded" }).catch(() => {}); await new Promise(r => setTimeout(r, 800)); await p.screenshot({ path: out + "mock-" + w + ".png", fullPage: true }); await p.close(); }
await browser.close(); console.log("partnerDemoShots: wrote " + fs.readdirSync(out).length + " pngs to " + out);
