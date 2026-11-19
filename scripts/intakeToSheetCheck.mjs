// AN INTAKE ROW ALWAYS OPENS (Lane C, Nov 4 2026; integration of Lane D's intake with Lane E's Valuations page). Lane D writes a row and its files; Lane E's page reads ONE object from desk_sheets.sheet.
// CLASS: any way an intake row can exist (an email with a VIN, photos and documents; a second email added to it; an email with no car; a typed car) and not open on the Valuations page as a sheet with the
// car, mileage, consignor, photos and documents filled and sections 1 to 4 reading the engine's read (here the stand-in fixtures). The check drives the REAL intake (processInbound, createTypedSheet over the
// intake memory store) and the REAL page (lib/crewPages/desk.html + deskvals.js in Chrome) over an adapter that hands the page the row's sheet object, nothing else.
//   node scripts/intakeToSheetCheck.mjs [repo root]      a tree without lib/desk/intake/toSheet.js fails it (the row's sheet column stays {}; the page cannot open it)
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root); process.env.SUPABASE_URL = ""; process.env.SUPABASE_SERVICE_ROLE_KEY = "";
const { loadKit } = await import(pathToFileURL(path.join(root, "scripts/deskIntakeKit.mjs")).href);
const { startDesk, seed, wait } = await import(pathToFileURL(path.join(root, "scripts/deskValsRender.mjs")).href);
let pass = 0, fail = 0; const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d !== undefined ? "  " + (typeof d === "string" ? d : JSON.stringify(d)).slice(0, 300) : "")); } };
const K = await loadKit(root);
const VIN = "WP0AB29918S745123";   // Lane E's fixture VIN: its read is the stand-in fixture
const { st, deps } = K.fresh();
// what the page's store sees: the sheet object in each row of the org, nothing else (the page is Lane E's, unchanged)
const view = st => ({ kind: "intake-memory",
  async get(org, id) { const r = await st.getSheet(org, id); return r && r.sheet && r.sheet.id === r.id ? structuredClone(r.sheet) : null; },
  async put(org, s) { await st.patchSheet(org, s.id, { sheet: s }); return s; },
  async insert(org, s) { throw new Error("the page never inserts into an intake store here"); },
  async list(org) { return (await st.sheetsOfOrg(org)).filter(r => r.sheet && r.sheet.id === r.id).map(r => structuredClone(r.sheet)); },
  async nextReport() { return 1; }, async exportsThisMonth() { return 0; } });

// 1. an email with a VIN, mileage, a consignor, two photos and a PDF
const body = `Hi Hagerty team, please value this one.\n\n---------- Forwarded message ---------\nFrom: Dana Seller <dana@example.com>\nDate: Mon, Nov 2, 2026 at 9:00 AM\nSubject: My Porsche\nTo: ann@hagerty.example\n\nHello, I would like to sell my 2008 Porsche 911 Carrera S, VIN ${VIN}. Mileage: 33,500 miles.\nThanks, Dana`;
const r1 = await K.run.processInbound(K.mail({ id: "e2e-1", from: "ann@hagerty.example", subject: "Fwd: 2008 Porsche 911 for valuation", text: body, attachments: [K.att("front.jpg", "image/jpeg", K.fx("big.jpg")), K.att("rear.jpg", "image/jpeg", Buffer.concat([K.fx("big.jpg"), Buffer.from([0])])), K.att("service.pdf", "application/pdf", Buffer.from("%PDF-1.4 fixture service history\n%%EOF"))] }), deps);
ok(r1.outcome === "created", "the email creates a sheet", r1);
const row = st._state.sheets[0];
ok(!!row && row.sheet && row.sheet.id === row.id, "the intake row carries the Lane E sheet object in desk_sheets.sheet (id equals the row id)", row && row.sheet);
if (row && row.sheet && row.sheet.id === row.id) {
  const so = row.sheet;
  ok(so.owner_seat === String(row.seat_id) && so.status === "New" && so.opened_at === null && so.state && so.state.decision && Array.isArray(so.events), "owner is the forwarding seat, status New, unopened, with an expert state and events", { o: so.owner_seat, s: so.status });
  ok(so.vin === VIN, "the VIN is on the object", so.vin);
  ok(so.submission.mileage === 33500, "the submission carries the mileage the email stated", so.submission.mileage);
  ok(so.submission.consignor && /dana@example\.com/i.test(so.submission.consignor.email || ""), "the consignor is on the object", so.submission.consignor);
  ok(so.submission.photos.length >= 1 && so.submission.photos.every(p => p.id && p.name), "photos are listed with an id and a name", so.submission.photos);
  ok(so.submission.documents.some(d => /service\.pdf/.test(d.name)), "the PDF is listed as a document", so.submission.documents);
}
// 2. the real page opens it
const D = await startDesk({ store: view(st), seat: String(row.seat_id), org: "hagerty", orgSettings: { name: "Hagerty Marketplace" } });
for (const w of [1440, 390]) {
  const p = await D.open(w);
  const inRail = await p.evaluate(id => !!document.querySelector(`[data-open="${id}"]`), row.id);
  ok(inRail, `${w}: the intake row is in the rail`);
  if (inRail) {
    await p.click(`[data-open="${row.id}"]`); await wait(1000);
    const t = await p.evaluate(() => (document.querySelector(".sheet") || { innerText: "" }).innerText);
    ok(t.length > 200, `${w}: the sheet opens (the page printed ${t.length} characters)`);
    ok(/2008 Porsche 911 Carrera S/.test(t) && t.includes(VIN), `${w}: the car and the VIN are printed`);
    ok(t.includes("33,500"), `${w}: the submission's mileage is printed`);
    ok(/Stand-in read/.test(await p.evaluate(() => document.body.innerText)), `${w}: the read is the stand-in (or the engine's) and says so`);
    const secs = await p.evaluate(() => [...document.querySelectorAll(".sheet [data-sec]")].map(e => ({ n: e.getAttribute("data-sec"), h: e.querySelector("h2").textContent, len: e.querySelector(".card").innerText.length })));
    ok(secs.length === 7 && secs.slice(0, 4).every(s => s.len > 40), `${w}: sections 1 to 4 print content (${secs.map(s => s.n + ":" + s.len).join(" ")})`, secs);
    const photos = await p.evaluate(() => document.querySelectorAll(".sheet [data-photo]").length);
    ok(photos === (((row.sheet || {}).submission || { photos: [] }).photos.length) && photos >= 1, `${w}: every photo is offered for the report (${photos})`);
    ok(/service\.pdf/.test(await p.evaluate(() => document.querySelector(".sheet").innerText)), `${w}: the document is listed on the sheet`);
    const to = await p.evaluate(() => { const S = window.__deskVals.state, h = S.sheets[S.active]; return h && h.send ? h.send.to : null; });   // the Send panel opens once the sheet is finalised; its address is the consignor's from the first moment
    ok(/dana@example\.com/i.test(String(to || "")), `${w}: the Send panel is addressed to the consignor`, to);
  }
  await p.close();
}
// 3. a second email adds to the same sheet: the object follows, the expert's work is kept
const photosBefore = ((row.sheet || {}).submission || { photos: [] }).photos.length;
const so0 = (await view(st).get("hagerty", row.id)) || { state: {} }; if (so0.id) await view(st).put("hagerty", { ...so0, status: "In progress", opened_at: "2026-11-04T12:30:00.000Z", state: { ...so0.state, tier: 2 } });
const r2 = await K.run.processInbound(K.mail({ id: "e2e-2", from: "ann@hagerty.example", subject: "Fwd: 2008 Porsche 911 for valuation", text: `More photos. VIN ${VIN}`, attachments: [K.att("side.jpg", "image/jpeg", Buffer.concat([K.fx("big.jpg"), Buffer.from([1, 2])]))] }), deps);
const so2 = await view(st).get("hagerty", row.id);
ok(r2.outcome === "added_to_sheet" && so2 && (so2.submission || { photos: [] }).photos.length > photosBefore, "a second email adds its photo to the same sheet's object", { r2: r2.outcome, n: so2 && (so2.submission || { photos: [] }).photos.length });
ok(so2 && so2.status === "In progress" && so2.state.tier === 2 && so2.opened_at, "the expert's state, status and opened time are kept when an email adds to the sheet", so2 && { s: so2.status, t: so2.state.tier });
// 4. an email with no car is still a row that opens: Needs the car
const r3 = await K.run.processInbound(K.mail({ id: "e2e-3", from: "bob@hagerty.example", subject: "Fwd: something", text: "See attached, no details yet.", attachments: [K.att("pic.jpg", "image/jpeg", Buffer.concat([K.fx("big.jpg"), Buffer.from([9])]))] }), deps);
const row3 = st._state.sheets.find(s => s.id === r3.sheet_id);
ok(row3 && row3.sheet && row3.sheet.id === row3.id && row3.sheet.status === "Needs the car", "an email with no car still writes a sheet object, Needs the car", row3 && row3.sheet);
// 5. a typed car
const typed = await K.run.createTypedSheet({ org: { id: "hagerty" }, seat: st._state.seats.find(s => s.email === "ann@hagerty.example"), text: "2008 Porsche 911 Carrera S", deps });
const rowT = typed.ok && st._state.sheets.find(s => s.id === typed.sheet.id);
ok(rowT && rowT.sheet && rowT.sheet.id === rowT.id && (rowT.sheet.submission || {}).typed === true, "a typed car writes a sheet object too", rowT && rowT.sheet);
// the queue shows all of them to the page
const q = await (await import(pathToFileURL(path.join(root, "lib/desk/sheetActions.js")).href)).handleSheetAction("sheet_queue", { view: "company" }, { env: {}, org: "hagerty", seat: String(row.seat_id), store: view(st), orgSettings: { name: "Hagerty Marketplace" } });
ok(q.ok && q.rows.length >= 3, "the queue lists every intake row (" + (q.rows || []).length + ")", q.rows && q.rows.map(r => r.car));
await D.close();
console.log(`intakeToSheetCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
