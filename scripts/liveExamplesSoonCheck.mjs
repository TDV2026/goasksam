// clock: real-ok every time is built from the fixed NOW below; no real clock is read except as the default argument the calls here always override
// LIVE EXAMPLES ENDING SOON CHECK (Lane B, Nov 10 2026). CLASS: every picker that chooses a LIVE auction car for a public example (Home featured car, Find examples, Tasks demo, Watching demo) shares one rule (lib/live/endingSoon.js):
// an auction ending within 7 days is preferred (within 3 best); a car more than 14 days from its end is never picked while a car within 14 days qualifies. Cause of the 1999 Porsche 911 Carrera RUF Tribute (RM Sotheby's, January 2027) on Home:
// the choice ended in "longest time left" and the search read the table by end time descending. Market Check's examples are completed sales (no live car, no end), so the rule does not reach them: asserted below.
//   node scripts/liveExamplesSoonCheck.mjs          (--mutants breaks one thing at a time)
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { spawnSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const args = process.argv.slice(2), here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(args.find(a => !a.startsWith("--")) || path.join(here, ".."));
if (args.includes("--mutants")) process.exit(mutants());
process.chdir(root);
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) pass++; else { fail++; console.log("FAIL " + n + (d ? "  " + d : "")); } };
const imp = f => import(pathToFileURL(path.join(root, f)).href);
const E = await imp("lib/live/endingSoon.js"), FE = await imp("lib/live/findExamples.js"), RW = await imp("lib/reasonWords.js");
const NOW = Date.parse("2026-11-10T20:00:00Z"), DAY = 864e5, at = d => new Date(NOW + d * DAY).toISOString();
// (1) the bands and the cap
ok("(1) bands: 2 days is 0, 5 days is 1, 10 days is 2, 60 days is 3", [2, 5, 10, 60].map(d => E.soonBand(NOW + d * DAY, NOW)).join() === "0,1,2,3");
ok("(1) the cap keeps the cars within 14 days while any is, else all", E.capPool([{ end_time: at(60) }, { end_time: at(9) }], NOW).length === 1 && E.capPool([{ end_time: at(60) }, { end_time: at(30) }], NOW).length === 2);
// (2) the Find daily pick: a car at 60 days never beats a car at 2 days; a 60 day car is picked only when nothing within 14 days qualifies
const car = (id, make, source, days, extra = {}) => ({ row: { id, make, model: "X", year: 1995, source, end_time: at(days), first_seen: "2026-11-01T00:00:00Z", ...extra }, facts: { colour: "red", body: "coupe" }, sold: false, intel: { kind: "none" } });
{ const pool = [car(1, "Porsche", "bringatrailer", 60, {}), car(2, "BMW", "bringatrailer", 2), car(3, "Audi", "carsandbids", 60), car(4, "Ford", "carsandbids", 3), car(5, "Honda", "pcarmarket", 61), car(6, "Mazda", "pcarmarket", 4)];
  pool[0].sold = true; pool[2].sold = true; pool[4].sold = true;   // the far cars have the earlier sale: it must not beat the nearness
  const got = FE.pickDaily(pool, [], "2026-11-10", NOW).map(c => c.row.id).sort();
  ok("(2) Find: with three cars within 4 days and three at 60 days (the far ones sold before), the three near cars are picked", got.join() === "2,4,6", got.join());
  const two = FE.pickDaily(pool.filter(c => ![4, 6].includes(c.row.id)), [], "2026-11-10", NOW).map(c => c.row.id);
  ok("(2) Find: with one near car, it is in the pick; the far cars fill the rest only because nothing else qualifies", two.includes(2) && two.length === 3, two.join());
  const one = FE.chooseNext([pool[0], pool[1]], [], null, NOW);
  ok("(2) Find: chooseNext picks the 2 day car over the 60 day sold car", one.row.id === 2); }
// (2b) THE ORDER (Nov 11 2026): inside the 14 day band a car with an earlier sale ranks above one without, then the nearer band; at least one sold-before car among the three when one exists in the band; outside the band it is only the fallback
{ const sold = (c, v = true) => { c.sold = v; return c; };
  const a = [sold(car(1, "Porsche", "bringatrailer", 10)), car(2, "BMW", "carsandbids", 2), car(3, "Audi", "pcarmarket", 3), car(4, "Ford", "bringatrailer", 1)];
  ok("(2b) Find: a sold car at 10 days is picked over unsold cars at 1, 2 and 3 days (chooseNext)", FE.chooseNext(a, [], null, NOW).row.id === 1);
  const three = FE.pickDaily(a, [], "2026-11-10", NOW);
  ok("(2b) Find: the three hold the sold car (10 days) though three nearer cars exist", three.length === 3 && three.some(c => c.row.id === 1), three.map(c => c.row.id).join());
  const b = [car(1, "Porsche", "bringatrailer", 60), car(2, "BMW", "carsandbids", 2), car(3, "Audi", "pcarmarket", 3), car(4, "Ford", "bringatrailer", 1)]; b[0].sold = true;
  ok("(2b) Find: a sold car at 60 days (outside the band) never displaces the cars within 14 days", !FE.pickDaily(b, [], "2026-11-10", NOW).some(c => c.row.id === 1));
  const c2 = [car(1, "Porsche", "bringatrailer", 9), car(2, "BMW", "bringatrailer", 2), car(3, "Audi", "carsandbids", 3), car(4, "Ford", "pcarmarket", 1)]; c2[0].sold = true;
  ok("(2b) Find: a sold car in the band is in the three even when it is the farthest of four in the band and shares a platform", FE.pickDaily(c2, [], "2026-11-10", NOW).some(c => c.row.id === 1));
  const nw = [car(1, "Porsche", "bringatrailer", 5), car(2, "BMW", "carsandbids", 4), car(3, "Audi", "pcarmarket", 3), car(4, "Ford", "bringatrailer", 6), car(5, "Honda", "carsandbids", 7), car(6, "Mazda", "pcarmarket", 8)];
  nw.forEach((c, i) => { c.row.first_seen = "2026-11-0" + (i + 1) + "T00:00:00Z"; }); nw[0].sold = true; nw[0].row.first_seen = "2026-11-09T00:00:00Z"; nw[3].row.first_seen = "2026-11-09T01:00:00Z"; nw[4].row.first_seen = "2026-11-09T02:00:00Z";
  ok("(2b) Find: a sold car among the three newest listings is still in the three (the set-aside never costs the pick its sold car)", FE.pickDaily(nw, [], "2026-11-10", NOW).some(c => c.row.id === 1), FE.pickDaily(nw, [], "2026-11-10", NOW).map(c => c.row.id).join());
  const d2 = [sold(car(1, "Porsche", "bringatrailer", 12)), sold(car(2, "BMW", "carsandbids", 2))];
  ok("(2b) Find: two sold cars in the band: the nearer first", FE.chooseNext(d2, [], null, NOW).row.id === 2); }
// (5) US DOLLARS ONLY (Nov 11 2026): the 1966 Ford Thunderbird on Car & Classic was in today's Find three. The fence reads the listing's CURRENCY, never the venue name, on every picker (Home, Find, Tasks, Watching)
{ const { eligibleRow } = FE, F = await imp("lib/live/featuredHistory.js"), TD = await imp("lib/live/tasksDemo.js"), UF = await imp("lib/live/usdFence.js");
  const row = (o = {}) => ({ id: 9, source: "bringatrailer", currency: "USD", url: "https://example.com/lot/9", listing_title: "1966 Ford Thunderbird", year: 1966, make: "Ford", model: "Thunderbird", vin_norm: "6Y87Z123456", mileage: 50000, mileage_unit: "mi", end_time: at(3), photo_url: "https://img.example.com/t.jpg", status: "live", current_bid: 20000, current_bid_usd: 20000, ...o });
  const facts = (o = {}) => ({ priceUsd: 20000, priceState: "usd", ...o });
  ok("(5) a dollar listing is eligible (control)", eligibleRow(row(), facts(), NOW) === true);
  const VENUES = ["bringatrailer", "carsandbids", "pcarmarket", "hagerty", "rmsothebys", "gooding", "bonhams", "mecum", "barrettjackson", "broadarrow", "sothebysmotorsport", "collectingcars", "themarket", "pistonheads", "carandclassic", "mbmarket", "acc", "hemmings"];
  for (const cur of ["GBP", "EUR", "AUD", "CHF", "JPY", "CAD", "SEK", "", null, "gbp"]) for (const src of ["carandclassic", "bringatrailer", "collectingcars", "rmsothebys"]) {
    const r = row({ source: src, currency: cur }), f = facts(cur && String(cur).toUpperCase() !== "USD" ? { priceState: "converted", priceUsd: 25000 } : {});
    ok(`(5) Find and Watching: a ${src} listing priced in ${cur === null ? "no currency" : cur === "" ? "an empty currency" : cur} is never eligible, converted figure or not`, eligibleRow(r, f, NOW) === false, [src, cur]);
  }
  for (const src of VENUES) ok(`(5) ${src}: a listing in USD is judged by its currency, whatever the venue (eligible)`, eligibleRow(row({ source: src }), facts(), NOW) === true, src);
  ok("(5) the currency is read case-insensitively, the venue never", UF.pricedInUsd({ currency: "usd", source: "carandclassic" }) === true && UF.pricedInUsd({ currency: "GBP", source: "bringatrailer" }) === false);
  const apps = [{ kind: "sale", date: "2022-05-14", house: "Bring a Trailer", url: "https://bringatrailer.com/listing/x-0/", mileage: 30000, priceUsd: 61000, image: "https://img.example.com/prev.jpg", year: 1966, make: "Ford", model: "Thunderbird", vinNorm: "6Y87Z123456" }];
  ok("(5) Home: a pound listing is not a candidate (not_usd); a dollar listing is", F.evaluateCandidate(row({ currency: "GBP" }), apps, { nowMs: NOW }).reason === "not_usd" && F.evaluateCandidate(row({ currency: null }), apps, { nowMs: NOW }).reason === "not_usd" && F.evaluateCandidate(row(), apps, { nowMs: NOW }).ok === true, [F.evaluateCandidate(row({ currency: "GBP" }), apps, { nowMs: NOW }).reason, F.evaluateCandidate(row(), apps, { nowMs: NOW }).reason]);
  const dep = { now: () => NOW, facts: async r => facts(), geo: () => ({}), head: async () => ({ status: 200, bytes: 1000, type: "image/jpeg" }) };
  const pc = await TD.proveCar({}, row({ currency: "EUR" }), dep, { nowMs: NOW });
  ok("(5) Tasks: a euro listing is refused before any read (not_usd)", pc.ok === false && pc.why === "not_usd", pc.why); }
// (6) THE LINE A CARD CARRIES (Nov 11 2026): the 2016 Exomotive Exocet had no sold before, no listed before and no market range. Sold before first, then listed before, then market range; no line only when nothing with a line is within 14 days
{ const withLine = (c, kind) => { c.intel = { kind }; if (kind === "sold_before") c.sold = true; return c; };
  const exo = car(1, "Exomotive", "carsandbids", 2), sold = withLine(car(2, "Porsche", "bringatrailer", 10), "sold_before"), listed = withLine(car(3, "BMW", "pcarmarket", 6), "listed_before"), range = withLine(car(4, "Ford", "bringatrailer", 3), "market_range");   // the Exocet is the only car of its platform slot: only the line rule keeps it out
  const ids = list => list.map(c => c.row.id).sort().join();
  ok("(6) the pick holds the three cars with a line and leaves the car with none out (Exocet at 2 days beside sold 10, listed 6, range 3)", ids(FE.pickDaily([exo, sold, listed, range], [], "2026-11-10", NOW)) === "2,3,4", ids(FE.pickDaily([exo, sold, listed, range], [], "2026-11-10", NOW)));
  ok("(6) with only two cars with a line, the car with none fills the third", FE.pickDaily([exo, sold, listed], [], "2026-11-10", NOW).length === 3);
  ok("(6) chooseNext prefers sold before, then listed before, then market range, whatever the nearness", FE.chooseNext([exo, listed, range, sold], [], null, NOW).row.id === 2 && FE.chooseNext([exo, listed, range], [], null, NOW).row.id === 3 && FE.chooseNext([exo, range], [], null, NOW).row.id === 4);
  const far = withLine(car(5, "Audi", "carsandbids", 60), "sold_before");
  ok("(6) a car with no line inside the band is picked over a car with a line outside it (the band comes first)", FE.chooseNext([exo, far], [], null, NOW).row.id === 1); }
// (3) the card's line is the engine's: Find items and the Home pick print pick.ends
ok("(3) pick.ends: 2 days out says Ends in 2 days; later today says Ends today; tomorrow says Ends tomorrow", RW.reasonLine("pick.ends", { endsAt: NOW + 2 * DAY, now: NOW }) === "Ends in 2 days" && RW.reasonLine("pick.ends", { endsAt: NOW + 3600e3, now: NOW }) === "Ends today" && RW.reasonLine("pick.ends", { endsAt: NOW + 20 * 3600e3, now: NOW }) === "Ends tomorrow", [RW.reasonLine("pick.ends", { endsAt: NOW + 2 * DAY, now: NOW }), RW.reasonLine("pick.ends", { endsAt: NOW + 3600e3, now: NOW }), RW.reasonLine("pick.ends", { endsAt: NOW + 20 * 3600e3, now: NOW })].join(" | "));
// (4) the sweep: every live picker imports the rule and reads the table nearest end first; the pages compute nothing
const src = f => fs.readFileSync(path.join(root, f), "utf8");
for (const f of ["lib/live/featuredHistory.js", "lib/live/findExamples.js", "lib/live/tasksDemo.js"]) ok(`(4) ${f} fences on the listing currency (usdFence.js)`, /pricedInUsd/.test(fs.readFileSync(path.join(root, f), "utf8")));
ok("(4) lib/live/watchingDemo.js judges every car by eligibleRow (the same fence)", /eligibleRow/.test(fs.readFileSync(path.join(root, "lib/live/watchingDemo.js"), "utf8")));
for (const f of ["lib/live/featuredHistory.js", "lib/live/findExamples.js", "lib/live/tasksDemo.js", "lib/live/watchingDemo.js"]) {
  const s = src(f);
  ok(`(4) ${f} uses lib/live/endingSoon.js`, /from "\.\/endingSoon\.js"/.test(s) && /soonBand|capPool/.test(s.replace(/import[^\n]*\n/, "")));
  ok(`(4) ${f} never reads the live table by end time descending (the farthest lots first, cut by a limit)`, !/order=end_time\.desc/.test(s));
}
ok("(4) the Market Check examples read no live listing (completed sales have no end)", !/live_listings|end_time/.test(src("lib/live/marketCheckExamples.js")));
for (const f of ["public/js/buy.js", "public/js/home.js", "public/js/tasks.js"]) if (fs.existsSync(path.join(root, f))) ok(`(4) ${f} builds no "Ends in" line itself`, !/["'`]Ends (in|today|tomorrow)/.test(src(f)));
console.log(`liveExamplesSoonCheck: ${fail ? fail + " FAIL" : "all pass"} (${pass})`); process.exit(fail ? 1 : 0);

function mutants() {
  const M = [
    ["lib/live/findExamples.js", "if (!chosen.some(c => c.sold)) {", "if (false) {", "(2b) Find: a sold car among the three newest"],
    ["lib/live/findExamples.js", "  if (!pricedInUsd(row)) return false;", "  if (false) return false;", "(5) Find and Watching"],
    ["lib/live/tasksDemo.js", 'if (!pricedInUsd(row)) return { ok: false, why: "not_usd" };', "", "(5) Tasks"],
    ["lib/live/featuredHistory.js", 'if (!pricedInUsd(live)) return { ok: false, reason: "not_usd" };', "", "(5) Home"],
    ["lib/live/usdFence.js", 'export const pricedInUsd = row => listingCurrency(row) === "USD";', 'export const pricedInUsd = row => !/carandclassic|collectingcars|themarket|pistonheads/.test(String((row && row.source) || ""));', "(5) Find and Watching"],
    ["lib/live/usdFence.js", 'export const pricedInUsd = row => listingCurrency(row) === "USD";', 'export const pricedInUsd = row => listingCurrency(row) === "USD" || listingCurrency(row) === "";', "(5) Find and Watching"],
    ["lib/live/findExamples.js", "const LINE_WEIGHT = { sold_before: 12000, listed_before: 9000, market_range: 6000, none: 0 };", "const LINE_WEIGHT = { sold_before: 0, listed_before: 0, market_range: 0, none: 0 };", "(6) chooseNext prefers"],
    ["lib/live/findExamples.js", "list = lineLeft() ? near.filter(hasLine) : near,", "list = near,", "(6) the pick holds the three cars"],
    ["lib/live/findExamples.js", "const LINE_WEIGHT = { sold_before: 12000, listed_before: 9000, market_range: 6000, none: 0 };", "const LINE_WEIGHT = { sold_before: 12000, listed_before: 6000, market_range: 9000, none: 0 };", "(6) chooseNext prefers"],
    ["lib/live/findExamples.js", ["const score = c => soonScore(c) +", "near = nearLeft() ? open.filter(c => withinCap(Date.parse(c.row.end_time), now)) : open,", "(near.length ? near : open).sort("], ["const score = c => 0 * soonScore(c) +", "near = open,", "open.sort("], "(2) Find: with three cars within 4 days"],
    ["lib/live/findExamples.js", 'if (makesIn(pool.filter(c => withinCap(Date.parse(c.row.end_time), now))) < MAX_ITEMS) pool = pool.concat(all.filter(c => !pool.includes(c) && withinCap(Date.parse(c.row.end_time), now)));', "", "(2) Find: with three cars within 4 days"],
    ["lib/live/findExamples.js", "&order=end_time.asc&limit=400", "&order=end_time.desc&limit=400", "(4) lib/live/findExamples.js never reads"],
    ["lib/live/tasksDemo.js", "&order=end_time.asc&limit=400", "&order=end_time.desc&limit=400", "(4) lib/live/tasksDemo.js never reads"],
    ["lib/live/endingSoon.js", "d <= BEST_DAYS ? 0 : d <= SOON_DAYS ? 1 : d <= CAP_DAYS ? 2 : 3", "d <= BEST_DAYS ? 0 : d <= SOON_DAYS ? 1 : d <= 90 ? 2 : 3", "(1) bands"],
    ["lib/live/endingSoon.js", "return near.length ? near : list;", "return list;", "(1) the cap keeps"],
    ["lib/reasonWords.js", "n <= 0 ? \"Ends today\"", "n <= 0 ? \"Live now\"", "(3) pick.ends"],
    ["lib/live/watchingDemo.js", 'import { soonBand, capPool } from "./endingSoon.js";', "", "(4) lib/live/watchingDemo.js uses"]
  ];
  let bad = 0;
  for (const [file, from, to, name] of M) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lesm-"));
    for (const d of ["lib", "api", "scripts", "public"]) fs.cpSync(path.join(root, d), path.join(tmp, d), { recursive: true, filter: s => !/node_modules/.test(s) });
    for (const f of ["vercel.json", "package.json"]) if (fs.existsSync(path.join(root, f))) fs.copyFileSync(path.join(root, f), path.join(tmp, f));
    fs.symlinkSync(path.join(root, "node_modules"), path.join(tmp, "node_modules"));
    const fp = path.join(tmp, file), srcText = fs.readFileSync(fp, "utf8");
    const FR = [].concat(from), TO = [].concat(to); if (!FR.every(x => srcText.includes(x))) { console.log("MUTANT BROKEN: " + name); bad++; continue; }
    let mut = srcText; FR.forEach((x, i) => { mut = mut.replace(x, TO[i]); }); fs.writeFileSync(fp, mut);
    const r = spawnSync("node", [path.join(tmp, "scripts/liveExamplesSoonCheck.mjs"), tmp], { encoding: "utf8", timeout: 120000 }), out = (r.stdout || "") + (r.stderr || "");
    const named = out.split("\n").some(l => l.startsWith("FAIL") && l.includes(name));
    if (!(r.status !== 0 && named)) { console.log(`MUTANT SURVIVED: ${name}`); out.split("\n").slice(0, 4).forEach(l => console.log("   " + l.slice(0, 160))); bad++; }
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`liveExamplesSoonCheck mutants: ${M.length - bad} of ${M.length} killed${bad ? `, ${bad} SURVIVED` : ""}`);
  return bad ? 1 : 0;
}
