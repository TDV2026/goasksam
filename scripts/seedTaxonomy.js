// Seeds the Supabase taxonomy tables from OldCarsData /makes + /models (both
// free, unmetered) plus the curated aliases and production-year rules in
// lib/vehicleData.js. Rerunnable: upserts everything. Run weekly or whenever
// OldCarsData adds coverage.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run seed:taxonomy
//
// Prerequisite: run docs/supabase-taxonomy-schema.sql in the Supabase SQL editor once.

import { slugify } from "../lib/vehicle.js";
import { MAKE_ALIASES, MODEL_ALIASES, PRODUCTION_RULES } from "../lib/vehicleData.js";

const OLDCARSDATA_BASE = "https://api.oldcarsdata.com";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CONCURRENCY = 8;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment.");
  process.exit(1);
}

async function fetchJson(url) {
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${url}: ${json.message || json.error || "request failed"}`);
  return json;
}

async function upsert(table, rows, onConflict) {
  for (let start = 0; start < rows.length; start += 500) {
    const batch = rows.slice(start, start + 500);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Prefer: "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify(batch)
    });
    if (!res.ok) throw new Error(`${table} upsert failed: ${res.status} ${await res.text()}`);
  }
}

function productionRangesFor(makeName, modelName) {
  const rule = PRODUCTION_RULES.find(item =>
    slugify(item.make) === slugify(makeName) &&
    (slugify(item.model) === slugify(modelName) || item.aliases.some(alias => slugify(alias) === slugify(modelName)))
  );
  return rule ? rule.ranges : null;
}

async function mapWithConcurrency(items, limit, worker) {
  const results = [];
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index++;
      results[current] = await worker(items[current], current);
    }
  }));
  return results;
}

const startedAt = Date.now();
const makesJson = await fetchJson(`${OLDCARSDATA_BASE}/makes`);
const makeNames = (makesJson.data || []).filter(Boolean);
console.log(`Fetched ${makeNames.length} makes from OldCarsData.`);

const now = new Date().toISOString();
await upsert("taxonomy_makes", makeNames.map(name => ({
  name,
  slug: slugify(name),
  source: "oldcarsdata",
  updated_at: now
})), "slug");
console.log("Upserted taxonomy_makes.");

let modelCount = 0;
await mapWithConcurrency(makeNames, CONCURRENCY, async makeName => {
  let models = [];
  try {
    const json = await fetchJson(`${OLDCARSDATA_BASE}/models?make=${encodeURIComponent(makeName)}`);
    models = (json.data || []).filter(Boolean);
  } catch (err) {
    console.warn(`  models for ${makeName} failed: ${err.message}`);
    return;
  }
  if (!models.length) return;
  const seen = new Set();
  const rows = models.flatMap(name => {
    const slug = slugify(name);
    if (!slug || seen.has(slug)) return [];
    seen.add(slug);
    return [{
      make_slug: slugify(makeName),
      name,
      slug,
      year_ranges: productionRangesFor(makeName, name),
      source: "oldcarsdata",
      updated_at: now
    }];
  });
  await upsert("taxonomy_models", rows, "make_slug,slug");
  modelCount += rows.length;
  process.stdout.write(`\r  models upserted: ${modelCount}`);
});
console.log(`\nUpserted ${modelCount} taxonomy_models rows.`);

const aliasRows = [
  ...MAKE_ALIASES.map(item => ({
    alias: item.alias,
    alias_slug: slugify(item.alias),
    kind: item.kind === "misspelling" ? "misspelling" : "abbreviation",
    make: item.make,
    model: null,
    trim: null,
    confirm: item.kind === "misspelling",
    updated_at: now
  })),
  ...MODEL_ALIASES.map(item => ({
    alias: item.alias,
    alias_slug: slugify(item.alias),
    kind: item.kind === "misspelling" ? "misspelling" : "nickname",
    make: item.make,
    model: item.model,
    trim: item.trim || null,
    confirm: item.kind === "misspelling",
    updated_at: now
  }))
];
await upsert("taxonomy_aliases", aliasRows, "alias_slug,make");
console.log(`Upserted ${aliasRows.length} taxonomy_aliases rows.`);
console.log(`Done in ${Math.round((Date.now() - startedAt) / 1000)}s.`);
