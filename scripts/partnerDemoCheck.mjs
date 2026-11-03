// THE EBAY PARTNER DEMO NEVER SHOWS A BLANK PANEL (Lane E, Oct 31 2026, the 2025 Porsche 911 card). On the live head the demo (/preview, api/partnerDemo.js)
// drew the identity chips and the List it button and nothing between them: the engine asked for the trim (tier trim_choice), the demo's questionOf did not
// map that tier, the page read a.question alone, and an answer with no range, no thin line and no card drew an empty panel. The class: ANY engine answer
// the demo does not map must still draw a range, the engine's thin / waiting / refusal line, the engine's own question, or the one plain line the engine registers.
// This check renders all four views (a, b, c, d) at 1440 and 390 against stubbed engine answers in the CURRENT shape, through the real partnerShape, with the page
// served as it is. It fails on a missing panel, a dead pill (a reserve that gets no pill, or a pill with no words) and any error text. No network.
//   node scripts/partnerDemoCheck.mjs     exit 1 on any failure.
import { MC } from "./e98Fixtures.mjs";
import { startBrowser } from "./e98Render.mjs";
import { pageHtml, DUMMY } from "../api/partnerDemo.js";
import { partnerShape, positionAskOf, placedSaleOf, perOptionOf } from "../api/partnerAnswer.js";
import { partnerPositionsOf } from "../lib/onebox.js";
import fs from "node:fs";
import { reasonLine } from "../lib/reasonWords.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const COULD_NOT = reasonLine("cold.missed"), READING = reasonLine("cold.reading");

const RANGE = { status: "one_box", ...MC["2001 BMW M3 (alike with options)"].d };
const SPLIT = { status: "one_box", ...MC["2004 BMW M3 (split)"].d };
const strip = d => { const o = { ...d }; for (const k of ["options", "optionLines", "headlineLines", "optionsState", "windowLine", "rangeSentence", "trimQuestion", "bodyOptions", "variantOptionsLine", "inlineSplits", "thinLine", "refusal_line", "optionsRemainder", "refineOptions"]) delete o[k]; return o; };
const THIN_LINE = "Only 3 sales of cars like this in the last year, too few for a typical range.";
const THIN = { ...strip(RANGE), tier: "thin", cluster: null, thinLine: THIN_LINE, poolN: 3 };
const REFUSAL_LINE = "Sales too spread out for a range.";
const REFUSAL = { ...strip(RANGE), tier: "refusal", cluster: null, refusal_line: REFUSAL_LINE, samLine: REFUSAL_LINE };
const WAITING = { status: "one_box", tier: "unavailable", stillReading: true, samLine: READING, retry: false };
const NOTHING = { ...strip(RANGE), tier: "thin", cluster: null, cards: [], poolN: 0 };   // an engine answer that names no line at all: the demo still draws one plain line
const RC = { year: 2025, make: "Porsche", model: "911", nameModel: "911", canonicalLabel: "2025 Porsche 911 (992)" };
const MODEL_Q = { status: "one_box", tier: "model_choice", askIndex: 1, resolvedCar: { year: 2025, make: "Porsche" }, baseLabel: "2025 Porsche", prompt: "Which Porsche model?", modelOptions: ["911", "Cayenne"] };
const TRIM_Q = { status: "one_box", tier: "trim_choice", askIndex: 2, resolvedCar: RC, prompt: "Which 911?", trimOptions: [{ label: "Carrera", value: "carrera", n: 14 }, { label: "Carrera S", value: "carrera s", n: 9 }], trimChips: ["Carrera (14)", "Carrera S (9)"], optionCounts: [14, 9] };

const GEN_Q = { status: "one_box", tier: "generation_choice", askIndex: 1, resolvedCar: RC, prompt: "Which generation?", generationOptions: [{ label: "991", query: "2015 Porsche 911 991" }, { label: "992", query: "2020 Porsche 911 992" }] };
const BODY_Q = { status: "one_box", tier: "body_choice", askIndex: 1, resolvedCar: RC, baseLabel: "2005 Porsche 911", prompt: "Coupe or Cabriolet?", bodyOptions: ["Coupe", "Cabriolet"] };
const VAR_Q = { status: "one_box", tier: "variant_choice", askIndex: 1, resolvedCar: RC, prompt: "Which one?", variantChoices: [{ key: "gt3", label: "GT3", count: 9 }, { key: "base", label: "Carrera", count: 14 }] };
const idq = (dimension, labels) => ({ status: "one_box", tier: dimension + "_choice", askIndex: 1, resolvedCar: RC, prompt: "Which?", identityQuestion: { dimension, blocking: true, options: labels.map((l, i) => ({ label: l, count: 5 + i })), skipLabel: "Just show what sold" } });
const GEAR_Q = idq("gearbox", ["Manual", "PDK"]), COMP_Q = idq("competition", ["Competition", "Standard"]), DOC_Q = idq("documented_history", ["Has records", "No records"]);
// each scenario: the engine answers in order (the last repeats), what the panel must say, whether a range is expected
const SCENARIOS = [
  { name: "range", answers: [RANGE], say: ["$22,500", "$41,000"], range: true },
  { name: "split (one block per option)", answers: [SPLIT], say: ["$"], range: false },
  { name: "thin", answers: [THIN], say: [THIN_LINE], range: false },
  { name: "refusal", answers: [REFUSAL], say: [REFUSAL_LINE], range: false },
  { name: "waiting", answers: [WAITING], say: [READING], range: false, allowTryAgain: true },
  { name: "engine names no line", answers: [NOTHING], say: [COULD_NOT], range: false, allowCouldNot: true },
  { name: "model question", answers: [MODEL_Q, RANGE], say: ["Which Porsche model?"], range: false, ask: true },
  ...[["generation question", GEN_Q], ["body question", BODY_Q], ["variant question", VAR_Q], ["gearbox question", GEAR_Q], ["competition question", COMP_Q], ["documented history question", DOC_Q]].map(([name, q]) => ({ name, answers: [q, RANGE], say: [], range: false, ask: true })),
  { name: "trim question (the 2025 911)", answers: [TRIM_Q, RANGE], say: ["Which 911?", "Carrera"], range: false, ask: true, follow: ["$22,500", "$41,000"] }
];
// NO SKIP CHIP IN THE DEMO (Sam, Oct 31 2026): the engine offers "Just show what sold" on every choice step (model, generation, trim, body, gearbox, competition, history);
// the demo (eBay views a to d, Amazon) never draws it or any other way past the question. The live Find, Market Check and Sell keep it.
const SKIPWORDS = /just show|show what sold|\bskip\b|not sure|none of these|other\b/i;
for (const [name, q] of [["model", MODEL_Q], ["generation", GEN_Q], ["body", BODY_Q], ["trim", TRIM_Q], ["variant", VAR_Q], ["gearbox", GEAR_Q], ["competition", COMP_Q], ["documented history", DOC_Q]]) {
  const o = partnerShape(q, "2025 Porsche 911", 0, {});
  ok(o.question && o.engineQuestion || o.engineQuestion, `${name}: the demo answer carries the engine's question`);
  for (const k of ["question", "engineQuestion"]) if (o[k]) { ok(!o[k].skip, `${name}: ${k} carries no skip`); ok(!(o[k].options || []).some(x => SKIPWORDS.test(x.label)), `${name}: ${k} options hold no skip or escape chip`); }
}
{
  const fsx = await import("node:fs");
  const src = f => fsx.readFileSync(new URL("../" + f, import.meta.url), "utf8");
  ok((src("lib/onebox.js").match(/skipLabel: "Just show what sold"/g) || []).length >= 2, "the live engine still offers 'Just show what sold' (Find, Market Check, Sell keep it)");
  ok(/skipLabel/.test(src("public/js/onebox.js")), "the live Market Check page still draws the engine's skip");
  ok(!/partnerAnswer|partnerShape/.test(src("lib/onebox.js") + src("public/js/onebox.js")), "the live pages do not read the demo's answer shape, so the demo change cannot reach them");
}
// THE ENGINE'S HALF OF THE LISTING FORM (Lane B, lane-b-position fd354d56): positions[], placedSales[] and order come from the REAL engine function (lib/onebox.js partnerPositionsOf), fed the same
// request the page sends. Five sales with a photo that loads, none, and one that does not load. The comparisons are the engine's; this check only reads what the page prints.
const SALE_CARDS = [
  { id: "00000000-0000-4000-8000-000000000001", date: "2026-10-24", mi: 31200, price: 31250, title: "2008 Porsche 911 Carrera S", platform: "Venue One", url: "https://sales.example/s1", image: "https://img.example/ok.svg" },
  { id: "00000000-0000-4000-8000-000000000002", date: "2026-10-19", mi: 18400, price: 43000, title: "2008 Porsche 911 Carrera S Coupe", platform: "Venue Two", url: "https://sales.example/s2", image: "https://img.example/ok.svg" },
  { id: "00000000-0000-4000-8000-000000000003", date: "2026-10-11", mi: 42900, price: 24000, title: "2008 Porsche 911 Carrera S", platform: "Venue One", url: "https://sales.example/s3", image: null },
  { id: "00000000-0000-4000-8000-000000000004", date: "2026-10-03", mi: 55100, price: 19500, title: "2008 Porsche 911 Carrera S", platform: "Venue Three", url: "https://sales.example/s4", image: "https://img.example/broken.svg" },
  { id: "00000000-0000-4000-8000-000000000005", date: "2026-09-27", mi: 27600, price: 38500, title: "2008 Porsche 911 Carrera S sold on Bring a Trailer", platform: "Venue Two", url: "https://sales.example/s5", image: null }
];
const RANGE_B = { ...RANGE, cards: SALE_CARDS };
// The figures the card prints are the ENGINE's, read from the same shape function the endpoint uses (range, and the exact lowest and highest sale: lowestSaleN / highestSaleN). Never typed into this check.
const usdE = n => "$" + Number(n).toLocaleString("en-US");
const engineFigures = d => { const o = partnerShape(d, "q", 0, {}); return { range: usdE(o.range.low) + " to " + usdE(o.range.high), lo: o.span ? "Lowest sale " + usdE(o.span.low) : null, hi: o.span ? "Highest sale " + usdE(o.span.high) : null }; };
const FIG_B = engineFigures(RANGE_B);
const engineOrder = (order, mileage) => partnerPositionsOf(RANGE_B, { prices: {}, mileage: mileage || null, order }).sales.map(r => r.price);
function engineAsk(out, d, body) {
  const ask = positionAskOf(body); if (!ask || !out || out.ok === false) return out;
  const px = partnerPositionsOf(d, ask);
  return { ...out, positions: d.__noPositions ? [] : px.positions, placedSales: px.sales.map(placedSaleOf), order: px.order, ...(px.perOption && !d.__noPerOption ? { perOption: perOptionOf(px.perOption) } : {}) };
}
const ERR = /undefined|NaN|\[object|TypeError|ReferenceError|Unexpected token|Something went wrong|\bnull\b/;

const browser = await startBrowser();
async function open(view, car, width, answers) {
  const p = await browser.newPage(); await p.setViewport({ width, height: 900, deviceScaleFactor: 1 });
  const errs = [], html = pageHtml(view, car); let n = 0; p._asked = [];
  p.on("pageerror", e => errs.push("pageerror " + e.message)); p.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push("console " + m.text()); });
  await p.setRequestInterception(true);
  p.on("request", r => { const u = new URL(r.url());
    if (u.host === "goasksam.com" && r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html", body: html });
    if (u.host === "goasksam.com" && u.pathname === "/api/partnerAnswer" && r.method() === "POST") {
      let b = {}; try { b = JSON.parse(r.postData() || "{}"); } catch {} p._asked.push(b);
      const d = typeof answers === "function" ? answers(b) : answers[Math.min(n++, answers.length - 1)], out = engineAsk({ ...partnerShape(d, b.q || car, Number(b.asked) || 0, {}), updated: null }, d, b);
      return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(out) }); }
    if (u.host === "goasksam.com" && u.pathname === "/api/partnerAnswer" && r.method() === "GET" && u.searchParams.get("photo")) return /0004$/.test(u.searchParams.get("photo")) ? r.respond({ status: 404, body: "" }) : r.respond({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="54"><rect width="72" height="54" fill="#8ab"/></svg>' });
    if (u.host === "img.example") return /broken/.test(u.pathname) ? r.respond({ status: 404, body: "" }) : r.respond({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="54"><rect width="72" height="54" fill="#8ab"/></svg>' });
    if (u.host === "goasksam.com") return r.respond({ status: 204, body: "" });
    return r.respond({ status: 204, body: "" }); });
  await p.goto("https://goasksam.com/preview?view=" + view + "&car=" + encodeURIComponent(car), { waitUntil: "networkidle2" }).catch(() => {});
  await new Promise(r => setTimeout(r, 500));
  return { p, errs };
}
const OUT = { a: "#a-out", b: "#b-out", c: "#c-rail", d: "#c-rail" };   // d is the merged listing page: the rail and the list under the gallery
const textOf = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return e ? e.innerText.replace(/\s+/g, " ").trim() : null; }, sel).catch(() => null);

if (!process.env.ONLY_SPLIT && !process.env.ONLY_APART) for (const width of [1440, 390]) for (const view of ["a", "b", "c", "d"]) for (const sc of SCENARIOS) {
  const car = view === "c" || view === "d" ? DUMMY.q : "2025 Porsche 911", tag = `${view} ${width} ${sc.name}`;
  const { p, errs } = await open(view, car, width, sc.answers);
  try {
    const t = await textOf(p, OUT[view]);
    ok(t != null && t.length > 0, `${tag}: the panel exists and is not empty (${t == null ? "no panel" : "empty"})`);
    ok(sc.say.every(s => (t || "").includes(s)), `${tag}: the panel says ${JSON.stringify(sc.say)}, got ${JSON.stringify((t || "").slice(0, 160))}`);
    const body = await p.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
    ok(!ERR.test((t || "")), `${tag}: no error text in the panel (${((t || "").match(ERR) || [])[0]})`);
    ok(sc.allowCouldNot || !(t || "").includes(COULD_NOT), `${tag}: the "could not read" line is only for a read that gave nothing`);
    ok(sc.allowTryAgain || !/Try again/.test(t || ""), `${tag}: no Try again on a read that answered`);
    ok(errs.length === 0, `${tag}: no page or console error (${errs[0] || ""})`);
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${tag}: no sideways scroll`);
    if (sc.ask && (view === "a" || view === "b")) {
      const opts = await p.$$(OUT[view] + " button.opt");
      ok(opts.length >= 2, `${tag}: the engine's question has its options as tappable chips (${opts.length})`);
      const tall = await p.evaluate(s => Array.from(document.querySelectorAll(s + " button.opt")).every(b => b.getBoundingClientRect().height >= 30), OUT[view]);
      ok(tall, `${tag}: the chips are tappable size`);
      const labels = await p.evaluate(s => Array.from(document.querySelectorAll(s + " button.opt")).map(b => b.innerText.trim()), OUT[view]);
      ok(!labels.some(l => SKIPWORDS.test(l)), `${tag}: no skip or escape chip is drawn (${labels.join(" | ")})`);
      ok(labels.every(l => !/\(\d[\d,]*\)\s*\(\d[\d,]*\)/.test(l)), `${tag}: a count is printed once beside a chip (${labels.join(" | ")})`);
      if (sc.follow && opts.length) {
        await opts[0].click(); await new Promise(r => setTimeout(r, 900));
        const t2 = await textOf(p, OUT[view]);
        ok(sc.follow.every(s => (t2 || "").includes(s)), `${tag}: choosing the first chip draws the range, got ${JSON.stringify((t2 || "").slice(0, 120))}`);
        const sent = p._asked[p._asked.length - 1] || {};
        ok(sent.refine && sent.refine.trim === "carrera", `${tag}: the chip sends the engine's own refine (${JSON.stringify(sent)})`);
      }
    }
    // THE PILL (views b and c): a reserve (b) or the sample price (c) is placed against the engine's range field, and a pill with no words is dead
    if (sc.name === "range" || sc.name === "thin") {
      // view b's reserve, positions and sales are covered by the listing form checks below
      if (view === "c" && sc.range) {
        const pill = await p.evaluate(() => { const e = document.querySelector("#c-rail .pill, #c-sample .pill"); return e ? { cls: e.className, text: e.innerText.trim() } : null; });
        ok(pill && /\b(in|above|below)\b/.test(pill.cls) && pill.text.length > 3, `${tag}: the price on the listing gets a pill against the range (${JSON.stringify(pill)})`);
      }
    }
    if (view === "d" && sc.range) {
      const list = await textOf(p, "#d-sales");
      ok(list != null && list.length > 0, `${tag}: the sales list under the listing is not empty`);
    }
  } catch (e) { ok(false, `${tag}: threw ${e.message}`); }
  await p.close();
}

// ---- THE LISTING FORM (view b, Sam, Nov 1 2026)
const CAR_B = "2008 Porsche 911 Carrera S", wait = ms => new Promise(r => setTimeout(r, ms));
const typeIn = async (p, sel, v) => { await p.evaluate((s, x) => { const i = document.querySelector(s); i.value = x; i.dispatchEvent(new Event("input", { bubbles: true })); }, sel, v); };   // typing only: no read yet
const commit = async (p, sel) => { await p.evaluate(s => document.querySelector(s).dispatchEvent(new Event("change", { bubbles: true })), sel); };   // leaving the field
const cardText = p => textOf(p, "#b-out");
const rowPrices = p => p.evaluate(() => [...document.querySelectorAll("#b-out .slist li .p")].map(e => Number(e.innerText.replace(/[^\d]/g, ""))));
for (const width of [1440, 390]) {
  const t = `listing form ${width}`;
  const { p, errs } = await open("b", CAR_B, width, [RANGE_B]);
  try {
    const page = await p.evaluate(() => ({ h1: (document.querySelector("#view-b h1") || {}).innerText, labs: [...document.querySelectorAll("#view-b label")].map(l => l.innerText.replace(/\s+/g, " ").trim()), all: document.querySelector("#view-b").innerText, demoBar: document.querySelector(".demo-bar") && document.querySelector(".demo-bar").innerText, carbar: !!document.querySelector(".carbar"), logo: !!document.querySelector(".plogo img"), prep: (document.querySelector(".prep") || {}).innerText, tabOn: (document.querySelector('.tabs a[aria-current="page"]') || {}).innerText, side: document.documentElement.scrollWidth > window.innerWidth + 1 }));
    ok(page.h1 === "Look up your vehicle", `${t}: the heading is Look up your vehicle (${page.h1})`);
    ok(["License plate", "VIN", "Mileage (optional)", "Format", "Starting bid", "Reserve price (optional)"].every(l => page.labs.some(x => x.startsWith(l))), `${t}: the plate, VIN, mileage, format and price fields are there (${page.labs.join(" | ")})`);
    ok(/Listing format & pricing/i.test(page.all) && !/listing fee|Sell for free/i.test(page.all), `${t}: the pricing section is there and carries no eBay fee card or promo`);
    ok(page.demoBar && /b\. Setting a reserve/.test(page.demoBar) && /^b\./.test(page.tabOn || "") && page.carbar && page.logo && /Prepared for eBay/.test(page.prep || ""), `${t}: the demo bar (b active), the car row and the eBay strip with its logo are the other pages' own`);
    ok(!page.side, `${t}: no sideways scroll`);
    let c = await cardText(p);
    ok(["What these sell for", FIG_B.range, "The middle half of completed sales", FIG_B.lo, FIG_B.hi, "Powered by GoAskSam", "How Sam decides", "Type a price and Sam shows where it sits against the range."].every(x => (c || "").includes(x)), `${t}: with no price typed the card shows the range, the ends and the hint, got ${JSON.stringify((c || "").slice(0, 200))}`);
    ok(!/\bnull\b|undefined|NaN/.test(c || ""), `${t}: no error text in the card`);
    // prices: each is placed by the ENGINE's answer; the page only prints it
    const reads0 = p._asked.length;
    await typeIn(p, "#b-reserve", "30000"); await typeIn(p, "#b-start", "45000"); await typeIn(p, "#b-bin", "10000"); await wait(900);
    ok(p._asked.length === reads0, `${t}: typing alone reads nothing (${p._asked.length - reads0} reads before any field is left)`);
    await commit(p, "#b-reserve"); await wait(500);
    ok(p._asked.length === reads0 + 1, `${t}: leaving the reserve field is one read (${p._asked.length - reads0})`);
    await commit(p, "#b-start"); await commit(p, "#b-bin"); await wait(900);
    ok(p._asked.length === reads0 + 1, `${t}: committing the other two fields asks nothing new, the same state is one read (${p._asked.length - reads0})`);
    await typeIn(p, "#b-bin", "11000"); await commit(p, "#b-bin"); await wait(500);
    ok(p._asked.length === reads0 + 2, `${t}: a changed field committed is one more read (${p._asked.length - reads0})`);
    await typeIn(p, "#b-bin", "10000"); await commit(p, "#b-bin"); await wait(900);
    c = await cardText(p);
    ok(/Reserve \$30,000\. Within the range\./.test(c) && /Starting bid \$45,000\. Above the range\./.test(c) && /Buy It Now \$10,000\. Below the range\./.test(c), `${t}: a line for each typed price, from the engine's position, got ${JSON.stringify((c || "").slice(0, 260))}`);
    const marks = await p.evaluate(() => [...document.querySelectorAll("#b-out .mk")].map(e => e.innerText.trim()).sort().join(""));
    ok(marks === "BRS", `${t}: a marker S, R and B on the bar (${marks})`);
    const rel = await p.evaluate(() => [...document.querySelectorAll("#view-b .rel")].map(e => e.innerText.trim()).filter(Boolean).join("|"));
    ok(/Within the range\./.test(rel), `${t}: the field's own line says where it sits (${rel})`);
    ok(!/No range|Type a price/.test(c), `${t}: the hint is gone once a price is typed`);
    // sales: five rows, the engine's order, link, photo only when it loads
    let li = await p.evaluate(() => [...document.querySelectorAll("#b-out .slist li")].map(e => ({ th: !!e.querySelector(".th"), href: (e.querySelector("a") || {}).href || null, text: e.innerText.replace(/\s+/g, " ") })));
    ok(li.length === 5, `${t}: five recent sales (${li.length})`);
    ok(li.every(r => !r.href) && !/Venue (One|Two|Three)|sales\.example|Bring a Trailer/.test(c), `${t}: a sale row shows no link and no venue: photo, car name, date, miles and price only`);
    const named = await p.evaluate(() => [...document.querySelectorAll("#b-out .slist li")].map(e => ({ price: e.querySelector(".p").innerText, name: (e.querySelector(".d") || {}).innerText || null })));
    ok(named.find(r => r.price === "$38,500").name === null && named.find(r => r.price === "$31,250").name === "2008 Porsche 911 Carrera S", `${t}: the car name is the engine's; an empty name prints nothing ${JSON.stringify(named)}`);
    ok(li.some(r => r.th) && li.some(r => !r.th), `${t}: a row with a photo has a tile and a row without one has none`);
    const tiles = await p.evaluate(() => [...document.querySelectorAll("#b-out .slist li")].map(e => ({ price: e.querySelector(".p").innerText, th: !!e.querySelector(".th") })));
    ok(tiles.find(r => r.price === "$31,250").th && !tiles.find(r => r.price === "$24,000").th && !tiles.find(r => r.price === "$19,500").th, `${t}: the tile is there only for the photo that loads (a missing photo and a photo that fails to load show no tile and no stand-in) ${JSON.stringify(tiles)}`);
    ok(await p.evaluate(() => { const a = document.querySelector("#b-out .all"); return a && /^\?view=a&car=/.test(a.getAttribute("href")); }), `${t}: See all sales for this car opens the demo's own answer view`);
    // the order follows the toggle (and the mileage)
    const prices = await rowPrices(p);
    ok(JSON.stringify(prices) === JSON.stringify(engineOrder("date")) && prices[0] === 31250, `${t}: with no mileage the sales are newest first, as the engine sent them (${prices})`);
    await p.evaluate(() => document.querySelector('#b-out [data-order="price"]').click()); await wait(700);
    ok(JSON.stringify(await rowPrices(p)) === JSON.stringify(engineOrder("price")), `${t}: Highest price orders the rows as the engine sent them`);
    { const r1 = p._asked.length;
      await p.focus("#b-miles"); await p.keyboard.type("36000", { delay: 15 }); await wait(500);
      ok(p._asked.length === r1, `${t}: typing the mileage key by key reads nothing (${p._asked.length - r1})`);
      await p.keyboard.press("Enter"); await wait(900);
      ok(p._asked.length === r1 + 1 && p._asked[p._asked.length - 1].mileage === 36000, `${t}: Return commits the mileage: one read, with the mileage (${p._asked.length - r1})`);
      const r2 = p._asked.length; await p.focus("#b-miles"); await p.keyboard.press("Tab"); await wait(500);
      ok(p._asked.length === r2, `${t}: leaving a field whose value did not change reads nothing`); }
    await p.evaluate(() => document.querySelector('#b-out [data-order="miles"]').click()); await wait(700);
    ok(JSON.stringify(await rowPrices(p)) === JSON.stringify(engineOrder("miles", 36000)), `${t}: Closest miles orders the rows as the engine sent them for the mileage typed (${engineOrder("miles", 36000)})`);
    ok((p._asked.filter(b => b.order === "miles" && b.mileage === 36000).length >= 1) && p._asked.some(b => b.prices && b.prices.reserve === 30000), `${t}: the page asks the engine with the mileage, the order and the typed prices`);
    // format switch
    await p.select("#b-format", "fixed"); await wait(1200);
    const fx = await p.evaluate(() => ({ auction: !document.getElementById("b-auction").hidden, fixed: !document.getElementById("b-fixed").hidden, dur: [...document.querySelectorAll("#b-duration option")].map(o => o.innerText).join("|"), lab: document.getElementById("b-durlab").innerText }));
    ok(!fx.auction && fx.fixed && /30 days/.test(fx.dur) && fx.lab === "Duration", `${t}: Fixed Price shows Item price and its durations and hides the auction fields (${JSON.stringify(fx)})`);
    await typeIn(p, "#b-price", "72000"); await commit(p, "#b-price"); await wait(900);
    c = await cardText(p);
    const m2 = await p.evaluate(() => [...document.querySelectorAll("#b-out .mk")].map(e => e.innerText.trim()).join(""));
    ok(/Item price \$72,000\. Above the range\./.test(c) && m2 === "P" && !/Starting bid|Reserve \$|Buy It Now \$/.test(c), `${t}: Item price is placed by the engine and the auction prices are no longer on the card (${m2})`);
    await p.select("#b-format", "auction"); await wait(1200);
    ok(await p.evaluate(() => !document.getElementById("b-auction").hidden && document.getElementById("b-fixed").hidden), `${t}: switching back shows the auction fields`);
    ok(errs.length === 0, `${t}: no page or console error (${errs[0] || ""})`);
  } catch (e) { ok(false, `${t}: threw ${e.message}`); }
  await p.close();
}
{
  // an engine that returns no position: the page prints no line, no marker and no comparison of its own
  const { p } = await open("b", CAR_B, 1440, [{ ...RANGE_B, __noPositions: true }]);
  await typeIn(p, "#b-reserve", "30000"); await commit(p, "#b-reserve"); await wait(900);
  const c = await cardText(p), marks = await p.evaluate(() => document.querySelectorAll("#b-out .mk").length), rel = await p.evaluate(() => [...document.querySelectorAll("#view-b .rel")].map(e => e.innerText.trim()).join(""));
  ok(!/Reserve \$30,000|Within the range|Above the range|Below the range/.test(c) && marks === 0 && rel === "", `listing form: no position from the engine means no line, no marker and no field note (${JSON.stringify((c || "").slice(0, 160))})`);
  ok(c.includes(FIG_B.range), "listing form: the range still shows");
  await p.close();
  // THE ENDS ARE THE ENGINE'S (Lane B lane-b-fast a832088f: the exact lowest and highest sale replace the rounded rail). Move the engine's figures and the card follows; take them away and the card prints no end.
  for (const [name, patch] of [["moved", { lowestSaleN: 11111, highestSaleN: 88888 }], ["exact ends missing", { lowestSaleN: null, highestSaleN: null }]]) {
    const d = { ...RANGE_B, ...patch }, f = engineFigures(d), { p: pe } = await open("b", CAR_B, 1440, [d]); const ce = await cardText(pe);
    if (patch.lowestSaleN) ok(f.lo === "Lowest sale " + usdE(patch.lowestSaleN) && f.hi === "Highest sale " + usdE(patch.highestSaleN) && ce.includes(f.lo) && ce.includes(f.hi) && !ce.includes(FIG_B.lo), `listing form: when the engine's lowest and highest sale are ${name}, the card prints those (${JSON.stringify((ce || "").slice(0, 200))})`);
    else ok(f.lo === null && !/Lowest sale|Highest sale/.test(ce) && ce.includes(f.range) && /Type a price/.test(ce) && (await pe.evaluate(() => document.querySelectorAll("#b-out .bar").length)) === 0, `listing form: with ${name} from the engine the card prints no end and no bar, and keeps the range and the hint (${JSON.stringify((ce || "").slice(0, 200))})`);
    await pe.close();
  }
  // static: this check holds no dollar figure for the card's range or ends; they come from engineFigures()
  { const me = import.meta.url.replace("file://", ""), self = (await import("node:fs")).readFileSync(me, "utf8");
    const hard = (t) => /["'`](?:Lowest|Highest) sale \$\d|["'`]\$\d[\d,]* to \$\d[\d,]*["'`]/.test(t.replace(/\/\/ static[^\n]*\n/, ""));
    ok(!hard(self.split("\n").filter(l => !/hard\(|selfTestHard/.test(l)).join("\n")), "listing form: the check types no dollar figure for the card's range or ends (engineFigures reads them)");
    ok(hard('x("Lowest sale $15,000")') && hard("x('$22,500 to $41,000')") && !hard("x(FIG_B.lo)"), "listing form: that guard sees a typed end or range and ignores a read one"); }
  // FALLBACK (no perOption in the answer): A CAR THE ENGINE READS AS SEPARATE MARKETS (Sam, Nov 1 2026, the 2008 911 Carrera S: Coupe $44,500 to $66,000 and Cabriolet $43,000 to $63,000, no one range). The engine returns no range, so no position and no sales;
  // the page must offer the engine's own choice (its body line), send the choice WITH every typed price, the mileage and the order, and then print what the engine places. It places and sorts nothing itself.
  {
    // the engine's REAL split answer (scripts/e98Fixtures.mjs "2004 BMW M3 (split)": cluster null, noCluster, the body line Convertible 9 / Coupe 8), with the five listing sales
    const SPLITM = { status: "one_box", ...MC["2004 BMW M3 (split)"].d, cards: SALE_CARDS, __noPerOption: true };   // an engine that gives no perOption (an older answer): the page falls back to the engine's own choice
    const rg = partnerShape(RANGE_B, "q", 0, {}).range, FIG_RANGE = "$" + rg.low.toLocaleString("en-US") + " to $" + rg.high.toLocaleString("en-US");   // the engine's figure, read from the shape function
    const pick = body => body.refine && body.refine.body ? { ...RANGE_B, refined: body.refine } : SPLITM;
    for (const width of [1440, 390]) {
      const { p } = await open("b", CAR_B, width, pick); const t = `split car ${width}`;
      await typeIn(p, "#b-miles", "15000"); await commit(p, "#b-miles"); await wait(500);
      await typeIn(p, "#b-start", "40000"); await commit(p, "#b-start"); await wait(500);
      await typeIn(p, "#b-bin", "60000"); await commit(p, "#b-bin"); await wait(900);
      const last = p._asked[p._asked.length - 1] || {}, c0 = await cardText(p);
      ok(last.mileage === 15000 && last.prices && last.prices.starting_bid === 40000 && last.prices.buy_it_now === 60000, `${t}: typing the three values sends them to the engine, one commit at a time (${JSON.stringify(last)})`);
      ok(!/Lowest sale|Starting bid \$|Buy It Now \$/.test(c0 || "") && (await p.evaluate(() => document.querySelectorAll("#b-out .mk, #b-out .legend").length)) === 0 && (await p.evaluate(() => document.querySelectorAll('#b-out .idl[data-key="body"]').length)) === 2, `${t}: the engine gave no one range, so the card offers the engine's own body choice (Convertible, Coupe) and prints no position, bar or sale of its own (${JSON.stringify((c0 || "").slice(0, 160))})`);
      ok(/Convertible \(9\)/.test(c0) && /Coupe \(8\)/.test(c0), `${t}: the choice carries the engine's counts (${JSON.stringify((c0 || "").slice(-120))})`);
      const before = p._asked.length;
      await p.evaluate(() => document.querySelector('#b-out .idl[data-val="coupe"]').click()); await wait(900);
      const sent = p._asked[p._asked.length - 1] || {}, c1 = await cardText(p);
      ok(p._asked.length === before + 1 && sent.refine && sent.refine.body === "coupe" && sent.mileage === 15000 && sent.prices && sent.prices.starting_bid === 40000 && sent.prices.buy_it_now === 60000 && sent.order === "miles", `${t}: choosing Coupe sends the engine's refine with the mileage, both prices and the order (${JSON.stringify(sent)})`);
      ok(c1.includes(FIG_RANGE) && /Starting bid \$40,000/.test(c1) && /Buy It Now \$60,000/.test(c1) && (await p.evaluate(() => document.querySelectorAll("#b-out .sales li").length)) === 5, `${t}: after the choice the card shows the range, where the starting bid and the Buy It Now sit, and five sales (${JSON.stringify((c1 || "").slice(0, 200))})`);
      ok((await p.evaluate(() => document.querySelectorAll("#b-out .idl.chosen").length)) === 1 && /Any \(/.test(c1), `${t}: the choice stays visible with a way back to Any`);
      await p.evaluate(() => document.querySelector('#b-out .idl[data-val=""]').click()); await wait(900);
      // back to the unsplit car: the same state as before the choice, so the page shows the one answer it already holds (one read per distinct state) and the split choice is offered again
      const cb = await cardText(p);
      ok((await p.evaluate(() => document.querySelectorAll("#b-out .idl.chosen").length)) === 0 && (await p.evaluate(() => document.querySelectorAll('#b-out .idl[data-key="body"]').length)) === 2 && !/Lowest sale|Starting bid \$/.test(cb || ""), `${t}: Any goes back to the unsplit car, offers the choice again and keeps what was typed (${JSON.stringify((cb || "").slice(0, 120))}, start ${await p.evaluate(() => document.querySelector("#b-start").value)}, bin ${await p.evaluate(() => document.querySelector("#b-bin").value)})`);
      ok((await p.evaluate(() => document.querySelector("#b-start").value)) === "40,000" && (await p.evaluate(() => document.querySelector("#b-bin").value)) === "60,000" && (await p.evaluate(() => document.querySelector("#b-miles").value)) === "15,000", `${t}: the typed values are still in the fields`);
      await p.close();
    }
    // THE CLASS: every engine answer with no one range (the engine reads the car as separate markets) either carries a choice the page offers, or it is a dead end for the visitor. Every such answer in the fixtures:
    for (const [name, v] of Object.entries(MC)) {
      const d = { status: "one_box", ...v.d, cards: SALE_CARDS, __noPerOption: true }; if (d.tier !== "result" || d.cluster) continue;
      const { p: pk } = await open("b", CAR_B, 1440, [d]); await typeIn(pk, "#b-start", "40000"); await commit(pk, "#b-start"); await wait(700);
      const n = await pk.evaluate(() => document.querySelectorAll("#b-out .idl, #b-out button.opt").length), txt = await cardText(pk);
      ok(n >= 2 && !/Starting bid \$40,000/.test(txt || ""), `no-range answer "${name}": view b offers the engine's choice (${n} options) and prints no position of its own`);
      await pk.close();
    }
    // the engine's question (a body, model or generation chip) keeps the typed values the same way
    const Q = { status: "one_box", tier: "body_choice", prompt: "Which one is it?", bodyOptions: ["Coupe", "Cabriolet"], baseLabel: CAR_B, askIndex: 1, resolvedCar: { year: 2008, make: "Porsche", model: "911", nameModel: "911", trim: "Carrera S", canonicalLabel: CAR_B } };
    const { p: pq } = await open("b", CAR_B, 1440, b => b.q && /Cabriolet$/.test(b.q) ? RANGE_B : Q);
    await typeIn(pq, "#b-start", "40000"); await commit(pq, "#b-start"); await wait(700);
    await pq.evaluate(() => document.querySelector("#b-out button.opt").click()); await wait(900);
    const sq = pq._asked[pq._asked.length - 1] || {};
    ok(sq.prices && sq.prices.starting_bid === 40000 && /Coupe$/.test(sq.q || ""), `engine question: choosing a chip sends the engine's words with the typed price (${JSON.stringify(sq)})`);
    await pq.close();
  }
  // no range, no card
  const q = await open("b", CAR_B, 1440, [THIN]); const c2 = await cardText(q.p);
  ok(!/The middle half/.test(c2 || "") && /Only 3 sales/.test(c2 || ""), "listing form: with no range there is no card, only the engine's own line");
  await q.p.close();
}
// ---- NO UNEVALUATED TEMPLATE TEXT: the served HTML of every view carries no literal "${" (a nested quote once printed ${reasonLine("cold.reading")} in the listing's rail until the first answer landed)
for (const v of ["a", "b", "c", "d"]) for (const c of ["2008 Porsche 911 Carrera S", DUMMY.q]) ok(!pageHtml(v, c).replace(/<script>[\s\S]*?<\/script>/g, "").includes("${"), `view ${v}, ${c}: the served page holds no unevaluated template text (${(pageHtml(v, c).match(/.{0,30}\$\{.{0,40}/) || [""])[0]})`);
// ---- STATIC: nothing on the page compares a price with a range, and the old placing() cannot come back
{
  const src = fs.readFileSync(new URL("../api/partnerDemo.js", import.meta.url), "utf8");
  const sp0 = src.indexOf("  function samplePrice("), sp1 = src.indexOf("  function sampleBuy(");
  const rest = sp0 >= 0 ? src.slice(0, sp0) + src.slice(sp1) : src;   // samplePrice builds a sample asking price for another car's listing chrome; it is not a typed price
  const BAD = [/\bplacing\s*\(/, /function\s+placing\b/, /\breserveList\b/, /[\w\])]\s*(?:<=?|>=?)\s*(?:a\.range|a\.span|\w+\.range)\.(?:low|high)\b/, /(?:range|span|\bsp|\bp)\.(?:low|high)\s*(?:<=?|>=?)\s*[\w(]/, /Math\.(?:min|max)\([^)]*(?:range|span|\.low|\.high)/];
  const hits = s => BAD.map(r => r.test(s) ? String(r) : null).filter(Boolean);
  ok(hits(rest).length === 0, "the page code holds no comparison of a price with a range and no placing(): " + hits(rest).join(" "));
  // the guard itself: each way the old comparison could come back is caught
  for (const bad of ["function placing(x, a){ if (x < a.range.low) return 1; }", "var z = placing(v, a, 'reserve');", "if (a.range.high < price) {}", "var r = Math.max(0, Math.min(100, (v - sp.low)));  var q = Math.min(v, a.range.high);", "reserveList(rows, {})"]) ok(hits(bad).length > 0, "the static guard catches: " + bad.slice(0, 50));
}

// ---- AN ANSWER THAT PRICES APART (Lane B lane-b-apart 4335891f; Sam, Nov 1 2026: a 2008 Carrera S whose coupes and cabriolets price apart, and the panel did nothing). The engine returns no one range and, for the request's prices, a perOption with each
// option's own range, the place of each typed price against it and its five sales. The page lays the options side by side and prints exactly that. The engine's REAL functions (partnerPositionsOf, perOptionOf) produce every answer below; this check
// types no card figure: what the page must print is read from the engine's answer, and "the right option" is checked against ranges the fixtures are built with.
{
  const row = (yr, price, mi, i, title) => ({ id: "00000000-0000-4000-8000-" + String(500 + Math.round(price / 10) % 90000 + i).padStart(12, "0"), year: yr, _usd: price, mileage: String(mi), rtitle: title, auction_end_date: "2026-0" + (1 + (i % 9)) + "-1" + (i % 9), image: "https://img.example/ok.svg" });
  const many = (n, yr, base, step, mi0, mistep, title) => Array.from({ length: n }, (_, i) => row(yr, base + i * step, mi0 + i * mistep, i, title));
  const opt = (dimension, value, label, n, low, high, floor) => ({ dimension, value, label, n, low, high, rangeFloor: !!floor });
  const A = (dimension, options, rawPool, extra) => ({ ...RANGE, cluster: null, span: null, noCluster: true, tier: "result", optionsState: "apart", headlineDimension: dimension, options, rawPool, cards: [], ...(extra || {}) });
  const CAR_T = "2008 Porsche 911 Carrera S Coupe";
  const FX = [
    { name: "body", d: A("body", [opt("body", "coupe", "Coupe", 14, 52000, 66000), opt("body", "open", "Cabriolet", 14, 82000, 98000)], [...many(14, 2008, 52000, 1000, 9000, 4000, "2008 Porsche 911 Carrera S Coupe"), ...many(14, 2008, 82000, 1100, 11000, 3500, "2008 Porsche 911 Carrera S Cabriolet")]),
      typed: { mileage: "15000", "#b-start": "60000", "#b-bin": "92000" }, want: { Coupe: { start: "Within the range", bin: "Above the range" }, Cabriolet: { start: "Below the range", bin: "Within the range" } }, photos: true },
    { name: "gearbox", d: A("gearbox", [opt("gearbox", "manual", "Manual", 14, 76000, 90000), opt("gearbox", "auto", "Automatic", 14, 38000, 50000)], [...many(14, 2008, 76000, 1000, 9000, 4000, "2008 Porsche 911 Carrera S Coupe 6-Speed Manual"), ...many(14, 2008, 38000, 900, 11000, 3500, "2008 Porsche 911 Carrera S Coupe Tiptronic")]),
      typed: { mileage: "15000", "#b-start": "45000", "#b-bin": "80000" }, want: { Manual: { start: "Below the range", bin: "Within the range" }, Automatic: { start: "Within the range", bin: "Above the range" } }, photos: true },
    { name: "year", d: A("year", [opt("year", "2005", "2005", 9, 31000, 36000), opt("year", "2006", "2006", 9, 45000, 50000), opt("year", "2007", "2007", 3, null, null, true)], [...many(9, 2005, 31000, 600, 20000, 9000, "2005 Test Car"), ...many(9, 2006, 45000, 600, 20000, 9000, "2006 Test Car")]),
      typed: { "#b-start": "33000", "#b-bin": "60000" }, want: { "2005": { start: "Within the range", bin: "Above the range" }, "2006": { start: "Below the range", bin: "Above the range" } }, thin: "2007" },
    { name: "mileage near band", d: A("mileage", [opt("mileage", "lt50", "Under 50,000 miles", 9, 40000, 48000), opt("mileage", "50to100", "50,000 to 100,000 miles", 9, 30000, 36000), opt("mileage", "gt100", "Over 100,000 miles", 3, null, null, true)], [...many(9, 2008, 40000, 900, 10000, 4000, "2008 Test Car"), ...many(9, 2008, 30000, 700, 55000, 4000, "2008 Test Car")]),
      typed: { mileage: "150000", "#b-start": "35000" }, want: { "Under 50,000 miles": { start: "Below the range" }, "50,000 to 100,000 miles": { start: "Within the range" } }, thin: "Over 100,000 miles", forMileage: true },
    { name: "mileage own band", d: A("mileage", [opt("mileage", "lt50", "Under 50,000 miles", 9, 40000, 48000), opt("mileage", "50to100", "50,000 to 100,000 miles", 9, 30000, 36000)], [...many(9, 2008, 40000, 900, 10000, 4000, "2008 Test Car"), ...many(9, 2008, 30000, 700, 55000, 4000, "2008 Test Car")]),
      typed: { mileage: "30000", "#b-start": "35000" }, want: { "Under 50,000 miles": { start: "Below the range" }, "50,000 to 100,000 miles": { start: "Within the range" } } },
    { name: "edition", d: A("edition", [opt("edition", "gts", "GTS", 9, 70000, 80000), opt("edition", "base", "Base", 9, 40000, 50000)], [...many(9, 2008, 40000, 900, 10000, 4000, "2008 Test Car")]),
      typed: { "#b-start": "45000" }, want: { GTS: { start: "Below the range" }, Base: { start: "Within the range" } }, notListed: true },
    { name: "thin body", d: A("body", [opt("body", "coupe", "Coupe", 14, 52000, 66000), opt("body", "open", "Cabriolet", 14, 82000, 98000), opt("body", "targa", "Targa", 3, null, null, true)], [...many(14, 2008, 52000, 1000, 9000, 4000, "2008 Porsche 911 Carrera S Coupe"), ...many(14, 2008, 82000, 1100, 11000, 3500, "2008 Porsche 911 Carrera S Cabriolet")]),
      typed: { mileage: "15000", "#b-start": "60000", "#b-bin": "92000" }, want: { Coupe: { start: "Within the range", bin: "Above the range" }, Cabriolet: { start: "Below the range", bin: "Within the range" } }, thin: "Targa", photos: true }
  ];
  const usdA = n => "$" + Number(n).toLocaleString("en-US");
  const FEWLINE = reasonLine("thin.few_sales");
  for (const width of [1440, 390]) for (const fx of FX) {
    const t = `apart ${fx.name} ${width}`, { p, errs } = await open("b", CAR_B, width, fx.d.__x ? [fx.d] : [fx.d]);
    await wait(300);
    for (const [k, v] of Object.entries(fx.typed)) { const sel = k === "mileage" ? "#b-miles" : k; await typeIn(p, sel, v); await commit(p, sel); await wait(450); }
    await wait(700);
    const last = p._asked[p._asked.length - 1] || {}, ask = positionAskOf(last), eng = perOptionOf(partnerPositionsOf(fx.d, ask).perOption);   // the engine's answer to the request the page really sent
    const dom = await p.evaluate(() => ({ text: (document.querySelector("#b-out") || {}).innerText || "", cls: (document.querySelector("#b-out") || {}).className, cols: [...document.querySelectorAll("#b-out .aopt")].map(c => ({ h: (c.querySelector("h4") || {}).innerText || "", text: c.innerText.replace(/\s+/g, " ").trim(), rows: [...c.querySelectorAll(".slist li")].map(li => li.innerText.replace(/\s+/g, " ").trim()), imgs: c.querySelectorAll(".slist img").length, paras: c.querySelectorAll("p").length })), chips: document.querySelectorAll("#b-out .idl, #b-out button.opt").length, fields: ["#b-miles", "#b-start", "#b-bin"].map(s => (document.querySelector(s) || {}).value), side: document.documentElement.scrollWidth > window.innerWidth + 1 }));
    ok(eng && eng.options.length === dom.cols.length && dom.cols.length >= 2, `${t}: no dead end, one block per option the engine returned (${dom.cols.length} of ${eng && eng.options.length})`);
    ok(dom.chips === 0, `${t}: no choice chip is needed for the panel to work (${dom.chips})`);
    ok(!dom.side, `${t}: no sideways scroll`);
    ok(errs.length === 0, `${t}: no page or console error (${errs[0] || ""})`);
    ok(last.prices && (!fx.typed["#b-start"] || last.prices.starting_bid === Number(fx.typed["#b-start"])) && (!fx.typed["#b-bin"] || last.prices.buy_it_now === Number(fx.typed["#b-bin"])) && (!fx.typed.mileage || last.mileage === Number(fx.typed.mileage)), `${t}: every request carries what was typed (${JSON.stringify(last)})`);
    ok((fx.typed.mileage ? dom.fields[0] === Number(fx.typed.mileage).toLocaleString("en-US") : true) && (!fx.typed["#b-start"] || dom.fields[1] === Number(fx.typed["#b-start"]).toLocaleString("en-US")) && (!fx.typed["#b-bin"] || dom.fields[2] === Number(fx.typed["#b-bin"]).toLocaleString("en-US")), `${t}: the typed values stay in the fields (${dom.fields.join(" | ")})`);
    // the dollar figures: every one on the card is one the engine returned
    const allowed = new Set(); for (const o of eng.options) { if (o.range) { allowed.add(usdA(o.range.low)); allowed.add(usdA(o.range.high)); } for (const q of o.positions) allowed.add(usdA(q.value)); for (const s of o.placedSales) allowed.add(usdA(s.price)); }
    const shown = (dom.text.match(/\$[\d,]+/g) || []), stray = shown.filter(x => !allowed.has(x));
    ok(shown.length > 0 && stray.length === 0, `${t}: no dollar figure of the page's own (${stray.join(" ") || "none"} of ${shown.length})`);
    // each option block prints ITS range, ITS positions and ITS sales, in the engine's order
    eng.options.forEach((o, i) => {
      const c = dom.cols[i] || { h: "", text: "", rows: [], paras: 0, imgs: 0 };
      ok(c.h.startsWith(o.label), `${t}: block ${i + 1} is ${o.label} (${c.h})`);
      if (!o.range) { ok(c.text.includes(FEWLINE) && !/\$/.test(c.text) && c.rows.length === 0, `${t}: ${o.label} has no range of its own, so the engine's line and no position and no sales (${c.text})`); return; }
      ok(c.text.includes(usdA(o.range.low) + " to " + usdA(o.range.high)), `${t}: ${o.label} prints its own range`);
      for (const q of o.positions) { const lab = { starting_bid: "Starting bid", buy_it_now: "Buy It Now", reserve: "Reserve", item_price: "Item price" }[q.key], word = { below: "Below the range", within: "Within the range", above: "Above the range" }[q.place]; ok(c.text.includes(lab + " " + usdA(q.value) + ". " + word + "."), `${t}: ${o.label}: ${lab} sits "${word}" by the engine's place for this option`); }
      const w = fx.want[o.label]; if (w) { const got = [["start", "Starting bid"], ["bin", "Buy It Now"]].filter(([k]) => w[k]).every(([k, lab]) => new RegExp(lab + " \\$[\\d,]+\\. " + w[k] + "\\.").test(c.text)); ok(got, `${t}: ${o.label}: the typed prices sit against THIS option's range (${JSON.stringify(w)}) -> ${c.text.slice(0, 160)}`); }
      if (fx.notListed) ok(c.rows.length === 0 && c.paras === 0, `${t}: ${o.label}: sales not listed means positions alone, no list and no words of the page's own`);
      else { const ex = o.placedSales.map(s => usdA(s.price)); ok(c.rows.length === o.placedSales.length && c.rows.length >= 1 && c.rows.length <= 5 && c.rows.every((r, j) => r.includes(ex[j])), `${t}: ${o.label}: its ${o.placedSales.length} sales, in the engine's order`); }
      if (fx.photos && !fx.notListed) ok(c.imgs === o.placedSales.filter(s => s.photo).length, `${t}: ${o.label}: a thumbnail for each sale with a photo (${c.imgs})`);
    });
    if (fx.forMileage) ok(eng.forMileage && eng.forMileage.line && dom.text.includes(eng.forMileage.line), `${t}: the engine's sentence for the typed mileage is printed (${eng.forMileage && eng.forMileage.line})`);
    else ok(!eng.forMileage || !eng.forMileage.line || dom.text.includes(eng.forMileage.line), `${t}: any engine sentence for the mileage is printed`);
    if (fx.typed.mileage && !fx.notListed && eng.options.some(o => o.placedSales.length > 1)) { const o = eng.options.find(o => o.placedSales.length > 1), mi = o.placedSales.map(s => Math.abs((s.miles || 0) - Number(fx.typed.mileage))); ok(last.order === "miles" && mi.every((x, j) => j === 0 || x >= mi[j - 1]), `${t}: the sales come back nearest the typed mileage first (engine order ${last.order})`); }
    // the order tabs: each click sends its own order, and the page prints the five the engine returned in the engine's order (it sorts nothing)
    if (fx.name === "body") for (const ord of ["price", "date", "miles"]) {
      await p.evaluate(o => document.querySelector('#b-out .tog [data-order="' + o + '"]').click(), ord); await wait(800);
      const sent = p._asked[p._asked.length - 1] || {}, e2 = perOptionOf(partnerPositionsOf(fx.d, positionAskOf(ord === "miles" ? { ...sent, order: "miles", mileage: 15000 } : sent)).perOption), rows2 = await p.evaluate(() => [...document.querySelectorAll("#b-out .aopt")].map(c => [...c.querySelectorAll(".slist li")].map(li => li.innerText.replace(/\s+/g, " ").trim())));
      ok(sent.order === ord || (ord === "miles" && sent.mileage === 15000), `${t}: the ${ord} tab sends order "${ord}" (${sent.order}; the miles state repeats the typed-mileage read, so it is served by the read already held)`);
      ok(e2.options.every((o, i) => o.placedSales.length === rows2[i].length && o.placedSales.every((s, j) => rows2[i][j].includes(usdA(s.price)))), `${t}: the ${ord} tab prints the engine's five in the engine's order, re-sorting nothing`);
    }
    await p.close();
  }
  // THE FIXTURES ARE THE ENGINE'S: every perOption above is made by partnerPositionsOf + perOptionOf; the page never sees anything else. A guard on the page source: nothing in the apart code compares, sorts or sums.
  { const src = fs.readFileSync(new URL("../api/partnerDemo.js", import.meta.url), "utf8"), a = src.slice(src.indexOf("function drawApart"), src.indexOf("function drawB")); 
    ok(a.length > 200 && !/\.sort\(|Math\.(min|max|round)|\blow\s*[<>]|\bhigh\s*[<>]|[<>]=?\s*o\.range|reduce\(/.test(a), "apart: the page code compares, sorts and sums nothing (drawApart)"); }
}
await browser.close();
console.log(`partnerDemoCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
