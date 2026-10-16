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
import { partnerShape, venueLeak, historyOf } from "../api/partnerAnswer.js";

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
const card = (price, date, extra) => ({ price, date, title: "1965 Ford Mustang Fastback", url: "https://bringatrailer.com/listing/x", platform: "Bring a Trailer", platformName: "Bring a Trailer", id: 12, vinNorm: "X", ...extra });
const FIX = {
  range: { status: "one_box", tier: "result", cluster: [41500, 58000], poolN: 14, windowLabel: "in the last twelve months", engineVersion: "fixture",
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
    ok(out.sales.every(s => Object.keys(s).sort().join() === "date,price"), `${name}: a sale is its price and date only`);
  }
  if (name === "thin") ok(out.range === null && /Too few to show a range/.test(out.thin || "") && !/\$/.test(out.thin), "thin: words only, never a range or a dollar figure");
  if (name === "range") {
    ok(out.trend && out.trend.length === 1 && out.trend[0].count >= 8, "range: only quarters with eight or more sales");
    ok(out.setAside && out.setAside.total === 2 && !("modified" in out.setAside.reasons), "range: set-aside reasons, zero counts dropped");
    ok(out.history[0].result === "not_sold" && out.history[0].highBid === 128000 && out.history[1].price === 151000, "history: sold with its price, not sold with its high bid, newest first");
  }
  if (name === "question") ok(out.question && out.question.options.length === 2 && out.question.options[0].send.q === "2015 Porsche 991 GT3" && out.range === null, "question: the engine's own options, what each sends, no range");
  if (name === "clarify") ok(out.answerType === "identity_question" && out.range === null, "clarification: a question, no range");
}
// The endpoint reads no market of its own: Market Check's handler is its only source of figures.
const src = fs.readFileSync(new URL("../api/partnerAnswer.js", import.meta.url), "utf8").replace(/\/\/[^\n]*/g, "");
ok(/import\("\.\/sellerDecision\.js"\)/.test(src) && /oneBox: true/.test(src), "the endpoint asks Market Check's own handler");
ok(!/sales_archive|runOneBox|oneEngineAnswer|supabaseSelect|fetchOnlinePool|familyMarket/.test(src), "the endpoint has no sales read or engine call of its own");
ok(!/oldcarsdata|OLDCARSDATA|_ocd/i.test(src), "the endpoint never touches OldCarsData");

// ---- part 2: live, the five cars
const COOKIE = process.env.GAS_CREW_COOKIE, HOST = process.env.PARTNER_HOST || "https://goasksam.com";
if (!COOKIE) { skip++; console.log("SKIP live: GAS_CREW_COOKIE not set, the five cars were not compared on the live site"); }
else {
  const post = async (path, body) => { const r = await fetch(HOST + path, { method: "POST", headers: { "Content-Type": "application/json", Cookie: "gas_crew=" + COOKIE }, body: JSON.stringify(body) }); return { status: r.status, j: await r.json().catch(() => null) }; };
  for (const q of CARS) {
    // The same question count on both: Market Check's page asks first (asked 0); a question answered either way is compared as a question.
    // One read at a time (Sam, Oct 16 2026): the endpoint first, then Market Check, never both at once.
    const p = await post("/api/partnerAnswer", { q });
    const m = await post("/api/sellerDecision", { oneBox: true, car: { raw: q }, asked: 0 });
    if (!p.j || !m.j) { ok(false, `${q}: no answer (partner ${p.status}, Market Check ${m.status})`); continue; }
    ok(venueLeak(p.j).length === 0, `${q}: no venue, link, title or id on the live answer (${venueLeak(p.j).slice(0, 3).join(", ")})`);
    if (m.j.status !== "one_box" || /_choice$/.test(String(m.j.tier || ""))) { ok(p.j.answerType === "identity_question", `${q}: Market Check asks (${m.j.tier || m.j.status}), the endpoint asks too (${p.j.answerType})`); console.log(`  ${q}: both ask`); continue; }
    const mc = mcReads(m.j);
    const fields = { range: same(p.j.range, mc.range), count: p.j.count === mc.count, window: p.j.window === mc.window, sales: same(asKeys(p.j.sales || []), mc.sales) };
    for (const [k, v] of Object.entries(fields)) ok(v, `${q}: ${k} differs (endpoint ${JSON.stringify(k === "sales" ? (p.j.sales || []).length + " sales" : p.j[k])}, Market Check ${JSON.stringify(k === "sales" ? mc.sales.length + " sales" : mc[k])})`);
    console.log(`  ${q}: ${mc.range ? "$" + mc.range.low + " to $" + mc.range.high : "no range"}, ${mc.count} sales, ${mc.window || "no window"}: ${Object.values(fields).every(Boolean) ? "SAME" : "DIFFERENT"}`);
  }
}
console.log(`partnerEngineMatch: ${pass} passed, ${fail} failed${skip ? ", live part skipped" : ""}`);
process.exit(fail ? 1 : 0);
