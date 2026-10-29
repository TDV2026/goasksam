// A LOT THAT IS NOT A VEHICLE IS NOT A CAR ANYWHERE (Lane B, Oct 29 2026). Live Find fault: a Hagerty ENGINE for sale (Savannah GA, no reserve, last bid $15,250, a flat-six on a pallet, no mileage) drew a Find card titled "1986 Porsche 911" with a Market Check line.
// CAUSE: the only part guard (lib/_classify.js isPartsListing) read the title alone and called any title with a model year a real car (the donor car's year), and the live intake kept the lot because the feed gave it a make and model.
// FIX: ONE function, nonVehicleSignals / isNonVehicleLot (lib/_classify.js): a lot is not a vehicle only when two real signals agree (title or description names a part or non-car noun; no odometer reading and no VIN; the source's own type),
// doubtful (one real signal) is kept, marked, listed for Sam and shown with no number; a lot with an odometer reading AND a VIN is a car whatever its words. It is read by liveRows (every live surface: Find, Buy, Tasks, emails, the dashboard), by the pool
// filter (qualifyReason: Market Check, Sell, the sales lists) and by the Desk. Nothing is deleted: the verdict is computed where the lot is read and listed by the ops tasks nonvehicle and nonvehiclesold.
// Built from real lots: the engine, wheel set, literature lot and parts lots that the guard's own comments record from real BaT and house listings, plus the Hagerty engine as far as it is known (title, no mileage, bid, no reserve); the lot's description is
// is not in this file (Sam sent the source title, seller, bids, photos, mileage and VIN facts, not the description), so the fixture carries exactly those facts: the title as the SOURCE writes it, no mileage, no VIN.
//   node scripts/nonVehicleCheck.mjs [repo root]
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2";
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const LOTS = [
  { id: 9001, label: "the reported Hagerty engine (source title as the source writes it, no mileage, no VIN, no reserve, high bid $15,250, 35 bids)", source: "hagerty", listing_title: "1986 Porsche 3.2L Twin Plug 911 Engine (Lot 35)", make: "Porsche", model: "911", year: 1986, mileage: null, vin_norm: null, current_bid_usd: 15250, has_reserve: false, description: "", end_time: new Date(Date.now() + 8 * 3600e3).toISOString(), location: "Savannah, GA" },
  { id: 9002, label: "an engine (BaT)", source: "bringatrailer", listing_title: "Lamborghini Murcielago 6.2L V12 Engine", make: "Lamborghini", model: "Murcielago", year: 2004, mileage: null, vin_norm: null, current_bid_usd: 21000, description: "" },
  { id: 9003, label: "a wheel set", source: "bringatrailer", listing_title: "18x8 Wheels for Porsche 911", make: "Porsche", model: "911", year: 1986, mileage: null, vin_norm: null, current_bid_usd: 2400, description: "" },
  { id: 9004, label: "a literature lot", source: "rmsothebys", listing_title: "1986 Porsche 911 Factory Sales Brochures", make: "Porsche", model: "911", year: 1986, mileage: null, vin_norm: null, current_bid_usd: 300, description: "" },
  { id: 9005, label: "a parts lot", source: "bringatrailer", listing_title: "Porsche 911 Type 911/93 2.7L Engine", make: "Porsche", model: "911", year: 1986, mileage: null, vin_norm: null, current_bid_usd: 7500, description: "" }
];
const CARS = [
  { id: 9101, label: "a 1986 911 Carrera with miles and a VIN", source: "bringatrailer", listing_title: "1986 Porsche 911 Carrera Coupe", make: "Porsche", model: "911", year: 1986, mileage: 84000, vin_norm: "WP0AB0911GS120000", description: "Matching engine rebuilt, 84,000 miles" },
  { id: 9102, label: "a house classic with no mileage and no VIN", source: "rmsothebys", listing_title: "1962 Ferrari 250 GT SWB", make: "Ferrari", model: "250 GT", year: 1962, mileage: null, vin_norm: null, description: "Alloy body, matching numbers engine" },
  { id: 9103, label: "a Bel Air Hardtop with neither", source: "mecum", listing_title: "1957 Chevrolet Bel Air Hardtop", make: "Chevrolet", model: "Bel Air", year: 1957, mileage: null, vin_norm: null, description: "" },
  { id: 9104, label: "an engine-swapped car with miles and a VIN", source: "carsandbids", listing_title: "1986 Porsche 911 Carrera with 3.6L Engine Swap", make: "Porsche", model: "911", year: 1986, mileage: 41000, vin_norm: "WP0AB0911GS120999", description: "" }
];
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href), C = await import(pathToFileURL(path.join(root, "lib/_classify.js")).href), S = await import(pathToFileURL(path.join(root, "lib/live/search.js")).href);
// 0. the intake keeps the source's own title (the classifier reads it, not the card's cleaned name): the Hagerty record as the feed gives it
{ const F = await import(pathToFileURL(path.join(root, "lib/live/feed.js")).href);
  const rec = { source_slug: "hagerty", source_record_id: "7gOJzHjdVMIwld3nQqzJwU", title: "1986 Porsche 3.2L Twin Plug 911 Engine (Lot 35)", ocd_make_name: "Porsche", ocd_model_name: "911", year: 1986, current_bid: 15250, has_reserve: false, url: "https://www.hagerty.com/marketplace/auction/0000-Porsche-911/7gOJzHjdVMIwld3nQqzJwU", stats: { bids: 35 } };
  const m = F.mapLiveRecord(rec, new Date().toISOString());
  ok("intake stores the source's own title, word for word (Twin Plug, Engine, Lot 35 all kept)", !!m && m.listing_title === "1986 Porsche 3.2L Twin Plug 911 Engine (Lot 35)", m && m.listing_title);
  ok("... with no mileage and no VIN, as the source shows", !!m && !m.mileage && !m.vin_norm);
  ok("... and the function reads that stored row as not a vehicle", !!m && C.isNonVehicleLot(m), m && JSON.stringify(C.nonVehicleSignals(m)));
  // the card's own name is built from the resolved spec (year make model trim body) and drops the words that decide what the lot is: nothing downstream of that name may decide what the lot is
  const B = await import(pathToFileURL(path.join(root, "api/buySearch.js")).href).catch(() => null);
  if (B && B.nameFromSpec) { const name = B.nameFromSpec({ make: "Porsche", model: "911", year: 1986 }, 1986); ok("the card's name is the resolved spec's (it drops Engine): so the classifier must never read it", name === "1986 Porsche 911" && C.nonVehicleSignals({ listing_title: name, mileage: null, vin_norm: null }).verdict === "car", name); } }
// 1. the one function
for (const l of LOTS) ok(`${l.label}: isNonVehicleLot, not a vehicle`, C.isNonVehicleLot(l) === true, JSON.stringify(C.nonVehicleSignals(l)));
for (const c of CARS) ok(`${c.label}: still a car`, C.isNonVehicleLot(c) === false && C.nonVehicleSignals(c).verdict === "car", JSON.stringify(C.nonVehicleSignals(c)));
// 2. no sales pool counts them: the pool filter (Market Check, Sell, the sales lists) gives the reason
const spec = { make: "Porsche", model: "911", year: 1986 };
for (const l of LOTS) { let why = null; try { why = E.qualifyReason({ raw_title: l.listing_title, rtitle: l.listing_title, mileage: l.mileage, vin_norm: l.vin_norm, year: l.year, make: l.make, model: l.model, price: Math.max(4000, l.current_bid_usd), _usd: Math.max(4000, l.current_bid_usd), image: "https://img.test/x.jpg" }, spec); } catch (e) { why = "threw " + e.message; }
  ok(`${l.label}: not counted in a sales pool (qualifyReason)`, /part or automobilia/.test(String(why)), String(why)); }
for (const c of CARS.filter(x => x.make === "Porsche")) { let why = null; try { why = E.qualifyReason({ raw_title: c.listing_title, rtitle: c.listing_title, mileage: c.mileage, vin_norm: c.vin_norm, year: c.year, make: c.make, model: c.model, price: 50000, _usd: 50000, image: "https://img.test/x.jpg" }, spec); } catch (e) { why = "threw " + e.message; }
  ok(`${c.label}: not removed from a pool as a part`, !/part or automobilia/.test(String(why)), String(why)); }
// 3. not shown as a car and not matched to a spec: liveRows (every live surface reads it) leaves them out
const all = [...LOTS, ...CARS];
globalThis.fetch = async (url) => {
  const u = new URL(String(url));
  if (u.hostname !== "fake.supabase.test") throw new Error("offline");
  if (u.pathname.endsWith("/live_listings")) {
    const sel = u.searchParams.get("select") || "", idf = u.searchParams.get("id") || "";
    if (/^in\./.test(idf)) { const ids = idf.replace(/^in\.\(|\)$/g, "").split(",").map(Number); return new Response(JSON.stringify(all.filter(r => ids.includes(r.id)).map(r => ({ id: r.id, description: r.description }))), { status: 200 }); }
    return new Response(JSON.stringify(all.map(r => ({ ...r, description: /description/.test(sel) ? r.description : undefined }))), { status: 200 });
  }
  return new Response("[]", { status: 200 });
};
const rows = await S.liveRows({ supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" }, "id=gt.0", { allScope: true, noDescription: true });
const ids = new Set((rows || []).map(r => r.id));
for (const l of LOTS) ok(`${l.label}: not in the live rows every surface reads (no Find card, no spec match)`, !ids.has(l.id));
for (const c of CARS) ok(`${c.label}: still in the live rows`, ids.has(c.id));
ok("the lots the function left out are listed with their reasons (the ops task reads this)", [...S.nonVehicleSeen.values()].filter(v => v.verdict === "not_a_vehicle").length === LOTS.length);
// 4. a lot read another way (a row handed straight to the card) still shows no number
for (const l of LOTS) { const m = await S.listingMarket({ supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" }, l, { miles: null }, {}); ok(`${l.label}: a card read directly shows no Market Check number`, m && m.kind === "refused" && /may not be a whole car/.test(String(m.refusalLine)), m && JSON.stringify([m.kind, m.refusalLine])); }
// 5. one doubtful lot (one real signal, no identity gap closed): kept and marked, no number
{ const d = { id: 9201, source: "bringatrailer", listing_title: "1965 Shelby Cobra With Trailer", make: "Shelby", model: "Cobra", year: 1965, mileage: 3000, vin_norm: null, description: "" }; all.push(d);
  const r2 = await S.liveRows({ supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" }, "id=gt.0", { allScope: true, noDescription: true }), kept = (r2 || []).find(r => r.id === 9201);
  ok("a doubtful lot (the title names a trailer, no VIN) stays in the live rows, marked, with no number", !!kept && Array.isArray(kept._doubtful)); }
console.log(fail ? `nonVehicleCheck: ${fail} failure(s)` : "nonVehicleCheck: all pass");
process.exit(fail ? 1 : 0);
