// Shared Supabase REST (PostgREST) helpers. Server-side only: callers pass
// the service-role key via env; never expose it in browser code.

export function supabaseEnv(options = {}) {
  const supabaseUrl = options.supabaseUrl || process.env.SUPABASE_URL;
  const supabaseKey = options.supabaseKey || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return null;
  return { supabaseUrl, supabaseKey };
}

// Read helper: null on any failure so callers fall back gracefully.
export async function supabaseSelect(env, pathAndQuery) {
  if (!env) return null;
  try {
    const res = await fetch(`${env.supabaseUrl}/rest/v1/${pathAndQuery}`, {
      headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}` }
    });
    if (!res.ok) return null;
    const rows = await res.json();
    return Array.isArray(rows) ? rows : null;
  } catch {
    return null;
  }
}

// Paginated read: PostgREST caps every response at db-max-rows (1000 on Supabase) regardless of a
// `limit=` in the query, so a large pool (all-time M3, 911) silently tops out near 1000 and every
// count/median computed from it is wrong. This walks the full result with the Range header (1000/page)
// and returns ALL rows. Do NOT put a `limit=` in pathAndQuery; use `order=` for a stable page order.
//
// ROOT CAUSE FIX (Oct 2026, Targa-4/M3-Competition mismatch job): this used to return the PARTIAL
// `all` array collected so far when a page AFTER the first one failed ("Null only when the FIRST page
// errors... a mid-walk error returns what was read" - the old comment, stating the bug as design).
// A caller had no way to tell "the real pool is this size" from "a later page timed out and this is
// a truncated fragment" - both looked identical: a plain array of rows. For a large, unbounded scan
// (assessClassEra's "page the full marque-decade pool", no limit) this silently served a SMALLER,
// WRONG pool as if it were complete whenever a later page hiccuped - confirmed as the direct cause of
// the 1990 Porsche 911 Targa 4 mismatch (442 vs 334 on two calls moments apart) and almost certainly
// of the earlier, structurally identical BMW M3 Competition 341-vs-87 report. Fixed: a page failure
// gets up to 2 retries (short backoff, transient network/throttle blips are common on a many-page
// scan); if every retry on any page still fails, the function returns null - NEVER a partial result -
// so every existing caller's own null-handling (`await supabaseSelectAll(...) || []`, or an explicit
// null check) already does the right thing: treat it exactly like "this read failed", not like "the
// pool is smaller than it really is." An honest empty/retry beats a confidently wrong smaller number.
async function fetchPageWithRetry(env, pathAndQuery, offset, pageSize, retries = 2, withCount = false) {
  for (let attempt = 0; ; attempt++) {
    try {
      const headers = {
        apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`,
        "Range-Unit": "items", Range: `${offset}-${offset + pageSize - 1}`
      };
      if (withCount) headers.Prefer = "count=exact";
      const res = await fetch(`${env.supabaseUrl}/rest/v1/${pathAndQuery}`, { headers });
      if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`);
      const rows = await res.json();
      if (!Array.isArray(rows)) throw new Error("non-array response");
      let total = null;
      if (withCount) {
        const m = /\/(\d+)$/.exec(res.headers.get("content-range") || "");
        total = m ? Number(m[1]) : null;
      }
      return { rows, total };
    } catch (e) {
      if (attempt >= retries) throw e;
      await new Promise(r => setTimeout(r, 200 * (attempt + 1)));
    }
  }
}
// PAGE_CONCURRENCY (Oct 2026, bare-nameplate perf job): matches the ENGINE_SLOTS throttle already
// used elsewhere in this codebase (lib/live/search.js) for the same reason - bounded concurrency,
// not unbounded, since this session separately found parallel crossProductCheck BATCHES (many full
// engine runs, each issuing many queries) saturate Supabase's connection pool under load. A handful
// of page-fetches for ONE query is a much smaller concurrent footprint than that; 6 is a measured,
// conservative starting point, not a guess carried over from the batch finding.
const PAGE_CONCURRENCY = 6;
export async function supabaseSelectAll(env, pathAndQuery, pageSize = 1000) {
  if (!env) return null;
  try {
    // The FIRST page asks for the exact total via Prefer: count=exact (one extra response header,
    // zero extra round trip - PostgREST returns it alongside the normal Range-paged rows). Knowing
    // the total up front means every remaining page's offset is known before any of them are
    // fetched, so they can run CONCURRENTLY instead of one-at-a-time. This is the only change here:
    // the same rows come back, just fetched with fewer sequential round trips. A page failure still
    // fails the WHOLE read after retries (never a partial result) - the Oct 2026 Targa-4 fix's
    // null-on-any-failure contract is unchanged for every code path below.
    const first = await fetchPageWithRetry(env, pathAndQuery, 0, pageSize, 2, true);
    const all = first.rows.slice();
    if (first.total == null) {
      // Count header missing/unsupported (defensive - should not happen on this Supabase project,
      // but never assume): fall back to the exact prior sequential walk, byte-identical to before
      // this change existed.
      if (first.rows.length === pageSize) {
        let offset = pageSize;
        for (;;) {
          const { rows } = await fetchPageWithRetry(env, pathAndQuery, offset, pageSize);
          all.push(...rows);
          if (rows.length < pageSize) break;
          offset += pageSize;
          if (offset > 200000) break;
        }
      }
      return all;
    }
    if (first.total <= pageSize) return all;   // one page was everything - identical to before
    const offsets = [];
    for (let off = pageSize; off < Math.min(first.total, 200000); off += pageSize) offsets.push(off);
    for (let i = 0; i < offsets.length; i += PAGE_CONCURRENCY) {
      const batch = offsets.slice(i, i + PAGE_CONCURRENCY);
      const results = await Promise.all(batch.map(off => fetchPageWithRetry(env, pathAndQuery, off, pageSize)));
      for (const r of results) all.push(...r.rows);
    }
    return all;
  } catch {
    return null;
  }
}

// Verifies a read actually got everything: compares the rows a caller already fetched against
// PostgREST's own exact count for the SAME filter (Prefer: count=exact on a 1-row request, cheap -
// it is the count that costs, not the row). Never silently trusts "the page came back shorter than
// the page size" the way a bounded ad-hoc loop does; logs loudly (so a truncated pool is visible in
// the deploy/ops logs, not a silent wrong number) and returns the exact total. Returns null (never
// treated as "0 rows truncated") when the count request itself fails, so a network blip never flags
// a correct read as truncated. pathAndQuery must NOT include limit= or offset= (same contract as
// supabaseSelectAll) - this appends its own `&limit=1`.
export async function verifyExactCount(env, pathAndQuery, gotLength, label) {
  if (!env) return null;
  try {
    const res = await fetch(`${env.supabaseUrl}/rest/v1/${pathAndQuery}&limit=1`, {
      headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, Prefer: "count=exact" }
    });
    const m = /\/(\d+)$/.exec(res.headers.get("content-range") || "");
    const exact = m == null ? null : Number(m[1]);
    if (exact != null && exact > gotLength) {
      console.error(`::error::${label || "supabase read"} truncated: got ${gotLength} rows, exact count is ${exact}`);
    }
    return exact;
  } catch {
    return null;
  }
}

export async function supabaseInsert(table, rows, supabaseUrl, supabaseKey, prefer = "return=minimal", query = "") {
  if (!supabaseUrl || !supabaseKey || !rows.length) return { skipped: true, rows: [] };
  const res = await fetch(`${supabaseUrl}/rest/v1/${table}${query}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      Prefer: prefer
    },
    body: JSON.stringify(rows)
  });
  if (!res.ok) {
    const text = await res.text();
    return { error: `${table} insert failed: ${res.status} ${text}` };
  }
  const text = await res.text();
  const returnedRows = text ? JSON.parse(text) : [];
  return { ok: true, rows: returnedRows };
}

// DELETE helper: removes rows matching pathAndQuery's filters. Returns { ok } or { error }.
// Service-role only. pathAndQuery must carry its own filter (a bare table name with no filter would
// delete every row) - PostgREST itself rejects an unfiltered DELETE with no further guard needed.
export async function supabaseDelete(env, pathAndQuery) {
  if (!env) return { error: "no supabase env" };
  try {
    const res = await fetch(`${env.supabaseUrl}/rest/v1/${pathAndQuery}`, {
      method: "DELETE",
      headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, Prefer: "return=minimal" }
    });
    if (!res.ok) return { error: `delete failed: ${res.status} ${(await res.text()).slice(0, 200)}` };
    return { ok: true };
  } catch (e) { return { error: String(e && e.message || e) }; }
}

// PATCH helper: update rows matching pathAndQuery's filters with one body. Returns
// { ok } or { error }. Service-role only.
export async function supabasePatch(env, pathAndQuery, body, prefer = "return=minimal") {
  if (!env) return { error: "no supabase env" };
  try {
    const res = await fetch(`${env.supabaseUrl}/rest/v1/${pathAndQuery}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, Prefer: prefer },
      body: JSON.stringify(body)
    });
    if (!res.ok) return { error: `patch failed: ${res.status} ${(await res.text()).slice(0, 200)}` };
    return { ok: true };
  } catch (e) { return { error: String(e && e.message || e) }; }
}
