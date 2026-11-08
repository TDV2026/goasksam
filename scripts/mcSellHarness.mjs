// THE BROWSER HARNESS FOR MARKET CHECK AND SELL ON THE SHARED SHELL (Lane E, Nov 8 2026). One place that opens either page in Chrome: the LIVE page (the live handler's own HTML, exactly as /market-check and /sell answer) or the PREVIEW (/preview/market-check, /preview/sell: the same page inside the shell), with every engine call (/api/*) answered from a recorded file, so before and after read the SAME answers.
//   record: the call goes to production once with the probe key (read from the Keychain in this process, sent as x-ops-key, never printed or written) and the answer is stored in scripts/fixtures/mcSell/<name>.json;
//   replay: no network at all (photos are a plain placeholder), the stored answer is returned for the same call.
// Used by scripts/mcSellRecord.mjs (record), scripts/mcSellResultsCheck.mjs (the regression check) and scripts/mcSellShots.mjs (the screenshots).
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
export const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
process.chdir(ROOT); process.env.CURTAIN_CREW_CODE = process.env.CURTAIN_CREW_CODE || "fixture-crew-code"; process.env.LAUNCH_STAGE = "2";
for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY"]) delete process.env[k];
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
export const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export const puppeteer = createRequire(path.join(ROOT, "package.json"))("puppeteer-core");
const { mintCrewCookieValue } = await imp("lib/_crew.js");
export const CREW = "gas_crew=" + mintCrewCookieValue();
const CP = (await imp("api/crewPage.js")).default, MC = (await imp("api/marketCheck.js")).default, SELL = (await imp("api/sell.js")).default;
async function call(handler, url) { const res = { h: {}, code: 200, body: "", setHeader(k, v) { this.h[k.toLowerCase()] = v; return this; }, getHeader(k) { return this.h[k.toLowerCase()]; }, removeHeader() {}, writeHead(c) { this.code = c; return this; }, status(c) { this.code = c; return this; }, send(x) { this.body = String(x); return this; }, end(x) { this.body = String(x || ""); return this; }, json(o) { this.body = JSON.stringify(o); return this; } };
  const u = new URL(url, "https://goasksam.com"); await handler({ method: "GET", url, query: Object.fromEntries(u.searchParams), headers: { cookie: CREW, host: "goasksam.com" }, socket: {}, body: null }, res); return res; }
// the served text of an address: the live handler's own, or the preview's (which wraps that same text)
export async function pageOf(url) {
  const u = new URL(url, "https://goasksam.com"), P = { "/preview/market-check": "preview-market-check", "/preview/sell": "preview-sell", "/preview/find": "preview-find", "/preview/market-check/onebox.js": "preview-onebox-js" }[u.pathname];
  if (P) { const q = new URLSearchParams(u.search); q.set("page", P); return call(CP, "/api/crewPage?" + q.toString()); }
  if (u.pathname === "/market-check") return call(MC, url); if (u.pathname === "/sell") return call(SELL, url); return null;
}
const keyOf = (method, u, body) => { let b = body || ""; try { const j = JSON.parse(b); for (const k of Object.keys(j)) if (/^(sid|session|sessionId|nonce|ts|t|at|clientTime|visitor|vid|aid|trace|anonId|searchId)$/i.test(k)) delete j[k]; b = JSON.stringify(j, Object.keys(j).sort()); } catch {} return `${method} ${u.pathname}${u.search} ${b}`; };
const secret = svc => { try { return execFileSync("security", ["find-generic-password", "-s", svc, "-w"], { encoding: "utf8" }).trim(); } catch { return ""; } };
export const probeKey = () => secret("goasksam-probe"), bypassKey = () => secret("goasksam-bypass");
// stored keys are re-keyed on load with the same rule as a live call, so a key written by an older rule still matches
export function loadFixtures(name) { const f = path.join(ROOT, "scripts/fixtures/mcSell", name + ".json"); if (!fs.existsSync(f)) return {}; const raw = JSON.parse(fs.readFileSync(f, "utf8")), out = {}; for (const [k, v] of Object.entries(raw)) { const i = k.indexOf(" "), j = k.indexOf(" ", i + 1), u = new URL(k.slice(i + 1, j < 0 ? undefined : j), "https://goasksam.com"); out[keyOf(k.slice(0, i), u, j < 0 ? "" : k.slice(j + 1))] = v; } return out; }
export function saveFixtures(name, data) { const d = path.join(ROOT, "scripts/fixtures/mcSell"); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, name + ".json"), JSON.stringify(data, null, 0)); }
const IMG = '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="100%" height="100%" fill="#b9c3cc"/></svg>';
const STATIC = { ".js": "application/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".json": "application/json", ".ico": "image/x-icon", ".woff2": "font/woff2" };
export async function open(b, url, { width = 1440, height = 900, fixtures = {}, record = null, images = "stub", init = null, settle = 2500, wait = null, rewrite = null } = {}) {
  const p = await b.newPage(); await p.setViewport({ width, height }); p._err = []; p._calls = []; p._missed = [];
  p.on("pageerror", e => p._err.push(String(e).slice(0, 200)));
  await p.evaluateOnNewDocument("try{localStorage.clear();sessionStorage.clear();}catch(e){}window.GAS_WAIT_SCALE=0.05;" + (init ? "(" + init.toString() + ")()" : ""));
  await p.setRequestInterception(true);
  p.on("request", async r => { try { const u = new URL(r.url()), m = r.method();
    if (u.host !== "goasksam.com") { if (r.resourceType() === "image") return images === "net" ? r.continue() : r.respond({ status: 200, contentType: "image/svg+xml", body: IMG }); return images === "net" && /fonts\.(googleapis|gstatic)\.com/.test(u.host) ? r.continue() : r.respond({ status: 204, body: "" }); }
    if (r.isNavigationRequest() || u.pathname === "/preview/market-check/onebox.js") { const o = await pageOf(u.pathname + u.search); if (o) return r.respond({ status: o.code, contentType: o.h["content-type"] || "text/html", body: rewrite && u.pathname.startsWith("/preview/") && !/\.js$/.test(u.pathname) ? rewrite(o.body) : o.body }); }
    if (/^\/api\//.test(u.pathname)) { const k = keyOf(m, u, r.postData()); p._calls.push(k);
      if (m === "OPTIONS") return r.respond({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" }, body: "" });
      if (fixtures[k]) return r.respond({ status: fixtures[k].status, contentType: fixtures[k].contentType, headers: { "access-control-allow-origin": "*" }, body: fixtures[k].body });
      if (record) { const res = await fetch("https://goasksam.com" + u.pathname + u.search, { method: m, headers: { "content-type": "application/json", "x-ops-key": record.key, ...(record.bypass ? { "x-vercel-protection-bypass": record.bypass } : {}), "user-agent": "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/124 Safari/537.36" }, body: m === "GET" ? undefined : r.postData() }), body = await res.text(); fixtures[k] = { status: res.status, contentType: res.headers.get("content-type") || "application/json", body }; return r.respond({ status: res.status, contentType: fixtures[k].contentType, headers: { "access-control-allow-origin": "*" }, body }); }
      p._missed.push(k); return r.respond({ status: 200, contentType: "application/json", body: "{}" }); }
    const loc0 = /^\/obx\.[^/]+\/onebox\.js$/.test(u.pathname) ? "/js/onebox.js" : u.pathname.replace(/^\/js\.[^/]+\//, "/js/"), f = path.join(ROOT, "public", loc0);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return r.respond({ status: 200, contentType: STATIC[path.extname(f)] || "application/octet-stream", body: fs.readFileSync(f) });
    return r.respond({ status: 404, body: "" }); } catch (e) { try { r.respond({ status: 500, body: String(e.message) }); } catch {} } });
  await p.goto("https://goasksam.com" + url, { waitUntil: "domcontentloaded" }); if (wait) await wait(p); await new Promise(r => setTimeout(r, settle)); return p;
}
export const launch = () => puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
