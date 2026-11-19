// SHOW MORE ENDS (Sam, Oct 29 2026). Cause: "Show more sales (25)" on Market Check (All comparable sales) set the hidden attribute on itself after it revealed every row, but .linkbtn sets display:inline-flex and an author display beats the browser's [hidden] rule, so the button stayed on screen, still reading (25), with all 35 rows shown. The count was right (rows still hidden at the click); the answer's own total was 35, the same 35 the engine sent in cards.
// Class: any control that hides itself, or a row, with the hidden attribute while its class sets display. Every show-more control is clicked to the end here: on Market Check (1986 Porsche 911 Carrera, 2004 BMW M3) and on the Find See the sales panel (25 rows). While a control is on screen, rows must still be hidden and a count in its brackets must equal the rows still hidden; when it is clicked out, no rows are hidden and the control is not on screen. Every [hidden] element on the page must also compute to display none.
// The controls found in the code: Market Check "Show more sales (N)" (.allsales-showall) and the Find drawer "Show more" (.md-more). Landing, Sell, Tasks, desk and the preview pages have none.   node scripts/showMoreCheck.mjs
import { startBrowser, openMC } from "./e98Render.mjs";
import { openPanel } from "./e98PanelRender.mjs";
import { MC } from "./e98Fixtures.mjs";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const state = () => { const vis = e => !!e && e.getClientRects().length > 0 && getComputedStyle(e).display !== "none" && getComputedStyle(e).visibility !== "hidden";
  const ctl = [...document.querySelectorAll(".allsales-showall,.md-more,button")].find(b => (b.matches(".allsales-showall,.md-more") || /^\s*(show|load|see) more/i.test(b.textContent)) && vis(b));
  const rows = [...document.querySelectorAll(".allsales-table tbody tr,.mcdrawer .md-row")], hiddenRows = rows.filter(r => !vis(r)).length;
  const strays = [...document.querySelectorAll("[hidden]")].filter(e => e.getClientRects().length > 0 && getComputedStyle(e).display !== "none").map(e => e.tagName.toLowerCase() + "." + String(e.className).split(" ")[0]);
  return { ctl: ctl ? ctl.textContent.replace(/\s+/g, " ").trim() : null, shown: rows.length - hiddenRows, hiddenRows, total: rows.length, strays }; };
async function walk(p, where, total) {
  let s = await p.evaluate(state), steps = 0; ok(s.total === total, `${where}: the list holds the ${total} rows the engine sent (${s.total})`); ok(s.ctl && s.hiddenRows > 0, `${where}: before the click the control is on screen with rows hidden (${s.shown} shown, ${s.hiddenRows} hidden, "${s.ctl}")`);
  while (s.ctl && steps++ < 6) {
    const m = /\((\d+)\)/.exec(s.ctl); ok(s.hiddenRows > 0, `${where}: the control is on screen only while rows are hidden (${s.hiddenRows} hidden)`); if (m) ok(Number(m[1]) === s.hiddenRows, `${where}: the count in the brackets is the rows still hidden (${m[1]} against ${s.hiddenRows})`);
    await p.evaluate(() => { const b = [...document.querySelectorAll(".allsales-showall,.md-more,button")].find(b => (b.matches(".allsales-showall,.md-more") || /^\s*(show|load|see) more/i.test(b.textContent)) && b.getClientRects().length > 0 && getComputedStyle(b).display !== "none"); if (b) b.click(); });
    await new Promise(r => setTimeout(r, 250)); s = await p.evaluate(state); }
  ok(s.ctl === null && s.hiddenRows === 0 && s.shown === total, `${where}: after the last click every row is shown (${s.shown} of ${total}) and the control is gone (${s.ctl || "gone"})`);
  ok(s.strays.length === 0, `${where}: nothing with the hidden attribute is on screen (${s.strays.join(", ") || "none"})`);
}
const b = await startBrowser();
for (const w of [1440, 390]) {
  for (const [name, key] of [["1986 Porsche 911 Carrera", "1986 Porsche 911 (Targa 11, Cabriolet 11, Coupe 16 against 35)"], ["2004 BMW M3", "2004 BMW M3 (split)"]]) {
    const fx = MC[key], sent = (fx.d.cards || []).filter(c => c && Number(c.price) > 0).length, p = await openMC(b, fx, w);
    await walk(p, `Market Check ${name} at ${w}`, sent); await p.close(); }
  const rows = Array.from({ length: 25 }, (_, k) => ({ id: "s" + k, price: 41000 - k * 700, date: `2026-${String(10 - Math.floor(k / 3)).padStart(2, "0")}-1${k % 3}`, mi: 31000 + k * 900, title: "2008 BMW M3 Coupe " + k }));
  const p = await openPanel(b, w, { rows }); await walk(p, `Find results list (See the sales panel) at ${w}`, 25); await p.close(); }
await b.close();
console.log(`showMoreCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
