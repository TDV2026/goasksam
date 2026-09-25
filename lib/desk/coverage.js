// Per-source coverage table: the TRUE earliest sale_date we hold for each source in sales_archive.
// This is a FIXED fact per source (BaT from Jan 2022, Cars & Bids from mid-2020, ...), NOT derived
// from any query pool - deriving it from the pool produced fake dates (a 24-month fallback window's
// earliest sale presented as "coverage since"). Computed once with one cheap asc-limit-1 query per
// source and cached (24h); refreshable on demand (opts.force). Used by the Desk record answer and
// exposed via the archiveQuery "sourceCoverage" mode so the table's current values are visible.
import { supabaseSelect } from "../_supabase.js";

// Platform LABELS as stored in sales_archive.platform.
export const COVERAGE_SOURCES = [
  "Bring a Trailer", "Cars & Bids", "Hagerty", "PCARMarket", "PCAR Market",
  "RM Sotheby's", "Gooding Christie's", "Gooding & Co", "Bonhams", "Broad Arrow",
  "Barrett-Jackson", "Mecum Auctions", "Mecum", "Sotheby's Motorsport", "MB Market",
  "Hemmings", "All Collector Cars", "AutoHunter", "Car & Classic", "Collecting Cars",
  "The Market", "PistonHeads"
];

const cache = { at: 0, table: null };
const TTL_MS = 24 * 3600 * 1000;

// { "<platform label>": "YYYY-MM-DD" } for every source that has at least one priced sale.
export async function sourceCoverage(env, opts = {}) {
  if (!opts.force && cache.table && Date.now() - cache.at < TTL_MS) return cache.table;
  // PARALLEL (Sep 2026): 22 sequential asc-limit-1 queries were ~7-11s and dominated the record
  // path (blowing the <3s bar); each is index-served (~0.2s) so Promise.all bounds the whole table
  // to the slowest single query. Cached 24h in-memory as before.
  const table = {};
  await Promise.all(COVERAGE_SOURCES.map(async p => {
    const rows = await supabaseSelect(env, `sales_archive?select=sale_date&platform=eq.${encodeURIComponent(p)}&sale_price=not.is.null&order=sale_date.asc&limit=1`);
    if (rows && rows[0] && rows[0].sale_date) table[p] = String(rows[0].sale_date).slice(0, 10);
  }));
  cache.table = table; cache.at = Date.now();
  return table;
}
