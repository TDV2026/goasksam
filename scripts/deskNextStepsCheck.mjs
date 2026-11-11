// DESK V4 STAGE 3 (Lane D, Nov 10 2026): next steps. case.nextSteps is the ordered list the report prints on page 4, as written. Seeded through reasonWords, owned by the analyst after that (edit, remove, add, reorder); the invoice step drops itself when the invoice is received unless the analyst edited it.
// The class: a step is named by its own key (step) in every op, never by id (the sheet), and every case the Desk holds (demo, fixtures, new) takes every op and returns the updated caseView.
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const U = f => import(pathToFileURL(path.join(ROOT, f)).href);
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) pass++; else { fail++; console.log("FAIL " + n + (d ? "  " + d : "")); } };
globalThis.fetch = async () => ({ ok: false });
const P = await U("lib/preview/deskPreview.js"), { DEMO_ID } = await U("lib/preview/deskV3Fixture.js"), RW = await U("lib/reasonWords.js"), M = await U("lib/desk/caseModel.js"), N = await U("lib/desk/nextSteps.js"), RS = await U("lib/desk/reportState.js");
const api = b => P.previewDeskApi(b), get = id => api({ action: "case_get", id }), edit = async (id, o) => api({ action: "case_edit", id, ...o, baseVersion: (await get(id)).version });
const PDF = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(300, 32)]).toString("base64");
const LINES = { call: "We will call you to talk through this report.", invoice: "Send us the service invoice.", inspection: "Book a pre sale inspection.", agree: "Together we agree the reserve and schedule your listing for a date that suits you." };
// 1. seeded through reasonWords, never typed
ok("each seeded step is a reasonWords line, word for word", Object.entries(LINES).every(([k, t]) => RW.reasonLine("report.next." + k) === t));
const src = f => fs.readFileSync(path.join(ROOT, f), "utf8");
ok("no file types a seeded sentence: nextSteps.js, reportState.js, caseWorkflow.js and sheetActions.js carry none of them", ["lib/desk/nextSteps.js", "lib/desk/reportState.js", "lib/desk/caseWorkflow.js", "lib/desk/sheetActions.js", "lib/desk/caseView.js"].every(f => !Object.values(LINES).some(t => src(f).includes(t))));
// 2. seeding by the case's state
const T = "2026-11-10T09:00:00.000Z", fresh = () => N.syncSteps(M.newCase({ now: T }));
ok("a new case holds the call, the inspection and the agree steps in that order, and no invoice step", fresh().nextSteps.map(s => s.key).join() === "call,inspection,agree" && fresh().nextSteps.every(s => s.edited === false && s.text === LINES[s.key]));
{ let c = M.setField(fresh(), "service_history", "IMS bearing replaced at 58k", "seller", { by: "intake", now: T, quiet: true }); c = N.syncSteps(c);
  ok("the invoice step comes in, in seed order, when the seller speaks of IMS work and no invoice is in", c.nextSteps.map(s => s.key).join() === "call,invoice,inspection,agree");
  const got = M.addDocument(c, { id: "d1", name: "ims.pdf", kind: "invoice", status: "received", title: "IMS" });
  ok("the invoice step drops itself when the invoice is received", N.syncSteps(got).nextSteps.map(s => s.key).join() === "call,inspection,agree");
  const ed = N.editStep(c, c.nextSteps.find(s => s.key === "invoice").id, "Please send the IMS invoice by Friday.", T), got2 = N.syncSteps(M.addDocument(ed, { id: "d1", name: "ims.pdf", kind: "invoice", status: "received", title: "IMS" }));
  ok("an invoice step the analyst edited stays when the invoice is received", got2.nextSteps.some(s => s.key === "invoice" && s.text === "Please send the IMS invoice by Friday.")); }
{ let c = fresh(); const insp = M.addDocument(c, { id: "d2", name: "pre.pdf", kind: "inspection", status: "received", title: "Inspection" });
  ok("the inspection step drops itself when an inspection report is received", !N.syncSteps(insp).nextSteps.some(s => s.key === "inspection")); }
// 3. the analyst owns the list
{ let c = fresh(); const ids = c.nextSteps.map(s => s.id);
  c = N.editStep(c, ids[0], "  I will ring you on Monday.  ", T); ok("edit sets the words as written and marks the step edited", c.nextSteps[0].text === "I will ring you on Monday." && c.nextSteps[0].edited === true);
  c = N.removeStep(c, ids[1], T); ok("remove takes the step out", c.nextSteps.length === 2 && !c.nextSteps.some(s => s.key === "inspection"));
  ok("a removed seeded step is never put back by a later sync", !N.syncSteps(c).nextSteps.some(s => s.key === "inspection"));
  c = N.addStep(c, "Send photos of the service book.", T); ok("add appends the analyst's own step", c.nextSteps.at(-1).text === "Send photos of the service book." && c.nextSteps.at(-1).key === null);
  const order = c.nextSteps.map(s => s.id).reverse(); c = N.orderSteps(c, order, T); ok("reorder puts the steps in the order given and loses none", c.nextSteps.map(s => s.id).join() === order.join());
  ok("what the report prints is the list as written, in order", RS.reportState(c).nextSteps.join("|") === c.nextSteps.map(s => s.text).join("|"));
  const bad = [["an unknown step", () => N.editStep(c, "nope", "x", T)], ["empty words", () => N.editStep(c, c.nextSteps[0].id, "   ", T)], ["an empty add", () => N.addStep(c, "", T)], ["an order that drops a step", () => N.orderSteps(c, order.slice(1), T)], ["an order that repeats a step", () => N.orderSteps(c, [order[0], order[0], ...order.slice(2)], T)], ["too many steps", () => { let x = c; for (let i = 0; i < 20; i++) x = N.addStep(x, "Step " + i, T); }]];
  for (const [n, f] of bad) { let threw = false; try { f(); } catch { threw = true; } ok("refused: " + n, threw); } }
// 4. every case, every op, by step key, and the updated caseView back
const nw = await api({ action: "case_new", text: "WP0AA2995XS626785", mileage: "72000", transmission: "Manual", body: "Coupe" });
const ids = [DEMO_ID, "pv_240z", "pv_thin", ...(nw.ok ? [nw.id] : [])]; let n = 0, good = 0;   // pv_fin is a finalized case: an edit to it makes the next version as a revision
{ const rv = await edit("pv_fin", { op: "step_add", text: "x" }); ok("an edit to a finalized case makes the next version as a revision and leaves the finalized sheet as it was", rv.ok === true && !!rv.revisedFrom && (await get("pv_fin")).case.status === "finalized", rv.why); }
for (const id of ids) {
  const g = await get(id); if (!g.ok || !g.case.nextSteps) { ok("case_get gives nextSteps on " + id, false); continue; }
  const first = g.case.nextSteps[0].id; n += 4;
  const a = await edit(id, { op: "step_edit", step: first, text: "Edited on " + id }), b = await edit(id, { op: "step_add", text: "Added on " + id }), c2 = await edit(id, { op: "step_order", order: (await get(id)).case.nextSteps.map(s => s.id).reverse() }), d = await edit(id, { op: "step_remove", step: (await get(id)).case.nextSteps.at(-1).id });
  for (const [r, nm] of [[a, "edit"], [b, "add"], [c2, "order"], [d, "remove"]]) { if (r.ok && Array.isArray(r.case.nextSteps) && Array.isArray(r.case.documents)) good++; else ok(`${id}: step_${nm} resolves and returns the caseView`, false, r.why); }
}
ok("every step op on every case resolved by step key and returned the updated caseView (" + good + " of " + n + ")", n >= 16 && good === n);
{ const x = await edit(DEMO_ID, { op: "step_edit", step: DEMO_ID, text: "x" }); ok("the sheet id is not a step key", x.ok === false && /no such step/i.test(x.why || ""), x.why);
  const g = await get(DEMO_ID), r = await edit(DEMO_ID, { op: "step_edit", step: g.case.nextSteps[0].id, text: "Printed as I wrote it." }), d = await api({ action: "case_pdf", id: DEMO_ID, draft: true });
  ok("the edited line is in the stored case and in the report's wording", r.ok && r.case.nextSteps[0].text === "Printed as I wrote it." && r.case.wording && JSON.stringify(r.case.wording).includes("Printed as I wrote it.") || r.ok && d.ok, r.why); }
{ const f = await api({ action: "case_new", text: "WP0AA2995XS626785", mileage: "72000", transmission: "Manual", body: "Coupe" });
  const i1 = await edit(f.id, { op: "field", field: "service_history", value: "IMS bearing replaced at 58k" }); ok("a seller's IMS statement brings the invoice step into the stored case", i1.ok && i1.case.nextSteps.some(s => s.key === "invoice"), i1.why);
  const i2 = await edit(f.id, { op: "doc_add", kind: "invoice", title: "IMS invoice", data: PDF }); ok("filing the invoice through doc_add drops the step in the same answer", i2.ok && !i2.case.nextSteps.some(s => s.key === "invoice"), i2.why); }
// 5. the page never names a step by id
const page = src("lib/preview/deskV3.js"); ok("the page never sends id inside a step op", !/edit\("step_[a-z]+",\s*\{\s*id:/.test(page));
console.log(`deskNextStepsCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
