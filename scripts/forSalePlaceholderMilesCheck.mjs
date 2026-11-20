// THE FILLER MILEAGE CLASS (Lane D, lane-d-placeholder-miles, Nov 19 2026). The live fault: the Greenland, NH 1965 Mustang carried 999,999 miles, the engine took it for the car's own odometer, matched the highest mileage band and read that band's few sales
// alone, so its Sam box printed "These sales sit in very different price ranges, so no range is shown." while the other 1965 Mustangs printed a range. A mileage nobody stated (999,999 and its variants, 0, 1, 111,111, 123,456, above 500,000) is NO mileage:
// a listing carrying any of them must get the same read as the same car with none, from the engine's real output (a real archive of Mustang sales read by the real listingMarket, no stand-in for the engine), and every page that prints a stated mileage must print none.
//   node scripts/forSalePlaceholderMilesCheck.mjs [repo root]
import path from "path"; import { fileURLToPath, pathToFileURL } from "url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const imp = f => import(pathToFileURL(path.join(root, f)).href);
const tryImp = async f => { try { return await imp(f); } catch { return null; } };
const PM = await tryImp("lib/placeholderMiles.js");   // absent on main: the checks that need it fail, the rest still run
// 1. THE ENGINE'S REAL OUTPUT: 40 sales of one car (scripts/_mustangWorld.mjs), the cheap ones at high mileage, so the highest mileage band holds a handful of sales of its own that price nothing like the whole car
const { world } = await import(pathToFileURL(path.join(root, "scripts/_mustangWorld.mjs")).href);
const { env, S, P, readFor, quiet } = await world(root); const unquiet = quiet();
const none = await readFor(null);
ok("the car with no mileage reads (the engine's own answer, not still reading)", none.read && none.read.sold_line, JSON.stringify(none.read));
const real = await readFor(45000);
ok("control: a real mileage still reads its own band (the fixture can tell a mileage from none)", real.read && real.read.sold_line !== none.read.sold_line, JSON.stringify(real.read && real.read.sold_line));
const FILLERS = [999999, "999,999", 99999, 9999999, 0, 1, 111111, 123456, 12345, 500001, 1000000];
for (const f of FILLERS) {
  const r = await readFor(f);
  ok(`mileage ${JSON.stringify(f)}: the listing states no mileage`, r.facts.miles == null && r.facts.milesSrc == null, JSON.stringify({ miles: r.facts.miles }));
  ok(`mileage ${JSON.stringify(f)}: the same read as the same car with none (kind, range, line)`, !!r.read && r.read.kind === none.read.kind && r.read.low === none.read.low && r.read.high === none.read.high && r.read.sold_line === none.read.sold_line, JSON.stringify(r.read && r.read.sold_line));
  ok(`mileage ${JSON.stringify(f)}: never the spread refusal`, !/very different price ranges/i.test(String(r.read && r.read.sold_line)));
}
unquiet();
// 2. THE RULE ITSELF: one function, and the table filter agrees with it on every whole number to 1,000,000
ok("lib/placeholderMiles.js exists and holds the rule", !!PM && typeof PM.statedMiles === "function" && typeof PM.isPlaceholderMiles === "function");
if (PM) {
  ok("fillers: 999,999 and its variants, 0, 1, 111,111, 123,456, anything above 500,000", [999999, 99999, 9999999, 0, 1, 111111, 123456, 12345, 500001, "999,999", -5].every(PM.isPlaceholderMiles));
  ok("real mileages stay: 2, 9,999, 45,000, 100,000, 250,000, 500,000, 77,000", [2, 9999, 45000, 100000, 250000, 500000, 77000].every(v => !PM.isPlaceholderMiles(v) && PM.statedMiles(v) === v));
  ok("no mileage is not a filler (null, empty): it is unknown already", !PM.isPlaceholderMiles(null) && !PM.isPlaceholderMiles("") && PM.statedMiles(null) === null);
  let bad = null; const inList = new Set(PM.PLACEHOLDER_LIST);
  for (let v = 0; v <= 1000000 && !bad; v++) { const filt = v <= 1 || v > 500000 || inList.has(v); if (filt !== PM.isPlaceholderMiles(v)) bad = v; }
  ok("the table filter and the function agree on every whole number from 0 to 1,000,000", !bad, bad == null ? "" : "differ at " + bad);
}
// 3. EVERY PAGE THE STATED MILEAGE REACHES prints none for a filler
const R = await imp("lib/forsale/rules.js"), SV = await imp("lib/forsale/serve.js"), PL = await imp("lib/live/priorListing.js"), LT = await imp("lib/live/liveTrust.js");
for (const f of [999999, 111111, 123456, 1]) {
  const row = R.rowOf({ source: "streetside", id: 7, source_listing_id: "a", title: "1965 Ford Mustang", year: 1965, mileage: f, mileage_unit: "mi", asking_price: 30000, last_seen_at: new Date().toISOString(), status: "active" }, new Date().toISOString());
  ok(`the stored row (${f}): no mileage kept`, row.mileage == null, String(row.mileage));
  const card = SV.cardOf({ r: { _fs: { ...row, id: 1, read: null, history: null, car: null, source: "streetside", source_type: "dealer", mileage: f } } });
  ok(`the Find card (${f}) from a row stored before the fix: no miles, no miles line`, card.miles == null && card.milesLine == null, JSON.stringify([card.miles, card.milesLine]));
  ok(`Tasks and Buy (liveTrust, ${f}): no stated miles`, LT.liveTrust({ listing_title: "1965 Ford Mustang", mileage: f, mileage_unit: "mi", year: 1965, country: "US", currency: "USD", description: "" }).miles == null);
}
{ const mkRow = (mileage, unit) => R.rowOf({ source: "streetside", id: 8, source_listing_id: "b", title: "1965 Ford Mustang", year: 1965, mileage, mileage_unit: unit, asking_price: 30000, last_seen_at: new Date().toISOString(), status: "active" }, new Date().toISOString()).mileage;
  ok("kilometres: a filler as typed (99,999 km) is no mileage though its miles (62,136) would look real; a kilometre figure that converts to a filler (178,816 km is 111,111 miles) is none; a real figure converts (100,000 km is 62,137 miles)", mkRow(99999, "km") == null && mkRow(178816, "km") == null && mkRow(100000, "km") === 62137); }
ok("a mileage read from the listing's own title is a filler too (a title that says 999,999-Mile states no mileage; a real 45k-Mile still reads)", LT.liveTrust({ listing_title: "999,999-Mile 1965 Ford Mustang", mileage: null, year: 1965, country: "US", currency: "USD", description: "" }).miles == null && LT.liveTrust({ listing_title: "45k-Mile 1965 Ford Mustang", mileage: null, year: 1965, country: "US", currency: "USD", description: "" }).miles === 45000);
{ const FD = await imp("lib/live/feed.js"), mapOf = mi => FD.mapLiveRecord({ source_slug: "bringatrailer", id: "q1", title: "1965 Ford Mustang", year: 1965, mileage: mi, url: "https://x/q1", current_bid: 1000 }, new Date().toISOString());
  ok("the auction feed stores a filler as no mileage and a real mileage as it is", [999999, 111111, 0, 1].every(v => { const r = mapOf(v); return r && r.mileage == null; }) && mapOf(45000).mileage === 45000); }
{ const realFetch = globalThis.fetch; globalThis.fetch = async u => /vin_index/.test(String(u)) ? new Response(JSON.stringify([{ appearance_date: "2024-03-12", source: "bringatrailer", url: "https://x/h", listing_title: "1965 Ford Mustang", make: "Ford", model: "Mustang", year: 1965, mileage: 999999, result: "sold", price_usd: 30000 }, { appearance_date: "2023-03-12", source: "bringatrailer", url: "https://x/h2", listing_title: "1965 Ford Mustang", make: "Ford", model: "Mustang", year: 1965, mileage: 41000, result: "sold", price_usd: 28000 }]), { status: 200 }) : new Response("[]", { status: 200 });
  const HD = await imp("api/_historyData.js"), va = await HD.vinAppearances(env, "5F08T123456").catch(() => null); globalThis.fetch = realFetch;
  const apps = va && va.appearances || [];
  ok("the VIN history prints a filler appearance with no mileage and a real one as it is", apps.length === 2 && apps.find(a => a.date === "2024-03-12").mileage == null && apps.find(a => a.date === "2023-03-12").mileage === 41000, JSON.stringify(apps.map(a => a.mileage))); }
ok("the history line: a filler on the earlier or the current listing prints no 'more miles'", PL.priorTake([{ date: "2024-03-12", result: "sold", miles: 41000 }], 999999, Date.now()) === PL.priorTake([{ date: "2024-03-12", result: "sold", miles: 41000 }], null, Date.now()) && !/more miles/.test(PL.priorTake([{ date: "2024-03-12", result: "sold", miles: 999999 }], 45000, Date.now())));
ok("prepare groups a filler with the cars of no mileage", P.bandOf(999999) === P.bandOf(null) && P.bandOf(0) === "unknown" && P.bandOf(45000) !== "unknown");
// 4. THE SWEEP AND THE REQUEUE
const RP = await imp("lib/forsale/report.js");
if (PM && RP.milesSweep) {
  const asked = []; const sw = await RP.milesSweep(env, { count: async (e, f) => { asked.push(f); return /source=eq\.streetside&/.test(f) ? 3 : 0; } });
  ok("the sweep counts live rows with a filler per source, and counts only", sw.total === 3 && sw.bySource.streetside === 3 && asked.every(f => /gone=eq\.false/.test(f) && /mileage\.in\./.test(f) && /mileage\.gt\.500000/.test(f)), JSON.stringify(sw.total));
  const calls = []; const rq = await RP.requeueMiles(env, { fetch: async (u, o) => { calls.push([u, o]); return { ok: true, headers: { get: () => "0-0/2" } }; } });
  ok("the requeue clears the mileage and the read of each source's filler rows, one source at a time", calls.length > 5 && calls.every(([u, o]) => /^PATCH$/.test(o.method) && /mileage\.in\./.test(u) && JSON.parse(o.body).mileage === null && JSON.parse(o.body).read === null) && rq.total === 2 * calls.length);
} else ok("the sweep and the requeue exist (lib/forsale/report.js milesSweep, requeueMiles)", false);
const fs = await import("fs"), src = f => fs.readFileSync(path.join(root, f), "utf8");
ok("the route has the sweep (report=1&miles=1) and the requeue (mode=requeue&what=miles, never scheduled)", /fillerMiles: await milesSweep/.test(src("api/pullForSale.js")) && /mode === "requeue"/.test(src("api/pullForSale.js")) && /scheduled\) return res\.status\(403\)/.test(src("api/pullForSale.js")));
const ud = src("api/usageDashboard.js"), lsc = ud.slice(ud.indexOf('task === "livesourcecount"'), ud.indexOf('task === "specialscount"'));
ok("the live source count task (livesourcecount) is read only: one HEAD count a source, a slug only, never a row", /method: "HEAD"/.test(lsc) && !/method: "(POST|PATCH|DELETE|PUT)"/.test(lsc) && /\^\[a-z0-9_\]\{2,40\}\$/.test(lsc) && /writes: 0/.test(lsc));
// 5. THE CLASS IN THE SOURCE: no reader of a listing's stated mileage takes the raw number
const raw = ["lib/live/liveTrust.js", "lib/forsale/rules.js", "lib/forsale/serve.js", "lib/live/feed.js", "lib/live/featuredHistory.js", "lib/live/priorListing.js", "api/_historyData.js"];
ok("every reader of a stated mileage goes through statedMiles", raw.every(f => /statedMiles/.test(src(f))), raw.filter(f => !/statedMiles/.test(src(f))).join(","));
console.log(failed ? `\n${failed} FAILED` : "\nall pass"); process.exit(failed ? 1 : 0);
