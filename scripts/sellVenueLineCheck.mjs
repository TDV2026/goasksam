// The Sell pick card's venue line (Oct 2026, Lane C; lib/sell/sellFlow.js pickFacts): one or two sales say where they
// were, eight or more with no venue holding three say so, counts in words one to ten. No network: every read stubbed.
//   node scripts/sellVenueLineCheck.mjs [--print]
globalThis.fetch = async () => { throw new Error("no network in this check"); };
const { pickFacts } = await import("../lib/sell/sellFlow.js");
let fails = 0, passes = 0;
const ok = (c, what) => { if (c) passes++; else { fails++; console.log("FAIL  " + what); } };
const car = { v: { make: "Porsche", model: "911", year: 1995 }, generation: null };
const BAT = { name: "Bring a Trailer", slug: "bringatrailer", house: false }, CB = { name: "Cars & Bids", slug: "carsandbids", house: false }, RM = { name: "RM Sotheby's", slug: "rmsothebys", house: true };
const pool = (total, places) => ({ total, window_label: "in the last 12 months", cohort_name: "993 Carrera", places });
const run = async (pl, place, opts) => (await pickFacts({}, car, pl, place, opts)).why;
const out = {};
const cases = [
  ["one sale", pool(1, [{ ...BAT, sales: 1 }]), 0, {}, "The one sale in the last 12 months was on Bring a Trailer. One sale is too few to compare venues."],
  ["two sales, both on one", pool(2, [{ ...BAT, sales: 2 }]), 0, {}, "Both sales in the last 12 months were on Bring a Trailer. Two sales are too few to compare venues."],
  ["two sales, split", pool(2, [{ ...BAT, sales: 1 }, { ...CB, sales: 1 }]), 0, {}, "One of the two sales in the last 12 months was on Bring a Trailer. Two sales are too few to compare venues."],
  ["one sale at a house", pool(1, [{ ...RM, sales: 1 }]), 0, {}, "The one sale in the last 12 months was at RM Sotheby's. One sale is too few to compare venues."],
  ["five sales", pool(5, [{ ...BAT, sales: 3 }, { ...CB, sales: 2 }]), 0, {}, "Five sales in the last 12 months are too few to compare venues."],
  ["30 sales, no venue with three", pool(30, Array.from({ length: 15 }, (_, i) => ({ name: "Site " + i, slug: "s" + i, house: false, sales: 2 }))), 0, {}, "30 sales in the last 12 months, but no single venue has enough of them to compare."],
  ["nine sales, no venue with three", pool(9, [{ ...BAT, sales: 2 }, { ...CB, sales: 2 }, { name: "Site", slug: "s", sales: 2 }, { name: "Site 2", slug: "s2", sales: 2 }, { name: "Site 3", slug: "s3", sales: 1 }]), 0, {}, "Nine sales in the last 12 months, but no single venue has enough of them to compare."],
  ["30 sales, ASAP house with two (top venue has 20)", pool(30, [{ ...BAT, sales: 20 }, { ...CB, sales: 8 }, { ...RM, sales: 2 }]), 2, { asap: true }, "Of the auction houses where cars like this have sold, RM Sotheby's has the soonest sale coming up, and two of the 30 sales in the last 12 months were there."],
  // "at auction" is gone (Sam, Oct 13 2026): every sale on record is an auction, so it counted nothing.
  ["30 sales, normal pick", pool(30, [{ ...BAT, sales: 20 }, { ...CB, sales: 10 }]), 0, {}, "Most 993 Carrera sales were on Bring a Trailer, 20 of 30 in the last 12 months."],
  ["30 sales, house is the top venue", pool(30, [{ ...RM, sales: 20 }, { ...BAT, sales: 10 }]), 0, {}, "Most 993 Carrera sales were at RM Sotheby's, 20 of 30 in the last 12 months."],
  ["30 sales, under half at the pick", pool(30, [{ ...BAT, sales: 12 }, { ...CB, sales: 10 }, { ...RM, sales: 8 }]), 0, {}, "993 Carrera sales were on Bring a Trailer more than anywhere else, 12 of 30 in the last 12 months."],
];
for (const [what, pl, i, opts, want] of cases) {
  const got = await run(pl, pl.places[i], opts); out[what] = got;
  ok(got === want, `${what}: ${JSON.stringify(want)} (got ${JSON.stringify(got)})`);
  ok(!/[–—]/.test(got || "") && !/\b(venues|sources|sites) (exist|in all)\b|\b\d+ venues\b|\b(fifteen|15) (venues|sites)\b/i.test(got || ""), `${what}: no dash, never how many venues`);
}
{ const pl = pool(9, [{ ...BAT, sales: 6 }, { ...CB, sales: 3 }]); ok((await pickFacts({}, car, pl, pl.places[0], {})).why === "Most 993 Carrera sales were on Bring a Trailer, six of nine in the last 12 months.", "counts of ten or under in words"); }
// No sell-through percentage anywhere on the card (Sam, Oct 13 2026): the day box is gone, and no box prints a "%".
{ const pl = pool(30, [{ ...BAT, sales: 20 }, { ...CB, sales: 10 }]); const pf = await pickFacts({}, car, pl, pl.places[0], {}); ok(!pf.boxes.some(b => b.key === "day" || /%/.test(`${b.head} ${b.line} ${b.words}`)), "no day box, no percentage on any box"); }
// A research Task names the car as typed (lib/tasks/tasks.js researchCar), never "that car".
{ const { summaryFor } = await import("../lib/tasks/tasks.js");
  ok(summaryFor("research", { make: "Land Rover", model: "Defender", trim: "110", year_min: 1997, year_max: 1997 }) === "Sam is researching the 1997 Land Rover Defender 110: its auction history and what cars like it sold for.", "research read-back names the typed car");
  ok(summaryFor("research", { make: "Porsche", model: "911", generation: "993", trim: "Carrera" }) === "Sam is researching the Porsche 993 Carrera: its auction history and what cars like it sold for.", "research read-back, a 911 generation stands for the model");
  ok(summaryFor("research", { vin: "WP0AB2A94MS223093" }) === "Sam is researching the car with VIN WP0AB2A94MS223093: its auction history and what cars like it sold for.", "research read-back by VIN"); }
// The landing example (no venue named).
{ const pl = pool(1, [{ ...BAT, sales: 1 }]); ok((await pickFacts({}, car, pl, pl.places[0], {})).whyAnon === "The one sale in the last 12 months was on an auction site. One sale is too few to compare venues.", "one sale, venue unnamed"); }
{ const pl = pool(2, [{ ...RM, sales: 2 }]); ok((await pickFacts({}, car, pl, pl.places[0], {})).whyAnon === "Both sales in the last 12 months were at the same auction house. Two sales are too few to compare venues.", "two sales at one house, venue unnamed"); }
// No pick, sales on record (Lane D, Oct 17 2026, lib/sell/sellFlow.js noPickLine): the 1966 Ferrari 275 GTB's live shape (nine
// sales, RM Sotheby's 5, Gooding 3, Broad Arrow 1, all houses, window "since January 2022") prints Market Check's own sentence;
// a pool the pick could not place prints its count; an empty pool prints nothing (the "has not seen" line stays for it).
{ const { noPickLine } = await import("../lib/sell/sellFlow.js");
  const GD = { name: "Gooding & Co", slug: "gooding", house: true }, BA = { name: "Broad Arrow", slug: "broadarrow", house: true };
  const gtb = { total: 9, window_label: "since January 2022", places: [{ ...RM, sales: 5 }, { ...GD, sales: 3 }, { ...BA, sales: 1 }], others: [] };
  const want = "All nine sold at the auction houses, none online.";
  ok(noPickLine(gtb) === want, `275 GTB, nine house sales: ${JSON.stringify(want)} (got ${JSON.stringify(noPickLine(gtb))})`);
  out["no pick, nine house sales (275 GTB)"] = noPickLine(gtb);
  ok(noPickLine({ ...gtb, total: 14, places: [{ ...RM, sales: 9 }, { ...GD, sales: 5 }] }) === "All 14 sold at the auction houses, none online.", "no pick, 14 house sales: digits from 11");
  // The dated form (Sam, Oct 17 2026): the basis line's "the latest in {Month Year}", never a month count; the date is the newest row's.
  ok(noPickLine({ ...gtb, places: [{ ...RM, sales: 5 }, { ...GD, sales: 3 }], others: [{ name: "Car & Classic", sales: 1 }] }, "2026-08-15") === "Nine sales, the latest in August 2026, none on a site Sam can point to.", "no pick, a fourth venue unaccounted for: never 'all at the houses', dated by the newest row");
  ok(noPickLine({ ...gtb, places: [{ ...RM, sales: 5, last_sale: { date: "2026-08-15" } }, { ...GD, sales: 3, last_sale: { date: "2025-01-20" } }], others: [{ name: "Car & Classic", sales: 1 }] }) === "Nine sales, the latest in August 2026, none on a site Sam can point to.", "no date handed in: the newest last_sale among the places");
  ok(noPickLine({ ...gtb, places: [{ ...RM, sales: 5 }], others: [{ name: "Car & Classic", sales: 4 }] }) === "Nine sales, none on a site Sam can point to.", "no date anywhere: no date clause, never invented");
  ok(noPickLine({ total: 3, window_label: "in the last 12 months", places: [{ name: "Car & Classic", slug: "carandclassic", house: false, sales: 3 }], others: [] }, "2026-03-02") === "Three sales, the latest in March 2026, none on a site Sam can point to.", "no pick, sales on a site the pick cannot use; no month count even when the window has one");
  ok(noPickLine({ total: 1, window_label: "in the last 12 months", places: [{ name: "Collecting Cars", slug: "collectingcars", house: false, sales: 1 }], others: [] }, "2025-12-30") === "One sale, the latest in December 2025, none on a site Sam can point to.", "no pick, one sale: singular");
  ok(noPickLine({ total: 23, places: [{ ...BAT, sales: 0 }], others: [{ name: "Car & Classic", sales: 23 }] }, "2026-10-01") === "23 sales, the latest in October 2026, none on a site Sam can point to.", "digits from 11");
  for (const l of [noPickLine(gtb), noPickLine({ ...gtb, total: 3, places: [{ ...BAT, sales: 3 }] }, "2026-08-15")]) ok(!/\b\d+ months?\b|twelve months|two years/i.test(l || ""), "no month count in any count line");
  ok(noPickLine({ total: 0, places: [], others: [] }) === null && noPickLine(null) === null, "empty pool: no line (the has-not-seen line stays)");
  for (const l of [noPickLine(gtb), noPickLine({ ...gtb, total: 14 })]) ok(!/[\u2013\u2014]/.test(l || ""), "no dash in the count line"); }
// The engine decides whether a range exists (Sam, Oct 18 2026, decision 2): Sell's own middle halves render only when the
// engine's answer carries a cluster. The 275 GTB's thin shape (nine house sales, a low and a high in thin.span, no cluster)
// has no range; a result tier with a cluster has one; a result tier of eight or more too spread out for a cluster has none.
{ const { engineHasRange } = await import("../lib/sell/sellFacts.js");
  ok(engineHasRange({ tier: "thin", thin: { n: 9, span: [250000, 3000000] }, qualifyingTotal: 9 }) === false, "275 GTB thin tier: no range on Sell, whatever low and high the engine carries");
  ok(engineHasRange({ tier: "result", poolN: 14, cluster: [23500, 35500], windowMonths: 12 }) === true, "M3 Coupe result tier with a cluster: the range stands");
  ok(engineHasRange({ tier: "result", poolN: 12, cluster: null }) === false && engineHasRange({ cluster: [0, 0] }) === false && engineHasRange(null) === false && engineHasRange({}) === false, "eight or more too spread out, or no answer: no range"); }
if (process.argv.includes("--print")) for (const [k, v] of Object.entries(out)) console.log(k.padEnd(48), v);
console.log(`sellVenueLineCheck: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
