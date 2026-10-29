import crypto from "node:crypto";
import { familyFetchTerms, familyBadgeMatch } from "./modelFamilies.js";
import { marketSpecEntryFor, classifyRecordSpec, recordConflictsWithSearch } from "./marketSpec.js";
import { isHouseSource, hammerUsd, ensureFxReady, sourceSlugOf } from "./_houseComps.js";
import { supabaseSelectAll } from "./_supabase.js";
// Record classification against a searched vehicle, plus the small record and
// text utilities the classifier and its callers share. classifyRecord returns
// both the persisted classification columns and in-memory ladder signals.

export function asText(value) {
  return String(value || "").trim();
}

// Parts / automobilia guard (Sep 2026). OldCarsData passes NO category or listing-type
// field (verified: raw_record has none), yet BaT and the auction houses list parts and
// automobilia UNDER the car's make/model (a "Lamborghini Murcielago 6.2L V12 Engine",
// "Porsche 911 Type 911/93 2.7L Engine", "18x8 Wheels for Porsche", removable hardtops,
// tool kits), each carrying a real car model field ("911", "964", "Murcielago") - so a
// $7,500 seat lands in the car pool and drags the span floor / cluster. Heuristic, applied
// at BOTH ingest and pool assembly so nothing already in the archive leaks:
//   a part-noun in the title, AND no 4-digit model year in the title (every real car
//   listing carries a year, e.g. "2010 Lamborghini..."; a part almost never does), AND no
//   mileage (a driven car has mileage; a part is 0/blank). All three must hold, so a real
//   car is never excluded (it has a year).
const PARTS_LEXICON = /\b(wheels?|hard\s?top|soft\s?top|(?<!mid[-\s])(?<!rear[-\s])(?<!front[-\s])(?<!twin[-\s])(?<!dual[-\s])engine|transmission|gearbox|carburet\w+|manifold|differential|camshaft|cylinder\s?(?:head|block)|seats?|steering\s?wheel|literature|brochure|poster|memorabilia|tool\s?kit|body\s?shell|gauge|emblem|hubcaps?|knock[-\s]?off|spare\s?wheel|tonneau|neon\s?sign|coffee\s?table|cover\s?set|car\s?cover|seat\s?covers?)\b/i;
// A component that names its fitment year(s) ("Transaxle for 1965-1966 911", "Door
// Handles 1968-1969", "Engine Case for 1968 911 S") used to slip past the parts filter
// because the year-guard read the fitment year as a model year and returned "not parts".
// A STRONG part token plus fitment phrasing (a "for YYYY" clause or a YYYY-YYYY range) is
// unambiguously a part regardless of the year. Sep 2026, from the Desk air-cooled 911 pool.
const STRONG_PART = /\b(transaxle|engine\s?case|gearbox\s?case|crankcase|cylinder\s?(?:head|block)|door\s?handles?|(?:horn|bar|high\s?bar)\s?grilles?|grilles?|hubcaps?|carburet\w+|manifold|differential|camshaft)\b/i;
const FITMENT = /\bfor\s+(?:the\s+)?(?:19|20)\d{2}\b|\b(?:19|20)\d{2}\s*[–—-]\s*(?:19|20)\d{2}\b/i;
// A fitment-phrased parts LOT: a part noun immediately before "for" + a specific car ("BBS Wheels
// for 2005-2006 Ford GT", "Seats for a 1990 911", "Engine for the 356"). A part + "for" + a year or
// a named make/model is a parts listing regardless of the year in the title; a real car is never
// titled "{part} for {car}". Requiring year/the/a/capital after "for" avoids "wheels for track use".
const PARTS_FOR = /\b(wheels?|tyres?|tires?|rims?|seats?|engines?|motors?|transmissions?|gearbox(?:es)?|hard\s?tops?|soft\s?tops?|hoods?|bonnets?|bumpers?|fenders?|doors?|dashboards?|steering\s?wheels?|exhausts?|manifolds?|body\s?kits?|spoilers?|wings?|grilles?|badges?|emblems?|panels?|mirrors?|headlights?|taillights?|gauges?|clusters?|carburet\w+)\s+for\s+(?:the\s+|a\s+|an\s+)?(?:19|20)\d{2}\b/i;
// A title that is NEVER a car, whatever year or mileage it carries. A real car is never
// listed AS a "Belly Pans", "Deck Lid", "Tool Roll", "Workshop Manuals" or "Parts List" -
// these are the parts/automobilia that named a donor-car YEAR and so slipped the year-guard
// (a $600 "Fiberglass Belly Pans for 300SL Gullwing", a $2,000 "1959 300SL Aluminum Deck Lid",
// a $3,000 "Refurbished 1957 300SL Tool Roll & Tools"), surfacing as a car's displayed floor.
// Sep 2026, from the 300SL pool. Checked FIRST, unconditionally.
const DEFINITE_PART = /\b(factory\s+blueprints?|blueprints?\s+(?:set|for|of)|belly\s?pans?|deck\s?lids?|trunk\s?lids?|boot\s?lids?|tool\s?rolls?|tool\s?trays?|(?:workshop|instruction|owner'?s?|driver'?s?|service|shop|repair|parts?)\s+manuals?|(?:spare\s+)?parts?\s+(?:list|lists|catalogue?s?|book|books)|sales\s+brochures?|wiring\s+harness(?:es)?|alumin(?:i)?um\s+(?:deck|hood|bonnet|door|body|trunk|panel)s?)\b/i;
export function isPartsListing(title, mileage) {
  const t = asText(title);
  if (!t) return false;
  // Never-a-car titles (belly pans, deck lids, tool rolls, manuals, parts lists): parts outright.
  if (DEFINITE_PART.test(t)) return true;
  // Fitment-phrased parts lot ("Wheels for 2005-2006 Ford GT") - a part regardless of the year.
  if (PARTS_FOR.test(t)) return true;
  const yearPresent = /\b(18|19|20)\d{2}\b/.test(t);   // a pre-1900 car has a year too (the 1899 Locomobile "Spindle-Seat Runabout" was read as a year-less seat)
  // Fitment-phrased or year-less strong-part titles are parts even with a year in them.
  if (STRONG_PART.test(t) && (FITMENT.test(t) || !yearPresent)) return true;
  if (yearPresent) return false;                              // otherwise a model year => a real car
  const mi = mileage == null || mileage === "" ? null : Number(String(mileage).replace(/[^\d.]/g, ""));
  if (!(mi === null || mi === 0)) return false;               // a driven car has mileage; a part is 0/blank
  return PARTS_LEXICON.test(t);
}

// NON-VEHICLE LOTS: ONE FUNCTION FOR EVERY SURFACE (Lane B, Oct 29 2026, a Hagerty ENGINE for sale drew a Find card as "1986 Porsche 911" with a Market Check line). The older guard above (isPartsListing) reads the title only and
// treats a title with a model year as a real car, so "1986 Porsche 911 ... Engine" (the donor car's year) slipped through. This reads the real signals together and is conservative:
//   a lot is NOT A VEHICLE only when two real signals agree; a lot with one part or non-car signal is DOUBTFUL (kept, listed for Sam, shown with no number); anything else is a car.
//   signals: title_part      the title names a part or non-car noun (engine, transmission, wheels, literature, a sign, a trailer...), whatever year it carries;
//            description_part the first words of the description name such a noun and the description says nothing a car's does (odometer, miles, interior, VIN, paint, drives...);
//            no_identity     no odometer reading AND no VIN (a driven car has one or the other; weak alone, a house classic can have neither);
//            source_type     the source's own vehicle_type, when the feed carries it, is not "car".
// Never deleted: the verdict is computed where the lot is read (live rows, sales pools) and listed by the ops task nonvehicle with its reasons, so it is reversible by changing this function.
const NV_NOUN = /\b(?<!mid[-\s])(?<!rear[-\s])(?<!front[-\s])(?<!twin[-\s])(?<!dual[-\s])(?:engines?|transmissions?|transaxles?|gearbox(?:es)?|wheels?|rims|carburet\w+|crankcases?|cylinder\s?heads?|differentials?|camshafts?|literature|brochures?|posters?|neon\s?signs?|signs?|trailers?|memorabilia|automobilia)\b/i;
const NV_CAR_WORDS = /\b(odometer|mileage|miles|mi\.?|vin|title|interior|exterior|paint|drives?|driven|runs|convertible|coupe|sedan|wagon|roadster|chassis|coachwork|body|bodywork|numbers|matching|restor\w+|leather|upholstery|seats?|registration|carfax|service\s+records|history|provenance|owner|owners)\b/i;
// the part must be the SUBJECT of the description: named within its first eight words ("Complete 3.2L flat-six engine ..."), not mentioned further in ("... matching numbers engine")
const descNamesPart = d => NV_NOUN.test(d.split(/\s+/).slice(0, 8).join(" "));
export function nonVehicleSignals(row) {
  const r = row || {};
  const title = String(r.listing_title || r.raw_title || r.rtitle || r.title || ""), desc = String(r.description || "").slice(0, 240);
  const mi = r.mileage == null || r.mileage === "" ? (Number(r.stated_mileage) > 0 ? Number(r.stated_mileage) : null) : Number(String(r.mileage).replace(/[^\d.]/g, "")), vin = String(r.vin_norm || r.vin || "").replace(/[^A-Za-z0-9]/g, "");
  const strong = [];
  if (title && (NV_NOUN.test(title) || isPartsListing(title, r.mileage))) strong.push("title_part");
  if (desc && descNamesPart(desc) && !NV_CAR_WORDS.test(desc)) strong.push("description_part");
  if (/\/0000-[A-Za-z]/.test(String(r.url || r.source_url || r.srcurl || r.srcurl2 || ""))) strong.push("source_no_year");   // the source's own address carries no model year (Hagerty files its parts and memorabilia lots under /0000-): a car it files has one
  if (!(mi > 0) && vin.length < 3) strong.push("no_identity");
  if (r.vehicle_type && String(r.vehicle_type) !== "car") strong.push("source_type");
  const real = strong.filter(x => x !== "no_identity");
  // A LOT WITH AN ODOMETER READING OR A VIN IS A CAR whatever words its title or description carry (an engine swap, a rebuilt engine, a car sold with its trailer, a pre-war chassis number); a part has neither (Oct 29 2026, the live sweep: four real cars with a part word and
  // miles had been "doubtful"). Doubtful is what is left of a weak identity: a chassis number under six characters and no odometer reading beside a part word.
  const identified = mi > 0 || vin.length >= 3;
  const weakId = !(mi > 0) && vin.length >= 3 && vin.length < 6;
  const verdict = identified ? (weakId && real.length >= 1 ? "doubtful" : "car") : real.length >= 1 ? "not_a_vehicle" : "car";
  return { verdict, signals: strong };
}
export function isNonVehicleLot(row) { return isPartsListing(String((row && (row.listing_title || row.raw_title || row.rtitle || row.title)) || ""), row && row.mileage) || nonVehicleSignals(row).verdict === "not_a_vehicle"; }
export function nonVehicleReason(row) { const v = nonVehicleSignals(row); return v.verdict === "not_a_vehicle" ? "not a vehicle lot: " + v.signals.join(" + ") : null; }
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function textHasTerm(text, term) {
  const normalizedTerm = asText(term).toLowerCase();
  if (!normalizedTerm) return false;
  const pattern = normalizedTerm
    .split(/\s+/)
    .map(escapeRegExp)
    .join("[\\s-]+");
  return new RegExp(`(^|[^a-z0-9])${pattern}([^a-z0-9]|$)`, "i").test(text);
}

export function median(values) {
  const nums = values.filter(n => Number.isFinite(n)).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : Math.round((nums[mid - 1] + nums[mid]) / 2);
}

export function daysAgo(dateString) {
  if (!dateString) return Infinity;
  const then = new Date(dateString).getTime();
  if (!Number.isFinite(then)) return Infinity;
  return Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24));
}

export function normalizeMoney(record) {
  const value = record.sold_price ?? record.final_price ?? record.price ?? record.current_bid;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

// Source slugs that are NOT a platform: the data vendor's own name is not an
// auction house. A record whose source resolves to the vendor (OldCarsData
// stamps unattributed rows with "oldcarsdata") must never become a first-class
// source slug in the store's vocabulary. We fail closed to "unknown" so the
// evidence allowlist and new-source detection exclude it loudly instead of
// silently trusting the vendor name. See api/sellerDecision new-source scan.
const NON_PLATFORM_SOURCE_SLUGS = new Set(["oldcarsdata"]);

export function recordPlatform(record) {
  const raw = record.platform || record.source || record.auction_platform || record.listing_source || "";
  const norm = String(raw).toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!norm || NON_PLATFORM_SOURCE_SLUGS.has(norm)) return "unknown";
  return raw;
}

export function recordSellerUsername(record) {
  return asText(record.seller_username || record.seller_name || record.seller || record.username);
}

// Memorabilia / replica / tribute / scale-model exclusion (Sep 2026). These are NOT cars and must
// never enter a comp pool, a span/cluster, or an evidence median - on a thin pool a $5,700 "250 GTO
// Wall Art" or $150k "Tribute" sits at the floor and drags the read down (memcheck: Mustang/356/
// Cobra replicas, a $1,100 Corvette art piece as the pool floor). Word-boundaried and deliberately
// conservative: no bare "art/print/sign/badge/manual/hood" (they legitimately appear on real cars -
// "Signature", "Sprinter", "owners manual", "cowl hood" must NOT match). Applied in One Box's
// fetchQualifying, the class-taxonomy fallback, and house-tier mode.
// recreation(s)/reproduction(s) plural: builder names ("by Classic Recreations") are a common title
// form and the bare singular regex missed them (Oct 2026, GT500CR case - "by Classic Recreations"
// $220k-$406k continuation builds were pooling with genuine 1967 Shelby GT500 sales, blowing out the
// range). Still word-boundaried, so "recreational" is untouched.
// re[\s-]?creation / re[\s-]?production (Lane B, Oct 13 2026, found with task=poolrows on the 356 Speedster): the
// archive titles these cars "RE-CREATION" (hyphenated) and "Re Creation" (spaced) as often as "Recreation", and a
// word-boundary regex saw "RE" and "CREATION" as two separate, non-matching words, so every hyphenated replica
// passed the fence as a real car. One optional hyphen or space, same word either way; "recreational" is untouched
// (the trailing \b after "creations?" still requires the word to end there).
const MEMORABILIA_RE = /\b(tribute|replica|re[\s-]?creations?|re[\s-]?productions?|clone|kit\s?car|wall\s?art|artwork|diorama|poster|scale\s?model|model\s?car|die-?cast|pedal\s?car|go-?kart|toolbox|tool\s?box|brochure|literature|figurine)\b|1\s?:\s?\d{1,3}\b|[-\s]style\b/i;
export function isMemorabilia(record) {
  const t = typeof record === "string" ? record
    : String((record && (record.listing_title || record.raw_title || record.title || record.rtitle)) || (record && record.raw_record && record.raw_record.title) || "");
  return MEMORABILIA_RE.test(t);
}

// PROTOTYPE flag (Market Check follow-up, Oct 2026): a titled engineering/development prototype (an
// AMG "P900 Prototype" DTM mule, a factory pre-production test car) is not a standard production
// example - it is FLAGGED and excluded from a pool/band, never deleted or hidden from a reader who asks
// for it directly. Title-matched only (the archive row itself is untouched). Shared across Sell, Market
// Check's class-era last resort and the main engine pool (qualifyReason), so all three agree.
const PROTOTYPE_RE = /\bprototype\b/i;
export function isPrototype(record) {
  const t = typeof record === "string" ? record
    : String((record && (record.listing_title || record.raw_title || record.title || record.rtitle)) || (record && record.raw_record && record.raw_record.title) || "");
  return PROTOTYPE_RE.test(t);
}

const _plural = w => (/(s|x|z|ch|sh)$/i.test(w) ? w + "es" : w + "s");
// TITLE-KEYWORD last resort (shared, SINGLE source of truth - /sell's lib/sell/sellFacts.js and One
// Box's class-era fallback in lib/onebox.js both call this; neither keeps its own copy). For a model
// the archive files under a shorter name with the rest only ever appearing in the TITLE ("CLK DTM" is
// filed as model "CLK", "DTM" never in the model column), every model word is required in the title,
// 36 months, USD at the sale month with the house premium backed out (hammerUsd from _houseComps.js -
// the SAME hammer-basis the engine itself reads). Narrows to the body style when that still leaves
// something; otherwise keeps the full keyword match rather than running the pool to zero.
// ---------------------------------------------------------------------------------------------
// IN THE MARKET (Sam's decision, Oct 14 2026): sold pools, ranges and counts hold United States and
// Canada sales only. One function for every pool build (fetchQualifying, titleKeywordPool, the
// reserve tiles), never a per-product copy. The country of a row is read from the venue's own fields,
// in this order, and never guessed from the car:
//   1. raw_record country_code (two letters) when present;
//   2. the venue's own location field: raw_record state as a US state or Canadian province (code or
//      full name), or a non-US country or city name the houses write there (FRANCE, GERMANY, MONACO,
//      LONDON ...);
//   3. the sale currency as reported by the venue (CAD is Canada; GBP/EUR/CHF/AUD/... is abroad; USD
//      decides only for a worldwide house with no location field);
//   4. Gooding's "(UKnn)" London event code in the title (its London lots carry no location, and are
//      tagged USD by OldCarsData);
//   5. the venue itself: a venue that sells only in the United States and Canada counts as in; a
//      UK/EU/AU marketplace counts as out.
// Anything still unknown is out, and counted as unknown, never assumed in.
const US_STATE_CODES = new Set("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC PR".split(" "));
const US_STATE_NAMES = new Set(["alabama","alaska","arizona","arkansas","california","colorado","connecticut","delaware","florida","georgia","hawaii","idaho","illinois","indiana","iowa","kansas","kentucky","louisiana","maine","maryland","massachusetts","michigan","minnesota","mississippi","missouri","montana","nebraska","nevada","new hampshire","new jersey","new mexico","new york","north carolina","north dakota","ohio","oklahoma","oregon","pennsylvania","rhode island","south carolina","south dakota","tennessee","texas","utah","vermont","virginia","washington","west virginia","wisconsin","wyoming","district of columbia","puerto rico"]);
const CA_PROV_CODES = new Set("AB BC MB NB NL NS NT NU ON PE QC SK YT".split(" "));
const CA_PROV_NAMES = new Set(["alberta","british columbia","manitoba","new brunswick","newfoundland","newfoundland and labrador","nova scotia","ontario","prince edward island","quebec","québec","saskatchewan","yukon","northwest territories","nunavut"]);
// Non-US places the houses write into the state/city field (country names and the auction cities).
const ABROAD_PLACES = new Set(["france","germany","monaco","london","italy","italia","united kingdom","uk","england","scotland","wales","berkshire","switzerland","belgium","netherlands","spain","austria","portugal","sweden","denmark","norway","finland","ireland","australia","new zealand","japan","hong kong","singapore","dubai","abu dhabi","uae","united arab emirates","qatar","bahrain","south africa","hungary","czech republic","poland","luxembourg","mexico","paris","milan","milano","munich","münchen","essen","goodwood","villa erba","cernobbio","zoute","knokke","chantilly","le mans","stuttgart","brussels","amsterdam","geneva","zurich","vienna","madrid","barcelona","tokyo","sydney","melbourne","auckland","como","maranello","monza","lake como","liechtenstein","eschen","vaduz","greece","turkey","israel","china","india","brazil","argentina","chile","uruguay","russia","slovenia","croatia","romania","bulgaria","estonia","latvia","lithuania","malta","cyprus","iceland","andorra","san marino","thailand","malaysia","indonesia","south korea","korea","taiwan","egypt","morocco","kuwait","saudi arabia","oman","jersey","guernsey","isle of man","northern ireland","germany, germany","united kingdom (uk)"]);
const ABROAD_COUNTRY_BY_CURRENCY = { GBP: "GB", EUR: "EU", CHF: "CH", AUD: "AU", NZD: "NZ", HKD: "HK", AED: "AE", JPY: "JP", SEK: "SE", DKK: "DK", NOK: "NO", ZAR: "ZA", SGD: "SG", QAR: "QA", BHD: "BH", MXN: "MX" };
// Venues that sell only in the United States and Canada (no overseas rooms, no overseas listings as a
// business): a row with no location at all from these counts as in. Keyed on the slug sourceSlugOf gives.
const VENUES_US_CA_ONLY = new Set(["bringatrailer", "carsandbids", "hagerty", "pcarmarket", "acc", "hemmings", "mbmarket", "autohunter", "barrettjackson", "mecum"]);
// UK/EU/AU marketplaces: out whatever the row says (their rows almost always carry a country too).
const VENUES_ABROAD = /car\s*&\s*classic|carandclassic|collecting\s*cars|collectingcars|\bthe\s+market\b|themarket|pistonheads/i;
const GOODING_UK_EVENT = /\(uk\d{2}\)/i;
// One place reader for a state or city field: the whole text, then its comma-separated parts from the last backward (the country tail first).
// `states` also reads US state codes/names and Canadian provinces; a city only reads a country or an abroad place (a US city name proves nothing here).
function placeOf(text, states) {
  const t = String(text || "").trim(); if (!t) return null;
  const parts = [t, ...t.split(",").map(x => x.trim()).filter(Boolean).reverse()];
  for (const part of parts) {
    const up = part.toUpperCase(), lc = part.toLowerCase().replace(/\./g, "");
    if (/^(usa|us|united states|united states of america)$/.test(lc)) return "US";
    if (lc === "canada") return "CA";
    if (ABROAD_PLACES.has(lc)) return "XX";
    if (states) {
      if (US_STATE_CODES.has(up) || US_STATE_NAMES.has(lc) || lc === "penn") return "US";
      if (CA_PROV_CODES.has(up) || CA_PROV_NAMES.has(lc)) return "CA";
    }
  }
  return null;
}
export function marketCountry(row) {
  if (!row) return { country: null, basis: "unknown" };
  const cc = String(row.cc || row.country_code || "").trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(cc)) return { country: cc === "UK" ? "GB" : cc, basis: "country_code" };
  // PLACE BEFORE CURRENCY (Sam, Oct 25 2026): a row positively placed by its state or city text is read from that place, whole or as the "..., Country"
  // tail ("Ontario, Canada", "Eschen, Liechtenstein", "Pennsylvania, United States"); the sale currency is only the fallback for a row with no place at all.
  const state = String(row.state || "").trim();
  const sp = placeOf(state, true);
  if (sp) return { country: sp, basis: "state" };
  const city = String(row.city || "").trim().toLowerCase();
  const cp = city ? placeOf(city, false) : null;
  if (cp) return { country: cp, basis: "city" };
  const cur = String(row.currency || "").trim().toUpperCase();
  if (cur === "CAD") return { country: "CA", basis: "currency" };
  if (cur && cur !== "USD" && ABROAD_COUNTRY_BY_CURRENCY[cur]) return { country: ABROAD_COUNTRY_BY_CURRENCY[cur], basis: "currency" };
  const source = String(row.source || row.platform || row.source_slug || "");
  const slug = sourceSlugOf(source);
  if (slug === "gooding" && GOODING_UK_EVENT.test(String(row.raw_title || row.rtitle || row.title || row.listing_title || ""))) return { country: "GB", basis: "event_code" };
  if (VENUES_ABROAD.test(source) || VENUES_ABROAD.test(slug)) return { country: "XX", basis: "venue" };
  if (VENUES_US_CA_ONLY.has(slug)) return { country: "US", basis: "venue" };
  if (cur === "USD") return { country: "US", basis: "currency" };
  return { country: null, basis: "unknown" };
}
// A venue the launch scope leaves out whatever a row says (UK/EU/AU marketplaces): the same list marketCountry reads as abroad.
export function isExcludedVenue(source) { const t = String(source || ""); return VENUES_ABROAD.test(t) || VENUES_ABROAD.test(sourceSlugOf(t)); }
export function inMarket(row) { const c = marketCountry(row).country; return c === "US" || c === "CA"; }
// Stamp the country facts on a row the engine returns (rawPool rows, keyword-pool rows, poolrows).
export function stampCountry(row) { const c = marketCountry(row); row.country = c.country; row.countryBasis = c.basis; return row; }

// MOTORCYCLE FENCE BY TITLE (Lane B, Oct 19 2026, Sam's "2022 BMW 3-Series" demo page): vehicle_type is set at MAKE level
// for a make that sells both cars and motorcycles, so every BMW, Honda, Suzuki or Triumph row is typed "car" and a BMW
// R1250GS or M1000R reads as a car. This fence reads the TITLE: a plain motorcycle word for any make, and the bike model
// codes for those four makes only (scoped by make, because a bike word is a car name elsewhere: the Rolls-Royce Silver
// Shadow, the Sunbeam Tiger, the AMC Rebel, the Lexus GS300, the Mercedes CL55, the Dolomite Sprint). It removes
// motorcycles only.
const MOTO_WORD_RE = /\b(motorcycles?|motorbikes?|moped|scooter|dirt\s?bike|sidecar)\b/i;
const MOTO_CODES_BY_MAKE = [
  [/^bmw$/i, /\b(r\s?\d{2,4}\s?(gs|rt|rs|r|s|c|cs|st|gt)?|r\s?nine\s?t|s\s?1000\s?(rr|r|xr)|m\s?1000\s?(rr|r|xr)|k\s?\d{2,4}\s?(lt|gt|rs|rt|s|r|b)?|[fg]\s?\d{3}\s?(gs|r|st|gt|xr|rt|s|x)?|hp[24]|c\s?(400|600|650)\s?(x|gt|sport)|ce\s?0?4)\b/i],
  [/^honda$/i, /\b(cb\s?\d{2,4}\w*|cbr\s?\d{2,4}\w*|cbx|cl\s?\d{2,3}|cx\s?\d{3}|gl\s?\d{3,4}|vfr\s?\d{2,4}|vtr\s?\d{3,4}|xr\s?\d{2,4}\w*|xl\s?\d{2,4}\w*|crf\s?\d{2,4}\w*|nighthawk|gold\s?wing|africa\s?twin|super\s?cub|ct\s?\d{2,3}|z50\w*|mini\s?trail|shadow|magna|rebel\s?\d{3})\b/i],
  [/^suzuki$/i, /\b(gs\s?\d{3,4}\w*|gsx[-\s]?r?\s?\d{2,4}|gsxr|rmz?\s?\d{2,4}|drz?\s?\d{3}|katana|hayabusa|bandit\s?\d{3,4}|intruder|boulevard|v-?strom|sv\s?\d{3,4}|tl\s?\d{3,4}|gt\s?\d{3}|t\s?500|rv\s?\d{2,3})\b/i],
  [/^triumph$/i, /\b(bonneville|thruxton|trident|speed\s?(twin|triple)|street\s?(twin|triple)|scrambler|tiger|rocket\s?(iii|3)|daytona\s?\d{3}|t1[024]0\w*|tr6r|tr6c|tr5t|speedmaster|thunderbird)\b/i]
];
export function isMotorcycleTitle(title, make) {
  const t = String(title || "");
  if (!t) return false;
  if (MOTO_WORD_RE.test(t)) return true;
  const mk = String(make || "").trim();
  const hit = MOTO_CODES_BY_MAKE.find(([re]) => re.test(mk));
  return !!(hit && hit[1].test(t));
}
// TRACTOR AND FARM MACHINE FENCE (Lane B, Oct 21 2026, Sam's Buy 1f item 13: "Porsche-Diesel" showed as a model chip in a red
// Porsche search; Porsche-Diesel built tractors). The twin of the motorcycle fence above, read from the TITLE (and a row's model,
// where a live listing files the maker): a tractor or farm machine is never a car, in any car search (the engine's pool, the
// keyword pool, Buy and Tasks), the same places the motorcycle fence acts. Car names that share a word stay cars: International
// Harvester (the Scout), a Porsche 356 Super 90, a Porsche 911 Standard, a Ford 8 (the N-series tractors are 2N, 8N, 9N, NAA).
const FARM_WORD_RE = /\b(tractors?|trattori|traktor|combine\s+harvester|(?<!international\s)harvester|backhoe|excavator|bulldozer|skid[-\s]?steer|forklift|hay\s?baler|farm\s+(?:equipment|machinery|implement))\b/i;
const FARM_MAKER_RE = /\b(porsche[-\s]diesel|allgaier|lanz\s+bulldog|fordson|farmall|john\s+deere|massey[-\s]ferguson|massey[-\s]harris|allis[-\s]chalmers|minneapolis[-\s]moline|oliver\s+(?:super\s+)?\d{2,4}|ferguson\s+t[eo][-\s]?\d{2}|ford\s+(?:2n|8n|9n|naa)|case\s+ih|new\s+holland|deutz[-\s]fahr|fendt|kubota|zetor|steiger)\b/i;
// Porsche-Diesel's own model names without the word "Diesel" ("Porsche Junior 108", "Porsche Super 308", "Porsche Master 419"):
// Junior is a tractor name only; Standard, Super and Master only with a three-digit tractor number or a single tractor letter
const PORSCHE_TRACTOR_RE = /\bporsche\b.*\b(?:junior|(?:standard|super|master)\s?(?:[1-4]\d{2}|[lkunv])\b)/i;
export function isFarmMachineTitle(title, make, model) {
  // International Harvester's road vehicles (the Scout, Travelall, pickups) are cars: the archive files them with the model
  // "Harvester" ("1979 INTERNATIONAL HARVESTER SCOUT II", model HARVESTER), so the maker's name is taken out of the title and a
  // lone "Harvester" out of an International's model before the tractor words are read (the report read, Oct 21 2026)
  const ih = /^international/i.test(String(make || "").trim());
  const tt = String(title || "").replace(/\binternational[-\s]+harvester\b/gi, "International")
    // a maker named as the ENGINE ("Turbodiesel Kubota-Powered Willys M38A1", "Ferguson-engined") is a car with that engine
    .replace(/\b(kubota|deutz|perkins|ferguson|fordson|lanz|john\s+deere)[-\s]?(?:powered|engined|engine|diesel[-\s]powered)\b/gi, "");
  const mm = ih ? String(model || "").replace(/\bharvester\b/gi, "").trim() : model;
  const t = [tt, mm].filter(Boolean).join(" ");
  if (!t) return false;
  if (FARM_WORD_RE.test(t) || FARM_MAKER_RE.test(t) || FARM_MAKER_RE.test(String(make || ""))) return true;
  if (/^porsche/i.test(String(make || "").trim()) || /\bporsche\b/i.test(t)) { if (PORSCHE_TRACTOR_RE.test(t)) return true; }
  return false;
}
export async function titleKeywordPool(vehicle, env, displayFloor) {
  const words = String(vehicle.model || "").split(/\s+/).filter(Boolean);
  if (!words.length) return { pool: [] };
  await ensureFxReady(env).catch(() => null);
  const cols = "price:sale_price,currency:raw_record->>currency,platform,title:listing_title,date:sale_date,year,vin_norm,url:raw_record->>url,url2:raw_record->>source_url,image:raw_record->>featured_image_url,mileage:raw_record->>mileage,cc:raw_record->>country_code,state:raw_record->>state,city:raw_record->>city";
  const makeHead = String(vehicle.make || "").split(/[\s-]/)[0];
  // YEAR BOUND IN THE QUERY (Lane B, Oct 13 2026, "Porsche 911 R" timed out): the +/-3 model-year rule below
  // was applied in memory only, so a keyword search paged the marque's WHOLE archive first (a one-letter
  // word like "R" matched every title). The same window now bounds the query; the kept set is identical
  // (rows with no year still pass, as before), the fetch is a few hundred rows instead of tens of thousands.
  const yq = Number(vehicle.year) > 1885 ? `&or=(year.is.null,and(year.gte.${Number(vehicle.year) - 3},year.lte.${Number(vehicle.year) + 3}))` : "";
  const rows = (await supabaseSelectAll(env, `sales_archive?select=${cols}&make=ilike.${encodeURIComponent("*" + makeHead + "*")}${yq}&listing_title=ilike.${encodeURIComponent("*" + words.join("*") + "*")}&sale_price=not.is.null&sale_date=gte.${new Date(Date.now() - 1095 * 864e5).toISOString().slice(0, 10)}&order=sale_date.desc`).catch(() => null)) || [];
  const wordRe = words.map(w => new RegExp("\\b" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i"));
  // IN THE MARKET (see marketCountry above): the keyword route applies the same country rule as fetchQualifying.
  const matched = rows.filter(r => inMarket({ source: r.platform, cc: r.cc, state: r.state, city: r.city, currency: r.currency, title: r.title })).filter(r => wordRe.every(re => re.test(r.title || "")) && !isPartsListing(r.title, r.mileage) && !isMemorabilia(r.title));
  // Engineering/development prototypes are FLAGGED, not deleted: excluded from the pool/band (never a
  // standard production comp) but counted, so a reader asking directly still gets an honest answer.
  const flaggedPrototype = matched.filter(r => isPrototype(r.title)).length;
  let kept = matched.filter(r => !isPrototype(r.title) && !isMotorcycleTitle(r.title, vehicle.make) && !isFarmMachineTitle(r.title, vehicle.make));   // the motorcycle and farm-machine fences (above)
  if (vehicle.year) kept = kept.filter(r => !Number(r.year) || Math.abs(Number(r.year) - Number(vehicle.year)) <= 3);
  const body = vehicle.bodyStyle ? new RegExp("\\b" + vehicle.bodyStyle + "\\b", "i") : null;
  const bodied = body ? kept.filter(r => body.test(r.title || "")) : kept;
  const useBody = body && bodied.length > 0;
  const pool = (useBody ? bodied : kept).map(r => stampCountry({ source: r.platform, auction_end_date: String(r.date || "").slice(0, 10), _hv: Math.round(hammerUsd({ price: r.price, currency: r.currency, platform: r.platform, source: r.platform, date: r.date }) || 0), srcurl: r.url || r.url2, raw_title: r.title, image: r.image, vin_norm: r.vin_norm, mileage: r.mileage, year: r.year, cc: r.cc, state: r.state, city: r.city, currency: r.currency }))
    .filter(r => r._hv >= displayFloor);
  const ys = pool.map(r => Number(r.year)).filter(Boolean);
  const yrs = ys.length ? (Math.min(...ys) === Math.max(...ys) ? String(ys[0]) : `${Math.min(...ys)} to ${Math.max(...ys)}`) : "";
  const noun = useBody ? `${vehicle.model} ${_plural(String(vehicle.bodyStyle).toLowerCase())}` : _plural(String(vehicle.model));
  return { pool, step: "keyword", cohort: `${noun}${yrs ? ", " + yrs : ""}`, route: `title keyword "${words.join(" ")}"`, flaggedPrototype };
}

// PROJECT / INCOMPLETE / NON-ORIGINAL flag (follow-up item 1, Oct 2026). A sale of a car that is NOT
// a complete, running, original example - a shell, roller, parts car, no-engine project, salvage car,
// or a replica/tribute/recreation/continuation/evocation - is NEVER a comp, a range member, a house
// ranking entry or an ask comparison for a complete running car. Mined from the TITLE and the listing
// DESCRIPTION (the shell/project detail usually lives in the description, e.g. an RM lot "offered as a
// project, engine of uncertain provenance"), so the house-pool read enriches descriptions first.
//
// FALSE-POSITIVE GUARDS (the list is deliberately conservative; task=projscan reports the real hits):
//  - "restored"/"restoration"/"nut and bolt restoration" is a COMPLETE car - only "restoration PROJECT"
//    / "project car" / "as a project" flag, never bare "restoration".
//  - "roller" the rolling-chassis sense only: roller ROCKER / BEARING / CAM / LIFTER / TAPPET / SKATE /
//    CHAIN are engine/parts phrases, not a project car.
//  - factory "continuation SERIES" / "official continuation" are genuine builds -> NOT flagged; a loose
//    "continuation" (replica sense) still is.
//  - "shell" must be the body sense (body shell / bare shell / rolling shell / as a shell / shell only);
//    a bare "shell" (Shell livery, shell seats) does not flag.
//  - "incomplete" never on "incomplete history/records/service/documentation/provenance".
//  - "no engine" never on "no engine WORK/ISSUES/PROBLEMS/BAY".
const PROJECT_PATTERNS = [
  // "unfinished" but not a FACTORY/cosmetic finish ("unfinished stainless steel panels" on a DeLorean,
  // "unfinished interior" on a street rod are complete cars; "unfinished project/rebuild/car" is not).
  { k: "unfinished", re: /\bunfinished\b(?!\s+(?:stainless|steel|alumin\w*|metal|alloy|chrome|paint\w*|body\s*panels?|panels?|interior|wood\w*|trim))/i },
  { k: "incomplete", re: /\bincomplete\b(?!\s+(?:history|records?|service|documentation|paperwork|provenance|set|tool\s?kit|toolkit))/i },
  // "bodyshell" ALONE is construction prose ("the 993 Targa used the convertible bodyshell"), NOT a
  // project signal - it flags ONLY in a project context (bare / stripped / only / as a shell). The bare
  // "body shell" pattern was removed (Lane C false positive); the title still flags via TITLE_LOOSE.
  { k: "shell", re: /\b(?:bare\s+(?:body\s*)?shell|rolling\s+(?:body\s*)?shell|stripped\s+(?:body\s*)?shell|(?:body\s*)?shell\s+only|just\s+a\s+(?:body\s*)?shell|(?:offered|sold|available)\s+as\s+a\s+(?:body\s*)?shell|a\s+bare\s+(?:body\s*)?shell)\b/i },
  { k: "rolling chassis", re: /\brolling\s?chassis\b/i },
  // "roller" is TITLE-ONLY (PROJECT_TITLE_LOOSE): in a description it is almost always an engine/parts
  // phrase (roller rocker/cam/lifter/bearing, double-roller timing set, roller gas pedal), not a project
  // car, so it is deliberately NOT a description pattern (audit: 189 desc hits, nearly all engine parts).
  { k: "project", re: /\b(?:project\s+car|(?:offered|sold|available|listed)\s+as\s+a\s+project|as\s+a\s+(?:restoration\s+)?project|restoration\s+project|unfinished\s+project|incomplete\s+project|stalled\s+project|abandoned\s+project|barn\s+find\s+project|is\s+a\s+project|ideal\s+project|perfect\s+project|great\s+project|a\s+project\s+(?:car|to\s+complete|needing|requiring|awaiting))\b/i },
  { k: "no engine", re: /\b(?:no|without|missing|lacks?(?:\s+an?)?|minus(?:\s+(?:its?|the|an?))?|sans)\s+engine\b(?!\s*(?:work|issues?|problems?|troubles?|bay|rebuild|concerns?|faults?|warning))/i },
  { k: "non-running", re: /\bnon[-\s]?running\b/i },
  { k: "not running", re: /\b(?:not\s+running|does\s?n['o]?t\s+run|will\s+not\s+run|won['o]?t\s+run|not\s+in\s+running\s+order|no\s+longer\s+runs?)\b/i },
  { k: "parts car", re: /\bparts\s+car\b/i },
  { k: "parts only", re: /\b(?:offered|sold|available)\s+(?:here\s+)?as\s+parts\s+only\b|\bfor\s+parts\s+only\b|\bparts\s+only\s+(?:vehicle|car|sale)\b/i },   // RM Sotheby's "The Junkyard": "offered as parts only" (Oct 2026)
  { k: "salvage", re: /\bsalvage\b/i },
  { k: "no chassis number", re: /\bno\s+(?:formal\s+|official\s+|known\s+|visible\s+|stamped\s+)?chassis\s+(?:number|no\.?)\b/i },
  { k: "replica", re: /\breplica\b/i },
  { k: "tribute", re: /\btribute\b/i },
  { k: "recreation", re: /\bre-?creation\b/i },
  { k: "evocation", re: /\bevocation\b/i },
  { k: "continuation", re: /\bcontinuation\b(?!\s+series)/i }
];
export { PROJECT_PATTERNS };
// A TITLE is terse, so a bare "project"/"shell"/"roller" IN THE TITLE is almost always the car's state
// ("1970 Mustang Project", "911 Bare Shell", "E-Type Roller"); the same bare words in PROSE are too
// noisy ("a three-year project", "shell seats", "roller rockers"), so the description uses only the
// strict PROJECT_PATTERNS phrasings. Guards mirror the strict set (no "roller rocker", no "salvageable").
const PROJECT_TITLE_LOOSE = /\b(?:projects?|unfinished|incomplete|bare\s?shell|rolling\s?shell|body\s?shell|\broller\b(?!\s*(?:-?\s?rockers?|bearings?|cams?|lifters?))|rolling\s?chassis|parts\s?car|non[-\s]?running|not\s+running|salvage(?!able)|no\s+engine)\b/i;
// A NEGATED mention in prose is not a project car ("this is NOT a replica", "no salvage history",
// "never a project"): strip those phrases from the description before matching so they cannot flag a
// complete original car.
const PROJECT_NEGATION_RE = /\b(?:not|never|no|isn'?t|aren'?t|wasn'?t|without being|rather than)\s+(?:a\s+|an\s+|any\s+|the\s+)?(?:replica|tribute|re-?creation|project|body\s?shell|bare\s+shell|rolling\s+shell|roller|salvage|parts\s+car|evocation|continuation|rolling\s+chassis|unfinished|incomplete|non[-\s]?running)\b/gi;
// Returns the matched keyword, or null. Title-loose first (the title is terse), then strict patterns on
// the title, then on the description with negated mentions stripped out.
// TIGHTENED DESCRIPTION PATH (e60, Sam's dry-run decision, Oct 2026): "tribute", "replica" and "recreation" in a
// DESCRIPTION flag only next to a car word (car, build, kit, body, coupe, roadster, spyder, cabriolet, convertible,
// continuation) within three words either side. The sampled dry run found the loose form flagging a $39,200 Buick
// Grand National ("a legendary tribute to Buick's NASCAR heritage"), an Isuzu Rodeo ("replaced it with a Mazda
// Tribute") and a Camaro pace car ("trim replicating ..."). Titles keep the plain word (every title hit was real).
const PROXIMITY_KEYS = new Set(["replica", "tribute", "recreation"]);
// Adjacency, not a three-word window (the window still flagged "this car remains a legendary tribute to Buick's
// heritage"): the word flags only in one of these constructions: "is/as/was a replica", "replica of ...",
// "replica car/build/built/kit/body", or a car word right before it ("Speedster replica", "C-Type re-creation",
// "Trans Am tribute car"). A model name is a car word for the purpose when it ends in Type, Coupe, Spyder or similar.
const PROXIMITY_RE = /\b(?:is|as|was|be)\s+an?\s+(replica|tribute|re-?creation)\b|\b(replica|tribute|re-?creation)\s+(?:of|car|cars|build|built|kit|body|bodywork|coachwork)\b|\b(?:car|coupe|coup\u00e9|roadster|spyder|spider|cabriolet|convertible|speedster|daytona|cobra|gt40|gto|am|[a-z]-type|type)\s+(replica|tribute|re-?creation)\b/i;
const FACTORY_EDITION_RE = /\b(heritage|anniversary|commemorative|launch|founders?|final|signature)\s+edition\b/i;
const proximityKey = m => { const w = String(m[1] || m[2] || m[3] || "").toLowerCase(); return /^re-?creation$/.test(w) ? "recreation" : w; };
export function projectFlagReason(title, description, opts = {}) {
  const T = String(title || "");
  const tl = T.match(PROJECT_TITLE_LOOSE); if (tl) return tl[0].toLowerCase().replace(/\s+/g, " ").trim();
  for (const p of PROJECT_PATTERNS) if (p.re.test(T)) return p.k;
  const D = String(description || "").replace(PROJECT_NEGATION_RE, " ");
  const loose = opts.rule === "loose";   // the rule as it was before e60, kept for the dry-run comparison only
  for (const p of PROJECT_PATTERNS) {
    // e65 (Sam, the 2006 Ford GT Heritage Edition): when the TITLE names a factory edition (Heritage Edition and similar), the
    // description's "tribute" is the edition's own story ("a tribute to the GT40"), never a tribute car. Title hits still flag.
    if (!loose && p.k === "tribute" && FACTORY_EDITION_RE.test(T)) continue;
    if (!loose && PROXIMITY_KEYS.has(p.k)) { const m = PROXIMITY_RE.exec(D); if (m && proximityKey(m) === p.k) return p.k; continue; }
    if (p.re.test(D)) return p.k;
  }
  return null;
}

// House-tier value markers (Sep 2026): the deterministic, field-derived attributes that separate
// receipts for a rare car (what a dealer actually asks about). Extracted from title + description
// only, never composed. Used by house-tier mode's intake chips (a chip renders only when >=2
// receipts sit on each side of the split) and the receipt cards (the marker that places a sale).
const MARKER_RES = {
  matching_numbers: /matching[\s-]?numbers|numbers[\s-]?matching/i,
  classiche: /classiche/i,
  massini: /massini/i,
  documented_history: /documented|known ownership|ownership history|history file|comprehensive history|well[\s-]?documented/i,
  restored: /restored by|restoration by|nut[\s-]?and[\s-]?bolt|concours restoration|rebuilt by|body[\s-]?off/i,
  original_paint: /original paint|unrestored|preservation|survivor|one[\s-]?owner/i,
  rhd: /right[\s-]?hand[\s-]?drive|\brhd\b/i,
  alloy_body: /alloy (body|coachwork)|aluminum body/i,
  long_nose: /long[\s-]?nose/i,
  short_nose: /short[\s-]?nose/i,
  // Italian word only (Ferrari Competizione trim). The bare English "competition" alternative was
  // removed (Oct 2026, CLK DTM review): it false-positived on "CLK DTM Competition Saloon" / "190E
  // 2.5-16 Evolution II DTM Competition Saloon" - the DTM racing-series naming, not a trim - showing
  // a bare, unexplained "Competition" pill on those cards.
  competizione: /competizione/i,
  coachbuilder: /scaglietti|pininfarina|zagato|bertone|touring|ghia|fantuzzi|vignale|frua|figoni/i
};
const MARKER_LABELS = {
  matching_numbers: "Matching numbers", classiche: "Classiche certified", massini: "Massini report",
  documented_history: "Documented history", restored: "Pro restoration", original_paint: "Original / unrestored",
  rhd: "Right-hand drive", alloy_body: "Alloy body", long_nose: "Long nose", short_nose: "Short nose",
  competizione: "Competition", coachbuilder: "Coachbuilt"
};
export function extractMarkers(record) {
  const t = typeof record === "string" ? record
    : String(((record && (record.listing_title || record.raw_title || record.title || record.rtitle)) || "") + " " + ((record && (record.description || (record.raw_record && record.raw_record.description))) || ""));
  return Object.entries(MARKER_RES).filter(([, re]) => re.test(t)).map(([k]) => k);
}
export function markerLabel(key) { return MARKER_LABELS[key] || key; }

export function sourceRecordId(record) {
  return String(record.id ?? record.source_record_id ?? record.listing_id ?? "");
}

// 7B.1: stable id for persistence. When the upstream record carries an id we use
// it; when it does not, we hash stable identifying fields so a re-fetch of the
// SAME listing produces the SAME id and conflicts correctly on
// (source, source_record_id) - instead of crypto.randomUUID() re-inserting the
// same listing on every fetch. source_url is the strongest key; the rest
// disambiguate when a url is absent.
export function stableRecordId(record) {
  const explicit = sourceRecordId(record).trim();
  if (explicit) return explicit;
  const parts = [
    record.source_url || record.url || record.listing_url || record.link || "",
    record.title || record.listing_title || "",
    record.year || "",
    record.ocd_make_name || record.listing_make || record.make || "",
    record.ocd_model_name || record.listing_model || record.model || "",
    record.sale_price || record.price || "",
    record.auction_end_date || record.sale_date || record.end_date || ""
  ].map(value => String(value).trim().toLowerCase()).join("|");
  return "gas-" + crypto.createHash("sha1").update(parts).digest("hex").slice(0, 24);
}

export function sourceRecordKey(source, id) {
  return `${source || "unknown"}|${id || ""}`;
}

function recordTitle(record) {
  return [
    record.title,
    record.listing_title,
    record.year,
    record.ocd_make_name || record.listing_make,
    record.ocd_model_name || record.listing_model
  ].filter(Boolean).join(" ");
}

function extractYear(text) {
  const match = asText(text).match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

// Model anchoring (July 2026 Ford GT fix). A model is matched EXACTLY, by whole
// tokens, never by substring. "GT" must never match "Mustang GT", "GT40" or
// "GT500"; "911" must still match "911 Carrera". The rule: the target model
// token sequence must LEAD the record's model field, or lead the model portion
// of the title (the tokens right after a leading year + make). That anchors the
// model position, so a trailing trim token ("Mustang GT") never counts, and a
// longer nameplate ("GT40") never collapses into a shorter one ("GT").
export function normModelText(value) {
  return asText(value).toLowerCase().replace(/[\s\-]+/g, " ").replace(/[^a-z0-9 ]/g, "").trim();
}
export function modelTokens(value) {
  const t = normModelText(value);
  return t ? t.split(" ") : [];
}
function leadingModelMatch(candidateTokens, targetTokens) {
  if (!candidateTokens.length || !targetTokens.length) return false;
  if (candidateTokens.length < targetTokens.length) return false;
  return targetTokens.every((tok, i) => candidateTokens[i] === tok);
}
// The model portion of a title = the tokens after a leading 4-digit year and the
// make (stripped only where the make actually leads the remaining tokens).
export function titleModelTokens(rawTitle, make) {
  let toks = modelTokens(rawTitle);
  if (toks.length && /^(19|20)\d{2}$/.test(toks[0])) toks = toks.slice(1);
  const makeToks = modelTokens(make);
  if (makeToks.length && leadingModelMatch(toks, makeToks)) toks = toks.slice(makeToks.length);
  // MERCEDES-AMG SUB-BRAND (URGENT, Oct 2026, SL-Class class-era leak): many real listings title
  // the make itself as "Mercedes-AMG" (AMG is Mercedes-Benz's own performance division, never a
  // separate manufacturer - every record's own `make` field is still "Mercedes-Benz") - confirmed
  // live on 43 real 2021-2025 R232 SL sales ("2022 Mercedes-AMG SL63", "2023 Mercedes-AMG (R232)
  // SL43"). The exact-makeToks strip above only matches when the title's own words equal the
  // record's make field exactly, so "mercedes amg ..." never matched "mercedes benz" and left
  // "mercedes"/"amg" sitting in the LEADING position ahead of the real badge token ("sl63") -
  // recordMatchesModel's leadingModelMatch then always failed, the model-scoped rung read zero,
  // and the ladder fell all the way to class-era for a car with real sales on record. Strip the
  // leading "mercedes amg" (or bare "amg", for a record whose make field is already stripped to
  // just the model) the same way a genuine make-match would, whenever the record's real make is
  // Mercedes-Benz - narrowly scoped to this one, confirmed sub-brand, not a guess at others.
  if (/mercedes|benz/i.test(String(make || ""))) {
    if (toks[0] === "mercedes" && toks[1] === "amg") toks = toks.slice(2);
    else if (toks[0] === "amg") toks = toks.slice(1);
  }
  return toks;
}
// True when any target model term anchors the record's model (field or title).
export function recordMatchesModel(record, vehicle) {
  const terms = modelSearchTerms(vehicle).map(modelTokens).filter(s => s.length);
  if (!terms.length) return false;
  const recModelToks = modelTokens(record.ocd_model_name || record.listing_model || record.model);
  const rawTitle = asText(record.title || record.listing_title);
  const titleToks = rawTitle ? titleModelTokens(rawTitle, record.ocd_make_name || record.listing_make || vehicle.make) : [];
  if (terms.some(target => leadingModelMatch(recModelToks, target) || leadingModelMatch(titleToks, target))) return true;
  // Fragmentation catch-all: a family-head search (E-Class, 5-Series) also owns
  // its badge-titled records (E550, M5, 500E). Scoped to the record's nameplate
  // tokens, make-guarded (lib/modelFamilies.js). No-op for badge/unmapped searches.
  return familyBadgeMatch(vehicle, record);
}

export function modelSearchTerms(vehicle) {
  const model = asText(vehicle.model);
  const terms = new Set();
  if (model) terms.add(model);

  const normalizedMake = asText(vehicle.make).toLowerCase();
  const numericModel = model.match(/^\d{3}$/)?.[0];
  if (normalizedMake === "bmw" && numericModel) {
    terms.add(`${numericModel}i`);
    terms.add(`${numericModel}is`);
    terms.add(`${numericModel}ic`);
  }

  // Fragmentation fix: a family-head search widens to its bounded top-volume
  // badges so the fetch keyword passes pull badge-titled listings into the
  // archive (lib/modelFamilies.js). No-op for badge/unmapped searches.
  for (const badge of familyFetchTerms(vehicle)) terms.add(badge);

  return [...terms].filter(Boolean);
}

export function classifyRecord(record, vehicle) {
  const title = recordTitle(record).toLowerCase();
  const recordMake = asText(record.ocd_make_name || record.listing_make).toLowerCase();
  const recordModel = asText(record.ocd_model_name || record.listing_model).toLowerCase();
  const targetMake = asText(vehicle.make).toLowerCase();
  const targetModel = asText(vehicle.model).toLowerCase();
  const recordYear = Number(record.year || extractYear(title));
  const yearGap = vehicle.year && recordYear ? Math.abs(vehicle.year - recordYear) : null;
  const sameMake = !!targetMake && (recordMake === targetMake || title.includes(targetMake));
  // Exact, whole-token model anchoring (never substring): a Ford GT pool holds
  // Ford GTs only, and Ford GT vs GT40 separate cleanly. See recordMatchesModel.
  const sameModel = !!targetModel && recordMatchesModel(record, vehicle);
  // Pool-alias: a curated package (Weissach, Touring) matches comps under its
  // PARENT badge (GT3 RS, GT3 Touring) via vehicle.fetchTrim, while vehicle.trim
  // stays the true package name for display (line ~238). See lib/modelFamilies.js.
  const targetTrim = asText(vehicle.fetchTrim || vehicle.trim).toLowerCase();
  const trimMatch = !!targetTrim && textHasTerm(title, targetTrim);
  const colorMatch = vehicle.color ? title.includes(vehicle.color) : null;
  // Price basis (Sep 2026): online records are raw hammer already; live-auction HOUSE
  // records are premium-inclusive, so back them out to the implied USD hammer before they
  // enter any /sell median/premium math (houses are evidence-yes / routable-no). Online
  // records are untouched, so online-only results never change.
  let price = normalizeMoney(record);
  if (price != null && isHouseSource(record)) {
    const h = hammerUsd({ source: recordPlatform(record), price, currency: record.currency || (record.raw_record && record.raw_record.currency) || "USD", date: record.auction_end_date || record.sale_date || (record.raw_record && record.raw_record.sale_date) || null });
    if (Number.isFinite(h) && h > 0) price = Math.round(h);
  }
  const targetMentionsTurbo = textHasTerm(vehicle.raw, "turbo");
  const targetMentionsCup = textHasTerm(vehicle.raw, "cup");
  const exclusionReasons = [];

  // Memorabilia / replica / tribute / scale-model: not a car, never comparable-sale evidence
  // (a $150k "250 GTO Tribute" or $5,700 wall art must never enter a /sell median). Shared with
  // One Box's isQualifying guard; same regex, applied here so /sell excludes it too.
  if (isMemorabilia(title)) exclusionReasons.push("memorabilia/replica, not a car");
  if (!sameMake) exclusionReasons.push("different make");
  if (!targetMentionsTurbo && textHasTerm(title, "turbo")) exclusionReasons.push("turbo market behaves differently");
  if (!targetMentionsCup && (textHasTerm(title, "cup") || textHasTerm(title, "race car") || textHasTerm(title, "racecar") || textHasTerm(title, "track car"))) {
    exclusionReasons.push("race/track market behaves differently");
  }
  // Non-genuine builds trade in a different market than the stock car and must
  // never count as comparable sales (Aug 2026). Modified/replica/tribute builds
  // ("Custom Track T Roadster", "Cargo Truck Re-Creation") were previously counted
  // as genuine model comps, inflating both the count and the median. Each term is
  // skipped when the SEARCHED car itself names it, so a real "Ford Custom" model or
  // a deliberately searched continuation car is not self-excluded (mirrors the
  // turbo/cup guard above). textHasTerm joins tokens with [\s-]+, so "re creation"
  // catches "Re-Creation" and "resto mod" catches "resto-mod". "salvage" is
  // title/history, never a model name, so it stays unconditional.
  const targetText = [vehicle.raw, vehicle.model, vehicle.trim].map(asText).join(" ");
  const NON_GENUINE_TERMS = ["replica", "kit car", "recreation", "re creation", "tribute", "clone", "continuation", "hot rod", "hotrod", "restomod", "resto mod", "custom"];
  const nonGenuineHit = NON_GENUINE_TERMS.find(term => textHasTerm(title, term) && !textHasTerm(targetText, term));
  if (nonGenuineHit || textHasTerm(title, "salvage")) {
    exclusionReasons.push(nonGenuineHit ? "modified or non-genuine build" : "salvage title/history");
  }

  // Body-style guard (Aug 2026, Fix 2): when the seller specified a body style, a record
  // whose title EXPLICITLY names a CONFLICTING style is a different market (a coupe is not
  // a convertible comp) and must not dilute the comparison. Bounded and conservative,
  // mirroring the turbo/cup guards: fires ONLY when the search named a body style, the
  // title names a clearly opposing group's word, and the title does NOT also name the
  // searched group's own word. Ambiguous styles (targa, hardtop, t-top, softtop) map to
  // no group, so they never trigger a conflict either as the search or in a title.
  const BODY_GROUPS = {
    open: ["convertible", "cabriolet", "cabrio", "roadster", "spyder", "spider", "drophead", "drop head", "dhc", "vert"],
    coupe: ["coupe", "coup", "berlinetta", "fastback"],
    sedan: ["sedan", "saloon"],
    wagon: ["wagon", "estate", "avant", "shooting brake"]
  };
  const bodyGroupOf = word => {
    const w = String(word || "").toLowerCase();
    for (const [g, words] of Object.entries(BODY_GROUPS)) if (words.some(x => w.includes(x))) return g;
    return null;
  };
  const searchBodyGroup = vehicle.bodyStyle ? bodyGroupOf(vehicle.bodyStyle) : null;
  if (searchBodyGroup) {
    const titleNamesOwnGroup = BODY_GROUPS[searchBodyGroup].some(x => textHasTerm(title, x));
    if (!titleNamesOwnGroup && Object.entries(BODY_GROUPS).some(([g, words]) => g !== searchBodyGroup && words.some(x => textHasTerm(title, x)))) {
      exclusionReasons.push("different body style");
    }
  }

  // Market-spec + wheelbase guard (Sep 2026): when the seller specified a
  // federalized-vs-grey-market designation (Defender NAS) or a wheelbase (90/110/
  // 130), a record that is a KNOWN, CONFLICTING spec/wheelbase is a different
  // market and must not dilute the pool (a $27k grey-market 110 is not a $90k NAS
  // 90 comp). VIN WMI is the primary signal, title token the fallback. Bounded
  // and conservative like the body-style guard: fires only when the search named
  // a spec/wheelbase, and only excludes a record whose spec/wheelbase is known
  // and opposed. Data-driven (lib/marketSpec.js); a no-op for every non-mapped
  // nameplate. See recordMatchesModel: this runs only inside the same nameplate.
  if (vehicle.marketSpec || vehicle.wheelbase) {
    const specEntry = marketSpecEntryFor(vehicle.make, vehicle.model);
    if (specEntry) {
      const vin = record.vin || (record.raw_record && record.raw_record.vin) || record.listing_vin;
      const recSpec = classifyRecordSpec(specEntry, { vin, title });
      const conflict = recordConflictsWithSearch(
        { specKey: vehicle.marketSpec || null, variantKey: vehicle.wheelbase || null },
        recSpec
      );
      if (conflict) exclusionReasons.push(conflict);
    }
  }

  let comparisonTier = "excluded";
  let confidence = "low";
  if (exclusionReasons.length) {
    comparisonTier = "excluded";
  } else if (sameMake && sameModel && (yearGap === null || yearGap <= 2)) {
    comparisonTier = "close_match";
    confidence = "high";
  } else if (sameMake && sameModel && (yearGap === null || yearGap <= 8)) {
    comparisonTier = "relevant_match";
    confidence = "medium";
  } else if (sameMake && sameModel) {
    comparisonTier = "broad_match";
    confidence = "low";
  } else if (sameMake && yearGap !== null && yearGap <= 8) {
    comparisonTier = "broad_match";
    confidence = "low";
  } else if (sameMake && yearGap === null) {
    comparisonTier = "broad_match";
    confidence = "low";
  } else if (sameMake) {
    exclusionReasons.push("same make but too far from searched year/model");
  }

  return {
    source_record_id: sourceRecordId(record),
    normalized_make: vehicle.make || record.ocd_make_name || record.listing_make || null,
    normalized_model: vehicle.model || record.ocd_model_name || record.listing_model || null,
    normalized_year: recordYear || null,
    searched_year: vehicle.year,
    searched_color: vehicle.color,
    target_match: comparisonTier === "close_match",
    comparison_tier: comparisonTier,
    exclusion_reasons: exclusionReasons,
    classification_confidence: confidence,
    classification_source: "search_context",
    matched_terms: [
      sameMake ? vehicle.make : null,
      sameModel ? vehicle.model : null,
      trimMatch ? vehicle.trim : null,
      colorMatch ? vehicle.color : null
    ].filter(Boolean),
    needs_review: confidence === "low",
    price,
    // In-memory only (not persisted columns): raw signals the evidence ladder
    // evaluates directly, independent of the comparison_tier rollup.
    same_make: sameMake,
    same_model: sameModel,
    trim_match: trimMatch,
    year_gap: yearGap
  };
}

// vehicle_market_records requires make and model NOT NULL, but OldCarsData
// returns oddball lots (RVs, motorcycles) without them; one such row used to
// kill its whole insert batch, silently dropping real sales (product rule 5).
// Derive best-effort values from the title, falling back to "Other".
export function persistableMakeModel(record) {
  const title = asText(record.title || record.listing_title);
  const afterYear = title.replace(/^\s*(19|20)\d{2}\s+/, "");
  const tokens = afterYear.split(/\s+/).filter(Boolean);
  const make = asText(record.ocd_make_name || record.listing_make) || tokens[0] || "Other";
  const model = asText(record.ocd_model_name || record.listing_model)
    || (tokens.length > 1 ? tokens.slice(1, 4).join(" ") : "") || "Other";
  return { make, model };
}
