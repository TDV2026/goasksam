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
  G("Porsche", "911", "930", 1974, 1988),
  G("Porsche", "911", "964", 1990, 1994),
  G("Porsche", "911", "993", 1995, 1998),
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
  G("Chevrolet", "Chevelle", "first", 1964, 1967),
  G("Chevrolet", "Chevelle", "second", 1968, 1972),
  G("Chevrolet", "Chevelle", "third", 1973, 1977),
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
export async function findGeneration(vehicle, options = {}) {
  const year = Number(vehicle?.year);
  const make = norm(vehicle?.make);
  const family = familyToken(vehicle?.model);
  if (!Number.isFinite(year) || !make || !family) return null;
  const rows = await loadAllGenerations(options);
  return rows.find(row =>
    norm(row.make) === make &&
    familyToken(row.model) === family &&
    year >= row.yearStart && year <= row.yearEnd
  ) || null;
}

// Chassis-code-shaped generation codes (997, e46, R32) double as OldCarsData
// model names for some sources; expose the fetchable token or null.
export function generationModelToken(generation) {
  if (!generation) return null;
  const base = String(generation.code).split(".")[0];
  return /^[a-z]?\d{2,3}$/i.test(base) ? base : null;
}
