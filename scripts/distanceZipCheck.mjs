// DISTANCE AND YEAR CHECK (Lane B, Nov 2026, Lane E's live pill sweep). THE CLASS: a Find / Buy search that names a distance.
//   (1) A city (or a place the search resolves) with "within N miles" never asks "Which zip should I use?": the search found a centre and cut to it. A zip is asked only when no centre was found (near me, no place, a state, a place the table does not know).
//   (2) When the asked year has no cars in range, the cars shown for other years carry the engine's stated reason (meta.near: asked year, the years shown, the sentence with the place and the distance); a card for another year with no stated reason fails;
//       when no other year is in range either, none are shown and the sentence says so. A buyer never reads a 1964 car as a match for a 1965 request.
//   node scripts/distanceZipCheck.mjs          (ROOT=<tree> runs it against another tree to show it fails there)
// clock: real-ok every date in the fixture is relative to the one now read at the top (days ahead), so the verdict does not change with the day
import path from "node:path"; import { pathToFileURL } from "node:url";
const ROOT = process.env.ROOT ? path.resolve(process.env.ROOT) : path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const SM = await imp("lib/live/samChat.js");
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const have = (name, fn) => { ok(`the engine exports ${name}`, typeof fn === "function"); return typeof fn === "function"; };

// ---- (1) the zip question, over every query shape. located is the search's own fact (a centre found); kind is the turn's outcome.
// shape: [text, placeInWords (the place the buyer named, resolved by the search), expectAsk]
const SHAPES = [
  ["A 1965 Chevrolet Corvette within 500 miles of Chicago", "Chicago", false],
  ["1965 Corvette within 200 miles of Boston", "Boston", false],
  ["Porsche 911 within 150 miles of New York", "New York", false],
  ["Ferrari 250 within 150 miles of Los Angeles", "Los Angeles", false],
  ["a Mustang within 100 miles of chicago", "Chicago", false],
  ["1967 Camaro within 100 miles of Oconomowoc", "Oconomowoc", false],
  ["1965 Corvette within 200 mi of 60601", "60601", false],
  ["1965 Corvette within 300 miles of Texas", null, true],       // a state has no centre: the radius cannot be applied, the zip is the honest question
  ["1965 Corvette near me", null, true],
  ["Ferrari within 100 miles", null, true],
  ["1965 Corvette within 100 miles of me", null, true],
  ["closest 1965 Corvette", null, true]
];
const hasAsk = have("asksZipAfterSearch", SM.asksZipAfterSearch), hasNames = have("placeNamedIn", SM.placeNamedIn);
const geo = await imp("lib/live/converse.js");
for (const [text, place, expectAsk] of SHAPES) {
  const centreFound = !!place && (/^\d{5}$/.test(place) || !!(geo.placeAny && geo.placeAny(place)));   // the search finds a centre for a resolved place or a zip
  const ask = hasAsk ? SM.asksZipAfterSearch(text, { zip: null, located: centreFound, kind: "search" }) : null;
  ok(`first turn: "${text}" ${expectAsk ? "asks for a zip (no centre)" : "does not ask for a zip (centre found: " + place + ")"}`, ask === expectAsk, "got ask=" + ask);
  if (SM.needsZip) {
    const second = SM.needsZip(text, { zip: null, prevFilters: { make: "Chevrolet" } });
    ok(`later turn: "${text}" ${expectAsk ? "asks" : "does not ask"} before the search`, second === expectAsk || (expectAsk && second === false && /\bTexas\b/.test(text)), "got " + second);   // a state falls through to the search, which then asks (the first-turn rule above)
  }
}
ok("a zip the buyer already gave is never asked again", hasAsk && SM.asksZipAfterSearch("near me", { zip: "60601", located: false, kind: "search" }) === false);
ok("a refinement turn is never given the zip ask", hasAsk && SM.asksZipAfterSearch("near me", { zip: null, located: false, kind: "refinement" }) === false);

// ---- (2) the year: a fake live feed, 1965 Corvettes far from Chicago, 1964 and 1966 Corvettes near it.
const day = 864e5, nowMs = Date.now();
const live = (id, year, loc) => ({ id, source: "bringatrailer", source_listing_id: "s" + id, url: "https://x/" + id, listing_title: `${year} Chevrolet Corvette`, make: "Chevrolet", model: "Corvette", year, vin_norm: null, mileage: 40000, body: null, transmission: "4-Speed Manual", description: null,
  location: loc, country: "US", currency: "USD", current_bid: 50000, current_bid_usd: 50000, end_time: new Date(nowMs + day * id).toISOString(), photo_url: "https://img.example/" + id + ".jpg", last_seen_at: new Date(nowMs).toISOString(), first_seen_at: new Date(nowMs - day).toISOString() });
const FEEDS = {
  nearOtherYears: [live(1, 1964, "Chicago, IL"), live(2, 1966, "Naperville, IL"), live(3, 1965, "Los Angeles, CA"), live(4, 1965, "Seattle, WA")],
  noneInRange: [live(5, 1965, "Los Angeles, CA"), live(6, 1966, "Seattle, WA")],
  exactYearHere: [live(7, 1965, "Chicago, IL"), live(8, 1964, "Naperville, IL")]
};
let feed = FEEDS.nearOtherYears;
globalThis.fetch = async (url) => { const u = new URL(String(url)); return new Response(u.pathname.endsWith("/live_listings") ? JSON.stringify(feed) : "[]", { status: 200 }); };
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
const P = { make: "Chevrolet", model: "Corvette", year_min: 1965, year_max: 1965, location: "Chicago", radius_miles: 500 };
const yearsOf = sr => [...new Set((sr.matches || []).map(x => Number(x.r.year)))].sort();
const SE = await imp("lib/live/search.js");   // a tree without nearNoteFor composes the sentence the way the turn did before: nearLine on the noun alone
if (typeof SM.searchWithNearest === "function") {
  for (const [name, rows, expect] of [["1965 has none in range, 1964 and 1966 are", FEEDS.nearOtherYears, { near: true, shown: [1964, 1966] }], ["nothing in range for any nearby year", FEEDS.noneInRange, { near: true, shown: [] }], ["1965 cars are in range", FEEDS.exactYearHere, { near: false, shown: [1965] }]]) {
    feed = rows;
    const { sr, sr0, near } = await SM.searchWithNearest(env, P);
    const shown = yearsOf(sr), other = shown.filter(y => y !== 1965);
    ok(`${name}: the cars shown are ${JSON.stringify(expect.shown)}`, JSON.stringify(shown) === JSON.stringify(expect.shown), "shown " + JSON.stringify(shown));
    ok(`${name}: ${expect.near ? "the engine states why other years are shown (near)" : "no near statement (the asked year is here)"}`, !!near === expect.near, JSON.stringify(near && { asked: near.asked, years: near.years }));
    if (other.length) ok(`${name}: every year shown besides 1965 is named in near.years`, !!near && other.every(y => near.years.includes(y)), JSON.stringify({ other, near: near && near.years }));   // a card for another year with no stated reason fails here
    if (near) {
      const line = typeof SM.nearNoteFor === "function" ? SM.nearNoteFor({ near, f: sr.f, p: P, abroadHidden: sr.abroadHidden || 0, center: sr.center, radius: sr.radius, placeName: sr.placeName, sr0 }) : SE.nearLine(near, near.noun || "Corvettes", sr.abroadHidden || 0);
      ok(`${name}: the sentence says the asked year has none within the distance, with the place`, /^No 1965 .*Corvettes are live within 500 miles of Chicago/.test(line), line);
      if (other.length) ok(`${name}: the sentence names the years shown`, other.every(y => line.includes(String(y))), line);
      if (!other.length) ok(`${name}: with no other year in range the sentence says none from 1964 or 1966 either`, /none from 1964 or 1966 either/.test(line), line);
      if (sr0 && sr0.beyond && sr0.beyond.count) ok(`${name}: the sentence says how many of the asked year are further away`, new RegExp(`${sr0.beyond.count} (is|are) further away`).test(line), line);
      ok(`${name}: no dash in the sentence`, !/[–—]/.test(line));
    }
  }
}
console.log(failed ? `distanceZipCheck: ${failed} FAIL` : "distanceZipCheck: PASS");
process.exit(failed ? 1 : 0);
