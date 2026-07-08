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
