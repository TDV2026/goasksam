// Canonical transaction layer (approved Sep 2026). One canonical sale per real-world
// transaction; every source row becomes an alias pointing at it. Sits BETWEEN the
// price-basis step (_houseComps) and recognition. One Box, /sell, Sam Desk and Market
// View all read canonical rows, so a car that sold once is counted once.
//
// MATCH RULES (locked, tightened per review):
//   (1) normalised chassis/VIN exact -> AUTHORITATIVE. Merges even across sources. Guarded
//       against short-chassis collisions: a <11-char chassis also requires same make + year.
//   (2)-(4) NEVER merge across DIFFERENT sources on their own. A no-chassis merge needs:
//         - lot number + venue + event all present and equal (cross-source ok), OR
//         - a shared listing URL (cross-source ok), OR
//         - SAME source only: hammer within tolerance + sale date within 3 days + identical
//           normalised title.
// Rationale: a FALSE cross-source merge deletes real evidence (two different E30 M3s that
// sold the same day for the same money on two platforms must never collapse), which is worse
// than leaving a genuine duplicate. So the cross-source bar is deliberately high.

const HAMMER_TOL = 0.005;        // 0.5% - same-source near-identical price
const DATE_TOL_DAYS = 3;
const PRICE_ABS_TOL = 500;       // +/- $500 (widened to 0.5% for large/cross-currency values)
const VIN_DATE_TOL_DAYS = 30;    // generous cross-feed reporting lag; price does the real discrimination

export function normChassis(v) {
  const s = String(v == null ? "" : v).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return s.length >= 4 ? s : "";  // shorter than 4 is too weak to key on at all
}
function normTitle(v) { return String(v == null ? "" : v).toLowerCase().replace(/\s+/g, " ").trim(); }
function normStr(v) { return String(v == null ? "" : v).toLowerCase().replace(/\s+/g, " ").trim(); }
function dayNum(d) { const t = Date.parse(String(d || "").slice(0, 10)); return Number.isFinite(t) ? Math.round(t / 86400000) : null; }
function hammer(r) { const n = Number(r.hammer_usd != null ? r.hammer_usd : r.value); return Number.isFinite(n) && n > 0 ? n : null; }
function priceClose(a, b) { const ha = hammer(a), hb = hammer(b); if (ha == null || hb == null) return false; return Math.abs(ha - hb) <= Math.max(PRICE_ABS_TOL, 0.005 * Math.max(ha, hb)); }
function datesWithin(a, b, days) { const da = dayNum(a.sale_date || a.auction_end_date), db = dayNum(b.sale_date || b.auction_end_date); return da != null && db != null && Math.abs(da - db) <= days; }
function urlOf(r) { const u = r.srcurl || r.srcurl2 || r.url || r.source_url; return u ? String(u).split(/[?#]/)[0].toLowerCase().replace(/\/+$/, "") : ""; }
function sourceOf(r) { return String(r.source_slug || r.source || "").toLowerCase(); }

// Do two rows describe the SAME real-world transaction under the locked rules?
export function sameTransaction(a, b) {
  // (1) chassis/VIN exact -> authoritative (cross-source), with a short-chassis make+year guard.
  const ca = normChassis(a.chassis_vin_norm || a.vin || a.chassis), cb = normChassis(b.chassis_vin_norm || b.vin || b.chassis);
  if (ca && cb && ca === cb) {
    const isVin = ca.length >= 11;
    const sameMakeYear = normStr(a.make) === normStr(b.make) && String(a.year || "") === String(b.year || "");
    if (isVin || sameMakeYear) {
      // Same physical car. It is the SAME TRANSACTION (cross-feed duplicate) only when the
      // PRICE matches (~$500 / 0.5%) AND the dates are within 30 days (cross-feed reporting
      // lag; price is the real discriminator). A price divergence is evidence of a genuine
      // SECOND sale regardless of the date gap -> never merge. Same price but dates >30d apart
      // is the one ambiguous case: kept SEPARATE and flagged. Non-merging same-VIN rows are
      // still the same physical car (sameCar), linked via chassis_vin_norm for the history view.
      const sameCar = isVin;  // >=11-char VIN is a confident same-car link; a short chassis is not
      if (priceClose(a, b) && datesWithin(a, b, VIN_DATE_TOL_DAYS)) return { merge: true, reason: isVin ? "vin_exact" : "chassis_makeyear", sameCar };
      if (!priceClose(a, b)) return { merge: false, reason: "vin_price_diverges", sameCar };
      return { merge: false, reason: "vin_price_close_date_far_AMBIGUOUS", sameCar, ambiguous: true };
    }
    // short chassis, different make/year: NOT a match (collision guard)
  }
  // (2) lot + venue + event all present and equal (cross-source ok)
  const lotA = normStr(a.lot_number), lotB = normStr(b.lot_number);
  const venA = normStr(a.venue), venB = normStr(b.venue);
  const evA = normStr(a.event), evB = normStr(b.event);
  if (lotA && lotA === lotB && venA && venA === venB && evA && evA === evB) return { merge: true, reason: "lot_venue_event" };
  // (3) shared URL (cross-source ok)
  const ua = urlOf(a), ub = urlOf(b);
  if (ua && ua === ub) return { merge: true, reason: "shared_url" };
  // (4) SAME source only: hammer within tolerance + date within 3 days + identical title
  if (sourceOf(a) && sourceOf(a) === sourceOf(b)) {
    const ha = hammer(a), hb = hammer(b), da = dayNum(a.sale_date || a.auction_end_date), db = dayNum(b.sale_date || b.auction_end_date);
    const ta = normTitle(a.title || a.raw_title || a.listing_title), tb = normTitle(b.title || b.raw_title || b.listing_title);
    if (ha && hb && da != null && db != null && ta && ta === tb &&
        Math.abs(ha - hb) <= HAMMER_TOL * Math.max(ha, hb) && Math.abs(da - db) <= DATE_TOL_DAYS) {
      return { merge: true, reason: "same_source_price_date_title" };
    }
  }
  return { merge: false, reason: null };
}

// Group source rows into canonical transactions. Returns { canonicals, aliases }.
// canonicals: [{ canonical_id, rows: [...], reason }]; aliases: [{ source_record_id, source_slug, canonical_id, match_reason }].
// O(n^2) pairwise within a pool (comp pools are hundreds of rows, fine). Deterministic:
// rows are processed in input order; a row joins the FIRST existing canonical it matches.
export function canonicalize(rows) {
  const canonicals = [];
  const aliases = [];
  for (const r of rows || []) {
    let joined = null;
    for (const c of canonicals) {
      // a row matches a canonical if it matches ANY member (chassis/url are transitive-safe;
      // same-source-price-date-title is checked against the canonical's anchor member).
      for (const m of c.rows) {
        const res = sameTransaction(r, m);
        if (res.merge) { joined = { c, reason: res.reason }; break; }
      }
      if (joined) break;
    }
    if (joined) {
      joined.c.rows.push(r);
      aliases.push({ source_record_id: String(r.source_record_id || r.source_id || r.id || ""), source_slug: sourceOf(r), canonical_id: joined.c.canonical_id, match_reason: joined.reason });
    } else {
      const canonical_id = `${sourceOf(r)}:${String(r.source_record_id || r.source_id || r.id || canonicals.length)}`;
      const c = { canonical_id, rows: [r], reason: "seed" };
      canonicals.push(c);
      aliases.push({ source_record_id: String(r.source_record_id || r.source_id || r.id || ""), source_slug: sourceOf(r), canonical_id, match_reason: "primary" });
    }
  }
  return { canonicals, aliases };
}
