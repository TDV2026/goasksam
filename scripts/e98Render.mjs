// Renders the real Market Check page (api/marketCheck.js + public/js/onebox.js from the working tree, or from E98_ROOT) in Chrome with the engine's answer fixed by the fixture; no network.
// Used by e98Shots.mjs (PNGs) and underlineCheck.mjs (the class check).
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
export const ROOT = path.resolve(process.env.E98_ROOT || new URL("..", import.meta.url).pathname);
export const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export async function startBrowser() { process.env.LAUNCH_STAGE = "2"; process.env.SUPABASE_URL = "https://example.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "x"; globalThis.fetch = async () => { throw new Error("no network"); }; return puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] }); }
const mcHtml = {};
// crew: render the page as the signed crew cookie would (the palette bar showed for the crew only before Oct 28 2026)
export async function crewCookie() { process.env.CURTAIN_CREW_CODE = process.env.CURTAIN_CREW_CODE || "e98-test-code"; const { mintCrewCookieValue } = await import(pathToFileURL(path.join(ROOT, "lib/_crew.js")).href); return "gas_crew=" + mintCrewCookieValue(); }
export async function pageHtml(file, url, crew) {
  const { default: h } = await import(pathToFileURL(path.join(ROOT, file)).href), cookie = crew ? await crewCookie() : "";
  return await new Promise(r => { const hdr = {}, res = { setHeader(k, v) { hdr[k] = v; }, getHeader() {}, status() { return res; }, send(x) { r(String(x)); return res; }, end(x) { r(String(x || "")); return res; }, json(x) { r(JSON.stringify(x)); return res; }, redirect() { r(""); return res; } }; Promise.resolve(h({ method: "GET", url, query: Object.fromEntries(new URL("https://goasksam.com" + url).searchParams), headers: { host: "goasksam.com", cookie, "user-agent": "check" }, socket: {} }, res)).catch(() => r("")); setTimeout(() => r(""), 8000); });
}
async function mcPageHtml(crew) { const k = crew ? "crew" : "pub"; return mcHtml[k] || (mcHtml[k] = await pageHtml("api/marketCheck.js", "/market-check", crew)); }
export async function openMC(browser, fx, width, opts = {}) {
  const html = await mcPageHtml(opts.crew), p = await browser.newPage(); await p.setViewport({ width, height: 900, deviceScaleFactor: 1 }); p._posts = [];
  await p.evaluateOnNewDocument((st, sc) => { if (sc) window.GAS_WAIT_SCALE = sc; window.gasTrack = () => {}; try { for (const [k, v] of Object.entries(st || {})) localStorage.setItem(k, v); } catch (e) {} }, opts.storage || null, opts.scale || 0);
  if (opts.crew) await p.setCookie({ name: "gas_crew", value: (await crewCookie()).split("=")[1], domain: "goasksam.com", path: "/" });
  await p.setRequestInterception(true);
  p.on("request", r => { const u = new URL(r.url());
    if (u.host === "goasksam.com" && r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html", body: html });
    const loc = /^\/obx\.[^/]+\/onebox\.js$/.test(u.pathname) ? "public/js/onebox.js" : (/^\/js(?:\.[^/]+)?\/([\w.-]+\.js)$/.exec(u.pathname) ? "public/js/" + /^\/js(?:\.[^/]+)?\/([\w.-]+\.js)$/.exec(u.pathname)[1] : null);
    if (u.host === "goasksam.com" && loc && fs.existsSync(path.join(ROOT, loc))) return r.respond({ status: 200, contentType: "application/javascript", body: fs.readFileSync(path.join(ROOT, loc), "utf8") });
    if (u.host === "goasksam.com" && u.pathname === "/api/sellerDecision") { p._posts.push(1); return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(fx.respond ? fx.respond(p._posts.length) : { status: "one_box", ...(p._posts.length > 1 && fx.second ? { ...fx.d, ...fx.second } : fx.d) }) }); }
    if (u.host === "goasksam.com" && /^\/api\//.test(u.pathname)) return r.respond({ status: 200, contentType: "application/json", body: "{}" });
    if (u.host !== "goasksam.com") return r.respond({ status: 204, body: "" }); r.continue(); });
  await p.goto("https://goasksam.com/market-check", { waitUntil: "networkidle2" }).catch(() => {});
  await p.evaluate(() => { if (!window.GAS_UPDATED) window.GAS_UPDATED = "Oct 28, 2026"; });   // offline the page cannot read the last-ingest date
  await p.type("#ob-input", fx.typed); await p.keyboard.press("Enter"); await new Promise(r => setTimeout(r, 4200));
  if (fx.miles) { await p.type("#ob-miles", fx.miles); await p.keyboard.press("Enter"); await new Promise(r => setTimeout(r, 1800)); }
  return p;
}

// ANY PAGE, as the public or as the crew: the real handler's HTML, the page's own scripts and stylesheet from public/, nothing else (no network). Used by the crew-versus-public colour check and its screenshots.
export async function openAny(browser, file, url, width, opts = {}) {
  const html = await pageHtml(file, url, opts.crew), p = await browser.newPage(); await p.setViewport({ width, height: 900, deviceScaleFactor: 1 });
  await p.evaluateOnNewDocument(() => { window.gasTrack = () => {}; });
  if (opts.crew) await p.setCookie({ name: "gas_crew", value: (await crewCookie()).split("=")[1], domain: "goasksam.com", path: "/" });
  await p.setRequestInterception(true);
  p.on("request", r => { const u = new URL(r.url());
    if (u.host === "goasksam.com" && r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html", body: html });
    const m = /^\/(?:obx\.[^/]+|js(?:\.[^/]+)?)\/([\w.-]+\.js)$/.exec(u.pathname), loc = m ? "public/js/" + m[1] : u.pathname === "/styles.css" ? "public/styles.css" : null;
    if (u.host === "goasksam.com" && loc && fs.existsSync(path.join(ROOT, loc))) return r.respond({ status: 200, contentType: /\.css$/.test(loc) ? "text/css" : "application/javascript", body: fs.readFileSync(path.join(ROOT, loc), "utf8") });
    if (u.host === "goasksam.com" && /^\/api\//.test(u.pathname)) return r.respond({ status: 200, contentType: "application/json", body: "{}" });
    if (u.host !== "goasksam.com") return r.respond({ status: 204, body: "" }); r.continue(); });
  await p.goto("https://goasksam.com" + url, { waitUntil: "networkidle2" }).catch(() => {});
  await new Promise(r => setTimeout(r, 800)); return p;
}
