// Desk v3 stage 1: the case record. node scripts/deskCaseCheck.mjs [rootDir]
import path from "node:path"; import { pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || "."), imp = f => import(pathToFileURL(path.join(root, f)).href);
const M = await imp("lib/desk/caseModel.js"), A = await imp("lib/desk/sheetActions.js"), { memoryStore } = await imp("lib/desk/sheetStore.js");
let pass = 0, fail = 0; const ok = (n, c) => { if (c) pass++; else { fail++; console.log("FAIL " + n); } }; const throws = f => { try { f(); return false; } catch { return true; } };
const T = "2026-11-08T10:00:00.000Z";
// manual creation with no lead data
const blank = M.newCase({ now: T });
ok("a case with no lead data exists", blank.status === "new" && blank.version === 1 && blank.lead_ref === null && blank.seller === null);
ok("every field starts missing", M.FIELD_KEYS.every(k => blank.fields[k].source === "missing" && blank.fields[k].value === null));
ok("the record carries every part of the shape", ["org", "lead_ref", "seller", "submitted_at", "opened_at", "status", "fields", "photos", "documents", "needs_review", "condition", "assessment", "reserve", "factors", "exclusions", "audit", "version"].every(k => k in blank) && "suggested" in blank.condition && "selected" in blank.condition && ["figure", "low", "high", "explanation"].every(k => k in blank.assessment) && ["figure", "rationale", "seller_agreed"].every(k => k in blank.reserve));
ok("the sources are exactly the seven (last_sale, the VIN's own last listing, is the newest)", M.SOURCES.join() === "seller,vin_decoded,last_sale,records,analyst_verified,missing,conflicting");
// one source per field, conflicts
let c = M.setField(blank, "year", 2008, "seller", { by: "intake", now: T });
ok("a value carries its source", c.fields.year.value === 2008 && c.fields.year.source === "seller" && !c.fields.year.verified);
c = M.setField(c, "year", 2007, "vin_decoded", { by: "intake", now: T });
ok("two sources that disagree make the field conflicting, both kept, the held value stays", c.fields.year.source === "conflicting" && c.fields.year.value === 2008 && c.fields.year.candidates.length === 2);
c = M.setField(c, "year", 2008, "analyst_verified", { now: T });
ok("the analyst settles a conflict and the field is verified", c.fields.year.source === "analyst_verified" && c.fields.year.verified === true);
ok("a source that is not a source is refused", throws(() => M.setField(c, "year", 2008, "guess")) && throws(() => M.setField(c, "mood", 1, "seller")));
ok("the input is never changed in place", blank.fields.year.value === null);
// asked once
let a = M.markAsked(blank, ["mileage", "transmission"], T);
ok("a field asked once is not asked again", !M.stillToAsk(a).includes("mileage") && M.stillToAsk(blank).includes("mileage"));
ok("asking twice records once", M.markAsked(a, ["mileage"], T).asked.filter(k => k === "mileage").length === 1);
ok("a field already answered is not asked", !M.stillToAsk(M.setField(blank, "mileage", "42,100", "seller", { now: T })).includes("mileage"));
// mileage in one place
const withMi = M.setField(blank, "mileage", "42,100 mi", "seller", { now: T });
ok("mileage is one number in one place", M.mileageOf(withMi) === 42100 && JSON.stringify({ ...withMi, audit: [] }).split('"mileage"').length === 2);
// photos append only, cover, selection
let p = M.addPhoto(M.addPhoto(blank, { id: "a", name: "front" }, T), { id: "b", name: "rear" }, T);
ok("the first photo is the cover", p.photos.coverId === "a" && p.photos.items.length === 2);
ok("photos append only: no remove, a repeat adds nothing", M.addPhoto(p, { id: "a" }, T).photos.items.length === 2 && !("removePhoto" in M));
ok("the cover must be a photo of the case", throws(() => M.setCover(p, "zzz")) && M.setCover(p, "b").photos.coverId === "b");
ok("the report selection keeps the cover in", M.selectForReport(p, ["b"]).photos.reportIds.includes("a"));
// needs review, exclusions
let n = M.addNeed(blank, { id: "mileage", label: "Mileage not confirmed", material: true });
ok("a need starts open", n.needs_review[0].state === "open");
ok("a waived need needs a reason", throws(() => M.setNeed(n, "mileage", "waived", "")) && M.setNeed(n, "mileage", "waived", "seller confirmed by phone").needs_review[0].reason.length > 0);
ok("an exclusion needs a reason and a scope", throws(() => M.excludeSale(blank, { saleId: "s1", scope: "market_calc", reason: "" })) && throws(() => M.excludeSale(blank, { saleId: "s1", scope: "x", reason: "y" })));
ok("an exclusion is kept once with its time", (() => { const e = M.excludeSale(M.excludeSale(blank, { saleId: "s1", scope: "market_calc", reason: "salvage", now: T }), { saleId: "s1", scope: "market_calc", reason: "salvage" }); return e.exclusions.length === 1 && e.exclusions[0].at === T; })());
// a sheet from before V3 gets a case built from what it holds
const old = { id: "x1", vin: "WP0AB29978S765432", created_at: T, opened_at: null, submission: { typed: false, mileage: 42100, consignor: { name: "Ann", email: "a@x.com" }, photos: [{ id: "p1", name: "f" }], documents: [{ id: "d1", name: "svc", kind: "service" }] } };
const ec = M.ensureCase(old);
ok("an older sheet gets a case from its submission, mileage once, photos and documents in", ec.fields.vin.value === old.vin && ec.fields.mileage.source === "seller" && ec.photos.coverId === "p1" && ec.documents.length === 1 && ec.lead_ref === "x1" && ec.seller.name === "Ann");
ok("a typed sheet's own entries are the analyst's", M.ensureCase({ ...old, submission: { ...old.submission, typed: true, consignor: null } }).fields.mileage.source === "analyst_verified");
// the actions
const store = memoryStore(); const ctx = { org: "t", seat: "crew", store, now: T, env: {} };
const r1 = await A.handleSheetAction("case_new", {}, ctx);
ok("case_new with nothing typed works", r1.ok && r1.case.status === "new" && r1.case.fields.vin.source === "missing");
const r2 = await A.handleSheetAction("case_get", { id: r1.id }, ctx);
ok("case_get returns the stored case", r2.ok && r2.case.version === 1);
const r3 = await A.handleSheetAction("case_new", { vehicle: { year: 2008, make: "Porsche", model: "911", mileage: "42,100" } }, ctx);
ok("case_new with what the analyst knows keeps it, mileage in one place", r3.case.fields.make.value === "Porsche" && r3.case.fields.mileage.value === 42100 && r3.case.fields.year.source === "analyst_verified");
ok("case_get on a sheet that is not there is refused", (await A.handleSheetAction("case_get", { id: "nope" }, ctx)).refused === true);
console.log(`deskCaseCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
