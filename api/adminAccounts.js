// Phase 3 / 2G: accounts + funnel admin view. Same key auth as the other
// dashboards (USAGE_DASHBOARD_KEY via ?key= or X-Admin-Key). Read-only.
import { supabaseEnv, supabaseSelect } from "../lib/_supabase.js";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Admin-Key");
}
const dayKey = ts => new Date(ts).toISOString().slice(0, 10);
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

// The funnel step order for display.
const FUNNEL_STEPS = ["homepage_view", "wizard_start", "wizard_complete", "rec_shown", "signup_shown", "signup_completed", "second_search_attempt", "limit_hit", "hunt_submitted"];

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  const configuredKey = process.env.USAGE_DASHBOARD_KEY || process.env.ADMIN_DASHBOARD_KEY;
  const providedKey = req.headers["x-admin-key"] || req.query?.key;
  if (!configuredKey) return res.status(500).json({ error: "Set USAGE_DASHBOARD_KEY in Vercel before using this dashboard." });
  if (providedKey !== configuredKey) return res.status(401).json({ error: "Unauthorized" });

  const env = supabaseEnv();
  if (!env) return res.status(500).json({ error: "storage not configured" });

  try {
    const now = Date.now();
    const monthStartIso = new Date(new Date().toISOString().slice(0, 7) + "-01T00:00:00Z").toISOString();
    const sevenIso = new Date(now - 7 * 864e5).toISOString();
    const todayIso = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").toISOString();

    const [accounts, rateLimits, searchesMonth, hunts, funnel7] = await Promise.all([
      supabaseSelect(env, `accounts?select=tier,created_at&order=created_at.desc&limit=10000`),
      supabaseSelect(env, `rate_limits?select=tier,monthly_searches`),
      supabaseSelect(env, `search_events?created_at=gte.${monthStartIso}&select=user_id,created_at&limit=100000`),
      supabaseSelect(env, `hunts?select=id,created_at&order=created_at.desc&limit=10000`),
      supabaseSelect(env, `funnel_events?created_at=gte.${sevenIso}&select=event,created_at&limit=100000`)
    ]);

    // Accounts: totals, by tier, by day (last 14).
    const accts = accounts || [];
    const byTier = {}; const byDay = {};
    for (const a of accts) { byTier[a.tier || "free"] = (byTier[a.tier || "free"] || 0) + 1; const d = dayKey(a.created_at); byDay[d] = (byDay[d] || 0) + 1; }
    const acctDays = Object.keys(byDay).sort().slice(-14).map(d => ({ day: d, count: byDay[d] }));

    // Limits map + this month's searches per account (for "at/over limit" counts).
    const limits = {}; for (const r of (rateLimits || [])) limits[r.tier] = r.monthly_searches;
    const usedByUser = {}; let searchesToday = 0;
    for (const s of (searchesMonth || [])) { usedByUser[s.user_id] = (usedByUser[s.user_id] || 0) + 1; if (s.created_at >= todayIso) searchesToday++; }
    const searchesThisMonth = (searchesMonth || []).length;

    // Hunts.
    const huntsAll = hunts || [];
    const huntsToday = huntsAll.filter(h => h.created_at >= todayIso).length;
    const hunts7 = huntsAll.filter(h => h.created_at >= sevenIso).length;

    // Funnel: yesterday + 7-day counts per step.
    const yStart = new Date(now - 2 * 864e5).toISOString().slice(0, 10);
    const yEnd = new Date(now - 1 * 864e5).toISOString().slice(0, 10);
    const f7 = {}, fy = {};
    for (const e of (funnel7 || [])) { f7[e.event] = (f7[e.event] || 0) + 1; const d = dayKey(e.created_at); if (d === yStart) fy[e.event] = (fy[e.event] || 0) + 1; }

    const data = {
      generatedAt: new Date().toISOString(),
      accounts: { total: accts.length, byTier, byDay: acctDays },
      limits,
      searches: { thisMonth: searchesThisMonth, today: searchesToday, activeAccountsThisMonth: Object.keys(usedByUser).length },
      hunts: { total: huntsAll.length, today: huntsToday, last7: hunts7 },
      funnel: FUNNEL_STEPS.map(step => ({ step, yesterday: fy[step] || 0, last7: f7[step] || 0 }))
    };

    if (req.query?.format === "json") return res.status(200).json(data);

    // Minimal HTML view.
    const tierRows = Object.entries(byTier).map(([t, n]) => `<tr><td>${esc(t)}</td><td>${n}</td><td>${limits[t] != null ? esc(limits[t]) + "/mo" : "-"}</td></tr>`).join("");
    const acctDayRows = acctDays.map(d => `<tr><td>${esc(d.day)}</td><td>${d.count}</td></tr>`).join("");
    const funnelRows = data.funnel.map(f => `<tr><td>${esc(f.step)}</td><td>${f.yesterday}</td><td>${f.last7}</td></tr>`).join("");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(`<!doctype html><meta charset="utf-8"><title>GoAskSam Admin</title>
<style>body{font:14px/1.5 system-ui;margin:32px;color:#16140f;max-width:760px}h1{font-size:20px}h2{font-size:15px;margin-top:28px;color:#6b6861;text-transform:uppercase;letter-spacing:.05em}table{border-collapse:collapse;width:100%;margin-top:8px}td,th{border:1px solid #e3e1db;padding:6px 10px;text-align:left}th{background:#f6f5f2}.big{font-size:26px;font-weight:600}.grid{display:flex;gap:24px;flex-wrap:wrap}.card{border:1px solid #e3e1db;border-radius:10px;padding:14px 18px;min-width:150px}</style>
<h1>GoAskSam — Accounts & Funnel</h1><div style="color:#6b6861">as of ${esc(data.generatedAt)}</div>
<div class="grid" style="margin-top:16px">
  <div class="card"><div class="big">${accts.length}</div>accounts</div>
  <div class="card"><div class="big">${data.searches.thisMonth}</div>searches this month</div>
  <div class="card"><div class="big">${data.searches.today}</div>searches today</div>
  <div class="card"><div class="big">${data.hunts.total}</div>hunts (${data.hunts.today} today)</div>
</div>
<h2>Accounts by tier</h2><table><tr><th>Tier</th><th>Accounts</th><th>Limit</th></tr>${tierRows || "<tr><td colspan=3>none</td></tr>"}</table>
<h2>Accounts created (last 14 days)</h2><table><tr><th>Day</th><th>New accounts</th></tr>${acctDayRows || "<tr><td colspan=2>none</td></tr>"}</table>
<h2>Funnel (yesterday vs 7-day)</h2><table><tr><th>Step</th><th>Yesterday</th><th>7-day</th></tr>${funnelRows}</table>
`);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
