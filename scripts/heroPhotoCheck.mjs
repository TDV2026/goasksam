// A CAR WITH ANY PHOTO ON RECORD NEVER DRAWS A GREY BOX (Lane E, Nov 3 2026, lane-e-history-hero). Sam: the history page for the 1971 Porsche 911 (VIN 9111100778, live on Cars & Bids) showed a grey box with the car's name instead of a photo.
// CAUSE: the hero took its photo only from the car's PAST appearances; the live listing's photo was fetched for the "Back at auction now" card and never offered to the hero. The same shape on the other surfaces: a Find or Tasks card for a live car
// with no photo of its own, a popup row for a sale whose own record has no photo, the partner page's sale tile. THE ORDER, ONE PLACE (lib/heroPhoto.js): the live listing's photo, else the most recent appearance of the same car that has one, else the box.
//   node scripts/heroPhotoCheck.mjs     (fake archive, no network)
import fs from "node:fs";
process.env.LAUNCH_STAGE = "2"; process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const VIN_INDEX = new Map([["SAMEVIN0001", "https://img.example/from-archive.jpg"]]);   // the archive's photo for a car whose sale record has none
globalThis.fetch = async (u) => { const s = String(u), rows = [];
  if (/\/rest\/v1\/vin_index/.test(s)) { const m = /vin_norm=(?:eq\.|in\.\()([^&)]*)/.exec(s); for (const v of decodeURIComponent(m ? m[1] : "").split(",")) if (VIN_INDEX.has(v)) rows.push({ vin_norm: v, photo_url: VIN_INDEX.get(v), appearance_date: "2025-01-01" }); }
  if (/\/rest\/v1\/sales_archive/.test(s)) rows.push({ image: null, vin_norm: "SAMEVIN0001" });
  return new Response(JSON.stringify(rows), { status: 200, headers: { "content-type": "application/json" } }); };
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
const LIVE = "https://img.example/live.jpg", OLD = "https://img.example/sale-2022.jpg", NEWER = "https://img.example/sale-2024.jpg";
const apps = (...x) => x.map(([date, image, kind]) => ({ date, image, kind: kind || "sale", house: "Bring a Trailer", url: "https://u/" + date }));
// 1. the history page's hero
const H = await import("../api/history.js"), HP = await import("../lib/heroPhoto.js");
const hero = (live, appearances, name = "1971 Porsche 911") => typeof H.heroHtml === "function" ? H.heroHtml(HP.heroPhotoOf({ live, appearances }), HP.otherPhotosOf({ live, appearances }, HP.heroPhotoOf({ live, appearances })), name) : "";
const imgOf = h => (/<img [^>]*src="([^"]+)"/.exec(h) || [])[1] || null, grey = h => /class="vph nophoto"/.test(h);
ok(imgOf(hero({ photo_url: LIVE, url: "https://cb/1", house: "Cars & Bids" }, [])) === LIVE && !grey(hero({ photo_url: LIVE }, [])), "history hero: a car whose only photo is its live listing's (VIN 9111100778) draws that photo, not the box");
ok(imgOf(hero({ photo_url: LIVE }, apps(["2024-05-01", NEWER], ["2022-03-01", OLD]))) === LIVE, "history hero: the live listing's photo comes first");
ok(imgOf(hero(null, apps(["2024-05-01", null], ["2023-03-01", NEWER], ["2022-03-01", OLD]))) === NEWER, "history hero: no live listing, the most recent appearance that has a photo");
ok(imgOf(hero({ photo_url: null }, apps(["2024-05-01", null, "attempt"], ["2022-03-01", OLD]))) === OLD, "history hero: a live listing with no photo falls to the sales");
ok(grey(hero(null, apps(["2024-05-01", null]))) && grey(hero({ photo_url: null }, [])), "history hero: the box only when the car has no photo anywhere on record");
const src = fs.readFileSync("api/history.js", "utf8");
ok(/heroPhotoOf\(heroSrc\)/.test(src) && /\$\{heroHtml\(photo, altPhotos, name\)\}/.test(src) && !/appearances\.find\(a => a\.image\)/.test(src.replace(/\/\/.*$/gm, "")), "history page: carPage takes its hero from heroPhotoOf (live first), not from the appearances alone");
// 2. the Find card and the Tasks email card (the same card: enrichFast -> withSlots)
const { withSlots } = await import("../api/buySearch.js");
const card = (photo_url, timeline) => withSlots({ id: 1, photo_url, timeline, market: null, sam_lines: [] });
ok(card(null, [{ date: "2022-03-01", photo: OLD }, { date: "2024-05-01", photo: NEWER }]).photo_url === NEWER, "Find and Tasks card: a live car with no photo of its own takes the most recent earlier appearance's photo");
ok(card(LIVE, [{ date: "2024-05-01", photo: NEWER }]).photo_url === LIVE && card(null, [{ date: "2024-05-01", photo: null }]).photo_url === null, "Find and Tasks card: its own photo first; no photo anywhere stays no photo");
const emailSrc = fs.readFileSync("lib/tasks/emailCards.js", "utf8"); ok(/photo: l\.photo_url/.test(emailSrc), "Tasks email: the card's photo is the card's photo_url (the same fallback)");
// 3. the popup's sales
const { fillCardPhotos } = HP;
const rows = await fillCardPhotos(env, [{ price: 1, vinNorm: "SAMEVIN0002", image: "https://img.example/a.jpg" }, { price: 2, vinNorm: "SAMEVIN0002", image: null }, { price: 3, vinNorm: "SAMEVIN0001", image: null }, { price: 4, vinNorm: null, image: null }]);
ok(rows[1].image === "https://img.example/a.jpg" && rows[2].image === VIN_INDEX.get("SAMEVIN0001") && rows[3].image === null && rows[0].image === "https://img.example/a.jpg", "popup rows: a sale with no photo takes another sale of the same car's photo (the pool first, then the archive); a car with none stays without");
const ss = fs.readFileSync("lib/live/search.js", "utf8"); ok((ss.match(/fillCardPhotos\(env/g) || []).length >= 2 && /cardAnswerOf\(await withPhotos\(d\)\)/.test(ss), "popup rows: panelOf fills every sale's photo before it hands the rows to the popup (the pool's rows, the stored whole answer, a picked option)");
// 4. the partner page's sale tile
const { photoUrlFor } = await import("../lib/_salePhoto.js"), pu = await photoUrlFor(env, "00000000-0000-4000-8000-000000000001");
ok(pu && pu.href === VIN_INDEX.get("SAMEVIN0001"), "partner page: a sale whose own record has no photo serves the same car's other photo, not the neutral tile");
console.log(`heroPhotoCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
