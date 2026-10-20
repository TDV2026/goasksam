// LIVE: this script calls production (goasksam.com). Run it only in a gap the lanes name, with the protection-bypass header (Lane F's rule, Oct 20 2026).
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
import { partnerShape, venueLeak, historyOf, PILL_SLOT, PARTNER_CARD_OPTS, demoCard, basisLine } from "../api/partnerAnswer.js";
import { sellsForCardHtml } from "../lib/sellsForCard.js";
// The card Market Check draws for an answer (public/js/onebox.js: window.sellsForCardHtml(d, {})); the partner card is
// the same card with the pill slot and without the sale rows (the partner page lists those same sales itself, e63), so
// with the slot taken out it must be byte-identical to Market Check's card with its rows list taken out.
const noRows = h => String(h || "").replace(/<ul class="sfc-rows">[\s\S]*?<\/ul>/, "");
// THE FOOTER'S READ TIME (Lane B, Oct 20 2026, the 275 GTB "card differs" after 00:00 UTC): the demo endpoint serves its own
// stored answer (partner_last, under a day old and on the current engine), while this check reads Market Check fresh, so the
// two reads carry different read times and the footer's "Updated <date>" or "Sales read <date>, refreshing now." can name
// different days although every number and line is the same. The card is compared with that footer text set aside; the
// footer is checked on its own to be one of the two engine forms (never invented, never empty of its brand).
const FOOTER_LEFT = /<span class="sfc-footer-left">([\s\S]*?)<\/span>/;
const noTime = h => String(h || "").replace(FOOTER_LEFT, '<span class="sfc-footer-left">(read time)</span>');
const footerOk = h => { const m = FOOTER_LEFT.exec(String(h || "")); return !!m && /^Powered by GoAskSam( &middot; (Updated [A-Z][a-z]+ \d{1,2}(, \d{4})?|Sales read [^<]*refreshing now\.|Sales read on [A-Z][a-z]+ \d{1,2}\. Sales since then are not in yet\. Updating now\.))?$/.test(m[1]); };
const firstDiff = (a, b) => { a = String(a || ""); b = String(b || ""); let i = 0; while (i < a.length && a[i] === b[i]) i++; return i >= a.length && i >= b.length ? null : `at ${i}: endpoint "${a.slice(Math.max(0, i - 40), i + 80)}" / Market Check "${b.slice(Math.max(0, i - 40), i + 80)}"`; };
let lastCardDiff = null;
const sameCard = (partnerCard, d) => {
  const p = String(partnerCard || ""), mcNoRows = noRows(demoCard(sellsForCardHtml(d, {}), d) || ""), mcPartner = demoCard(sellsForCardHtml(d, PARTNER_CARD_OPTS), d) || "";
  const same = noTime(p.replace(PILL_SLOT, "")) === noTime(mcNoRows) && noTime(p) === noTime(mcPartner) && footerOk(p);
  lastCardDiff = same ? null : (firstDiff(noTime(p), noTime(mcPartner)) || (footerOk(p) ? "pill slot or rows" : "the endpoint footer is not an engine form"));
  return same;
};

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
  range: { status: "one_box", tier: "result", cluster: [41500, 58000], poolN: 14, windowMonths: 12, basisLine: "Based on 14 sales, the latest in April 2026.", readAt: "2026-10-16T12:00:00Z", setAsideReasons: { project: 1, replica: 1, modified: 0 }, windowLabel: "in the last twelve months", engineVersion: "fixture",
    resolvedCar: { year: 1965, make: "Ford", model: "Mustang", bodyStyle: "Fastback" }, cards: [card(61000, "2026-02-01"), card(39000, "2026-04-11"), card(52000, "2025-12-30", { platform: "others", platformName: "Mecum" }), card(0, "2026-01-01")],
    counts: { setAside: { total: 2, reasons: { project: 1, replica: 1, modified: 0 } } }, trend: { quarters: [{ period: "2026-Q2", low: 40000, high: 57000, count: 8 }, { period: "2026-Q3", low: 1, high: 2, count: 3, thin: true }] } },
  thin: { status: "one_box", tier: "thin", poolN: 4, windowLabel: "since 2022", thinReason: "few_sales", thinLine: "Not enough sales of this exact car to give a reliable range. These are the sales we found.", latestSaleLine: "Latest sale: August 2024.", thin: { receipts: [{ allIn: 1250000, date: "2024-08-17", venue: "RM Sotheby's", url: "u", title: "t" }, { hammer: 980000, date: "2023-03-02", venue: "Gooding" }] } },
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
    // cardWithRows (Oct 20 2026, additive, the Amazon demo's tab c): Market Check's own card WITH its sale rows, in the engine's
    // order, with only the photo address (the gated ?photo= path) and venue-naming titles swapped; no venue anywhere
    const mcRows = demoCard(sellsForCardHtml(d, {}), d) || "";
    const norm = h => String(h || "").replace(/<img class="sfc-row-img" src="[^"]*"/g, '<img class="sfc-row-img" src=""').replace(/<span class="sfc-row-title">[^<]*<\/span>/g, "");
    ok(typeof out.cardWithRows === "string" && /<ul class="sfc-rows">/.test(out.cardWithRows) === /<ul class="sfc-rows">/.test(mcRows), `${name}: cardWithRows carries the sale rows exactly when Market Check's card does`);
    ok(norm(out.cardWithRows) === norm(mcRows), `${name}: cardWithRows is Market Check's card (same lines, prices, dates, miles, order), photo address and titles aside`);
    const rowDates = [...String(out.cardWithRows).matchAll(/<span class="sfc-row-meta">([^<]*)<\/span>/g)].map(m => m[1]);
    const mcDates = [...String(mcRows).matchAll(/<span class="sfc-row-meta">([^<]*)<\/span>/g)].map(m => m[1]);
    ok(JSON.stringify(rowDates) === JSON.stringify(mcDates), `${name}: cardWithRows lists the sales in Market Check's order (the engine's own, newest first)`);
    ok(venueLeak({ cardWithRows: out.cardWithRows }).length === 0 && !/https?:\/\//.test(out.cardWithRows), `${name}: no venue name or outside address in cardWithRows`);
  }
  if (name === "thin") {
    // the 275 GTB fix (Oct 20 2026): a card read on another day (the endpoint's stored answer against a fresh Market Check
    // read) still matches; a changed line or number never does
    const otherDay = { ...d, readAt: "2026-01-02T03:04:05.000Z", stale: false };
    ok(sameCard(out.card, otherDay), "thin: the same card read on another day still matches (the footer's read time is set aside)");
    const staleDay = { ...d, stale: true, staleLine: "Sales read October 19, 2026, refreshing now." };
    ok(sameCard(out.card, staleDay), "thin: the same card served stale with the dated line still matches");
    // the engine's own stale line (api/sellerDecision.js staleLine, Oct 15 2026), as the 14:05Z FULL run met it live
    const engStale = String(out.card).replace(/<span class="sfc-footer-left">[\s\S]*?<\/span>/, '<span class="sfc-footer-left">Powered by GoAskSam &middot; Sales read on October 20. Sales since then are not in yet. Updating now.</span>');
    ok(sameCard(engStale, d), "thin: the card with the engine's own stale line ('Sales read on <date>. Sales since then are not in yet. Updating now.') still matches");
    ok(!sameCard(engStale.replace(d.latestSaleLine, "Latest sale: May 2021."), d), "thin: with the engine's stale line, a changed line is still a difference");
    ok(!sameCard(String(out.card).replace(d.latestSaleLine, "Latest sale: May 2021."), d), "thin: a changed line is still a difference");
    ok(!sameCard(String(out.card).replace(/<span class="sfc-footer-left">[\s\S]*?<\/span>/, '<span class="sfc-footer-left">Powered by GoAskSam &middot; Updated whenever</span>'), d), "thin: a footer that is not an engine form is a difference");
  }
  if (name === "thin") ok(out.range === null && out.thin === d.thinLine && !/\$/.test(out.thin), "thin: the engine's own thinLine, words only, never a range or a dollar figure");
  if (name === "thin") ok(String(out.card || "").includes(d.thinLine) && String(out.card || "").includes(d.latestSaleLine) && !/\$[\d,]+\s*(?:to|-)\s*\$[\d,]+/.test(String(out.card).replace(/<[^>]+>/g, " ")) && !/sales found, not enough|too spread out/i.test(out.card), "thin: the partner card draws the engine's line and latest sale, no range, no wording of its own");
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
{ const { lastGoodUsable, DEMO_CARS, questionResult } = await import("../api/partnerAnswer.js");
  const { ENGINE_VERSION: EV } = await import("../lib/onebox.js");
  const good = { readAt: new Date(Date.now() - 3600e3).toISOString(), engineVersion: EV, out: { ok: true, answerType: "range" } };
  ok(lastGoodUsable(good) === true, "last good: an hour-old good answer of this engine version is shown when a live read fails");
  ok(lastGoodUsable({ ...good, engineVersion: "e00-older" }) === false && lastGoodUsable({ readAt: good.readAt, out: good.out }) === false, "last good: an answer from another engine version, or with none, is never shown (Sam's demo orders, b)");
  const q = { ok: true, answerType: "identity_question", question: { dimension: "body", text: "Which Mustang?", options: [{ label: "Coupe" }, { label: "Fastback" }] } };
  ok(questionResult(q) && lastGoodUsable({ ...good, out: q }) === true && !questionResult({ ...q, stillReading: true }) && !questionResult({ ok: true, answerType: "range" }), "a demo car's stored QUESTION answer of this version is usable; a still-reading answer and a range are not questions (c)");
  ok(lastGoodUsable({ ...good, readAt: new Date(Date.now() - 25 * 3600e3).toISOString() }) === false, "last good: past a day it is never shown (the page says it could not read)");
  ok(lastGoodUsable({ ...good, out: { ok: false } }) === false && lastGoodUsable(null) === false, "last good: a failed answer is never kept as good");
  ok(DEMO_CARS.length === 7 && DEMO_CARS[0] === "2014 Porsche 911 GT3" && DEMO_CARS.includes("2015 Porsche 911 GT3"), "last good: kept for the demo's own cars, the 2014 GT3 listing car first (c9)"); }
// A failed read never says the car has no sales (Sam, Oct 17 2026): the page's sales section draws the could-not-read line.
{ const pageSrc = fs.readFileSync(new URL("../api/partnerDemo.js", import.meta.url), "utf8");
  ok(/if \(!a \|\| a\.ok === false\) return '<p class="muted">' \+ notRead\(a\)/.test(pageSrc) && /return a && a\.error === "car_limit" \? LIMIT : a && a\.error === "rate_limited" \? BUSY : COULD_NOT;/.test(pageSrc) && !/setTimeout\(function\(\)\{ ask1\(body\)/.test(pageSrc), "a failed read: the could-not-read line (no retry rule of the page's own), never the no-sales text"); }
// A stale answer (the engine's stored row past its day, served with stale: true and its dated line while it recomputes)
// renders like any engine answer: ok, the range, the card with the engine's own staleLine, never an error.
{ const st = partnerShape({ ...FIX.range, stale: true, staleLine: "Sales read October 15, 2026, refreshing now." }, "fixture stale", 0, {});
  ok(st.ok === true && st.answerType === "range" && st.range && /Sales read October 15, 2026, refreshing now\./.test(st.card || "") && venueLeak(st).length === 0, "a stale answer renders as the engine's answer with its own dated line, not an error"); }
// Any car (Sam, Oct 18 2026): every demo read, the six and any other car, uses the demo's own per-device ceiling only.
{ const pageSrc = fs.readFileSync(new URL("../api/partnerDemo.js", import.meta.url), "utf8"), apiSrc = fs.readFileSync(new URL("../api/partnerAnswer.js", import.meta.url), "utf8");
  ok(!/checkCeiling\(env, req, "partner_cars"/.test(apiSrc) && !/"partner_answer"/.test(apiSrc) && (apiSrc.match(/checkCeiling\(env, req, "partner_demo"/g) || []).length === 1, "any car reads under the demo's per-device ceiling only; no daily car cap and no per-address window on the demo");
  ok(/That is today's limit for other cars here\./.test(pageSrc) && /a && a\.error === "car_limit" \? LIMIT/.test(pageSrc) && !/setTimeout\(runs\[view\], (?!a\.retryAfterMs)/.test(pageSrc), "over the limit the page says so (no retry), never that the car has no sales"); }
// A refused or failed read never claims the car has no history, and the per-minute ceiling never applies to the demo's
// own six cars (Oct 17 2026: ten view loads in a minute tripped it on the GT3 and the page said two wrong things).
{ const pageSrc = fs.readFileSync(new URL("../api/partnerDemo.js", import.meta.url), "utf8"), apiSrc = fs.readFileSync(new URL("../api/partnerAnswer.js", import.meta.url), "utf8");
  ok(/\(!a \|\| a\.ok === false\) && !\(a && a\.history && a\.history\.length\)\) return '<div class="panel"><h3>This car before<\/h3><p class="muted">' \+ notRead\(a\)/.test(pageSrc), "a failed read: This car before says it could not read, never that there is no earlier sale");
  ok(/const lim = await checkCeiling\(env, req, "partner_demo", \{ tool: "partner" \}\)/.test(apiSrc), "every demo read, any car, uses the partner_demo ceiling");
  const { CEILINGS } = await import("../lib/_ceilings.js");
  const pd = CEILINGS.partner_demo, minute = pd && (pd.device || []).find(([w]) => w === 60e3);
  ok(pd && minute && minute[1] >= 90, "partner_demo allows a cold walk of the views and six cars (about 30 reads) three times in a minute per device");
  ok(pd && pd.address && pd.device.every(([w, n]) => { const a = pd.address.find(([x]) => x === w); return a && a[1] >= 10 * n; }), "partner_demo's address backstop is at least ten times the device window in every window (Sam, Oct 18 2026)");
  ok(/const who = demo \? \{\} : \{ "user-agent": base\["user-agent"\], "x-forwarded-for": base\["x-forwarded-for"\] \}/.test(apiSrc) && /r = await marketCheckAnswer\(req, text, refine, asked, true\);/.test(apiSrc), "no demo read carries a visitor address or browser into Market Check, so its visitor ceilings are untouched");
  ok(/const lk = !refine \? demoKey\(text\) : null;/.test(apiSrc) && /out = vinIn \? \{ \.\.\.last\.out, history, lastGood: true \}/.test(apiSrc) && /if \(!vinIn && \(fullResult\(out\) \|\| \(questionResult\(out\) && !\(Number\(asked\) > 0\)\)\)\) writeLast/.test(apiSrc), "the VIN views fall back to the car's last good answer with their own VIN history; only plain reads write it"); }
// Neither side waits for good (Sam, Oct 18 2026): the endpoint has no deadline of its own (the engine's whole-path bound
// answers still reading, with its retry); the page's abort is a safety net only, later than the engine's bound.
{ const pageSrc = fs.readFileSync(new URL("../api/partnerDemo.js", import.meta.url), "utf8"), apiSrc = fs.readFileSync(new URL("../api/partnerAnswer.js", import.meta.url), "utf8");
  const mod = await import("../api/partnerAnswer.js");
  ok(!("READ_DEADLINE_MS" in mod) && !/Promise\.race\(\[marketCheckAnswer\(/.test(apiSrc) && !/setTimeout\(/.test(apiSrc.replace(/\/\/[^\n]*/g, "")), "the endpoint has no timeout of its own");
  const engSrc = fs.readFileSync(new URL("../lib/onebox.js", import.meta.url), "utf8") + fs.readFileSync(new URL("../api/sellerDecision.js", import.meta.url), "utf8");
  const bm = engSrc.match(/process\.env\.ONEBOX_DEADLINE_MS \|\| (\d+)\)/), BOUND = bm ? Number(bm[1]) : NaN;
  ok(BOUND > 0, "the engine's whole-path bound is found (" + BOUND + " ms)");
  const m = pageSrc.match(/var ASK_DEADLINE_MS = (\d+);/);
  ok(m && Number(m[1]) > BOUND && Number(m[1]) <= 30000 && /ctl\.abort\(\)/.test(pageSrc) && /Promise\.race\(\[read, late\]\)/.test(pageSrc), "the page's abort (a safety net) comes after the engine's own bound"); }
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
  ok(/loading="lazy"/.test(pageSrc) && /\.sph\{flex:none;width:128px;aspect-ratio:4\/3/.test(pageSrc) && /hasAttribute\("data-ph"\)\) \{ var box = t\.closest\("\.car-photo"\); \(box \|\| t\)\.parentNode\.removeChild\(box \|\| t\); \}/.test(pageSrc), "photos lazy, in a fixed slot; a failed photo leaves the neutral tile (a failed car photo leaves nothing, caption included)"); }
// The merged listing (Sam, Oct 18 2026): views a, b and c only (the old ?view=d opens c); the listing's card under the buy
// box, the sales list and "This car before" under the gallery, once; no placeholder description; view b's list in the
// same row layout with "Your reserve" at its place, no Show more.
{ const { pageHtml } = await import("../api/partnerDemo.js");
  const c = pageHtml("c"), d = pageHtml("d");
  ok(((c.match(/<nav class="tabs"[\s\S]*?<\/nav>/) || [""])[0].match(/href="\?view=/g) || []).length === 3 && !/Under the listing/.test(c) && /id="view-c"(?! hidden)/.test(d), "three tabs; the old d address opens the merged listing");
  ok(!/Placeholder description/.test(c) && /<dt>Year<\/dt>/.test(c) && !/<dt>VIN<\/dt>/.test(c) && /<dt>Mileage<\/dt>/.test(c), "no placeholder description; About this car keeps Year and Mileage (the VIN shows once, under the title)");
  ok((c.match(/id="d-hist"/g) || []).length === 1 && /\$\("c-rail"\)\.innerHTML = \(D \? priorPanel\(a, true\) : ""\) \+ rangePanel\(a, D \? \{ price: D\.price, slot: "c", lines: "c" \} : \{ slot: "c", lines: "c" \}\);/.test(c) && /class="below-gal"/.test(c), "the card in the rail, the list and This car before under the gallery, once");
  ok(/function reserveList\(rows, opts\)/.test(c) && /body \+= saleRow\(s, null, opts\.keys\)/.test(c) && /reserveList\(last, \{ reserve: v, keys: keysOf\(a\) \}\)/.test(c) && !/salesTable\(/.test(c), "view b: the same rows, highest price first, the reserve line at its place, no Show more");
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
// THE ENGINE'S STILL-READING ANSWER and the retry (Sam, Oct 18 2026; Lane B's shape: tier "unavailable", stillReading,
// samLine, retry, retryAfterMs): passed through as it is; the page draws the engine's line and asks again only after the
// engine's own retryAfterMs; with no wait named it offers Try again. No timeout, retry rule or number of the page's own.
{ const { partnerShape: ps, fullResult, refreshDemoAnswer, DEMO_CARS } = await import("../api/partnerAnswer.js");
  const sr = ps({ status: "one_box", tier: "unavailable", stillReading: true, samLine: "Sam is still reading the sales for this one.", retry: true, retryAfterMs: 15000 }, "2015 Porsche 911 GT3", 0, {});
  ok(sr.ok === false && sr.error === "unavailable" && sr.stillReading === true && sr.line === "Sam is still reading the sales for this one." && sr.retryAfterMs === 15000, "the engine's still-reading answer passes through with its line and its wait");
  const sr2 = ps({ status: "one_box", tier: "unavailable", stillReading: true, samLine: "x" }, "q", 0, {});
  ok(sr2.stillReading === true && sr2.retryAfterMs === null, "no retry asked by the engine: no wait, the page offers Try again");
  ok(ps({ status: "one_box", tier: "rate_limited" }, "q", 0, {}).stillReading === undefined, "a refusal is not a still-reading answer");
  ok(fullResult({ ok: true, answerType: "range" }) && fullResult({ ok: true, answerType: "not_enough_data" }) && fullResult({ ok: true, answerType: "zero_result" }), "a range, a thin answer and the engine's zero answer are full results");
  ok(!fullResult({ ok: true, answerType: "identity_question" }) && !fullResult(sr) && !fullResult({ ok: false, error: "unavailable" }) && !fullResult(null), "a question, a still-reading answer and a failed read are never stored");
  const r0 = await refreshDemoAnswer({ supabaseUrl: "x", supabaseKey: "y" }, "1999 Honda Civic");
  ok(r0.stored === false && r0.why === "not a demo car", "the write path stores the demo's six cars only");
  const apiSrc = fs.readFileSync(new URL("../api/partnerAnswer.js", import.meta.url), "utf8");
  ok((apiSrc.match(/\/rest\/v1\/app_config\?on_conflict=key/g) || []).length === 1 && /async function writeLast\(env, key, out, \{ force = false \} = \{\}\) \{\n  if \(!fullResult\(out\) && !questionResult\(out\)\) return false;/.test(apiSrc), "one write path for partner_last, and it refuses anything but a full result");
  const lastBlock = apiSrc.slice(apiSrc.indexOf("req.query.last != null"), apiSrc.indexOf("req.query.photo != null"));
  ok(lastBlock.length > 0 && /readLast\(env, lk\)/.test(lastBlock) && !/marketCheckAnswer|writeLast|partnerShape/.test(lastBlock), "GET ?last= returns the stored answer only: no engine read, no write");
  const pageSrc = fs.readFileSync(new URL("../api/partnerDemo.js", import.meta.url), "utf8");
  ok(/if \(a && a\.stillReading && a\.retryAfterMs > 0\) setTimeout\(runs\[view\], a\.retryAfterMs\);/.test(pageSrc) && (pageSrc.match(/setTimeout\(runs\[view\]/g) || []).length === 1, "the page asks again only after the engine's own retryAfterMs");
  ok(/esc\(a\.line \|\| STILL_LINE\)/.test(pageSrc) && /data-retry>Try again<\/button>/.test(pageSrc), "the still-reading state draws the engine's line, and Try again when no wait is named");
  ok(/fetch\("\/api\/partnerAnswer\?last=" \+ encodeURIComponent\(body\.q\)/.test(pageSrc) && /if \(!a \|\| !a\.aborted\) return a;/.test(pageSrc), "after the page's abort (a safety net only): the stored last good answer, else the still-reading state");
  // ONE CAR ACROSS THE VIEWS, ANY CAR (Sam, Oct 18 2026): the car box takes any year, make and model, the six are quick
  // picks; every view reads the same car; only the 2015 GT3 has listing detail; nothing invented for any other car.
  const { pageHtml, DUMMY, carOf } = await import("../api/partnerDemo.js");
  const jsCar = h => { const m = /var CAR = ("(?:[^"\\]|\\.)*"), D = (null|\{[^\n]*?\}), CARS = /.exec(h); return m ? { car: JSON.parse(m[1]), listing: m[2] !== "null" } : null; };
  const main0 = h => h.replace(/<script>[\s\S]*?<\/script>/g, "");
  const escH = t => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const ANY = ["1972 Datsun 240Z", "2001 BMW M3", "1988 Ferrari Testarossa"];
  [...DEMO_CARS.map((c, i) => [c, String(i)]), ...DEMO_CARS.map(c => [c, c]), ...ANY.map(c => [c, c])].forEach(([car, param]) => {
    const seen = ["a", "b", "c", "d"].map(v => { const h = pageHtml(v, param), j = jsCar(h);
      const main = h.split("<main>")[1].split("</main>")[0];
      ok(j && j.car === car, `${car} (car=${param}), view ${v}: the page reads this car`);
      ok(h.includes('<input id="car-in" name="car" value="' + escH(car) + '"') && !/class="qp|class="picks/.test(h) && !/<a [^>]*>(2015 Porsche 911 GT3|2005 Porsche 911|1965 Ford Mustang|1957 Porsche 356 Speedster|1966 Ferrari 275 GTB|2023 Porsche 911 GT3)<\/a>/.test(main0(h)), `${car}, view ${v}: the car box holds this car; no example car chips at any width`);
      ok((h.match(/<a href="\?view=[abc][^"]*"/g) || []).every(t => car === DEMO_CARS[0] ? !t.includes("car=") : t.includes("&amp;car=" + encodeURIComponent(car))), `${car}, view ${v}: every tab keeps the car`);
      if (car === DUMMY.q) ok(j.listing && (v === "b" || (/US \$139,900/.test(main) && /<dd>30,400<\/dd>/.test(main) && /<dd>2014<\/dd>/.test(main) && (main.match(/WP0AC2A9XES183617/g) || []).length === 1)) && !/hero-img|img=hero|Black|clean title|Time left|Condition/.test(main) && /id="own-gal"|id="b-photo"/.test(main), `${car}, view ${v}: the 2014 GT3's own listing detail (30,400 miles, $139,900), its own photos only, nothing invented`);
      else ok(!j.listing && !/\$\d/.test(main) && !/hero-img|thumb-img/.test(main) && !/<dt>VIN<\/dt>|\bmiles\b|Buy It Now/.test(main) && (v === "a" || v === "b" || (/Sample listing/.test(main) && !/WP0AC2A9XES183617/.test(main))), `${car}, view ${v}: no invented listing, price, mileage or photo in the page itself (the sample frame says "Sample listing"; its sample price is drawn from the engine range by the client, scripts/demoFrameCheck.mjs); it says what it is`);
      return JSON.stringify(j); });
    ok(seen.every(x => x === seen[0]), `${car}: the same car identically in every view`);
  });
  ok(carOf("9") === DEMO_CARS[0] && carOf("") === DEMO_CARS[0] && carOf("<script>") === DEMO_CARS[0] && carOf("x".repeat(80)) === DEMO_CARS[0] && carOf("1965 ford mustang") === "1965 Ford Mustang", "an unknown or unsafe car= opens the 2015 GT3; a quick pick in any case is that car");
  ok(!/Sam is reading the sales\.</.test(pageHtml("c", "1")) && /Sam is reading the sales for this one\./.test(pageHtml("c", "1")), "the loading line reads \"Sam is reading the sales for this one.\""); }
// THE TYPED PATH (Sam, Oct 18 2026: a car typed into the first screen's own box did not reach the second screen). In a
// local browser with every request answered here (no network, fake answers): type a car into view a's box, submit, then
// open view b by its tab, at 1440 and 390; the address, the tab, the car bar and view b's read all carry the typed car.
{ let puppeteer = null; try { ({ default: puppeteer } = await import("puppeteer-core")); } catch {}
  const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (!puppeteer || !fs.existsSync(CHROME)) { skip++; console.log("SKIP typed path: no local Chrome"); }
  else {
    const { pageHtml } = await import("../api/partnerDemo.js");
    const br = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
    for (const typed of ["1965 Ford Mustang", "1987 Buick Grand National", "porshe 911", "Citroën DS 21"]) for (const w of [1440, 390]) {
      const pg = await br.newPage(); await pg.setViewport({ width: w, height: 900, isMobile: w < 600 }); await pg.setRequestInterception(true);
      const asked = [];
      pg.on("request", r => { const u = new URL(r.url());
        if (u.pathname === "/preview") return r.respond({ status: 200, contentType: "text/html; charset=utf-8", body: pageHtml(u.searchParams.get("view") || "a", u.searchParams.get("car")) });
        // The default car's first reads answer late (1.2 s), after the typed car's (0.1 s), as on a busy day.
      if (u.pathname === "/api/partnerAnswer" && r.method() === "POST") { const q = JSON.parse(r.postData() || "{}").q; asked.push(q); const body = JSON.stringify({ ok: true, query: q, answerType: "zero_result", range: null, count: 0, sales: [], history: [], thin: "SHOWN " + q }); setTimeout(() => r.respond({ status: 200, contentType: "application/json", body }).catch(() => {}), q === "2015 Porsche 911 GT3" ? 1200 : 100); return; }
        return r.respond({ status: 204, body: "" }); });
      await pg.goto("https://goasksam.com/preview?view=a", { waitUntil: "domcontentloaded" }); await new Promise(r => setTimeout(r, 300));
      await pg.$eval("#a-q", el => { el.value = ""; }); await pg.type("#a-q", typed); await pg.click('#a-form button[type="submit"]'); await new Promise(r => setTimeout(r, 300));
      await new Promise(r => setTimeout(r, 1500));
      const a = await pg.evaluate(() => ({ car: new URL(location.href).searchParams.get("car"), tab: new URLSearchParams(document.querySelector('.tabs a[href*="view=b"]').getAttribute("href").slice(1)).get("car"), bar: document.getElementById("car-in").value, shown: (document.getElementById("a-out").innerText.match(/SHOWN [^\n]*/) || [""])[0] }));
      ok(a.car === typed && a.tab === typed && a.bar === typed, `typed "${typed}" ${w}: after submit the address, the tab and the car bar carry it (${JSON.stringify(a)})`);
      ok(a.shown === "SHOWN " + typed, `typed "${typed}" ${w}: the first screen keeps the typed car's answer when the default car's first read lands later (${a.shown})`);
      asked.length = 0;
      await Promise.all([pg.waitForNavigation({ waitUntil: "domcontentloaded" }), pg.click('.tabs a[href*="view=b"]')]); await new Promise(r => setTimeout(r, 300));
      const b = await pg.evaluate(() => ({ sub: document.querySelector("#view-b .sub").textContent, bar: document.getElementById("car-in").value }));
      ok(b.sub === typed && b.bar === typed && asked.length >= 1 && asked.every(q => q === typed), `typed "${typed}" ${w}: the second screen opens on it and reads it (${JSON.stringify({ ...b, asked })})`);
      await pg.close();
    }
    await br.close();
  }
}
// NO "DEMO" A VIEWER CAN SEE (Sam, Oct 18 2026, for the eBay showing): not in the page's text, title, meta or script strings.
{ const { pageHtml } = await import("../api/partnerDemo.js"), { DEMO_CARS } = await import("../api/partnerAnswer.js");
  for (const car of [...DEMO_CARS, "1972 Datsun 240Z"]) for (const v of ["a", "b", "c"]) {
    const h = pageHtml(v, car), js = h.split("<script>")[1].split("</script>")[0].replace(/\/\/[^\n]*/g, "");
    const shown = h.replace(/<script>[\s\S]*?<\/script>/g, "").replace(/<style>[\s\S]*?<\/style>/g, "").replace(/\s(class|id|src|href|action)="[^"]*"/g, "");
    const strs = (js.match(/"[^"\n]*"|'[^'\n]*'/g) || []).filter(x => /demo/i.test(x));
    ok(!/demo/i.test(shown) && !strs.length, `${car}, view ${v}: no "demo" a viewer can see (${(shown.match(/[^<>]{0,20}demo[^<>]{0,20}/i) || [""])[0]}${strs.join(" ")})`);
  }
  ok(/<title>What these sell for<\/title>/.test(pageHtml("a")) && />What these sell for, powered by GoAskSam\.</.test(pageHtml("a")), "the title and the top line read \"What these sell for\""); }
// THE CAR'S PHOTO (Sam, Oct 18 2026): from the engine's own included sales only (never a set-aside row), the same
// year first and newest first, then any included sale; none when no included sale has a photo.
{ const { carPhotoOf, partnerShape: ps } = await import("../api/partnerAnswer.js");
  const U = n => "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5" + n;
  const d = { status: "one_box", tier: "result", cluster: [38000, 51000], poolN: 3, resolvedCar: { year: 2005, make: "Porsche", model: "911" },
    cards: [{ price: 40000, date: "2026-09-01", title: "2006 Porsche 911 Carrera", id: U(1) }, { price: 45000, date: "2026-05-01", title: "2005 Porsche 911 Carrera", id: U(2) }, { price: 47000, date: "2026-08-01", title: "2005 Porsche 911 Carrera S", id: U(3) }],
    setAsideRows: [{ price: 190000, date: "2026-10-01", title: "2005 Porsche 911 GT3", id: U(9), reason: "odd sale", setAside: true }] };
  const cp = carPhotoOf(d, 2005);
  ok(cp && cp.photo === U(3) && cp.sameYear === true, "the photo is the newest included sale of the same year (" + JSON.stringify(cp) + ")");
  ok(carPhotoOf(d, 2004).photo === U(1) && carPhotoOf(d, 2004).sameYear === false, "no same-year sale: the newest included sale of the engine's pool");
  ok(![2005, 2004, null].some(y => (carPhotoOf(d, y) || {}).photo === U(9)), "never a set-aside row's photo (a GT3 set aside from a base 911)");
  ok(carPhotoOf({ ...d, cards: d.cards.map(c => ({ ...c, id: null })) }, 2005) === null && carPhotoOf(null, 2005) === null, "no photo on any included sale: no photo");
  const out = ps(d, "2005 Porsche 911", 0, {});
  ok(out.carPhoto && out.carPhoto.photo === U(3) && venueLeak(out).length === 0, "the endpoint answer carries the photo id only, with no venue or link");
  const pageSrc = fs.readFileSync(new URL("../api/partnerDemo.js", import.meta.url), "utf8");
  ok(/var p = a && a\.ok !== false && a\.carPhoto && a\.carPhoto\.photo;/.test(pageSrc) && /'<div class="car-photo"><img class="hero-img" data-ph src="\/api\/partnerAnswer\?photo=' \+ encodeURIComponent\(p\)/.test(pageSrc), "the page draws only the endpoint's photo, by id, and a failed photo leaves nothing"); }
// STAGE 3 CAPTION AND STAGE 4, THIS EXACT CAR SOLD BEFORE (Sam, Oct 18 2026): the car photo carries its caption; an
// exact car's earlier sales (the endpoint's VIN history) sit at the top, newest first, each with its own photo by
// "<VIN>-<n>", the month and year, price and mileage at that sale; venue-blind (no venue, no link, no address).
{ const { historyOf, partnerShape: ps } = await import("../api/partnerAnswer.js");
  const apps = [{ kind: "sale", date: "2024-03-09", priceUsd: 110000, mileage: 26000, image: "https://img.example.com/a.jpg", house: "Some House", url: "https://example.com/lot/1" },
    { kind: "sale", date: "2025-07-20", priceUsd: 124000, mileage: 29000, image: "https://img.example.com/b.jpg", house: "Some House", url: "https://example.com/lot/2" },
    { kind: "attempt", date: "2023-01-05", bidUsd: 98000, mileage: 24000, image: null }];
  const h = historyOf(apps, "wp0ac2a9xes183617");
  ok(h.map(r => r.date).join() === "2025-07-20,2024-03-09,2023-01-05" && h[0].photo === "WP0AC2A9XES183617-1" && h[1].photo === "WP0AC2A9XES183617-0" && h[2].photo === null, "each earlier sale names its own photo by VIN and place, newest first (" + JSON.stringify(h.map(r => r.photo)) + ")");
  ok(!JSON.stringify(h).match(/example\.com|Some House|https?:/), "the history carries no venue, link or address");
  const out = ps({ status: "one_box", tier: "result", cluster: [111000, 133000], poolN: 10, cards: [] }, "2014 Porsche 911 GT3", 0, { history: h });
  ok(venueLeak(out).length === 0, "the answer with this car's history passes the venue guard");
  const pageSrc = fs.readFileSync(new URL("../api/partnerDemo.js", import.meta.url), "utf8");
  ok(/'<div class="panel prior"><h3>This car last sold for ' \+ usd\(last\.price\)/.test(pageSrc) && /" miles at that sale"/.test(pageSrc) && /\$\("a-out"\)\.innerHTML = \(a\.question \? "" : priorPanel\(a, !!a\.vin\)\) \+ \(a\.question \? "" : mainPhotoHtml\(a\)\)/.test(pageSrc) && /'<p class="prior-none">No earlier sale of this car on record\.<\/p>'/.test(pageSrc) && !/your car/i.test(pageSrc.replace(/Type your car or paste a VIN/g, "")), "the prior sales sit at the top: \"This car last sold for\", newest first, mileage at that sale; never \"your car\" (Sam's own box wording \"Type your car or paste a VIN\" aside)");
  const block = pageSrc.slice(pageSrc.indexOf("function priorPanel("), pageSrc.indexOf("function historyPanel("));
  ok(!/href|<a |house|venue|url/i.test(block), "the prior-sale panel has no link and no venue");
  ok(/<p class="photo-note">Photo from a recent sale of a car like this one\.<\/p>/.test(pageSrc), "the car photo carries its caption");
  const apiSrc = fs.readFileSync(new URL("../api/partnerAnswer.js", import.meta.url), "utf8");
  const pb = apiSrc.slice(apiSrc.indexOf("req.query.photo != null"), apiSrc.indexOf("return res.status(200).send(img.body);"));
  ok(/const vk = vinPhotoKey\(req\.query\.photo\)/.test(pb) && /safeImageUrl\(a\.image\)/.test(pb) && /checkCeiling\(env, req, "partner_photo"/.test(pb) && !/setHeader\("(Location|Link|Content-Disposition)"/.test(pb), "an earlier sale's photo is looked up again server side, safe-fetched, under the photo ceiling, with no address out"); }
// THE LISTING VIEW'S ORDER (Sam, Oct 18 2026): the car's own listing details, then "this car sold before" directly
// beneath, then the range card, then the sales list. In a local browser (fake answers, no network): the panel comes
// before the card in the page, is in view without scrolling at 1440, and follows the listing details within one
// screen at 390; with no earlier sale it is one plain line.
{ let puppeteer = null; try { ({ default: puppeteer } = await import("puppeteer-core")); } catch {}
  const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (!puppeteer || !fs.existsSync(CHROME)) { skip++; console.log("SKIP listing order: no local Chrome"); }
  else {
    const { pageHtml } = await import("../api/partnerDemo.js");
    const card = '<div class="sfc-card"><p class="sfc-range">$111,000 to $133,000</p><div class="gas-pill-slot"></div><p class="sfc-basis">Based on 10 sales.</p></div>';
    const sales = Array.from({ length: 10 }, (_, i) => ({ photo: null, name: "2014 Porsche 911 GT3", price: 111000 + i * 2000, date: "2026-0" + (1 + (i % 9)) + "-10", miles: 20000 + i * 1000 }));
    const hist = [{ result: "sold", date: "2025-07-20", price: 124000, miles: 29000, photo: null }, { result: "sold", date: "2024-03-09", price: 110000, miles: 26000, photo: null }];
    const br = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
    for (const [w, hgt] of [[1440, 900], [390, 844]]) for (const withHist of [true, false]) {
      const pg = await br.newPage(); await pg.setViewport({ width: w, height: hgt, isMobile: w < 600 }); await pg.setRequestInterception(true);
      pg.on("request", r => { const u = new URL(r.url());
        if (u.pathname === "/preview" && !u.searchParams.get("img")) return r.respond({ status: 200, contentType: "text/html; charset=utf-8", body: pageHtml("c") });
        if (u.pathname === "/api/partnerAnswer" && r.method() === "POST") return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, query: "q", answerType: "range", range: { low: 111000, high: 133000 }, count: 10, sales, card, history: withHist ? hist : [] }) });
        return r.respond({ status: 204, body: "" }); });
      await pg.goto("https://goasksam.com/preview?view=c", { waitUntil: "domcontentloaded" }); await new Promise(r => setTimeout(r, 600));
      const m = await pg.evaluate(() => { const pn = document.querySelector("#view-c .prior, #view-c .prior-none"), cd = document.querySelector("#view-c .sfc-card"), buy = document.querySelector("#view-c .buy"), h1 = document.querySelector("#view-c .rail h1");
        const r = el => el ? el.getBoundingClientRect() : null;
        return { panel: !!pn, kind: pn ? pn.className : "", before: !!(pn && cd && (pn.compareDocumentPosition(cd) & 4)), top: pn ? Math.round(r(pn).top) : null, h: pn ? Math.round(r(pn).height) : null, buyBottom: Math.round(r(buy).bottom), h1Top: Math.round(r(h1).top), rows: pn ? pn.querySelectorAll(".srow").length : 0 }; });
      const where = w === 1440 ? m.top != null && m.top < hgt : m.top != null && m.top - m.buyBottom < 60 && m.top - m.h1Top < hgt;
      ok(m.panel && m.before && where && (withHist ? m.kind === "panel prior" && m.rows === 2 : m.kind === "prior-none" && m.h < 40), `listing view ${w}, ${withHist ? "two earlier sales" : "no earlier sale"}: the panel sits under the listing details and before the range card, ${w === 1440 ? "in view without scrolling" : "within one screen of the details"} (${JSON.stringify(m)})`);
      await pg.close();
    }
    await br.close();
  }
}
// c9 (Sam, Oct 18 2026): the real 2014 GT3 is the listing car. Its listed mileage is never below its last recorded
// sale; its photos are its own sales' photos (by VIN), newest the main one; no other car's photo.
{ const { DUMMY } = await import("../api/partnerDemo.js");
  ok(DUMMY.q === "2014 Porsche 911 GT3" && DUMMY.vin === "WP0AC2A9XES183617" && DUMMY.miles === 30400 && DUMMY.price === 139900 && DUMMY.miles >= 29000, "the listing car is the 2014 GT3 at 30,400 miles (not below its last sale at 29,000) and $139,900");
  const pageSrc = fs.readFileSync(new URL("../api/partnerDemo.js", import.meta.url), "utf8");
  ok(/var ownSold = function\(a\)\{ return \(\(a && a\.history\) \|\| \[\]\)\.filter\(function\(r\)\{ return r\.result === "sold" && r\.photo; \}\); \};/.test(pageSrc) && /'<div class="own-main">' \+ mainPhotoHtml\(a\)/.test(pageSrc) && !/_partnerHero|HERO_JPEG_B64|img === "hero"/.test(pageSrc), "the listing car's photos are its own sales' photos, the newest first; the old studio photo is gone");
  ok(/rangePanel\(a, D \? \{ price: D\.price, slot: "c", lines: "c" \}/.test(pageSrc) && (pageSrc.match(/function placing\(/g) || []).length === 1, "the asking price's pill is the one placing() against the engine's range");
  ok(/run\("b", D \? \{ q: CAR, vin: D\.vin \} : \{ q: CAR \}, gotB\);/.test(pageSrc), "the reserve view reads the listing car with its VIN, so its own sale photo shows there too"); }
// A CAR GIVEN BY VIN (Sam, Oct 18 2026): the engine's name as the heading with the VIN small beneath (the VIN alone
// when it cannot name the car); the main photo is this car's own newest sale photo captioned with its month and year,
// else a car like it captioned as such; the sales-list rows that are this car's own sales carry "This car".
{ const { carNameOf } = await import("../api/partnerAnswer.js");
  ok(carNameOf({ year: 2014, make: "Porsche", model: "911", trim: "GT3" }) === "2014 Porsche 911 GT3" && carNameOf({ year: 2015, make: "Porsche", model: "911 GT3", trim: "GT3" }) === "2015 Porsche 911 GT3" && carNameOf(null) === null && carNameOf({ year: 2014, make: "Porsche" }) === null, "the car's name comes from the engine's identity of the VIN, none when it cannot name it");
  let puppeteer = null; try { ({ default: puppeteer } = await import("puppeteer-core")); } catch {}
  const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (!puppeteer || !fs.existsSync(CHROME)) { skip++; console.log("SKIP VIN heading: no local Chrome"); }
  else {
    const { pageHtml } = await import("../api/partnerDemo.js");
    const V = "WP0AB2A99ES100001";   // a VIN that is not the listing car's, so views a and c both draw the plain car
    const sales = [{ photo: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c51", name: "2014 Porsche 911 GT3", price: 124000, date: "2025-07-20", miles: 29000 }, { photo: null, name: "2014 Porsche 911 GT3", price: 130000, date: "2026-02-01", miles: 9000 }];
    const hist = [{ result: "sold", date: "2025-07-20", price: 124000, miles: 29000, photo: V + "-1" }, { result: "sold", date: "2024-03-09", price: 110000, miles: 26000, photo: V + "-0" }];
    const cases = [["the VIN", { vin: V, carName: "2014 Porsche 911 GT3", history: hist, sales, carPhoto: { photo: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c59" } }, V],
      ["a VIN the engine cannot name", { vin: V, carName: null, history: [], sales, carPhoto: { photo: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c59" } }, V],
      ["a car with no earlier sale", { carName: null, history: [], sales, carPhoto: { photo: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c59" } }, "1965 Ford Mustang"]];
    const br = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
    for (const [label, ans, car] of cases) for (const w of [1440, 390]) for (const v of ["a", "c"]) {
      const pg = await br.newPage(); await pg.setViewport({ width: w, height: 900, isMobile: w < 600 }); await pg.setRequestInterception(true);
      pg.on("request", r => { const u = new URL(r.url());
        if (u.pathname === "/preview" && !u.searchParams.get("img")) return r.respond({ status: 200, contentType: "text/html; charset=utf-8", body: pageHtml(v, car) });
        if (u.pathname === "/api/partnerAnswer" && r.method() === "POST") return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, query: "q", answerType: "range", range: { low: 111000, high: 133000 }, count: 10, ...ans }) });
        if (u.searchParams.get("photo")) return r.respond({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64") });
        return r.respond({ status: 204, body: "" }); });
      await pg.goto("https://goasksam.com/preview?view=" + v, { waitUntil: "domcontentloaded" }); await new Promise(r => setTimeout(r, 700));
      const m = await pg.evaluate(v => { const root = document.querySelector("#view-" + v); const nm = v === "a" ? document.getElementById("a-head") : root.querySelector(".car-name"), vl = v === "a" ? (document.getElementById("a-vin").hidden ? null : document.getElementById("a-vin")) : root.querySelector(".vin-line"), notes = [...root.querySelectorAll(".photo-note")].map(e => e.textContent);
        return { name: nm ? nm.textContent : null, vinLine: vl ? vl.textContent : null, notes, tags: root.querySelectorAll(".tag-this").length }; }, v);
      const want = label === "the VIN" ? { name: "2014 Porsche 911 GT3", vinLine: "VIN " + V, note: "Photo from this car's sale in July 2025.", tags: 1 }
        : label === "a VIN the engine cannot name" ? { name: V, vinLine: null, note: "Photo from a recent sale of a car like this one.", tags: 0 }
        : { name: v === "a" ? "q" : null, vinLine: null, note: "Photo from a recent sale of a car like this one.", tags: 0 };
      ok(m.name === want.name && m.vinLine === want.vinLine && m.notes.length === 1 && m.notes[0] === want.note && m.tags === want.tags, `${label}, view ${v} ${w}: heading, VIN line, photo caption and "This car" tag (${JSON.stringify(m)})`);
      await pg.close();
    }
    await br.close();
  }
}
// VIEW A, THE PRE-LISTING PAGE (Sam, Oct 18 2026): with no car chosen it opens empty (the heading "What have cars like
// yours sold for?", one box "Type your car or paste a VIN", no range, photo, list or chips) and reads nothing; a typed
// car (one of the warmed six, or a cold one) is read and named in the heading, at 1440 and 390. No banned word in any view.
{ const { pageHtml } = await import("../api/partnerDemo.js"), { DEMO_CARS } = await import("../api/partnerAnswer.js");
  const BANNED_V = /\b(value|values|valuation|worth|estimate|estimates|demo)\b/i;
  for (const car of [undefined, ...DEMO_CARS, "1987 Buick Grand National"]) for (const v of ["a", "b", "c"]) {
    const h = pageHtml(v, car), shown = h.replace(/<script>[\s\S]*?<\/script>/g, "").replace(/<style>[\s\S]*?<\/style>/g, "").replace(/\s(class|id|src|href|action)="[^"]*"/g, ""), js = (h.split("<script>")[1] || "").split("</script>")[0].replace(/\/\/[^\n]*/g, "");
    const strs = (js.match(/"[^"\n]*"|'[^'\n]*'/g) || []).filter(x => BANNED_V.test(x));
    ok(!BANNED_V.test(shown.replace(/<[^>]+>/g, " ")) && !strs.length, `${car || "no car"}, view ${v}: no "value", "worth", "estimate" or "demo" a viewer can see (${(shown.replace(/<[^>]+>/g, " ").match(/[^.]{0,20}\b(value|values|valuation|worth|estimate|estimates|demo)\b[^.]{0,20}/i) || [""])[0]}${strs.join(" ")})`);
  }
  const e = pageHtml("a");
  ok(/<h1 id="a-head">What have cars like yours sold for\?<\/h1>/.test(e) && /<input id="a-q" name="q" autocomplete="off" placeholder="Type your car or paste a VIN"/.test(e) && /<input id="car-in" name="car" value="" [^>]*placeholder="Type your car or paste a VIN"/.test(e) && /CHOSEN = false/.test(e), "view a with no car: the heading, one empty box with its placeholder, an empty car bar");
  let puppeteer = null; try { ({ default: puppeteer } = await import("puppeteer-core")); } catch {}
  const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (!puppeteer || !fs.existsSync(CHROME)) { skip++; console.log("SKIP view a empty: no local Chrome"); }
  else {
    const br = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
    for (const w of [1440, 390]) for (const typed of [null, "1965 Ford Mustang", "1987 Buick Grand National"]) {
      const pg = await br.newPage(); await pg.setViewport({ width: w, height: 900, isMobile: w < 600 }); await pg.setRequestInterception(true);
      const asked = [];
      pg.on("request", r => { const u = new URL(r.url());
        if (u.pathname === "/preview") return r.respond({ status: 200, contentType: "text/html; charset=utf-8", body: pageHtml(u.searchParams.get("view") || "a", u.searchParams.get("car")) });
        if (u.pathname === "/api/partnerAnswer" && r.method() === "POST") { const q = JSON.parse(r.postData() || "{}").q; asked.push(q); return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, query: q, answerType: "zero_result", range: null, count: 0, sales: [], history: [], identity: { year: Number(q.slice(0, 4)), make: q.split(" ")[1], model: q.split(" ").slice(2).join(" ") } }) }); }
        return r.respond({ status: 204, body: "" }); });
      await pg.goto("https://goasksam.com/preview?view=a", { waitUntil: "domcontentloaded" }); await new Promise(r => setTimeout(r, 600));
      const before = await pg.evaluate(() => ({ head: document.getElementById("a-head").textContent, out: document.getElementById("a-out").innerHTML.trim(), box: document.getElementById("a-q").value, bar: document.getElementById("car-in").value }));
      if (!typed) { ok(before.head === "What have cars like yours sold for?" && before.out === "" && before.box === "" && before.bar === "" && asked.length === 0, `view a ${w}, nothing chosen: empty, and no read at all (${JSON.stringify({ ...before, asked })})`); await pg.close(); continue; }
      await pg.type("#a-q", typed); await pg.click('#a-form button[type="submit"]'); await new Promise(r => setTimeout(r, 500));
      const after = await pg.evaluate(() => ({ head: document.getElementById("a-head").textContent, car: new URL(location.href).searchParams.get("car"), bar: document.getElementById("car-in").value }));
      ok(asked.length === 1 && asked[0] === typed && after.head === typed && after.car === typed && after.bar === typed, `view a ${w}, typed "${typed}": one read, the heading names the car, the address and the car bar carry it (${JSON.stringify({ ...after, asked })})`);
      await pg.close();
    }
    for (const v of ["b", "c"]) { const pg = await br.newPage(); await pg.setRequestInterception(true); const asked = [];
      pg.on("request", r => { const u = new URL(r.url()); if (u.pathname === "/preview") return r.respond({ status: 200, contentType: "text/html; charset=utf-8", body: pageHtml(v) }); if (u.pathname === "/api/partnerAnswer" && r.method() === "POST") { asked.push(JSON.parse(r.postData() || "{}").q); return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, query: "q", answerType: "zero_result", sales: [], history: [] }) }); } return r.respond({ status: 204, body: "" }); });
      await pg.goto("https://goasksam.com/preview?view=" + v, { waitUntil: "domcontentloaded" }); await new Promise(r => setTimeout(r, 500));
      ok(asked.length >= 1 && asked.every(q => q === "2014 Porsche 911 GT3"), `view ${v} with nothing chosen starts on the 2014 GT3 (${JSON.stringify(asked)})`); await pg.close(); }
    await br.close();
  }
}
// NO REPEATED DETAIL ON THE LISTING; THE PANEL ON VIEW B (Sam, Oct 18 2026): the listing view shows the VIN once (small,
// under the title) and the mileage only in the title line and About this car (no separate Mileage block under the
// price); view b shows "This car last sold for" under its heading line and above the reserve box for the 2014 GT3,
// and nothing for a car with no earlier sale; at 1440 and 390.
{ const { pageHtml } = await import("../api/partnerDemo.js");
  let puppeteer = null; try { ({ default: puppeteer } = await import("puppeteer-core")); } catch {}
  const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (!puppeteer || !fs.existsSync(CHROME)) { skip++; console.log("SKIP view fixes: no local Chrome"); }
  else {
    const hist = [{ result: "sold", date: "2025-07-20", price: 124000, miles: 29000, photo: null }, { result: "sold", date: "2024-03-09", price: 110000, miles: 26000, photo: null }];
    const br = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
    for (const w of [1440, 390]) for (const [v, car, withHist] of [["c", undefined, true], ["b", undefined, true], ["b", "1965 Ford Mustang", false]]) {
      const pg = await br.newPage(); await pg.setViewport({ width: w, height: 900, isMobile: w < 600 }); await pg.setRequestInterception(true);
      pg.on("request", r => { const u = new URL(r.url());
        if (u.pathname === "/preview") return r.respond({ status: 200, contentType: "text/html; charset=utf-8", body: pageHtml(v, car) });
        if (u.pathname === "/api/partnerAnswer" && r.method() === "POST") return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, query: "q", answerType: "range", range: { low: 111000, high: 133000 }, count: 10, sales: [], history: withHist ? hist : [], card: '<div class="sfc-card"><p class="sfc-range">$111,000 to $133,000</p><div class="gas-pill-slot"></div></div>' }) });
        return r.respond({ status: 204, body: "" }); });
      await pg.goto("https://goasksam.com/preview?view=" + v, { waitUntil: "domcontentloaded" }); await new Promise(r => setTimeout(r, 600));
      if (v === "c") {
        const m = await pg.evaluate(() => { const t = document.querySelector("#view-c").innerText; return { vin: (t.match(/WP0AC2A9XES183617/g) || []).length, miles: (t.match(/30,400/g) || []).length, specsUnderPrice: !!document.querySelector("#view-c .rail .specs") }; });
        ok(m.vin === 1 && m.miles === 2 && !m.specsUnderPrice, `listing view ${w}: the VIN once, the mileage only in the title line and About this car, no Mileage block under the price (${JSON.stringify(m)})`);
      } else {
        const m = await pg.evaluate(() => { const pn = document.querySelector("#view-b .prior"), sub = document.getElementById("b-name"), res = document.querySelector("#view-b .reserve"); return { panel: !!pn, head: pn ? (pn.querySelector("h3") || {}).textContent : "", afterHeading: !!(pn && sub && (sub.compareDocumentPosition(pn) & 4)), beforeReserve: !!(pn && res && (pn.compareDocumentPosition(res) & 4)), none: !!document.querySelector("#view-b .prior-none") }; });
        ok(withHist ? m.panel && m.head === "This car last sold for $124,000 in July 2025." && m.afterHeading && m.beforeReserve && !m.none : !m.panel && !m.none, `reserve view ${w}, ${withHist ? "the 2014 GT3" : "a car with no earlier sale"}: ${withHist ? "the panel under the heading line, above the reserve box" : "no panel and no line"} (${JSON.stringify(m)})`);
      }
      await pg.close();
    }
    await br.close();
  }
}
// The endpoint reads no market of its own: Market Check's handler is its only source of figures.
const src = fs.readFileSync(new URL("../api/partnerAnswer.js", import.meta.url), "utf8").replace(/\/\/[^\n]*/g, "");
ok(/import\("\.\/sellerDecision\.js"\)/.test(src) && /oneBox: true/.test(src), "the endpoint asks Market Check's own handler");
ok(!/sales_archive|runOneBox|oneEngineAnswer|supabaseSelect|fetchOnlinePool|familyMarket/.test(src), "the endpoint has no sales read or engine call of its own");
ok(!/oldcarsdata|OLDCARSDATA|_ocd/i.test(src), "the endpoint never touches OldCarsData");
ok(!/cardWithRows/.test(fs.readFileSync(new URL("../api/partnerDemo.js", import.meta.url), "utf8")), "the eBay demo page does not read cardWithRows (it renders exactly as before)");

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
  await pg.goto(HOST + "/preview", { waitUntil: "domcontentloaded" });
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
    if (!fields.card && lastCardDiff) console.log(`  ${q}: card difference ${lastCardDiff}`);
    for (const [k, v] of Object.entries(fields)) ok(v, `${q}: ${k} differs (endpoint ${JSON.stringify(k === "sales" ? (p.j.sales || []).length + " sales" : p.j[k])}, Market Check ${JSON.stringify(k === "sales" ? mc.sales.length + " sales" : mc[k])})`);
    console.log(`  ${q}: ${mc.range ? "$" + mc.range.low + " to $" + mc.range.high : "no range"}, ${mc.count} sales, ${mc.window || "no window"}: ${Object.values(fields).every(Boolean) ? "SAME" : "DIFFERENT"}`);
  }
  await br.close();
}
console.log(`partnerEngineMatch: ${pass} passed, ${fail} failed${skip ? ", live part skipped" : ""}`);
process.exit(fail ? 1 : 0);
