// Unknown-row classifier (Fix 4/5). Proposes a make + model for a sales_archive row filed
// make/model "Unknown" - OldCarsData ships no structured make/model for some sources (notably Bring a
// Trailer), so the identity lives only in the listing_title (and the VIN). PURE and OFFLINE: no vPIC,
// no OldCarsData, no network. The listing TITLE is the primary signal (every Unknown row has one); the
// VIN WMI is a corroborating/fallback signal. Returns { make, model, confidence: high|low|none, basis }.
//
// Fix 4 runs this DRY (read + report, no writes). Fix 5 (after approval) wires it into ingest as a
// fallback when OCD's structured fields are empty, and backfills the existing rows.
import { MAKE_ALIASES, PREWAR_MAKES, EXTRA_MAKES } from "./vehicleData.js";
import { isMemorabilia, isPartsListing } from "./_classify.js";

// Core collector marques (the set the Unknown rows actually span: BaT / Bonhams / Barrett-Jackson /
// RM / Mecum). Augmented by the curated aliases + prewar + extra makes. Multi-word phrases are matched
// before single tokens so "Aston Martin" / "Alfa Romeo" / "Land Rover" win over a bare token.
const CORE_MAKES = ["Ferrari", "Porsche", "Lamborghini", "Maserati", "Alfa Romeo", "Lancia", "Fiat", "Abarth",
  "Mercedes-Benz", "BMW", "Audi", "Volkswagen", "Aston Martin", "Jaguar", "Land Rover", "Range Rover",
  "Bentley", "Rolls-Royce", "Lotus", "McLaren", "Mini", "Triumph", "MG", "MGB", "MGA", "Austin-Healey",
  "Austin", "Morris", "Sunbeam", "Jensen", "TVR", "AC", "Bristol", "Ford", "Chevrolet", "GMC", "Cadillac",
  "Buick", "Pontiac", "Oldsmobile", "Dodge", "Plymouth", "Chrysler", "Jeep", "Ram", "Lincoln", "Mercury",
  "AMC", "Shelby", "Hudson", "Studebaker", "Nash", "Willys", "International", "Toyota", "Lexus", "Nissan",
  "Datsun", "Mazda", "Honda", "Acura", "Subaru", "Mitsubishi", "Suzuki", "Isuzu", "Infiniti", "Volvo",
  "Saab", "Peugeot", "Renault", "Citroen", "DeLorean", "De Tomaso", "Pagani", "Koenigsegg", "Bugatti",
  "Maybach", "Hummer", "Tesla", "Alpine", "Facel Vega", "Iso", "Bizzarrini", "Morgan", "Daimler", "Riley",
  "Vauxhall", "Opel", "Holden", "Ruf", "Alpina", "Rover", "Hillman", "Pierce-Arrow", "Cord", "Auburn"];

function buildMakeSet() {
  const set = new Map();   // lowercased phrase -> canonical make
  const add = (phrase, canon) => { const k = String(phrase || "").trim().toLowerCase(); if (k) set.set(k, canon || phrase); };
  for (const m of CORE_MAKES) add(m, m);
  for (const a of MAKE_ALIASES) { add(a.make, a.make); add(a.alias, a.make); }
  for (const m of PREWAR_MAKES) add(m, m);
  for (const m of EXTRA_MAKES) add(m, m);
  return set;
}
const MAKE_SET = buildMakeSet();
const MAKE_PHRASES = [...MAKE_SET.keys()].sort((a, b) => b.split(/\s+/).length - a.split(/\s+/).length || b.length - a.length);

// Minimal WMI -> make for the common collector marques (corroboration + fallback only; the title is
// primary). 3-char then 2-char prefix.
const WMI_MAKE = {
  ZFF: "Ferrari", ZFT: "Ferrari", ZHW: "Lamborghini", ZA9: "Lamborghini", ZAM: "Maserati", ZAR: "Alfa Romeo",
  SCF: "Aston Martin", SCE: "Aston Martin", SCG: "Aston Martin", SCB: "Bentley", SCA: "Rolls-Royce", SCC: "Lotus",
  SAJ: "Jaguar", SAL: "Land Rover", SAR: "Rover", SBM: "McLaren",
  WDB: "Mercedes-Benz", WDD: "Mercedes-Benz", WDC: "Mercedes-Benz", W1K: "Mercedes-Benz",
  WBA: "BMW", WBS: "BMW", WBY: "BMW", WAU: "Audi", TRU: "Audi", WUA: "Audi", WVW: "Volkswagen", WVG: "Volkswagen",
  JN1: "Nissan", JN6: "Nissan", JN8: "Nissan", JHM: "Honda", JH4: "Acura", JTH: "Lexus", JM1: "Mazda", JF1: "Subaru",
  "1G1": "Chevrolet", "1G6": "Cadillac", "1GC": "Chevrolet", "1GT": "GMC", "2G1": "Chevrolet", "1GY": "Cadillac",
  "1FA": "Ford", "1FT": "Ford", "1FM": "Ford", "1FD": "Ford", "2FA": "Ford", "1C4": "Jeep", "1C6": "Ram",
  "1C3": "Chrysler", "1B3": "Dodge", "2B3": "Dodge", "1J4": "Jeep", "1J8": "Jeep", "5LM": "Lincoln"
};
function wmiMake(vin) {
  const v = String(vin || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (v.length < 3) return null;
  return WMI_MAKE[v.slice(0, 3)] || null;
}

const BODY_WORDS = /\b(coupe|convertible|cabriolet|roadster|spyder|spider|sedan|saloon|hatchback|wagon|estate|targa|berlinetta|gts|gtb|fastback|hardtop|limousine|pickup|truck|suv|van)\b/i;

export function classifyUnknown({ listing_title, vin } = {}) {
  const title0 = String(listing_title || "").trim();
  // Never classify memorabilia / parts / automobilia as a car, even when the title carries a make
  // (a "Packard Acetylene Headlamps", a "Ferrari 1948-2000" book, a "Ford Neon Clock", a pedal
  // tractor). These stay Unknown - the backfill must not turn them into cars.
  if (isMemorabilia(title0) || isPartsListing(title0)) return { make: null, model: null, confidence: "none", basis: "memorabilia/parts/automobilia" };
  const vm = wmiMake(vin);
  // Normalize: strip a BaT mileage prefix ("48k-Mile", "4,500-Mile") and the FIRST model year.
  const t = title0
    .replace(/^\s*[\d,.]+\s*k?\s*-?\s*mile[s]?\b/i, "")
    .replace(/\b(?:18|19|20)\d{2}\b/, " ")
    .replace(/\s+/g, " ").trim();
  const lower = " " + t.toLowerCase() + " ";
  // Earliest-positioned known make phrase in the title.
  let bestMake = null, bestPos = Infinity, bestPhrase = null;
  for (const ph of MAKE_PHRASES) {
    const idx = lower.indexOf(" " + ph + " ");
    if (idx >= 0 && idx < bestPos) { bestPos = idx; bestMake = MAKE_SET.get(ph); bestPhrase = ph; }
  }
  const makeFromTitle = !!bestMake;
  const make = bestMake || vm || null;
  // Model = tokens right after the make phrase, up to a body/variant word or ~3 tokens.
  let model = null;
  if (bestPhrase) {
    const after = t.slice(bestPos + bestPhrase.length + 1).trim();
    const mBody = after.match(BODY_WORDS);
    const modelPart = (mBody && mBody.index > 0) ? after.slice(0, mBody.index) : after;
    const toks = modelPart.split(/\s+/).filter(Boolean).slice(0, 3);
    model = toks.join(" ").replace(/[.,]+$/, "").trim() || null;
  }
  const corroborated = !!(bestMake && vm && bestMake.toLowerCase() === vm.toLowerCase());
  let confidence = "none", basis = "no make in title or VIN";
  if (make && model) { confidence = makeFromTitle ? "high" : "low"; basis = corroborated ? "title+VIN agree" : (makeFromTitle ? "title" : "VIN WMI"); }
  else if (make) { confidence = "low"; basis = makeFromTitle ? "title make, no model token" : "VIN WMI make only"; }
  return { make, model, confidence, basis };
}
