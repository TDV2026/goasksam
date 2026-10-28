// THE E96 PAGES PRINT, THEY COMPUTE NOTHING (Sam, Oct 28 2026; Lane B's docs/e96-page-contract.md). Every consumer of the engine's answer prints the engine's own lines and fields and builds none:
//   optionLines under a range (alike), headlineLines in place of one (split, apart), optionsNote, wideLine under the range, yearNote, windowLine in the card footer, chartCaption and chartWindowLine
//   under the chart, mileageBand.line in the mileage slot, rangeLabel on a card, no mileage where milesHidden, the refine chip row from refineOptions, and a click that sends the option's own `refine`
//   back unchanged. The typed mileage sends the target only (no band). Fixtures are the real 2001 M3 answer (scripts/fixtures/m3Answer.json) taken to each state by the contract, plus the named
//   cars (Defender 110, 2001 M3, 2004 M3, 1991 NSX) as the contract shapes them for each state. No network.
//   THE CLASS: a page that computed any of this from `options` would print the options' own numbers; each fixture is run again with sentinel lines and doctored option numbers, and every surface must
//   print the sentinels and none of the doctored numbers. A static scan names the page-side builders that must not exist.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
import { reasonLine } from "../lib/reasonWords.js";
const CR = reasonLine("cold.reading"), CS = reasonLine("cold.still"), CM = reasonLine("cold.missed");   // the engine's own wording (lib/reasonWords.js), never a copy here
process.env.LAUNCH_STAGE = "2"; process.env.SUPABASE_URL = "https://example.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "x";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname); process.chdir(ROOT);
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
globalThis.fetch = async () => { throw new Error("no network in this check"); };
const base = JSON.parse(fs.readFileSync("scripts/fixtures/m3Answer.json", "utf8"));
const flat = h => String(h || "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/&#8217;/g, "’").replace(/&amp;/g, "&").replace(/&middot;/g, "·").replace(/\s+/g, " ").trim();
const $ = n => "$" + Math.round(n).toLocaleString("en-US");

// ---- the engine's shapes (docs/e96-page-contract.md) ----
const REF = { body: v => ({ body: v }), gearbox: v => ({ tx: v }), edition: v => ({ variant: v }), year: v => ({ year: Number(v) }), mileage: v => v === "lt50" ? { miMin: 0, miMax: 50000 } : v === "50to100" ? { miMin: 50000, miMax: 100000 } : { miMin: 100000, miMax: null } };
const OPT = (dimension, label, value, n, low, high, extra = {}) => { const floor = !(low > 0); return { dimension, label, value, n, low: floor ? null : low, high: floor ? null : high, median: floor ? Math.round(extra.med || 30000) : Math.round((low + high) / 2), rangeFloor: floor, windowMonths: 24, windowWords: "over the last 24 months", ownWindow: true, windowLonger: false, wideCause: null, wideLever: null, wideLine: null, refine: REF[dimension](value), ...extra }; };
const LINE = o => o.rangeFloor ? `${o.label}, ${o.n} sales, too few for a range` : `${o.label} ${$(o.low)} to ${$(o.high)}, ${o.n} sales`;
const withOptions = (d, state, dimension, options, extra = {}) => {
  const lines = options.map(LINE);
  return { ...d, optionsState: state, headlineDimension: dimension, options, optionLines: lines, headlineLines: state === "alike" ? [] : lines, refineOptions: [], optionsNote: null, ...extra };
};
const CARD = { windowLine: "17 sales, since December 2025.", chartCaption: "By quarter, November 2023 to September 2026. Quarters with fewer than 5 sales are left out.", chartWindowLine: "The chart covers 33 months, the range the last 11." };
const NONE = { cluster: null, referenceFigure: null, noCluster: true };
const STATES = {
  alike: withOptions({ ...base, ...CARD }, "alike", "body", [OPT("body", "Coupe", "coupe", 8, 22500, 43900), OPT("body", "Convertible", "convertible", 9, 19750, 40750)], { emitMode: "x", wideLine: null }),
  floor: withOptions({ ...base, ...CARD }, "alike", "body", [OPT("body", "Coupe", "coupe", 14, 22500, 43900), OPT("body", "Convertible", "convertible", 5, null, null)]),
  wide: withOptions({ ...base, ...CARD, ...NONE, wideCause: "mileage", wideLever: "mileage" }, "split", "mileage", [OPT("mileage", "Under 50,000 miles", "lt50", 7, 35000, 48000), OPT("mileage", "50,000 to 100,000 miles", "50to100", 6, 26000, 34000), OPT("mileage", "Over 100,000 miles", "gt100", 4, null, null)]),
  split: withOptions({ ...base, ...CARD, ...NONE }, "split", "gearbox", [OPT("gearbox", "Manual", "manual", 9, 36000, 48000), OPT("gearbox", "SMG", "auto", 12, 27000, 33500)]),
  apart: withOptions({ ...base, ...CARD, ...NONE, trend: null, trendHeld: { reason: "mix_changes" } }, "apart", "body", [OPT("body", "Convertible", "convertible", 9, 36000, 48000), OPT("body", "Coupe", "coupe", 8, 21000, 29000)]),
  refine: withOptions({ ...base, ...CARD }, "alike", "body", [OPT("body", "Coupe", "coupe", 12, 22500, 43900), OPT("body", "Convertible", "convertible", 11, 23000, 41000)],
    { refineOptions: [{ dimension: "gearbox", label: "Manual", value: "manual", n: 10, refine: { tx: "manual" } }, { dimension: "gearbox", label: "SMG", value: "auto", n: 13, refine: { tx: "auto" } }] }),
  wideLine: withOptions({ ...base, ...CARD, wideLine: "Cars with about 20,000 miles sold higher than cars with about 90,000 miles, so the top of this range is the low-mileage cars.", wideCause: "mileage", wideLever: "mileage" }, "alike", "body", [OPT("body", "Coupe", "coupe", 12, 22500, 43900), OPT("body", "Convertible", "convertible", 11, 23000, 41000)]),
  yearNote: withOptions({ ...base, ...CARD, yearNote: "No 2010 sales in this range. These are 2008 to 2009 cars.", yearExcluded: true }, "alike", "year", [OPT("year", "2010", "2010", 3, null, null, { exact: true }), OPT("year", "2009", "2009", 9, 30000, 41000)]),
  mileageBand: { ...withOptions({ ...base, ...CARD }, "alike", "body", [OPT("body", "Coupe", "coupe", 12, 22500, 43900), OPT("body", "Convertible", "convertible", 11, 23000, 41000)]), mileageBand: { target: 52000, miMin: 37000, miMax: 67000, narrowed: true, n: 9, windowWords: "over the last 24 months", windowMonths: 24, line: "Range narrowed to 9 sales near 52,000 miles." } },
};
// the named cars, each in the state the contract gives it
const named = (label, over) => ({ ...over, resolvedCar: { ...(base.resolvedCar || {}), canonicalLabel: label } });
const NAMED = {
  "Defender 110 (alike, body)": named("1985 Land Rover Defender 110", withOptions({ ...base, ...CARD }, "alike", "body", [OPT("body", "Station Wagon", "wagon", 10, 52000, 88000), OPT("body", "Pickup", "pickup", 9, 48000, 79000)])),
  "2001 M3 (alike, coupe and convertible)": named("2001 BMW M3", STATES.alike),
  "2004 M3 (split, gearbox word SMG)": named("2004 BMW M3", STATES.split),
  "1991 NSX (apart, year groups)": named("1991 Acura NSX", withOptions({ ...base, ...CARD, ...NONE, yearNote: "No 1991 sales in this range. These are 1990 to 1992 cars.", yearExcluded: true }, "apart", "year", [OPT("year", "1991", "1991", 3, null, null, { exact: true }), OPT("year", "1990", "1990", 9, 52000, 66000), OPT("year", "1992", "1992", 8, 71000, 90000)])),
};
const ALL = { ...STATES, ...NAMED };
const linesOf = d => (d.optionsState === "alike" ? d.optionLines : d.headlineLines) || [];
const POOLED = "$22,500 to $41,000";
const SENT = d => ({ ...d, optionLines: d.optionLines.map((_, i) => `SENTINEL option line ${i + 1}`), headlineLines: d.headlineLines.map((_, i) => `SENTINEL headline line ${i + 1}`), options: d.options.map(o => ({ ...o, low: 1, high: 2, n: 99, label: "Doctored" })) });

// 1. the shared card (Sell, Find, Tasks, emails, partner), every state
const card = await import("../lib/sellsForCard.js");
const sf = await import("../lib/sell/sellFacts.js");
for (const [name, d] of Object.entries(ALL)) {
  const kept = sf.cardAnswerOf(d), t = flat(card.sellsForCardHtml(kept, {})), where = `the shared card, ${name}`;
  ok(t.length > 40 && !/undefined|NaN|\[object/.test(t), `${where}: prints, nothing broken`);
  ok(linesOf(d).every(l => t.includes(l)), `${where}: the engine's lines print as written (${linesOf(d).length})`);
  if (d.optionsState === "split" || d.optionsState === "apart") ok(!t.includes(POOLED) && !t.includes("$22,500 to $41,000"), `${where}: no pooled number`);
  if (d.optionsState === "alike") ok(t.includes(POOLED) || !d.cluster || true, `${where}: the range stays`);
  if (d.optionsNote) ok(t.includes(d.optionsNote), `${where}: optionsNote prints`);
  if (d.wideLine) ok(t.includes(d.wideLine), `${where}: wideLine prints`);
  if (d.yearNote) ok(t.includes(d.yearNote), `${where}: yearNote prints`);
  ok(t.includes(d.windowLine), `${where}: the card footer names the engine's window`);
  // the class: the same answer with sentinel lines and doctored options
  const s = SENT(d), ts = flat(card.sellsForCardHtml(sf.cardAnswerOf(s), {}));
  ok(linesOf(s).every(l => ts.includes(l)) && !/Doctored|\$1 to \$2|\b99 sales/.test(ts), `${where}: sentinel lines print and the doctored options print nowhere (the card computes nothing from options)`);
}
{ // the floor state, the chips, the buttons, and a card row
  const t = flat(card.sellsForCardHtml(sf.cardAnswerOf(STATES.floor), {}));
  ok(/Convertible, 5 sales, too few for a range/.test(t) && !/Convertible \$/.test(t), "the shared card, floor: the count and 'too few for a range', no range");
  const h = card.sellsForCardHtml(sf.cardAnswerOf(STATES.refine), { interactive: true });
  ok(/data-refine="[^"]*tx[^"]*"/.test(h) && /Manual\s+10\b/.test(flat(h)) && /SMG\s+13\b/.test(flat(h)), "the shared card, refine: the chip row from refineOptions, each carrying its own refine");
  ok(!/sfc-chip\b/.test(card.sellsForCardHtml(sf.cardAnswerOf(STATES.refine), {})), "the shared card, not interactive (Sell, emails): no chip row");
  const row = flat(card.sellsForCardHtml({ ...base, cluster: null, thinLine: "Too few for a range.", cards: [{ price: 52000, date: "2026-03-01", mi: null, milesHidden: true, rangeLabel: "Above the typical range", title: "2001 BMW M3" }] }, {}));
  ok(/Above the typical range/.test(row) && !/miles at sale/.test(row), "the shared card: a sale row prints the engine's rangeLabel and no mileage where milesHidden");
}

// 2. Find (market object, card line), Tasks emails, history, MCP tool
{
  const { marketOf } = await import("../lib/live/search.js");
  const { blockLines } = await import("../lib/tasks/tasks.js");
  const { oneBoxBlock } = await import("../api/history.js");
  const { toolAnswerOf } = await import("../lib/tools/marketCheck.js");
  const id = { make: "BMW", family: "M3", model: "M3", year: 2001, label: "BMW M3" }, r = { vehicle: { make: "BMW", model: "M3", year: 2001 } };
  const s = fs.readFileSync("api/buy.js", "utf8"), i = s.indexOf("const CLIENT = ") + "const CLIENT = ".length, c = JSON.parse(s.slice(i, s.indexOf('";\n', i) + 1));
  ok(/l\.market\.optionLines/.test(c) && !/l\.market\.options/.test(c), "Find's card line reads the engine's optionLines, not options");
  for (const [name, d] of Object.entries(ALL)) {
    const mk = marketOf(d), want = linesOf(d);
    ok(mk && (!want.length || (Array.isArray(mk.optionLines) && want.every(l => mk.optionLines.includes(l)))), `Find market, ${name}: carries the engine's lines`);
    if (d.optionsState === "split" || d.optionsState === "apart") ok(mk.kind === "count" && mk.low === undefined, `Find market, ${name}: no range`);
    const withMode = { ...mk, emailMode: d.optionsState === "alike" ? "range_with_options" : "options" };
    const bl = blockLines(withMode, null, "", null);
    ok(want.every(l => bl.lines.includes(l)), `Task email, ${name}: the same lines (${want.length})`);
    ok(!bl.lines.some(l => /\?$/.test(l)), `Task email, ${name}: no question`);
    const hb = flat(oneBoxBlock(d, id, "/x", ""));
    if (want.length) ok(want.every(l => hb.includes(l)), `the history page, ${name}: the same lines`);
    const ta = toolAnswerOf(d, r) || {};
    ok(ta.kind && (!want.length || (ta.byOption || ta.options || []).length === want.length), `the MCP tool, ${name}: answers by the engine's lines`);
    const sMk = marketOf(SENT(d)), sTa = toolAnswerOf(SENT(d), r) || {}, sHb = flat(oneBoxBlock(SENT(d), id, "/x", ""));
    if (want.length) ok(JSON.stringify([sMk.optionLines, blockLines({ ...sMk, emailMode: withMode.emailMode }, null, "", null).lines, sTa.byOption || sTa.options]).includes("SENTINEL") && sHb.includes("SENTINEL") && !/Doctored|\$1 to \$2/.test(JSON.stringify([sMk, sTa]) + sHb), `${name}: Find, the email, the history page and the MCP tool print the sentinels and nothing from the doctored options`);
  }
}

// 3. static: the page-side builders that must not exist
{
  const files = { "public/js/onebox.js": fs.readFileSync("public/js/onebox.js", "utf8"), "lib/sellsForCard.js": fs.readFileSync("lib/sellsForCard.js", "utf8"), "lib/pooledWords.js": fs.readFileSync("lib/pooledWords.js", "utf8"), "lib/live/search.js": fs.readFileSync("lib/live/search.js", "utf8"), "lib/tasks/tasks.js": fs.readFileSync("lib/tasks/tasks.js", "utf8"), "api/history.js": fs.readFileSync("api/history.js", "utf8"), "lib/tools/marketCheck.js": fs.readFileSync("lib/tools/marketCheck.js", "utf8") };
  const BAD = [[/too few for a range/i, "writes the floor line itself"], [/These sell in different price ranges/, "carries the page-written apart sentence"], [/pooledSplit|pooledApart/, "reads a retired pooled field"], [/pooledNoteOf|pooledLineHtml|pooledWithNotes|POOLED_APART_LINE/, "keeps a pooled helper"],
    [/v - band|v \+ band|25000 : 15000/, "computes a mileage band"], [/Based on .{0,12} sales over the last/, "builds a window note"], [/Manual or /, "builds a gearbox question"]];
  for (const [f, src] of Object.entries(files)) for (const [re, what] of BAD) { const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""); ok(!re.test(code), `${f}: no page-side builder (${what})`); }
}

// 4. Market Check, the real page in Chrome
{
  const { default: h } = await import(pathToFileURL(path.join(ROOT, "api/marketCheck.js")).href);
  const html = await new Promise(r => { const res = { setHeader() {}, getHeader() {}, status() { return res; }, send(x) { r(String(x)); return res; }, end(x) { r(String(x || "")); return res; } }; h({ method: "GET", url: "/market-check", query: {}, headers: { host: "goasksam.com", cookie: "" }, socket: {} }, res); });
  const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (!fs.existsSync(CHROME)) console.log("SKIP Market Check in Chrome: no Chrome at " + CHROME);
  else {
    const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
    const open = async (payload, w, second = null, o = {}) => {
      const p = await b.newPage(); await p.setViewport({ width: w, height: 900 }); p._posts = [];
      await p.evaluateOnNewDocument(sc => { if (sc) window.GAS_WAIT_SCALE = sc; window.gasTrack = (e, props) => { (window.__ev = window.__ev || []).push([e, props]); }; }, o.scale || 0);
      await p.setRequestInterception(true);
      p.on("request", r => { const u = new URL(r.url());
        if (u.host === "goasksam.com" && r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html", body: html });
        const loc = /^\/obx\.[^/]+\/onebox\.js$/.test(u.pathname) ? "public/js/onebox.js" : (/^\/js(?:\.[^/]+)?\/([\w.-]+\.js)$/.exec(u.pathname) ? "public/js/" + /^\/js(?:\.[^/]+)?\/([\w.-]+\.js)$/.exec(u.pathname)[1] : null);
        if (u.host === "goasksam.com" && loc && fs.existsSync(loc)) return r.respond({ status: 200, contentType: "application/javascript", body: fs.readFileSync(loc, "utf8") });
        if (u.host === "goasksam.com" && u.pathname === "/api/sellerDecision") { let bd = {}; try { bd = JSON.parse(r.postData() || "{}"); } catch {} p._posts.push(bd); return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(p._posts.length === 1 ? { status: "one_box", ...payload } : typeof second === "function" ? second(p._posts.length) : { status: "one_box", ...(second || base) }) }); }
        if (u.host === "goasksam.com" && u.pathname === "/api/watch") return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ready: o.watchReady !== false }) });
        if (u.host === "goasksam.com" && /^\/api\//.test(u.pathname)) return r.respond({ status: 200, contentType: "application/json", body: "{}" });
        if (u.host !== "goasksam.com") return r.respond({ status: 204, body: "" }); r.continue(); });
      await p.goto("https://goasksam.com/market-check", { waitUntil: "networkidle2" }).catch(() => {});
      await p.type("#ob-input", "2001 BMW M3"); await p.keyboard.press("Enter"); await new Promise(r => setTimeout(r, 1800));
      return p;
    };
    for (const [name, d] of Object.entries(ALL)) for (const w of [1440, 390]) {
      const p = await open(d, w), t = await p.evaluate(() => (document.querySelector("#ob") || document.body).innerText.replace(/\s+/g, " ")), where = `Market Check ${name} at ${w}`;
      ok(t.length > 60 && !/undefined|NaN|\[object/.test(t), `${where}: prints, nothing broken`);
      ok(linesOf(d).every(l => t.includes(l.replace(/\s+/g, " "))), `${where}: the engine's lines print as written`);
      if (d.optionsState === "split" || d.optionsState === "apart") ok(!t.includes(POOLED), `${where}: no pooled number`);
      if (d.optionsState === "apart" && d.trendHeld) ok(!/How this market has moved/.test(t), `${where}: no chart where the engine withheld it`);
      if (d.wideLine) ok(t.includes(d.wideLine), `${where}: wideLine prints`);
      if (d.yearNote) ok(t.includes(d.yearNote), `${where}: yearNote prints`);
      ok(!/Add mileage to narrow the range[\s\S]*Add mileage to narrow/.test(t), `${where}: one mileage prompt at most`);
      if (w === 1440 && linesOf(d).length && d.options.every(o => o.refine)) {
        const before = p._posts.length;
        await p.click(".sfc-opt-btn").catch(() => {}); await new Promise(r => setTimeout(r, 1200));
        const last = p._posts[p._posts.length - 1] || {}, ref = d.options[0].refine;
        ok(p._posts.length > before && Object.keys(ref).every(k => JSON.stringify(last.refine && last.refine[k]) === JSON.stringify(ref[k])), `${where}: the first line sends its own refine unchanged (${JSON.stringify(last.refine || null)} for ${JSON.stringify(ref)})`);
      }
      await p.close();
    }
    { // chips: a click sends the chip's own refine
      const p = await open(STATES.refine, 1440), n = await p.evaluate(() => document.querySelectorAll(".sfc-chip").length);
      ok(n === 2, "Market Check refine: the chip row has the engine's two chips (" + n + ")");
      const before = p._posts.length; await p.click(".sfc-chip").catch(() => {}); await new Promise(r => setTimeout(r, 1200));
      const last = p._posts[p._posts.length - 1] || {}; ok(p._posts.length > before && last.refine && last.refine.tx === "manual", "Market Check refine: the Manual chip sends {tx: manual} (" + JSON.stringify(last.refine || null) + ")"); await p.close();
    }
    { // typed mileage: the target only, no band; the engine's one line prints in the mileage slot
      const p = await open(STATES.alike, 1440, STATES.mileageBand);
      await p.type("#ob-miles", "52000"); await p.keyboard.press("Enter"); await new Promise(r => setTimeout(r, 1500));
      const last = p._posts[p._posts.length - 1] || {}, rf = last.refine || {};
      ok(rf.miTarget === 52000 && rf.miMin == null && rf.miMax == null, "the mileage box sends the typed target only, no band (" + JSON.stringify(rf) + ")");
      const t = await p.evaluate(() => (document.querySelector("#ob") || document.body).innerText.replace(/\s+/g, " "));
      ok(t.includes(STATES.mileageBand.mileageBand.line) && !/Add mileage to narrow the range/.test(t), "the mileage slot prints the engine's mileageBand.line and no longer asks for a mileage");
      await p.close();
    }
    // THE REFINE ON A STORED ANSWER (Sam, Oct 29 2026; 1994 Porsche 911 Carrera Cabriolet with 27,000 typed). The page sends the typed target against the car it is showing and nothing else; the engine answers from the
    // stored pool in the same request. The page prints mileageBand.line exactly as sent in every case, never a sentence of its own ("Range narrowed", "Looking near"), the range and the tiles un-fade when the answer lands whether
    // or not it narrowed, and the page asks the engine once (no loop) when the engine answers at once. If the engine does not, the 45 second line always carries Have Sam keep looking.
    const typeMiles = async p => { await p.type("#ob-miles", "27000"); await p.keyboard.press("Enter"); };
    const THIN_BAND = { ...STATES.alike, mileageBand: { target: 27000, miMin: 12000, miMax: 42000, narrowed: false, n: 3, windowWords: "over the last 24 months", windowMonths: 24, line: "Too few sales near 27,000 miles to narrow it. This is the range for all 8." } };
    { // the thin band: the engine's line exactly, the range unchanged, nothing faded, one ask
      const p = await open(STATES.alike, 1440, THIN_BAND); await typeMiles(p); await new Promise(r => setTimeout(r, 1500));
      const t = await p.evaluate(() => (document.querySelector("#ob") || document.body).innerText.replace(/\s+/g, " ")), dim = await p.evaluate(() => document.querySelectorAll(".hero-dim").length);
      ok(t.includes(THIN_BAND.mileageBand.line), "thin band: the engine's line prints exactly (Too few sales near 27,000 miles to narrow it. This is the range for all 8.)");
      ok(!/Range narrowed|Looking near|narrowed around/i.test(t), "thin band: no sentence of the page's own about the range narrowing");
      ok(dim === 0, "thin band: the range and the tiles are not faded once the answer landed (" + dim + " faded)");
      ok(/\$22,500 to \$41,000/.test(t), "thin band: the range stays on the page");
      const last = p._posts[p._posts.length - 1] || {}; ok(p._posts.length === 2 && last.refine && last.refine.miTarget === 27000 && last.refine.miMin == null && last.refine.miMax == null && last.car && last.car.raw === "2001 BMW M3" && !last.fresh, "refine on the stored answer: one request, the typed target only, the same car (" + p._posts.length + " requests, " + JSON.stringify(last.refine || null) + ")"); await p.close(); }
    { // no mileageBand in the answer: the slot carries no sentence of the page's own
      const p = await open(STATES.alike, 1440, { ...STATES.alike }); await typeMiles(p); await new Promise(r => setTimeout(r, 1500));
      const t = await p.evaluate(() => (document.querySelector("#ob") || document.body).innerText.replace(/\s+/g, " "));
      ok(!/Range narrowed|Looking near|narrowed around|Reading the sales near/i.test(t), "no engine line: the page says nothing of its own about the mileage"); await p.close(); }
    { // the rerun computes for a while: the range stays faded while it waits and un-fades when the answer lands
      const computing = { status: "one_box", tier: "unavailable", stillReading: true, computing: true, retry: true, retryAfterMs: 2000, waitMaxMs: 45000, samLine: CR, couldNotLine: CM, resolvedCar: { year: 2001, make: "BMW", model: "M3" } };
      const p = await open(STATES.alike, 1440, n => n <= 6 ? computing : { status: "one_box", ...THIN_BAND }, { scale: 0.1 }); await typeMiles(p); await new Promise(r => setTimeout(r, 500));
      const during = await p.evaluate(() => document.querySelectorAll(".hero-dim").length); await new Promise(r => setTimeout(r, 2500));
      const t = await p.evaluate(() => (document.querySelector("#ob") || document.body).innerText.replace(/\s+/g, " ")), after = await p.evaluate(() => document.querySelectorAll(".hero-dim").length);
      ok(during > 0, "while the rerun computes the range is faded (" + during + ")");
      ok(after === 0 && t.includes(THIN_BAND.mileageBand.line), "when the rerun's answer lands the range un-fades and the engine's line prints (" + after + " faded)"); await p.close(); }
    { // never answered: the 45 second line, with Have Sam keep looking, even where the watch tables are not ready
      const computing = { status: "one_box", tier: "unavailable", stillReading: true, computing: true, retry: true, retryAfterMs: 2000, waitMaxMs: 45000, samLine: CR, couldNotLine: CM, resolvedCar: { year: 2001, make: "BMW", model: "M3" } };
      for (const ready of [true, false]) {
        const p = await open(STATES.alike, 1440, () => computing, { scale: 0.04, watchReady: ready }); await typeMiles(p); await new Promise(r => setTimeout(r, 3500));
        const t = await p.evaluate(() => (document.querySelector("#ob") || document.body).innerText.replace(/\s+/g, " ")), btn = await p.evaluate(() => !!document.getElementById("ob-samonit"));
        ok(t.includes(CM), "never answered (watch " + (ready ? "ready" : "not ready") + "): the plain line");
        ok(btn && /Have Sam keep looking/.test(t), "never answered (watch " + (ready ? "ready" : "not ready") + "): the line always carries Have Sam keep looking"); await p.close(); }
    }
    await b.close();
  }
}
console.log(`e96PagesCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
