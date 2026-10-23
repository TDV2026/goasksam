// VALUE INTENT ON FIND, AND SIGN-IN CONTINUITY (GoAskSam 2.0 Stage 3, Sam's block, Oct 23 2026; Lane C). OFFLINE: Find's real page is
// rendered in-process and loaded in Chrome with the search API answered from a fixture (no network). Proves:
//  - a Find search whose words say sell, selling, worth or value opens its results with ONE line, "Want to know what it's worth? See what
//    Porsche 911s have sold for ->", linking to Market Check with the car filled in; the search itself runs as normal; a search without
//    those words has no such line; it never appears twice;
//  - sign-in continuity: a signed-out "Have Sam keep looking" remembers the action and the search's address, opens the sign-in; closing
//    the card (cancel) drops it and leaves the search; a sign in completes it exactly ONCE (also after a reload that Google would cause),
//    with a one-line confirmation, and never twice.
//   node scripts/valueIntentCheck.mjs   (from the repo root; needs Chrome)
import path from "node:path";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
process.env.LAUNCH_STAGE = "2";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname); process.chdir(ROOT);
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const { default: handler } = await import(pathToFileURL(path.join(ROOT, "api/buy.js")).href);
const html = await new Promise(r => { const res = { setHeader() {}, getHeader() {}, status() { return res; }, send(b) { r(String(b)); return res; }, end(b) { r(String(b || "")); return res; }, json(o) { r(JSON.stringify(o)); return res; }, writeHead() { return res; }, write() {} }; handler({ method: "GET", url: "/find", query: {}, headers: { host: "goasksam.com", cookie: "gas_crew=x" }, socket: {} }, res); });
const now = Date.now(), soon = h => new Date(now + h * 3600e3).toISOString();
const CARDS = [{ id: 1, title: "1995 Porsche 911 Carrera", make: "Porsche", url: "https://auction.test/1", source: "Bring a Trailer", photo_url: null, end_time: soon(5), current_bid_usd: 52000, miles: 34000, location: "Austin, TX", chips: ["Manual"], market: { kind: "none", query: "1995 Porsche 911" }, sam_lines: [] }];
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
async function open(qs, { signedIn = false, keepModal = true } = {}) {
  const p = await b.newPage(); await p.setViewport({ width: 1300, height: 900 });
  const calls = []; p._calls = calls; p._opens = [];
  await p.evaluateOnNewDocument(si => { try { if (si) localStorage.setItem("gas_auth_session", JSON.stringify({ access_token: "tok", expires_at: 9999999999 })); } catch (e) {} window.__opens = []; window.open = u => { window.__opens.push(String(u)); return null; };
    window.openSignInCard = function () { window.__signInOpened = (window.__signInOpened || 0) + 1; var m = document.createElement("div"); m.id = "auth-modal"; document.body.appendChild(m); }; }, signedIn);
  await p.setRequestInterception(true);
  p.on("request", r => { const u = new URL(r.url());
    if (u.host === "goasksam.com" && r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html", body: html });
    if (u.host === "goasksam.com" && u.pathname === "/api/buySearch") { let body = {}; try { body = JSON.parse(r.postData() || "{}"); } catch {} calls.push(body.action);
      const a = body.action; const ans = a === "chat" || a === "rerun" ? { reply: "", suggest: [], state: { filters: { make: "Porsche", model: "911" } }, turns: 1, meta: { count: 1, live: 1, asks: [] }, cards: CARDS, searchNote: "" } : a === "list" ? { items: [] } : a === "save" ? { ok: true, id: "s1" } : {};
      return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(ans) }); }
    if (u.host === "goasksam.com") return r.respond({ status: 204, body: "" });
    return r.respond({ status: 204, body: "" }); });
  await p.goto("https://goasksam.com/find" + qs, { waitUntil: "domcontentloaded" }); await p.waitForSelector("article.car", { timeout: 20000 }).catch(() => {}); await new Promise(r => setTimeout(r, 1200));
  return p;
}
try {
  for (const [q, want] of [["sell my 1995 porsche 911", true], ["what is a porsche 911 worth", true], ["value of a 911", true], ["I am selling a 911", true], ["red manual porsche 911", false], ["a 911 for sale under 90k", false]]) {
    const p = await open("?q=" + encodeURIComponent(q) + "&make=Porsche&model=911");
    const r = await p.evaluate(() => ({ n: document.querySelectorAll("[data-valueintent]").length, t: (document.querySelector("[data-valueintent]") || {}).innerText || "", h: (document.querySelector("[data-valueintent] a") || {}).getAttribute ? document.querySelector("[data-valueintent] a").getAttribute("href") : "", first: !!document.querySelector(".msg.results > [data-valueintent]:first-child"), cards: document.querySelectorAll("article.car").length }));
    if (want) { ok(r.n === 1 && /^Want to know what it’s worth\? See what Porsche 911s have sold for →$/.test(r.t), `"${q}": the one line reads as Sam wrote it (${r.t})`); ok(r.h === "/market-check?q=Porsche%20911", `"${q}": it links to Market Check with the car filled in (${r.h})`); ok(r.first, `"${q}": it is the first thing in the results`); }
    else ok(r.n === 0, `"${q}": no value line without those words`);
    ok(r.cards >= 1, `"${q}": the search ran as normal (cards ${r.cards})`);
    await p.close();
  }
  // sign-in continuity: keep looking, signed out
  { const p = await open("?q=" + encodeURIComponent("porsche 911") + "&make=Porsche&model=911");
    const has = await p.evaluate(() => !!document.querySelector("[data-keep]"));
    ok(has, "signed-out results carry Have Sam keep looking");
    if (has) {
      await p.evaluate(() => document.querySelector("[data-keep]").click()); await new Promise(r => setTimeout(r, 300));
      let st = await p.evaluate(() => ({ pend: sessionStorage.getItem("gas_buy_pendact"), modal: !!document.getElementById("auth-modal"), opened: window.__signInOpened || 0, url: location.pathname + location.search }));
      const pr = st.pend && JSON.parse(st.pend);
      ok(pr && pr.type === "keep" && /^\/find\?/.test(pr.url) && /make=Porsche/.test(pr.url) && pr.data && /tasks/.test(pr.data.href), "signed out: the action and the search's address (refinements included) are remembered before the sign-in opens");
      ok(st.opened === 1 && st.modal, "the sign-in card opens once");
      // cancel: card closes, never signs in
      await p.evaluate(() => { var m = document.getElementById("auth-modal"); if (m) m.remove(); }); await new Promise(r => setTimeout(r, 2800));
      st = await p.evaluate(() => ({ pend: sessionStorage.getItem("gas_buy_pendact"), opens: window.__opens.length, cards: document.querySelectorAll("article.car").length, url: location.pathname + location.search }));
      ok(st.pend === null && st.opens === 0 && st.cards >= 1 && /make=Porsche/.test(st.url), "cancel: nothing remembered, nothing done, the search stays");
      // sign in on this page: completes once
      await p.evaluate(() => document.querySelector("[data-keep]").click()); await new Promise(r => setTimeout(r, 300));
      await p.evaluate(() => { localStorage.setItem("gas_auth_session", JSON.stringify({ access_token: "tok", expires_at: 9999999999 })); var m = document.getElementById("auth-modal"); if (m) m.remove(); });
      await new Promise(r => setTimeout(r, 2600));
      st = await p.evaluate(() => ({ pend: sessionStorage.getItem("gas_buy_pendact"), opens: window.__opens.slice(), toast: (document.querySelector(".gas-toast:not([hidden])") || {}).innerText || "" }));
      ok(st.pend === null && st.opens.length + (st.toast ? 1 : 0) >= 1 && st.opens.length <= 1, `sign in: the action completes exactly once and is confirmed (opens ${st.opens.length}, line "${st.toast}")`);
      await new Promise(r => setTimeout(r, 1500)); const again = await p.evaluate(() => window.__opens.length); ok(again === st.opens.length, "and never a second time");
    }
    await p.close(); }
  // Google return: the page reloads signed in with a record waiting: it completes once
  { const p = await b.newPage(); await p.setViewport({ width: 1300, height: 900 }); await p.evaluateOnNewDocument(() => { window.__opens = []; window.open = u => { window.__opens.push(String(u)); return null; }; try { localStorage.setItem("gas_auth_session", JSON.stringify({ access_token: "tok", expires_at: 9999999999 })); if (!sessionStorage.getItem("gas_seeded")) { sessionStorage.setItem("gas_seeded", "1"); sessionStorage.setItem("gas_buy_pendact", JSON.stringify({ type: "keep", data: { href: "/tasks/mine?task=x" }, url: "/find?q=porsche+911&make=Porsche&model=911", at: Date.now() })); } } catch (e) {} });
    await p.setRequestInterception(true);
    p.on("request", r => { const u = new URL(r.url()); if (u.host === "goasksam.com" && r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html", body: html }); if (u.host === "goasksam.com" && u.pathname === "/api/buySearch") { let body = {}; try { body = JSON.parse(r.postData() || "{}"); } catch {} const a = body.action; return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(a === "chat" || a === "rerun" ? { reply: "", suggest: [], state: { filters: { make: "Porsche", model: "911" } }, turns: 1, meta: { count: 1, live: 1, asks: [] }, cards: CARDS, searchNote: "" } : a === "list" ? { items: [] } : {}) }); } return r.respond({ status: 204, body: "" }); });
    await p.goto("https://goasksam.com/find", { waitUntil: "domcontentloaded" }); await p.waitForSelector("article.car", { timeout: 20000 }).catch(() => {}); await new Promise(r => setTimeout(r, 3500));
    const st = await p.evaluate(() => ({ url: location.pathname + location.search, opens: window.__opens.slice(), toast: (document.querySelector(".gas-toast:not([hidden])") || {}).innerText || "", pend: sessionStorage.getItem("gas_buy_pendact") }));
    ok(/make=Porsche/.test(st.url) && st.pend === null && (st.opens.length === 1 || /Open your task/.test(st.toast)), `Google return: the search address is restored and the action completes once (url ${st.url}, opens ${st.opens.length}, line "${st.toast}")`);
    await p.close(); }
  // a search still running when the visitor goes to the empty Find screen must not draw over it (rail Find, Back, a recent)
  { const p = await b.newPage(); await p.setViewport({ width: 1300, height: 900 }); await p.setRequestInterception(true);
    p.on("request", r => { const u = new URL(r.url()); if (u.host === "goasksam.com" && r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html", body: html });
      if (u.host === "goasksam.com" && u.pathname === "/api/buySearch") { let body = {}; try { body = JSON.parse(r.postData() || "{}"); } catch {} const a = body.action; if (a === "chat" || a === "rerun") { setTimeout(() => r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ reply: "", suggest: [], state: { filters: { make: "Porsche", model: "911" } }, turns: 1, meta: { count: 1, live: 1, asks: [] }, cards: CARDS, searchNote: "" }) }), 2500); return; } return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(a === "list" ? { items: [] } : {}) }); }
      return r.respond({ status: 204, body: "" }); });
    await p.goto("https://goasksam.com/find", { waitUntil: "domcontentloaded" }); await new Promise(r => setTimeout(r, 800));
    await p.type("#hq", "porsche 911"); await p.click("#hgo"); await new Promise(r => setTimeout(r, 600));
    await p.click('#gas-rail a[href="/find"]'); await new Promise(r => setTimeout(r, 4500));
    const st = await p.evaluate(() => ({ lead: !!document.getElementById("lead"), cards: document.querySelectorAll("article.car").length, url: location.pathname + location.search }));
    ok(st.lead && st.cards === 0 && st.url === "/find", `rail Find while a search is still running opens the empty Find screen and stays there (${JSON.stringify(st)})`); await p.close(); }
} finally { await b.close(); }
console.log(`valueIntentCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
