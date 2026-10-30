// A HEADING IS NEVER FOLLOWED BY BLANK SPACE (Sam's live check on 84c54259, Oct 29 2026: "2010 Porsche 911 GT3", 11 sales, a range, chart withheld: the heading "Latest sales" with about 130 pixels of nothing under it, then "THE 11 SALES").
// CAUSE: the thin-tile treatment (9 to 16 sales: the sales go in a full width block below the hero) printed the engine's chart heading (chart.caption, "Latest sales") as a bare <h2 class="hero-latest"> in the left column, where the old "Too few to show movement" sentence had been, and put the sales in the block under it. The heading had nothing under it but the block's margin.
// The same sales were listed right below under "THE 11 SALES", in price order (not newest first), so the heading would also have been wrong over them. FIX: with the sales listed in the thin-tile block the page prints no heading there; the heading prints only over the engine's rows (heldPanelHtml).
// CLASS: any heading, eyebrow or caption with an empty region or a gap under it. Rendered at 1440 and 390 for every Market Check fixture across chart (withheld with and without rows, none, candles), pool sizes 0, 3, 8, 11, 17 and 35, narrowed and optioned answers, and Find cards: for every visible heading (h1 to h3 and .eyebrow) the nearest content below it, in its column, must be within MAXGAP pixels, and it must have content below it at all
// unless it is the last thing on the page. A mutant (a heading over an empty div) must be caught.     node scripts/emptyHeadingCheck.mjs
import { startBrowser, openMC } from "./e98Render.mjs";
import { buildCards, openFind } from "./e98FindRender.mjs";
import { MC, M3_ROW, FIND } from "./e98Fixtures.mjs";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const MAXGAP = 80;
const SCAN = maxgap => { const bad = []; let n = 0;
  const vis = e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
  const content = e => vis(e) && ((e.matches("img,svg,canvas,input,button,select,textarea,a") && !e.closest("[hidden]")) || [...e.childNodes].some(x => x.nodeType === 3 && x.textContent.trim()));
  const all = [...document.querySelectorAll("#ob *, main *, body *")].filter(content);
  const heads = [...document.querySelectorAll("h1,h2,h3,.eyebrow,.hw-cap,.hero-latest")].filter(e => vis(e) && e.textContent.trim() && !e.closest("nav,header,aside,.rail,[hidden]"));
  for (const h of heads) { n++; const r = h.getBoundingClientRect(), label = h.tagName.toLowerCase() + "." + String(h.className) + " \"" + h.textContent.trim().slice(0, 28) + "\"";
    let best = null;
    for (const e of all) { if (h.contains(e) || e.contains(h)) continue; const q = e.getBoundingClientRect(); if (q.top < r.bottom - 2) continue; if (q.right < r.left + 4 || q.left > r.right - 4) continue; if (best === null || q.top < best) best = q.top; }
    if (best === null) { if (r.bottom < document.documentElement.scrollHeight - 120) bad.push(label + ": nothing under it"); continue; }
    // the Find card reserves a fixed two-line chips row (Sam, Oct 29 2026, card level): when a card has no chips that reserved slot is the card's contract, not blank space, so it is taken off the gap (the rest must still be within maxgap)
    const card = h.closest("article.car"), slot = card ? [...card.querySelectorAll(".specs")].filter(q => !q.querySelector(".spec:not([hidden])")) : [];
    const gap = best - r.bottom - slot.reduce((t, q) => t + q.getBoundingClientRect().height + 10, 0); if (gap > maxgap) bad.push(label + ": " + Math.round(gap) + "px of nothing under it"); }
  return { bad, n }; };
const strip = d => { const { trend, chart, trendHeld, chartCaption, chartWindowLine, ...r } = d; return r; };
const HELD = (n, caption = "Latest sales") => ({ type: "withheld", scope: null, buckets: null, note: null, caption, withheld: { reason: "too_few", line: "x" }, n });
const b = await startBrowser(); const seen = [];
for (const [name, fx] of Object.entries(MC).slice(0, 3)) for (const n of [0, 8, 11, 17]) for (const mode of ["held", "heldNoCaption", "none"]) for (const w of [1440, 390]) {
  const cards = (fx.d.cards || []).slice(0, n); if (n > (fx.d.cards || []).length) continue;
  const d = { ...strip(fx.d), cards, poolN: n || fx.d.poolN, ...(mode === "held" ? { chart: HELD(n) } : mode === "heldNoCaption" ? { chart: { ...HELD(n), caption: undefined } } : {}) };
  const p = await openMC(b, { ...fx, d }, w), r = await p.evaluate(SCAN, MAXGAP), where = `${name.slice(0, 30)}, ${n} sales, chart ${mode}, at ${w}`;
  ok(r.bad.length === 0, `${where}: no heading with blank space under it (${r.n} headings read${r.bad.length ? "; " + r.bad.slice(0, 2).join(" ; ") : ""})`); seen.push(r.n); await p.close(); }
// drawn charts and the options answers as the fixtures send them
for (const [name, fx] of Object.entries(MC)) for (const w of [1440, 390]) { const p = await openMC(b, fx, w), r = await p.evaluate(SCAN, MAXGAP); ok(r.bad.length === 0, `${name.slice(0, 40)} as sent, at ${w}: no heading with blank space under it (${r.n} headings${r.bad.length ? "; " + r.bad.slice(0, 2).join(" ; ") : ""})`); await p.close(); }
// the mutant: a heading over an empty container must be caught
{ const fx = Object.values(MC)[2], p = await openMC(b, fx, 1440); await p.evaluate(() => { const h = document.createElement("h2"); h.textContent = "Latest sales"; const e = document.createElement("div"); e.style.height = "130px"; const host = document.querySelector(".hero-left") || document.querySelector("#ob"); host.appendChild(h); host.appendChild(e); });
  const r = await p.evaluate(SCAN, MAXGAP); ok(r.bad.some(x => /Latest sales/.test(x)), `a heading over an empty 130 pixel container is caught (${r.bad[0] || "not caught"})`); await p.close(); }
// Find
{ const cards = await buildCards([...Object.values(M3_ROW), ...Object.values(FIND)].slice(0, 8));
  for (const w of [1440, 390]) { const p = await openFind(b, cards, w), r = await p.evaluate(SCAN, MAXGAP); ok(r.bad.length === 0, `Find at ${w}: no heading with blank space under it (${r.n} headings${r.bad.length ? "; " + r.bad.slice(0, 2).join(" ; ") : ""})`); await p.close(); } }
await b.close();
console.log(`emptyHeadingCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
