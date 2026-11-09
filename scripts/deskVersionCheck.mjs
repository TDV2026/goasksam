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
// any later edit makes version 2 and never touches version 1
const edits = [["field", { field: "colour", value: "Black" }], ["assessment", { patch: { figure: v1.figures.assessment.figure - 100 } }], ["reserve", { patch: { figure: v1.figures.reserve.figure - 500 } }], ["comparables", { ids: [] }]];
let first = true;
for (const [op, extra] of edits) {
  const r = await A.handleSheetAction("case_edit", { id: "s1", op, ...extra }, ctx);
  ok(`edit "${op}" after finalizing: ok, version ${first ? 2 : "stays 2"}, back in review or ready`, r.ok && r.case.version === 2 && r.case.status !== "finalized", J(r).slice(0, 160));
  const now1 = (await A.handleSheetAction("case_version", { id: "s1", version: 1 }, ctx)).row;
  ok(`after "${op}" version 1 is byte for byte the same`, J(now1) === v1bytes); first = false;
}
ok("version 2 is not written until it is finalized", (await A.handleSheetAction("case_version", { id: "s1" }, ctx)).version === 1);
// finalize version 2 (re-ready it)
{ const cur = (await A.handleSheetAction("case_get", { id: "s1" }, ctx)).case; await A.handleSheetAction("case_edit", { id: "s1", op: "comparables", ids: [c.desk.comparables.find(x => x.inPopulation).id] }, ctx);
  const f2 = await A.handleSheetAction("case_finalize", { id: "s1" }, ctx); ok("version 2 finalizes as version 2", f2.ok && f2.version === 2, J(f2).slice(0, 200));
  const vs = await A.handleSheetAction("case_version", { id: "s1" }, ctx); ok("both versions are kept, in order", J(vs.versions) === "[1,2]" && vs.row.version === 2);
  ok("version 1 is still untouched after version 2 is written", J((await A.handleSheetAction("case_version", { id: "s1", version: 1 }, ctx)).row) === v1bytes); }
// the store refuses to overwrite a version
{ let threw = false; try { await store.putCaseVersion("t", "s1", { version: 1, figures: {} }); } catch { threw = true; } ok("the store refuses to write a version that exists", threw); }
// a case that is not ready is refused with its blockers
{ await store.insert("t", { id: "s2", owner_seat: "crew", status: "New", created_at: T, submission: { typed: true, photos: [], documents: [] }, state: {}, case: M.newCase({ now: T }), version: 1 });
  const r = await A.handleSheetAction("case_finalize", { id: "s2" }, ctx); ok("a case that is not ready is refused with its blockers and no version is written", r.refused && r.blockers.length > 0 && (await A.handleSheetAction("case_version", { id: "s2" }, ctx)).refused === true); }
console.log(`deskVersionCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
