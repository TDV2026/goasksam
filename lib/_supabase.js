// Shared Supabase REST (PostgREST) helpers. Server-side only: callers pass
// the service-role key via env; never expose it in browser code.

export function supabaseEnv(options = {}) {
  const supabaseUrl = options.supabaseUrl || process.env.SUPABASE_URL;
  const supabaseKey = options.supabaseKey || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return null;
  return { supabaseUrl, supabaseKey };
}

// Read helper: null on any failure so callers fall back gracefully.
// DATA PULLED (Sam, Oct 16 2026, launch cost): bytes of every PostgREST response body this process has read, so one
// request's pull is the counter's difference around it (measured one search at a time on a quiet archive). An
// approximation of Supabase egress (the JSON body; headers and compression not counted).
let bytesSoFar = 0;
export function supabaseBytesSoFar() { return bytesSoFar; }
// HARD PER-READ TIMEOUT (e60, Sam's incident decision, Oct 18 2026): every PostgREST call from this module aborts
// after SUPABASE_FETCH_MS (8 s). Before this no call carried a signal, so one stalled connection (pool contention on a
// cold instance) held a function to Vercel's 60 s kill with nothing logged. An aborted read is a failed read (null,
// or a retried page in supabaseSelectAll), never a hang; the caller's own deadline then answers honestly.
export const SUPABASE_FETCH_MS = Math.max(1000, Number(process.env.SUPABASE_FETCH_MS) || 8000);
import { callerNow } from "./_caller.js";
import { noteReadKind } from "./_readScope.js";
// Why a failed read failed (lib/_readScope.js noteReadKind): the request-level retries use it.
export function failureKind(e) {
  if (e && (e.reason === "timeout" || e.name === "AbortError")) return "timeout";
  const m = String((e && e.message) || e);
  if (/^HTTP (429|502|503)$/.test(m) || e instanceof TypeError || /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket|network/i.test(m)) return "blip";
  return "error";
}
// CALLER ATTRIBUTION (lane-b-archiveread step e, lib/_caller.js): on a read of sales_archive the select list gets one constant alias, "via_<caller>:id", so
// Query Performance (pg_stat_statements) lists the same query once per caller; the alias is stripped from the rows below. Untagged reads are unchanged.
export function tagQuery(pathAndQuery) {
  const c = callerNow();
  if (!c || !/^sales_archive\?/.test(String(pathAndQuery)) || !/[?&]select=/.test(String(pathAndQuery))) return { q: pathAndQuery, alias: null };
  const alias = "via_" + c;
  return { q: String(pathAndQuery).replace(/([?&]select=)([^&]*)/, (m, a, b) => `${a}${b},${alias}:id`), alias };
}
export function stripAlias(rows, alias) {
  if (alias && Array.isArray(rows)) for (const r of rows) if (r && typeof r === "object") delete r[alias];
  return rows;
}
export async function supabaseFetch(url, init = {}, ms = SUPABASE_FETCH_MS) {
  { const c = callerNow(); if (c) init = { ...init, headers: { ...(init.headers || {}), "User-Agent": "goasksam/" + c } }; }
  const ctrl = new AbortController();
  const t = setTimeout(() => { try { ctrl.abort(); } catch { /* already settled */ } }, ms);
  // An outside signal (the pager's stop signal) aborts this call as well; the call's own signal is the one fetch gets.
  const outside = init.signal;
  const onOutside = () => { try { ctrl.abort(); } catch { /* already settled */ } };
  if (outside) { if (outside.aborted) onOutside(); else outside.addEventListener("abort", onOutside, { once: true }); }
  try { return await fetch(url, { ...init, signal: ctrl.signal }); } finally { clearTimeout(t); if (outside) outside.removeEventListener("abort", onOutside); }
}
export async function supabaseSelect(env, pathAndQuery) {
  if (!env) return null;
  try {
    const tag = tagQuery(pathAndQuery); pathAndQuery = tag.q;
    const res = await supabaseFetch(`${env.supabaseUrl}/rest/v1/${pathAndQuery}`, {
      headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}` },
      signal: env.signal   // the request's signal (lane-b-archiveread step d): a caller that gave up stops the read
    });
    if (!res.ok) { const body = await res.text().catch(() => ""); noteReadKind(isTimeoutResponse(res.status, body) ? "timeout" : [429, 502, 503].includes(res.status) ? "blip" : "error"); return null; }
    const text = await res.text(); bytesSoFar += text.length; const rows = JSON.parse(text);
    return Array.isArray(rows) ? stripAlias(rows, tag.alias) : null;
  } catch (e) {
    noteReadKind(failureKind(e));
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
// NEVER RETRY A TIMEOUT (Lane B, Nov 2 2026, lane-b-archiveread step b). A page that hit the statement timeout (Postgres 57014, which PostgREST
// returns as HTTP 500 with that code; a gateway 408, 504 or 544 says the same) or that our own 8 s client abort cut is the SAME query that just
// cost 8 s of database CPU; sending it again twice more only triples the load that caused the timeout (the bursts of ~10 57014 in one second were
// 6 parallel pages x 3 attempts). Only a failure that says nothing about the query is retried: a dropped connection, a 429, a 502 or a 503.
// A timeout carries nonRetryable and reason "timeout"; supabaseSelectAll stops the whole read on the first one.
export function isTimeoutResponse(status, bodyText) {
  if (status === 408 || status === 504 || status === 544) return true;
  try { const j = JSON.parse(bodyText); return !!(j && String(j.code) === "57014"); } catch { return /statement timeout|57014/i.test(String(bodyText || "")); }
}
function timeoutError(why) { return Object.assign(new Error(`timeout: ${why}`), { nonRetryable: true, reason: "timeout" }); }
async function fetchPageWithRetry(env, pathAndQuery, offset, pageSize, retries = 2, withCount = false, signal = undefined) {
  const tag = tagQuery(pathAndQuery); pathAndQuery = tag.q;
  for (let attempt = 0; ; attempt++) {
    try {
      const headers = {
        apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`,
        "Range-Unit": "items", Range: `${offset}-${offset + pageSize - 1}`
      };
      if (withCount) headers.Prefer = "count=exact";
      const res = await supabaseFetch(`${env.supabaseUrl}/rest/v1/${pathAndQuery}`, { headers, signal });
      if (!res.ok && res.status !== 206) {
        const body = await res.text().catch(() => "");
        if (isTimeoutResponse(res.status, body)) throw timeoutError(`HTTP ${res.status}`);
        throw new Error(`HTTP ${res.status}`);
      }
      const text = await res.text(); bytesSoFar += text.length; const rows = JSON.parse(text);
      if (!Array.isArray(rows)) throw new Error("non-array response");
      stripAlias(rows, tag.alias);
      let total = null;
      if (withCount) {
        const m = /\/(\d+)$/.exec(res.headers.get("content-range") || "");
        total = m ? Number(m[1]) : null;
      }
      return { rows, total };
    } catch (e) {
      if (e && e.name === "AbortError" && !e.nonRetryable) throw timeoutError("client abort");   // our 8 s abort, or the pager stopping its siblings
      if ((e && e.nonRetryable) || (signal && signal.aborted)) throw e;
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
//
// LOWERED (Lane B, Nov 2 2026, lane-b-archiveread step c): 6 pages at once, times the model, title and chassis-alias legs running together, put up to ~18 archive
// queries in flight for ONE request, and a deep OFFSET page costs more than a shallow one, so a burst of requests filled the database's CPU (27.9% of all
// database time in one query shape, bursts of ~10 statement timeouts in a second). Now 2 pages at once by default (ARCHIVE_PAGE_CONCURRENCY, 1 to 6), and the
// engine reads its legs one after another (lib/onebox.js fetchQualifying), so one request holds at most 2 archive queries in flight. Same rows, same order.
export const PAGE_CONCURRENCY = Math.max(1, Math.min(6, Math.floor(Number(process.env.ARCHIVE_PAGE_CONCURRENCY)) || 2));
export async function supabaseSelectAll(env, pathAndQuery, pageSize = 1000) {
  if (!env) return null;
  const stop = new AbortController();   // the first timeout stops the pages still in flight (lane-b-archiveread step b)
  // FORWARD THE CALLER'S ABORT (lane-b-archiveread step d): env.signal is the request's own signal. A caller that gave up (a Find or Market Check deadline,
  // a closed request) aborts it, and every page in flight and every page not yet started stops, so a read nobody is waiting for does not keep running
  // (the Promise.race timeouts used to leave the whole 6-page read going). Whether the database also cancels the statement when the connection closes
  // is for pg_stat_activity to show (docs/archive-read-proposal.md 3.5); this closes the client side.
  if (env.signal) { if (env.signal.aborted) return null; env.signal.addEventListener("abort", () => stop.abort(), { once: true }); }
  try {
    // The FIRST page asks for the exact total via Prefer: count=exact (one extra response header,
    // zero extra round trip - PostgREST returns it alongside the normal Range-paged rows). Knowing
    // the total up front means every remaining page's offset is known before any of them are
    // fetched, so they can run CONCURRENTLY instead of one-at-a-time. This is the only change here:
    // the same rows come back, just fetched with fewer sequential round trips. A page failure still
    // fails the WHOLE read after retries (never a partial result) - the Oct 2026 Targa-4 fix's
    // null-on-any-failure contract is unchanged for every code path below.
    // NO COUNT (e59, Sam's egress job, Oct 16 2026): page 1 used to ask Prefer: count=exact so every later page's
    // offset was known up front. pg_stat_statements showed that count as a second full run of the trigram filter on
    // 148,000 pool reads (the pgrst_source_count CTE), and most pools are one page, where the count buys nothing.
    // Now page 1 is plain; a short page ends the read; a full page is followed by the next PAGE_CONCURRENCY pages
    // fetched together, in offset order, until a short page appears. Same rows, same order, 200k ceiling, and the
    // null-on-any-failure contract below is unchanged.
    const first = await fetchPageWithRetry(env, pathAndQuery, 0, pageSize, 2, false, stop.signal);
    const all = first.rows.slice();
    if (first.rows.length < pageSize) return all;
    let offset = pageSize;
    for (;;) {
      if (offset >= 200000) break;
      const offsets = [];
      for (let k = 0; k < PAGE_CONCURRENCY && offset + k * pageSize < 200000; k++) offsets.push(offset + k * pageSize);
      const results = await Promise.all(offsets.map(off => fetchPageWithRetry(env, pathAndQuery, off, pageSize, 2, false, stop.signal).catch(e => { if (e && e.reason === "timeout") stop.abort(); throw e; })));
      let short = false;
      for (const r of results) { all.push(...r.rows); if (r.rows.length < pageSize) { short = true; break; } }
      if (short) break;
      offset += offsets.length * pageSize;
    }
    return all;
  } catch (e) {
    stop.abort();   // a failed read leaves nothing running behind it
    noteReadKind(failureKind(e));
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
    const res = await supabaseFetch(`${env.supabaseUrl}/rest/v1/${pathAndQuery}&limit=1`, {
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
  const res = await supabaseFetch(`${supabaseUrl}/rest/v1/${table}${query}`, {
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
    const res = await supabaseFetch(`${env.supabaseUrl}/rest/v1/${pathAndQuery}`, {
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
    const res = await supabaseFetch(`${env.supabaseUrl}/rest/v1/${pathAndQuery}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, Prefer: prefer },
      body: JSON.stringify(body)
    });
    if (!res.ok) return { error: `patch failed: ${res.status} ${(await res.text()).slice(0, 200)}` };
    return { ok: true };
  } catch (e) { return { error: String(e && e.message || e) }; }
}
