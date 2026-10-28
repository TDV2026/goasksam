// Renders the real Market Check page (api/marketCheck.js + public/js/onebox.js from the working tree, or from E98_ROOT) in Chrome with the engine's answer fixed by the fixture; no network.
// Used by e98Shots.mjs (PNGs) and underlineCheck.mjs (the class check).
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
export const ROOT = path.resolve(process.env.E98_ROOT || new URL("..", import.meta.url).pathname);
export const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export async function startBrowser() { process.env.LAUNCH_STAGE = "2"; process.env.SUPABASE_URL = "https://example.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "x"; globalThis.fetch = async () => { throw new Error("no network"); }; return puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] }); }
let mcHtml = null;
async function mcPageHtml() {
  if (mcHtml) return mcHtml;
  const { default: h } = await import(pathToFileURL(path.join(ROOT, "api/marketCheck.js")).href);
  return mcHtml = await new Promise(r => { const res = { setHeader() {}, getHeader() {}, status() { return res; }, send(x) { r(String(x)); return res; }, end(x) { r(String(x || "")); return res; } }; h({ method: "GET", url: "/market-check", query: {}, headers: { host: "goasksam.com", cookie: "" }, socket: {} }, res); });
}
export async function openMC(browser, fx, width) {
  const html = await mcPageHtml(), p = await browser.newPage(); await p.setViewport({ width, height: 900, deviceScaleFactor: 1 }); p._posts = [];
  await p.evaluateOnNewDocument(() => { window.gasTrack = () => {}; });
  await p.setRequestInterception(true);
  p.on("request", r => { const u = new URL(r.url());
    if (u.host === "goasksam.com" && r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html", body: html });
    const loc = /^\/obx\.[^/]+\/onebox\.js$/.test(u.pathname) ? "public/js/onebox.js" : (/^\/js(?:\.[^/]+)?\/([\w.-]+\.js)$/.exec(u.pathname) ? "public/js/" + /^\/js(?:\.[^/]+)?\/([\w.-]+\.js)$/.exec(u.pathname)[1] : null);
    if (u.host === "goasksam.com" && loc && fs.existsSync(path.join(ROOT, loc))) return r.respond({ status: 200, contentType: "application/javascript", body: fs.readFileSync(path.join(ROOT, loc), "utf8") });
    if (u.host === "goasksam.com" && u.pathname === "/api/sellerDecision") { p._posts.push(1); return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "one_box", ...(p._posts.length > 1 && fx.second ? { ...fx.d, ...fx.second } : fx.d) }) }); }
    if (u.host === "goasksam.com" && /^\/api\//.test(u.pathname)) return r.respond({ status: 200, contentType: "application/json", body: "{}" });
    if (u.host !== "goasksam.com") return r.respond({ status: 204, body: "" }); r.continue(); });
  await p.goto("https://goasksam.com/market-check", { waitUntil: "networkidle2" }).catch(() => {});
  await p.evaluate(() => { if (!window.GAS_UPDATED) window.GAS_UPDATED = "Oct 28, 2026"; });   // offline the page cannot read the last-ingest date
  await p.type("#ob-input", fx.typed); await p.keyboard.press("Enter"); await new Promise(r => setTimeout(r, 4200));
  if (fx.miles) { await p.type("#ob-miles", fx.miles); await p.keyboard.press("Enter"); await new Promise(r => setTimeout(r, 1800)); }
  return p;
}
