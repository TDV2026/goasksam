// NO CHART, ONE LAYOUT (Sam, Oct 29 2026): when the engine sends no chart, for ANY reason, the page draws no chart heading and no empty right column: the card and the narrow strip take the full width, the engine's one sentence is one line under the pills, and
// "Sales behind this answer" moves up. Cause (live 1986 Porsche 911): the page treated the engine's "mix changed" reason as a chart panel (the heading "How this market has moved" with the sentence, a tall empty right column) and its "too few" reason as a plain
// line, so two no-chart cases drew two layouts. Every reason the engine can send with no chart is rendered at 1440 and 390; an empty panel, a chart heading with no chart, or a right column with no chart fails.   node scripts/noChartLayoutCheck.mjs
import { startBrowser, openMC } from "./e98Render.mjs";
import { MC } from "./e98Fixtures.mjs";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const MIX = "The mix of cars changed from quarter to quarter, so a change here would not show the market moving.", FEW = "There are too few sales in each period to draw a chart.";
const P86 = MC["1986 Porsche 911 (Targa 11, Cabriolet 11, Coupe 16 against 35)"], M01 = MC["2001 BMW M3 (alike with options)"];
const strip = d => { const { trend, chart, trendHeld, chartCaption, chartWindowLine, ...rest } = d; return rest; };
const STATES = [
  ["mix changed (chart.note)", P86, { ...strip(P86.d), chart: { type: "withheld", scope: null, buckets: null, note: MIX, withheld: { reason: "mix_changes", line: null }, n: 35 } }, MIX],
  ["too few (chart.withheld.line)", P86, { ...strip(P86.d), chart: { type: "withheld", scope: null, buckets: null, note: null, withheld: { reason: "too_few", line: FEW }, n: 35 } }, FEW],
  ["mix changed on the 17 sale pool", M01, { ...strip(M01.d), chart: { type: "withheld", scope: null, buckets: null, note: MIX, withheld: { reason: "mix_changes", line: null }, n: 17 } }, MIX],
  ["withheld with no sentence at all", P86, { ...strip(P86.d), chart: { type: "withheld", scope: null, buckets: null, note: null, withheld: { reason: "mix_changes", line: null }, n: 35 } }, null],
  ["no chart object (an answer stored before ER9)", P86, strip(P86.d), undefined],
  ["a stored answer that held the chart for the mix (trendHeld only)", P86, { ...strip(P86.d), trendHeld: { reason: "mix_changes" } }, undefined],
  ["candles type with two periods (under three candles)", M01, { ...M01.d, trend: null, chart: { type: "candles", scope: null, size: "quarter", buckets: M01.d.chart.buckets.slice(0, 2), note: null, withheld: null, n: 17 } }, undefined],
];
const b = await startBrowser(), seen = [];
for (const [name, fx, d, sentence] of STATES) for (const w of [1440, 390]) {
  const p = await openMC(b, { ...fx, d }, w), r = await p.evaluate(() => { const q = s => document.querySelector(s), box = s => { const e = q(s); return e ? e.getBoundingClientRect() : null; }, panels = [...document.querySelectorAll(".hero-chart")];
    const sent = [...document.querySelectorAll(".hero-left .hero-noband")].map(e => e.innerText.replace(/\s+/g, " ").trim()), card = box(".sfc-card"), rows = box(".salesrow"), st = box(".narrow-strip"), band = q(".hero-left .hero-noband") ? q(".hero-left .hero-noband").getBoundingClientRect() : null;
    return { panels: panels.length, empty: panels.filter(e => !e.querySelector("svg")).length, headings: [...document.querySelectorAll("h2")].filter(e => /How this market has moved/.test(e.innerText)).length, right: document.querySelectorAll(".hero-right").length, cols: (q(".hero2col") || { children: [] }).children.length, cardW: card && Math.round(card.width), contentW: rows && Math.round(rows.width), sent, pillsBottom: st && Math.round(st.bottom), sentTop: band && Math.round(band.top), sentBottom: band && Math.round(band.bottom), salesTop: rows && Math.round(rows.top) }; });
  const where = `${name} at ${w}`;
  ok(r.panels === 0 && r.empty === 0, `${where}: no chart panel, empty or not (${r.panels} panels, ${r.empty} empty)`);
  ok(r.headings === 0, `${where}: no "How this market has moved" heading without a chart (${r.headings})`);
  ok(r.right === 0 && r.cols === 1, `${where}: no right column: the answer is one full-width column (${r.right} right columns, ${r.cols} columns)`);
  ok(r.cardW >= r.contentW * 0.95, `${where}: the card takes the full width (${r.cardW}px of ${r.contentW}px)`);
  if (sentence) ok(r.sent.some(x => x === sentence), `${where}: the engine's sentence is one line in the answer column ("${r.sent[0] || "none"}")`);
  if (sentence === null) ok(r.sent.length === 0 || !/too few/i.test(r.sent.join(" ")), `${where}: with no engine sentence the page writes none of its own that says too few (${r.sent.join(" | ") || "none"})`);
  if (sentence) ok(r.sentTop >= r.pillsBottom - 1, `${where}: the sentence sits under the pills (${r.sentTop} against ${r.pillsBottom})`);
  if (sentence && w === 1440) ok(r.salesTop - r.sentBottom < 200, `${where}: Sales behind this answer moves up under it (${r.salesTop - r.sentBottom}px below the sentence)`);
  await p.close(); }
await b.close();
console.log(`noChartLayoutCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
