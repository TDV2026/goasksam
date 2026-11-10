// Desk V4 checks harness (Lane S, Nov 10 2026): the V4 page as the crew door serves it, opened in Chrome, with the page's POSTs answered by the REAL in-process Desk reader (previewDeskApi), not a stub.
import { launch, imp, tally, ROOT, V3 } from "./deskV3Harness.mjs";
export { launch, imp, tally, ROOT, V3 };
const V4 = await imp("lib/preview/deskV4.js"), PV = await imp("lib/preview/deskPreview.js");
export { V4, PV };
export async function openLive(b, { w = 1440, h = 900, id = V3.DEMO_ID, mutate = null, dark = false } = {}) {
  let html = await V4.renderDeskV4({ query: { case: id } }); if (mutate) html = mutate(html);
  const p = await b.newPage(); await p.setViewport({ width: w, height: h }); await p.setRequestInterception(true); p._posts = []; p._err = [];
  p.on("request", async r => { const u = new URL(r.url());
    if (u.host === "goasksam.com" && r.method() === "POST" && u.pathname === "/preview/desk/api") { let bd = {}; try { bd = JSON.parse(r.postData() || "{}"); } catch {} p._posts.push(bd); const out = await PV.previewDeskApi(bd); return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(out) }); }
    if (u.host === "goasksam.com" && r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html", body: html });
    return r.respond({ status: 204, body: "" }); });
  p.on("pageerror", e => p._err.push(String(e).slice(0, 200)));
  if (dark) await p.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
  await p.goto("https://goasksam.com/preview/desk/case/" + id, { waitUntil: "domcontentloaded" }); await new Promise(r => setTimeout(r, 400)); return p;
}
export const idle = async (p, ms = 500) => { await new Promise(r => setTimeout(r, ms)); };
