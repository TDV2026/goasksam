// THE "HOW THIS MARKET HAS MOVED" CARD (Sam, Oct 26 2026), rendered with the page's own CSS (public/onebox.html) at 1440 and 390: the heading and the "by quarter" line under
// it sit together (a normal gap, like the gap between the card's other lines), even when the left column is much taller and stretches the right one (the case that
// left a large empty band), the chart follows with normal spacing, and nothing scrolls sideways. The markup order is read from the real code (public/js/onebox.js). No network.
//   node scripts/chartGapCheck.mjs
import fs from "node:fs";
import puppeteer from "puppeteer-core";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const html = fs.readFileSync(new URL("../public/onebox.html", import.meta.url), "utf8"), js = fs.readFileSync(new URL("../public/js/onebox.js", import.meta.url), "utf8");
ok(/'<div class="hero-chart"><h2>How this market has moved<\/h2><div class="hc-body">' \+ inner \+ "<\/div><\/div>"/.test(js) && /return size \+ svg \+ legend \+ py \+ \(d\.chartCaption \? '<p class="hc-note">'/.test(js) && /'<p class="hc-size">'/.test(js), "the card's markup order is heading, then the body that starts with the size line, then the chart and legend");
ok(/<p class="hc-note">' \+ esc\(d\.chartCaption\)/.test(js) && /\.hc-note\{[^}]*color:var\(--sec\)/.test(html), "the one static line is in the chart markup and styled like the card's other small lines");
ok(/\.hc-body\{[^}]*justify-content:flex-start/.test(html) && !/\.hc-body\{[^}]*justify-content:center/.test(html), "the chart body is pinned to the top, not centered");
const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join("\n");
const card = `<div class="hero2col"><div class="hero-left" style="height:520px"><p class="hero-label">Where the middle half sold</p><p>left column, much taller than the chart</p></div><div class="hero-chart"><h2>How this market has moved</h2><div class="hc-body"><p class="hc-size">by quarter, April 2024 to October 2026</p><svg class="hc-svg" viewBox="0 0 880 560"><rect width="880" height="560" fill="#eee"/></svg><div class="hc-legend"><span>Typical range (middle half of sales)</span><span>Typical sale (median)</span></div><p class="hc-note">Quarters with too few sales are left out.</p></div></div></div>`;
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const p = await b.newPage(); await p.setViewport({ width: w, height: h, isMobile: w < 600 });
  await p.setContent(`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>${styles}</style><body style="margin:20px"><div style="max-width:1100px">${card}</div></body>`);
  const m = await p.evaluate(() => { const r = s => document.querySelector(s).getBoundingClientRect(), h2 = r(".hero-chart h2"), sz = r(".hc-size"), svg = r(".hc-svg"), lg = r(".hc-legend"), nt = r(".hc-note"), ch = r(".hero-chart"), left = r(".hero-left"); return { gapHeadSize: Math.round(sz.top - h2.bottom), gapSizeChart: Math.round(svg.top - sz.bottom), gapChartLegend: Math.round(lg.top - svg.bottom), noteBelow: nt.top >= lg.bottom - 1, noteGap: Math.round(nt.top - lg.bottom), noteFits: nt.bottom <= ch.bottom + 1, cardH: Math.round(ch.height), leftH: Math.round(left.height), hs: document.documentElement.scrollWidth > innerWidth + 1 }; });
  ok(m.gapHeadSize >= 0 && m.gapHeadSize <= 16, `[${w}] the heading and the "by quarter" line are ${m.gapHeadSize}px apart (normal is the card's 10px gap)`);
  ok(m.gapSizeChart <= 16 && m.gapChartLegend <= 16, `[${w}] the chart follows with normal spacing (${m.gapSizeChart}px, then ${m.gapChartLegend}px to the legend)`);
  if (w === 1440) ok(m.cardH >= m.leftH - 2, `[1440] the right column still stretches to the left column's height (${m.cardH} vs ${m.leftH}), so the gap fix did not shrink the layout`);
  ok(m.noteBelow && m.noteGap <= 16 && m.noteFits, `[${w}] the static quarters line sits under the legend (${m.noteGap}px) inside the card`);
  if (w === 1440) ok(m.cardH <= m.leftH + 1, `[1440] the line does not make the card taller than the left column (${m.cardH} vs ${m.leftH})`);
  ok(!m.hs, `[${w}] no sideways scroll`);
  await p.close();
}
await b.close();
console.log(`chartGapCheck: ${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0);
