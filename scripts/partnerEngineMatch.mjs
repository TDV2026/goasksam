// PARTNER vs MARKET CHECK (Lane C, Oct 15 2026): the partner demo's endpoint (api/partnerAnswer.js) must give the
// same range, count, window and sales as Market Check for the same car. If they disagree, the endpoint is wrong.
//
// Part 1, always (no network): the endpoint's reshaping run on fixed engine answers of every shape (range, thin,
// a question, a clarification), each read back the way the Market Check page reads it (public/js/onebox.js: the
// range is the result tier's cluster, the count is heroPoolSizeNum, the window is windowLabel, the sales are d.cards
// on a range answer and the thin receipts on a thin one), written here on its own, not by calling the endpoint's
// helpers. Plus: no venue, link, title or listing id in any output, and the endpoint file reads no market itself.
// Part 2, live, only when GAS_CREW_COOKIE is set (the signed crew cookie, from the environment, never printed): the
// five named cars through the live endpoint and the live Market Check request, compared field by field. Without
// the cookie part 2 is SKIPPED, said so, never counted as a pass. Read only, zero OldCarsData requests.
//   node scripts/partnerEngineMatch.mjs            part 1, part 2 when the cookie is set
import fs from "node:fs";
import { partnerShape, venueLeak, historyOf, PILL_SLOT, demoCard, basisLine } from "../api/partnerAnswer.js";
import { sellsForCardHtml } from "../lib/sellsForCard.js";
// The card Market Check draws for an answer (public/js/onebox.js: window.sellsForCardHtml(d, {})); the partner card is
// the same card with the pill slot, so with the slot taken out the two must be byte-identical.
const sameCard = (partnerCard, d) => String(partnerCard || "").replace(PILL_SLOT, "") === (demoCard(sellsForCardHtml(d, {}), d) || "");

let pass = 0, fail = 0, skip = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const CARS = ["2005 Porsche 911", "1965 Ford Mustang", "1957 Porsche 356 Speedster", "1966 Ferrari 275 GTB", "2023 Porsche 911 GT3"];

// Market Check's own reading of an answer, as its page does it.
function mcReads(d) {
  const range = d.tier === "result" && Array.isArray(d.cluster) ? { low: Math.round(d.cluster[0]), high: Math.round(d.cluster[1]) } : null;
  const count = Number.isFinite(d.poolSize) ? d.poolSize : Number.isFinite(Number(d.poolN)) && d.poolN !== null ? Number(d.poolN) : d.factsBlock && Number.isFinite(d.factsBlock.count) ? d.factsBlock.count : null;
  const src = d.tier === "thin" && d.thin && d.thin.receipts ? d.thin.receipts.map(r => ({ price: Math.round(Number(r.allIn) || Number(r.hammer) || 0), date: String(r.date || "").slice(0, 10) || null }))
    : (d.cards || []).map(c => ({ price: Math.round(Number(c.price) || 0), date: String(c.date || "").slice(0, 10) || null }));
  const sales = src.filter(s => s.price > 0).map(s => s.price + "|" + s.date).sort();
  return { range, count, window: d.windowLabel || null, sales };
}
const asKeys = sales => sales.map(s => s.price + "|" + s.date).sort();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---- part 1: fixed engine answers
const card = (price, date, extra) => ({ price, date, mi: 24000, title: "1965 Ford Mustang Fastback", url: "https://bringatrailer.com/listing/x", platform: "Bring a Trailer", platformName: "Bring a Trailer", id: 12, vinNorm: "X", ...extra });
const FIX = {
  range: { status: "one_box", tier: "result", cluster: [41500, 58000], poolN: 14, windowMonths: 12, readAt: "2026-10-16T12:00:00Z", setAsideReasons: { project: 1, replica: 1, modified: 0 }, windowLabel: "in the last twelve months", engineVersion: "fixture",
    resolvedCar: { year: 1965, make: "Ford", model: "Mustang", bodyStyle: "Fastback" }, cards: [card(61000, "2026-02-01"), card(39000, "2026-04-11"), card(52000, "2025-12-30", { platform: "others", platformName: "Mecum" }), card(0, "2026-01-01")],
    counts: { setAside: { total: 2, reasons: { project: 1, replica: 1, modified: 0 } } }, trend: { quarters: [{ period: "2026-Q2", low: 40000, high: 57000, count: 8 }, { period: "2026-Q3", low: 1, high: 2, count: 3, thin: true }] } },
  thin: { status: "one_box", tier: "thin", poolN: 4, windowLabel: "since 2022", thin: { receipts: [{ allIn: 1250000, date: "2024-08-17", venue: "RM Sotheby's", url: "u", title: "t" }, { hammer: 980000, date: "2023-03-02", venue: "Gooding" }] } },
  question: { status: "one_box", tier: "generation_choice", prompt: "Which generation is it?", askIndex: 1, generationOptions: [{ label: "991", query: "2015 Porsche 991 GT3" }, { label: "992", query: "2023 Porsche 992 GT3" }] },
  clarify: { status: "needs_clarification", clarification: { question: "What year, make and model?" } }
};
for (const [name, d] of Object.entries(FIX)) {
  const out = partnerShape(d, "fixture " + name, 0, { history: historyOf([{ kind: "sale", date: "2022-05-02", priceUsd: 151000, mileage: 14900, house: "Bring a Trailer", url: "https://bringatrailer.com/x", title: "t" }, { kind: "attempt", date: "2026-08-14", bidUsd: 128000, house: "Mecum" }]) });
  ok(venueLeak(out).length === 0, `${name}: no venue, link, title or id (${venueLeak(out).join(", ")})`);
  if (name === "range" || name === "thin") {
    const mc = mcReads(d);
    ok(same(out.range, mc.range), `${name}: range ${JSON.stringify(out.range)} vs Market Check ${JSON.stringify(mc.range)}`);
    ok(out.count === mc.count, `${name}: count ${out.count} vs ${mc.count}`);
    ok(out.window === mc.window, `${name}: window ${out.window} vs ${mc.window}`);
    ok(same(asKeys(out.sales), mc.sales), `${name}: the same sales as Market Check`);
    ok(out.sales.every((s, i, a) => !i || a[i - 1].price <= s.price), `${name}: sales lowest price first`);
    ok(out.sales.every(s => Object.keys(s).sort().join() === "date,miles,name,photo,price" && (s.photo === null || /^(\d{1,15}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.test(s.photo)) && !venueLeak({ n: s.name }).length), `${name}: a sale is its price, date, mileage, the engine row's own name (venue-safe) and its archive id for the photo only`);
    ok(sameCard(out.card, d), `${name}: the shared card, byte-identical to Market Check's card for the same answer`);
  }
  if (name === "thin") ok(out.range === null && /Too few to show a range/.test(out.thin || "") && !/\$/.test(out.thin), "thin: words only, never a range or a dollar figure");
  if (name === "range") {
    ok(basisLine(d) === "Based on 14 sales, the latest in April 2026." && /Based on 14 sales, the latest in April 2026\./.test(out.card) && !/\d+ months|twelve months|Middle half of/.test(out.card), `range: the card's basis line states no month count (got ${basisLine(d)})`);
    ok(!/<a [^>]*>How Sam decides/.test(out.card) && /<span class="sfc-footer-link">How Sam decides<\/span>/.test(out.card), "range: How Sam decides is plain text, not a link");
    ok(out.sales.every(s => s.miles === 24000 || s.miles === null), "range: each sale carries the engine's mileage");
    ok(basisLine({ ...d, poolN: 3 }) === "Based on three sales, the latest in April 2026.", "a count under ten is written in words");
    ok(/Based on 14 sales, the latest in April 2026/.test(out.card || "") && !/sfc-aside/.test(out.card || "") && !/set aside/.test(out.card || "") && /<p class="sfc-howline">The range is the middle half of the sales: a quarter sold below it, a quarter above it\.<\/p>/.test(out.card || "") && out.card.indexOf(PILL_SLOT) > out.card.indexOf("sfc-range"), "range: the demo card carries the basis, no set-aside line (the group under the list carries it), the middle-half line under the footer, and the pill slot under the range");
    ok(out.trend && out.trend.length === 1 && out.trend[0].count >= 8, "range: only quarters with eight or more sales");
    ok(out.setAside && out.setAside.total === 2 && !("modified" in out.setAside.reasons), "range: set-aside reasons, zero counts dropped");
    ok(out.history[0].result === "not_sold" && out.history[0].highBid === 128000 && out.history[1].price === 151000, "history: sold with its price, not sold with its high bid, newest first");
  }
  if (name === "question") ok(out.question && out.question.options.length === 2 && out.question.options[0].send.q === "2015 Porsche 991 GT3" && out.range === null, "question: the engine's own options, what each sends, no range");
  if (name === "clarify") ok(out.answerType === "identity_question" && out.range === null, "clarification: a question, no range");
}
// The last good answer (Oct 17 2026): shown only while the engine's readAt is under a day old, and only a good answer.
{ const { lastGoodUsable, DEMO_CARS } = await import("../api/partnerAnswer.js");
  const good = { readAt: new Date(Date.now() - 3600e3).toISOString(), out: { ok: true, answerType: "range" } };
  ok(lastGoodUsable(good) === true, "last good: an hour-old good answer is shown when a live read fails");
  ok(lastGoodUsable({ ...good, readAt: new Date(Date.now() - 25 * 3600e3).toISOString() }) === false, "last good: past a day it is never shown (the page says it could not read)");
  ok(lastGoodUsable({ ...good, out: { ok: false } }) === false && lastGoodUsable(null) === false, "last good: a failed answer is never kept as good");
  ok(DEMO_CARS.length === 6 && DEMO_CARS.includes("2015 Porsche 911 GT3"), "last good: kept for the demo's own six cars"); }
// A failed read never says the car has no sales (Sam, Oct 17 2026): the page's sales section draws the could-not-read line.
{ const pageSrc = fs.readFileSync(new URL("../api/partnerDemo.js", import.meta.url), "utf8");
  ok(/if \(!a \|\| a\.ok === false\) return '<p class="muted">' \+ notRead\(a\)/.test(pageSrc) && /var notRead = function\(a\)\{ return a && a\.error === "car_limit" \? LIMIT : a && a\.error === "rate_limited" \? BUSY : COULD_NOT; \}/.test(pageSrc) && /setTimeout\(function\(\)\{ ask1\(body\)/.test(pageSrc), "a failed read: one retry, then the could-not-read line, never the no-sales text"); }
// A stale answer (the engine's stored row past its day, served with stale: true and its dated line while it recomputes)
// renders like any engine answer: ok, the range, the card with the engine's own staleLine, never an error.
{ const st = partnerShape({ ...FIX.range, stale: true, staleLine: "Sales read October 15, 2026, refreshing now." }, "fixture stale", 0, {});
  ok(st.ok === true && st.answerType === "range" && st.range && /Sales read October 15, 2026, refreshing now\./.test(st.card || "") && venueLeak(st).length === 0, "a stale answer renders as the engine's answer with its own dated line, not an error"); }
// The demo's daily car limit and its line (lib/_ceilings.js partner_cars; the demo's six cars never count).
{ const pageSrc = fs.readFileSync(new URL("../api/partnerDemo.js", import.meta.url), "utf8"), apiSrc = fs.readFileSync(new URL("../api/partnerAnswer.js", import.meta.url), "utf8");
  ok(/if \(!demoKey\(text\)\) \{[\s\S]{0,200}checkCeiling\(env, req, "partner_cars"/.test(apiSrc) && /status\(429\)[^\n]*car_limit/.test(apiSrc), "other cars count against the demo's daily car limit; the demo's six never do; over it is a 429");
  ok(/That is today's limit for other cars on this demo\./.test(pageSrc) && /a\.error === "car_limit"\) \? a/.test(pageSrc), "over the limit the page says so (no retry), never that the car has no sales"); }
// A refused or failed read never claims the car has no history, and the per-minute ceiling never applies to the demo's
// own six cars (Oct 17 2026: ten view loads in a minute tripped it on the GT3 and the page said two wrong things).
{ const pageSrc = fs.readFileSync(new URL("../api/partnerDemo.js", import.meta.url), "utf8"), apiSrc = fs.readFileSync(new URL("../api/partnerAnswer.js", import.meta.url), "utf8");
  ok(/\(!a \|\| a\.ok === false\) && !\(a && a\.history && a\.history\.length\)\) return '<div class="panel"><h3>This car before<\/h3><p class="muted">' \+ notRead\(a\)/.test(pageSrc), "a failed read: This car before says it could not read, never that there is no earlier sale");
  ok(/checkCeiling\(env, req, demoKey\(text\) \? "partner_demo" : "partner_answer"/.test(apiSrc), "the demo's six cars use their own partner_demo ceiling, other cars partner_answer");
  const { CEILINGS } = await import("../lib/_ceilings.js");
  const pd = CEILINGS.partner_demo, minute = pd && (pd.device || []).find(([w]) => w === 60e3);
  ok(pd && !pd.address && minute && minute[1] >= 90, "partner_demo is per device only and allows a cold walk of the four views and six cars (about 30 reads) three times in a minute");
  ok(/const who = demo \? \{\} : \{ "user-agent": base\["user-agent"\], "x-forwarded-for": base\["x-forwarded-for"\] \}/.test(apiSrc) && /marketCheckAnswer\(req, text, refine, asked, !!demoKey\(text\)\)/.test(apiSrc), "a demo car's read carries no visitor address or browser into Market Check; any other car keeps them");
  ok(/const lk = !refine \? demoKey\(text\) : null;/.test(apiSrc) && /out = vinIn \? \{ \.\.\.last\.out, history, lastGood: true \}/.test(apiSrc) && /if \(!vinIn && out\.ok/.test(apiSrc), "the VIN views fall back to the car's last good answer with their own VIN history; only plain reads write it"); }
// Neither side waits for good (Oct 18 2026): the server read has a deadline and falls back to the last good answer,
// and every page attempt aborts at its own deadline and shows the could-not-read line.
{ const pageSrc = fs.readFileSync(new URL("../api/partnerDemo.js", import.meta.url), "utf8"), apiSrc = fs.readFileSync(new URL("../api/partnerAnswer.js", import.meta.url), "utf8");
  const { READ_DEADLINE_MS } = await import("../api/partnerAnswer.js");
  ok(READ_DEADLINE_MS > 0 && READ_DEADLINE_MS <= 25000 && /Promise\.race\(\[marketCheckAnswer\(/.test(apiSrc), "the server read races a deadline of at most 25 s");
  const m = pageSrc.match(/var ASK_DEADLINE_MS = (\d+);/);
  ok(m && Number(m[1]) > READ_DEADLINE_MS && Number(m[1]) <= 30000 && /ctl\.abort\(\)/.test(pageSrc) && /Promise\.race\(\[read, late\]\)/.test(pageSrc), "each page attempt aborts after the server deadline and resolves to could-not-read"); }
// The demo's sales list (Sam, Oct 18 2026): included sales only (the engine's cards), the set-aside sales apart with the
// engine's own reason words, the set-aside sentence from the numeric counts; views a and d, ten then Show more.
{ const { asideSentence, asideRowsOf, salesOf } = await import("../api/partnerAnswer.js");
  ok(asideSentence({ setAsideReasons: { "odd sale": 4, modified: 0 } }) === "Four sales set aside as odd sales." && asideSentence({ setAsideReasons: { "odd sale": 1 } }) === "One sale set aside as an odd sale." && asideSentence({ setAsideReasons: { "odd sale": 4, modified: 1 } }) === "Five sales set aside, four as odd sales and one as modified." && asideSentence({ setAsideReasons: {} }) === null, "the set-aside sentence: words under ten, singular and plural, no colon");
  const d = { tier: "result", cards: [{ id: "1A2B3C4D-5E6F-4A7B-8C9D-0E1F2A3B4C5D", title: "2005 BMW 330i Sedan", price: 6500, date: "2026-10-10", mi: 85000 }, { id: 12, title: "2005 BMW 330ci on Bring a Trailer", year: 2005, make: "BMW", model: "3-Series", price: 12705, date: "2026-09-16", mi: 71962 }],
    setAsideRows: [{ id: 21, title: "2005 BMW 330ci ZHP Coupe", price: 16500, date: "2026-08-21", mi: 150000, reason: "odd sale", setAside: true }, { id: 22, title: "x", price: 9000, date: "2026-01-01", mi: 1, reason: "Mecum", setAside: true }] };
  const inc = salesOf(d), as = asideRowsOf(d);
  ok(inc.length === 2 && inc.every(r => ["1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", "12"].includes(r.photo)) && !inc.some(r => r.price === 16500), "the list is the engine's included sales only, never a set-aside one");
  ok(inc.find(r => r.photo === "12").name === "2005 BMW 3-Series", "a title carrying a venue word falls back to the row's own year, make and model");
  ok(as.length === 1 && as[0].reason === "odd sale" && as[0].photo === "21", "set-aside rows carry the engine's own reason; a reason with a venue word is dropped");
  const pageSrc = fs.readFileSync(new URL("../api/partnerDemo.js", import.meta.url), "utf8");
  ok(/var LIST_STEP = 10/.test(pageSrc) && /salesList\(a, "a"\)/.test(pageSrc) && /salesList\(a, "d"\)/.test(pageSrc) && /<details class="aside-grp">/.test(pageSrc) && /The most recent /.test(pageSrc) && /newest first\./.test(pageSrc), "views a and d: ten rows, Show more, the set-aside group closed by default, the heading counts what is shown");
  ok(/loading="lazy"/.test(pageSrc) && /\.sph\{flex:none;width:128px;aspect-ratio:4\/3/.test(pageSrc) && /hasAttribute\("data-ph"\)\) t\.parentNode\.removeChild\(t\)/.test(pageSrc), "photos lazy, in a fixed slot; a failed photo leaves the neutral tile"); }
// The merged listing (Sam, Oct 18 2026): views a, b and c only (the old ?view=d opens c); the listing's card under the buy
// box, the sales list and "This car before" under the gallery, once; no placeholder description; view b's list in the
// same row layout with "Your reserve" at its place, no Show more.
{ const { pageHtml } = await import("../api/partnerDemo.js");
  const c = pageHtml("c"), d = pageHtml("d");
  ok((c.match(/href="\?view=/g) || []).length === 3 && !/Under the listing/.test(c) && /id="view-c"(?! hidden)/.test(d), "three tabs; the old d address opens the merged listing");
  ok(!/Placeholder description/.test(c) && /<dt>Year<\/dt>/.test(c) && /<dt>VIN<\/dt>/.test(c) && /<dt>Mileage<\/dt>/.test(c), "no placeholder description; Year, VIN and Mileage kept");
  ok((c.match(/id="d-hist"/g) || []).length === 1 && /\$\("c-rail"\)\.innerHTML = rangePanel\(a, \{ price: D\.price, slot: "c", lines: "c" \}\);/.test(c) && /class="below-gal"/.test(c), "the card in the rail, the list and This car before under the gallery, once");
  ok(/function reserveList\(rows, opts\)/.test(c) && /body \+= saleRow\(s\)/.test(c) && /reserveList\(last, \{ reserve: v \}\)/.test(c) && !/salesTable\(/.test(c), "view b: the same rows, highest price first, the reserve line at its place, no Show more");
  ok((c.match(/function placing\(/g) || []).length === 1 && /placing\(opts\.price, a, opts\.who\)/.test(c) && /"Your reserve is " : "Asking price is "/.test(c) && /who: "reserve"/.test(c), "one comparison against the engine's range, shared by views b and c"); }
// The narrowing lines (Sam, Oct 18 2026: "2001 bmw", M3): Market Check's own lines from the engine's fields, same
// filters, same order, each option the refine Market Check sends; the page draws them under the card in a, b and c.
{ const { linesOf, partnerShape: ps } = await import("../api/partnerAnswer.js");
  const m3 = { status: "one_box", tier: "result", cluster: [20000, 47000], poolN: 12, soldCount: 12, resolvedCar: { year: 2001, make: "BMW", model: "M3", canonicalLabel: "2001 BMW M3" }, bodyOptions: [{ value: "convertible", label: "Convertible", n: 9, inPool: 9 }, { value: "coupe", label: "Coupe", n: 3, inPool: 3 }], cards: [] };
  const L = linesOf(m3);
  ok(L.length === 1 && L[0].key === "body" && L[0].lead === "Which M3?" && L[0].options.map(o => o.label + " (" + o.n + ")").join(" · ") === "Convertible (9) · Coupe (3)" && L[0].any === 12, "2001 BMW M3: the demo carries Market Check's own line, Which M3? Convertible (9) · Coupe (3), Any (12)");
  const L2 = linesOf({ tier: "result", poolN: 30, resolvedCar: { year: 2015, make: "Porsche", model: "911" }, trimQuestion: { model: "911", options: [{ value: "Carrera S", label: "Carrera S", n: 9 }, { value: "GT3", label: "GT3", n: 15 }, { value: "R", label: "R", n: 2, thin: true }] },
    inlineSplits: [{ key: "gearbox", sides: [{ label: "Manuals", n: 10 }, { label: "PDKs", n: 20 }] }], variantOptionsLine: [{ key: "restoration", options: [{ label: "A", value: "a", n: 3 }, { label: "B", value: "b", n: 4 }] }, { key: "tour", options: [{ label: "Touring", value: "touring", n: "three" }, { label: "Wing", value: "wing", n: 5 }] }] });
  ok(L2.map(l => l.key).join() === "trim,tx,variant" && L2[0].options.length === 2 && L2[1].options.map(o => o.label + ":" + o.value).join() === "Manual:manual,PDK:auto" && L2[2].options[0].n === 3 && L2[2].any === 8, "trim (thin options hidden), gearbox (singular labels, manual or auto) and one variant line (restoration skipped, counts in words read as numbers), Market Check's order");
  ok(linesOf({ tier: "identity_question", bodyOptions: m3.bodyOptions }).length === 0 && linesOf({ ...m3, bodyOptions: [m3.bodyOptions[0]] }).length === 0, "no line on a question, none with a single option");
  ok(venueLeak(ps(m3, "2001 bmw M3", 1, {})).length === 0 && ps(m3, "2001 bmw M3", 1, {}).lines.length === 1, "the lines ride the answer and pass the venue-leak guard");
  const pageSrc = fs.readFileSync(new URL("../api/partnerDemo.js", import.meta.url), "utf8");
  ok(/send\.refine = \{\}; send\.refine\[key\] = val;/.test(pageSrc) && /rangePanel\(a, \{ lines: "a" \}\)/.test(pageSrc) && /lines: "b", who: "reserve"/.test(pageSrc) && /Any \(' \+ Number\(l\.any\)/.test(pageSrc), "views a, b and c draw the lines; an option reruns the same query with its refine; Any goes back"); }
// Sam's demo wording (Oct 18 2026): the pills name whose figure it is; the reserve line under the pill is counted from
// exactly the rows the page shows; the thin card carries no middle-half line.
{ const pageSrc = fs.readFileSync(new URL("../api/partnerDemo.js", import.meta.url), "utf8");
  ok(/w \+ "below the usual range"/.test(pageSrc) && /w \+ "above the usual range"/.test(pageSrc) && /w \+ "inside the usual range"/.test(pageSrc) && !/good deal|great price|bargain|overpriced/i.test(pageSrc), "the pills: Asking price is / Your reserve is inside, above or below the usual range; no deal words");
  ok(/var at = v > 0 \? last\.filter\(function\(s\)\{ return s\.price >= v; \}\)\.length : null;/.test(pageSrc) && /"None of the " \+ last\.length \+ " most recent sales reached " \+ usd\(v\) \+ "\."/.test(pageSrc) && /at \+ " of the " \+ last\.length \+ " most recent sales reached " \+ usd\(v\) \+ " or more\."/.test(pageSrc) && /underPill: resLine/.test(pageSrc), "the reserve line is counted from the rows shown, under the pill, None when zero");
  const { demoCard: dc } = await import("../api/partnerAnswer.js");
  ok(!/sfc-howline/.test(dc('<div class="sfc-card"><p class="sfc-thin">3 sales found, not enough for a range.</p><div class="sfc-footer"><span>x</span><a class="sfc-footer-link" href="/how-sam-decides">How Sam decides</a></div></div>', { poolN: 3 })), "a thin card carries no middle-half line"); }
// The endpoint reads no market of its own: Market Check's handler is its only source of figures.
const src = fs.readFileSync(new URL("../api/partnerAnswer.js", import.meta.url), "utf8").replace(/\/\/[^\n]*/g, "");
ok(/import\("\.\/sellerDecision\.js"\)/.test(src) && /oneBox: true/.test(src), "the endpoint asks Market Check's own handler");
ok(!/sales_archive|runOneBox|oneEngineAnswer|supabaseSelect|fetchOnlinePool|familyMarket/.test(src), "the endpoint has no sales read or engine call of its own");
ok(!/oldcarsdata|OLDCARSDATA|_ocd/i.test(src), "the endpoint never touches OldCarsData");

// ---- part 2: live, the five cars
const COOKIE = process.env.GAS_CREW_COOKIE, HOST = process.env.PARTNER_HOST || "https://goasksam.com";
if (!COOKIE) { skip++; console.log("SKIP live: GAS_CREW_COOKIE not set, the five cars were not compared on the live site"); }
else {
  // From inside a real browser page on the site (Vercel's bot challenge answers a plain Node fetch with 429): the cookie
  // is set on the site's own host only, and each read is one fetch from that page, awaited before the next.
  const { default: puppeteer } = await import("puppeteer-core");
  const br = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new" });
  const pg = await br.newPage();
  await pg.setCookie({ name: "gas_crew", value: COOKIE, domain: new URL(HOST).hostname, path: "/", secure: true });
  await pg.goto(HOST + "/partner-demo", { waitUntil: "domcontentloaded" });
  const post = (path, body) => pg.evaluate(async (path, body) => { const r = await fetch(path, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); return { status: r.status, j: await r.json().catch(() => null) }; }, path, body);
  for (const q of CARS) {
    // The same question count on both: Market Check's page asks first (asked 0); a question answered either way is compared as a question.
    // One read at a time (Sam, Oct 16 2026): the endpoint first, then Market Check, never both at once.
    const p = await post("/api/partnerAnswer", { q });
    const m = await post("/api/sellerDecision", { oneBox: true, car: { raw: q }, asked: 0 });
    if (!p.j || !m.j) { ok(false, `${q}: no answer (partner ${p.status}, Market Check ${m.status})`); continue; }
    ok(venueLeak(p.j).length === 0, `${q}: no venue, link, title or id on the live answer (${venueLeak(p.j).slice(0, 3).join(", ")})`);
    if (m.j.status !== "one_box" || /_choice$/.test(String(m.j.tier || ""))) { ok(p.j.answerType === "identity_question", `${q}: Market Check asks (${m.j.tier || m.j.status}), the endpoint asks too (${p.j.answerType})`); console.log(`  ${q}: both ask`); continue; }
    const mc = mcReads(m.j);
    const fields = { range: same(p.j.range, mc.range), count: p.j.count === mc.count, window: p.j.window === mc.window, sales: same(asKeys(p.j.sales || []), mc.sales), card: sameCard(p.j.card, m.j) };
    for (const [k, v] of Object.entries(fields)) ok(v, `${q}: ${k} differs (endpoint ${JSON.stringify(k === "sales" ? (p.j.sales || []).length + " sales" : p.j[k])}, Market Check ${JSON.stringify(k === "sales" ? mc.sales.length + " sales" : mc[k])})`);
    console.log(`  ${q}: ${mc.range ? "$" + mc.range.low + " to $" + mc.range.high : "no range"}, ${mc.count} sales, ${mc.window || "no window"}: ${Object.values(fields).every(Boolean) ? "SAME" : "DIFFERENT"}`);
  }
  await br.close();
}
console.log(`partnerEngineMatch: ${pass} passed, ${fail} failed${skip ? ", live part skipped" : ""}`);
process.exit(fail ? 1 : 0);
