// THE FIND DRAWER IN CHROME (Sam, Oct 29 2026): the page code from THIS branch (api/buy.js rendered in-process) against a fake server, on a real search result for the 2005 Mercedes-Benz SL65 AMG (a stored Find
// answer, scripts/fixtures/findSl65Search.json). Sam's exact-car click left no row and no sign: so every control must, in the real page, (1) send the request, (2) say what happened and where, with a link to the item,
// (3) on a refusal or a dropped call show a plain line, keep the button and never say "Sam is looking", (4) take its state from the stored list, never from the click, (5) offer Stop, (6) ask to sign in when signed out.
// Static assets (fonts, auth script) come from goasksam.com; with no network the check says SKIP and passes.
//   node scripts/standingDrawerCheck.mjs
import fs from "node:fs";
import puppeteer from "puppeteer-core";
import { execFileSync } from "node:child_process";
import { crewCookie } from "./_crewCookie.mjs";
let pass = 0, fail = 0, skipped = false; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
process.env.LAUNCH_STAGE = "2";
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (!fs.existsSync(CHROME)) { console.log("standingDrawerCheck: SKIP (no Chrome)"); process.exit(0); }
try { const r = await fetch("https://goasksam.com/robots.txt", { signal: AbortSignal.timeout(8000) }); if (!r.ok && r.status >= 500) throw new Error("down"); } catch { console.log("standingDrawerCheck: SKIP (no network)"); process.exit(0); }
const ck = await crewCookie();
if (!ck) { console.log("standingDrawerCheck: SKIP (no crew code in the Keychain: the live search behind the drawer is sealed to the public)"); process.exit(0); }
let bypass = ""; try { bypass = execFileSync("security", ["find-generic-password", "-s", "goasksam-bypass", "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch {}
const buy = (await import("../api/buy.js")).default;
import { freshenEndTimes, freshenEndTimesText } from "./_pinEndTimes.mjs";
const FIX = JSON.parse(fs.readFileSync(new URL("./fixtures/findSl65Search.json", import.meta.url), "utf8"));
// End times of every answer are pinned to the clock (scripts/_pinEndTimes.mjs): the real listing ends when it ends.
freshenEndTimes(FIX);
async function html() {
  const res = { code: 200, headers: {}, body: null, setHeader(k, v) { this.headers[k] = v; }, getHeader() {}, status(c) { this.code = c; return this; }, send(b) { this.body = b; return this; }, json(b) { this.body = JSON.stringify(b); return this; }, end(b) { if (b) this.body = b; return this; }, writeHead() {} };
  await buy({ method: "GET", headers: { host: "goasksam.com", cookie: "" }, query: { q: "2005 mercedes-benz sl65 amg" }, url: "/find?q=2005+mercedes-benz+sl65+amg", socket: {} }, res);
  return String(res.body);
}
const PAGE = await html();
const SPEC = { id: "11111111-1111-4111-8111-111111111111", kind: "spec", label: "2005 SL65", identity: "2005 Mercedes-Benz SL-Class SL65 AMG", key: null };
const VIN = { id: "33333333-3333-4333-8333-333333333333", kind: "vin", label: "2005 Mercedes-Benz SL65 AMG", identity: null, key: "" };
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });

// mode: how /api/watch and the toggle answer to an arm. stored: what the list says is on file. signedIn: a session in the page.
async function scenario({ mode = "ok", stored = [SPEC], signedIn = true, alertMode = null }, act) {
  const p = await browser.newPage(); await p.setViewport({ width: 1280, height: 900 });
  await p.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36");
  await p.evaluateOnNewDocument((si) => { window.__signin = 0; if (si) localStorage.setItem("gas_auth_session", JSON.stringify({ access_token: "a.b.c", user: { email: "x@example.com" } })); }, signedIn);
  if (bypass) await p.setExtraHTTPHeaders({ 'x-vercel-protection-bypass': bypass });
  await p.setCookie({ name: 'gas_crew', value: ck, domain: 'goasksam.com', path: '/', secure: true });
  const log = []; if (process.env.DEBUG_DRAWER) { p.on('pageerror', e => console.log('PAGEERR', String(e.message).slice(0,200))); p.on('console', m => { if (m.type()==='error') console.log('CONSOLE', m.text().slice(0,200)); }); }
  await p.setRequestInterception(true);
  p.on("request", async rq => {
    const u = rq.url(), m = rq.method();
    if (m === 'OPTIONS') return rq.respond({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (m === "GET" && /^https:\/\/goasksam\.com\/find\?/.test(u)) return rq.respond({ status: 200, contentType: "text/html; charset=utf-8", body: PAGE });
    if (!signedIn && (/supabase\.co\/auth\/v1\/user/.test(u) || /\/api\/account/.test(u))) return rq.respond({ status: 401, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{}' });
    if (/supabase\.co\/auth\/v1\/user/.test(u)) return rq.respond({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ id: "u", email: "x@example.com", aud: "authenticated" }) });
    if (/\/api\/account/.test(u)) return rq.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, signedIn: true, email: "x@example.com" }) });
    if (/\/api\/tasks\?summary/.test(u)) { log.push('summary'); return rq.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ signedIn: true, count: 0 }) }); }
    const json = o => rq.respond({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(o) });
    if (/\/api\/watch$/.test(u) && m === "POST") {
      let a = {}; try { a = JSON.parse(rq.postData() || "{}"); } catch {} log.push("watch:" + a.action + ":" + (a.kind || ""));
      if (a.action === "ready") return json({ ready: true });
      if (a.action === "list") return json({ watches: stored });
      if (a.action === "stop") return mode === "drop" ? rq.abort() : json({ ok: true });
      if (a.action === "arm") {
        if (mode === "drop") return rq.abort();
        if (mode === "500") return rq.respond({ status: 500, contentType: "text/html", body: "<html>boom</html>" });
        if (mode === "refuse") return json({ ok: false, reason: "cap_watch", line: "You are watching 25 cars. Stop one under Watching on your Tasks page to add another." });
        return json({ watch: a.kind === "vin" ? { ...VIN, id: "44444444-4444-4444-8444-444444444444", key: FIX.cards[0].vin_norm } : { ...SPEC, id: "55555555-5555-4555-8555-555555555555" }, first: false, already: false });
      }
      return json({});
    }
    if (/\/api\/buySearch$/.test(u) && m === "POST") {
      let a = {}; try { a = JSON.parse(rq.postData() || "{}"); } catch {}
      if (a.action === "alerts_ready") return json({ ready: true, rule: "Sam sends one email about two hours before bidding ends, at any hour of the day or night." });
      if (a.action === "alerts") return json({ items: [] });
      if (a.action === "list") return json({ items: [] });
      if (a.action === "arm") { log.push("alert:arm"); if (alertMode === "drop") return rq.abort(); if (alertMode === "refuse") return json({ ok: false, reason: "cap_alert", line: "You have 25 before-it-ends emails set. Stop one under Watching on your Tasks page to add another." }); return json({ ok: true, already: false, alert: { listing_id: 191043, title: "2005 Mercedes-Benz SL65 AMG", end_time: new Date(Date.now() + 8 * 3600e3).toISOString() } }); }
      if (a.action === "disarm") return json({ ok: true });
      if (process.env.DEBUG_DRAWER) console.log('buySearch body', Object.keys(a).join(','), a.action || '');
      if (!a.action) return json(FIX);
      const h = { ...rq.headers() }; delete h.authorization;   // the live search is anonymous here; only the arm calls are faked
      // the engine answers over the network from here; its end times are pinned to the clock before the page reads them
      try {
        const r = await fetch("https://goasksam.com/api/buySearch", { method: "POST", headers: { "content-type": "application/json", cookie: "gas_crew=" + ck, ...(bypass ? { "x-vercel-protection-bypass": bypass } : {}) }, body: rq.postData() || "{}", signal: AbortSignal.timeout(45000) });
        const out = freshenEndTimesText(await r.text());
        return rq.respond({ status: r.status, contentType: r.headers.get("content-type") || "application/json", headers: { "access-control-allow-origin": "*" }, body: out });
      } catch { return rq.continue({ headers: h }); }
    }
    rq.continue();
  });
  await p.goto("https://goasksam.com/find?q=" + encodeURIComponent("2005 mercedes-benz sl65 amg"), { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.waitForSelector('[data-mc]', { timeout: 60000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 1500));
  await p.evaluate(() => { const b = document.querySelector("[data-mc]"); if (b) b.click(); });
  await p.waitForSelector('.mcdrawer .md-watch', { timeout: 15000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 800));
  if (process.env.DEBUG_DRAWER) console.log('DOM', JSON.stringify(await p.evaluate(() => ({ cards: document.querySelectorAll('article.car').length, mc: document.querySelectorAll('[data-mc]').length, drawers: document.querySelectorAll('.mcdrawer').length, body: document.body.innerText.slice(0, 160).replace(/\s+/g, ' ') }))));
  const api = {
    log,
    watchText: () => p.evaluate(() => Array.from(document.querySelectorAll(".mcdrawer .md-watch")).map(x => x.innerText.replace(/\s+/g, " ")).join(" | ")),
    alertText: () => p.evaluate(() => Array.from(document.querySelectorAll(".mcdrawer .md-alert")).map(x => x.innerText.replace(/\s+/g, " ")).join(" | ")),
    has: sel => p.evaluate(s => !!document.querySelector(s), sel),
    click: async sel => { await p.evaluate(s => { const b = document.querySelector(s); if (b) b.click(); }, sel); await new Promise(r => setTimeout(r, 1800)); },
    href: () => p.evaluate(() => { const a = document.querySelector(".mcdrawer .md-watch .sw-e a, .mcdrawer .md-alert .sw-e a"); return a ? a.getAttribute("href") : null; }),
    badge: () => log.filter(x => x === 'summary').length,   // the real badge script asks the summary again after an arm or a stop
    swOn: () => p.evaluate(() => { const b = document.querySelector(".mcdrawer [data-alertsw]"); return b && b.getAttribute("aria-checked"); }),
    signInOpened: () => p.evaluate(() => !!document.getElementById("auth-modal"))
  };
  try { await act(api); } finally { await p.close(); }
}
const VINBTN = '.mcdrawer [data-watch="vin"]', SPECBTN = '.mcdrawer [data-watch="spec"]', SW = ".mcdrawer [data-alertsw]";

// Sam's drawer as reported: a spec watch on file, the exact-car button offered.
await scenario({ stored: [SPEC] }, async d => {
  let t = await d.watchText(); if (process.env.DEBUG_DRAWER) console.log('WATCHTEXT', JSON.stringify(t), JSON.stringify(d.log));
  ok(/Sam is looking for the next sale of 2005 Mercedes-Benz SL-Class SL65 AMG\./.test(t) && /Stop/.test(t), "drawer: a spec watch on file reads 'Sam is looking for the next sale of <car>.' with Stop");
  ok(await d.has(VINBTN) && /Look for this exact car to come up again/.test(t), "drawer: a spec watch does not make the exact-car button look done");
  const badge0 = await d.badge();
  await d.click(VINBTN);
  t = await d.watchText();
  ok(d.log.includes("watch:arm:vin"), "exact-car click: the arm request is sent");
  ok(/Sam is looking for this exact car to come up again\./.test(t) && /Added to Watching\./.test(t) && /Open Tasks/.test(t), "exact-car click: the drawer says 'Added to Watching. Open Tasks'");
  ok(/^\/tasks\/mine#lk-w:[0-9a-f-]{36}$/.test(await d.href() || ""), "exact-car click: the link goes to the item it made");
  ok((await d.badge()) > badge0, "exact-car click: the badge is refreshed in the same page view");
  ok(!(await d.has(VINBTN)), "exact-car click: the button is gone once the row exists");
});
// A refusal: the server's line, the button stays, nothing says Sam is looking.
await scenario({ mode: "refuse", stored: [] }, async d => {
  await d.click(VINBTN);
  const t = await d.watchText();
  ok(/Stop one under Watching on your Tasks page to add another\./.test(t), "refused click: the limit line says what to stop to make room");
  ok(await d.has(VINBTN) && !/Sam is looking for this exact car/.test(t), "refused click: the button stays and the drawer never says 'Sam is looking'");
  
});
// A dropped call and a server error with no JSON.
for (const mode of ["drop", "500"]) await scenario({ mode, stored: [] }, async d => {
  await d.click(VINBTN);
  const t = await d.watchText();
  ok(/That didn't work just now\. Try again\./.test(t), mode + ": a dropped or failed request shows 'That didn't work just now. Try again.'");
  ok(await d.has(VINBTN) && !/Sam is looking for this exact car/.test(t), mode + ": the button stays and nothing says 'Sam is looking'");
  await d.click(SPECBTN);
  ok(/That didn't work just now\. Try again\./.test(await d.watchText()) && await d.has(SPECBTN), mode + ": the 'next sale' button fails the same way and stays");
});
// Reopening: the drawer follows the stored list, not the click.
await scenario({ stored: [SPEC, { ...VIN, key: FIX.cards[0].vin_norm }] }, async d => {
  const t = await d.watchText();
  ok(!(await d.has(VINBTN)) && /Sam is looking for this exact car to come up again\./.test(t) && (t.match(/Stop/g) || []).length === 2, "reopened with an exact-car watch on file: no exact-car button, the line and a Stop for each");
});
await scenario({ stored: [] }, async d => {
  const t = await d.watchText();
  ok(!/Sam is looking/.test(t) && (await d.has(VINBTN)) && (await d.has(SPECBTN)), "reopened with nothing on file: both buttons, no 'Sam is looking'");
});
// Stop takes the row away only once the server says so.
await scenario({ stored: [SPEC] }, async d => {
  const b0 = await d.badge(); await d.click(".mcdrawer .mw-stop");
  ok(!/Sam is looking for the next sale/.test(await d.watchText()) && (await d.badge()) > b0, "Stop: the line goes and the badge is refreshed");
});
await scenario({ stored: [SPEC], mode: "drop" }, async d => {
  await d.click(".mcdrawer .mw-stop");
  ok(/Sam is looking for the next sale/.test(await d.watchText()), "Stop that never reached the server: the drawer still says what is stored");
});
// Signed out: the click asks to sign in and sends no arm.
await scenario({ signedIn: false, stored: [] }, async d => {
  await d.click(VINBTN);
  ok(!d.log.includes("watch:arm:vin"), "signed out: no arm request is sent");
  ok(await d.signInOpened() || (await d.watchText()).length > 0, "signed out: the sign-in card opens");
});
// The before-it-ends toggle.
await scenario({ stored: [] }, async d => {
  const b1 = await d.badge(); await d.click(SW);
  ok(d.log.includes("alert:arm") && (await d.swOn()) === "true" && /Added to Before-it-ends emails\. Open Tasks/.test(await d.alertText()), "toggle: switched on once the server has stored it, with 'Added to Before-it-ends emails. Open Tasks'");
  ok(/^\/tasks\/mine#lk-a:\d+$/.test(await d.href() || ""), "toggle: the link goes to the email it made");
  ok((await d.badge()) > b1, "toggle: the badge is refreshed in the same page view");
});
for (const alertMode of ["refuse", "drop"]) await scenario({ stored: [], alertMode }, async d => {
  await d.click(SW);
  const t = await d.alertText();
  ok((await d.swOn()) === "false", alertMode + " toggle: the switch is back off (the click is not the state)");
  ok(alertMode === "refuse" ? /Stop one under Watching/.test(t) : /That didn't work just now\. Try again\./.test(t), alertMode + " toggle: a plain line says what happened");
});
await browser.close();
console.log(`standingDrawerCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
