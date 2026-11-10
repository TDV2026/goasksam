// Desk v3 stage 2: readiness. Each blocker alone blocks; optional missing things never do. node scripts/deskReadinessCheck.mjs [rootDir]
import path from "node:path"; import { setup } from "./_deskCaseWorld.mjs";
const root = path.resolve(process.argv[2] || "."), { M, K, read, readyCase, T, today } = await setup(root);
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) pass++; else { fail++; console.log("FAIL " + n + (d ? "  " + d : "")); } };
const base = await readyCase(), r0 = K.readinessOf(base);
ok("the fully filled case is ready, and its status is ready", r0.ready && base.status === "ready", JSON.stringify(r0.blockers));
const clone = x => structuredClone(x), only = (name, c, key) => { const r = K.readinessOf(c); ok(name + ": blocked by exactly that one blocker", !r.ready && r.blockers.length === 1 && r.blockers[0].key === key, JSON.stringify(r.blockers.map(b => b.key))); };
const ev = base.desk.evidence;
// each blocker alone
{ const c = clone(base); c.fields.vin = { value: null, source: "missing", verified: false, candidates: [] }; c.fields.model = { value: null, source: "missing", verified: false, candidates: [] }; only("vehicle not identified", c, "vehicle"); }
{ const c = clone(base); c.needs_review.push({ id: "x", label: "Something material", material: true, state: "open", reason: "" }); only("an open material item", c, "need:x"); }
const at = async (f, extra = {}) => (await K.refreshEvidence(K.setReserve(base, { figure: f, ...extra }, T), read, { caseDate: today, now: T })).case;
{ const c = clone(base); c.reserve.figure = null; only("no reserve figure", c, "reserve"); }
only("a reserve above what the sales support, not the seller's request", await at(ev.q3 + 2000), "reserve_support");
{ const c = clone(base); c.reserve.why = ""; c.reserve.rationale = ""; only("no why for the reserve", c, "rationale"); }
{ const c = clone(base); c.photos = { items: [], coverId: null, reportIds: [] }; only("no photo", c, "photo"); }
{ const c = clone(base); c.selectedComparables = []; only("no comparable selected", c, "comparable"); }
ok("a reserve above the sales marked as the seller's request is not blocked", K.readinessOf(await at(ev.q3 + 2000, { sellerRequested: true })).ready);
ok("the mark is the analyst's: taking it off blocks again", !K.readinessOf(K.setReserve(await at(ev.q3 + 2000, { sellerRequested: true }), { sellerRequested: false }, T)).ready);
ok("a reserve exactly at q3 is supported", K.readinessOf(await at(ev.q3)).ready);
ok("a reserve below q1 is supported (the sales reached it)", K.readinessOf(await at(ev.q1 - 1)).ready);
ok("a figure the engine has not checked is not support", !K.readinessOf(K.setReserve(base, { figure: ev.q1 + 7 }, T)).ready);
// optional things never block
{ const c = clone(base); c.documents = []; c.fields.colour = { value: null, source: "missing", verified: false, candidates: [] }; c.fields.trim = { value: null, source: "missing", verified: false, candidates: [] }; c.condition = { suggested: null, selected: null }; c.factors = []; c.photos.items = c.photos.items.slice(0, 1);
  const r = K.readinessOf(K.syncNeeds(c)); ok("no documents, colour, trim, condition or factors never block (a non material item may stay open)", r.ready, JSON.stringify(r.blockers)); }
{ const c = K.setNeed(K.syncNeeds((() => { const x = clone(base); x.documents = []; return x; })()), "service_documents", "open"); ok("an open non material item does not block", K.readinessOf(c).ready); }
// waiving a material item with a reason lifts its block
{ let c = clone(base); c.fields.mileage.verified = false; c = K.syncNeeds(c); ok("an unverified mileage opens a material item that blocks", !K.readinessOf(c).ready); c = K.setNeed(c, "mileage_unconfirmed", "waived", "Seller sent the odometer photo, accepted."); ok("waived with a reason, it no longer blocks", K.readinessOf(c).ready); }
// insufficient evidence: no typical range, so nothing supports the reserve; the seller's request is the only way
{ const c = clone(base); c.desk.evidence = { ...c.desk.evidence, low: null, high: null, q3: null, insufficient: true }; c.desk.reserveCheck = { ...c.desk.reserveCheck, supported: null, position: null }; ok("with no typical range the reserve needs the seller's request", K.readinessOf(c).blockers.map(b => b.key).join() === "reserve_support" && K.readinessOf({ ...c, reserve: { ...c.reserve, sellerRequested: true } }).ready); }
console.log(`deskReadinessCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
