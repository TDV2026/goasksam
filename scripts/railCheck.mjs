// ONE LEFT RAIL (Sam's new Buy 1f block item 8, Oct 21 2026; Lane C): the shared rail (lib/appShell.js railOpenHtml) must look the
// same on every page that draws it, signed out and as crew (the signed-in look: the brand palette). Each page's real handler is
// rendered in-process, once without a session and once with a signed crew cookie (a fixture code), and the rail's computed
// background, width, padding, item height, type and spacing are compared with Buy's. Before this check the crew rail was cream on
// Buy, Market Check and Sell but the default green on Tasks, How Sam decides and For business. No network.
//   node scripts/railCheck.mjs     exit 1 on any failure.   (run from the repo root)
import puppeteer from "puppeteer-core";
import { pathToFileURL } from "node:url";
import path from "node:path";
process.env.LAUNCH_STAGE = "2"; process.env.CURTAIN_CREW_CODE = "fixture-crew-code-for-the-rail-check";
const { mintCrewCookieValue } = await import("../lib/_crew.js");
const crewCookie = "gas_crew=" + mintCrewCookieValue();
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const GATED = new Set(["/business"]);   // For business answers nothing to a signed-out visitor before its launch switch: compared as crew only
const PAGES = [["buy", "/buy", {}], ["tasksPage", "/tasks", {}], ["tasksPage", "/tasks/mine", { app: "1" }], ["marketCheck", "/market-check", {}], ["howSamDecides", "/how-sam-decides", {}], ["business", "/business", {}]];
const render = async (mod, url, query, cookie) => {
  const { default: h } = await import(pathToFileURL(path.join(ROOT, "api", mod + ".js")).href);
  return await new Promise(resolve => { const res = { setHeader() {}, getHeader() {}, status() { return res; }, send(b) { resolve(String(b)); return res; }, end(b) { resolve(String(b || "")); return res; }, json(o) { resolve(JSON.stringify(o)); return res; }, writeHead() { return res; }, write() {}, redirect() { resolve(""); return res; } };
    Promise.resolve(h({ method: "GET", url, query, headers: { host: "goasksam.com", cookie }, socket: {} }, res)).catch(() => resolve("")); setTimeout(() => resolve(""), 20000); });
};
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new" });
const look = {};
for (const crew of [false, true]) {
  for (const [mod, url, q] of PAGES) {
    const html = await render(mod, url, crew ? { ...q, _crew: "1" } : q, crew ? crewCookie : "");
    const key = (crew ? "crew " : "out  ") + url;
    if (!crew && GATED.has(url) && !html) continue;
    if (!/id="gas-rail"/.test(html)) { ok(false, key + ": the page draws no shared rail (handler returned " + html.length + " bytes)"); continue; }
    const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 });
    await p.setRequestInterception(true); p.on("request", r => /fonts\.(googleapis|gstatic)\.com/.test(r.url()) ? r.continue() : r.abort());
    await p.setContent(html, { waitUntil: "domcontentloaded" }).catch(() => {});
    look[key] = await p.evaluate(() => { const r = document.getElementById("gas-rail"), cs = getComputedStyle(r), it = r.querySelector(".gas-navitem"), ics = getComputedStyle(it), act = r.querySelector(".gas-navitem.active"), lg = getComputedStyle(r.querySelector(".gas-logo"));
      return { bg: cs.backgroundColor, w: Math.round(r.getBoundingClientRect().width), pad: cs.padding, border: cs.borderRightColor, logo: lg.fontSize + " " + lg.fontFamily.slice(0, 20), item: [ics.fontSize, ics.fontFamily.slice(0, 20), ics.padding, Math.round(it.getBoundingClientRect().height), ics.color].join("|"), active: act ? getComputedStyle(act).backgroundColor : null }; });
    await p.close();
  }
}
await b.close();
for (const crew of [false, true]) {
  const ref = look[(crew ? "crew " : "out  ") + "/buy"];
  ok(!!ref, (crew ? "crew" : "signed out") + ": Buy's rail is the reference");
  for (const [, url] of PAGES) { const k = (crew ? "crew " : "out  ") + url, x = look[k]; if (!x || !ref) continue;
    for (const f of Object.keys(ref)) ok(x[f] === ref[f], `${k}: rail ${f} matches Buy's (${x[f]} against ${ref[f]})`); }
}
console.log(`railCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
