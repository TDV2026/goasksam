// Unknown-row classifier (Fix 4/5). Proposes make + model + vehicle_type for a sales_archive row filed
// make/model "Unknown" - OldCarsData ships no structured make/model for some sources (notably Bring a
// Trailer), so the identity lives only in the listing_title (and the VIN). PURE and OFFLINE: no vPIC,
// no OldCarsData, no network. The listing TITLE is the primary signal (every Unknown row has one); the
// VIN WMI is corroborating/fallback. Returns { make, model, vehicle_type, confidence, basis }.
//
// vehicle_type (Fix 5 design): "car" | "motorcycle" | "other" | "non_vehicle". The engine pools read
// ONLY vehicle_type = "car". non_vehicle = memorabilia/parts/automobilia (never a car). other =
// tractors, ATVs, military, go-karts, pedal cars. Fix 5 backfills high-confidence rows and wires this
// into ingest; the engine filter (vehicle_type = car) is Lane B's one-liner.
import { MAKE_ALIASES, PREWAR_MAKES, EXTRA_MAKES } from "./vehicleData.js";
import { isMemorabilia, isPartsListing } from "./_classify.js";

// Core collector car marques; augmented by curated aliases + prewar + extra makes. Multi-word phrases
// are matched before single tokens. WIDENED in Fix 5 from the stay-Unknown prefix scan.
const CORE_MAKES = ["Ferrari", "Porsche", "Lamborghini", "Maserati", "Alfa Romeo", "Lancia", "Fiat", "Abarth",
  "Mercedes-Benz", "BMW", "Audi", "Volkswagen", "Aston Martin", "Jaguar", "Land Rover", "Range Rover",
  "Bentley", "Rolls-Royce", "Lotus", "McLaren", "Mini", "MG", "MGB", "MGA", "Austin-Healey",
  "Austin", "Morris", "Jensen", "TVR", "AC", "Bristol", "Ford", "Chevrolet", "GMC", "Cadillac",
  "Buick", "Pontiac", "Oldsmobile", "Dodge", "Plymouth", "Chrysler", "Jeep", "Ram", "Lincoln", "Mercury",
  "AMC", "Shelby", "Hudson", "Studebaker", "Nash", "Willys", "International", "International Harvester",
  "Toyota", "Lexus", "Nissan", "Datsun", "Mazda", "Acura", "Subaru", "Mitsubishi", "Isuzu", "Infiniti",
  "Volvo", "Saab", "Peugeot", "Renault", "Citroen", "DeLorean", "De Tomaso", "Pagani", "Koenigsegg",
  "Bugatti", "Maybach", "Hummer", "Tesla", "Alpine", "Facel Vega", "Iso", "Bizzarrini", "Morgan",
  "Daimler", "Riley", "Vauxhall", "Opel", "Holden", "Ruf", "Alpina", "Rover", "Hillman", "Pierce-Arrow",
  "Cord", "Auburn", "Edsel", "Geo", "Metropolitan", "Divco", "Goliath", "Salmson", "Bond", "Scion",
  "Saturn", "Eagle", "Checker", "Crosley", "Kaiser", "Frazer", "Tucker", "Graham", "DeSoto", "Essex",
  "Terraplane", "Whippet", "Durant", "Stutz", "Duesenberg", "Packard", "Allard", "Lagonda", "Alvis",
  "Armstrong Siddeley", "Wolseley", "Humber", "Standard", "Singer", "Berkeley", "Elva", "Ginetta",
  "Marcos", "Gordon-Keeble", "Jowett", "Trabant", "Wartburg", "Skoda", "SEAT", "Dacia", "Tatra",
  "Panhard", "Simca", "Matra", "Hotchkiss", "Delage", "Delahaye", "Talbot", "Talbot-Lago", "Voisin",
  "Amphicar", "Messerschmitt", "BMW Isetta", "Autobianchi", "Innocenti", "Siata", "Moretti", "Ghia",
  // Widened from the stay-Unknown prefix scan (Fix 5 item 3): real car marques the set missed.
  "Daihatsu", "AM General", "Continental", "Diamond T", "Rossion", "LaForza", "LTI", "Smart",
  "Excalibur", "Meyers Manx", "Trojan", "Vanderhall", "Corbin", "Mosler", "Vector", "Qvale", "Spyker",
  "Noble", "Ultima", "Caterham", "Westfield", "Reliant", "Bond", "Gilbern", "Clan", "Trident"];

// Off-highway / equipment / ATV / military marques -> vehicle_type "other" (never a car pool member).
const OTHER_MAKES = ["John Deere", "Farmall", "McCormick", "Massey Ferguson", "Massey-Harris", "Ferguson",
  "Case", "Case IH", "Kubota", "New Holland", "Caterpillar", "Bobcat", "Allis-Chalmers", "Minneapolis-Moline",
  "Oliver", "Cockshutt", "Fordson", "Polaris", "Mahindra", "Sherp", "Quadro", "Rupp", "American LaFrance",
  "Stewart & Stevenson", "Stewart Stevenson", "Oshkosh", "Argo", "Kawasaki Mule", "Arctic Cat"];

// Honda, Suzuki, Triumph, Sunbeam, NSU, Ariel, Husqvarna made BOTH cars and motorcycles - resolved by
// a moto signal below. Pure-moto makes never appear here.
const AMBIG_MAKES = ["Honda", "Suzuki", "Triumph", "Sunbeam", "NSU", "Ariel", "Husqvarna"];

// Pure motorcycle / scooter marques (no collector cars).
const MOTO_MAKES = ["Harley-Davidson", "Harley Davidson", "Indian", "Ducati", "Norton", "BSA",
  "Moto Guzzi", "Vincent", "Matchless", "Velocette", "AJS", "Royal Enfield", "Enfield", "KTM", "Bultaco",
  "Montesa", "Ossa", "Maico", "Zundapp", "Sachs", "Hercules", "MV Agusta", "Aprilia", "Benelli", "Laverda",
  "Bimota", "Vespa", "Lambretta", "Piaggio", "Kawasaki", "Yamaha", "Buell", "Victory", "Can-Am", "Cushman",
  "Whizzer", "Rokon", "Puch", "Jawa", "Gilera", "Moto Morini", "Cagiva", "Derbi", "Brough Superior",
  "Rudge", "Panther", "Greeves", "Bultaco", "Sunbeam", "Mondial", "Motobecane", "Simson", "MZ", "Garelli",
  "Hodaka", "Boss Hoss", "Norton", "Villiers", "Francis-Barnett", "Cotton", "Excelsior", "Henderson"];

function buildSet(names, extras) {
  const set = new Map();
  const add = (phrase, canon) => { const k = String(phrase || "").trim().toLowerCase(); if (k) set.set(k, canon || phrase); };
  for (const m of names) add(m, m);
  if (extras) for (const a of extras) { if (a.make) { add(a.make, a.make); add(a.alias, a.make); } else add(a, a); }
  return set;
}
const CAR_SET = buildSet([...CORE_MAKES, ...AMBIG_MAKES, ...PREWAR_MAKES, ...EXTRA_MAKES], MAKE_ALIASES);
const MOTO_SET = buildSet([...MOTO_MAKES, ...AMBIG_MAKES]);
const OTHER_SET = buildSet(OTHER_MAKES);
const phrasesOf = set => [...set.keys()].sort((a, b) => b.split(/\s+/).length - a.split(/\s+/).length || b.length - a.length);
const CAR_PHRASES = phrasesOf(CAR_SET), MOTO_PHRASES = phrasesOf(MOTO_SET), OTHER_PHRASES = phrasesOf(OTHER_SET);

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

// Expanded automobilia / parts lexicon (Fix 5 item 1): these become vehicle_type non_vehicle, never a
// car, even when the title carries a make (a "Packard Acetylene Headlamps", a "Ferrari 1948-2000" book,
// a "Ford Neon Ribbon Clock", a radiator decanter, a lapel badge).
const NON_VEHICLE_RE = /\b(decanter|lapel|badge|headlamp|head\s?lamp|lamps?|lantern|clock|banner|book|magazine|catalogue|catalog|sign|signage|mascot|hood\s?ornament|trophy|print|painting|artwork|art\b|compendium|lubester|kettle|horn|bugle|globe|(?:gas|petrol)\s?pump|thermometer|neon|enamel|plaque|medallion|medal|cufflink|ashtray|flask|humidor|helmet|jacket|jersey|photograph|poster|brochure|pennant|chronograph|barometer|statue|sculpture|figurine|diecast|die-?cast|scale\s?model|tin\b|literature|advertisement|advert\b)\b/i;

// vehicle_type "other" (Fix 5 item 2): ride-on / off-highway / non-car vehicles. Pedal cars & pedal
// tractors & go-karts included here (ride-on, not pure memorabilia).
const OTHER_RE = /\b(pedal\s?(?:car|tractor)|go-?kart|go-?cart|tractor|back\s?hoe|backhoe|forklift|fork\s?lift|excavator|bulldozer|skid\s?steer|golf\s?cart|\batv\b|\butv\b|side-?by-?side|snowmobile|snow\s?cat|military|humvee|growler|\bitv\b|\blsv\b|\bmb\b\s?jeep|amphibious|8\s?[x×]\s?8|6\s?[x×]\s?6|mower|lawn\s?mower|riding\s?mower|minibike|mini-?bike|trailer\b|caravan\b|motorhome|rv\b|boat\b|aircraft|airplane|plane\b)\b/i;

const MOTO_SIGNAL_RE = /\b\d{2,4}\s?cc\b|\bmotorcycle\b|\bmoped\b|\bscooter\b|\bcafe\s?racer\b|\bchopper\b|\bbobber\b|\bsidecar\b|\btwo-?stroke\b|\bdirt\s?bike\b|\bminibike\b|\bmini-?bike\b/i;
// Moto MODEL patterns for the AMBIGUOUS makes (Honda CB750, Triumph Bonneville, Suzuki GSX) - a title
// with no "cc" but a clearly-motorcycle model must not land as a car and pollute the car pool.
const MOTO_MODEL_RE = /\b(cb\d{2,4}|cbr\d{2,4}|cl\d{2,3}|cx\d{3}|gl\d{3,4}|vfr\d{2,4}|vtr\d{3,4}|xr\d{2,4}|xl\d{2,4}|crf\d{2,4}|cr\d{2,3}|nighthawk|shadow|rebel|gold\s?wing|magna|africa\s?twin|super\s?cub|gs\d{3,4}|gsx[-\s]?r?\d{2,4}|gsxr|rm\d{2,4}|rmz\d{2,4}|drz\d{2,4}|dr\d{3}|katana|hayabusa|bandit\d{3,4}|intruder|boulevard|v-?strom|sv\d{3,4}|tl\d{3,4}|bonneville|thruxton|trident|speed\s?(?:twin|triple)|street\s?(?:twin|triple)|scrambler|t1[024]0\b|tiger\b|rocket\s?(?:iii|3)|daytona\s?\d{3})\b/i;

const BODY_WORDS = /\b(coupe|convertible|cabriolet|roadster|spyder|spider|sedan|saloon|hatchback|wagon|estate|targa|berlinetta|gts|gtb|fastback|hardtop|limousine|pickup|truck|suv|van)\b/i;

function findMakePhrase(lowerPadded, phrases, set) {
  let make = null, pos = Infinity, phrase = null;
  for (const ph of phrases) { const idx = lowerPadded.indexOf(" " + ph + " "); if (idx >= 0 && idx < pos) { pos = idx; make = set.get(ph); phrase = ph; } }
  return { make, pos, phrase };
}
function modelAfter(t, pos, phrase) {
  if (pos === Infinity) return null;
  const after = t.slice(pos + phrase.length + 1).trim();
  const mBody = after.match(BODY_WORDS);
  const modelPart = (mBody && mBody.index > 0) ? after.slice(0, mBody.index) : after;
  const toks = modelPart.split(/\s+/).filter(Boolean).slice(0, 3);
  return toks.join(" ").replace(/[.,]+$/, "").trim() || null;
}

export function classifyUnknown({ listing_title, vin } = {}) {
  const title0 = String(listing_title || "").trim();
  const vm = wmiMake(vin);
  // non_vehicle FIRST: memorabilia / parts / automobilia never classify as a car.
  if (isMemorabilia(title0) || isPartsListing(title0) || NON_VEHICLE_RE.test(title0)) {
    return { make: null, model: null, vehicle_type: "non_vehicle", confidence: "none", basis: "memorabilia/parts/automobilia" };
  }
  // Automobilia opener (Bonhams-style lots): NO model year AND the title starts with an article/
  // quantity ("A pair of...", "Paire de...", "A rare...", "Scrapbooks...", "Selection of...") - these
  // are lamps/badges/mascots/books/trunks, never a car. A real car leads with a year or a make.
  if (!/\b(?:18|19|20)\d{2}\b/.test(title0) && /^\s*(a|an|the|pair|paire|une|un|deux|set|selection|collection|group|assorted|various|lot|quantity|scrapbooks?|a\s+(?:pair|rare|large|fine|good|scarce|cased|boxed|leather|motoring|selection|collection|quantity|group|set))\b/i.test(title0)) {
    return { make: null, model: null, vehicle_type: "non_vehicle", confidence: "none", basis: "automobilia (article/quantity opener, no year)" };
  }
  // Normalize: strip a BaT mileage prefix and the FIRST model year.
  const t = title0.replace(/^\s*[\d,.]+\s*k?\s*-?\s*mile[s]?\b/i, "").replace(/\b(?:18|19|20)\d{2}\b/, " ").replace(/\s+/g, " ").trim();
  const lower = " " + t.toLowerCase() + " ";
  // other: ride-on / off-highway / non-car vehicles - by keyword (OTHER_RE) OR by an off-highway /
  // equipment / ATV marque (OTHER_MAKES: John Deere, Farmall, Polaris, Mahindra, ...).
  const otherByMake = findMakePhrase(lower, OTHER_PHRASES, OTHER_SET);
  if (OTHER_RE.test(title0) || otherByMake.make) {
    const mk = otherByMake.make ? otherByMake : findMakePhrase(lower, CAR_PHRASES, CAR_SET);
    return { make: mk.make || null, model: mk.phrase ? modelAfter(t, mk.pos, mk.phrase) : null, vehicle_type: "other", confidence: "none", basis: otherByMake.make ? "off-highway/equipment marque" : "non-car vehicle (tractor/ATV/military/pedal/kart)" };
  }
  // motorcycle: a pure-moto make, or an ambiguous make WITH a moto signal, or a moto signal alone.
  const moto = findMakePhrase(lower, MOTO_PHRASES, MOTO_SET);
  const motoSignal = MOTO_SIGNAL_RE.test(title0) || MOTO_MODEL_RE.test(title0);
  const motoOnly = moto.make && !AMBIG_MAKES.some(a => a.toLowerCase() === moto.make.toLowerCase());
  if (motoOnly || (moto.make && motoSignal)) {
    const model = modelAfter(t, moto.pos, moto.phrase);
    return { make: moto.make, model, vehicle_type: "motorcycle", confidence: model ? "high" : "low", basis: motoOnly ? "moto make (title)" : "moto make + displacement/keyword" };
  }
  // car: a recognized car make + a model token. An ambiguous make with no moto signal is a car.
  const { make: carMake, pos, phrase } = findMakePhrase(lower, CAR_PHRASES, CAR_SET);
  const makeFromTitle = !!carMake;
  const make = carMake || vm || null;
  const model = phrase ? modelAfter(t, pos, phrase) : null;
  const corroborated = !!(carMake && vm && carMake.toLowerCase() === vm.toLowerCase());
  if (make && model) return { make, model, vehicle_type: "car", confidence: makeFromTitle ? "high" : "low", basis: corroborated ? "title+VIN agree" : (makeFromTitle ? "title" : "VIN WMI") };
  if (make) return { make, model: null, vehicle_type: "car", confidence: "low", basis: makeFromTitle ? "title make, no model token" : "VIN WMI make only" };
  // No recognized make anywhere: genuinely UNCLASSIFIED - vehicle_type null (never asserted non_vehicle,
  // since it may be a car whose make the set still misses). Not backfilled; stays Unknown.
  return { make: null, model: null, vehicle_type: null, confidence: "none", basis: "no make in title or VIN (unclassified)" };
}
