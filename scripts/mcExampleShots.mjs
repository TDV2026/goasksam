// Screenshots of the Market Check entry page with the engine's real result (the day's pick car) at 1440, 1024 and 390, into proofs/mcsell/ (offline; the result is a recorded real answer). node scripts/mcExampleShots.mjs
import fs from "node:fs";
const H = await import("./mcSellHarness.mjs"), CP = await import("../api/crewPage.js"), MCX = await import("../lib/live/marketCheckExamples.js");
const fx = JSON.parse(fs.readFileSync("scripts/fixtures/mcSell/mc-2006-ford-gt.json", "utf8")); let ans = null; for (const v of Object.values(fx)) { try { const j = JSON.parse(v.body); if (j.tier === "result" && Array.isArray(j.cards)) ans = j; } catch {} }
const field = MCX.mcResultShape({ pickDate: "2026-11-08", model: "2006 Ford GT", result: ans, sales: ans.cards.slice(0, 3) }); CP.MC_EXAMPLES.read = async () => field;
const b = await H.launch(); fs.mkdirSync("proofs/mcsell", { recursive: true });
for (const w of [1440, 1024, 390]) {
  const p = await b.newPage(); await p.setViewport({ width: w, height: 900 }); await p.setRequestInterception(true);
  p.on("request", async r => { const u = new URL(r.url()); if (u.host !== "goasksam.com") return r.respond({ status: 204, body: "" });
    const page = { "/preview/market-check": "preview-market-check", "/preview/market-check/example": "preview-market-check-example", "/preview/market-check/onebox.js": "preview-onebox-js" }[u.pathname];
    if (page) { const res = { h: {}, code: 200, body: "", setHeader(k, v) { this.h[k.toLowerCase()] = v; return this; }, getHeader(k) { return this.h[k.toLowerCase()]; }, removeHeader() {}, status(c) { this.code = c; return this; }, send(x) { this.body = String(x); return this; }, end(x) { this.body = String(x || ""); return this; }, json(o) { this.body = JSON.stringify(o); return this; }, writeHead(c) { this.code = c; return this; } };
      await CP.default({ method: "GET", url: "/", query: { page }, headers: { cookie: H.CREW, host: "goasksam.com" }, socket: {}, body: null }, res); return r.respond({ status: res.code, contentType: res.h["content-type"] || "text/html", body: res.body }); }
    const f = "public" + (/^\/obx\./.test(u.pathname) ? "/js/onebox.js" : u.pathname.replace(/^\/js\.[^/]+\//, "/js/")); if (fs.existsSync(f) && fs.statSync(f).isFile()) return r.respond({ status: 200, contentType: f.endsWith(".js") ? "application/javascript" : f.endsWith(".css") ? "text/css" : "application/octet-stream", body: fs.readFileSync(f) });
    r.respond({ status: u.pathname.startsWith("/api/") ? 200 : 404, contentType: "application/json", body: "{}" }); });
  await p.goto("https://goasksam.com/preview/market-check", { waitUntil: "domcontentloaded" }); await new Promise(r => setTimeout(r, 3500));
  await p.screenshot({ path: `proofs/mcsell/example-result-${w}.png`, fullPage: true }); await p.close();
}
await b.close();
