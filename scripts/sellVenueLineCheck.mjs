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
  ["30 sales, normal pick", pool(30, [{ ...BAT, sales: 20 }, { ...CB, sales: 10 }]), 0, {}, "Most 993 Carrera sales at auction were on Bring a Trailer, 20 of 30 in the last 12 months."],
];
for (const [what, pl, i, opts, want] of cases) {
  const got = await run(pl, pl.places[i], opts); out[what] = got;
  ok(got === want, `${what}: ${JSON.stringify(want)} (got ${JSON.stringify(got)})`);
  ok(!/[–—]/.test(got || "") && !/\b(venues|sources|sites) (exist|in all)\b|\b\d+ venues\b|\b(fifteen|15) (venues|sites)\b/i.test(got || ""), `${what}: no dash, never how many venues`);
}
{ const pl = pool(9, [{ ...BAT, sales: 6 }, { ...CB, sales: 3 }]); ok((await pickFacts({}, car, pl, pl.places[0], {})).why === "Most 993 Carrera sales at auction were on Bring a Trailer, six of nine in the last 12 months.", "counts of ten or under in words"); }
// The landing example (no venue named).
{ const pl = pool(1, [{ ...BAT, sales: 1 }]); ok((await pickFacts({}, car, pl, pl.places[0], {})).whyAnon === "The one sale in the last 12 months was on an auction site. One sale is too few to compare venues.", "one sale, venue unnamed"); }
{ const pl = pool(2, [{ ...RM, sales: 2 }]); ok((await pickFacts({}, car, pl, pl.places[0], {})).whyAnon === "Both sales in the last 12 months were at the same auction house. Two sales are too few to compare venues.", "two sales at one house, venue unnamed"); }
if (process.argv.includes("--print")) for (const [k, v] of Object.entries(out)) console.log(k.padEnd(48), v);
console.log(`sellVenueLineCheck: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
