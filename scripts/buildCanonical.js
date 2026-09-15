// Build canonical_sales + sale_aliases from the full sales_archive (amendments 9.4/9.8).
// One canonical row per real-world transaction; every source row is an alias. Reads are
// free (Supabase), zero OCD spend. Heavy writes -> run in GitHub Actions, not locally.
//
//   node scripts/buildCanonical.js            build + write
//   node scripts/buildCanonical.js --dry      build + report only, NO writes
//
// Match rules live in lib/_canonical.js (price+date VIN rule, false-merge guards, validVin
// identifier filter). Blocking here keeps it near-linear: a row only compares against
// canonicals that share a VIN, a URL, or a same-source date+price bucket.
import { supabaseEnv, supabaseSelect, supabaseInsert } from "../lib/_supabase.js";
import { sameTransaction, validVin, normChassis } from "../lib/_canonical.js";
import { hammerUsd } from "../lib/_houseComps.js";

const CURRENCY_COUNTRY = { USD: "US", GBP: "UK", EUR: "EU", CHF: "EU", AUD: "AU", CAD: "CA" };
const urlOf = r => { const u = r.srcurl || r.srcurl2 || r.url; return u ? String(u).split(/[?#]/)[0].toLowerCase().replace(/\/+$/, "") : ""; };
const priceBucket = v => (Number(v) > 0 ? Math.round(Number(v) / 500) : "x");
const srcDateKey = r => (r.sale_date ? `${r.source_slug}|${String(r.sale_date).slice(0, 10)}|${priceBucket(r.value)}` : "");

function geography(r) {
  const cur = String(r.curr || "USD").toUpperCase();
  const country = CURRENCY_COUNTRY[cur] || null;
  const loc = [r.city, r.state, r.country_code].filter(Boolean).join(", ") || null;
  return { sale_country: country, vehicle_location: loc, venue: null, native_currency: cur, default_classified: !country };
}
function richness(r) { return ["vin", "mileage", "listing_title", "sale_price", "make", "model", "year"].reduce((n, k) => n + (r[k] != null && r[k] !== "" ? 1 : 0), 0); }

// ---- 1) Load the whole archive (keyset on the source_id PK) into canonical-input shape ----
async function loadAll(env) {
  const cols = "source_id,source_slug,platform,vin,make,model,year,sale_price,sale_date,listing_title," +
    "curr:raw_record->>currency,city:raw_record->>city,state:raw_record->>state,country_code:raw_record->>country_code," +
    "url:raw_record->>url,srcurl:raw_record->>source_url,lot:raw_record->>lot_number";
  const out = []; let cursor = "";
  for (let p = 0; p < 500; p++) {
    const q = `sales_archive?select=${cols}&order=source_id.asc&limit=1000` + (cursor ? `&source_id=gt.${encodeURIComponent(cursor)}` : "");
    const batch = await supabaseSelect(env, q);
    if (!batch || !batch.length) break;
    for (const r of batch) {
      out.push({
        source_record_id: r.source_id, source_slug: r.source_slug, source: r.platform,
        vin: r.vin, make: r.make, model: r.model, year: r.year, sale_date: r.sale_date, title: r.listing_title,
        listing_title: r.listing_title, sale_price: r.sale_price, mileage: null,
        value: hammerUsd({ source_slug: r.source_slug, source: r.platform, price: Number(r.sale_price), currency: r.curr || "USD" }),
        curr: r.curr, city: r.city, state: r.state, country_code: r.country_code, url: r.url, srcurl: r.srcurl, lot: r.lot
      });
    }
    cursor = batch[batch.length - 1].source_id;
    process.stderr.write(`\rloaded ${out.length}   `);
    if (batch.length < 1000) break;
  }
  process.stderr.write("\n");
  return out;
}

// ---- 2) Blocked incremental canonicalize ----
function build(rows) {
  const canon = [];                 // { rows:[], vin, primaryIdx }
  const byVin = new Map(), byUrl = new Map(), bySDP = new Map();
  const push = (map, k, idx) => { if (!k) return; const a = map.get(k) || []; a.push(idx); map.set(k, a); };
  const excludedBySource = {}, aliasByReason = {}, aliasBySource = {};
  let ambiguousPairs = 0; const ambiguousSample = [];
  for (const row of rows) {
    const vk = validVin(row.vin) ? normChassis(row.vin) : "";
    if (!vk && row.vin != null && String(row.vin).trim() !== "") excludedBySource[row.source_slug] = (excludedBySource[row.source_slug] || 0) + 1;
    const cand = new Set();
    if (vk) (byVin.get(vk) || []).forEach(i => cand.add(i));
    const uk = urlOf(row); if (uk) (byUrl.get(uk) || []).forEach(i => cand.add(i));
    const sk = srcDateKey(row); if (sk) (bySDP.get(sk) || []).forEach(i => cand.add(i));
    let joined = -1, reason = "primary";
    for (const idx of cand) {
      for (const m of canon[idx].rows) {
        const res = sameTransaction(row, m);
        if (res.merge) { joined = idx; reason = res.reason; break; }
        if (res.ambiguous) { ambiguousPairs++; if (ambiguousSample.length < 8) ambiguousSample.push({ vin: vk, a: `${m.source_slug} ${Math.round(m.value || 0)} ${m.sale_date}`, b: `${row.source_slug} ${Math.round(row.value || 0)} ${row.sale_date}` }); }
      }
      if (joined >= 0) break;
    }
    let idx;
    if (joined >= 0) { canon[joined].rows.push(row); idx = joined; }
    else { idx = canon.length; canon.push({ rows: [row], vin: vk }); }
    push(byVin, vk, idx); push(byUrl, uk, idx); push(bySDP, sk, idx);
    aliasByReason[reason] = (aliasByReason[reason] || 0) + 1;
    aliasBySource[row.source_slug] = (aliasBySource[row.source_slug] || 0) + 1;
  }
  return { canon, excludedBySource, aliasByReason, aliasBySource, ambiguousPairs, ambiguousSample };
}

// ---- 3) Shape canonical_sales rows (richest alias is primary) ----
function shapeCanonical(c) {
  const primary = c.rows.slice().sort((a, b) => richness(b) - richness(a))[0];
  const g = geography(primary);
  const vinNorm = c.vin || (validVin(primary.vin) ? normChassis(primary.vin) : null);
  return {
    id: `${primary.source_slug}:${primary.source_record_id}`,
    chassis_vin_norm: vinNorm || null,
    make: primary.make || null, model: primary.model || null, year: Number(primary.year) || null,
    hammer_usd: Number.isFinite(primary.value) ? Math.round(primary.value) : null,
    native_price: Number(primary.sale_price) || null, native_currency: g.native_currency,
    sale_country: g.sale_country, vehicle_location: g.vehicle_location, venue: g.venue,
    event: null, sale_date: primary.sale_date || null, lot_number: primary.lot || null,
    primary_source: primary.source_slug, alias_count: c.rows.length, default_classified: g.default_classified
  };
}

async function writeAll(env, canon, write) {
  // adaptive chunking (same defense as the ingest upsert): halve on statement timeout.
  async function upsert(table, rows, conflict) {
    let i = 0, chunk = 200; const MIN = 25;
    while (i < rows.length) {
      const slice = rows.slice(i, i + chunk);
      const r = await supabaseInsert(table, slice, env.supabaseUrl, env.supabaseKey, "resolution=merge-duplicates,return=minimal", `?on_conflict=${conflict}`);
      if (r.error) { if (chunk > MIN) { chunk = Math.max(MIN, Math.floor(chunk / 2)); continue; } return { error: r.error, wrote: i }; }
      i += slice.length; process.stderr.write(`\r  ${table}: ${i}/${rows.length}   `);
    }
    process.stderr.write("\n"); return { ok: true, wrote: i };
  }
  const canonRows = canon.map(shapeCanonical);
  const geoBySource = {};
  for (const cr of canonRows) { const s = cr.primary_source; const o = geoBySource[s] || (geoBySource[s] = { derived: 0, default: 0 }); cr.default_classified ? o.default++ : o.derived++; }
  const aliasRows = [];
  for (const c of canon) { const cid = `${c.rows.slice().sort((a, b) => richness(b) - richness(a))[0].source_slug}:${c.rows.slice().sort((a, b) => richness(b) - richness(a))[0].source_record_id}`;
    for (const row of c.rows) { const res = c.rows.length === 1 ? { reason: "primary" } : sameTransaction(row, c.rows[0]); aliasRows.push({ source_slug: row.source_slug, source_record_id: row.source_record_id, canonical_id: cid, match_reason: row === c.rows[0] ? "primary" : (res.reason || "grouped") }); } }
  if (!write) return { geoBySource, canonRows: canonRows.length, aliasRows: aliasRows.length, wrote: false };
  const c1 = await upsert("canonical_sales", canonRows, "id");
  const c2 = c1.ok ? await upsert("sale_aliases", aliasRows, "source_slug,source_record_id") : { error: "skipped (canonical_sales failed)" };
  return { geoBySource, canonRows: canonRows.length, aliasRows: aliasRows.length, canonWrite: c1, aliasWrite: c2 };
}

// ---- INCREMENTAL: process only rows not yet in sale_aliases, matched against the EXISTING
// canonical_sales (seeded into the same blocking matcher) + each other. New rows either
// create a new canonical, merge as an alias into an existing/new canonical, or land as a
// flagged ambiguous separate sale. Self-correcting: any unprocessed row is caught whenever
// added, so a missed nightly delta never sits unprocessed. Reads free; writes adaptive.
async function loadAliasKeys(env) {
  const keys = new Set(); let cursor = "";
  for (let p = 0; p < 600; p++) {
    const q = `sale_aliases?select=source_slug,source_record_id&order=source_record_id.asc&limit=1000` + (cursor ? `&source_record_id=gt.${encodeURIComponent(cursor)}` : "");
    const batch = await supabaseSelect(env, q);
    if (!batch || !batch.length) break;
    for (const r of batch) keys.add(`${r.source_slug}|${r.source_record_id}`);
    cursor = batch[batch.length - 1].source_record_id;
    if (batch.length < 1000) break;
  }
  return keys;
}
async function loadCanonAnchors(env) {
  // Reconstruct each existing canonical as a matcher "row" from its stored fields.
  const out = []; let cursor = "";
  for (let p = 0; p < 600; p++) {
    const q = `canonical_sales?select=id,chassis_vin_norm,make,model,year,hammer_usd,sale_date,lot_number,primary_source,alias_count&order=id.asc&limit=1000` + (cursor ? `&id=gt.${encodeURIComponent(cursor)}` : "");
    const batch = await supabaseSelect(env, q);
    if (!batch || !batch.length) break;
    for (const r of batch) out.push({
      __canonId: r.id, __aliasCount: r.alias_count || 1, source_slug: r.primary_source, source: r.primary_source,
      source_record_id: String(r.id).split(":").slice(1).join(":"), vin: r.chassis_vin_norm, chassis_vin_norm: r.chassis_vin_norm,
      make: r.make, model: r.model, year: r.year, value: r.hammer_usd, sale_date: r.sale_date, lot: r.lot_number, title: null
    });
    cursor = batch[batch.length - 1].id;
    if (batch.length < 1000) break;
  }
  return out;
}
export async function runIncremental(env) {
  const aliasKeys = await loadAliasKeys(env);
  const anchors = await loadCanonAnchors(env);
  const allRows = await loadAll(env);
  const fresh = allRows.filter(r => !aliasKeys.has(`${r.source_slug}|${r.source_record_id}`));
  // Seed the blocking matcher with existing canonicals, then process only fresh rows.
  const canon = anchors.map(a => ({ rows: [a], vin: (validVin(a.vin) ? normChassis(a.vin) : ""), existing: true, canonId: a.__canonId }));
  const byVin = new Map(), byUrl = new Map(), bySDP = new Map();
  const push = (m, k, i) => { if (!k) return; const a = m.get(k) || []; a.push(i); m.set(k, a); };
  canon.forEach((c, i) => { push(byVin, c.vin, i); const a = c.rows[0]; push(bySDP, a.sale_date ? `${a.source_slug}|${String(a.sale_date).slice(0, 10)}|${priceBucket(a.value)}` : "", i); });
  let newCanon = 0, mergedAlias = 0, ambiguous = 0; const ambiguousSample = [];
  const newCanonRows = [], newAliasRows = [], bumped = new Map();
  for (const row of fresh) {
    const vk = validVin(row.vin) ? normChassis(row.vin) : "";
    const cand = new Set();
    if (vk) (byVin.get(vk) || []).forEach(i => cand.add(i));
    const uk = urlOf(row); if (uk) (byUrl.get(uk) || []).forEach(i => cand.add(i));
    const sk = row.sale_date ? `${row.source_slug}|${String(row.sale_date).slice(0, 10)}|${priceBucket(row.value)}` : ""; if (sk) (bySDP.get(sk) || []).forEach(i => cand.add(i));
    let joined = -1, reason = "primary";
    for (const idx of cand) {
      for (const m of canon[idx].rows) { const res = sameTransaction(row, m); if (res.merge) { joined = idx; reason = res.reason; break; } if (res.ambiguous) { ambiguous++; if (ambiguousSample.length < 8) ambiguousSample.push({ vin: vk, existing: `${m.source_slug} ${Math.round(m.value || 0)} ${m.sale_date}`, new: `${row.source_slug} ${Math.round(row.value || 0)} ${row.sale_date}` }); } }
      if (joined >= 0) break;
    }
    let idx;
    if (joined >= 0) {
      canon[joined].rows.push(row); idx = joined; mergedAlias++;
      const cid = canon[joined].canonId || `${canon[joined].rows[0].source_slug}:${canon[joined].rows[0].source_record_id}`;
      newAliasRows.push({ source_slug: row.source_slug, source_record_id: row.source_record_id, canonical_id: cid, match_reason: reason });
      if (canon[joined].existing) bumped.set(cid, (bumped.get(cid) || canon[joined].rows[0].__aliasCount || 1) + 1);
    } else {
      idx = canon.length; const cid = `${row.source_slug}:${row.source_record_id}`;
      canon.push({ rows: [row], vin: vk, existing: false, canonId: cid }); newCanon++;
      newCanonRows.push(shapeCanonical(canon[idx]));
      newAliasRows.push({ source_slug: row.source_slug, source_record_id: row.source_record_id, canonical_id: cid, match_reason: "primary" });
    }
    push(byVin, vk, idx); push(byUrl, uk, idx); push(bySDP, sk, idx);
  }
  // writes: new canonicals, new aliases, and alias_count bumps on merged-into existing canonicals.
  const bumpRows = [...bumped.entries()].map(([id, alias_count]) => ({ id, alias_count }));
  let w = { canon: null, alias: null, bumps: null };
  async function upsert(table, rows, conflict) { if (!rows.length) return { ok: true, wrote: 0 }; let i = 0, chunk = 200; const MIN = 25; while (i < rows.length) { const slice = rows.slice(i, i + chunk); const r = await supabaseInsert(table, slice, env.supabaseUrl, env.supabaseKey, "resolution=merge-duplicates,return=minimal", `?on_conflict=${conflict}`); if (r.error) { if (chunk > MIN) { chunk = Math.max(MIN, Math.floor(chunk / 2)); continue; } return { error: r.error, wrote: i }; } i += slice.length; } return { ok: true, wrote: i }; }
  w.canon = await upsert("canonical_sales", newCanonRows, "id");
  w.alias = w.canon.ok ? await upsert("sale_aliases", newAliasRows, "source_slug,source_record_id") : { error: "skipped" };
  w.bumps = (w.alias.ok && bumpRows.length) ? await upsert("canonical_sales", bumpRows, "id") : { ok: true, wrote: 0 };
  return { mode: "incremental", existingCanonicals: anchors.length, archiveRows: allRows.length, freshRows: fresh.length,
    newCanonical: newCanon, mergedAsAlias: mergedAlias, ambiguousFlagged: ambiguous, ambiguousSample, writes: w };
}

// ---- reusable entry: load + build + (optionally) write; returns a report object ----
export async function runBuild(env, { write } = { write: false }) {
  const rows = await loadAll(env);
  const b = build(rows);
  const w = await writeAll(env, b.canon, write);
  return {
    write, sourceRows: rows.length, canonicalSales: b.canon.length,
    dedupeRatePct: rows.length ? Math.round((1 - b.canon.length / rows.length) * 1000) / 10 : 0,
    foldedRows: rows.length - b.canon.length,
    aliasByReason: b.aliasByReason, aliasBySource: b.aliasBySource,
    ambiguousPairs: b.ambiguousPairs, ambiguousSample: b.ambiguousSample,
    placeholderExcludedBySource: b.excludedBySource, geographyBySource: w.geoBySource,
    canonWrite: w.canonWrite || null, aliasWrite: w.aliasWrite || null
  };
}

// ---- CLI (Actions) ----
//   node scripts/buildCanonical.js               full build (writes)
//   node scripts/buildCanonical.js --dry         full build, report only
//   node scripts/buildCanonical.js --incremental nightly: only rows not yet aliased
if (process.argv[1] && process.argv[1].endsWith("buildCanonical.js")) {
  const env = supabaseEnv();
  if (!env) { console.error("Need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY."); process.exit(1); }
  const incremental = process.argv.includes("--incremental");
  const rep = incremental ? await runIncremental(env) : await runBuild(env, { write: !process.argv.includes("--dry") });
  console.log(`\n=== canonical ${incremental ? "INCREMENTAL" : "full"} build ===`);
  for (const [k, v] of Object.entries(rep)) console.log(`  ${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`);
  const w = rep.writes || rep;
  const failed = w.canon?.error || w.alias?.error || w.bumps?.error || rep.canonWrite?.error || rep.aliasWrite?.error;
  if (failed) { console.error(`::error::canonical ${incremental ? "incremental" : ""} build write FAILED: ${failed}`); process.exit(1); }
  console.log("\nDONE.");
}
