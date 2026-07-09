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
  { alias: "xke", make: "Jaguar", model: "E-Type", kind: "nickname" },
  { alias: "gt3", make: "Porsche", model: "911", trim: "GT3", kind: "nickname" },
  { alias: "gt2", make: "Porsche", model: "911", trim: "GT2", kind: "nickname" },
  { alias: "modena", make: "Ferrari", model: "360", kind: "nickname" },
  { alias: "carrera", make: "Porsche", model: "911", trim: "Carrera", kind: "nickname" },
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
  { alias: "mustange", make: "Ford", model: "Mustang", kind: "misspelling" }
];

// A model name that strongly implies a specific make. Used to catch inputs like
// "Porsche E-Type" and steer the user to the real owner of the nameplate.
export const MODEL_OWNERSHIP = [
  { model: "E-Type", makes: ["Jaguar"], aliases: ["etype", "e type", "e-type"], suggestion: "Jaguar F-Type", suggestionStart: 2013 },
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
  { model: "Skyline", makes: ["Nissan"], aliases: ["skyline"] },
  { model: "Carrera", makes: ["Porsche"], aliases: ["carrera"] }
];

// Production-year validity for models where we know the ranges. vPIC covers most
// modern years at runtime; these curated ranges matter most for pre-1981 classics
// where vPIC data is thin.
export const PRODUCTION_RULES = [
  { make: "Toyota", model: "Highlander", aliases: ["highlander"], ranges: [[2001, 2026]] },
  { make: "Toyota", model: "Supra", aliases: ["supra"], ranges: [[1978, 2002], [2020, 2026]] },
  { make: "Jaguar", model: "E-Type", aliases: ["etype", "e type", "e-type"], ranges: [[1961, 1974]], suggestion: "Jaguar F-Type", suggestionStart: 2013 },
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
  { make: "Porsche", model: "Macan", aliases: ["macan"], ranges: [[2015, 2026]] }
];

// Makes that only ever produced one model. Used when neither the taxonomy nor
// our market records list models for the make; the model resolves silently.
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
