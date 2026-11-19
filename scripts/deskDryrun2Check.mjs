// DESK DRY RUN 2 (Lane D, Nov 8 2026; Sam's run on the 2008 Porsche 911 Carrera S sheet and its draft PDF). In the real page, in Chrome, over the real sheet actions and the real PDF writer, on three cars (a split pool,
// a plain pool, a thin tier pool), not the one example. CAUSES: (1) a sheet could only be given photos by the New valuation form and printed none at the top; (2) a click waited for the engine before it showed anything and
// the open waited too; (4/5/6) the median and the range were the body pool's whatever tier was picked, and the decision was held against a different range from the one on the page.
//   1 PHOTOS      two uploads in two steps, each a thumbnail in section 1, the first the cover, the PDF cover carries the cover photo and the car page the strip.
//   2 SPEED       a click lights its pill in under 100 ms and shows a working state while the engine reads (server delayed 1200 ms), the sheet opens in ONE press with a loading card, and everything settles in under 3 s.
//   4 METER       always visible; the marker starts at the engine median; dragging sets the analyst figure; "Engine median $X. Analyst figure $Y (plus)."; the engine's median never moves.
//   6 RESERVE     checked against the meter's own range: inside, at each edge (inclusive), one dollar outside, for a reserve and a range, on a deep tier and on a thin one.
//   7 QUESTION    "Question for the seller (prints on the report)" with its hint.   8 TIER LINE   the engine's no-listing line before a pick, "Engine: no suggestion. Analyst: tier 2 plus." after.
//   node scripts/deskDryrun2Check.mjs [repo root]      (scripts/deskDryrun2FailsWithout.mjs: each mutant must turn it red)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
const ROOT = path.resolve(process.argv[2] || new URL("..", import.meta.url).pathname);
process.chdir(ROOT);
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const { handleSheetAction } = await imp("lib/desk/sheetActions.js");
const { memoryStore } = await imp("lib/desk/sheetStore.js");
const { fixtureRead } = await imp("lib/desk/sheetShape.js");
const { evaluateDecision } = await imp("lib/desk/decisionRules.js");
const { startDesk, seed, wait, press } = await imp("scripts/deskValsRender.mjs");
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const JPG = fs.readFileSync(path.join(ROOT, "public/img/sell/specialist.jpg"));
const fetchImage = async url => { const m = /^data:[^;]+;base64,(.*)$/.exec(String(url || "")); return m ? Buffer.from(m[1], "base64") : null; };
const stream = bytes => [...Buffer.from(bytes).toString("latin1").matchAll(/stream\n([\s\S]*?)\nendstream/g)].map(m => m[1]).filter(s => /BT /.test(s));
const imgs = s => (s.match(/\/Im\d+ Do/g) || []).length;
const V_SPLIT = "WP0CB29918S765432", V_PLAIN = "WP0AB29918S745123", V_M3 = "WBSBR93422EX21856";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dr2-")), f1 = path.join(tmp, "one.jpg"), f2 = path.join(tmp, "two.jpg"); fs.writeFileSync(f1, JPG); fs.writeFileSync(f2, JPG);
const base = { reasons: [], otherText: "", line: "", guardLines: {} };
const usd = n => "$" + Math.round(n).toLocaleString("en-US");

// ================= 6 RESERVE AGAINST THE METER (actions level, three cars, a deep tier and a thin one)
{
  const cases = [[V_PLAIN, 2, []], [V_PLAIN, 4, []], [V_SPLIT, 2, [{ dimension: "body", value: "coupe" }]], [V_SPLIT, 2, [{ dimension: "body", value: "open" }]], [V_M3, 3, []], [V_M3, 1, []]];
  for (const [vin, tier, picks] of cases) {
    const read = fixtureRead({ vin, tier, picks }), mt = read.market.meter, tag = `${vin.slice(-6)} tier ${tier} ${picks.length ? picks[0].value : ""} (${mt && mt.basis})`;
    ok(mt && [mt.low, mt.median, mt.high].every(Number.isFinite), `${tag}: the sheet carries a meter`);
    const E = d => evaluateDecision({ read, draft: { ...base, ...d }, org: {}, priors: [] });
    ok(E({ mode: "reserve", reserve: String(mt.median) }).inRange, `${tag}: the engine median is inside`);
    ok(E({ mode: "reserve", reserve: String(mt.low) }).inRange && E({ mode: "reserve", reserve: String(mt.high) }).inRange, `${tag}: a reserve at either edge (${usd(mt.low)}, ${usd(mt.high)}) is inside`);
    ok(!E({ mode: "reserve", reserve: String(mt.low - 1) }).inRange && !E({ mode: "reserve", reserve: String(mt.high + 1) }).inRange, `${tag}: one dollar outside either edge is outside`);
    ok(E({ mode: "range", low: String(mt.low), high: String(mt.high) }).inRange && !E({ mode: "range", low: String(mt.low - 1), high: String(mt.high) }).inRange && !E({ mode: "range", low: String(mt.low), high: String(mt.high + 1) }).inRange, `${tag}: a range is inside only when both its ends are`);
    ok(E({ mode: "reserve", reserve: String(mt.low - 1) }).reasonsNeeded && !E({ mode: "reserve", reserve: String(mt.median) }).reasonsNeeded, `${tag}: the reasons are asked only when truly outside`);
    const used = E({ mode: "reserve", reserve: String(mt.low) }).range;
    ok(used && used.low === mt.low && used.high === mt.high, `${tag}: the evaluation names the range it used (the meter's)`);
    const withFig = evaluateDecision({ read, draft: { ...base, mode: "reserve", reserve: String(mt.high + 1) }, org: {}, priors: [], analystFigure: mt.high + 1 });
    ok(!withFig.inRange, `${tag}: the analyst figure does not widen the range`);
  }
  const thin = fixtureRead({ vin: V_PLAIN, tier: 4 }), tm0 = thin.market.meter; ok(thin.condition.tooFew && tm0.scope === "body", "the thin tier shows the body pool's meter");
  ok(evaluateDecision({ read: thin, draft: { ...base, mode: "reserve", reserve: String(Math.round((tm0.low + tm0.high) / 2)) }, org: {}, priors: [] }).inRange, "a reserve inside the range shown for a thin tier is not 'outside the market range'");
}

// ================= 4 THE ANALYST FIGURE AT THE ACTIONS LEVEL
{
  const store = memoryStore(), cx = { env: {}, org: "dr2a", seat: "crew", store, orgSettings: { name: "Org" }, fetchImage };
  const sh = await seed(store, { org: "dr2a", vin: V_PLAIN }); await handleSheetAction("sheet_open", { id: sh.id }, cx);
  let r = await handleSheetAction("sheet_save", { id: sh.id, patch: { tier: 2 } }, cx); const med = r.read.market.meter.median;
  ok(r.analyst && r.analyst.figure == null && r.analyst.median === med && /not set/.test(r.analyst.line), "before a figure the sheet says the analyst figure is not set, against the engine median");
  r = await handleSheetAction("sheet_save", { id: sh.id, baseVersion: r.sheet.version, patch: { analystFigure: med + 2000 } }, cx);
  ok(r.analyst.line === `Engine median ${usd(med)}. Analyst figure ${usd(med + 2000)} (plus).`, "the line reads: " + r.analyst.line);
  ok(r.read.market.meter.median === med , "the engine's median did not move");
  ok(r.sheet.state.mark && r.sheet.state.mark.mark === "plus" && /Analyst: tier 2 plus/.test(r.markLine), "above the median is a plus, and the tier line says so: " + r.markLine);
  r = await handleSheetAction("sheet_save", { id: sh.id, baseVersion: r.sheet.version, patch: { analystFigure: med - 1500 } }, cx);
  ok(/\(minus\)\.$/.test(r.analyst.line) && r.sheet.state.mark.mark === "minus", "below the median is a minus");
  r = await handleSheetAction("sheet_save", { id: sh.id, baseVersion: r.sheet.version, patch: { analystFigure: med } }, cx);
  ok(/\(at the median\)\.$/.test(r.analyst.line) && r.sheet.state.mark == null, "at the median is neither");
  r = await handleSheetAction("sheet_save", { id: sh.id, baseVersion: r.sheet.version, patch: { analystFigure: med + 3000 } }, cx);
  const r3 = await handleSheetAction("sheet_save", { id: sh.id, baseVersion: r.sheet.version, patch: { tier: 3 } }, cx);
  ok(r3.read.market.meter.median !== med && r3.sheet.state.analystFigure === med + 3000 && r3.analyst.line.startsWith(`Engine median ${usd(r3.read.market.meter.median)}`), "a new tier moves the engine's median and the line, the analyst's figure stays");
}

// ================= the page: photos, speed, meter, labels (Chrome)
const store = memoryStore(), calls = [], DELAY = 1200, M = {};
const D = await startDesk({ org: "dr2", store, calls, delayMs: DELAY, ctxExtra: { fetchImage } });
try {
  const sh = await seed(store, { org: "dr2", vin: V_SPLIT, photos: false });
  const p = await D.open(1440);
  const lit = (page, sel) => page.evaluate(s => new Promise(res => { const t0 = performance.now(), el = document.querySelector(s); el.click(); const poll = () => { const b = document.querySelector(s); if (b && b.classList.contains("on")) res(performance.now() - t0); else if (performance.now() - t0 > 5000) res(99999); else requestAnimationFrame(poll); }; poll(); }), sel);
  const workGone = page => page.evaluate(() => new Promise(res => { const t0 = performance.now(), poll = () => { if (!document.querySelector("[data-working]") && !document.querySelector("[data-loading]") && !document.querySelector("[data-photowork]")) res(performance.now() - t0); else if (performance.now() - t0 > 8000) res(99999); else requestAnimationFrame(poll); }; poll(); }));
  // 2 the sheet opens in ONE press, with a loading card at once
  await wait(300);
  const sel = `#l-queue [data-open="${sh.id}"]`;
  const t0 = await p.evaluate(s => new Promise(res => { const a = performance.now(); for (let k = 0; k < 3; k++) document.querySelector(s).click(); const poll = () => { if (document.querySelector("[data-loading]")) res(performance.now() - a); else if (performance.now() - a > 3000) res(99999); else requestAnimationFrame(poll); }; poll(); }), sel);
  M.openCard = Math.round(t0); ok(t0 < 100, `2 the sheet shows a loading card in ${Math.round(t0)} ms (under 100) on the first press`);
  await workGone(p); await wait(100);
  ok(calls.filter(c => c.action === "sheet_open" && c.id === sh.id).length === 1, "2 three presses on a loading sheet make ONE open");
  ok(await p.evaluate(() => !!document.querySelector("[data-sec]")), "2 the sheet is open after one press");
  // 1 photos: none yet, add at any time, two uploads in two steps
  ok(await p.evaluate(() => !!document.querySelector("[data-addphoto]")) && /no photos yet/i.test(await p.evaluate(() => document.querySelector('[data-sec="1"]').innerText)), "1 an open sheet with no photo offers Add photos");
  const input1 = await p.$("[data-addphoto]"); await input1.uploadFile(f1);
  await p.waitForFunction(() => document.querySelectorAll("[data-thumb]").length === 1, { timeout: 15000 }).catch(() => {}); await workGone(p);
  const n1 = await p.evaluate(() => document.querySelectorAll("[data-thumb]").length); ok(n1 === 1, "1 after the first upload the strip has 1 thumbnail (" + n1 + ")");
  const input2 = await p.$("[data-addphoto]"); await input2.uploadFile(f2);
  await p.waitForFunction(() => document.querySelectorAll("[data-thumb]").length === 2, { timeout: 15000 }).catch(() => {}); await workGone(p);
  const strip = await p.evaluate(() => ({ n: document.querySelectorAll("[data-thumb]").length, loaded: [...document.querySelectorAll("[data-thumb] img")].map(i => i.complete && i.naturalWidth > 0), cover: [...document.querySelectorAll("[data-thumb]")].map(t => t.classList.contains("cover")), sec: document.querySelector('[data-sec="1"]').innerText }));
  ok(strip.n === 2 && strip.loaded.length === 2 && strip.loaded.every(Boolean), "1 a second photo could be added afterwards: the strip shows 2 pictures that loaded (" + JSON.stringify(strip.loaded) + ")");
  ok(strip.cover[0] === true && strip.cover[1] === false && /2 photos, the first is the cover/i.test(strip.sec), "1 the first photo is the cover and the strip says '2 photos'");
  const saved = await store.get("dr2", sh.id); ok((saved.submission.photos || []).length === 2 && (saved.state.photosSelected || []).length === 2, "1 both photos are on the sheet and selected for the report");
  const cx = { env: {}, org: "dr2", seat: "crew", store, orgSettings: { name: "Org" }, fetchImage };
  const dp = await handleSheetAction("sheet_pdf", { id: sh.id, draft: true }, cx), pg = dp.ok ? stream(Buffer.from(dp.pdf_b64, "base64")) : [];
  ok(dp.ok && imgs(pg[0] || "") >= 1, "1 the PDF carries the cover photo on page 1 (" + imgs(pg[0] || "") + " image)");
  const carPage = pg.findIndex(s => /02  THE CAR/.test(s));
  ok(carPage > 0 && imgs(pg[carPage]) >= 2, "1 the car page carries the strip of both photos (" + (carPage >= 0 ? imgs(pg[carPage]) : "no car page") + " images)");
  await press(p, "[data-hero]"); await workGone(p); await wait(DELAY + 300);
  ok(await p.evaluate(() => { const t = [...document.querySelectorAll("[data-thumb]")]; return t.length === 2 && t[1].classList.contains("cover") && !t[0].classList.contains("cover"); }), "1 Make cover moves the cover");

  // 2 body pills and tier pills: highlight at once, working state, settle under 3 s
  const b1 = await lit(p, '[data-pick-val="coupe"]'); M.bodyLit = Math.round(b1); ok(b1 < 100, `2 the body pill lights in ${Math.round(b1)} ms (under 100) while the engine is slow`);
  ok(await p.evaluate(() => !!document.querySelector("[data-working]")), "2 a working state shows while the engine reads");
  const s1 = await workGone(p); M.bodySettle = Math.round(s1); ok(s1 < 3000, `2 the body pick settles in ${Math.round(s1)} ms (under 3000)`);
  const t1 = await lit(p, '[data-tier="2"]'); M.tierLit = Math.round(t1); ok(t1 < 100, `2 the tier pill lights in ${Math.round(t1)} ms (under 100)`);
  const s2 = await workGone(p); M.tierSettle = Math.round(s2); ok(s2 < 3000, `2 the tier pick settles in ${Math.round(s2)} ms (under 3000)`);
  const t3 = await lit(p, '[data-tier="3"]'); ok(t3 < 100, `2 tier 3 lights in ${Math.round(t3)} ms`); await workGone(p);
  await lit(p, '[data-tier="2"]'); await workGone(p);
  // 4 the meter is always visible; the marker starts at the engine median; dragging sets the figure
  const m = await p.evaluate(() => { const v = window.__deskVals.state.sheets[window.__deskVals.state.active].v; return { mt: v.read.market.meter, range: (document.querySelector(".mkr") || {}).value, sec3: document.querySelector('[data-sec="3"]').innerText, dots: document.querySelectorAll(".mdot").length }; });
  ok(m.mt && m.dots === m.mt.dots.length && Number(m.range) === m.mt.median && m.sec3.includes("Low " + usd(m.mt.low)) && m.sec3.includes("Median " + usd(m.mt.median)) && m.sec3.includes("High " + usd(m.mt.high)), "4 the meter shows low, median and high with every sale dotted, and the marker starts at the engine median");
  const target = m.mt.median + 2500;
  await p.evaluate(v => { const el = document.querySelector(".mkr"); el.value = String(v); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }, target);
  await workGone(p); await wait(DELAY + 300);
  const after = await p.evaluate(() => { const v = window.__deskVals.state.sheets[window.__deskVals.state.active].v; return { line: (document.querySelector("[data-mkline]") || {}).innerText || "", srv: v.analyst, med: v.read.market.meter.median, statement: (document.querySelector('[data-tierline="statement"]') || {}).innerText || "" }; });
  ok(after.srv.figure === target && after.med === m.mt.median && after.line.includes(after.srv.line) && /\(plus\)\./.test(after.line), "4 dragging sets the analyst figure, the engine median stays, the sheet prints the server's line: " + after.line.replace(/\s+/g, " "));
  ok(/^Engine: no suggestion\. Analyst: tier 2 plus\.$/.test(after.statement.replace(/\s+/g, " ").trim()), "8 after the pick the tier line reads 'Engine: no suggestion. Analyst: tier 2 plus.': " + after.statement);
  // 3 live now is the picked body only
  const live = await p.evaluate(() => (window.__deskVals.state.sheets[window.__deskVals.state.active].v.read.market.live || []).map(l => l.title));
  ok(live.length === 1 && /Coupe/.test(live[0]) && !/Cabriolet/.test(live[0]), "3 Live now for a Coupe pick is the Coupe's car only: " + live.join("; "));
  await lit(p, '[data-pick-val="open"]'); await workGone(p);
  const live2 = await p.evaluate(() => (window.__deskVals.state.sheets[window.__deskVals.state.active].v.read.market.live || []).map(l => l.title));
  ok(live2.length === 1 && /Cabriolet/.test(live2[0]), "3 and for a Cabriolet pick the Cabriolet's: " + live2.join("; "));
  // 5 a tier on a thin pool shows the body pool and the engine's line; the comparables follow
  await lit(p, '[data-tier="1"]'); await workGone(p);
  const th = await p.evaluate(() => { const v = window.__deskVals.state.sheets[window.__deskVals.state.active].v; return { basis: v.read.market.meter.scope, line: v.read.market.poolLine, sec3: document.querySelector('[data-sec="3"]').innerText, hl: document.querySelectorAll("tr.hl").length, tierN: v.read.market.meter.tierN, sec4: document.querySelector('[data-sec="4"]').innerText }; });
  ok(th.basis === "body" && /sales? of this body.* in tier 1, shown on the full set\.$/.test(th.line) && th.sec3.includes(th.line) && th.hl === th.tierN && !/no starting figure/i.test(th.sec3 + th.sec4), "5 a thin tier shows the body pool with the tier's sales highlighted: " + th.line);
  // 6 the page's chip against the meter
  await press(p, '[data-dmode="reserve"]'); await workGone(p);
  const edge = await p.evaluate(() => window.__deskVals.state.sheets[window.__deskVals.state.active].v.read.market.meter);
  const chipFor = async val => { await p.evaluate(v => { const el = document.querySelector('[data-k="d-reserve"]'); el.value = String(v); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }, val); await p.evaluate(() => window.__deskVals.settled()); await wait(DELAY + 300); return p.evaluate(() => (document.querySelector('[data-sec="6"] .chip') || {}).innerText || ""); };
  ok(/Inside/i.test(await chipFor(edge.low)) && /Inside/i.test(await chipFor(edge.high)) && /Outside/i.test(await chipFor(edge.low - 1)) && /Outside/i.test(await chipFor(edge.high + 1)), "6 the page's chip is inside at both edges of the meter's range and outside one dollar beyond");
  // 7 the question
  const s6 = await p.evaluate(() => document.querySelector('[data-sec="6"]').innerText);
  ok(/question for the seller \(prints on the report\)/i.test(s6) && /prints on the decision page of the report/i.test(s6) && !/Pinned question/i.test(s6), "7 the pinned question is 'Question for the seller (prints on the report)' with a one line hint");
  ok(p._errs.length === 0, "no page error (" + p._errs.join("; ").slice(0, 120) + ")");

  // 8 before any tier, the engine's own line (a fresh sheet, no listing for this car); the meter is visible with no tier picked
  const sh2 = await seed(store, { org: "dr2", vin: V_PLAIN, photos: false });
  await press(p, `#l-queue [data-open="${sh2.id}"]`).catch(() => {});
  await p.evaluate(() => window.__deskVals.open && 0);
  await wait(300);
  await p.evaluate(id => window.__deskVals.open(id), sh2.id); await wait(DELAY + 400); await workGone(p);
  const pre = await p.evaluate(() => ({ line: (document.querySelector('[data-tierline="engine"]') || {}).innerText || "", all: document.querySelector('[data-sec="4"]').innerText }));
  ok(pre.line === "No listing for this car in the record, so the engine suggests no tier. Pick the tier the photos show." && !/analyst's call/.test(pre.all), "8 before a tier is picked the sheet prints the engine's line: " + pre.line);
  ok(await p.evaluate(() => !!document.querySelector(".meter .mkr") && document.querySelectorAll(".mdot").length > 5), "4 the meter is visible before any tier is picked, on a plain pool as well");
} finally { await D.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
console.log(`measured (server held back ${DELAY} ms): loading card ${M.openCard} ms, body pill lit ${M.bodyLit} ms, body settled ${M.bodySettle} ms, tier pill lit ${M.tierLit} ms, tier settled ${M.tierSettle} ms`);
console.log(`deskDryrun2Check: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
