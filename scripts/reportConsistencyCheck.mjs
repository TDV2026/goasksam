// Desk v4 stage 4: THE REPORT CANNOT CONTRADICT ITSELF. A sweep of case states (reserve against the engine's support, the seller's request, mileage and service stated or verified, the invoices outstanding or received, zero to three comparables, an open item or none)
// and, for every one, the same four facts must hold between the panel's checks, Finalize, the case view and the report's lines:
//  1 Finalize is allowed exactly when all four panel checks pass (and the vehicle, a photo and a why exist);
//  2 a reserve the engine does not support is never final unless it is marked as the seller's request, and then the report says so; a supported reserve is never worded as the seller's request;
//  3 a seller stated, unverified fact is a support nowhere (neither in the report state's supports nor in the engine's list the check reads), and is worded as reported wherever the report names it;
//  4 every comparable the report prints carries its own listing, and a case with fewer than two is not final;
//  5 the panel's lines are the readiness lines, character for character, in the workspace and in every case_edit answer.
// node scripts/reportConsistencyCheck.mjs [rootDir]
import path from "node:path"; import { pathToFileURL } from "node:url"; import { setup } from "./_deskCaseWorld.mjs";
const root = path.resolve(process.argv[2] || "."), { M, K, read, readyCase, T, today } = await setup(root), imp = f => import(pathToFileURL(path.join(root, f)).href);
const R = await imp("lib/desk/reportState.js"), V = await imp("lib/desk/caseView.js");
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) pass++; else { fail++; console.log("FAIL " + n + (d ? "  " + d : "")); } }; const cl = x => structuredClone(x);
const base = await readyCase(), ev = base.desk.evidence;
const at = async f => (await K.refreshEvidence(K.setReserve(base, { figure: f }, T), read, { caseDate: today, now: T })).case;
const reserves = { inside: await at(Math.round((ev.q1 + ev.q3) / 2)), below: await at(ev.q1 - 1), above: await at(ev.q3 + 1) };
const pop = base.desk.comparables.filter(x => x.inPopulation && x.url).map(x => x.id);
let n = 0, bad = [];
const note = (s, why) => { if (bad.length < 6) bad.push(s + ": " + why); };
for (const [rname, rc] of Object.entries(reserves)) for (const req of [false, true]) for (const mv of [true, false]) for (const docs of ["none", "outstanding", "received"]) for (const comps of [0, 1, 2, 3]) for (const open of [false, true]) for (const link of [true, false]) {
  let c = cl(rc); c.reserve.sellerRequested = req; c.fields.mileage = { ...c.fields.mileage, source: mv ? "analyst_verified" : "seller", verified: mv };
  c.documents = docs === "none" ? [] : [{ id: "d", name: "service invoice", kind: "service", status: docs }];
  c.fields.service_history = { value: "IMS bearing replaced, per the seller", source: "seller", verified: false, candidates: [] };
  c.selectedComparables = pop.slice(0, comps); c.needs_review = open ? [{ id: "x", label: "Something", material: false, state: "open", reason: "" }] : c.needs_review.map(x => ({ ...x, state: x.state === "open" ? "done" : x.state }));
  if (!link) c.desk = { ...c.desk, comparables: c.desk.comparables.map(x => (c.selectedComparables.includes(x.id) ? { ...x, url: null } : x)) };
  c.desk = { ...c.desk, supports: [{ key: "mileage_band", title: "Mileage", line: "m" }, { key: "service_ims", title: "IMS", line: "i" }] };
  const s = `${rname}/req${req}/mv${mv}/${docs}/c${comps}/open${open}/link${link}`, r = K.readinessOf(c); n++;
  const supported = c.desk.reserveCheck.supported === true, allOk = r.checks.every(x => x.ok);
  // 1 Finalize exactly when the four pass
  if (r.ready !== allOk) note(s, `ready ${r.ready} but checks ${allOk}`);
  const fin = K.finalize(c, { now: T }); if (fin.ok !== r.ready) note(s, `finalize ${fin.ok} but ready ${r.ready}`);
  // 2 the reserve and the seller's request
  if (!supported && !req && r.ready) note(s, "an unsupported reserve is final without the seller's request");
  if (!supported && req && !r.checks[0].ok) note(s, "marked as the seller's request but check one fails");
  if (supported && !req && !r.checks[0].ok) note(s, "a supported reserve fails check one");
  // 3 seller stated facts
  const st = R.reportState(c), bads = K.statedFactsBad(c).join(), wantBad = ["Mileage", docs !== "received" ? "IMS" : null].filter((x, i) => (i === 0 ? !mv : true) && x).join();
  if (bads !== wantBad) note(s, `stated facts bad '${bads}' want '${wantBad}'`);
  if (r.checks[1].ok !== (bads === "")) note(s, "check two disagrees with the stated facts");
  if (!mv && st.supportItems.some(x => x.text === st.mileageLine && x.title)) note(s, "an unverified mileage is a support in the report");
  if (!mv && !/stated by the seller|not confirmed|unconfirmed/i.test(st.mileageLine || "")) note(s, "an unverified mileage is not worded as reported: " + st.mileageLine);
  if (docs !== "received" && st.supportItems.some(x => /documented/.test(x.text || ""))) note(s, "IMS worded as documented without the invoice");
  // 4 the comparables
  const printed = st.comparables; if (r.ready && printed.some(x => !x.url)) note(s, "a printed comparable has no listing"); if (comps < 2 && r.checks[2].ok) note(s, "fewer than two comparables pass check three");
  if (!link && comps >= 1 && r.checks[2].ok) note(s, "a selected comparable with no listing passes check three");
  if (r.hint !== (r.ready ? "Ready to finalize" : "Finalize unlocks when every check passes")) note(s, "the hint does not follow readiness: " + r.hint);
  if (comps >= 2 && link && !r.checks[2].ok) note(s, "two linked comparables fail check three: " + r.checks[2].line);
  // 5 the panel's lines are the readiness lines
  const view = V.caseView({ id: "q", case: c, submission: { typed: true } }, [], T); if (JSON.stringify(view.checks) !== JSON.stringify(r.checks) || view.finalizeHint !== r.hint) note(s, "the case view's checks are not readiness's");
  if (open && r.checks[3].ok) note(s, "an open item passes check four");
}
ok(`${n} case states: Finalize, the four checks, the reserve's wording, the seller's stated facts, the comparables and the panel's lines agree`, n === 576 && bad.length === 0, bad.join(" | "));
// the actions' answers carry the same checks (the page prints them as sent)
{ const A = await imp("lib/desk/sheetActions.js"), { memoryStore } = await imp("lib/desk/sheetStore.js"), store = memoryStore(), ctx = { org: "t", seat: "7", store, now: T, env: {}, readSheet: async (e, i) => read(i), fetchImage: async () => null };
  await store.insert("t", { id: "k", owner_seat: "7", status: "In progress", created_at: T, submission: { typed: true, photos: [], documents: [] }, state: {}, case: base, version: 1 });
  let all = true; for (const b of [{ op: "reserve", patch: { figure: ev.q3 + 3000 } }, { op: "reserve", patch: { sellerRequested: true } }, { op: "comparables", ids: pop.slice(0, 1) }, { op: "comparables", ids: pop.slice(0, 2) }, { op: "window", months: 6 }]) { const r = await A.handleSheetAction("case_edit", { id: "k", ...b }, ctx); all = all && r.ok && JSON.stringify(r.case.checks) === JSON.stringify(r.readiness.checks) && r.case.finalizeHint === r.readiness.hint; }
  ok("every case_edit answer carries the panel's checks and hint, the same as its readiness", all); }
console.log(`reportConsistencyCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
