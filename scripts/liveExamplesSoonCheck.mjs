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
// (7) VENUE VARIETY IS A TIEBREAK BELOW THE LINE ORDER (Nov 11 2026): today's Find three were all Bring a Trailer. The fixed slots (a Bring a Trailer car first) took the best car of a venue before a better car of another; the spread of venues is now one score term, below the band and the line
{ const L = (c, kind) => { c.intel = { kind }; c.sold = kind === "sold_before"; return c; };
  const bat1 = L(car(1, "Porsche", "bringatrailer", 3), "sold_before"), bat2 = L(car(2, "BMW", "bringatrailer", 3), "sold_before"), rm = L(car(3, "Ford", "rmsothebys", 3), "sold_before");
  ok("(7) two cars tie on line and band: the one from a venue not yet shown wins (Bring a Trailer shown, a second Bring a Trailer car with the smaller id against an RM Sotheby's car)", FE.chooseNext([bat2, rm], [bat1], null, NOW).row.id === 3);
  const pool = [L(car(1, "Porsche", "bringatrailer", 3), "sold_before"), L(car(2, "BMW", "bringatrailer", 3), "sold_before"), L(car(3, "Audi", "bringatrailer", 3), "sold_before"), L(car(4, "Mercedes", "bringatrailer", 3), "sold_before"), L(car(5, "Ford", "rmsothebys", 3), "sold_before"), L(car(6, "Honda", "carsandbids", 3), "sold_before"), L(car(7, "Mazda", "pcarmarket", 3), "sold_before"),
    L(car(8, "Lotus", "bringatrailer", 3), "sold_before"), L(car(9, "Fiat", "bringatrailer", 3), "sold_before"), L(car(10, "Volvo", "bringatrailer", 3), "sold_before")];
  pool.forEach((c, i) => { c.row.first_seen = "2026-11-0" + (i < 7 ? 1 : 2) + "T0" + (i % 10) + ":00:00Z"; });   // the three newest listings (ids 8 to 10) are set aside: the tie is among the seven left
  const venues = list => new Set(list.map(c => c.row.source)).size;
  ok("(7) seven cars tie on line and band (four Bring a Trailer, one each of three other venues): the three picked come from three venues", venues(FE.pickDaily(pool.map(c => ({ ...c })), [], "2026-11-10", NOW)) === 3, FE.pickDaily(pool.map(c => ({ ...c })), [], "2026-11-10", NOW).map(c => c.row.source));
  const rmRange = L(car(4, "Ford", "rmsothebys", 3), "market_range");
  ok("(7) the line comes first: a Bring a Trailer car with a sold-before line beats a car of a new venue with only a market range", FE.chooseNext([bat2, rmRange], [bat1], null, NOW).row.id === 2);
  const sl = [L(car(1, "Porsche", "bringatrailer", 3), "market_range"), L(car(2, "Ford", "rmsothebys", 3), "sold_before"), L(car(3, "Honda", "carsandbids", 3), "sold_before"), L(car(4, "Mazda", "pcarmarket", 3), "sold_before"), L(car(5, "Audi", "bringatrailer", 3), "market_range"), L(car(6, "BMW", "bringatrailer", 3), "market_range"), L(car(7, "Fiat", "bringatrailer", 3), "market_range")];
  sl.forEach((c, i) => { c.row.first_seen = "2026-11-0" + (i < 4 ? 1 : 2) + "T0" + i + ":00:00Z"; });
  ok("(7) no venue slot: three sold-before cars of three venues beat a Bring a Trailer car with only a market range, which a Bring a Trailer slot would have taken first", FE.pickDaily(sl.map(c => ({ ...c })), [], "2026-11-10", NOW).map(c => c.row.id).sort().join() === "2,3,4", FE.pickDaily(sl.map(c => ({ ...c })), [], "2026-11-10", NOW).map(c => c.row.id).sort().join());
  const rmFar = L(car(4, "Ford", "rmsothebys", 12), "sold_before"), batNear = L(car(2, "BMW", "bringatrailer", 2), "sold_before");
  ok("(7) the time band comes first: a nearer Bring a Trailer car beats a car of a new venue in a later band", FE.chooseNext([batNear, rmFar], [bat1], null, NOW).row.id === 2); }
// (8) CARDS TWO AND THREE (Nov 11 2026): the first card is the best car by the order; each later card is the best car with any line from a venue not yet shown, when one exists within 14 days, else the order
{ const L = (c, kind) => { c.intel = { kind }; c.sold = kind === "sold_before"; return c; }, venues = list => new Set(list.map(c => c.row.source)).size;
  const filler = [[21, "Lotus", "bringatrailer", 6, "sold_before"], [22, "Fiat", "bringatrailer", 6, "sold_before"], [23, "Volvo", "bringatrailer", 6, "sold_before"]];   // the three newest listings (set aside), so the cars under test are the rest
  const mk = (list) => { const specs = [...list, ...filler]; return specs.map(([id, make, src, d, kind], i) => { const c = L(car(id, make, src, d), kind); c.row.first_seen = "2026-11-0" + (i < specs.length - 3 ? 1 : 2) + "T0" + (i % 10) + ":00:00Z"; return c; }); };
  const five = [[1, "Porsche", "bringatrailer", 2, "sold_before"], [2, "BMW", "bringatrailer", 3, "sold_before"], [3, "Audi", "bringatrailer", 4, "sold_before"], [4, "Ford", "bringatrailer", 5, "sold_before"], [5, "Honda", "bringatrailer", 6, "sold_before"]];
  const a = FE.pickDaily(mk([[6, "Mazda", "carsandbids", 3, "market_range"], ...five]), [], "2026-11-10", NOW);
  ok("(8) five sold Bring a Trailer cars and one market-range Cars & Bids car: the three come from two venues", a.length === 3 && venues(a) === 2, a.map(c => c.row.source + ":" + c.row.id));
  ok("(8) the first card is the best car by the order (the nearest sold Bring a Trailer car), not the new venue's range car", a[0].row.id === 1, a.map(c => c.row.id));
  ok("(8) the new venue's car is card two", a[1].row.source === "carsandbids", a.map(c => c.row.source));
  const b = FE.pickDaily(mk([[6, "Mazda", "carsandbids", 3, "none"], ...five]), [], "2026-11-10", NOW);
  ok("(8) a car of a new venue with NO line is not taken for the venue: five sold Bring a Trailer cars and a Cars & Bids car with no line give one venue", b.length === 3 && venues(b) === 1, b.map(c => c.row.source));
  const c = FE.pickDaily(mk([[6, "Mazda", "carsandbids", 30, "market_range"], ...five]), [], "2026-11-10", NOW);
  ok("(8) a car of a new venue beyond 14 days is not taken for the venue", c.length === 3 && venues(c) === 1, c.map(x => x.row.source + ":" + x.row.id));
  const e = FE.pickDaily(mk([[6, "Mazda", "carsandbids", 3, "listed_before"], [7, "Fiat", "rmsothebys", 3, "market_range"], ...five]), [], "2026-11-10", NOW);
  ok("(8) among cars of new venues the line decides (listed before over market range)", e.length === 3 && e[1].row.source === "carsandbids" && e[2].row.source === "rmsothebys", e.map(x => x.row.source));
  const g = FE.pickDaily(mk([[2, "Ford", "carsandbids", 3, "market_range"], [1, "Porsche", "bringatrailer", 2, "sold_before"], [3, "BMW", "bringatrailer", 4, "market_range"], [4, "Audi", "bringatrailer", 4, "market_range"], [5, "Fiat", "bringatrailer", 4, "market_range"]]), [], "2026-11-10", NOW);
  ok("(8) the sold-before guarantee stays: a sold-before car is among the three", g.some(x => x.sold), g.map(x => x.row.id)); }
// (9) EVERY LIVE ROW IN THE BAND IS READ (Nov 11 2026): the pool read ended in "&limit=400" (Home "&limit=1000") and read only the rows that end first
{ const LB = await imp("lib/live/liveBand.js"), N = 2500;
  const rows = Array.from({ length: N }, (_, i) => ({ id: i + 1, end_time: new Date(NOW + (0.1 + i * 13.5 / N) * DAY).toISOString() })).concat(Array.from({ length: 700 }, (_, i) => ({ id: N + i + 1, end_time: new Date(NOW + (20 + i * 0.05) * DAY).toISOString() })));
  const calls = [], select = async (env, q) => { calls.push(q); const g = (k, re) => { const m = re.exec(q); return m ? decodeURIComponent(m[1]) : null; }, gt = g("gt", /end_time=gt\.([^&]+)/), lt = g("lt", /end_time=lt\.([^&]+)/), gte = g("gte", /end_time=gte\.([^&]+)/), lim = Number(/limit=(\d+)/.exec(q)[1]), off = Number((/offset=(\d+)/.exec(q) || [0, 0])[1]);
    return rows.filter(r => (!gt || r.end_time > gt) && (!lt || r.end_time < lt) && (!gte || r.end_time >= gte)).sort((a, b) => a.end_time.localeCompare(b.end_time) || a.id - b.id).slice(off, off + lim); };
  const got = await LB.readBand(select, {}, "live_listings?status=eq.live&select=*", { fromIso: new Date(NOW).toISOString(), nowMs: NOW });
  const inBand = got.filter(r => Date.parse(r.end_time) < NOW + 14 * DAY).length;
  ok("(9) all 2500 live rows ending within 14 days are read (the old read stopped at 400, a request at 1000)", inBand === N, inBand);
  ok("(9) beyond 14 days only the next 400 are read, and no row is read twice", got.length === N + 400 && new Set(got.map(r => r.id)).size === got.length, got.length);
  ok("(9) the pages run in a fixed order (end time, then id) with a moving offset", calls.filter(q => /offset=\d+/.test(q)).length === 3 && calls.every(q => /order=end_time\.asc,id\.asc/.test(q)) && /offset=2000/.test(calls[2]), calls.map(q => (/offset=(\d+)/.exec(q) || [0, "far"])[1]));
  const fe = await FE.candidatePool({}, { select }, NOW);
  ok("(9) Find's pool (and Watching's, which shares it) reads every row of the band", fe.filter(r => Date.parse(r.end_time) < NOW + 14 * DAY).length === N, fe.length);
  const rdf = f => fs.readFileSync(path.join(root, f), "utf8");
  for (const f of ["lib/live/findExamples.js", "lib/live/tasksDemo.js", "lib/live/featuredHistory.js"]) ok(`(9) ${f} reads the live pool through readBand and keeps no "&limit=400" or "&limit=1000" on it`, /readBand\(/.test(rdf(f)) && !/live_listings\?[^`]*limit=(400|1000)`/.test(rdf(f)) && !/LIVE_SELECT \+ `[^`]*limit=400/.test(rdf(f)), f);
  ok("(9) Watching's pool is Find's (candidatePool), so it has the same read", /candidatePool/.test(rdf("lib/live/watchingDemo.js")) && !/limit=400/.test(rdf("lib/live/watchingDemo.js"))); }
// (10) THE LINE IS WORKED OUT PER VENUE (Nov 11 2026). Find's three were all Bring a Trailer after the venue rule: the line was worked out for at most 12 cars in hash order over every venue at once, so in a band of several hundred cars a venue with a few cars was seldom reached
// (Lane C's funnel: 5 sold-before and 8 market-range cars in the band). NOW each venue's best 6 cars are evaluated (the nearest end first, the venues in turn), the engine's band read bounded at 6 x 8 = 48 a build.
{ const FEx = FE, S = await imp("lib/live/search.js"), C = await imp("lib/_crew.js");
  const CLOCK = Date.parse("2026-11-10T20:00:00Z"), env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
  const row = (id, make, src, hours) => ({ id, source: src, url: "https://auction.test/lot/" + id, photo_url: "https://img.test/p" + id + ".jpg", listing_title: `199${id % 10} ${make} Model${id}`, year: 1990 + (id % 10), make, model: "Model" + id, vin_norm: null, mileage: 20000, mileage_unit: "miles", current_bid: 60000, current_bid_usd: 60000, currency: "USD", country: "US", location: "Austin, TX", transmission: "Manual", exterior_color: "Red", body: null, status: "live", end_time: new Date(CLOCK + hours * 3600e3).toISOString(), description: "", first_seen: src === "bringatrailer" ? "2026-11-09T12:00:00Z" : "2026-11-02T12:00:00Z" });
  const bat = Array.from({ length: 40 }, (_, i) => row(i + 1, "BatMake" + (i + 1), "bringatrailer", 30 + i)), cab = [200, 201, 202].map((id, i) => row(id, "CabMake" + id, "carsandbids", 100 + i));
  const rows = [...bat, ...cab], titleOf2 = r => FEx.titleOf(r);
  const run = async () => { const w = { store: new Map(), asked: [] };
    w.d = { now: () => CLOCK, head: async () => ({ status: 200, bytes: 1000, type: "image/jpeg" }), appearances: async () => ({ ok: false, appearances: [] }), urlStatus: async () => 200, facts: async r => S.listingFacts(r),
      answer: async (e, t) => { w.asked.push(t); return { tier: "result", cluster: [20000, 30000] }; },
      select: async (e, q) => { let m = /^app_config\?key=eq\.([a-z_]+)/.exec(q); if (m) { const v = w.store.get(m[1]); return v ? [{ value: v }] : []; }
        m = /^live_listings\?id=eq\.([^&]+)/.exec(q); if (m) return rows.filter(r => String(r.id) === decodeURIComponent(m[1])).slice(0, 1);
        if (/^live_listings\?status=eq\.live/.test(q)) return rows.filter(r => r.status === "live" && Date.parse(r.end_time) > CLOCK); return []; },
      write: async (e, r) => { w.store.set(r.key, r.value); }, clear: async (e, k) => { w.store.delete(k); } };
    const res = await FEx.refreshFindExamples(env, w.d), st = w.store.get(FEx.STORE_KEY), ents = (st && st.entries) || [];
    return { res, w, venues: new Set(ents.map(e => String(rows.find(r => r.id === e.listingId).source))), ids: ents.map(e => e.listingId) }; };
  const out = await run();
  ok("(10) a band of 40 Bring a Trailer cars and 3 Cars & Bids cars, every car with a market range: the three come from two venues", out.ids.length === 3 && out.venues.size === 2, out.ids);
  ok("(10) the engine's band reads are bounded: at most 48 a build, and each venue's best 6 cars are evaluated (the three Cars & Bids cars among them)", out.w.asked.length <= FEx.MAX_ENGINE_READS && FEx.MAX_ENGINE_READS === 48 && cab.every(c => out.w.asked.includes(titleOf2(c))) && bat.slice(0, 6).every(c => out.w.asked.includes(titleOf2(c))), [out.w.asked.length, FEx.MAX_ENGINE_READS]);
  ok("(10) the evaluation order takes the venues in turn: the first six cars of the order hold both venues", (() => { const cands = rows.map(r => ({ row: r, facts: {} })), { order } = FEx.evalOrderOf(cands, CLOCK, "2026-11-10"); return new Set(order.slice(0, 6).map(c => c.row.source)).size === 2 && order.slice(0, 6).filter(c => c.row.source === "carsandbids").length === 3; })());
  ok("(10) a venue with fewer than 6 cars runs out without stopping the others", (() => { const cands = rows.map(r => ({ row: r, facts: {} })), { evalSet } = FEx.evalOrderOf(cands, CLOCK, "2026-11-10"); return [...evalSet].filter(c => c.row.source === "carsandbids").length === 3 && [...evalSet].filter(c => c.row.source === "bringatrailer").length === 6; })()); }
// (11) THE MODEL YEAR OF A CARD (Nov 11 2026). Find's first card printed "Chevrolet Corvette" (VIN 1G1YZ23J3M5800527, a 1991 ZR-1): the title was [year, make, model] joined, and a missing year joins to "Chevrolet Corvette", never to the empty string the listing-title fallback waited for
{ const TY = await imp("lib/live/titleYear.js"), F = await imp("lib/live/featuredHistory.js");
  const r0 = { id: 5, source: "bringatrailer", currency: "USD", url: "https://example.com/lot/5", listing_title: "45k-Mile 1991 Chevrolet Corvette ZR-1", year: null, make: "Chevrolet", model: "Corvette", vin_norm: "1G1YZ23J3M5800527", mileage: 45000, mileage_unit: "mi", end_time: at(3), photo_url: "https://img.example.com/c.jpg", status: "live", current_bid: 20000, current_bid_usd: 20000 };
  const noTitleYear = { ...r0, listing_title: "Chevrolet Corvette ZR-1" }, none = { ...r0, listing_title: "Chevrolet Corvette ZR-1", vin_norm: null }, f = { priceUsd: 20000, priceState: "usd" };
  ok("(11) a row with no year column reads its year from the listing title: 1991 Chevrolet Corvette", FE.titleOf(r0) === "1991 Chevrolet Corvette" && TY.yearOf(r0) === 1991, FE.titleOf(r0));
  ok("(11) a row with no year anywhere in its title reads the model year from its VIN: 1991", FE.titleOf(noTitleYear) === "1991 Chevrolet Corvette" && TY.yearOf(noTitleYear) === 1991, FE.titleOf(noTitleYear));
  ok("(11) the row's own year is first", FE.titleOf({ ...r0, year: 1992 }) === "1992 Chevrolet Corvette");
  ok("(11) a card with no model year anywhere (no column, no title year, no VIN) is no example: not eligible, not pickable", FE.eligibleRow(none, f, NOW) === false && FE.eligibleRow(r0, f, NOW) === true && TY.yearOf(none) === null);
  const apps = [{ kind: "sale", date: "2022-05-14", house: "Bring a Trailer", url: "https://bringatrailer.com/listing/x-0/", mileage: 30000, priceUsd: 21000, image: "https://img.example.com/prev.jpg", year: 1991, make: "Chevrolet", model: "Corvette", vinNorm: "1G1YZ23J3M5800527" }];
  const h = F.evaluateCandidate(r0, apps, { nowMs: NOW });
  ok("(11) Home: the title carries the year read from the listing title", h.ok && h.featured.current.title === "1991 Chevrolet Corvette", h.ok ? h.featured.current.title : h.reason);
  ok("(11) Home: a row with no year anywhere is not a candidate (no_year)", F.evaluateCandidate(none, [{ ...apps[0], vinNorm: undefined }], { nowMs: NOW }).reason === "no_year" || F.evaluateCandidate(none, apps, { nowMs: NOW }).reason === "no_year", F.evaluateCandidate(none, apps, { nowMs: NOW }).reason);
  ok("(11) Home's fallback title (no Find card name) carries the year", F.cardTitle(null, r0) === "1991 Chevrolet Corvette", F.cardTitle(null, r0));
  const rdy = f2 => fs.readFileSync(path.join(root, f2), "utf8");
  ok("(11) Tasks builds its card title with carTitleOf (the year in front)", /title: carTitleOf\(row\)/.test(rdy("lib/live/tasksDemo.js")));
  ok("(11) no picker joins [year, make, model] itself: every title is carTitleOf", ["lib/live/findExamples.js", "lib/live/tasksDemo.js", "lib/live/featuredHistory.js", "lib/live/watchingDemo.js"].every(f3 => !/\[(row|live|r)\.year, (row|live|r)\.make, (row|live|r)\.model\]/.test(rdy(f3)))); }
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
    ["lib/live/findExamples.js", "const LINE_WEIGHT = { sold_before: 12000, listed_before: 9000, market_range: 6000, none: 0 };", "const LINE_WEIGHT = { sold_before: 12000, listed_before: 6000, market_range: 9000, none: 0 };", "(6) chooseNext prefers"],
    ["lib/live/findExamples.js", "export const VENUE_TIEBREAK = 200;", "export const VENUE_TIEBREAK = 0;", "(7) two cars tie on line and band"],
    ["lib/live/findExamples.js", "export const VENUE_TIEBREAK = 200;", "export const VENUE_TIEBREAK = 20000;", "(7) the line comes first"],
    ["lib/live/findExamples.js", "export const VENUE_TIEBREAK = 200;", "export const VENUE_TIEBREAK = 20000;", "(7) the time band comes first"],
    ["lib/live/findExamples.js", "    const cand = pool.filter(c => !chosen.includes(c) && hasLine(c) && withinCap(Date.parse(c.row.end_time), now) && !shown.has(norm(c.row.source)) && !makes.has(norm(c.row.make)));", "    const cand = [];", "(8) five sold Bring a Trailer cars and one market-range"],
    ["lib/live/findExamples.js", "&& hasLine(c) && withinCap(Date.parse(c.row.end_time), now) && !shown.has", "&& withinCap(Date.parse(c.row.end_time), now) && !shown.has", "(8) a car of a new venue with NO line"],
    ["lib/live/findExamples.js", "&& hasLine(c) && withinCap(Date.parse(c.row.end_time), now) && !shown.has", "&& hasLine(c) && !shown.has", "(8) a car of a new venue beyond 14 days"],
    ["lib/live/findExamples.js", "while (chosen.length < MAX_ITEMS) if (!takeNewVenue() && !take(pool)) break;", "while (chosen.length < MAX_ITEMS) if (!takeNewVenue()) break;", "(8) five sold Bring a Trailer cars and one market-range"],
    ["lib/live/findExamples.js", "    const next = cand.length ? chooseNext(cand, chosen, tie, now) : null;", "    const next = cand.length ? cand.sort((x, y) => String(y.row.id).localeCompare(String(x.row.id)))[0] : null;", "(8) among cars of new venues the line decides"],
    ["lib/live/findExamples.js", "const rows = await readBand(d.select, env, LIVE_SELECT, { fromIso: new Date(now + MIN_LEFT_MS).toISOString(), nowMs: now });", "const rows = await d.select(env, LIVE_SELECT + `&end_time=gt.${encodeURIComponent(new Date(now + MIN_LEFT_MS).toISOString())}&order=end_time.asc,id.asc&limit=400&offset=0`);", "(9) Find's pool"],
    ["lib/live/liveBand.js", "if (got.length < pageSize) break;", "break;", "(9) all 2500 live rows"],
    ["lib/live/liveBand.js", "&offset=${page * pageSize}`", "&offset=0`", "(9) the pages run in a fixed order"],
    ["lib/live/tasksDemo.js", "const live = await readBand(d.select, env, LIVE_SELECT, { fromIso: new Date(now + MIN_LEFT_MS).toISOString(), nowMs: now });", "const live = await d.select(env, LIVE_SELECT + `&order=end_time.asc&limit=400`);", "(9) lib/live/tasksDemo.js reads"],
    ["lib/live/featuredHistory.js", "const live = await readBand(d.select, env,", "const live = await d.select(env, `live_listings?status=eq.live&select=${LIVE_COLS}&order=end_time.asc&limit=1000`); const unused = (d.select, env,", "(9) lib/live/featuredHistory.js reads"],
    ["lib/live/findExamples.js", "export const MAX_ENGINE_READS = PER_VENUE_EVAL * MAX_VENUES_EVAL;", "export const MAX_ENGINE_READS = 12;", "(10) the engine's band reads are bounded"],
    ["lib/live/findExamples.js", "const { order, evalSet } = evalOrderOf(cands, now, dateKey);", "const order = cands.slice().sort((a, b) => hashOf(dateKey + \":\" + a.row.id) - hashOf(dateKey + \":\" + b.row.id)), evalSet = new Set(order.slice(0, 12));", "(10) a band of 40 Bring a Trailer cars"],
    ["lib/live/findExamples.js", "for (const [, list] of venues) if (list[i]) order.push(list[i]);", "for (const [, list] of venues.slice(0, 1)) if (list[i]) order.push(list[i]);", "(10) the evaluation order takes the venues in turn"],
    ["lib/live/findExamples.js", "for (const c of list.slice(0, PER_VENUE_EVAL)) evalSet.add(c);", "for (const c of list.slice(0, 1)) evalSet.add(c);", "(10) a venue with fewer than 6 cars"],
    ["lib/live/findExamples.js", "export const titleOf = row => carTitleOf(row);", "export const titleOf = row => [row.year, row.make, row.model].filter(Boolean).join(\" \").trim() || String(row.listing_title || \"\").trim();", "(11) a row with no year column reads its year"],
    ["lib/live/findExamples.js", "  if (!yearOf(row)) return false;", "", "(11) a card with no model year anywhere"],
    ["lib/live/featuredHistory.js", 'if (!yearOf(live)) return { ok: false, reason: "no_year" };', "", "(11) Home: a row with no year anywhere"],
    ["lib/live/featuredHistory.js", "  const title = carTitleOf(live);", '  const title = [live.year, live.make, live.model].filter(Boolean).join(" ").trim() || String(live.listing_title || "").trim();', "(11) Home: the title carries the year"],
    ["lib/live/titleYear.js", "  if (v.length === 17) {", "  if (false) {", "(11) a row with no year anywhere in its title"],
    ["lib/live/tasksDemo.js", "title: carTitleOf(row),", 'title: [row.year, row.make, row.model].filter(Boolean).join(" ").trim(),', "(11) Tasks builds its card title"],
    ["lib/live/findExamples.js", ["const score = c => soonScore(c) +", "near = nearLeft() ? open.filter(c => withinCap(Date.parse(c.row.end_time), now)) : open,", "(near.length ? near : open).sort("], ["const score = c => 0 * soonScore(c) +", "near = open,", "open.sort("], "(2) Find: with three cars within 4 days"],
    ["lib/live/findExamples.js", 'if (makesIn(pool.filter(c => withinCap(Date.parse(c.row.end_time), now))) < MAX_ITEMS) pool = pool.concat(all.filter(c => !pool.includes(c) && withinCap(Date.parse(c.row.end_time), now)));', "", "(2) Find: with three cars within 4 days"],
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
