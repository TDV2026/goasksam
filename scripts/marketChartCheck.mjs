// SAM'S MARKET CHECK CHART FIXES (Oct 21 2026; Lane C): "How this market has moved" (public/js/onebox.js candleChartHtml) rendered in a
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
const Q = (period, low, high, typical, count, extra) => Object.assign({ period, low, high, typical, count, thin: count < 8 }, extra || {});
const CARS = {
  "2014 911 (Q1 and Q4 single values, Q2 narrow)": { quarters: [Q("2025-Q4", 88000, 88000, 88000, 1), Q("2026-Q1", 90000, 91500, 90500, 3), Q("2026-Q2", 79000, 99000, 88000, 9), Q("2026-Q3", 95000, 95000, 95000, 2)], minForRange: 8 },
  "full quarters A": { quarters: [Q("2025-Q4", 55000, 61500, 58000, 10), Q("2026-Q1", 52000, 66000, 59000, 12), Q("2026-Q2", 58000, 72000, 64000, 11), Q("2026-Q3", 60000, 78000, 69000, 14)], minForRange: 8 },
  "full quarters B (high prices)": { quarters: [Q("2025-Q4", 190000, 240000, 212000, 9), Q("2026-Q1", 185000, 260000, 220000, 13), Q("2026-Q2", 200000, 250000, 225000, 10), Q("2026-Q3", 210000, 280000, 240000, 16)], minForRange: 8 },
  "thin quarters with their sales (engine prices)": { quarters: [Q("2025-Q4", 70000, 70000, 70000, 1, { prices: [70000] }), Q("2026-Q1", 60000, 80000, 70000, 3, { prices: [60000, 70000, 80000] }), Q("2026-Q2", 62000, 90000, 75000, 9, { prices: [62000, 64000, 66000, 70000, 75000, 80000, 84000, 88000, 90000] }), Q("2026-Q3", 71000, 72000, 71500, 2, { prices: [71000, 72000] })], minForRange: 8 },
  "no prices yet (fallback: one dot at the typical)": { quarters: [Q("2025-Q4", 60000, 80000, 70000, 3), Q("2026-Q1", 62000, 90000, 75000, 9), Q("2026-Q2", 64000, 82000, 72000, 4), Q("2026-Q3", 66000, 85000, 74000, 12)], minForRange: null }
};
// (3) the no-chart layout: the lone left column has no right divider and uses the full width
const page = fs.readFileSync(new URL("../public/onebox.html", import.meta.url), "utf8");
ok(/\.hero2col > \.hero-left:only-child\{grid-column:1\/-1;border-right:0;padding-right:0\}/.test(page), "3: with no chart the hero's left column has no stray right divider and spans the full width");
ok(/\.hero-left\{display:flex;flex-direction:column;gap:10px;min-width:0;padding-right:36px;border-right:1px solid var\(--div\)\}/.test(page), "3: a hero WITH a chart keeps its divider (the rule only changes the lone column)");
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new" });
const shots = process.env.SHOTS;
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const p = await b.newPage(); await p.setViewport({ width: w, height: h, isMobile: w < 600 });
  await p.setContent(`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>:root{--ink:#15201A;--sec:#5E6B61;--div:#DCD8CC;--chip:#DDE6DE;--num:#1E4D38}body{margin:20px;font:14px sans-serif}.hc-svg{width:100%;height:auto;display:block;max-width:${w < 600 ? 350 : 560}px}.hc-axislabel{font-size:${w < 600 ? 32 : 23}px;fill:var(--sec)}.hc-candlelabel{font-size:${w < 600 ? 32 : 23}px;font-weight:600;fill:var(--sec)}.hc-count{font-size:${w < 600 ? 26 : 19}px;fill:var(--sec)}</style><div id=out></div>`);
  await p.addScriptTag({ content: code });
  for (const [name, trend] of Object.entries(CARS)) {
    const r = await p.evaluate((trend) => { const out = document.getElementById("out"); out.innerHTML = window.__chart({ trend });
      const svg = out.querySelector("svg"); if (!svg) return { none: true };
      const vb = svg.viewBox.baseVal, texts = [...svg.querySelectorAll("text")].map(t => { const bb = t.getBBox(); return { s: t.textContent, cls: t.getAttribute("class") || "", x1: bb.x, x2: bb.x + bb.width, y1: bb.y, y2: bb.y + bb.height }; });
      const rects = [...svg.querySelectorAll("rect")].map(e => { const bb = e.getBBox(); return { x1: bb.x, x2: bb.x + bb.width, y1: bb.y, y2: bb.y + bb.height }; });
      const dots = [...svg.querySelectorAll("circle")].map(e => ({ cx: +e.getAttribute("cx"), cy: +e.getAttribute("cy"), r: +e.getAttribute("r"), cls: e.getAttribute("class") || "" }));
      return { W: vb.width, H: vb.height, texts, rects, dots, html: svg.outerHTML.length }; }, trend);
    const key = `${w}px ${name}`;
    if (r.none) { ok(false, key + ": no chart drawn"); continue; }
    const labels = r.texts.filter(t => /candlelabel/.test(t.cls)), axis = r.texts.filter(t => /axislabel/.test(t.cls)), counts = r.texts.filter(t => /hc-count/.test(t.cls));
    // (e) no axis label is clipped (all inside the viewBox on the left) and none runs into the plot
    ok(axis.length > 0 && axis.every(t => t.x1 >= 0), key + ": the y-axis labels sit fully inside the frame (leftmost x " + Math.min(...axis.map(t => t.x1)).toFixed(1) + ")");
    // (d) no label over a box, a dot, the axis labels or another label; none outside the frame
    const hit = (a, b) => a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
    const dotBox = d => ({ x1: d.cx - d.r, x2: d.cx + d.r, y1: d.cy - d.r, y2: d.cy + d.r });
    let clash = [];
    labels.forEach((l, i) => { r.rects.forEach(rc => hit(l, rc) && clash.push(l.s + " over a box [label y " + l.y1.toFixed(0) + "-" + l.y2.toFixed(0) + " x " + l.x1.toFixed(0) + "-" + l.x2.toFixed(0) + "; box y " + rc.y1.toFixed(0) + "-" + rc.y2.toFixed(0) + " x " + rc.x1.toFixed(0) + "-" + rc.x2.toFixed(0) + "]")); r.dots.forEach(d => hit(l, dotBox(d)) && clash.push(l.s + " over a dot")); axis.forEach(a => hit(l, a) && clash.push(l.s + " over the axis")); counts.forEach(c => hit(l, c) && clash.push(l.s + " over a count")); labels.slice(i + 1).forEach(o => hit(l, o) && clash.push(l.s + " over " + o.s)); if (l.x1 < 0 || l.x2 > r.W) clash.push(l.s + " outside the frame"); });
    ok(clash.length === 0, key + ": no label overlaps a box, a dot, the axis, a count or another label" + (clash.length ? " (" + clash.join("; ") + ")" : ""));
    // (c) each quarter's sale count from the engine, under the quarter
    const want = trend.quarters.map(q => q.count + (q.count === 1 ? " sale" : " sales"));
    ok(JSON.stringify(counts.map(c => c.s)) === JSON.stringify(want), key + ": the counts under the quarters are the engine's (" + counts.map(c => c.s).join(", ") + ")");
    // (a) never the same number twice; a one-sale or flat quarter has no box
    const nums = labels.flatMap(l => l.s.match(/\$[\d,]+/g) || []);
    trend.quarters.forEach((q, i) => { if (q.count === 1 || q.low === q.high) { const same = labels.filter(l => l.s.split("$").length - 1 >= 2 && new RegExp("\\$" + q.low.toLocaleString("en-US") + "\\D.*\\$" + q.high.toLocaleString("en-US")).test(l.s)); ok(same.length === 0, key + ": Q" + (i + 1) + " (one value) never prints the same number twice"); } });
    const flats = trend.quarters.filter(q => q.count === 1 || q.low === q.high || (q.thin && Array.isArray(q.prices))).length;
    ok(r.rects.length === trend.quarters.filter(q => !(q.count === 1 || q.low === q.high) && !(q.thin) ).length || (trend.minForRange == null && r.rects.length === trend.quarters.filter(q => !(q.count === 1 || q.low === q.high) && !q.thin).length), key + ": a box only for a quarter with a real range (" + r.rects.length + " boxes, " + flats + " single or thin quarters)");
    // (b) a thin quarter with the engine's prices: one plain dot per sale
    trend.quarters.forEach((q, i) => { if (q.thin && Array.isArray(q.prices) && q.prices.length > 1) { const cx = r.W ? null : null; ok(r.dots.filter(d => /hc-sale/.test(d.cls)).length >= q.prices.length, key + ": thin Q" + (i + 1) + " draws a dot for each of its " + q.prices.length + " sales"); } });
    if (shots && name.startsWith("2014")) { await (await p.$("svg")).screenshot({ path: `${shots}/chart-${w}.png` }); }
  }
  await p.close();
}
await b.close();
console.log(`marketChartCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
