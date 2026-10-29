// NO CHART (Sam, Oct 29 2026). TWO layouts, by what the engine sent. (A) THE WITHHELD LAYOUT, when the engine sends its own sentence (chart.note, else chart.withheld.line): no chart, no heading, no empty column; the right column (below the pills on a phone) holds that ONE
// caption, then the engine's own latest sales (d.cards, as sent, up to six) in the See the sales row shape, then a link to the full list; no count, no average, range or trend word, no dots. No rows from the engine: the caption alone. (B) when the engine sends NO sentence: the earlier one-column layout below.
// Earlier text: when the engine sends no chart, for ANY reason, the page draws no chart heading and no empty right column: the card and the narrow strip take the full width, the engine's one sentence is one line under the pills, and
// "Sales behind this answer" moves up. Cause (live 1986 Porsche 911): the page treated the engine's "mix changed" reason as a chart panel (the heading "How this market has moved" with the sentence, a tall empty right column) and its "too few" reason as a plain
// line, so two no-chart cases drew two layouts. Every reason the engine can send with no chart is rendered at 1440 and 390; an empty panel, a chart heading with no chart, or a right column with no chart fails.   node scripts/noChartLayoutCheck.mjs
import { startBrowser, openMC } from "./e98Render.mjs";
import { MC } from "./e98Fixtures.mjs";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const MIX = "The mix of cars changed from quarter to quarter, so a change here would not show the market moving.", FEW = "There are too few sales in each period to draw a chart.";
const P86 = MC["1986 Porsche 911 (Targa 11, Cabriolet 11, Coupe 16 against 35)"], M01 = MC["2001 BMW M3 (alike with options)"], DEF = MC["1985 Land Rover Defender 110 (year split)"];
const strip = d => { const { trend, chart, trendHeld, chartCaption, chartWindowLine, ...rest } = d; return rest; };
const STATES = [
  ["mix changed (chart.note)", P86, { ...strip(P86.d), chart: { type: "withheld", scope: null, buckets: null, note: MIX, withheld: { reason: "mix_changes", line: null }, n: 35 } }, MIX],
  ["too few (chart.withheld.line)", P86, { ...strip(P86.d), chart: { type: "withheld", scope: null, buckets: null, note: null, withheld: { reason: "too_few", line: FEW }, n: 35 } }, FEW],
  ["Defender 110, mix changed (chart.note)", DEF, { ...strip(DEF.d), chart: { type: "withheld", scope: null, buckets: null, note: MIX, withheld: { reason: "mix_changes", line: null }, n: (DEF.d.cards || []).length } }, MIX],
  ["Defender 110, too few (chart.withheld.line)", DEF, { ...strip(DEF.d), chart: { type: "withheld", scope: null, buckets: null, note: null, withheld: { reason: "too_few", line: FEW }, n: (DEF.d.cards || []).length } }, FEW],
  ["mix changed on the 17 sale pool", M01, { ...strip(M01.d), chart: { type: "withheld", scope: null, buckets: null, note: MIX, withheld: { reason: "mix_changes", line: null }, n: 17 } }, MIX],
  ["withheld with no sentence at all", P86, { ...strip(P86.d), chart: { type: "withheld", scope: null, buckets: null, note: null, withheld: { reason: "mix_changes", line: null }, n: 35 } }, null],
  ["no chart object (an answer stored before ER9)", P86, strip(P86.d), undefined],
  ["a stored answer that held the chart for the mix (trendHeld only)", P86, { ...strip(P86.d), trendHeld: { reason: "mix_changes" } }, undefined],
  ["candles type with two periods (under three candles)", M01, { ...M01.d, trend: null, chart: { type: "candles", scope: null, size: "quarter", buckets: M01.d.chart.buckets.slice(0, 2), note: null, withheld: null, n: 17 } }, undefined],
];
const b = await startBrowser(), seen = [];
// (A) the withheld layout
const rowsOf = fx => (fx.d.cards || []).filter(c => c && c.price > 0);
const HELD = STATES.filter(s => s[3]);
const noRows = (name, fx, d, s) => [name + ", the engine sent no rows", fx, { ...d, cards: [] }, s];
const reversed = (name, fx, d, s) => [name + ", rows sent oldest first (the page must not sort them)", fx, { ...d, cards: (fx.d.cards || []).slice().reverse() }, s];
for (const [name, fx, d, sentence, mode] of [...HELD.map(s => [...s, "rows"]), noRows(...HELD[0]).concat("none"), reversed(...HELD[0]).concat("rows")]) for (const w of [1440, 390]) {
  const p = await openMC(b, { ...fx, d }, w), where = `${name} at ${w}`, sent = (d.cards || []).slice(0, 6);
  const r = await p.evaluate(() => { const q = s => document.querySelector(s), lines = e => Math.round(e.getBoundingClientRect().height / (parseFloat(getComputedStyle(e).lineHeight) || 18)), held = q(".hero-held"), pills = q(".narrow-strip");
    const rows = [...document.querySelectorAll(".hero-held .hw-row")].map(r => { const t = r.querySelector(".hw-t"), n = r.querySelector(".hw-n"), m = r.querySelector(".hw-m"), pr = r.querySelector(".hw-p"), ph = r.querySelector(".hw-ph"); return { title: n.innerText.trim(), meta: m.innerText.trim(), price: pr.innerText.trim(), textW: Math.round(t.getBoundingClientRect().width), nl: lines(n), ml: lines(m), pw: Math.round(ph.getBoundingClientRect().width), ph: Math.round(ph.getBoundingClientRect().height) }; });
    const heads = [...document.querySelectorAll("h2,h3")].filter(e => /How this market has moved/.test(e.textContent));
    return { panels: document.querySelectorAll(".hero-chart").length, svgIn: held ? held.querySelectorAll("svg,canvas,circle").length : -1, heads: heads.length, held: !!held, caps: [...document.querySelectorAll(".hero-held .hw-cap")].map(e => e.innerText.replace(/\s+/g, " ").trim()), rows, all: held ? !!held.querySelector(".hw-all .linkbtn") : false, allText: held && held.querySelector(".hw-all") ? held.querySelector(".hw-all").innerText : "", text: held ? held.innerText : "", leftNoband: document.querySelectorAll(".hero-left .hero-noband").length,
      emptyBody: [...document.querySelectorAll(".hero-right h2,.hero-right h3")].filter(h => !h.nextElementSibling || !h.nextElementSibling.textContent.trim()).length, heldTop: held ? held.getBoundingClientRect().top : 0, pillsBottom: pills ? pills.getBoundingClientRect().bottom : 0, heldLeft: held ? held.getBoundingClientRect().left : 0, pillsLeft: pills ? pills.getBoundingClientRect().left : 0 }; });
  ok(r.held && r.panels === 0 && r.heads === 0, `${where}: the withheld layout, no chart panel and no "How this market has moved" heading (${r.panels} panels, ${r.heads} headings)`);
  ok(r.svgIn === 0 && !/average|median|typical|trend|\$[\d,]+ to \$[\d,]+/i.test(r.text), `${where}: no chart, no dots, no average, range or trend word in the withheld layout`);
  ok(r.emptyBody === 0, `${where}: no heading with an empty body`);
  ok(r.caps.length === 1 && r.caps[0] === sentence, `${where}: one caption, the engine's own sentence ("${r.caps[0] || "none"}")`);
  ok(r.leftNoband === 0, `${where}: the sentence is not printed a second time under the pills`);
  ok(w === 1440 ? r.heldLeft > r.pillsLeft + 200 : r.heldTop >= r.pillsBottom - 1, w === 1440 ? `${where}: on a wide screen the caption and rows sit in the right column` : `${where}: on a phone they sit below the pills (${Math.round(r.heldTop)} against ${Math.round(r.pillsBottom)})`);
  if (mode === "none") ok(r.rows.length === 0 && !r.all, `${where}: no rows from the engine, the caption alone (${r.rows.length} rows)`);
  else {
    ok(r.rows.length === Math.min(6, sent.length) && r.rows.length > 0, `${where}: up to six of the engine's rows (${r.rows.length} of ${sent.length} sent)`);
    ok(r.rows.every((x, i) => x.price === ("$" + Number(sent[i].price).toLocaleString("en-US")) && x.title.length > 0), `${where}: the rows are the engine's own, in the order sent, prices as sent`);
    ok(r.rows.every(x => /\d{4}|\b\w{3} \d/.test(x.meta)), `${where}: each row carries its sale date (${(r.rows[0] || {}).meta})`);
    ok(r.rows.every(x => x.textW >= (w === 1440 ? 200 : 120) && x.nl <= 2 && x.ml <= 2 && x.pw >= 64 && x.ph >= 48), `${where}: each row reads across, text column ${r.rows.map(x => x.textW).slice(0, 3).join(", ")}px, at most two lines, photo ${(r.rows[0] || {}).pw}x${(r.rows[0] || {}).ph}`);
    ok(r.all && !/\d|five|for all/i.test(r.allText), `${where}: a link to the full list with no count ("${r.allText.trim()}")`);
  }
  await p.close(); }
// (B) no sentence from the engine: the earlier one-column layout
for (const [name, fx, d, sentence] of STATES.filter(s => !s[3])) for (const w of [1440, 390]) {
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
// CLASS: only Market Check draws the withheld layout. No other page (Find, Tasks, hubs, history, partner pages, demos, emails) reads chart.note or chart.withheld, so none can print a chart sentence or a chart of its own.
import { readFileSync, readdirSync } from "node:fs";
const srcs = [...readdirSync("api").filter(f => f.endsWith(".js")).map(f => "api/" + f), ...readdirSync("public/js").filter(f => f.endsWith(".js")).map(f => "public/js/" + f), "lib/findCardKit.js", "lib/tasks/emailCards.js", "public/onebox.html"];
const readers = srcs.filter(f => !/^api\/(usageDashboard|admin)\.js$/.test(f)).filter(f => /chart\.note|chart\.withheld|chartHeldSentence|\.chart\.buckets/.test(readFileSync(f, "utf8")));
ok(readers.every(f => f === "public/js/onebox.js"), `only Market Check reads the engine's chart object (readers: ${readers.join(", ") || "none"})`);
await b.close();
console.log(`noChartLayoutCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
