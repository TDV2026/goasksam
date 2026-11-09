// Desk v3 stage 2: correcting a field, the engine re-call, and needs review. The re-call is Lane B's real desk block read through sheetRead. node scripts/deskWorkflowCheck.mjs [rootDir]
import path from "node:path"; import { setup } from "./_deskCaseWorld.mjs";
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
const recall = async (name, c, want) => { const n0 = calls.length, r = await K.refreshEvidence(c, read, { caseDate: today, now: T }); ok(name + (want ? ": re-calls the engine" : ": does not re-call the engine"), r.recalled === want && (calls.length - n0) === (want ? 1 : 0), `calls ${calls.length - n0}`); return r.case; };
await recall("nothing changed", base, false);
await recall("a reserve edit", K.setReserve(base, { figure: 1 }, T), false);
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
await recall("a report scope exclusion", M.excludeSale(base, { saleId: pick[0], scope: "report", reason: "Not a fit", now: T }), false);
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
console.log(`deskWorkflowCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
