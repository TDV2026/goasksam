// POOLROWS 2 (Lane D, Nov 17 2026, lane-d-poolrows-2; order 2318): what the read only ops task poolrows (api/usageDashboard.js) adds so a variant family can be analysed in full for the newsletter. Counts and facts only; no seller name anywhere.
//  1 SOLD ROWS carry gearbox and exterior colour (the transmission and exterior_color COLUMNS: raw_record is empty for them), the reserve status (reserve, no_reserve, unknown) and a CAR KEY for repeat detection.
//    The car key is a keyed one way hash of the VIN (HMAC-SHA256 under a server secret, 16 hex characters): never the VIN, never a plain hash a VIN guess could be checked against, empty when there is no VIN. Sold rows and attempts hash the same normalised VIN, so a repeat shows across the two tables.
//  2 UNSOLD ATTEMPTS (table=attempts, auction_attempts) for ANY family (make, model, title and years, as sold rows), with the same fields plus the high bid, the outcome and the attempt date, the engine's own verdicts (variant, replica flag, the set aside reason) and a statement of which venues and which dates they cover.
//  3 SAMPLE MODE (sample=1&flag=replica|project|setaside): ONE flagged group of ONE family, at most 40 listings, with the description text for a lane to read in process; marked do not write to disk; no seller name; the same door and limits as the value census sample mode (probe key, a window of 366 days or less, one family).
import crypto from "node:crypto";
import { isReplicaCar } from "./_classify.js";
import { familyOf, variantOfSale } from "./variants.js";
import { ATTEMPT_SOURCES } from "./valueCensus.js";

export const SAMPLE_MAX = 40, MAX_WINDOW_DAYS = 366, MAX_ROWS = 500, DESC_CHARS = 6000, SAMPLE_READ_ROWS = 1500;
export const SAMPLE_FLAGS = ["replica", "project", "setaside"];
export const ATTEMPT_VENUES = ATTEMPT_SOURCES;
export const DO_NOT_WRITE = "DO NOT WRITE TO DISK. The descriptions in this answer are listing text for reading in process and coding only: no file, no note, no commit, no log. Counts and codes are what may be kept.";

// ---- sold rows: the new columns ---------------------------------------------------------------------------------------------------
export const SOLD_EXTRA_COLS = "gearbox:transmission,color:exterior_color,has_reserve";
export const reserveOf = v => v === true || v === "true" ? "reserve" : v === false || v === "false" ? "no_reserve" : "unknown";
const text = v => { const s = v == null ? "" : String(v).trim(); return s ? s : null; };
export function carKeyOf(vin, secret) {
  const v = String(vin == null ? "" : vin).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!v || !secret) return "";   // no VIN, no key; and no secret, no key (never an unkeyed hash)
  return crypto.createHmac("sha256", String(secret)).update("carkey1:" + v).digest("hex").slice(0, 16);
}
export const carKeySecret = () => process.env.CAR_KEY_SECRET || process.env.PROBE_KEY || process.env.OPS_KEY || "";

// ---- the engine's own verdicts on a row (sold or attempt): the variant, the replica or tribute flag --------------------------------
export function verdictsOf(r) {
  const title = r.raw_title || r.rtitle || "", fam = familyOf(r.make, r.model, r.year);
  return { variant: fam ? variantOfSale(fam, { raw_title: title, model: r.model }) : null, variantFamily: fam ? fam.id : null, replica: isReplicaCar({ raw_title: title }) };
}
export const soldExtras = (r, secret) => ({ gearbox: text(r.gearbox), exterior_color: text(r.color), reserve: reserveOf(r.has_reserve), car_key: carKeyOf(r.vin_norm, secret), ...verdictsOf(r) });

// ---- attempts ---------------------------------------------------------------------------------------------------------------------
// no seller column and no seller key of raw_record is ever selected
export const ATT_POOL_COLS = "id:source_record_id,year,make,model,source_slug,attempt_date,auction_status,high_bid,currency,has_reserve,chassis_vin_norm," +
  "raw_title:raw_record->>title,mileage:raw_record->>mileage,gearbox:raw_record->>transmission,color:raw_record->>exterior_color,mods:raw_record->>modifications,image:raw_record->>featured_image_url,body:raw_record->>body_style,cc:raw_record->>country_code,city:raw_record->>city,state:raw_record->>state";
export const ATT_DESC_COLS = "id:source_record_id,year,make,model,source_slug,attempt_date,chassis_vin_norm,raw_title:raw_record->>title,desc:raw_record->>description";
export function attemptRow(r, { secret, setAside = null } = {}) {
  const v = verdictsOf(r), hb = Number(r.high_bid);
  return {
    id: r.id, year: r.year, make: r.make, model: r.model, listing_title: r.raw_title || null, source_slug: r.source_slug, attempt_date: r.attempt_date,
    outcome: r.auction_status || null, high_bid: Number.isFinite(hb) && hb > 0 ? hb : null, currency: r.currency || null, reserve: reserveOf(r.has_reserve),
    gearbox: text(r.gearbox), exterior_color: text(r.color), mileage: r.mileage || null, has_photo: !!r.image, mods: r.mods ? String(r.mods).slice(0, 400) : null, body_style: r.body || null, country_code: r.cc || null, city: r.city || null, state: r.state || null,
    car_key: carKeyOf(r.chassis_vin_norm, secret), variant: v.variant, variantFamily: v.variantFamily, replica: v.replica, engineVerdict: setAside
  };
}

// ---- the filters, one family, a window --------------------------------------------------------------------------------------------
export function familyFilter(f) {
  let qs = "";
  if (f.source) qs += `&source_slug=eq.${encodeURIComponent(f.source)}`;
  if (f.make) qs += `&make=ilike.${encodeURIComponent("*" + f.make + "*")}`;
  if (f.model) qs += `&model=ilike.${encodeURIComponent("*" + f.model + "*")}`;
  if (f.title) qs += `&${f.table === "attempts" ? "raw_record->>title" : "listing_title"}=ilike.${encodeURIComponent("*" + f.title + "*")}`;
  if (f.yearMin != null) qs += `&year=gte.${f.yearMin}`;
  if (f.yearMax != null) qs += `&year=lte.${f.yearMax}`;
  const dc = f.table === "attempts" ? "attempt_date" : "sale_date";
  if (f.since) qs += `&${dc}=gte.${f.since}`;
  if (f.until) qs += `&${dc}=lte.${f.until}`;
  return qs;
}
export const attemptsQuery = (f, limit, offset) => `auction_attempts?select=${ATT_POOL_COLS}&source_slug=not.is.null${familyFilter({ ...f, table: "attempts" })}&order=attempt_date.desc&limit=${limit}&offset=${offset}`;

// ---- the coverage of the attempts: which venues, which dates ------------------------------------------------------------------------
export async function attemptsCoverage(select, f, rows) {
  const one = async (extra, dir) => { try { const r = await select(`auction_attempts?select=attempt_date&attempt_date=not.is.null${extra}&order=attempt_date.${dir}&limit=1`); return Array.isArray(r) && r[0] ? r[0].attempt_date : null; } catch { return null; } };
  const fam = familyFilter({ ...f, table: "attempts", since: null, until: null });
  const [first, last, ...perVenue] = await Promise.all([one(fam, "asc"), one(fam, "desc"), ...ATTEMPT_VENUES.flatMap(v => [one(`&source_slug=eq.${v}`, "asc"), one(`&source_slug=eq.${v}`, "desc")])]);
  const venues = {}; ATTEMPT_VENUES.forEach((v, i) => { venues[v] = { first: perVenue[2 * i] || null, last: perVenue[2 * i + 1] || null }; });
  return {
    venuesHeld: ATTEMPT_VENUES, venuesInThisRead: [...new Set((rows || []).map(r => r.source_slug))].sort(),
    datesInThisFamily: { first, last }, datesInThisWindow: { since: f.since || null, until: f.until || null }, tableDatesByVenue: venues,
    note: "Unsold attempts are held for these venues only (reserve not met and withdrawn); every other venue has sales and no attempts. A venue with no attempts in this read is not proof that it had none."
  };
}

// ---- the sample mode: one flagged group of one family, at most 40 ------------------------------------------------------------------
const DATE = /^\d{4}-\d{2}-\d{2}$/, days = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);
export function parseSample(q) {
  const get = k => String((q && q[k]) == null ? "" : q[k]).trim();
  const table = get("table") || "sold", flag = get("flag"), since = get("since"), until = get("until");
  if (!["sold", "attempts"].includes(table)) return { ok: false, why: "table must be sold or attempts" };
  if (!SAMPLE_FLAGS.includes(flag)) return { ok: false, why: "flag must be one of: " + SAMPLE_FLAGS.join(", ") + " (one flagged group per call)" };
  if (flag === "project" && table !== "sold") return { ok: false, why: "the project flag is held for sold rows only" };
  if (flag === "setaside" && !get("q")) return { ok: false, why: "flag=setaside needs q (the typed words the engine reads the set asides for)" };
  if (!get("make") && !get("title") && !get("model")) return { ok: false, why: "one family is required (make, model or title)" };
  if (!DATE.test(since) || !DATE.test(until)) return { ok: false, why: "since and until are required (YYYY-MM-DD): an unwindowed sample is refused" };
  if (days(since, until) < 0) return { ok: false, why: "until is before since" };
  if (days(since, until) > MAX_WINDOW_DAYS) return { ok: false, why: "window is wider than " + MAX_WINDOW_DAYS + " days" };
  const lim = get("limit") === "" ? 10 : Number(get("limit"));
  if (!Number.isFinite(lim) || lim < 1) return { ok: false, why: "limit must be 1 to " + SAMPLE_MAX };
  if (lim > SAMPLE_MAX) return { ok: false, why: "a sample is at most " + SAMPLE_MAX + " listings" };
  const yn = k => Number.isFinite(Number(get(k))) && get(k) ? Number(get(k)) : null;
  return { ok: true, call: { table, flag, since, until, limit: Math.floor(lim), q: get("q"), make: get("make"), model: get("model"), title: get("title"), source: get("source"), yearMin: yn("yearMin"), yearMax: yn("yearMax") } };
}
const REPLICA_OR = ["replica", "tribute", "clone", "recreation", "re-creation", "kitt", "knight rider", "knight-rider"];
export function sampleQuery(c) {
  const titleCol = c.table === "attempts" ? "raw_record->>title" : "listing_title";
  let qs = c.table === "attempts"
    ? `auction_attempts?select=${ATT_DESC_COLS}&source_slug=not.is.null`
    : `sales_archive?select=id,year,make,model,source_slug,sale_date,vin_norm,raw_title:listing_title,project_flag,desc:description,rdesc:raw_record->>description&sale_price=not.is.null&vehicle_type=eq.car`;
  qs += familyFilter({ source: c.source, make: c.make, model: c.model, title: c.title, yearMin: c.yearMin, yearMax: c.yearMax, since: c.since, until: c.until, table: c.table });
  if (c.flag === "replica") qs += `&or=(${REPLICA_OR.map(w => `${titleCol}.ilike.*${encodeURIComponent(w)}*`).join(",")})`;
  if (c.flag === "project") qs += `&project_flag=not.is.null`;
  qs += `&order=${c.table === "attempts" ? "attempt_date" : "sale_date"}.desc&limit=${c.flag === "setaside" ? SAMPLE_READ_ROWS : c.limit * 3}`;
  return qs;
}
export function sampleRow(c, r, secret) {
  const d = c.table === "attempts" ? r.desc : (r.desc != null && String(r.desc).trim() ? r.desc : r.rdesc), v = verdictsOf(r);
  return { id: r.id, table: c.table, car_key: carKeyOf(c.table === "attempts" ? r.chassis_vin_norm : r.vin_norm, secret), year: r.year, make: r.make, model: r.model, listing_title: r.raw_title || null, source_slug: r.source_slug, date: c.table === "attempts" ? r.attempt_date : r.sale_date, variant: v.variant, replica: v.replica, description: d == null ? null : String(d).slice(0, DESC_CHARS) };
}
