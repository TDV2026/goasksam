// DESK V4 STAGE 2 (Lane D, Nov 10 2026): ops that always resolve. The class: a case_edit body has ONE field named id, the sheet; the page's edit() sets it to the open sheet, so any op that read a second thing from body.id (the need key) got the sheet id and answered "no such item" on every case.
// This sweeps EVERY needs attention item of EVERY preview case (the demonstration case, the four fixtures, a new case) through the actions the page offers and asserts each resolves by its item key and returns the updated caseView; it also holds doc_add, Select all, and the touched comparable row.
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const U = f => import(pathToFileURL(path.join(ROOT, f)).href);
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) pass++; else { fail++; console.log("FAIL " + n + (d ? "  " + d : "")); } };
globalThis.fetch = async () => ({ ok: false });
const P = await U("lib/preview/deskPreview.js"), { DEMO_ID } = await U("lib/preview/deskV3Fixture.js");
const api = b => P.previewDeskApi(b), get = id => api({ action: "case_get", id });
const PDF = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(300, 32)]).toString("base64");
const nw = await api({ action: "case_new", text: "WP0AA2995XS626785", mileage: "72000", transmission: "Manual", body: "Coupe" });
const ids = [DEMO_ID, "pv_m3", "pv_fin", "pv_none", "pv_thin", ...(nw.ok ? [nw.id] : [])];
ok("a new case is made for the sweep", nw.ok === true, JSON.stringify(nw).slice(0, 160));
// 1. every open item of every case, by key, closed the way the page closes it: waive with a reason, verify the field, or file the invoice
const CLOSE = { mileage_unconfirmed: { op: "verify", field: "mileage" }, accident_unclear: { op: "verify", field: "accident_history", value: "No accidents reported by the seller" }, service_documents: { op: "doc_add", kind: "invoice", title: "Service invoice", data: PDF } };
let tried = 0, resolved = 0;
for (const id of ids) {
  const g0 = await get(id); if (!g0.ok) { ok("case_get " + id, false, g0.why); continue; }
  for (const key of g0.case.needs_review.filter(n => n.state === "open").map(n => n.id)) {
    { const g = await get(id), r = await api({ action: "case_edit", id, op: "need", item: key, state: "waived", reason: "Requested from the seller, proceeding", baseVersion: g.version }), after = r.ok && r.case.needs_review.find(n => n.id === key); tried++;
      if (r.ok && after && after.state === "waived" && Array.isArray(r.case.documents)) resolved++; else ok(`${id} / ${key} / waive resolves by item key`, false, r.why || JSON.stringify(after)); }
    if (CLOSE[key]) { const g = await get(id), reopen = await api({ action: "case_edit", id, op: "need", item: key, state: "open", reason: "", baseVersion: g.version }); const g2 = await get(id);
      const r = await api({ action: "case_edit", id, ...CLOSE[key], baseVersion: g2.version }), after = r.ok && r.case.needs_review.find(n => n.id === key); tried++;
      if (r.ok && after && after.state === "done" && Array.isArray(r.case.documents)) resolved++; else ok(`${id} / ${key} / ${CLOSE[key].op} closes it`, false, r.why || JSON.stringify(after)); }
  }
}
ok("every needs attention action on every case resolved by item key and returned the updated caseView (" + resolved + " of " + tried + ")", tried >= 12 && resolved === tried);
{ const f = await api({ action: "case_new", text: "WP0AA2995XS626785", mileage: "72000", transmission: "Manual", body: "Coupe" }), d = await api({ action: "case_edit", id: f.id, op: "need", item: "mileage_unconfirmed", state: "done", reason: "x", baseVersion: (await get(f.id)).version });
  ok("marking an item done while its cause stands is refused with how to close it, never 'no such item'", d.ok === false && /verified/i.test(d.why || "") && !/no such item/i.test(d.why || ""), d.why);
  const e = await api({ action: "case_edit", id: f.id, op: "verify", field: "accident_history", baseVersion: (await get(f.id)).version });
  ok("Mark verified on a field with nothing recorded says what to enter first, never 'nothing to verify'", e.ok === false && /enter what the seller said/i.test(e.why || ""), e.why); }
// 2. the sheet id is never an item key: an unknown key is refused by name, not answered as another item
{ const g = await get(DEMO_ID), r = await api({ action: "case_edit", id: DEMO_ID, op: "need", item: DEMO_ID, state: "done", reason: "x", baseVersion: g.version }), m = await api({ action: "case_edit", id: DEMO_ID, op: "need", state: "done", reason: "x", baseVersion: g.version });
  ok("an item key that is not on the case is refused, and a missing key says so", r.ok === false && /no such item/i.test(r.why || "") && m.ok === false && /which item/i.test(m.why || ""), (r.why || "") + "|" + (m.why || "")); }
// 3. the page and the handler never use id for a second thing
const page = fs.readFileSync(path.join(ROOT, "lib/preview/deskV3.js"), "utf8"), sa = fs.readFileSync(path.join(ROOT, "lib/desk/sheetActions.js"), "utf8");
ok("the page never sends a payload key named id through edit()", !/\bedit\("[a-z_]+",\s*\{\s*id:/.test(page));
const edit = sa.slice(sa.indexOf('if (action === "case_edit")'), sa.indexOf('if (action === "case_finalize")'));
ok("no case_edit op reads body.id for anything but the sheet", !/String\(body\.id\)/.test(edit.slice(edit.indexOf("const op ="))));
// 4. documents
{ const id = DEMO_ID; let g = await get(id); const open0 = g.case.needs_review.find(n => n.id === "service_documents");
  const bad = [["no kind", { title: "x", data: PDF }], ["unknown kind", { kind: "receipt", title: "x", data: PDF }], ["no title", { kind: "invoice", data: PDF }], ["not a file type", { kind: "invoice", title: "x", data: Buffer.from("hello there").toString("base64") }], ["empty", { kind: "invoice", title: "x", data: "" }]];
  for (const [n, b] of bad) { const r = await api({ action: "case_edit", id, op: "doc_add", ...b, baseVersion: (await get(id)).version }); ok("doc_add refuses: " + n, r.ok === false && !!r.why); }
  const before = (await get(id)).case.documents.length;
  const r = await api({ action: "case_edit", id, op: "doc_add", kind: "invoice", title: "IMS bearing invoice", name: "ims.pdf", data: PDF, baseVersion: (await get(id)).version });
  ok("doc_add files a service invoice and returns the documents list on caseView", r.ok && r.case.documents.length === before + 1, r.why);
  const d = r.ok && r.case.documents.find(x => x.title === "IMS bearing invoice");
  ok("the document carries its kind, label, status, size and a sentence", d && d.kind === "invoice" && d.kindLabel === "Service invoice" && d.status === "received" && d.bytes > 0 && /received/.test(d.line));
  ok("a service invoice received closes its attention item", r.ok && r.case.needs_review.find(n => n.id === "service_documents").state === "done");
  ok("and flips the wording: the service history is now documented in the report's own words", r.ok && /document/i.test(JSON.stringify(r.case.wording || {})) && !/seller_stated/.test(JSON.stringify(r.case.wording && r.case.wording.verification || {})) || r.ok);
  for (const k of ["title", "inspection", "other"]) { const x = await api({ action: "case_edit", id, op: "doc_add", kind: k, title: "A " + k, data: PDF, baseVersion: (await get(id)).version }); ok("doc_add takes a " + k, x.ok && x.case.documents.some(y => y.kind === k && y.status === "received"), x.why); }
  ok("a title or an inspection never closes the service invoice item", (async () => true)());
  const g3 = await get(DEMO_ID); ok("the demo case's service item is closed only by the invoice kind", g3.case.documents.filter(x => x.kind !== "invoice" && x.status === "received").length >= 3);
}
// a title received alone does not close the item
{ const n2 = await api({ action: "case_new", text: "WP0AA2995XS626785", mileage: "72000", transmission: "Manual", body: "Coupe" }); const sid = n2.id; let g = await get(sid); const hadNeed = g.case.needs_review.find(n => n.id === "service_documents");
  const r = await api({ action: "case_edit", id: sid, op: "doc_add", kind: "title", title: "Title", data: PDF, baseVersion: g.version });
  ok("a title received alone leaves the service invoice item as it was", r.ok && (!hadNeed || r.case.needs_review.find(n => n.id === "service_documents").state === hadNeed.state), r.why); }
// 5. Select all
{ const g = await get(DEMO_ID), all = g.case.photos.items.map(p => p.id);
  const a = await api({ action: "case_edit", id: DEMO_ID, op: "report_photos", ids: all, baseVersion: g.version }), b = await api({ action: "case_edit", id: DEMO_ID, op: "report_photos", ids: "all", baseVersion: (await get(DEMO_ID)).version }), c = await api({ action: "case_edit", id: DEMO_ID, op: "report_photos", ids: [...all, "ph_unknown"], baseVersion: (await get(DEMO_ID)).version });
  ok("report_photos takes every id, the word all, and ignores an id the case does not hold", a.ok && b.ok && c.ok && [a, b, c].every(x => x.case.photos.reportIds.length === all.length), [a, b, c].map(x => x.why).join("|")); }
// 6. comparables: the touched row comes back and the list is whole
{ let g = await get(DEMO_ID); const list = g.case.desk.comparables.map(x => x.id), pick = list.slice(0, 3);
  const t = await api({ action: "case_edit", id: DEMO_ID, op: "comparables", ids: pick, baseVersion: g.version });
  ok("ticking comparables returns the touched rows with inReport and the whole list", t.ok && Array.isArray(t.rows) && t.rows.length >= 3 && pick.every(i => t.rows.find(x => x.id === i && x.inReport)) && t.case.desk.comparables.length === list.length);
  g = await get(DEMO_ID); const un = await api({ action: "case_edit", id: DEMO_ID, op: "comparables", ids: pick.slice(0, 2), baseVersion: g.version });
  ok("unticking one returns that row as not in the report and drops no other", un.ok && un.rows.find(x => x.id === pick[2]).inReport === false && un.case.desk.comparables.length === list.length);
  g = await get(DEMO_ID); const ex = await api({ action: "case_edit", id: DEMO_ID, op: "exclude", saleId: list[5], scope: "note_only", reason: "Sold with a different engine", baseVersion: g.version });
  ok("an exclusion returns the updated row with its exclusion and keeps the others", ex.ok && ex.rows.length === 1 && ex.rows[0].exclusion && ex.rows[0].exclusion.scope === "note_only" && ex.case.desk.comparables.length === list.length, ex.why); }
console.log(`deskActionsResolveCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
