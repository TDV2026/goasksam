// Resolver replay against our own raw_title corpus (Addendum B). Runs the
// deterministic resolver over every stored real-world listing title, free
// and unmetered, and reports the resolution rate plus the top failure
// shapes. Rerun monthly: the rate should only ever go up.
//
// Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/replayResolver.js

import { resolveVehicle } from "../lib/vehicle.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error("Missing Supabase env."); process.exit(1); }

const rows = [];
for (let offset = 0; offset < 6000; offset += 1000) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/vehicle_market_records?select=raw_title&limit=1000&offset=${offset}&order=ingested_at.desc`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
  });
  const page = await res.json();
  rows.push(...page.map(r => r.raw_title).filter(Boolean));
  if (page.length < 1000) break;
}
const titles = [...new Set(rows)];
console.log(`Replaying ${titles.length} distinct raw titles through the deterministic resolver...`);

let resolved = 0, confirm = 0, failed = 0;
const failures = new Map();
const CONCURRENCY = 20;
for (let i = 0; i < titles.length; i += CONCURRENCY) {
  await Promise.all(titles.slice(i, i + CONCURRENCY).map(async title => {
    try {
      const r = await resolveVehicle(title);
      if (r.status === "valid") resolved++;
      else if (r.status === "needs_confirmation") confirm++;
      else {
        failed++;
        const shape = r.vehicle?.make
          ? (r.vehicle?.model ? `has make+model, ${((r.clarification?.missing || []).join("+")) || "other"} missing` : `make only (${r.vehicle.make})`)
          : "nothing understood";
        if (!failures.has(shape)) failures.set(shape, []);
        if (failures.get(shape).length < 8) failures.get(shape).push(title.slice(0, 90));
        failures.set(shape, failures.get(shape));
      }
    } catch (err) {
      failed++;
      if (!failures.has("resolver threw")) failures.set("resolver threw", []);
      if (failures.get("resolver threw").length < 8) failures.get("resolver threw").push(`${title.slice(0, 70)} -> ${err.message.slice(0, 40)}`);
    }
  }));
}

const total = resolved + confirm + failed;
console.log(`\nResolution rate: ${(100 * (resolved + confirm) / total).toFixed(1)}% (${resolved} valid, ${confirm} confirm, ${failed} failed of ${total})`);
console.log("\nTop failure shapes:");
for (const [shape, examples] of [...failures.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n  ${shape}:`);
  for (const example of examples) console.log(`    - ${example}`);
}
