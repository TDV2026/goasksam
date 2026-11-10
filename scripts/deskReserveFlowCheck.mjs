// Desk v4 stage 1: the recommended reserve is the case's one decision figure. It starts at the engine's start (desk.reserveStart) with the engine's why (desk.whyDraft), follows the engine until the analyst changes it once, is checked by the ENGINE
// (desk.reserveCheck, asked with this very figure), and the period (6, 12 or 24 months) is an engine input. Nothing here compares a reserve to a range: the position and the reached line are the engine's sentences. node scripts/deskReserveFlowCheck.mjs [rootDir]
import path from "node:path"; import fs from "node:fs"; import { pathToFileURL } from "node:url"; import { setup } from "./_deskCaseWorld.mjs";
const root = path.resolve(process.argv[2] || "."), { M, K, read, calls, readyCase, T, today } = await setup(root), imp = f => import(pathToFileURL(path.join(root, f)).href);
const A = await imp("lib/desk/sheetActions.js"), { memoryStore } = await imp("lib/desk/sheetStore.js");
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) pass++; else { fail++; console.log("FAIL " + n + (d ? "  " + d : "")); } }; const J = x => JSON.stringify(x);
const store = memoryStore(), ctx = (m = 0) => ({ org: "t", seat: "7", store, now: new Date(Date.parse(T) + m * 60000).toISOString(), env: {}, readSheet: async (e, input) => read(input), fetchImage: async () => null });
const run = (a, b, m) => A.handleSheetAction(a, b, ctx(m));
// 1. a new case takes the engine's start and its why, and the engine has checked that very figure
const nw = await run("case_new", { text: "1999 Porsche 911 Carrera", mileage: "61,200", transmission: "Manual", body: "Coupe" });
const d0 = nw.case.desk, r0 = nw.case.reserve;
ok("a new case's reserve is the engine's start, from the engine", nw.ok && d0.reserveStart && r0.figure === d0.reserveStart.figure && r0.source === "engine", J(r0).slice(0, 160));
ok("its why is the engine's draft, and it is not the analyst's", r0.whyEdited === false && r0.why === (d0.whyDraft || ""), J([r0.why, d0.whyDraft]));
ok("the engine has checked that very figure: reserveCheck.reserve is the reserve, and the lines ride on the reserve", d0.reserveCheck && d0.reserveCheck.reserve === r0.figure && r0.positionLine === d0.reserveCheck.positionLine && r0.reachedLine === d0.reserveCheck.reachedLine && r0.check.reserve === r0.figure);
ok("the stored key is the key of the case as it stands (no third read is owed)", !K.needsRecall(await (async () => (await store.get("t", nw.id)).case)()));
ok("the start line rides on the reserve for the page", r0.start && r0.start.figure === r0.figure && typeof r0.start.sentence === "string");
// 2. the period is an engine input: the read carries it, the evidence is the engine's window, the engine's own figure follows
const n1 = calls.length, w6 = await run("case_edit", { id: nw.id, op: "window", months: 6 }, 1);
ok("the period op re-calls the engine with windowMonths 6 and answers the case with the engine's six months", w6.ok && w6.recalled === true && calls.slice(n1).every(x => x.desk.windowMonths === 6) && w6.case.windowMonths === 6 && w6.case.desk.evidence.windowMonths === 6, J(w6).slice(0, 160));
ok("the engine-sourced reserve followed the new period to the engine's new start, and the check is of that figure", w6.case.reserve.source === "engine" && w6.case.reserve.figure === w6.case.desk.reserveStart.figure && w6.reserveCheck && w6.reserveCheck.reserve === w6.case.reserve.figure);
ok("the answer carries reserveCheck and reserveStart at the top for the page", w6.reserveCheck && w6.reserveStart && w6.reserveStart.figure === w6.case.reserve.figure);
ok("a period that is not 6, 12 or 24 is refused, and the case is unchanged", (await run("case_edit", { id: nw.id, op: "window", months: 9 }, 2)).refused === true && (await store.get("t", nw.id)).case.windowMonths === 6);
const n2 = calls.length, same = await run("case_edit", { id: nw.id, op: "window", months: 6 }, 2);
ok("the same period again costs no read", same.ok && calls.length === n2 && same.recalled === false);
for (const m of [24, 12]) { const w = await run("case_edit", { id: nw.id, op: "window", months: m }, 3); ok(`period ${m}: the case holds the engine's ${m} months`, w.ok && w.case.windowMonths === m && w.case.desk.evidence.windowMonths === m && w.case.reserve.figure === w.case.desk.reserveStart.figure); }
// 3. a typed figure is the analyst's: the engine checks it, no read moves it, its lines are the engine's
const ev = (await store.get("t", nw.id)).case.desk.evidence, typed = ev.q3 + 4000, nT = calls.length;
const t1 = await run("case_edit", { id: nw.id, op: "reserve", patch: { figure: typed } }, 4);
ok("a typed reserve re-calls the engine once with that figure", t1.ok && t1.recalled === true && calls.length - nT === 1 && calls[calls.length - 1].desk.reserve === typed);
ok("it is the analyst's and the engine has checked it: above the typical range, not supported", t1.case.reserve.source === "analyst" && t1.case.reserve.figure === typed && t1.reserveCheck.reserve === typed && t1.reserveCheck.position === "above" && t1.reserveCheck.supported === false, J(t1.reserveCheck));
ok("the position and reached lines are the engine's, character for character", t1.case.reserve.positionLine === t1.reserveCheck.positionLine && t1.case.reserve.reachedLine === t1.reserveCheck.reachedLine && /sales reached this figure/.test(t1.case.reserve.reachedLine));
ok("an unsupported reserve blocks finalizing until it is marked as the seller's request", t1.readiness.blockers.some(b => b.key === "reserve_support"));
const sr = await run("case_edit", { id: nw.id, op: "reserve", patch: { sellerRequested: true } }, 5);
ok("marking it the seller's request lifts that blocker, costs no read, and logs one audit line", sr.ok && sr.recalled === false && !sr.readiness.blockers.some(b => b.key === "reserve_support") && sr.case.reserve.sellerRequested === true && sr.case.audit.filter(a => a.what === "reserve seller request").length === 1);
const wA = await run("case_edit", { id: nw.id, op: "window", months: 24 }, 6);
ok("a later period does not move the analyst's figure, and the engine checks it again for the new period", wA.case.reserve.figure === typed && wA.case.reserve.source === "analyst" && wA.reserveCheck.reserve === typed && wA.case.reserve.sellerRequested === true);
// 4. the why: the analyst's edit is theirs and no read reseeds it
const wy = await run("case_edit", { id: nw.id, op: "reserve", patch: { why: "The seller asked for this figure." } }, 7);
const wB = await run("case_edit", { id: nw.id, op: "window", months: 12 }, 8);
ok("an edited why is the analyst's: it costs no read and a later period leaves it", wy.recalled === false && wy.case.reserve.whyEdited === true && wB.case.reserve.why === "The seller asked for this figure." && wB.case.reserve.rationale === wB.case.reserve.why);
// 5. back to the engine's start
const bk = await run("case_edit", { id: nw.id, op: "reserve", patch: { restart: true } }, 9);
ok("restart puts the engine's start and its why back, the figure is the engine's again and checked", bk.ok && bk.case.reserve.source === "engine" && bk.case.reserve.figure === bk.case.desk.reserveStart.figure && bk.case.reserve.whyEdited === false && bk.case.reserve.why === (bk.case.desk.whyDraft || "") && bk.case.reserve.sellerRequested === false && bk.reserveCheck.reserve === bk.case.reserve.figure);
ok("every reserve change leaves an audit line in the table's words, none typed", bk.case.audit.filter(a => /^reserve /.test(a.what)).length >= 3 && bk.case.audit.filter(a => /^reserve /.test(a.what)).every(a => a.line && !/^Something/.test(a.line)) && /recommended reserve/.test(bk.case.audit.filter(a => /^reserve /.test(a.what)).map(a => a.line).join(" ")));
// 6. a case stored before V4 (figure and rationale only) keeps its figure as the analyst's and is never reseeded
{ const old = await readyCase(); old.reserve = { figure: 30000, rationale: "Old note.", seller_agreed: false }; delete old.windowMonths; old.desk = { ...old.desk, key: "stale" };
  const rr = await K.refreshEvidence(old, read, { caseDate: today, now: T }), r = K.reserveOf(rr.case);
  ok("an old case's figure is the analyst's, its rationale is the why, and the engine's start never replaces them", r.figure === 30000 && r.source === "analyst" && r.why === "Old note." && r.whyEdited === true && rr.case.desk.reserveCheck.reserve === 30000); }
// 7. THE CLASS: whichever period, condition tier and reserve, the case's position is the engine's answer for that figure, never a comparison made here
{ let n = 0, bad = [];
  for (const months of [6, 12, 24]) for (const tier of [null, 2, 3, 4]) for (const f of [null, "lo", "hi"]) {
    let c = await readyCase(); c = K.setWindow(c, months, T) || c; c = K.setCondition(c, tier ? { tier, name: "x" } : null, T); c = (await K.refreshEvidence(c, read, { caseDate: today, now: T })).case;
    const e = c.desk.evidence, fig = f === "lo" && e.q1 != null ? e.q1 - 1 : f === "hi" && e.q3 != null ? e.q3 + 1 : null; if (f && fig == null) continue;
    if (f) { c = K.setReserve(c, { figure: fig }, T); c = (await K.refreshEvidence(c, read, { caseDate: today, now: T })).case; } n++;
    const ck = c.desk.reserveCheck, pos = K.reservePosition(c), r = K.reserveOf(c);
    if (r.figure != null && !(ck && ck.reserve === r.figure)) bad.push(`${months}/${tier}/${f}: no check of ${r.figure}`);
    if (ck && ck.reserve === r.figure && pos !== (ck.position || null)) bad.push(`${months}/${tier}/${f}: position ${pos} is not the engine's ${ck.position}`);
    if (c.desk.evidence.windowMonths !== months) bad.push(`${months}/${tier}/${f}: evidence is ${c.desk.evidence.windowMonths} months`);
    if (r.source === "engine" && c.desk.reserveStart && r.figure !== c.desk.reserveStart.figure) bad.push(`${months}/${tier}/${f}: engine figure is not the engine's start`);
    if (K.needsRecall(c)) bad.push(`${months}/${tier}/${f}: the stored key is stale`); }
  ok(`${n} period, tier and reserve states: the check is the engine's for the figure the case holds, the position is its answer, the evidence is its window`, n >= 20 && bad.length === 0, bad.slice(0, 3).join("; ")); }
// 7b. THE ENGINE'S WORD WINS: a case whose stored check says another position than the arithmetic would is read as the engine said it (nothing is recomputed), and a figure the engine has not checked is not support
{ const c = await readyCase(), e = c.desk.evidence, inside = Math.round((e.q1 + e.q3) / 2), x = K.setReserve(c, { figure: inside }, T); x.desk = { ...x.desk, reserveCheck: { reserve: inside, position: "above", positionLine: "The engine's own sentence.", reachedLine: "The engine's reached sentence.", supported: false } };
  ok("the position is the stored engine word, whatever the arithmetic says", K.reservePosition(x) === "above" && K.readinessOf(x).blockers.some(b => b.key === "reserve_support"));
  const y = K.setReserve(c, { figure: inside + 11 }, T); ok("a figure the engine has not checked yet has no position and is not support", K.reservePosition(y) === null && K.readinessOf(y).blockers.some(b => b.key === "reserve_support")); }
// 8. NO FILE MAKES THE COMPARISON: a reserve is never set against q1 or q3 outside the engine
{ const files = ["lib/desk/caseWorkflow.js", "lib/desk/reportState.js", "lib/desk/caseView.js", "lib/desk/sheetActions.js", "lib/preview/deskV3.js"], hits = [];
  for (const f of files) { const t = fs.readFileSync(path.join(root, f), "utf8").split("\n"); t.forEach((l, i) => { const code = l.replace(/\/\/.*$/, ""); if (/[<>]=?\s*[\w.]*\.(q1|q3)\b|\.(q1|q3)\b\s*[<>]=?/.test(code)) hits.push(f + ":" + (i + 1)); }); }
  ok("no Desk file sets a reserve against the typical range (the position comes from desk.reserveCheck)", hits.length === 0, hits.join(", ")); }
console.log(`deskReserveFlowCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
