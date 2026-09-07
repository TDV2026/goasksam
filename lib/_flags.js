// Feature flags via app_config rows (changeable without a deploy, same pattern as
// once_cap / rate_limits). Default OFF; ANY read failure resolves to OFF so a dark
// feature can never turn itself on by accident (fail-safe, not fail-open).
import { supabaseSelect } from "./_supabase.js";

export async function appConfigFlag(key, env) {
  try {
    if (!env?.supabaseUrl || !env?.supabaseKey) return false;
    const rows = await supabaseSelect(env, `app_config?key=eq.${encodeURIComponent(key)}&select=value&limit=1`);
    const v = rows && rows[0] && String(rows[0].value).trim().toLowerCase();
    return v === "1" || v === "true" || v === "on";
  } catch { return false; }
}

// The device is a test session for the (still-dark) VIN feature: the crew cookie
// (Sam's own device) or a dedicated gas_vin=on cookie. Keeps the feature invisible
// to real sellers even after the master flag is switched on in production.
export function vinTestSession(cookieHeader) {
  const c = String(cookieHeader || "");
  return c.indexOf("gas_crew=ok") !== -1 || c.indexOf("gas_vin=on") !== -1;
}

// VIN input path is active for THIS request only when BOTH hold: the master
// app_config flag `vin_input_enabled` is on AND the device is a crew/test session.
// Off for every real seller until Sam relaxes the session gate at launch.
export async function vinFeatureActive(cookieHeader, env) {
  // PUBLIC LAUNCH (Sep 2026): the app_config flag alone now governs the VIN path for
  // ALL users. The crew/test session gate (vinTestSession, kept above for reference)
  // was the pre-launch scoping and is no longer required. Rollback stays instant and
  // deploy-free: set app_config vin_input_enabled = 0 and the whole path goes dark.
  return appConfigFlag("vin_input_enabled", env);
}

// Exact-VIN archive match (VIN feature 4a/4b/4c). Most recent prior sale of THIS
// exact car + how many times it has traded, evidence only (never ranking).
//
// Queries sales_archive, NOT vehicle_market_records. sales_archive is the
// comprehensive nightly-ingested sales record and carries a DEDICATED, indexable
// `vin` column (ingest.js), so `vin=eq.X` is a fast exact-column match. vmr was the
// wrong store: it is only populated by searches/warm (so a freshly-sold car isn't in
// it until someone searches that model - and the in-flow callout fires at confirm,
// BEFORE the seller's own search runs), and its only VIN lived under the unindexed
// JSON path raw_record->>vin (which seq-scans to a statement timeout). Free
// service-role read; null on any error/miss so the feature just shows no callout.
export async function findVinArchiveMatch(env, { vin } = {}) {
  if (!env?.supabaseUrl || !env?.supabaseKey || !vin) return null;
  // Separator- and case-insensitive on BOTH sides: the same tolerance the 17-char VIN
  // detector applies to pasted VINs. Sources store older-car chassis inconsistently -
  // BaT displays and stores "1E 31588" WITH a space - so "1E31588", "1E 31588" and
  // "1e-31588" must all match a stored "1E 31588".
  const norm = s => String(s == null ? "" : s).toUpperCase().replace(/[\s.\-\/]/g, "");
  try {
    const want = norm(vin);
    if (!want) return null;
    const headers = { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}` };
    const select = "vin,make,model,year,platform,sale_date,sale_price,mileage,raw_record";
    // 1) Fast exact match: covers 17-char VINs and any chassis stored WITHOUT separators
    //    (indexed vin column).
    let rows = [];
    {
      const r = await fetch(`${env.supabaseUrl}/rest/v1/sales_archive?vin=eq.${encodeURIComponent(want)}&select=${select}&order=sale_date.desc.nullslast&limit=25`, { headers });
      if (r.ok) { const j = await r.json(); if (Array.isArray(j)) rows = j; }
    }
    // 2) Separator-tolerant fallback: eq can't strip separators from the STORED value, so
    //    fetch candidates with an interspersed ILIKE (each char of the normalized token,
    //    any separators allowed between) and confirm by normalized equality in JS. Skipped
    //    for 17-char VINs (always stored clean) and never runs when (1) already hit.
    if (!rows.length && want.length !== 17) {
      const pattern = want.split("").map(c => c.replace(/[%_]/g, "")).join("%");
      const r = await fetch(`${env.supabaseUrl}/rest/v1/sales_archive?vin=ilike.${encodeURIComponent(pattern)}&select=${select}&limit=300`, { headers });
      if (r.ok) {
        const j = await r.json();
        rows = (Array.isArray(j) ? j : []).filter(x => norm(x.vin) === want)
          .sort((a, b) => String(b.sale_date || "").localeCompare(String(a.sale_date || "")));
      }
    }
    if (!Array.isArray(rows) || !rows.length) return null;
    const top = rows[0], rr = top.raw_record || {};
    return {
      count: rows.length,
      // Identity of the matched car, straight from the matched record (evidence, not a
      // chassis decode). Lets the caller proceed into the wizard with the known car instead
      // of re-asking year/make/model on an exact chassis match.
      year: Number(top.year) || null,
      make: top.make && top.make !== "Unknown" ? String(top.make) : null,
      model: top.model && top.model !== "Unknown" ? String(top.model) : null,
      // platformDisplayName is idempotent, so the display label from sales_archive
      // ("Bring a Trailer") or a raw slug both render correctly.
      source: rr.source || top.platform || null,
      soldDate: top.sale_date || null,
      price: Number(top.sale_price) || Number(rr.price) || null,
      url: rr.source_url || rr.url || null,
      mileage: Number(top.mileage) || Number(rr.mileage) || null,
      // Supporting photo for the exact-match moment (presentation only, never ranking).
      // Same archive field the One Box comp cards render from (raw_record.featured_image_url);
      // null when the record has no photo, and the frontend falls back to the spec plate.
      photoUrl: rr.featured_image_url || rr.photo_url || rr.image || null
    };
  } catch { return null; }
}
