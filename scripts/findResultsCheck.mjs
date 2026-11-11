// findResultsCheck (Lane E, Nov 10 2026, go live held item: Find results in the new shell), the mcSellResultsCheck pattern applied to Find.
// WHAT IT DOES: the Find results for one search (the 2005 Mercedes-Benz SL65 AMG, the stored engine answer scripts/fixtures/findSl65Search.json) are opened twice in Chrome from the SAME answer, with no network:
//   TODAY  the page as /find?q= answers now (NEW_DESIGN off)
//   SHELL  the page as /find?q= answers with NEW_DESIGN on: today's results inside the new header, the rail (New search, Recent searches) and the footer
// and the results (everything in #convo) must be the same, at 1440 and 390: every heading, every figure, every button and link (same text, same address), every input, the whole text, and the computed style of EVERY element
// inside the results, so a rule that restyles a results element fails. Then the shell is checked: the new header, the rail with New search and Recent searches (drawn from the search history the page already keeps), the footer
// with How Sam decides, no old navigation, the landing hidden (the route serves the RESULTS, not the landing), no horizontal overflow, no page error.
// MUTANTS (each must fail): a card hidden by one CSS rule, a results element restyled, a link dropped, a heading removed, a container pushed past the screen, the landing shown instead of the results.
//   node scripts/findResultsCheck.mjs [--mutants]     offline; Chrome; about a minute
import fs from "node:fs"; import path from "node:path"; import { execFileSync } from "node:child_process"; import { createRequire } from "node:module"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (!fs.existsSync(CHROME)) { console.log("findResultsCheck: SKIP no Chrome"); process.exit(0); }
if (process.argv.includes("--mutants")) {
  const f = "lib/preview/mcSellPreview.js";
  const MUT = [
    ["the saved searches dropped from the signed in rail", '<div id="searches"></div>', '<div id="searches-x"></div>'],
    ["Before it ends dropped from the signed in rail", "box.innerHTML = html + alertsRailHtml();", "box.innerHTML = html;"],
    ["the shared Recent searches dropped", '<div id="gas-recent-list"></div>', '<div id="gas-recent-list-x"></div>'],
    ["a card hidden by one CSS rule", "export const RESULTS_SHELL_CSS = `", "export const RESULTS_SHELL_CSS = `#convo article.car{display:none}"],
    ["a results element restyled", "export const RESULTS_SHELL_CSS = `", "export const RESULTS_SHELL_CSS = `#convo article.car a{color:#c00!important;font-size:21px!important}"],
    ["a container pushed past the screen", "export const RESULTS_SHELL_CSS = `", "export const RESULTS_SHELL_CSS = `#convo{width:3000px!important}"],
    ["the New search handler dropped (the page's own button resets in place again)", "location.assign(L);", "void 0;"],
    ["the results column not fitted below the header (the window scrolls to the bottom search box)", ".buymain{height:calc(100dvh - var(--gas-hdr,76px))!important;", ".buymain{"],
    ["empty skeleton cards shown while the search runs", "var t2 = setTimeout(el.stillFinding, 20000);", "el.innerHTML += '<article class=skel></article><article class=skel></article>'; var t2 = setTimeout(el.stillFinding, 20000);"],
    ["a figure printed while the search runs", "esc(window.GAS_WAIT.find)", "esc(window.GAS_WAIT.find + ' 14 sales so far')"],
    ["a venue name printed while the search runs", "esc(window.GAS_WAIT.find)", "esc('Sam is searching Bring a Trailer for your car')"],
    ["the height above the page not published before the page loads (a phone's column is the desktop's height at the focus)", "<script>${HDR_JS}</script><div class=\"mshell\">", "<div class=\"mshell\">"],
    ["the phone's saved searches bar left out of the height above the page", "(h.offsetHeight+(m?m.offsetHeight:0))", "h.offsetHeight"],
    ["New search drawn twice while the search runs (the rail's and the page's own)", "@media (min-width:861px){.msg.searching .shead-new{visibility:hidden}}", ""],
    ["a link dropped", "export const RAIL_JS = `(function(){", "export const RAIL_JS = `(function(){setTimeout(function(){var a=document.querySelector(\"#convo article.car a[href]\");if(a)a.parentNode.removeChild(a);},900);"],
    ["a heading removed", "export const RAIL_JS = `(function(){", "export const RAIL_JS = `(function(){setTimeout(function(){var h=document.querySelector(\"#convo h2,#convo h3\");if(h)h.parentNode.removeChild(h);},900);"]
  ];
  let bad = 0;
  for (const [name, from, to, file] of MUT) {
    const P = path.join(ROOT, file || f), orig = fs.readFileSync(P, "utf8");
    if (!orig.includes(from)) { console.log("MUTANT NOT APPLICABLE (source changed): " + name); bad++; continue; }
    let code = 0; try { fs.writeFileSync(P, orig.replace(from, () => to)); try { execFileSync("node", [fileURLToPath(import.meta.url)], { stdio: "pipe", timeout: 240000 }); } catch (e) { code = e.status || 1; } } finally { fs.writeFileSync(P, orig); }
    console.log((code ? "caught   " : "MISSED   ") + "without " + name); if (!code) bad++;
  }
  console.log(bad ? "findResultsCheck mutants: " + bad + " not caught" : "findResultsCheck mutants: all " + MUT.length + " caught"); process.exit(bad ? 1 : 0);
}
let pass = 0, fail = 0; const out = []; const ok = (c, m) => { if (c) pass++; else { fail++; out.push("FAIL " + m); } };
process.env.LAUNCH_STAGE = "2"; delete process.env.CURTAIN_SEALED; delete process.env.NEW_DESIGN;
for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY"]) delete process.env[k];
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const puppeteer = createRequire(path.join(ROOT, "package.json"))("puppeteer-core");
const { freshenEndTimes } = await imp("scripts/_pinEndTimes.mjs");
const FIX = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/fixtures/findSl65Search.json"), "utf8")), NOW = Date.now(); freshenEndTimes(FIX, NOW);
const CHAT_DONE = JSON.stringify({ reply: "", turns: 1, state: { filters: { year_min: 2005, year_max: 2005, make: "Mercedes-Benz", model: "SL-Class", trim: "SL65 AMG" } }, meta: Object.fromEntries(Object.entries(FIX).filter(([k]) => k !== "cards")), cards: FIX.cards });
const SSE = "event: done\ndata: " + CHAT_DONE + "\n\n";
const buy = (await imp("api/buy.js")).default, URL_ = "/find?q=" + encodeURIComponent("2005 mercedes-benz sl65 amg");
async function html(on) {
  if (on) process.env.NEW_DESIGN = "all"; else delete process.env.NEW_DESIGN;
  const res = { code: 200, h: {}, body: "", setHeader(k, v) { this.h[k.toLowerCase()] = String(v); }, getHeader() {}, removeHeader() {}, status(c) { this.code = c; return this; }, send(b) { this.body = String(b); return this; }, json(b) { this.body = JSON.stringify(b); return this; }, end(b) { if (b) this.body = String(b); return this; }, writeHead() {} };
  const log = console.log, err = console.error; console.log = () => {}; console.error = () => {};
  try { await buy({ method: "GET", headers: { host: "goasksam.com", cookie: "" }, query: { q: "2005 mercedes-benz sl65 amg" }, url: URL_, socket: {} }, res); } finally { console.log = log; console.error = err; delete process.env.NEW_DESIGN; }
  return res;
}
const TODAY = await html(false), SHELL = await html(true);
ok(TODAY.code === 200 && SHELL.code === 200 && SHELL.h["x-design"] === "new" && !("x-design" in TODAY.h), "the search address answers today's page with the switch off and the shelled page with it on");
ok(SHELL.h["x-robots-tag"] === TODAY.h["x-robots-tag"] && SHELL.h["cache-control"] === TODAY.h["cache-control"], "the shelled results keep today's robots and cache headers");
const STATIC = { ".js": "application/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".json": "application/json", ".ico": "image/x-icon", ".woff2": "font/woff2" };
const IMG = '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="100%" height="100%" fill="#b9c3cc"/></svg>';
const NOW_ = Date.now();
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
async function open(page, width, o = {}) {
  const { signedIn = false, recent = null, saved = [], alerts = [] } = o;
  const p = await b.newPage(); await p.setViewport({ width, height: 900 }); p._err = [];
  p.on("pageerror", e => p._err.push(String(e.message).slice(0, 200)));
  await p.evaluateOnNewDocument((si, rec) => { try { localStorage.clear(); sessionStorage.clear(); if (si) localStorage.setItem("gas_auth_session", JSON.stringify({ access_token: "a.b.c", refresh_token: "r", expires_at: Math.floor(Date.now() / 1000) + 86400, email: "x@example.com", user: { email: "x@example.com" } })); if (rec) sessionStorage.setItem(si ? "gas_recent_u:x@example.com" : "gas_recent_s", JSON.stringify(rec)); } catch (e) {} window.GAS_WAIT_SCALE = 0.05; }, signedIn, recent);
  await p.setRequestInterception(true);
  p.on("request", async r => { try { const u = new URL(r.url()), m = r.method();
    if (/supabase\.co\/auth\/v1\/user/.test(r.url())) return r.respond({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ id: "u", email: "x@example.com", aud: "authenticated" }) });
    if (u.host !== "goasksam.com") return r.resourceType() === "image" ? r.respond({ status: 200, contentType: "image/svg+xml", body: IMG }) : r.respond({ status: 200, body: "" });
    if (r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html; charset=utf-8", body: page.body });
    if (m === "OPTIONS") return r.respond({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" }, body: "" });
    if (/^\/api\//.test(u.pathname)) {
      if (/buySearch$/.test(u.pathname) && m === "POST") { let a = {}; try { a = JSON.parse(r.postData() || "{}"); } catch {}
        const json = o => r.respond({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(o) });
        if (a.action === "parse") return json({ label: "2005 Mercedes-Benz SL65 AMG", chips: [] }); if (a.action === "chat" || a.action === "rerun") { if (o.hold) await o.hold; return r.respond({ status: 200, contentType: "text/event-stream; charset=utf-8", headers: { "access-control-allow-origin": "*" }, body: SSE }); }
        if (a.action === "alerts_ready") return json({ ready: true, rule: "" }); if (a.action === "list") return json({ items: saved }); if (a.action === "alerts") return json({ items: alerts }); return json({ items: [] }); }
      return r.respond({ status: /track/.test(u.pathname) ? 204 : 200, contentType: "application/json", body: /track/.test(u.pathname) ? "" : "{}" }); }
    const loc = u.pathname.replace(/^\/js\.[^/]+\//, "/js/").replace(/^\/obx\.[^/]+\//, "/js/"), f = path.join(ROOT, "public", loc);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return r.respond({ status: 200, contentType: STATIC[path.extname(f)] || "application/octet-stream", body: fs.readFileSync(f) });
    return r.respond({ status: 404, body: "" }); } catch (e) { try { r.respond({ status: 500, body: String(e.message) }); } catch {} } });
  await p.goto("https://goasksam.com" + URL_, { waitUntil: "domcontentloaded", timeout: 60000 });
  if (o.hold) { await p.waitForSelector(".msg.searching", { timeout: 20000 }).catch(() => {}); await new Promise(r => setTimeout(r, 800)); return p; }
  await p.waitForSelector("article.car", { timeout: 20000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 1500)); return p;
}
const INVENTORY = () => {
  const c = document.querySelector("#convo"); if (!c) return null;
  const vis = e => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length), tx = e => (e.textContent || "").replace(/\s+/g, " ").trim();
  const norm = s => s.replace(/\b\d+\s*(?:s|sec|seconds?|minutes?|mins?|hours?|hrs?|days?)\b(?:\s+(?:ago|left|remaining))?/gi, "N TIME");
  const fig = s => (s.match(/\$\s?[\d,.]+(?:\s?[kKmM])?|\b\d[\d,.]*\s?(?:sales?|miles|mi|%|cars?|months?|years?)\b|\b(?:19|20)\d\d\b/g) || []).map(x => x.replace(/\s+/g, " "));
  const P = ["color", "backgroundColor", "fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "textAlign", "textTransform", "borderTopWidth", "borderBottomWidth", "borderLeftWidth", "borderTopColor", "borderRadius", "paddingTop", "paddingBottom", "paddingLeft", "paddingRight", "marginTop", "marginBottom", "display", "position", "opacity", "visibility"];
  const els = [...c.querySelectorAll("*")].filter(e => !/^(SCRIPT|STYLE|NOSCRIPT)$/.test(e.tagName));
  const style = els.map(e => { const s = getComputedStyle(e); return e.tagName.toLowerCase() + "." + String(e.getAttribute("class") || "").replace(/\s+/g, ".") + "|" + P.map(k => s[k]).join(";"); });
  return { cards: c.querySelectorAll("article.car").length, headings: [...c.querySelectorAll("h1,h2,h3,h4,[class*=eyebrow]")].filter(vis).map(e => e.tagName + ":" + norm(tx(e)).slice(0, 80)), text: norm(c.innerText.replace(/\s+/g, " ")), figures: fig(norm(c.innerText)),
    buttons: [...c.querySelectorAll("button")].filter(vis).map(e => norm(tx(e)).slice(0, 50)), links: [...c.querySelectorAll("a[href]")].filter(vis).map(e => norm(tx(e)).slice(0, 50) + " -> " + (e.getAttribute("href") || "")),
    inputs: [...c.querySelectorAll("input,textarea,select")].filter(vis).map(e => e.tagName + ":" + (e.getAttribute("placeholder") || "") + ":" + (e.value || "")), imgs: [...c.querySelectorAll("img")].filter(vis).length, style, nEls: els.length };
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
for (const width of [1440, 390]) {
  const a = await open(TODAY, width), s = await open(SHELL, width);
  const A = await a.evaluate(INVENTORY), S = await s.evaluate(INVENTORY), t = `@${width}`;
  if (process.env.DEBUG_FR) console.log(t, "chain", await s.evaluate(() => { const o = []; for (let e = document.querySelector('#convo'); e && e !== document.documentElement; e = e.parentElement) { const cs = getComputedStyle(e); o.push(e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + '.' + String(e.className).split(' ')[0] + ' w=' + Math.round(e.getBoundingClientRect().width) + ' d=' + cs.display + ' ml=' + cs.marginLeft + ' pl=' + cs.paddingLeft); } return o.join(' | '); }));
  if (process.env.DEBUG_FR) console.log(t, "rail", await s.evaluate(() => { const r = document.querySelector('aside.rail'); const cs = getComputedStyle(r); const m = document.querySelector('.mshell'); return JSON.stringify({ pos: cs.position, disp: cs.display, w: Math.round(r.getBoundingClientRect().width), kids: [...m.children].map(c => c.tagName + '#' + c.id + '.' + c.className + ':' + getComputedStyle(c).display + ':' + getComputedStyle(c).gridColumnStart) }); }));
  if (process.env.DEBUG_FR) console.log(t, "widths", await a.evaluate(() => [document.querySelector('#convo').getBoundingClientRect().width, document.querySelector('article.car').getBoundingClientRect().width, document.querySelector('.col').getBoundingClientRect().width]), await s.evaluate(() => [document.querySelector('#convo').getBoundingClientRect().width, document.querySelector('article.car').getBoundingClientRect().width, document.querySelector('.col').getBoundingClientRect().width]));
  ok(A && A.cards >= 1, `${t}: today's page draws the stored answer's cards (${A && A.cards})`);
  if (A && S) {
    ok(S.cards === A.cards, `${t}: the same cards (${S.cards} of ${A.cards})`);
    ok(same(S.headings, A.headings), `${t}: every heading, in order (${S.headings.length} of ${A.headings.length})`);
    ok(S.text === A.text, `${t}: the whole text of the results, word for word${S.text === A.text ? "" : " (first difference near: " + (() => { let i = 0; while (i < A.text.length && A.text[i] === S.text[i]) i++; return JSON.stringify(A.text.slice(Math.max(0, i - 20), i + 40)) + " vs " + JSON.stringify(S.text.slice(Math.max(0, i - 20), i + 40)); })() + ")"}`);
    ok(same(S.figures, A.figures), `${t}: every figure ($, sales, miles, dates, years) identical (${A.figures.length})`);
    ok(same(S.buttons, A.buttons), `${t}: every button identical (${A.buttons.length})`);
    ok(same(S.links, A.links), `${t}: every link, text and address identical (${A.links.length})`);
    ok(same(S.inputs, A.inputs), `${t}: every input identical (${A.inputs.length})`);
    ok(S.imgs === A.imgs, `${t}: the same images (${A.imgs})`);
    const dif = []; for (let i = 0; i < Math.max(A.style.length, S.style.length); i++) if (A.style[i] !== S.style[i]) dif.push(i);
    ok(S.nEls === A.nEls && dif.length === 0, `${t}: the computed style of every element in the results is identical (${A.nEls} elements${dif.length ? ", first difference: " + A.style[dif[0]] + " vs " + S.style[dif[0]] : ""})`);
  } else ok(false, `${t}: the shelled page has a results container`);
  const G = await s.evaluate(() => { const de = document.documentElement, c = document.querySelector("#convo"); return { sw: de.scrollWidth, cw: de.clientWidth, c: c ? Math.round(c.getBoundingClientRect().width) : 0 }; });
  ok(G.c > 0 && G.c <= G.cw - (width > 860 ? 200 : 0) && (width > 860 || G.c === Math.round(await a.evaluate(() => document.querySelector('#convo').getBoundingClientRect().width))), `${t}: the results container fits beside the rail and on a phone is as wide as today's (${G.c}px)`);
  ok(G.sw <= G.cw + 1, `${t}: no horizontal overflow in the shelled page (${G.sw} against ${G.cw})`);
  const Sh = await s.evaluate(() => { const q = x => document.querySelector(x), vis = e => !!e && !!(e.offsetWidth || e.getClientRects().length);
    return { header: !!q("header.gh"), nav: [...document.querySelectorAll("header.gh nav a")].map(a => a.textContent.trim()), oldNav: !!q(".gas-mhead, #gas-scrim, #gas-rail"), rail: !!q("aside.rail[data-kind=find]"), newLink: (q("aside.rail .new") || {}).textContent || "", newHref: q("aside.rail .new") ? q("aside.rail .new").getAttribute("href") : "", mvis: !!q(".mvbar .mvis[data-mvisits]"), footer: !!q("footer.ft"), footLinks: [...document.querySelectorAll("footer.ft nav a")].map(a => a.textContent.trim()), landingShown: vis(q("#landing")) || vis(q(".landing")), search: vis(q("#q")), title: document.title }; });
  if (width === 1440) ok(Sh.header && Sh.nav.includes("Find") && Sh.nav.includes("Account") && !Sh.oldNav, `${t}: the new header (${Sh.nav.join(", ")}) and none of the old navigation`);
  ok(Sh.rail && /New search/.test(Sh.newLink) && Sh.newHref === "/find" , `${t}: the rail has New search, to /find (${Sh.newLink})`);
  ok(Sh.footer && Sh.footLinks.includes("How Sam decides"), `${t}: the new footer, with How Sam decides (${Sh.footLinks.join(", ")})`);
  ok(Sh.search, `${t}: Find's own search box is on the results page`);
  ok(s._err.length === 0 && a._err.length === 0, `${t}: no page error (${s._err.concat(a._err).join(" | ")})`);
  await a.close(); await s.close();
}
{ // SIGNED OUT: the shared Recent searches (gas_recent, as today), nothing of the account
  const rec = [{ p: "find", label: "Manual 911", url: "/find?q=manual%20911" }, { p: "market-check", label: "2001 BMW M3", url: "/market-check?q=2001%20BMW%20M3" }];
  const s = await open(SHELL, 1440, { recent: rec }), R = await s.evaluate(() => ({ rec: !document.getElementById("gas-recent").hidden, items: [...document.querySelectorAll("#gas-recent-list .gas-recent-item")].map(a => a.getAttribute("title") + "|" + a.getAttribute("href") + "|" + a.querySelector(".gas-recent-p").textContent), rm: document.querySelectorAll("#gas-recent-list .gas-recent-x").length, saved: !document.getElementById("find-saved").hidden, alerts: !!document.querySelector(".rail .rh2") }));
  ok(R.rec && R.items.slice(-2).join(" ; ") === "Manual 911|/find?q=manual%20911|Find ; 2001 BMW M3|/market-check?q=2001%20BMW%20M3|Market Check" && R.rm === R.items.length, `signed out: Recent searches are the shared shell's own list, with each product's label and a remove button (${R.items.join(" ; ")})`);
  ok(!R.saved && !R.alerts, "signed out: no saved searches and no Before it ends in the rail"); await s.close(); }
{ // SIGNED IN: Recent searches, then the account's saved searches, then Before it ends, from the same places as today
  const rec = [{ p: "find", label: "Manual 911", url: "/find?q=manual%20911" }];
  const saved = [{ id: "s1", title: "Red Ferrari under 10k miles", state: { url: "/find?q=red%20ferrari" }, messages: [] }, { id: "s2", title: "Aston DB9", state: { url: "/find?q=aston%20db9" }, messages: [] }];
  const alerts = [{ id: "a1", listing_id: "L1", title: "1996 Porsche 993 Carrera", url: "https://example.test/lot/1", end_time: new Date(NOW_ + 30 * 3600e3).toISOString(), ended: false }];
  for (const width of [1440, 390]) {
    const s = await open(SHELL, width, { signedIn: true, recent: rec, saved, alerts }), R = await s.evaluate(() => { const vis = e => !!e && !!(e.offsetWidth || e.getClientRects().length);
      return { rec: [...document.querySelectorAll("#gas-recent-list .gas-recent-item")].map(a => a.getAttribute("title")), savedShown: vis(document.getElementById("find-saved")), saved: [...document.querySelectorAll("#searches .srow a.srch:not(.arm)")].map(a => a.textContent.trim() + "|" + a.getAttribute("href")), alerts: [...document.querySelectorAll("#searches .srow a.srch.arm")].map(a => a.getAttribute("title")), alertHead: [...document.querySelectorAll("#searches .rh2")].map(x => x.textContent), order: (() => { const r = document.querySelector("aside.rail"); const ids = [...r.querySelectorAll("#gas-recent, #searches .rh2, #searches .srow")].map(e => e.id || e.className); return ids.join(">"); })(), mvis: vis(document.querySelector(".mvbar .mvis")) }; });
    const t = `signed in @${width}`;
    if (width === 1440) {
      ok(R.rec.includes("Manual 911"), `${t}: Recent searches are listed (${R.rec.join()})`);
      ok(R.savedShown && R.saved.some(x => x.startsWith("Red Ferrari under 10k miles|/find?q=red")) && R.saved.some(x => x.startsWith("Aston DB9|")), `${t}: the account's saved searches are listed under the recent searches (${R.saved.join(" ; ")})`);
      ok(R.alertHead.join() === "Before it ends" && R.alerts.length === 1 && /1996 Porsche 993 Carrera/.test(R.alerts[0]), `${t}: Before it ends lists the armed car under the saved searches (${R.alerts.join()})`);
      ok(R.order.indexOf("gas-recent") === 0 && R.order.indexOf("rh rh2") > R.order.indexOf("srow"), `${t}: the order is Recent searches, saved searches, Before it ends (${R.order})`);
    } else ok(R.mvis, `${t}: Find's own Your searches button is on the phone`);
    await s.close();
  }
  const sp = await open(SHELL, 390, { signedIn: true, recent: rec, saved, alerts });
  await sp.evaluate(() => document.querySelector(".mvbar .mvis").click()); await new Promise(r => setTimeout(r, 400));
  const L = await sp.evaluate(() => ({ open: !document.getElementById("mvlist").hidden, rows: [...document.querySelectorAll("#mvlist .vlist a.srch")].map(a => a.textContent.trim()) }));
  ok(L.open && L.rows.some(x => /Red Ferrari/.test(x)), `signed in @390: the Your searches button opens the page's own list with the account's saved searches (${L.rows.join(" ; ")})`); await sp.close(); }
// EVERY NEW SEARCH GOES TO THE NEW LANDING (Sam, Nov 11 2026). The top right "New search" button (and the phone list's) ran the page's own goStart(): the OLD landing (the old search box, the old rail) inside the results page, at the address /find; only the rail's link navigated to the new landing. The rail's link, the top right button and the phone list's button must all navigate to the product's landing route, no query.
for (const w of [1440, 390]) for (const sel of ["aside.rail a.new", "[data-newsearch]"]) {
  if (w < 860 && sel === "aside.rail a.new") continue;   // the rail is the phone's Your searches list under 860px
  const p = await open(SHELL, w); await new Promise(r => setTimeout(r, 2500));
  if (w < 860 && sel === "[data-newsearch]") { await p.evaluate(() => { const m = document.querySelector("[data-mvisits]"); if (m) m.click(); }); await new Promise(r => setTimeout(r, 500)); }
  const found = await p.evaluate(s => { const e = [...document.querySelectorAll(s)].find(x => x.getBoundingClientRect().width > 0); return e ? (e.getAttribute("href") || "button") : null; }, sel);
  ok(found !== null, `@${w}: ${sel} is on the page`); if (found === null) { await p.close(); continue; }
  const navs = []; p.on("request", r => { if (r.isNavigationRequest()) { const u = new URL(r.url()); navs.push(u.pathname + u.search); } });
  await p.evaluate(s => [...document.querySelectorAll(s)].find(x => x.getBoundingClientRect().width > 0).click(), sel); await new Promise(r => setTimeout(r, 1200));
  const to = navs[navs.length - 1] || null; ok(to === "/find", `@${w}: ${sel} navigates to the new Find landing, no query (${to})`); await p.close();
}
{ const links = await (async () => { const p = await open(SHELL, 1440); await new Promise(r => setTimeout(r, 2500)); const l = await p.evaluate(() => [...document.querySelectorAll("a[href]")].map(a => a.getAttribute("href"))); await p.close(); return l; })();
  const bad = links.filter(h => /^\/preview(\/|$|\?)|[?&](crew|_crew|preview|design)=|gas_crew|\/api\/sellNext|\/onebox-preview/.test(h)); ok(bad.length === 0, "no link on the Find results page goes to a preview address or carries a crew or design query (" + (bad.join(", ") || links.length + " links") + ")"); }
// AFTER A SEARCH THE HEADER IS ON SCREEN (Sam, Nov 11 2026): the page sized its column to the whole window under the shell's header, so it was one header taller than the screen and the bottom search box's focus scrolled the window down, the header off screen, on load and after a follow-up search. After the results draw, and after a follow-up search from the bottom box, at 1440, 1280, 1024 and on a phone (390) the window is at the top and the header is on screen (Nov 11 2026, the phone: the page focused its bottom box while loading, before the shell published the height above the page, so the column was the desktop's height and the focus scrolled the window by 238px).
for (const w of [1440, 1280, 1024, 390]) {
  const p = await open(SHELL, w); await new Promise(r => setTimeout(r, 3000));
  const at = () => p.evaluate(() => ({ y: Math.round(scrollY), hdr: Math.round(document.querySelector("header.gh").getBoundingClientRect().top), focus: document.activeElement && document.activeElement.id }));
  const a = await at(); ok(a.y === 0 && a.hdr >= 0, `@${w}: after the results draw the window is at the top and the header is on screen (scroll ${a.y}, header top ${a.hdr}, focus #${a.focus})`);
  await p.evaluate(() => { const q = document.getElementById("q"); if (q) { q.focus(); q.value = "2006 Mercedes SL65"; q.dispatchEvent(new Event("input", { bubbles: true })); } }); await p.keyboard.press("Enter"); await new Promise(r => setTimeout(r, 3000));
  const c = await at(); ok(c.y === 0 && c.hdr >= 0, `@${w}: after a follow-up search from the bottom box the window is still at the top and the header is on screen (scroll ${c.y}, header top ${c.hdr})`); await p.close();
}
// THE LOADING STATE (Sam, Nov 11 2026): while the engine answers, the results page keeps its layout (header, rail, the New search row, the chips row, the count slot) and the results area holds ONE centred sentence from the engine's table (reasonWords wait.find) with pulsing dots: no skeleton or empty cards, no venue name, no figure, nothing the engine has not said. When the answer lands the loading state is replaced by the real results and nothing above it moves. At 1440, 1280, 1024 and 390.
{ const { waitLines } = await imp("lib/reasonWords.js"), WANT = waitLines().find, VENUE = /Bring a Trailer|Cars (?:&|and) Bids|Hagerty|PCAR|PCarMarket|Hemmings|MB Market|Sotheby|Gooding|Collecting Cars|Mecum|Barrett|Bonhams|Broad Arrow|Car (?:&|and) Classic|PistonHeads|The Market/i;
  const SNAP = () => { const r = e => { if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top + scrollY), Math.round(b.width)]; }, q = s => document.querySelector(s);
    return { hdr: r(q("header.gh")), rail: r(q(".rail")), top: r(q(".shead-top")), new_: !!q(".shead [data-newsearch]"), row: r(q(".srow2")), chips: r(q(".schips")), count: r(q(".scount")),
      chipTxt: [...document.querySelectorAll(".schips .rchip")].map(x => x.textContent.trim()).join("|"), cards: document.querySelectorAll("#convo article.car").length, skel: document.querySelectorAll("#convo .skel,#convo .skelgrid,#convo [class*=skeleton]").length,
      wait: (q(".gas-wait-line") || {}).textContent || "", waitBox: r(q(".gas-wait")), col: r(q("#convo")), text: (q("#convo") || { innerText: "" }).innerText.replace(/\s+/g, " ").trim(), stage: (q(".gas-wait") ? 1 : 0) }; };
  for (const w of [1440, 1280, 1024, 390]) {
    let go; const hold = new Promise(r => { go = r; });
    const p = await open(SHELL, w, { hold }); const L = await p.evaluate(SNAP), t = `loading @${w}`;
    ok(L.wait === WANT, `${t}: the results area holds the engine's table sentence, "${WANT}" (${L.wait})`);
    ok(L.cards === 0 && L.skel === 0, `${t}: no skeleton or empty cards before the results (cards ${L.cards}, skeletons ${L.skel})`);
    ok(!VENUE.test(L.text), `${t}: no venue name is printed while the search runs`);
    const area = await p.evaluate(() => (document.querySelector(".gas-wait") || { innerText: "" }).innerText);
    ok(!/[$\d]/.test(area), `${t}: no figure in the loading area (${area.replace(/\s+/g, " ").slice(0, 80)})`);
    { const n = await p.evaluate(() => ({ text: (document.body.innerText.match(/New search/g) || []).length, ctl: [...document.querySelectorAll("[data-newsearch], .rail a.new")].filter(e => { const b = e.getBoundingClientRect(), cs = getComputedStyle(e); return b.width > 0 && b.height > 0 && cs.visibility !== "hidden" && cs.display !== "none"; }).length }));
      ok(n.text === 1 && n.ctl === 1, `${t}: New search is ONE visible control while the search runs (page text ${n.text} times, ${n.ctl} visible controls)`); }
    ok(L.new_ && L.chips && L.chipTxt.length > 0 && L.row, `${t}: the New search row and the query chips are on screen from the start (${L.chipTxt})`);
    ok(L.waitBox && Math.abs((L.waitBox[0] + L.waitBox[2] / 2) - (L.col[0] + L.col[2] / 2)) <= 14, `${t}: the loading state is centred in the results area`);
    ok(await p.evaluate(() => { const t = document.querySelector(".gas-wait-line"); return !!t && t.textContent.trim().split(/(?<=[.!?])\s+/).length === 1; }), `${t}: one sentence`);
    if (process.env.SHOT_DIR) await p.screenshot({ path: path.join(process.env.SHOT_DIR, `find-loading-${w}.png`) });   // the waiting state, for the notes
    go(); await p.waitForSelector("#convo article.car", { timeout: 20000 }).catch(() => {}); await new Promise(r => setTimeout(r, 1500));
    const D = await p.evaluate(SNAP);
    ok(D.cards > 0 && D.stage === 0 && !/Sam is checking live auctions/.test(D.text), `${t}: when the answer lands the loading state is replaced by the real results (${D.cards} cards)`);
    const same = (x, y) => x && y && x[0] === y[0] && Math.abs(x[1] - y[1]) <= 1 && Math.abs(x[2] - y[2]) <= 1;
    ok(same(L.hdr, D.hdr) && same(L.rail, D.rail) && same(L.top, D.top) && same(L.row, D.row) && L.chips[0] === D.chips[0] && Math.abs(L.chips[1] - D.chips[1]) <= 1, `${t}: nothing jumps when the results land: header, rail, New search row, chips row (before ${JSON.stringify([L.top, L.row, L.chips])}, after ${JSON.stringify([D.top, D.row, D.chips])})`);
    await p.close(); }
}
await b.close();
for (const l of out) console.log(l);
console.log(`findResultsCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
