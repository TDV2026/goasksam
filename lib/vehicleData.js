// Curated vehicle knowledge: aliases, model ownership, production-year rules.
// This file is the SEED SOURCE for the taxonomy_aliases table and the year_ranges
// column in taxonomy_models (see scripts/seedTaxonomy.js). At runtime lib/vehicle.js
// prefers rows from Supabase; these arrays keep the resolver fully functional before
// the taxonomy tables are seeded or when Supabase is unreachable.
//
// Alias kinds and behavior (product rule: corrections confirm, expansions are silent):
// - "abbreviation" / "nickname": expand silently (vw -> Volkswagen, vette -> Corvette)
// - "misspelling": always ask the user to confirm before proceeding

export const MAKE_ALIASES = [
  { alias: "vw", make: "Volkswagen", kind: "abbreviation" },
  { alias: "vdub", make: "Volkswagen", kind: "abbreviation" },
  { alias: "chevy", make: "Chevrolet", kind: "abbreviation" },
  { alias: "chev", make: "Chevrolet", kind: "abbreviation" },
  { alias: "merc", make: "Mercedes-Benz", kind: "abbreviation" },
  { alias: "benz", make: "Mercedes-Benz", kind: "abbreviation" },
  { alias: "mercedes", make: "Mercedes-Benz", kind: "abbreviation" },
  { alias: "lambo", make: "Lamborghini", kind: "abbreviation" },
  { alias: "bimmer", make: "BMW", kind: "abbreviation" },
  { alias: "beemer", make: "BMW", kind: "abbreviation" },
  { alias: "beamer", make: "BMW", kind: "abbreviation" },
  { alias: "jag", make: "Jaguar", kind: "abbreviation" },
  { alias: "aston", make: "Aston Martin", kind: "abbreviation" },
  { alias: "alfa", make: "Alfa Romeo", kind: "abbreviation" },
  { alias: "rolls", make: "Rolls-Royce", kind: "abbreviation" },
  { alias: "olds", make: "Oldsmobile", kind: "abbreviation" },
  { alias: "caddy", make: "Cadillac", kind: "abbreviation" },
  { alias: "caddie", make: "Cadillac", kind: "abbreviation" },
  { alias: "maser", make: "Maserati", kind: "abbreviation" },
  { alias: "healey", make: "Austin-Healey", kind: "abbreviation" },

  { alias: "porche", make: "Porsche", kind: "misspelling" },
  { alias: "porshe", make: "Porsche", kind: "misspelling" },
  { alias: "porsce", make: "Porsche", kind: "misspelling" },
  { alias: "prosche", make: "Porsche", kind: "misspelling" },
  { alias: "porsch", make: "Porsche", kind: "misspelling" },
  { alias: "porcha", make: "Porsche", kind: "misspelling" },
  { alias: "porshce", make: "Porsche", kind: "misspelling" },
  { alias: "chevorlet", make: "Chevrolet", kind: "misspelling" },
  { alias: "chevrolette", make: "Chevrolet", kind: "misspelling" },
  { alias: "mercedez", make: "Mercedes-Benz", kind: "misspelling" },
  { alias: "mercedes-banz", make: "Mercedes-Benz", kind: "misspelling" },
  // No-space form of a multi-word make. A missing space reads as a near-miss, so
  // (per rule 6, same as every make typo) it CONFIRMS "Did you mean the Land Rover?"
  // rather than silently expanding. Curated so it never depends on edit distance.
  { alias: "landrover", make: "Land Rover", kind: "misspelling" },
  { alias: "ferarri", make: "Ferrari", kind: "misspelling" },
  { alias: "ferari", make: "Ferrari", kind: "misspelling" },
  { alias: "farrari", make: "Ferrari", kind: "misspelling" },
  { alias: "lamborgini", make: "Lamborghini", kind: "misspelling" },
  { alias: "lambourghini", make: "Lamborghini", kind: "misspelling" },
  { alias: "mercedez", make: "Mercedes-Benz", kind: "misspelling" },
  { alias: "mercades", make: "Mercedes-Benz", kind: "misspelling" },
  { alias: "chevorlet", make: "Chevrolet", kind: "misspelling" },
  { alias: "cheverolet", make: "Chevrolet", kind: "misspelling" },
  { alias: "volkswagon", make: "Volkswagen", kind: "misspelling" },
  { alias: "volkswagan", make: "Volkswagen", kind: "misspelling" },
  { alias: "bently", make: "Bentley", kind: "misspelling" },
  { alias: "masarati", make: "Maserati", kind: "misspelling" },
  { alias: "maseratti", make: "Maserati", kind: "misspelling" },
  { alias: "jagaur", make: "Jaguar", kind: "misspelling" },
  { alias: "jaugar", make: "Jaguar", kind: "misspelling" },
  { alias: "toyata", make: "Toyota", kind: "misspelling" }
];

export const MODEL_ALIASES = [
  { alias: "vette", make: "Chevrolet", model: "Corvette", kind: "nickname" },
  { alias: "stingray", make: "Chevrolet", model: "Corvette", trim: "Stingray", kind: "nickname" },
  { alias: "stang", make: "Ford", model: "Mustang", kind: "nickname" },
  { alias: "bug", make: "Volkswagen", model: "Beetle", kind: "nickname" },
  { alias: "ghia", make: "Volkswagen", model: "Karmann Ghia", kind: "nickname" },
  { alias: "land cruiser", make: "Toyota", model: "Land Cruiser", kind: "nickname" },
  { alias: "landcruiser", make: "Toyota", model: "Land Cruiser", kind: "nickname" },
  { alias: "fj40", make: "Toyota", model: "Land Cruiser", trim: "FJ40", kind: "nickname" },
  { alias: "fj45", make: "Toyota", model: "Land Cruiser", trim: "FJ45", kind: "nickname" },
  { alias: "fj60", make: "Toyota", model: "Land Cruiser", trim: "FJ60", kind: "nickname" },
  { alias: "fj62", make: "Toyota", model: "Land Cruiser", trim: "FJ62", kind: "nickname" },
  { alias: "fj80", make: "Toyota", model: "Land Cruiser", trim: "FJ80", kind: "nickname" },
  { alias: "xke", make: "Jaguar", model: "XKE", kind: "nickname" },
  { alias: "e-type", make: "Jaguar", model: "XKE", kind: "nickname" },
  { alias: "gt3", make: "Porsche", model: "911", trim: "GT3", kind: "nickname" },
  { alias: "gt2", make: "Porsche", model: "911", trim: "GT2", kind: "nickname" },
  { alias: "modena", make: "Ferrari", model: "360", kind: "nickname" },
  { alias: "carrera", make: "Porsche", model: "911", trim: "Carrera", kind: "nickname" },
  { alias: "c63", make: "Mercedes-Benz", model: "C-Class", trim: "C63", kind: "nickname" },
  { alias: "lx470", make: "Lexus", model: "LX 470", kind: "nickname" },
  { alias: "lx 470", make: "Lexus", model: "LX 470", kind: "nickname" },
  { alias: "lx570", make: "Lexus", model: "LX 570", kind: "nickname" },
  { alias: "gx460", make: "Lexus", model: "GX 460", kind: "nickname" },
  { alias: "gx470", make: "Lexus", model: "GX 470", kind: "nickname" },
  { alias: "stingray", make: "Chevrolet", model: "Corvette", trim: "Stingray", kind: "nickname" },
  { alias: "stang", make: "Ford", model: "Mustang", kind: "nickname" },
  { alias: "demon", make: "Dodge", model: "Challenger", trim: "SRT Demon", kind: "nickname" },
  { alias: "godzilla", make: "Nissan", model: "GT-R", kind: "nickname" },
  { alias: "raptor", make: "Ford", model: "F-150", trim: "Raptor", kind: "nickname" },
  { alias: "landcruiser", make: "Toyota", model: "Land Cruiser", kind: "nickname" },
  { alias: "land-cruiser", make: "Toyota", model: "Land Cruiser", kind: "nickname" },
  { alias: "amg c63", make: "Mercedes-Benz", model: "C-Class", trim: "C63", kind: "nickname" },
  // AMG family (locked convention, matches the c63 entry above): the AMG
  // performance line resolves to its passenger-class model with the AMG
  // designation carried as the trim, so comps fetch the family model plus the
  // designation keyword. vPIC and OldCarsData name none of these cleanly (a
  // bare "AMG" is the only Mercedes "model" OCD exposes), so they are curated.
  { alias: "c43", make: "Mercedes-Benz", model: "C-Class", trim: "C43", kind: "nickname" },
  { alias: "c53", make: "Mercedes-Benz", model: "C-Class", trim: "C53", kind: "nickname" },
  { alias: "e63", make: "Mercedes-Benz", model: "E-Class", trim: "E63", kind: "nickname" },
  { alias: "amg e63", make: "Mercedes-Benz", model: "E-Class", trim: "E63", kind: "nickname" },
  { alias: "e43", make: "Mercedes-Benz", model: "E-Class", trim: "E43", kind: "nickname" },
  { alias: "e53", make: "Mercedes-Benz", model: "E-Class", trim: "E53", kind: "nickname" },
  { alias: "s63", make: "Mercedes-Benz", model: "S-Class", trim: "S63", kind: "nickname" },
  { alias: "s65", make: "Mercedes-Benz", model: "S-Class", trim: "S65", kind: "nickname" },
  { alias: "cls63", make: "Mercedes-Benz", model: "CLS-Class", trim: "CLS63", kind: "nickname" },
  { alias: "cls53", make: "Mercedes-Benz", model: "CLS-Class", trim: "CLS53", kind: "nickname" },
  { alias: "sl63", make: "Mercedes-Benz", model: "SL-Class", trim: "SL63", kind: "nickname" },
  { alias: "sl65", make: "Mercedes-Benz", model: "SL-Class", trim: "SL65", kind: "nickname" },
  { alias: "gle63", make: "Mercedes-Benz", model: "GLE-Class", trim: "GLE63", kind: "nickname" },
  { alias: "gle53", make: "Mercedes-Benz", model: "GLE-Class", trim: "GLE53", kind: "nickname" },
  { alias: "glc63", make: "Mercedes-Benz", model: "GLC-Class", trim: "GLC63", kind: "nickname" },
  { alias: "glc43", make: "Mercedes-Benz", model: "GLC-Class", trim: "GLC43", kind: "nickname" },
  { alias: "gla45", make: "Mercedes-Benz", model: "GLA-Class", trim: "GLA45", kind: "nickname" },
  { alias: "cla45", make: "Mercedes-Benz", model: "CLA-Class", trim: "CLA45", kind: "nickname" },
  { alias: "cla35", make: "Mercedes-Benz", model: "CLA-Class", trim: "CLA35", kind: "nickname" },
  { alias: "a45", make: "Mercedes-Benz", model: "A-Class", trim: "A45", kind: "nickname" },
  { alias: "a35", make: "Mercedes-Benz", model: "A-Class", trim: "A35", kind: "nickname" },
  { alias: "g63", make: "Mercedes-Benz", model: "G-Class", trim: "G63", kind: "nickname" },
  { alias: "g65", make: "Mercedes-Benz", model: "G-Class", trim: "G65", kind: "nickname" },
  { alias: "g55", make: "Mercedes-Benz", model: "G-Class", trim: "G55", kind: "nickname" },
  // Number+letter SL and E badges (Aug 2026): OCD/archive lumps these under the
  // family head (SL-Class / E-Class) and titles them by badge, so the resolver never
  // matched the bare "500SL"/"190E" token and fell to a wrong fuzzy suggestion. Map
  // each badge to its family model + badge trim; One Box then filters the archive by
  // the badge title token. Both spaced and unspaced forms, since normalize keeps the
  // space ("500 SL" -> "500 sl" is a distinct key from "500sl").
  // SL-Class badges. Two spelling conventions: number-first (R107/early R129:
  // "500SL") and SL-prefix (mid-1993 R129 onward, R230/R231: "SL500"). Both the
  // spaced and unspaced forms resolve. Audited Aug 2026 after "600SL" fuzzy-matched
  // to the unrelated 300SL: the full real badge set (320/560/600SL and every
  // SLxxx AMG/V12) is now seeded so no real SL falls to a wrong fuzzy suggestion.
  // 300SL is deliberately NOT here (it is its own iconic model: W198 Gullwing /
  // W113 Pagoda), so it keeps resolving as model "300SL".
  ...[
    "230sl", "250sl", "280sl", "320sl", "350sl", "380sl", "420sl", "450sl", "500sl", "560sl", "600sl"
  ].flatMap(code => {
    const badge = code.toUpperCase();
    const spaced = code.replace(/sl$/, " sl"); // "500sl" -> "500 sl"
    return [
      { alias: code, make: "Mercedes-Benz", model: "SL-Class", trim: badge, kind: "nickname" },
      { alias: spaced, make: "Mercedes-Benz", model: "SL-Class", trim: badge, kind: "nickname" }
    ];
  }),
  ...[
    "sl280", "sl320", "sl350", "sl400", "sl500", "sl550", "sl600", "sl55", "sl60", "sl63", "sl65", "sl73"
  ].flatMap(code => {
    const badge = code.toUpperCase();
    const spaced = code.replace(/^sl/, "sl "); // "sl500" -> "sl 500"
    return [
      { alias: code, make: "Mercedes-Benz", model: "SL-Class", trim: badge, kind: "nickname" },
      { alias: spaced, make: "Mercedes-Benz", model: "SL-Class", trim: badge, kind: "nickname" }
    ];
  }),
  // S-Class badges: the SE / SEL (long wheelbase) / SEC (coupe) W108/W116/W126 era
  // and the modern Sxxx line. Mapped to the S-Class family with the badge as the
  // trim, same audit as the SL list. Diesel S-Class codes (300SD/300SDL/350SD/
  // 350SDL) stay as their own load-bearing diesel models in the block below.
  ...[
    ["280se", "280SE"], ["300se", "300SE"], ["350se", "350SE"], ["380se", "380SE"], ["450se", "450SE"], ["500se", "500SE"],
    ["280sel", "280SEL"], ["300sel", "300SEL"], ["350sel", "350SEL"], ["380sel", "380SEL"], ["420sel", "420SEL"], ["450sel", "450SEL"], ["500sel", "500SEL"], ["560sel", "560SEL"],
    ["380sec", "380SEC"], ["420sec", "420SEC"], ["500sec", "500SEC"], ["560sec", "560SEC"]
  ].flatMap(([a, badge]) => {
    const spaced = a.replace(/(se[cl]?)$/, " $1"); // "560sel" -> "560 sel"
    return [
      { alias: a, make: "Mercedes-Benz", model: "S-Class", trim: badge, kind: "nickname" },
      { alias: spaced, make: "Mercedes-Benz", model: "S-Class", trim: badge, kind: "nickname" }
    ];
  }),
  ...[
    "s320", "s350", "s420", "s430", "s500", "s550", "s560", "s600", "s55", "s63", "s65"
  ].flatMap(code => {
    const badge = code.toUpperCase();
    const spaced = code.replace(/^s/, "s "); // "s500" -> "s 500"
    return [
      { alias: code, make: "Mercedes-Benz", model: "S-Class", trim: badge, kind: "nickname" },
      { alias: spaced, make: "Mercedes-Benz", model: "S-Class", trim: badge, kind: "nickname" }
    ];
  }),
  ...[
    ["190e", "190E"], ["300e", "300E"], ["400e", "400E"], ["500e", "500E"],
    ["e320", "E320"], ["e430", "E430"], ["e500", "E500"], ["e550", "E550"], ["e55", "E55"]
  ].flatMap(([a, badge]) => [
    { alias: a, make: "Mercedes-Benz", model: "E-Class", trim: badge, kind: "nickname" },
    { alias: a.replace(/^e(\d)/, "e $1").replace(/^(\d{3})e/, "$1 e"), make: "Mercedes-Benz", model: "E-Class", trim: badge, kind: "nickname" }
  ]),
  // A-Class (US market 2019+): neither vPIC's 2018 list nor OCD name it cleanly.
  { alias: "a-class", make: "Mercedes-Benz", model: "A-Class", kind: "nickname" },
  { alias: "a class", make: "Mercedes-Benz", model: "A-Class", kind: "nickname" },
  { alias: "aclass", make: "Mercedes-Benz", model: "A-Class", kind: "nickname" },
  { alias: "a220", make: "Mercedes-Benz", model: "A-Class", trim: "A220", kind: "nickname" },
  { alias: "a250", make: "Mercedes-Benz", model: "A-Class", trim: "A250", kind: "nickname" },
  // Mercedes diesel MODEL codes where the trailing letter is LOAD-BEARING: D = diesel,
  // a distinct W115/W123/W124/W126/W201 model, never a typo of the gas number ("240D"
  // must never collapse to "240", a different car). OCD/BaT title these by the code, so
  // the model IS the code. The fuzzy matcher also no longer drops the letter (see
  // fuzzyModelCandidate). Non-diesel load-bearing letters (E/S/L/C/T) are handled by the
  // family-badge maps above plus the fuzzy-drop guard.
  ...["240d", "300d", "220d", "250d", "200d", "190d", "300sd", "300td", "300cd", "350sd", "300sdl", "240td", "350sdl"]
    .map(code => ({ alias: code, make: "Mercedes-Benz", model: code.toUpperCase(), kind: "nickname" })),
  // BMW 6-Series (E24, 1976-1989): OCD fragments these badges across separate
  // model entries (633CSi, 635CSi) and fuzzy-matches the bare "630" to unrelated
  // 3-Series trims (330Ci), so the real badges are curated to model "6-Series"
  // with the badge as the trim. The trim feeds the exact-fetch keyword pass, and
  // the E24 trim chip-set (js/wizard.js CURATED_TRIM_ASKS) breaks the family out
  // when a bare "6-Series" resolves. textHasTerm's boundaries mean each badge needs
  // its own alias (a bare "630" never matches "630i"/"630csi").
  { alias: "m635csi", make: "BMW", model: "6-Series", trim: "M635CSi", kind: "nickname" },
  { alias: "635csi", make: "BMW", model: "6-Series", trim: "635CSi", kind: "nickname" },
  { alias: "635cs", make: "BMW", model: "6-Series", trim: "635CS", kind: "nickname" },
  { alias: "633csi", make: "BMW", model: "6-Series", trim: "633CSi", kind: "nickname" },
  { alias: "630csi", make: "BMW", model: "6-Series", trim: "630CSi", kind: "nickname" },
  { alias: "630cs", make: "BMW", model: "6-Series", trim: "630CS", kind: "nickname" },
  { alias: "628csi", make: "BMW", model: "6-Series", trim: "628CSi", kind: "nickname" },
  { alias: "630", make: "BMW", model: "6-Series", trim: "630CS", kind: "nickname" },
  // Ferrari flagship/GT nameplates the free sources miss or that collide with
  // another make's number ("550" is also the Porsche 550 Spyder; these are
  // make-scoped so the collision cannot fire). LaFerrari resolves from either
  // spelling.
  { alias: "550 maranello", make: "Ferrari", model: "550 Maranello", kind: "nickname" },
  { alias: "550 barchetta", make: "Ferrari", model: "550 Barchetta", kind: "nickname" },
  { alias: "550", make: "Ferrari", model: "550 Maranello", kind: "nickname" },
  { alias: "laferrari", make: "Ferrari", model: "LaFerrari", kind: "nickname" },
  { alias: "la ferrari", make: "Ferrari", model: "LaFerrari", kind: "nickname" },
  // Mazda's current naming ("Mazda3", not a bare "3", which is too ambiguous to
  // match on its own). Both the one-word and spaced spellings resolve and imply
  // the make.
  { alias: "mazda2", make: "Mazda", model: "Mazda2", kind: "nickname" },
  { alias: "mazda 2", make: "Mazda", model: "Mazda2", kind: "nickname" },
  { alias: "mazda3", make: "Mazda", model: "Mazda3", kind: "nickname" },
  { alias: "mazda 3", make: "Mazda", model: "Mazda3", kind: "nickname" },
  { alias: "mazda5", make: "Mazda", model: "Mazda5", kind: "nickname" },
  { alias: "mazda 5", make: "Mazda", model: "Mazda5", kind: "nickname" },
  { alias: "mazda6", make: "Mazda", model: "Mazda6", kind: "nickname" },
  { alias: "mazda 6", make: "Mazda", model: "Mazda6", kind: "nickname" },
  // Niche classics the free catalogs file under noise or an ambiguous make.
  { alias: "jeepster commando", make: "Jeep", model: "Jeepster Commando", kind: "nickname" },
  { alias: "jeepster", make: "Jeep", model: "Jeepster Commando", kind: "nickname" },
  { alias: "classic mini", make: "Mini", model: "Classic Mini", kind: "nickname" },
  { alias: "amc marlin", make: "AMC", model: "Marlin", kind: "nickname" },
  { alias: "amc rambler", make: "AMC", model: "Rambler", kind: "nickname" },
  { alias: "shelby charger", make: "Dodge", model: "Charger", trim: "Shelby", kind: "nickname" },
  { alias: "miata", make: "Mazda", model: "MX-5", kind: "nickname" },
  { alias: "mx5", make: "Mazda", model: "MX-5", kind: "nickname" },
  { alias: "camper van", make: "Volkswagen", model: "Bus", kind: "nickname" },
  { alias: "campervan", make: "Volkswagen", model: "Bus", kind: "nickname" },
  { alias: "camper", make: "Volkswagen", model: "Bus", kind: "nickname" },
  { alias: "kombi", make: "Volkswagen", model: "Bus", kind: "nickname" },
  { alias: "microbus", make: "Volkswagen", model: "Bus", kind: "nickname" },
  { alias: "splitscreen", make: "Volkswagen", model: "Bus", kind: "nickname" },
  { alias: "splittie", make: "Volkswagen", model: "Bus", kind: "nickname" },
  { alias: "split window bus", make: "Volkswagen", model: "Bus", kind: "nickname" },
  { alias: "bay window bus", make: "Volkswagen", model: "Bus", kind: "nickname" },
  { alias: "transporter", make: "Volkswagen", model: "Bus", kind: "nickname" },
  { alias: "type 2", make: "Volkswagen", model: "Bus", kind: "nickname" },
  { alias: "westfalia", make: "Volkswagen", model: "Bus", kind: "misspelling" },
  { alias: "westy", make: "Volkswagen", model: "Bus", kind: "misspelling" },

  { alias: "boxter", make: "Porsche", model: "Boxster", kind: "misspelling" },
  { alias: "caymann", make: "Porsche", model: "Cayman", kind: "misspelling" },
  { alias: "testarosa", make: "Ferrari", model: "Testarossa", kind: "misspelling" },
  { alias: "corvete", make: "Chevrolet", model: "Corvette", kind: "misspelling" },
  { alias: "corvett", make: "Chevrolet", model: "Corvette", kind: "misspelling" },
  { alias: "mustange", make: "Ford", model: "Mustang", kind: "misspelling" },
  // Ford Mustang SVT Cobra (incl. the 2003-2004 "Terminator"). "Cobra" is also the
  // AC/Shelby make, so these are MAKE-SCOPED to Ford: they only fire once Ford is the
  // resolved make (the make-owner preference in vehicle.js makes Ford win whenever
  // "Mustang" appears in the same input, so "Ford Mustang Cobra" no longer hijacks to
  // the Cobra make). Both "cobra" and "svt" carry the same SVT Cobra trim; the
  // alias-trim only lands when the model actually resolves to Mustang, so "Ford F-150
  // SVT" is never mislabeled (see aliasTrimForModel in vehicle.js).
  { alias: "mustang svt cobra", make: "Ford", model: "Mustang", trim: "SVT Cobra", kind: "nickname" },
  { alias: "mustang cobra", make: "Ford", model: "Mustang", trim: "SVT Cobra", kind: "nickname" },
  { alias: "svt cobra", make: "Ford", model: "Mustang", trim: "SVT Cobra", kind: "nickname" },
  { alias: "cobra", make: "Ford", model: "Mustang", trim: "SVT Cobra", kind: "nickname" },
  { alias: "svt", make: "Ford", model: "Mustang", trim: "SVT Cobra", kind: "nickname" }
];

// A model name that strongly implies a specific make. Used to catch inputs like
// "Porsche E-Type" and steer the user to the real owner of the nameplate.
export const MODEL_OWNERSHIP = [
  { model: "XKE", makes: ["Jaguar"], aliases: ["etype", "e type", "e-type", "xke"], suggestion: "Jaguar F-Type", suggestionStart: 2013 },
  { model: "F-150", makes: ["Ford"], aliases: ["raptor"] },
  { model: "Challenger", makes: ["Dodge"], aliases: ["demon"] },
  { model: "Corvette", makes: ["Chevrolet"], aliases: ["stingray"] },
  { model: "GT-R", makes: ["Nissan"], aliases: ["godzilla"] },
  { model: "Mustang", makes: ["Ford"], aliases: ["stang"] },
  { model: "Land Cruiser", makes: ["Toyota"], aliases: ["landcruiser", "land-cruiser"] },
  { model: "F-Type", makes: ["Jaguar"], aliases: ["ftype", "f type", "f-type"] },
  { model: "911", makes: ["Porsche"], aliases: ["911"] },
  { model: "356", makes: ["Porsche"], aliases: ["356"] },
  { model: "550 Spyder", makes: ["Porsche"], aliases: ["550", "550 spyder"] },
  { model: "912", makes: ["Porsche"], aliases: ["912"] },
  { model: "914", makes: ["Porsche"], aliases: ["914"] },
  { model: "924", makes: ["Porsche"], aliases: ["924"] },
  { model: "928", makes: ["Porsche"], aliases: ["928"] },
  { model: "944", makes: ["Porsche"], aliases: ["944"] },
  { model: "968", makes: ["Porsche"], aliases: ["968"] },
  { model: "718", makes: ["Porsche"], aliases: ["718"] },
  { model: "Boxster", makes: ["Porsche"], aliases: ["boxster"] },
  { model: "Cayman", makes: ["Porsche"], aliases: ["cayman"] },
  { model: "Panamera", makes: ["Porsche"], aliases: ["panamera"] },
  { model: "Cayenne", makes: ["Porsche"], aliases: ["cayenne"] },
  { model: "Macan", makes: ["Porsche"], aliases: ["macan"] },
  { model: "Supra", makes: ["Toyota"], aliases: ["supra"] },
  { model: "Highlander", makes: ["Toyota"], aliases: ["highlander"] },
  { model: "Land Cruiser", makes: ["Toyota"], aliases: ["land cruiser", "fj40", "fj45", "fj60", "fj62", "fj80", "lc40", "lc60", "lc70", "lc79", "lc80"] },
  { model: "Accord", makes: ["Honda"], aliases: ["accord"] },
  { model: "Civic", makes: ["Honda"], aliases: ["civic"] },
  { model: "Prius", makes: ["Toyota"], aliases: ["prius"] },
  { model: "NSX", makes: ["Acura", "Honda"], aliases: ["nsx"] },
  { model: "R8", makes: ["Audi"], aliases: ["r8"] },
  { model: "GT-R", makes: ["Nissan"], aliases: ["gtr", "gt r", "gt-r"] },
  { model: "370Z", makes: ["Nissan"], aliases: ["370z"] },
  { model: "M3", makes: ["BMW"], aliases: ["m3"] },
  { model: "360", makes: ["Ferrari"], aliases: ["360", "modena"] },
  { model: "F430", makes: ["Ferrari"], aliases: ["f430"] },
  { model: "458", makes: ["Ferrari"], aliases: ["458"] },
  { model: "488", makes: ["Ferrari"], aliases: ["488"] },
  { model: "Viper", makes: ["Dodge"], aliases: ["viper"] },
  { model: "Corvette", makes: ["Chevrolet"], aliases: ["corvette", "vette"] },
  { model: "Mustang", makes: ["Ford"], aliases: ["mustang", "stang"] },
  { model: "MX-5", makes: ["Mazda"], aliases: ["miata", "mx5", "mx 5"] },
  { model: "Camaro", makes: ["Chevrolet"], aliases: ["camaro"] },
  { model: "Countach", makes: ["Lamborghini"], aliases: ["countach"] },
  { model: "Testarossa", makes: ["Ferrari"], aliases: ["testarossa"] },
  { model: "Defender", makes: ["Land Rover"], aliases: ["defender"] },
  // "Range Rover" contains "Rover" (a defunct marque in the taxonomy) and
  // was misparsing to Rover Mini; own it under Land Rover so the make and
  // model both resolve correctly.
  { model: "Range Rover", makes: ["Land Rover"], aliases: ["range rover", "rangerover", "range rover sport", "range rover evoque", "range rover velar"] },
  { model: "Skyline", makes: ["Nissan"], aliases: ["skyline"] },
  { model: "Carrera", makes: ["Porsche"], aliases: ["carrera"] }
];

// Production-year validity for models where we know the ranges. vPIC covers most
// modern years at runtime; these curated ranges matter most for pre-1981 classics
// where vPIC data is thin.
// Same-make competitor segments (locked): a widening scope for platform
// ROUTING, never valuation. The segment is the set of models whose buyers
// converge in the same bracket; claims scoped to it must always name it.
// Start with Audi (TT test case); expand only when confirmed.
export const MODEL_SEGMENTS = [
  { make: "Audi", key: "sport_compact", label: "Audi sport-compact", models: ["TT", "A3", "A4"] }
];

export const PRODUCTION_RULES = [
  // Corolla: in production since 1966. The generation map holds only the
  // collector AE86 era, so without this rule the resolver read 1985-1987
  // as the production span and falsely challenged modern Corollas.
  { make: "Toyota", model: "Corolla", aliases: ["corolla"], ranges: [[1966, 2026]] },
  // Partial-era audit (July 2026): every generation-mapped model whose map
  // covers less than real production gets a curated rule, so the map's
  // collector-era slices never masquerade as production spans.
  { make: "BMW", model: "M5", aliases: ["m5"], ranges: [[1985, 2026]] },
  { make: "Toyota", model: "Land Cruiser", aliases: ["land cruiser", "landcruiser"], ranges: [[1951, 2026]] },
  { make: "Volkswagen", model: "Beetle", aliases: ["beetle", "bug", "super beetle"], ranges: [[1946, 2019]] },
  { make: "Volkswagen", model: "Bus", aliases: ["bus", "microbus", "vanagon", "transporter"], ranges: [[1950, 2003]] },
  { make: "Mercedes-Benz", model: "SL-Class", aliases: ["sl-class", "sl", "300sl", "380sl", "450sl", "500sl", "560sl", "sl500", "sl550", "sl55", "sl63", "sl65"], ranges: [[1954, 2026]] },
  { make: "Mercedes-Benz", model: "S-Class", aliases: ["s-class", "sclass", "s500", "s550", "s560", "s600", "s63", "s65"], ranges: [[1972, 2026]] },
  { make: "Audi", model: "A6", aliases: ["a6"], ranges: [[1995, 2026]] },
  { make: "Nissan", model: "Skyline", aliases: ["skyline"], ranges: [[1957, 2026]] },
  { make: "Land Rover", model: "Range Rover", aliases: ["range rover", "rangerover"], ranges: [[1970, 2026]] },
  { make: "Dodge", model: "Charger", aliases: ["charger"], ranges: [[1966, 1978], [1982, 1987], [2006, 2026]] },
  { make: "Toyota", model: "Highlander", aliases: ["highlander"], ranges: [[2001, 2026]] },
  { make: "Toyota", model: "Supra", aliases: ["supra"], ranges: [[1978, 2002], [2020, 2026]] },
  { make: "Jaguar", model: "E-Type", aliases: ["etype", "e type", "e-type"], ranges: [[1961, 1974]], suggestion: "Jaguar F-Type", suggestionStart: 2013 },
  { make: "Ford", model: "F-150 Raptor", aliases: ["raptor"], ranges: [[2010, 2026]], suggestion: "Ford F-100 or F-150", suggestionStart: 0 },
  { make: "Jaguar", model: "F-Type", aliases: ["ftype", "f type", "f-type"], ranges: [[2013, 2024]] },
  { make: "Acura", model: "NSX", aliases: ["nsx"], ranges: [[1991, 2005], [2017, 2022]] },
  { make: "Honda", model: "NSX", aliases: ["nsx"], ranges: [[1991, 2005], [2017, 2022]] },
  { make: "Nissan", model: "370Z", aliases: ["370z"], ranges: [[2009, 2020]] },
  { make: "Nissan", model: "GT-R", aliases: ["gtr", "gt r", "gt-r"], ranges: [[2009, 2024]] },
  { make: "Audi", model: "R8", aliases: ["r8"], ranges: [[2008, 2023]] },
  { make: "BMW", model: "M3", aliases: ["m3"], ranges: [[1986, 2026]] },
  { make: "Porsche", model: "356", aliases: ["356"], ranges: [[1948, 1965]] },
  { make: "Porsche", model: "550 Spyder", aliases: ["550", "550 spyder"], ranges: [[1953, 1956]] },
  { make: "Porsche", model: "911", aliases: ["911"], ranges: [[1964, 2026]] },
  { make: "Porsche", model: "912", aliases: ["912"], ranges: [[1965, 1969], [1976, 1976]] },
  { make: "Porsche", model: "914", aliases: ["914"], ranges: [[1969, 1976]] },
  { make: "Porsche", model: "924", aliases: ["924"], ranges: [[1976, 1988]] },
  { make: "Porsche", model: "928", aliases: ["928"], ranges: [[1978, 1995]] },
  { make: "Porsche", model: "944", aliases: ["944"], ranges: [[1982, 1991]] },
  { make: "Porsche", model: "968", aliases: ["968"], ranges: [[1992, 1995]] },
  { make: "Porsche", model: "Boxster", aliases: ["boxster"], ranges: [[1997, 2026]] },
  { make: "Porsche", model: "Cayman", aliases: ["cayman"], ranges: [[2006, 2026]] },
  { make: "Porsche", model: "718", aliases: ["718"], ranges: [[2017, 2026]] },
  { make: "Porsche", model: "Panamera", aliases: ["panamera"], ranges: [[2010, 2026]] },
  { make: "Porsche", model: "Cayenne", aliases: ["cayenne"], ranges: [[2003, 2026]] },
  { make: "Porsche", model: "Macan", aliases: ["macan"], ranges: [[2015, 2026]] },
  { make: "Ferrari", model: "550 Maranello", aliases: ["550", "550 maranello"], ranges: [[1996, 2001]] },
  { make: "Ferrari", model: "550 Barchetta", aliases: ["550 barchetta"], ranges: [[2000, 2001]] },
  { make: "Ferrari", model: "LaFerrari", aliases: ["laferrari", "la ferrari"], ranges: [[2013, 2016]] },
  { make: "Mercedes-Benz", model: "A-Class", aliases: ["a-class", "a class", "aclass", "a220", "a250"], ranges: [[2019, 2026]] }
];

// Makes that only ever produced one model. Used when neither the taxonomy nor
// our market records list models for the make; the model resolves silently.
// A base model name that deterministically means one variant for a year
// range auto-resolves to that trim instead of failing year validation
// ("2015 Ferrari California" is a California T).

// Trim-token whitelist (locked): a label's trim may only contain these
// tokens or letter+digit alphanumerics (4S, Z06, GT350). Everything else is
// conversation, not car, and never renders.
export const TRIM_VOCABULARY = new Set([
  "carrera","gts","gt","rs","rsr","turbo","targa","touring","spyder","speedster","classic","sport","clubsport",
  "competition","cs","csl","base","standard","s","t","e","l","se","sl","lt","ls","lx","ex","si","r","z","m","v",
  // Mercedes classic body-suffix codes (W123/W124/W126/W201). Without these the
  // whitelist drops "CE"/"TE"/"SEL"/"D" etc., leaving a bare number ("300") that
  // modelIsMainstream cannot distinguish from a 300 SL. E/SE/SL are already above.
  "ce","te","cd","td","sel","sec","sd","sdl","d",
  "stingray","grand","shelby","boss","mach","cobra","svt","raptor","lightning","king","ranch","xlt","xl","lariat","tremor",
  "srt","hellcat","demon","redeye","scat","pack","super","bee","daytona","judge","formula","trans","am",
  "amg","black","series","edition","anniversary","limited","premium","plus","performance","executive","designo",
  "dinan","alpina","xdrive","jcw","cooper","works","abarth","veloce","quadrifoglio","ti","gta","spider","evo",
  "evoluzione","superleggera","performante","sto","svj","sv","tecnica","roadster","scuderia","pista","tdf","gto","gtb",
  "vantage","volante","nismo","spec","laramie","rebel","trx","wagon","platinum","denali","rubicon","sahara","willys",
  "mojave","hemi","rt","trd","supercharged","sti","gsr","mr","evolution","fastback","longtail","weissach","lightweight",
  "sportback","avant","allroad","estate","xkr","vanden","plas","paket","exclusive","heritage","tribute","gt3rs"
]);

// Nicknames that name a make but leave the model genuinely ambiguous: the
// resolver asks with these exact chips instead of guessing.
export const AMBIGUOUS_NICKNAMES = [
  { alias: "hellcat", make: "Dodge", question: "Which Hellcat is it?", chips: ["Challenger Hellcat", "Charger Hellcat", "Not sure"] }
];

// Porsche mid-engine BODY-STYLE split (Aug 2026). "718", "981" and "987" are
// generation names shared by the Boxster (roadster) and Cayman (coupe). Selecting
// one is a model-LINE choice, not a body-style choice, so we never silently
// collapse it. A body-style-specific trim resolves the body directly (no extra
// tap); the explicit words "boxster"/"cayman" already resolve via model matching.
// Everything else (S, GTS, GTS 4.0, T, Style Edition, base, "not sure", skip) is
// ambiguous and falls back to a "Boxster or Cayman?" follow-up.
//   Spyder / Spyder RS ............... Boxster-only across 718/981/987
//   25 Years (anniversary) ........... 718 Boxster-only
//   GT4 / GT4 RS / GT4 Clubsport ..... Cayman-only across 718/981
//   Cayman R ......................... 987 Cayman (carries the word "cayman")
export const BODY_STYLE_SPLITS = [
  {
    make: "Porsche",
    codes: ["718", "981", "987"],
    models: ["Boxster", "Cayman"],
    question: "Is it the Boxster or the Cayman?",
    chips: ["Boxster", "Cayman", "Not sure"],
    trimSignals: [
      { re: /\bspyder\b/i, model: "Boxster" },
      { re: /\b25\s*(?:years?|th)\b/i, model: "Boxster" },
      { re: /\bgt4\b/i, model: "Cayman" }
    ]
  }
];

export const YEAR_TRIM_RULES = [
  { make: "Ferrari", model: "California", trim: "T", yearStart: 2015, yearEnd: 2018 }
];

// Modern marques the OldCarsData /makes list omits (its universe is auction
// history, so newer brands lag). vPIC has them but its full make dump also
// carries RV/trailer/equipment brands that collide with model names ("Skyline",
// "Charger", "Cruiser" are vPIC makes and, being longer strings, would beat the
// real make), so we add only this curated set instead of unioning all of vPIC.
export const EXTRA_MAKES = ["Genesis", "Lucid", "Rivian", "Polestar", "Fisker", "Karma", "VinFast"];

export const SINGLE_MODEL_MAKES = {
  "amphicar": "770",
  "tucker": "48",
  "bricklin": "SV-1",
  "delorean": "DMC-12"
};

export function porscheSuggestionChips(year) {
  if (year >= 2017) return ["911", "718", "Panamera", "Cayenne", "Macan"];
  if (year >= 2006) return ["911", "Boxster", "Cayman", "Panamera", "Cayenne"];
  if (year >= 1997) return ["911", "Boxster", "Cayman", "968", "928"];
  if (year >= 1982) return ["911", "944", "928", "924"];
  if (year >= 1976) return ["911", "924", "928", "914"];
  if (year >= 1969) return ["911", "912", "914"];
  if (year >= 1964) return ["911", "912", "356"];
  if (year >= 1953) return ["356", "550 Spyder"];
  return ["911", "718", "Boxster", "Cayman", "Panamera"];
}
