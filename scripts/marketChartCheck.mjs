// SAM'S MARKET CHECK CHART ORDER (Oct 21 2026, evening; Lane C; replaces the quarter chart): "How this market has moved" (public/js/onebox.js candleChartHtml) rendered in a
// local browser from fixture engine answers (the shapes the engine sends: trend.quarters[] low, high, typical, count, thin, and
// prices / minForRange when present), measured in the SVG's own units. (a) one sale or low equal to high: ONE dot and ONE label,
// no box, never the same number twice; (b) a thin quarter: plain dots, no box; (c) every quarter's sale count under it; (d) no label
// overlaps a box, a dot or another label, and a short box takes its low and high on ONE line beside it; (e) the y-axis labels
// are never clipped on the left. The chart computes nothing. No network.   node scripts/marketChartCheck.mjs   (from the repo root)
import fs from "node:fs";
import puppeteer from "puppeteer-core";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const src = fs.readFileSync(new URL("../public/js/onebox.js", import.meta.url), "utf8");
const grab = (from, to) => { const a = src.indexOf(from), b = src.indexOf(to, a); if (a < 0 || b < 0) throw new Error("missing " + from); return src.slice(a, b); };
const code = ["  function esc(", "  function usd(", "  function digitOf(", "  function obNumWordLow("].map(h => { const a = src.indexOf(h); if (a < 0) throw new Error("missing " + h); return src.slice(a, src.indexOf("\n", a) + 1); }).join("") +
  "var NUMWORD = {1:'One',2:'Two',3:'Three',4:'Four',5:'Five',6:'Six',7:'Seven',8:'Eight'}, NUMWORD_REV = {one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8}; function lint(s){ return s; }\n" +
  grab("  function usdK(n)", "  // No candle chart (the engine supplies no trend at all)") + "\nwindow.__chart = candleChartHtml;";
const Bk = (label, low, high, typical, count) => ({ period: label, label, low, high, typical, count });
const MV = (size, label, buckets) => ({ movement: { size, label, minForRange: 8, buckets }, quarters: [] });
const CARS = {
  "2025 911 Carrera T (by half-year; no 0-sale bucket, no $0)": MV("half", "by half-year", [Bk("H1 2025", 128000, 141000, 134000, 11), Bk("H2 2025", 131000, 146000, 139000, 9), Bk("H1 2026", 136000, 150000, 141000, 8)]),
  "2014 911 (by half-year)": MV("half", "by half-year", [Bk("H2 2025", 66000, 79000, 71000, 10), Bk("H1 2026", 62000, 88000, 70500, 13), Bk("H2 2026", 69000, 101000, 75000, 9)]),
  "full quarters (by quarter)": MV("quarter", "by quarter", [Bk("Q4 2025", 55000, 61500, 58000, 10), Bk("Q1 2026", 52000, 66000, 59000, 12), Bk("Q2 2026", 58000, 72000, 64000, 11), Bk("Q3 2026", 60000, 78000, 69000, 14)]),
  "full quarters, high prices": MV("quarter", "by quarter", [Bk("Q4 2025", 190000, 240000, 212000, 9), Bk("Q1 2026", 185000, 260000, 220000, 13), Bk("Q2 2026", 200000, 250000, 225000, 10), Bk("Q3 2026", 210000, 280000, 240000, 16)]),
  "by year (three years)": MV("year", "by year", [Bk("2024", 39000, 49000, 44000, 17), Bk("2025", 41000, 52000, 46000, 22), Bk("2026", 44000, 58000, 50000, 31)]),
  "a short, flat box (one line beside it)": MV("quarter", "by quarter", [Bk("Q1 2026", 90000, 90500, 90200, 8), Bk("Q2 2026", 79000, 99000, 88000, 9), Bk("Q3 2026", 95000, 95400, 95100, 12)]),
};
const QS = (from, n, f) => { const out = []; let y = from[0], q = from[1]; for (let i = 0; i < n; i++) { out.push(f(i, "Q" + q + " " + y)); q++; if (q > 4) { q = 1; y++; } } return out; };
CARS["1995 911 Carrera (13 quarters)"] = MV("quarter", "by quarter, October 2023 to September 2026", QS([2023, 4], 13, (i, l) => Bk(l, 33000 + (i % 5) * 1500 + i * 400, 52000 + (i % 4) * 4000 + i * 700, 42000 + i * 500, [6, 8, 16, 9, 12, 14, 7, 10, 18, 11, 8, 13, 9][i])));
CARS["8 quarters"] = MV("quarter", "by quarter, October 2024 to September 2026", QS([2024, 4], 8, (i, l) => Bk(l, 61000 + i * 900, 83000 + (i % 3) * 5000, 72000 + i * 700, [7, 9, 12, 6, 8, 15, 10, 9][i])));
CARS["36 months, sparse (12 quarters of 5 or 6 sales)"] = MV("quarter", "by quarter, October 2023 to September 2026", QS([2023, 4], 12, (i, l) => Bk(l, 120000 + (i % 3) * 8000, 168000 + (i % 5) * 9000 - i * 1000, 144000 + i * 600, 5 + (i % 2))));
const NONE = { "fewer than two buckets (the engine returns none)": null, "one bucket only": MV("year", "by year", [Bk("2026", 40000, 50000, 45000, 12)]), "movement null": { movement: null, quarters: [] }, "a 0-sale or no-figure bucket is never drawn (and leaves one)": MV("quarter", "by quarter", [Bk("Q3 2026", 60000, 70000, 65000, 10), { period: "Q4 2026", label: "Q4 2026", low: null, high: null, typical: null, count: 0 }]) };
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new" });
// (3) the no-chart layout: the lone left column has no right divider and uses the full width
const page = fs.readFileSync(new URL("../public/onebox.html", import.meta.url), "utf8");
ok(/\.hero2col > \.hero-left:only-child\{grid-column:1\/-1;border-right:0;padding-right:0\}/.test(page), "no chart: the hero's left column has no stray right divider and spans the full width");
const src2 = fs.readFileSync(new URL("../public/js/onebox.js", import.meta.url), "utf8");
ok(/function noChartLineHtml\(d\) \{/.test(src2) && /Too few to show movement, enough to show where they landed\./.test(src2.slice(src2.indexOf("function noChartLineHtml"), src2.indexOf("function noChartLineHtml") + 700)) && (src2.match(/left \+= noChartLineHtml\(d\);/g) || []).length === 2, "no chart: the one line 'N sales. Too few to show movement, enough to show where they landed.' with the engine's pool size at both call sites");
const shots = process.env.SHOTS;
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const p = await b.newPage(); await p.setViewport({ width: w, height: h, isMobile: w < 600 });
  await p.setContent(`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>:root{--ink:#15201A;--sec:#5E6B61;--div:#DCD8CC;--chip:#DDE6DE;--num:#1E4D38}body{margin:20px;font:14px sans-serif}.hc-svg{width:100%;height:auto;display:block;max-width:${w < 600 ? 350 : 560}px}.hc-axislabel{font-size:${w < 600 ? 32 : 23}px;fill:var(--sec)}.hc-candlelabel{font-size:${w < 600 ? 32 : 23}px;font-weight:600;fill:var(--sec)}.hc-count{font-size:${w < 600 ? 28 : 19}px;fill:var(--ink)}.hc-axq{font-size:${w < 600 ? 30 : 20}px;font-weight:600;fill:var(--ink)}.hc-axy{font-size:${w < 600 ? 24 : 16}px;fill:var(--sec)}.hc-cap{font-size:${w < 600 ? 24 : 16}px;fill:var(--sec)}</style><div id=out></div>`);
  await p.addScriptTag({ content: code });
  const draw = (trend) => p.evaluate((trend) => { const out = document.getElementById("out"); out.innerHTML = window.__chart({ trend });
    const svg = out.querySelector("svg"); if (!svg) return { none: true, html: out.innerHTML.length };
    const vb = svg.viewBox.baseVal, texts = [...svg.querySelectorAll("text")].map(t => { const bb = t.getBBox(); return { s: t.textContent, cls: t.getAttribute("class") || "", x1: bb.x, x2: bb.x + bb.width, y1: bb.y, y2: bb.y + bb.height }; });
    const rects = [...svg.querySelectorAll("rect")].map(e => { const bb = e.getBBox(); return { x1: bb.x, x2: bb.x + bb.width, y1: bb.y, y2: bb.y + bb.height }; });
    return { W: vb.width, H: vb.height, texts, rects, circles: svg.querySelectorAll("circle").length, ticks: svg.querySelectorAll("line[stroke-width='3']").length, size: (out.querySelector(".hc-size") || {}).textContent || null, note: (out.querySelector(".hc-note") || {}).textContent || null, noteLast: !!(out.querySelector(".hc-note") && out.querySelector(".hc-legend") && (out.querySelector(".hc-legend").compareDocumentPosition(out.querySelector(".hc-note")) & 4) && !out.querySelector(".hc-note").nextElementSibling), legend: (out.querySelector(".hc-legend") || {}).textContent || null }; }, trend);
  for (const [name, trend] of Object.entries(CARS)) {
    const r = await draw(trend), key = `${w}px ${name}`, bks = trend.movement.buckets;
    if (r.none) { ok(false, key + ": no chart drawn"); continue; }
    const labels = r.texts.filter(t => /candlelabel/.test(t.cls)), axis = r.texts.filter(t => /axislabel/.test(t.cls)), counts = r.texts.filter(t => /hc-count/.test(t.cls));
    ok(r.note === "Quarters with too few sales are left out." && r.noteLast, key + ": the one static line sits last, under the legend (and under any year-before line): " + r.note);
    ok(r.circles === 0, key + ": ONLY candles: no dots anywhere (" + r.circles + " circles)");
    ok(r.rects.length === bks.length && r.ticks === bks.length, key + ": one candle (box and median mark) for each engine bucket (" + r.rects.length + " boxes, " + r.ticks + " marks, " + bks.length + " buckets)");
    ok(!r.texts.some(t => /^\$0\b|\$0$/.test(t.s.trim()) || /\$0 /.test(t.s)) && !axis.some(t => /-/.test(t.s)), key + ": never a $0 or a negative figure");
    ok(axis.length > 0 && axis.every(t => t.x1 >= 0), key + ": the y-axis labels sit fully inside the frame");
    const hit = (a, c) => a.x1 < c.x2 && a.x2 > c.x1 && a.y1 < c.y2 && a.y2 > c.y1;
    let clash = [];
    labels.forEach((l, i) => { r.rects.forEach(rc => hit(l, rc) && clash.push(l.s + " over a box")); axis.forEach(a => hit(l, a) && clash.push(l.s + " over the axis")); counts.forEach(c => hit(l, c) && clash.push(l.s + " over a count")); labels.slice(i + 1).forEach(o => hit(l, o) && clash.push(l.s + " over " + o.s)); if (l.x1 < 0 || l.x2 > r.W) clash.push(l.s + " outside the frame"); });
    ok(clash.length === 0, key + ": no label overlaps a box, the axis, a count or another label" + (clash.length ? " (" + clash.join("; ") + ")" : ""));
    const cap = r.texts.filter(t => /hc-cap/.test(t.cls)), axq = r.texts.filter(t => /hc-axq/.test(t.cls)), axy = r.texts.filter(t => /hc-axy/.test(t.cls));
    ok(JSON.stringify(counts.map(c => c.s)) === JSON.stringify(bks.map(q => String(q.count))), key + ": the counts are plain numbers, the engine's, one per candle (no word 'sales' under each)");
    ok(cap.length === 1 && /^Sales per /.test(cap[0].s), key + ": the count row is named once (" + (cap[0] && cap[0].s) + ")");
    const shownN = w < 600 ? Math.ceil(bks.length / 2) : bks.length;
    ok(axq.length === shownN, key + ": " + shownN + " axis labels shown (every one on desktop, every second on a phone): " + axq.length);
    const nameOf = q => String(q.label).replace(/\s+\d{4}$/, ""), lastQ = bks[bks.length - 1];
    ok(axq.every(t => bks.some(q => nameOf(q) === t.s)), key + ": the axis words are the engine's (period on top)");
    ok(axy.every(t => bks.some(q => q.label.endsWith(t.s))), key + ": the years are the engine's, below the period");
    ok(axq.some(t => t.s === nameOf(lastQ)), key + ": the last candle is named");
    const axisAll = [...axq, ...axy, ...counts, ...cap]; let axClash = [];
    axisAll.forEach((a1, i2) => axisAll.slice(i2 + 1).forEach(a2 => { if (a1.x1 < a2.x2 + 1 && a1.x2 + 1 > a2.x1 && a1.y1 < a2.y2 && a1.y2 > a2.y1) axClash.push(a1.s + "/" + a2.s); }));
    ok(axClash.length === 0, key + ": no axis label, year, count or caption touches another" + (axClash.length ? " (" + axClash.join(", ") + ")" : ""));
    ok(labels.length >= 1 && labels.length <= 8, key + ": range figures print only on the first, last, highest and lowest candle (" + labels.length + " printed)");
    ok(axisAll.every(t => t.x1 >= 0 && t.x2 <= r.W && t.y2 <= r.H), key + ": every axis row sits inside the frame");
    ok(r.size === trend.movement.label, key + ": the bucket size reads the engine's words (" + r.size + ")");
    ok(/Typical range \(middle half of sales\)/.test(r.legend || "") && /Typical sale \(median\)/.test(r.legend || ""), key + ": the legend");
    if (shots) await (await p.$("svg")).screenshot({ path: `${shots}/chart-${name.split(" ")[0]}-${name.length % 7}-${w}.png` });
  }
  for (const [name, trend] of Object.entries(NONE)) { const r = await draw(trend); ok(r.none === true && r.html === 0, `${w}px ${name}: no chart, so the page's 'Too few to show movement' line stands in`); ok(r.note == null, `${w}px ${name}: no chart means no static quarters line`); }
  await p.close();
}
await b.close();
console.log(`marketChartCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
