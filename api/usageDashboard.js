// Consolidated admin dashboard. One key-gated GET function serves three views
// (?view=usage default, accounts, outbound) so the app stays under the 12-function
// deploy cap; all three share USAGE_DASHBOARD_KEY. (Merged from api/adminAccounts.js
// and api/outboundClicks.js, July 2026.)
import { supabaseEnv, supabaseSelect } from "../lib/_supabase.js";

function adminEsc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
const adminDayKey = ts => new Date(ts).toISOString().slice(0, 10);
const FUNNEL_STEPS = ["homepage_view", "wizard_start", "wizard_complete", "rec_shown", "signup_shown", "signup_completed", "second_search_attempt", "limit_hit", "hunt_submitted"];

// ?view=accounts : accounts by day/tier, searches this month/today, hunts, funnel.
async function renderAccountsView(req, res) {
  const env = supabaseEnv();
  if (!env) return res.status(500).json({ error: "storage not configured" });
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
  const accts = accounts || [];
  const byTier = {}, byDay = {};
  for (const a of accts) { byTier[a.tier || "free"] = (byTier[a.tier || "free"] || 0) + 1; const d = adminDayKey(a.created_at); byDay[d] = (byDay[d] || 0) + 1; }
  const acctDays = Object.keys(byDay).sort().slice(-14).map(d => ({ day: d, count: byDay[d] }));
  const limits = {}; for (const r of (rateLimits || [])) limits[r.tier] = r.monthly_searches;
  const usedByUser = {}; let searchesToday = 0;
  for (const s of (searchesMonth || [])) { usedByUser[s.user_id] = (usedByUser[s.user_id] || 0) + 1; if (s.created_at >= todayIso) searchesToday++; }
  const huntsAll = hunts || [];
  const huntsToday = huntsAll.filter(h => h.created_at >= todayIso).length;
  const hunts7 = huntsAll.filter(h => h.created_at >= sevenIso).length;
  const yStart = new Date(now - 2 * 864e5).toISOString().slice(0, 10);
  const f7 = {}, fy = {};
  for (const e of (funnel7 || [])) { f7[e.event] = (f7[e.event] || 0) + 1; if (adminDayKey(e.created_at) === yStart) fy[e.event] = (fy[e.event] || 0) + 1; }
  const data = {
    generatedAt: new Date().toISOString(),
    accounts: { total: accts.length, byTier, byDay: acctDays }, limits,
    searches: { thisMonth: (searchesMonth || []).length, today: searchesToday, activeAccountsThisMonth: Object.keys(usedByUser).length },
    hunts: { total: huntsAll.length, today: huntsToday, last7: hunts7 },
    funnel: FUNNEL_STEPS.map(step => ({ step, yesterday: fy[step] || 0, last7: f7[step] || 0 }))
  };
  if (req.query?.format === "json") return res.status(200).json(data);
  const tierRows = Object.entries(byTier).map(([t, n]) => `<tr><td>${adminEsc(t)}</td><td>${n}</td><td>${limits[t] != null ? adminEsc(limits[t]) + "/mo" : "-"}</td></tr>`).join("");
  const acctDayRows = acctDays.map(d => `<tr><td>${adminEsc(d.day)}</td><td>${d.count}</td></tr>`).join("");
  const funnelRows = data.funnel.map(f => `<tr><td>${adminEsc(f.step)}</td><td>${f.yesterday}</td><td>${f.last7}</td></tr>`).join("");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(`<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>GoAskSam Admin</title>
<style>body{font:14px/1.5 system-ui;margin:32px;color:#16140f;max-width:760px}h1{font-size:20px}h2{font-size:15px;margin-top:28px;color:#6b6861;text-transform:uppercase;letter-spacing:.05em}table{border-collapse:collapse;width:100%;margin-top:8px}td,th{border:1px solid #e3e1db;padding:6px 10px;text-align:left}th{background:#f6f5f2}.big{font-size:26px;font-weight:600}.grid{display:flex;gap:24px;flex-wrap:wrap}.card{border:1px solid #e3e1db;border-radius:10px;padding:14px 18px;min-width:150px}</style>
<h1>GoAskSam &mdash; Accounts &amp; Funnel</h1><div style="color:#6b6861">as of ${adminEsc(data.generatedAt)}</div>
<div class="grid" style="margin-top:16px">
  <div class="card"><div class="big">${accts.length}</div>accounts</div>
  <div class="card"><div class="big">${data.searches.thisMonth}</div>searches this month</div>
  <div class="card"><div class="big">${data.searches.today}</div>searches today</div>
  <div class="card"><div class="big">${data.hunts.total}</div>hunts (${data.hunts.today} today)</div>
</div>
<h2>Accounts by tier</h2><table><tr><th>Tier</th><th>Accounts</th><th>Limit</th></tr>${tierRows || "<tr><td colspan=3>none</td></tr>"}</table>
<h2>Accounts created (last 14 days)</h2><table><tr><th>Day</th><th>New accounts</th></tr>${acctDayRows || "<tr><td colspan=2>none</td></tr>"}</table>
<h2>Funnel (yesterday vs 7-day)</h2><table><tr><th>Step</th><th>Yesterday</th><th>7-day</th></tr>${funnelRows}</table>`);
}

// ?view=outbound : the outbound click log (was api/outboundClicks.js).
async function renderOutboundView(req, res) {
  const limit = Math.max(1, Math.min(1000, Number(req.query?.limit || 200)));
  const env = supabaseEnv();
  const rows = env
    ? await supabaseSelect(env, `outbound_clicks?select=created_at,year,make,model,trim,location,platform,card,outcome,reason,seller_preference,landed_rung&order=created_at.desc&limit=${limit}`)
    : null;
  if (req.query?.format === "json") { res.setHeader("Content-Type", "application/json"); return res.status(200).send(JSON.stringify(rows || [])); }
  const list = rows || [];
  const trs = list.map(r => `<tr><td>${adminEsc(r.created_at)}</td><td>${adminEsc(r.year)}</td><td>${adminEsc(r.make)}</td><td>${adminEsc(r.model)}</td><td>${adminEsc(r.trim)}</td><td>${adminEsc(r.location)}</td><td>${adminEsc(r.platform)}</td><td>${adminEsc(r.card)}</td><td>${adminEsc(r.outcome)}</td><td>${adminEsc(r.landed_rung)}</td><td>${adminEsc(r.reason)}</td><td>${adminEsc(r.seller_preference)}</td></tr>`).join("");
  const note = !env ? "Supabase env missing." : rows === null ? "outbound_clicks table not found yet." : `${list.length} rows.`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(`<!doctype html><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Outbound clicks</title><h3>Outbound clicks (newest first)</h3><table border="1" cellpadding="4" cellspacing="0"><tr><th>date</th><th>year</th><th>make</th><th>model</th><th>trim</th><th>location</th><th>platform</th><th>card</th><th>outcome</th><th>rung</th><th>reason</th><th>pref</th></tr>${trs}</table><p>${adminEsc(note)}</p>`);
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Admin-Key");
}

function asNumber(value) {
  return Number(value || 0);
}

function dayKey(dateString) {
  return new Date(dateString).toISOString().slice(0, 10);
}

function money(value) {
  return `$${asNumber(value).toFixed(2)}`;
}

function summarize(events) {
  const byDay = new Map();
  const totals = {
    events: events.length,
    sellerSearches: 0,
    chatCalls: 0,
    oldCarsDataRequests: 0,
    oldCarsDataCost1kUsd: 0,
    oldCarsDataCost10kUsd: 0,
    anthropicInputTokens: 0,
    anthropicOutputTokens: 0,
    anthropicCostUsd: 0
  };

  for (const event of events) {
    const key = dayKey(event.created_at);
    if (!byDay.has(key)) {
      byDay.set(key, {
        day: key,
        events: 0,
        sellerSearches: 0,
        chatCalls: 0,
        oldCarsDataRequests: 0,
        oldCarsDataCost1kUsd: 0,
        oldCarsDataCost10kUsd: 0,
        anthropicInputTokens: 0,
        anthropicOutputTokens: 0,
        anthropicCostUsd: 0
      });
    }
    const row = byDay.get(key);
    row.events++;
    if (event.event_type === "seller_decision") {
      row.sellerSearches++;
      totals.sellerSearches++;
    }
    if (event.event_type === "chat") {
      row.chatCalls++;
      totals.chatCalls++;
    }

    row.oldCarsDataRequests += asNumber(event.oldcarsdata_metered_requests);
    row.oldCarsDataCost1kUsd += asNumber(event.oldcarsdata_cost_1k_usd);
    row.oldCarsDataCost10kUsd += asNumber(event.oldcarsdata_cost_10k_usd);
    row.anthropicInputTokens += asNumber(event.anthropic_input_tokens);
    row.anthropicOutputTokens += asNumber(event.anthropic_output_tokens);
    row.anthropicCostUsd += asNumber(event.anthropic_cost_usd);

    totals.oldCarsDataRequests += asNumber(event.oldcarsdata_metered_requests);
    totals.oldCarsDataCost1kUsd += asNumber(event.oldcarsdata_cost_1k_usd);
    totals.oldCarsDataCost10kUsd += asNumber(event.oldcarsdata_cost_10k_usd);
    totals.anthropicInputTokens += asNumber(event.anthropic_input_tokens);
    totals.anthropicOutputTokens += asNumber(event.anthropic_output_tokens);
    totals.anthropicCostUsd += asNumber(event.anthropic_cost_usd);
  }

  return {
    totals,
    days: [...byDay.values()].sort((a, b) => b.day.localeCompare(a.day))
  };
}

async function fetchUsageEvents(supabaseUrl, supabaseKey, days) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const fields = [
    "created_at",
    "event_type",
    "route",
    "status",
    "search_text",
    "vehicle",
    "oldcarsdata_metered_requests",
    "oldcarsdata_cost_1k_usd",
    "oldcarsdata_cost_10k_usd",
    "anthropic_model",
    "anthropic_input_tokens",
    "anthropic_output_tokens",
    "anthropic_cost_usd",
    "duration_ms",
    "metadata"
  ].join(",");
  const url = `${supabaseUrl}/rest/v1/app_usage_events?created_at=gte.${encodeURIComponent(since)}&select=${fields}&order=created_at.desc&limit=1000`;
  const res = await fetch(url, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`
    }
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }
  if (!res.ok) throw new Error(data?.message || `Usage query failed: ${res.status}`);
  return Array.isArray(data) ? data : [];
}

function renderHtml({ summary, events, days }) {
  const rows = summary.days.map(day => `
    <tr>
      <td>${day.day}</td>
      <td>${day.sellerSearches}</td>
      <td>${day.chatCalls}</td>
      <td>${day.oldCarsDataRequests}</td>
      <td>${money(day.oldCarsDataCost1kUsd)}</td>
      <td>${money(day.oldCarsDataCost10kUsd)}</td>
      <td>${day.anthropicInputTokens.toLocaleString()} / ${day.anthropicOutputTokens.toLocaleString()}</td>
      <td>${money(day.anthropicCostUsd)}</td>
    </tr>
  `).join("");

  const recent = events.slice(0, 50).map(event => `
    <tr>
      <td>${new Date(event.created_at).toLocaleString()}</td>
      <td>${event.event_type || ""}</td>
      <td>${event.status || ""}</td>
      <td>${event.search_text || event.vehicle?.label || ""}</td>
      <td>${event.oldcarsdata_metered_requests || 0}</td>
      <td>${event.anthropic_input_tokens || 0} / ${event.anthropic_output_tokens || 0}</td>
      <td>${event.duration_ms || 0}ms</td>
    </tr>
  `).join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>GoAskSam Usage</title>
  <style>
    body{font-family:Arial,sans-serif;margin:32px;color:#171717;background:#fafafa}
    h1{font-size:28px;margin:0 0 8px}
    .muted{color:#666}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:24px 0}
    .card{background:white;border:1px solid #ddd;border-radius:8px;padding:16px}
    .value{font-size:26px;font-weight:700;margin-top:8px}
    table{width:100%;border-collapse:collapse;background:white;border:1px solid #ddd;margin:18px 0 32px}
    th,td{text-align:left;border-bottom:1px solid #eee;padding:10px;font-size:14px;vertical-align:top}
    th{color:#666;text-transform:uppercase;font-size:12px;background:#f5f5f5}
  </style>
</head>
<body>
  <h1>GoAskSam Usage</h1>
  <div class="muted">Last ${days} days. OldCarsData cost shows both current 1K pricing and 10K pricing.</div>
  <div class="grid">
    <div class="card"><div class="muted">Seller searches</div><div class="value">${summary.totals.sellerSearches}</div></div>
    <div class="card"><div class="muted">Claude chat calls</div><div class="value">${summary.totals.chatCalls}</div></div>
    <div class="card"><div class="muted">OldCarsData requests</div><div class="value">${summary.totals.oldCarsDataRequests}</div></div>
    <div class="card"><div class="muted">OldCarsData cost, 1K plan</div><div class="value">${money(summary.totals.oldCarsDataCost1kUsd)}</div></div>
    <div class="card"><div class="muted">OldCarsData cost, 10K plan</div><div class="value">${money(summary.totals.oldCarsDataCost10kUsd)}</div></div>
    <div class="card"><div class="muted">Claude cost</div><div class="value">${money(summary.totals.anthropicCostUsd)}</div></div>
  </div>
  <h2>Daily</h2>
  <table>
    <thead><tr><th>Day</th><th>Seller</th><th>Chat</th><th>OCD Req</th><th>OCD 1K</th><th>OCD 10K</th><th>Claude tokens in/out</th><th>Claude</th></tr></thead>
    <tbody>${rows || "<tr><td colspan='8'>No usage events yet.</td></tr>"}</tbody>
  </table>
  <h2>Recent Events</h2>
  <table>
    <thead><tr><th>Time</th><th>Type</th><th>Status</th><th>Search</th><th>OCD Req</th><th>Claude in/out</th><th>Duration</th></tr></thead>
    <tbody>${recent || "<tr><td colspan='7'>No usage events yet.</td></tr>"}</tbody>
  </table>
</body>
</html>`;
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const configuredKey = process.env.USAGE_DASHBOARD_KEY || process.env.ADMIN_DASHBOARD_KEY;
  const providedKey = req.headers["x-admin-key"] || req.query?.key;
  if (!configuredKey) return res.status(500).json({ error: "Set USAGE_DASHBOARD_KEY in Vercel before using this dashboard." });
  if (providedKey !== configuredKey) return res.status(401).json({ error: "Unauthorized" });

  // View dispatch (consolidated admin function): accounts + funnel (2G), outbound
  // clicks, or the default usage view.
  try {
    if (req.query?.view === "accounts") return await renderAccountsView(req, res);
    if (req.query?.view === "outbound") return await renderOutboundView(req, res);
  } catch (err) { return res.status(500).json({ error: err.message }); }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: "Supabase not configured" });

  try {
    const days = Math.max(1, Math.min(30, Number(req.query?.days || 7)));
    const events = await fetchUsageEvents(supabaseUrl, supabaseKey, days);
    const summary = summarize(events);
    if (req.query?.format === "json") {
      return res.status(200).json({ days, summary, events: events.slice(0, 100) });
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(renderHtml({ summary, events, days }));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
