#!/usr/bin/env node
// Builds the spec_pages table (Porsche 911 spec/hub pages) - the nightly step that bakes in whatever
// the engine currently decides (the race-car fence, gearbox facts, trim fences, ...), so the live pages
// (rule 11, under 1 second) never compute a specPage() on request and the JSON snapshot never needs a
// second manual run. Runs in the nightly GitHub Action right after "Refresh spec market cache". Archive
// only, ZERO OldCarsData. Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { specPage, allSpecSlugs911 } from "../lib/specPages.js";

const env = { supabaseUrl: process.env.SUPABASE_URL, supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY };
if (!env.supabaseUrl || !env.supabaseKey) { console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required"); process.exit(1); }

const t0 = Date.now();
const slugs = allSpecSlugs911();
console.log(`spec slugs: ${slugs.length}`);

let ok = 0, failed = 0, indexable = 0;
const CONCURRENCY = 6;
let next = 0;
async function upsert(slug) {
  const page = await specPage(slug, env);
  if (!page) return;
  const row = { slug: page.slug, level: page.level, indexable: !!page.indexable, count: page.count || 0, data: page, computed_at: new Date().toISOString() };
  const r = await fetch(`${env.supabaseUrl}/rest/v1/spec_pages`, {
    method: "POST",
    headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(row)
  });
  if (r.ok) { ok++; if (page.indexable) indexable++; } else { failed++; console.error(`FAILED ${slug}: ${r.status} ${(await r.text()).slice(0, 160)}`); }
}
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (next < slugs.length) { const i = next++; try { await upsert(slugs[i]); } catch (e) { failed++; console.error(`ERROR ${slugs[i]}: ${e.message}`); } }
}));

const secs = Math.round((Date.now() - t0) / 1000);
console.log(`spec_pages: wrote ${ok}/${slugs.length} (indexable ${indexable}), failed ${failed}, ${secs}s`);
if (failed > slugs.length * 0.05) { console.error(`::error::spec_pages build had ${failed} failures (>5%)`); process.exit(1); }
