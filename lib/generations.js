// Model generations: the one structure serving both resolution hints and the
// generation-aware evidence ladder. Source of truth is the curated list below;
// scripts/seedGenerations.js seeds it into taxonomy_generations (DB rows
// override once seeded) and derives chassis-code alias rows from it.
//
// Curation rule (locked): only boundaries we are confident of, US model years.
// A missing mapping is safe (the ladder falls back to calendar +/- 2 years);
// a wrong one poisons comps. Prefer gaps over guesses: ambiguous handover
// years (e.g. 1989 911, 1981-83 Land Cruiser) are deliberately unmapped.

import { supabaseEnv, supabaseSelect } from "./_supabase.js";

const G = (make, model, code, yearStart, yearEnd) => ({ make, model, code, yearStart, yearEnd });

export const CURATED_GENERATIONS = [
  // Porsche 911 (1989 left unmapped: 3.2 Carrera and 964 overlap)
  G("Porsche", "911", "901", 1964, 1973),
  // G-body era (bug 1): 930 is the TURBO code, not the whole generation. Label by the base car's own
  // name - early G-body 1974-1977, 911SC 1978-1983, 3.2 Carrera 1984-1988 (1989 left unmapped, 964
  // overlap) - and reserve 930 for the Turbo (placed by the trim-year map in lib/modelRules.js).
  G("Porsche", "911", "G-Body", 1974, 1977),
  G("Porsche", "911", "911SC", 1978, 1983),
  G("Porsche", "911", "3.2 Carrera", 1984, 1988),
  G("Porsche", "911", "964", 1990, 1994),
  // 1994 is a DELIBERATE 964/993 overlap: Porsche's model-year switch straddled calendar 1994, so
  // a clean cutoff misclassifies real cars either way. The overlap is disambiguated at point of use
  // (the generation clarify asks the seller), not swept into the taxonomy as a silent guess.
  G("Porsche", "911", "993", 1994, 1998),
  G("Porsche", "911", "996", 1999, 2004),
  G("Porsche", "911", "997", 2005, 2011),
  G("Porsche", "911", "991.1", 2012, 2016),
  G("Porsche", "911", "991.2", 2017, 2019),
  G("Porsche", "911", "992", 2020, 2026),
  // OldCarsData files some 911 generations as their own models (997, 991,
  // 996); mirror rows under those model names so their records count as
  // mapped and any resolution to those models still finds a generation.
  G("Porsche", "996", "996", 1999, 2004),
  G("Porsche", "997", "997", 2005, 2011),
  G("Porsche", "991", "991.1", 2012, 2016),
  G("Porsche", "991", "991.2", 2017, 2019),
  G("Porsche", "992", "992", 2020, 2026),
  // Porsche Cayenne (one OCD model, 2003-2025). 955 and 957 are the E1 pre- and post-facelift (957
  // got the direct-injection engines); 958 is E2; 9Y0 is E3. Boundaries at 2006/2007, 2010/2011 and
  // 2018/2019. Trim scoping (GTS, Turbo, S) is handled separately, so GTS never pools with base/Turbo.
  G("Porsche", "Cayenne", "955", 2003, 2006),
  G("Porsche", "Cayenne", "957", 2007, 2010),
  G("Porsche", "Cayenne", "958", 2011, 2018),
  G("Porsche", "Cayenne", "9Y0", 2019, 2025),
  // Porsche Panamera
  G("Porsche", "Panamera", "970", 2010, 2016),
  G("Porsche", "Panamera", "971", 2017, 2023),
  // Porsche 356 / Boxster / Cayman
  G("Porsche", "356", "pre-A", 1948, 1955),
  G("Porsche", "356", "A", 1956, 1959),
  G("Porsche", "356", "B", 1960, 1963),
  G("Porsche", "356", "C", 1964, 1965),
  G("Porsche", "Boxster", "986", 1997, 2004),
  G("Porsche", "Boxster", "987", 2005, 2012),
  G("Porsche", "Boxster", "981", 2013, 2016),
  G("Porsche", "Boxster", "718", 2017, 2026),
  G("Porsche", "Cayman", "987", 2006, 2012),
  G("Porsche", "Cayman", "981", 2013, 2016),
  G("Porsche", "Cayman", "718", 2017, 2026),
  // BMW M cars (2019-20 M3 gap and M5/M2 gaps are real)
  G("BMW", "M3", "e30", 1986, 1991),
  G("BMW", "M3", "e36", 1992, 1999),
  G("BMW", "M3", "e46", 2000, 2006),
  G("BMW", "M3", "e92", 2007, 2013),
  G("BMW", "M3", "f80", 2014, 2018),
  G("BMW", "M3", "g80", 2021, 2026),
  G("BMW", "M5", "e28", 1985, 1988),
  G("BMW", "M5", "e34", 1989, 1995),
  G("BMW", "M5", "e39", 1998, 2003),
  G("BMW", "M5", "e60", 2005, 2010),
  G("BMW", "M5", "f10", 2011, 2016),
  G("BMW", "M5", "f90", 2018, 2023),
  G("BMW", "M2", "f87", 2016, 2020),
  G("BMW", "M2", "g87", 2023, 2026),
  // M4 (added Sep 2026): F82/F83 coupe+convertible ran 2014-2020; G82/G83 from 2021. Clean
  // handover (no gap year). Keeps a 2019 M4 comp window on its own F82 generation instead of the
  // calendar +/- 2 fallback (which mixed in early G82s). Additive: (BMW, M4) was previously unmapped.
  G("BMW", "M4", "f82", 2014, 2020),
  G("BMW", "M4", "g82", 2021, 2026),
  G("BMW", "3-Series", "e21", 1975, 1983),
  G("BMW", "3-Series", "e30", 1984, 1991),
  G("BMW", "3-Series", "e36", 1992, 1998),
  G("BMW", "3-Series", "e46", 1999, 2005),
  G("BMW", "3-Series", "e90", 2006, 2011),
  G("BMW", "3-Series", "f30", 2012, 2018),
  G("BMW", "3-Series", "g20", 2019, 2026),
  // Corvette (no 1983 model year)
  G("Chevrolet", "Corvette", "C1", 1953, 1962),
  G("Chevrolet", "Corvette", "C2", 1963, 1967),
  G("Chevrolet", "Corvette", "C3", 1968, 1982),
  G("Chevrolet", "Corvette", "C4", 1984, 1996),
  G("Chevrolet", "Corvette", "C5", 1997, 2004),
  G("Chevrolet", "Corvette", "C6", 2005, 2013),
  G("Chevrolet", "Corvette", "C7", 2014, 2019),
  G("Chevrolet", "Corvette", "C8", 2020, 2026),
  // Camaro
  G("Chevrolet", "Camaro", "first", 1967, 1969),
  G("Chevrolet", "Camaro", "second", 1970, 1981),
  G("Chevrolet", "Camaro", "third", 1982, 1992),
  G("Chevrolet", "Camaro", "fourth", 1993, 2002),
  G("Chevrolet", "Camaro", "fifth", 2010, 2015),
  G("Chevrolet", "Camaro", "sixth", 2016, 2024),
  // Firebird (F-body, same generation years as the Camaro)
  G("Pontiac", "Firebird", "first", 1967, 1969),
  G("Pontiac", "Firebird", "second", 1970, 1981),
  G("Pontiac", "Firebird", "third", 1982, 1992),
  G("Pontiac", "Firebird", "fourth", 1993, 2002),
  G("Chevrolet", "Chevelle", "first", 1964, 1967),
  G("Chevrolet", "Chevelle", "second", 1968, 1972),
  G("Chevrolet", "Chevelle", "third", 1973, 1977),
  // Chevrolet C10 (one OCD model, 1960-1987; became C1500 in 1988). Three distinct truck markets:
  // the 1960-66 series, the 1967-72 "Action Line", and the 1973-87 "Square Body". Boundaries at
  // 1966/1967 and 1972/1973.
  G("Chevrolet", "C10", "1960-1966", 1960, 1966),
  G("Chevrolet", "C10", "Action-Line", 1967, 1972),
  G("Chevrolet", "C10", "Square-Body", 1973, 1987),
  // Chevrolet Nova / Chevy II (one OCD model). The 1968-74 third gen is the muscle/SS era; the
  // 1985-88 car is a badge-engineered Corolla (FWD, a completely different market) after a 1980-84
  // gap in the nameplate. Boundaries at 1968, 1975 and the 1985 Corolla-based revival.
  G("Chevrolet", "Nova", "1962-1967", 1962, 1967),
  G("Chevrolet", "Nova", "1968-1974", 1968, 1974),
  G("Chevrolet", "Nova", "1975-1979", 1975, 1979),
  G("Chevrolet", "Nova", "Corolla-based", 1985, 1988),
  // Chevrolet El Camino (one OCD model; no El Camino 1961-1963). A-body generations mirror the
  // Chevelle: 1964-67, 1968-72, the 1973-77 colonnade and the 1978-87 G-body.
  G("Chevrolet", "El Camino", "1959-1960", 1959, 1960),
  G("Chevrolet", "El Camino", "1964-1967", 1964, 1967),
  G("Chevrolet", "El Camino", "1968-1972", 1968, 1972),
  G("Chevrolet", "El Camino", "1973-1977", 1973, 1977),
  G("Chevrolet", "El Camino", "1978-1987", 1978, 1987),
  // Chevrolet Suburban (one OCD model, always a full-size SUV). Confident modern boundaries at the
  // 1972/1973 restyle and the GMT platform changes (1992, 2000, 2007, 2015).
  G("Chevrolet", "Suburban", "1967-1972", 1967, 1972),
  G("Chevrolet", "Suburban", "1973-1991", 1973, 1991),
  G("Chevrolet", "Suburban", "GMT400", 1992, 1999),
  G("Chevrolet", "Suburban", "GMT800", 2000, 2006),
  G("Chevrolet", "Suburban", "GMT900", 2007, 2014),
  G("Chevrolet", "Suburban", "K2XX", 2015, 2020),
  // Pontiac GTO (GM A-body, mirrors Chevelle). First 1964-1967 and second 1968-1972 are the
  // confident collector boundaries: a 1968 GTO is a different market from a 1966-1967 and must
  // not pool with it. 1973 (colonnade) and 1974 (Ventura/Nova-based compact) are deliberately
  // left unmapped (different, low-volume, ambiguous handover) per the prefer-gaps rule. The
  // 2004-2006 revival (Holden Monaro) is its own unambiguous era.
  G("Pontiac", "GTO", "first", 1964, 1967),
  G("Pontiac", "GTO", "second", 1968, 1972),
  G("Pontiac", "GTO", "modern", 2004, 2006),
  // Mustang
  G("Ford", "Mustang", "first", 1965, 1973),
  G("Ford", "Mustang", "second", 1974, 1978),
  G("Ford", "Mustang", "Fox-body", 1979, 1993),
  G("Ford", "Mustang", "SN95", 1994, 2004),
  G("Ford", "Mustang", "S197", 2005, 2014),
  G("Ford", "Mustang", "S550", 2015, 2023),
  G("Ford", "Mustang", "S650", 2024, 2026),
  G("Ford", "Bronco", "first", 1966, 1977),
  G("Ford", "Bronco", "second", 1978, 1979),
  G("Ford", "Bronco", "third", 1980, 1986),
  G("Ford", "Bronco", "fourth", 1987, 1991),
  G("Ford", "Bronco", "fifth", 1992, 1996),
  G("Ford", "Bronco", "sixth", 2021, 2026),
  // Mazda RX-7 (one OCD model spanning three distinct bodies/markets, 1979-2002; the 1992 FC->FD
  // handover is mapped to FD, which launched as a 1992 model year)
  G("Mazda", "RX-7", "FB", 1979, 1985),
  G("Mazda", "RX-7", "FC", 1986, 1991),
  G("Mazda", "RX-7", "FD", 1992, 2002),
  // Nissan 300ZX (one OCD model; Z31 -> Z32 is a major body/market change at 1990)
  G("Nissan", "300ZX", "Z31", 1984, 1989),
  G("Nissan", "300ZX", "Z32", 1990, 2000),
  // Miata (no 1998 US model year)
  G("Mazda", "MX-5", "NA", 1990, 1997),
  G("Mazda", "MX-5", "NB", 1999, 2005),
  G("Mazda", "MX-5", "NC", 2006, 2015),
  G("Mazda", "MX-5", "ND", 2016, 2026),
  // Land Cruiser (1981-83 and 1990 handovers left unmapped)
  G("Toyota", "Land Cruiser", "40-series", 1960, 1980),
  G("Toyota", "Land Cruiser", "60-series", 1984, 1989),
  G("Toyota", "Land Cruiser", "80-series", 1991, 1997),
  G("Toyota", "Land Cruiser", "100-series", 1998, 2007),
  G("Toyota", "Land Cruiser", "200-series", 2008, 2021),
  // Toyota 4Runner (one OCD model, clean generations, no sub-model contamination)
  G("Toyota", "4Runner", "N60", 1984, 1989),
  G("Toyota", "4Runner", "N130", 1990, 1995),
  G("Toyota", "4Runner", "N180", 1996, 2002),
  G("Toyota", "4Runner", "N210", 2003, 2009),
  G("Toyota", "4Runner", "N280", 2010, 2024),
  // Jeep Wrangler (one OCD model; no US 1996 model year between YJ and TJ). "Unlimited" is a 4-door
  // body within JK/JL, not a generation.
  G("Jeep", "Wrangler", "YJ", 1987, 1995),
  G("Jeep", "Wrangler", "TJ", 1997, 2006),
  G("Jeep", "Wrangler", "JK", 2007, 2017),
  G("Jeep", "Wrangler", "JL", 2018, 2025),
  G("Toyota", "Supra", "A40", 1979, 1981),
  G("Toyota", "Supra", "A60", 1982, 1985),
  G("Toyota", "Supra", "A70", 1986, 1992),
  G("Toyota", "Supra", "A80", 1993, 1998),
  G("Toyota", "Supra", "A90", 2019, 2026),
  // VW Beetle / Bus era splits
  G("Volkswagen", "Beetle", "split-and-oval-window", 1946, 1957),
  G("Volkswagen", "Beetle", "classic", 1958, 1967),
  G("Volkswagen", "Beetle", "late", 1968, 1979),
  G("Volkswagen", "Bus", "T1", 1950, 1967),
  G("Volkswagen", "Bus", "T2", 1968, 1979),
  G("Volkswagen", "Bus", "T3", 1980, 1991),
  // Mercedes SL and S-Class
  G("Mercedes-Benz", "SL-Class", "w113", 1963, 1971),
  G("Mercedes-Benz", "SL-Class", "r107", 1972, 1989),
  G("Mercedes-Benz", "SL-Class", "r129", 1990, 2002),
  G("Mercedes-Benz", "S-Class", "w116", 1973, 1980),
  G("Mercedes-Benz", "S-Class", "w126", 1981, 1991),
  G("Mercedes-Benz", "S-Class", "w140", 1992, 1999),
  G("Mercedes-Benz", "S-Class", "w220", 2000, 2006),
  G("Mercedes-Benz", "S-Class", "w221", 2007, 2013),
  G("Mercedes-Benz", "S-Class", "w222", 2014, 2020),
  // Honda S2000
  G("Honda", "S2000", "AP1", 2000, 2003),
  G("Honda", "S2000", "AP2", 2004, 2009),
  // Audi (US model years; 2005 A4 and 2007 TT handovers left unmapped)
  G("Audi", "TT", "8N", 2000, 2006),
  G("Audi", "TT", "8J", 2008, 2015),
  G("Audi", "TT", "8S", 2016, 2022),
  G("Audi", "A4", "B5", 1996, 2001),
  G("Audi", "A4", "B6", 2002, 2004),
  G("Audi", "A4", "B7", 2006, 2008),
  G("Audi", "A4", "B8", 2009, 2016),
  G("Audi", "A4", "B9", 2017, 2023),
  G("Audi", "A6", "C5", 1998, 2004),
  G("Audi", "A6", "C6", 2005, 2011),
  G("Audi", "A6", "C7", 2012, 2018),
  G("Audi", "A6", "C8", 2019, 2025),
  // Toyota Corolla: only the collector-relevant AE86 era
  G("Toyota", "Corolla", "AE86", 1985, 1987),
  // MGB bumper eras
  G("MG", "MGB", "chrome-bumper", 1963, 1974),
  G("MG", "MGB", "rubber-bumper", 1975, 1980),
  // Nissan Skyline
  G("Nissan", "Skyline", "R32", 1989, 1994),
  G("Nissan", "Skyline", "R33", 1995, 1998),
  G("Nissan", "Skyline", "R34", 1999, 2002),
  // Jaguar E-Type (1971 belongs to Series 3); OldCarsData files it as XKE,
  // so both model names carry the rows.
  G("Jaguar", "E-Type", "Series-1", 1961, 1968),
  G("Jaguar", "E-Type", "Series-2", 1969, 1970),
  G("Jaguar", "E-Type", "Series-3", 1971, 1974),
  G("Jaguar", "XKE", "Series-1", 1961, 1968),
  G("Jaguar", "XKE", "Series-2", 1969, 1970),
  G("Jaguar", "XKE", "Series-3", 1971, 1974),
  // Dodge
  G("Dodge", "Charger", "first", 1966, 1967),
  G("Dodge", "Charger", "second", 1968, 1970),
  G("Dodge", "Charger", "third", 1971, 1974),
  G("Dodge", "Charger", "modern", 2006, 2023),
  G("Dodge", "Challenger", "first", 1970, 1974),
  G("Dodge", "Challenger", "modern", 2008, 2023)
];

const norm = value => String(value || "").toLowerCase().trim();
const familyToken = model => norm(model).split(/\s+/)[0] || "";

const generationsCache = { loadedAt: 0, rows: null };
const CACHE_TTL_MS = 10 * 60 * 1000;

// All generation rows: DB first (once seeded), curated fallback. Cached per
// instance like the partners table.
export async function loadAllGenerations(options = {}) {
  if (generationsCache.rows && Date.now() - generationsCache.loadedAt < CACHE_TTL_MS) {
    return generationsCache.rows;
  }
  const env = supabaseEnv(options);
  const dbRows = await supabaseSelect(env, "taxonomy_generations?select=make,model,generation_code,year_start,year_end&limit=2000");
  const rows = dbRows?.length
    ? dbRows.map(row => ({ make: row.make, model: row.model, code: row.generation_code, yearStart: row.year_start, yearEnd: row.year_end }))
    : CURATED_GENERATIONS;
  generationsCache.rows = rows;
  generationsCache.loadedAt = Date.now();
  return rows;
}

// The generation containing this vehicle's year, or null (missing mappings
// are safe: callers fall back to calendar +/- 2 years).
// BODY-SPECIFIC GENERATION CODES (bug 2): one generation whose body variants carry DIFFERENT chassis
// codes. The 2007-2013 M3 is E90 (sedan), E92 (coupe), E93 (convertible); the M4 is F82/G82 (coupe) and
// F83/G83 (convertible). The by-year map files one code per generation, so the body-specific code is
// resolved here from vehicle.bodyStyle. Keyed make|familyToken|norm(baseCode).
const BODY_GEN_CODES = {
  "bmw|m3|e92": { sedan: "E90", coupe: "E92", convertible: "E93", targa: "E92" },
  "bmw|m4|f82": { coupe: "F82", convertible: "F83" },
  "bmw|m4|g82": { coupe: "G82", convertible: "G83" }
};
export async function findGeneration(vehicle, options = {}) {
  const year = Number(vehicle?.year);
  const make = norm(vehicle?.make);
  const family = familyToken(vehicle?.model);
  if (!Number.isFinite(year) || !make || !family) return null;
  const rows = await loadAllGenerations(options);
  const row = rows.find(r =>
    norm(r.make) === make &&
    familyToken(r.model) === family &&
    year >= r.yearStart && year <= r.yearEnd
  );
  if (!row) return null;
  const coded = bodyGenCode(vehicle?.make, vehicle?.model, row.code, vehicle?.bodyStyle);
  return coded !== row.code ? { ...row, code: coded } : row;
}
// Map a generation's base code to its BODY-specific code when the body is known (bug 2): the One Box
// resolves the generation BEFORE the body is detected, so this is re-applied in runOneBox once the body
// is in hand. Returns the body code (E90/E92/E93, F82/F83) or the base code unchanged.
export function bodyGenCode(make, model, baseCode, body) {
  const m = BODY_GEN_CODES[`${norm(make)}|${familyToken(model)}|${norm(baseCode)}`];
  const b = norm(body);
  return (m && b && m[b]) ? m[b] : baseCode;
}

// Curated generations for a model (dedup by code, oldest first). Used by One Box to offer a
// GENERATION clarification for a bare, year-less, trim-less multi-generation nameplate ("911",
// "Corvette", "Mustang") instead of a mixed refusal - different generations are different
// markets. Curated-only (covers the high-volume nameplates); a single-generation model returns
// one row and never triggers the ask.
export function generationsForModel(make, model) {
  const m = String(make || "").toLowerCase().trim(), mo = String(model || "").toLowerCase().trim();
  if (!m || !mo) return [];
  const seen = new Set(), out = [];
  for (const g of CURATED_GENERATIONS) {
    if (g.make.toLowerCase() !== m || g.model.toLowerCase() !== mo) continue;
    if (seen.has(g.code)) continue;
    seen.add(g.code); out.push({ code: g.code, yearStart: g.yearStart, yearEnd: g.yearEnd });
  }
  return out.sort((a, b) => a.yearStart - b.yearStart);
}

// Chassis-code-shaped generation codes (997, e46, R32) double as OldCarsData
// model names for some sources; expose the fetchable token or null.
export function generationModelToken(generation) {
  if (!generation) return null;
  const base = String(generation.code).split(".")[0];
  return /^[a-z]?\d{2,3}$/i.test(base) ? base : null;
}
