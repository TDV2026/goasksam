// A FORWARDED LEAD IS A V4 CASE (Lane D, Nov 10 2026). CLASS: any way a lead can arrive by email (a VIN, car words, a chassis number, nothing, a chain, a second email on the same lead, the same email twice) must land as exactly one stored case in New leads
// with every supplied field marked seller supplied and unverified, the original email on the view with a signed address, and the engine read taken by the SAME road a typed case takes. Driven through the REAL intake (processInbound over the intake memory store),
// the REAL case writers and the REAL engine path over Lane B's fake archive; no email is ever sent.   node scripts/intakeToCaseCheck.mjs [repo root]
import path from "node:path"; import fs from "node:fs"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root); process.env.SUPABASE_URL = ""; process.env.SUPABASE_SERVICE_ROLE_KEY = "";
const imp = f => import(pathToFileURL(path.join(root, f)).href);
const { loadKit } = await imp("scripts/deskIntakeKit.mjs"), { setup } = await imp("scripts/_deskCaseWorld.mjs");
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d !== undefined ? "  " + (typeof d === "string" ? d : JSON.stringify(d)).slice(0, 300) : "")); } };
const K = await loadKit(root), WORLD = await setup(root), TC = await imp("lib/desk/intake/toCase.js"), A = await imp("lib/desk/sheetActions.js"), CV = await imp("lib/desk/caseView.js"), CW = await imp("lib/desk/caseWorkflow.js"), M = await imp("lib/desk/caseModel.js");
const VIN = "WP0AA2995XS626785";
const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const world = () => { const { st, deps, reads } = K.fresh(); const sheets = TC.rowSheets(st), engineCalls = [];
  const readSheet = async input => { engineCalls.push(input); const { vin, ...rest } = input; return WORLD.read(vin ? { ...rest, text: "1999 Porsche 911 Carrera" } : input); }   /* Lane B's fake archive resolves car words, not VINs (the live engine decodes the VIN itself) */, caseRead = TC.caseReader({ sheets, readSheet, now: () => "2026-11-04T12:00:30.000Z" }), queued = [];
  deps.decodeVin = async v => (v === VIN || v === "WP0AB29918S745123" ? { year: 1999, make: "Porsche", model: "911", trim: "Carrera", body: "Coupe" } : null);   // the world's car
  deps.sheets = sheets; deps.startCaseRead = (o, s) => { queued.push([o, s]); };
  const store = { kind: "memory", get: (o, i) => sheets.get(o, i), putIf: (o, s, e) => sheets.putIf(o, s, e), put: async () => {}, async list(o) { return (await st.sheetsOfOrg(o)).filter(r => r.sheet && r.sheet.id === r.id).map(r => structuredClone(r.sheet)); }, async exportsOf() { return []; }, async exportsThisMonth() { return 0; }, async nextReport() { return 1; } };
  return { st, deps, sheets, store, readSheet, caseRead, queued, engineCalls, reads }; };
const chain = (inner, extra = "") => `Hi team, please value this one.\n\n---------- Forwarded message ---------\nFrom: Dana Seller <dana@example.com>\nDate: Mon, Nov 2, 2026 at 9:00 AM\nSubject: My Porsche\nTo: ann@hagerty.example\n\n${inner}\n${extra}`;
const full = chain(`Hello, I would like to sell my 1999 Porsche 911 Carrera. VIN ${VIN}. Mileage: 61,200 miles. Gearbox: manual. Colour: Silver. Asking price: $58,000. Phone: (555) 123-4567.`);
const lead = (w, o = {}) => w.deps && K.run.processInbound(K.mail({ id: o.id || "em-" + Math.random().toString(36).slice(2), from: o.from || "ann@hagerty.example", subject: o.subject || "Fwd: 1999 Porsche 911 for valuation", text: o.text || full, headers: o.headers || {}, attachments: o.attachments === undefined ? [K.att("front.jpg", "image/jpeg", K.fx("big.jpg")), K.att("rear.jpg", "image/jpeg", K.fx("rotated.jpg")), K.att("IMS invoice.pdf", "application/pdf", pdf)] : o.attachments, authentication: o.authentication }), w.deps);

// 1. a forwarded lead creates ONE stored V4 case in New leads, filled in from the email
const w = world(), r1 = await lead(w, { id: "fwd-1", headers: { "message-id": "<m1@example.com>" } });
const rows = () => w.st._state.sheets, row = rows()[0], so = row && row.sheet, c1 = so && so.case;
ok(r1.outcome === "created" && rows().length === 1, "the email creates one sheet", r1);
ok(!!(c1 && c1.fields), "the sheet carries a stored V4 case (sheet.case), not a bare row", so && Object.keys(so));
ok(c1 && c1.origin === "forwarded" && c1.status === "new" && c1.lead_ref === row.id, "the case is marked forwarded, is new, and is the lead's own", c1 && [c1.origin, c1.status, c1.lead_ref]);
const sup = ["vin", "mileage", "transmission", "colour"];
ok(c1 && sup.every(k => c1.fields[k].value != null && c1.fields[k].source === "seller" && c1.fields[k].verified === false), "every field the seller supplied is marked seller supplied and unverified", c1 && sup.map(k => [k, c1.fields[k].value, c1.fields[k].source, c1.fields[k].verified]));
ok(c1 && c1.fields.mileage.value === 61200 && c1.fields.transmission.value === "Manual" && /^silver$/i.test(c1.fields.colour.value) && c1.fields.vin.value === VIN, "the values are the email's", c1 && sup.map(k => c1.fields[k].value));
ok(c1 && ["year", "make", "model"].every(k => c1.fields[k].value != null && c1.fields[k].source === "vin_decoded" && c1.fields[k].verified === false), "the VIN's decode fills year, make and model, marked as decoded and unverified", c1 && ["year", "make", "model"].map(k => [c1.fields[k].value, c1.fields[k].source]));
ok(c1 && c1.seller.name === "Dana Seller" && c1.seller.email === "dana@example.com" && c1.seller.phone === "(555) 123-4567" && c1.seller.asking_price === 58000, "the seller's name, email, phone and asking figure ride on the case", c1 && c1.seller);
ok(c1 && c1.reserve.sellerRequested === false && c1.reserve.figure === null, "the seller's ask is never the reserve, and the reserve is not marked the seller's request until the analyst says so", c1 && c1.reserve);
ok(c1 && c1.photos.items.length === 2 && c1.documents.length === 1 && c1.documents[0].status === "received", "the photos and the attachment became case photos and a received document", c1 && [c1.photos.items.length, c1.documents.length]);
// the view: signed original email, the received line, the ask in words
const signed = [], sign = async (e, o, p) => { signed.push(p); return "https://signed.test/" + encodeURIComponent(p) + "?t=1"; };
const mk = (org = "hagerty") => ({ org, seat: String(w.st._state.seats[0].id), store: w.store, now: "2026-11-04T12:05:00.000Z", env: {}, signUrl: sign, readSheet: async (e, i) => w.readSheet(i), fetchImage: async () => null });
const g = await A.handleSheetAction("case_get", { id: row.id }, mk());
ok(g.ok && g.case.origin === "forwarded" && g.case.stage === "new", "the lead is in the queue as a new forwarded case", g.ok ? [g.case.origin, g.case.stage] : g);
ok(g.case.sourceEmail && g.case.sourceEmail.name === "Original email.eml" && g.case.sourceEmail.line === "The original email as received" && /^https:\/\/signed\.test\//.test(g.case.sourceEmail.url), "the original email is on the view as { name, url (signed), line }", g.case.sourceEmail);
ok(!JSON.stringify(row.sheet).includes("signed.test") && so.submission.sourceEmail && so.submission.sourceEmail.path.startsWith(`hagerty/${row.id}/`), "the stored sheet carries only the path, never a signed address");
{ const other = await A.handleSheetAction("case_get", { id: row.id }, { ...mk("other"), seat: "99" }); ok(!other.ok || !other.case || !other.case.sourceEmail || other.case.sourceEmail.url === null, "a seat of another org gets no address for the email", other.ok ? other.case.sourceEmail : other.why); }
ok(g.case.vehicle.submittedLine && /^Received \d{1,2} \w+ 20\d\d\.$/.test(g.case.vehicle.submittedLine) && g.case.reserve.sellerAskLine === "The seller asked for $58,000.", "the received line and the seller's ask are the table's words", [g.case.vehicle.submittedLine, g.case.reserve.sellerAskLine]);
ok(w.queued.length === 1 && w.queued[0][1] === row.id && w.engineCalls.length === 0, "the webhook only queues the engine read (it never waits for it)", [w.queued.length, w.engineCalls.length]);

// 2. the engine read is identical to a typed case's: one road (openCaseRead), same inputs, same answer
const rd = await w.caseRead("hagerty", row.id), c2 = (await w.sheets.get("hagerty", row.id)).case;
ok(rd.read === true && c2.desk && c2.desk.evidence && c2.desk.reserveCheck && c2.reserve.source === "engine" && !CW.needsRecall(c2), "the background read stores the engine's answer under the case's key, the reserve from the engine and checked", rd);
{ const ws = world(), SM = await imp("lib/desk/sheetStore.js"), nc = await A.handleSheetAction("case_new", { text: "1999 Porsche 911 Carrera", mileage: "61,200", transmission: "Manual", colour: "Silver", body: c2.fields.body.value || undefined }, { org: "hagerty", seat: "1", store: SM.memoryStore(), now: "2026-11-04T12:05:00.000Z", env: {}, readSheet: async (e, i) => ws.readSheet(i) });
  const a = JSON.stringify([c2.desk.evidence, c2.desk.reserveStart]), b = nc.ok ? JSON.stringify([nc.case.desk.evidence, nc.case.desk.reserveStart]) : "x";
  ok(nc.ok && a === b, "the forwarded case's market read is the typed case's for the same car (evidence and reserve start)", nc.ok ? "" : nc.why); }
{ const t = fs.readFileSync(path.join(root, "lib/desk/intake/toCase.js"), "utf8"), s = fs.readFileSync(path.join(root, "lib/desk/sheetActions.js"), "utf8");
  ok(/openCaseRead\(/.test(t) && /openCaseRead\(/.test(s) && !/readSheet\([^)]*\)/.test(t.replace(/readSheet\(/g, "readSheet (").replace(/openCaseRead\([^)]*readSheet[^)]*\)/g, "")) , "one road: case_new and the forwarded lead both open the case through caseWorkflow.openCaseRead, and toCase calls the engine nowhere else"); }

// 3. the same email twice never makes a second case; a later email on the lead is merged
const dup = await lead(w, { id: "fwd-1" });
ok(dup.outcome === "duplicate" && rows().length === 1, "the same email arriving twice (same message) creates nothing", dup);
await A.handleSheetAction("case_edit", { id: row.id, op: "field", field: "colour", value: "Black" }, mk());
const later = await lead(w, { id: "fwd-2", headers: { "message-id": "<m2@example.com>", "in-reply-to": "<m1@example.com>" }, text: chain("Here is another photo.", `Odometer shows 61,200.`), attachments: [K.att("side.jpg", "image/jpeg", K.fx("portrait.heic"))] });
const c3 = (await w.sheets.get("hagerty", row.id)).case;
ok(later.outcome === "added_to_sheet" && rows().length === 1, "a later email on the same lead is added to it, not a second lead", later);
ok(c3.photos.items.length === 3 && c3.fields.colour.value === "Black" && c3.audit.some(a => a.what === "email added" && /photo/.test(a.line)) && !!c3.desk, "its photo joined the case and the analyst's own edit and the engine read are untouched", [c3.photos.items.length, c3.fields.colour.value]);

// 3b. an analyst who edits while the engine is still reading is never overwritten, and the read still lands
{ const wr = world(); await lead(wr, { id: "race-1" }); const rrow = wr.st._state.sheets[0]; let edited = false;
  const racing = TC.caseReader({ sheets: wr.sheets, now: () => "2026-11-04T12:00:30.000Z", readSheet: async input => { if (!edited) { edited = true; await A.handleSheetAction("case_edit", { id: rrow.id, op: "reserve", patch: { why: "Analyst wrote this while the engine read." } }, { org: "hagerty", seat: String(wr.st._state.seats[0].id), store: wr.store, now: "2026-11-04T12:00:10.000Z", env: {}, signUrl: sign }); } return wr.readSheet(input); } });
  const out = await racing("hagerty", rrow.id), cr = (await wr.sheets.get("hagerty", rrow.id)).case;
  ok(out.read === true && cr.desk && cr.reserve.why === "Analyst wrote this while the engine read." && cr.reserve.whyEdited === true, "an edit made while the engine reads is kept, and the read lands on the edited case", [out, cr.reserve && cr.reserve.why]); }

// 4. a car that cannot be identified still lands, with the needs attention line; the analyst can enter it by hand
const wu = world(), un = await lead(wu, { id: "u-1", subject: "Fwd: my old car", text: chain("I have an old car for sale and would like to know what it is worth."), attachments: [] }), ur = wu.st._state.sheets[0], uc = ur && ur.sheet && ur.sheet.case;
ok(un.outcome === "needs_the_car" && wu.st._state.sheets.length === 1 && uc && uc.origin === "forwarded", "an email that names no car still lands, as a case in New leads", un);
ok(uc && uc.needs_review.some(n => n.id === "car_unidentified" && n.state === "open" && n.material && /^The car was not identified/.test(n.label)), "with the needs attention line saying the car was not identified", uc && uc.needs_review);
ok(uc && !CW.readinessOf(uc).ready && CW.readinessOf(uc).blockers.some(b => b.key === "vehicle"), "and it cannot be finalized until the car is entered");
ok(wu.queued.length === 0 && (await wu.caseRead("hagerty", ur.id)).read === false && wu.engineCalls.length === 0, "no engine read is asked for a car nobody has named");
{ const e = await A.handleSheetAction("case_edit", { id: ur.id, op: "field", field: "vin", value: VIN }, { org: "hagerty", seat: String(wu.st._state.seats[0].id), store: wu.store, now: "2026-11-04T12:05:00.000Z", env: {}, readSheet: async (x, i) => wu.readSheet(i) });
  ok(e.ok && e.case.fields.vin.value === VIN && e.case.needs_review.find(n => n.id === "car_unidentified").state === "done" && e.recalled === true && e.case.desk, "entering the VIN by hand closes the line and the engine reads the car", e.ok ? e.case.needs_review : e.why); }

// 5. intake keeps its guards: nothing from an unknown sender, nothing unauthenticated
const wg = world(), n0 = wg.st._state.sheets.length;
const bad1 = await lead(wg, { id: "x-1", from: "stranger@example.com" }), bad2 = await lead(wg, { id: "x-2", authentication: { spf: "fail", dkim: "fail", dmarc: "fail" } }), bad3 = await lead(wg, { id: "x-3", from: "zed@other.example" });
ok(bad1.outcome === "dropped_not_seat" && bad2.outcome === "dropped_unauthenticated" && bad3.outcome === "dropped_not_seat" && wg.st._state.sheets.length === n0 && wg.queued.length === 0, "an unknown sender, an unauthenticated mail and another org's seat make no sheet and no case", [bad1.outcome, bad2.outcome, bad3.outcome]);

// 6. THE CLASS: every shape of lead lands as one stored forwarded case with its supplied fields seller supplied and unverified
{ const shapes = { vin: chain(`Mileage: 61,200 miles. VIN ${VIN}.`), words: chain("My 2008 Porsche 911 Carrera S, mileage: 40,000 miles. Colour: Red."), chassis: chain("A 1967 Ferrari 275 GTB, chassis 09123. Gearbox: manual."), nothing: chain("Please look at this."), km: chain(`VIN ${VIN}. Odometer: 98,000 km. Asking $61,500.`), twoVins: chain(`VIN ${VIN} and also WP0AB29918S745123.`) }, bad = [];
  for (const [name, text] of Object.entries(shapes)) { const x = world(), o = await lead(x, { id: "s-" + name, text, attachments: name === "nothing" ? [] : undefined }), r = x.st._state.sheets, cs = r.map(s => s.sheet && s.sheet.case);
    if (r.length !== 1 || !cs[0] || !cs[0].fields) { bad.push(name + ": " + o.outcome + " sheets " + r.length + " case " + !!cs[0]); continue; }
    const c = cs[0]; if (c.origin !== "forwarded" || c.status !== "new") bad.push(name + ": origin/status");
    for (const k of Object.keys(c.fields)) { const f = c.fields[k]; if (f.value != null && !(f.verified === false && (f.source === "seller" || f.source === "vin_decoded"))) bad.push(`${name}: ${k} is ${f.source}/${f.verified}`); }
    const v = (await A.handleSheetAction("case_get", { id: r[0].id }, { org: "hagerty", seat: "1", store: x.store, now: "2026-11-04T12:05:00.000Z", env: {}, signUrl: sign })); if (!v.ok || v.case.origin !== "forwarded" || !v.case.sourceEmail || !v.case.sourceEmail.url) bad.push(name + ": the view lacks the original email");
    if (name === "km" && !(c.seller.asking_price === 61500 && c.fields.mileage.value > 60000 && c.fields.mileage.value < 61500)) bad.push("km: mileage or ask " + c.fields.mileage.value + "/" + c.seller.asking_price); }
  ok(bad.length === 0, `${Object.keys(shapes).length} shapes of lead (VIN, words, chassis, nothing, kilometres, two VINs): one stored forwarded case each, every supplied field seller supplied and unverified, the original email on the view`, bad.join(" | ")); }
// 7. words: every sentence on these lines is the table's, and money goes through moneyWords
{ const t = fs.readFileSync(path.join(root, "lib/desk/intake/toCase.js"), "utf8").split("\n").filter(l => !/^\s*\/\//.test(l)).join("\n").replace(/\/\/.*$/gm, ""), v = fs.readFileSync(path.join(root, "lib/desk/caseView.js"), "utf8");
  ok(!/"[A-Z][a-z]+ [a-z]+ [a-z ]+[.]?"/.test(t) && !/toLocaleString|"\$"/.test(t) && !/toLocaleString/.test(v.split("sellerAskLine")[1].split("\n")[0]), "no sentence is typed in toCase and no figure is formatted by hand (the ask is moneyWords through reasonWords)"); }
console.log(`intakeToCaseCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
