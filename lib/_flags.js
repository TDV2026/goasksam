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
  if (!vinTestSession(cookieHeader)) return false;
  return appConfigFlag("vin_input_enabled", env);
}

// Exact-VIN archive match (VIN feature 4a/4b/4c). Most recent prior sale of THIS
// exact car + how many times it has traded, evidence only (never ranking). A direct
// `raw_record->>vin=eq.X` filter is UNINDEXED and seq-scans the whole table to a
// statement timeout, so narrow by the indexed make/model/year columns first, then
// match the exact VIN in JS. Free service-role read; null on any error/miss so the
// feature simply shows no callout (never an error).
export async function findVinArchiveMatch(env, { vin, make, model, year }) {
  if (!env?.supabaseUrl || !env?.supabaseKey || !vin || !make) return null;
  try {
    const parts = [`make=ilike.${encodeURIComponent(make)}`];
    const modelHead = String(model || "").split(/\s+/)[0];
    if (modelHead) parts.push(`raw_title=ilike.${encodeURIComponent("*" + modelHead + "*")}`);
    if (Number(year)) parts.push(`year=eq.${Number(year)}`);
    const q = `${env.supabaseUrl}/rest/v1/vehicle_market_records?${parts.join("&")}&select=source,auction_end_date,price,source_url,raw_record&order=auction_end_date.desc.nullslast&limit=500`;
    const r = await fetch(q, { headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}` } });
    if (!r.ok) return null;
    const rows = await r.json();
    const want = String(vin).toUpperCase();
    const hits = (Array.isArray(rows) ? rows : []).filter(x => String((x.raw_record || {}).vin || "").toUpperCase() === want);
    if (!hits.length) return null;
    const top = hits[0], rr = top.raw_record || {};
    return {
      count: hits.length, source: top.source || null, soldDate: top.auction_end_date || null,
      price: Number(top.price) || null, url: top.source_url || rr.source_url || rr.url || null,
      mileage: Number(rr.mileage) || null
    };
  } catch { return null; }
}
