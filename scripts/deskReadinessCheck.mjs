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
// optional things never block (a missing document, colour, trim, condition or factor); an OPEN ITEM does, of every kind: Received and Proceed without both resolve it
{ const c = clone(base); c.fields.colour = { value: null, source: "missing", verified: false, candidates: [] }; c.fields.trim = { value: null, source: "missing", verified: false, candidates: [] }; c.condition = { suggested: null, selected: null }; c.factors = []; c.photos.items = c.photos.items.slice(0, 1);
  const r = K.readinessOf(K.syncNeeds(c)); ok("no colour, trim, condition or factors never block", r.ready, JSON.stringify(r.blockers)); }
{ const c = K.setNeed(K.syncNeeds((() => { const x = clone(base); x.documents = []; return x; })()), "service_documents", "open"); const r = K.readinessOf(c); ok("an open item of any kind blocks (here the service documents), by its own key", !r.ready && r.blockers.length === 1 && r.blockers[0].key === "need:service_documents", JSON.stringify(r.blockers)); ok("proceeding without it resolves it", K.readinessOf(K.setNeed(c, "service_documents", "waived", "Seller has none")).ready); }
// waiving a material item with a reason lifts its block
{ let c = clone(base); c.fields.mileage.verified = false; c = K.syncNeeds(c); ok("an unverified mileage opens a material item that blocks", !K.readinessOf(c).ready); c = K.setNeed(c, "mileage_unconfirmed", "waived", "Seller sent the odometer photo, accepted."); ok("waived with a reason, it no longer blocks", K.readinessOf(c).ready); }
// insufficient evidence: no typical range, so nothing supports the reserve; the seller's request is the only way
{ const c = clone(base); c.desk.evidence = { ...c.desk.evidence, low: null, high: null, q3: null, insufficient: true }; c.desk.reserveCheck = { ...c.desk.reserveCheck, supported: null, position: null }; ok("with no typical range the reserve needs the seller's request", K.readinessOf(c).blockers.map(b => b.key).join() === "reserve_support" && K.readinessOf({ ...c, reserve: { ...c.reserve, sellerRequested: true } }).ready); }
// THE FOUR CHECKS: each has its own line (the table's), pass or not, and Finalize needs all four
{ const r = K.readinessOf(base); ok("the ready case shows four checks, all passing, in the panel's order", r.checks.map(x => x.key).join() === "reserve,stated,comparables,open" && r.checks.every(x => x.ok) && r.hint === "Ready to finalize", JSON.stringify(r.checks)); 
  ok("the passing lines are the panel's words", r.checks.map(x => x.line).join("|") === "Reserve is supported by the sales|Seller stated facts are worded as reported|Every comparable carries its own listing|Open items resolved"); }
{ const r = K.readinessOf(await at(ev.q3 + 2000)); ok("an unsupported reserve fails check one with the engine's reason in the table's words, and the hint says it is locked", !r.checks[0].ok && r.checks[0].line === "Reserve is above what the sales support" && r.hint === "Finalize unlocks when every check passes");
  const m = K.readinessOf(await at(ev.q3 + 2000, { sellerRequested: true })); ok("marked as the seller's request, check one passes with its own line", m.checks[0].ok && m.checks[0].line === "Reserve above the sales, marked as the seller's request"); }
{ const c = clone(base); c.selectedComparables = c.selectedComparables.slice(0, 1); const r = K.readinessOf(c); ok("one comparable is not enough: check three asks for two", !r.checks[2].ok && r.checks[2].line === "Tick at least two comparable sales" && r.blockers.length === 1 && r.blockers[0].key === "comparable"); }
{ const c = clone(base), id = c.selectedComparables[0]; c.desk.comparables = c.desk.comparables.map(x => String(x.id) === String(id) ? { ...x, url: null } : x); const r = K.readinessOf(c); ok("a selected comparable with no listing fails check three and names it", !r.checks[2].ok && /^A comparable has no listing/.test(r.checks[2].line) && r.blockers.length === 1 && r.blockers[0].key === "comparable_listing"); }
{ const c = clone(base); c.fields.mileage = { ...c.fields.mileage, source: "seller", verified: false }; c.desk.supports = [{ key: "mileage_band", title: "Mileage", line: "x" }]; const r = K.readinessOf(c); ok("a seller stated, unverified fact that stands as a support fails check two and names it", !r.checks[1].ok && /Mileage/.test(r.checks[1].line) && r.blockers.some(b => b.key === "stated_facts"));
  const d = clone(c); d.fields.mileage.verified = true; ok("verified, the same support passes", K.readinessOf(d).checks[1].ok);
  const e = clone(c); e.desk.supports = [{ key: "service_ims", title: "IMS", line: "x" }]; e.fields.service_history = { value: "IMS done", source: "seller", verified: false, candidates: [] }; e.documents = []; ok("a seller stated service history is a support only with the invoice received", !K.readinessOf(e).checks[1].ok); }
{ const c = clone(base), ids = c.selectedComparables.slice(0, 2); c.desk.comparables = c.desk.comparables.filter(x => String(x.id) !== String(ids[0])); const r = K.readinessOf(c); ok("a selected comparable the engine no longer lists is not selected: fewer than two blocks", !r.ready && r.blockers.some(b => b.key === "comparable")); }
console.log(`deskReadinessCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
