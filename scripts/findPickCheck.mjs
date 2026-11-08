// THE FIND EXAMPLES: THE DAILY PICK AND THE HOURLY REVALIDATION (Lane B, Nov 8 2026, per Sam; crew only, not live).
//   (1) once every 24 hours (the Pacific date, stored as pickDate) three live cars are chosen, the same for every visitor: one Bring a Trailer, one Cars & Bids, one from a third platform; when a platform has none, three different platforms, then three different makes
//   (2) always three different makes; never the three newest listings; a real first photo and a year make model title; a car with a VIN confirmed sold before is in the three when one is available
//   (3) deterministic within the day: the same pool in any order, read at any time of the day, gives the same three; a new Pacific date picks afresh
//   (4) at least hourly each stored car is confirmed live by a keyed read (status and end time); an ended, withdrawn or no longer eligible car is replaced at once by the same rules and the others stay; an unreadable read stores nothing; the serve never shows an ended car
//   (5) the hourly slot is a cron slot that already exists (api/pullLive.js: the first quarter of every hour, with no pull), zero OldCarsData
//   node scripts/findPickCheck.mjs [root]      --mutants proves each rule by breaking it in a copy
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { fileURLToPath, pathToFileURL } from "node:url"; import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), rootArg = args.find(a => !a.startsWith("--")), ROOT = path.resolve(rootArg || path.join(here, ".."));
if (args.includes("--mutants")) {
  const FE = "lib/live/findExamples.js", PL = "api/pullLive.js";
  const muts = [
    [FE, "const pool = makesIn(rest) >= MAX_ITEMS ? rest : all;", "const pool = all;", "(2) the three newest listings are picked"],
    [FE, "const s = String(row.source || \"\").toLowerCase(); return s === \"bringatrailer\" ? \"bringatrailer\" : s === \"carsandbids\"", "const s = String(row.source || \"\").toLowerCase(); return s === \"nothing\" ? \"bringatrailer\" : s === \"carsandbids\"", "(1) the Bring a Trailer slot is ignored"],
    [FE, "s === \"carsandbids\" ? \"carsandbids\" : \"third\"", "s === \"nothing\" ? \"carsandbids\" : \"third\"", "(1) the Cars & Bids slot is ignored"],
    [FE, "tie = (a, b) => hashOf(dateKey + \":\" + a.row.id) - hashOf(dateKey + \":\" + b.row.id);\n  const all", "tie = (a, b) => Math.random() - 0.5;\n  const all", "(3) the pick within the day is not deterministic"],
    [FE, "if (eligibleRow(row, facts, now) && pickable(row) && !kept.some(", "if (liveNow(row, now - 7 * 864e5) && !kept.some(", "(4) an ended car is kept past the hour"],
    [FE, "if (!row) continue;   // withdrawn or gone: replaced below", "if (!row) { kept.push({ row: { id: e.listingId, make: \"x\" + e.listingId }, facts: {}, sold: false }); continue; }", "(4) a withdrawn car is kept"],
    [FE, "if (row === null) return await drop(\"live_unreadable\");\n        if (!row) continue;", "if (row === null) continue;\n        if (!row) continue;", "(4) an unreadable read keeps a stale pick"],
    [FE, "const stored = 0;", "", "(x) placeholder"],
    [FE, "&& !(st && st.pickDate === dateKey)", "", "(x) placeholder"],
    [FE, "const st = s.value, kept = [], newDay = !st || st.pickDate !== dateKey;", "const st = s.value, kept = [], newDay = !st;", "(3) a new day does not pick afresh"],
    [FE, "if (!genuinePhoto(row.photo_url) || !isHttps(row.url)) return false;", "if (!isHttps(row.url)) return false;", "(2) a car with no photo is picked"],
    [FE, "const pickable = row => Number(row.year) > 1885 && ", "const pickable = row => true && ", "(2) a car with no year in its title is picked"],
    [FE, "(!haveSold && c.sold ? 1000 : 0) + ", "0 + ", "(2) a car sold before is not brought in when one is available"],
    [PL, "if (new Date().getUTCMinutes() < 15) { examplesRefresh = await refreshExamplesWord(env); revalidated = await revalidateCrewWord(env); }", "if (false) { examplesRefresh = await refreshExamplesWord(env); revalidated = await revalidateCrewWord(env); }", "(5) the hourly revalidation has no cron slot"]
  ].filter(m => !/^\(x\)/.test(m[3]));
  let survivors = 0;
  for (const [file, from, to, want] of muts) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fpc-"));
    spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", ROOT + "/", dir + "/"]); fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"));
    const fp = path.join(dir, file), src = fs.readFileSync(fp, "utf8"), m = src.replace(from, to);
    if (m === src) { console.log(`MUTANT NOT APPLIED  ${want}`); survivors++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
    fs.writeFileSync(fp, m);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/findPickCheck.mjs"), dir], { encoding: "utf8" }), killed = r.status !== 0;
    console.log(`${killed ? "killed  " : "SURVIVED"}  ${want}`); if (!killed) survivors++;
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(survivors ? `\n${survivors} mutant(s) survived` : "\nall mutants killed"); process.exit(survivors ? 1 : 0);
}
process.chdir(ROOT);
process.env.CURTAIN_CREW_CODE = "fpc-check-secret"; process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
let metered = 0; globalThis.fetch = async u => { if (/oldcarsdata\.com\/auctions/.test(String(u))) metered++; return new Response("[]", { status: 200 }); };
let failed = 0, n = 0; const ok = (name, c, d) => { n++; if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${d ? "  " + d : ""}`); };
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const FE = await imp("lib/live/findExamples.js"), C = await imp("lib/_crew.js"), S = await imp("lib/live/search.js");
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
const NOON = Date.parse("2026-11-09T20:00:00Z"), DAY = 864e5, H = 36e5, CREW = "gas_crew=" + C.mintCrewCookieValue();
let id = 0;
const car = (source, make, model, year, o = {}) => ({ id: ++id, source, url: "https://auction.test/lot/" + id, photo_url: "https://img.test/p" + id + ".jpg", listing_title: `${year} ${make} ${model}`, year, make, model, vin_norm: o.vin === undefined ? "VIN" + String(id).padStart(14, "0") : o.vin, mileage: 40000, mileage_unit: "miles", current_bid: 30000 + id, current_bid_usd: 30000 + id, currency: "USD", location: "Austin, TX", country: "US", exterior_color: o.colour || "Red", transmission: "Manual", first_seen: new Date(NOON - (o.age ?? 30) * H).toISOString(), end_time: new Date(NOON + (o.h ?? 48) * H).toISOString(), status: "live", ...(o.more || {}) });
const sale = vin => ({ kind: "sale", date: "2023-02-14", house: "Bring a Trailer", url: "https://bringatrailer.com/listing/" + vin + "/", image: "https://img.test/old-" + vin + ".jpg", mileage: 15000, priceUsd: 181888, vinNorm: vin });
function world(rows, { apps = {}, now = NOON } = {}) {
  const w = { rows, store: new Map(), apps, clock: now, fail: false, unreadable: false };
  w.d = { now: () => w.clock,
    select: async (e, q) => { if (w.fail) return null; let m = /^app_config\?key=eq\.([a-z_]+)/.exec(q); if (m) { const v = w.store.get(m[1]); return v ? [{ value: v }] : []; }
      m = /^live_listings\?id=eq\.([^&]+)/.exec(q); if (m) { if (w.unreadable) return null; return w.rows.filter(r => String(r.id) === decodeURIComponent(m[1])).slice(0, 1); }
      if (/^live_listings\?status=eq\.live/.test(q)) return w.rows.filter(r => r.status === "live" && r.photo_url && Date.parse(r.end_time) > w.clock);
      return []; },
    write: async (e, row) => { w.store.set(row.key, row.value); }, clear: async (e, key) => { w.store.delete(key); },
    appearances: async (e, vin) => ({ ok: true, vinNorm: vin, appearances: w.apps[vin] || [] }), urlStatus: async () => 200, facts: async r => S.listingFacts(r) };
  return w;
}
const src = it => it.url ? w0src(it) : null; let w0src = () => null;
const picked = w => (w.store.get(FE.STORE_KEY) || { entries: [] }).entries.map(e => w.rows.find(r => r.id === e.listingId));
const POOL = () => { id = 0; return [
  car("bringatrailer", "Porsche", "911", 1995, { age: 200 }), car("bringatrailer", "Ferrari", "F430", 2007, { age: 190 }), car("carsandbids", "BMW", "M3", 2006, { age: 180 }), car("carsandbids", "Audi", "RS4", 2008, { age: 170 }),
  car("pcarmarket", "Lotus", "Elise", 2015, { age: 160, colour: "Yellow" }), car("hemmings", "Ford", "Mustang", 1967, { age: 150, colour: "Green" }), car("bringatrailer", "Honda", "S2000", 2003, { age: 140 }), car("bringatrailer", "Mazda", "MX-5", 1995, { age: 120 }), car("bringatrailer", "Nissan", "240SX", 1995, { age: 110 }), car("bringatrailer", "Subaru", "WRX", 1995, { age: 100 }), car("collectingcars", "Lamborghini", "Gallardo", 2009, { age: 130, colour: "Orange" }),
  // the three newest listings: the most varied cars in the pool, so a pick that does not set them aside takes them
  car("bringatrailer", "Mercedes-Benz", "300SL", 1957, { age: 3, colour: "Silver" }), car("carsandbids", "Toyota", "Supra", 1994, { age: 2, colour: "White" }), car("pcarmarket", "Jaguar", "E-Type", 1966, { age: 1, colour: "Blue" })]; };
{ // (1) the slots, (2) makes, newest, (3) deterministic
  const rows = POOL(), w = world(rows); const r = await FE.refreshFindExamples(env, w.d), ch = picked(w), newest = rows.filter(x => x.age === undefined).length;
  ok("(1) a pick is stored with its Pacific date", r.stored && r.stored.pickDate === "2026-11-09" && ch.length === 3, JSON.stringify(r.stored && r.stored.pickDate));
  ok("(1) one Bring a Trailer, one Cars & Bids, one from a third platform", ch.filter(x => x.source === "bringatrailer").length === 1 && ch.filter(x => x.source === "carsandbids").length === 1 && ch.filter(x => !["bringatrailer", "carsandbids"].includes(x.source)).length === 1, JSON.stringify(ch.map(x => x.source)));
  ok("(2) three different makes", new Set(ch.map(x => x.make)).size === 3, JSON.stringify(ch.map(x => x.make)));
  const three = rows.slice().sort((a, b) => Date.parse(b.first_seen) - Date.parse(a.first_seen)).slice(0, 3).map(x => x.id);
  ok("(2) never the three newest listings (none of them while the rest can make three)", ch.every(x => !three.includes(x.id)), JSON.stringify([ch.map(x => x.id), three]));
  ok("(2) every pick has a real first photo and a title with year make model", ch.every(x => /^https:\/\/img\.test\//.test(x.photo_url) && /^\d{4} \S+ \S+/.test(x.listing_title)));
  const items = await FE.findExamples(env, CREW, w.d);
  ok("(2) each item carries findUrl and soldBefore as before", items && items.length === 3 && items.every(i => /^\/find\?q=/.test(i.findUrl) && typeof i.soldBefore === "boolean" && i.live === true), JSON.stringify(items && items.map(i => [i.title, i.soldBefore])));
  // deterministic: another order, another time of day, a second visitor-free read
  const rows2 = POOL().reverse(), w2 = world(rows2, { now: NOON + 5 * H }); await FE.refreshFindExamples(env, w2.d);
  ok("(3) the same pool in another order, read at another hour of the same day, gives the same three", JSON.stringify(picked(w).map(x => x.listing_title).sort()) === JSON.stringify(picked(w2).map(x => x.listing_title).sort()), JSON.stringify([picked(w).map(x => x.listing_title), picked(w2).map(x => x.listing_title)]));
}
{ // (1) a platform with no cars: three different platforms, then three different makes
  id = 0; const rows = [car("bringatrailer", "Porsche", "911", 1995, { age: 100 }), car("pcarmarket", "Lotus", "Elise", 2005, { age: 90 }), car("hemmings", "Ford", "Mustang", 1967, { age: 80 }), car("bringatrailer", "Honda", "S2000", 2003, { age: 70 }), car("bringatrailer", "Audi", "RS4", 2008, { age: 1 }), car("bringatrailer", "Fiat", "124", 1972, { age: 2 }), car("bringatrailer", "Saab", "900", 1990, { age: 3 })];
  const w = world(rows); await FE.refreshFindExamples(env, w.d); const ch = picked(w);
  ok("(1) no Cars & Bids car: still three, three different platforms, none repeated while others exist", ch.length === 3 && new Set(ch.map(x => x.source)).size === 3, JSON.stringify(ch.map(x => x.source)));
  id = 0; const only = [car("bringatrailer", "Porsche", "911", 1995, { age: 100 }), car("bringatrailer", "Honda", "S2000", 2003, { age: 90 }), car("bringatrailer", "Ford", "Mustang", 1967, { age: 80 }), car("bringatrailer", "Audi", "RS4", 2008, { age: 1 }), car("bringatrailer", "Fiat", "124", 1972, { age: 2 }), car("bringatrailer", "Saab", "900", 1990, { age: 3 })];
  const w2 = world(only); await FE.refreshFindExamples(env, w2.d); const c2 = picked(w2);
  ok("(1) one platform only: three different makes", c2.length === 3 && new Set(c2.map(x => x.make)).size === 3, JSON.stringify(c2.map(x => x.make)));
}
{ // (2) a car with no photo and a car with no year are never picked, though they would score best
  id = 0; const rows = POOL(); for (const i of [4, 7, 5]) rows[i].photo_url = i === 5 ? rows[i].photo_url : "https://img.test/placeholder.jpg"; rows[5].year = null; rows[5].listing_title = "Ford Mustang";
  const w = world(rows); await FE.refreshFindExamples(env, w.d); const ch = picked(w);
  ok("(2) a placeholder photo and a title with no year are not picked", ch.length === 3 && ch.every(x => x.id !== rows[4].id && x.id !== rows[5].id && x.id !== rows[7].id), JSON.stringify(ch.map(x => x.listing_title)));
}
{ // (2) a car sold before is in the three when available
  id = 0; const rows = POOL(), target = rows[1]; // a Ferrari on Bring a Trailer
  const w = world(rows, { apps: { [target.vin_norm]: [sale(target.vin_norm)] } }); await FE.refreshFindExamples(env, w.d); const ch = picked(w), items = await FE.findExamples(env, CREW, w.d);
  ok("(2) a car with a VIN confirmed sold before is among the three when one is available", ch.some(x => x.id === target.id) && items.some(i => i.soldBefore === true), JSON.stringify(ch.map(x => x.listing_title)));
}
{ // (4) hourly revalidation
  id = 0; const rows = POOL(), w = world(rows); await FE.refreshFindExamples(env, w.d); const before = picked(w), victim = before.find(x => x.source === "bringatrailer");
  victim.end_time = new Date(NOON + 30 * 60e3).toISOString();   // its auction ends half an hour from now
  w.clock = NOON + 61 * 60e3;   // an hour later it has ended
  const stale = await FE.findExamples(env, CREW, w.d);
  ok("(4) the serve never shows an ended car, even before the revalidation has run", !stale || stale.every(i => i.url !== victim.url), JSON.stringify(stale && stale.map(i => i.title)));
  const r = await FE.refreshFindExamples(env, w.d), after = picked(w);
  ok("(4) the next hourly revalidation replaces the ended car at once and keeps the other two", r.why === "replaced" && after.length === 3 && !after.some(x => x.id === victim.id) && before.filter(x => x.id !== victim.id).every(x => after.some(y => y.id === x.id)), JSON.stringify([r.why, after.map(x => x.listing_title)]));
  ok("(4) the replacement keeps the platform plan: a Bring a Trailer car stands in", after.filter(x => x.source === "bringatrailer").length === 1 && after.every(x => Date.parse(x.end_time) > w.clock), JSON.stringify(after.map(x => x.source)));
  ok("(4) the pick date is not changed by a replacement (the day's pick stands)", w.store.get(FE.STORE_KEY).pickDate === "2026-11-09");
  // withdrawn: the row is gone
  const w2 = world(POOL()); await FE.refreshFindExamples(env, w2.d); const gone = picked(w2)[0]; w2.rows = w2.rows.filter(x => x.id !== gone.id); w2.clock = NOON + H; await FE.refreshFindExamples(env, w2.d);
  ok("(4) a withdrawn car (its row gone) is replaced", w2.store.get(FE.STORE_KEY).entries.length === 3 && !w2.store.get(FE.STORE_KEY).entries.some(e => e.listingId === gone.id));
  // status ended
  const w3 = world(POOL()); await FE.refreshFindExamples(env, w3.d); const vic3 = picked(w3)[1]; vic3.status = "ended"; w3.clock = NOON + H; await FE.refreshFindExamples(env, w3.d);
  ok("(4) a car whose status is ended is replaced", picked(w3).length === 3 && !picked(w3).some(x => x && x.id === vic3.id));
  // unreadable
  const w4 = world(POOL()); await FE.refreshFindExamples(env, w4.d); w4.unreadable = true; w4.clock = NOON + H; const r4 = await FE.refreshFindExamples(env, w4.d);
  ok("(4) an unreadable car: nothing is stored or served as live (the pick is cleared, never kept on a guess)", r4.stored === null && r4.why === "live_unreadable" && !w4.store.has(FE.STORE_KEY));
}
{ // (3) a new Pacific date picks afresh
  id = 0; const rows = POOL(), w = world(rows); await FE.refreshFindExamples(env, w.d); w.clock = NOON + DAY; const r = await FE.refreshFindExamples(env, w.d);
  ok("(3) the next Pacific date picks afresh and stamps the new date", r.why === "picked" && w.store.get(FE.STORE_KEY).pickDate === "2026-11-10", JSON.stringify([r.why, w.store.get(FE.STORE_KEY).pickDate]));
}
{ // (5) the cron slot and the spend
  const pl = fs.readFileSync(path.join(ROOT, "api/pullLive.js"), "utf8"), i = pl.indexOf("if (!slot.mode)"), seg = pl.slice(i, i + 900);
  ok("(5) the quarter hours with no pull still revalidate once an hour (first quarter, existing cron), via the one examples refresh", /getUTCMinutes\(\) < 15\) \{ examplesRefresh = await refreshExamplesWord\(env\)/.test(seg), seg.slice(0, 120));
  ok("(5) zero OldCarsData across every pick and revalidation", metered === 0, "calls " + metered);
  process.env.FIND_EXAMPLES = "0"; const w = world(POOL()); const r = await FE.refreshFindExamples(env, w.d); ok("(5) kill switch FIND_EXAMPLES=0", r.why === "off" && (await FE.findExamples(env, CREW, w.d)) === null); delete process.env.FIND_EXAMPLES;
}
console.log("\nfindPickCheck: " + (n - failed) + " pass, " + failed + " FAIL"); process.exit(failed ? 1 : 0);
