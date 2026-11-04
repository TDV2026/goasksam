// DESK INTAKE: READING A SUBMISSION (Lane D, Nov 4 2026; docs/desk-valuations-spec.md "Intake by email"). Offline: no database, no network.
// The spec's edge cases, each against a real email shape: VIN check digit, two VINs, pre 1981 chassis, a forward chain read whole (earliest message = consignor),
// a later email on the same thread or VIN adds to the sheet, no car at all (row made, never dropped), HEIC converted, and shared-folder links kept unopened.
//   node scripts/intakeParseCheck.mjs [repo root]   (pointing it at a tree without the fix shows it fail: scripts/intakeFailsWithout.mjs)
import path from "node:path"; import { fileURLToPath } from "node:url";
import { loadKit, reporter } from "./deskIntakeKit.mjs";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root); process.env.SUPABASE_URL = ""; process.env.SUPABASE_SERVICE_ROLE_KEY = "";
const { ok, result } = reporter();
const K = await loadKit(root);
const { processInbound } = K.run, { findVins, vinCheckDigitOk, readSubmission } = K.parse;
const VIN_A = K.makeVin("WP0AB299", "8S745123"), VIN_B = K.makeVin("ZFFXR48A", "S0105678");
const fetches = []; const realFetch = globalThis.fetch; globalThis.fetch = async (u, ...r) => { fetches.push(String(u)); throw new Error("network is closed in this check"); };

// ---- 1. VIN: structure and maker code decide, the check digit only marks (European market VINs have no North American check digit) ----
const { classifyVin } = K.parse;
const VIN_EU = ["WP0ZZZ99ZTS392124", "WDB1240201A123456", "ZFFXR48AXS0105678"];   // Porsche, Mercedes-Benz, Ferrari: structure valid, check digit not valid
const VIN_NA_BAD = "1M8GDM9AXKP042789";   // a North American VIN with the wrong check digit: known maker code, valid structure
const VIN_STRUCT = "WP0AB2990US745123";   // the model-year character is 0
const VIN_NA_LETTERS = "1M8GDM9AXKPABCDE1";   // a North American VIN must end in five digits
const VIN_UNKNOWN = "XYZAB29918S745123";   // maker code XYZ is not known and the check digit fails
const VIN_UNKNOWN_OK = K.makeVin("XYZAB299", "8S745123");   // unknown maker code but a correct check digit
ok("a VIN with a correct check digit is a VIN", vinCheckDigitOk(VIN_A) && findVins(`vin ${VIN_A}`).valid[0] === VIN_A && classifyVin(VIN_A).state === "valid");
for (const v of VIN_EU) ok(`European VIN ${v}: structure valid, known maker code, check digit not valid = the car, marked`, !vinCheckDigitOk(v) && classifyVin(v).state === "check_digit_not_valid" && findVins(`VIN ${v}`).valid[0] === v && findVins(`VIN ${v}`).checkDigitNotValid[0] === v, classifyVin(v));
ok("a North American VIN with a wrong check digit is also the car, marked", classifyVin(VIN_NA_BAD).state === "check_digit_not_valid" && findVins(VIN_NA_BAD).valid[0] === VIN_NA_BAD);
ok("a string that fails structure is NOT a VIN, and is reported as rejected", [VIN_STRUCT, VIN_NA_LETTERS].every(v => classifyVin(v).state === "rejected" && findVins(`vin ${v}`).valid.length === 0 && findVins(`vin ${v}`).failed[0] === v), [classifyVin(VIN_STRUCT), classifyVin(VIN_NA_LETTERS)]);
ok("an unknown maker code with a failing check digit is NOT a VIN; with a correct check digit it is", classifyVin(VIN_UNKNOWN).state === "rejected" && classifyVin(VIN_UNKNOWN_OK).state === "valid");
ok("a long word is never read as a VIN", findVins("Congratulationsonyourpurchase").valid.length === 0 && findVins("INTERNATIONALISATION").failed.length === 0);
{ const { st, deps, reads } = K.fresh();
  const r = await processInbound(K.mail({ from: "ann@hagerty.example", subject: "Fwd: 1995 Porsche from Germany", text: `Please look. VIN ${VIN_EU[0]}\nMileage: 31,000 km` }), deps);
  const s = st._state.sheets[0];
  ok("an email with a European VIN: a New sheet (not dropped, not Needs the car) holding that VIN, marked check digit not valid, car decoded, read started", r.outcome === "created" && s.status === "New" && s.vin === VIN_EU[0] && s.vin_check_invalid === true && s.make === "Porsche" && reads.length === 1, s); }
{ const { st, deps } = K.fresh();
  await processInbound(K.mail({ from: "ann@hagerty.example", subject: "x", text: `VIN ${VIN_A}` }), deps);
  ok("a VIN with a correct check digit is not marked", st._state.sheets[0].vin === VIN_A && st._state.sheets[0].vin_check_invalid === false); }
{ const { st, deps } = K.fresh();
  const r = await processInbound(K.mail({ from: "ann@hagerty.example", subject: "Fwd: mystery", text: `Please look. VIN ${VIN_STRUCT}` }), deps);
  const s = st._state.sheets[0];
  ok("a string that fails structure alone makes a Needs the car row that lists the rejected string", r.outcome === "needs_the_car" && s.status === "Needs the car" && s.vin == null && s.vin_failed_check[0] === VIN_STRUCT, s); }
{ const { st, deps } = K.fresh();   // a later email with the same marked VIN joins the sheet
  await processInbound(K.mail({ id: "e1", from: "ann@hagerty.example", subject: "x", text: `VIN ${VIN_EU[2]}` }), deps);
  const r = await processInbound(K.mail({ id: "e2", from: "bob@hagerty.example", subject: "y", text: `VIN ${VIN_EU[2]} more photos`, attachments: [K.att("a.jpg", "image/jpeg", K.fx("big.jpg"))] }), deps);
  ok("a later email with the same European VIN adds to the same sheet", r.outcome === "added_to_sheet" && st._state.sheets.length === 1); }

// ---- 2. two VINs ----
{ const { st, deps } = K.fresh();
  await processInbound(K.mail({ from: "ann@hagerty.example", subject: "Two cars", text: `First: ${VIN_A}\nSecond: ${VIN_B}` }), deps);
  const s = st._state.sheets;
  ok("two VINs: the first becomes the sheet, the second is on the More VINs flag, one row", s.length === 1 && s[0].vin === VIN_A && JSON.stringify(s[0].more_vins) === JSON.stringify([VIN_B]), s[0]); }

// ---- 3. pre 1981 chassis, No VIN found ----
{ const { st, deps } = K.fresh();
  await processInbound(K.mail({ from: "ann@hagerty.example", subject: "Fwd: 1965 Ferrari 275 GTB", text: "Seller's car.\nChassis no. 06701\nMileage: 41,000 miles" }), deps);
  const s = st._state.sheets[0];
  ok("pre 1981: chassis kept, No VIN found box set, sheet is New (the car is known from the words)", s.chassis === "06701" && s.no_vin === true && s.vin == null && s.status === "New" && s.year === 1965, s); }

// ---- 4. forward chains ----
const GMAIL = `Here is one for you.\n\n---------- Forwarded message ---------\nFrom: Jane Doe <jane@gmail.example>\nDate: Mon, Nov 2, 2026 at 9:00 AM\nSubject: Selling my 2008 Porsche 911 Carrera S\nTo: Marketplace <marketplace@hagerty.example>\n\nHi, the VIN is ${VIN_A}. 33,500 miles, color: Guards Red, 6-speed manual.\n\nOn Sun, Nov 1, 2026 at 5:00 PM John Seller <john@seller.example> wrote:\n> Jane, send it to Hagerty.\n`;
const OUTLOOK = `FYI\n\n________________________________\nFrom: Pat Owner <pat@owner.example>\nSent: Tuesday, November 3, 2026 10:00 AM\nTo: Ann <ann@hagerty.example>\nSubject: RE: 1995 Ferrari F355\n\nThanks Ann.\n\n-----Original Message-----\nFrom: Chris First <chris@first.example>\nSent: Monday, November 2, 2026 8:00 AM\nTo: Pat Owner\nSubject: 1995 Ferrari F355\n\nVIN ${VIN_B}`;
{ const { st, deps } = K.fresh();
  await processInbound(K.mail({ from: "ann@hagerty.example", subject: "Fwd: Selling my 2008 Porsche 911 Carrera S", text: GMAIL }), deps);
  const s = st._state.sheets[0];
  ok("Gmail chain: consignor is the EARLIEST message's sender, not the forwarder or the middle", s.consignor_email === "john@seller.example" && s.consignor_name === "John Seller", [s.consignor_name, s.consignor_email]);
  ok("chain read whole: VIN from the middle message, mileage, colour, gearbox", s.vin === VIN_A && s.mileage === 33500 && s.colour === "Guards Red" && s.gearbox === "Manual", s);
  ok("the sheet belongs to the forwarding seat, status New, original email kept", s.seat_email === "ann@hagerty.example" && s.status === "New" && st._state.objects.has(s.original_path)); }
{ const { st, deps } = K.fresh();
  await processInbound(K.mail({ from: "bob@hagerty.example", subject: "Fwd: RE: 1995 Ferrari F355", text: OUTLOOK }), deps);
  const s = st._state.sheets[0];
  ok("Outlook chain: earliest sender is the consignor", s.consignor_email === "chris@first.example" && s.vin === VIN_B, [s.consignor_email, s.vin]); }
{ const { st, deps } = K.fresh();
  const chain = `x\n\n---------- Forwarded message ---------\nFrom: Marketplace Desk <ann@hagerty.example>\nDate: Mon\nSubject: Fwd: car\nTo: x\n\n---------- Forwarded message ---------\nFrom: Dee Seller <dee@seller.example>\nDate: Sun\nSubject: car\nTo: ann\n\n2008 Porsche 911 Carrera S, ${VIN_A}`;
  await processInbound(K.mail({ from: "ann@hagerty.example", subject: "Fwd: Fwd: car", text: chain }), deps);
  ok("a seat's own address inside the chain is never the consignor", st._state.sheets[0].consignor_email === "dee@seller.example", st._state.sheets[0].consignor_email); }
{ // forwarded as an attachment (.eml): read whole
  const { st, deps } = K.fresh();
  const eml = Buffer.from(`From: Eve Owner <eve@owner.example>\nTo: ann@hagerty.example\nSubject: 1995 Ferrari F355\nDate: Mon, 2 Nov 2026 08:00:00 +0000\nMessage-ID: <orig1@owner.example>\nContent-Type: text/plain\n\nMy car, VIN ${VIN_B}, 12,000 miles.\n`);
  await processInbound(K.mail({ from: "ann@hagerty.example", subject: "Fwd: 1995 Ferrari F355", text: "see attached", attachments: [K.att("mail.eml", "message/rfc822", eml)] }), deps);
  const s = st._state.sheets[0];
  ok("a forward sent as an attached email is read whole (VIN, consignor, mileage)", s.vin === VIN_B && s.consignor_email === "eve@owner.example" && s.mileage === 12000, s); }

// ---- 5. a later email: same thread or same VIN adds to the sheet ----
{ const { st, deps, reads } = K.fresh();
  const first = K.mail({ id: "m1", from: "ann@hagerty.example", subject: "Fwd: Selling my 2008 Porsche 911 Carrera S", text: GMAIL, headers: { "message-id": "<t1@mail.example>" } });
  await processInbound(first, deps);
  const second = K.mail({ id: "m2", from: "ann@hagerty.example", subject: "Re: Selling my 2008 Porsche 911 Carrera S", text: "More photos attached.", headers: { "message-id": "<t2@mail.example>", "in-reply-to": "<t1@mail.example>", references: "<t1@mail.example>" }, attachments: [K.att("front.jpg", "image/jpeg", K.fx("big.jpg"))] });
  const r2 = await processInbound(second, deps);
  const files = await st.filesOf("hagerty", st._state.sheets[0].id);
  ok("same thread (message ids): added to the existing sheet, not a second row", r2.outcome === "added_to_sheet" && st._state.sheets.length === 1);
  ok("the new photo is on the first sheet; the engine read started once only", files.filter(f => f.kind === "photo").length === 1 && reads.length === 1, [files.length, reads.length]);
  const third = K.mail({ id: "m3", from: "bob@hagerty.example", subject: "Different words entirely", text: `VIN ${VIN_A} here is the service file.`, attachments: [K.att("service.pdf", "application/pdf", Buffer.from("%PDF-1.4 fake"))] });
  const r3 = await processInbound(third, deps);
  ok("same VIN (any subject, even another seat's email): added to the existing sheet", r3.outcome === "added_to_sheet" && st._state.sheets.length === 1 && (await st.filesOf("hagerty", st._state.sheets[0].id)).some(f => f.kind === "document" && f.filename === "service.pdf"));
  const fourth = K.mail({ id: "m4", from: "ann@hagerty.example", subject: "Re: Selling my 2008 Porsche 911 Carrera S", text: `Oh and VIN ${VIN_B} is a second car`, headers: { "in-reply-to": "<t1@mail.example>" } });
  const r4 = await processInbound(fourth, deps);
  ok("a different VIN in the same thread is a different car: its own sheet", r4.outcome === "created" && st._state.sheets.length === 2 && st._state.sheets[1].vin === VIN_B); }
{ const { st, deps } = K.fresh();
  await processInbound(K.mail({ id: "n1", from: "ann@hagerty.example", subject: "Fwd: car", text: GMAIL }), deps);
  st._state.sheets[0].status = "Finalised";
  const r = await processInbound(K.mail({ id: "n2", from: "ann@hagerty.example", subject: "Fwd: car", text: `More: VIN ${VIN_A}`, attachments: [K.att("x.jpg", "image/jpeg", K.fx("big.jpg"))] }), deps);
  ok("a finalised sheet is immutable: a later email makes a NEW sheet that references it, the old one gets nothing", r.outcome === "created" && st._state.sheets.length === 2 && st._state.sheets[1].related_sheet_id === st._state.sheets[0].id && (await st.filesOf("hagerty", st._state.sheets[0].id)).length === 1); }

// ---- 6. no car at all: a row, never dropped ----
{ const { st, deps, reads } = K.fresh();
  const r = await processInbound(K.mail({ from: "ann@hagerty.example", subject: "Can you look at this?", text: "Sorry, the seller did not say what it is.", attachments: [K.att("IMG_9.jpg", "image/jpeg", K.fx("big.jpg"))] }), deps);
  const s = st._state.sheets[0];
  ok("no car: row created as Needs the car, owned by the seat, original kept, photo kept, no engine read", r.outcome === "needs_the_car" && s.status === "Needs the car" && s.seat_email === "ann@hagerty.example" && st._state.objects.has(s.original_path) && (await st.filesOf("hagerty", s.id)).some(f => f.kind === "photo") && reads.length === 0, s); }

// ---- 7. images ----
{ const { st, deps } = K.fresh();
  await processInbound(K.mail({ from: "ann@hagerty.example", subject: "2008 Porsche 911 Carrera S photos", text: `VIN ${VIN_A}`, attachments: [
    K.att("IMG_0001.HEIC", "image/heic", K.fx("portrait.heic")), K.att("side.jpg", "image/jpeg", K.fx("rotated.jpg")), K.att("big.jpg", "image/jpeg", K.fx("big.jpg")), K.att("big-again.jpg", "image/jpeg", K.fx("big.jpg")), K.att("sig.png", "image/png", K.fx("logo.png")), K.att("doc.pdf", "application/pdf", Buffer.from("%PDF-1.4 x")) ] }), deps);
  const sh = st._state.sheets[0], files = await st.filesOf("hagerty", sh.id), photos = files.filter(f => f.kind === "photo");
  const heic = photos.find(f => /HEIC/i.test(f.filename)), rot = photos.find(f => f.filename === "side.jpg"), big = photos.find(f => f.filename === "big.jpg");
  ok("HEIC is converted to a JPEG copy (and the HEIC original is kept)", heic && heic.converted && st._state.objects.get(heic.resized_path).slice(0, 2).toString("hex") === "ffd8" && st._state.objects.get(heic.path).slice(4, 8).toString() === "ftyp", heic);
  ok("a sideways photo (orientation tag 6) is stored upright: 1000x700 becomes 700x1000", rot && rot.width === 700 && rot.height === 1000, rot);
  ok("a large photo is resized to 2000 on the long edge, the original bytes are kept whole", big && Math.max(big.width, big.height) === 2000 && st._state.objects.get(big.path).length === K.fx("big.jpg").length, big);
  ok("the same photo sent twice is stored once; a 90px signature logo is not a photo", photos.length === 3 && !files.some(f => /big-again|sig/.test(f.filename)), files.map(f => f.filename));
  ok("documents are listed by name, kept as sent", files.some(f => f.kind === "document" && f.filename === "doc.pdf"));
  ok("every stored object sits under the org and the sheet", [...st._state.objects.keys()].every(p => p.startsWith(`hagerty/${sh.id}/`)), [...st._state.objects.keys()].filter(p => !p.startsWith("hagerty/"))); }

// ---- 8. links stay unopened ----
{ const { st, deps } = K.fresh(); fetches.length = 0;
  await processInbound(K.mail({ from: "ann@hagerty.example", subject: "2008 Porsche 911 Carrera S", text: `VIN ${VIN_A}\nPhotos: https://drive.google.com/drive/folders/AbC123 and https://www.dropbox.com/sh/xyz/abc?dl=0 and https://example.com/not-a-share` }), deps);
  const s = st._state.sheets[0];
  ok("Drive and Dropbox links are kept as written on the sheet", s.links.length === 2 && s.links[0].startsWith("https://drive.google.com/") && s.links[1].startsWith("https://www.dropbox.com/"), s.links);
  ok("no link was opened (no network call at all during intake)", fetches.length === 0, fetches); }

// ---- 9. an engine read starts for a known car, in the background ----
{ const { st, deps, reads } = K.fresh();
  await processInbound(K.mail({ from: "ann@hagerty.example", subject: "x", text: `VIN ${VIN_A}` }), deps);
  ok("a VIN decodes to the car and the engine read is started for it with that car", reads.length === 1 && reads[0].car.make === "Porsche" && st._state.sheets[0].car_label === "2008 Porsche 911 Carrera S" && st._state.sheets[0].engine_status === "running", [reads, st._state.sheets[0].car_label]); }

globalThis.fetch = realFetch;
{ const r = result(); console.log(`\nintakeParseCheck: ${r.pass} pass, ${r.fail} FAIL`); process.exit(r.fail ? 1 : 0); }
