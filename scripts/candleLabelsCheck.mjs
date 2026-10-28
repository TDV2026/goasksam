// CANDLE CHART LABELS (Sam, Oct 27 2026): "How this market has moved" labels EVERY quarter shown with the top and the bottom of its typical range (the engine's own low and high, in the
// small type of today; the median stays unlabelled; one label when top and bottom are the same figure after rounding). Labels never overlap a bar, each other, or leave the chart. If two
// cannot fit, the bottoms are dropped before the tops and the count dropped is on the chart. The chart still shows only with three or more qualifying quarters. This check runs the page's
// own candleChartHtml for 2 to 6 quarters, prices from $5,000 to $1,500,000, at 1440 and 390 wide, in a real browser, and measures every label.   node scripts/candleLabelsCheck.mjs
import fs from "node:fs";
import puppeteer from "puppeteer-core";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const src = fs.readFileSync("public/js/onebox.js", "utf8"), html = fs.readFileSync("public/onebox.html", "utf8");
const fn = name => { const i = src.indexOf("  function " + name + "("); if (i < 0) throw new Error("missing " + name); let d = 0, j = src.indexOf("{", i); for (let k = j; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}" && !--d) return src.slice(i, k + 1); } throw new Error("unterminated " + name); };
const build = phone => new Function("window", "lint", ["esc", "usd", "usdK", "chartTip", "niceStep", "qtrLabel", "digitOf", "chartMovementOf", "chartSlots", "candleChartHtml"].map(fn).join("\n") + "\nreturn candleChartHtml;")({ matchMedia: () => ({ matches: phone }) }, x => x);
// The rules of the line below the chart are static text; the chart's CSS is the page's own.
const css = (html.match(/\.hc-[^{]*\{[^}]*\}/g) || []).join("\n") + "\n.hc-svg{width:100%;aspect-ratio:11/7;display:block}";
const phoneCss = (html.match(/@media \(max-width:700px\)\{[\s\S]*?\n\}/g) || []).join("\n");
const Q = ["Q1 2025", "Q2 2025", "Q3 2025", "Q4 2025", "Q1 2026", "Q2 2026"];
const mk = (n, lows, highs, count = 9) => ({ trend: { movement: { size: "quarter", label: "By quarter", buckets: Array.from({ length: n }, (_, i) => ({ label: Q[6 - n + i], period: Q[6 - n + i], low: lows[i], high: highs[i], typical: (lows[i] + highs[i]) / 2, count })) } } });
const scale = (k, arr) => arr.map(v => Math.round(v * k / 50) * 50);
const SHAPES = {
  rising: [[1, 1.1, 1.2, 1.3, 1.45, 1.6], [1.5, 1.6, 1.8, 1.9, 2.1, 2.3]],
  falling: [[1.6, 1.5, 1.3, 1.2, 1.1, 1], [2.3, 2.1, 1.9, 1.8, 1.6, 1.5]],
  flat: [[1, 1, 1, 1, 1, 1], [1.4, 1.4, 1.4, 1.4, 1.4, 1.4]],
  zigzag: [[1, 1.8, 1.1, 1.9, 1.2, 1.7], [1.5, 2.3, 1.6, 2.4, 1.7, 2.2]],
  thin: [[1, 1.02, 1.01, 1.03, 1.02, 1.04], [1.04, 1.06, 1.05, 1.07, 1.06, 1.08]],
  tight: [[1.2, 1.2, 1.2, 1.2, 1.2, 1.2], [1.2, 1.2, 1.2, 1.2, 1.2, 1.2]]
};
const PRICES = [["$5,000s", 4000], ["$30,000s", 25000], ["$120,000s", 100000], ["$1,500,000s", 1000000]];
const cases = [];
for (const [pn, base] of PRICES) for (const n of [3, 4, 5, 6]) for (const [sn, [lo, hi]] of Object.entries(SHAPES)) cases.push({ name: `${pn} ${n} quarters ${sn}`, d: mk(n, scale(base, lo.slice(0, n)), scale(base, hi.slice(0, n))) });
// fewer than three quarters: no chart at all
for (const n of [2, 1]) ok(build(false)(mk(n, scale(10000, [1, 1.1].slice(0, n)), scale(10000, [1.4, 1.5].slice(0, n)))) === "", `${n} quarters: no chart is drawn (three or more must qualify)`);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
const droppedCases = [];
let total = 0;
for (const [wname, w, phone] of [["1440", 1440, false], ["390", 390, true]]) {
  const page = await browser.newPage(); await page.setViewport({ width: w, height: 900 });
  const draw = build(phone);
  for (const c of cases) {
    const chart = draw(c.d);
    ok(chart.includes("<svg"), `${wname} ${c.name}: the chart is drawn`);
    await page.setContent(`<!doctype html><html><head><style>:root{--sec:#5E6B63;--ink:#15201A;--div:#D8D4CB;--num:#1E4D38;--chip:#E3EFE6;--sans:system-ui}body{margin:0;font-family:system-ui}${css}${phone ? phoneCss : ""}</style></head><body><div style="width:${phone ? 358 : 560}px">${chart}</div></body></html>`);
    const r = await page.evaluate(() => {
      const svg = document.querySelector(".hc-svg"), vb = svg.viewBox.baseVal;
      const bb = e => { const b = e.getBBox(); return { x1: b.x, y1: b.y, x2: b.x + b.width, y2: b.y + b.height }; };
      const labels = [...svg.querySelectorAll(".hc-candlelabel")].map(e => ({ t: e.textContent, ...bb(e) }));
      const bars = [...svg.querySelectorAll(".hc-candle rect")].map(e => bb(e));
      const rows = [...svg.querySelectorAll(".hc-axq,.hc-axy,.hc-count,.hc-cap")].map(e => bb(e));
      const axis = [...svg.querySelectorAll(".hc-axislabel")].map(e => bb(e));
      return { vb: { w: vb.width, h: vb.height }, labels, bars, rows, axis, dropped: Number(svg.getAttribute("data-labels-dropped")) };
    });
    const hit = (a, b) => a.x1 < b.x2 - 0.5 && a.x2 > b.x1 + 0.5 && a.y1 < b.y2 - 0.5 && a.y2 > b.y1 + 0.5;
    let overlap = 0, outside = 0, onBar = 0, onAxis = 0;
    r.labels.forEach((a, i) => {
      if (a.x1 < 0 || a.y1 < 0 || a.x2 > r.vb.w || a.y2 > r.vb.h) outside++;
      r.labels.forEach((b, j) => { if (j > i && hit(a, b)) overlap++; });
      r.bars.forEach(b => { if (hit(a, b)) onBar++; });
      r.rows.concat(r.axis).forEach(b => { if (hit(a, b)) onAxis++; });
    });
    const n = r.bars.length, rounded = c.d.trend.movement.buckets.map(b => "$" + Math.round(b.low).toLocaleString("en-US") === "$" + Math.round(b.high).toLocaleString("en-US")).filter(Boolean).length;
    const wanted = 2 * n - rounded;
    total++;
    ok(overlap === 0, `${wname} ${c.name}: no two labels touch`);
    ok(outside === 0, `${wname} ${c.name}: no label leaves the chart`);
    if (process.env.DBG && (onBar || onAxis)) { r.labels.forEach(a => { r.bars.forEach(b => { if (hit(a, b)) console.log("  BAR", c.name, a.t, JSON.stringify(a), JSON.stringify(b)); }); r.rows.concat(r.axis).forEach(b => { if (hit(a, b)) console.log("  AXIS", c.name, a.t, JSON.stringify(a), JSON.stringify(b)); }); }); }
    ok(onBar === 0 && onAxis === 0, `${wname} ${c.name}: no label sits on a bar, the axis or the rows under the chart`);
    ok(r.labels.length + r.dropped === wanted, `${wname} ${c.name}: every figure is a label or counted as dropped (${r.labels.length} shown, ${r.dropped} dropped, ${wanted} wanted)`);
    if (r.dropped > 0) droppedCases.push(`${wname} ${c.name}: ${r.dropped} of ${wanted} dropped`);
  }
  await page.close();
}
await browser.close();
// The cases where labels were dropped are reported, never silent.
console.log(`candleLabelsCheck: ${total} charts rendered; ${droppedCases.length} with a label dropped for lack of room`);
droppedCases.forEach(l => console.log("  dropped: " + l));
console.log(`candleLabelsCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
