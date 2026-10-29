// THE SALE ROWS READ ACROSS (Sam, Oct 29 2026). Cause: the See the sales panel's <li> row was still a grid of 72px / 1fr / auto from before a sale row became ONE button; the button, the row's only child, sat in the 72px column and its own text column collapsed to 0 (live: 2008 BMW M3 Coupe,
// "October 2026, 31,000 miles at sale" one word per line over the price, beside a 45px thumbnail). Now the row is a block and the button carries photo, text and price. Class: any sale row whose text column is squeezed. Rendered with ten sales at 1440 and 390: the Find
// See the sales panel (the Tasks cards draw the same panel from the same code and CSS: FIND_CARD_CSS is read here too), and Market Check's "All comparable sales" and "Sales behind this answer". FAILS when a row's text column is narrower than 200px at 1440, when any
// text wraps beyond two lines, when the price overlaps the text, or when the photo is smaller than 64 x 48.   node scripts/salesPanelCheck.mjs
import { startBrowser, openMC } from "./e98Render.mjs";
import { openPanel } from "./e98PanelRender.mjs";
import { MC } from "./e98Fixtures.mjs";
import { FIND_CARD_CSS } from "../lib/findCardKit.js";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const b = await startBrowser();
for (const w of [1440, 390]) {
  const p = await openPanel(b, w);
  const rows = await p.evaluate(() => [...document.querySelectorAll(".mcdrawer .md-row")].filter(r => !r.hidden).map(r => { const g = s => r.querySelector(s), box = e => e ? e.getBoundingClientRect() : null, lines = e => { if (!e) return 0; const lh = parseFloat(getComputedStyle(e).lineHeight) || 18; return Math.round(e.getBoundingClientRect().height / lh); };
    const rt = box(g(".md-rt")), rp = box(g(".md-rp")), ph = box(g(".md-rph")), n = g(".md-rn"), m = g(".md-rm"), btn = g(".md-rowb"), rr = box(r);
    return { textW: rt && Math.round(rt.width), photo: ph && [Math.round(ph.width), Math.round(ph.height)], nLines: lines(n), mLines: lines(m), pLines: lines(g(".md-rp")), overlap: !!(rt && rp && rt.right > rp.left + 1 && rt.top < rp.bottom && rt.bottom > rp.top), btnW: box(btn) && Math.round(box(btn).width), rowW: rr && Math.round(rr.width), rtH: rt && Math.round(rt.height), text: ((n || {}).innerText || "") + " | " + ((m || {}).innerText || "") }; }));
  ok(rows.length >= 10, `Find See the sales at ${w}: ten sale rows are drawn (${rows.length})`);
  ok(rows.every(r => r.btnW >= r.rowW - 1), `Find See the sales at ${w}: each row's button takes the whole row (${rows[0] && rows[0].btnW} of ${rows[0] && rows[0].rowW}px)`);
  if (w === 1440) ok(rows.every(r => r.textW >= 200), `Find See the sales at ${w}: every row's text column is at least 200px wide (${rows.map(r => r.textW).slice(0, 3).join(", ")}px)`);
  ok(rows.every(r => r.nLines <= 2 && r.mLines <= 2 && r.pLines <= 1), `Find See the sales at ${w}: no text wraps beyond two lines (${rows.slice(0, 3).map(r => r.nLines + "/" + r.mLines + "/" + r.pLines).join(", ")})`);
  if (w === 1440) ok(rows.every(r => r.rtH <= 26), `Find See the sales at ${w}: each row reads across in one line (${rows.slice(0, 3).map(r => r.rtH).join(", ")}px)`);
  ok(rows.every(r => !r.overlap), `Find See the sales at ${w}: no row's text runs under its price`);
  ok(rows.every(r => r.photo && r.photo[0] >= 64 && r.photo[1] >= 48), `Find See the sales at ${w}: the photo is a usable size (${rows[0] && rows[0].photo && rows[0].photo.join("x")})`);
  ok(rows.every(r => /\d{4}/.test(r.text) && /miles at sale/.test(r.text)), `Find See the sales at ${w}: each row carries its date and its miles at sale (${rows[0] && rows[0].text})`);
  await p.close();
  const mc = await openMC(b, MC["2001 BMW M3 (alike with options)"], w), t = await mc.evaluate(() => { const lines = e => Math.round(e.getBoundingClientRect().height / (parseFloat(getComputedStyle(e).lineHeight) || 18)); const cells = [...document.querySelectorAll(".allsales-table tbody tr")].flatMap(r => [...r.querySelectorAll("td")]).map(td => ({ w: Math.round(td.getBoundingClientRect().width), l: lines(td) })), cards = [...document.querySelectorAll(".salescard-body p")].map(e => lines(e)); return { cells: cells.length, maxLines: Math.max(0, ...cells.map(c => c.l)), minCarW: Math.min(...[...document.querySelectorAll(".allsales-table tbody tr")].filter(r => r.offsetParent).map(r => r.children[1] ? Math.round(r.children[1].getBoundingClientRect().width) : 999)), cardsMax: Math.max(0, ...cards) }; });
  ok(t.cells > 20 && t.maxLines <= 2 && t.cardsMax <= 2, `Market Check All comparable sales and Sales behind this answer at ${w}: no text wraps beyond two lines (${t.cells} cells, at most ${t.maxLines} lines; tiles at most ${t.cardsMax})`);
  if (w === 1440) ok(t.minCarW >= 200, `Market Check All comparable sales at ${w}: the car column is at least 200px (${t.minCarW}px)`);
  await mc.close(); }
ok(/\.mcdrawer \.md-row\{display:block/.test(FIND_CARD_CSS) && /\.mcdrawer \.md-rowb\{[^}]*grid-template-columns:96px minmax\(0,1fr\) auto/.test(FIND_CARD_CSS), "the shared card CSS (Find and the Tasks cards) makes the sale row a block and the button carries the grid: photo, text, price");
await b.close();
console.log(`salesPanelCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
