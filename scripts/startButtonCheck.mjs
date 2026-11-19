// THE START PAGES' INPUT BOX AND SEND BUTTON (Sam, Oct 26 2026), rendered: Sell, Find and Market Check draw the SAME send button (the right arrow, the brand green
// rgb(18,63,51), 40 px, 12 px corners) and the SAME input box width (600 px at 1440; the phone width less the same gutters at 390), with no sideways scroll; Market Check
// keeps its microphone at both sizes and its two-line box (example plus helper); Sell has no microphone. The real page code in headless Chrome, assets from this checkout,
// no network.   node scripts/startButtonCheck.mjs
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
process.env.LAUNCH_STAGE = "2";
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY; delete process.env.SUPABASE_ANON_KEY;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const puppeteer = (await import(pathToFileURL(path.join(ROOT, "node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).href).catch(() => import("puppeteer-core"))).default;
const sp = await import("../lib/startPage.js");
// the shared definition itself
ok(sp.START_BOX_MAX === 600 && /\.gst-box\{[^}]*max-width:600px/.test(sp.START_CSS), "the shared start box is 600 px at most (one constant, in lib/startPage.js)");
ok(/\.gst-go\{width:40px;height:40px;border-radius:12px;background:#123F33/.test(sp.START_CSS), "the shared send button: 40 px, 12 px corners, the brand green");
ok(sp.startHtml({ ids: {} }).includes(sp.GO_ARROW_SVG), "the component's own arrow equals the exported one Sell draws");
const call = async (mod, url) => { const { default: h } = await import(pathToFileURL(path.join(ROOT, "api", mod + ".js")).href); const hd = {};
  return await new Promise(resolve => { const res = { setHeader(k, v) { hd[k.toLowerCase()] = v; }, getHeader() {}, status(c) { res.code = c; return res; }, send(x) { resolve(String(x)); return res; }, json(x) { resolve(JSON.stringify(x)); return res; }, end() { resolve(""); return res; } };
    Promise.resolve(h({ method: "GET", url, query: Object.fromEntries(new URL("http://x" + url).searchParams), headers: { host: "goasksam.com", cookie: "" }, socket: {} }, res)).catch(e => resolve("ERR " + e.message)); }); };
const sell = await (await import("../api/sellPage.js")).sellShellHtml({ headers: { host: "goasksam.com", cookie: "" }, query: {}, url: "/sell" });
const pages = { sell, find: await call("buy", "/find"), mc: await call("marketCheck", "/market-check") };
ok(/id="btn" class="gst-go"/.test(sell) && !/<button id="btn">/.test(sell), "Sell's send button is the shared .gst-go class (the old up-arrow button is gone)");
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
const measure = async (name, html, W) => {
  const p = await b.newPage(); await p.setViewport({ width: W, height: 900 }); await p.setRequestInterception(true);
  p.on("request", rq => { const u = new URL(rq.url()); if (u.host !== "goasksam.com") return rq.respond({ status: 204, body: "" });
    if (rq.url() === "https://goasksam.com/__page") return rq.respond({ status: 200, contentType: "text/html", body: html.replace("<head>", '<head><base href="https://goasksam.com/">') });
    if (/\.(js|css|woff2)$/.test(u.pathname)) { const f = path.join(ROOT, "public", u.pathname.replace(/^\/js\.[0-9a-z]+\//, "/js/").replace(/^\/styles\.[0-9a-z]+\.css$/, "/styles.css")); if (fs.existsSync(f)) return rq.respond({ status: 200, contentType: /\.js$/.test(f) ? "application/javascript" : /\.css$/.test(f) ? "text/css" : "font/woff2", body: fs.readFileSync(f) }); }
    if (/^\/(api)/.test(u.pathname)) return rq.respond({ status: 200, contentType: "application/json", body: "{}" });
    rq.continue(); });
  await p.goto("https://goasksam.com/__page", { waitUntil: "networkidle2", timeout: 60000 }).catch(() => {}); await new Promise(r => setTimeout(r, 900));
  const m = await p.evaluate(() => { const box = document.querySelector(".gst-box, #input-box"), btn = document.querySelector(".gst-go"), mic = document.querySelector(".gst-mic:not([hidden]), [data-gst-mic]:not([hidden])"), cs = getComputedStyle(btn), r = box.getBoundingClientRect(), br = btn.getBoundingClientRect(), p0 = btn.querySelector("path");
    return { boxW: Math.round(r.width), boxL: Math.round(r.left), boxR: Math.round(innerWidth - r.right), bw: Math.round(br.width), bh: Math.round(br.height), radius: cs.borderRadius, bg: cs.backgroundColor, d: p0 && p0.getAttribute("d"), mic: !!mic, micShown: !!(mic && mic.getBoundingClientRect().width > 0), hs: document.documentElement.scrollWidth > innerWidth + 1, help: !!document.querySelector(".gst-help") }; });
  await p.close(); return m;
};
const R = {};
for (const W of [1440, 390]) for (const [n, h] of Object.entries(pages)) R[n + W] = await measure(n, h, W);
await b.close();
for (const W of [1440, 390]) {
  const a = R["sell" + W], f = R["find" + W], m = R["mc" + W];
  // (Oct 26 2026) Find, Market Check and the new Sell draw the one-line 960 box (scripts/homeTightenCheck.mjs checks all four); this check still builds the OLD Sell wizard, whose own box stays 600.
  ok(f.boxW === m.boxW, `[${W}] Find and Market Check boxes are the same width (find ${f.boxW}, market check ${m.boxW})`);
  if (W === 1440) ok(a.boxW === 600, "[1440] the box is 600 px");
  else ok(f.boxL === m.boxL && f.boxR === m.boxR && f.boxL > 0, `[390] the same side gutters on all three (left ${a.boxL}/${f.boxL}/${m.boxL}, right ${a.boxR}/${f.boxR}/${m.boxR})`);
  const same = k => a[k] === f[k] && f[k] === m[k];
  ok(same("bw") && same("bh") && same("radius") && same("bg") && same("d") && a.bw === 40 && a.radius === "12px" && a.bg === "rgb(18, 63, 51)" && a.d === "M5 12h14M13 6l6 6-6 6", `[${W}] the same send button: size, corners, green and right arrow (${JSON.stringify([a.bw, a.bh, a.radius, a.bg, a.d])} | ${JSON.stringify([m.bw, m.bh, m.radius, m.bg, m.d])})`);
  ok(m.mic && m.help && !a.mic, `[${W}] Market Check keeps its microphone and two-line box; Sell has no microphone`);
  ok(!a.hs && !f.hs && !m.hs, `[${W}] no sideways scroll on any of the three`);
}
console.log(`startButtonCheck: ${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0);
