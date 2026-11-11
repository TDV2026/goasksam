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
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2";
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) pass++; else { fail++; console.log("FAIL " + n + (d !== undefined ? " " + JSON.stringify(d) : "")); } };
const VIN = "WP0AF2A92GS187171", DAY = 864e5;
const VPIC = { ModelYear: "2016", Make: "PORSCHE", Model: "911", Trim: "RS", Series: "Turbo/Turbo S", Series2: "Type 991", BodyClass: "Coupe", ErrorCode: "0" };   // fetched from vPIC Nov 11 2026
const liveRow = (o = {}) => ({ id: 255975, source: "sothebysmotorsport", url: "https://www.sothebysmotorsport.com/auction/2016-porsche-911gt3rs-12587", listing_title: "2016 Porsche 911 GT3 RS", year: 2016, make: "Porsche", model: "991", vin_norm: VIN, mileage: 40292, mileage_unit: "mi", body: "coupe", end_time: new Date(Date.now() + 2 * DAY).toISOString(), photo_url: "https://img.example.com/gt3rs.jpg", status: "live", current_bid_usd: 180000, location: "Houston, TX", ...o });
let LIVE = [liveRow()], ARCH = [], LASTLIVE = "";
globalThis.fetch = async (url) => {
  const u = String(url), j = (b, s = 200) => new Response(JSON.stringify(b), { status: s });
  if (/vpic\.nhtsa/.test(u)) return j({ Results: [VPIC] });
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
  ok("(4) a recorded sale of the VIN is still the exact-car match (archive first)", d.vinArchiveMatch && d.vinArchiveMatch.hasSale && !d.vinLiveMatch, [!!d.vinArchiveMatch, !!d.vinLiveMatch]); ARCH = []; }
// (5) the pool is fed: every venue's feed record keeps its VIN into the live row (the ingest class), under every VIN field name the feed uses
{ const F = await import(pathToFileURL(path.join(root, "lib/live/feed.js")).href);
  for (const src of ["bringatrailer", "carsandbids", "sothebysmotorsport", "rmsothebys", "gooding", "bonhams", "mecum", "barrettjackson", "broadarrow", "collectingcars", "pcarmarket", "hagerty", "themarket"]) for (const key of ["vin", "chassis", "chassis_number"]) {
    const m = F.mapLiveRecord({ source_slug: src, source_record_id: "r-" + src, title: "2016 Porsche 911 GT3 RS", make: "Porsche", model: "911", year: 2016, [key]: "WP0AF2A92GS187171", url: "https://example.com/" + src, auction_end_at: new Date(Date.now() + DAY).toISOString(), featured_image_url: "https://img.example.com/a.jpg" }, new Date().toISOString());
    ok(`(5) ${src}: a feed record carrying the VIN as "${key}" is stored with vin_norm`, m && m.vin_norm === "WP0AF2A92GS187171", m && m.vin_norm);
  } }
console.log(`vinLiveMatchCheck: ${fail ? fail + " FAIL" : "all pass"} (${pass})`); process.exit(fail ? 1 : 0);

function mutants() {
  const M = [
    ["api/vehicleIdentity.js", "if (!vinMatch && !chassisVehicle && vinActive && result.vehicle?.vin) {", "if (false) {", "(1) status valid"],
    ["lib/vinLiveMatch.js", 'String(row.status || "") !== "live" || !(Date.parse(row.end_time) > nowMs)', 'String(row.status || "") !== "live"', "(3) an ended listing"],
    ["lib/vinLiveMatch.js", "&status=eq.live&end_time=gt.", "&status=eq.live&x=gt.", "(3) the request asks the table"],
    ["lib/vinLiveMatch.js", "listing: { title: String(row.listing_title).trim(), venue: houseName(row.source),", "listing: { title: String(row.listing_title).trim(), venue: null,", "(1) the listing is carried"],
    ["lib/vinLiveMatch.js", 'endsLine: reasonLine("pick.ends", { endsAt: Date.parse(row.end_time), now: nowMs })', "endsLine: null", "(1) the time left"],
    ["lib/vinLiveMatch.js", "if (!row || String(row.status", 'if (!row || row.source !== "bringatrailer" || String(row.status', "(2) a live VIN on"],
    ["api/vehicleIdentity.js", "if (!vinMatch && !chassisVehicle && vinActive && result.vehicle?.vin) {", "if (!vinMatch && !chassisVehicle && vinActive && result.vehicle?.vin && false) {", "(1) the car is named from the listing title"],
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
