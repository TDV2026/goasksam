// Desk v3 stage 2: correcting a field, the engine re-call, and needs review. The re-call is Lane B's real desk block read through sheetRead. node scripts/deskWorkflowCheck.mjs [rootDir]
import path from "node:path"; import { pathToFileURL } from "node:url"; import { setup } from "./_deskCaseWorld.mjs";
const root = path.resolve(process.argv[2] || "."), { M, K, read, calls, readyCase, T, today } = await setup(root);
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) pass++; else { fail++; console.log("FAIL " + n + (d ? "  " + d : "")); } }; const J = x => JSON.stringify(x);
const base = await readyCase();
// correcting a field: an audit line, and verification reset
const corr = K.correctField(base, "mileage", 70000, { now: T });
ok("correcting mileage logs an audit line with the old and new value", corr.audit.some(a => a.what === "corrected" && a.field === "mileage" && a.from === 61400 && a.to === 70000));
ok("correcting mileage resets its verification", base.fields.mileage.verified === true && corr.fields.mileage.verified === false);
ok("a reset verification opens the material mileage item again and the case is no longer ready", corr.needs_review.find(n => n.id === "mileage_unconfirmed").state === "open" && corr.status === "in_review");
ok("verifying logs its own line and closes the item", (() => { const v = K.verify(corr, "mileage", { now: T }); return v.fields.mileage.verified && v.audit.some(a => a.what === "verified" && a.field === "mileage") && v.needs_review.find(n => n.id === "mileage_unconfirmed").state === "done"; })());
ok("setting the same value again is not a correction (no line, verification kept)", (() => { const same = K.correctField(base, "mileage", 61400, { now: T }); return same.fields.mileage.verified === true && J(same.audit) === J(base.audit); })());
// the re-call
ok("the case was read once for evidence and stored: desk.original and desk.evidence", base.desk.original && base.desk.evidence && base.desk.evidence.count > 0 && J(base.desk.original) === J(base.desk.evidence));
const recall = async (name, c, want) => { const n0 = calls.length, r = await K.refreshEvidence(c, read, { caseDate: today, now: T }); ok(name + (want ? ": re-calls the engine" : ": does not re-call the engine"), r.recalled === want && (want ? (calls.length - n0) >= 1 && (calls.length - n0) <= 2 : (calls.length - n0) === 0), `calls ${calls.length - n0}`); return r.case; };
await recall("nothing changed", base, false);
{ const rv = await recall("a reserve figure moved (the engine checks it: reserveCheck)", K.setReserve(base, { figure: 1 }, T), true); ok("the read carried the reserve and the case holds the engine's check of that very figure", calls[calls.length - 1].desk.reserve === 1 && rv.desk.reserveCheck && rv.desk.reserveCheck.reserve === 1 && K.reservePosition(rv) === "below", JSON.stringify(rv.desk.reserveCheck)); }
await recall("a reserve why edited", K.setReserve(base, { why: "Held at the lower quartile." }, T), false);
await recall("the seller's request marked", K.setReserve(base, { sellerRequested: true }, T), false);
{ const w6 = await recall("the period changed to 6 months", K.setWindow(base, 6, T), false); ok("no read was made and the evidence is the engine's six months from the stored view", w6.windowMonths === 6 && w6.desk.evidence.windowMonths === 6 && w6.desk.view.months === 6 && w6.desk.evidence.count > 0); await recall("the same period again", K.setWindow(base, 12, T), false); ok("a period that is not 6, 12 or 24 is refused", K.setWindow(base, 7, T) === null); }
await recall("an assessment edit", K.setAssessment(base, { figure: 1 }, T), false);
await recall("a photo", M.addPhoto(base, { id: "p9" }, T), false);
await recall("verifying a field", K.verify(K.correctField(base, "colour", "Black", { now: T }), "colour", { now: T }), false);
const cm = await recall("mileage changed", K.correctField(base, "mileage", 95000, { now: T }), true);
ok("the new read is stored with a new key and the original is the untouched evidence", cm.desk.key !== base.desk.key && J(cm.desk.original) === J(cm.desk.evidence));
await recall("transmission changed", K.correctField(base, "transmission", "Tiptronic", { now: T }), true);
await recall("body changed", K.correctField(base, "body", "Cabriolet", { now: T }), true);
{ const g = K.correctField(base, "generation", "993", { now: T }); await recall("generation changed (the engine derives it from the year)", g, false); ok("a generation edit logs an audit line", g.audit.some(a => a.what === "corrected" && a.field === "generation" && a.to === "993") || g.audit.some(a => a.field === "generation")); }
const tr = await recall("transmission changed to automatic", K.correctField(base, "transmission", "Tiptronic", { now: T }), true);
ok("a different gearbox reads a different population", tr.desk.evidence.population.sentence !== base.desk.evidence.population.sentence || tr.desk.evidence.count !== base.desk.evidence.count);
// market_calc exclusion
const pick = base.desk.comparables.filter(c => c.inPopulation).slice(0, 3).map(c => c.id);
let ex = base; for (const id of pick) ex = M.excludeSale(ex, { saleId: id, scope: "market_calc", reason: "Salvage title", now: T });
const exr = await recall("a market_calc exclusion", ex, true);
ok("the evidence count drops by the excluded sales and the original stays", exr.desk.evidence.count === base.desk.evidence.count - 3 && J(exr.desk.original) === J(base.desk.original) && exr.desk.original.count === base.desk.evidence.count);
ok("the exclusions ride on the case with scope, reason and time", exr.exclusions.length === 3 && exr.exclusions.every(e => e.scope === "market_calc" && e.reason && e.at));
// the three scopes are the engine's own, spelled the engine's way (a made up name reads as note_only there and would silently do nothing)
{ const DV = await import(pathToFileURL(path.join(root, "lib/deskV3.js")).href);
  ok("the case's exclusion scopes are exactly the engine's (market_calc, report_comps, note_only)", [...M.EXCLUSION_SCOPES].sort().join() === [...DV.SCOPES].sort().join()); }
// RESTORE: undoes an exclusion by sale id, in every scope, and logs it; the engine is re-asked because the calculation changes back
{ let r = exr; for (const id of pick) r = M.restoreSale(r, { saleId: id, now: T });
  const back = await recall("restoring the three excluded sales", r, true);
  ok("restoring all three puts the evidence back to the original count and leaves no exclusion", back.exclusions.length === 0 && back.desk.evidence.count === base.desk.evidence.count);
  ok("each restore is logged in the table's words", r.audit.filter(a => a.what === "sale restored").length === 3 && r.audit.filter(a => a.what === "sale restored").every(a => a.line === "The analyst put an excluded sale back."));
  ok("a sale that is not excluded is not restorable (null, nothing logged)", M.restoreSale(exr, { saleId: "no-such-sale", now: T }) === null);
  const two = M.restoreSale(M.excludeSale(exr, { saleId: pick[0], scope: "report_comps", reason: "Not a fit", now: T }), { saleId: pick[0], now: T });
  ok("restoring a sale takes it out of every scope it was excluded under", two.exclusions.every(e => e.saleId !== pick[0]) && two.exclusions.length === 2); }
const rc = await recall("a report_comps exclusion (the engine drops the sale from the comparables)", M.excludeSale(base, { saleId: pick[0], scope: "report_comps", reason: "Not a fit", now: T }), true);
ok("report_comps: the sale leaves the comparables and the evidence is unchanged", !rc.desk.comparables.some(c => c.id === pick[0]) && rc.desk.comparables.length === base.desk.comparables.length - 1 && J(rc.desk.evidence) === J(base.desk.evidence));
// NOTE ONLY: the reason and scope go in the audit trail and on the comparable, and nothing else changes
const noteCase = M.excludeSale(base, { saleId: pick[0], scope: "note_only", reason: "Seller disputes this sale's condition", now: T });
await recall("a note_only exclusion", noteCase, false);
{ const forced = (await read(K.recallInput(noteCase, today))).desk;
  ok("note_only: sent to the engine anyway, the comparables, evidence and original come back identical", J(forced.comparables) === J(base.desk.comparables) && J(forced.evidence) === J(base.desk.evidence) && J(forced.original) === J(base.desk.original) && forced.comparables.some(c => c.id === pick[0]));
  ok("note_only: the reason and scope are in the audit trail", noteCase.audit.some(a => a.what === "excluded (note_only)" && a.to === pick[0] && a.reason === "Seller disputes this sale's condition"));
  ok("note_only: the exclusion is on the case with its scope, reason and time", noteCase.exclusions.length === 1 && noteCase.exclusions[0].scope === "note_only" && noteCase.exclusions[0].reason && noteCase.exclusions[0].at);
  const V = await import(pathToFileURL(path.join(root, "lib/desk/caseView.js")).href), vw = V.caseView({ id: "n", created_at: T, submission: { typed: true, photos: [], documents: [] }, case: noteCase }, [], T).desk.comparables;
  ok("note_only: the note rides on that comparable and on no other, which is still listed", vw.find(c => c.id === pick[0]).exclusion.scope === "note_only" && vw.filter(c => c.exclusion).length === 1 && vw.length === base.desk.comparables.length);
  ok("note_only: the report's selected comparable is not dropped, readiness is unchanged", K.readinessOf(K.selectComparables(noteCase, pick.slice(0, 2), T)).blockers.every(b => b.key !== "comparable")); }
{ const sel = K.selectComparables(base, [pick[0]], T), gone = (await K.refreshEvidence(M.excludeSale(sel, { saleId: pick[0], scope: "report_comps", reason: "Not a fit", now: T }), read, { caseDate: today, now: T })).case;
  ok("report_comps: a selected comparable the engine no longer lists does not count as selected", K.readinessOf(gone).blockers.some(b => b.key === "comparable")); }
// a retry or failed read never replaces a good one
{ const r = await K.refreshEvidence(K.correctField(base, "mileage", 99000, { now: T }), async () => ({ retry: true, line: "still reading" }), { caseDate: today, now: T }); ok("a retry answer is not stored over the good read", !r.recalled && J(r.case.desk) === J(base.desk) && r.retry); }
// needs review: generated from source states, closed when the cause goes
const fresh = K.syncNeeds(M.newCase({ now: T, vehicle: { year: 1999, make: "Porsche", model: "911" }, source: "seller" }));
ok("a new seller case generates mileage, accident and service items from its sources", ["mileage_unconfirmed", "accident_unclear", "service_documents"].every(id => fresh.needs_review.some(n => n.id === id && n.state === "open")));
ok("mileage and accident history are material, service documents are not", fresh.needs_review.filter(n => n.material).map(n => n.id).sort().join() === "accident_unclear,mileage_unconfirmed");
const vm = K.syncNeeds(M.setField(M.setField(M.newCase({ now: T }), "year", 2008, "seller", { by: "intake", now: T }), "year", 2007, "vin_decoded", { by: "intake", now: T }));
ok("a VIN and seller that disagree open a material VIN mismatch item", vm.needs_review.some(n => n.id === "vin_mismatch" && n.material && n.state === "open"));
ok("the service documents item is not material and closes when invoices are received", (() => { const a = K.syncNeeds(M.addDocument(fresh, { id: "d", kind: "service", status: "outstanding" })); const b = K.syncNeeds(M.addDocument(fresh, { id: "d", kind: "service", status: "received" })); return a.needs_review.find(n => n.id === "service_documents").state === "open" && !a.needs_review.find(n => n.id === "service_documents").material && b.needs_review.find(n => n.id === "service_documents").state === "done"; })());
ok("an item waived with a reason stays waived while its cause stands", (() => { const w = K.syncNeeds(K.setNeed(fresh, "mileage_unconfirmed", "waived", "Odometer photo accepted")); return w.needs_review.find(n => n.id === "mileage_unconfirmed").state === "waived"; })());
// ---------- THE NEW CASE FORM, PHOTOS AND CONDITION THROUGH THE ACTIONS (Lane D, Nov 9 2026, for Lane E's walkthrough). The engine is the real read over Lane B's fake archive, called through ctx.readSheet.
// CLASS: any road that creates or changes a case must leave the stored market reference current (case.desk.key is the key of the case as it now stands) and answer with the full case view in the same call, so the page never needs a second read.
{ const A = await import(pathToFileURL(path.join(root, "lib/desk/sheetActions.js")).href), SS = await import(pathToFileURL(path.join(root, "lib/desk/sheetStore.js")).href);
  const store = SS.memoryStore(), org = "w", n0 = () => calls.length, ctx = { now: T, env: {}, org, seat: "ava", store, orgSettings: { name: "Hagerty" }, readSheet: async (e, input) => read(input) };
  const run = (a, b) => A.handleSheetAction(a, b, ctx), JPG = Buffer.from("/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAMABADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAABf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJQA0If/2Q==", "base64").toString("base64");
  const fresh = (cv) => cv.desk && cv.desk.key === K.recallKey(cv);
  const c0 = n0(), nw = await run("case_new", { text: "1999 Porsche 911 Carrera", mileage: "61,200", transmission: "Manual", body: "Coupe", colour: "Silver", seller_name: "Hal Moreau", asking_price: "58,000", seller_notes: "Garaged since 2015" });
  ok("case_new from the form creates the stored sheet and the case and calls the engine, at most twice (the start, then the check of the reserve it took)", nw.ok && n0() - c0 >= 1 && n0() - c0 <= 2 && (await store.get(org, nw.id)).case && nw.recalled === true, nw.why || ("calls " + (n0() - c0)));
  ok("every field the form sent is the seller's (source seller), mileage and gearbox and body and colour", ["mileage", "transmission", "body", "colour"].every(k => nw.case.fields[k].source === "seller" && nw.case.fields[k].value != null) && nw.case.fields.mileage.value === 61200);
  ok("the seller's name, asking price and notes ride on the case", nw.case.seller && nw.case.seller.name === "Hal Moreau" && nw.case.seller.asking_price === 58000 && nw.case.seller.notes === "Garaged since 2015");
  ok("the words the seller left out are named by the engine's decode (vin_decoded), never over the seller's own", nw.case.fields.year.value === 1999 && nw.case.fields.year.source === "vin_decoded" && nw.case.fields.make.value === "Porsche" && nw.case.fields.body.source === "seller");
  ok("case_new answers the full case view with the market reference: evidence, original, comparables, outside, quarters, live, condition, factors", nw.case.desk && ["evidence", "original", "comparables", "outside", "quarters", "live", "condition", "factors"].every(k => k in nw.case.desk) && nw.case.desk.evidence.count > 0 && nw.case.stage && nw.case.queue && nw.case.handling.lines.length === 4);
  ok("the market reference is stored under the key of the case as it stands, so the next edit costs no read", fresh(nw.case));
  { const o = await run("case_new", { text: "1999 Porsche 911 Carrera", mileage: "61,200", transmission: "Manual", body: "Cabriolet" }); ok("a body the seller gave stays the seller's even when the decode names another (never overwritten)", o.ok && o.case.fields.body.value === "Cabriolet" && o.case.fields.body.source === "seller"); }
  const c1 = n0(); const rs = await run("case_edit", { id: nw.id, op: "reserve", patch: { why: "A note." } }); ok("an edit that moves no engine input costs no read after case_new", rs.ok && n0() === c1 && rs.recalled === false);
  { const cid = nw.case.desk.comparables.find(x => x.inPopulation).id, n0c = nw.case.desk.evidence.count;
    const ex1 = await run("case_edit", { id: nw.id, op: "exclude", saleId: cid, scope: "market_calc", reason: "Salvage title" });
    const rs1 = await run("case_edit", { id: nw.id, op: "restore", saleId: cid });
    ok("restore by sale id re-asks the engine, the count is back, the exclusion is gone and the touched row comes back without it", ex1.ok && ex1.case.desk.evidence.count === n0c - 1 && rs1.ok && rs1.recalled === true && rs1.case.desk.evidence.count === n0c && rs1.case.exclusions.length === 0 && Array.isArray(rs1.rows) && rs1.rows.length === 1 && String(rs1.rows[0].id) === String(cid) && !rs1.rows[0].exclusion && !rs1.rows[0].gone);
    ok("restore is audited and the audit line is the table's", rs1.case.audit.some(a => a.what === "sale restored" && a.line === "The analyst put an excluded sale back."));
    const rs2 = await run("case_edit", { id: nw.id, op: "restore", saleId: cid });
    ok("restoring a sale that is not excluded is refused and nothing is written", rs2.refused === true && /not excluded/.test(rs2.why));
    const ex2 = await run("case_edit", { id: nw.id, op: "exclude", saleId: cid, scope: "note_only", reason: "Seen" }), n3 = n0();
    const rs3 = await run("case_edit", { id: nw.id, op: "restore", saleId: cid });
    ok("restoring a note only exclusion costs no read", ex2.ok && rs3.ok && n0() === n3 && rs3.case.exclusions.length === 0);
    // THE CLASS: every scope, every way to exclude, is restorable by the same op
    let bad = []; for (const sc of ["market_calc", "report_comps", "note_only"]) { const e = await run("case_edit", { id: nw.id, op: "exclude", saleId: cid, scope: sc, reason: "Class sweep" }), r = await run("case_edit", { id: nw.id, op: "restore", saleId: cid }); if (!(e.ok && r.ok && r.case.exclusions.length === 0)) bad.push(sc); }
    ok("a sale excluded under any of the three scopes is put back by one restore", bad.length === 0, bad.join()); }
  // a form with nothing to read makes an empty case with no engine call
  { const c = n0(), e = await run("case_new", {}); ok("an empty form makes an empty case and asks the engine nothing", e.ok && n0() === c && !e.case.desk && e.case.fields.vin.value == null); }
  // photos
  const ph1 = await run("case_edit", { id: nw.id, op: "photo_add", name: "front.jpg", data: JPG }), ph2 = await run("case_edit", { id: nw.id, op: "photo_add", name: "rear.jpg", data: JPG });
  const stored = await store.get(org, nw.id);
  ok("photo_add on a fresh case stores the real image through the photo table and the sheet", ph1.ok && stored.submission.photos.length === 2 && stored.submission.photos.every(p => p.id && p.url));
  ok("the case view serves each picture to the page (an address per photo item) and the first photo is the cover", ph2.case.photos.items.length === 2 && ph2.case.photos.items.every(p => p.url) && ph2.case.photos.coverId === ph1.case.photos.items[0].id && ph2.case.photos.coverId !== ph2.case.photos.items[1].id);
  ok("the second photo is not the cover and both are selected for the report", ph2.case.photos.reportIds.length === 2);
  ok("a file that is not a picture is refused and nothing is stored", (await run("case_edit", { id: nw.id, op: "photo_add", name: "x.jpg", data: Buffer.from("not a picture at all").toString("base64") })).ok === false && (await store.get(org, nw.id)).submission.photos.length === 2);
  // condition
  const base = nw.case.desk.evidence, cc = n0(), good = await run("case_edit", { id: nw.id, op: "condition", selected: { tier: 3, name: "Good" } });
  ok("a condition change takes the engine's view for the tier from the case, makes no read, and answers the updated case view in the same call", good.ok && good.recalled === false && n0() - cc === 0 && good.case.desk.view.tier === 3 && good.case.condition.selected.tier === 3);
  ok("the same answer carries evidence, original, comparables and the case lines (no second read)", good.case.desk.evidence && good.case.desk.original && good.case.desk.comparables.length && good.case.stage && good.case.handling.lines.length === 4 && fresh(good.case));
  ok("Good has real sales: the range moved from the untiered one, with its own count", good.case.desk.evidence.insufficient === false && good.case.desk.evidence.count !== base.count && good.case.desk.evidence.q1 !== base.q1 && good.case.desk.original.count === good.case.desk.evidence.count);
  const exc = await run("case_edit", { id: nw.id, op: "condition", selected: { tier: 2, name: "Excellent" } }), fair = await run("case_edit", { id: nw.id, op: "condition", selected: { tier: 4, name: "Fair" } });
  for (const [nm, r] of [["Excellent", exc], ["Fair", fair]]) ok(`${nm} has too few sales: the engine's insufficient sentence is the answer, never a flat range`, r.ok && r.case.desk.evidence.insufficient === true && /too few sales/.test(r.case.desk.evidence.sentence || "") && r.case.desk.evidence.median == null && r.case.desk.evidence.q1 == null && r.case.desk.evidence.q3 == null && r.case.desk.evidence.low == null);
  ok("the three rungs do not read alike: Good has a range, Excellent and Fair say how many sales they hold", good.case.desk.evidence.median != null && exc.case.desk.evidence.sentence !== fair.case.desk.evidence.sentence);
  // THE CLASS: every road that moves an engine input leaves the stored reference current, in one call, with the full view
  const roads = [["mileage", { op: "field", field: "mileage", value: 70000 }], ["transmission", { op: "field", field: "transmission", value: "Tiptronic" }], ["body", { op: "field", field: "body", value: "Cabriolet" }], ["condition", { op: "condition", selected: { tier: 3, name: "Good" } }], ["a market_calc exclusion", { op: "exclude", saleId: good.case.desk.comparables.find(x => x.inPopulation).id, scope: "market_calc", reason: "Salvage title" }]];
  for (const [nm, b] of roads) { const c = n0(), r = await run("case_edit", { id: nw.id, ...b }); ok(`${nm}: one engine call at most, and the answer's market reference is current for the case it carries`, r.ok && n0() - c <= 2 && fresh(r.case) && r.case.desk.evidence && Array.isArray(r.case.desk.comparables), r.why || `calls ${n0() - c}`); }
}

// ---------- THE QUEUE OPS: case_archive, case_restore, case_delete (Lane D, Nov 12 2026, for Lane S). CLASS: whatever the stage a case is at (new, review, ready, final, sent), archive keeps everything and takes it out of the working groups, restore puts it back at the stage it had, and delete never removes a finalized, a sent or a seeded sample case.
{ const A = await import(pathToFileURL(path.join(root, "lib/desk/sheetActions.js")).href), SS = await import(pathToFileURL(path.join(root, "lib/desk/sheetStore.js")).href), PV = await import(pathToFileURL(path.join(root, "lib/preview/deskPreview.js")).href);
  const store = SS.memoryStore(); store.reset(); await PV.seedPreviewStore(store, { seat: "crew" });
  const org = PV.PREVIEW_ORG.id, ctx = (o = {}) => ({ now: T, env: {}, org, seat: "crew", store, orgSettings: { name: "Hagerty" }, readSheet: async () => null, ...o }), run = (a, b, o) => A.handleSheetAction(a, b, ctx(o));
  const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF").toString("base64");
  const mk = await run("case_new", { year: "1999", make: "Porsche", model: "911" }); ok("a case to work with", mk.ok === true && mk.case.stage === "new", String(mk.why));
  const doc = await run("case_edit", { id: mk.id, op: "doc_add", kind: "invoice", title: "Service invoice", name: "inv.pdf", data: PDF }); ok("a document is added to it", doc.ok === true && doc.case.documents.length === 1, String(doc.why));
  const before = (await run("case_get", { id: mk.id })).case, qBefore = before.queue, st0 = before.stage;   // the stage it has now (the document edit moved it from new to review)
  // archive
  const ar = await run("case_archive", { id: mk.id });
  ok("case_archive answers the case view at stage archived, remembering the stage it had", ar.ok === true && ar.case.stage === "archived" && ar.case.archived && ar.case.archived.from === st0 && ar.id === mk.id, String(ar.why));
  ok("it is out of the working groups: the queue counts it as archived and not as new", ar.queue.archived === qBefore.archived + 1 && ar.queue[st0] === qBefore[st0] - 1, J([qBefore, ar.queue]));
  ok("it keeps everything: the document, the fields, the photos and the market reference", ar.case.documents.length === 1 && ar.case.documents[0].id === doc.case.documents[0].id && J(ar.case.fields) === J(before.fields) && ar.case.photos.items.length === before.photos.items.length);
  ok("it records a handling line, in the table's words", ar.case.handling.archiveLines.length === 1 && /^Archived by crew on /.test(ar.case.handling.archiveLines[0]) && new RegExp("from the " + st0 + " stage").test(ar.case.handling.archiveLines[0]), J(ar.case.handling.archiveLines));
  ok("the working queue no longer lists it and the archived view does", !(await run("sheet_queue", { view: "company" })).rows.some(r => r.id === mk.id) && (await run("sheet_queue", { view: "archived" })).rows.some(r => r.id === mk.id));
  ok("an archived case cannot be edited, and cannot be archived twice", (await run("case_edit", { id: mk.id, op: "field", field: "colour", value: "Red" })).ok === false && (await run("case_archive", { id: mk.id })).ok === false);
  // restore
  const rs = await run("case_restore", { id: mk.id });
  ok("case_restore returns it to the stage it had", rs.ok === true && rs.case.stage === st0 && rs.case.archived === null && rs.queue[st0] === qBefore[st0] && rs.queue.archived === qBefore.archived, J(rs.queue) + String(rs.why));
  ok("restored, it holds the document still and a second handling line", rs.case.documents.length === 1 && rs.case.handling.archiveLines.length === 2 && /^Restored by crew/.test(rs.case.handling.archiveLines[1]));
  ok("restore refuses a case that is not archived", (await run("case_restore", { id: mk.id })).ok === false);
  ok("only the owner may archive, restore or delete", ["case_archive", "case_restore", "case_delete"].every(a => run(a, { id: mk.id }, { seat: "someone else" }).then(x => x.ok === false) !== null) && (await run("case_archive", { id: mk.id }, { seat: "someone else" })).ok === false && (await run("case_delete", { id: mk.id }, { seat: "someone else" })).ok === false && !!(await store.get(org, mk.id)));
  // every stage: a case at each stage is archived and restored to that same stage
  const stages = []; for (const row of await store.list(org)) stages.push([row.id, (await run("case_get", { id: row.id })).case.stage]);
  for (const [id, st] of stages) { const a = await run("case_archive", { id }), r = await run("case_restore", { id }); ok(`archive then restore of a case at stage ${st} (${id}) returns it to ${st}`, a.ok === true && a.case.stage === "archived" && a.case.archived.from === st && r.ok === true && r.case.stage === st, J([a.why, r.why, r.ok && r.case.stage])); }
  // the finalized sample: archived and restored, never deleted; a sent case: never deleted
  const fin0 = stages.find(x => x[1] === "final"), fin = ["fin-copy-1"]; { const f0 = await store.get(org, fin0[0]); await store.insert(org, { ...f0, id: fin[0], demo: false }); }   // the finalized sample copied as an ordinary finalized case (its own id): the finalized guard is tested on its own, the sample guard below
  ok("a finalized case is not deleted (archive it instead), and is still there", !!fin && (await run("case_delete", { id: fin[0] })).ok === false && /archive it instead/.test((await run("case_delete", { id: fin[0] })).why) && !!(await store.get(org, fin[0])));
  await store.markSent(org, fin[0], T, "seller@example.com");
  const sentDel = await run("case_delete", { id: fin[0] }); ok("a sent case is not deleted either", sentDel.ok === false && !!(await store.get(org, fin[0])), String(sentDel.why));
  const sentAr = await run("case_archive", { id: fin[0] }), sentRs = await run("case_restore", { id: fin[0] }); ok("a sent case is archived and restored to sent", sentAr.ok && sentAr.case.archived.from === "sent" && sentRs.ok && sentRs.case.stage === "sent", J([sentAr.why, sentRs.why]));
  ok("a seeded sample case is never deleted", (await Promise.all(stages.filter(x => x[0] !== mk.id).map(x => run("case_delete", { id: x[0] })))).every(r => r.ok === false && /demonstration case|archive it instead/.test(r.why)) && (await store.list(org)).length === stages.length + 1);
  // delete
  const del = await run("case_delete", { id: mk.id });
  ok("case_delete removes an ordinary case through the logged path and answers the queue and a handling line", del.ok === true && del.gone === true && (await store.get(org, mk.id)) === null && /^Deleted by crew/.test(del.handlingLine) && del.queue[st0] === qBefore[st0] - 1, J(del));
  ok("a deleted case is gone from the lists", !(await run("sheet_queue", { view: "company" })).rows.some(r => r.id === mk.id) && (await run("case_get", { id: mk.id })).ok === false);
}
// ---------- THE SELLER'S STATEMENT FOR A FACT THE CASE LACKS (Lane D, Nov 12 2026; Sam's second run: Mark verified on the accident history was refused because the field was empty). CLASS: the accident history, the service history and the mileage, each taken as the seller's statement inline, saved to the fact, then verified; or waived, and the report says the fact is unverified.
{ const A = await import(pathToFileURL(path.join(root, "lib/desk/sheetActions.js")).href), SS = await import(pathToFileURL(path.join(root, "lib/desk/sheetStore.js")).href), R = await import(pathToFileURL(path.join(root, "lib/desk/reportState.js")).href), fs = await import("node:fs");
  const store = SS.memoryStore(); store.reset(); const org = "w", ctx = { now: T, env: {}, org, seat: "ava", store, orgSettings: { name: "Hagerty" }, readSheet: async () => null }, run = (a, b) => A.handleSheetAction(a, b, ctx);
  const mk = await run("case_new", { year: "1999", make: "Porsche", model: "911" }), id = mk.id;
  const need = (c, n) => c.needs_review.find(x => x.id === n);
  for (const [needId, field, said, verifiedLine] of [["accident_unclear", "accident_history", "No accidents, one parking scrape in 2012", "accident"], ["service_documents", "service_history", "Serviced every year at Rennsport, IMS done in 2019", "service"], ["mileage_unconfirmed", "mileage", "61,400 miles", "mileage"]]) {
    const c0 = (await run("case_get", { id })).case;
    if (field !== "mileage") ok(`${field}: the field is empty and Mark verified is refused with a reason`, c0.fields[field].value == null && (await run("case_edit", { id, op: "verify", field })).ok === false);
    const empty = await run("case_edit", { id, op: "seller_said", field, text: "   " }); ok(`${field}: an empty statement is refused`, empty.ok === false && /Type what the seller said/.test(empty.why), String(empty.why));
    const sd = await run("case_edit", { id, op: "seller_said", field, text: said });
    ok(`${field}: the seller's statement is saved to the fact, as the seller's and not verified`, sd.ok === true && sd.case.fields[field].value != null && sd.case.fields[field].source === "seller" && sd.case.fields[field].verified === false, String(sd.why));
    const v = await run("case_edit", { id, op: "verify", field });
    ok(`${field}: Mark verified now works and closes ${needId}`, v.ok === true && v.case.fields[field].verified === true && (needId === "service_documents" || need(v.case, needId).state === "done" || !need(v.case, needId)), String(v.why));
  }
  // proceed without: the item is waived and the report says the fact is not verified
  const mk2 = await run("case_new", { year: "1999", make: "Porsche", model: "911", mileage: "50,000" }), id2 = mk2.id;
  for (const [needId, re] of [["accident_unclear", /accident history has not been verified/], ["service_documents", /service history has not been verified/], ["mileage_unconfirmed", /mileage has not been verified/]]) {
    const w = await run("case_edit", { id: id2, op: "need", item: needId, state: "waived", reason: "The seller could not say" });
    const sh = await store.get(org, id2), lines = R.reportState(sh.case).noteLines.concat(R.reportState(sh.case).pleaseNote || []);
    ok(`${needId}: proceeding without waives it and the report prints that the fact is unverified`, w.ok === true && need(w.case, needId).state === "waived" && lines.some(l => re.test(l)), J(lines) + String(w.why));
  }
  const sh2 = await store.get(org, id2), c2 = sh2.case; await run("case_edit", { id: id2, op: "seller_said", field: "accident_history", text: "None" }); await run("case_edit", { id: id2, op: "verify", field: "accident_history" });
  ok("once the fact is verified the report no longer says it is unverified", !R.reportState((await store.get(org, id2)).case).noteLines.some(l => /accident history has not been verified/.test(l)));
  const cl = fs.readFileSync(path.join(root, "lib/preview/deskV4Client.js"), "utf8");
  ok("the needs-attention item asks What the seller said inline, saves it with seller_said, and keeps Proceed without", /placeholder: "What the seller said"/.test(cl) && /edit\("seller_said"/.test(cl) && /text: "Proceed without"/.test(cl));
}
// ---------- WHAT WE TOOK INTO ACCOUNT IS THE ANALYST'S LIST (Lane D, Nov 12 2026), and ONE DOCUMENT LIST. CLASS: every road that adds a document (the Documents card, the needs-attention Received pill, a forwarded email) lists it once in case.documents; the report prints the case's own considered list.
{ const A = await import(pathToFileURL(path.join(root, "lib/desk/sheetActions.js")).href), SS = await import(pathToFileURL(path.join(root, "lib/desk/sheetStore.js")).href), R = await import(pathToFileURL(path.join(root, "lib/desk/reportState.js")).href);
  const store = SS.memoryStore(); store.reset(); const org = "w", ctx = { now: T, env: {}, org, seat: "ava", store, orgSettings: { name: "Hagerty" }, readSheet: async () => null }, run = (a, b) => A.handleSheetAction(a, b, ctx);
  const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF").toString("base64");
  const mk = await run("case_new", { year: "1999", make: "Porsche", model: "911" }), id = mk.id;
  // a document through the Received pill (kind invoice, a service invoice) and one through the Documents card (kind title): both are in the one list, once
  const a = await run("case_edit", { id, op: "doc_add", kind: "invoice", title: "inv1", name: "inv1.pdf", data: PDF }), b = await run("case_edit", { id, op: "doc_add", kind: "title", title: "title", name: "title.pdf", data: PDF });
  ok("a document added through the Received pill and one through the Documents card both list, once each", a.ok && b.ok && b.case.documents.length === 2 && new Set(b.case.documents.map(d => d.id)).size === 2 && b.case.documentsLine && /2 on file/.test(b.case.documentsLine), J(b.case.documents.map(d => d.name)) + String(b.case.documentsLine));
  // a document that lives only on the sheet's own list (a forwarded email's attachment, an older road) is listed too
  const sh = await store.get(org, id); sh.submission = { ...sh.submission, documents: [...(sh.submission.documents || []), { id: "mailed1", name: "mailed.pdf", kind: "other", bytes: 10 }] }; await store.put(org, sh);
  const g = (await run("case_get", { id })).case; ok("a document held only on the sheet's list shows in Documents too, and the line counts it", g.documents.some(d => d.id === "mailed1" && d.status === "received") && g.documents.length === 3 && /3 on file/.test(g.documentsLine), J(g.documents.map(d => d.id)) + String(g.documentsLine));
  // considered
  const c0 = (await run("case_get", { id })).case; ok("the list starts as the engine's items (none here: no read), and the report prints the case's list", Array.isArray(c0.considered) && J(R.reportState((await store.get(org, id)).case).v4.considered) === J(c0.considered.map(i => ({ title: i.title, text: i.text }))));
  const add = await run("case_edit", { id, op: "considered_add", title: "The 2012 paint repair", text: "A repaint of the left door in 2012, as the seller told us." }); ok("the analyst adds an item, and the report prints it", add.ok && add.case.considered.length === 1 && add.case.considered[0].edited === true && R.reportState((await store.get(org, id)).case).v4.considered.some(x => x.title === "The 2012 paint repair"), String(add.why));
  const ed = await run("case_edit", { id, op: "considered_edit", item: add.case.considered[0].id, text: "A repaint of the left door in 2012." }); ok("the analyst edits it, and the edit is stored on the case and printed", ed.ok && ed.case.considered[0].text === "A repaint of the left door in 2012." && R.reportState((await store.get(org, id)).case).v4.considered[0].text === "A repaint of the left door in 2012.");
  // an engine item is the start: edited and removed
  const sh3 = await store.get(org, id); sh3.case.desk = { ...(sh3.case.desk || {}), considered: [{ key: "mileage", title: "Mileage", line: "Reported by the seller and outstanding until verified." }, { key: "paint", title: "Paint", line: "Taken into account, but the sales do not isolate an effect." }] }; await store.put(org, sh3);
  const g3 = (await run("case_get", { id })).case; ok("the engine's items join the list as its start", g3.considered.length === 3 && g3.considered.filter(i => i.key && i.key.startsWith("e:")).length === 2, J(g3.considered.map(i => i.key)));
  const mi = g3.considered.find(i => i.key === "e:mileage"), e2 = await run("case_edit", { id, op: "considered_edit", item: mi.id, text: "The seller's odometer reading, checked against the photo." }), r2 = await run("case_edit", { id, op: "considered_remove", item: g3.considered.find(i => i.key === "e:paint").id });
  const out = R.reportState((await store.get(org, id)).case).v4.considered;
  ok("an engine item can be edited and another removed: the report prints the edit and not the removed item", e2.ok && r2.ok && out.some(x => x.text === "The seller's odometer reading, checked against the photo.") && !out.some(x => x.title === "Paint"), J(out));
  const sh4 = await store.get(org, id); sh4.case.desk.considered = [...sh4.case.desk.considered, { key: "paint", title: "Paint", line: "Taken into account, but the sales do not isolate an effect." }]; await store.put(org, sh4);
  ok("a removed item is never put back, and an edited one keeps the analyst's words when the engine's line moves", !R.reportState((await store.get(org, id)).case).v4.considered.some(x => x.title === "Paint") && R.reportState((await store.get(org, id)).case).v4.considered.some(x => x.text === "The seller's odometer reading, checked against the photo."));
  ok("an empty item is refused", (await run("case_edit", { id, op: "considered_add", title: "x", text: "  " })).ok === false);
}
console.log(`deskWorkflowCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
