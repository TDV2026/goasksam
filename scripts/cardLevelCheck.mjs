// FIND CARDS IN A ROW ARE LEVEL (Sam, Oct 29 2026): every card's Sam block is a fixed-height slot, the chips row a fixed two-line height, so the View auction buttons of the cards in one row sit on one line, at 1440 and 390, in every
// state (a range, thin, refused, no bids, ended, still being read). This renders rows of mixed-state cards through the real Find page (api/buy.js) and FAILS if any two buttons in a row differ in vertical position, if a Sam block's
// height differs from its row mates, or if a card repeats its own name inside the Sam block. "See the sales" prints only with a range and sits beside the button.
//   node scripts/cardLevelCheck.mjs   (E98_ROOT=<another checkout> to read that tree's pages)
import { BLACK_BMW, FIND, M3_ROW, PORSCHE_2005, CORVETTE } from "./e98Fixtures.mjs";
import { startBrowser, ROOT } from "./e98Render.mjs";
import { buildCards, openFind } from "./e98FindRender.mjs";
import { openPanel } from "./e98PanelRender.mjs";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
console.log("cardLevelCheck reading " + ROOT);
const defs = [...Object.values(BLACK_BMW), ...Object.values(M3_ROW), ...Object.values(PORSCHE_2005), CORVETTE, ...Object.values(FIND)];
const b = await startBrowser(), cards = await buildCards(defs);
const past = new Date(Date.now() - 36e5).toISOString();
// states by hand on top of the fixtures: no bids, an ended auction, a long title, chips that wrap, a card still being read
const mod = (i, f) => { const c = JSON.parse(JSON.stringify(cards[i % cards.length])); f(c); c.id = 900 + i; return c; };
const mixed = [...cards,
  mod(0, c => { c.current_bid_usd = null; c.bid_unknown = true; c.title = "2002 BMW M3 Coupe no bids yet"; c.sam_lines = []; c.market = { ...(c.market || {}), kind: "range" }; }),
  mod(1, c => { c.end_time = past; c.title = "1997 BMW M3 Sedan, an ended auction"; }),
  mod(2, c => { c.title = "2015 BMW Z4 sDrive35is with a very long title that runs over two lines of the card on a narrow screen"; c.chips = ["Manual", "Alpine White", "Clean title", "Carbon roof", "Heated seats", "Navigation"]; }),
  mod(4, c => { c.title = "2005 Porsche 911 Carrera refused"; c.market = { kind: "refused", refusalLine: "Sam does not read this one: the listing does not say enough to match it to a car.", query: null }; c.sam_lines = []; }),
  mod(5, c => { c.title = "2008 BMW M3 Coupe with nothing to say"; c.market = null; c.sam_lines = []; }),
  mod(3, c => { c.market = { kind: "pending", stillReading: true, line: "The sales for this one are being read.", retry: true, retryAfterMs: 2000, waitMaxMs: 85000 }; c.sam_lines = []; })];
const note = {};
for (const w of [1440, 390]) {
  const p = await openFind(b, mixed, w, "black BMW");
  for (let i = 0; i < 4; i++) { await p.evaluate(() => { const m = document.querySelector("[data-more]"); if (m) m.click(); }); await new Promise(r => setTimeout(r, 300)); }   // Show more until every card is on screen
  const info = await p.evaluate(() => {
    const cs = [...document.querySelectorAll("article.car")].filter(a => a.querySelector(".vauc")).map(a => { const v = a.querySelector(".vauc").getBoundingClientRect(), r = a.getBoundingClientRect(), sl = a.querySelector(".sl"), sp = a.querySelector(".specs"), act = a.querySelector(".act");
      const name = (a.querySelector("h3") || { innerText: "" }).innerText.replace(/\s+/g, " ").trim().toLowerCase();
      return { id: a.dataset.id, rowTop: Math.round(r.top + scrollY), btnTop: Math.round(v.top + scrollY), slH: sl ? Math.round(sl.getBoundingClientRect().height) : 0, specsH: sp ? Math.round(sp.getBoundingClientRect().height) : 0, hasAct: !!act, actTop: act ? Math.round(act.getBoundingClientRect().top + scrollY) : null, actBesideBtn: act ? Math.abs(act.getBoundingClientRect().top - v.top) < 3 : null, slText: sl ? sl.innerText.replace(/\s+/g, " ").toLowerCase() : "", lines: (() => { let n = 0, gaps = [], prev = null, used = 0; for (const e of a.querySelectorAll(".sl .fx-ans,.sl .fx-count,.sl .fx-bid")) { const q = e.getBoundingClientRect(); if (!q.height) continue; const lh = parseFloat(getComputedStyle(e).lineHeight) || 18; n += Math.round(q.height / lh); if (prev !== null) gaps.push(Math.round((q.top - prev) * 10) / 10); prev = q.bottom; used = q.bottom - a.querySelector(".sl").getBoundingClientRect().top; } return { n, gaps, used: Math.round(used), off: a.querySelector('.sl .fx-ans') ? Math.round(a.querySelector('.sl .fx-ans').getBoundingClientRect().top - a.querySelector('.sl').getBoundingClientRect().top) : 9999 }; })(), tops: [".fx-ans", ".fx-count", ".fx-bid"].map(q => { const e = a.querySelector(q); return e ? Math.round((e.getBoundingClientRect().top - a.getBoundingClientRect().top) * 10) / 10 : null; }), clipped: [...a.querySelectorAll(".sl, .sl p, .specs")].filter(e => e.scrollHeight > e.clientHeight + 1).map(e => e.className + ":" + e.scrollHeight + ">" + e.clientHeight).join(" "), name, rangeText: sl ? /\$[\d,]+\s*to\s*\$[\d,]+/.test(sl.innerText) : false }; });
    return cs; });
  ok(info.length >= 12, `${w}: the mixed rows render (${info.length} cards)`);
  const rows = {}; info.forEach(c => (rows[c.rowTop] = rows[c.rowTop] || []).push(c));
  let multi = 0;
  for (const [top, row] of Object.entries(rows)) { if (row.length < 2) continue; multi++;
    const ys = row.map(c => c.btnTop), hs = row.map(c => c.slH), sp = row.map(c => c.specsH);
    ok(Math.max(...ys) - Math.min(...ys) <= 1, `${w}: the View auction buttons in the row at ${top} sit on one line (${ys.join(", ")})`);
    ok(Math.max(...hs) - Math.min(...hs) <= 1, `${w}: the Sam blocks in the row at ${top} are one height (${hs.join(", ")})`);
    for (const k of [0]) { const t = row.map(c => c.tops[k]).filter(v => v != null); if (t.length > 1) ok(Math.max(...t) - Math.min(...t) <= 1, `${w}: the ${["answer", "count line", "bid line"][k]} in the row at ${top} sit at one height from the card top (the count and bid lines follow the answer line by line, so they sit where the answer ends) (${t.join(", ")})`); }
    ok(Math.max(...sp) - Math.min(...sp) <= 1, `${w}: the chips rows in the row at ${top} are one height (${sp.join(", ")})`); }
  if (w === 1440) ok(multi >= 3, `${w}: at least three rows of two or more cards were measured (${multi})`);
  // one fixed Sam block height for every card on the page, whatever its state
  const allH = info.map(c => c.slH); ok(Math.max(...allH) - Math.min(...allH) <= 1, `${w}: every Sam block on the page is the same fixed height (${[...new Set(allH)].join(", ")}; off: ${info.filter(c => c.slH !== allH[0]).map(c => c.id).join(",")})`);
  const allS = info.map(c => c.specsH); const SPECS_H = [...new Set(allS)].filter(h => h > 1); ok(SPECS_H.length <= 1 && (w > 700 ? allS.every(h => h === allS[0]) : allS.every(h => h === 0 || h === SPECS_H[0])), `${w}: every chips row is the same fixed height (${[...new Set(allS)].join(", ")}); alone in its row (700px and under) a card with no chips has none`);
  // THE SAM BLOCK IS NO TALLER THAN FOUR TEXT LINES, IN ANY STATE (Oct 30 2026): the answer (the reason at most two lines, the range one), the count line and the bid line sit one after another at normal line spacing, and the slot is the tallest real state, not more.
  const lineMax = Math.max(...info.map(c => c.lines.used)); const slotH = Math.max(...allH);
  for (const c of info) { ok(c.lines.n <= 4, `${w}: card ${c.id}: the Sam block is ${c.lines.n} text lines, at most four`); ok(c.lines.gaps.every(g => g <= 4), `${w}: card ${c.id}: the lines follow one another with no paragraph gaps (${c.lines.gaps.join(", ")} px)`); }
  const labelH = Math.min(...info.map(c => c.lines.off)); ok(slotH - labelH <= 4 * 22 && slotH <= lineMax + 12, /* the block's own 10px bottom padding */ `${w}: the Sam slot (${slotH}px, ${labelH}px of it the Sam label) holds four 16px lines at most (88px) and is no more than the tallest real state needs (${lineMax}px, plus the block's bottom padding)`);
  // See the sales only with a range, beside the button; the car's own name is not repeated in the Sam block
  for (const c of info) { if (c.hasAct) { ok(c.rangeText, `${w}: card ${c.id} prints See the sales only with a range`); ok(c.actBesideBtn, `${w}: card ${c.id}: See the sales sits beside View auction`); }
    ok(!c.clipped, `${w}: card ${c.id}: nothing in the Sam block or the chips row is cut off by its fixed height (${c.clipped})`);
    ok(!c.name || !c.slText.includes(c.name), `${w}: card ${c.id}: the car's name is not repeated inside the Sam block`); }
  await p.close();
}

// MUTANT: without the fixed-height slots the buttons in a row differ (the check can see it)
{ const p = await openFind(b, mixed, 1440, "black BMW");
  for (let i = 0; i < 4; i++) { await p.evaluate(() => { const m = document.querySelector("[data-more]"); if (m) m.click(); }); await new Promise(r => setTimeout(r, 300)); }
  await p.addStyleTag({ content: ".cgrid .car .tx>.sl{height:auto!important;min-height:0!important}.cgrid .car p.specs{height:auto!important;min-height:0!important}.msg.sam .cgrid .car .sl p{height:auto!important}.cgrid .car .acts{margin-top:0!important}" });
  await new Promise(r => setTimeout(r, 600));
  const spread = await p.evaluate(() => { const rows = {}; document.querySelectorAll("article.car").forEach(a => { const v = a.querySelector(".vauc"); if (!v || !a.offsetParent) return; const t = Math.round(a.getBoundingClientRect().top + scrollY); (rows[t] = rows[t] || []).push(Math.round(v.getBoundingClientRect().top + scrollY)); }); return Math.max(0, ...Object.values(rows).filter(r => r.length > 1).map(r => Math.max(...r) - Math.min(...r))); });
  ok(spread > 1, `mutant: with the fixed-height slots and the bottom pin removed the buttons in a row differ (${spread}px), so the row check can see it`); await p.close(); }
// THE EXPANDED PANEL PRINTS findAnswer.otherLines, NOT THE WHOLE OPTION LIST (Lane E, Oct 30 2026; Lane B's 8c6025fb): a car in a thin mileage band headlines the nearest band, and the panel lists only the options the headline does not state.
// Every band shape, at 1440 and 390, rendered through the real Find page and its panel. (scripts/nearBandPagesCheck.mjs drives the same rule over the engine's own answers.)
{
  const L = { lt: "Under 50,000 miles, 4 sales, too few for a range", mid: "50,000 to 100,000 miles $26,000 to $38,000, 9 sales since June 2025", gt: "Over 100,000 miles $20,000 to $30,000, 8 sales since June 2025" };
  const cases = [
    { name: "thin own band, near band headlines", all: [L.lt, L.mid, L.gt], other: [L.gt] },
    { name: "own band headlines, two others", all: [L.lt, L.mid, L.gt], other: [L.lt, L.gt] },
    { name: "no other options", all: [L.mid], other: [] },
  ];
  for (const w of [1440, 390]) for (const c of cases) {
    const fa = { state: "range", basis: "band_near", range: { low: 26000, high: 38000 }, n: 9, lines: ["Few sales under 50,000 miles, so this is the 50,000 to 100,000 mile range."], otherLines: c.other, nearBand: null, pointer: null };
    const p = await openPanel(b, w, { market: { optionLines: c.all, findAnswer: fa } });
    const got = await p.evaluate(() => [...document.querySelectorAll(".mcdrawer .md-opt")].map(e => e.textContent.trim()));
    ok(JSON.stringify(got) === JSON.stringify(c.other), `${w}: ${c.name}: the panel prints findAnswer.otherLines only (${JSON.stringify(got)})`);
    ok(!got.includes(L.mid) || c.other.includes(L.mid), `${w}: ${c.name}: the panel never restates the headline band`);
    if (!c.other.length) ok(await p.evaluate(() => !document.querySelector(".mcdrawer .md-opts")), `${w}: ${c.name}: no empty options block`);
    await p.close();
  }
}
await b.close();
console.log(`cardLevelCheck: ${fail ? pass + " pass, " + fail + " FAIL" : "all pass (" + pass + ")"}`); process.exit(fail ? 1 : 0);
