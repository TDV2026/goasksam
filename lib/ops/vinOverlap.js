// task=vinoverlap (Lane S, Nov 18 2026; spec: Lane F, docs/classifieds/vin-history.md on lane-f-forsale-vins 8db062ec).
// READ ONLY. A caller hands over up to 2,000 VINs; for each, in the same order and with the VIN replaced by its position,
// it gets counts and prices from the archive: sold count, last sale date and price (USD), unsold attempts, last attempt
// date, last high bid (USD) and its status. It never echoes a VIN (not in a row, not in an error), writes nothing, touches no cache, and answers
// 502 when any chunk read fails: a partial answer would read as "this car is new to us".
//
// HOW A VIN MATCHES. Same normalisation as the archive's generated columns (sales_archive.vin_norm, auction_attempts.chassis_vin_norm,
// lib/_flags.js findVinArchiveMatch): upper case, every character that is not A-Z or 0-9 removed. The match is one whole-string equality
// (PostgREST in.(...)), never a fragment, a suffix or an ILIKE, so a partial never matches.
//   SHORT AND PRE 1981 IDS. A chassis number shorter than MIN_ID (11) characters is NOT looked up: short numbers repeat across
//   makes and years ("1E31588"), so an equality on them would join two different cars. Its row comes back matchable:false with zeros, so the caller can
//   tell "not looked up" from "looked up, nothing there". A pre 1981 chassis that is 11 or more characters once normalised is matched like any other.
export const MIN_ID = 11;
export const MAX_VINS = 2000;
export const CHUNK = 150;
export const MAX_ID = 32;

export function normVin(s) { return String(s == null ? "" : s).toUpperCase().replace(/[^A-Z0-9]/g, ""); }

const ZERO = { matchable: false, sales: 0, lastSaleDate: null, lastSalePriceUsd: null, attempts: 0, lastAttemptDate: null, lastHighBidUsd: null, lastAttemptStatus: null };
const day = d => (d ? String(d).slice(0, 10) : null);
const usd = v => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Math.round(Number(v)));
function statusWord(s) { const t = String(s || "").toLowerCase(); return /sold/.test(t) ? "sold" : /reserve/.test(t) ? "reserve not met" : /withdr/.test(t) ? "withdrawn" : "no sale"; }

// body in, { status, json } out. `read(path)` is the paged read (null on any failed page), injected so the check drives it.
export async function runVinOverlap(body, read) {
  const list = body && Array.isArray(body.vins) ? body.vins : null;
  if (!list || !list.length) return { status: 400, json: { error: "vinoverlap needs a POST body {\"vins\":[...]} with at least one VIN." } };
  if (list.length > MAX_VINS) return { status: 400, json: { error: `vinoverlap takes at most ${MAX_VINS} VINs per call; got ${list.length}.` } };
  const norm = list.map(v => (typeof v === "string" ? normVin(v) : ""));
  const ask = [...new Set(norm.filter(v => v.length >= MIN_ID && v.length <= MAX_ID))];
  const sold = new Map(), tried = new Map();
  for (let i = 0; i < ask.length; i += CHUNK) {
    const inList = ask.slice(i, i + CHUNK).map(v => `"${v}"`).join(",");
    const s = await read(`sales_archive?vin_norm=in.(${inList})&sale_price=not.is.null&select=vin_norm,source_slug,sale_date,sale_price_usd&order=sale_date.desc.nullslast,id.asc`);
    if (!s) return { status: 502, json: { error: "vinoverlap: a read failed, so no result. This is not an empty answer. Retry when the database is quiet." } };
    const a = await read(`auction_attempts?chassis_vin_norm=in.(${inList})&select=chassis_vin_norm,source_slug,attempt_date,high_bid_usd,auction_status&order=attempt_date.desc.nullslast,source_record_id.asc`);
    if (!a) return { status: 502, json: { error: "vinoverlap: a read failed, so no result. This is not an empty answer. Retry when the database is quiet." } };
    for (const r of s) { const k = String(r.vin_norm || ""); if (!sold.has(k)) sold.set(k, []); sold.get(k).push(r); }
    for (const r of a) { const k = String(r.chassis_vin_norm || ""); if (!tried.has(k)) tried.set(k, []); tried.get(k).push(r); }
  }
  const byVin = new Map();
  for (const v of ask) {
    // The archive holds known re-insert duplicates (the same sale under a fresh id): one sale is one source, day and price.
    const seen = new Set(), sales = [];
    for (const r of sold.get(v) || []) { const k = `${r.source_slug}|${day(r.sale_date)}|${r.sale_price_usd}`; if (!seen.has(k)) { seen.add(k); sales.push(r); } }
    const aSeen = new Set(), atts = [];
    for (const r of tried.get(v) || []) { const k = `${r.source_slug}|${day(r.attempt_date)}|${r.high_bid_usd}|${r.auction_status}`; if (!aSeen.has(k)) { aSeen.add(k); atts.push(r); } }
    const ls = sales[0], la = atts[0];   // both reads are newest first
    byVin.set(v, { matchable: true, sales: sales.length, lastSaleDate: ls ? day(ls.sale_date) : null, lastSalePriceUsd: ls ? usd(ls.sale_price_usd) : null,
      attempts: atts.length, lastAttemptDate: la ? day(la.attempt_date) : null, lastHighBidUsd: la ? usd(la.high_bid_usd) : null, lastAttemptStatus: la ? statusWord(la.auction_status) : null });
  }
  const rows = norm.map((v, i) => ({ position: i, ...(byVin.get(v) || ZERO) }));
  return { status: 200, json: { task: "vinoverlap", count: rows.length, looked: ask.length, chunks: Math.ceil(ask.length / CHUNK), rows } };
}
