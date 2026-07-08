// One-time systematic alias batch (plus rerunnable top-ups). Generates
// colloquial names, abbreviations, chassis-code shorthand and common
// misspellings for models in the seeded taxonomy. Every candidate is verified
// against taxonomy_models before it is written: an alias may only target a
// model that OldCarsData can actually search. Cross-make collisions (one alias
// naming models under two makes) are downgraded to confirm entries so nothing
// ambiguous resolves silently. Rows are tagged source=generated so curated
// entries stay distinguishable (falls back with a warning if the source
// column has not been added yet).
//
// Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run seed:aliases

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const HEADERS = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
const norm = v => String(v || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
const slug = v => norm(v).replace(/\s+/g, "-");

async function fetchAll(pathBase) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathBase}&limit=1000&offset=${offset}`, { headers: HEADERS });
    if (!res.ok) throw new Error(`${pathBase}: ${res.status} ${await res.text()}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

const models = await fetchAll("taxonomy_models?select=name,slug,make_slug");
const existing = await fetchAll("taxonomy_aliases?select=alias_slug,make");
const modelIndex = new Map(); // make_slug -> Map(model_slug -> name)
for (const m of models) {
  if (!modelIndex.has(m.make_slug)) modelIndex.set(m.make_slug, new Map());
  modelIndex.get(m.make_slug).set(m.slug, m.name);
}
const existingKeys = new Set(existing.map(a => `${a.alias_slug}|${norm(a.make)}`));

// Candidate dictionary: {make, alias, model, trim?, confirm?}. Model names are
// best-effort; verification against the taxonomy decides what survives.
const C = (make, alias, model, extra = {}) => ({ make, alias, model, ...extra });
const CANDIDATES = [
  // Porsche chassis codes and nicknames
  C("Porsche", "993", "911"), C("Porsche", "901", "911"),
  C("Porsche", "widowmaker", "930", { confirm: true }),
  C("Porsche", "nine eleven", "911"),
  // BMW chassis codes
  C("BMW", "e21", "3-Series"), C("BMW", "e30", "3-Series"), C("BMW", "e36", "3-Series"),
  C("BMW", "e46", "3-Series"), C("BMW", "e90", "3-Series"), C("BMW", "e92", "3-Series"),
  C("BMW", "f30", "3-Series"), C("BMW", "g20", "3-Series"),
  C("BMW", "e28", "5-Series"), C("BMW", "e34", "5-Series"), C("BMW", "e39", "5-Series"),
  C("BMW", "e60", "5-Series"), C("BMW", "f10", "5-Series"),
  C("BMW", "e24", "6-Series"), C("BMW", "e38", "7-Series"), C("BMW", "e31", "8-Series"),
  C("BMW", "csl", "3.0 CSL"), C("BMW", "batmobile", "3.0 CSL", { confirm: true }),
  C("BMW", "clown shoe", "Z3", { confirm: true }), C("BMW", "tii", "2002"),
  // Mercedes-Benz nicknames (verification decides which model names exist)
  C("Mercedes-Benz", "gullwing", "300SL"), C("Mercedes-Benz", "gullwing", "300 SL"),
  C("Mercedes-Benz", "pagoda", "SL-Class", { confirm: true }),
  C("Mercedes-Benz", "adenauer", "300"), C("Mercedes-Benz", "gwagen", "G-Class"),
  C("Mercedes-Benz", "g wagon", "G-Class"), C("Mercedes-Benz", "sec", "S-Class"),
  // Volkswagen extras beyond the curated set
  C("Volkswagen", "squareback", "Type 3"), C("Volkswagen", "notchback", "Type 3", { confirm: true }),
  C("Volkswagen", "vee dub", "Beetle", { confirm: true }),
  // Chevrolet
  C("Chevrolet", "z28", "Camaro", { trim: "Z28" }), C("Chevrolet", "iroc", "Camaro", { trim: "IROC-Z" }),
  C("Chevrolet", "tri five", "Bel Air", { confirm: true }), C("Chevrolet", "elco", "El Camino"),
  C("Chevrolet", "vert", "Corvette", { confirm: true }),
  // Ford
  C("Ford", "fox body", "Mustang"), C("Ford", "foxbody", "Mustang"),
  C("Ford", "gt350", "Mustang", { trim: "Shelby GT350" }), C("Ford", "gt500", "Mustang", { trim: "Shelby GT500" }),
  C("Ford", "raptor", "F-150", { trim: "Raptor" }), C("Ford", "lightning", "F-150", { trim: "Lightning", confirm: true }),
  // Pontiac
  C("Pontiac", "goat", "GTO", { confirm: true }), C("Pontiac", "judge", "GTO", { trim: "The Judge", confirm: true }),
  C("Pontiac", "trans am", "Firebird", { trim: "Trans Am" }),
  // Toyota
  C("Toyota", "hachi roku", "Corolla", { trim: "AE86", confirm: true }),
  C("Toyota", "ae86", "Corolla", { trim: "AE86" }),
  // Nissan / Datsun
  C("Nissan", "hakosuka", "Skyline", { confirm: true }), C("Nissan", "kenmeri", "Skyline", { confirm: true }),
  C("Nissan", "r32", "Skyline", { trim: "R32" }), C("Nissan", "r33", "Skyline", { trim: "R33" }),
  C("Nissan", "r34", "Skyline", { trim: "R34" }), C("Nissan", "r35", "GT-R"),
  C("Nissan", "s13", "240SX"), C("Nissan", "s14", "240SX"),
  C("Datsun", "fairlady", "Z", { confirm: true }),
  // Ferrari
  C("Ferrari", "daytona", "365", { trim: "GTB/4 Daytona", confirm: true }),
  C("Ferrari", "bb512", "512"), C("Ferrari", "f355", "355"),
  C("Ferrari", "scuderia", "430", { trim: "Scuderia" }), C("Ferrari", "250 gto", "250 GT", { confirm: true }),
  // Lamborghini
  C("Lamborghini", "murci", "Murcielago"), C("Lamborghini", "hura", "Huracan", { confirm: true }),
  // Jaguar
  C("Jaguar", "shaguar", "E-Type", { confirm: true }),
  // Land Rover
  C("Land Rover", "landy", "Defender", { confirm: true }), C("Land Rover", "rangie", "Range Rover"),
  // Honda / Acura
  C("Honda", "s2k", "S2000"), C("Acura", "itr", "Integra", { trim: "Type R" }),
  // Dodge / Plymouth
  C("Dodge", "hellcat", "Challenger", { trim: "Hellcat", confirm: true }),
  C("Plymouth", "cuda", "Barracuda"), C("Plymouth", "roadrunner", "Road Runner"),
  C("Plymouth", "road runner", "Road Runner"),
  // Cadillac / Oldsmobile / Buick
  C("Cadillac", "eldo", "Eldorado"), C("Oldsmobile", "cutty", "Cutlass", { confirm: true }),
  C("Buick", "gn", "Grand National"), C("Buick", "gnx", "Grand National", { trim: "GNX" }),
  // Austin-Healey / MG / Triumph
  C("Austin-Healey", "bugeye", "Sprite"), C("Austin-Healey", "frogeye", "Sprite"),
  C("Austin-Healey", "big healey", "3000"),
  C("Triumph", "spit", "Spitfire", { confirm: true }),
  // Alfa Romeo
  C("Alfa Romeo", "duetto", "105 Series", { confirm: true }),
  // Mazda
  C("Mazda", "na miata", "MX-5", { trim: "NA" }), C("Mazda", "nb miata", "MX-5", { trim: "NB" }),
  C("Mazda", "rex", "RX-7", { confirm: true })
];

// 1. Verify each candidate's target exists in the seeded taxonomy.
const verified = [];
const dropped = [];
for (const c of CANDIDATES) {
  const makeModels = modelIndex.get(slug(c.make));
  if (makeModels && makeModels.has(slug(c.model))) {
    verified.push({ ...c, model: makeModels.get(slug(c.model)) });
  } else {
    dropped.push(`${c.make}: ${c.alias} -> ${c.model}`);
  }
}

// Same alias twice for one make (e.g. two spellings of a target): keep first.
const perMakeSeen = new Set();
const unique = verified.filter(c => {
  const key = `${slug(c.alias)}|${slug(c.make)}`;
  if (perMakeSeen.has(key) || existingKeys.has(`${slug(c.alias)}|${norm(c.make)}`)) return false;
  perMakeSeen.add(key);
  return true;
});

// 2. Cross-make collision check: one alias naming models under 2+ makes must
// never resolve silently.
const byAlias = new Map();
for (const c of unique) {
  if (!byAlias.has(slug(c.alias))) byAlias.set(slug(c.alias), []);
  byAlias.get(slug(c.alias)).push(c);
}
for (const group of byAlias.values()) {
  if (new Set(group.map(c => slug(c.make))).size > 1) group.forEach(c => { c.confirm = true; });
}

const now = new Date().toISOString();
const rows = unique.map(c => ({
  alias: c.alias,
  alias_slug: slug(c.alias),
  kind: c.confirm ? "misspelling" : "nickname",
  make: c.make,
  model: c.model,
  trim: c.trim || null,
  confirm: !!c.confirm,
  source: "generated",
  updated_at: now
}));

async function upsert(payload) {
  return fetch(`${SUPABASE_URL}/rest/v1/taxonomy_aliases?on_conflict=alias_slug,make`, {
    method: "POST",
    headers: { ...HEADERS, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(payload)
  });
}

let res = await upsert(rows);
if (!res.ok) {
  const text = await res.text();
  if (/source/.test(text)) {
    console.warn("WARN: taxonomy_aliases has no source column; inserting without the tag.");
    console.warn("Run once in the SQL editor: alter table taxonomy_aliases add column if not exists source text not null default 'curated';");
    res = await upsert(rows.map(({ source, ...rest }) => rest));
    if (!res.ok) throw new Error(`upsert failed: ${res.status} ${await res.text()}`);
  } else {
    throw new Error(`upsert failed: ${res.status} ${text}`);
  }
}

const perMake = {};
for (const r of rows) perMake[r.make] = (perMake[r.make] || 0) + 1;
console.log(`Inserted ${rows.length} generated aliases (${dropped.length} candidates dropped: target model not in taxonomy).`);
console.log("Per make:", JSON.stringify(perMake, null, 2));
if (dropped.length) console.log("Dropped:", dropped.join(" | "));
