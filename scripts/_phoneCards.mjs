// PHONE CARDS (Lane E, Nov 12 2026). One probe for the class "a card on a phone breaks": a text block with a fixed height that clips its own words, something drawn over the words (a button over a text block, two labels over each other),
// an overlay that drops out of its image (a label meant to sit on the photo drawn under it), or a card in the email's dark mode laid in the page's light frame. Used by goLiveVisitorCheck's phone pass at 390 and 360.
// The page is drawn as it is served (the real handler's HTML), images are a flat placeholder, and nothing leaves the machine.
import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module";
const IMG = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="100%" height="100%" fill="#b9c3cc"/></svg>';
const STATIC = { ".js": "application/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".json": "application/json", ".ico": "image/x-icon", ".woff2": "font/woff2" };
export const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export async function launch(root) { const pup = createRequire(path.join(root, "package.json"))("puppeteer-core"); return pup.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] }); }

// Open served HTML at a width. `api(url, method, body)` may answer an /api call ({status, contentType, body}); anything else under /api is an empty object.
export async function openPage(b, root, url, body, { width = 390, scheme = "light", api = null, settle = 900, wait = null } = {}) {
  const p = await b.newPage(); await p.setViewport({ width, height: 900, isMobile: width < 500, deviceScaleFactor: 1 }); p._err = [];
  await p.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }]);
  p.on("pageerror", e => p._err.push(String(e.message).slice(0, 200)));
  await p.evaluateOnNewDocument(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) { /* none */ } });
  await p.setRequestInterception(true);
  p.on("request", async r => { try { const u = new URL(r.url());
    if (u.host !== "goasksam.com") return r.resourceType() === "image" ? r.respond({ status: 200, contentType: "image/svg+xml", body: IMG }) : r.respond({ status: 200, body: "" });
    if (r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html; charset=utf-8", body });
    if (r.method() === "OPTIONS") return r.respond({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" }, body: "" });
    if (/^\/api\//.test(u.pathname)) { const a = api && await api(u, r.method(), r.postData()); return r.respond(a || { status: /track/.test(u.pathname) ? 204 : 200, contentType: "application/json", body: /track/.test(u.pathname) ? "" : "{}" }); }
    if (r.resourceType() === "image") return r.respond({ status: 200, contentType: "image/svg+xml", body: IMG });
    const loc = u.pathname.replace(/^\/js\.[^/]+\//, "/js/").replace(/^\/obx\.[^/]+\//, "/js/").replace(/^\/dsk\.[^/]+\//, "/js/"), f = path.join(root, "public", loc);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return r.respond({ status: 200, contentType: STATIC[path.extname(f)] || "application/octet-stream", body: fs.readFileSync(f) });
    return r.respond({ status: 404, body: "" }); } catch (e) { try { r.respond({ status: 500, body: String(e.message) }); } catch { /* gone */ } } });
  await p.goto("https://goasksam.com" + url, { waitUntil: "domcontentloaded", timeout: 60000 });
  if (wait) await p.waitForSelector(wait, { timeout: 20000 }).catch(() => {});
  await new Promise(r => setTimeout(r, settle)); return p;
}

// The probe, run in the page. `sel` is the card (or section) to judge. Returns the facts; phoneProblems() turns them into sentences.
export async function probeCard(p, sel) {
  return p.evaluate(sel => {
    const root = document.querySelector(sel); if (!root) return { missing: true };
    const vis = e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 1 && r.height > 1 && s.visibility !== "hidden" && s.display !== "none" && +s.opacity !== 0; };
    const tx = e => (e.textContent || "").replace(/\s+/g, " ").trim();
    const box = e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom }; };
    const lum = c => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(c); if (!m) return null; if (m[4] !== undefined && +m[4] === 0) return null; const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(+m[1]) + .7152 * f(+m[2]) + .0722 * f(+m[3]); };
    const out = { clipped: [], overlaps: [], dropped: [], doubled: [], dark: [], overflowX: 0 };
    const all = [...root.querySelectorAll("*")].filter(e => !/^(SCRIPT|STYLE|NOSCRIPT|META|BR)$/.test(e.tagName));
    // 1. a block that holds words and clips them: a fixed or capped height with overflow hidden (or clip) and more content than box
    for (const e of all) { const s = getComputedStyle(e); if (!vis(e) || !tx(e)) continue; const cl = /hidden|clip/.test(s.overflowY); if (cl && e.scrollHeight > e.clientHeight + 1 && !/ellipsis/.test(s.textOverflow)) out.clipped.push({ cls: String(e.getAttribute("class") || e.tagName).slice(0, 40), text: tx(e).slice(0, 60), box: e.clientHeight, need: e.scrollHeight }); }
    // 2. words drawn over words: a leaf with its own text whose box cuts another leaf's (a button over a text block; two labels on top of each other)
    const leaves = all.filter(e => vis(e) && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && !e.closest("svg"));
    for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) { const a = leaves[i], c = leaves[j]; if (a.contains(c) || c.contains(a)) continue; const A = box(a), B = box(c), w = Math.min(A.r, B.r) - Math.max(A.x, B.x), h = Math.min(A.b, B.b) - Math.max(A.y, B.y); if (w > 3 && h > 3 && w * h > 0.2 * Math.min(A.w * A.h, B.w * B.h)) out.overlaps.push([tx(a).slice(0, 36), tx(c).slice(0, 36)]); }
    // 3. a label printed twice: the same words drawn by two visible elements of the card
    const seen = {}; for (const e of leaves) { const t = tx(e).toLowerCase(); if (t.length < 8) continue; (seen[t] = seen[t] || []).push(e); } for (const [t, es] of Object.entries(seen)) if (es.length > 1 && !es.some(e => e.closest("a,button,[role=button]"))) out.doubled.push(t.slice(0, 50));
    // 4. an overlay that drops out of its image: an absolutely placed element inside a photo wrapper must lie inside the photo
    for (const ph of root.querySelectorAll(".ph, [class*=photo], figure")) { const P = box(ph); if (P.w < 40 || P.h < 40) continue; for (const e of ph.querySelectorAll("*")) { const s = getComputedStyle(e); if (s.position !== "absolute" || !vis(e) || e.tagName === "IMG" || !tx(e)) continue; const B = box(e); if (B.x < P.x - 1 || B.r > P.r + 1 || B.y < P.y - 1 || B.b > P.b + 1) out.dropped.push({ cls: String(e.getAttribute("class") || e.tagName).slice(0, 30), text: tx(e).slice(0, 40), over: [Math.round(B.b - P.b), Math.round(P.y - B.y)] }); } }
    // 5. a card in the email's dark mode inside the page's light frame: a dark card background with a light page behind it
    for (const e of root.querySelectorAll(".gc-card, .gc-panel")) { const l = lum(getComputedStyle(e).backgroundColor); if (l !== null && l < 0.2) out.dark.push(String(e.getAttribute("class")).slice(0, 20)); }
    out.overflowX = Math.max(0, root.scrollWidth - root.clientWidth, document.documentElement.scrollWidth - innerWidth);
    return out;
  }, sel);
}
export function phoneProblems(f, where) {
  if (f.missing) return [`${where}: the card is not on the page`];
  const o = [];
  for (const c of f.clipped) o.push(`${where}: a text block clips its words (.${c.cls} is ${c.box}px for ${c.need}px of "${c.text}")`);
  for (const [a, b] of f.overlaps.slice(0, 3)) o.push(`${where}: "${a}" is drawn over "${b}"`);
  for (const t of f.doubled.slice(0, 3)) o.push(`${where}: "${t}" is printed twice`);
  for (const d of f.dropped) o.push(`${where}: the overlay "${d.text}" (.${d.cls}) drops out of its image`);
  for (const d of f.dark) o.push(`${where}: ${d} is drawn dark inside the page's light frame`);
  if (f.overflowX > 1) o.push(`${where}: the card is ${f.overflowX}px wider than the screen`);
  return o;
}

// FIND RESULTS (the shelled page for one stored search, the same answer scripts/findResultsCheck.mjs opens): the page is served by api/buy.js, the search's own calls are answered from the stored engine answer, nothing else leaves the machine.
export async function openFindResults(b, root, { width = 390, scheme = "light" } = {}) {
  const { pathToFileURL } = await import("node:url"), imp = f => import(pathToFileURL(path.join(root, f)).href);
  process.env.LAUNCH_STAGE = "2"; process.env.NEW_DESIGN = "all"; for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY"]) delete process.env[k];
  const { freshenEndTimes } = await imp("scripts/_pinEndTimes.mjs"), FIX = JSON.parse(fs.readFileSync(path.join(root, "scripts/fixtures/findSl65Search.json"), "utf8")); freshenEndTimes(FIX, Date.now());
  const DONE = JSON.stringify({ reply: "", turns: 1, state: { filters: { year_min: 2005, year_max: 2005, make: "Mercedes-Benz", model: "SL-Class", trim: "SL65 AMG" } }, meta: Object.fromEntries(Object.entries(FIX).filter(([k]) => k !== "cards")), cards: FIX.cards });
  const SSE = "event: done\ndata: " + DONE + "\n\n", URL_ = "/find?q=" + encodeURIComponent("2005 mercedes-benz sl65 amg"), buy = (await imp("api/buy.js")).default;
  const res = { code: 200, h: {}, body: "", setHeader(k, v) { this.h[k.toLowerCase()] = String(v); }, getHeader() {}, removeHeader() {}, status(c) { this.code = c; return this; }, send(x) { this.body = String(x); return this; }, json(x) { this.body = JSON.stringify(x); return this; }, end(x) { if (x) this.body = String(x); return this; } };
  const lg = console.log, er = console.error; console.log = () => {}; console.error = () => {};
  try { await buy({ method: "GET", headers: { host: "goasksam.com", cookie: "" }, query: { q: "2005 mercedes-benz sl65 amg" }, url: URL_, socket: {} }, res); } finally { console.log = lg; console.error = er; }
  const api = async (u, m, post) => { if (!/buySearch$/.test(u.pathname) || m !== "POST") return null; let a = {}; try { a = JSON.parse(post || "{}"); } catch { /* none */ }
    const json = o => ({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(o) });
    if (a.action === "parse") return json({ label: "2005 Mercedes-Benz SL65 AMG", chips: [] }); if (a.action === "chat" || a.action === "rerun") return { status: 200, contentType: "text/event-stream; charset=utf-8", headers: { "access-control-allow-origin": "*" }, body: SSE };
    if (a.action === "alerts_ready") return json({ ready: true, rule: "" }); return json({ items: [] }); };
  return openPage(b, root, URL_, res.body, { width, scheme, api, wait: "article.car", settle: 1500 });
}

// A LONGER LINE: every paragraph-like text block of the card (a p, or a div with only text, not a button, a link or a label) is given a second sentence, as an engine line can be. A block that clips it, or that a button then sits over, shows.
export const LONGER = " And a second sentence that is long enough to run onto three more lines on a phone.";
export async function stretchText(p, sel) { return p.evaluate((sel, add) => { let n = 0; for (const root of document.querySelectorAll(sel)) for (const e of root.querySelectorAll("p, div")) { if (e.children.length || !(e.textContent || "").trim() || e.closest("a,button,[role=button],h1,h2,h3,[class*=pill],[class*=lab],[class*=mlab]")) continue; if (getComputedStyle(e).display === "none") continue; e.textContent = e.textContent.trim() + add; n++; } return n; }, sel, LONGER); }
