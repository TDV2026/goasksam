// THE PHOTO RULE FOR EVERY EXAMPLE PICK (Lane B, Nov 8 2026; the 2004 Maybach 57 on Find: a 3.1 MB, 3000 pixel JPEG that took 11 seconds). At SELECTION each crew example car's first photo is HEADed: a 200, an image, under 600 KB; else the listing's next photo (a resized copy first where the row has one);
// else the car is skipped. Applies to the Find pick, the Tasks example, the watching card and the Homepage pick (and the entry example fields, scripts/entryExamplesCheck.mjs).
//   (1) the rule itself: oversized refused, a 404 refused, a non-image refused, no length read to the limit, a resized copy preferred, the next photo tried, none -> null
//   (2) each module: the car whose photos all fail is skipped and the next car stands; a car whose first photo fails and whose next passes is picked with the next; the photo stored is the one that passed
//   (3) CLASS: every crew module that selects an example car imports the rule (a new one fails until it does)
//   node scripts/photoRuleCheck.mjs [root]      --mutants proves each rule by breaking it in a copy
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { fileURLToPath, pathToFileURL } from "node:url"; import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), rootArg = args.find(a => !a.startsWith("--")), ROOT = path.resolve(rootArg || path.join(here, ".."));
if (args.includes("--mutants")) {
  const PR = "lib/live/photoRule.js", FE = "lib/live/findExamples.js", TD = "lib/live/tasksDemo.js", WD = "lib/live/watchingDemo.js", FH = "lib/live/featuredHistory.js";
  const muts = [
    [PR, "&& h.bytes > 0 && h.bytes <= max;", "&& h.bytes > 0;", "(1) an oversized photo is accepted"],
    [PR, "export const photoOk = (h, max = MAX_PHOTO_BYTES) => !!h && h.status === 200 && ", "export const photoOk = (h, max = MAX_PHOTO_BYTES) => !!h && ", "(1) a 404 is accepted"],
    [PR, "(!h.type || /^image\\//i.test(String(h.type)))", "true", "(1) a page that is not an image is accepted"],
    [PR, "if (photoOk(h, max)) return u; }", "if (photoOk(h, max) || true) return u; }", "(1) the first photo is taken whatever it is"],
    [PR, "const r = row || {}, list = [r.photo_small, r.photo_thumb, r.thumbnail_url, r.photo_url,", "const r = row || {}, list = [r.photo_url, r.photo_small, r.photo_thumb, r.thumbnail_url,", "(1) the resized copy is not preferred"],
    [PR, "for (const u of (candidates || []).filter(isHttps).slice(0, MAX_TRIES)) {", "for (const u of (candidates || []).filter(isHttps).slice(0, 1)) {", "(1) the next photo is never tried"],
    [FE, "for (const c of chosen) { if (c.photo) continue; c.photo = await choosePhoto(photoCandidates(c.row), d.head); if (!c.photo) bad.push(c); }", "for (const c of chosen) { if (c.photo) continue; c.photo = c.row.photo_url; }", "(2) the Find pick takes a car whatever its photo"],
    [FE, "entries: chosen.map(c => ({ listingId: c.row.id, sold: !!c.sold, photo: c.photo || null }))", "entries: chosen.map(c => ({ listingId: c.row.id, sold: !!c.sold }))", "(2) the Find pick does not keep the photo that passed"],
    [TD, "if (!photo) return { ok: false, why: \"photo_too_big_or_gone\" };", "", "(2) the Tasks example takes a car whatever its photo"],
    [WD, "for (const c of cands.slice(0, 8)) { photo = await choosePhoto(photoCandidates(c.row), d.head); if (photo) { pick = c; break; } }", "pick = cands[0]; photo = pick && pick.row.photo_url;", "(2) the watching card takes a car whatever its photo"],
    [FH, "if (photo) { best.featured.current = { ...best.featured.current, photo }; break; }", "break;", "(2) the Homepage pick takes a car whatever its photo"],
    [FE, "import { choosePhoto, photoCandidates, headPhoto } from \"./photoRule.js\";", "const choosePhoto = async () => \"x\", photoCandidates = () => [], headPhoto = null;", "(3) a crew module that selects a car does not use the rule"]
  ];
  let survivors = 0;
  for (const [file, from, to, want] of muts) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prc-"));
    spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", ROOT + "/", dir + "/"]); fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"));
    const fp = path.join(dir, file), src = fs.readFileSync(fp, "utf8"), m = src.replace(from, to);
    if (m === src) { console.log(`MUTANT NOT APPLIED  ${want}`); survivors++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
    fs.writeFileSync(fp, m);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/photoRuleCheck.mjs"), dir], { encoding: "utf8" }), killed = r.status !== 0;
    console.log(`${killed ? "killed  " : "SURVIVED"}  ${want}`); if (!killed) survivors++;
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(survivors ? `\n${survivors} mutant(s) survived` : "\nall mutants killed"); process.exit(survivors ? 1 : 0);
}
process.chdir(ROOT);
process.env.CURTAIN_CREW_CODE = "prc-check-secret"; process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
const realFetch = (globalThis.fetch = async () => new Response("[]", { status: 200 }));
let failed = 0, n = 0; const ok = (name, c, d) => { n++; if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${d ? "  " + d : ""}`); };
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const PR = await imp("lib/live/photoRule.js"), FE = await imp("lib/live/findExamples.js"), TD = await imp("lib/live/tasksDemo.js"), WD = await imp("lib/live/watchingDemo.js"), FH = await imp("lib/live/featuredHistory.js"), S = await imp("lib/live/search.js"), G = await imp("lib/live/geo.js");
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
const NOW = Math.floor(Date.now() / 36e5) * 36e5, H = 36e5, DAY = 24 * H;
const BIG = { status: 200, bytes: 3.1 * 1024 * 1024, type: "image/jpeg" }, SMALL = { status: 200, bytes: 200 * 1024, type: "image/jpeg" };
// the heads: a table of url -> answer, default a small jpeg
const headFor = table => async u => (u in table ? table[u] : SMALL);
{ // (1) the rule
  ok("(1) a 200 image under 600 KB is accepted", PR.photoOk(SMALL));
  ok("(1) the Maybach's 3.1 MB JPEG is refused", !PR.photoOk(BIG));
  ok("(1) exactly 600 KB is accepted, one byte more is refused", PR.photoOk({ status: 200, bytes: 600 * 1024, type: "image/jpeg" }) && !PR.photoOk({ status: 200, bytes: 600 * 1024 + 1, type: "image/jpeg" }));
  ok("(1) a 404 and a 403 are refused", !PR.photoOk({ status: 404, bytes: 100, type: "image/jpeg" }) && !PR.photoOk({ status: 403, bytes: 100, type: "image/jpeg" }));
  ok("(1) a page that is not an image is refused", !PR.photoOk({ status: 200, bytes: 100, type: "text/html" }));
  ok("(1) no answer at all is refused", !PR.photoOk(null) && !PR.photoOk({ status: 200, bytes: null, type: "image/jpeg" }));
  const c = PR.photoCandidates({ photo_url: "https://a.test/big.jpg", photo_small: "https://a.test/small.jpg" }, ["https://a.test/second.jpg", "http://a.test/insecure.jpg", "https://a.test/big.jpg"]);
  ok("(1) candidates: the resized copy first, then the photo, then further photos of the listing; https only, no repeats", JSON.stringify(c) === JSON.stringify(["https://a.test/small.jpg", "https://a.test/big.jpg", "https://a.test/second.jpg"]), JSON.stringify(c));
  ok("(1) the resized copy is chosen over a big photo", (await PR.choosePhoto(c, headFor({ "https://a.test/big.jpg": BIG }))) === "https://a.test/small.jpg");
  ok("(1) a big photo then a 404: the next that passes is taken", (await PR.choosePhoto(["https://a.test/big.jpg", "https://a.test/gone.jpg", "https://a.test/ok.jpg"], headFor({ "https://a.test/big.jpg": BIG, "https://a.test/gone.jpg": { status: 404, bytes: null, type: "" } }))) === "https://a.test/ok.jpg");
  ok("(1) every photo fails: null (the car is skipped)", (await PR.choosePhoto(["https://a.test/big.jpg"], headFor({ "https://a.test/big.jpg": BIG }))) === null);
  ok("(1) a head that throws is a failed photo, not a crash", (await PR.choosePhoto(["https://a.test/x.jpg", "https://a.test/y.jpg"], async u => { if (/x/.test(u)) throw new Error("net"); return SMALL; })) === "https://a.test/y.jpg");
  // the real head: no length on the HEAD, so the photo is read to the limit
  const mk = (len, o = {}) => async (u, init = {}) => { const hdr = new Headers({ "content-type": "image/jpeg", ...(o.noLength || init.method === "GET" ? {} : { "content-length": String(len) }) }); if (init.method === "HEAD") return new Response(null, { status: o.status || 200, headers: hdr }); const buf = new Uint8Array(Math.min(len, 600 * 1024 + 1)); return new Response(buf, { status: 206, headers: hdr }); };
  globalThis.fetch = mk(3.1 * 1024 * 1024); ok("(1) the real head: a stated length over the limit is refused", !PR.photoOk(await PR.headPhoto("https://a.test/big.jpg")));
  globalThis.fetch = mk(150 * 1024); ok("(1) the real head: a stated small length is accepted", PR.photoOk(await PR.headPhoto("https://a.test/s.jpg")));
  globalThis.fetch = mk(3.1 * 1024 * 1024, { noLength: true }); ok("(1) the real head: no stated length and a big file is refused (read to the limit)", !PR.photoOk(await PR.headPhoto("https://a.test/big.jpg")));
  globalThis.fetch = mk(150 * 1024, { noLength: true }); ok("(1) the real head: no stated length and a small file is accepted", PR.photoOk(await PR.headPhoto("https://a.test/s.jpg")));
  globalThis.fetch = mk(150 * 1024, { status: 404 }); ok("(1) the real head: a 404 is refused", !PR.photoOk(await PR.headPhoto("https://a.test/g.jpg")));
  globalThis.fetch = realFetch;
}
const base = (id, make, model, year, o = {}) => ({ id, source: "bringatrailer", url: "https://auction.test/lot/" + id, photo_url: "https://img.test/big" + id + ".jpg", listing_title: `${year} ${make} ${model}`, year, make, model, vin_norm: "VIN" + String(id).padStart(14, "0"), mileage: 40000, mileage_unit: "miles", current_bid: 30000 + id, current_bid_usd: 30000 + id, currency: "USD", location: "Austin, TX", country: "US", exterior_color: "Red", transmission: "Manual", first_seen: new Date(NOW - id * H).toISOString(), end_time: new Date(NOW + 48 * H).toISOString(), status: "live", ...o });
const liveWorldSelect = (w, q) => { let m = /^app_config\?key=eq\.([a-z_]+)/.exec(q); if (m) { const v = w.store.get(m[1]); return v ? [{ value: v }] : []; }
  m = /^live_listings\?id=eq\.([^&]+)/.exec(q); if (m) return w.rows.filter(r => String(r.id) === decodeURIComponent(m[1])).slice(0, 1);
  if (/^live_listings\?status=eq\.live/.test(q)) return w.rows.filter(r => r.status === "live" && r.photo_url && Date.parse(r.end_time) > w.clock);
  return []; };
function liveWorld(rows, table, extra = {}) {
  const w = { rows, store: new Map(), clock: NOW };
  w.d = { now: () => w.clock, head: headFor(table),
    select: async (e, q) => { let m = /^app_config\?key=eq\.([a-z_]+)/.exec(q); if (m) { const v = w.store.get(m[1]); return v ? [{ value: v }] : []; }
      m = /^live_listings\?id=eq\.([^&]+)/.exec(q); if (m) return w.rows.filter(r => String(r.id) === decodeURIComponent(m[1])).slice(0, 1);
      if (/^live_listings\?status=eq\.live/.test(q)) return w.rows.filter(r => r.status === "live" && r.photo_url && Date.parse(r.end_time) > w.clock);
      return []; },
    write: async (e, row) => { w.store.set(row.key, row.value); }, clear: async (e, key) => { w.store.delete(key || "crew_x"); },
    appearances: async (e, vin) => ({ ok: true, vinNorm: vin, appearances: [] }), urlStatus: async () => 200, facts: async r => S.listingFacts(r), ...extra };
  return w;
}
{ // (2) the Find pick
  const rows = [base(1, "Maybach", "57", 2004, { source: "mbmarket", photo_url: "https://img.test/maybach.jpg" }), base(2, "Porsche", "911", 1995, { source: "bringatrailer" }), base(3, "Ferrari", "F430", 2007, { source: "carsandbids" }), base(4, "BMW", "M3", 2006, { source: "pcarmarket" }), base(5, "Audi", "RS4", 2008, { source: "hemmings" })];
  const table = {}; for (const r of rows) table[r.photo_url] = SMALL; table["https://img.test/maybach.jpg"] = BIG;
  const w = liveWorld(rows, table); await FE.refreshFindExamples(env, w.d);
  const st = w.store.get(FE.STORE_KEY), picked = st.entries.map(e => rows.find(r => r.id === e.listingId));
  ok("(2) Find: the car with the 3.1 MB photo is not picked while others stand", picked.length === 3 && !picked.some(r => r.make === "Maybach"), JSON.stringify(picked.map(r => r.make)));
  ok("(2) Find: each pick stores the photo that passed", st.entries.every(e => /^https:\/\/img\.test\/big\d+\.jpg$/.test(e.photo)), JSON.stringify(st.entries.map(e => e.photo)));
  const items = await FE.findExamples(env, "gas_crew=" + (await imp("lib/_crew.js")).mintCrewCookieValue(), w.d);
  ok("(2) Find: the served item carries that photo", items && items.every(i => /big\d+\.jpg/.test(i.photo)));
  // a resized copy rescues a big photo
  const rows2 = rows.map(r => r.make === "Maybach" ? { ...r, photo_small: "https://img.test/maybach-small.jpg" } : r); const t2 = { ...table, "https://img.test/maybach-small.jpg": SMALL, "https://img.test/maybach.jpg": BIG };
  const w2 = liveWorld(rows2, t2); await FE.refreshFindExamples(env, w2.d);
  const e2 = w2.store.get(FE.STORE_KEY).entries.find(e => e.listingId === 1);
  ok("(2) Find: a car whose photo is big but whose row carries a resized copy is picked with the copy", !e2 || e2.photo === "https://img.test/maybach-small.jpg", JSON.stringify(e2));
  const allBad = liveWorld(rows, Object.fromEntries(rows.map(r => [r.photo_url, BIG]))); const r3 = await FE.refreshFindExamples(env, allBad.d);
  ok("(2) Find: every photo too big: nothing is picked, nothing is stored as live", r3.why === "none_eligible" && !allBad.store.get(FE.STORE_KEY).entries);
}
{ // (2) the watching card
  const rows = [base(11, "Ferrari", "F430", 2007, { photo_url: "https://img.test/w1.jpg" }), base(12, "BMW", "M3", 2006, { photo_url: "https://img.test/w2.jpg" })];
  const w = liveWorld(rows, { "https://img.test/w1.jpg": BIG, "https://img.test/w2.jpg": SMALL }); const r = await WD.refreshWatchingDemo(env, w.d), st = w.store.get(WD.STORE_KEY);
  ok("(2) watching: the Ferrari with the big photo is passed over for the BMW", r.why === "selected" && st.listingId === 12 && st.photo === "https://img.test/w2.jpg", JSON.stringify(st));
  const none = liveWorld(rows, { "https://img.test/w1.jpg": BIG, "https://img.test/w2.jpg": { status: 404, bytes: null, type: "" } }); const r2 = await WD.refreshWatchingDemo(env, none.d);
  ok("(2) watching: every photo fails: no card", r2.why === "none_eligible" && !none.store.get(WD.STORE_KEY).listingId);
  const card = await WD.watchingDemo(env, "gas_crew=" + (await imp("lib/_crew.js")).mintCrewCookieValue(), w.d);
  ok("(2) watching: the served card shows the photo that passed", card && card.car.photo === "https://img.test/w2.jpg");
}
{ // (2) the Homepage pick
  const VIN1 = "WP0AB29988S783456", VIN2 = "WP0AB29988S783457", sale = vin => ({ kind: "sale", date: "2022-05-14", house: "Bring a Trailer", url: "https://bringatrailer.com/listing/" + vin + "/", mileage: 30000, priceUsd: 61000, image: "https://img.example.com/prev-" + vin + ".jpg", year: 2008, make: "Porsche", model: "911", vinNorm: vin });
  const lv = (id, vin, days, o = {}) => ({ id, source: "bringatrailer", url: "https://bringatrailer.com/listing/2008-porsche-911-" + id + "/", listing_title: "2008 Porsche 911 Carrera", year: 2008, make: "Porsche", model: "911", vin_norm: vin, mileage: 34000, mileage_unit: "miles", end_time: new Date(NOW + days * DAY).toISOString(), photo_url: "https://img.example.com/cur-" + id + ".jpg", status: "live", ...o });
  const rows = [lv("L1", VIN1, 5), lv("L2", VIN2, 3)], apps = { [VIN1]: [sale(VIN1)], [VIN2]: [sale(VIN2)] };
  const mk = table => { let w; const base = liveWorld(rows, table).d.select; w = liveWorld(rows, table, { select: async (e, q) => { if (/^(vin_index|sales_archive)\?vin_norm=in\./.test(q)) { const want = decodeURIComponent(/in\.\((.*)\)&/.exec(q)[1]).replace(/"/g, "").split(","); return want.filter(v => apps[v]).map(v => ({ vin_norm: v })); } return liveWorldSelect(w, q); }, appearances: async (e, vin) => ({ ok: true, vinNorm: vin, appearances: apps[vin] || [] }), cardName: async () => ({ name: null, trim: null }), clear: async () => { w.store.delete(FH.STORE_KEY); } }); return w; };
  const w0 = mk({}); await FH.refreshFeaturedHistory(env, w0.d);
  const w1 = mk({ "https://img.example.com/cur-L1.jpg": BIG }); await FH.refreshFeaturedHistory(env, w1.d);
  ok("(2) Homepage: with no photo problem the car ending later (L1) is picked", w0.store.get(FH.STORE_KEY) && w0.store.get(FH.STORE_KEY).listingId === "L1");
  const s1 = w1.store.get(FH.STORE_KEY);
  ok("(2) Homepage: L1's photo is 3.1 MB, so the next best car (L2) is picked, with a photo that passed (never L1's earlier sale photo)", s1 && s1.listingId === "L2" && s1.featured.current.photo === "https://img.example.com/cur-L2.jpg", JSON.stringify(s1 && [s1.listingId, s1.featured.current.photo]));
  const w2 = mk({ "https://img.example.com/cur-L1.jpg": BIG, "https://img.example.com/cur-L2.jpg": { status: 404, bytes: null, type: "" } }); const r2 = await FH.refreshFeaturedHistory(env, w2.d);
  ok("(2) Homepage: every photo fails: no pick", r2.why === "none_eligible", r2.why);
}
{ // (2) the Tasks example
  const IN = h => new Date(NOW + h * H).toISOString();
  const car = (id, o = {}) => ({ id, source: "sothebysmotorsport", url: "https://example.test/lot/" + id, listing_title: "2007 Ferrari F430 6-Speed", year: 2007, make: "Ferrari", model: "F430", vin_norm: "ZFFEW59A67015000" + id, mileage: 18500, mileage_unit: "miles", current_bid: 90000, current_bid_usd: 90000, currency: "USD", location: "Williamsburg, VA", country: "US", transmission: "Manual", exterior_color: "Red", photo_url: "https://img.example.test/f430-" + id + ".jpg", end_time: IN(30), status: "live", ...o });
  const honest = (f, r) => { const fx = S.listingFacts(r); return String(r.make).toLowerCase() === f.make.toLowerCase() && String(r.model).toLowerCase() === f.model.toLowerCase() && (!f.gearbox || fx.gearbox === f.gearbox) && (!f.colour || fx.colour === f.colour) && fx.miles <= f.miles_max && Number(r.current_bid_usd) <= f.budget_max && r.status === "live"; };
  const mk = (rows, table) => { const w = liveWorld(rows, table, { geo: async () => ({ listingCoord: G.listingCoord, placeCoord: G.placeCoord, milesBetween: G.milesBetween }), read: async (e, text) => TD.readRequest(e, text), match: async (e, f) => w.rows.filter(r => honest(f, r)).map(r => ({ r })), reasons: async f => (await imp("lib/tasks/tasks.js")).matchReasonList(f), clear: async () => { w.store.delete(TD.STORE_KEY); } }); return w; };
  const rows = [car(1), car(2, { end_time: IN(20) })];
  const w0 = mk(rows, {}); await TD.refreshTasksDemo(env, w0.d);
  const w1 = mk(rows, { "https://img.example.test/f430-1.jpg": BIG, "https://img.example.test/f430-2.jpg": SMALL }); const r1 = await TD.refreshTasksDemo(env, w1.d);
  const s0 = w0.store.get(TD.STORE_KEY), s1 = w1.store.get(TD.STORE_KEY);
  ok("(2) Tasks: with no photo problem an example is picked", s0 && s0.field && /f430-\d\.jpg/.test(s0.field.car.photo), JSON.stringify(s0 && s0.field && s0.field.car.photo));
  ok("(2) Tasks: a car whose photo is 3.1 MB is passed over; the example shows the photo that passed", s1 && s1.listingId === 2 && s1.field.car.photo === "https://img.example.test/f430-2.jpg", JSON.stringify([r1.why, s1 && s1.listingId, s1 && s1.field && s1.field.car.photo]));
  const w2 = mk(rows, { "https://img.example.test/f430-1.jpg": BIG, "https://img.example.test/f430-2.jpg": { status: 404, bytes: null, type: "" } }); const r2 = await TD.refreshTasksDemo(env, w2.d);
  ok("(2) Tasks: every photo fails: no example", r2.why === "none_provable" && !(w2.store.get(TD.STORE_KEY) || {}).field, r2.why);
}
{ // (3) the class
  const dir = path.join(ROOT, "lib/live"), selecting = fs.existsSync(path.join(dir, "entryExamples.js")) ? ["entryExamples.js"] : [];
  for (const f of fs.readdirSync(dir).filter(x => /\.js$/.test(x))) { const src = fs.readFileSync(path.join(dir, f), "utf8"); if (/export const STORE_KEY = "crew_/.test(src) && /export async function refresh\w+\(/.test(src)) selecting.push(f); }
  const missing = selecting.filter(f => !/from "\.\/photoRule\.js"/.test(fs.readFileSync(path.join(dir, f), "utf8")));
  ok("(3) every crew module that selects an example car uses the photo rule", selecting.length >= 4 && missing.length === 0, "selecting " + selecting.join(", ") + " missing " + missing.join(", "));
}
console.log("\nphotoRuleCheck: " + (n - failed) + " pass, " + failed + " FAIL"); process.exit(failed ? 1 : 0);
