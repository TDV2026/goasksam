// Backfill sales_archive.model_family for every row (Stage C, step 1).
// =====================================================================
// Computes model_family via lib/desk/familyKey.js deskModelFamily (the record/ranking
// grouping key — an own-market performance badge like the M3 is its OWN family, never
// folded into the base) and writes it in bulk. Reads are free; writes are grouped by
// distinct family value and chunked, so ~200k rows patch in a few hundred requests.
//
// Heavy writes -> run in GitHub Actions (workflow_dispatch), never locally: Sam has no
// shell and the service-role key is not pullable. Needs SUPABASE_URL +
// SUPABASE_SERVICE_ROLE_KEY (from the workflow secrets).
//
//   node scripts/backfillModelFamily.js            backfill EVERY row (idempotent)
//   node scripts/backfillModelFamily.js --dry       report the distribution, NO writes
//   node scripts/backfillModelFamily.js --only-null  only rows where model_family is null (fast rerun)
//   node scripts/backfillModelFamily.js --limit 5000 cap rows scanned (a smoke run)
// =====================================================================
import { supabaseEnv, supabaseSelect, supabasePatch } from "../lib/_supabase.js";
import { deskModelFamily } from "../lib/desk/familyKey.js";

const argv = process.argv.slice(2);
const DRY = argv.includes("--dry");
const ONLY_NULL = argv.includes("--only-null");
const LIMIT = (() => { const i = argv.indexOf("--limit"); return i >= 0 ? Number(argv[i + 1]) : Infinity; })();
const CHUNK = 200;                       // source_ids per PATCH (URL length safe)

const env = supabaseEnv();
if (!env) { console.error("FATAL: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required."); process.exit(1); }

// ---- 1) keyset-load the minimal columns (source_id PK, make, model, listing_title) ----
async function loadRows() {
  const cols = "source_id,make,model,listing_title,platform";
  const rows = []; let cursor = "";
  for (let p = 0; p < 1000 && rows.length < LIMIT; p++) {
    let q = `sales_archive?select=${cols}&order=source_id.asc&limit=1000`;
    if (ONLY_NULL) q += `&model_family=is.null`;
    if (cursor) q += `&source_id=gt.${encodeURIComponent(cursor)}`;
    const batch = await supabaseSelect(env, q);
    if (!batch || !batch.length) break;
    for (const r of batch) rows.push(r);
    cursor = batch[batch.length - 1].source_id;
    process.stderr.write(`\rloaded ${rows.length}   `);
    if (batch.length < 1000) break;
  }
  process.stderr.write("\n");
  return rows.slice(0, LIMIT === Infinity ? rows.length : LIMIT);
}

function run() {
  return loadRows().then(async rows => {
    // 2) compute family; bucket source_ids by family value.
    const byFamily = new Map();          // family -> [source_id]
    const sampleTitle = new Map();       // family -> a sample listing_title
    const nullRows = [];                 // rows deskModelFamily left null (excluded from family reads)
    for (const r of rows) {
      const fam = deskModelFamily({ make: r.make, model: r.model, trim: "", title: r.listing_title });
      if (!fam) { nullRows.push(r); continue; }
      (byFamily.get(fam) || byFamily.set(fam, []).get(fam)).push(r.source_id);
      if (!sampleTitle.has(fam)) sampleTitle.set(fam, r.listing_title || "");
    }
    const families = [...byFamily.entries()].sort((a, b) => b[1].length - a[1].length);
    const under5 = families.filter(([, ids]) => ids.length < 5);
    console.log(`\nRows scanned: ${rows.length}. Distinct model_family values: ${families.length}. Null model_family (excluded from family reads): ${nullRows.length}.`);
    console.log(`Families with fewer than 5 rows: ${under5.length} (of ${families.length}).`);
    console.log("\nTop 25 families by row count:");
    for (const [fam, ids] of families.slice(0, 25)) console.log(`  ${String(ids.length).padStart(7)}  ${fam}`);
    // spot-check own-market badges are present and separate from their base
    console.log("\nProbes:");
    for (const probe of ["911", "996", "997", "991", "M3", "M5", "C63", "944 Turbo", "190E 2.3-16", "300SL", "190SL", "3 Series", "E-Class", "SL-Class", "Corvette", "Unknown"]) {
      const hit = byFamily.get(probe); console.log(`  ${probe} = ${hit ? hit.length + " rows" : "(none)"}`);
    }
    // 30 random families under 5, each with a sample title (the long-tail curation view).
    const shuffled = under5.slice(); for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
    console.log("\n30 random families under 5 rows (family | n | sample title):");
    for (const [fam, ids] of shuffled.slice(0, 30)) console.log(`  ${fam} | ${ids.length} | ${sampleTitle.get(fam)}`);
    // Null-family rows: top sources + sample titles (what these are, so we can decide).
    const nullBySrc = new Map(); for (const r of nullRows) nullBySrc.set(r.platform || "?", (nullBySrc.get(r.platform || "?") || 0) + 1);
    console.log(`\nNull-family rows by source (top 10):`);
    for (const [src, n] of [...nullBySrc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`  ${String(n).padStart(6)}  ${src}`);
    console.log("15 sample null-family titles (make | model | title):");
    for (const r of nullRows.slice(0, 15)) console.log(`  ${r.make} | ${JSON.stringify(r.model)} | ${r.listing_title || ""}`);

    if (DRY) { console.log("\n--dry: no writes."); return; }

    // 3) write: one PATCH per (family, chunk of source_ids).
    let written = 0, reqs = 0, failed = 0;
    for (const [fam, ids] of families) {
      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);
        const q = `sales_archive?source_id=in.(${chunk.map(encodeURIComponent).join(",")})`;
        const res = await supabasePatch(env, q, { model_family: fam });
        reqs++;
        if (res.error) { failed++; console.error(`  PATCH failed (${fam}, ${chunk.length} ids): ${res.error}`); }
        else written += chunk.length;
        if (reqs % 50 === 0) process.stderr.write(`\rwritten ${written}  (${reqs} requests)   `);
      }
    }
    process.stderr.write("\n");
    console.log(`\nBackfill complete. Rows populated: ${written}. Requests: ${reqs}. Failed requests: ${failed}.`);
    if (failed) process.exit(1);
  });
}

run().catch(e => { console.error("FATAL:", e && e.stack || e); process.exit(1); });
