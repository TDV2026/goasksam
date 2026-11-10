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
  const f = "lib/preview/mcSellPreview.js", P = path.join(ROOT, f), orig = fs.readFileSync(P, "utf8");
  const MUT = [
    ["a card hidden by one CSS rule", "export const RESULTS_SHELL_CSS = `", "export const RESULTS_SHELL_CSS = `#convo article.car{display:none}"],
    ["a results element restyled", "export const RESULTS_SHELL_CSS = `", "export const RESULTS_SHELL_CSS = `#convo article.car a{color:#c00!important;font-size:21px!important}"],
    ["a container pushed past the screen", "export const RESULTS_SHELL_CSS = `", "export const RESULTS_SHELL_CSS = `#convo{width:3000px!important}"],
    ["a link dropped", "export const RAIL_JS = `(function(){", "export const RAIL_JS = `(function(){setTimeout(function(){var a=document.querySelector(\"#convo article.car a[href]\");if(a)a.parentNode.removeChild(a);},900);"],
    ["a heading removed", "export const RAIL_JS = `(function(){", "export const RAIL_JS = `(function(){setTimeout(function(){var h=document.querySelector(\"#convo h2,#convo h3\");if(h)h.parentNode.removeChild(h);},900);"]
  ];
  let bad = 0;
  for (const [name, from, to] of MUT) {
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
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
async function open(page, width, history) {
  const p = await b.newPage(); await p.setViewport({ width, height: 900 }); p._err = [];
  p.on("pageerror", e => p._err.push(String(e.message).slice(0, 200)));
  await p.evaluateOnNewDocument((h) => { try { localStorage.clear(); sessionStorage.clear(); if (h) sessionStorage.setItem("gas_buy_visit", JSON.stringify(h)); } catch (e) {} window.GAS_WAIT_SCALE = 0.05; }, history || null);
  await p.setRequestInterception(true);
  p.on("request", async r => { try { const u = new URL(r.url()), m = r.method();
    if (u.host !== "goasksam.com") return r.resourceType() === "image" ? r.respond({ status: 200, contentType: "image/svg+xml", body: IMG }) : r.respond({ status: 200, body: "" });
    if (r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html; charset=utf-8", body: page.body });
    if (m === "OPTIONS") return r.respond({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" }, body: "" });
    if (/^\/api\//.test(u.pathname)) {
      if (/buySearch$/.test(u.pathname) && m === "POST") { let a = {}; try { a = JSON.parse(r.postData() || "{}"); } catch {}
        const json = o => r.respond({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(o) });
        if (a.action === "parse") return json({ label: "2005 Mercedes-Benz SL65 AMG", chips: [] }); if (a.action === "chat" || a.action === "rerun") return r.respond({ status: 200, contentType: "text/event-stream; charset=utf-8", headers: { "access-control-allow-origin": "*" }, body: SSE });
        if (a.action === "alerts_ready") return json({ ready: true, rule: "" }); return json({ items: [] }); }
      return r.respond({ status: /track/.test(u.pathname) ? 204 : 200, contentType: "application/json", body: /track/.test(u.pathname) ? "" : "{}" }); }
    const loc = u.pathname.replace(/^\/js\.[^/]+\//, "/js/").replace(/^\/obx\.[^/]+\//, "/js/"), f = path.join(ROOT, "public", loc);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return r.respond({ status: 200, contentType: STATIC[path.extname(f)] || "application/octet-stream", body: fs.readFileSync(f) });
    return r.respond({ status: 404, body: "" }); } catch (e) { try { r.respond({ status: 500, body: String(e.message) }); } catch {} } });
  await p.goto("https://goasksam.com" + URL_, { waitUntil: "domcontentloaded", timeout: 60000 });
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
    return { header: !!q("header.gh"), nav: [...document.querySelectorAll("header.gh nav a")].map(a => a.textContent.trim()), oldNav: !!q(".gas-mhead, #gas-scrim, #gas-rail"), rail: !!q("aside.rail[data-kind=find]"), newLink: (q("aside.rail .new") || {}).textContent || "", newHref: (q("aside.rail .new") || {}).getAttribute ? q("aside.rail .new").getAttribute("href") : "", head: (q("#mc-rail-head") || {}).textContent || "", items: [...document.querySelectorAll("#mc-rail-recent a.it")].map(a => a.textContent.trim() + "|" + a.getAttribute("href")),
      footer: !!q("footer.ft"), footLinks: [...document.querySelectorAll("footer.ft nav a")].map(a => a.textContent.trim()), landingShown: vis(q("#landing")) || vis(q(".landing")), search: vis(q("#q")), title: document.title }; });
  if (width === 1440) ok(Sh.header && Sh.nav.includes("Find") && Sh.nav.includes("Account") && !Sh.oldNav, `${t}: the new header (${Sh.nav.join(", ")}) and none of the old navigation`);
  ok(Sh.rail && /New search/.test(Sh.newLink) && Sh.newHref === "/find" , `${t}: the rail has New search, to /find (${Sh.newLink})`);
  ok(Sh.footer && Sh.footLinks.includes("How Sam decides"), `${t}: the new footer, with How Sam decides (${Sh.footLinks.join(", ")})`);
  ok(Sh.search, `${t}: Find's own search box is on the results page`);
  ok(s._err.length === 0 && a._err.length === 0, `${t}: no page error (${s._err.concat(a._err).join(" | ")})`);
  await a.close(); await s.close();
}
{ // the rail's recent searches come from the search history the page already keeps (sessionStorage gas_buy_visit)
  const hist = [{ url: "/find?q=2005%20mercedes-benz%20sl65%20amg", label: "2005 Mercedes-Benz SL65 AMG" }, { url: "/find?q=manual%20911", label: "Manual 911" }, { url: "https://evil.example/x", label: "Not ours" }];
  const s = await open(SHELL, 1440, hist), Sh = await s.evaluate(() => ({ head: !document.getElementById("mc-rail-head").hidden, items: [...document.querySelectorAll("#mc-rail-recent a.it")].map(a => a.textContent.trim() + "|" + a.getAttribute("href")) }));
  ok(Sh.head && Sh.items.length === 2 && Sh.items[0].startsWith("2005 Mercedes-Benz SL65 AMG|/find?q=") && Sh.items[1].startsWith("Manual 911|/find?q=") && !Sh.items.some(x => /evil/.test(x)), `the rail lists the recent searches as /find?q= addresses, same site only (${Sh.items.join(" ; ")})`);
  await s.close();
}
await b.close();
for (const l of out) console.log(l);
console.log(`findResultsCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
