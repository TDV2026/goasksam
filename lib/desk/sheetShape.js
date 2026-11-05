// DESK VALUATIONS: the sheet's fixed shapes and the sheetRead fixtures (Lane E, Nov 4 2026; docs/desk-valuations-spec.md).
// THE sheetRead OBJECT (what Lane B's one sheet read call returns for a VIN or year make model plus mileage, and a tier when the expert clicked one). The page prints it and computes nothing,
// not even the starting figure. Until Lane B's call lands (lib/desk/sheetRead.js readSheet) the fixtures below stand in; they define the shape.
//   version, readAt, frozen            the read's own stamp; frozen is true once a sheet is finalised
//   car        { vin, label, decode:{year,make,model,trim,body,source:"vin"|"typed"}, mileage:{value,source:"submission"|"asked"|null, ask}, gearbox, colour, prior:{colour,gearbox,mileage,lastSaleDate}|null }
//   exact      { appearances:[{date,venue,outcome:"sold"|"not_met",price,highBid,url}], none }     none is the engine's line when there are no appearances ("No prior auction record for this VIN.")
//   market     { window:{months,stated,fallback}, count, median, p25, p75, newest, splits:[{dimension,options:[{label,count,median,p25,p75}]}], live:[{venue,bid,endsAt,title,url}],
//                startingFigure|null, startingNote, comparables:[{date,venue,price,mileage,tier,url,title}], wider:{low,high,count}|null }
//   condition  { tiers:[{tier,label,count}], untiered, selected:null|1..4, sameTierCount, tooFew, tooFewLine }
//   coverage   { footer, methodology }          the engine's coverage and methodology lines
// Section 4's tier click asks the engine again with {tier}; the answer is a whole new sheetRead (sections 3 and 4 re-filtered).

export const SECTIONS = [
  { n: 1, key: "car", title: "The car" },
  { n: 2, key: "exact", title: "This exact car" },
  { n: 3, key: "market", title: "The market" },
  { n: 4, key: "condition", title: "Condition" },
  { n: 5, key: "cannot", title: "What we cannot see" },
  { n: 6, key: "decision", title: "Decision" },
  { n: 7, key: "finalise", title: "Finalise" }
];
export const STATUSES = ["New", "In progress", "Finalised", "Sent", "Needs the car"];
export const CHECKLIST = [
  { key: "title", label: "Title status", choices: null },
  { key: "service", label: "Service records", choices: null },
  { key: "ownership", label: "Ownership history", choices: null },
  { key: "modifications", label: "Modifications", choices: ["Stock", "Period", "Modified", "Restomod"] },
  { key: "accident", label: "Accident or repair history", choices: null },
  { key: "provenance", label: "Provenance", choices: null }
];
export const CHECK_STATES = ["Seen", "Not seen", "Not supplied"];
export const REASONS = [
  { key: "documentation", label: "Documentation" },
  { key: "modifications", label: "Modifications or non original parts" },
  { key: "condition", label: "Condition better or worse than the tier on close inspection" },
  { key: "provenance", label: "Provenance or history" },
  { key: "market_movement", label: "Recent market movement not yet in the sales" },
  { key: "other", label: "Other" }
];
export const TIER_LABELS = { 1: "Concours", 2: "Excellent", 3: "Good", 4: "Fair" };
export const DEFAULT_THRESHOLD = 0.15;

const cmp = (date, venue, price, mileage, tier, n) => ({ date, venue, price, mileage, tier, url: "https://example.test/sale/" + n, title: "2008 Porsche 911 Carrera S" });
const POOL = [
  cmp("2026-10-18", "Bring a Trailer", 71500, 24100, 2, 1), cmp("2026-10-02", "Cars & Bids", 64000, 41800, 3, 2), cmp("2026-09-20", "Bring a Trailer", 68200, 29900, 2, 3),
  cmp("2026-09-05", "PCarMarket", 58900, 52300, 3, 4), cmp("2026-08-21", "Bring a Trailer", 74000, 18700, 1, 5), cmp("2026-08-02", "Cars & Bids", 61200, 38800, 3, 6),
  cmp("2026-07-19", "Bring a Trailer", 66900, 31400, 2, 7), cmp("2026-07-01", "PCarMarket", 49500, 71200, 4, 8), cmp("2026-06-14", "Cars & Bids", 63800, 36500, 3, 9),
  cmp("2026-05-30", "Bring a Trailer", 69900, 27300, 2, 10), cmp("2026-05-11", "Bring a Trailer", 56000, 58400, 3, 11), cmp("2026-04-22", "Cars & Bids", 65500, 33900, 2, 12),
  cmp("2026-04-03", "Bring a Trailer", 52000, 66800, 4, 13), cmp("2026-03-15", "PCarMarket", 62400, 40100, 3, 14), cmp("2026-02-27", "Bring a Trailer", 70800, 25600, 2, 15),
  cmp("2026-02-08", "Cars & Bids", 54500, 61700, 3, 16), cmp("2026-01-20", "Bring a Trailer", 60300, 44500, 3, 17), cmp("2025-12-12", "PCarMarket", 51200, 69900, 4, 18)
];
const pick = (xs, f) => xs.filter(f);
const med = xs => { const s = xs.map(x => x.price).sort((a, b) => a - b), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
const q = (xs, p) => { const s = xs.map(x => x.price).sort((a, b) => a - b); return s[Math.max(0, Math.min(s.length - 1, Math.round((s.length - 1) * p)))]; };
// the fixtures are built here, once, the way the engine would: the numbers are the engine's, the page only prints them

// The 2002 BMW M3 Convertible of the Hagerty demo (Nov 5 2026): a realistic E46 pool in which tier 3 is deep (7 sales) and tiers 1 and 4 are thin, so one sheet shows both a starting figure and "too few sales in this condition".
const m3 = (date, venue, price, mileage, tier, n) => ({ date, venue, price, mileage, tier, url: "https://example.test/sale/m3-" + n, title: "2002 BMW M3 Convertible" });
const M3_POOL = [
  m3("2026-10-24", "Bring a Trailer", 36500, 47800, 2, 1), m3("2026-10-09", "Cars & Bids", 27800, 88200, 3, 2), m3("2026-09-26", "Bring a Trailer", 25400, 101500, 3, 3),
  m3("2026-09-11", "Bring a Trailer", 33900, 58300, 2, 4), m3("2026-08-29", "Cars & Bids", 23100, 112400, 3, 5), m3("2026-08-14", "PCarMarket", 29200, 79600, 3, 6),
  m3("2026-07-30", "Bring a Trailer", 45800, 14900, 1, 7), m3("2026-07-12", "Cars & Bids", 24600, 96100, 3, 8), m3("2026-06-27", "Bring a Trailer", 31800, 61700, 2, 9),
  m3("2026-06-08", "Bring a Trailer", 26900, 93400, 3, 10), m3("2026-05-17", "Cars & Bids", 15800, 138200, 4, 11), m3("2026-04-25", "Bring a Trailer", 22700, 104800, 3, 12),
  m3("2026-04-02", "PCarMarket", 14300, 151000, 4, 13), m3("2026-03-14", "Bring a Trailer", 28400, 84900, 3, 14)
];
export const FIXTURE_VINS = {
  WBSBR93422EX21856: { label: "2002 BMW M3 Convertible", decode: { year: 2002, make: "BMW", model: "M3", trim: "Convertible", body: "Convertible", source: "vin" }, mileage: 96702, gearbox: "Manual", colour: "Laguna Seca Blue", prior: { colour: "Laguna Seca Blue", gearbox: "Manual", mileage: 88100, lastSaleDate: "2023-09-21" },
    appearances: [{ date: "2023-09-21", venue: "Bring a Trailer", outcome: "sold", price: 24500, highBid: null, url: "https://example.test/bat/m3-1" }], pool: M3_POOL },
  WP0AB29918S745123: { label: "2008 Porsche 911 Carrera S", decode: { year: 2008, make: "Porsche", model: "911", trim: "Carrera S", body: "Coupe", source: "vin" }, mileage: 33500, gearbox: "Manual", colour: "Guards Red", prior: { colour: "Guards Red", gearbox: "Manual", mileage: 29800, lastSaleDate: "2021-05-14" },
    appearances: [{ date: "2021-05-14", venue: "Bring a Trailer", outcome: "sold", price: 52500, highBid: null, url: "https://example.test/bat/1" }, { date: "2019-08-02", venue: "Cars & Bids", outcome: "not_met", price: null, highBid: 44000, url: "https://example.test/cab/1" }], pool: POOL },
  WP0CA29974S650321: { label: "2007 Porsche 911 Turbo", decode: { year: 2007, make: "Porsche", model: "911", trim: "Turbo", body: "Coupe", source: "vin" }, mileage: null, gearbox: "Manual", colour: "Basalt Black", prior: null, appearances: [], pool: POOL.slice(0, 6).map(c => ({ ...c, title: "2007 Porsche 911 Turbo" })) }
};
export function fixtureRead(input = {}, now = "2026-11-04T12:00:00Z") {
  const vin = String(input.vin || "").toUpperCase(), f = FIXTURE_VINS[vin];
  if (!f) return null;
  const miles = input.mileage != null && Number(input.mileage) > 0 ? Number(input.mileage) : f.mileage;
  const tier = [1, 2, 3, 4].includes(Number(input.tier)) ? Number(input.tier) : null;
  const all = f.pool, same = tier ? pick(all, c => c.tier === tier) : [];
  const counts = [1, 2, 3, 4].map(t => ({ tier: t, label: TIER_LABELS[t], count: all.filter(c => c.tier === t).length }));
  const tooFew = !!tier && same.length < 5;
  const set = tier && !tooFew ? same : all;
  return {
    version: 1, readAt: now, frozen: false,
    car: { vin, label: f.label, decode: f.decode, mileage: miles ? { value: miles, source: input.mileage ? "asked" : "submission", ask: null } : { value: null, source: null, ask: "Mileage was not in the submission. Enter it to read the market around it." }, gearbox: f.gearbox, colour: f.colour, prior: f.prior },
    exact: { appearances: f.appearances, none: f.appearances.length ? null : "No prior auction record for this VIN." },
    market: {
      window: { months: 12, stated: "the last 12 months", fallback: false }, count: set.length, median: med(set), p25: q(set, 0.25), p75: q(set, 0.75), newest: set[0].date,
      splits: [{ dimension: "mileage band", options: [{ label: "Under 30,000 miles", count: pick(set, c => c.mileage < 30000).length, median: med(pick(set, c => c.mileage < 30000)), p25: q(pick(set, c => c.mileage < 30000), 0.25), p75: q(pick(set, c => c.mileage < 30000), 0.75) }, { label: "30,000 miles and over", count: pick(set, c => c.mileage >= 30000).length, median: med(pick(set, c => c.mileage >= 30000)), p25: q(pick(set, c => c.mileage >= 30000), 0.25), p75: q(pick(set, c => c.mileage >= 30000), 0.75) }] }],
      live: [{ venue: "Bring a Trailer", bid: 58000, endsAt: "2026-11-06T18:00:00Z", title: "2008 Porsche 911 Carrera S", url: "https://example.test/live/1" }],
      startingFigure: tier && !tooFew ? med(same) : null,
      startingNote: !tier ? "Pick a condition tier for a starting figure." : tooFew ? "Too few sales in this condition for a starting figure." : "The median of the sales in this condition and mileage band.",
      comparables: set.slice(0, 12), wider: tooFew ? { low: q(all, 0.25), high: q(all, 0.75), count: all.length } : null
    },
    condition: { tiers: counts, untiered: 2, selected: tier, sameTierCount: tier ? same.length : null, tooFew, tooFewLine: tooFew ? "Too few sales in this condition. The wider pool is shown." : null },
    coverage: { footer: "Sold results on eleven venues, since 2019. Private sales and condition are not in the record.", methodology: "Hammer prices, premiums backed out, median and quartiles, tier from each sale's own listing text." }
  };
}
