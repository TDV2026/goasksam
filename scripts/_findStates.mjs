// THE REAL FIND PAGE, THE REAL SEARCH HANDLER (Lane S, Nov 19 2026): the page from this tree in Chrome (scripts/_localSite.mjs, _pageShots.mjs openPage), its /api calls answered by api/buySearch.js in this process over a fake live table
// (no network, no key). Used by findOneVoiceCheck and its screenshots. Returns the visible text blocks of the result, in page order, so a check can say what is stacked.
import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module"; import { pathToFileURL } from "node:url";
export async function startFind(ROOT, rows, { marketRows = [] } = {}) {
  process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2"; process.env.OLDCARSDATA_API_KEY = "unused"; process.env.ANTHROPIC_API_KEY = "unused"; process.env.PROBE_KEY = "probe-k"; process.env.GAS_WAIT_SCALE = "1";
  globalThis.fetch = async (url) => { const u = String(url); if (/api\.anthropic\.com/.test(u)) return new Response("{}", { status: 500 }); return new Response(JSON.stringify(/\/rest\/v1\/live_listings/.test(u) ? rows : /\/rest\/v1\/sales_archive/.test(u) ? marketRows : []), { status: 200, headers: { "content-type": "application/json" } }); };
  const { startSite } = await import(pathToFileURL(path.join(ROOT, "scripts/_localSite.mjs")).href), { openPage, closePage } = await import(pathToFileURL(path.join(ROOT, "scripts/_pageShots.mjs")).href);
  const handler = (await import(pathToFileURL(path.join(ROOT, "api/buySearch.js")).href + "?v=" + Math.random())).default;
  const site = await startSite(ROOT), puppeteer = createRequire(path.join(ROOT, "package.json"))("puppeteer-core");
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
  const proxy = { base: "http://x", fetch: async (u, o) => { const out = { code: 200, h: {}, body: null, setHeader(k, v) { this.h[k.toLowerCase()] = v; return this; }, status(c) { this.code = c; return this; }, json(b) { this.body = JSON.stringify(b); return this; }, end(b) { this.body = this.body ?? (b || ""); return this; }, send(b) { this.body = typeof b === "string" ? b : JSON.stringify(b); return this; }, getHeader() {}, removeHeader() {} };
    const pn = new URL(u).pathname; let body = {}; try { body = JSON.parse(o.body || "{}"); } catch {}
    if (pn === "/api/buySearch") { const log = console.error; console.error = () => {}; try { await handler({ method: o.method, url: pn, query: {}, body, headers: { host: "goasksam.com", "x-probe-key": "probe-k" } }, out); } finally { console.error = log; } }
    else out.body = "{}";
    if (pn === "/api/buySearch" && api.tweak && out.body) { try { const j = JSON.parse(out.body); api.tweak(j, body); out.body = JSON.stringify(j); } catch {} }
    return new Response(out.body, { status: out.code, headers: { "content-type": "application/json" } }); } };
  const api = { tweak: null }; return { site, browser, ROOT, api,
    // one search through the page: q is typed words; the page asks the engine's no-model search (rerun with text) when its written answer is paused (no model here)
    async run(q, { w = 1100, wait = 6000, shot = null, extra = "", tweak = null } = {}) { api.tweak = tweak;
      const pg = await openPage(browser, { ROOT, base: site.base, w, url: "/find?q=" + encodeURIComponent(q) + extra, proxy });
      await new Promise(r => setTimeout(r, wait));
      const out = await pg.evaluate(() => { const vis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
        const lines = []; for (const el of document.querySelectorAll("#convo h1,#convo h2,#convo h3,#convo p,#convo a.kl-btn,#convo button,#convo label")) { if (!vis(el)) continue; const t = (el.innerText || "").replace(/\s+/g, " ").trim(); if (t) lines.push({ tag: el.tagName.toLowerCase(), cls: el.className || "", sec: (el.closest("section") || {}).className || "", t, px: Math.round(parseFloat(getComputedStyle(el).fontSize)) }); }
        return { lines, text: (document.querySelector("#convo") || document.body).innerText }; });
      if (shot) await pg.screenshot({ path: shot, fullPage: true });
      await closePage(pg); return out; },
    async close() { await browser.close(); site.close(); } };
}
