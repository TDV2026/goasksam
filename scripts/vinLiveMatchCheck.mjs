// clock: real-ok every date is built from the real now in the same process; a listing ending in 2 days stays ending in 2 days
// VIN LIVE MATCH CHECK (Lane B, Nov 11 2026). Market Check asked "is it a 2016 Porsche 911 coupe" for VIN WP0AF2A92GS187171, a 2016 Porsche 911 GT3 RS live on Sotheby's Motorsport. CAUSE: api/vehicleIdentity matched a VIN against the ARCHIVE only
// (findVinArchiveMatch); a car at auction right now with no sale on record matched nothing and went to the DECODE question, whose trim ("RS") the resolver could not keep. The live pool held the car with this VIN the whole time.
// FIX: lib/vinLiveMatch.js. After the archive match, a VIN that is in the live pool is the car its own listing names: the title names it, no question is asked, the listing travels as vinLiveMatch.
// CLASS: every venue (the match reads the live pool, never one venue), every venue's feed record keeps its VIN into the pool (mapLiveRecord), an ended listing is no match, a recorded sale still leads (archive first).
// Offline: fetch is stubbed (vPIC, Supabase). `node scripts/vinLiveMatchCheck.mjs [repo root]` (a tree without the fix fails: run it against origin/main); `--mutants` breaks one thing at a time.
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { spawnSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const args = process.argv.slice(2), here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(args.find(a => !a.startsWith("--")) || path.join(here, ".."));
if (args.includes("--mutants")) process.exit(mutants());
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2"; process.env.OLDCARSDATA_API_KEY = "unused-local-check"; process.env.ANTHROPIC_API_KEY = "unused";
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) pass++; else { fail++; console.log("FAIL " + n + (d !== undefined ? " " + JSON.stringify(d) : "")); } };
const VIN = "WP0AF2A92GS187171", DAY = 864e5;
const VPIC = { ModelYear: "2016", Make: "PORSCHE", Model: "911", Trim: "RS", Series: "Turbo/Turbo S", Series2: "Type 991", BodyClass: "Coupe", ErrorCode: "0" };   // fetched from vPIC Nov 11 2026
const liveRow = (o = {}) => ({ id: 255975, source: "sothebysmotorsport", url: "https://www.sothebysmotorsport.com/auction/2016-porsche-911gt3rs-12587", listing_title: "2016 Porsche 911 GT3 RS", year: 2016, make: "Porsche", model: "991", vin_norm: VIN, mileage: 40292, mileage_unit: "mi", body: "coupe", end_time: new Date(Date.now() + 2 * DAY).toISOString(), photo_url: "https://img.example.com/gt3rs.jpg", status: "live", current_bid_usd: 180000, location: "Houston, TX", ...o });
const VIN2 = "1G1YZ23J3M5800527", VPICS = { [VIN2]: { ModelYear: "1991", Make: "CHEVROLET", Model: "Corvette", Trim: "ZR1", Series: "", BodyClass: "Coupe", ErrorCode: "0" } };   // fetched from vPIC Nov 11 2026
let LIVE = [liveRow()], ARCH = [], LASTLIVE = "";
globalThis.fetch = async (url) => {
  const u = String(url), j = (b, s = 200) => new Response(JSON.stringify(b), { status: s });
  if (/vpic\.nhtsa/.test(u)) return j({ Results: [(VPICS[(/DecodeVinValues\/([A-Z0-9]+)/.exec(u) || [])[1]] || VPIC)] });
  if (/\/rest\/v1\/app_config/.test(u)) return j([{ value: "1" }]);
  if (/\/rest\/v1\/live_listings/.test(u)) { LASTLIVE = u; const m = /vin_norm=eq\.([A-Z0-9]+)/.exec(u); return j(LIVE.filter(r => !m || r.vin_norm === m[1])); }   // the stub does NOT apply the status and end filters: the module's own check must hold, and the request must carry them
  if (/\/rest\/v1\/sales_archive/.test(u) && /vin_norm=eq/.test(u)) return j(ARCH);
  if (/\/rest\/v1\//.test(u)) return j([]);
  return j({}, 404);
};
const { default: handler } = await import(pathToFileURL(path.join(root, "api/vehicleIdentity.js")).href);
const call = async text => { let body = null; const res = { statusCode: 200, setHeader() {}, getHeader() {}, status(c) { this.statusCode = c; return this; }, json(o) { body = o; return this; }, send(o) { body = o; return this; }, end() { return this; } }; await handler({ method: "POST", headers: { cookie: "", host: "goasksam.com", "x-forwarded-for": "203.0.113." + Math.floor(Math.random() * 200) }, body: { text }, query: {}, url: "/api/vehicleIdentity" }, res); return body || {}; };
// (1) the car of the report: a live VIN with no sale on record is the car its listing names, no question
{ const d = await call(VIN);
  ok("(1) status valid: no question is asked when the live row names the car", d.status === "valid" && !d.clarification, [d.status, d.clarification && d.clarification.kind]);
  ok("(1) the car is named from the listing title: 2016 Porsche 911 GT3 RS (the trim kept)", d.vehicle && d.vehicle.year === 2016 && d.vehicle.make === "Porsche" && d.vehicle.model === "911" && d.vehicle.trim === "GT3 RS", d.vehicle && [d.vehicle.year, d.vehicle.make, d.vehicle.model, d.vehicle.trim]);
  ok("(1) the VIN travels with the car", d.vehicle && d.vehicle.vin === VIN);
  const l = d.vinLiveMatch;
  ok("(1) the listing is carried: title, venue, link, photo", l && l.listing && l.listing.title === "2016 Porsche 911 GT3 RS" && l.listing.venue === "Sotheby's Motorsport" && /sothebysmotorsport\.com/.test(l.listing.url) && /^https:\/\//.test(l.listing.photo), l && l.listing);
  ok("(1) the time left is the engine's line next to the venue", l && /^Ends (today|tomorrow|in \d+ days)$/.test(l.listing.endsLine) && l.listing.endsLine === "Ends in 2 days", l && l.listing.endsLine);
  ok("(1) a correction names the match", (d.corrections || []).some(c => c.type === "vin_live_match")); }
// (2) every venue: the match reads the live pool, never one venue
for (const src of ["bringatrailer", "carsandbids", "pcarmarket", "hagerty", "rmsothebys", "gooding", "bonhams", "mecum", "barrettjackson", "broadarrow", "sothebysmotorsport", "collectingcars", "themarket", "pistonheads", "carandclassic", "mbmarket", "acc", "hemmings"]) {
  LIVE = [liveRow({ source: src })]; const d = await call(VIN);
  ok(`(2) a live VIN on ${src} is recognised, no question`, d.status === "valid" && !d.clarification && d.vinLiveMatch && d.vinLiveMatch.listing.venue && d.vehicle.trim === "GT3 RS", [src, d.status, d.clarification && d.clarification.kind]);
}
LIVE = [liveRow()];
// (3) a listing that is not live now is no match: the decode question stands
{ LIVE = [liveRow({ end_time: new Date(Date.now() - 3600e3).toISOString() })]; const a = await call(VIN);
  LIVE = [liveRow({ status: "ended_sold" })]; const b = await call(VIN);
  ok("(3) an ended listing is no match: no vinLiveMatch", !a.vinLiveMatch && !b.vinLiveMatch, [!!a.vinLiveMatch, !!b.vinLiveMatch]);
  await call(VIN); ok("(3) the request asks the table for live rows with an end time in the future", /status=eq\.live/.test(LASTLIVE) && /end_time=gt\./.test(LASTLIVE), LASTLIVE.slice(-200)); LIVE = [liveRow()]; }
// (4) the archive leads: a recorded sale of the VIN is the match, the live match stays out of its way
{ ARCH = [{ id: 1, vin: VIN, make: "Porsche", model: "991", year: 2016, platform: "Bring a Trailer", sale_date: "2024-03-01", sale_price: 150000, mileage: 30000, listing_title: "2016 Porsche 911 GT3 RS", raw_record: {} }]; const d = await call(VIN);
  ok("(4) a recorded sale of the VIN is still the exact-car match (archive first), and the live listing rides beside it", d.vinArchiveMatch && d.vinArchiveMatch.hasSale && !(d.corrections || []).some(c => c.type === "vin_live_match") && d.vinLiveMatch && d.ownLive && d.ownLive.line === "This car is live now", [!!d.vinArchiveMatch, !!d.vinLiveMatch, d.ownLive]); ARCH = []; }
// (5) the pool is fed: every venue's feed record keeps its VIN into the live row (the ingest class), under every VIN field name the feed uses
{ const F = await import(pathToFileURL(path.join(root, "lib/live/feed.js")).href);
  for (const src of ["bringatrailer", "carsandbids", "sothebysmotorsport", "rmsothebys", "gooding", "bonhams", "mecum", "barrettjackson", "broadarrow", "collectingcars", "pcarmarket", "hagerty", "themarket"]) for (const key of ["vin", "chassis", "chassis_number"]) {
    const m = F.mapLiveRecord({ source_slug: src, source_record_id: "r-" + src, title: "2016 Porsche 911 GT3 RS", make: "Porsche", model: "911", year: 2016, [key]: "WP0AF2A92GS187171", url: "https://example.com/" + src, auction_end_at: new Date(Date.now() + DAY).toISOString(), featured_image_url: "https://img.example.com/a.jpg" }, new Date().toISOString());
    ok(`(5) ${src}: a feed record carrying the VIN as "${key}" is stored with vin_norm`, m && m.vin_norm === "WP0AF2A92GS187171", m && m.vin_norm);
  } }
// (8) THE LISTING'S SPELLING OF A TRIM (Nov 11 2026). The 1991 Corvette ZR-1 (VIN 1G1YZ23J3M5800527) is live as "45k-Mile 1991 Chevrolet Corvette ZR-1": the resolver holds ZR1, not "ZR-1", so the live match could not name the car, the decode question was asked, and the page's VIN read was the bare 1991 Corvette ($7,000 to $14,000, 10 sales; the ZR1 reads $23,000 to $35,000, 8)
{ LIVE = [liveRow({ id: 327086, vin_norm: VIN2, listing_title: "45k-Mile 1991 Chevrolet Corvette ZR-1", year: 1991, make: "Chevrolet", model: "Corvette", mileage: 45000, source: "bringatrailer", url: "https://bringatrailer.com/listing/1991-chevrolet-corvette-zr-1-75/" })];
  const d = await call(VIN2);
  ok("(8) a live VIN whose listing writes the trim ZR-1 is named from the listing: no question, the 1991 Chevrolet Corvette ZR1", d.status === "valid" && !d.clarification && d.vehicle && d.vehicle.year === 1991 && d.vehicle.make === "Chevrolet" && d.vehicle.model === "Corvette" && d.vehicle.trim === "ZR1", [d.status, d.clarification && d.clarification.kind, d.vehicle && [d.vehicle.year, d.vehicle.model, d.vehicle.trim]]);
  ok("(8) the listing keeps its own title and the engine's time left", d.vinLiveMatch && d.vinLiveMatch.listing.title === "45k-Mile 1991 Chevrolet Corvette ZR-1" && d.ownLive && d.ownLive.line === "This car is live now");
  const Dt = await import(pathToFileURL(path.join(root, "lib/vinDecodeTrim.js")).href);
  for (const [t, mk, want] of [["1991 Chevrolet Corvette ZR-1", "Chevrolet", "1991 Chevrolet Corvette ZR1"], ["2015 Chevrolet Corvette Z-06 Coupe", "Chevrolet", "2015 Chevrolet Corvette Z06 Coupe"], ["2019 Chevrolet Corvette ZR-1X", "Chevrolet", "2019 Chevrolet Corvette ZR1X"], ["2016 Porsche 911 GT-3 RS", "Porsche", "2016 Porsche 911 GT3 RS"], ["1991 Chevrolet Corvette", "Chevrolet", "1991 Chevrolet Corvette"], ["2016 Porsche 911 GT3 RS", "Porsche", "2016 Porsche 911 GT3 RS"]])
    ok(`(8) the trim spellings: "${t}" reads "${want}"`, Dt.spellTrimWords(t, mk) === want, Dt.spellTrimWords(t, mk));
  // production's resolver answers "ZR-1" with a typo confirmation ("Did you mean ZR1?"), which is no car: the live match must hand it the trim as the resolver holds it
  { const LM = await import(pathToFileURL(path.join(root, "lib/vinLiveMatch.js")).href), live = LM.liveMatchOf(LIVE[0]);
    const asProduction = async t => /ZR-1/.test(t) ? { status: "needs_confirmation", clarification: { kind: "typo_confirmation" }, vehicle: { make: "Chevrolet", model: "Corvette", year: 1991 } } : { status: "valid", vehicle: { year: 1991, make: "Chevrolet", model: "Corvette", trim: "ZR1" } };
    const v = await LM.liveVehicleOf(live, { vin: VIN2 }, asProduction);
    ok("(8) a resolver that asks about ZR-1 still names the car: the listing's spelling is written as the trim the resolver holds", v && v.trim === "ZR1" && v.year === 1991, v); }
  LIVE = [liveRow()]; }
// (6) ONE VIN IDENTITY FOR EVERY DOOR (Nov 11 2026). Lane C read the public page for this VIN as "2016 Porsche 911 Coupe", Carrera rows, "one comparable car" for the VIN's own listing. The page asks api/sellerDecision with the VIN as typed (never api/vehicleIdentity); Desk reads it through lib/sheetRead.js;
// Sell asks vehicleIdentity and then sellerDecision; Find's card links Market Check with ?vin=. Each door must name the same car (2016 Porsche 911 GT3 RS), read the same pool (the typed GT3 RS read of the same world: GT3 RS sales, never the Carrera rows), carry the same listing (vinLiveMatch) and the engine's line.
// CAUSE found by this sweep: (a) only vehicleIdentity named a live VIN's car from its listing; sellerDecision and sheetRead read the listing's title words for the trim only and sheetRead passed no live listing at all; (b) when that first read was thin or the decode named a body, decodeTrimRerun read the car again with the body
// added and the rerun's words REPLACED the listing's trim ("2016 Porsche 911 coupe"), so the answer was the bare model; (c) no answer carried the listing, so the page counted the VIN's own car among "comparable cars".
{ const W = await import(pathToFileURL(path.join(root, "scripts/_deskOlderWorld.mjs")).href);
  const world = W.install(root, { cars: [{ n: 2, year: 2016, make: "Porsche", model: "911", rmodel: "911", rtrim: "Carrera", typedBody: "Coupe", read: true, c12: 12, m12: 12, c24: 20, m24: 20, range12: [60000, 70000, 80000] }] }), worldFetch = globalThis.fetch;
  { const rows = world.DATA.get("911"); rows.push(...rows.map(r => { const t = r.listing_title.replace("Carrera", "GT3 RS"); return { ...r, id: "g" + r.id, source_id: "g" + r.source_id, listing_title: t, sale_price: Math.round(r.sale_price * 3.2), raw_record: { ...r.raw_record, id: "g" + r.raw_record.id, title: t, url: r.raw_record.url + "g", source_url: r.raw_record.source_url + "g" } }; })); }
  const j2 = (b, st = 200) => new Response(JSON.stringify(b), { status: st });
  globalThis.fetch = async (url, init) => { const u = String(url);
    if (/vpic\.nhtsa/.test(u)) return j2({ Results: [VPIC] });
    if (/\/rest\/v1\/app_config/.test(u)) return j2([{ value: "1" }]);
    if (/\/rest\/v1\/live_listings/.test(u)) { LASTLIVE = u; const m = /vin_norm=eq\.([A-Z0-9]+)/.exec(u); return j2(LIVE.filter(r => !m || r.vin_norm === m[1])); }
    if (/\/rest\/v1\/(sales_archive|auction_attempts)/.test(u) && /(vin_norm|chassis_vin_norm)=eq/.test(u)) return j2(/auction_attempts/.test(u) ? [] : ARCH);
    if (/\/rest\/v1\/auction_attempts/.test(u)) return j2([]);
    return worldFetch(url, init); };
  LIVE = [liveRow()]; ARCH = [];
  const { default: sd } = await import(pathToFileURL(path.join(root, "api/sellerDecision.js")).href), { default: bs } = await import(pathToFileURL(path.join(root, "api/buySearch.js")).href), SR = await import(pathToFileURL(path.join(root, "lib/sheetRead.js")).href), V = await import(pathToFileURL(path.join(root, "lib/vehicle.js")).href);
  const run = async (h, req) => { let out = null; const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, getHeader() {}, removeHeader() {}, status(c) { this.statusCode = c; return this; }, json(o) { out = o; return this; }, send(o) { out = o; return this; }, end() { return this; } }; await h({ headers: { cookie: "", host: "x", "x-forwarded-for": "203.0.113." + Math.floor(Math.random() * 200) }, query: {}, ...req }, res); return out || {}; };
  const rd = f => fs.readFileSync(path.join(root, f), "utf8");
  const answer = body => run(sd, { method: "POST", body, url: "/api/sellerDecision" });
  const typed = await answer({ oneBox: true, anonId: "t", car: { raw: "2016 Porsche 911 GT3 RS" }, asked: 0 }), bare = await answer({ oneBox: true, anonId: "t", car: { raw: "2016 Porsche 911 Carrera" }, asked: 0 });
  ok("(6) the world separates the pools: the typed GT3 RS read and the typed Carrera read are not the same pool", typed.resolvedCar && typed.resolvedCar.trim === "GT3 RS" && (typed.rawPool || []).length > 0 && (typed.rawPool || []).length !== (bare.rawPool || []).length && /GT3 RS/.test(JSON.stringify((typed.cards || [])[0] || {})), [typed.resolvedCar && typed.resolvedCar.trim, (typed.rawPool || []).length, (bare.rawPool || []).length]);
  const dec = (await V.resolveVehicle(VIN, { vinConfirm: true })).vehicle;   // the decode-shaped vehicle a page sends after "Yes, that's it"
  const DOORS = [["Market Check page, VIN as typed in lower case (car=wp0af2a92gs187171)", { oneBox: true, anonId: "t", car: { raw: VIN.toLowerCase() }, asked: 0 }], ["Market Check page, VIN as typed in upper case", { oneBox: true, anonId: "t", car: { raw: VIN }, asked: 0 }],
    ["Market Check after the confirm, the decode's vehicle (trim RS)", { oneBox: true, anonId: "t", car: { raw: "2016 Porsche 911 RS Coupe", vehicle: { ...dec, trim: "RS", canonicalLabel: "2016 Porsche 911 RS Coupe" } }, asked: 0 }],
    ["Sell and Market Check after vehicleIdentity, the identity's vehicle", { oneBox: true, anonId: "t", car: { raw: "2016 Porsche 911 GT3 RS", vehicle: dec }, asked: 0 }]];
  for (const [name, body] of DOORS) {
    const a = await answer(body), rc = a.resolvedCar || {};
    ok(`(6) ${name}: the car is the 2016 Porsche 911 GT3 RS`, rc.year === 2016 && rc.make === "Porsche" && rc.model === "911" && rc.trim === "GT3 RS", rc);
    ok(`(6) ${name}: the pool is the typed GT3 RS pool, never the Carrera rows`, (a.rawPool || []).length === (typed.rawPool || []).length && a.resolvedCar && a.resolvedCar.familyLabel === typed.resolvedCar.familyLabel, [(a.rawPool || []).length, (typed.rawPool || []).length]);
    ok(`(6) ${name}: the listing rides on the answer, and the engine says "This car is live now"`, a.vinLiveMatch && a.vinLiveMatch.listing.title === "2016 Porsche 911 GT3 RS" && /sothebysmotorsport\.com/.test(a.vinLiveMatch.listing.url) && a.ownLive && a.ownLive.line === "This car is live now" && a.ownLive.listing.url === a.vinLiveMatch.listing.url, [!!a.vinLiveMatch, a.ownLive && a.ownLive.line]);
    ok(`(6) ${name}: the closest sales are matched at the listing's mileage and the listing shown is that listing`, /40,292 miles/.test(String(a.mileageLine || "")) && a.vinLiveMatch && a.vinLiveMatch.listing.mileage === 40292 && a.ownLive.listing.mileageLine === "40,292 miles", a.mileageLine);
  }
  const sr = await SR.sheetRead({ supabaseUrl: process.env.SUPABASE_URL, supabaseKey: "k", poolColumns: false, asked: 0, noStageLog: true }, { vin: VIN, mileage: 40000 });
  ok("(6) Desk (sheetRead): the car is the 2016 Porsche 911 GT3 RS", sr && sr.car && /2016 Porsche 911 GT3 RS/.test(sr.car.label) && sr.car.decode.trim === "GT3 RS", sr && sr.car);
  ok("(6) Desk (sheetRead): the pool is the GT3 RS sales, never the Carrera rows (low figure above $150,000)", sr && sr.market && sr.market.tier === "result" && sr.market.low > 150000, sr && sr.market && [sr.market.tier, sr.market.low, sr.market.count]);
  ok("(6) Desk (sheetRead): the listing and the engine's line ride on the sheet", sr && sr.vinLiveMatch && sr.vinLiveMatch.listing.title === "2016 Porsche 911 GT3 RS" && sr.ownLive && sr.ownLive.line === "This car is live now", sr && [!!sr.vinLiveMatch, sr.ownLive && sr.ownLive.line]);
  // (7) THE OWN LISTING'S VS-RANGE CELL (Nov 11 2026): the comparable rows carried "Below the range"; the own listing's row carried no cell. The same engine line, from the same comparison of the bid with the answer's range, rides on ownLive.listing and the page prints it as sent
  { const own = sr && sr.ownLive && sr.ownLive.listing, panelRow = (await run(bs, { method: "GET", url: "/api/buySearch?x", query: { panel: "1", make: "Porsche", model: "911", trim: "GT3 RS", year: "2016", lo: String(sr.market.low), hi: String(sr.market.high) } })).rows || [];
    ok("(7) the own listing carries where its bid sits against the range: placing and the engine's line (a $180,000 bid under a range from " + (sr && sr.market && sr.market.low) + ")", own && own.placing === "below the range" && own.vsRangeLine === "Below the range", own && [own.placing, own.vsRangeLine]);
    ok("(7) it is the same line a comparable row carries for the same bid", panelRow.length === 1 && panelRow[0].vsRangeLine === own.vsRangeLine && panelRow[0].placing === own.placing, panelRow.map(r => [r.placing, r.vsRangeLine]));
    const ab = await answer({ oneBox: true, anonId: "t", car: { raw: VIN }, asked: 0 });
    ok("(7) an answer with no range (thin) carries no vs-range line on the listing, never a guess", ab.ownLive && ab.ownLive.listing && !ab.ownLive.listing.vsRangeLine && !ab.ownLive.listing.placing, ab.ownLive && ab.ownLive.listing.vsRangeLine);
    ok("(7) the page prints the own listing's vsRangeLine as sent, and a comparable row's", /esc\(l\.vsRangeLine \|\| ""\)/.test(rd("public/js/onebox.js")) && /l\.vsRangeLine \|\| placingPillText/.test(rd("public/js/onebox.js"))); }
  // the live panel: the VIN's own listing is never one of the comparable cars
  const q = qs => run(bs, { method: "GET", url: "/api/buySearch?" + qs, query: Object.fromEntries(new URLSearchParams(qs)) });
  const p1 = await q("panel=1&make=Porsche&model=911&trim=GT3%20RS&year=2016"), p2 = await q("panel=1&make=Porsche&model=911&trim=GT3%20RS&year=2016&vin=" + VIN);
  ok("(6) the live panel counts the VIN's own listing as a comparable car only when no VIN is passed; with the VIN it is left out of the rows and the count", p1.count === 1 && (p1.rows || []).length === 1 && p2.count === 0 && (p2.rows || []).length === 0, [p1.count, p2.count]);
  // static: the page forwards the VIN and prints the engine's block as sent; chat and Find open no VIN decode of their own
  ok("(6) the Market Check page forwards the VIN to the panel and prints ownLive as sent", /"&vin=" \+ encodeURIComponent\(d\.vinLiveMatch\.vin\)/.test(rd("public/js/onebox.js")) && /o\.line/.test(rd("public/js/onebox.js")) && !/This car is live now/.test(rd("public/js/onebox.js")));
  ok("(6) Sell opens the VIN through api/vehicleIdentity (the identity every door shares)", /api\/vehicleIdentity/.test(rd("public/js/entry.js")));
  for (const f of ["lib/live/samChat.js", "api/buySearch.js"]) ok(`(6) ${f} opens no VIN decode of its own`, !/vinConfirm|decodeVinRich|decodeVinFacts/.test(rd(f)));
  LIVE = [liveRow()]; }
console.log(`vinLiveMatchCheck: ${fail ? fail + " FAIL" : "all pass"} (${pass})`); process.exit(fail ? 1 : 0);

function mutants() {
  const M = [
    ["lib/vinLiveMatch.js", "const canon = await resolve(words).catch(() => null)", "const canon = await resolve(live.displayName).catch(() => null)", "(8) a resolver that asks about ZR-1 still names the car"],
    ["lib/vinDecodeTrim.js", 'out = out.replace(new RegExp("(^|[^A-Za-z0-9])" + body + "(?![A-Za-z0-9])", "ig"), (m, lead) => lead + w);', "", "(8) the trim spellings"],
    ["lib/vinAsTyped.js", "const own = [recOwn, deps && deps.rerunWords].filter(Boolean).join(\" \") || null;", "const own = (deps && deps.rerunWords) || recOwn || null;", "(6) Market Check page, VIN as typed in lower case"],
    ["api/sellerDecision.js", "live: vinLive, liveMatch,", "live: vinLive,", "(6) Market Check page, VIN as typed in upper case"],
    ["lib/sheetRead.js", "liveMatch = d.liveMatch ? await d.liveMatch(env, { vin }).catch(() => null) : null;", "liveMatch = null;", "(6) Desk (sheetRead)"],
    ["api/buySearch.js", "const live = ownIn.length ?", "const live = false ?", "(6) the live panel"],
    ["lib/vinLiveMatch.js", 'const vs = placing ? { placing, vsRangeLine: reasonLine("live.vs_range", { placing }) } : {};', "const vs = {};", "(7) the own listing carries where its bid sits"],
    ["lib/vinAsTyped.js", "Array.isArray(out.cluster) && out.cluster.length === 2 ? out.cluster.map(Number) : null));", "null));", "(7) the own listing carries where its bid sits"],
    ["api/buySearch.js", 'vsRangeLine: r.position ? reasonLine("live.vs_range", { placing: r.position }) : null,', "", "(7) it is the same line a comparable row carries"],
    ["public/js/onebox.js", 'esc(l.vsRangeLine || "") + "</td></tr></tbody></table></div>"', 'esc("") + "</td></tr></tbody></table></div>"', "(7) the page prints"],
    ["lib/vinAsTyped.js", "if (ctx.liveMatch) { const ol = ownLiveOf(", "if (false) { const ol = ownLiveOf(", "the listing rides on the answer"],
    ["public/js/onebox.js", '(d && d.vinLiveMatch && d.vinLiveMatch.vin ? "&vin=" + encodeURIComponent(d.vinLiveMatch.vin) : "")', '""', "the Market Check page forwards the VIN"],
    ["api/vehicleIdentity.js", "if (!vinMatch && liveAny) {", "if (false) {", "(1) status valid"],
    ["lib/vinLiveMatch.js", 'String(row.status || "") !== "live" || !(Date.parse(row.end_time) > nowMs)', 'String(row.status || "") !== "live"', "(3) an ended listing"],
    ["lib/vinLiveMatch.js", "&status=eq.live&end_time=gt.", "&status=eq.live&x=gt.", "(3) the request asks the table"],
    ["lib/vinLiveMatch.js", "listing: { title: String(row.listing_title).trim(), venue: houseName(row.source),", "listing: { title: String(row.listing_title).trim(), venue: null,", "(1) the listing is carried"],
    ["lib/vinLiveMatch.js", 'endsLine: reasonLine("pick.ends", { endsAt: Date.parse(row.end_time), now: nowMs })', "endsLine: null", "(1) the time left"],
    ["lib/vinLiveMatch.js", "if (!row || String(row.status", 'if (!row || row.source !== "bringatrailer" || String(row.status', "(2) a live VIN on"],
    ["lib/live/feed.js", "vin: vin || null, vin_norm: normVin(vin) || null,", "vin: vin || null, vin_norm: source === \"sothebysmotorsport\" ? null : (normVin(vin) || null),", "(5) sothebysmotorsport"]
  ];
  let bad = 0;
  for (const [file, from, to, name] of M) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vlm-"));
    for (const d of ["lib", "api", "scripts", "public"]) fs.cpSync(path.join(root, d), path.join(tmp, d), { recursive: true, filter: s => !/node_modules/.test(s) });
    for (const f of ["vercel.json", "package.json"]) if (fs.existsSync(path.join(root, f))) fs.copyFileSync(path.join(root, f), path.join(tmp, f));
    fs.symlinkSync(path.join(root, "node_modules"), path.join(tmp, "node_modules"));
    const fp = path.join(tmp, file), src = fs.readFileSync(fp, "utf8");
    if (!src.includes(from)) { console.log("MUTANT BROKEN (text not found): " + name + " :: " + from.slice(0, 60)); bad++; continue; }
    fs.writeFileSync(fp, src.replace(from, to));
    const r = spawnSync("node", [path.join(tmp, "scripts/vinLiveMatchCheck.mjs"), tmp], { encoding: "utf8", timeout: 120000 }), out = (r.stdout || "") + (r.stderr || "");
    const named = out.split("\n").some(l => l.startsWith("FAIL") && l.includes(name));
    if (!(r.status !== 0 && named)) { console.log(`MUTANT SURVIVED: ${name}`); out.split("\n").slice(0, 3).forEach(l => console.log("   " + l.slice(0, 160))); bad++; }
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`vinLiveMatchCheck mutants: ${M.length - bad} of ${M.length} killed${bad ? `, ${bad} SURVIVED` : ""}`);
  return bad ? 1 : 0;
}
