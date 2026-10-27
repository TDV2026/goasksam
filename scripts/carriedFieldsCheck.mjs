// THE ENGINE'S EXPLANATION TRAVELS WITH ITS NUMBER (Sam, Oct 27 2026). A number on one surface without its reason on another is a fail. The reasons are the engine's own fields: scope_reason (why the
// years shown are not the year typed), scopeLabel / rungLabel (what the number covers), windowNote with windowLonger (the longer window it reads), refusal_line (why there is no figure), mileageNote
// (why the miles typed could not narrow it). Real engine answers (scripts/fixtures): the 2001 BMW M3, the 2006 BMW 325i (325i and 325xi, 36 months), the 2001 Lamborghini Diablo SE (one sale), the
// 1974 Triumph Stag (no 1974 sales, shows 1973); plus a refusal and a typed-miles case on the M3. Surfaces: Market Check (the real page, in Chrome), Sell and the partner pages (the shared card, Sell
// through its own card fields), Find's card (the real Find path: coreOf, marketFromCore, samLines, the card code) and the Tasks email (the same pieces). Find has no typed miles, so mileageNote is
// checked on the others.   No network.   node scripts/carriedFieldsCheck.mjs
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
process.env.LAUNCH_STAGE = "2"; process.env.SUPABASE_URL = "https://example.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "x";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname); process.chdir(ROOT);
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
globalThis.fetch = async () => { throw new Error("no network in this check"); };
const rd = f => JSON.parse(fs.readFileSync("scripts/fixtures/" + f, "utf8"));
const norm = h => String(h || "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/&#8217;/g, "’").replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const CARS = {
  m3: { q: "2001 BMW M3", d: rd("m3Answer.json"), row: { listing_title: "2001 BMW M3 Coupe", year: 2001, make: "BMW", model: "M3" } },
  "325i": { q: "2006 BMW 325i Sedan", d: rd("answer-325i.json"), row: { listing_title: "2006 BMW 325i Sedan", year: 2006, make: "BMW", model: "325i" } },
  diablo: { q: "2001 Lamborghini Diablo SE Coupe", d: rd("answer-diablo.json"), row: { listing_title: "2001 Lamborghini Diablo SE Coupe", year: 2001, make: "Lamborghini", model: "Diablo" } },
  stag: { q: "1974 Triumph Stag", d: rd("answer-stag.json"), row: { listing_title: "1974 Triumph Stag", year: 1974, make: "Triumph", model: "Stag" } },
};
// the two synthetic cases ride on the M3's real answer
CARS.miles = { q: "2001 BMW M3", d: { ...CARS.m3.d, mileageNote: "Too few sales near 200,000 miles, so this reads all of them." }, row: CARS.m3.row, noFind: true };
CARS.refusal = { q: "1985 Land Rover Defender 110", d: { status: "one_box", tier: "refusal", cluster: null, poolN: 0, samLine: "Sales too spread out for a range.", refusal_line: "Sam could not verify this one, so no figures are shown.", refusal: { kind: "invariant_failed" }, cards: [], rungLabel: "1985 Defender 110" }, row: { listing_title: "1985 Land Rover Defender 110", year: 1985, make: "Land Rover", model: "Defender" }, noFind: true, noScope: true };
// the reasons the engine gives for a car's number
const reasonsOf = d => ({
  scope_reason: d.scope_reason || null, scope: d.scopeLabel || d.rungLabel || null,
  window: d.windowLonger === true && d.windowNote ? d.windowNote : null, refusal: d.tier === "refusal" ? d.refusal_line || null : null, mileage: d.mileageNote || null,
});
const has = (text, s) => text.includes(norm(s));

// 1. Market Check, the real page
const surfaces = {};   // car -> surface -> text
{
  const { default: h } = await import(pathToFileURL(path.join(ROOT, "api/marketCheck.js")).href);
  const html = await new Promise(r => { const res = { setHeader() {}, getHeader() {}, status() { return res; }, send(x) { r(String(x)); return res; }, end(x) { r(String(x || "")); return res; } }; h({ method: "GET", url: "/market-check", query: {}, headers: { host: "goasksam.com", cookie: "" }, socket: {} }, res); });
  const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (!fs.existsSync(CHROME)) console.log("SKIP Market Check in Chrome: no Chrome at " + CHROME);
  else {
    const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
    for (const [k, c] of Object.entries(CARS)) {
      const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 }); await p.setRequestInterception(true);
      p.on("request", r => { const u = new URL(r.url());
        if (u.host === "goasksam.com" && r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html", body: html });
        const loc = /^\/obx\.[^/]+\/onebox\.js$/.test(u.pathname) ? "public/js/onebox.js" : (/^\/js(?:\.[^/]+)?\/([\w.-]+\.js)$/.exec(u.pathname) ? "public/js/" + /^\/js(?:\.[^/]+)?\/([\w.-]+\.js)$/.exec(u.pathname)[1] : null);
        if (u.host === "goasksam.com" && loc && fs.existsSync(loc)) return r.respond({ status: 200, contentType: "application/javascript", body: fs.readFileSync(loc, "utf8") });
        if (u.host === "goasksam.com" && u.pathname === "/api/sellerDecision") return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(c.d) });
        if (u.host === "goasksam.com" && /^\/api\//.test(u.pathname)) return r.respond({ status: 200, contentType: "application/json", body: "{}" });
        if (u.host !== "goasksam.com") return r.respond({ status: 204, body: "" }); r.continue(); });
      await p.goto("https://goasksam.com/market-check", { waitUntil: "networkidle2" }).catch(() => {});
      await p.type("#ob-input", c.q); await p.keyboard.press("Enter"); await new Promise(r => setTimeout(r, 1800));
      if (k === "miles") { await p.type("#ob-miles", "200000"); await p.click("#ob-miles-go"); await new Promise(r => setTimeout(r, 1800)); }   // the note is printed once the visitor has typed miles
      (surfaces[k] = surfaces[k] || {}).mc = norm(await p.evaluate(() => (document.querySelector("#ob") || document.body).innerText));
      await p.close();
    }
    await b.close();
  }
}
// 2. Sell (through its own card fields) and the partner pages (the card as it comes)
{
  const card = await import("../lib/sellsForCard.js"), sf = await import("../lib/sell/sellFacts.js");
  for (const [k, c] of Object.entries(CARS)) { (surfaces[k] = surfaces[k] || {}).sell = norm(card.sellsForCardHtml(sf.cardAnswerOf(c.d), { marketHref: "/market-check?q=x" })); surfaces[k].partner = norm(card.sellsForCardHtml(c.d, {})); }
}
// 3. Find's card and the Tasks email (the real Find path, the same pieces)
{
  const S = await import("../lib/live/search.js"), { samLines } = await import("../api/buySearch.js"), { emailCardData } = await import("../lib/tasks/emailCards.js");
  for (const [k, c] of Object.entries(CARS)) {
    if (c.noFind) continue;
    if (typeof S.marketFromCore !== "function") { ok(false, "Find: lib/live/search.js exports marketFromCore, the real Find market object, so it can be checked"); continue; }
    const spec = S.specOf(c.row), core = S.coreOf(c.d, spec), m = S.marketFromCore(core, c.row, { miles: null }, spec);
    const l = { id: 1, title: c.row.listing_title, make: c.row.make, year: c.row.year, market: m }; l.sam_lines = samLines(l, Date.now());
    const t = norm(emailCardData(l).sam.map(x => x.text).join(" "));
    (surfaces[k] = surfaces[k] || {}).find = t; surfaces[k].email = t;
  }
}
// 4. every number carries its reason on every surface that prints it
for (const [k, c] of Object.entries(CARS)) {
  const R = reasonsOf(c.d), S = surfaces[k] || {};
  for (const [surf, text] of Object.entries(S)) {
    const where = `${k} on ${surf}`;
    ok(text.length > 15, `${where}: not blank`);
    ok(!/undefined|NaN|\[object/.test(text), `${where}: nothing broken prints`);
    if (R.scope_reason) ok(has(text, R.scope_reason), `${where}: the scope reason is printed ("${R.scope_reason}")`);
    if (R.window) ok(has(text, R.window), `${where}: the longer window is printed ("${R.window}")`);
    if (R.refusal) ok(has(text, R.refusal) && !/Sales too spread out for a range/.test(text), `${where}: a refusal says the engine's reason, not a sentence of the card's own ("${R.refusal}")`);
    if (R.mileage) ok(has(text, R.mileage), `${where}: the mileage note is printed ("${R.mileage}")`);
    if (R.scope && !c.noScope && surf !== "mc") ok(has(text, R.scope), `${where}: what the number covers is printed ("${R.scope}")`);
  }
}
// 5. the fields are on the one list, and the check is reading the real thing
{ const { CARD_FIELDS } = await import("../lib/engineFields.js");
  for (const k of ["scope_reason", "rungLabel", "scopeLabel", "refusal_line", "windowNote", "windowLonger", "mileageNote"]) ok(CARD_FIELDS.includes(k), `${k} is on the card list`);
  ok(Object.keys(surfaces).length === Object.keys(CARS).length && Object.values(surfaces).every(s => ["sell", "partner"].every(x => s[x])), "every car was rendered on Sell and the partner pages"); }
console.log(`carriedFieldsCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
