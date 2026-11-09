// Desk v3 stage 3: every report sentence is built from the case, changes when its case field changes, and a draft never claims what the case cannot support. node scripts/deskStateCheck.mjs [rootDir]
import path from "node:path"; import fs from "node:fs"; import { pathToFileURL } from "node:url"; import { setup } from "./_deskCaseWorld.mjs";
const root = path.resolve(process.argv[2] || "."), { M, K, read, readyCase, T, today } = await setup(root);
const R = await import(pathToFileURL(path.join(root, "lib/desk/reportState.js")).href);
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) pass++; else { fail++; console.log("FAIL " + n + (d ? "  " + d : "")); } }; const J = x => JSON.stringify(x), cl = x => structuredClone(x);
const base = await readyCase(), ev = base.desk.evidence, rs = c => R.reportState(c);
// a case that speaks of IMS work, with the invoices outstanding
let ims = M.setField(cl(base), "service_history", "Seller reports the IMS bearing was replaced", "seller", { by: "intake", now: T }); ims.documents = [{ id: "d1", name: "IMS invoice", kind: "service", status: "outstanding" }];
const imsDone = (() => { const c = cl(ims); c.documents[0].status = "received"; return c; })();
// 1. documents received
ok("IMS reads seller reported with the invoices outstanding", /reported by the seller/.test(rs(ims).imsLine) && /outstanding/.test(rs(ims).imsLine));
ok("IMS reads documented once the documents are received, and not before", /documented by the service invoices/.test(rs(imsDone).imsLine) && !/documented/.test(rs(ims).imsLine));
ok("the invoices step is in the next steps while outstanding and gone when received", rs(ims).nextSteps.includes("Send the service invoices.") && !rs(imsDone).nextSteps.includes("Send the service invoices."));
ok("a car whose case never speaks of IMS gets no IMS line", rs(M.newCase({ now: T, vehicle: { year: 1999, make: "Porsche", model: "911" } })).imsLine === null);
// 2. mileage verified
const unv = cl(base); unv.fields.mileage.verified = false; unv.fields.mileage.source = "seller"; const ver = cl(base); ver.fields.mileage.verified = true;
ok("mileage reads as stated by the seller until verified", /as stated by the seller/.test(rs(unv).mileageLine) && /is verified/.test(rs(ver).mileageLine) && rs(unv).mileageLine !== rs(ver).mileageLine);
ok("the confirm-the-mileage step goes when verified", rs(unv).nextSteps.includes("Confirm the mileage.") && !rs(ver).nextSteps.includes("Confirm the mileage."));
ok("the mileage in the sentence is the case's mileage", rs(K.correctField(ver, "mileage", 70000, { now: T })).mileageLine.includes("70,000"));
// 3. reserve across q1 and q3
const at = f => K.setReserve(base, { figure: f }, T), below = rs(at(ev.q1 - 1)), inside = rs(at(Math.round((ev.q1 + ev.q3) / 2))), above = rs(at(ev.q3 + 1));
ok("a reserve below q1 reads below, inside reads inside, above q3 reads above", below.reservePosition === "below" && inside.reservePosition === "inside" && above.reservePosition === "above" && /below the typical range/.test(below.reservePositionLine) && /inside the typical range/.test(inside.reservePositionLine) && /above the typical range/.test(above.reservePositionLine));
ok("the three sentences differ", new Set([below.reservePositionLine, inside.reservePositionLine, above.reservePositionLine]).size === 3);
ok("exactly at q1 and at q3 reads inside", rs(at(ev.q1)).reservePosition === "inside" && rs(at(ev.q3)).reservePosition === "inside");
ok("the workspace and the report use one comparison", K.reservePosition(at(ev.q1 - 1)) === below.reservePosition && K.reservePosition(at(ev.q3 + 1)) === above.reservePosition);
ok("the reserve sentence names the engine's quartiles", inside.reservePositionLine.includes("$" + ev.q1.toLocaleString("en-US")) && inside.reservePositionLine.includes("$" + ev.q3.toLocaleString("en-US")));
// 4. seller agreement
const ag = K.setReserve(base, { seller_agreed: true }, T), nag = K.setReserve(base, { seller_agreed: false }, T);
ok("seller agreement appears only when seller_agreed is true", /seller has agreed/.test(rs(ag).sellerLine) && rs(nag).sellerLine === null && rs(base).sellerLine === null);
ok("the agree-the-reserve step goes once the seller agreed", rs(nag).nextSteps.includes("Agree the reserve with the seller.") && !rs(ag).nextSteps.includes("Agree the reserve with the seller."));
ok("a seller_agreed that is not exactly true prints nothing", ["yes", 1, "true"].every(v => rs({ ...base, reserve: { ...base.reserve, seller_agreed: v } }).sellerLine === null));
// 5. a comparable excluded from the market calculation changes the evidence sentence
{ let ex = base; for (const c of base.desk.comparables.filter(x => x.inPopulation).slice(0, 3)) ex = M.excludeSale(ex, { saleId: c.id, scope: "market_calc", reason: "Salvage title", now: T });
  const after = (await K.refreshEvidence(ex, read, { caseDate: today, now: T })).case;
  ok("excluding comparables from the calculation changes the typical-range sentence", rs(after).typicalLine !== rs(base).typicalLine && rs(after).typicalLine.includes(String(after.desk.evidence.count)) && !rs(base).typicalLine.includes("from " + after.desk.evidence.count + " "), rs(after).typicalLine); }
// 6. condition per rung
const lines = [1, 2, 3, 4].map(t => rs(K.setCondition(base, { tier: t, name: "x" }, T)).conditionLine);
ok("each rung of the condition ladder has its own sentence", new Set(lines).size === 4 && lines.every(Boolean) && /Concours/.test(lines[0]) && /Fair/.test(lines[3]), J(lines));
ok("no selected condition, no condition sentence (the engine's suggestion is not the report's)", rs(K.setCondition(base, null, T)).conditionLine === null);
// 7. limitations from open or waived items
{ let c = K.syncNeeds(cl(base)); c.fields.mileage.verified = false; c = K.syncNeeds(c); const open = rs(c).limitations;
  ok("an open item is a limitation", open.some(l => /^Open: Mileage is not confirmed/.test(l)));
  const w = rs(K.setNeed(c, "mileage_unconfirmed", "waived", "Odometer photo accepted")).limitations; ok("a waived item is a limitation with its reason", w.some(l => /^Waived: Mileage is not confirmed, reason given: Odometer photo accepted\.$/.test(l)));
  ok("a done item is not a limitation", base.needs_review.some(n => n.state === "done") && !base.needs_review.some(n => n.state === "open") && rs(base).limitations.length === 0); }
// 8. no prior auction record
const withVin = cl(base); withVin.fields.vin = { value: "WP0AA2990XS620481", source: "seller", verified: false, candidates: [] };
ok("a VIN with no earlier auction record puts the one sentence in the note", J(rs({ ...withVin, record: { appearances: 0, none: "x" } }).noteLines) === J(["No prior auction record for this VIN."]));
ok("a VIN with an earlier record has no such line, and neither has a case with no VIN", rs({ ...withVin, record: { appearances: 2, none: null } }).noteLines.length === 0 && rs({ ...base, record: { appearances: 0 } }).noteLines.length === 0);
// the engine's own record line is the table's, not a typed one
{ const sr = fs.readFileSync(path.join(root, "lib/sheetRead.js"), "utf8"); ok("the engine's no-prior-record line is the reasonWords line", !/"No prior auction record for this VIN\."/.test(sr) && /reasonLine\("desk\.no_prior_vin"\)/.test(sr)); }
// THE DRAFT NEVER CLAIMS WHAT THE CASE CANNOT SUPPORT: every combination of the state, each claim against the independent fact
let combos = 0, bad = 0;
for (const docs of [null, "outstanding", "received"]) for (const mv of [false, true]) for (const agreed of [false, true]) for (const figure of [null, ev.q1 - 100, ev.median, ev.q3 + 100]) for (const speaks of [false, true]) {
  let c = cl(base); c.fields.mileage.verified = mv; c.fields.mileage.source = mv ? "analyst_verified" : "seller"; c.reserve = { figure, rationale: "r", seller_agreed: agreed }; c.fields.service_history = { value: speaks ? "IMS bearing replaced, per the seller" : null, source: speaks ? "seller" : "missing", verified: false, candidates: [] };
  c.documents = docs ? [{ id: "d", name: "service invoice", kind: "service", status: docs }] : [];
  const s = rs(c), txt = J(s), exp = figure == null ? null : figure < ev.q1 ? "below" : figure > ev.q3 ? "above" : "inside"; combos++;
  const wrong = [
    /documented by the service/.test(txt) !== (speaks && docs === "received"),
    /reported by the seller/.test(txt) !== (speaks && docs !== "received"),
    /seller has agreed/.test(txt) !== (agreed && true),
    /is verified/.test(txt) !== mv,
    s.reservePosition !== exp,
    /Send the service invoices/.test(txt) !== (docs === "outstanding"),
    /Agree the reserve/.test(txt) !== (figure != null && !agreed)
  ];
  if (wrong.some(Boolean)) { bad++; if (bad < 4) console.log("  claim mismatch", J({ docs, mv, agreed, figure, speaks }), wrong.map(Number).join("")); }
}
ok(`${combos} case states: every claim is exactly as true as the case says`, bad === 0, bad + " mismatches");
// an empty draft says nothing it cannot support
{ const s = rs(M.newCase({ now: T })); ok("an empty case claims nothing: no range, reserve, position, agreement, mileage, IMS, condition or note", ["rangeLine", "reserveLine", "typicalLine", "reservePositionLine", "sellerLine", "mileageLine", "imsLine", "conditionLine"].every(k => s[k] === null) && s.noteLines.length === 0 && s.nextSteps.join() === "No further steps are open."); }
// the finalized row carries the wording, the same wording
{ const A = await import(pathToFileURL(path.join(root, "lib/desk/sheetActions.js")).href), { memoryStore } = await import(pathToFileURL(path.join(root, "lib/desk/sheetStore.js")).href), store = memoryStore();
  await store.insert("t", { id: "w1", owner_seat: "crew", status: "In progress", created_at: T, submission: { typed: true, photos: [], documents: [] }, state: {}, case: base, version: 1 });
  const f = await A.handleSheetAction("case_finalize", { id: "w1" }, { org: "t", seat: "crew", store, now: T, env: {} });
  ok("the finalized version row carries the wording built from the case", f.ok && J(f.row.wording) === J(rs(base)) && f.row.wording.rangeLine && f.row.wording.reserveLine, f.why); }
// the class: no Desk file types a claim about the case
{ const claims = /seller has agreed|documented by the service|as stated by the seller|invoices are outstanding|sits (below|inside|above) the typical|No prior auction record/i, hits = [];
  for (const d of ["lib/desk", "public/js", "lib/crewPages"]) for (const f of fs.existsSync(path.join(root, d)) ? fs.readdirSync(path.join(root, d)) : []) { const p = path.join(root, d, f); if (fs.statSync(p).isFile() && claims.test(fs.readFileSync(p, "utf8").split("\n").map(l => l.replace(/(^|\s)\/\/.*$/, "")).join("\n"))) hits.push(d + "/" + f); }
  ok("no Desk file, page script or template types a report claim (they live in lib/reasonWords.js)", hits.length === 0, hits.join(", ")); }
console.log(`deskStateCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
