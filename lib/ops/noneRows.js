// STORED "NO FIGURES" ROWS FROM FAILED READS (Lane B, Nov 13 2026; Find's 1999 Carrera Coupe still read "Not read. No figures are shown for this car yet." after 678340c8). Before that fix a pool read that failed (tier read_failed / unavailable) was written to
// spec_market_cache as a none row carrying the generic refusal line (find.none) and no not-tracked line, no zero-thin flag: a row that says nothing about the car, only that a read once failed. The fix stops new ones; these tasks find and remove the old ones.
// listNoneRows is READ ONLY (zero OldCarsData, zero writes). clearNoneRows deletes ONLY a row that still matches the filter at the moment of the delete (the filter rides on the DELETE itself), so a row a read rewrote meanwhile is never removed;
// a cleared spec is read cold on its next ask. Both page the table by spec_key, 1,000 rows a call.
import { reasonLine } from "../reasonWords.js";
import { supabaseDelete } from "../_supabase.js";

export const noneLine = () => reasonLine("find.none");
const enc = encodeURIComponent;
// the rows that match: kind none, the generic refusal line, and none of the lines that make a none row a real answer (a not-tracked line, a zero-thin flag)
const FILTER = () => `market->>kind=eq.none&market->>refusalLine=eq.${enc(noneLine())}&market->>notTrackedLine=is.null&or=(market->>thinZero.is.null,market->>thinZero.eq.false)`;   // not.eq.true would drop a NULL: a row with no flag is a row the flag does not exclude
export const isFailedNoneRow = m => !!(m && typeof m === "object" && m.kind === "none" && m.refusalLine === noneLine() && !m.notTrackedLine && m.thinZero !== true);

// THE READ THAT FAILED ON THE DEPLOYED FUNCTION (Lane B, Nov 13 2026): the first version asked for the whole `market` blob of up to 1,000 rows under a jsonb filter in ONE call; the shared client aborts every call at 8 s (SUPABASE_FETCH_MS), the call did not finish,
// supabaseSelect answered null, and the task said readFailed twice. Now: only the few small fields are projected out of the jsonb (never the blob), pages are small (PAGE rows), each page has its own longer timeout, a page that fails is tried once more, the walk
// stops at a time budget and hands back `next` to continue with ?after=, and a failure names its status and body instead of a bare readFailed.
const PAGE = 250, PAGE_MS = 25000, BUDGET_MS = 200000;
const SELECT = "spec_key,computed_at,kind:market->>kind,line:market->>refusalLine,nt:market->>notTrackedLine,tz:market->>thinZero,ev:market->>engineVersion";
export const isFailedNoneProjection = r => !!(r && r.kind === "none" && r.line === noneLine() && !r.nt && r.tz !== "true");
async function page(env, q) {
  let why = null;
  for (let t = 0; t < 2; t++) {
    const ctrl = new AbortController(), timer = setTimeout(() => { try { ctrl.abort(); } catch { /* settled */ } }, PAGE_MS);
    try {
      const res = await fetch(`${env.supabaseUrl}/rest/v1/${q}`, { headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}` }, signal: ctrl.signal });
      const text = await res.text();
      if (res.ok) { const rows = JSON.parse(text); if (Array.isArray(rows)) return { rows }; why = "not a list"; } else why = `status ${res.status}: ${text.slice(0, 160)}`;
    } catch (e) { why = String(e && e.name === "AbortError" ? `no answer in ${PAGE_MS / 1000}s` : e && e.message || e).slice(0, 160); } finally { clearTimeout(timer); }
  }
  return { why };
}

export async function listNoneRows(env, { after = "", maxPages = 400, budgetMs = BUDGET_MS } = {}) {
  const keys = [], examples = []; const byYear = {}; const t0 = Date.now(); let cursor = after, pages = 0, next = null, scanned = 0;
  for (; pages < maxPages; pages++) {
    if (pages && Date.now() - t0 > budgetMs) { next = cursor; break; }
    const r = await page(env, `spec_market_cache?select=${SELECT}&${FILTER()}${cursor ? `&spec_key=gt.${enc(cursor)}` : ""}&order=spec_key.asc&limit=${PAGE}`);
    if (!r.rows) return { readFailed: true, why: r.why, count: keys.length, after: cursor, pages };
    const rows = r.rows; scanned += rows.length;
    for (const x of rows) {
      if (!isFailedNoneProjection(x)) continue;   // the filter and this test are the same rule; a row the server filter let through that this rejects is left alone
      keys.push(x.spec_key); const yr = (String(x.spec_key).match(/\b(1[89]\d\d|20\d\d)\b/) || [])[1] || "none"; byYear[yr] = (byYear[yr] || 0) + 1;
      if (examples.length < 25) examples.push({ spec_key: String(x.spec_key).slice(0, 120), computed_at: x.computed_at, engineVersion: x.ev || null });
    }
    if (rows.length < PAGE) { next = null; break; }
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
