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
  try {
    const want = String(vin).toUpperCase();
    const q = `${env.supabaseUrl}/rest/v1/sales_archive?vin=eq.${encodeURIComponent(want)}&select=platform,sale_date,sale_price,mileage,raw_record&order=sale_date.desc.nullslast&limit=25`;
    const r = await fetch(q, { headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}` } });
    if (!r.ok) return null;
    const rows = await r.json();
    if (!Array.isArray(rows) || !rows.length) return null;
    const top = rows[0], rr = top.raw_record || {};
    return {
      count: rows.length,
      // platformDisplayName is idempotent, so the display label from sales_archive
      // ("Bring a Trailer") or a raw slug both render correctly.
      source: rr.source || top.platform || null,
      soldDate: top.sale_date || null,
      price: Number(top.sale_price) || Number(rr.price) || null,
      url: rr.source_url || rr.url || null,
      mileage: Number(top.mileage) || Number(rr.mileage) || null
    };
  } catch { return null; }
}
