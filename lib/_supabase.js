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
// Null only when the FIRST page errors (caller falls back); a mid-walk error returns what was read.
export async function supabaseSelectAll(env, pathAndQuery, pageSize = 1000) {
  if (!env) return null;
  const all = [];
  let offset = 0;
  try {
    for (;;) {
      const res = await fetch(`${env.supabaseUrl}/rest/v1/${pathAndQuery}`, {
        headers: {
          apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`,
          "Range-Unit": "items", Range: `${offset}-${offset + pageSize - 1}`
        }
      });
      if (!res.ok && res.status !== 206) return offset === 0 ? null : all;
      const rows = await res.json();
      if (!Array.isArray(rows)) return offset === 0 ? null : all;
      all.push(...rows);
      if (rows.length < pageSize) break;            // last page
      offset += pageSize;
      if (offset > 200000) break;                   // safety ceiling; no model_family pool is this large
    }
    return all;
  } catch {
    return offset === 0 ? null : all;
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
