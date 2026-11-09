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

// EXPORT RECORDS GO BESIDE A FINALISED CASE SHEET, NEVER INTO IT. The database trigger desk_sheet_immutable is modelled: a sheet whose stored status is Finalised or Sent refuses any write that changes it.
function withTrigger(base) {
  const guard = async (org, sh, how) => { const cur = await base.get(org, sh.id); if (cur && (cur.status === "Finalised" || cur.status === "Sent") && J(cur) !== J(sh)) throw new Error("desk: sheet " + sh.id + " is finalised and cannot be changed (a correction is a new sheet)"); return how(); };
  return { ...base, put: (org, sh) => guard(org, sh, () => base.put(org, sh)), putIf: (org, sh, v) => guard(org, sh, () => base.putIf(org, sh, v)) };
}
{ const st = withTrigger(memoryStore()), cx2 = { org: "t", seat: "crew", store: st, now: T, env: w.env, deps: w.deps, fetchImage: async () => null, send: async p => ({ ok: true, subject: "Valuation report " + p.reportNumber }), orgSettings: { monthlyExportCap: 3, name: "Acme" } };
  const c3 = await readyCase(); await st.insert("t", { id: "x1", owner_seat: "crew", status: "In progress", created_at: T, submission: { typed: true, photos: [], documents: [] }, state: {}, case: c3, version: 1 });
  let threw = false; try { const f0 = await A.handleSheetAction("case_finalize", { id: "x1" }, cx2); ok("the modelled trigger lets the finalize through (the row is not final yet)", f0.ok, J(f0).slice(0, 120)); await st.put("t", { ...(await st.get("t", "x1")), exports: [{ at: T }] }); } catch { threw = true; }
  ok("the model refuses what the real trigger refuses: a change to a finalised sheet", threw);
  const rowBefore = J(await st.get("t", "x1")), verBefore = J((await A.handleSheetAction("case_version", { id: "x1" }, cx2)).row);
  const p1 = await A.handleSheetAction("sheet_pdf", { id: "x1" }, cx2);
  ok("sheet_pdf on a finalised case sheet works under the trigger", p1.ok && p1.pages === 4 && /^DV-/.test(p1.reportNumber), J(p1).slice(0, 160));
  ok("the finalised sheet row is byte identical after the export", J(await st.get("t", "x1")) === rowBefore);
  const e1 = await st.exportsOf("t", "x1");
  ok("the export is recorded beside the sheet: kind, report number, version, seat and time", e1.length === 1 && e1[0].kind === "pdf" && e1[0].reportNumber === p1.reportNumber && e1[0].version === 1 && e1[0].seat === "crew" && e1[0].at === T, J(e1));
  const sd = await A.handleSheetAction("sheet_send", { id: "x1", to: "seller@example.com" }, cx2);
  ok("sheet_send on a finalised case sheet works under the trigger and returns what was sent", sd.ok && sd.sent && sd.sent.to === "seller@example.com", J(sd).slice(0, 160));
  ok("the sheet row and the version row are still byte identical after the send", J(await st.get("t", "x1")) === rowBefore && J((await A.handleSheetAction("case_version", { id: "x1" }, cx2)).row) === verBefore);
  ok("the send is a second export record, kind send", (await st.exportsOf("t", "x1")).map(e => e.kind).join() === "pdf,send");
  ok("export records are never in the sheet or the version row", !/exports/.test(rowBefore) && !/"kind":"pdf"/.test(verBefore));
  ok("the monthly cap counts the records beside the sheet (cap 3: the third works, the fourth is refused)", (await A.handleSheetAction("sheet_pdf", { id: "x1" }, cx2)).ok && (await A.handleSheetAction("sheet_pdf", { id: "x1" }, cx2)).refused === true);
  ok("a revision after the export is still a new sheet, and the export records stay with the first", (await A.handleSheetAction("case_edit", { id: "x1", op: "field", field: "colour", value: "Black" }, cx2)).revisedFrom === "x1" && (await st.exportsOf("t", "x1")).length === 3 && J(await st.get("t", "x1")) === rowBefore); }

// THE CLASS: NO ACTION WRITES A LOCKED SHEET ROW. Every finalised or sent sheet, a V3 case or a sheet from before V3, is run through every action that could touch it under the modelled trigger. None may throw, none may change the row.
{ const { seed } = await import(pathToFileURL(path.join(root, "scripts/deskValsRender.mjs")).href), st = withTrigger(memoryStore()), org = "t2", sent = [];
  const cx3 = (seat = "ava", over = {}) => ({ org, seat, store: st, now: T, env: {}, fetchImage: async () => null, orgSettings: { monthlyExportCap: 50, name: "Acme" }, send: async p => { await st.markSent(org, p.sheetId, T, p.to); sent.push(p); return { ok: true, subject: "Valuation report " + p.reportNumber }; }, ...over });
  const old = await seed(st, { seat: "ava", org }); await A.handleSheetAction("sheet_open", { id: old.id }, cx3());
  { const s = await st.get(org, old.id); s.state.tier = 2; s.state.decision = { mode: "reserve", reserve: "58000", low: "", high: "", reasons: ["condition"], otherText: "", line: "Held on the photographs.", guardLines: {}, note: "" }; s.state.mark = null; await st.put(org, s); }
  const fo = await A.handleSheetAction("sheet_finalise", { id: old.id }, cx3());
  ok("a sheet from before V3 finalises (the fixture for the class)", fo.ok, fo.why);
  const v3 = await readyCase(); await st.insert(org, { id: "v3x", owner_seat: "ava", status: "In progress", created_at: T, submission: { typed: true, photos: [], documents: [] }, state: {}, case: v3, version: 1 }); const fv = await A.handleSheetAction("case_finalize", { id: "v3x" }, cx3()); ok("a V3 case finalises (the other fixture)", fv.ok, fv.why);
  for (const [name, id] of [["a pre V3 sheet", old.id], ["a V3 case sheet", "v3x"]]) {
    const before = J(await st.get(org, id)); let threw = null;
    const calls = [["sheet_open", {}], ["sheet_open", { pickUp: true }], ["sheet_save", { patch: { tier: 3 } }], ["sheet_photo_add", { name: "a.jpg", data: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 1)]).toString("base64") }], ["sheet_pdf", {}], ["sheet_pdf", { draft: true }], ["sheet_send", { to: "seller@example.com" }], ["sheet_pdf", {}], ["case_get", { open: true }], ["case_get", {}], ["case_finalize", {}], ["sheet_finalise", {}]];
    for (const [a, b] of calls) { try { await A.handleSheetAction(a, { id, ...b }, cx3()); } catch (e) { threw = threw || a + ": " + e.message; } }
    const after = await st.get(org, id), statusFree = J({ ...after, status: null, sent: null });
    ok(`${name}: no action throws under the trigger (open, save, photo, pdf, draft, send, case_get, finalize)`, threw === null, threw);
    ok(`${name}: the sheet row is byte identical after all of them, apart from the Sent state the backend writes beside it`, statusFree === J({ ...JSON.parse(before), status: null, sent: null }), "");
    const ex = await st.exportsOf(org, id);
    ok(`${name}: the exports are records beside the row (pdf, pdf, send, pdf: a draft asked of a finalised sheet is an export of it) and the send is the backend's call`, ex.map(e => e.kind).join() === "pdf,pdf,send,pdf" && sent.some(p => p.sheetId === id), J(ex.map(e => e.kind)));
    ok(`${name}: a read after the send shows Sent and the date from the backend's column`, after.status === "Sent" && after.sent && after.sent.to === "seller@example.com"); }
  ok("the monthly cap counts both kinds of sheet's records", (await st.exportsThisMonth(org, T.slice(0, 7))) >= 6); }
console.log(`deskVersionCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
