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
// NOTE: this script makes ZERO OldCarsData calls. The null-row title resolution below is PURE
// local parsing (strip the year, match a make already present in the archive, take the rest as
// the model) fed back through deskModelFamily. We deliberately do NOT import lib/vehicle.js's
// resolveVehicle, which can call OCD /makes and /models. Supabase reads/writes are the only I/O.

const argv = process.argv.slice(2);
const DRY = argv.includes("--dry");
const ONLY_NULL = argv.includes("--only-null");
const NO_RESOLVE = argv.includes("--no-resolve");   // skip the title-resolver pass on null rows (fast dry)
const LIMIT = (() => { const i = argv.indexOf("--limit"); return i >= 0 ? Number(argv[i + 1]) : Infinity; })();
const CHUNK = 200;                       // source_ids per PATCH (URL length safe)
const HEALTHY_MIN = 5;                   // a family with >= this many rows is a "known" token for self-bootstrap
const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9.]/g, "");

const env = supabaseEnv();
if (!env) { console.error("FATAL: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required."); process.exit(1); }

// ---- 1) keyset-load the minimal columns (source_id PK, make, model, listing_title) ----
async function loadRows() {
  const cols = "source_id,make,model,listing_title,platform,model_family";
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

const JUNK_MAKE = new Set(["", "unknown", "n/a", "na", "none", "null", "other", "various", "misc", "-", "?"]);
// Known makes = the distinct makes ALREADY in the loaded archive rows (free, no OCD). Longest
// first so a multi-word make ("Land Rover", "Moto Guzzi", "Alfa Romeo") matches before a prefix.
function buildKnownMakes(rows) {
  const s = new Set();
  for (const r of rows) { const m = String(r.make || "").trim(); if (m.length >= 2 && !JUNK_MAKE.has(m.toLowerCase())) s.add(m); }
  return [...s].sort((a, b) => b.length - a.length);
}
// PURE LOCAL title parse (no OCD, no vPIC): strip a leading year, match a known make at the
// start, return { make, model=the rest }. A title with no known make (a motorcycle, a boat)
// returns null and the row stays null. Deterministic and free.
function localResolveFromTitle(title, knownMakesLC) {
  const t = String(title || "").replace(/^\s*(?:19|20)\d{2}\s+/, "").trim();
  const tl = t.toLowerCase();
  for (const { mk, lc } of knownMakesLC) {
    if (tl === lc) return null;                      // make only, no model
    if (tl.startsWith(lc + " ")) { const model = t.slice(mk.length).trim(); if (model) return { make: mk, model }; }
  }
  return null;
}

function run() {
  return loadRows().then(async rows => {
    // 1) family per row (mutable _fam), so a later pass can remap.
    const sampleTitle = new Map();
    for (const r of rows) { r._fam = deskModelFamily({ make: r.make, model: r.model, trim: "", title: r.listing_title }); }
    const countFam = () => { const m = new Map(); for (const r of rows) if (r._fam) m.set(r._fam, (m.get(r._fam) || 0) + 1); return m; };
    const rowsInUnder5 = (counts) => rows.reduce((n, r) => n + (r._fam && counts.get(r._fam) < 5 ? 1 : 0), 0);

    let counts = countFam();
    const before = { families: counts.size, under5Fams: [...counts.values()].filter(n => n < 5).length, rowsUnder5: rowsInUnder5(counts), nullRows: rows.filter(r => !r._fam).length };

    // 2) ITEM 2 — resolve null rows by PURE LOCAL title parsing (zero OCD, zero vPIC): BaT
    //    "Unknown" rows whose titles carry the car (Mazda Protege5, Fiat Barchetta). Strip the
    //    year, match a make already in the archive, take the rest as the model, recompute family.
    let nullResolved = 0;
    if (!NO_RESOLVE) {
      const knownMakesLC = buildKnownMakes(rows).map(mk => ({ mk, lc: mk.toLowerCase() }));
      for (const r of rows) {
        if (r._fam) continue;
        const hit = localResolveFromTitle(r.listing_title, knownMakesLC);
        if (hit) { const fam = deskModelFamily({ make: hit.make, model: hit.model, trim: "", title: r.listing_title }); if (fam) { r._fam = fam; nullResolved++; } }
      }
      counts = countFam();
    }

    // 3) ITEM 1 — self-bootstrap the long tail. Families with >= HEALTHY_MIN rows are "known"
    //    family tokens (make-scoped). A row in an under-5 family whose model STARTS WITH a known
    //    token of the same make is remapped to that family. Data-driven; catches Defender, 575M,
    //    MkII etc. without a curated list. Longest token first so a specific token wins.
    const famMake = new Map();            // family -> dominant make (norm)
    { const acc = new Map(); for (const r of rows) if (r._fam) { const k = r._fam; const mk = norm(r.make); const m = acc.get(k) || acc.set(k, new Map()).get(k); m.set(mk, (m.get(mk) || 0) + 1); } for (const [k, m] of acc) famMake.set(k, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]); }
    const tokens = [...counts.entries()].filter(([, n]) => n >= HEALTHY_MIN).map(([fam]) => ({ fam, tok: norm(fam), mk: famMake.get(fam) })).filter(t => t.tok.length >= 3).sort((a, b) => b.tok.length - a.tok.length);
    const tokByMake = new Map(); for (const t of tokens) (tokByMake.get(t.mk) || tokByMake.set(t.mk, []).get(t.mk)).push(t);
    let remapped = 0;
    for (const r of rows) {
      if (!r._fam || counts.get(r._fam) >= 5) continue;    // only under-5 rows
      const mn = norm(r.model); const mk = norm(r.make);
      const cand = (tokByMake.get(mk) || []).find(t => t.fam !== r._fam && (mn === t.tok || mn.startsWith(t.tok)));
      if (cand) { r._fam = cand.fam; remapped++; }
    }
    counts = countFam();
    const after = { families: counts.size, under5Fams: [...counts.values()].filter(n => n < 5).length, rowsUnder5: rowsInUnder5(counts), nullRows: rows.filter(r => !r._fam).length };

    // ---- report ----
    const families = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    for (const r of rows) if (r._fam && !sampleTitle.has(r._fam)) sampleTitle.set(r._fam, r.listing_title || "");
    console.log(`\nRows scanned: ${rows.length}.`);
    console.log(`  distinct families:   ${before.families} -> ${after.families}`);
    console.log(`  families under 5:    ${before.under5Fams} -> ${after.under5Fams}`);
    console.log(`  ROWS in under-5 fams:${String(before.rowsUnder5).padStart(7)} -> ${after.rowsUnder5}   (item 1)`);
    console.log(`  null-family rows:    ${before.nullRows} -> ${after.nullRows}   (item 2: ${nullResolved} resolved from title, ${remapped} tail rows remapped)`);
    console.log("\nTop 25 families by row count:");
    for (const [fam, n] of families.slice(0, 25)) console.log(`  ${String(n).padStart(7)}  ${fam}`);
    console.log("\nProbes:");
    for (const probe of ["911", "996", "997", "991", "M3", "M5", "C63", "944 Turbo", "190E 2.3-16", "300SL", "190SL", "XKE", "Defender", "3 Series", "E-Class", "SL-Class", "Corvette", "Unknown"]) {
      const n = counts.get(probe); console.log(`  ${probe} = ${n ? n + " rows" : "(none)"}`);
    }
    const under5 = families.filter(([, n]) => n < 5);
    const shuffled = under5.slice(); for (let k = shuffled.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [shuffled[k], shuffled[j]] = [shuffled[j], shuffled[k]]; }
    console.log("\n30 random families still under 5 rows (family | n | sample title):");
    for (const [fam, n] of shuffled.slice(0, 30)) console.log(`  ${fam} | ${n} | ${sampleTitle.get(fam)}`);
    const nullRowsNow = rows.filter(r => !r._fam);
    const nullBySrc = new Map(); for (const r of nullRowsNow) nullBySrc.set(r.platform || "?", (nullBySrc.get(r.platform || "?") || 0) + 1);
    console.log(`\nNull-family rows by source (top 10):`);
    for (const [src, n] of [...nullBySrc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`  ${String(n).padStart(6)}  ${src}`);
    console.log("15 sample remaining null-family titles (make | model | title):");
    for (const r of nullRowsNow.slice(0, 15)) console.log(`  ${r.make} | ${JSON.stringify(r.model)} | ${r.listing_title || ""}`);

    if (DRY) { console.log("\n--dry: no writes."); return; }

    // 4) write: one PATCH per (family, chunk of source_ids), from the final _fam.
    const byFamily = new Map(); for (const r of rows) if (r._fam) (byFamily.get(r._fam) || byFamily.set(r._fam, []).get(r._fam)).push(r.source_id);
    let written = 0, reqs = 0, failed = 0;
    for (const [fam, ids] of byFamily) {
      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);
        const res = await supabasePatch(env, `sales_archive?source_id=in.(${chunk.map(encodeURIComponent).join(",")})`, { model_family: fam });
        reqs++;
        if (res.error) { failed++; console.error(`  PATCH failed (${fam}, ${chunk.length} ids): ${res.error}`); }
        else written += chunk.length;
        if (reqs % 50 === 0) process.stderr.write(`\rwritten ${written}  (${reqs} requests)   `);
      }
    }
    process.stderr.write("\n");
    // Clear stale families: rows that NOW compute null (automobilia, junk) but carry a non-null
    // model_family from an earlier run must be reset to null, or the correction never lands.
    const toNull = rows.filter(r => !r._fam && r.model_family != null).map(r => r.source_id);
    let cleared = 0;
    for (let i = 0; i < toNull.length; i += CHUNK) {
      const chunk = toNull.slice(i, i + CHUNK);
      const res = await supabasePatch(env, `sales_archive?source_id=in.(${chunk.map(encodeURIComponent).join(",")})`, { model_family: null });
      reqs++; if (res.error) { failed++; console.error(`  null-clear failed: ${res.error}`); } else cleared += chunk.length;
    }
    console.log(`\nBackfill complete. Rows populated: ${written}. Stale families cleared to null: ${cleared}. Requests: ${reqs}. Failed requests: ${failed}.`);
    if (failed) process.exit(1);
  });
}

run().catch(e => { console.error("FATAL:", e && e.stack || e); process.exit(1); });
