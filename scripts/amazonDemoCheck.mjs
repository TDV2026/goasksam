// LIVE: this script calls production (goasksam.com). Run it only in a gap the lanes name, with the protection-bypass header (Lane F's rule). Refuses without --live.
// THE AMAZON AUTOS DEMO, SPEED AND DATA (Lane E, Oct 20 2026; Sam's demo spec, stage 5). Live, read-only, zero
// OldCarsData, one page at a time in a real browser, behind the demo gate with the signed crew cookie (Keychain item
// goasksam-crew, never printed; never the partner code), the probe key and the protection-bypass header (both from the
// environment, never printed). For each of the seven demo cars and each tab (a, b, c):
//   one read of the partner answer per page; the time to that answer and to the module; noindex; every partner photo
//   asks a width; no blank module; the module's range, count and sales equal the partner answer's; the partner answer
//   equals Market Check's (POST /api/sellerDecision oneBox) for the same car: range, count; the thin C63 has no
//   range and no "Sample asking price" and shows the engine's words; the page text has no dash, no "AI", no "our data",
//   no venue name, no verdict word; every partner control is inert (no navigation, no request of its own).
//   CREW=... PROBE_KEY=... VERCEL_AUTOMATION_BYPASS_SECRET=... node scripts/amazonDemoCheck.mjs [--cars 0,5] [--views c]
import puppeteer from "puppeteer-core";
if (!process.argv.includes("--live")) { console.log("amazonDemoCheck: LIVE script (production). Pass --live, in a named gap only."); process.exit(2); }
const arg = n => { const i = process.argv.indexOf("--" + n); return i < 0 ? null : process.argv[i + 1]; };
const BASE = "https://goasksam.com", HOST = "goasksam.com";
const KEY = process.env.PROBE_KEY, CREW = process.env.CREW, BYP = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
if (!KEY || !CREW) { console.log("amazonDemoCheck: PROBE_KEY and CREW (the signed crew cookie value) are required."); process.exit(2); }
const { AMAZON_DEMO_CARS: CARS } = await import("../api/_amazonDemoCars.js");   // Sam's approved seven (R2-C); index 6, the C63, is the thin one
const THIN = CARS.findIndex(c => /C63/.test(c));
const pick = (s, all) => (s ? s.split(",").map(x => x.trim()) : all);
const carIdx = pick(arg("cars"), CARS.map((_, i) => String(i))).map(Number), views = pick(arg("views"), ["c", "a", "b"]);
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OWN = { "x-ops-key": KEY, "x-launch-stage-test": "2", ...(BYP ? { "x-vercel-protection-bypass": BYP } : {}) };
const usd = n => "$" + Math.round(Number(n)).toLocaleString("en-US");
const BAD_TEXT = [["en or em dash", /[–—]/], ["AI", /\bAI\b/], ["our data", /our data/i], ["venue name", /Bring a Trailer|Cars & Bids|RM Sotheby|Mecum|Bonhams|Gooding|Hagerty|PCAR|Barrett|Collecting Cars|PistonHeads/i], ["verdict word", /\b(worth|valuation|estimate(?! payments)|appraisal|undervalued|overvalued|good deal|great deal|fair price)\b/i]];
// "Estimate payments" is the sample dealer listing's finance widget (Amazon's chrome, not our voice) and is allowed;
// any other "estimate" fails. The R2-C demo navigation (the tab d cards, Back to search results) navigates by design.
// Market Check for the same car (the engine's own answer through the One Box path).
async function marketCheck(q) {
  const r = await fetch(BASE + "/api/sellerDecision", { method: "POST", headers: { ...OWN, "Content-Type": "application/json", Cookie: "gas_crew=" + CREW }, body: JSON.stringify({ oneBox: true, anonId: "amazoncheck", car: { raw: q }, asked: 0 }) });
  const d = await r.json().catch(() => null);
  return d ? { tier: d.tier, count: d.soldCountN ?? d.poolN ?? (d.thin && d.thin.totalN) ?? null, range: Array.isArray(d.cluster) ? d.cluster : null } : { error: r.status };
}
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", protocolTimeout: 600000, args: ["--no-sandbox"] });
let fails = 0, rows = 0;
const fail = (where, m) => { fails++; console.log(`  FAIL ${where}: ${m}`); };
const mcCache = {};
try {
  for (const i of carIdx) for (const v of views) {
    rows++;
    const where = `car ${i} "${CARS[i]}" tab ${v}`;
    const pg = await browser.newPage(); await pg.setViewport({ width: 1440, height: 1000 });
    await pg.setCookie({ name: "gas_crew", value: CREW, domain: HOST, path: "/" });
    await pg.setRequestInterception(true);
    const reqs = [], answers = []; let T0 = 0;
    let askedQ = null;
    pg.on("request", r => { let own = false; try { own = new URL(r.url()).host === HOST; } catch {} if (own && /\/api\/partnerAnswer$/.test(new URL(r.url()).pathname) && r.method() === "POST" && askedQ == null) { try { askedQ = JSON.parse(r.postData() || "{}").q || null; } catch {} } if (own) reqs.push({ url: r.url().replace(BASE, ""), method: r.method(), at: Date.now() - T0 }); r.continue(own ? { headers: { ...r.headers(), ...OWN } } : undefined); });
    pg.on("response", async res => { if (/\/api\/partnerAnswer$/.test(new URL(res.url()).pathname) && res.request().method() === "POST") { try { answers.push({ at: Date.now() - T0, j: await res.json() }); } catch { answers.push({ at: Date.now() - T0, j: null }); } } });
    T0 = Date.now();
    const resp = await pg.goto(`${BASE}/preview?p=amazon&view=${v}&car=${i}`, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(e => null);
    const status = resp ? resp.status() : 0;
    if (status !== 200) { fail(where, `page answered ${status}`); await pg.close(); continue; }
    // Tab c keeps the module collapsed: open it, as a buyer would.
    if (v === "c") await pg.evaluate(() => { const b = document.querySelector("[data-mc-toggle]"); if (b) b.click(); }).catch(() => {});
    let moduleAt = null;
    for (let k = 0; k < 120 && moduleAt == null; k++) { const has = await pg.evaluate(() => !!document.querySelector(".sfc-card, .sfc-thin, .mc-body .sfc-card") || !!document.querySelector(".mc-body .ask, .out .ask, [data-chip], .chips button, .sfc-question") || /Which body|Which one|Which model|Which generation/i.test((document.querySelector(".mc-body, .out, main") || document.body).innerText) || /Sales of cars like it|sold between|have sold/i.test((document.querySelector(".mc-body, .out, main") || document.body).innerText)).catch(() => false); if (has) moduleAt = Date.now() - T0; else await new Promise(r => setTimeout(r, 250)); }
    await new Promise(r => setTimeout(r, 800));
    const a = (answers[0] || {}).j;
    const dom = await pg.evaluate(() => ({ text: document.body.innerText, robots: (document.querySelector('meta[name="robots"]') || {}).content || "", imgs: [...document.images].map(im => im.getAttribute("src") || ""), card: (document.querySelector(".sfc-card") || {}).innerText || "", sample: /Sample asking price/.test(document.body.innerText), rows: document.querySelectorAll(".sfc-card li, .sfc-sales li, .sfc-row").length }));
    const tag = `answer ${answers.length} read(s), first at ${answers[0] ? answers[0].at : "-"} ms, module at ${moduleAt ?? "never"} ms`;
    console.log(`${where}: asked "${askedQ}", ${tag}; ${a ? a.answerType : "no answer"}${a && a.range ? " " + usd(a.range.low) + " to " + usd(a.range.high) : ""}${a && a.count != null ? ", " + a.count + " sales" : ""}`);
    if (answers.length !== 1) fail(where, `${answers.length} partner answer reads (one expected)`);
    if (!/noindex/.test(dom.robots)) fail(where, `robots meta "${dom.robots}"`);
    if (moduleAt == null) fail(where, "no module drawn (blank module)");
    const noWidth = dom.imgs.filter(s => /\/api\/partnerAnswer\?photo=/.test(s) && !/[?&]w=\d+/.test(s)); if (noWidth.length) fail(where, `${noWidth.length} photo(s) without a width`);
    for (const [n, re] of BAD_TEXT) { const m = re.exec(dom.text); if (m) fail(where, `${n} in the page text: "${dom.text.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\s+/g, " ")}"`); }
    if (a && a.range) { if (!dom.text.includes(usd(a.range.low)) || !dom.text.includes(usd(a.range.high))) fail(where, `the module does not show the answer's range ${usd(a.range.low)} to ${usd(a.range.high)}`); }
    if (i === THIN) { if (a && a.range) fail(where, "the thin C63 carries a range"); if (dom.sample) fail(where, "a Sample asking price on the thin C63"); }
    if (a && !a.range && dom.sample) fail(where, "a Sample asking price on a car with no range");
    // Market Check for the same car, once per car.
    if (a && (a.answerType === "range" || a.answerType === "not_enough_data")) {
      const askQ = askedQ || CARS[i], mcKey = askQ.toLowerCase();
      const mc = mcCache[mcKey] || (mcCache[mcKey] = await marketCheck(askQ));   // the car the page asked for (tab c asks the sample listing's own car, e.g. the Fastback)
      const same = (a.range ? (mc.range && mc.range[0] === a.range.low && mc.range[1] === a.range.high) : !mc.range) && (a.count == null || mc.count == null || Number(a.count) === Number(mc.count));
      if (!same) fail(where, `partner answer ${a.range ? usd(a.range.low) + " to " + usd(a.range.high) : "no range"} ${a.count} against Market Check ${mc.range ? usd(mc.range[0]) + " to " + usd(mc.range[1]) : "no range"} ${mc.count} (${mc.tier || mc.error})`);
    }
    // Inert: every partner control does nothing (no navigation, no request of its own).
    const before = pg.url(), n0 = reqs.length;
    const clicked = await pg.evaluate(() => { const ok = el => !el.closest(".demo-bar, .tabs, .carbar, .carpick, [data-mc-toggle], .pop, .inline-hist, .sfc-card, .dcard, .back, [data-back]") && !/Back to search results/.test(el.innerText || "") && !/How Sam decides/.test(el.innerText || "") && !/^(Check|Look up|Show|Close)$/.test((el.innerText || "").trim()) && !el.closest(".ask, .chips, [data-chip], .sfc-question, .qchips"); const els = [...document.querySelectorAll("button, a, input[type=submit]")].filter(ok); els.forEach(el => { try { el.click(); } catch {} }); return els.map(el => (el.innerText || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 30)); });
    await new Promise(r => setTimeout(r, 1200));
    const after = pg.url(), extra = reqs.slice(n0).filter(r => !/\.(png|jpe?g|webp|svg|ico)(\?|$)|[?&](photo|img)=/.test(r.url));
    if (after !== before) fail(where, `a control navigated to ${after}`);
    if (extra.length) fail(where, `controls made ${extra.length} request(s): ${extra.slice(0, 3).map(r => r.method + " " + r.url).join(", ")}`);
    console.log(`  inert: ${clicked.length} control(s) clicked, no navigation ${after === before ? "yes" : "NO"}, own requests ${extra.length}`);
    await pg.close();
  }
  // THE GATE (Sam's demo spec): a private window (a fresh context, no crew cookie, no partner cookie) never sees the demo.
  if (!arg("cars")) { const ctx = await browser.createBrowserContext(); const pg = await ctx.newPage(); if (BYP) await pg.setExtraHTTPHeaders({ "x-vercel-protection-bypass": BYP });
    for (const v of ["a", "b", "c"]) { rows++; const r = await pg.goto(`${BASE}/preview?p=amazon&view=${v}`, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => null); const t = await pg.evaluate(() => document.body.innerText).catch(() => "");
      const shown = /Sample listing|Market Check|Type your car or paste a VIN/.test(t); console.log(`private window, tab ${v}: status ${r ? r.status() : 0}, demo shown ${shown ? "YES" : "no"}`); if (shown) fail(`private window tab ${v}`, "the demo is visible without the gate"); }
    await ctx.close(); }
} finally { await browser.close(); }
console.log(fails ? `amazonDemoCheck: ${rows} pages, ${fails} FAIL` : `amazonDemoCheck: ${rows} pages, all pass`);
process.exit(fails ? 1 : 0);
