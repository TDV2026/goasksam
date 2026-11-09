// Desk v3 stage 2: readiness. Each blocker alone blocks; optional missing things never do. node scripts/deskReadinessCheck.mjs [rootDir]
import path from "node:path"; import { setup } from "./_deskCaseWorld.mjs";
const root = path.resolve(process.argv[2] || "."), { M, K, readyCase, T } = await setup(root);
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) pass++; else { fail++; console.log("FAIL " + n + (d ? "  " + d : "")); } };
const base = await readyCase(), r0 = K.readinessOf(base);
ok("the fully filled case is ready, and its status is ready", r0.ready && base.status === "ready", JSON.stringify(r0.blockers));
const clone = x => structuredClone(x), only = (name, c, key) => { const r = K.readinessOf(c); ok(name + ": blocked by exactly that one blocker", !r.ready && r.blockers.length === 1 && r.blockers[0].key === key, JSON.stringify(r.blockers.map(b => b.key))); };
const ev = base.desk.evidence;
// each blocker alone
{ const c = clone(base); c.fields.vin = { value: null, source: "missing", verified: false, candidates: [] }; c.fields.model = { value: null, source: "missing", verified: false, candidates: [] }; only("vehicle not identified", c, "vehicle"); }
{ const c = clone(base); c.needs_review.push({ id: "x", label: "Something material", material: true, state: "open", reason: "" }); only("an open material item", c, "need:x"); }
{ const c = clone(base); c.assessment.figure = null; only("no assessment figure", c, "assessment"); }
{ const c = K.setAssessment(base, { figure: ev.high + 5000 }, T); only("an assessment above the evidence range with no long explanation", c, "assessment_range"); }
{ const c = clone(base); c.assessment.explanation = ""; only("no assessment explanation", c, "explanation"); }
{ const c = clone(base); c.reserve.figure = null; only("no reserve figure", c, "reserve"); }
{ const c = K.setReserve(base, { figure: ev.q3 + 2000 }, T); only("a reserve above q3 with a short rationale", c, "reserve_range"); }
{ const c = clone(base); c.reserve.rationale = ""; only("no reserve rationale", c, "rationale"); }
{ const c = clone(base); c.photos = { items: [], coverId: null, reportIds: [] }; only("no photo", c, "photo"); }
{ const c = clone(base); c.selectedComparables = []; only("no comparable selected", c, "comparable"); }
// an explanation of 60 characters lifts the two range blockers
const long = "x".repeat(60);
ok("an assessment outside the range with an explanation of 60 characters is not blocked", K.readinessOf(K.setAssessment(base, { figure: ev.high + 5000, explanation: long }, T)).ready);
ok("59 characters is not enough", !K.readinessOf(K.setAssessment(base, { figure: ev.high + 5000, explanation: "x".repeat(59) }, T)).ready);
ok("a reserve above q3 with a rationale of 60 characters is not blocked", K.readinessOf(K.setReserve(base, { figure: ev.q3 + 2000, rationale: long }, T)).ready);
ok("a reserve exactly at q3 is not blocked", K.readinessOf(K.setReserve(base, { figure: ev.q3 }, T)).ready);
ok("an assessment exactly at the evidence low and high edges is not blocked", K.readinessOf(K.setAssessment(base, { figure: ev.low }, T)).ready && K.readinessOf(K.setAssessment(base, { figure: ev.high }, T)).ready);
// optional things never block
{ const c = clone(base); c.documents = []; c.fields.colour = { value: null, source: "missing", verified: false, candidates: [] }; c.fields.trim = { value: null, source: "missing", verified: false, candidates: [] }; c.condition = { suggested: null, selected: null }; c.factors = []; c.photos.items = c.photos.items.slice(0, 1);
  const r = K.readinessOf(K.syncNeeds(c)); ok("no documents, colour, trim, condition or factors never block (a non material item may stay open)", r.ready, JSON.stringify(r.blockers)); }
{ const c = K.setNeed(K.syncNeeds((() => { const x = clone(base); x.documents = []; return x; })()), "service_documents", "open"); ok("an open non material item does not block", K.readinessOf(c).ready); }
// waiving a material item with a reason lifts its block
{ let c = clone(base); c.fields.mileage.verified = false; c = K.syncNeeds(c); ok("an unverified mileage opens a material item that blocks", !K.readinessOf(c).ready); c = K.setNeed(c, "mileage_unconfirmed", "waived", "Seller sent the odometer photo, accepted."); ok("waived with a reason, it no longer blocks", K.readinessOf(c).ready); }
// insufficient evidence: no range to be inside, so an explanation is the only way
{ const c = clone(base); c.desk.evidence = { ...c.desk.evidence, low: null, high: null, q3: null, insufficient: true }; ok("with no evidence range both figures need their explanation", K.readinessOf(c).blockers.map(b => b.key).sort().join() === "assessment_range,reserve_range"); }
console.log(`deskReadinessCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
