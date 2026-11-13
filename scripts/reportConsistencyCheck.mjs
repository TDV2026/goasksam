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
// ---------- ONE ANSWER, ONE COUNT (Lane D, Nov 11 2026; Sam's first run: the demo 996 at Fair, 24 months, read "3 sales" in the header, "3 on record" in the support line and "4 in the last 24 months" in the Fair line) ----------
// CAUSE: the header's sales are the case's population (the condition and the mileage band cut), and the condition's own line (desk.rungs) counted the car's sales of that condition with no mileage cut, so one window had two counts.
// OTHER CARS AND PAGES: every Desk case with a condition chosen, on the workspace (header, support line, condition line, reserve check), the report's market line and the PDF. CLASS: for EVERY (condition, period) of the read, every count printed for the window equals the length of the window's sales list.
{ const DV = await imp("lib/deskV3.js"); let views = 0, counts = 0; const off = [];
  for (const t of [0, 1, 2, 3, 4]) for (const m of [3, 6, 12]) {
    const k = K.setWindow(K.setCondition(base, t ? { tier: t, name: "x" } : null, T), m, T), d = k.desk, N = d.sales.length, found = []; views++;
    const num = (what, x) => { if (x != null && x !== "") found.push([what, Number(x)]); };
    num("evidence.count", d.evidence.count); num("evidence.countLine", (String(d.evidence.countLine).match(/^(\d+) sale/) || [])[1]); num("evidence.sentence", (String(d.evidence.sentence || "").match(/(\d+) on record/) || [])[1]);
    num("byWindow.count", d.evidence.byWindow && d.evidence.byWindow[m] && d.evidence.byWindow[m].count); num("byWindow.populationLine", (String(d.evidence.byWindow && d.evidence.byWindow[m] && d.evidence.byWindow[m].populationLine || "").match(/^(\d+) of/) || [])[1]);
    if (t) { const rg = d.rungs[t - 1]; num("rung.count", rg.count); num("rung.countLine", (String(rg.countLine).match(/^(\d+) sale/) || [])[1]); num("rung.sentence", (String(rg.sentence).match(/(?::|,) (\d+) in the last/) || String(rg.sentence).match(/^[A-Za-z]+: (\d+) sale/) || [])[1]); }
    if (d.reserveCheck) num("reserveCheck.of", d.reserveCheck.of);
    for (const [what, v] of found) { counts++; if (v !== N) off.push(`${t}:${m} ${what} ${v} vs ${N} sales`); }
  }
  ok(`every count printed for a window equals the window's sales list (${counts} counts over ${views} views)`, views === 15 && counts >= 60 && !off.length, off.slice(0, 6).join(" | ")); }
// A SHORTER PERIOD WITH THE SAME SALES SAYS SO (Lane D, Nov 11 2026): the line is the engine's (desk.evidence.sameLine), present exactly when the shorter period holds as many sales as the next longer one, so a switch that changes nothing is printed, not silent.
{ const DV = await imp("lib/deskV3.js"), day = 864e5, iso = n => new Date(Date.parse(today) - n * day).toISOString().slice(0, 10);
  const mk = days => days.map((n, i) => ({ id: "s" + i, price: 30000 + i * 500, date: iso(n), miles: 50000, platform: "Bring a Trailer", tier: null, inPopulation: true, year: 1999, gearbox: "manual", generation: "996" }));
  const sub = { transmission: "Manual", body: "coupe" }, blk = async (rows, m) => DV.deskBlock(rows, { caseDate: today, subject: sub, subjectFacts: { generation: "996", year: 1999 }, windowMonths: m, head: async () => null });
  const same3 = await blk(mk([10, 40, 90]), 12), grow = await blk(mk([10, 40, 90, 200, 500]), 12), all24 = await blk(mk([10, 40, 90]), 24), only = await blk(mk([10, 40, 90, 500]), 24);
  ok("three sales that all fall in the last 6 months: the 12 month answer says it is the same 3 sales", same3.evidence.sameLine === "Same 3 sales in the last 12 months." && same3.evidence.byWindow["6"].sameLine === "Same 3 sales in the last 6 months.", String(same3.evidence.sameLine));
  ok("a longer period with more sales prints no such line", grow.evidence.sameLine === null && grow.evidence.byWindow["6"].sameLine === null, JSON.stringify([grow.evidence.sameLine, grow.evidence.byWindow["6"].sameLine]));
  ok("the longest period never prints one", all24.evidence.sameLine === null && only.evidence.sameLine === null);
  ok("the count in the line is the count of the window's sales list", same3.evidence.sameLine.includes(same3.sales.length + " sales"));
  // WHERE THE RECORD STARTS (Lane F's run): a window that reaches back past the first sale on record says where the record starts
  const first = iso(90), startsAt = await blk(mk([10, 40, 90]), 24), deep = await blk(mk([10, 40, 90, 900]), 24);
  ok("a window that reaches back past the first sale on record says where the record starts, with that sale's date", /^Sales on record start [A-Z][a-z]{2} \d{1,2}, \d{4}\.$/.test(startsAt.evidence.startLine || "") && startsAt.evidence.byWindow["12"].startLine === startsAt.evidence.startLine, String(startsAt.evidence.startLine) + " " + first);
  ok("a car with sales older than the window prints no such line", deep.evidence.startLine === null && deep.evidence.byWindow["12"].startLine === null); }
// ---------- A NEEDS ATTENTION LINE IS ONLY EVER THERE WHILE ITS MARK SAYS SO (Lane D, Nov 11 2026; Sam's first run: "Mileage is not confirmed (waived)" listed while the Mileage row read Verified) ----------
// CAUSE: syncNeeds closed an OPEN item when its cause was gone but left a WAIVED one standing for ever, and the report prints waived items as limitations. OTHER CARS AND PAGES: every case, for each of the five rules (car, mileage, VIN agreement, accident history, service documents), in the workspace list, the case view's readiness blockers and the report's limitations.
// CLASS: for every rule, every earlier state of its item (none, open, waived, done) and the cause on or off, the list the page shows (open or waived) holds the rule if and only if its source mark says the cause stands, and the report's limitations name only those.
{ const mkC = (rule, on) => { const c = cl(base); c.fields.accident_history = { ...c.fields.accident_history, value: "None reported", verified: true, source: "analyst_verified" }; c.documents = [{ id: "d", name: "service invoice", kind: "service", status: "received" }];
    c.fields.mileage = { ...c.fields.mileage, verified: true }; c.needs_review = [];
    if (on) { if (rule === "car_unidentified") for (const k of ["vin", "year", "make", "model"]) c.fields[k] = { ...c.fields[k], value: null }; if (rule === "mileage_unconfirmed") c.fields.mileage = { ...c.fields.mileage, verified: false }; if (rule === "vin_mismatch") c.fields.vin = { ...c.fields.vin, source: "conflicting" };
      if (rule === "accident_unclear") c.fields.accident_history = { ...c.fields.accident_history, verified: false }; if (rule === "service_documents") c.documents = []; }
    return c; };
  let n = 0; const wrong = [];
  for (const r of K.NEED_RULES) for (const was of ["none", "open", "waived", "done"]) for (const on of [true, false]) for (const first of [true, false]) {
    let c = mkC(r.id, first);   // the cause as it stood when the item was made, then the marks move to `on`
    c = K.syncNeeds(c); if (was !== "none" && c.needs_review.find(x => x.id === r.id)) c = K.setNeed(c, r.id, was === "open" ? "open" : was, was === "waived" ? "stated by the seller" : "");
    const moved = mkC(r.id, on); c = { ...c, fields: moved.fields, documents: moved.documents }; c = K.syncNeeds(c); n++;
    const shown = c.needs_review.filter(x => x.state === "open" || x.state === "waived").map(x => x.id), applies = K.NEED_RULES.filter(x => x.applies(c)).map(x => x.id), lim = R.reportState(c).limitations.join(" | ");
    const s = `${r.id}/was ${was}/first ${first}/now ${on}`;
    if (shown.includes(r.id) !== applies.includes(r.id)) wrong.push(`${s}: shown ${shown.includes(r.id)}, the mark says ${applies.includes(r.id)}`);
    if (!applies.includes(r.id) && lim.includes(r.label)) wrong.push(`${s}: the report still limits on it`);
  }
  ok(`a needs attention line stands exactly while its mark says so (${n} states over the five rules)`, n === 80 && !wrong.length, wrong.slice(0, 5).join(" | ")); }
// ---------- THE LIST AND ITS COUNT ARE ONE FIELD; A ROW NEVER SAYS "MILES NOT STATED" BESIDE MILES IT PRINTS (Lane F's run: "Show all 39" over 43 rows, the Mustang's 9 over 17, the Mini's rows) ----------
// CAUSE: the button counted desk.sales (the window's population) and the list is desk.comparables (the population and the near matches the engine adds when the pool is thin), two fields for one list; and the why line said "miles not stated" whenever the CAR's miles were missing, even for a sale whose miles the row prints.
// OTHER CARS AND PAGES: every car, every period and condition; the workspace list, the button, and the report's comparable cards. CLASS: in every view the count the button reads (desk.comparablesCount) is the length of the list, and no row's why line says its miles are not stated while the row carries a miles line.
{ const DV = await imp("lib/deskV3.js"); let rows = 0; const off = [];
  for (const t of [0, 1, 2, 3, 4]) for (const m of [3, 6, 12]) { const d = K.setWindow(K.setCondition(base, t ? { tier: t, name: "x" } : null, T), m, T).desk;
    if (d.comparablesCount !== d.comparables.length) off.push(`${t}:${m} count ${d.comparablesCount} vs list ${d.comparables.length}`);
    for (const c of d.comparables) { rows++; if (c.milesLine && /\bmiles not stated/.test(String(c.why))) off.push(`${t}:${m} ${c.id} prints miles and says not stated`); } }
  const day = 864e5, iso2 = n => new Date(Date.parse(today) - n * day).toISOString().slice(0, 10), rs = [10, 40, 90, 120].map((n, i) => ({ id: "m" + i, price: 20000 + i * 500, date: iso2(n), miles: 30000 + i * 1000, platform: "Bring a Trailer", tier: null, inPopulation: true, year: 2005, gearbox: "manual", generation: "R50" }));
  const mini = await DV.deskBlock(rs, { caseDate: today, subject: { transmission: "Manual" }, subjectFacts: { generation: "R50", year: 2005, miles: null }, windowMonths: 12, head: async () => null });
  ok("a car with no miles of its own: no row says miles not stated beside the miles it prints", mini.comparables.length >= 3 && mini.comparables.every(c => !/\bmiles not stated/.test(String(c.why)) && /not stated/.test(String(c.why))), JSON.stringify(mini.comparables.map(c => c.why).slice(0, 2)));
  ok(`the list and its count are one field in every view (${rows} rows)`, rows > 0 && !off.length, off.slice(0, 4).join(" | ")); }
// ---------- ONE NAME FOR THE CAR, ONE GENERATION (Lane F's run: the queue read "Carrera" and the header "Coupe"; the VIN case showed 996 in the header and Not confirmed in the Generation row) ----------
// CAUSE: the queue's name was the label the sheet was made with (the words typed or decoded), the header's the engine's titleLine, and the engine's generation was printed in the header (specLine) but never put on the case's Generation field.
// OTHER CARS AND PAGES: every case in the queue, the header, the report (title and spec line) and the Generation row. CLASS: for every case state of the read, the queue's name, the case view's titleLine and the report's title are the same string, and a generation the engine names is on the case, decoded and unverified.
{ const { summaryOf } = await imp("lib/desk/sheetStore.js"), J = x => JSON.stringify(x); const off = [];
  const blank = M.newCase({ now: T, vehicle: { year: 1999, make: "Porsche", model: "911", trim: "Carrera", body: "Coupe", transmission: "Manual", mileage: 61400 }, source: "seller" });
  const got = (await K.refreshEvidence(blank, read, { caseDate: today, now: T })).case, vinCase = (await K.refreshEvidence(M.newCase({ now: T, vehicle: { vin: "WP0AA2995XS626785", mileage: 61400, transmission: "Manual", body: "Coupe" }, source: "seller" }), read, { caseDate: today, now: T })).case;
  for (const [name, c] of [["typed", got], ["ready", base]]) { const sheet = { id: "z", created_at: T, car_label: "1999 Porsche 911 Carrera", status: "New", case: c, submission: { typed: true, photos: [], documents: [] } };
    const q = summaryOf(sheet).car, v = V.caseView(sheet, [sheet], T).desk.titleLine, r = R.reportState(c).v4.title; if (!(q === v && v === r && !!q)) off.push(`${name}: queue "${q}", header "${v}", report "${r}"`); }
  const g = got.desk.generation;
  if (g && !(got.fields.generation.value === g && got.fields.generation.verified === false && ["vin_decoded", "records"].includes(got.fields.generation.source))) off.push("typed: the engine's generation " + g + " is not on the case: " + J(got.fields.generation));
  if (vinCase.desk && vinCase.desk.generation && !(vinCase.fields.generation.value === vinCase.desk.generation && vinCase.fields.generation.source === "vin_decoded" && vinCase.fields.generation.verified === false)) off.push("VIN: the engine's generation is not on the case as decoded: " + J(vinCase.fields.generation));
  ok("the queue, the header and the report share one name, and the engine's generation is on the case as decoded and unverified", !off.length && !!(got.desk.generation || vinCase.desk.generation), off.join(" | ") + " gen " + got.desk.generation); }
// ---------- ONE DOCUMENT STATE (Lane F's run: "1 on file" beside "IMS invoice, still to come" and "No service documents yet", all open at once) ----------
// CAUSE: the Documents tile printed the NUMBER OF DOCUMENTS as on file (the page counted the list, outstanding ones included) while the open item and the report read the received service invoice. OTHER CARS AND PAGES: every case with documents, on the Documents tile, the open items and the report's lines.
// CLASS: for every mix of documents (none, an invoice still to come, a received invoice, a received title, both), the line says on file for the received ones and still to come for the others, and the open item "no service documents" is open exactly when no service invoice has been received.
{ const off = []; const mixes = { none: [], outstanding: [{ id: "a", name: "IMS invoice", kind: "invoice", status: "outstanding", title: "IMS invoice" }], received: [{ id: "b", name: "inv.pdf", kind: "invoice", status: "received", title: "IMS invoice" }], title: [{ id: "c", name: "t.pdf", kind: "title", status: "received", title: "Title" }], both: [{ id: "a", name: "IMS invoice", kind: "invoice", status: "outstanding", title: "IMS invoice" }, { id: "c", name: "t.pdf", kind: "title", status: "received", title: "Title" }] };
  for (const [k, docs] of Object.entries(mixes)) { let c = cl(base); c.documents = docs; c = K.syncNeeds(c); const v = V.caseView({ id: "d", created_at: T, case: c, submission: { typed: true, photos: [], documents: [] } }, [], T), recv = docs.filter(d => d.status === "received").length, outs = docs.length - recv, line = v.documentsLine || "";
    if ((recv ? !line.includes(recv + " on file") : /on file/.test(line)) || (outs ? !line.includes(outs + " still to come") : /still to come/.test(line)) || (!docs.length && line)) off.push(`${k}: "${line}"`);
    const open = c.needs_review.some(n => n.id === "service_documents" && n.state === "open"), haveInv = docs.some(d => d.kind === "invoice" && d.status === "received"); if (open === haveInv) off.push(`${k}: the open item is ${open} with a received invoice ${haveInv}`); }
  ok("the documents line, the received invoice and the open item are one state in every mix (5 mixes)", !off.length, off.join(" | ")); }
// ---------- A THIN POOL NAMES THE CAR (Lane F's run: the Mini's header read "These are the sales of cars"; its pool mixed Cooper S and Convertible sales) ----------
// CAUSE of the wording: the population words fell back to "cars" when the case held neither a gearbox nor a body. (The pool mix is the VIN's trim and body not riding on the read, fixed on Nov 11 in lib/sheetRead.js and held by deskTypedCasesCheck for a coupe, a roadster and a trimmed car; the Mini's own read is for Lane C's live check after the push.)
{ const DV = await imp("lib/deskV3.js"), RW = await imp("lib/reasonWords.js"), day = 864e5, iso3 = n => new Date(Date.parse(today) - n * day).toISOString().slice(0, 10);
  const two = [10, 40].map((n, i) => ({ id: "t" + i, price: 20000, date: iso3(n), miles: 30000, platform: "Bring a Trailer", tier: null, inPopulation: true, year: 2005, gearbox: null, generation: "R50" }));
  const thin = await DV.deskBlock(two, { caseDate: today, subject: { label: "2005 Mini Cooper" }, subjectFacts: { generation: "R50", year: 2005 }, windowMonths: 12, head: async () => null });
  ok("a thin pool of a car with no gearbox or body stated names the car, not cars", thin.evidence.insufficient === true && /the sales of 2005 Mini Cooper\./.test(thin.evidence.population.sentence) && !/sales of cars/.test(thin.evidence.population.sentence), thin.evidence.population.sentence);
  ok("a car with a gearbox and a body keeps the words it had", RW.deskPopulationWords({ transmission: "Manual", body: "Coupe", label: "x" }) === "manual coupes"); }
// ---------- THE ANY CONDITION BUTTON SAYS WHAT ITS CLICK DELIVERS (Lane C's run) ----------
// CLASS: in every view of every period, the Any condition button's count is the count of the case's evidence once it holds no condition.
{ const J = x => JSON.stringify(x), off = []; for (const m of [3, 6, 12]) for (const t of [0, 1, 2, 3, 4]) { const here = K.setWindow(K.setCondition(base, t ? { tier: t, name: "x" } : null, T), m, T).desk, any = K.setWindow(K.setCondition(base, null, T), m, T).desk;
    if (!here.anyCondition || here.anyCondition.count !== any.evidence.count || here.anyCondition.countLine !== any.evidence.countLine) off.push(`${t}:${m} button ${J(here.anyCondition)} vs ${any.evidence.count}`); }
  ok("the Any condition button's count is what no condition reads, in every view", !off.length, off.slice(0, 3).join(" | ")); }
// ---------- NO RESERVE IN THE REPORT (Lane D, Nov 11 2026; Lane B's desk.reserveMode on the engine's answer) ----------
// CAUSE of the work: a report could only recommend a reserve figure; for a car where the engine's own read favours no reserve, or cannot say, the analyst had no way to say so and the cover still printed a figure. The case carries desk.reserveMode (the engine's, never made here); the analyst sets report.reserveMode to no_reserve with a why line; the cover then prints "Recommended: no reserve" and the engine's line in place of the figure, the figure stays on page 2 as the expected result, and the seller's own Yes, No or Not sure is printed beside it. Where the engine says the sales are too few (thin) the why line is required, and Finalize checks it.
// OTHER CARS AND PAGES: every case, on the panel row, the case view's reserveModeLine, the report's cover and page 2, and Finalize. CLASS: for every engine answer (reserve, no_reserve, unclear and thin, unclear and not thin, none), every why line (written or blank) and every seller answer (none, yes, no, not sure): the setter, the blocker, the case view and the report state agree.
{ const RW = await imp("lib/reasonWords.js"); const off = []; let n = 0;
  const RM = { reserve: { recommendation: "reserve", line: "Sales with a reserve held a higher median.", withReserve: { count: 12, soldShare: 80, medianLine: "$40,000" }, noReserve: { count: 9, soldShare: 70, medianLine: "$36,000" }, thin: false, thinLine: null },
    no_reserve: { recommendation: "no_reserve", line: "Sales with no reserve held a higher median.", withReserve: { count: 12, soldShare: 70, medianLine: "$36,000" }, noReserve: { count: 9, soldShare: 80, medianLine: "$40,000" }, thin: false, thinLine: null },
    thin: { recommendation: "unclear", line: "Too few sales with no reserve to say.", withReserve: { count: 12, soldShare: 70, medianLine: "$36,000" }, noReserve: { count: 2, soldShare: null, medianLine: null }, thin: true, thinLine: "Only 2 sales with no reserve, too few to compare." },
    unclear: { recommendation: "unclear", line: "The two sides are level.", withReserve: { count: 12, soldShare: 75, medianLine: "$38,000" }, noReserve: { count: 9, soldShare: 74, medianLine: "$38,000" }, thin: false, thinLine: null }, none: null };
  { const { speakReserveMode } = await import(pathToFileURL(path.join(root, "lib/desk/reserveModeLines.js")).href); for (const k of Object.keys(RM)) if (RM[k]) RM[k] = speakReserveMode(RM[k]); }   // the fixtures hold the engine's figures; their line is the line the table makes from them (the words are made when a case is served)
  for (const [rname, rm] of Object.entries(RM)) for (const why of ["", "Seller wants the widest buyer pool."]) for (const pref of [null, "yes", "no", "not_sure"]) {
    let c = cl(base); c.desk.reserveMode = rm; c.reserve = { ...c.reserve, sellerPreference: pref }; n++;
    const o = K.setReportReserveMode(c, "no_reserve", why, T), want = !!rm && !(rm.thin && !why);
    if (!!o.case !== want) { off.push(`${rname}/why${!!why}/${pref}: setter ${o.case ? "accepted" : "refused " + o.refuse}, wanted ${want}`); continue; }
    if (!want) { if (rm && !o.refuse) off.push(`${rname}: no refusal line`); else if (!rm && o.refuse !== "case.reserve_mode.refuse_none") off.push(`${rname}: wrong refusal ${o.refuse}`); else if (rm && rm.thin && o.refuse !== "case.reserve_mode.refuse_thin") off.push(`${rname}: wrong refusal ${o.refuse}`); }
    const on = o.case || (() => { const x = cl(c); x.report = { reserveMode: { mode: "no_reserve", why } }; return x; })(), off1 = (() => { const x = cl(c); x.report = { reserveMode: { mode: null, why: "" } }; return x; })();
    // the blocker: present exactly when no reserve is chosen and the engine has no answer, or says thin and there is no why
    const bl = K.readinessOf(on).blockers.some(b => b.key === "reserve_mode"), wantBl = !rm || (rm.thin === true && !why);
    if (bl !== wantBl) off.push(`${rname}/why${!!why}: blocker ${bl}, wanted ${wantBl}`);
    if (K.readinessOf(off1).blockers.some(b => b.key === "reserve_mode")) off.push(`${rname}: a report that is not no reserve has the blocker`);
    if (bl && K.finalize(on, { now: T }).ok) off.push(`${rname}/why${!!why}: finalized with the blocker`);
    // the case view and the report state
    const v1 = V.caseView({ id: "r", created_at: T, case: on, submission: { typed: true, photos: [], documents: [] } }, [], T), v0 = V.caseView({ id: "r", created_at: T, case: off1, submission: { typed: true, photos: [], documents: [] } }, [], T);
    const line = rm ? RW.reasonLine("report.reserve_mode_line", { line: rm.line }) : null;
    if (v1.report.reserveModeLine !== line || v0.report.reserveModeLine !== null) off.push(`${rname}: the case view's line is "${v1.report.reserveModeLine}"`);
    const r1 = R.reportState(on).v4, r0 = R.reportState(off1).v4;
    if (!(r1.noReserve && r1.noReserve.headline === "Recommended: no reserve" && r1.noReserve.line === (rm ? rm.line : null) && r1.figure === on.reserve.figure && (on.reserve.figure == null || (r1.expected && r1.expected.line === RW.reasonLine("v4.expected_result", { figure: on.reserve.figure }))))) off.push(`${rname}: the no reserve cover is wrong: ${JSON.stringify(r1.noReserve)}`);
    if ((pref && !(r1.noReserve.preference === RW.reasonLine("case.reserve.seller_preference", { answer: pref }))) || (!pref && r1.noReserve.preference !== null)) off.push(`${rname}/${pref}: the seller's answer is "${r1.noReserve.preference}"`);
    if (r0.noReserve !== null || r0.expected !== null) off.push(`${rname}: a reserve report carries a no reserve cover`);
  }
  ok(`no reserve in the report: the setter, the blocker, Finalize, the case view and the report state agree over ${n} states`, n === 40 && !off.length, off.slice(0, 5).join(" | ")); }
// ---------- ONE ANSWER PER RUNG (Lane D, Nov 11 2026; Lane F's run: the Excellent button said 8 sales, picking it read 5 at $36,500 to $40,500, the line under it $30,876 to $39,075; the same for Good and Fair) ----------
// CAUSE: the rung buttons and lines were the car's sales of that condition with no mileage cut, and picking a rung reads those sales cut by the mileage band, so a rung had two populations. OTHER CARS AND PAGES: every car with a mileage and tiered sales (the demo 996, the Mustang, the 240Z, the Mini), on the workspace buttons, the rung line and the report's condition tile.
// CLASS: in EVERY view (condition x period), every rung's count and typical range are the evidence of the view for that rung (what picking it reads): count, q1, median and q3 (or none when the engine has too few).
{ let rungs = 0; const off = [];
  for (const m of [3, 6, 12]) for (const t of [1, 2, 3, 4]) {
    const here = K.setWindow(base, m, T).desk, picked = K.setWindow(K.setCondition(base, { tier: t, name: "x" }, T), m, T).desk, rg = here.rungs[t - 1], ev = picked.evidence; rungs++;
    if (rg.count !== ev.count) off.push(`${t}:${m} button ${rg.count} vs pick ${ev.count}`);
    const band = rg.band ? [rg.band.q1, rg.band.median, rg.band.q3].join() : "none", want = ev.insufficient ? "none" : [ev.q1, ev.median, ev.q3].join();
    if (band !== want) off.push(`${t}:${m} line ${band} vs pick ${want}`);
    if (picked.rungs[t - 1].count !== ev.count) off.push(`${t}:${m} the picked rung line ${picked.rungs[t - 1].count} vs header ${ev.count}`);
  }
  ok(`every rung's button, line and header are one answer (${rungs} rungs over every period)`, rungs === 12 && !off.length, off.slice(0, 5).join(" | ")); }

// ---------- ONE NAME FOR THE NO-CONDITION STATE, AND ONE LIST FOR "WHAT WE TOOK INTO ACCOUNT" (Lane D, Nov 12 2026; Sam's second run). CAUSE of the first: the no-condition rung was named "Any condition" in four places (the rung list, the button, the recorded read, the report said nothing). CLASS: every place that names it takes the table's "All conditions". CAUSE of the second: the report printed the engine's list and the waived limits, so the analyst could not change what the seller was told. CLASS: the list the panel edits is the list the PDF and every report state print.
{ const fs = await import("node:fs"), RW = await imp("lib/reasonWords.js"), RG = await imp("lib/desk/rungs.js"), C = await imp("lib/desk/considered.js");
  ok("the table names the no-condition state All conditions", RW.reasonLine("desk4.all_conditions_name") === "All conditions");
  for (const f of ["lib/desk/rungs.js", "lib/deskV3.js", "lib/preview/deskV4Client.js", "lib/desk/reportState.js"]) ok(`${f} never prints the old name Any condition`, !fs.readFileSync(path.join(root, f), "utf8").split("\n").filter(l => !/^\s*\/\//.test(l)).some(l => /"Any condition"/.test(l)));
  ok("the report names the no-condition state when no condition is chosen, and the chosen condition when one is", (() => { const none = cl(base); none.condition = { ...none.condition, selected: null }; const tiles = R.reportState(none).v4.tiles.map(t => t.value); const sel = cl(base); sel.condition = { ...sel.condition, selected: { tier: 2, name: "Excellent" } }; return tiles.includes("All conditions") && R.reportState(sel).v4.tiles.some(t => /Excellent condition/.test(t.value)) && !R.reportState(sel).v4.tiles.some(t => t.value === "All conditions"); })());
  // the list: start from the engine's items, then edits, a removal and an addition: the report prints exactly the case's list in every state
  let c = cl(base); c.desk = { ...c.desk, considered: [{ key: "a", title: "Mileage", line: "Reported by the seller and outstanding until verified." }, { key: "b", title: "Paint", line: "Taken into account, but the sales do not isolate an effect." }, { key: "c", title: "Service", line: "Reported by the seller and outstanding until verified." }] };
  const want = x => C.syncConsidered(x).considered.map(i => ({ title: i.title, text: i.text })), same = (x, label) => ok(`${label}: the report prints the case's own list`, JSON.stringify(R.reportState(x).v4.considered) === JSON.stringify(want(x)), JSON.stringify(R.reportState(x).v4.considered).slice(0, 200));
  c = C.syncConsidered(c); same(c, "as the engine gave it"); ok("the engine's three items are the start", c.considered.length >= 3 && c.considered.filter(i => /^e:/.test(i.key)).length === 3);
  c = C.editConsidered(c, c.considered.find(i => i.key === "e:a").id, { text: "Checked against the odometer photo." }, T); same(c, "after an edit"); ok("the edit is printed", R.reportState(c).v4.considered.some(x => x.text === "Checked against the odometer photo."));
  c = C.removeConsidered(c, c.considered.find(i => i.key === "e:b").id, T); same(c, "after a removal"); ok("the removed item is not printed", !R.reportState(c).v4.considered.some(x => x.title === "Paint"));
  c = C.addConsidered(c, { title: "Repaint", text: "A repaint of the left door in 2012." }, T); same(c, "after an addition"); ok("the added item is printed", R.reportState(c).v4.considered.some(x => x.title === "Repaint"));
  c.desk = { ...c.desk, considered: [...c.desk.considered, { key: "b", title: "Paint", line: "Taken into account, but the sales do not isolate an effect." }] }; same(c, "when the engine gives a removed item again"); ok("it is not put back", !R.reportState(c).v4.considered.some(x => x.title === "Paint"));
  const mi = fs.readFileSync(path.join(root, "lib/desk/reportPdfV3.js"), "utf8"); ok("the PDF draws the report state's list", /v\.considered/.test(mi));
}
// ---------- NO SENTENCE IS READ BACK FROM THE STORED CASE (Lane D, Nov 12 2026; Sam's live run: the demo case printed a sentence the table no longer says, because the engine stored the sentence on the case).
// CAUSE: the engine stored its SENTENCES on the case. OTHER CARS AND PAGES: every case made before a wording change, on the case panel, in the report (and so the PDF) and in every action answer that carries the case view. CLASS: the case keeps a ledger of how each sentence was made (desk.words: table id and figures) and serving makes each again in the table's current words (lib/desk/serveWords.js).
// The check makes the stored case speak OLD wording (every ledger sentence, wherever it stands in the stored desk, views and pool included, becomes "OLD ..."), then asks for the panel and the report state: no string of either may carry the old text, and every sentence the ledger holds that the panel or the report prints is the table's current one.
{ const strs = (v, out = []) => { if (typeof v === "string") out.push(v); else if (Array.isArray(v)) v.forEach(x => strs(x, out)); else if (v && typeof v === "object") Object.entries(v).forEach(([k, x]) => k !== "words" && strs(x, out)); return out; };
  const oldTree = (v, ws) => typeof v === "string" ? (ws.some(w => w.t === v) ? "OLD " + v : ws.reduce((a, w) => (!a.includes("OLD ") && w.t.length >= 8 && a.includes(w.t) ? a.split(w.t).join("OLD " + w.t) : a), v)) : Array.isArray(v) ? v.map(x => oldTree(x, ws)) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === "words" ? x : oldTree(x, ws)])) : v;
  const old = c => { const ws = c.desk.words || []; const o = cl(c); o.desk = oldTree(o.desk, ws.slice().sort((a, b) => b.t.length - a.t.length)); o.desk.words = ws.map(w => ({ ...w, t: "OLD " + w.t })); return o; };
  const have = base.desk.words || []; ok("the engine's read stored its ledger on the case (" + have.length + " sentences, " + new Set(have.map(w => w.id || w.fn)).size + " kinds)", have.length > 100 && new Set(have.map(w => w.id || w.fn)).size > 25);
  const checkOne = (label, c) => { const o = old(c), view = V.caseView({ id: "x", status: "New", created_at: T, owner_seat: "ava", submission: {}, state: {}, case: o }, [], T), rs = R.reportState(o), shown = [...strs(view.desk), ...strs(rs)], oldOnes = shown.filter(x => /OLD /.test(x));
    ok(label + ": no sentence on the panel or in the report is the stored (older) one", oldOnes.length === 0, JSON.stringify(oldOnes.slice(0, 3)).slice(0, 300));
    // THE PANEL KEEPS THE ENGINE'S SHORT LINE, THE REPORT SPEAKS TO THE SELLER (deskReserveFlowCheck was red since the seller's wording: the panel's reserve.reachedLine took the report's sentence). Every case: the two are never swapped.
    { const v0 = V.caseView({ id: "x", status: "New", created_at: T, owner_seat: "ava", submission: {}, state: {}, case: c }, [], T), ck0 = c.desk.reserveCheck; if (ck0 && ck0.of && K.reserveCheckOf(c)) ok(label + ": the panel's reached line is the engine's short line and the report's is the seller's sentence", v0.reserve.reachedLine === ck0.reachedLine && R.reportState(c).reachedLine !== ck0.reachedLine && /^Over the last/.test(R.reportState(c).reachedLine), JSON.stringify([v0.reserve.reachedLine, R.reportState(c).reachedLine])); }
    const rc = c.desk.reserveCheck; ok(label + ": the reserve check's short lines are in the ledger (so they are made again when served)", !rc || [rc.reachedLine, rc.positionLine].filter(Boolean).every(l => (c.desk.words || []).some(w => w.t === l)), JSON.stringify([rc && rc.reachedLine, rc && rc.positionLine]));
    const fresh = (c.desk.words || []).filter(w => w.id && strs(view.desk).includes(w.t)).length; ok(label + ": the panel prints the table's current sentences (" + fresh + " of the ledger's sentences are on it)", fresh > 10, String(fresh)); };
  checkOne("a case as read", base);
  for (const m of [6, 24]) { const switched = K.setWindow(base, m, T); if (switched) checkOne("a case after a switch to " + m + " months (the stored view is adopted)", switched); }
  { const moved = K.setWindow(K.setReserve(base, { figure: ev.q1 + 1234 }, T), 6, T); if (moved) checkOne("a case whose reserve moved and then switched period (its reserve check is made by the workflow, not the read)", moved); }
  const reserved = await at(Math.round((ev.q1 + ev.q3) / 2)); checkOne("a case after its reserve changed (the engine's check of it is made again)", reserved);
  const withWords = ws => { const o = cl(base); o.desk.words = ws; return o; };
  ok("a case with no ledger (read before it existed) is shown as stored, never failing", !!V.caseView({ id: "x", status: "New", created_at: T, owner_seat: "ava", submission: {}, state: {}, case: withWords(undefined) }, [], T));
}
// ---------- THE PRICE AXIS COMES WITH THE ENGINE'S WINDOWS (Lane D, Nov 12 2026, for Lane S's dot plot: the page computes nothing). desk.evidence.byWindow[w] carries axisMin, axisMax and axisTicks (five or six { value, label (moneyWords), position 0 to 1 }); a case read before the axis existed gets the same from the window's own figures when it is served.
{ const RW = await imp("lib/reasonWords.js"), mk = c => V.caseView({ id: "x", status: "New", created_at: T, owner_seat: "ava", submission: {}, state: {}, case: c }, [], T).desk.evidence.byWindow;
  const good = (w, label) => { const t = w.axisTicks || []; return ok(label + ": " + t.length + " ticks, from " + w.axisMin + " to " + w.axisMax, w.insufficient ? t.length === 0 : t.length >= 5 && t.length <= 6 && w.axisMin <= w.low && w.axisMax >= w.high && t[0].position === 0 && t[t.length - 1].position === 1 && t.every((x, i) => x.label === RW.moneyWords(x.value) && (i === 0 || (x.value > t[i - 1].value && x.position > t[i - 1].position)) && Math.abs(x.position - (x.value - w.axisMin) / (w.axisMax - w.axisMin)) < 0.0002), JSON.stringify(t).slice(0, 200)); };
  const by = mk(base); for (const [k, w] of Object.entries(by)) good(w, "the engine's window " + k);
  { const ev1 = V.caseView({ id: "x", status: "New", created_at: T, owner_seat: "ava", submission: {}, state: {}, case: base }, [], T).desk.evidence; good({ ...ev1 }, "desk.evidence (the case's own window)"); ok("desk.evidence.axisTicks is the case window's own ticks", JSON.stringify(ev1.axisTicks) === JSON.stringify(ev1.byWindow[String(ev1.windowMonths)].axisTicks));
    const oc = cl(base); delete oc.desk.evidence.axisTicks; delete oc.desk.evidence.axisMin; delete oc.desk.evidence.axisMax; good(V.caseView({ id: "x", status: "New", created_at: T, owner_seat: "ava", submission: {}, state: {}, case: oc }, [], T).desk.evidence, "desk.evidence of a case read before the axis existed"); }
  ok("the engine stored the axis on the case (not made at serve time)", Object.values(base.desk.evidence.byWindow).every(w => Array.isArray(w.axisTicks)) && Array.isArray(base.desk.evidence.axisTicks));
  const oldCase = cl(base); for (const w of Object.values(oldCase.desk.evidence.byWindow)) { delete w.axisTicks; delete w.axisMin; delete w.axisMax; }
  for (const [k, w] of Object.entries(mk(oldCase))) good(w, "a case read before the axis existed, window " + k);
}
// (4) THE START FOLLOWS THE CONDITION'S RUNG, THE LIVE LINE IS THE PANEL'S ONLY (Lane D, Nov 13 2026)
{ const DVm = await imp("lib/deskV3.js"), sheetOf = c => ({ id: "l", created_at: T, case: c, submission: { typed: true, photos: [], documents: [] } });
  // the start of every view: all conditions = the window's low end; a rung with 5 or more sales = that rung's own low end; a rung with fewer stays at all conditions and says so
  const bad = [], seen = { few: 0, rung: 0 };
  for (const m of [3, 6, 12]) {
    const all = K.setWindow(K.setCondition(base, null, T), m, T).desk, allStart = all.reserveStart;
    for (const t of [1, 2, 3, 4]) {
      const d = K.setWindow(K.setCondition(base, { tier: t, name: "x" }, T), m, T).desk, rung = d.rungs.find(r => r.tier === t), rs = d.reserveStart;
      if (rung.band && rung.count >= 5) { seen.rung++; if (!rs || rs.figure !== DVm.roundReserve(rung.band.q1) || rs.note !== null || rs.tooFew) bad.push(`${t}:${m} rung start ${JSON.stringify(rs)} vs ${rung.band.q1}`); }
      else { seen.few++; const want = allStart && allStart.figure; if (want != null && !(rs && rs.figure === want && rs.tooFew === true && rs.note === `Too few ${d.rungs.find(r => r.tier === t).name} sales to move the start, so it stays at the low end of all conditions.`)) bad.push(`${t}:${m} few ${JSON.stringify(rs)} vs ${want}`); if (want == null && rs && !rs.tooFew) bad.push(`${t}:${m} few without an all-conditions start`); }
    }
  }
  ok("START 1: in every view a rung with 5 or more sales starts at its own low end, and a rung with fewer stays at the low end of all conditions with the table's note", bad.length === 0 && seen.rung > 0, bad.slice(0, 3).join(" | ") + ` (${seen.rung} rungs, ${seen.few} thin)`);
  ok("START 2: the thin rung's note is in the table and names the condition (Too few Good sales ...)", /^Too few Good sales to move the start, so it stays at the low end of all conditions\.$/.test(DVm.reserveStartOf({ insufficient: true }, 12, { tier: 3, name: "Good", rung: { count: 3, band: null }, anyEvidence: { insufficient: false, q1: 21400 } }).note));
  ok("START 3: the unit: 5 sales in the rung moves the start, 4 does not, no all-conditions start gives none, no condition is the window's", (() => { const ev = { insufficient: false, q1: 30000 }, a = { insufficient: false, q1: 21400 }, S = (n, any) => DVm.reserveStartOf(ev, 12, { tier: 3, name: "Good", rung: { count: n, band: { q1: 26200 } }, anyEvidence: any }); return S(5, a).figure === 26000 && S(4, a).figure === 21500 && S(4, a).tooFew === true && S(4, { insufficient: true }) === null && DVm.reserveStartOf(ev, 12).figure === 30000; })());
  // the live line: this car is live now with a bid; the panel says where it stands against the recommended figure; the report never prints it
  const live = (bid, days) => { const c = cl(base); c.vehicle = { ...(c.vehicle || {}), vinLiveMatch: { listing: { title: "x", endsAt: new Date(Date.parse(T) + days * 864e5).toISOString(), currentBidUsd: bid } } }; return K.setReserve(c, { figure: 17000 }, T); };
  const line = (bid, days) => V.caseView(sheetOf(live(bid, days)), [], T).reserve.liveLine;
  ok("LIVE LINE 1: above, below and at the recommended figure, with the days left, in the table's words", line(20000, 3) === "This car is at $20,000 now with 3 days left, above the recommended figure of $17,000." && line(15000, 1) === "This car is at $15,000 now with 1 day left, below the recommended figure of $17,000." && line(17000, 2) === "This car is at $17,000 now with 2 days left, at the recommended figure of $17,000.", [line(20000, 3), line(15000, 1), line(17000, 2)].join(" | "));
  ok("LIVE LINE 2: no line when the car is not live now (the listing has ended), has no bid, or the case holds no figure", line(20000, -1) === null && line(0, 3) === null && V.caseView(sheetOf((() => { const c = live(20000, 3); c.reserve = { ...c.reserve, figure: null }; return c; })()), [], T).reserve.liveLine === null);
  { const c = live(20000, 3), RSm = R.reportState(c), txt = JSON.stringify(RSm), pdf = JSON.stringify(R.reportState(K.setReserve(c, { figure: 18000 }, T)));
    ok("LIVE LINE 3: the report never prints it (the report state holds neither the sentence nor its words)", !/This car is at|now with \d+ days? left|recommended figure of/.test(txt + pdf), ""); }
  const { readFileSync } = await import("node:fs"), src = ["reportState.js", "reportPdf.js", "reportPdfV3.js"].map(f => readFileSync(path.join(root, "lib/desk", f), "utf8")).join("\n");
  ok("LIVE LINE 4: the source: the report's module never reads the live line or its words", !/liveLineOf|case\.reserve\.live_vs|reserve\.liveLine/.test(src));
}
console.log(`reportConsistencyCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
