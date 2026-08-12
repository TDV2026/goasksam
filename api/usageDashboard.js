// Consolidated admin dashboard. One key-gated GET function serves three views
// (?view=usage default, accounts, outbound) so the app stays under the 12-function
// deploy cap; all three share USAGE_DASHBOARD_KEY. (Merged from api/adminAccounts.js
// and api/outboundClicks.js, July 2026.)
import fs from "node:fs";
import { supabaseEnv, supabaseSelect, supabaseInsert } from "../lib/_supabase.js";
import { callOldCarsData } from "../lib/_ocd.js";
import { persistableMakeModel, recordPlatform, stableRecordId } from "../lib/_classify.js";
import { CURATED_GENERATIONS } from "../lib/generations.js";
import { recordUsageEvent } from "./_usage.js";
import { runDepthProbe, LAUNCH_SOURCES } from "../lib/ops/depthProbe.js";
import { runFillBatch } from "../lib/ops/fillLadder.js";

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
  // F item 4: today's searches by outcome (rich / thin / refused / unavailable).
  // rich = a real evidence read; refused = gate blocks (funnel); unavailable = the
  // data_unavailable event. Read from the same decision-event source as the views.
  const todayDecisions = await fetchDecisionEvents(env, 1, 100000);
  const outcomeToday = { rich: 0, thin: 0, unavailable: 0, refused: 0 };
  for (const e of todayDecisions) {
    if (e.created_at < todayIso) continue;
    const o = eventOutcome(e);
    if (o === "data_unavailable") outcomeToday.unavailable++;
    else if (o === "thin") outcomeToday.thin++;
    else outcomeToday.rich++;
  }
  for (const e of (funnel7 || [])) {
    if (e.created_at < todayIso) continue;
    if (["limit_hit", "daily_limit_hit", "account_required", "second_search_attempt"].includes(e.event)) outcomeToday.refused++;
  }
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
<h2>Today by outcome</h2>
<div class="grid">
  <div class="card"><div class="big">${outcomeToday.rich}</div>rich</div>
  <div class="card"><div class="big">${outcomeToday.thin}</div>thin</div>
  <div class="card"><div class="big">${outcomeToday.refused}</div>refused</div>
  <div class="card"><div class="big">${outcomeToday.unavailable}</div>unavailable</div>
</div>
<nav style="margin-top:12px"><a href="?view=searches&key=${adminEsc(req.query?.key || "")}">searches &rarr;</a> <a href="?view=cars&key=${adminEsc(req.query?.key || "")}">cars &rarr;</a> <a href="?view=geo&key=${adminEsc(req.query?.key || "")}">geo &rarr;</a></nav>
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

// ===================== F: decision-event views (searches / cars / geo) =====================
// Read-only, from the forward-only fields logged on seller_decision +
// data_unavailable events (entered location, tier, outcome, pick, PowerSeller).
// Crew searches are flagged and filterable everywhere (?crew=include|exclude|only).
// Entered location only is ever rendered - never a raw IP.
const OUTCOME_LABELS = { mode_a: "Mode A", mode_b: "Mode B", concentration: "Concentration", thin: "Thin", data_unavailable: "Unavailable" };
function crewMode(req) { const c = String(req.query?.crew || "include").toLowerCase(); return (c === "exclude" || c === "only") ? c : "include"; }
function applyCrew(events, mode) {
  if (mode === "exclude") return events.filter(e => (e.metadata?.tier) !== "crew");
  if (mode === "only") return events.filter(e => (e.metadata?.tier) === "crew");
  return events;
}
async function fetchDecisionEvents(env, days, limit = 100000) {
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const rows = await supabaseSelect(env, `app_usage_events?created_at=gte.${encodeURIComponent(since)}&event_type=in.(seller_decision,data_unavailable)&select=created_at,event_type,status,search_text,vehicle,metadata&order=created_at.desc&limit=${limit}`);
  return rows || [];
}
const carLabel = v => [v?.year, v?.make, v?.model].filter(Boolean).join(" ") || v?.label || "unknown";
const nameKey = v => [v?.make, v?.model].filter(Boolean).join(" ").toLowerCase() || "unknown";
const geoKey = m => [m?.enteredState, m?.enteredCountry].filter(Boolean).join(" / ") || "unknown";
function eventOutcome(e) { return (e.metadata?.outcome) || (e.event_type === "data_unavailable" ? "data_unavailable" : "thin"); }
function pageChrome(title, body) {
  return `<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${adminEsc(title)}</title>
<style>body{font:14px/1.5 system-ui;margin:28px;color:#16140f}h1{font-size:20px}h2{font-size:14px;text-transform:uppercase;letter-spacing:.05em;color:#6b6861;margin-top:26px}table{border-collapse:collapse;width:100%;margin-top:8px}td,th{border:1px solid #e3e1db;padding:5px 9px;text-align:left;font-size:13px}th{background:#f6f5f2}nav a{margin-right:14px;font-size:13px}.pill{font-size:11px;padding:1px 6px;border-radius:8px;background:#eee}.crew{background:#ffe8c2}</style>
<nav>${["searches", "cars", "geo", "accounts", "usage", "outbound"].map(v => `<a href="?view=${v}&key=${adminEsc((body.__key) || "")}">${v}</a>`).join("")}</nav>
<h1>${adminEsc(title)}</h1>${body.html}`;
}
// ?view=searches : last 100 decisions, one row each.
async function renderSearchesView(req, res) {
  const env = supabaseEnv(); if (!env) return res.status(500).json({ error: "storage not configured" });
  const days = Math.max(1, Math.min(30, Number(req.query?.days || 7)));
  const mode = crewMode(req);
  let events = applyCrew(await fetchDecisionEvents(env, days), mode).slice(0, 100);
  // best-effort outbound y/n: an outbound_click for the same car within 3h after.
  const sinceIso = new Date(Date.now() - days * 864e5).toISOString();
  const clicks = (await supabaseSelect(env, `outbound_clicks?created_at=gte.${sinceIso}&select=created_at,year,make,model&limit=100000`)) || [];
  const clickKey = c => `${(c.make || "").toLowerCase()}|${(c.model || "").toLowerCase()}`;
  const clickIndex = new Map();
  for (const c of clicks) { const k = clickKey(c); (clickIndex.get(k) || clickIndex.set(k, []).get(k)).push(new Date(c.created_at).getTime()); }
  const outboundFor = e => {
    const k = `${(e.vehicle?.make || "").toLowerCase()}|${(e.vehicle?.model || "").toLowerCase()}`;
    const t = new Date(e.created_at).getTime(); const arr = clickIndex.get(k) || [];
    return arr.some(ct => ct >= t && ct - t <= 3 * 3600 * 1000);
  };
  const rows = events.map(e => {
    const m = e.metadata || {}; const ps = m.powerSeller || {};
    const psCell = ps.shown ? `${adminEsc(ps.name || "yes")}${ps.eligible ? " (lead-eligible)" : ""}` : "-";
    return `<tr><td>${new Date(e.created_at).toLocaleString()}</td><td>${adminEsc(carLabel(e.vehicle))}</td><td>${adminEsc(geoKey(m))}</td>
    <td>${adminEsc(m.tier || "")}${m.tier === "crew" ? ' <span class="pill crew">crew</span>' : ""}</td>
    <td>${adminEsc(OUTCOME_LABELS[eventOutcome(e)] || eventOutcome(e))}</td><td>${adminEsc(m.pickPlatform || "-")}</td>
    <td>${psCell}</td><td>${outboundFor(e) ? "yes" : "-"}</td></tr>`;
  }).join("");
  if (req.query?.format === "json") return res.status(200).json({ days, crew: mode, count: events.length, searches: events.map(e => ({ at: e.created_at, car: carLabel(e.vehicle), location: geoKey(e.metadata), tier: e.metadata?.tier, outcome: eventOutcome(e), pick: e.metadata?.pickPlatform || null, powerSeller: e.metadata?.powerSeller || null, outbound: outboundFor(e) })) });
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(pageChrome("Searches", { __key: req.query?.key, html: `<div>last ${days}d, crew: ${mode} &middot; <a href="?view=searches&crew=exclude&key=${adminEsc(req.query?.key || "")}">exclude</a> <a href="?view=searches&crew=only&key=${adminEsc(req.query?.key || "")}">only</a> <a href="?view=searches&crew=include&key=${adminEsc(req.query?.key || "")}">all</a></div>
  <table><tr><th>Time</th><th>Car</th><th>Location</th><th>Tier</th><th>Outcome</th><th>Pick</th><th>PowerSeller</th><th>Outbound</th></tr>${rows || "<tr><td colspan=8>none</td></tr>"}</table>
  <p style="color:#6b6861">Outbound is best-effort (car+time match); a per-search intro/outbound join key is a follow-up.</p>` }));
}
// ?view=cars : top searched models, 7d and 30d.
async function renderCarsView(req, res) {
  const env = supabaseEnv(); if (!env) return res.status(500).json({ error: "storage not configured" });
  const mode = crewMode(req);
  const all = applyCrew(await fetchDecisionEvents(env, 30), mode);
  const cut7 = Date.now() - 7 * 864e5;
  const agg = new Map();
  for (const e of all) {
    const k = nameKey(e.vehicle); if (k === "unknown") continue;
    const a = agg.get(k) || { name: carLabel({ make: e.vehicle?.make, model: e.vehicle?.model }), c7: 0, c30: 0, hit: 0, outcomes: {} };
    a.c30++; if (new Date(e.created_at).getTime() >= cut7) a.c7++;
    if ((e.metadata?.marketFetchCache) === "hit") a.hit++;
    const o = eventOutcome(e); a.outcomes[o] = (a.outcomes[o] || 0) + 1;
    agg.set(k, a);
  }
  const list = [...agg.values()].map(a => ({ ...a, hitRate: a.c30 ? Math.round(100 * a.hit / a.c30) : 0, dominant: Object.entries(a.outcomes).sort((x, y) => y[1] - x[1])[0]?.[0] || "-" }))
    .sort((x, y) => y.c30 - x.c30).slice(0, 100);
  if (req.query?.format === "json") return res.status(200).json({ crew: mode, cars: list });
  const rows = list.map(a => `<tr><td>${adminEsc(a.name)}</td><td>${a.c7}</td><td>${a.c30}</td><td>${a.hitRate}%</td><td>${adminEsc(OUTCOME_LABELS[a.dominant] || a.dominant)}</td></tr>`).join("");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(pageChrome("Top cars", { __key: req.query?.key, html: `<div>crew: ${mode}</div><table><tr><th>Model</th><th>7d</th><th>30d</th><th>Cache hit</th><th>Dominant outcome</th></tr>${rows || "<tr><td colspan=5>none</td></tr>"}</table>` }));
}
// ?view=geo : searches by entered state/country, 7d and 30d. No raw IPs.
async function renderGeoView(req, res) {
  const env = supabaseEnv(); if (!env) return res.status(500).json({ error: "storage not configured" });
  const mode = crewMode(req);
  const all = applyCrew(await fetchDecisionEvents(env, 30), mode);
  const cut7 = Date.now() - 7 * 864e5;
  const agg = new Map();
  for (const e of all) {
    const k = geoKey(e.metadata || {});
    const a = agg.get(k) || { loc: k, c7: 0, c30: 0 };
    a.c30++; if (new Date(e.created_at).getTime() >= cut7) a.c7++; agg.set(k, a);
  }
  const list = [...agg.values()].sort((x, y) => y.c30 - x.c30);
  if (req.query?.format === "json") return res.status(200).json({ crew: mode, geo: list });
  const rows = list.map(a => `<tr><td>${adminEsc(a.loc)}</td><td>${a.c7}</td><td>${a.c30}</td></tr>`).join("");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(pageChrome("Geo", { __key: req.query?.key, html: `<div>crew: ${mode} &middot; entered location only, never IPs</div><table><tr><th>Location</th><th>7d</th><th>30d</th></tr>${rows || "<tr><td colspan=3>none</td></tr>"}</table>` }));
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

// ===================== ?view=ops : web-triggered metered jobs =====================
// Sam has no terminal, so the metered scripts (probe:depth, fill:ladder) run as an
// authenticated GET he opens in a browser. Secrets (OLDCARSDATA_API_KEY,
// SUPABASE_SERVICE_ROLE_KEY) are read from Vercel's OWN environment, never from a
// shell. This branch is gated by its OWN key (PROBE_KEY), independent of the
// read-only dashboard key, because it SPENDS metered budget. Each invocation runs a
// BOUNDED, resumable slice so it fits the serverless timeout; the shared cores live
// in lib/ops/. This is the standing pattern for any future metered script.
async function handleOps(req, res) {
  // Two auth paths, neither committed to the repo: Sam's manual PROBE_KEY (in the
  // URL), OR Vercel's built-in cron auth (the platform sends Authorization: Bearer
  // ${CRON_SECRET} on scheduled requests; CRON_SECRET is a Vercel env var). vercel.json
  // only names the path, never a secret.
  const opsKey = process.env.PROBE_KEY || process.env.OPS_KEY;
  const cronSecret = process.env.CRON_SECRET;
  const provided = req.headers["x-ops-key"] || req.query?.opskey || req.query?.key;
  const authHeader = String(req.headers["authorization"] || "");
  const isCron = !!cronSecret && authHeader === `Bearer ${cronSecret}`;
  if (!isCron) {
    if (!opsKey) return res.status(500).json({ error: "Set PROBE_KEY in Vercel to enable the ops endpoint." });
    if (provided !== opsKey) return res.status(401).json({ error: "Unauthorized (ops)." });
  }

  const apiKey = process.env.OLDCARSDATA_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "OLDCARSDATA_API_KEY not set in Vercel." });
  const env = supabaseEnv();
  const task = String(req.query?.task || "");
  const dailyBudget = Number(process.env.OCD_DAILY_REQUEST_BUDGET || 900);

  async function meteredToday() {
    if (!env) return null;
    const since = new Date(); since.setUTCHours(0, 0, 0, 0);
    const rows = await supabaseSelect(env, `app_usage_events?created_at=gte.${since.toISOString()}&oldcarsdata_metered_requests=gt.0&select=oldcarsdata_metered_requests&limit=2000`);
    if (!rows) return null;
    return rows.reduce((s, r) => s + (Number(r.oldcarsdata_metered_requests) || 0), 0);
  }

  if (task === "probe") {
    const spent = await meteredToday();
    const budgetLeft = spent === null ? Infinity : Math.max(0, dailyBudget - spent);
    if (budgetLeft <= 0) return res.status(200).json({ task: "probe", skipped: "daily_budget_spent", spentToday: spent, dailyBudget });
    // Hard-capped request ceiling so a single invocation fits the function timeout.
    const max = Math.max(1, Math.min(120, Number(req.query?.max || 40)));
    const sources = req.query?.sources ? String(req.query.sources).split(",").map(s => s.trim()).filter(Boolean) : LAUNCH_SOURCES;
    const windows = req.query?.windows ? String(req.query.windows).split(",").map(Number).filter(n => n > 0) : [45, 90, 180];
    const report = await runDepthProbe({ apiKey, sources, windows, maxRequests: Math.min(max, budgetLeft === Infinity ? max : budgetLeft), budgetLeft });
    if (env && report.meteredRequests > 0) {
      try { await recordUsageEvent({ event_type: "depth_probe", route: "api/usageDashboard.js?task=probe", status: "ok", oldcarsdata_metered_requests: report.meteredRequests, duration_ms: 0, metadata: { sources: sources.length, windows, ukPlatforms: report.ukPool.length, via: "web" } }, env.supabaseUrl, env.supabaseKey); } catch { /* non-fatal */ }
    }
    // Compact per-source summary alongside the full report (easy to read in a browser).
    const summary = report.sources.map(s => ({ platform: s.label, source: s.source, integrated: s.integrated, soldInWindow: s.totalSold, us: s.counts.US[report.widestDays], uk: s.counts.UK[report.widestDays], sawData: s.sawData, note: s.note }));
    return res.status(200).json({ task: "probe", spentToday: spent, dailyBudget, summary, report });
  }

  // task=handles: verify partner seller handles against LIVE OCD before any fetch.
  // Reports records-per-handle-per-platform so a wrong spelling (zero records)
  // surfaces loudly instead of silently computing on a partial history.
  if (task === "handles") {
    const spent0 = await meteredToday();
    const budgetLeft = spent0 === null ? Infinity : Math.max(0, dailyBudget - spent0);
    if (budgetLeft <= 0) return res.status(200).json({ task: "handles", skipped: "daily_budget_spent", spentToday: spent0, dailyBudget });
    // The roster to verify. Handles supplied by Sam; grouped by partner.
    const roster = [
      { partner: "Howard Silvers", handles: ["howS", "bruce_m"] },
      { partner: "Ingo Schmoldt", handles: ["GenauAutoWerks"] },
      { partner: "Dan Gray", handles: ["AuthenticAuctions"] },
      { partner: "Chris Carbine", handles: ["carbine123"] }
    ];
    const custom = req.query?.handles ? String(req.query.handles).split(",").map(s => s.trim()).filter(Boolean) : null;
    const maxPagesPerHandle = Math.max(1, Math.min(20, Number(req.query?.pages || 6)));
    const sellerOf = r => String(r.seller_username || r.seller_name || r.seller || r.username || "").toLowerCase();
    let metered = 0;
    // OCD's seller_username filter is CASE-SENSITIVE and authoritative; keyword is
    // case-insensitive but UNDERCOUNTS (e.g. "carbine123" -> 12 via keyword vs 83 via
    // seller_username=Carbine123). So: paginate seller_username with the given case;
    // if that finds nothing, keyword-probe to discover the real case, then re-query
    // seller_username with the corrected spelling for the full server-side set.
    async function fetchBySellerUsername(handle) {
      const norm = String(handle).toLowerCase();
      const matched = []; let pages = 0, capped = false, reported = null, ratelimit = false;
      for (let page = 1; page <= maxPagesPerHandle; page++) {
        if (budgetLeft !== Infinity && metered >= budgetLeft) { capped = true; break; }
        metered++; pages = page;
        let resp;
        try { resp = await callOldCarsData("/auctions", { seller_username: handle, sort: "date", direction: "desc", page, limit: 50 }, apiKey); }
        catch (e) { if (e.rateLimited) { ratelimit = true; } break; }
        const rows = resp.data || [];
        reported = resp.meta?.total_results ?? resp.meta?.total ?? reported;
        matched.push(...rows.filter(r => sellerOf(r) === norm));
        if (rows.length < 50) break;
        if (page >= (resp.meta?.total_pages || 1)) break;
        if (page === maxPagesPerHandle) capped = true;
      }
      return { matched, pages, capped, reported, ratelimit };
    }

    // debug=<handle>: raw diagnostic to see what OCD actually returns for one handle -
    // does any seller filter param work, do records carry a seller field, in what shape.
    if (req.query?.debug) {
      const handle = String(req.query.debug);
      const norm = handle.toLowerCase();
      const out = [];
      for (const param of ["seller_username", "seller", "keyword"]) {
        if (budgetLeft !== Infinity && metered >= budgetLeft) break;
        metered++;
        let resp, err = null;
        try { resp = await callOldCarsData("/auctions", { [param]: handle, sort: "date", direction: "desc", page: 1, limit: 50 }, apiKey); }
        catch (e) { err = e.message; }
        const rows = (resp && resp.data) || [];
        const first = rows[0] || {};
        const sellerKeys = Object.keys(first).filter(k => /seller|user|consign|vendor|account/i.test(k));
        out.push({
          param, err, rowsReturned: rows.length, reportedTotal: resp?.meta?.total_results ?? resp?.meta?.total ?? null,
          matchedThisHandle: rows.filter(r => sellerOf(r) === norm).length,
          sellerFieldsOnRecord: sellerKeys.length ? sellerKeys : "(none present)",
          sellerFieldSamples: sellerKeys.length ? rows.slice(0, 5).map(r => sellerKeys.reduce((o, k) => (o[k] = r[k], o), {})) : [],
          anyFieldMentionsHandle: rows.slice(0, 10).some(r => JSON.stringify(r).toLowerCase().includes(norm)),
          firstRecordKeys: Object.keys(first).slice(0, 40)
        });
      }
      return res.status(200).json({ task: "handles", debug: handle, meteredThisRun: metered, diagnostics: out });
    }
    async function checkHandle(handle) {
      const norm = String(handle).toLowerCase();
      let res = await fetchBySellerUsername(handle);
      let resolvedHandle = handle, method = "seller_username";
      if (res.ratelimit && !res.matched.length) return { handle, resolvedHandle, param: null, count: 0, byPlatform: {}, note: "ratelimit" };
      // Case mismatch: the given spelling filtered nothing. Keyword-probe the real case,
      // then re-query seller_username with it (keyword alone undercounts).
      if (!res.matched.length && !(budgetLeft !== Infinity && metered >= budgetLeft)) {
        metered++;
        let kw; try { kw = await callOldCarsData("/auctions", { keyword: handle, sort: "date", direction: "desc", page: 1, limit: 50 }, apiKey); } catch (e) { kw = null; }
        const kwSellers = {};
        for (const r of ((kw && kw.data) || [])) { const su = String(r.seller_username || ""); if (su.toLowerCase() === norm) kwSellers[su] = (kwSellers[su] || 0) + 1; }
        const corrected = Object.keys(kwSellers).sort((a, b) => kwSellers[b] - kwSellers[a])[0];
        if (corrected && corrected !== handle) {
          const res2 = await fetchBySellerUsername(corrected);
          if (res2.matched.length >= res.matched.length) { res = res2; resolvedHandle = corrected; method = "seller_username (case-corrected)"; }
        }
      }
      if (!res.matched.length) return { handle, resolvedHandle, param: null, count: 0, byPlatform: {}, note: "zero records (check spelling with the partner)" };
      const byPlatform = {}; let minD = null, maxD = null;
      for (const r of res.matched) {
        const pf = (r.platform || r.source || "unknown"); byPlatform[pf] = (byPlatform[pf] || 0) + 1;
        const d = r.auction_end_date ? String(r.auction_end_date).slice(0, 10) : null;
        if (d) { if (!minD || d < minD) minD = d; if (!maxD || d > maxD) maxD = d; }
      }
      return { handle, resolvedHandle, param: method, count: res.matched.length, reportedTotal: res.reported, byPlatform, dateRange: minD && maxD ? [minD, maxD] : null, pagesRead: res.pages, capped: res.capped };
    }
    const results = [];
    for (const entry of (custom ? [{ partner: "custom", handles: custom }] : roster)) {
      const handleResults = [];
      for (const h of entry.handles) handleResults.push(await checkHandle(h));
      results.push({ partner: entry.partner, handles: handleResults });
    }
    if (env && metered > 0) {
      try { await recordUsageEvent({ event_type: "handle_probe", route: "api/usageDashboard.js?task=handles", status: "ok", oldcarsdata_metered_requests: metered, duration_ms: 0, metadata: { handles: results.flatMap(r => r.handles.map(h => ({ h: h.handle, n: h.count, param: h.param }))) } }, env.supabaseUrl, env.supabaseKey); } catch { /* non-fatal */ }
    }
    const zeros = results.flatMap(r => r.handles.filter(h => h.count === 0).map(h => `${r.partner}:${h.handle}`));
    return res.status(200).json({ task: "handles", spentToday: spent0, meteredThisRun: metered, dailyBudget, zeros, results });
  }

  // task=partnerfetch: pull each partner's full sold history (case-corrected handle),
  // persist to vehicle_market_records (rule 5, upsert), and derive the distinct
  // model list that the premium compute needs its baseline pools warmed for. Stores
  // that list as event_type=warm_targeted so the fill warms it FIRST.
  if (task === "partnerfetch") {
    if (!env) return res.status(500).json({ error: "Supabase env not set." });
    const spent0 = await meteredToday();
    const budgetLeft = spent0 === null ? Infinity : Math.max(0, dailyBudget - spent0);
    if (budgetLeft <= 0) return res.status(200).json({ task: "partnerfetch", skipped: "daily_budget_spent", spentToday: spent0 });
    const roster = [
      { partner: "Howard Silvers", handles: ["howS", "bruce_m"] },
      { partner: "Ingo Schmoldt", handles: ["GenauAutoWerks"] },
      { partner: "Dan Gray", handles: ["AuthenticAuctions"] },
      { partner: "Chris Carbine", handles: ["carbine123"] }
    ];
    const maxPages = Math.max(1, Math.min(30, Number(req.query?.pages || 15)));
    const sellerLc = r => String(r.seller_username || "").toLowerCase();
    let metered = 0;
    async function resolveCase(handle) {
      const norm = handle.toLowerCase();
      metered++;
      let r; try { r = await callOldCarsData("/auctions", { seller_username: handle, page: 1, limit: 50 }, apiKey); } catch (e) { return handle; }
      if ((r.data || []).some(x => sellerLc(x) === norm)) return handle;
      metered++;
      let kw; try { kw = await callOldCarsData("/auctions", { keyword: handle, page: 1, limit: 50 }, apiKey); } catch (e) { return handle; }
      const c = {}; for (const x of (kw.data || [])) { const su = String(x.seller_username || ""); if (su.toLowerCase() === norm) c[su] = (c[su] || 0) + 1; }
      return Object.keys(c).sort((a, b) => c[b] - c[a])[0] || handle;
    }
    const modelSet = new Map(); const summary = []; let totalPersisted = 0;
    for (const entry of roster) {
      let partnerRecords = 0; const handleInfo = [];
      for (const h of entry.handles) {
        if (budgetLeft !== Infinity && metered >= budgetLeft) { handleInfo.push({ handle: h, note: "budget_reached" }); continue; }
        const real = await resolveCase(h);
        const recs = [];
        for (let page = 1; page <= maxPages; page++) {
          if (budgetLeft !== Infinity && metered >= budgetLeft) break;
          metered++;
          let resp; try { resp = await callOldCarsData("/auctions", { seller_username: real, sort: "date", direction: "desc", page, limit: 50 }, apiKey); } catch (e) { break; }
          const rows = (resp.data || []);
          recs.push(...rows.filter(x => sellerLc(x) === String(real).toLowerCase()));
          if (rows.length < 50) break;
          if (page >= (resp.meta?.total_pages || 1)) break;
        }
        // Persist (rule 5): stamp the resolved seller so the compute can filter.
        const payload = recs.map(record => {
          record.seller_username = record.seller_username || real;
          return {
            source: recordPlatform(record), source_record_id: stableRecordId(record),
            source_url: record.url || record.listing_url || null, platform: recordPlatform(record),
            ...persistableMakeModel(record), year: record.year || null,
            raw_title: record.title || record.listing_title || null,
            price: Number(record.price ?? record.sold_price ?? record.final_price ?? record.current_bid) || null,
            auction_status: record.auction_status || record.status || null,
            auction_end_date: record.auction_end_date || null,
            seller_username: record.seller_username || real, raw_record: record
          };
        }).filter(p => p.source_record_id);
        if (payload.length) { try { await supabaseInsert("vehicle_market_records", payload, env.supabaseUrl, env.supabaseKey, "resolution=ignore-duplicates,return=minimal", "?on_conflict=source,source_record_id"); totalPersisted += payload.length; } catch (e) { /* non-fatal */ } }
        // Targeted warm list from OCD's STRUCTURED make/model only (never the title
        // fallback, which turns prefixes like "24-Years-Owned" / "Modified" into fake
        // makes). Frequency-counted so the fill warms the partners' most-sold models
        // first, maximizing matched comps for the premium fastest.
        for (const record of recs) {
          const mk = String(record.ocd_make_name || record.listing_make || "").trim();
          const md = String(record.ocd_model_name || record.listing_model || "").trim();
          if (!mk || !md) continue;
          const k = `${mk}|${md}`;
          const e = modelSet.get(k) || { make: mk, model: md, n: 0 };
          e.n++; modelSet.set(k, e);
        }
        partnerRecords += recs.length;
        handleInfo.push({ handle: h, resolved: real, records: recs.length });
      }
      summary.push({ partner: entry.partner, handles: handleInfo, records: partnerRecords });
    }
    const targeted = [...modelSet.values()].sort((a, b) => b.n - a.n).map(e => [e.make, e.model]);
    try { await recordUsageEvent({ event_type: "warm_targeted", route: "partnerfetch", status: "ok", oldcarsdata_metered_requests: 0, duration_ms: 0, metadata: { models: targeted, count: targeted.length, generatedAt: new Date().toISOString() } }, env.supabaseUrl, env.supabaseKey); } catch { /* non-fatal */ }
    if (env && metered > 0) { try { await recordUsageEvent({ event_type: "partner_fetch", route: "api/usageDashboard.js?task=partnerfetch", status: "ok", oldcarsdata_metered_requests: metered, duration_ms: 0, metadata: { persisted: totalPersisted, targetedModels: targeted.length } }, env.supabaseUrl, env.supabaseKey); } catch { /* non-fatal */ } }
    return res.status(200).json({ task: "partnerfetch", spentToday: spent0, meteredThisRun: metered, persisted: totalPersisted, targetedModelCount: targeted.length, targetedModels: targeted, summary });
  }

  if (task === "fill") {
    if (!env) return res.status(500).json({ error: "Supabase env not set (fill needs the cursor store)." });
    const reset = req.query?.reset === "1" || req.query?.reset === "true";
    let cursor = { index: 0, warmed: 0, spent: 0, runs: 0 };
    if (!reset) {
      const rows = await supabaseSelect(env, `app_usage_events?event_type=eq.fill_cursor&select=metadata&order=created_at.desc&limit=1`);
      if (rows && rows[0] && rows[0].metadata) cursor = { ...cursor, ...rows[0].metadata };
    }
    // Targeted-first: the partners' own models (event_type=warm_targeted) warm BEFORE
    // the generic 463, so the premium can compute without waiting for the full list.
    let targeted = [];
    try { const t = await supabaseSelect(env, `app_usage_events?event_type=eq.warm_targeted&select=metadata&order=created_at.desc&limit=1`); if (t && t[0] && Array.isArray(t[0].metadata?.models)) targeted = t[0].metadata.models; } catch { /* none yet */ }
    let generic;
    try { generic = JSON.parse(fs.readFileSync(new URL("../scripts/warm-list.json", import.meta.url), "utf8")).models || []; }
    catch (e) { return res.status(500).json({ error: "warm-list.json unavailable in the function bundle: " + e.message }); }
    const tgtKeys = new Set(targeted.map(([mk, md]) => `${mk}|${md}`.toLowerCase()));
    const list = [...targeted, ...generic.filter(([mk, md]) => !tgtKeys.has(`${mk}|${md}`.toLowerCase()))];
    const targetedCount = targeted.length;
    if (!list.length) return res.status(500).json({ error: "No nameplates to warm." });
    if (cursor.index >= list.length) return res.status(200).json({ task: "fill", done: true, message: "Fill complete. Pass &reset=1 to run again.", cursor, total: list.length, targetedCount });
    const limit = Math.max(1, Math.min(20, Number(req.query?.limit || 12)));
    if (req.query?.dry === "1" || req.query?.dry === "true") {
      return res.status(200).json({ task: "fill", dry: true, cursor, total: list.length, targetedCount, targetedDone: cursor.index >= targetedCount, phase: cursor.index < targetedCount ? "targeted" : "generic", nextUp: list.slice(cursor.index, cursor.index + limit).map(([mk, md]) => `${mk} ${md}`) });
    }
    const base = `https://${req.headers.host}`;
    // Cron / drain: loop bounded chunks until the warm budget caps, the list is done,
    // or a soft time budget (~230s, under maxDuration 300) is hit. A daily cron run
    // therefore spends the full daily warm cap in one pass. Persists the cursor after
    // each chunk so a timeout never loses progress. Manual URL uses a single chunk.
    const drain = isCron || req.query?.drain === "1" || req.query?.drain === "true";
    const persistCursor = async (c, status) => { try { await recordUsageEvent({ event_type: "fill_cursor", route: "api/usageDashboard.js?task=fill", status, oldcarsdata_metered_requests: 0, duration_ms: 0, metadata: c }, env.supabaseUrl, env.supabaseKey); } catch { /* non-fatal */ } };
    if (drain) {
      const t0 = Date.now(); let idx = cursor.index, warmed = cursor.warmed || 0, spent = cursor.spent || 0, runs = (cursor.runs || 0) + 1;
      let processed = 0, budgetStopped = false, done = false, chunks = 0;
      while (true) {
        const r = await runFillBatch({ base, list, startIndex: idx, limit: 10 });
        idx = r.nextIndex; processed += r.processed; warmed += r.processed; spent += r.spent; chunks++;
        await persistCursor({ index: idx, warmed, spent, runs }, "drain_chunk");
        if (r.done) { done = true; break; }
        if (r.budgetStopped) { budgetStopped = true; break; }
        if (r.processed === 0) break;
        if (Date.now() - t0 > 230000) break;
      }
      return res.status(200).json({ task: "fill", mode: "drain", via: isCron ? "cron" : "manual", chunks, processedThisRun: processed, spentThisRun: spent, cursor: { index: idx, warmed, spent, runs }, total: list.length, targetedCount, targetedDone: idx >= targetedCount, done, budgetStopped });
    }
    const r = await runFillBatch({ base, list, startIndex: cursor.index, limit });
    const next = { index: r.nextIndex, warmed: (cursor.warmed || 0) + r.processed, spent: (cursor.spent || 0) + r.spent, runs: (cursor.runs || 0) + 1 };
    await persistCursor(next, r.done ? "complete" : r.budgetStopped ? "budget_paused" : "batch_ok");
    return res.status(200).json({
      task: "fill", batch: { processed: r.processed, spent: r.spent, degraded: r.degraded, budgetStopped: r.budgetStopped, lastNameplate: r.lastNameplate },
      cursor: next, total: list.length, targetedCount, targetedDone: next.index >= targetedCount, done: r.done,
      note: r.done ? "Fill complete." : r.budgetStopped ? "Warm budget reached; resume after the next daily reset." : "Batch done; re-open to continue."
    });
  }

  // task=premium: the matched-pool partner premium precompute (report-only, renders
  // nothing). For each partner sale, the baseline is other qualifying sales within a
  // window centered on THAT sale's date (not today), from the 8 US launch platforms,
  // EXCLUDING every partner seller. Ladder tightest-first (generation -> model ->
  // make/segment) to the first rung with pool>=5; per-sale delta vs pool median; per
  // partner the MEDIAN of deltas, gated at n>=10, rounded to whole percent.
  if (task === "premium") {
    if (!env) return res.status(500).json({ error: "Supabase env not set." });
    const windowDays = Math.max(30, Math.min(365, Number(req.query?.window || 183)));
    const US8 = new Set(["bringatrailer", "bat", "carsandbids", "hagerty", "pcarmarket", "sothebysmotorsport", "hemmings", "autohunter", "mbmarket"]);
    const roster = [
      { partner: "Howard Silvers", handles: ["howS", "bruce_m"] },
      { partner: "Ingo Schmoldt", handles: ["GenauAutoWerks"] },
      { partner: "Dan Gray", handles: ["AuthenticAuctions"] },
      { partner: "Chris Carbine", handles: ["Carbine123", "carbine123"] }
    ];
    const allPartnerSellers = new Set(roster.flatMap(r => r.handles.map(h => h.toLowerCase())));
    const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
    // A completed SALE only: a positive price and a status that is not an unsold
    // outcome. ("unsold".includes("sold") was true, so bid-but-not-sold listings
    // were polluting both pools and inflating comp medians.)
    const soldOk = r => Number(r.price) > 0 && !/unsold|not sold|no sale|reserve not met|withdrawn|cancell?ed/i.test(String(r.auction_status || ""));
    const platOk = r => US8.has(norm(r.platform || r.source));
    // Pull each partner's SOLD sales (persisted by partnerfetch), then their baselines.
    async function partnerSales(handles) {
      const inList = handles.map(h => `"${h}"`).join(",");
      const rows = await supabaseSelect(env, `vehicle_market_records?seller_username=in.(${encodeURIComponent(inList)})&select=make,model,year,price,auction_status,auction_end_date,platform,source,seller_username&limit=5000`);
      return (rows || []).filter(r => soldOk(r) && r.make && r.model && r.auction_end_date && Number(r.price) > 0);
    }
    // Baseline candidates for one make+model within +/- window of the sale date.
    async function baselineFor(make, model, dateIso) {
      const d = new Date(dateIso); if (!Number.isFinite(d.getTime())) return [];
      const lo = new Date(d.getTime() - windowDays * 864e5).toISOString();
      const hi = new Date(d.getTime() + windowDays * 864e5).toISOString();
      const rows = await supabaseSelect(env, `vehicle_market_records?make=ilike.${encodeURIComponent(make)}&auction_end_date=gte.${lo}&auction_end_date=lte.${hi}&select=make,model,year,price,auction_status,auction_end_date,platform,source,seller_username&limit=3000`);
      return (rows || []).filter(r => soldOk(r) && platOk(r) && !allPartnerSellers.has(String(r.seller_username || "").toLowerCase()));
    }
    // Generation span for a (make, model, year) from the curated map. OCD already
    // files some generations as their own model ("997" vs "911"), so a chassis-code
    // model is generation-level on its own; the span here year-scopes the catch-all
    // nameplates ("911") so a 1973 and a 2013 never land in the same pool.
    const genSpan = (make, model, year) => {
      const y = Number(year); if (!y) return null;
      const fam = String(model).split(/\s+/)[0].toLowerCase();
      const rows = CURATED_GENERATIONS.filter(g => String(g.make).toLowerCase() === String(make).toLowerCase() && String(g.model).split(/\s+/)[0].toLowerCase() === fam);
      const hit = rows.find(g => y >= g.yearStart && y <= g.yearEnd);
      return hit ? [hit.yearStart, hit.yearEnd] : null;
    };
    const report = [];
    for (const p of roster) {
      const sales = await partnerSales(p.handles);
      const deltas = []; const rungCount = { generation: 0, yearband: 0, unmatched: 0 }; let minD = null, maxD = null;
      // Cache baselines per make|model|monthbucket to limit queries.
      const cache = new Map();
      for (const s of sales) {
        const mk = String(s.make), md = String(s.model), price = Number(s.price);
        const bucket = String(s.auction_end_date).slice(0, 7);
        const ckey = `${norm(mk)}|${norm(md)}|${bucket}`;
        let pool = cache.get(ckey);
        if (!pool) { pool = await baselineFor(mk, md, s.auction_end_date); cache.set(ckey, pool); }
        // Like-for-like ONLY (year-scoped), to cancel generation/variant mix:
        //   1) generation: SAME model + year within the mapped generation span
        //   2) yearband:   SAME model + year within +/-2 (fallback when unmapped)
        // The any-year model rung and the coarse make rung are deliberately gone -
        // both compared a specific older car against pools dominated by newer/pricier
        // variants of the nameplate, which is what drove the negatives. No year-scoped
        // pool>=5 => the sale is unmatched, never forced into a mixed pool. A sale with
        // no usable year can't be year-scoped, so it is unmatched too.
        const sameModel = pool.filter(r => Number(r.year) && norm(r.model) === norm(md) && String(r.auction_end_date) !== String(s.auction_end_date));
        const yr = Number(s.year);
        let rung = null, comps = null;
        if (yr) {
          const span = genSpan(mk, md, yr);
          const [lo, hi] = span || [yr - 2, yr + 2];
          const band = sameModel.filter(r => Number(r.year) >= lo && Number(r.year) <= hi);
          if (band.length >= 5) { rung = span ? "generation" : "yearband"; comps = band; }
        }
        if (!comps) { rungCount.unmatched++; continue; }
        const med = median(comps.map(r => Number(r.price)).filter(n => n > 0));
        if (!med || med <= 0) { rungCount.unmatched++; continue; }
        const delta = Math.round((price - med) / med * 100);
        deltas.push(delta); rungCount[rung]++;
        const dd = String(s.auction_end_date).slice(0, 10);
        if (!minD || dd < minD) minD = dd; if (!maxD || dd > maxD) maxD = dd;
      }
      const premium = deltas.length >= 10 ? Math.round(median(deltas)) : null;
      report.push({
        partner: p.partner, salesConsidered: sales.length, n: deltas.length,
        premiumPct: premium, gatePassed: deltas.length >= 10 && premium !== null && premium > 0,
        matchedDateRange: minD && maxD ? [minD, maxD] : null, rungDistribution: rungCount,
        note: deltas.length < 10 ? "below n>=10 (baseline likely not warm yet)" : premium == null ? "no median" : premium <= 0 ? "non-positive median, never renders" : "clears gate"
      });
    }
    return res.status(200).json({ task: "premium", windowDays, gate: "n>=10, positive median, whole-percent, 8 US platforms, partners excluded", report });
  }

  return res.status(400).json({ error: "Unknown ops task. Use ?view=ops&task=probe|fill|handles|partnerfetch|premium." });
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  // Metered ops jobs (probe/fill): own PROBE_KEY gate, runs BEFORE the dashboard-key
  // gate so it is independent of the read-only dashboard key.
  if (req.query?.view === "ops") {
    try { return await handleOps(req, res); } catch (err) { return res.status(500).json({ error: err.message }); }
  }

  const configuredKey = process.env.USAGE_DASHBOARD_KEY || process.env.ADMIN_DASHBOARD_KEY;
  const providedKey = req.headers["x-admin-key"] || req.query?.key;
  if (!configuredKey) return res.status(500).json({ error: "Set USAGE_DASHBOARD_KEY in Vercel before using this dashboard." });
  if (providedKey !== configuredKey) return res.status(401).json({ error: "Unauthorized" });

  // View dispatch (consolidated admin function): accounts + funnel (2G), outbound
  // clicks, or the default usage view.
  try {
    if (req.query?.view === "accounts") return await renderAccountsView(req, res);
    if (req.query?.view === "outbound") return await renderOutboundView(req, res);
    if (req.query?.view === "searches") return await renderSearchesView(req, res);
    if (req.query?.view === "cars") return await renderCarsView(req, res);
    if (req.query?.view === "geo") return await renderGeoView(req, res);
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
