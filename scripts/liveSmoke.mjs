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
const noBar = p => p.evaluate(() => { const s = document.getElementById("gas-carbar"); return !s || s.hidden || !s.querySelector(".gcb-line"); });

// ---- 1. visitor: Market Check ----------------------------------------------------------------------------------------------------------------------------------------------------
const SL = "2003 Mercedes-Benz SL500 38,400 miles";
let sl = await mcSearch(false, SL);
check("MC visitor: '" + SL + "' answers", sl.ok, sl.text.slice(0, 200));
check("MC visitor: the card is the SL500", /MARKET CHECK \| 2003 Mercedes-Benz SL-Class SL500/.test(sl.text) || /MARKET CHECK \| 2003 Mercedes-Benz SL500/.test(sl.text), sl.text.slice(0, 300));
check("MC visitor: the mileage box holds 38,400", /^38,?400$/.test(String(sl.miles || "")), sl.miles);
check("MC visitor: the range is narrowed to that band ('within N miles of 38,400' and a $ range)", /within [\d,]+ miles of 38,400/.test(sl.text) && /\$[\d,]+ to \$[\d,]+/.test(sl.text), sl.text.slice(0, 400));
check("MC visitor: no \"Sam didn't use\" notice", !/didn't use/i.test(sl.text), (sl.text.match(/Sam didn't use[^|]*/) || [""])[0]);
check("MC visitor: no car bar (crew only)", await noBar(sl.p));
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
check("MC visitor: ...the mileage band is applied, or says plainly there are too few sales near 42,500 miles", /within [\d,]+ miles of 42,500/.test(tam.text) && (RANGE.test(tam.text)), tam.text.slice(0, 400));
check("MC visitor: ...no notice", !/didn't use/i.test(tam.text), (tam.text.match(/Sam didn't use[^|]*/) || [""])[0]);
await tam.p.close();

// ---- 2. visitor: Sell and Tasks ---------------------------------------------------------------------------------------------------------------------------------------------------
{
  const p = await open(false); await p.goto(SITE + "/sell?car=" + encodeURIComponent("2003 Mercedes-Benz SL500"), { waitUntil: "networkidle2" });
  await p.waitForFunction(() => /Which state is it in\?/.test(document.body.innerText), { timeout: 60000 }).catch(() => {});
  const t = await textOf(p);
  check("Sell visitor: /sell?car=<words> opens on the SL500 at its first question", /SL500/.test(t) && /Which state is it in\?/.test(t), t.slice(0, 250));
  check("Sell visitor: no car bar", await noBar(p));
  await p.close();
}
{
  const p = await open(false); await p.goto(SITE + "/tasks", { waitUntil: "networkidle2" });
  const box = await p.$("#pq"), go = await p.$("#pq-form .go");
  check("Tasks signed out: the page offers its request box (#pq) and submit button", !!box && !!go, !!box + "/" + !!go);
  check("Tasks signed out: no car bar", await noBar(p));
  await p.close();
}

// ---- 3. crew: the car bar ---------------------------------------------------------------------------------------------------------------------------------------------------------
if (CREW) {
  const c = await mcSearch(true, SL);
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
    const p = await open(true); await p.goto(new URL(findPill.href, SITE).href, { waitUntil: "networkidle2" });
    await p.waitForFunction(() => /live match|No live|0 live/i.test(document.body.innerText), { timeout: 60000 }).catch(() => {});
    const t = await textOf(p);
    check("Find pill (crew): opens already run for the SL500 (a result line, the car's chips, not the empty prompt)", /live match/i.test(t) && /SL500/.test(t) && !/What car are you looking for\?/.test(t), t.slice(0, 300));
    check("Find pill (crew): the bar is kept on the Find page", /38,400 miles/.test(t), t.slice(0, 200));
    await p.close();
  } else check("Find pill (crew): opens already run", false, "no Find pill");
  if (sellPill) {
    const p = await open(true); await p.goto(new URL(sellPill.href, SITE).href, { waitUntil: "networkidle2" });
    await p.waitForFunction(() => /Which state is it in\?/.test(document.body.innerText), { timeout: 60000 }).catch(() => {});
    const t = await textOf(p);
    check("Sell pill (crew): opens for the SL500 with the bar (at Sell's first question)", /SL500/.test(t) && /Which state is it in\?/.test(t) && /38,400 miles/.test(t), t.slice(0, 300));
    await p.close();
  } else check("Sell pill (crew): opens for the SL500", false, "no Sell pill");
} else check("crew cookie available (Keychain goasksam-crew)", false, "missing: the crew assertions did not run");

console.log("\nliveSmoke " + SITE + ": " + pass + " pass, " + fail + " FAIL");
await browser.close();
process.exit(fail ? 1 : 0);
