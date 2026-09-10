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

// --- matched-car config helpers (shared by findVinArchiveMatch) ---
// A modification is MATERIAL when it changes the car mechanically in a way the market prices
// differently from a numbers-matching example: engine internals, fueling, forced induction,
// engine/trans/drivetrain swaps. Cosmetic/bolt-on work (paint, wheels, interior, a bolt-on
// exhaust) is NOT material: the car still trades as the model it is. This is what separates a
// hot-rodded driver from a stock car for the comp read, so isModified keys off it, not off
// "any mod present" (a repainted car with an aftermarket exhaust is not "modified" here).
const MATERIAL_MOD_RE = /\b(engine|motor|fuel injection|efi|carburet|throttle body|pistons?|camshafts?|\bcam\b|valvetrain|supercharg|turbo|forced induction|nitrous|stroker|bored|stroked|rebuilt engine|built motor|engine (?:swap|rebuild|build)|ls swap|crate (?:engine|motor)|displacement|compression ratio|headers?|transmission swap|gearbox swap|manual (?:swap|conversion)|differential swap|rear end swap|roll cage)\b/i;
function isMaterialMod(s) { return MATERIAL_MOD_RE.test(String(s || "")); }
// Shorten a verbose mod string to a tag for the surfaced line ("Carburetor replaced with
// Holley electronic fuel injection system" -> "Holley EFI"). Generic: map a known component
// phrase to a short form and prepend a brand (first proper-noun token) when present.
function shortMod(s) {
  s = String(s || "").trim();
  const low = s.toLowerCase();
  let comp = null;
  if (/electronic fuel injection|\befi\b|fuel injection/.test(low)) comp = "EFI";
  else if (/supercharg/.test(low)) comp = "supercharger";
  else if (/turbo/.test(low)) comp = "turbo";
  else if (/forged piston/.test(low)) comp = "forged pistons";
  else if (/stroker/.test(low)) comp = "stroker build";
  else if (/camshaft|\bcam\b/.test(low)) comp = "cam";
  else if (/header/.test(low)) comp = "headers";
  else if (/(?:engine|motor|ls) swap|crate (?:engine|motor)/.test(low)) comp = "engine swap";
  else if (/coilover|suspension|lowered/.test(low)) comp = "suspension";
  else if (/roll cage|\bcage\b/.test(low)) comp = "roll cage";
  else if (/nitrous/.test(low)) comp = "nitrous";
  else if (/exhaust|cat[- ]?delete|x[- ]?pipe/.test(low)) comp = "exhaust";
  const SKIP = new Set(["The", "A", "An", "Repainted", "Carburetor", "Aftermarket", "Replaced", "With", "Forged", "Added", "Installed", "Fitted", "Upgraded", "New", "Custom", "Electronic"]);
  let brand = null;
  for (const w of (s.match(/\b[A-Z][a-zA-Z]+\b/g) || [])) { if (!SKIP.has(w)) { brand = w; break; } }
  if (comp && brand && comp.toLowerCase().indexOf(brand.toLowerCase()) < 0) return `${brand} ${comp}`;
  if (comp) return comp;
  return s.replace(/^(?:replaced|added|installed|fitted|upgraded)\s+/i, "").replace(/\s+/g, " ").slice(0, 40).trim();
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
    const select = "vin,make,model,year,platform,sale_date,sale_price,mileage,listing_title,raw_record";
    // SINGLE indexed lookup on the normalized, generated vin_norm column (docs/supabase-vin-
    // index.sql). It already equals norm(vin), so this one equality covers BOTH 17-char VINs
    // and separator-stored chassis ("1E 31588") - replacing the old vin=eq + interspersed-
    // ILIKE fallback that FULL-SCANNED the ~200k archive and timed out (returning a false "no
    // match"). Never swallow a failed lookup: log it LOUD so a regression surfaces.
    let rows = [];
    const r = await fetch(`${env.supabaseUrl}/rest/v1/sales_archive?vin_norm=eq.${encodeURIComponent(want)}&select=${select}&order=sale_date.desc.nullslast&limit=50`, { headers });
    if (r.ok) { const j = await r.json(); if (Array.isArray(j)) rows = j; }
    else { console.error(`CRITICAL: findVinArchiveMatch vin_norm lookup failed (${r.status}) for a ${want.length}-char id - index missing or statement timeout. ${(await r.text().catch(() => "")).slice(0, 160)}`); return null; }
    if (!rows.length) return null;
    // DEDUP by sale identity (platform|date|price): sales_archive has known re-insert
    // duplicates (the same sale under a fresh source_id), which would inflate the "traded N
    // times" count and could double-render. Collapse identical sale records; count DISTINCT
    // sales, newest first, and pick the most recent distinct sale as the callout's subject.
    const seen = new Set();
    const distinct = [];
    for (const x of rows) {
      // Key on sale DATE + rounded PRICE only (not platform): a re-inserted duplicate of the
      // same sale can carry a different platform string ("Cars & Bids" vs "carsandbids"), and
      // one car cannot genuinely sell twice for the same price on the same day, so date+price
      // is the true sale identity for a single VIN.
      const key = [String(x.sale_date || "").slice(0, 10), Math.round(Number(x.sale_price) || 0)].join("|");
      if (seen.has(key)) continue;
      seen.add(key); distinct.push(x);
    }
    const top = distinct[0], rr = top.raw_record || {};
    // Trim from the matched listing (evidence): strip year/make/model (accent- and case-
    // insensitive) and body words from the title, leaving the variant ("LP670-4 SuperVeloce").
    // The caller pre-fills it on a hit and STATES the source, never asserts it silently.
    const deaccent = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
    const reEsc = s => deaccent(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    let trim = null;
    const title = top.listing_title || rr.title || "";
    if (title) {
      let t = deaccent(title);
      t = t.replace(/^\s*[\d,.]+\s*k?\s*-?\s*mile[s]?\b/i, ""); // BaT mileage prefix: "48k-Mile", "4,500-Mile", "6k-Mile"
      t = t.replace(/\b(?:19|20)\d{2}\b/g, "");                 // model year anywhere in the title
      for (const tok of [top.make, top.model].filter(Boolean)) t = t.replace(new RegExp("\\b" + reEsc(String(tok)) + "\\b", "ig"), "");
      t = t.replace(/\b(coupe|convertible|cabriolet|roadster|spyder|spider|sedan|hatchback|wagon)\b/ig, "").replace(/\s+/g, " ").trim();
      trim = t || null;
    }
    // Display NAME = what the seller's own listing called the car (the title), cleaned: strip
    // the BaT mileage prefix and a trailing generic body word, deaccent, collapse. This is the
    // matched car's HEADLINE ("1990 BMW M3"), NOT the internal normalized model field ("E30
    // M3", which stays as-is for matching); the chassis code belongs in detail, not the
    // headline. Prepend the record year when the title omits one.
    let displayName = null;
    if (title) {
      let dn = deaccent(title)
        .replace(/^\s*[\d,.]+\s*k?\s*-?\s*mile[s]?\b/i, "")
        .replace(/\s+\b(coupe|convertible|cabriolet|sedan|hatchback|wagon)\b\s*$/i, "")
        .replace(/\s+/g, " ").trim();
      if (dn && !/^(19|20)\d{2}\b/.test(dn) && Number(top.year)) dn = `${Number(top.year)} ${dn}`;
      displayName = dn || null;
    }
    // Config from the matched record (evidence, shown-not-asserted). engine + modifications
    // live in raw_record; transmission/drivetrain are top-level columns, mirrored in raw_record.
    // The caller surfaces these and SKIPS the factory-trim ask (we already know the config); it
    // never writes engine into vehicle.trim (engine does not map cleanly to a trim).
    const engine = rr.engine ? String(rr.engine).trim() : null;
    const transmission = (top.transmission || rr.transmission) ? String(top.transmission || rr.transmission).trim() : null;
    const drivetrain = (top.drivetrain || rr.drivetrain) ? String(top.drivetrain || rr.drivetrain).trim() : null;
    const modifications = Array.isArray(rr.modifications) ? rr.modifications.map(m => String(m || "").trim()).filter(Boolean) : [];
    const materialMods = modifications.filter(isMaterialMod);
    const isModified = materialMods.length > 0;
    // Inline summary for the surfaced line = the single most salient mod, shortened
    // ("355ci V8 with Holley EFI"). The full list rides along for the result condition note.
    const modsSummary = materialMods.length ? shortMod(materialMods[0]) : (modifications.length ? shortMod(modifications[0]) : "");
    const keyMods = materialMods.slice(0, 3).map(shortMod).filter(Boolean);
    // Every distinct prior sale (newest first) so the exact-car block can show each one with
    // its OWN platform/date/price/link, not fold multiple sales into a single named sentence.
    const sales = distinct.map(x => {
      const xr = x.raw_record || {};
      return {
        platform: xr.source || x.platform || null,
        soldDate: x.sale_date || null,
        price: Number(x.sale_price) || Number(xr.price) || null,
        url: xr.source_url || xr.url || null,
        mileage: Number(x.mileage) || Number(xr.mileage) || null
      };
    }).filter(s => s.price || s.soldDate);
    return {
      count: distinct.length,
      sales,
      trim,
      // Title-derived headline for the matched car (display only; the model field below stays
      // as-is for matching). "1990 BMW M3", not "1990 BMW E30 M3".
      displayName,
      // Matched-car config (rule: describe a matched car from its own record, skip the
      // factory-trim ask). engine/transmission/drivetrain are evidence; isModified is
      // MATERIAL modification only; modsSummary is the short tag for the surfaced line.
      engine,
      transmission,
      drivetrain,
      modifications,
      materialMods,
      keyMods,
      isModified,
      modsSummary,
      // Identity of the matched car, straight from the matched record (evidence, not a
      // chassis decode). Lets the caller proceed into the wizard with the known car instead
      // of re-asking year/make/model on an exact chassis match.
      // year/make/model are the RECORD's identity (the caller makes the record the source of
      // truth on a match, over any decode). Deaccent make/model so the record's raw form
      // ("Murciélago") displays as the clean canonical form ("Murcielago").
      year: Number(top.year) || null,
      make: top.make && top.make !== "Unknown" ? deaccent(String(top.make)).trim() : null,
      model: top.model && top.model !== "Unknown" ? deaccent(String(top.model)).trim() : null,
      // platformDisplayName is idempotent, so the display label from sales_archive
      // ("Bring a Trailer") or a raw slug both render correctly.
      source: rr.source || top.platform || null,
      soldDate: top.sale_date || null,
      price: Number(top.sale_price) || Number(rr.price) || null,
      url: rr.source_url || rr.url || null,
      mileage: Number(top.mileage) || Number(rr.mileage) || null,
      // Body style straight from the matched record: on an exact match we KNOW the body, so
      // the caller can skip the "coupe or convertible" ask and scope comps to the right body.
      bodyStyle: (top.body_style || rr.body_style) ? String(top.body_style || rr.body_style).trim() : null,
      // Supporting photo for the exact-match moment (presentation only, never ranking).
      // Same archive field the One Box comp cards render from (raw_record.featured_image_url);
      // null when the record has no photo, and the frontend falls back to the spec plate.
      photoUrl: rr.featured_image_url || rr.photo_url || rr.image || null
    };
  } catch (e) { console.error(`CRITICAL: findVinArchiveMatch threw: ${e && e.message}`); return null; }
}
