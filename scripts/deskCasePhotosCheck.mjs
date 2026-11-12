// A NEW CASE'S PHOTOS ARE PART OF THE CASE WRITE (Lane D, Nov 12 2026; Sam's second run: "desk_sheet_photos insert failed: 400 code 23514" and the case was made without its photos).
// CAUSE: the store wrote source "typed" on the photo row; the table's check allows only 'email' or 'upload' (docs/supabase-desk-storage.sql desk_sheet_photos.source). The page made the case first and added the photos after, so a refused photo left a case without them. Also a PNG or an iPhone HEIC was not converted on the server.
// OTHER PAGES AND CARS: every photo added by hand to any case or sheet (photo_add, sheet_photo_add, the New case form, a forwarded lead's photos use their own road with source email).
// The database here is a stand-in for PostgREST and storage that enforces the photo table's own checks (scripts/lib_fakePostgrest.mjs) under the real supabaseStore.
//   node scripts/deskCasePhotosCheck.mjs [rootDir]
import fs from "node:fs"; import path from "node:path"; import { pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || "."), imp = f => import(pathToFileURL(path.join(root, f)).href);
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) pass++; else { fail++; console.log("FAIL " + n + (d ? " :: " + d : "")); } };
const { fakePostgrest } = await imp("scripts/lib_fakePostgrest.mjs"), S = await imp("lib/desk/sheetStore.js"), A = await imp("lib/desk/sheetActions.js"), sharp = (await import("sharp")).default;
const pg = fakePostgrest(), f0 = globalThis.fetch; globalThis.fetch = pg.fetch;
const env = { supabaseUrl: "https://x.supabase.co", supabaseKey: "k" }, store = S.supabaseStore(env);
const jpg = await sharp({ create: { width: 640, height: 480, channels: 3, background: "#884422" } }).jpeg().toBuffer(), png = await sharp({ create: { width: 640, height: 480, channels: 3, background: "#228844" } }).png().toBuffer(), heic = fs.readFileSync(path.join(root, "scripts/fixtures/desk-intake/portrait.heic"));
const b = x => x.toString("base64"), ctx = () => ({ now: "2026-11-12T12:00:00Z", env, org: "hagerty", seat: "crew", store, orgSettings: { name: "Hagerty" }, readSheet: async () => null, decodeVin: async () => null });
const photosOf = () => pg.tables.desk_sheet_photos, sheets = () => pg.tables.desk_sheets;
try {
  // 1. a case made with a JPG, a PNG and a HEIC: all three stored, each as an upright JPEG, source upload, and the case lists them
  const r = await A.handleSheetAction("case_new", { year: "1999", make: "Porsche", model: "911", photos: [{ name: "a.jpg", data: b(jpg) }, { name: "b.png", data: b(png) }, { name: "c.heic", data: b(heic) }] }, ctx());
  ok("a case with a JPG, a PNG and a HEIC is made", r.ok === true, String(r.why || ""));
  ok("all three photo rows are stored, source upload, content type JPEG, inside the sheet's folder", photosOf().length === 3 && photosOf().every(p => p.source === "upload" && p.content_type === "image/jpeg" && p.resized_path.startsWith("hagerty/" + r.id + "/")), JSON.stringify(photosOf().map(p => [p.source, p.content_type])));
  ok("the case lists its three photos and the sheet holds them", r.ok && r.case.photos.items.length === 3 && (await store.get("hagerty", r.id)).submission.photos.length === 3, String(r.ok && r.case.photos.items.length));
  // 2. a photo the database refuses: no case is left, no photo row, and the answer says the case was not made
  const before = sheets().length, was = photosOf().length, realInsert = store.addPhoto;
  const bad = await A.handleSheetAction("case_new", { year: "1999", make: "Porsche", model: "911", photos: [{ name: "x.png", data: b(png) }, { name: "junk.jpg", data: b(Buffer.from("not a picture")) }] }, ctx());
  ok("a file that is not a picture refuses the whole case before anything is stored", bad.ok === false && /The case was not made because photo 2 was refused/.test(bad.why) && sheets().length === before && photosOf().length === was, String(bad.why));
  store.addPhoto = async (org, sheet, o) => { const x = await realInsert(org, sheet, o); if (o.position === 1) throw new Error("photo row refused (23514)"); return x; };
  const half = await A.handleSheetAction("case_new", { year: "1999", make: "Porsche", model: "911", photos: [{ name: "x.png", data: b(png) }, { name: "y.png", data: b(png) }] }, ctx());
  store.addPhoto = realInsert;
  ok("a photo row that fails after the case is stored takes the case out again: no case, no photo row", half.ok === false && /The case was not made because/.test(half.why) && sheets().length === before && photosOf().length === was, JSON.stringify([half.why, sheets().length, photosOf().length]));
  // 3. a photo added later to an existing case (the road the page takes): PNG and HEIC accepted, row stored
  const id = r.id, add = async (name, buf) => A.handleSheetAction("case_edit", { id, op: "photo_add", name, data: b(buf) }, ctx());
  const a1 = await add("d.png", png), a2 = await add("e.heic", heic), a3 = await add("f.jpg", jpg);
  ok("photo_add takes a PNG, a HEIC and a JPG and stores each", a1.ok && a2.ok && a3.ok && photosOf().length === was + 3, JSON.stringify([a1.why, a2.why, a3.why]));
  // 4. discard: the page takes out a case it could not finish, only while it is new and untouched
  const mk = await A.handleSheetAction("case_new", { year: "1999", make: "Porsche", model: "911" }, ctx()), gone = await A.handleSheetAction("case_discard", { id: mk.id }, ctx());
  ok("case_discard takes out a new case of the owner", mk.ok && gone.ok === true && !sheets().some(x => x.id === mk.id));
  const mk2 = await A.handleSheetAction("case_new", { year: "1999", make: "Porsche", model: "911" }, ctx()), other = await A.handleSheetAction("case_discard", { id: mk2.id }, { ...ctx(), seat: "someone" });
  ok("case_discard refuses a case that is not the caller's", other.ok === false && sheets().some(x => x.id === mk2.id), String(other.why));
  const worked = await A.handleSheetAction("case_discard", { id: r.id }, ctx());
  ok("case_discard refuses a case that was worked on (edited after it was made)", worked.ok === false && sheets().some(x => x.id === r.id), String(worked.why));
  ok("the page asks case_discard when a photo is refused, and sends photos in a form that takes HEIC and PNG", /case_discard/.test(fs.readFileSync(path.join(root, "lib/preview/deskV4Client.js"), "utf8")) && /image\/heic/.test(fs.readFileSync(path.join(root, "lib/preview/deskV4.js"), "utf8")));
} finally { globalThis.fetch = f0; }
console.log(`deskCasePhotosCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
