// EDITS HOLD ACROSS SESSIONS (Lane D, Nov 11 2026; Lane F's run: after a condition, a reserve drag, two comparables and a note, Preview printed the unedited case and a reload lost the edits).
// CAUSE: the preview kept its cases in a memory store, one per function instance, seeded afresh on every cold start: a second instance showed the seeded case and the report printed the unedited one. Sam's decision: the deployed preview uses the production Desk store (desk_sheets.sheet.case on every edit, read back from there).
// OTHER PAGES AND CARS: every page that lists or opens a case and every car in the rail (the demonstration 996 and the samples); the report preview and the PDF read the saved case. CLASS (Lane F's): after EACH edit, two fresh sessions read the case and build the PDF, and what is printed equals what was saved: the reserve, the count, the ticked comparables, the note.
// Here the production store is stood for by a backing store the door is given (usePreviewBacking); a fresh session is a new door over that same backing (the module cache dropped). Lane C's live run does the same against the real store.
//   node scripts/deskPersistCheck.mjs [rootDir]
import path from "node:path"; import { pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || "."), imp = f => import(pathToFileURL(path.join(root, f)).href);
const P = await imp("lib/preview/deskPreview.js"), S = await imp("lib/desk/sheetStore.js"), R = await imp("lib/desk/reportState.js"), mini = await imp("lib/pdf/mini.js"), D = await imp("lib/preview/deskV3Fixture.js");
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) pass++; else { fail++; console.log("FAIL " + n + (d ? " :: " + d : "")); } };
const backing = S.memoryStore(); backing.reset(); P.usePreviewBacking(backing);
const seeded = await P.seedPreviewStore(backing, { realIds: true, seat: "crew" });
ok("the sample cases are put in the store once, with fixed uuids", seeded.seeded === true && seeded.ids.includes(P.previewUuid(D.DEMO_ID)) && seeded.ids.every(i => /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/.test(i)), JSON.stringify(seeded.ids.slice(0, 2)));
const again = await P.seedPreviewStore(backing, { realIds: true, seat: "crew" }); ok("seeding again changes nothing (idempotent)", again.seeded === false);
const id = P.previewUuid(D.DEMO_ID), api = b => P.previewDeskApi(b);
const session = async () => { P.usePreviewBacking(backing); const g = await api({ action: "case_get", id }); const pdf = await api({ action: "case_pdf", id, draft: true }); return { g, pdf, text: pdf.ok ? mini.pdfPages(Buffer.from(pdf.pdf_b64, "base64")).map(p => p.join(" ")).join(" ") : "" }; };
const fmt = n => "$" + Number(n).toLocaleString("en-US");
let saved = (await session()).g.case, compIds = saved.desk.comparables.filter(x => x.url).map(x => x.id);
const edits = [
  ["a condition", { op: "condition", selected: { tier: 2, name: "Excellent" } }],
  ["a reserve", { op: "reserve", patch: { figure: 31000 } }],
  ["two comparables", () => ({ op: "comparables", ids: compIds.slice(0, 2) })],
  ["a note", { op: "reserve", patch: { why: "Seller reports a recent clutch, held at the lower quartile." } }]
];
const want = { tier: null, reserve: null, comps: null, note: null };
for (const [name, e] of edits) {
  const body = typeof e === "function" ? e() : e, r = await api({ action: "case_edit", id, ...body });
  ok(`${name}: the edit is accepted`, r.ok === true, String(r.why || ""));
  if (body.op === "condition") want.tier = body.selected.tier; if (body.op === "comparables") want.comps = body.ids.length; if (body.patch && body.patch.figure != null) want.reserve = body.patch.figure; if (body.patch && body.patch.why) want.note = /recent clutch/;
  for (const n of [1, 2]) {
    const s = await session(), c = s.g.case, st = R.reportState(c), sel = c.selectedComparables || [];
    ok(`${name}, fresh session ${n}: the case read back is the case that was saved`, s.g.ok === true && (want.tier == null || (c.condition.selected && c.condition.selected.tier) === want.tier) && (want.reserve == null || c.reserve.figure === want.reserve) && (want.comps == null || sel.length === want.comps) && (!want.note || want.note.test(c.reserve.why)), JSON.stringify([c.condition.selected, c.reserve.figure, sel.length]));
    ok(`${name}, fresh session ${n}: the PDF prints the saved reserve, count, ticked comparables and note`, s.pdf.ok === true && (c.reserve.figure == null || s.text.includes(fmt(c.reserve.figure))) && s.text.includes(String(c.desk.evidence.count)) && (sel.length === 0 || (st.comparables.length === sel.length && st.comparables.every(x => s.text.includes(fmt(x.price))))) && (!want.note || want.note.test(s.text)), `${c.reserve.figure} ${c.desk.evidence.count} ${st.comparables.length}`);
  }
}
const last = await session(); ok("after all four edits a cold start still shows the edited case, not the seeded one", last.g.case.reserve.figure === 31000 && (last.g.case.selectedComparables || []).length === 2 && last.g.case.condition.selected.tier === 2);
console.log(`deskPersistCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
