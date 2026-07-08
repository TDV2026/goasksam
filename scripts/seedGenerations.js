// Seeds taxonomy_generations from the curated list in lib/generations.js,
// derives chassis-code alias rows (997, e46, R32...) into taxonomy_aliases so
// one structure serves resolution hints and the ladder, and prints a coverage
// report of our most-recorded models so the next seed additions come from
// real demand rather than guesses.
//
// Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run seed:generations

import { CURATED_GENERATIONS, generationModelToken } from "../lib/generations.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const HEADERS = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
const slug = v => String(v || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, "-");

async function upsert(table, rows, conflict) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${conflict}`, {
    method: "POST",
    headers: { ...HEADERS, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows)
  });
  if (!res.ok) throw new Error(`${table} upsert failed: ${res.status} ${await res.text()}`);
}

async function select(pathAndQuery) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`${pathAndQuery}: ${res.status} ${await res.text()}`);
  return res.json();
}

const now = new Date().toISOString();

// 1. Generations table.
const generationRows = CURATED_GENERATIONS.map(g => ({
  make: g.make,
  model: g.model,
  generation_code: g.code,
  year_start: g.yearStart,
  year_end: g.yearEnd,
  updated_at: now
}));
await upsert("taxonomy_generations", generationRows, "make,model,generation_code");
console.log(`Seeded ${generationRows.length} generation rows.`);

// 2. Derive chassis-code aliases (silent expansions) for codes that read as
// chassis codes. Skip codes already aliased for that make; never overwrite
// curated rows.
const existing = await select("taxonomy_aliases?select=alias_slug,make&limit=5000");
const existingKeys = new Set(existing.map(a => `${a.alias_slug}|${slug(a.make)}`));
const aliasRows = [];
const seen = new Set();
for (const g of CURATED_GENERATIONS) {
  const token = generationModelToken(g);
  if (!token) continue;
  const key = `${slug(token)}|${slug(g.make)}`;
  if (seen.has(key) || existingKeys.has(key)) continue;
  seen.add(key);
  aliasRows.push({
    alias: token.toLowerCase(),
    alias_slug: slug(token),
    kind: "nickname",
    make: g.make,
    model: g.model,
    trim: null,
    confirm: false,
    source: "generated",
    updated_at: now
  });
}
if (aliasRows.length) await upsert("taxonomy_aliases", aliasRows, "alias_slug,make");
console.log(`Derived ${aliasRows.length} new chassis-code aliases (${existingKeys.size} already present).`);

// 3. Coverage report: most-recorded models vs seeded generation coverage.
const records = await select("vehicle_market_records?select=make,model&limit=10000&order=ingested_at.desc");
const counts = new Map();
for (const row of records) {
  if (!row.make || !row.model) continue;
  const key = `${row.make}|${String(row.model).split(/\s+/)[0]}`;
  counts.set(key, (counts.get(key) || 0) + 1);
}
const covered = new Set(CURATED_GENERATIONS.map(g => `${g.make}|${g.model.split(/\s+/)[0]}`.toLowerCase()));
const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
const total = ranked.reduce((sum, [, count]) => sum + count, 0);
let running = 0;
console.log("\nTop recorded models (target: generation coverage for ~top 80%):");
for (const [key, count] of ranked.slice(0, 25)) {
  running += count;
  const isCovered = covered.has(key.toLowerCase());
  console.log(`  ${isCovered ? "MAPPED " : "unmapped"}  ${key.padEnd(32)} ${count} records (${Math.round(running / total * 100)}% cumulative)`);
}
console.log("\nUnmapped models above are the next seed candidates. Live demand for");
console.log("unmapped ladders also logs to app_usage_events (metadata.generationMapped=false).");
