// Sam Desk — the dictionary review-queue writer (spec s3 "learning loop", s4).
// =====================================================================
// The ONLY place the product logs an unresolved phrase for Sam to review. The model never
// writes to the dictionary; it feeds this queue. Backed by the desk_queue_log Postgres
// function (docs/supabase-desk-dictionary-queue.sql), which is atomic log-or-increment.
//
// Tenant isolation (neutrality rule 3): every row carries the org_id; a null/blank org
// becomes 'global'. Never throws into the request path: a queue write must never break an
// answer, so failures are swallowed after logging.
// =====================================================================

import { supabaseEnv } from "../_supabase.js";

// Normalize the same way the SQL function does, so the JS-side dedupe key matches the row.
export function normalizePhrase(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

// Log ONE unresolved phrase. Returns { ok, row } | { ok:false, error }. Never throws.
export async function logUnresolvedPhrase(env, { phrase, question = null, orgId = "global" } = {}) {
  const norm = normalizePhrase(phrase);
  if (!norm) return { ok: false, error: "empty phrase" };
  const e = env || supabaseEnv();
  if (!e || !e.supabaseUrl || !e.supabaseKey) return { ok: false, error: "no supabase env" };
  try {
    const res = await fetch(`${e.supabaseUrl}/rest/v1/rpc/desk_queue_log`, {
      method: "POST",
      headers: { apikey: e.supabaseKey, Authorization: `Bearer ${e.supabaseKey}`, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ p_phrase: norm, p_question: question, p_org: orgId || "global" })
    });
    if (!res.ok) { const body = await res.text().catch(() => ""); return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 160)}` }; }
    const row = await res.json().catch(() => null);
    return { ok: true, row: Array.isArray(row) ? row[0] : row };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
}

// Convenience: log all unresolved phrases from a validator result. Best-effort, never throws.
export async function logUnresolvedFromValidation(env, validation, { question = null, orgId = "global" } = {}) {
  const out = [];
  for (const p of (validation && validation.unresolved) || []) {
    out.push(await logUnresolvedPhrase(env, { phrase: p, question, orgId }));
  }
  return out;
}
