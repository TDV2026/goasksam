// One Box v2 foundation: live-auction-house comp normalization.
// Shared, deterministic, ZERO LLM calls. Turns raw archive rows (online + the six
// live-auction houses) into a normalized comparison basis:
//   - content-based dedup (OCD assigns two source_record_ids to one house sale)
//   - price basis: house prices are premium-inclusive; DISPLAY as-is, COMPUTE on the
//     implied hammer (backed out with each house's published, verified schedule)
//   - currency: DISPLAY native, COMPUTE in USD
//   - mileage capability: structured value, else a strict text-mined "stated" value
//     (strong odometer-context phrasings only; post-restoration / "believed" rejected)
// Everything here is rule-based and verifiable against the premium calibration.

// The six live-auction houses (source slugs). Everything else is an online platform.
export const HOUSE_SOURCES = new Set(["rmsothebys", "gooding", "barrettjackson", "mecum", "broadarrow", "bonhams"]);
export const isHouseSource = s => HOUSE_SOURCES.has(String(s || "").toLowerCase());

// Published buyer's-premium schedules, verified empirically (every sampled lot backed
// out to a round hammer). A schedule is tiers [[hammerThreshold, rate], ..., [Infinity,
// rate]] applied to the HAMMER. Houses with a regional split key on currency (USD =
// North America; anything else = the EU/CHF schedule). Flat houses use one tier list.
const NA_250 = [[250000, 0.12], [Infinity, 0.10]];   // Gooding / RM US / Broad Arrow NA / Bonhams US
const EU_200 = [[200000, 0.15], [Infinity, 0.125]];  // RM EU / Broad Arrow EMEA (EUR/CHF/GBP)
const FLAT_10 = [[Infinity, 0.10]];                  // Barrett-Jackson onsite / Mecum onsite
const HOUSE_SCHEDULES = {
  gooding: { usd: NA_250, other: NA_250 },
  bonhams: { usd: NA_250, other: NA_250 },
  rmsothebys: { usd: NA_250, other: EU_200 },
  broadarrow: { usd: NA_250, other: EU_200 },
  barrettjackson: { usd: FLAT_10, other: FLAT_10 },
  mecum: { usd: FLAT_10, other: FLAT_10 }
};

// Invert a tiered premium schedule: given the premium-INCLUSIVE total, return the hammer.
// premium(H) = sum over tiers of rate * (portion of H in that tier); total = H + premium(H).
// Solved piecewise (monotonic), so it is exact, not a search.
function hammerFromTotal(total, tiers) {
  let lo = 0, floorTotal = 0; // running hammer floor and its total-at-floor
  for (const [thresh, rate] of tiers) {
    const spanHammer = thresh - lo;                 // hammer room in this tier (Infinity on last)
    const topHammer = lo + spanHammer;
    const totalAtTop = floorTotal + spanHammer * (1 + rate);
    if (total <= totalAtTop || !Number.isFinite(thresh)) {
      // hammer lands in this tier: total = floorTotal + (H - lo) * (1 + rate)
      return lo + (total - floorTotal) / (1 + rate);
    }
    lo = topHammer; floorTotal = totalAtTop;
  }
  return total; // unreachable (last tier is Infinity)
}

// Approximate FX to USD (phase 1: static rates, documented). Sale-date-accurate FX is a
// later refinement; the impact is bounded (14.5% of house records are non-USD, and house
// comps only surface for thin-online high-end cars). Never affects the DISPLAYED native
// price, only the internal USD compute value.
const FX_TO_USD = { USD: 1, GBP: 1.27, EUR: 1.08, CHF: 1.12, AUD: 0.66, CAD: 0.73 };
export function toUsd(amount, currency) {
  const r = FX_TO_USD[String(currency || "USD").toUpperCase()];
  const n = Number(amount);
  return (Number.isFinite(n) && r) ? n * r : (Number.isFinite(n) ? n : null);
}

// The normalized COMPUTE value for a row (USD hammer). Online prices are raw hammer;
// house prices are premium-inclusive and get backed out with the house schedule, keyed
// on the record's own currency. Returns null when there is no usable price.
export function hammerUsd(row) {
  const price = Number(row.price);
  if (!(price > 0)) return null;
  const src = String(row.source || "").toLowerCase();
  const currency = String((row.currency || "USD")).toUpperCase();
  if (!isHouseSource(src)) return toUsd(price, currency);           // online = already hammer
  const sched = HOUSE_SCHEDULES[src];
  const tiers = sched ? (currency === "USD" ? sched.usd : sched.other) : FLAT_10;
  const nativeHammer = hammerFromTotal(price, tiers);
  return toUsd(nativeHammer, currency);
}

// Display facts for a price: the native amount, its currency, and whether it includes a
// buyer's premium (house records) so the render can label it. Never converts for display.
export function priceDisplay(row) {
  const price = Number(row.price);
  return {
    amount: price > 0 ? Math.round(price) : null,
    currency: String(row.currency || "USD").toUpperCase(),
    premiumInclusive: isHouseSource(row.source)
  };
}

// ---- Content-based dedup (prerequisite) ----
// OCD assigns two different source_record_ids to one house sale (94 dup groups / 188
// records across the six houses, concentrated in RM Sotheby's Feb/Apr batches). The
// (source, source_record_id) DB key cannot catch these. Identity = source + normalized
// title + price + sale date; the richest row (most populated comparison fields) survives.
function saleIdentity(row) {
  const title = String(row.rtitle || row.raw_title || "").toLowerCase().replace(/\s+/g, " ").trim();
  const price = Math.round(Number(row.price) || 0);
  const date = String(row.auction_end_date || "").slice(0, 10);
  return `${String(row.source || "").toLowerCase()}|${title}|${price}|${date}`;
}
function richness(row) {
  return ["mileage", "image", "body", "mods", "rtitle", "ownership", "service"]
    .reduce((n, k) => n + (row[k] != null && row[k] !== "" ? 1 : 0), 0);
}
export function dedupBySaleIdentity(rows) {
  const best = new Map();
  for (const r of rows || []) {
    const k = saleIdentity(r);
    const cur = best.get(k);
    if (!cur || richness(r) > richness(cur)) best.set(k, r);
  }
  return [...best.values()];
}

// ---- Mileage capability + stated-in-listing text mining ----
// Strong odometer-context phrasings ONLY, per the recovery investigation. A number is a
// recovered odometer reading only in these frames; ambiguous frames (post-restoration
// mileage, "believed to be", "since rebuild") are NEVER treated as odometer mileage.
const KM = /kilomet|(?:^|\s)km\b/i;
const NUM = "([\\d][\\d,\\.]*(?:\\s*k(?![a-z]))?)";
const UNIT = "(miles|mi\\b|kilomet\\w+|km\\b)";
const STRONG_MILEAGE = [
  new RegExp(`odometer\\s+(?:currently\\s+)?(?:reads?|shows?|showing|indicat\\w+|displays?|registers?|of|at|with)\\s+(?:approximately\\s+|approx\\.?\\s+|just\\s+|only\\s+|some\\s+|about\\s+|an?\\s+indicated\\s+)?${NUM}\\s*${UNIT}?`, "i"),
  new RegExp(`showing\\s+(?:approximately\\s+|approx\\.?\\s+|just\\s+|only\\s+|some\\s+|about\\s+|an?\\s+indicated\\s+)?${NUM}\\s*${UNIT}`, "i"),
  new RegExp(`${NUM}\\s*${UNIT}\\s+(?:from|since)\\s+new`, "i"),
  new RegExp(`(?:indicated|actual|recorded|documented|genuine|warranted|covered|driven)\\s+(?:approximately\\s+|only\\s+|just\\s+)?${NUM}\\s*${UNIT}`, "i"),
  new RegExp(`${NUM}\\s*${UNIT}\\s+(?:on\\s+the\\s+odometer|indicated|recorded|from\\s+new)`, "i")
];
// A strong hit followed by "since (its) [year] restoration/build/completion/rebuild" is
// POST-RESTORATION mileage, not a total odometer reading -> never a capable mileage.
const POSTRESTO = /since\s+(?:its\s+|the\s+)?(?:\w+\s+){0,2}(restoration|rebuild|build|completion|refresh|recommission|resto|frame-off|the\s+work)/i;
function milesFromToken(tok, unit) {
  let s = String(tok).trim().toLowerCase(), mult = 1;
  if (/k$/.test(s)) { mult = 1000; s = s.replace(/k$/, ""); }
  const n = parseFloat(s.replace(/,/g, "").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n)) return null;
  const miles = KM.test(unit || "") ? n * mult * 0.621371 : n * mult;
  return Math.round(miles);
}
// Returns { value } for a clean odometer reading mined from listing prose, or null.
export function statedMileageFromText(text) {
  const t = String(text || "").replace(/\s+/g, " ");
  if (!t) return null;
  for (const re of STRONG_MILEAGE) {
    const m = re.exec(t);
    if (!m) continue;
    const after = t.slice(m.index, m.index + m[0].length + 80);
    if (POSTRESTO.test(after)) continue;            // ambiguous: not an odometer total
    const v = milesFromToken(m[1], m[2]);
    if (v != null && v > 0) return { value: v };
  }
  return null;
}

// Full mileage picture for a row. structured = the reliable numeric field (any source).
// stated = a strict text-mined odometer reading (house records that lack a structured
// value but state it clearly in prose), kept SEPARATE and labeled, never conflated.
// capable = do we have a usable odometer figure to compare on (structured, or clean stated).
export function mileageInfo(row) {
  const s = Number(row.mileage);
  const structured = Number.isFinite(s) && s > 0 ? Math.round(s) : null;
  let stated = null;
  if (structured == null && isHouseSource(row.source)) {
    const prose = `${row.description || ""}. ${Array.isArray(row.ldetails) ? row.ldetails.join(". ") : (row.ldetails || "")}`;
    const mined = statedMileageFromText(prose);
    if (mined) stated = mined.value;
  }
  return { structured, stated, capable: structured != null || stated != null };
}
