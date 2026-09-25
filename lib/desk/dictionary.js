// Sam Desk — the understanding-layer DICTIONARY (Stage A).
// =====================================================================
// The ONLY way slang, platform codes, groupings, eras, windows, channels, venues,
// price/mileage phrases, metrics, body/transmission words and structural words become
// a Desk scope. Spec: docs/desk-understanding-spec.md sections 3, 4, 6.
//
// Rules (spec section 4):
//  - Every entry has: the phrase and its variants, what it expands to, a source note,
//    and a status (approved | pending). The interpreter reads ONLY approved entries.
//  - An entry NEVER widens a scope beyond the models it names.
//  - Groupings are opinions: each records who defined it and is shown in full on the
//    reading card; they are drafted PENDING and Sam approves each (spec s12 decision 3).
//  - Every expansion is checked against the resolver + lib/generations.js + the archive.
//    An expansion with no sales is FLAGGED, not hidden.
//
// This module is PURE DATA + PURE HELPERS (no I/O). The validator (validate.js) does the
// resolver/generation/archive checks; the read-only prod probe supplies archive counts.
//
// Expansion model. Every entry declares a `type` and a typed payload:
//  scope        -> models: [ {make, model, yearStart, yearEnd, generation|null, trim?, body?} ]
//  grouping     -> members: [ ...scope members ], definedBy
//  era          -> yearRange: [start, end]   (MODEL-year span, spec s6/s4)
//  window       -> window: "<WINDOWS token>"  (from query.js WINDOWS)
//  channel      -> channel: "online" | "house" | "all"
//  venue        -> venue: "<label>"  (+ event:{ from,to,label } when it is an event)
//  price        -> price: { min?, max?, op?, unit:"usd" }   (fixed phrases only; $-amounts are parsed live)
//  mileage      -> mileage: { band:"low"|"high" }           (threshold resolved per era at lookup, s6)
//  metric       -> metric: { measure:"<MEASURES>", sort:"desc"|"asc", ask?:[...], note? }
//  body         -> body: "coupe" | "convertible" | ...
//  transmission -> transmission: "manual" | "automatic" | "other"
//  structural   -> structural: { kind:"comparison"|"group_by"|"limit", dimension?, n? }
//
// A `generation` is set ONLY when lib/generations.js carries that exact code for that
// make+model; a platform/multi-generation code (F-body, E39-as-5-Series) sets generation
// null and relies on the year span. The validator/golden assert generation existence only
// where a generation is declared, and the count probe flags any member with zero sales.
// =====================================================================

export const DICTIONARY_VERSION = "2026-09-24.1";

// ---------------------------------------------------------------------
// Low-mile / high-mile thresholds by era — CONFIGURATION, not code (spec s6).
// "Era thresholds and defaults live beside the dictionary so Sam can change them."
// low-mile = under the threshold for the car's MODEL-YEAR era; high-mile = above it.
// ---------------------------------------------------------------------
export const MILEAGE_THRESHOLDS = {
  bands: [
    { fromYear: 2010, toYear: 9999, lowMax: 10000 },  // 2010+  : under 10k
    { fromYear: 1990, toYear: 2009, lowMax: 30000 },  // 1990-2009: under 30k
    { fromYear: 0,    toYear: 1989, lowMax: 50000 }   // before 1990: under 50k
  ],
  note: "spec s6; editable beside the dictionary; a chip shows the applied threshold and the user can change it"
};

// Threshold for a given model year (used by the lookup + validator, never hard-coded elsewhere).
export function lowMileThresholdForYear(year) {
  const y = Number(year);
  const b = MILEAGE_THRESHOLDS.bands.find(x => y >= x.fromYear && y <= x.toYear);
  return b ? b.lowMax : MILEAGE_THRESHOLDS.bands[MILEAGE_THRESHOLDS.bands.length - 1].lowMax;
}

// ---------------------------------------------------------------------
// Builders (keep the entry list compact + uniform).
// ---------------------------------------------------------------------
const m = (make, model, yearStart, yearEnd, generation = null, extra = {}) =>
  ({ make, model, yearStart, yearEnd, generation, ...extra });

const scope = (phrase, variants, models, source, status = "approved", note = null) =>
  ({ phrase, variants, category: "platform_chassis", type: "scope", models, source, status, note });

const nick = (phrase, variants, models, source, status = "approved", note = null) =>
  ({ phrase, variants, category: "nickname", type: "scope", models, source, status, note });

const era = (phrase, variants, yearRange, source, status = "approved", note = null) =>
  ({ phrase, variants, category: "era", type: "era", yearRange, source, status, note });

const win = (phrase, variants, window, source, status = "approved", note = null) =>
  ({ phrase, variants, category: "window", type: "window", window, source, status, note });

const chan = (phrase, variants, channel, source, status = "approved", note = null) =>
  ({ phrase, variants, category: "channel", type: "channel", channel, source, status, note });

const venue = (phrase, variants, venueLabel, source, event = null, status = "approved", note = null) =>
  ({ phrase, variants, category: "venue", type: "venue", venue: venueLabel, event, source, status, note });

const price = (phrase, variants, priceObj, source, status = "approved", note = null) =>
  ({ phrase, variants, category: "price", type: "price", price: priceObj, source, status, note });

const miles = (phrase, variants, band, source, status = "approved", note = null) =>
  ({ phrase, variants, category: "mileage", type: "mileage", mileage: { band }, source, status, note });

const metric = (phrase, variants, metricObj, source, status = "approved", note = null) =>
  ({ phrase, variants, category: "metric", type: "metric", metric: metricObj, source, status, note });

const body = (phrase, variants, bodyVal, source, status = "approved", note = null) =>
  ({ phrase, variants, category: "body", type: "body", body: bodyVal, source, status, note });

const trans = (phrase, variants, transmission, source, status = "approved", note = null) =>
  ({ phrase, variants, category: "transmission", type: "transmission", transmission, source, status, note });

const struct = (phrase, variants, structural, source, status = "approved", note = null) =>
  ({ phrase, variants, category: "structural", type: "structural", structural, source, status, note });

// =====================================================================
// PLATFORM AND CHASSIS CODES
// generation set only where lib/generations.js carries that code for that make+model.
// =====================================================================
const CHASSIS = [
  // --- Ford Mustang platform codes (Mustang gens are in generations.js) ---
  scope("Fox body", ["fox-body", "foxbody", "fox body mustang", "fox"], [m("Ford", "Mustang", 1979, 1993, "Fox-body")], "Ford Mustang chassis; generations.js Fox-body 1979-1993"),
  scope("SN95", ["sn-95", "sn95 mustang"], [m("Ford", "Mustang", 1994, 2004, "SN95")], "Ford Mustang chassis; generations.js SN95 1994-2004 (incl New Edge)"),
  scope("New Edge", ["new-edge", "new edge mustang"], [m("Ford", "Mustang", 1999, 2004, null)], "Ford Mustang SN95 facelift; no separate generations.js code, resolves as Mustang 1999-2004", "approved", "SN95 sub-generation; generation left null (folded into SN95 in generations.js)"),
  scope("S197", ["s-197"], [m("Ford", "Mustang", 2005, 2014, "S197")], "Ford Mustang chassis; generations.js S197 2005-2014"),
  scope("S550", ["s-550"], [m("Ford", "Mustang", 2015, 2023, "S550")], "Ford Mustang chassis; generations.js S550 2015-2023"),
  scope("S650", ["s-650"], [m("Ford", "Mustang", 2024, 2026, "S650")], "Ford Mustang chassis; generations.js S650 2024+"),

  // --- GM F-body (Camaro + Firebird/Trans Am); platform spans 4 gens 1967-2002 ---
  scope("F-body", ["f body", "fbody", "f-body cars", "gm f-body"],
    [m("Chevrolet", "Camaro", 1967, 2002, null), m("Pontiac", "Firebird", 1967, 2002, null)],
    "GM F-body platform; Camaro (generations.js first-sixth) + Pontiac Firebird incl Trans Am", "approved",
    "Firebird/Trans Am have no generations.js mapping; expansion is make+model+year span and resolves via the resolver"),

  // --- GM / Mopar / Ford body platforms (multi-model; drafted APPROVED as named-model lists) ---
  scope("A-body", ["a body", "gm a-body", "gm a body"],
    [m("Chevrolet", "Chevelle", 1964, 1977, null), m("Pontiac", "GTO", 1964, 1972, null), m("Oldsmobile", "Cutlass", 1964, 1977, null), m("Buick", "Skylark", 1964, 1972, null)],
    "GM A-body intermediate platform", "pending",
    "Oldsmobile Cutlass / Buick Skylark not in generations.js; pending Sam review + archive count"),
  scope("G-body", ["g body", "gm g-body", "gm g body"],
    [m("Chevrolet", "Monte Carlo", 1978, 1988, null), m("Oldsmobile", "Cutlass", 1978, 1988, null), m("Buick", "Regal", 1978, 1987, null), m("Pontiac", "Grand Prix", 1978, 1987, null)],
    "GM G-body platform (Regal Grand National etc.)", "pending",
    "None of these models are in generations.js; pending Sam review + archive count"),
  scope("B-body", ["b body", "mopar b-body", "b-body mopar"],
    [m("Dodge", "Charger", 1966, 1978, null), m("Plymouth", "Road Runner", 1968, 1975, null), m("Plymouth", "GTX", 1967, 1974, null), m("Dodge", "Coronet", 1965, 1976, null)],
    "Mopar B-body platform", "pending",
    "Road Runner/GTX/Coronet not in generations.js; pending Sam review + archive count"),
  scope("E-body", ["e body", "mopar e-body", "e-body mopar"],
    [m("Dodge", "Challenger", 1970, 1974, "first"), m("Plymouth", "Barracuda", 1970, 1974, null)],
    "Mopar E-body platform (Challenger + 'Cuda)", "pending",
    "Barracuda not in generations.js; Challenger 'first' gen present; pending Sam review"),
  scope("Panther", ["panther platform", "ford panther"],
    [m("Ford", "Crown Victoria", 1979, 2011, null), m("Mercury", "Grand Marquis", 1979, 2011, null), m("Lincoln", "Town Car", 1981, 2011, null)],
    "Ford Panther platform", "pending",
    "None in generations.js; likely thin in the collector archive; pending Sam review + count"),

  // --- BMW 3-Series platform (E-codes; generation exists under 3-Series) ---
  scope("E21", ["e-21"], [m("BMW", "3-Series", 1975, 1983, "e21")], "BMW 3-Series generation; generations.js e21"),
  scope("E30", ["e-30"], [m("BMW", "3-Series", 1984, 1991, "e30")], "BMW 3-Series generation e30 (incl M3 e30); generations.js", "approved", "ambiguous 3-Series vs M3; the lookup narrows to M3 when 'M3' is present, else the platform"),
  scope("E36", ["e-36"], [m("BMW", "3-Series", 1992, 1998, "e36")], "BMW 3-Series generation; generations.js e36"),
  scope("E46", ["e-46"], [m("BMW", "3-Series", 1999, 2005, "e46")], "BMW 3-Series generation; generations.js e46"),
  scope("E90", ["e-90"], [m("BMW", "3-Series", 2006, 2011, "e90")], "BMW 3-Series generation; generations.js e90"),
  scope("F30", ["f-30"], [m("BMW", "3-Series", 2012, 2018, "f30")], "BMW 3-Series generation; generations.js f30"),
  scope("G20", ["g-20"], [m("BMW", "3-Series", 2019, 2026, "g20")], "BMW 3-Series generation; generations.js g20"),
  // --- BMW M2/M4 chassis (gens exist under M2/M4) ---
  scope("F80", ["f-80"], [m("BMW", "M3", 2014, 2018, "f80")], "BMW M3 generation; generations.js f80"),
  scope("G80", ["g-80"], [m("BMW", "M3", 2021, 2026, "g80")], "BMW M3 generation; generations.js g80"),
  scope("F82", ["f-82"], [m("BMW", "M4", 2014, 2020, "f82")], "BMW M4 generation; generations.js f82"),
  scope("G82", ["g-82"], [m("BMW", "M4", 2021, 2026, "g82")], "BMW M4 generation; generations.js g82"),
  scope("F87", ["f-87"], [m("BMW", "M2", 2016, 2020, "f87")], "BMW M2 generation; generations.js f87"),
  scope("G87", ["g-87"], [m("BMW", "M2", 2023, 2026, "g87")], "BMW M2 generation; generations.js g87"),
  // --- BMW 5-Series/M5 chassis (gens exist under M5) ---
  scope("E28", ["e-28"], [m("BMW", "M5", 1985, 1988, "e28")], "BMW M5 generation; generations.js e28 (E28 5-Series platform)"),
  scope("E34", ["e-34"], [m("BMW", "M5", 1989, 1995, "e34")], "BMW M5 generation; generations.js e34"),
  scope("E39", ["e-39"], [m("BMW", "M5", 1998, 2003, "e39")], "BMW M5 generation; generations.js e39"),
  scope("E60", ["e-60"], [m("BMW", "M5", 2005, 2010, "e60")], "BMW M5 generation; generations.js e60"),
  scope("F10", ["f-10"], [m("BMW", "M5", 2011, 2016, "f10")], "BMW M5 generation; generations.js f10"),
  scope("F90", ["f-90"], [m("BMW", "M5", 2018, 2023, "f90")], "BMW M5 generation; generations.js f90"),

  // --- Porsche 911 + family codes ---
  scope("901", ["pre-impact-bumper 911"], [m("Porsche", "911", 1964, 1973, "901")], "Porsche 911 generation; generations.js 901"),
  scope("930", ["porsche 930"], [m("Porsche", "911", 1974, 1988, "930")], "Porsche 911 generation; generations.js 930"),
  scope("964", ["porsche 964"], [m("Porsche", "911", 1990, 1994, "964")], "Porsche 911 generation; generations.js 964"),
  scope("993", ["porsche 993"], [m("Porsche", "911", 1994, 1998, "993")], "Porsche 911 generation; generations.js 993 (last air-cooled)"),
  scope("996", ["porsche 996"], [m("Porsche", "911", 1999, 2004, "996")], "Porsche 911 generation; generations.js 996 (also filed as its own model)"),
  scope("997", ["porsche 997"], [m("Porsche", "911", 2005, 2011, "997")], "Porsche 911 generation; generations.js 997"),
  scope("991", ["porsche 991"], [m("Porsche", "911", 2012, 2019, "991.1")], "Porsche 911 generation; generations.js 991.1/991.2 span"),
  scope("991.1", ["991 point 1"], [m("Porsche", "911", 2012, 2016, "991.1")], "Porsche 911 generation; generations.js 991.1"),
  scope("991.2", ["991 point 2"], [m("Porsche", "911", 2017, 2019, "991.2")], "Porsche 911 generation; generations.js 991.2"),
  scope("992", ["porsche 992"], [m("Porsche", "911", 2020, 2026, "992")], "Porsche 911 generation; generations.js 992"),
  scope("986", ["porsche 986"], [m("Porsche", "Boxster", 1997, 2004, "986")], "Porsche Boxster generation; generations.js 986"),
  scope("987", ["porsche 987"], [m("Porsche", "Boxster", 2005, 2012, "987"), m("Porsche", "Cayman", 2006, 2012, "987")], "Porsche Boxster/Cayman generation; generations.js 987"),
  scope("981", ["porsche 981"], [m("Porsche", "Boxster", 2013, 2016, "981"), m("Porsche", "Cayman", 2013, 2016, "981")], "Porsche Boxster/Cayman generation; generations.js 981"),
  scope("718", ["porsche 718"], [m("Porsche", "Boxster", 2017, 2026, "718"), m("Porsche", "Cayman", 2017, 2026, "718")], "Porsche Boxster/Cayman generation; generations.js 718"),
  scope("970", ["panamera 970"], [m("Porsche", "Panamera", 2010, 2016, "970")], "Porsche Panamera generation; generations.js 970"),
  scope("971", ["panamera 971"], [m("Porsche", "Panamera", 2017, 2023, "971")], "Porsche Panamera generation; generations.js 971"),

  // --- Chevrolet Corvette generations ---
  scope("C1", ["c-1 corvette", "c1 corvette"], [m("Chevrolet", "Corvette", 1953, 1962, "C1")], "Corvette generation; generations.js C1"),
  scope("C2", ["c-2 corvette", "c2 corvette", "midyear", "mid-year corvette"], [m("Chevrolet", "Corvette", 1963, 1967, "C2")], "Corvette generation; generations.js C2 (split-window 1963)"),
  scope("C3", ["c-3 corvette", "c3 corvette"], [m("Chevrolet", "Corvette", 1968, 1982, "C3")], "Corvette generation; generations.js C3"),
  scope("C4", ["c-4 corvette", "c4 corvette"], [m("Chevrolet", "Corvette", 1984, 1996, "C4")], "Corvette generation; generations.js C4"),
  scope("C5", ["c-5 corvette", "c5 corvette"], [m("Chevrolet", "Corvette", 1997, 2004, "C5")], "Corvette generation; generations.js C5"),
  scope("C6", ["c-6 corvette", "c6 corvette"], [m("Chevrolet", "Corvette", 2005, 2013, "C6")], "Corvette generation; generations.js C6"),
  scope("C7", ["c-7 corvette", "c7 corvette"], [m("Chevrolet", "Corvette", 2014, 2019, "C7")], "Corvette generation; generations.js C7"),
  scope("C8", ["c-8 corvette", "c8 corvette"], [m("Chevrolet", "Corvette", 2020, 2026, "C8")], "Corvette generation; generations.js C8"),

  // --- Japanese chassis codes ---
  scope("NA Miata", ["na miata", "na mx-5", "na roadster"], [m("Mazda", "MX-5", 1990, 1997, "NA")], "Mazda MX-5 generation; generations.js NA"),
  scope("NB Miata", ["nb miata", "nb mx-5"], [m("Mazda", "MX-5", 1999, 2005, "NB")], "Mazda MX-5 generation; generations.js NB"),
  scope("NC Miata", ["nc miata", "nc mx-5"], [m("Mazda", "MX-5", 2006, 2015, "NC")], "Mazda MX-5 generation; generations.js NC"),
  scope("ND Miata", ["nd miata", "nd mx-5"], [m("Mazda", "MX-5", 2016, 2026, "ND")], "Mazda MX-5 generation; generations.js ND"),
  scope("FC", ["fc rx-7", "fc rx7"], [m("Mazda", "RX-7", 1986, 1991, null)], "Mazda RX-7 second gen (FC)", "approved", "RX-7 not in generations.js; resolves as make+model+year span"),
  scope("FD", ["fd rx-7", "fd rx7"], [m("Mazda", "RX-7", 1993, 2002, null)], "Mazda RX-7 third gen (FD)", "approved", "RX-7 not in generations.js; resolves as make+model+year span"),
  scope("Z32", ["z32 300zx", "z32"], [m("Nissan", "300ZX", 1990, 1996, null)], "Nissan 300ZX (Z32)", "approved", "300ZX not in generations.js; resolves as make+model+year span"),
  scope("R32", ["r32 skyline", "bnr32"], [m("Nissan", "Skyline", 1989, 1994, "R32")], "Nissan Skyline generation; generations.js R32"),
  scope("R33", ["r33 skyline", "bcnr33"], [m("Nissan", "Skyline", 1995, 1998, "R33")], "Nissan Skyline generation; generations.js R33"),
  scope("R34", ["r34 skyline", "bnr34"], [m("Nissan", "Skyline", 1999, 2002, "R34")], "Nissan Skyline generation; generations.js R34"),
  scope("AE86", ["ae-86", "hachiroku", "eight-six"], [m("Toyota", "Corolla", 1985, 1987, "AE86")], "Toyota Corolla generation; generations.js AE86"),
  scope("A70 Supra", ["a70 supra", "mk3 supra", "mkiii supra"], [m("Toyota", "Supra", 1986, 1992, "A70")], "Toyota Supra generation; generations.js A70"),
  scope("A80 Supra", ["a80 supra", "mk4 supra", "mkiv supra"], [m("Toyota", "Supra", 1993, 1998, "A80")], "Toyota Supra generation; generations.js A80"),
  scope("A90 Supra", ["a90 supra", "mk5 supra", "mkv supra"], [m("Toyota", "Supra", 2019, 2026, "A90")], "Toyota Supra generation; generations.js A90"),
  scope("AP1", ["ap1 s2000"], [m("Honda", "S2000", 2000, 2003, "AP1")], "Honda S2000 generation; generations.js AP1"),
  scope("AP2", ["ap2 s2000"], [m("Honda", "S2000", 2004, 2009, "AP2")], "Honda S2000 generation; generations.js AP2"),

  // --- Mercedes W/R codes (S-Class + SL-Class in generations.js) ---
  scope("W113", ["w-113", "pagoda chassis"], [m("Mercedes-Benz", "SL-Class", 1963, 1971, "w113")], "Mercedes SL generation; generations.js w113 (Pagoda)"),
  scope("R107", ["r-107"], [m("Mercedes-Benz", "SL-Class", 1972, 1989, "r107")], "Mercedes SL generation; generations.js r107"),
  scope("R129", ["r-129"], [m("Mercedes-Benz", "SL-Class", 1990, 2002, "r129")], "Mercedes SL generation; generations.js r129"),
  scope("W116", ["w-116"], [m("Mercedes-Benz", "S-Class", 1973, 1980, "w116")], "Mercedes S-Class generation; generations.js w116"),
  scope("W126", ["w-126"], [m("Mercedes-Benz", "S-Class", 1981, 1991, "w126")], "Mercedes S-Class generation; generations.js w126"),
  scope("W140", ["w-140"], [m("Mercedes-Benz", "S-Class", 1992, 1999, "w140")], "Mercedes S-Class generation; generations.js w140"),
  scope("W220", ["w-220"], [m("Mercedes-Benz", "S-Class", 2000, 2006, "w220")], "Mercedes S-Class generation; generations.js w220"),
  scope("W221", ["w-221"], [m("Mercedes-Benz", "S-Class", 2007, 2013, "w221")], "Mercedes S-Class generation; generations.js w221"),
  scope("W222", ["w-222"], [m("Mercedes-Benz", "S-Class", 2014, 2020, "w222")], "Mercedes S-Class generation; generations.js w222"),
  scope("W201", ["w-201", "190e", "baby benz"], [m("Mercedes-Benz", "190E", 1983, 1993, null)], "Mercedes W201 (190E)", "approved", "190E not in generations.js; resolves as make+model+year span"),
  scope("W124", ["w-124", "e-class w124"], [m("Mercedes-Benz", "E-Class", 1985, 1995, null)], "Mercedes W124 (E-Class)", "approved", "W124 not in generations.js; resolves as make+model+year span"),

  // --- Audi codes ---
  scope("B5", ["b5 a4"], [m("Audi", "A4", 1996, 2001, "B5")], "Audi A4 generation; generations.js B5"),
  scope("B6", ["b6 a4"], [m("Audi", "A4", 2002, 2004, "B6")], "Audi A4 generation; generations.js B6"),
  scope("B7", ["b7 a4"], [m("Audi", "A4", 2006, 2008, "B7")], "Audi A4 generation; generations.js B7"),
  scope("B8", ["b8 a4"], [m("Audi", "A4", 2009, 2016, "B8")], "Audi A4 generation; generations.js B8"),
  scope("C5 Audi", ["c5 a6"], [m("Audi", "A6", 1998, 2004, "C5")], "Audi A6 generation; generations.js C5"),

  // --- Jaguar / MG / VW ---
  scope("Series 1 E-Type", ["series 1 e-type", "s1 e-type", "series one e-type"], [m("Jaguar", "E-Type", 1961, 1968, "Series-1")], "Jaguar E-Type generation; generations.js Series-1"),
  scope("Series 2 E-Type", ["series 2 e-type", "s2 e-type"], [m("Jaguar", "E-Type", 1969, 1970, "Series-2")], "Jaguar E-Type generation; generations.js Series-2"),
  scope("Series 3 E-Type", ["series 3 e-type", "s3 e-type", "v12 e-type"], [m("Jaguar", "E-Type", 1971, 1974, "Series-3")], "Jaguar E-Type generation; generations.js Series-3"),
  scope("chrome bumper MGB", ["chrome-bumper mgb", "chrome bumper b"], [m("MG", "MGB", 1963, 1974, "chrome-bumper")], "MGB generation; generations.js chrome-bumper"),
  scope("rubber bumper MGB", ["rubber-bumper mgb", "rubber bumper b"], [m("MG", "MGB", 1975, 1980, "rubber-bumper")], "MGB generation; generations.js rubber-bumper"),
  scope("T1 Bus", ["t1 bus", "split-window bus", "splitty"], [m("Volkswagen", "Bus", 1950, 1967, "T1")], "VW Bus generation; generations.js T1"),
  scope("T2 Bus", ["t2 bus", "bay-window bus", "bay window bus"], [m("Volkswagen", "Bus", 1968, 1979, "T2")], "VW Bus generation; generations.js T2"),
  scope("T3 Bus", ["t3 bus", "vanagon"], [m("Volkswagen", "Bus", 1980, 1991, "T3")], "VW Bus generation; generations.js T3")
];

// =====================================================================
// NICKNAMES
// =====================================================================
const NICKNAMES = [
  nick("Vette", ["corvette (vette)"], [m("Chevrolet", "Corvette", 1953, 2026, null)], "Corvette nickname"),
  nick("Stang", ["'stang", "the stang"], [m("Ford", "Mustang", 1965, 2026, null)], "Mustang nickname"),
  nick("Bimmer", ["beemer"], [m("BMW", null, null, null, null, { makeOnly: true })], "BMW nickname (make-level; needs a model or era to scope)", "approved", "make-only nickname; the interpreter must pair it with a model, code or era before it runs"),
  nick("Benz", ["merc", "mercedes"], [m("Mercedes-Benz", null, null, null, null, { makeOnly: true })], "Mercedes-Benz nickname (make-level)", "approved", "make-only; needs a model or code"),
  nick("Jag", ["the jag"], [m("Jaguar", null, null, null, null, { makeOnly: true })], "Jaguar nickname (make-level)", "approved", "make-only; needs a model"),
  nick("Rover", ["landie", "landy"], [m("Land Rover", null, null, null, null, { makeOnly: true })], "Land Rover nickname (make-level)", "approved", "make-only; guard against Range Rover misparse (see resolver)"),
  nick("Porker", ["porsche (porker)"], [m("Porsche", null, null, null, null, { makeOnly: true })], "Porsche nickname (make-level)", "approved", "make-only; needs a model or code"),
  nick("Cuda", ["'cuda", "barracuda"], [m("Plymouth", "Barracuda", 1964, 1974, null)], "Plymouth Barracuda nickname"),
  nick("Bird", ["the bird"], [m("Ford", "Thunderbird", 1955, 2005, null), m("Pontiac", "Firebird", 1967, 2002, null)], "AMBIGUOUS: Thunderbird or Firebird", "approved", "spec s7/s9: ask which unless a make/era disambiguates; 'screaming chicken' -> Firebird Trans Am"),
  nick("T/A", ["ta", "trans am", "trans-am"], [m("Pontiac", "Firebird", 1969, 2002, null, { trim: "Trans Am" })], "Pontiac Firebird Trans Am"),
  nick("Screaming Chicken", ["screaming chicken"], [m("Pontiac", "Firebird", 1970, 1981, null, { trim: "Trans Am" })], "Firebird Trans Am (hood-bird decal); disambiguates 'Bird'"),
  nick("GTI", ["golf gti", "vw gti"], [m("Volkswagen", "Golf GTI", 1983, 2026, null)], "VW Golf GTI"),
  nick("Beetle", ["bug", "vw bug", "vw beetle"], [m("Volkswagen", "Beetle", 1946, 2003, null)], "VW Beetle (classic air-cooled)", "approved", "classic Beetle; the New Beetle 1998+ is a distinct water-cooled car, disambiguate by era if needed"),
  nick("Pagoda", ["pagoda sl", "230sl 250sl 280sl"], [m("Mercedes-Benz", "SL-Class", 1963, 1971, "w113")], "Mercedes W113 SL (Pagoda roof)"),
  nick("Gullwing", ["300sl gullwing", "gull wing"], [m("Mercedes-Benz", "300SL", 1954, 1957, null, { body: "coupe" })], "Mercedes 300SL Gullwing coupe"),
  nick("Widowmaker", ["widow-maker", "widow maker"], [m("Porsche", "911", 1975, 1989, "930", { trim: "Turbo" })], "Porsche 930 Turbo (widowmaker)"),
  nick("Duck", ["deux chevaux", "2cv"], [m("Citroen", "2CV", 1948, 1990, null)], "Citroen 2CV (the Duck)", "approved", "rare in a US-hammer archive; count probe will flag if thin"),
  nick("Deuce", ["deuce coupe", "'32 ford"], [m("Ford", "Model 18", 1932, 1934, null)], "1932 Ford (Deuce)", "pending", "hot-rod nickname; model naming varies in the archive, pending a count check"),
  nick("Tri-Five", ["tri five", "tri-five chevy", "55 56 57 chevy"], [m("Chevrolet", "Bel Air", 1955, 1957, null), m("Chevrolet", "150", 1955, 1957, null), m("Chevrolet", "210", 1955, 1957, null)], "Tri-Five Chevrolet 1955-57", "approved", "Bel Air is the common survivor; 150/210 thinner"),
  nick("Miata", ["mx5", "mx-5 miata"], [m("Mazda", "MX-5", 1990, 2026, null)], "Mazda MX-5 Miata (all generations)"),
  nick("Lambo", ["lambo", "lamborghini"], [m("Lamborghini", null, null, null, null, { makeOnly: true })], "Lamborghini nickname (make-level)", "approved", "make-only; needs a model"),
  nick("Ferrari", ["fezza", "prancing horse"], [m("Ferrari", null, null, null, null, { makeOnly: true })], "Ferrari nickname (make-level)", "approved", "make-only; needs a model"),
  nick("Lusso", ["250 lusso", "gt lusso"], [m("Ferrari", "250 GT Lusso", 1962, 1964, null)], "Ferrari 250 GT Lusso (test-set Q12)"),
  nick("Testarossa", ["testa rossa (tr)"], [m("Ferrari", "Testarossa", 1984, 1991, null)], "Ferrari Testarossa (test-set Q21)"),
  nick("Z28", ["z/28", "z-28", "camaro z28"], [m("Chevrolet", "Camaro", 1967, 2002, null, { trim: "Z/28" })], "Chevrolet Camaro Z/28 (test-set Q4)"),
  nick("WS6", ["ws-6", "trans am ws6", "ws6 trans am"], [m("Pontiac", "Firebird", 1996, 2002, null, { trim: "Trans Am WS6" })], "Pontiac Firebird Trans Am WS6 package (test-set Q4)"),
  nick("Defender 90", ["defender ninety", "d90", "def 90"], [m("Land Rover", "Defender", 1983, 2016, null, { trim: "90" })], "Land Rover Defender 90 (test-set Q22)", "approved", "NAS market-spec is applied by the resolver's marketSpec layer, not the dictionary")
];

// =====================================================================
// ERAS AND DECADES (MODEL-year spans, stated per spec s4)
// =====================================================================
const ERAS = [
  era("60s", ["sixties", "1960s"], [1960, 1969], "decade -> model years 1960-1969"),
  era("70s", ["seventies", "1970s"], [1970, 1979], "decade -> model years 1970-1979"),
  era("80s", ["eighties", "1980s"], [1980, 1989], "decade -> model years 1980-1989"),
  era("90s", ["nineties", "1990s"], [1990, 1999], "decade -> model years 1990-1999"),
  era("2000s", ["two-thousands", "aughts"], [2000, 2009], "decade -> model years 2000-2009"),
  era("2010s", ["twenty-tens"], [2010, 2019], "decade -> model years 2010-2019"),
  era("pre-war", ["prewar", "pre war"], [1900, 1941], "before WWII US production"),
  era("post-war", ["postwar", "post war"], [1946, 1959], "post-WWII to 1959"),
  era("malaise era", ["malaise", "malaise-era"], [1973, 1983], "US emissions/insurance downturn 1973-1983 (also a grouping)"),
  era("radwood era", ["radwood", "rad era"], [1980, 1999], "Radwood-eligible 1980-1999"),
  era("youngtimer", ["youngtimers", "young-timer"], [1990, 2006], "youngtimer 20-30yr band (rolling; pinned 1990-2006 for now)", "approved", "rolling band; pinned as configuration, revisit yearly"),
  era("modern classic", ["modern classics", "future classic"], [2000, 2015], "modern-classic band", "pending", "fuzzy band; pending Sam sign-off on the years"),
  era("brass era", ["brass-era"], [1896, 1915], "brass era", "pending", "likely near-zero in a hammer archive; pending count")
];

// =====================================================================
// WINDOWS (map to query.js WINDOWS tokens)
// =====================================================================
const WINDOWS_DICT = [
  win("this year", ["ytd", "year to date", "so far this year"], "ytd", "spec s5: this year = YTD"),
  win("last year", ["prior year"], "last_year", "calendar prior year"),
  win("in 2025", ["2025"], "last_year", "explicit calendar year -> executor sale_from/sale_to; token last_year is a placeholder resolved to the named year", "approved", "a bare year is resolved to an explicit sale-date range by the lookup, not this token"),
  win("last 3 years", ["past 3 years", "last three years", "three years", "3 years", "trailing 3 years"], "36mo", "spec: last 3 years = 36 months"),
  win("last 24 months", ["past 24 months", "two years", "last two years", "last 2 years"], "24mo", "24 months"),
  win("past 18 months", ["last 18 months", "18 months"], "18mo", "18 months"),
  win("last 12 months", ["past year", "trailing twelve months", "ttm", "last twelve months"], "12mo", "12 months"),
  win("last 6 months", ["past 6 months", "six months"], "6mo", "6 months"),
  win("last 90 days", ["past 90 days", "last quarter (90d)"], "90d", "90 days"),
  win("last 30 days", ["past 30 days", "last month"], "30d", "30 days"),
  win("last week", ["past week", "last 7 days", "7 days"], "7d", "7 days (thin; offer 30 days per spec s9)"),
  win("this quarter", ["current quarter"], "this_quarter", "this quarter"),
  win("last quarter", ["previous quarter", "prior quarter"], "last_quarter", "last quarter"),
  win("quarter to date", ["qtd"], "qtd", "quarter to date"),
  win("since 2023", ["from 2023"], "36mo", "since a stated year -> explicit sale_from at the lookup; token is a placeholder", "approved", "resolved to sale_from=2023-01-01 by the lookup"),
  win("Monterey week", ["monterey week", "car week", "pebble week"], "36mo", "event window -> the Monterey venue's event dates (see venue entry)", "approved", "an event window, not a relative token; the venue entry carries the dates")
];

// =====================================================================
// CHANNELS
// =====================================================================
const CHANNELS = [
  chan("online", ["on-line", "online only", "online platforms"], "online", "channel filter online"),
  chan("live", ["live sale", "in the room", "at the block"], "house", "live house-room sale", "approved", "'live' maps to the house channel; sale_type=live narrows to the room within it"),
  chan("the houses", ["at the houses", "at auction houses", "auction houses", "houses", "the auction houses"], "house", "channel filter house"),
  chan("at auction", ["auction only", "under the hammer"], "house", "auction (house) channel", "approved", "distinct from online platforms; used when the user contrasts with private/dealer"),
  chan("all channels", ["everywhere", "any channel", "online and houses"], "all", "no channel filter")
];

// =====================================================================
// VENUES (source labels) + EVENTS (venue + dates)
// =====================================================================
const VENUES = [
  venue("BaT", ["bring a trailer", "bringatrailer", "bat"], "Bring a Trailer", "source label -> Bring a Trailer"),
  venue("Cars and Bids", ["c&b", "cars & bids", "carsandbids", "c and b"], "Cars & Bids", "source label -> Cars & Bids"),
  venue("PCARMarket", ["pcar", "pcarmarket", "pcar market"], "PCARMarket", "source label -> PCARMarket"),
  venue("RM Sotheby's", ["rm", "rm sothebys", "rm sotheby's", "rms"], "RM Sotheby's", "house source label -> RM Sotheby's"),
  venue("Gooding", ["gooding & co", "gooding and company", "gooding christie's"], "Gooding & Co", "house source label -> Gooding & Co"),
  venue("Barrett-Jackson", ["b-j", "bj", "barrett jackson", "barrettjackson"], "Barrett-Jackson", "house source label -> Barrett-Jackson"),
  venue("Broad Arrow", ["broadarrow", "broad-arrow"], "Broad Arrow", "house source label -> Broad Arrow"),
  venue("Mecum", ["mecum auctions"], "Mecum Auctions", "house source label -> Mecum Auctions"),
  venue("Bonhams", ["bonhams|cars"], "Bonhams", "house source label -> Bonhams"),
  venue("Hagerty", ["hagerty marketplace"], "Hagerty", "source label -> Hagerty"),
  venue("Hemmings", ["hemmings auctions"], "Hemmings", "source label -> Hemmings"),
  venue("Collecting Cars", ["collectingcars"], "Collecting Cars", "source label -> Collecting Cars"),
  venue("Car & Classic", ["car and classic", "carandclassic"], "Car & Classic", "source label -> Car & Classic"),
  venue("The Market", ["themarket", "the market by bonhams"], "The Market", "source label -> The Market"),
  venue("PistonHeads", ["piston heads", "pistonheads"], "PistonHeads", "source label -> PistonHeads"),
  venue("MB Market", ["mbmarket", "mb-market"], "MB Market", "source label -> MB Market"),
  venue("Sotheby's Motorsport", ["somo", "sothebys motorsport"], "Sotheby's Motorsport", "source label -> Sotheby's Motorsport"),
  // Events: venue = all houses present, scoped to the event's dates. Dates curated per year.
  venue("Monterey", ["monterey week", "pebble beach", "car week", "monterey"], "__event__", "Monterey Car Week (all houses)", { label: "Monterey Car Week", from: "2026-08-13", to: "2026-08-16", note: "annual mid-August; dates curated per year" }),
  venue("Scottsdale", ["scottsdale", "arizona week"], "__event__", "Scottsdale/Arizona auction week (all houses)", { label: "Scottsdale Week", from: "2026-01-20", to: "2026-01-28", note: "annual late-January; dates curated per year" }),
  venue("Amelia", ["amelia island", "amelia"], "__event__", "Amelia Island (all houses)", { label: "Amelia Island", from: "2026-03-05", to: "2026-03-08", note: "annual early-March; dates curated per year" }),
  venue("Kissimmee", ["kissimmee", "mecum kissimmee"], "__event__", "Mecum Kissimmee (Mecum)", { label: "Mecum Kissimmee", from: "2026-01-02", to: "2026-01-11", note: "annual early-January; Mecum's flagship; dates curated per year" })
];

// =====================================================================
// PRICE (fixed phrases only; $-amounts like "under $100k" are parsed live by the lookup)
// =====================================================================
const PRICES = [
  price("six figures", ["6 figures", "six-figure"], { min: 100000, max: 999999, unit: "usd" }, "spec s4 example: six figures = $100k-$999,999"),
  price("five figures", ["5 figures"], { min: 10000, max: 99999, unit: "usd" }, "five figures = $10k-$99,999"),
  price("seven figures", ["7 figures", "seven-figure", "a million-plus"], { min: 1000000, unit: "usd" }, "seven figures = $1,000,000+"),
  price("under six figures", ["sub-six-figure", "double digits (thousands)"], { max: 99999, unit: "usd" }, "under $100k"),
  price("high-dollar", ["big money"], { min: 250000, unit: "usd" }, "loose 'expensive' floor", "pending", "vague; pending a Sam-set floor")
];

// =====================================================================
// MILEAGE (thresholds resolved per era at lookup time; s6)
// =====================================================================
const MILEAGES = [
  miles("low-mile", ["low mileage", "low miles", "low-mileage", "low km"], "low", "spec s6: low-mile = under the era threshold (chip shows it)"),
  miles("delivery-mile", ["delivery mileage", "delivery-mileage", "sub-delivery"], "low", "delivery-mileage -> the low-mile band, era threshold applies", "approved", "treated as the low-mile band"),
  miles("high-mile", ["high mileage", "high miles", "driver", "driver-quality miles"], "high", "spec s6: high-mile/driver = above the era threshold")
];

// =====================================================================
// METRICS AND RANKINGS (measure must be a query.js MEASURES member)
// =====================================================================
const METRICS = [
  metric("median", ["typical", "normal", "the going rate"], { measure: "median", sort: "desc" }, "spec s6: typical/normal = median"),
  metric("average", ["avg", "mean (answered as median)"], { measure: "median", sort: "desc", note: "answered with median; the read says 'median, not average' (s12 decision 6)" }, "spec s6/s12: average -> median, one-line note"),
  metric("record", ["highest ever", "record sale", "all-time high"], { measure: "record", sort: "desc" }, "spec s5: highest standard sale since coverage start + top five"),
  metric("highest", ["top", "priciest", "most expensive", "dearest"], { measure: "median", sort: "desc" }, "spec s6: priciest/most expensive = highest median in the set"),
  metric("cheapest", ["entry point", "affordable", "least expensive", "entry-level"], { measure: "median", sort: "asc" }, "spec s6: cheapest = lowest median in the set"),
  metric("most sold", ["popular", "common", "volume", "highest volume", "most traded", "sold most", "sold the most", "sell most", "the most"], { measure: "count", sort: "desc" }, "spec s6: popular/common = most sold (count)"),
  metric("share", ["mix", "proportion"], { measure: "share", sort: "desc" }, "spec s5: share/mix over a dimension"),
  metric("rising fastest", ["rising", "climbing", "appreciating", "going up", "on the up", "fastest rising", "fastest-rising", "biggest movers", "moving up"], { measure: "trend", sort: "desc", note: "median change, this window vs the prior one; both windows shown as a chip" }, "spec s6: rising = median change (default, shown as a chip)"),
  metric("falling", ["softening", "cooling", "going down", "dropping"], { measure: "trend", sort: "asc", note: "median change, this window vs the prior one, negative" }, "spec s6: falling = median change negative"),
  metric("spread", ["range"], { measure: "median", sort: "desc", note: "reported as p25-p75 spread beside the median" }, "spec s6: spread/range = quartile spread"),
  metric("rare", ["hard to find", "scarce"], { measure: "count", sort: "asc", note: "stated as 'fewest sales in our data', a proxy, never rarity as fact" }, "spec s6: rare = fewest sold (proxy), stated as such"),
  metric("bargain", ["deal", "steal"], { measure: "min", sort: "asc", note: "lowest sale vs the set median ('sold furthest under typical'); never 'good buy'" }, "spec s6: bargain = furthest-under-typical sale, worded as measured"),
  metric("liquid", ["sells fast", "moves quickly", "quick sale"], { measure: "sell_through_rate", sort: "desc", note: "sold-through + days-on-market where recorded (online platforms only); limitation stated" }, "spec s6: liquid = sell-through/DOM, online-only, stated"),
  metric("resold", ["resales", "flipped", "repeat sales", "sold twice", "changed hands twice", "resell"], { measure: "velocity", sort: "desc", note: "same-chassis repeat sales: time between sales and the price change (spec s5 repeat sales)" }, "spec s5: repeat sales = velocity (same VIN/chassis seen twice)"),
  // ASK metrics (subjective; trigger the one clarifying question per spec s6/s7)
  metric("best", ["greatest"], { measure: null, sort: "desc", ask: ["highest median", "rising fastest", "most sold", "strongest recent results"], note: "one clarifying question, four options (s6)" }, "spec s6: best -> ask once, four options"),
  metric("top (subjective)", ["top cars", "the top ones"], { measure: null, sort: "desc", ask: ["highest median", "most sold"], note: "ask when 'top' is not attached to a number/limit" }, "spec s6: bare subjective 'top' asks; 'top 5' is a structural limit"),
  metric("hottest", ["on fire", "red hot"], { measure: null, sort: "desc", ask: ["rising fastest", "most sold recently"], note: "one clarifying question, two options (s6)" }, "spec s6: hottest -> ask once, two options"),
  metric("undervalued", ["overvalued"], { measure: null, sort: "asc", ask: ["cheapest relative to which set?"], note: "not measurable without a value; reframe as 'cheapest relative to X'; never used in our voice" }, "spec s6: undervalued -> ask 'compared with what?', reword"),
  metric("worth", ["value", "valuation", "how much", "going rate", "what's it worth", "what is it worth"], { measure: "median", sort: "desc", note: "translated: we report what cars like this SOLD for (median + spread); the read never says worth/value (spec s6)" }, "spec s6: worth/value -> translate to median, never used in our voice")
];

// =====================================================================
// BODY AND TRANSMISSION (filters where the archive carries them)
// =====================================================================
const BODIES = [
  body("coupe", ["2-door", "coup", "berlinetta"], "coupe", "body filter coupe"),
  body("convertible", ["cabriolet", "cab", "cabrio", "drop-top", "vert"], "convertible", "body filter convertible/cabriolet"),
  body("targa", ["targa top"], "targa", "body filter targa"),
  body("roadster", ["spyder", "spider"], "roadster", "body filter roadster", "approved", "spyder/spider also appear in real model names; the resolver keeps those"),
  body("wagon", ["estate", "sportbrake", "shooting brake", "touring", "avant"], "wagon", "body filter wagon/estate"),
  body("sedan", ["saloon", "4-door", "berlina"], "sedan", "body filter sedan")
];
const TRANSMISSIONS = [
  trans("manual", ["stick", "manual gearbox", "row your own", "3-pedal", "three-pedal"], "manual", "transmission filter manual"),
  trans("automatic", ["auto", "slushbox", "tiptronic", "torque converter"], "automatic", "transmission filter automatic"),
  trans("PDK", ["pdk", "dual-clutch", "dct", "dsg"], "other", "dual-clutch -> transmission 'other' (archive does not split PDK from auto reliably)", "approved", "labelled; archive rarely distinguishes PDK/DCT from automatic")
];

// =====================================================================
// STRUCTURAL WORDS
// =====================================================================
const STRUCTURAL = [
  struct("vs", ["versus", "compared to", "compared with", "against", " v "], { kind: "comparison" }, "spec s5: comparison type"),
  struct("or (compare)", ["993 or 964 style 'or'"], { kind: "comparison" }, "spec s9: 'A or B' between two cars is a comparison, not a choice", "approved", "only when both sides resolve to cars"),
  struct("by house", ["per house", "by venue", "per venue"], { kind: "group_by", dimension: "venue" }, "group by venue"),
  struct("which house", ["what house", "which auction house", "which houses"], { kind: "group_by", dimension: "venue" }, "spec s5 venue question: group by venue (implies the house channel)"),
  struct("by year", ["per year", "year by year", "year-over-year"], { kind: "group_by", dimension: "year" }, "group by sale year"),
  struct("by generation", ["per generation", "by gen"], { kind: "group_by", dimension: "generation" }, "group by generation"),
  struct("by model year", ["per model year", "by year of manufacture"], { kind: "group_by", dimension: "model_year" }, "group by model year"),
  struct("by month", ["per month", "month by month", "monthly"], { kind: "group_by", dimension: "month" }, "group by sale month"),
  struct("by model", ["per model"], { kind: "group_by", dimension: "model" }, "group by model"),
  struct("top 5", ["top five", "top-5"], { kind: "limit", n: 5 }, "limit to 5"),
  struct("top 10", ["top ten", "top-10"], { kind: "limit", n: 10 }, "limit to 10"),
  struct("top 3", ["top three"], { kind: "limit", n: 3 }, "limit to 3")
];

// =====================================================================
// THE 10 GROUPINGS (drafted PENDING; Sam approves each -> spec s12 decision 3).
// Members are model scopes with year spans; archive counts are filled by the prod probe.
// Each records who defined it (definedBy). Shown in full on the reading card.
// =====================================================================
export const GROUPINGS = [
  {
    name: "90s Japanese sports cars",
    phrase: "90s Japanese sports cars",
    variants: ["90s jdm sports cars", "nineties japanese sports cars", "japanese sports cars 90s"],
    category: "grouping", type: "grouping", status: "pending",
    definedBy: "GoAskSam (CC draft, Sep 2026); mirrors spec s9 example, revised per Sam Sep 24",
    source: "spec s9; Sam revisions: add A70 Supra + 240SX + Eclipse GSX + Evo + WRX STi (imports), 3000GT from 1991, drop S2000",
    members: [
      m("Toyota", "Supra", 1990, 1992, "A70"),
      m("Toyota", "Supra", 1993, 1998, "A80"),
      m("Mazda", "RX-7", 1993, 2002, null),
      m("Acura", "NSX", 1990, 1999, null),
      m("Honda", "NSX", 1990, 1999, null),
      m("Nissan", "300ZX", 1990, 1996, null),
      m("Nissan", "240SX", 1990, 1998, null),
      m("Mitsubishi", "3000GT", 1991, 1999, null),
      m("Mitsubishi", "Eclipse GSX", 1990, 1999, null, { titleAny: ["Eclipse GSX", "Eclipse GS-X"] }),
      m("Mitsubishi", "Lancer Evolution", 1992, 1999, null, { titleAny: ["Lancer Evolution", "Lancer Evo", "Evo IV", "Evo V", "Evo VI"] }),
      m("Subaru", "Impreza WRX STi", 1992, 1999, null, { titleAny: ["WRX STI", "Impreza STI", "22B"] }),
      m("Toyota", "MR2", 1990, 1999, null),
      m("Mazda", "MX-5", 1990, 1997, "NA"),
      m("Mazda", "MX-5", 1999, 1999, "NB"),
      m("Nissan", "Skyline", 1990, 1999, null),
      m("Acura", "Integra Type R", 1997, 1999, null)
    ],
    note: "Evo/WRX STi are grey-market imports; Skyline where imported; MX-5 NA 1990-1997 then NB 1999 (no overlap)"
  },
  {
    name: "air-cooled 911s",
    phrase: "air-cooled 911s",
    variants: ["air cooled 911", "aircooled 911", "air-cooled porsche 911", "air-cooled 911"],
    category: "grouping", type: "grouping", status: "pending",
    definedBy: "GoAskSam (CC draft); Porsche air-cooled 911 = 901 through 993, revised per Sam Sep 24",
    source: "spec s1/s9/s11 Q3; Sam: 901 1964-73, G-body incl 930 Turbo (labelled G-body), 964, 993",
    members: [
      m("Porsche", "911", 1964, 1973, "901"),
      m("Porsche", "911", 1974, 1988, null, { label: "G-body" }),
      m("Porsche", "911", 1989, 1994, "964"),
      m("Porsche", "911", 1995, 1998, "993")
    ],
    note: "G-body (1974-1988) is labelled G-body, not 930, and includes the 930 Turbo; 964 takes 1989 (the ambiguous handover) so there is no overlap with G-body; all one nameplate (Porsche 911) so this reads as a single 911<=1998 read, not a ranking (spec Q3)"
  },
  {
    name: "muscle cars",
    phrase: "muscle cars",
    variants: ["muscle car", "american muscle", "classic muscle"],
    category: "grouping", type: "grouping", status: "pending",
    definedBy: "GoAskSam (CC draft); classic-era US V8 muscle, revised per Sam Sep 24",
    source: "spec s4/s9; Sam: performance versions only where titles carry them; Camaro to 1972, Mustang to 1971, all capped at 1972",
    perfTrims: ["SS", "R/T", "Boss", "Mach 1", "Z/28", "442", "GS", "GTX", "Super Bee", "Cobra Jet", "Judge", "GTO"],
    members: [
      m("Chevrolet", "Chevelle", 1964, 1972, null, { trimAny: ["SS", "Super Sport"] }),
      m("Chevrolet", "Camaro", 1967, 1972, null, { trimAny: ["SS", "Z/28", "Z28", "Super Sport"] }),
      m("Chevrolet", "Nova", 1968, 1972, null, { trimAny: ["SS", "Super Sport"] }),
      m("Pontiac", "GTO", 1964, 1972, null),
      m("Pontiac", "Firebird", 1967, 1972, null, { trimAny: ["Trans Am", "Formula", "400"] }),
      m("Dodge", "Charger", 1966, 1972, null, { trimAny: ["R/T", "Super Bee", "Daytona", "500"] }),
      m("Dodge", "Challenger", 1970, 1972, null, { trimAny: ["R/T", "T/A"] }),
      m("Dodge", "Coronet", 1967, 1970, null, { trimAny: ["R/T", "Super Bee"] }),
      m("Dodge", "Super Bee", 1968, 1971, null),
      m("Plymouth", "Barracuda", 1970, 1972, null, { trimAny: ["Cuda", "'Cuda", "AAR"] }),
      m("Plymouth", "Road Runner", 1968, 1972, null),
      m("Plymouth", "GTX", 1967, 1971, null),
      m("Ford", "Mustang", 1967, 1971, null, { trimAny: ["Boss", "Mach 1", "Cobra Jet", "Shelby"] }),
      m("Ford", "Torino", 1968, 1971, null, { trimAny: ["Cobra Jet", "Cobra", "GT"] }),
      m("Mercury", "Cyclone", 1968, 1971, null, { trimAny: ["GT", "Spoiler", "Cobra Jet"] }),
      m("Buick", "GS", 1965, 1972, null),
      m("Oldsmobile", "442", 1964, 1972, null)
    ],
    note: "trimAny filters titles to the performance version for models with a base variant (Chevelle SS, Mustang Boss/Mach 1); inherently-performance models (GTO, Road Runner, GTX, Super Bee, 442, GS) are counted whole"
  },
  {
    name: "pony cars",
    phrase: "pony cars",
    variants: ["pony car", "ponycar"],
    category: "grouping", type: "grouping", status: "pending",
    definedBy: "GoAskSam (CC draft); compact sporty coupes, revised per Sam Sep 24 (consistent 1964-1974)",
    source: "spec s4; Sam: 1964-1974 across the board; add AMC AMX",
    members: [
      m("Ford", "Mustang", 1964, 1974, null),
      m("Chevrolet", "Camaro", 1967, 1974, null),
      m("Pontiac", "Firebird", 1967, 1974, null),
      m("Plymouth", "Barracuda", 1964, 1974, null),
      m("Mercury", "Cougar", 1967, 1974, null),
      m("Dodge", "Challenger", 1970, 1974, "first"),
      m("AMC", "Javelin", 1968, 1974, null),
      m("AMC", "AMX", 1968, 1970, null)
    ],
    note: "consistent 1964-1974 pony era; the whole nameplate (not just performance trims), distinct from the muscle list"
  },
  {
    name: "performance hatchbacks",
    phrase: "performance hatchbacks",
    variants: ["hot hatches", "hot hatch", "hot-hatch", "performance hatch", "hatch"],
    category: "grouping", type: "grouping", status: "pending",
    definedBy: "GoAskSam (CC draft); renamed from 'hot hatches' per Sam Sep 24",
    source: "spec s4; Sam: rename, drop WRX, Clio RS/V6/Williams only, add Fiesta ST/Golf R32/CRX/Omni GLH/Veloster N",
    body: "hatchback",
    members: [
      m("Volkswagen", "Golf GTI", 1983, 2026, null, { titleAny: ["GTI"] }),
      m("Volkswagen", "Golf R", 2012, 2026, null, { titleAny: ["Golf R"] }),
      m("Volkswagen", "Golf R32", 2004, 2008, null, { titleAny: ["R32"] }),
      m("Honda", "Civic Type R", 1997, 2026, null),
      m("Honda", "CRX", 1984, 1991, null),
      m("Ford", "Focus RS", 2009, 2018, null),
      m("Ford", "Focus ST", 2013, 2018, null),
      m("Ford", "Fiesta ST", 2014, 2019, null),
      m("Renault", "Clio", 2001, 2016, null, { trimAny: ["RS", "V6", "Williams"] }),
      m("Mini", "Cooper S", 2002, 2026, null),
      m("Toyota", "GR Corolla", 2023, 2026, null),
      m("Dodge", "Omni GLH", 1984, 1986, null, { titleAny: ["Omni GLH", "GLH"] }),
      m("Hyundai", "Veloster N", 2019, 2022, null, { titleAny: ["Veloster N"] })
    ],
    note: "body=hatchback applies at query time (spec structural); WRX dropped (a sedan); Clio scoped to RS/V6/Williams"
  },
  {
    name: "analog supercars",
    phrase: "analog supercars",
    variants: ["analogue supercars", "analog supercar", "pre-electronic supercars"],
    category: "grouping", type: "grouping", status: "pending",
    definedBy: "GoAskSam (CC draft); pre-electronic-aids supercars, revised per Sam Sep 24",
    source: "spec s4/s9; Sam: add McLaren F1, Ford GT 2005-06, Porsche 959",
    members: [
      m("Ferrari", "F40", 1987, 1992, null),
      m("Ferrari", "F50", 1995, 1997, null),
      m("Ferrari", "288 GTO", 1984, 1987, null),
      m("Porsche", "Carrera GT", 2004, 2007, null),
      m("Porsche", "959", 1986, 1988, null),
      m("Lamborghini", "Countach", 1984, 1990, null),
      m("Lamborghini", "Diablo", 1990, 2001, null),
      m("Jaguar", "XJ220", 1992, 1994, null),
      m("Bugatti", "EB110", 1991, 1995, null),
      m("McLaren", "F1", 1992, 1998, null),
      m("Ford", "GT", 2005, 2006, null, { titleAny: ["Ford GT"] }),
      m("Honda", "NSX", 1990, 2005, null),
      m("Acura", "NSX", 1990, 2005, null)
    ],
    note: "the 'analog' boundary is an opinion (traction control / paddle shift end the era); shown in full so the user can prune"
  },
  {
    name: "British roadsters",
    phrase: "British roadsters",
    variants: ["british roadster", "british sports cars", "brit roadsters"],
    category: "grouping", type: "grouping", status: "pending",
    definedBy: "GoAskSam (CC draft); classic UK open two-seaters, revised per Sam Sep 24",
    source: "spec s4; Sam: roadsters/convertibles only; add Healey 100/Sprite, Midget, TR3, XK120/140/150, Alpine/Tiger, Seven",
    body: "roadster",
    members: [
      m("MG", "MGB", 1963, 1980, null),
      m("MG", "MGA", 1955, 1962, null),
      m("MG", "Midget", 1961, 1979, null),
      m("Triumph", "TR6", 1969, 1976, null),
      m("Triumph", "TR4", 1961, 1967, null),
      m("Triumph", "TR3", 1955, 1962, null),
      m("Triumph", "Spitfire", 1962, 1980, null),
      m("Austin-Healey", "3000", 1959, 1967, null),
      m("Austin-Healey", "100", 1953, 1956, null),
      m("Austin-Healey", "Sprite", 1958, 1971, null),
      m("Jaguar", "E-Type", 1961, 1974, null),
      m("Jaguar", "XK120", 1948, 1954, null),
      m("Jaguar", "XK140", 1954, 1957, null),
      m("Jaguar", "XK150", 1957, 1961, null),
      m("Lotus", "Elan", 1962, 1975, null),
      m("Lotus", "Seven", 1957, 1972, null),
      m("Sunbeam", "Alpine", 1959, 1968, null),
      m("Sunbeam", "Tiger", 1964, 1967, null),
      m("Morgan", "Plus 4", 1950, 2000, null)
    ],
    note: "body=roadster/convertible applies at query time (spec structural); fixed-head coupes excluded there"
  },
  {
    name: "Italian exotics",
    phrase: "Italian exotics",
    variants: ["italian exotic", "italian supercars", "italian exotica"],
    category: "grouping", type: "grouping", status: "pending",
    definedBy: "GoAskSam (CC draft); Italian FLAGSHIPS only, revised per Sam Sep 24",
    source: "spec s4; Sam: flagships only (Miura, Countach, Diablo, Murcielago, BB/512 BBi, TR/512 TR/F512 M, F40, F50, Enzo, 288 GTO, Bora, Pantera, Zonda)",
    members: [
      m("Lamborghini", "Miura", 1966, 1973, null),
      m("Lamborghini", "Countach", 1974, 1990, null),
      m("Lamborghini", "Diablo", 1990, 2001, null),
      m("Lamborghini", "Murcielago", 2001, 2010, null),
      m("Ferrari", "Berlinetta Boxer", 1973, 1984, null, { titleAny: ["Berlinetta Boxer", "365 GT4 BB", "512 BB", "512 BBi", "BB 512"] }),
      m("Ferrari", "Testarossa", 1984, 1991, null),
      m("Ferrari", "512 TR", 1992, 1994, null, { titleAny: ["512 TR"] }),
      m("Ferrari", "F512 M", 1995, 1996, null, { titleAny: ["F512 M", "512 M"] }),
      m("Ferrari", "F40", 1987, 1992, null),
      m("Ferrari", "F50", 1995, 1997, null),
      m("Ferrari", "Enzo", 2002, 2004, null),
      m("Ferrari", "288 GTO", 1984, 1987, null),
      m("Maserati", "Bora", 1971, 1978, null),
      m("De Tomaso", "Pantera", 1971, 1992, null),
      m("Pagani", "Zonda", 1999, 2017, null)
    ],
    note: "flagships only (308/Ghibli removed); TR 1984-1991, 512 TR 1992-1994, F512 M 1995-1996 (no overlap)"
  },
  {
    name: "overlanders",
    phrase: "overlanders",
    variants: ["overlander", "overlanding rigs", "expedition 4x4s", "expedition vehicles"],
    category: "grouping", type: "grouping", status: "pending",
    definedBy: "GoAskSam (CC draft); go-anywhere expedition 4x4s, revised per Sam Sep 24",
    source: "spec s4; Sam: remove Wagoneer; add Wrangler, CJ, Scout, FJ Cruiser, Delica; fix G-Class titles",
    members: [
      m("Toyota", "Land Cruiser", 1960, 2021, null),
      m("Land Rover", "Defender", 1983, 2016, null),
      m("Land Rover", "Series III", 1971, 1985, null),
      m("Ford", "Bronco", 1966, 1996, null),
      m("Mercedes-Benz", "G-Class", 1979, 2026, null, { titleAny: ["G-Class", "G-Wagen", "G550", "G500", "G63", "G55"] }),
      m("Toyota", "4Runner", 1984, 2026, null),
      m("Nissan", "Patrol", 1980, 2026, null),
      m("Jeep", "Wrangler", 1987, 2018, null),
      m("Jeep", "CJ", 1945, 1986, null),
      m("International", "Scout", 1961, 1980, null),
      m("Toyota", "FJ Cruiser", 2007, 2014, null),
      m("Mitsubishi", "Delica", 1968, 2007, null)
    ],
    note: "spans classic and modern; a window usually narrows it; G-Class counted by its designations (G500/G550/G63/G-Wagen), not the family label"
  },
  {
    name: "malaise era",
    phrase: "malaise era cars",
    variants: ["malaise era", "malaise cars", "malaise-era cars"],
    category: "grouping", type: "grouping", status: "pending",
    definedBy: "GoAskSam (CC draft); emblematic US 1973-1983 cars, revised per Sam Sep 24",
    source: "spec s4/s6; Sam: Corvette from 1973; add Pacer, Gremlin, Pinto, Vega, Cordoba, Continental Mark IV/V, Thunderbird 1973-79",
    members: [
      m("Chevrolet", "Corvette", 1973, 1982, "C3"),
      m("Pontiac", "Firebird", 1973, 1981, null, { trimAny: ["Trans Am", "Formula"] }),
      m("Ford", "Mustang II", 1974, 1978, null, { titleAny: ["Mustang II"] }),
      m("Chevrolet", "Camaro", 1973, 1981, "second"),
      m("Cadillac", "Eldorado", 1973, 1978, null),
      m("Pontiac", "Grand Prix", 1973, 1977, null),
      m("Chevrolet", "Monte Carlo", 1973, 1977, null),
      m("AMC", "Pacer", 1975, 1980, null),
      m("AMC", "Gremlin", 1970, 1978, null),
      m("Ford", "Pinto", 1971, 1980, null),
      m("Chevrolet", "Vega", 1971, 1977, null),
      m("Chrysler", "Cordoba", 1975, 1983, null),
      m("Lincoln", "Continental Mark IV", 1972, 1976, null, { titleAny: ["Mark IV", "Continental Mark IV"] }),
      m("Lincoln", "Continental Mark V", 1977, 1979, null, { titleAny: ["Mark V", "Continental Mark V"] }),
      m("Ford", "Thunderbird", 1973, 1979, null)
    ],
    note: "the era ENTRY (1973-1983) is the year span; this grouping is the emblematic-model reading; Mustang II counted specifically by 'Mustang II'"
  }
];

// =====================================================================
// The full entry list (non-grouping) + a combined view.
// =====================================================================
export const ENTRIES = [
  ...CHASSIS, ...NICKNAMES, ...ERAS, ...WINDOWS_DICT, ...CHANNELS, ...VENUES,
  ...PRICES, ...MILEAGES, ...METRICS, ...BODIES, ...TRANSMISSIONS, ...STRUCTURAL
];

// All approved+pending entries including groupings (groupings kept separate for review).
export const ALL_ENTRIES = [...ENTRIES, ...GROUPINGS];

// ---------------------------------------------------------------------
// Pure helpers (no I/O).
// ---------------------------------------------------------------------
export function normalizePhrase(s) {
  return String(s || "").toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
}

// Flatten every phrase + variant to a lookup row, longest-first (longest-match wins).
export function phraseIndex(includePending = false) {
  const rows = [];
  for (const e of ALL_ENTRIES) {
    if (!includePending && e.status !== "approved") continue;
    const phrases = [e.phrase, ...(e.variants || [])];
    for (const p of phrases) rows.push({ phrase: normalizePhrase(p), entry: e });
  }
  return rows.sort((a, b) => b.phrase.length - a.phrase.length);
}

// The deterministic expansion of an entry, as a plain object (what the golden pins).
export function expandEntry(entry) {
  const base = { phrase: entry.phrase, category: entry.category, type: entry.type, status: entry.status };
  switch (entry.type) {
    case "scope":
    case "grouping":
      return { ...base, models: (entry.models || entry.members || []).map(x => ({ ...x })) };
    case "era": return { ...base, yearRange: entry.yearRange };
    case "window": return { ...base, window: entry.window };
    case "channel": return { ...base, channel: entry.channel };
    case "venue": return { ...base, venue: entry.venue, event: entry.event || null };
    case "price": return { ...base, price: entry.price };
    case "mileage": return { ...base, mileage: entry.mileage };
    case "metric": return { ...base, metric: entry.metric };
    case "body": return { ...base, body: entry.body };
    case "transmission": return { ...base, transmission: entry.transmission };
    case "structural": return { ...base, structural: entry.structural };
    default: return base;
  }
}

// Every distinct (make, model, generation) an entry's expansion names — for the count probe + validator.
export function scopeMembersOf(entry) {
  const list = entry.models || entry.members || [];
  return list.filter(x => x && x.make && x.model && !x.makeOnly);
}

// The DSL metrics the dictionary is allowed to target (mirrors query.js MEASURES; the validator
// re-checks against the live set so this list can never drift silently).
export const DICTIONARY_MEASURES = [
  "count", "share", "median", "p25", "p75", "min", "max", "record",
  "sell_through_rate", "reserve_not_met_rate", "withdrawn_rate", "reserve_premium",
  "trend", "velocity", "day_of_week_effect", "month_effect", "freshness"
];
