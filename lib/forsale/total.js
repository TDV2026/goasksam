// THE VEHICLE COUNT (Lane S, Nov 19 2026; crew only, behind FORSALE_PUBLIC). How many vehicles are for sale right now across the auctions, the dealers and the classifieds, as the engine counts them: the same
// make-less read Find makes for a search with nothing in it (searchAll over the live auctions, forSaleFor over the servable for-sale rows), counted once, then ROUNDED DOWN TO THE THOUSAND. The engine serves the number
// (forSale.counts.total) and its two lines (forSale.lines.searching and forSale.lines.top, reasonWords forsale.total_*); a page prints them and computes nothing. Never an exact number, never a number for one source,
// never a count of sources. Under 1,000 there is no line (a small number is not "1,000+"). Off for a visitor: forSaleFor returns null unless the gate is open, and so does this.
import { emptyFilters } from "../live/search.js";
import { searchAll } from "../live/converse.js";
import { reasonLine } from "../reasonWords.js";
import { forSaleActive } from "./gate.js";
import { forSaleFor } from "./serve.js";

export const TOTAL_MEMO_MS = 600000;   // one count per instance per ten minutes: a page reads memory, not the table
export const floorThousand = n => Math.floor(Math.max(0, Number(n) || 0) / 1000) * 1000;
export const totalWords = total => total.toLocaleString("en-US") + "+";   // 51000 -> "51,000+"
let memo = { at: 0, v: null, flight: null };
export function forSaleTotalReset() { memo = { at: 0, v: null, flight: null }; }

// the count, or null (switch off, nothing readable, or under a thousand). { total, lines: { searching, top } }
export async function forSaleTotal(env, opts = {}) {
  if (!forSaleActive()) return null;
  const now = opts.now || Date.now();
  if (memo.v !== null && now - memo.at < TOTAL_MEMO_MS) return memo.v || null;
  if (memo.flight) return memo.flight;
  memo.flight = (async () => {
    let v = false;
    try {
      const f = emptyFilters(), auc = await searchAll(env, f);
      const g = await forSaleFor(env, rowsIn => searchAll(env, f, rowsIn), ((auc && auc.rows) || []).length, { now });
      const all = g && g.counts ? Number(g.counts.all) : NaN;   // the auctions, the dealers and the classifieds, counted once
      const total = floorThousand(all);
      if (Number.isFinite(all) && total >= 1000) { const w = totalWords(total); v = { total, lines: { searching: reasonLine("forsale.total_searching", { total: w }), top: reasonLine("forsale.total_top", { total: w }) } }; }
    } catch (e) { console.error("forSaleTotal:", e && e.message); v = null; }
    if (v !== null) memo = { at: now, v, flight: null }; else memo.flight = null;
    return v || null;
  })();
  try { return await memo.flight; } finally { if (memo.flight) memo.flight = null; }
}
// a forSale answer with the count on it (counts.total and the two lines), or the answer as it came when there is no count to serve
export async function withTotal(env, forSale) {
  if (!forSale || !forSale.counts) return forSale;
  const t = await forSaleTotal(env).catch(() => null); if (!t) return forSale;
  return { ...forSale, counts: { ...forSale.counts, total: t.total }, lines: t.lines };
}
