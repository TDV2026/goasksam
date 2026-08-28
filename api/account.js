// Phase 3 / 2A: account bootstrap ("ensure"). The client calls this after a
// successful sign-in (either door). It validates the token, upserts the account
// row (default tier 'free'), and stores the marketing-consent choice captured at
// the sign-in card. Returns the account's public state. Beehiiv tiering (2B) and
// result-claiming (2C) attach to this same endpoint later.
import { validateBearer } from "../lib/_auth.js";
import { supabaseEnv, supabaseSelect, supabaseInsert } from "../lib/_supabase.js";
import { beehiivTier } from "../lib/_beehiiv.js";

// How stale a tier check may be before we re-check on ensure. Moves into
// app_config with the other operational dials in 2C; a constant for now.
const TIER_RECHECK_DAYS = 7;
function tierIsStale(checkedAt) {
  if (!checkedAt) return true;
  const t = new Date(checkedAt).getTime();
  if (!Number.isFinite(t)) return true;
  return (Date.now() - t) > TIER_RECHECK_DAYS * 24 * 60 * 60 * 1000;
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

async function supabaseRpc(fn, args, url, key) {
  try {
    const r = await fetch(`${url}/rest/v1/rpc/${fn}`, {
      method: "POST", headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify(args)
    });
    if (!r.ok) return null;
    const t = await r.text(); return t ? JSON.parse(t) : null;
  } catch { return null; }
}
// 11a: attach a pending anonymous result to this account. Never re-runs; a no-op
// when the id is missing, expired, or already claimed.
async function claimResultIfAny(req, env, userId) {
  const id = req.body && typeof req.body.claimResultId === "string" ? req.body.claimResultId : null;
  if (!id) return undefined;
  try {
    const r = await supabaseRpc("claim_result", { p_result_id: id, p_user_id: userId }, env.supabaseUrl, env.supabaseKey);
    return r === true || (Array.isArray(r) && r[0] === true);
  } catch { return false; }
}
async function funnel(env, event, fields) {
  try {
    await supabaseInsert("funnel_events", [{
      event, anon_session_id: fields.anon_session_id || null, user_id: fields.user_id || null, dedup_key: fields.dedup_key || null
    }], env.supabaseUrl, env.supabaseKey, "resolution=ignore-duplicates,return=minimal", fields.dedup_key ? "?on_conflict=event,dedup_key" : "");
  } catch {}
}

async function appConfigInt(env, key, fallback) {
  try {
    const rows = await supabaseSelect(env, `app_config?key=eq.${encodeURIComponent(key)}&select=value&limit=1`);
    const n = Number(rows && rows[0] && rows[0].value);
    return Number.isFinite(n) ? n : fallback;
  } catch { return fallback; }
}
// Spec E: a slim summary of a saved result for the "Your results" surface. The
// saved payload is the full sellerDecision response; we surface only the car and
// the pick. The stored result is never mutated or re-run - "Run it fresh" starts
// a new (quota-consuming) search.
function savedSummary(payload) {
  const v = (payload && payload.vehicle) || {};
  const car = [v.year, v.make, v.model].filter(Boolean).join(" ") || v.label || "your car";
  const pick = (payload && (payload.decision?.recommendedPath || payload.recommendedPath
    || payload.routeFacts?.pick?.platformSlug || payload.routeFacts?.pick?.name)) || null;
  // Partner where one was actually shown (eligible or the $50k+ secondary), for the
  // "platform plus partner" list line. Frozen from the saved payload, never re-checked.
  const pr = payload && payload.decision && payload.decision.partnerReferral;
  const partner = (pr && (pr.eligible || pr.secondary) && pr.partner)
    ? (pr.partner.displayName || pr.partner.name || null) : null;
  return { car, pick, partner };
}
async function handleSavedResults(req, res, env, auth) {
  const staleDays = await appConfigInt(env, "saved_result_stale_days", 14);
  const rows = await supabaseSelect(env,
    `saved_results?user_id=eq.${auth.userId}&select=id,created_at,payload&order=created_at.desc&limit=50`);
  const now = Date.now();
  const results = (rows || []).map(r => {
    const s = savedSummary(r.payload || {});
    const ageDays = (now - new Date(r.created_at).getTime()) / 864e5;
    return { id: r.id, createdAt: r.created_at, stale: ageDays > staleDays, car: s.car, pick: s.pick, partner: s.partner };
  });
  return res.status(200).json({ status: "ok", staleDays, results });
}

// Single saved result by id, OWNER-CHECKED (user_id filter in the query), returning the
// full frozen payload for re-render. Viewing only - never re-runs or mutates anything.
async function handleSavedResult(req, res, env, auth) {
  const id = String((req.body && req.body.id) || "").trim();
  if (!id) return res.status(400).json({ error: "id required" });
  const rows = await supabaseSelect(env,
    `saved_results?id=eq.${encodeURIComponent(id)}&user_id=eq.${auth.userId}&select=id,created_at,payload&limit=1`);
  const row = rows && rows[0];
  if (!row) return res.status(404).json({ status: "not_found" });
  return res.status(200).json({ status: "ok", id: row.id, createdAt: row.created_at, payload: row.payload });
}

function publicAccount(row) {
  return {
    status: "ok",
    email: row.email,
    tier: row.tier || "free",
    tierCheckedAt: row.tier_checked_at || null,   // null => Beehiiv check unknown/failed; set => a definite answer
    bonusSearches: row.bonus_searches || 0,
    marketingConsent: !!row.marketing_consent
  };
}

// ms that `timeZone` is ahead of UTC at `date` (handles DST).
function tzOffsetMs(date, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit"
  });
  const m = {};
  for (const p of dtf.formatToParts(date)) m[p.type] = p.value;
  const asUTC = Date.UTC(+m.year, +m.month - 1, +m.day, +m.hour, +m.minute, +m.second);
  return asUTC - date.getTime();
}
// Start-of-day in `timeZone` as a UTC ISO string. Matches the reserve_search RPC,
// which day-truncates in app_config.day_timezone (default America/New_York), so the
// upfront count and the reserving count share one day boundary.
function dayStartIsoInTz(timeZone) {
  const now = new Date();
  const off = tzOffsetMs(now, timeZone);
  const wall = new Date(now.getTime() + off);
  const wallMidnight = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate(), 0, 0, 0);
  return new Date(wallMidnight - off).toISOString();
}
// Read-only view of the signed-in user's daily search allowance. Never reserves.
// { dailyLimit, dailyUsed, dailyRemaining } - a null limit means no daily cap
// (unlimited, e.g. crew), and dailyRemaining is then null. Best-effort: any failure
// returns nulls so the account bootstrap never breaks over a quota read.
async function dailyQuota(env, userId, tier) {
  const nulls = { dailyLimit: null, dailyUsed: 0, dailyRemaining: null };
  try {
    const rl = await supabaseSelect(env, `rate_limits?tier=eq.${encodeURIComponent(tier)}&select=daily_searches&limit=1`);
    const dl = rl && rl[0] && rl[0].daily_searches;
    const dailyLimit = (dl === null || dl === undefined) ? null : Number(dl);
    if (dailyLimit === null || !Number.isFinite(dailyLimit)) return nulls;
    let tz = "America/New_York";
    try {
      const cfg = await supabaseSelect(env, `app_config?key=eq.day_timezone&select=value&limit=1`);
      const v = cfg && cfg[0] && cfg[0].value;
      if (typeof v === "string" && v) tz = v.replace(/^"|"$/g, "");
    } catch {}
    const dayStart = dayStartIsoInTz(tz);
    const rows = await supabaseSelect(env, `search_events?user_id=eq.${userId}&created_at=gte.${encodeURIComponent(dayStart)}&select=id`);
    const dailyUsed = Array.isArray(rows) ? rows.length : 0;
    return { dailyLimit, dailyUsed, dailyRemaining: Math.max(0, dailyLimit - dailyUsed) };
  } catch { return nulls; }
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }

  const auth = await validateBearer(req.headers.authorization);
  if (!auth) { res.status(401).json({ status: "auth_required" }); return; }

  const env = supabaseEnv();
  if (!env) { res.status(500).json({ error: "storage not configured" }); return; }

  // Spec E: "Your results" read. Returns the signed-in user's saved results with
  // a per-result stale flag (age > saved_result_stale_days, default 14).
  if (req.body && req.body.action === "savedResults") {
    try { return await handleSavedResults(req, res, env, auth); }
    catch (err) { return res.status(500).json({ error: err.message }); }
  }
  if (req.body && req.body.action === "savedResult") {
    try { return await handleSavedResult(req, res, env, auth); }
    catch (err) { return res.status(500).json({ error: err.message }); }
  }

  // Consent is only meaningful when the client explicitly sends it (captured at
  // the sign-in card, applied once the account exists per 11d). Absent => leave
  // whatever is stored; never silently flip an existing opt-in back off.
  const consent = req.body && typeof req.body.marketingConsent === "boolean" ? req.body.marketingConsent : undefined;

  try {
    const existing = await supabaseSelect(env,
      `accounts?user_id=eq.${auth.userId}&select=user_id,email,tier,bonus_searches,marketing_consent,tier_checked_at,created_at&limit=1`);
    const row = existing && existing[0];

    if (!row) {
      // New account: check Beehiiv (2B). null => unknown, stay 'free' and leave
      // tier_checked_at null so a later ensure retries. Never blocks signup.
      const checked = await beehiivTier(auth.email);
      const insert = await supabaseInsert("accounts", [{
        user_id: auth.userId,
        email: auth.email,
        tier: checked || "free",
        tier_checked_at: checked !== null ? new Date().toISOString() : null,
        marketing_consent: consent === true
      }], env.supabaseUrl, env.supabaseKey, "resolution=merge-duplicates,return=representation", "?on_conflict=user_id");
      const created = (insert.rows && insert.rows[0]) ||
        { email: auth.email, tier: checked || "free", bonus_searches: 0, marketing_consent: consent === true };
      await funnel(env, "signup_completed", { user_id: auth.userId, dedup_key: `signup:${auth.userId}` });
      const claimedNew = await claimResultIfAny(req, env, auth.userId);
      const respNew = publicAccount(created); if (claimedNew !== undefined) respNew.claimed = claimedNew;
      respNew.daily = await dailyQuota(env, auth.userId, respNew.tier);
      res.status(200).json(respNew);
      return;
    }

    // Existing account: re-check the tier only when new or gone stale. A null
    // result (unknown) leaves the stored tier and timestamp untouched (retry
    // later); a definite result updates both.
    let dirty = false;
    const forceRecheck = !!(req.body && req.body.recheckTier === true);
    if (forceRecheck || tierIsStale(row.tier_checked_at)) {
      const checked = await beehiivTier(auth.email);
      if (checked !== null) { row.tier = checked; row.tier_checked_at = new Date().toISOString(); dirty = true; }
    }
    // Consent is applied when explicitly provided (11d), folded into the same write.
    if (consent !== undefined && consent !== row.marketing_consent) { row.marketing_consent = consent; dirty = true; }
    // Only write when something actually changed - not on every ensure.
    if (dirty) {
      await supabaseInsert("accounts", [{
        user_id: auth.userId, email: auth.email, tier: row.tier,
        bonus_searches: row.bonus_searches, marketing_consent: row.marketing_consent,
        tier_checked_at: row.tier_checked_at, created_at: row.created_at
      }], env.supabaseUrl, env.supabaseKey, "resolution=merge-duplicates,return=representation", "?on_conflict=user_id");
    }
    const claimed = await claimResultIfAny(req, env, auth.userId);
    const resp = publicAccount(row); if (claimed !== undefined) resp.claimed = claimed;
    resp.daily = await dailyQuota(env, auth.userId, resp.tier);
    res.status(200).json(resp);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
