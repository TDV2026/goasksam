// findHeaderCheck (Lane S, Nov 17 2026): Find's results header at 1280 and 1440 wide, through the live handler (NEW_DESIGN on, crew cookie) in Chrome: every control in the header ("New search", the live match count) lies inside the window, nothing clipped, no sideways scroll.
//   node scripts/findHeaderCheck.mjs [--shots]     offline; Chrome
import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (!fs.existsSync(CHROME)) { console.log("findHeaderCheck: SKIP no Chrome"); process.exit(0); }
process.chdir(ROOT); process.env.CURTAIN_CREW_CODE = process.env.CURTAIN_CREW_CODE || "fixture-crew-code"; process.env.LAUNCH_STAGE = "2"; process.env.NEW_DESIGN = "1";
for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY"]) delete process.env[k];
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const puppeteer = createRequire(path.join(ROOT, "package.json"))("puppeteer-core");
const { mintCrewCookieValue } = await imp("lib/_crew.js"), { freshenEndTimes } = await imp("scripts/_pinEndTimes.mjs");
const FIX = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/fixtures/findSl65Search.json"), "utf8")); freshenEndTimes(FIX, Date.now());
const SSE = "event: done\ndata: " + JSON.stringify({ reply: "", turns: 1, state: { filters: { year_min: 2005, year_max: 2005, make: "Mercedes-Benz", model: "SL-Class", trim: "SL65 AMG" } }, meta: { ...Object.fromEntries(Object.entries(FIX).filter(([k]) => k !== "cards")), live: 1 }, cards: FIX.cards.slice(0, 1) }) + "\n\n";
const buy = (await imp("api/buy.js")).default; let pass = 0, fail = 0; const out = []; const ok = (c, m) => { if (c) pass++; else { fail++; out.push("FAIL " + m); } };
const { encodeCar } = await imp("lib/carToken.js"), TOK = encodeCar({ raw: "2005 mercedes-benz sl65 amg", year: 2005, make: "Mercedes-Benz", model: "SL-Class", trim: "SL65 AMG", confidence: "high" });
const U = process.argv.includes("--bar") ? "/find?car=" + encodeURIComponent(TOK) : "/find?q=" + encodeURIComponent("2005 mercedes-benz sl65 amg");
const res = { code: 200, h: {}, body: "", setHeader(k, v) { this.h[k.toLowerCase()] = String(v); }, getHeader() {}, removeHeader() {}, status(c) { this.code = c; return this; }, send(b) { this.body = String(b); return this; }, json(b) { this.body = JSON.stringify(b); return this; }, end(b) { if (b) this.body = String(b); return this; }, writeHead() {} };
const log = console.log, err = console.error; console.log = () => {}; console.error = () => {};
try { await buy({ method: "GET", headers: { host: "goasksam.com", cookie: "gas_crew=" + mintCrewCookieValue() }, query: Object.fromEntries(new URL(U, "https://x").searchParams), url: U, socket: {} }, res); } finally { console.log = log; console.error = err; }
const STATIC = { ".js": "application/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json", ".ico": "image/x-icon", ".woff2": "font/woff2" };
const IMG = '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="100%" height="100%" fill="#b9c3cc"/></svg>';
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"], ignoreDefaultArgs: ["--hide-scrollbars"] });
async function open(width) {
  const p = await b.newPage(); await p.setViewport({ width, height: 900 }); await p.setRequestInterception(true);
  p.on("request", async r => { try { const u = new URL(r.url());
    if (u.host !== "goasksam.com") return r.resourceType() === "image" ? r.respond({ status: 200, contentType: "image/svg+xml", body: IMG }) : r.respond({ status: 200, body: "" });
    if (r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html; charset=utf-8", body: res.body });
    if (r.method() === "OPTIONS") return r.respond({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" }, body: "" });
    if (/^\/api\//.test(u.pathname)) { if (/buySearch$/.test(u.pathname) && r.method() === "POST") { let a = {}; try { a = JSON.parse(r.postData() || "{}"); } catch {} const json = o => r.respond({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(o) });
        if (a.action === "parse") return json({ label: "2005 Mercedes-Benz SL65 AMG", chips: [] }); if (a.action === "chat" || a.action === "rerun") return r.respond({ status: 200, contentType: "text/event-stream; charset=utf-8", headers: { "access-control-allow-origin": "*" }, body: SSE }); return json({ items: [] }); }
      return r.respond({ status: 200, contentType: "application/json", body: "{}" }); }
    const loc = u.pathname.replace(/^\/js\.[^/]+\//, "/js/").replace(/^\/obx\.[^/]+\//, "/js/"), f = path.join(ROOT, "public", loc);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return r.respond({ status: 200, contentType: STATIC[path.extname(f)] || "application/octet-stream", body: fs.readFileSync(f) });
    return r.respond({ status: 404, body: "" }); } catch (e) { try { r.respond({ status: 500, body: String(e.message) }); } catch {} } });
  await p.goto("https://goasksam.com" + U, { waitUntil: "domcontentloaded", timeout: 60000 }); await p.waitForSelector("article.car", { timeout: 20000 }).catch(() => {}); await new Promise(r => setTimeout(r, 1500)); return p;
}
// every visible control and the count line of the results header ("New search", "N live match(es)") with its box against the window
const HDR = () => { const W = document.documentElement.clientWidth, vis = e => !!(e.offsetWidth || e.offsetHeight), tx = e => (e.textContent || "").replace(/\s+/g, " ").trim();
  const els = [...document.querySelectorAll(".shead button,.shead a,.shead .srow2 > *,.shead-top *,.shead [class*=count],.shead [class*=live]")].filter(vis);
  const rows = els.map(e => { const r = e.getBoundingClientRect(); return { t: tx(e).slice(0, 40), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width) }; }).filter(x => x.t);
  let n = null; for (const e of document.querySelectorAll("#convo *")) { if (e.children.length === 0 && /live match/i.test(e.textContent) && vis(e)) { const r = e.getBoundingClientRect(); n = { t: tx(e), left: Math.round(r.left), right: Math.round(r.right) }; break; } }
  return { W, sw: document.documentElement.scrollWidth, rows, count: n, newSearch: rows.filter(x => /new search/i.test(x.t)) }; };
for (const w of [1280, 1440, 390]) {
  const p = await open(w), r = await p.evaluate(HDR);
  if (process.argv.includes("--shots")) { const d = path.join(ROOT, "docs/demo-run"); fs.mkdirSync(d, { recursive: true }); await p.screenshot({ path: path.join(d, "find-header-" + w + (process.argv.includes("--bar") ? "-bar" : "") + ".png"), clip: { x: 0, y: 0, width: w, height: 260 } }); }
  ok(r.sw <= r.W, w + ": no sideways scroll (" + r.sw + " vs " + r.W + ")");
  ok(r.rows.length > 0 && r.rows.every(x => x.right <= r.W - 8 && x.left >= 0), w + ": every header control lies inside the window with an 8 px margin " + JSON.stringify(r.rows.filter(x => x.right > r.W - 8 || x.left < 0)));
  ok(!r.count || (r.count.right <= r.W - 8 && r.count.left >= 0), w + ": the live match count lies inside the window " + JSON.stringify(r.count));
  console.log(w, JSON.stringify(r)); await p.close();
}
await b.close(); console.log(out.join("\n")); console.log("findHeaderCheck: " + pass + " pass, " + fail + " FAIL"); process.exit(fail ? 1 : 0);
