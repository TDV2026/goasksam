// STORED "NO FIGURES" ROWS FROM FAILED READS (Lane B, Nov 13 2026; Find's 1999 Carrera Coupe still read "Not read. No figures are shown for this car yet." after 678340c8). Before that fix a pool read that failed (tier read_failed / unavailable) was written to
// spec_market_cache as a none row carrying the generic refusal line (find.none) and no not-tracked line, no zero-thin flag: a row that says nothing about the car, only that a read once failed. The fix stops new ones; these tasks find and remove the old ones.
// listNoneRows is READ ONLY (zero OldCarsData, zero writes). clearNoneRows deletes ONLY a row that still matches the filter at the moment of the delete (the filter rides on the DELETE itself), so a row a read rewrote meanwhile is never removed;
// a cleared spec is read cold on its next ask. Both page the table by spec_key, 1,000 rows a call.
import { reasonLine } from "../reasonWords.js";
import { supabaseSelect, supabaseDelete } from "../_supabase.js";

export const noneLine = () => reasonLine("find.none");
const enc = encodeURIComponent;
// the rows that match: kind none, the generic refusal line, and none of the lines that make a none row a real answer (a not-tracked line, a zero-thin flag)
const FILTER = () => `market->>kind=eq.none&market->>refusalLine=eq.${enc(noneLine())}&market->>notTrackedLine=is.null&or=(market->>thinZero.is.null,market->>thinZero.eq.false)`;   // not.eq.true would drop a NULL: a row with no flag is a row the flag does not exclude
export const isFailedNoneRow = m => !!(m && typeof m === "object" && m.kind === "none" && m.refusalLine === noneLine() && !m.notTrackedLine && m.thinZero !== true);

export async function listNoneRows(env, { after = "", maxPages = 30 } = {}) {
  const keys = [], examples = []; const byYear = {}; let cursor = after, pages = 0, next = null;
  for (; pages < maxPages; pages++) {
    const rows = await supabaseSelect(env, `spec_market_cache?select=spec_key,computed_at,market&${FILTER()}${cursor ? `&spec_key=gt.${enc(cursor)}` : ""}&order=spec_key.asc&limit=1000`);
    if (!Array.isArray(rows)) return { readFailed: true, count: keys.length };
    for (const r of rows) {
      if (!isFailedNoneRow(r.market)) continue;   // the filter and this test are the same rule; a row the server filter let through that this rejects is left alone
      keys.push(r.spec_key); const yr = (String(r.spec_key).match(/\b(1[89]\d\d|20\d\d)\b/) || [])[1] || "none"; byYear[yr] = (byYear[yr] || 0) + 1;
      if (examples.length < 25) examples.push({ spec_key: String(r.spec_key).slice(0, 120), computed_at: r.computed_at, engineVersion: r.market.engineVersion || null });
    }
    if (rows.length < 1000) { next = null; break; }
    cursor = rows[rows.length - 1].spec_key; next = cursor;
  }
  return { count: keys.length, keys, examples, byYear, pages: pages + 1, next };
}

export async function clearNoneRows(env, keys) {
  let deleted = 0, failed = 0;
  for (let i = 0; i < keys.length; i += 40) {
    const part = keys.slice(i, i + 40), list = part.map(k => `"${String(k).replace(/"/g, '\\"')}"`).join(",");
    const r = await supabaseDelete(env, `spec_market_cache?spec_key=in.(${enc(list)})&${FILTER()}`);
    if (r && r.ok) deleted += part.length; else failed += part.length;
  }
  return { attempted: keys.length, deleted, failed };
}
