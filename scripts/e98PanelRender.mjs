// The Find "See the sales" panel, rendered with ten sales (fixture rows in the shape the engine's panel answer carries: engineAnswer.cards). Used by salesPanelCheck.mjs and the proof PNGs.
import { startBrowser, pageHtml, ROOT, crewCookie } from "./e98Render.mjs";
import { buildCards } from "./e98FindRender.mjs";
import { M3_ROW } from "./e98Fixtures.mjs";
export const TEN = Array.from({ length: 10 }, (_, k) => ({ id: "s" + k, price: 41000 - k * 1200, date: `2026-${String(10 - Math.floor(k / 2)).padStart(2, "0")}-1${k % 2}`, mi: 31000 + k * 3300, title: k % 3 ? "2008 BMW M3 Coupe" : "2008 BMW M3 Coupe 6-Speed Manual", image: k === 3 ? null : "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="#bfb8a8"/></svg>'), url: "https://bringatrailer.com/listing/x" + k, platform: k % 2 ? "Bring a Trailer" : "Cars & Bids" }));
export async function openPanel(browser, width, opts = {}) {
  const defs = [M3_ROW["2008 BMW M3 Coupe"]], cards = await buildCards(defs), html = await pageHtml("api/buy.js", "/buy", false), p = await browser.newPage(); await p.setViewport({ width, height: 900, deviceScaleFactor: 1 });
  await p.evaluateOnNewDocument(() => { window.gasTrack = () => {}; });
  const card = { ...cards[0], market: { ...cards[0].market, query: "2008 bmw m3 coupe" } };
  await p.setRequestInterception(true);
  p.on("request", r => { const u = new URL(r.url());
    if (u.host === "goasksam.com" && r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html", body: html });
    if (u.host === "goasksam.com" && u.pathname === "/api/buySearch") { let q = {}; try { q = JSON.parse(r.postData() || "{}"); } catch {}
      if (q.action === "chat") return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ reply: "ok", turns: 1, state: { filters: { make: "BMW" } }, meta: { count: 1, total: 1, narrow: "none" }, cards: [card] }) });
      if (q.action === "panel") return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ market: card.market, engineAnswer: { basisLine: "Based on ten sales, the latest in October 2026.", cards: opts.rows || TEN }, representative: {}, sam_lines: card.sam_lines }) });
      if (q.action === "enrich") return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ cards: [] }) });
      return r.respond({ status: 200, contentType: "application/json", body: "{}" }); }
    if (u.host === "goasksam.com" && /^\/api\//.test(u.pathname)) return r.respond({ status: 200, contentType: "application/json", body: "{}" });
    if (u.host !== "goasksam-com" && u.host !== "goasksam.com") return r.respond({ status: 204, body: "" }); r.continue(); });
  await p.goto("https://goasksam.com/buy", { waitUntil: "networkidle2" }).catch(() => {}); await p.waitForSelector("#hq", { timeout: 5000 }).catch(() => {}); await p.type("#hq", "bmw m3"); await p.keyboard.press("Enter"); await new Promise(r => setTimeout(r, 2500));
  await p.evaluate(() => { const b = document.querySelector("button[data-mc]"); if (b) b.click(); }); await p.waitForSelector(".md-row", { timeout: 6000 }).catch(() => {}); await new Promise(r => setTimeout(r, 600)); return p;
}
