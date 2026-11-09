// Desk v3 stage 2: a finalized version is immutable; a later edit makes version n plus 1. Through the real actions and store. node scripts/deskVersionCheck.mjs [rootDir]
import path from "node:path"; import { pathToFileURL } from "node:url"; import { setup } from "./_deskCaseWorld.mjs";
const root = path.resolve(process.argv[2] || "."), { K, M, readyCase, T, w } = await setup(root);
const A = await import(pathToFileURL(path.join(root, "lib/desk/sheetActions.js")).href), { memoryStore } = await import(pathToFileURL(path.join(root, "lib/desk/sheetStore.js")).href);
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) pass++; else { fail++; console.log("FAIL " + n + (d ? "  " + d : "")); } };
const store = memoryStore(), ctx = { org: "t", seat: "crew", store, now: T, env: w.env, deps: w.deps }, J = x => JSON.stringify(x);
const c = await readyCase();
await store.insert("t", { id: "s1", owner_seat: "crew", status: "In progress", created_at: T, submission: { typed: true, photos: [], documents: [] }, state: {}, case: c, version: 1 });
const fin = await A.handleSheetAction("case_finalize", { id: "s1" }, ctx);
ok("a ready case finalizes: version 1, status finalized", fin.ok && fin.version === 1 && fin.case.status === "finalized", J(fin).slice(0, 200));
const v1 = (await A.handleSheetAction("case_version", { id: "s1" }, ctx)).row, v1bytes = J(v1);
ok("the version row carries figures, evidence, original, comparables, verification and wording slot", v1.figures.assessment.figure > 0 && v1.figures.reserve.figure > 0 && v1.evidence.median > 0 && v1.original && v1.comparables.length === 1 && v1.verification.mileage.verified === true && "wording" in v1);
ok("finalizing a finalized case is refused by the rule itself, before the store is asked", K.finalize(fin.case, { now: T }).ok === false);
ok("a finalized case cannot be finalized twice", (await A.handleSheetAction("case_finalize", { id: "s1" }, ctx)).refused === true);
// THE OLD FIELDS MIRROR THE ROW
{ const sh = await store.get("t", "s1");
  ok("finalizing also sets the old status Finalised and a report number", sh.status === "Finalised" && /^DV-\d{4}-\d{4}$/.test(sh.final.reportNumber));
  ok("sheet.final mirrors the version row: the reserve, the range and the analyst figure are the row's", sh.final.decision.reserve === String(v1.figures.reserve.figure) && sh.final.decision.low === String(v1.figures.assessment.low) && sh.final.decision.high === String(v1.figures.assessment.high) && sh.final.analystFigure === v1.figures.assessment.figure && sh.final.v3Version === 1 && sh.final.finalisedAt === v1.finalized_at);
  ok("the sheet carries a read, so the database's finalised check (engine_read, decision) holds", sh.read && sh.read.frozen === true && sh.final.decision && sh.read.desk.evidence.median === v1.evidence.median);
  await store.put("t", { ...sh, final: { ...sh.final, analystFigure: 1, decision: { ...sh.final.decision, reserve: "1" } } });
  ok("the row is the source: changing the old fields leaves the version row as it was", J((await A.handleSheetAction("case_version", { id: "s1" }, ctx)).row) === v1bytes);
  await store.put("t", sh); }
// any later edit makes version 2, as a revision sheet that corrects the finalized one (a finalized sheet is locked in the database); version 1 and its sheet are never touched
const sheet1bytes = J(await store.get("t", "s1"));
const edits = [["field", { field: "colour", value: "Black" }], ["assessment", { patch: { figure: v1.figures.assessment.figure - 100 } }], ["reserve", { patch: { figure: v1.figures.reserve.figure - 500 } }], ["comparables", { ids: [] }]];
let first = true, revId = null;
for (const [op, extra] of edits) {
  const r = await A.handleSheetAction("case_edit", { id: first ? "s1" : revId, op, ...extra }, ctx);
  if (first) { revId = r.id; ok("the first edit after finalizing makes a revision sheet that corrects the finalized one", r.ok && r.revisedFrom === "s1" && r.id !== "s1" && (await store.get("t", revId)).corrects === "s1", J(r).slice(0, 160)); }
  ok(`edit "${op}" after finalizing: version 2, back in review or ready`, r.ok && r.case.version === 2 && r.case.status !== "finalized", J(r).slice(0, 160));
  const now1 = (await A.handleSheetAction("case_version", { id: "s1", version: 1 }, ctx)).row;
  ok(`after "${op}" version 1 is byte for byte the same, and so is its sheet`, J(now1) === v1bytes && J(await store.get("t", "s1")) === sheet1bytes); first = false;
}
ok("editing the revision again makes no third sheet and no version 3", (await store.list("t")).filter(x => x.corrects === "s1").length === 1);
ok("version 2 is not written until it is finalized", (await A.handleSheetAction("case_version", { id: revId }, ctx)).version === 1);
{ const rec = (await store.get("t", revId)).case; await A.handleSheetAction("case_edit", { id: revId, op: "comparables", ids: [c.desk.comparables.find(x => x.inPopulation).id] }, ctx);
  const f2 = await A.handleSheetAction("case_finalize", { id: revId }, ctx); ok("version 2 finalizes as version 2, with its own report number", f2.ok && f2.version === 2 && f2.reportNumber !== fin.reportNumber, J(f2).slice(0, 200));
  const vs = await A.handleSheetAction("case_version", { id: revId }, ctx); ok("both versions are in the chain, in order, the latest first to read", J(vs.versions) === "[1,2]" && vs.row.version === 2);
  ok("version 1 is still untouched after version 2 is written", J((await A.handleSheetAction("case_version", { id: "s1", version: 1 }, ctx)).row) === v1bytes);
  const q = (await A.handleSheetAction("case_get", { id: revId }, ctx)).case.queue; ok("the queue counts the revision once: the superseded sheet is not a second case", q.final === 1);
  ok("the revised report is counted", (await A.handleSheetAction("case_get", { id: revId }, ctx)).case.handling.lines[3].value === "1"); }
// the store refuses to overwrite a version
{ let threw = false; try { await store.putCaseVersion("t", "s1", { version: 1, figures: {} }); } catch { threw = true; } ok("the store refuses to write a version that exists", threw); }
// a case that is not ready is refused with its blockers
{ await store.insert("t", { id: "s2", owner_seat: "crew", status: "New", created_at: T, submission: { typed: true, photos: [], documents: [] }, state: {}, case: M.newCase({ now: T }), version: 1 });
  const r = await A.handleSheetAction("case_finalize", { id: "s2" }, ctx); ok("a case that is not ready is refused with its blockers and no version is written", r.refused && r.blockers.length > 0 && (await A.handleSheetAction("case_version", { id: "s2" }, ctx)).refused === true); }
console.log(`deskVersionCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
