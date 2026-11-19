// DESK V3 DECISION (Lane E, Nov 8 2026): the Decision tab on Lane D's fields. Market reference, assessment and difference side by side; numeric input first, range inputs, the slider second and keyboard driven; the explanation; the reserve with its
// position line, rationale and seller agreed box; condition as a segmented control with the suggested rung dotted and the basis sentence; factors from desk.factors (effectSentence only when present, the verification state); readiness from Lane D;
// Finalize disabled until ready; the audit trail. THE RESERVE NEVER MOVES WHEN THE ASSESSMENT MOVES: no code on the page couples them, and each save posts its own figure only.   node scripts/deskV3DecisionCheck.mjs
import { demoHtml, V3, FX, RW, launch, openPage, tally } from "./deskV3Harness.mjs";
import * as W from "../lib/desk/caseWorkflow.js";
const { ok, done } = tally(), kase = await FX.demoCaseRecord();
const page = k => V3.pageHtml({ cases: [{ id: "x", car: "1999 Porsche 911 Carrera", spec: "", seller: "S", ref: "x", age: "1 d", submitted: "2026-11-08", status: "New", group: "new", photo: null, demo: true }], activeId: "x", kase: k, sheet: null });
const dec = h => (h.match(/<div class="dec">[\s\S]*?<\/div><\/div>\s*<\/div>\s*<\/main>|<div class="dec">[\s\S]*$/) || [""])[0];
// a ready case, built only through Lane D's own writers
const now = new Date().toISOString(); let rk = structuredClone(kase);
const EV = kase.desk.evidence;   // the analyst's figures are taken from the engine's own read of the case (nothing typed from a sample world)
rk = W.setAssessment(rk, { figure: EV.median, low: EV.q1, high: EV.q3, explanation: "Matches the median of the manual sales, with the mileage close to the car's own." }, now); rk = W.setReserve(rk, { figure: EV.q1, rationale: "Held at the low end of the typical range so the car clears at auction." }, now);
rk = (await W.refreshEvidence(rk, (await import("../lib/preview/recordedRead.js")).recordedRead, { caseDate: now.slice(0, 10), now })).case;   // the engine checks the reserve (reserveCheck): support is its answer
rk = W.verify(W.verify(W.correctField(rk, "accident_history", "No accidents reported", { now }), "mileage", { now }), "accident_history", { now }); rk = W.setNeed(rk, "service_documents", "waived", "Invoices requested"); rk = W.selectComparables(rk, rk.desk.comparables.filter(x => x.url).slice(0, 2).map(x => x.id), now); rk.condition = { suggested: { tier: 3, name: "Good" }, selected: { tier: 3, name: "Good" } };
rk.audit = [{ at: "2026-11-08T10:00:00Z", by: "Expert 1", what: "corrected", field: "colour", from: "Arctic Silver", to: "Guards Red" }];
const rd = W.readinessOf(rk);
function assertions(k, h, ready) {
  const bad = [], d = dec(h), ev = k.desk.evidence, a = k.assessment || {}, r = k.reserve;
  if (!d) return ["no decision tab"];
  const at = x => d.indexOf(x);
  const mr = at('<span class="fg-k">Market reference'), as = at('<span class="fg-k">Valuation'), df = at('<span class="fg-k">Difference');
  if (!(mr >= 0 && as > mr && df > as && df < at("in-afigure"))) bad.push("market reference, assessment and difference are not side by side first");
  if (!(at('id="in-afigure"') >= 0 && at('id="in-afigure"') < at('id="in-alow"') && at('id="in-alow"') < at('id="in-ahigh"') && at('id="in-ahigh"') < at('id="in-aexp"')) && at('id="sl-a"') < 0) bad.push("the Valuation order is not numeric input, range, explanation (the marker on the bar is the slider now)");
  if (!(at('id="in-reserve"') >= 0 && at('id="in-reserve"') < at('id="sl-r"') && at('id="sl-r"') < at('id="in-rrat"') && at('id="in-rrat"') < at('id="in-agreed"'))) bad.push("the reserve order is not numeric input, slider, rationale, seller agreed");
  if (!/<textarea id="in-aexp"/.test(d) || !/<textarea id="in-rrat"/.test(d)) bad.push("explanation or rationale is not a textarea");
  const segs = [...d.matchAll(/class="seg-b( sug)?" data-cond="(\d)"/g)]; if (segs.length !== 4) bad.push("the condition control has " + segs.length + " rungs");
  const sug = k.condition && k.condition.suggested; if (sug) { const t = String(sug.tier != null ? sug.tier : sug), dotted = segs.filter(x => x[1]).map(x => x[2]); if (dotted.join() !== t) bad.push("the suggested rung is not the one dotted (" + dotted + " v " + t + ")"); } else if (segs.some(x => x[1])) bad.push("a rung is dotted with no suggestion");
  if (k.desk.condition && k.desk.condition.basis && !d.includes(k.desk.condition.basis)) bad.push("the condition basis sentence is missing");
  for (const f of k.desk.factors || []) { const li = new RegExp(`<li class="fc" data-factor="${f.key}">[\\s\\S]*?</li>`).exec(d); if (!li) { bad.push("factor " + f.key + " missing"); continue; } const has = li[0].includes('class="fc-e"'); if (!!f.effectSentence !== has) bad.push(`factor ${f.key}: effect sentence ${f.effectSentence ? "missing" : "printed with none sent"}`); if (f.effectSentence && !li[0].includes(f.effectSentence)) bad.push(`factor ${f.key}: not the engine's sentence`); if (f.verification && !li[0].includes(V3.VERIFY_LABEL[f.verification])) bad.push(`factor ${f.key}: no verification state`); }
  const blockers = W.readinessOf(k).blockers; for (const b of blockers) if (!d.includes(`data-blocker="${b.key}"`) || !d.includes(b.why)) bad.push("readiness item missing: " + b.key); if ((d.match(/data-blocker=/g) || []).length !== blockers.length) bad.push("readiness lists items that are not blockers");
  const fin = /id="b-fin"( disabled)?/.exec(d); if (!fin) bad.push("no Finalize"); else if (!!fin[1] === ready) bad.push(ready ? "Finalize is disabled on a ready case" : "Finalize is enabled before Lane D says ready");
  if (!/id="b-save"/.test(d) || !/id="b-prev"/.test(d)) bad.push("Save draft or Preview report missing");
  for (const x of k.audit || []) if (!d.includes(x.at) || !d.includes(x.line || x.what)) bad.push("an audit line is missing"); if (!(k.audit || []).length && /Audit trail/.test(d)) bad.push("an audit heading with no lines");
  if (!/id="in-agreed" type="checkbox"( checked)?/.test(d)) bad.push("no seller agreed box");
  return bad;
}
ok(rd.ready === true, "the fixture ready case is ready by Lane D's own readiness (" + JSON.stringify(rd.blockers) + ")");
{ const b = assertions(kase, page(kase), false); for (const x of b) ok(false, "demo: " + x); ok(!b.length, "the Decision tab on the demonstration case: order, controls, factors, readiness, Finalize disabled"); }
{ const b = assertions(rk, page(rk), true); for (const x of b) ok(false, "ready: " + x); ok(!b.length, "on a ready case Finalize is enabled, the suggested rung is dotted and the audit trail prints"); }
// in Chrome
{ const br = await launch(), p = await openPage(br, await demoHtml(), 1440, 900), posts = []; p.on("request", r => { if (r.method() === "POST") { try { posts.push(JSON.parse(r.postData() || "{}")); } catch {} } });
  await p.evaluate(() => document.querySelector('[data-tab="decision"]').click());
  const before = await p.$eval("#in-reserve", e => e.value); await p.$eval("#in-afigure", e => { e.value = ""; }); await p.type("#in-afigure", "33000"); const after = await p.$eval("#in-reserve", e => e.value); ok(before === after, "typing an assessment does not move the reserve input (" + before + " v " + after + ")");
  // THE MARKER (Sam, Nov 9): the analyst's marker on the bar is draggable and the big number follows it at once (before any round trip); typing the number moves the marker; both write the valuation alone through case_edit, debounced.
  await p.evaluate(() => document.querySelector('[data-tab="vehicle"]').click()); posts.length = 0;
  const mk = await p.$("#sum .mk-val"); ok(!!mk, "the bar carries the analyst's marker"); const bx = await mk.boundingBox(), big0 = await p.$eval("#valBig", e => e.textContent), left0 = await p.$eval("#sum .mk-val", e => e.style.left);
  await p.mouse.move(bx.x + bx.width / 2, bx.y + 12); await p.mouse.down(); await p.mouse.move(bx.x + bx.width / 2 + 90, bx.y + 12, { steps: 4 });
  const dragged = await p.evaluate(() => ({ big: document.getElementById("valBig").textContent, left: document.querySelector("#sum .mk-val").style.left, input: document.getElementById("in-afigure").value, posts: 0 })); await p.mouse.up();
  ok(dragged.big !== big0 && dragged.left !== left0, "a drag moves the big number and the marker at once, before any round trip (" + big0 + " to " + dragged.big + ")");
  ok(dragged.big.replace(/[^\d]/g, "") === dragged.input, "the typed input follows the drag (" + dragged.big + " v " + dragged.input + ")");
  await new Promise(r => setTimeout(r, 700)); const dp = posts.filter(x => x.action === "case_edit"); ok(dp.length >= 1 && dp.every(x => x.op === "assessment" && Object.keys(x.patch).join() === "figure") && String(dp[dp.length - 1].patch.figure) === dragged.input, "the drag writes the valuation alone through case_edit, debounced, with the figure the page showed (" + JSON.stringify(dp.map(x => x.patch)) + ")");
  ok(!posts.some(x => x.op === "reserve"), "a valuation change writes no reserve");
  await p.evaluate(() => document.querySelector('[data-tab="decision"]').click()); await p.$eval("#in-afigure", e => { e.value = ""; }); await p.type("#in-afigure", "30000"); await new Promise(r => setTimeout(r, 100));
  const typed = await p.evaluate(() => { const b = document.querySelector("#sum .bar3"), m = document.querySelector("#sum .mk-val"); return { lo: Number(b.dataset.lo), hi: Number(b.dataset.hi), left: parseFloat(m.style.left), big: document.getElementById("valBig").textContent }; });
  ok(Math.abs(typed.left - (30000 - typed.lo) / (typed.hi - typed.lo) * 100) < 0.6 && typed.big.replace(/[^\d]/g, "") === "30000", "a typed figure moves the marker to its place on the bar and the big number (" + typed.left + "% of " + typed.lo + " to " + typed.hi + ")");
  const afterKey = { r: before, a: "30000" };
  await p.focus("#sl-r"); await p.keyboard.press("ArrowLeft"); const rv = await p.evaluate(() => ({ r: document.getElementById("in-reserve").value, a: document.getElementById("in-afigure").value })); ok(rv.a === afterKey.a && rv.r !== before, "the reserve slider moves the reserve by keyboard and not the assessment (" + rv.a + ", reserve " + rv.r + ")");
  await p.click("#b-save"); await new Promise(r => setTimeout(r, 250)); const ops = posts.filter(x => x.action === "case_edit"); const A = ops.filter(x => x.op === "assessment").pop(), R = ops.find(x => x.op === "reserve");
  ok(!!A && !!R && !("reserve" in A.patch) && !("figure" in A.patch && "rationale" in A.patch) && "figure" in R.patch && !("low" in R.patch), "Save draft posts the assessment op with the assessment's own fields and the reserve op with the reserve's own (" + JSON.stringify(ops.map(o => o.op)) + ")");
  ok(A && String(A.patch.figure) === afterKey.a && R && String(R.patch.figure) === rv.r, "each op carries its own input's value");
  ok(await p.$eval("#b-fin", b => b.disabled), "Finalize is disabled while Lane D's readiness lists blockers");
  posts.length = 0; await p.click('[data-cond="2"]'); await new Promise(r => setTimeout(r, 200)); const c = posts.find(x => x.op === "condition"); ok(!!c && c.selected && c.selected.tier === 2 && c.selected.name === "Excellent", "a condition rung posts case_edit condition with its tier and name (" + JSON.stringify(c && c.selected) + ")");
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), "no overflow at 1440"); await p.setViewport({ width: 390, height: 800 }); await new Promise(r => setTimeout(r, 200)); ok(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), "no overflow at 390"); await br.close(); }
// mutants
const M = [["Finalize always enabled", k => [k, h => h.replace(/(id="b-fin") disabled/, "$1"), false]],
  ["an effect sentence typed where none was sent", k => [k, h => h.replace(/(<li class="fc" data-factor="owners">[\s\S]*?<\/b>)/, '$1<span class="fc-e">Owners add value.</span>'), false]],
  ["the suggested rung not dotted", k => [rk, h => h.replace('class="seg-b sug"', 'class="seg-b"'), true]],
  ["a readiness item dropped", k => [k, h => h.replace(/<li data-blocker="[^"]*">[^<]*<\/li>/, ""), false]],
  ["the audit trail dropped", k => [rk, h => h.replace(/<section class="dsec" id="dc-aud"><h2>Audit trail[\s\S]*?<\/section>/, ""), true]],
  ["the seller agreed box dropped", k => [k, h => h.replace(/<label class="chk">[\s\S]*?<\/label>/, ""), false]]];
for (const [n, fn] of M) { const [k, mut, ready] = fn(kase); ok(assertions(k, mut(page(k)), ready).length > 0, "mutant caught: " + n); }
// the page couples nothing: a coupling in the script is caught
{ const h = await demoHtml(), coupled = h.replace("function setVal(v,fromInput){", 'function setVal(v,fromInput){$("in-reserve").value=v;'); const br = await launch(), p = await openPage(br, coupled, 1440, 900);
  await p.evaluate(() => document.querySelector('[data-tab="decision"]').click()); const r0 = await p.$eval("#in-reserve", e => e.value); await p.$eval("#in-afigure", e => { e.value = ""; }); await p.type("#in-afigure", "61000"); ok((await p.$eval("#in-reserve", e => e.value)) !== r0, "mutant caught: a script that moves the reserve with the valuation (the reserve check above would fail)"); await br.close(); }
// two more mutants: a drag that does not update the figure, a typed figure that does not move the marker
for (const [n, from, to, act] of [["a drag that does not update the figure", "setVal(window.__deskBar.valueAt(e.clientX))", "window.__deskBar.valueAt(e.clientX)", "drag"], ["a typed figure that does not move the marker", "if(v>0)setVal(v,true)", "if(v>0)write(v)", "type"]]) {
  const h = await demoHtml(), mut = h.replace(from, to); ok(mut !== h, "mutant applies: " + n); const br = await launch(), p = await openPage(br, mut, 1440, 900); await p.evaluate(() => document.querySelector('[data-tab="vehicle"]').click());
  const big0 = await p.$eval("#valBig", e => e.textContent), left0 = await p.$eval("#sum .mk-val", e => e.style.left);
  if (act === "drag") { const bx = await (await p.$("#sum .mk-val")).boundingBox(); await p.mouse.move(bx.x + bx.width / 2, bx.y + 12); await p.mouse.down(); await p.mouse.move(bx.x + bx.width / 2 + 90, bx.y + 12, { steps: 4 }); await p.mouse.up(); ok((await p.$eval("#valBig", e => e.textContent)) === big0, "mutant caught: " + n); }
  else { await p.evaluate(() => document.querySelector('[data-tab="decision"]').click()); await p.$eval("#in-afigure", e => { e.value = ""; }); await p.type("#in-afigure", "30000"); ok((await p.$eval("#sum .mk-val", e => e.style.left)) === left0, "mutant caught: " + n); }
  await br.close(); }
done("deskV3DecisionCheck");
