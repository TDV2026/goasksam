// LIVE SMOKE (Lane C, Nov 17 2026). Run after every push, against the deployed site. READ ONLY: it loads pages and types searches into Market Check, nothing is saved, no case,
// task or account is created, no write endpoint is called. It runs as a visitor (no cookie) and with the crew cookie, and fails loudly: one line per assertion, a count, exit 1 on any FAIL.
//   node scripts/liveSmoke.mjs [--site https://goasksam.com]
// The crew cookie and the protection bypass are read from the Keychain (goasksam-crew, goasksam-bypass) or from GAS_CREW_COOKIE / GAS_BYPASS, in process only, never printed.
// Rule: the pages compute nothing; every assertion reads what the page printed from the engine's answer. Waits are for a named condition, never a fixed pause (liveWaitsCheck).
import { execFileSync } from "node:child_process";
import puppeteer from "puppeteer-core";

const SITE = (process.argv.includes("--site") ? process.argv[process.argv.indexOf("--site") + 1] : process.env.SITE || "https://goasksam.com").replace(/\/$/, "");
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const key = (envName, service) => { if (process.env[envName]) return process.env[envName]; try { return execFileSync("security", ["find-generic-password", "-s", service, "-w"], { encoding: "utf8" }).trim(); } catch { return ""; } };
const CREW = key("GAS_CREW_COOKIE", "goasksam-crew").replace(/^gas_crew=/, "").split(";")[0];
const BYPASS = key("GAS_BYPASS", "goasksam-bypass");

let pass = 0, fail = 0;
const check = (name, ok, detail) => { if (ok) { pass++; console.log("PASS  " + name); } else { fail++; console.log("FAIL  " + name + (detail !== undefined ? "  ->  " + String(detail).replace(/\s+/g, " ").slice(0, 300) : "")); } };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const host = new URL(SITE).hostname;
async function open(crew) {
  const p = await browser.newPage(); await p.setViewport({ width: 1440, height: 900 });
  if (BYPASS) await p.setExtraHTTPHeaders({ "x-vercel-protection-bypass": BYPASS });
  if (!crew) await p.deleteCookie({ name: "gas_crew", domain: host, path: "/" });   // one browser holds the cookies of every page: a visitor page must never inherit the crew cookie an earlier page set
  if (crew) { if (!CREW) throw new Error("no crew cookie (Keychain goasksam-crew)"); await p.setCookie({ name: "gas_crew", value: CREW, domain: host, path: "/", secure: SITE.startsWith("https") }); }
  return p;
}
const textOf = p => p.evaluate(() => document.body.innerText.replace(/\n+/g, " | "));
// the Market Check card has answered: the card heading is up and it shows a range or asks a question
const ANSWERED = () => { const t = document.body.innerText; return !t.includes("What have cars like yours sold for?") && t.includes("Search a car") && t.includes("MARKET CHECK") && (/\$[\d,]+ to \$[\d,]+/.test(t) || /Which |I can't read|Too few/.test(t)); };
// poll for the answer once a second (a page context can be replaced when the page moves to its own address, so every read is guarded); a named condition with a 90 s ceiling, never a fixed pause
const answered = async p => { const end = Date.now() + 90000; while (Date.now() < end) { try { if (await p.evaluate(ANSWERED)) return true; } catch { /* the page is moving: ask again */ } await new Promise(r => setTimeout(r, 1000)); } return false; };
async function mcSearch(crew, typed) {
  const p = await open(crew);
  await p.goto(SITE + "/market-check", { waitUntil: "networkidle2" });
  await p.type("#pq", typed); await p.keyboard.press("Enter");
  const ok = await answered(p);
  return { p, ok, text: await textOf(p), url: p.url(), miles: await p.$eval("#ob-miles", e => e.value).catch(() => null) };
}
// settle: the page text is the same on two reads half a second apart (a named condition, ceiling 12 s), never a fixed pause
const quiet = async p => { let last = null; const end = Date.now() + 12000; while (Date.now() < end) { let t = null; try { t = await p.evaluate(() => document.body.innerText); } catch { /* moving */ } if (t !== null && t === last) return; last = t; await new Promise(r => setTimeout(r, 500)); } };
const noBar = p => p.evaluate(() => { const s = document.getElementById("gas-carbar"); return !s || s.hidden || !s.querySelector(".gcb-line"); });

// ---- 1. visitor: Market Check ----------------------------------------------------------------------------------------------------------------------------------------------------
const SL = "2003 Mercedes-Benz SL500 38,400 miles";
let sl = await mcSearch(false, SL);
check("MC visitor: '" + SL + "' answers", sl.ok, sl.text.slice(0, 200));
check("MC visitor: the card is the SL500", /MARKET CHECK \| 2003 Mercedes-Benz SL-Class SL500/.test(sl.text) || /MARKET CHECK \| 2003 Mercedes-Benz SL500/.test(sl.text), sl.text.slice(0, 300));
check("MC visitor: the mileage box holds 38,400", /^38,?400$/.test(String(sl.miles || "")), sl.miles);
check("MC visitor: the range is narrowed to that band ('within N miles of 38,400' and a $ range)", /within [\d,]+ miles of 38,400/.test(sl.text) && /\$[\d,]+ to \$[\d,]+/.test(sl.text), sl.text.slice(0, 400));
check("MC visitor: no \"Sam didn't use\" notice", !/didn't use/i.test(sl.text), (sl.text.match(/Sam didn't use[^|]*/) || [""])[0]);
check("MC visitor: the car bar shows (it is public)", !(await noBar(sl.p)));
const slUrl = sl.url; await sl.p.close();
check("MC visitor: the address the page writes carries the car", /[?&]car=/.test(slUrl), slUrl);

const reopen = await open(false); await reopen.goto(slUrl, { waitUntil: "networkidle2" });
const reOk = await answered(reopen), reText = await textOf(reopen), reMiles = await reopen.$eval("#ob-miles", e => e.value).catch(() => null);
check("MC visitor: that address reopens to the SL500", reOk && /SL500/.test(reText), reText.slice(0, 200));
check("MC visitor: ...with 38,400 miles in the box and the band", /^38,?400$/.test(String(reMiles || "")) && /within [\d,]+ miles of 38,400/.test(reText), reMiles);
check("MC visitor: ...and no notice", !/didn't use/i.test(reText), (reText.match(/Sam didn't use[^|]*/) || [""])[0]);
await reopen.close();

const M3 = "2001 BMW M3 62,328 miles sunroof";
const m3 = await mcSearch(false, M3);
const m3Notice = (m3.text.match(/Sam didn't use ([^|]*)/) || [null, null])[1];
check("MC visitor: '" + M3 + "' answers as the M3", m3.ok && /MARKET CHECK \| 2001 BMW M3/.test(m3.text), m3.text.slice(0, 200));
check("MC visitor: the notice names sunroof only", !!m3Notice && /sunroof/.test(m3Notice) && !/62|328|miles/i.test(m3Notice), m3Notice);
await m3.p.close();

const PO = await mcSearch(false, "1999 Porsche 45,911 miles");
check("MC visitor: '1999 Porsche 45,911 miles' asks which Porsche", PO.ok && /Which Porsche\?/.test(PO.text) && /911/.test(PO.text) && /Boxster/.test(PO.text), PO.text.slice(0, 250));
check("MC visitor: ...and does not answer for a 911 (no range printed)", !/\$[\d,]+ to \$[\d,]+/.test(PO.text), PO.text.slice(0, 250));
await PO.p.close();

const BX = await mcSearch(false, "1999 Porsche Boxster 45,911 miles");
check("MC visitor: '1999 Porsche Boxster 45,911 miles' gives a range", BX.ok && /MARKET CHECK \| 1999 Porsche Boxster/.test(BX.text) && /\$[\d,]+ to \$[\d,]+/.test(BX.text), BX.text.slice(0, 250));
check("MC visitor: ...on the miles band, mileage box 45,911", /within [\d,]+ miles of 45,911/.test(BX.text) && /^45,?911$/.test(String(BX.miles || "")), BX.miles);
check("MC visitor: ...no notice", !/didn't use/i.test(BX.text), (BX.text.match(/Sam didn't use[^|]*/) || [""])[0]);
await BX.p.close();

const FI = await mcSearch(false, "Fiat 500");
check("MC visitor: 'Fiat 500' stays a Fiat 500", FI.ok && /MARKET CHECK \| Fiat 500/.test(FI.text) && !/Fiat 5000|Fiat 50\b/.test(FI.text), FI.text.slice(0, 250));
check("MC visitor: ...and asks which one it is", /Which one is it\?/.test(FI.text), FI.text.slice(0, 250));
await FI.p.close();

// ---- 1b. visitor: the Firebird, the variants (Nov 17 2026, after lane-b-variants-merged and variant-2) -----------------------------------------------------------------------------
const RANGE_OK = /\$[\d,]+ to \$[\d,]+/;
const RANGE = /\$[\d,]+ to \$[\d,]+/;
const fb = await mcSearch(false, "1987 Pontiac Firebird");
check("MC visitor: '1987 Pontiac Firebird' gives a range and its count, the whole generation", fb.ok && /MARKET CHECK \| 1987 Pontiac Firebird/.test(fb.text) && RANGE.test(fb.text) && /of the \d+ sales since/.test(fb.text), fb.text.slice(0, 300));
check("MC visitor: ...with no variant question", !/Which (one|variant|Firebird)|Trans Am \([\d]+\) →|Formula \([\d]+\) →/.test(fb.text), fb.text.slice(0, 300));
check("MC visitor: ...and no notice", !/didn't use/i.test(fb.text), (fb.text.match(/Sam didn't use[^|]*/) || [""])[0]);
await fb.p.close();
const ta = await mcSearch(false, "1987 Pontiac Firebird Trans Am");
check("MC visitor: '1987 Pontiac Firebird Trans Am' is the Trans Am with a range and a count", ta.ok && /MARKET CHECK \| 1987 Pontiac Firebird Trans Am/.test(ta.text) && RANGE.test(ta.text) && /of the \d+ sales since/.test(ta.text), ta.text.slice(0, 300));
await ta.p.close();
const gta = await mcSearch(false, "1987 Pontiac Firebird Trans Am GTA");
check("MC visitor: '1987 Pontiac Firebird Trans Am GTA' is the GTA with a range and a count", gta.ok && /MARKET CHECK \| 1987 Pontiac Firebird Trans Am GTA/i.test(gta.text) && RANGE.test(gta.text) && /of the \d+ sales since/.test(gta.text), gta.text.slice(0, 300));
await gta.p.close();
const tur = await mcSearch(false, "1989 Pontiac Firebird Turbo Trans Am");
check("MC visitor: '1989 Pontiac Firebird Turbo Trans Am' is narrowed to turbo with a range and a count", tur.ok && /Narrowed to turbo/.test(tur.text) && RANGE.test(tur.text) && /of the \d+ sales since/.test(tur.text), tur.text.slice(0, 300));
await tur.p.close();
const tam = await mcSearch(false, "1987 Pontiac Firebird Trans Am 42,500 miles");
check("MC visitor: '1987 Pontiac Firebird Trans Am 42,500 miles' keeps the Trans Am and holds 42,500 in the mileage box", tam.ok && /MARKET CHECK \| 1987 Pontiac Firebird Trans Am/.test(tam.text) && /^42,?500$/.test(String(tam.miles || "")), tam.miles + " " + tam.text.slice(0, 200));
check("MC visitor: ...the mileage band is applied, or no mileage chip is shown (variant-3: a band that was not applied prints no chip)", RANGE.test(tam.text) && (/within [\d,]+ miles of 42,500/.test(tam.text) || !/Cars within [\d,]+ miles of 42,500/.test(tam.text)), tam.text.slice(0, 400));
check("MC visitor: ...no notice", !/didn't use/i.test(tam.text), (tam.text.match(/Sam didn't use[^|]*/) || [""])[0]);
await tam.p.close();

// ---- 2. visitor: Sell and Tasks ---------------------------------------------------------------------------------------------------------------------------------------------------
{
  const p = await open(false); await p.goto(SITE + "/sell?car=" + encodeURIComponent("2003 Mercedes-Benz SL500"), { waitUntil: "networkidle2" });
  await p.waitForFunction(() => /Which state is it in\?/.test(document.body.innerText), { timeout: 60000 }).catch(() => {});
  const t = await textOf(p);
  check("Sell visitor: /sell?car=<words> opens on the SL500 at its first question", /SL500/.test(t) && /Which state is it in\?/.test(t), t.slice(0, 250));
  check("Sell visitor: the bar is hidden when no car is given", await noBar(p));
  await p.close();
}
{
  const p = await open(false); await p.goto(SITE + "/tasks", { waitUntil: "networkidle2" });
  const box = await p.$("#pq"), go = await p.$("#pq-form .go");
  check("Tasks signed out: the page offers its request box (#pq) and submit button", !!box && !!go, !!box + "/" + !!go);
  check("Tasks signed out: the bar is hidden when no car is given", await noBar(p));
  await p.close();
}

// ---- 3. the car bar, for the crew and for a visitor (Nov 17 2026: the bar is public; the variant rows stay crew only) ----------------------------------------------------------------------------------
async function barSuite(isCrew, who) {
  const check = (n, o, d) => globalThis.__check(n.replace(/\bcrew\b/g, who), o, d);
  const c = await mcSearch(isCrew, SL);
  check("MC crew: the SL500 answers", c.ok && /SL500/.test(c.text), c.text.slice(0, 200));
  await c.p.waitForFunction(() => { const s = document.getElementById("gas-carbar"); return s && !s.hidden && s.querySelector(".gcb-line"); }, { polling: 500, timeout: 30000 }).catch(() => {});
  const bar = await c.p.evaluate(() => { const s = document.getElementById("gas-carbar"); if (!s || s.hidden) return null; return { line: (s.querySelector(".gcb-line") || {}).textContent || "", pills: [...s.querySelectorAll(".gcb-pill")].map(a => ({ label: a.textContent, href: a.getAttribute("href") })) }; });
  check("MC crew: the car bar shows", !!bar && !!bar.line, JSON.stringify(bar));
  check("MC crew: its line is the SL500 with 38,400 miles", !!bar && /SL500/.test(bar.line) && /38,400 miles/.test(bar.line), bar && bar.line);
  const toks = bar ? bar.pills.map(a => (/[?&]car=([^&]+)/.exec(a.href) || [])[1]).filter(Boolean) : [];
  check("MC crew: four pills (Find, Market Check, Sell, Tasks)", !!bar && bar.pills.length === 4 && ["Find", "Market Check", "Sell", "Tasks"].every((l, i) => bar.pills[i].label === l), bar && bar.pills.map(a => a.label).join(","));
  check("MC crew: the four pills carry one token (a v1 token, the same on all four)", toks.length === 4 && toks.every(x => x === toks[0]) && /^v1\./.test(decodeURIComponent(toks[0] || "")), toks.length + " tokens");
  const findPill = bar && bar.pills.find(a => a.label === "Find"), sellPill = bar && bar.pills.find(a => a.label === "Sell");
  await c.p.close();
  if (findPill) {
    const p = await open(isCrew); await p.goto(new URL(findPill.href, SITE).href, { waitUntil: "networkidle2" });
    await p.waitForFunction(() => /live match|No live|0 live/i.test(document.body.innerText), { timeout: 60000 }).catch(() => {});
    const t = await textOf(p);
    check("Find pill (crew): opens already run for the SL500 (a result line, the car's chips, not the empty prompt)", /live match/i.test(t) && /SL500/.test(t) && !/What car are you looking for\?/.test(t), t.slice(0, 300));
    check("Find pill (crew): the line above the cars names the mileage (the ones within 15,000 miles of 38,400, or none is within it and here is every one)", /None for sale right now is within 15,000 miles of 38,400, so here is every one\.|These are the ones within 15,000 miles of 38,400\./.test(t) && !/38,400 to 38,400/.test(t), t.slice(0, 700));
    check("Find pill (crew): the bar is kept on the Find page", /38,400 miles/.test(t), t.slice(0, 200));
    await p.close();
  } else check("Find pill (crew): opens already run", false, "no Find pill");
  if (sellPill) {
    const p = await open(isCrew); await p.goto(new URL(sellPill.href, SITE).href, { waitUntil: "networkidle2" });
    await p.waitForFunction(() => /Which state is it in\?/.test(document.body.innerText), { timeout: 60000 }).catch(() => {});
    const t = await textOf(p);
    check("Sell pill (crew): opens for the SL500 with the bar (at Sell's first question)", /SL500/.test(t) && /Which state is it in\?/.test(t) && /38,400 miles/.test(t), t.slice(0, 300));
    await p.close();
  } else check("Sell pill (crew): opens for the SL500", false, "no Sell pill");
  // ---- the Tasks pill (Nov 17 2026, lane-s-car-bar-3): it fills the request box with the car in words, puts the cursor in it, and the bar shows with Tasks filled; the other pills return to their tool already run ----
  const tasksPill = bar && bar.pills.find(a => a.label === "Tasks");
  if (tasksPill) {
    const tp = await open(isCrew); await tp.goto(new URL(tasksPill.href, SITE).href, { waitUntil: "networkidle2" });
    const end = Date.now() + 40000; let tk = null;
    while (Date.now() < end) { try { tk = await tp.evaluate(() => { const s = document.getElementById("gas-carbar"), q = document.getElementById("pq"); return { box: q ? q.value : null, focused: !!q && document.activeElement === q, line: s && !s.hidden ? (s.querySelector(".gcb-line") || {}).textContent : null, on: s ? [...s.querySelectorAll(".gcb-pill.on")].map(a => a.textContent) : [], pills: s ? [...s.querySelectorAll(".gcb-pill")].map(a => ({ label: a.textContent, href: a.getAttribute("href") })) : [] }; }); if (tk.box && tk.line) break; } catch { /* moving */ } await new Promise(r => setTimeout(r, 1000)); }
    check("Tasks pill (crew): the request box holds the car in words", !!tk && /SL500/.test(tk.box || ""), tk && tk.box);
    check("Tasks pill (crew): the cursor is in the request box", !!tk && tk.focused, tk && tk.focused);
    check("Tasks pill (crew): the car bar shows above, with Tasks filled", !!tk && !!tk.line && /SL500/.test(tk.line) && tk.on.length === 1 && tk.on[0] === "Tasks", tk && JSON.stringify([tk.line, tk.on]));
    const tks = tk ? tk.pills.map(a => (/[?&]car=([^&]+)/.exec(a.href) || [])[1]).filter(Boolean) : [];
    check("Tasks pill (crew): the other three pills carry the same token as the Market Check bar", tks.length === 4 && tks.every(x => x === toks[0]), tks.length + " tokens");
    for (const [label, ready, re] of [["Find", /live match/i, /SL500/], ["Market Check", null, /SL500/], ["Sell", /Which state is it in\?/, /SL500/]]) {
      const pill = tk && tk.pills.find(a => a.label === label); if (!pill) { check("Tasks to " + label + " (crew): the pill is on the Tasks bar", false, "missing"); continue; }
      const q = await open(isCrew); await q.goto(new URL(pill.href, SITE).href, { waitUntil: "networkidle2" });
      if (label === "Market Check") await answered(q); else await q.waitForFunction(r => new RegExp(r).test(document.body.innerText), { polling: 500, timeout: 60000 }, ready.source).catch(() => {});
      const t = await textOf(q), barLine = await q.evaluate(() => { const s = document.getElementById("gas-carbar"); return s && !s.hidden ? (s.querySelector(".gcb-line") || {}).textContent : null; });
      check("Tasks to " + label + " (crew): already run for the car, with the bar", re.test(t) && (ready ? ready.test(t) : RANGE_OK.test(t)) && !!barLine, t.slice(0, 260));
      await q.close();
    }
    await tp.close();
  } else check("Tasks pill (crew): the pill is on the bar", false, "no Tasks pill");
}
globalThis.__check = check;
if (CREW) await barSuite(true, "crew"); else check("crew cookie available (Keychain goasksam-crew)", false, "missing: the crew assertions did not run");
await barSuite(false, "visitor");
// ---- 3b. Find's one line about the mileage (lane-b-find-line): a search with no mileage keeps "That's everything", a typed ceiling still filters ---------------------------------------------------------------
{
  const findText = async typed => { const p = await open(false); await p.goto(SITE + "/find", { waitUntil: "networkidle2" }); await p.type("#pq", typed); await p.keyboard.press("Enter");
    const end = Date.now() + 60000; while (Date.now() < end) { await new Promise(r => setTimeout(r, 1000)); try { if (/live match|Nothing live|No .* live/i.test(await textOf(p))) break; } catch { /* moving */ } } await quiet(p); const t = await textOf(p), u = p.url(); await p.close(); return { t, u }; };
  const nm = await findText("2003 Mercedes-Benz SL500");
  check("Find (visitor): a search with no mileage still reads \"That's everything matching your search right now.\"", /That.s everything matching your search right now\./.test(nm.t), nm.t.slice(0, 400));
  const un = await findText("2003 Mercedes-Benz SL500 under 40,000 miles");
  check("Find (visitor): \"under 40,000 miles\" still filters (a mileage chip and the ceiling in the address)", /Under 40,000 miles/.test(un.t) && /miles=40000/.test(un.u), un.u + " " + un.t.slice(0, 300));
}
// ---- 3c. the partial car (a make with no model), crew only: the join of the bar and the model choice (lane-d-car-bar-partial-2) -----------------------------------------------------------------------
{
  const gmc = p => p.evaluate(() => ({ blocks: document.querySelectorAll("#gmc").length, line: (document.querySelector("#gmc .gmc-line") || {}).textContent || "", buttons: [...document.querySelectorAll("#gmc .gmc-btn")].map(a => a.textContent), older: /Which BMW\?/.test(document.body.innerText) }));
  const poll = async (f, ms = 45000) => { const end = Date.now() + ms; while (Date.now() < end) { try { const r = await f(); if (r) return r; } catch { /* moving */ } await new Promise(x => setTimeout(x, 700)); } return null; };
  const barOf = p => p.evaluate(() => { const s = document.getElementById("gas-carbar"); return s && !s.hidden ? { line: (s.querySelector(".gcb-line") || {}).textContent, pills: [...s.querySelectorAll(".gcb-pill")].map(a => ({ l: a.textContent, h: a.getAttribute("href") })) } : null; });
  if (CREW) {
    const p = await open(true); await p.goto(SITE + "/market-check", { waitUntil: "networkidle2" }); await p.type("#pq", "2009 BMW"); await p.keyboard.press("Enter");
    const g = await poll(async () => { const x = await gmc(p); return x.buttons.length ? x : null; }), bar = await poll(() => barOf(p), 15000);
    check("partial car (crew): Market Check '2009 BMW' shows the choice once, 'Which 2009 BMW?', with model buttons", !!g && g.blocks === 1 && g.line === "Which 2009 BMW?" && g.buttons.length >= 3 && g.buttons.includes("M3"), g && JSON.stringify(g).slice(0, 200));
    check("partial car (crew): ...and no older 'Which BMW?' block beside it", !!g && g.older === false, g && g.older);
    check("partial car (crew): ...and the car bar above reads '2009 BMW' with four pills", !!bar && bar.line === "2009 BMW" && bar.pills.length === 4, bar && bar.line);
    if (g && g.buttons.includes("M3")) {
      await p.evaluate(() => { const a = [...document.querySelectorAll("#gmc .gmc-btn")].find(x => x.textContent === "M3"); a && a.click(); });
      const r = await poll(async () => { const t = await textOf(p), b2 = await barOf(p); return /\$[\d,]+ to \$[\d,]+/.test(t) && b2 && /M3/.test(b2.line) ? { t, b2 } : null; }, 60000);
      check("partial car (crew): tapping M3 runs Market Check for the 2009 BMW M3 and the bar carries the full car", !!r && /MARKET CHECK \| 2009 BMW M3/.test(r.t) && r.b2.line === "2009 BMW M3", r && r.b2.line);
    }
    const pills = bar ? bar.pills : []; await p.close();
    const tp = pills.find(x => x.l === "Tasks");
    if (tp) { const q = await open(true); await q.goto(new URL(tp.h, SITE).href, { waitUntil: "networkidle2" }); const r = await poll(async () => { const v = await q.evaluate(() => (document.getElementById("pq") || {}).value), b2 = await barOf(q); return v && b2 ? { v, b2 } : null; }, 30000);
      check("partial car (crew): the Tasks pill fills the request box with '2009 BMW' and the bar shows", !!r && /^2009 BMW\s*$/.test(r.v) && r.b2.line === "2009 BMW", r && JSON.stringify([r.v, r.b2.line])); await q.close(); }
    const sp = pills.find(x => x.l === "Sell");
    if (sp) { const q = await open(true); await q.goto(new URL(sp.h, SITE).href, { waitUntil: "networkidle2" }); const r = await poll(async () => { const t = await textOf(q), b2 = await barOf(q); return /Which state is it in\?/.test(t) && b2 ? { t, b2 } : null; }, 30000);
      check("partial car (crew): the Sell pill opens Sell with the bar '2009 BMW' at its first question", !!r && r.b2.line === "2009 BMW", r && r.b2.line); await q.close(); }
    const fp = pills.find(x => x.l === "Find");
    if (fp) { const q = await open(true); await q.goto(new URL(fp.h, SITE).href, { waitUntil: "networkidle2" }); const r = await poll(async () => { const t = await textOf(q), b2 = await barOf(q); return /live match/i.test(t) && b2 ? { t, b2 } : null; }, 60000);
      check("partial car (crew): the Find pill opens the results with the bar '2009 BMW'", !!r && r.b2.line === "2009 BMW", r && r.b2.line); await q.close(); }
    { const q = await open(true); await q.goto(SITE + "/market-check", { waitUntil: "networkidle2" }); await q.type("#pq", "1950 Toyota"); await q.keyboard.press("Enter");
      const afterOf = t => t.slice(t.indexOf("Search a car") + 12, t.indexOf("Real sales only") > 0 ? t.indexOf("Real sales only") : undefined).replace(/[|→\s]+/g, " ").trim();
      const after = (await poll(async () => { const a = afterOf(await textOf(q)); return a.length > 10 ? a : null; }, 20000)) || "";
      check("partial car (crew): a make and year with nothing sold ('1950 Toyota') prints the engine's one line", after.length > 10, JSON.stringify(after)); await q.close(); }
    { const q = await open(true); await q.goto(SITE + "/market-check", { waitUntil: "networkidle2" }); await q.type("#pq", "2009 BMW"); await q.keyboard.press("Enter"); await poll(async () => (await gmc(q)).buttons.length ? 1 : 0);
      await q.setOfflineMode(true); await q.click("#ob-input", { clickCount: 3 }).catch(() => {}); await q.type("#ob-input", "2009 Audi").catch(() => {}); await q.keyboard.press("Enter");
      const t = (await poll(async () => { const x = await textOf(q); return /trouble|try again|couldn.t|could not|went wrong|not read|offline|failed/i.test(x) ? x : null; }, 15000)) || await textOf(q); check("partial car (crew): a request that breaks after the choices show still prints a failure line", /trouble|try again|couldn.t|could not|went wrong|not read|offline|failed/i.test(t), (await gmc(q)).buttons.length + " choices still drawn; " + t.slice(0, 160)); await q.setOfflineMode(false); await q.close(); }
  }
  { const p = await open(false); await p.goto(SITE + "/market-check", { waitUntil: "networkidle2" }); await p.type("#pq", "2009 BMW"); await p.keyboard.press("Enter");
    await poll(async () => /Which BMW\?/.test(await textOf(p)), 45000); await quiet(p); const g = await gmc(p), b2 = await barOf(p);
    check("partial car (visitor): Market Check '2009 BMW' is the older 'Which BMW?' question, no new choice block, no bar", g.blocks === 0 && g.older === true && !b2, JSON.stringify([g.blocks, g.older, b2 && b2.line])); await p.close(); }
  { const p = await open(false); await p.goto(SITE + "/market-check", { waitUntil: "networkidle2" }); await p.type("#pq", "2009 BMW M3"); await p.keyboard.press("Enter"); const b2 = await poll(() => barOf(p), 45000);
    check("partial car (visitor): a full car '2009 BMW M3' keeps the public bar", !!b2 && b2.line === "2009 BMW M3" && b2.pills.length === 4, b2 && b2.line); await p.close(); }
}
// ---- 4. the variant rows: crew only, the engine's answer, each row matches its own page ----------------------------------------------------------------------------------------------------------------
{
  const rowsOf = p => p.evaluate(() => { const v = document.getElementById("vrs"); if (!v) return null; return { line: (v.querySelector(".vrs-line") || {}).textContent || "", rows: [...v.querySelectorAll(".vrs-row")].map(a => ({ label: (a.querySelector(".vrs-l") || {}).textContent || "", range: (a.querySelector(".vrs-range") || {}).textContent || "", sales: (a.querySelector(".vrs-sales") || {}).textContent || "", href: a.getAttribute("href") })) }; });
  const waitRows = async p => { const end = Date.now() + 40000; let r = null; while (Date.now() < end) { try { r = await rowsOf(p); if (r) return r; } catch { /* moving */ } await new Promise(x => setTimeout(x, 1000)); } return r; };
  if (CREW) {
    const f = await mcSearch(true, "1987 Pontiac Firebird"); const r = await waitRows(f.p);
    check("rows (crew): '1987 Pontiac Firebird' shows the engine's line and a row per variant under the range", !!r && !!r.line && r.rows.length >= 2 && r.rows.every(x => x.label && x.sales), r && JSON.stringify(r).slice(0, 300));
    const row = r && (r.rows.find(x => x.range) || r.rows[0]); await f.p.close();
    if (row) { const q = await open(true); await q.goto(new URL(row.href, SITE).href, { waitUntil: "networkidle2" }); await answered(q); const t = await textOf(q);
      const n = (row.sales.match(/\d+/) || [""])[0];
      check("rows (crew): the row '" + row.label + "' opens a page with the same range and sales it showed", (!row.range || t.includes(row.range)) && new RegExp("(^|[^\\d,])" + n + "( sales| sale|\\b)").test(t), row.range + " | " + row.sales + " | " + t.slice(0, 300)); await q.close(); }
    const ta = await mcSearch(true, "1987 Pontiac Firebird Trans Am"); const rt = await rowsOf(ta.p).catch(() => null); await quiet(ta.p); const rt2 = await rowsOf(ta.p).catch(() => null);
    check("rows (crew): '1987 Pontiac Firebird Trans Am' shows no rows (the variant is stated)", !rt && !rt2, JSON.stringify(rt2 || rt)); await ta.p.close();
  }
  const v = await mcSearch(false, "1987 Pontiac Firebird"); await quiet(v.p);
  const rv = await rowsOf(v.p).catch(() => null);
  check("rows (visitor): '1987 Pontiac Firebird' shows no variant rows", !rv && !/vrs-mod|vrs-css/.test(await v.p.content()), JSON.stringify(rv));
  check("rows (visitor): ...and the car bar shows", !(await noBar(v.p)));
  await v.p.close();
}


console.log("\nliveSmoke " + SITE + ": " + pass + " pass, " + fail + " FAIL");
await browser.close();
process.exit(fail ? 1 : 0);
