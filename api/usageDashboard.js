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
import { journeyManualUpdate } from "../lib/_journey.js";
import { runDepthProbe, LAUNCH_SOURCES } from "../lib/ops/depthProbe.js";
import { censusRegion, CENSUS_REGIONS } from "../lib/_regions.js";
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
  const trs = list.map(r => `<tr><td>${adminEsc(fmtDateTimeET(r.created_at))}</td><td>${adminEsc(r.year)}</td><td>${adminEsc(r.make)}</td><td>${adminEsc(r.model)}</td><td>${adminEsc(r.trim)}</td><td>${adminEsc(r.location)}</td><td>${adminEsc(r.platform)}</td><td>${adminEsc(r.card)}</td><td>${adminEsc(r.outcome)}</td><td>${adminEsc(r.landed_rung)}</td><td>${adminEsc(r.reason)}</td><td>${adminEsc(r.seller_preference)}</td></tr>`).join("");
  const note = !env ? "Supabase env missing." : rows === null ? "outbound_clicks table not found yet." : `${list.length} rows.`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(`<!doctype html><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Outbound clicks</title><h3>Outbound clicks (newest first)</h3><table border="1" cellpadding="4" cellspacing="0"><tr><th>date</th><th>year</th><th>make</th><th>model</th><th>trim</th><th>location</th><th>platform</th><th>card</th><th>outcome</th><th>rung</th><th>reason</th><th>pref</th></tr>${trs}</table><p>${adminEsc(note)}</p>`);
}

// ===================== F: decision-event views (searches / cars / geo) =====================
// Read-only, from the forward-only fields logged on seller_decision +
// data_unavailable events (entered location, tier, outcome, pick, PowerSeller).
// Crew AND tester searches are flagged and filterable everywhere
// (?crew=include|exclude|only). "exclude" = real users only (drops BOTH the crew
// and the pre-launch tester cohort, so post-launch and golden-path metrics stay
// clean); "only" = the internal cohorts (crew + tester), still distinguished by the
// per-row tier pill. Entered location only is ever rendered - never a raw IP.
const OUTCOME_LABELS = { mode_a: "Mode A", mode_b: "Mode B", concentration: "Concentration", thin: "Thin", data_unavailable: "Unavailable" };
function crewMode(req) { const c = String(req.query?.crew || "include").toLowerCase(); return (c === "exclude" || c === "only") ? c : "include"; }
function isInternalTier(t) { return t === "crew" || t === "tester"; }
function applyCrew(events, mode) {
  if (mode === "exclude") return events.filter(e => !isInternalTier(e.metadata?.tier)); // real users only
  if (mode === "only") return events.filter(e => isInternalTier(e.metadata?.tier));      // crew + testers
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
<style>body{font:14px/1.5 system-ui;margin:28px;color:#16140f}h1{font-size:20px}h2{font-size:14px;text-transform:uppercase;letter-spacing:.05em;color:#6b6861;margin-top:26px}table{border-collapse:collapse;width:100%;margin-top:8px}td,th{border:1px solid #e3e1db;padding:5px 9px;text-align:left;font-size:13px}th{background:#f6f5f2}nav a{margin-right:14px;font-size:13px}.pill{font-size:11px;padding:1px 6px;border-radius:8px;background:#eee}.crew{background:#ffe8c2}.tester{background:#d7ebff}</style>
<nav><a href="?view=business&key=${adminEsc((body.__key) || "")}" style="font-weight:700;color:#0b5c3e">&larr; BUSINESS</a><span style="color:#c9c5bc;margin-right:14px">|</span><span style="color:#a29e95;font-size:12px;margin-right:8px">Engineering / Costs:</span>${["searches", "cars", "geo", "accounts", "usage", "outbound"].map(v => `<a href="?view=${v}&key=${adminEsc((body.__key) || "")}">${v}</a>`).join("")}</nav>
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
    return `<tr><td>${adminEsc(fmtDateTimeET(e.created_at))}</td><td>${adminEsc(carLabel(e.vehicle))}</td><td>${adminEsc(geoKey(m))}</td>
    <td>${adminEsc(m.tier || "")}${m.tier === "crew" ? ' <span class="pill crew">crew</span>' : m.tier === "tester" ? ' <span class="pill tester">tester</span>' : ""}</td>
    <td>${adminEsc(OUTCOME_LABELS[eventOutcome(e)] || eventOutcome(e))}</td><td>${adminEsc(m.pickPlatform || "-")}</td>
    <td>${psCell}</td><td>${outboundFor(e) ? "yes" : "-"}</td></tr>`;
  }).join("");
  if (req.query?.format === "json") return res.status(200).json({ days, crew: mode, count: events.length, searches: events.map(e => ({ at: e.created_at, car: carLabel(e.vehicle), location: geoKey(e.metadata), tier: e.metadata?.tier, outcome: eventOutcome(e), pick: e.metadata?.pickPlatform || null, powerSeller: e.metadata?.powerSeller || null, outbound: outboundFor(e) })) });
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(pageChrome("Searches", { __key: req.query?.key, html: `<div>last ${days}d, crew + testers: ${mode} &middot; <a href="?view=searches&crew=exclude&key=${adminEsc(req.query?.key || "")}">exclude (real users)</a> <a href="?view=searches&crew=only&key=${adminEsc(req.query?.key || "")}">only</a> <a href="?view=searches&crew=include&key=${adminEsc(req.query?.key || "")}">all</a></div>
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

function renderHtml({ summary, events, days, key }) {
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
      <td>${adminEsc(fmtDateTimeET(event.created_at))}</td>
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
  <div style="margin-bottom:12px"><a href="?view=business&key=${adminEsc(key || "")}" style="font-weight:700;color:#0b5c3e;text-decoration:none">&larr; BUSINESS dashboard</a></div>
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

  // task=status: spend + budget headroom + OCD's OWN remaining quota (1 metered
  // call reads the live rate-limit header), so we can tell if OCD itself is the wall.
  if (task === "status") {
    const spentToday = await meteredToday();
    const monthStart = new Date(new Date().toISOString().slice(0, 7) + "-01T00:00:00Z").toISOString();
    const monthRows = env ? await supabaseSelect(env, `app_usage_events?created_at=gte.${monthStart}&oldcarsdata_metered_requests=gt.0&select=oldcarsdata_metered_requests&limit=20000`) : null;
    const spentMonth = monthRows ? monthRows.reduce((s, r) => s + (Number(r.oldcarsdata_metered_requests) || 0), 0) : null;
    const monthlyBudget = Number(process.env.OCD_MONTHLY_BUDGET || 10000);
    let ocd = null;
    try { const r = await callOldCarsData("/auctions", { page: 1, limit: 1 }, apiKey); ocd = r.__rateLimit || null; }
    catch (e) { ocd = { error: e.message, rateLimited: !!e.rateLimited, rateLimit: e.rateLimit || null }; }
    return res.status(200).json({ task: "status", dailyBudget, monthlyBudget, spentToday, spentMonth, dailyRemaining: spentToday != null ? dailyBudget - spentToday : null, monthlyRemaining: spentMonth != null ? monthlyBudget - spentMonth : null, ocdApiRateLimit: ocd });
  }

  // task=modelscan: read-only fragmentation diagnostic. Lists OCD's model
  // identifiers for a make (/models is free) and probes a few keywords for
  // reported totals + the ocd_model_name each keyword's records actually carry -
  // so we can see whether "E-Class" sales live under E320/E350/E63 badge-models.
  if (task === "modelscan") {
    const make = String(req.query?.make || "Mercedes-Benz");
    const filter = String(req.query?.filter || "").toLowerCase();
    const probes = req.query?.probes ? String(req.query.probes).split(",").map(s => s.trim()).filter(Boolean) : [];
    let models = [];
    try { const m = await callOldCarsData("/models", { make }, apiKey); const arr = m.data || m.models || (Array.isArray(m) ? m : []); models = arr.map(x => (x && (x.name || x.model)) || x).filter(Boolean).map(String); }
    catch (e) { return res.status(200).json({ task: "modelscan", error: "models fetch: " + e.message }); }
    const filtered = filter ? models.filter(m => m.toLowerCase().includes(filter)) : models;
    let metered = 0; const probeResults = [];
    for (const kw of probes) {
      metered++;
      let resp; try { resp = await callOldCarsData("/auctions", { keyword: kw, status: "sold", sort: "date", direction: "desc", page: 1, limit: 50 }, apiKey); }
      catch (e) { probeResults.push({ keyword: kw, error: e.message }); continue; }
      const rows = resp.data || [];
      const modelNames = {}; let recent = 0; const now = Date.now();
      for (const r of rows) { const mn = r.ocd_model_name || r.listing_model || "?"; modelNames[mn] = (modelNames[mn] || 0) + 1; const d = r.auction_end_date ? new Date(r.auction_end_date).getTime() : 0; if (d && now - d <= 180 * 864e5) recent++; }
      probeResults.push({ keyword: kw, reportedTotal: resp.meta?.total_results ?? resp.meta?.total ?? rows.length, recentInPage180d: recent, sampleModelNames: modelNames });
    }
    return res.status(200).json({ task: "modelscan", make, modelCount: models.length, filtered, probes: probeResults, meteredThisRun: metered });
  }

  // task=fragscan: FREE systematic fragmentation scan across the model catalog.
  // The archive `model` column IS the OCD badge (persistableMakeModel keeps E550/M5,
  // it does not defrag at persist), so the per-make model-name distribution is a
  // full-count fragmentation signal at zero OCD cost. Auto-flags umbrella families
  // (names ending Series/Class/Type whose badge siblings outweigh the head) and
  // ranks makes by the SAME interest x gap the standing depth job uses (warm seed
  // w1, partner models w2, 180d search history w3). Archive is head-keyword-biased,
  // so siblingCount is a LOWER BOUND: a high ratio despite that bias confirms
  // fragmentation; topModels is returned for judgment on non-umbrella patterns
  // (Audi A4/S4/RS4, Lexus LS, Cadillac CTS/CTS-V). &probe=1 adds bounded live
  // head-vs-badge keyword counts, budget-gated.
  if (task === "fragscan") {
    if (!env) return res.status(500).json({ error: "Supabase env not set." });
    const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const key = (mk, md) => `${norm(mk)}|${norm(md)}`;
    const makes = req.query?.makes ? String(req.query.makes).split(",").map(s => s.trim()).filter(Boolean)
      : ["Ford", "Audi", "Mercedes-Benz", "BMW", "Jaguar", "Land Rover", "Cadillac", "Lexus", "Porsche", "Chevrolet", "Toyota", "Nissan"];
    // Interest x gap map, reused from the depth ranking.
    const makeInterest = new Map();
    const modelInterest = new Map();
    const addI = (mk, md, w) => { const a = String(mk || "").trim(), b = String(md || "").trim(); if (!a || !b) return; makeInterest.set(norm(a), (makeInterest.get(norm(a)) || 0) + w); modelInterest.set(key(a, b), (modelInterest.get(key(a, b)) || 0) + w); };
    try { const seed = JSON.parse(fs.readFileSync(new URL("../scripts/warm-list.json", import.meta.url), "utf8")).models || []; for (const [mk, md] of seed) addI(mk, md, 1); } catch { /* seed optional */ }
    try { const t = await supabaseSelect(env, `app_usage_events?event_type=eq.warm_targeted&select=metadata&order=created_at.desc&limit=1`); for (const [mk, md] of ((t && t[0] && t[0].metadata && t[0].metadata.models) || [])) addI(mk, md, 2); } catch { /* partners optional */ }
    try { const since = new Date(Date.now() - 180 * 864e5).toISOString(); const rows = await supabaseSelect(env, `app_usage_events?event_type=eq.seller_decision&created_at=gte.${since}&select=vehicle&limit=20000`); for (const r of (rows || [])) { const v = r.vehicle || {}; addI(v.make, v.model, 3); } } catch { /* history optional */ }
    const probe = req.query?.probe === "1" || req.query?.probe === "true";
    const spent0 = probe ? await meteredToday() : null;
    let probeLeft = probe ? (spent0 === null ? Infinity : Math.max(0, dailyBudget - spent0)) : 0;
    let metered = 0;
    const probeKw = async kw => { if (probeLeft !== Infinity && metered >= probeLeft) return null; metered++; try { const resp = await callOldCarsData("/auctions", { keyword: kw, status: "sold", page: 1, limit: 1 }, apiKey); return resp.meta?.total_results ?? resp.meta?.total ?? (resp.data || []).length; } catch { return null; } };
    const out = [];
    for (const make of makes) {
      const rows = await supabaseSelect(env, `vehicle_market_records?make=ilike.${encodeURIComponent(make)}&select=model&limit=100000`);
      const counts = new Map();
      for (const r of (rows || [])) { const m = String(r.model || "").trim(); if (!m || m.toLowerCase() === "other") continue; counts.set(m, (counts.get(m) || 0) + 1); }
      const total = rows ? rows.length : 0;
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([model, n]) => ({ model, n }));
      const umbrellas = [];
      for (const [name, n] of counts) {
        const low = name.toLowerCase().trim();
        const mCS = low.match(/^([a-z0-9]+)[\s-]?(series|class|type)$/); // E-Class, F-Series, 3-Series, F-Type
        if (!mCS) continue;
        const stem = mCS[1];
        const stemEsc = stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const sibRe = new RegExp(`^${stemEsc}[\\s-]?\\d`, "i");
        let sibSum = 0; const sibEx = [];
        for (const [nm, c] of counts) { if (nm === name) continue; const bare = nm.replace(/[^a-z0-9\s-]/gi, ""); if (sibRe.test(nm) || sibRe.test(bare)) { sibSum += c; sibEx.push({ model: nm, n: c }); } }
        if (/^\d/.test(stem)) { const mRe = new RegExp(`^m${stem}`, "i"); for (const [nm, c] of counts) { if (nm === name) continue; if (mRe.test(nm.replace(/[^a-z0-9]/gi, ""))) { sibSum += c; sibEx.push({ model: nm, n: c }); } } }
        sibEx.sort((a, b) => b.n - a.n);
        const flag = { umbrella: name, headCount: n, siblingCount: sibSum, ratio: n ? +(sibSum / n).toFixed(1) : null, siblingExamples: sibEx.slice(0, 8) };
        if (probe && sibSum > 0) { flag.liveHead = await probeKw(`${make} ${name}`); flag.liveTopBadge = sibEx[0] ? await probeKw(`${make} ${sibEx[0].model}`) : null; }
        umbrellas.push(flag);
      }
      umbrellas.sort((a, b) => b.siblingCount - a.siblingCount);
      out.push({ make, archiveTotal: total, truncated: total >= 100000, interest: makeInterest.get(norm(make)) || 0, umbrellaFlags: umbrellas.filter(u => u.siblingCount > 0), topModels: top });
    }
    out.sort((a, b) => (b.interest - a.interest) || (b.archiveTotal - a.archiveTotal));
    return res.status(200).json({ task: "fragscan", probe, meteredThisRun: metered, spentToday: spent0, makes: out });
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
      { partner: "Chris Carbine", handles: ["carbine123"] },
      { partner: "Spencer Bailey", handles: ["SpecWerksLTD"] }
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
      { partner: "Chris Carbine", handles: ["carbine123"] },
      { partner: "Spencer Bailey", handles: ["SpecWerksLTD"] }
    ];
    // ?only=<handle> fetches a SINGLE partner (bounded spend, e.g. one new partner's
    // history), instead of re-paging the whole roster. Case-insensitive handle match.
    const only = req.query?.only ? String(req.query.only).toLowerCase() : null;
    const activeRoster = only ? roster.filter(e => e.handles.some(h => h.toLowerCase() === only)) : roster;
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
    for (const entry of activeRoster) {
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

  // task=histfetch: the historical comp backfill. Warming (fill) only fetches each
  // model's RECENT (~180d) sales, so a partner's 2019-2024 sale has no comps in its
  // +/-6mo window and stays unmatched (the recent-bias that pins Dan/Chris to a thin
  // recent slice). This pages each TARGETED model's SOLD history back through time
  // (to ~2018) across the 8 US platforms and persists it, so every partner sale finds
  // like-for-like comps. Budget-guarded (daily cap), resumable, drain/cron-able.
  if (task === "histfetch") {
    if (!env) return res.status(500).json({ error: "Supabase env not set." });
    const spent0 = await meteredToday();
    const budgetLeft = spent0 === null ? Infinity : Math.max(0, dailyBudget - spent0);
    if (budgetLeft <= 0) return res.status(200).json({ task: "histfetch", skipped: "daily_budget_spent", spentToday: spent0, dailyBudget });
    const US8 = new Set(["bringatrailer", "bat", "carsandbids", "hagerty", "pcarmarket", "sothebysmotorsport", "hemmings", "autohunter", "mbmarket"]);
    const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const floor = String(req.query?.floor || "2018-01-01");
    const maxPagesPerModel = Math.max(2, Math.min(30, Number(req.query?.pages || 16)));
    let metered = 0, persisted = 0, modelsProcessed = 0, ocdRemaining = null;
    const t0 = Date.now();
    async function doModel(make, model) {
      const recs = [];
      for (let page = 1; page <= maxPagesPerModel; page++) {
        if (budgetLeft !== Infinity && metered >= budgetLeft) break;
        metered++;
        let resp; try { resp = await callOldCarsData("/auctions", { keyword: `${make} ${model}`, status: "sold", sort: "date", direction: "desc", page, limit: 50 }, apiKey); } catch (e) { if (e.rateLimited) throw e; break; }
        if (resp.__rateLimit && resp.__rateLimit.remaining != null) ocdRemaining = Number(resp.__rateLimit.remaining);
        const rows = resp.data || [];
        if (!rows.length) break;
        for (const r of rows) { const mm = persistableMakeModel(r); if (US8.has(norm(r.platform || r.source)) && norm(mm.make) === norm(make) && norm(mm.model) === norm(model)) recs.push(r); }
        const oldest = rows.map(r => r.auction_end_date).filter(Boolean).sort()[0];
        if (oldest && String(oldest).slice(0, 10) < floor) break;
        if (rows.length < 50) break;
        if (page >= (resp.meta?.total_pages || 1)) break;
      }
      if (recs.length) {
        const payload = recs.map(record => ({
          source: recordPlatform(record), source_record_id: stableRecordId(record), source_url: record.url || record.listing_url || null, platform: recordPlatform(record),
          ...persistableMakeModel(record), year: record.year || null, raw_title: record.title || record.listing_title || null,
          price: Number(record.price ?? record.sold_price ?? record.final_price ?? record.current_bid) || null,
          auction_status: record.auction_status || record.status || null, auction_end_date: record.auction_end_date || null,
          seller_username: record.seller_username || null, raw_record: record
        })).filter(p => p.source_record_id);
        if (payload.length) { try { await supabaseInsert("vehicle_market_records", payload, env.supabaseUrl, env.supabaseKey, "resolution=ignore-duplicates,return=minimal", "?on_conflict=source,source_record_id"); persisted += payload.length; } catch (e) { /* non-fatal */ } }
      }
    }
    // AD-HOC models slice: &models=Make:Model,Make:Model persists exactly those
    // nameplates (one-off, does not touch the standing cursor). Used to backfill a
    // family's badge nameplates (E350, E550, E63 ...) so the fragmentation fix has
    // badge records to defrag under the family head.
    if (req.query?.models) {
      const pairs = String(req.query.models).split(",").map(s => s.trim()).filter(Boolean)
        .map(s => { const i = s.indexOf(":"); return i < 0 ? null : [s.slice(0, i).trim(), s.slice(i + 1).trim()]; })
        .filter(p => p && p[0] && p[1]);
      let nextIdx = 0, stopReason = "list_done";
      try { for (let i = 0; i < pairs.length; i++) { if (budgetLeft !== Infinity && metered >= budgetLeft) { stopReason = "budget"; break; } if (Date.now() - t0 > 230000) { stopReason = "time"; break; } await doModel(pairs[i][0], pairs[i][1]); modelsProcessed++; nextIdx = i + 1; } }
      catch (e) { stopReason = "ratelimit"; }
      if (env && metered > 0) { try { await recordUsageEvent({ event_type: "adhoc_histfetch", route: "histfetch?models", status: stopReason, oldcarsdata_metered_requests: metered, duration_ms: 0, metadata: { models: pairs.map(p => p.join(" ")), persisted } }, env.supabaseUrl, env.supabaseKey); } catch { /* non-fatal */ } }
      return res.status(200).json({ task: "histfetch", mode: "adhoc", models: pairs.map(p => p.join(" ")), modelCount: pairs.length, nextIdx, done: nextIdx >= pairs.length, meteredThisRun: metered, persistedThisRun: persisted, modelsProcessed, stopReason, ocdRemaining, spentToday: spent0, dailyBudget });
    }
    // PARTNERS priority slice: fetch the DISTINCT models these partners actually sold
    // FIRST (one-off, ahead of the standing interest x gap queue; does not touch the
    // standing cursor). Used to stabilize a specific partner's four numbers fast.
    if (req.query?.partners) {
      const handles = String(req.query.partners).split(",").map(s => s.trim()).filter(Boolean);
      const inList = handles.map(h => `"${h}"`).join(",");
      const rows = await supabaseSelect(env, `vehicle_market_records?seller_username=in.(${encodeURIComponent(inList)})&select=raw_record&limit=5000`);
      const set = new Map();
      for (const r of (rows || [])) { const rec = r.raw_record || {}; const mk = String(rec.ocd_make_name || rec.listing_make || "").trim(), md = String(rec.ocd_model_name || rec.listing_model || "").trim(); if (mk && md) { const k = `${mk}|${md}`; const e = set.get(k) || { make: mk, model: md, n: 0 }; e.n++; set.set(k, e); } }
      const queue = [...set.values()].sort((a, b) => b.n - a.n).map(e => [e.make, e.model]);
      const offset = Math.max(0, Number(req.query?.offset || 0)); // resume point (queue is deterministic)
      let nextIdx = offset, stopReason = "list_done";
      try { for (let i = offset; i < queue.length; i++) { if (budgetLeft !== Infinity && metered >= budgetLeft) { stopReason = "budget"; break; } if (Date.now() - t0 > 230000) { stopReason = "time"; break; } await doModel(queue[i][0], queue[i][1]); modelsProcessed++; nextIdx = i + 1; } }
      catch (e) { stopReason = "ratelimit"; }
      if (env && metered > 0) { try { await recordUsageEvent({ event_type: "partner_histfetch", route: "histfetch?partners", status: stopReason, oldcarsdata_metered_requests: metered, duration_ms: 0, metadata: { handles, models: queue.length, offset, nextIdx, persisted } }, env.supabaseUrl, env.supabaseKey); } catch { /* non-fatal */ } }
      return res.status(200).json({ task: "histfetch", mode: "partners", partners: handles, modelCount: queue.length, offset, nextIdx, done: nextIdx >= queue.length, meteredThisRun: metered, persistedThisRun: persisted, modelsProcessed, stopReason, ocdRemaining, spentToday: spent0, dailyBudget });
    }
    // STANDARD cursor mode over the warm_targeted (soon: interest x gap) queue.
    const tRows = await supabaseSelect(env, `app_usage_events?event_type=eq.warm_targeted&select=metadata&order=created_at.desc&limit=1`);
    const models = (tRows && tRows[0] && Array.isArray(tRows[0].metadata?.models)) ? tRows[0].metadata.models : [];
    if (!models.length) return res.status(500).json({ error: "No targeted models; run task=partnerfetch first." });
    const reset = req.query?.reset === "1" || req.query?.reset === "true";
    let cursor = { index: 0, spent: 0, persisted: 0, runs: 0 };
    if (!reset) { const c = await supabaseSelect(env, `app_usage_events?event_type=eq.histfetch_cursor&select=metadata&order=created_at.desc&limit=1`); if (c && c[0] && c[0].metadata) cursor = { ...cursor, ...c[0].metadata }; }
    if (cursor.index >= models.length) return res.status(200).json({ task: "histfetch", done: true, message: "Historical backfill complete. &reset=1 to re-run.", cursor, total: models.length });
    let idx = cursor.index, stopReason = "list_done";
    try {
      while (idx < models.length) {
        if (budgetLeft !== Infinity && metered >= budgetLeft) { stopReason = "budget"; break; }
        if (Date.now() - t0 > 230000) { stopReason = "time"; break; }
        await doModel(models[idx][0], models[idx][1]);
        idx++; modelsProcessed++;
        if (modelsProcessed % 3 === 0) { try { await recordUsageEvent({ event_type: "histfetch_cursor", route: "histfetch", status: "chunk", oldcarsdata_metered_requests: 0, duration_ms: 0, metadata: { index: idx, spent: (cursor.spent || 0) + metered, persisted: (cursor.persisted || 0) + persisted, runs: (cursor.runs || 0) + 1 } }, env.supabaseUrl, env.supabaseKey); } catch { /* non-fatal */ } }
      }
    } catch (e) { stopReason = "ratelimit"; }
    const next = { index: idx, spent: (cursor.spent || 0) + metered, persisted: (cursor.persisted || 0) + persisted, runs: (cursor.runs || 0) + 1 };
    try { await recordUsageEvent({ event_type: "histfetch_cursor", route: "histfetch", status: idx >= models.length ? "complete" : stopReason, oldcarsdata_metered_requests: 0, duration_ms: 0, metadata: next }, env.supabaseUrl, env.supabaseKey); } catch { /* non-fatal */ }
    return res.status(200).json({ task: "histfetch", spentToday: spent0, meteredThisRun: metered, persistedThisRun: persisted, modelsProcessed, stopReason, ocdRemaining, cursor: next, total: models.length, done: idx >= models.length });
  }

  // task=depth: the STANDING archive-depth job. Not partner-scoped - it keeps the
  // whole enthusiast catalog historically deep, ranked by interest x coverage-gap, so
  // a future partner plugs into an already-deep archive instead of triggering a fetch
  // scramble. Universe = curated 463 seed + real search volume (app_usage_events) +
  // partner models (one input, not the driver). Interest-weighted; a model deepened
  // within REFRESH_DAYS is skipped (its gap is ~0). Budget-capped to the DEPTH slice
  // (floor(dailyBudget * OCD_DEPTH_BUDGET_FRACTION)) so it layers UNDER warm and live.
  if (task === "depth") {
    if (!env) return res.status(500).json({ error: "Supabase env not set." });
    const spent0 = await meteredToday();
    const depthFraction = Number(process.env.OCD_DEPTH_BUDGET_FRACTION || 0.4);
    const depthCap = Math.max(1, Math.floor(dailyBudget * depthFraction));
    const depthLeft = spent0 === null ? Infinity : Math.max(0, depthCap - spent0);
    const dry = req.query?.dry === "1" || req.query?.dry === "true";
    if (depthLeft <= 0 && !dry) return res.status(200).json({ task: "depth", skipped: "depth_slice_reached", spentToday: spent0, depthCap, depthFraction });
    const US8 = new Set(["bringatrailer", "bat", "carsandbids", "hagerty", "pcarmarket", "sothebysmotorsport", "hemmings", "autohunter", "mbmarket"]);
    const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const key = (mk, md) => `${norm(mk)}|${norm(md)}`;
    const floor = String(req.query?.floor || "2018-01-01");
    const maxPagesPerModel = Math.max(2, Math.min(30, Number(req.query?.pages || 16)));
    const REFRESH_DAYS = Math.max(1, Number(req.query?.refresh || 45));
    let metered = 0, persisted = 0, modelsProcessed = 0, ocdRemaining = null;
    const t0 = Date.now();
    async function deepen(make, model) {
      const recs = [];
      for (let page = 1; page <= maxPagesPerModel; page++) {
        if (metered >= depthLeft) break;
        metered++;
        let resp; try { resp = await callOldCarsData("/auctions", { keyword: `${make} ${model}`, status: "sold", sort: "date", direction: "desc", page, limit: 50 }, apiKey); } catch (e) { if (e.rateLimited) throw e; break; }
        if (resp.__rateLimit && resp.__rateLimit.remaining != null) ocdRemaining = Number(resp.__rateLimit.remaining);
        const rows = resp.data || [];
        if (!rows.length) break;
        for (const r of rows) { const mm = persistableMakeModel(r); if (US8.has(norm(r.platform || r.source)) && norm(mm.make) === norm(make) && norm(mm.model) === norm(model)) recs.push(r); }
        const oldest = rows.map(r => r.auction_end_date).filter(Boolean).sort()[0];
        if (oldest && String(oldest).slice(0, 10) < floor) break;
        if (rows.length < 50) break;
        if (page >= (resp.meta?.total_pages || 1)) break;
      }
      if (recs.length) {
        const payload = recs.map(record => ({
          source: recordPlatform(record), source_record_id: stableRecordId(record), source_url: record.url || record.listing_url || null, platform: recordPlatform(record),
          ...persistableMakeModel(record), year: record.year || null, raw_title: record.title || record.listing_title || null,
          price: Number(record.price ?? record.sold_price ?? record.final_price ?? record.current_bid) || null,
          auction_status: record.auction_status || record.status || null, auction_end_date: record.auction_end_date || null,
          seller_username: record.seller_username || null, raw_record: record
        })).filter(p => p.source_record_id);
        if (payload.length) { try { await supabaseInsert("vehicle_market_records", payload, env.supabaseUrl, env.supabaseKey, "resolution=ignore-duplicates,return=minimal", "?on_conflict=source,source_record_id"); persisted += payload.length; } catch (e) { /* non-fatal */ } }
      }
    }
    // Load the deepened-history map + the resumable cursor (which carries the ranked
    // snapshot so a mid-cycle re-run is stable even as new searches arrive).
    const histRow = await supabaseSelect(env, `app_usage_events?event_type=eq.depth_history&select=metadata&order=created_at.desc&limit=1`);
    const history = (histRow && histRow[0] && histRow[0].metadata && histRow[0].metadata.h) || {};
    const curRow = await supabaseSelect(env, `app_usage_events?event_type=eq.depth_cursor&select=metadata&order=created_at.desc&limit=1`);
    let cursor = (curRow && curRow[0] && curRow[0].metadata) || { index: 0, cycle: 0, models: null };
    const reset = req.query?.reset === "1" || req.query?.reset === "true";
    let rebuilt = false;
    if (reset || !Array.isArray(cursor.models) || cursor.index >= cursor.models.length) {
      // Rebuild the interest x gap snapshot.
      const map = new Map();
      const add = (mk, md, w) => { const a = String(mk || "").trim(), b = String(md || "").trim(); if (!a || !b) return; const k = key(a, b); const e = map.get(k) || { make: a, model: b, interest: 0 }; e.interest += w; map.set(k, e); };
      try { const seed = JSON.parse(fs.readFileSync(new URL("../scripts/warm-list.json", import.meta.url), "utf8")).models || []; for (const [mk, md] of seed) add(mk, md, 1); } catch { /* seed optional */ }
      try { const t = await supabaseSelect(env, `app_usage_events?event_type=eq.warm_targeted&select=metadata&order=created_at.desc&limit=1`); for (const [mk, md] of ((t && t[0] && t[0].metadata && t[0].metadata.models) || [])) add(mk, md, 2); } catch { /* partners optional */ }
      try { const since = new Date(Date.now() - 180 * 864e5).toISOString(); const rows = await supabaseSelect(env, `app_usage_events?event_type=eq.seller_decision&created_at=gte.${since}&select=vehicle&limit=20000`); for (const r of (rows || [])) { const v = r.vehicle || {}; add(v.make, v.model, 3); } } catch { /* search history optional */ }
      const now = Date.now();
      const ranked = [...map.values()]
        .filter(m => { const last = history[key(m.make, m.model)]; return !last || (now - new Date(last).getTime()) > REFRESH_DAYS * 864e5; })
        .sort((a, b) => b.interest - a.interest)
        .map(m => [m.make, m.model]);
      cursor = { index: 0, cycle: (cursor.cycle || 0) + 1, models: ranked, builtAt: new Date().toISOString() };
      rebuilt = true;
    }
    // dry=1 previews the ranked universe WITHOUT any OCD spend (verify the ranking).
    if (req.query?.dry === "1" || req.query?.dry === "true") {
      return res.status(200).json({ task: "depth", dry: true, depthCap, depthFraction, cycle: cursor.cycle, rebuilt, universeSize: cursor.models.length, cursorIndex: cursor.index, deepenedTotal: Object.keys(history).length, nextUp: cursor.models.slice(cursor.index, cursor.index + 40).map(([mk, md]) => `${mk} ${md}`) });
    }
    let idx = cursor.index, stopReason = "cycle_done";
    try {
      while (idx < cursor.models.length) {
        if (metered >= depthLeft) { stopReason = "budget"; break; }
        if (Date.now() - t0 > 230000) { stopReason = "time"; break; }
        const [mk, md] = cursor.models[idx];
        await deepen(mk, md);
        history[key(mk, md)] = new Date().toISOString();
        idx++; modelsProcessed++;
      }
    } catch (e) { stopReason = "ratelimit"; }
    cursor.index = idx;
    try { await recordUsageEvent({ event_type: "depth_cursor", route: "depth", status: idx >= cursor.models.length ? "cycle_complete" : stopReason, oldcarsdata_metered_requests: 0, duration_ms: 0, metadata: cursor }, env.supabaseUrl, env.supabaseKey); } catch { /* non-fatal */ }
    try { await recordUsageEvent({ event_type: "depth_history", route: "depth", status: "ok", oldcarsdata_metered_requests: 0, duration_ms: 0, metadata: { h: history, models: Object.keys(history).length } }, env.supabaseUrl, env.supabaseKey); } catch { /* non-fatal */ }
    return res.status(200).json({ task: "depth", spentToday: spent0, depthCap, depthFraction, meteredThisRun: metered, persistedThisRun: persisted, modelsProcessed, stopReason, ocdRemaining, cycle: cursor.cycle, rebuilt, universeSize: cursor.models.length, cursorIndex: idx, cycleDone: idx >= cursor.models.length, deepenedTotal: Object.keys(history).length });
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
      { partner: "Chris Carbine", handles: ["Carbine123", "carbine123"] },
      { partner: "Spencer Bailey", handles: ["SpecWerksLTD"] }
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
      // Archive-holdings breakdown (report-only, does not touch the computation):
      // how many of this partner's sold rows the archive holds, by nameplate. Answers
      // the "how many sales / across which models" vetting question before any fetch.
      const held = {};
      for (const s of sales) { const k = `${String(s.make)} ${String(s.model)}`.trim(); held[k] = (held[k] || 0) + 1; }
      const modelsHeld = Object.entries(held).sort((a, b) => b[1] - a[1]).map(([nameplate, n]) => ({ nameplate, sales: n }));
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
        modelsHeld,
        premiumPct: premium, gatePassed: deltas.length >= 10 && premium !== null && premium > 0,
        matchedDateRange: minD && maxD ? [minD, maxD] : null, rungDistribution: rungCount,
        note: deltas.length < 10 ? "below n>=10 (baseline likely not warm yet)" : premium == null ? "no median" : premium <= 0 ? "non-positive median, never renders" : "clears gate"
      });
    }
    // persist=1 writes each GATE-PASSING partner's premium into partners.specialties.premium
    // (data_verified) so the card renders it; a partner that fails the gate has it cleared
    // (never a stale tile). Matched to the partner row by seller_username. Redeploy after
    // to bust the ~10-min partners cache.
    let persisted = null;
    if (req.query?.persist === "1" || req.query?.persist === "true") {
      persisted = [];
      const partnerRows = await supabaseSelect(env, `partners?select=id,name,slug,specialties,seller_usernames&limit=50`) || [];
      for (const p of report) {
        const handles = (roster.find(r => r.partner === p.partner)?.handles || []).map(h => h.toLowerCase());
        const row = partnerRows.find(pr => (pr.seller_usernames || []).some(u => handles.includes(String(u).toLowerCase())));
        if (!row) { persisted.push({ partner: p.partner, wrote: false, reason: "no partner row matched" }); continue; }
        const spec = (row.specialties && typeof row.specialties === "object") ? { ...row.specialties } : {};
        if (p.gatePassed) spec.premium = { pct: p.premiumPct, n: p.n, source: "data_verified", computedAt: new Date().toISOString() };
        else delete spec.premium;
        try {
          const resp = await fetch(`${env.supabaseUrl}/rest/v1/partners?id=eq.${row.id}`, { method: "PATCH", headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ specialties: spec }) });
          persisted.push({ partner: p.partner, slug: row.slug, wrote: resp.ok, premiumPct: p.gatePassed ? p.premiumPct : null });
        } catch (e) { persisted.push({ partner: p.partner, wrote: false, reason: e.message }); }
      }
    }
    return res.status(200).json({ task: "premium", windowDays, gate: "n>=10, positive median, whole-percent, 8 US platforms, partners excluded", report, persisted });
  }

  // task=partnerseed: one-shot upsert of the fifth PowerSeller (Spencer Bailey /
  // SpecWerksLTD), executed server-side with the service-role key (the seed cannot be
  // pulled/run locally). Mirrors docs/supabase-partner-spencer-seed.sql exactly.
  //   default:      full upsert with active=FALSE.
  //   ?activate=1:  targeted PATCH of active=true ONLY (leaves specialties untouched,
  //                 so a premium tile persisted between seed and activate survives).
  // ORDER: seed (default) -> task=premium&persist=1 -> partnerseed&activate=1. Do NOT
  // re-run the default upsert after premium persist (merge-duplicates would overwrite
  // specialties and drop the premium tile).
  if (task === "partnerseed") {
    if (!env) return res.status(500).json({ error: "Supabase env not set." });
    const sb = (path, method, body, prefer) => fetch(`${env.supabaseUrl}/rest/v1/${path}`, {
      method,
      headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, "Content-Type": "application/json", Prefer: prefer || "return=representation" },
      body: body ? JSON.stringify(body) : undefined
    });
    if (req.query?.activate === "1" || req.query?.activate === "true") {
      const resp = await sb("partners?slug=eq.specwerks-ltd", "PATCH", { active: true, updated_at: new Date().toISOString() });
      const text = await resp.text();
      return res.status(resp.ok ? 200 : 500).json({ task: "partnerseed", action: "activate", ok: resp.ok, row: text ? JSON.parse(text) : text });
    }
    // Reconcile Howard's live coverage to his intended Mid-Atlantic/Southern + Northeast
    // reach (the live row had drifted to Northeast-only; seedPartners.js intended MD/VA/DC/
    // FL/TX/CO). Patches ONLY regions, leaving his other live fields untouched.
    if (req.query?.target === "howard") {
      const HOWARD_REGIONS = ["Nationwide", "Northeast", "New England", "East Coast", "Pennsylvania", "New Jersey", "New York", "Connecticut", "Massachusetts", "Rhode Island", "Vermont", "New Hampshire", "Maine", "Maryland", "Virginia", "Washington DC", "Florida", "Texas", "Colorado"];
      const resp = await sb("partners?slug=eq.hows-motorcars-main-line", "PATCH", { regions: HOWARD_REGIONS, updated_at: new Date().toISOString() });
      const text = await resp.text();
      return res.status(resp.ok ? 200 : 500).json({ task: "partnerseed", action: "howard-regions", ok: resp.ok, row: text ? JSON.parse(text) : text });
    }
    const SPENCER = {
      slug: "specwerks-ltd", name: "SpecWerksLTD", display_name: "Spencer Bailey", active: true,
      regions: ["Colorado", "Denver", "Mountain West", "Nationwide", "International"],
      specialties: {
        makes: ["BMW", "Mercedes-Benz", "Porsche", "Audi", "Volkswagen", "Toyota", "Nissan", "Datsun", "Honda", "Mazda", "Jeep", "Land Rover", "Ford", "Chevrolet"],
        segments: ["modern_enthusiast", "older_enthusiast", "pre_1990", "classic_european", "european_sports", "porsche", "bmw_m"],
        wheelhouse: { marques: [], models: [], display: ["Original and preserved modern classics", "1980s to early-2000s enthusiast cars", "Hands-on auction preparation"] },
        identity: "Original and preserved enthusiast cars",
        pronoun: { subj: "he", obj: "him", poss: "his" },
        intro_hook: "He personally photographs, preps and manages every car he lists.",
        notes: "Original and preserved enthusiast vehicles, particularly 1980s to early-2000s modern classics; also 1960s/70s European sports, German, Japanese and American enthusiast cars, 4x4s and unusual vehicles (per SpecWerksLTD)",
        company: "SpecWerks LTD",
        source: "partner_provided"
      },
      platforms: [{ name: "Bring a Trailer", source: "partner_provided" }],
      service_claims: [
        { text: "Based in Colorado", source: "partner_provided" },
        { text: "Full-service preparation: assessment, mechanical and cosmetic repairs, return-to-stock, detailing and photography handled personally, with paint and body coordinated through outside specialists", source: "partner_provided" },
        { text: "Ships cars nationwide and works with sellers internationally", source: "partner_provided" },
        { text: "Recommends work only where he believes it is worthwhile, and discloses remaining flaws honestly", source: "partner_provided" }
      ],
      seller_usernames: ["SpecWerksLTD"],
      referral_terms: null, min_value_usd: 35000, updated_at: new Date().toISOString()
    };
    const resp = await sb("partners?on_conflict=slug", "POST", [SPENCER], "resolution=merge-duplicates,return=representation");
    const text = await resp.text();
    if (!resp.ok) return res.status(500).json({ task: "partnerseed", action: "seed", ok: false, error: text.slice(0, 400) });
    return res.status(200).json({ task: "partnerseed", action: "seed", ok: true, row: text ? JSON.parse(text) : null });
  }

  return res.status(400).json({ error: "Unknown ops task. Use ?view=ops&task=probe|fill|handles|partnerfetch|premium|partnerseed." });
}

// ===================== BUSINESS DASHBOARD (Phase 2) =====================
// Reads the verified journeys / journey_events tables. Canonical, tier-filtered,
// cohort-based. "Not yet tracked" (NYT) is shown wherever the capture mechanism has
// produced no data yet - never a fabricated 0. Downstream lifecycle (listed/sold/
// revenue) is manual (Phase 3) and reads NYT until the first real entry.
const NYT = `<span style="color:#a29e95;font-style:italic">Not yet tracked</span>`;
const fmtN = n => (n == null ? "0" : Number(n).toLocaleString());
const fmtPct = (num, den) => (den > 0 ? `${(100 * num / den).toFixed(num / den >= 0.1 ? 0 : 1)}%` : NYT);
const fmtMoney = n => (n == null ? NYT : "$" + Math.round(Number(n)).toLocaleString());
const bizKey = req => adminEsc(req.query?.key || "");

// --- Timezone (Item 2): all dashboard dates render in ET (America/New_York) to match
// the quota-day boundary (reserve_search day-truncates in the same zone). ---
const ET_TZ = "America/New_York";
const fmtDayET = t => t ? new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: ET_TZ }) : "";
const fmtDateTimeET = t => { if (!t) return ""; try { return new Date(t).toLocaleString("en-US", { timeZone: ET_TZ, timeZoneName: "short" }); } catch { return String(t); } };
// ms that ET is ahead of UTC at `date` (handles DST); used to align "today" to the ET day.
function etOffsetMs(date) {
  const dtf = new Intl.DateTimeFormat("en-US", { timeZone: ET_TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const m = {}; for (const p of dtf.formatToParts(date)) m[p.type] = p.value;
  return Date.UTC(+m.year, +m.month - 1, +m.day, +m.hour, +m.minute, +m.second) - date.getTime();
}
function etDayStart(date) {
  const off = etOffsetMs(date);
  const wall = new Date(date.getTime() + off);
  const mid = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate(), 0, 0, 0);
  return new Date(mid - off);
}
// ET midnight of a YYYY-MM-DD (+addDays), as a UTC Date. For custom ranges (Item 4):
// from = etMidnight(from,0), to = etMidnight(to,1) so the end date is inclusive.
function etMidnightFromYMD(ymd, addDays) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || "").trim());
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3] + (addDays || 0);
  const guess = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0)); // noon UTC near the target ET day (DST-safe)
  const off = etOffsetMs(guess);
  return new Date(Date.UTC(y, mo - 1, d, 0, 0, 0) - off);
}
// Signed-in requester emails for a set of journey user_ids (accounts table). Chunked to
// keep the PostgREST in-list URL bounded. Item 1: Journey Explorer email column.
async function fetchEmailsByUserId(env, userIds) {
  const map = new Map();
  const ids = [...new Set((userIds || []).filter(Boolean))];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100).join(",");
    const accs = (await supabaseSelect(env, `accounts?user_id=in.(${chunk})&select=user_id,email`)) || [];
    for (const a of accs) map.set(a.user_id, a.email);
  }
  return map;
}
// Preserve the Journey Explorer search filters across range/mode toggles so switching
// Today/7d/custom keeps the current search + region + person filter (Items 2/4).
function bizExtraQS(req) {
  return ["q", "stage", "ps", "plat", "region", "uid", "aid", "sort"].filter(n => req.query?.[n]).map(n => `&${n}=${encodeURIComponent(req.query[n])}`).join("");
}

// Item 2: US Census Bureau 4 regions. The map now lives in lib/_regions.js so the dashboard
// Region column and the PowerSeller region-proximity ranking share ONE definition.
const stateRegion = censusRegion;

// --- Journey Explorer new columns (Item 1): asking price, sell preference, timing.
// All three come from journeys.vehicle_attrs (price / preference / timeline), captured
// in the wizard and written by record_journey_event. Display-only. ---
const fmtAsk = p => {
  if (p == null || p === "") return "";
  const n = Number(String(p).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? "$" + Math.round(n).toLocaleString() : adminEsc(String(p));
};
const prefLabel = p => {
  const s = String(p || "").toLowerCase().trim();
  if (!s) return "";
  if (s.includes("power") || s === "handle" || s.includes("handle")) return "Handle everything";
  if (s === "diy" || s.includes("myself")) return "Myself";
  if (s.includes("unsure") || s.includes("not sure") || s === "notsure") return "Not sure";
  return adminEsc(String(p));
};
const attrOf = (j, k) => (j && j.vehicle_attrs && typeof j.vehicle_attrs === "object") ? j.vehicle_attrs[k] : null;

// --- CSV (Item 4): RFC-4180-ish serialization. Objects become JSON strings. ---
function csvCell(v) {
  if (v == null) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function toCsv(headers, rows) {
  return [headers.map(csvCell).join(","), ...rows.map(r => r.map(csvCell).join(","))].join("\r\n");
}

// Internal-cohort filter (mirrors crew filter): default EXCLUDE crew/tester/internal
// so business numbers reflect real sellers. Tier is derived from the journey's
// recommendation_completed event metadata; journeys with no rec event are treated as
// real (early-funnel), never as internal.
function bizMode(req) { const c = String(req.query?.biz || "exclude").toLowerCase(); return (c === "include" || c === "only") ? c : "exclude"; }

function bizRange(req) {
  const r = String(req.query?.range || "7d").toLowerCase();
  const now = new Date();
  let since, label;
  if (r === "today") { since = etDayStart(now); label = "Today (ET)"; }   // ET day, matching the quota-day boundary
  else if (r === "30d") { since = new Date(now - 30 * 864e5); label = "Last 30 days"; }
  else if (r === "all") { since = new Date("2026-08-01T00:00:00Z"); label = "All time (since launch)"; }
  else if (r === "custom" && req.query?.from) { since = etMidnightFromYMD(String(req.query.from), 0) || new Date(now - 7 * 864e5); label = `${req.query.from} to ${req.query.to || "now"} (ET)`; }
  else { since = new Date(now - 7 * 864e5); label = "Last 7 days"; }
  // Custom end date is inclusive: use the ET start of the day AFTER `to`.
  const to = (r === "custom" && req.query?.to) ? (etMidnightFromYMD(String(req.query.to), 1) || now) : now;
  return { sinceIso: since.toISOString(), toIso: to.toISOString(), label, range: r };
}

async function anyRows(env, filter) {
  const rows = await supabaseSelect(env, `journeys?${filter}&select=journey_id&limit=1`);
  return !!(rows && rows.length);
}

// One canonical computation of every business number for a range + cohort mode.
async function computeBusiness(env, range, mode) {
  const JCOLS = "journey_id,anon_id,user_id,vehicle_year,vehicle_make,vehicle_model,vehicle_trim,vehicle_location,vehicle_attrs,rec_platform,rec_powerseller,rec_scope,rec_window,rec_estimated_value,stage,sale_status,listed_at,consignment_at,sold_at,sale_price,gas_revenue,actual_platform,listing_url,created_at,last_activity_at,contacted_at,engaged_at,intro_sent_at,intro_requested_at";
  const journeysAll = (await supabaseSelect(env, `journeys?created_at=gte.${encodeURIComponent(range.sinceIso)}&created_at=lt.${encodeURIComponent(range.toIso)}&select=${JCOLS}&order=created_at.desc&limit=5000`)) || [];
  const events = (await supabaseSelect(env, `journey_events?occurred_at=gte.${encodeURIComponent(range.sinceIso)}&select=journey_id,event_type,platform_id,powerseller_id,metadata,occurred_at&order=occurred_at.asc&limit=30000`)) || [];

  // tier per journey (from its recommendation_completed event metadata)
  const tierBy = new Map();
  for (const e of events) if (e.event_type === "recommendation_completed" && e.metadata && e.metadata.tier) tierBy.set(e.journey_id, e.metadata.tier);
  // entry method per journey (from its seller_journey_started metadata): "vin" | "typed".
  // Boolean provenance only - the raw VIN is never stored in the metadata or here.
  // DEDICATED fetch (not the capped `events` array above): that fetch is asc-ordered with
  // a 30k cap, so over a 30d window it truncates the NEWEST events - and VIN is a new
  // feature, so every VIN journey is recent and would silently drop from the map. Scoped
  // to one event type (one row per journey), this stays tiny and complete at any range.
  const entryMethodBy = new Map();
  const startEvents = (await supabaseSelect(env, `journey_events?event_type=eq.seller_journey_started&occurred_at=gte.${encodeURIComponent(range.sinceIso)}&select=journey_id,metadata&limit=20000`)) || [];
  for (const e of startEvents) if (e.metadata && e.metadata.entry_method) entryMethodBy.set(e.journey_id, e.metadata.entry_method);
  const internal = j => isInternalTier(tierBy.get(j.journey_id)) || tierBy.get(j.journey_id) === "internal";
  const journeys = journeysAll.filter(j => mode === "include" ? true : mode === "only" ? internal(j) : !internal(j));
  const idset = new Set(journeys.map(j => j.journey_id));
  const evts = events.filter(e => idset.has(e.journey_id));

  // per-journey event-type presence
  const has = {};
  const EV = ["seller_journey_started", "vehicle_identified", "seller_questions_completed", "recommendation_completed", "platform_recommended", "powerseller_recommended", "platform_cta_viewed", "powerseller_card_viewed", "platform_cta_clicked", "powerseller_intro_clicked", "powerseller_contact_form_shown", "powerseller_intro_requested"];
  for (const t of EV) has[t] = new Set();
  for (const e of evts) if (has[e.event_type]) has[e.event_type].add(e.journey_id);

  const uniqueSellers = new Set(journeys.map(j => j.user_id || j.anon_id).filter(Boolean)).size;
  const started = journeys.length;
  const recs = has.recommendation_completed.size;
  const platRec = has.platform_recommended.size;
  const psRec = has.powerseller_recommended.size;
  const platViews = has.platform_cta_viewed.size;
  const platClicks = has.platform_cta_clicked.size;
  const psCardViews = has.powerseller_card_viewed.size;
  const psIntroClicks = has.powerseller_intro_clicked.size;
  const psFormShown = has.powerseller_contact_form_shown.size;
  const psIntros = has.powerseller_intro_requested.size;
  // Email-capture abandonment (anonymous path only - signed-in sellers never see the
  // form, they submit immediately). A journey that showed the form but never reached
  // intro_requested balked at the email ask: the most convertible lost user.
  const psFormAbandoned = [...has.powerseller_contact_form_shown].filter(id => !has.powerseller_intro_requested.has(id)).length;

  // downstream (manual) - NYT until any journey anywhere carries the field
  const [soldTracked, listedTracked, gmvTracked, revTracked, actualTracked] = await Promise.all([
    anyRows(env, "sale_status=not.is.null"), anyRows(env, "or=(listed_at.not.is.null,consignment_at.not.is.null,sale_status.not.is.null)"),
    anyRows(env, "sale_price=not.is.null"), anyRows(env, "gas_revenue=not.is.null"), anyRows(env, "actual_platform=not.is.null")
  ]);
  const listings = journeys.filter(j => j.sale_status === "listed" || j.sale_status === "sold" || j.listed_at || j.consignment_at).length;
  const sold = journeys.filter(j => j.sale_status === "sold").length;
  const gmv = journeys.reduce((s, j) => s + (j.sale_status === "sold" && Number.isFinite(Number(j.sale_price)) ? Number(j.sale_price) : 0), 0);
  const revenue = journeys.reduce((s, j) => s + (Number.isFinite(Number(j.gas_revenue)) ? Number(j.gas_revenue) : 0), 0);

  return { range, mode, journeys, evts, has, tierBy, entryMethodBy,
    uniqueSellers, started, recs, platRec, psRec, platViews, platClicks, psCardViews, psIntros,
    psIntroClicks, psFormShown, psFormAbandoned,
    listings, sold, gmv, revenue, soldTracked, listedTracked, gmvTracked, revTracked, actualTracked };
}

function bizChrome(title, key, active) {
  const nav = (v, label) => `<a href="?view=${v}&key=${adminEsc(key || "")}"${v === active ? ' style="font-weight:700;color:#0b5c3e"' : ""}>${label}</a>`;
  return `<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${adminEsc(title)}</title>
<style>
:root{--ink:#16140f;--slate:#6b6861;--line:#e3e1db;--green:#0b5c3e;--paper:#fff;--shade:#f6f5f2}
body{font:14px/1.55 system-ui,-apple-system,sans-serif;margin:0;color:var(--ink);background:var(--shade)}
.wrap{max-width:1120px;margin:0 auto;padding:22px 26px 80px}
h1{font-size:22px;margin:0 0 2px}h2{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--slate);margin:34px 0 10px}
nav.top{display:flex;gap:16px;font-size:13px;padding-bottom:14px;border-bottom:1px solid var(--line);margin-bottom:8px;flex-wrap:wrap}
nav.top a{color:var(--slate);text-decoration:none}
.sub{color:var(--slate);font-size:13px;margin-bottom:6px}
.filters a{margin-right:10px;font-size:12.5px;color:var(--slate);text-decoration:none;padding:2px 8px;border-radius:20px;border:1px solid transparent}
.filters a.on{background:var(--green);color:#fff}
.kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px;margin-top:8px}
.kpi{background:var(--paper);border:1px solid var(--line);border-radius:8px;padding:13px 15px}
.kpi .n{font-size:26px;font-weight:650;line-height:1.1}.kpi .l{font-size:12px;color:var(--slate);margin-top:3px}.kpi .s{font-size:11px;color:#a29e95;margin-top:2px}
.funnel{background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:16px 18px}
.fstage{display:flex;align-items:center;gap:14px;padding:7px 0}
.fbar{height:30px;border-radius:5px;background:linear-gradient(90deg,#0b5c3e,#0f6b49);min-width:2px}
.fstage .lab{width:230px;font-size:13px}.fstage .cnt{width:70px;text-align:right;font-weight:650;font-variant-numeric:tabular-nums}
.fconv{font-size:11.5px;color:var(--slate);margin:0 0 0 244px;padding:1px 0}
.split{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:12px}
.path{background:var(--paper);border:1px solid var(--line);border-radius:8px;padding:12px 15px}
.path h3{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--slate);margin:0 0 8px}
.path .r{display:flex;justify-content:space-between;padding:3px 0;font-size:13px;border-bottom:1px dashed var(--line)}
table{border-collapse:collapse;width:100%;margin-top:8px;background:var(--paper)}
td,th{border:1px solid var(--line);padding:6px 9px;text-align:left;font-size:12.5px;vertical-align:top}
th{background:var(--shade);font-weight:600;font-size:11.5px}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
.samp{color:#a29e95;font-size:11px}
input[type=text]{padding:6px 9px;border:1px solid var(--line);border-radius:6px;font:inherit;width:220px}
a.jlink{color:var(--green);text-decoration:none}
.note{background:#fff9ec;border:1px solid #f0e2c0;border-radius:7px;padding:9px 13px;font-size:12.5px;color:#6b5a2a;margin-top:8px}
.tl{border-left:2px solid var(--line);margin-left:8px;padding-left:16px}
.tl .ev{margin:0 0 12px;position:relative}.tl .ev:before{content:"";position:absolute;left:-22px;top:5px;width:8px;height:8px;border-radius:50%;background:var(--green)}
.tl .d{font-size:11px;color:var(--slate);text-transform:uppercase;letter-spacing:.04em}
</style>
<div class="wrap">
<nav class="top">${nav("business", "BUSINESS")}${nav("journeys", "Journeys")}${nav("visitors", "Visitors")}${nav("economics", "Economics")}${nav("quality", "Quality")}<span style="color:#c9c5bc">|</span><span style="color:#a29e95;font-size:12px">Engineering / Costs:</span>${nav("usage", "usage")}${nav("searches", "searches")}${nav("cars", "cars")}${nav("geo", "geo")}${nav("accounts", "accounts")}${nav("outbound", "outbound")}<span style="margin-left:auto;color:#a29e95;font-size:12px" title="All dates and times on this dashboard are shown in US Eastern Time, matching the daily quota boundary.">All times ET (America/New_York)</span></nav>
${title !== "__bare" ? `<h1>${adminEsc(title)}</h1>` : ""}`;
}

function bizFilters(req, view, opts = {}) {
  const k = bizKey(req), r = String(req.query?.range || "7d"), m = bizMode(req);
  const xq = bizExtraQS(req);
  const rl = [["today", "Today"], ["7d", "7 days"], ["30d", "30 days"], ["all", "All time"]];
  const rangeLinks = rl.map(([v, l]) => `<a class="${r === v ? "on" : ""}" href="?view=${view}&range=${v}&biz=${m}&key=${k}${xq}">${l}</a>`).join("");
  // Custom date range (Item 4): start/end dates, applied in ET. Preserves mode + search
  // filters via hidden inputs, so it works the same as the fixed buttons and with CSV.
  const from = adminEsc(req.query?.from || ""), to = adminEsc(req.query?.to || "");
  const hid = ["q", "stage", "ps", "plat", "sort"].filter(n => req.query?.[n]).map(n => `<input type="hidden" name="${n}" value="${adminEsc(req.query[n])}">`).join("");
  const customForm = `<form method="get" style="display:inline-flex;gap:5px;align-items:center;margin-left:6px;vertical-align:middle"><input type="hidden" name="view" value="${view}"><input type="hidden" name="biz" value="${m}"><input type="hidden" name="key" value="${k}"><input type="hidden" name="range" value="custom">${hid}<span style="color:#6b6861;font-size:12px">Custom${r === "custom" ? " ●" : ""}:</span> <input type="date" name="from" value="${from}" style="padding:3px 5px;border:1px solid var(--line);border-radius:5px;font:inherit"><span style="color:#a29e95">to</span> <input type="date" name="to" value="${to}" style="padding:3px 5px;border:1px solid var(--line);border-radius:5px;font:inherit"> <button>Apply</button></form>`;
  if (opts.noMode) return `<div class="filters" style="margin:6px 0">${rangeLinks}${customForm}</div>`;
  const ml = [["exclude", "Real sellers"], ["include", "All (incl. testers)"], ["only", "Testers only"]];
  const modeLinks = ml.map(([v, l]) => `<a class="${m === v ? "on" : ""}" href="?view=${view}&range=${r}&biz=${v}&key=${k}${r === "custom" ? `&from=${encodeURIComponent(req.query?.from || "")}&to=${encodeURIComponent(req.query?.to || "")}` : ""}${xq}">${l}</a>`).join("");
  return `<div class="filters" style="margin:6px 0">${rangeLinks}${customForm} <span style="color:#c9c5bc">&nbsp;|&nbsp;</span> ${modeLinks}</div>`;
}

async function renderBusinessView(req, res) {
  const env = supabaseEnv(); if (!env) return res.status(500).json({ error: "storage not configured" });
  const range = bizRange(req), mode = bizMode(req), key = req.query?.key;
  const b = await computeBusiness(env, range, mode);

  // funnel (cohort of journeys started in range). Platform & PowerSeller kept separate.
  const stage = (lab, n, den) => {
    const w = den > 0 ? Math.max(2, Math.round(560 * n / den)) : 2;
    return `<div class="fstage"><div class="lab">${lab}</div><div class="cnt">${fmtN(n)}</div><div class="fbar" style="width:${w}px"></div></div>`;
  };
  const conv = (n, den) => `<div class="fconv">&darr; ${fmtPct(n, den)} of previous</div>`;
  const funnel = `<div class="funnel">
    ${stage("Unique sellers", b.uniqueSellers, b.uniqueSellers)}
    ${stage("Seller journeys started", b.started, b.uniqueSellers)}${conv(b.started, b.uniqueSellers)}
    ${stage("Recommendations completed", b.recs, b.started)}${conv(b.recs, b.started)}
    <div class="split">
      <div class="path"><h3>Platform path</h3>
        <div class="r"><span>Platform recommended</span><b>${fmtN(b.platRec)}</b></div>
        <div class="r"><span>CTA viewed</span><b>${fmtN(b.platViews)}</b></div>
        <div class="r"><span>CTA clicked</span><b>${fmtN(b.platClicks)}</b> <span class="samp">${fmtPct(b.platClicks, b.platRec)} of recommended</span></div>
      </div>
      <div class="path"><h3>PowerSeller path</h3>
        <div class="r"><span>PowerSeller recommended</span><b>${fmtN(b.psRec)}</b></div>
        <div class="r"><span>Card viewed</span><b>${fmtN(b.psCardViews)}</b></div>
        <div class="r"><span>Intro clicked</span><b>${fmtN(b.psIntroClicks)}</b> <span class="samp">${fmtPct(b.psIntroClicks, b.psCardViews)} of card views</span></div>
        <div class="r"><span>Contact form shown</span><b>${fmtN(b.psFormShown)}</b> <span class="samp">anonymous only</span></div>
        <div class="r"><span>Introduction requested</span><b>${fmtN(b.psIntros)}</b> <span class="samp">${fmtPct(b.psIntros, b.psCardViews)} of card views</span></div>
        <div class="r"><span>Abandoned at email step</span><b>${fmtN(b.psFormAbandoned)}</b> <span class="samp">form shown, no lead</span></div>
      </div>
    </div>
    ${stage("Listings / consignments", b.listedTracked ? b.listings : 0, b.started)}${b.listedTracked ? conv(b.listings, b.recs) : `<div class="fconv">${NYT} (manual entry, Phase 3)</div>`}
    ${stage("Vehicles sold", b.soldTracked ? b.sold : 0, b.started)}${b.soldTracked ? conv(b.sold, Math.max(b.listings, 1)) : `<div class="fconv">${NYT} (manual entry, Phase 3)</div>`}
  </div>`;

  // KPI cards
  const kpi = (n, l, s) => `<div class="kpi"><div class="n">${n}</div><div class="l">${l}</div>${s ? `<div class="s">${s}</div>` : ""}</div>`;
  const sellThrough = (b.listedTracked && b.listings >= 5) ? fmtPct(b.sold, b.listings) : NYT;
  const kpis = `<div class="kpis">
    ${kpi(fmtN(b.uniqueSellers), "Unique sellers")}
    ${kpi(fmtN(b.started), "Seller journeys")}
    ${kpi(fmtN(b.recs), "Completed recommendations")}
    ${kpi(fmtPct(b.recs, b.started), "Recommendation completion rate")}
    ${kpi(fmtN(b.platRec), "Platform recommendations")}
    ${kpi(fmtN(b.psRec), "PowerSeller recommendations")}
    ${kpi(fmtN(b.platClicks), "Platform CTA clicks")}
    ${kpi(fmtPct(b.platClicks, b.platRec), "Platform CTA conversion", "clicks / platform recommended")}
    ${kpi(fmtN(b.psCardViews), "PowerSeller card views")}
    ${kpi(fmtN(b.psIntros), "PowerSeller introductions")}
    ${kpi(fmtPct(b.psIntros, b.psCardViews), "PowerSeller intro conversion", "requests / card views")}
    ${kpi(fmtN(b.psFormAbandoned), "Abandoned at email step", "form shown, no lead (anon)")}
    ${kpi(b.listedTracked ? fmtN(b.listings) : NYT, "Consignments / listings")}
    ${kpi(b.soldTracked ? fmtN(b.sold) : NYT, "Vehicles sold")}
    ${kpi(sellThrough, "Sell-through rate", b.listedTracked ? "sold / listed (needs 5+ listings)" : "")}
    ${kpi(b.gmvTracked ? fmtMoney(b.gmv) : NYT, "Sale value influenced (GMV)")}
    ${kpi(b.revTracked ? fmtMoney(b.revenue) : NYT, "GoAskSam revenue")}
    ${kpi(b.revTracked && b.recs > 0 ? fmtMoney(b.revenue / b.recs) : NYT, "Revenue per completed journey")}
  </div>`;

  // PowerSeller performance (sample sizes always shown; no performance ranking yet)
  const psRows = {};
  const bump = (map, id, k2, v = 1) => { if (!id) return; (map[id] = map[id] || {}).name = id; map[id][k2] = (map[id][k2] || 0) + v; };
  for (const e of b.evts) {
    if (e.event_type === "powerseller_card_viewed") bump(psRows, e.powerseller_id, "cards");
    if (e.event_type === "powerseller_intro_requested") bump(psRows, e.powerseller_id, "intros");
  }
  for (const j of b.journeys) if (j.rec_powerseller) { const m = psRows[j.rec_powerseller] = psRows[j.rec_powerseller] || { name: j.rec_powerseller }; if (j.intro_sent_at) m.sent = (m.sent || 0) + 1; if (j.contacted_at) m.contacts = (m.contacts || 0) + 1; if (j.engaged_at) m.engaged = (m.engaged || 0) + 1; if (j.consignment_at) m.consign = (m.consign || 0) + 1; if (j.sale_status === "sold") { m.sold = (m.sold || 0) + 1; m.gmv = (m.gmv || 0) + (Number(j.sale_price) || 0); m.rev = (m.rev || 0) + (Number(j.gas_revenue) || 0); } }
  const psTable = Object.values(psRows).sort((a, z) => (z.cards || 0) - (a.cards || 0)).map(p => `<tr><td>${adminEsc(p.name)}</td><td class="num">${fmtN(p.cards || 0)}</td><td class="num">${fmtN(p.intros || 0)}</td><td class="num">${(p.cards || 0) >= 5 ? fmtPct(p.intros || 0, p.cards || 0) : `<span class="samp">n=${p.cards || 0}</span>`}</td><td class="num">${b.actualTracked ? fmtN(p.sent || 0) : NYT}</td><td class="num">${b.actualTracked ? fmtN(p.contacts || 0) : NYT}</td><td class="num">${b.actualTracked ? fmtN(p.consign || 0) : NYT}</td><td class="num">${b.soldTracked ? fmtN(p.sold || 0) : NYT}</td><td class="num">${b.gmvTracked ? fmtMoney(p.gmv || 0) : NYT}</td></tr>`).join("");
  const psSection = `<h2>PowerSeller performance</h2><div class="note">Sample sizes shown; conversion is only computed at 5+ card views, and PowerSellers are never ranked by performance on small samples. Downstream columns are manual (Phase 3).</div>
    <table><tr><th>PowerSeller</th><th class="num">Cards shown</th><th class="num">Intro requests</th><th class="num">Intro rate</th><th class="num">Intros sent</th><th class="num">Contacts</th><th class="num">Consignments</th><th class="num">Sold</th><th class="num">Sale value</th></tr>${psTable || `<tr><td colspan=9>No PowerSeller activity in range.</td></tr>`}</table>`;

  // Platform performance + Sam-recommended vs actually-chosen
  const platRows = {};
  for (const e of b.evts) { if (e.event_type === "platform_recommended") bump(platRows, e.platform_id, "rec"); if (e.event_type === "platform_cta_viewed") bump(platRows, e.platform_id, "views"); if (e.event_type === "platform_cta_clicked") bump(platRows, e.platform_id, "clicks"); }
  const platTable = Object.values(platRows).sort((a, z) => (z.rec || 0) - (a.rec || 0)).map(p => `<tr><td>${adminEsc(p.name)}</td><td class="num">${fmtN(p.rec || 0)}</td><td class="num">${fmtN(p.views || 0)}</td><td class="num">${fmtN(p.clicks || 0)}</td><td class="num">${(p.rec || 0) >= 5 ? fmtPct(p.clicks || 0, p.rec || 0) : `<span class="samp">n=${p.rec || 0}</span>`}</td><td class="num">${b.actualTracked ? "" : NYT}</td></tr>`).join("");
  const followed = b.actualTracked ? (() => { const withBoth = b.journeys.filter(j => j.rec_platform && j.actual_platform); const match = withBoth.filter(j => j.rec_platform === j.actual_platform).length; return withBoth.length ? `${match} of ${withBoth.length} (${fmtPct(match, withBoth.length)}) sold on Sam's recommended platform` : NYT; })() : NYT;
  const platSection = `<h2>Platform performance</h2>
    <table><tr><th>Platform</th><th class="num">Recommendations</th><th class="num">CTA views</th><th class="num">CTA clicks</th><th class="num">Click-through</th><th class="num">Known sales</th></tr>${platTable || `<tr><td colspan=6>No platform activity in range.</td></tr>`}</table>
    <div class="sub" style="margin-top:10px"><b>Sam recommended vs. actually chosen:</b> ${followed} <span class="samp">(a CTA click is intent, not confirmed use; the actual platform is captured manually in Phase 3)</span></div>`;

  // Acquisition (Phase 4): first-touch source per journey, derived from the earliest
  // event that carries client attribution. Journeys with no captured touch (pre-Phase-4
  // or attribution blocked) count as "Unknown" - never silently folded into Direct.
  const firstTouch = new Map();
  for (const e of b.evts) { const a = e.metadata && e.metadata.attribution; if (a && a.first && !firstTouch.has(e.journey_id)) firstTouch.set(e.journey_id, a.first.source || "Unknown"); }
  const srcCounts = {};
  for (const j of b.journeys) { const s = firstTouch.get(j.journey_id) || "Unknown"; srcCounts[s] = (srcCounts[s] || 0) + 1; }
  const attributed = b.journeys.length - (srcCounts["Unknown"] || 0);
  const acqRows = Object.entries(srcCounts).sort((a, z) => z[1] - a[1]).map(([s, n]) => `<tr><td>${adminEsc(s)}</td><td class="num">${fmtN(n)}</td><td class="num">${fmtPct(n, b.journeys.length)}</td></tr>`).join("");
  const acqSection = `<h2>Acquisition (first touch)</h2><div class="note">Source of the first visit that opened each journey, from first-party utm + referrer only. ${attributed} of ${b.journeys.length} journeys carry a captured touch; the rest show as Unknown (attribution is forward-only from Phase 4 launch and never inferred).</div>
    <table><tr><th>Source</th><th class="num">Journeys</th><th class="num">Share</th></tr>${acqRows || `<tr><td colspan=3>No journeys in range.</td></tr>`}</table>`;

  // Item 3(a): one consolidated linear drop-off across both paths, with the % drop at
  // each step (distinct from the split funnel above and the per-row Stage column).
  const uni = (...sets) => { const s = new Set(); for (const x of sets) if (x) for (const v of x) s.add(v); return s.size; };
  const dropStages = [
    ["Journeys started", b.started],
    ["Recommendation shown", b.recs],
    ["Viewed (CTA or PowerSeller card)", uni(b.has.platform_cta_viewed, b.has.powerseller_card_viewed)],
    ["Clicked (CTA or intro)", uni(b.has.platform_cta_clicked, b.has.powerseller_intro_clicked)],
    ["Introduction requested", b.psIntros]
  ];
  const dropRows = dropStages.map(([lab, n], i) => {
    const prev = i > 0 ? dropStages[i - 1][1] : null;
    const dropPct = (prev && prev > 0) ? `<span style="color:${n < prev ? "#a3432a" : "#6b6861"}">${n < prev ? `-${(100 * (prev - n) / prev).toFixed(0)}%` : "0%"}</span>` : "<span class=\"samp\">-</span>";
    const ofStart = b.started > 0 ? fmtPct(n, b.started) : "-";
    const w = b.started > 0 ? Math.max(2, Math.round(560 * n / b.started)) : 2;
    return `<div class="fstage"><div class="lab">${lab}</div><div class="cnt">${fmtN(n)}</div><div class="fbar" style="width:${w}px"></div></div><div class="fconv">${ofStart} of started &middot; drop from previous: ${dropPct}</div>`;
  }).join("");
  const dropSection = `<h2>Drop-off funnel</h2><div class="note" style="background:#f6f5f2;border-color:var(--line);color:var(--slate)">One linear path across platform and PowerSeller journeys. "Viewed" and "Clicked" union both paths (a journey counts once). Drop is the fall from the stage above.</div><div class="funnel">${dropRows}</div>`;

  const html = `${bizChrome("Business", key, "business")}
    <div class="sub">${adminEsc(range.label)} &middot; ${mode === "exclude" ? "real sellers only" : mode === "only" ? "testers only" : "all traffic"}</div>
    ${bizFilters(req, "business")}
    ${dropSection}
    <h2>Seller funnel</h2>${funnel}
    <h2>Key metrics</h2>${kpis}
    ${acqSection}
    ${psSection}
    ${platSection}
    <p style="margin-top:22px"><a class="jlink" href="?view=journeys&range=${range.range}&biz=${mode}&key=${bizKey(req)}">Open the Journey Explorer &rarr;</a> &middot; <a class="jlink" href="?view=economics&range=${range.range}&key=${bizKey(req)}">Economics &rarr;</a> &middot; <a class="jlink" href="?view=quality&range=${range.range}&key=${bizKey(req)}">Product quality &rarr;</a></p>
  </div>`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(html);
}

const STAGE_LABEL = { seller_journey_started: "Started", vehicle_identified: "Vehicle identified", seller_questions_completed: "Questions done", recommendation_completed: "Recommendation", platform_recommended: "Platform rec", powerseller_recommended: "PowerSeller rec", platform_cta_viewed: "CTA viewed", powerseller_card_viewed: "PS card viewed", platform_cta_clicked: "CTA clicked", powerseller_intro_clicked: "Intro clicked", powerseller_contact_form_shown: "Contact form shown", powerseller_intro_requested: "Intro requested", powerseller_intro_sent: "Intro sent", powerseller_contacted: "Contacted", powerseller_engaged: "Engaged", consignment_accepted: "Consignment", vehicle_listed: "Listed", vehicle_sold: "Sold", journey_closed_no_sale: "Closed, no sale" };
// The result-render moment fires three events tied at rank 40 (recommendation_completed,
// platform_recommended, powerseller_recommended); which one a journey RESTS at is a
// write-order race, so they collapse to ONE "Recommendation" stage for the Stage column,
// chips, filter and sort. The platform-vs-PowerSeller detail lives in the Recommendation
// and PowerSeller columns, so nothing is lost. (The per-event timeline in the journey
// detail still shows each raw event.)
const STAGE_CANON = { platform_recommended: "recommendation_completed", powerseller_recommended: "recommendation_completed" };
const canonStage = s => STAGE_CANON[s] || s || "";

// ---- Phase 3: manual downstream editor ----
// The single source of truth for what an admin may edit. Each field maps to a
// journey_manual_update-allowlisted column; "type" drives the input + the
// change-detection normalizer (so unchanged fields never write a no-op audit row).
// Dates are captured day-granular (lifecycle milestones, not second precision).
const MANUAL_FIELDS = [
  { f: "sale_status", label: "Sale status", type: "status" },
  { f: "actual_platform", label: "Actual platform used", type: "text", ph: "e.g. bringatrailer" },
  { f: "listing_url", label: "Listing URL", type: "text", ph: "https://..." },
  { f: "listing_date", label: "Listing date", type: "date" },
  { f: "intro_sent_at", label: "Intro sent", type: "date" },
  { f: "contacted_at", label: "PowerSeller contacted seller", type: "date" },
  { f: "engaged_at", label: "Seller engaged", type: "date" },
  { f: "consignment_at", label: "Consignment accepted", type: "date" },
  { f: "listed_at", label: "Listed", type: "date" },
  { f: "sold_at", label: "Sold", type: "date" },
  { f: "closed_no_sale_at", label: "Closed, no sale", type: "date" },
  { f: "sale_price", label: "Sale price (USD)", type: "num" },
  { f: "gas_revenue", label: "GoAskSam revenue (USD)", type: "num" },
  { f: "internal_notes", label: "Internal notes", type: "textarea" }
];
const SALE_STATUS_OPTS = ["", "listed", "sold", "no_sale"];
// Canonical string for change detection. Dates compare day-only; numbers compare
// numerically; text trims. Equal normalized values => no write, no audit row.
function normField(type, v) {
  if (v == null || v === "") return "";
  if (type === "date") return String(v).slice(0, 10);
  if (type === "num") { const n = Number(v); return Number.isFinite(n) ? String(n) : String(v).trim(); }
  return String(v).trim();
}

// Process a manual-update POST: iterate the allowlisted fields present in the body,
// write ONLY the ones whose value actually changed, each as its own audited RPC call.
// Returns {saved, errors, changedBy} for the flash. Requires a non-empty changed_by
// so every audit row records WHO. Never throws.
async function processManualUpdate(env, req) {
  const body = req.body || {};
  const jid = String(body.jid || "").trim();
  const changedBy = String(body.changed_by || "").trim();
  const note = String(body.note || "").trim() || null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jid)) return { saved: 0, errors: ["bad_journey_id"], changedBy };
  if (!changedBy) return { saved: 0, errors: ["missing_operator"], changedBy };
  const cur = (await supabaseSelect(env, `journeys?journey_id=eq.${encodeURIComponent(jid)}&select=*&limit=1`)) || [];
  const row = cur[0];
  if (!row) return { saved: 0, errors: ["journey_not_found"], changedBy };
  let saved = 0; const errors = [];
  for (const spec of MANUAL_FIELDS) {
    if (!(spec.f in body)) continue;
    const next = String(body[spec.f] ?? "");
    if (normField(spec.type, next) === normField(spec.type, row[spec.f])) continue; // unchanged: skip
    const r = await journeyManualUpdate(env, { journeyId: jid, field: spec.f, value: next, changedBy, note });
    if (r && r.ok) saved++; else errors.push(`${spec.f}:${(r && (r.reason || r.status)) || "fail"}`);
  }
  return { saved, errors, changedBy, jid };
}

async function renderJourneysView(req, res) {
  const env = supabaseEnv(); if (!env) return res.status(500).json({ error: "storage not configured" });
  const key = req.query?.key;
  // Single-journey detail
  if (req.query?.jid) {
    const jid = String(req.query.jid);
    const jr = await supabaseSelect(env, `journeys?journey_id=eq.${encodeURIComponent(jid)}&select=*&limit=1`);
    const j = jr && jr[0];
    if (!j) { res.setHeader("Content-Type", "text/html"); return res.status(200).send(bizChrome("Journey", key, "journeys") + "<p>Journey not found.</p></div>"); }
    const [evs, audit] = await Promise.all([
      supabaseSelect(env, `journey_events?journey_id=eq.${encodeURIComponent(jid)}&select=event_type,platform_id,powerseller_id,metadata,occurred_at&order=occurred_at.asc&limit=200`),
      supabaseSelect(env, `journey_audit?journey_id=eq.${encodeURIComponent(jid)}&select=changed_by,field,old_value,new_value,changed_at,note&order=changed_at.desc&limit=100`)
    ]);
    const veh = [j.vehicle_year, j.vehicle_make, j.vehicle_model, j.vehicle_trim].filter(Boolean).join(" ") || "Unknown vehicle";
    const day = fmtDayET;
    const line = (t, lab, extra) => `<div class="ev"><div class="d">${day(t)}</div><div>${lab}${extra ? `<br><span class="samp">${extra}</span>` : ""}</div></div>`;
    const evLines = (evs || []).map(e => line(e.occurred_at, STAGE_LABEL[e.event_type] || e.event_type, [e.platform_id && `Platform: ${e.platform_id}`, e.powerseller_id && `PowerSeller: ${e.powerseller_id}`].filter(Boolean).join(" &middot; "))).join("");
    // manual milestones from the spine (Phase 3 data)
    const man = [["intro_sent_at", "Introduction sent"], ["contacted_at", "PowerSeller contacted seller"], ["engaged_at", "Seller engaged"], ["consignment_at", "Consignment accepted"], ["listed_at", `Listed${j.actual_platform ? " on " + j.actual_platform : ""}${j.listing_url ? ` &middot; <a href="${adminEsc(j.listing_url)}">listing</a>` : ""}`], ["sold_at", `Vehicle sold${j.sale_price ? " &middot; " + fmtMoney(j.sale_price) : ""}`], ["closed_no_sale_at", "Closed, no sale"]].filter(([f]) => j[f]).map(([f, lab]) => line(j[f], lab)).join("");

    // manual editor (writes via the audited journey_manual_update RPC on POST)
    const dv = v => v == null ? "" : adminEsc(String(v).slice(0, 10)); // date input value
    const field = spec => {
      const cur = j[spec.f];
      if (spec.type === "status") return `<select name="${spec.f}">${SALE_STATUS_OPTS.map(o => `<option value="${o}"${(cur || "") === o ? " selected" : ""}>${o || "unknown"}</option>`).join("")}</select>`;
      if (spec.type === "date") return `<input type="date" name="${spec.f}" value="${dv(cur)}">`;
      if (spec.type === "num") return `<input type="number" step="1" name="${spec.f}" value="${cur == null ? "" : adminEsc(String(cur))}">`;
      if (spec.type === "textarea") return `<textarea name="${spec.f}" rows="2" style="width:100%">${adminEsc(cur || "")}</textarea>`;
      return `<input type="text" name="${spec.f}" value="${adminEsc(cur == null ? "" : String(cur))}" placeholder="${adminEsc(spec.ph || "")}">`;
    };
    const editRows = MANUAL_FIELDS.map(s => `<div class="efield"><label>${s.label}</label>${field(s)}</div>`).join("");
    const saved = Number(req.query?.saved || 0), errs = String(req.query?.errs || "");
    const flash = (req.query?.saved != null)
      ? `<div class="note" style="background:${errs ? "#fdeceb" : "#eaf6ee"};border-color:${errs ? "#f0c3bf" : "#bfe3cc"};color:${errs ? "#7a2a24" : "#215c39"}">${saved > 0 ? `Saved ${saved} change${saved === 1 ? "" : "s"}, each written to the audit log.` : "No changes to save."}${errs ? ` Errors: ${adminEsc(errs)}` : ""}</div>`
      : "";
    const editor = `<h2>Update downstream outcome</h2>
      <div class="note">Every change is written to the audit log below with who, field, old value, new value and timestamp. Dates are day granular. Leave a field blank to clear it. Sold is never inferred, so set the sale status explicitly.</div>
      ${flash}
      <form method="post" action="?view=journeys&jid=${encodeURIComponent(jid)}&key=${bizKey(req)}">
        <input type="hidden" name="jid" value="${adminEsc(jid)}"><input type="hidden" name="key" value="${bizKey(req)}">
        <div class="editgrid">${editRows}</div>
        <div class="efield" style="margin-top:10px"><label>Your initials or name (recorded in the audit) *</label><input type="text" name="changed_by" required placeholder="e.g. Sam"></div>
        <div class="efield"><label>Note (optional, applies to this update)</label><input type="text" name="note" placeholder="context for the change"></div>
        <button type="submit" style="margin-top:12px;background:#0b5c3e;color:#fff;border:0;border-radius:7px;padding:9px 18px;font:inherit;cursor:pointer">Save changes</button>
      </form>`;

    const auditRows = (audit || []).map(a => `<tr><td>${adminEsc(fmtDateTimeET(a.changed_at))}</td><td>${adminEsc(a.changed_by)}</td><td>${adminEsc(a.field)}</td><td class="samp">${adminEsc(a.old_value == null ? "(empty)" : a.old_value)}</td><td>${adminEsc(a.new_value == null ? "(cleared)" : a.new_value)}</td><td class="samp">${adminEsc(a.note || "")}</td></tr>`).join("");
    const auditSection = `<h2>Audit trail</h2><table><tr><th>When</th><th>Who</th><th>Field</th><th>Old</th><th>New</th><th>Note</th></tr>${auditRows || `<tr><td colspan=6>No manual changes yet.</td></tr>`}</table>`;

    const html = `${bizChrome("__bare", key, "journeys")}
      <style>.editgrid{display:grid;grid-template-columns:1fr 1fr;gap:10px 18px;margin-top:10px}.efield label{display:block;font-size:11.5px;color:var(--slate);margin-bottom:3px}.efield input,.efield select{width:100%;padding:6px 8px;border:1px solid var(--line);border-radius:6px;font:inherit}.efield:has(textarea),.efield:last-of-type,.efield:nth-last-of-type(2){grid-column:1 / -1}</style>
      <h1>${adminEsc(veh)}</h1>
      <div class="sub">${adminEsc(j.vehicle_location || "Location unknown")} &middot; journey ${adminEsc(jid.slice(0, 8))} &middot; ${j.user_id ? "signed-in" : "anonymous"} &middot; <a class="jlink" href="?view=journeys&key=${bizKey(req)}">back to explorer</a></div>
      <div class="split" style="grid-template-columns:2fr 1fr">
        <div><h2>History</h2><div class="tl">${evLines}${man}</div></div>
        <div><h2>Recommendation</h2><div class="path">
          <div class="r"><span>Platform</span><b>${adminEsc(j.rec_platform || "-")}</b></div>
          <div class="r"><span>PowerSeller</span><b>${adminEsc(j.rec_powerseller || "-")}</b></div>
          <div class="r"><span>Scope</span><b>${adminEsc(j.rec_scope || "-")}</b></div>
          <div class="r"><span>Window</span><b>${adminEsc(j.rec_window || "-")}</b></div>
          <div class="r"><span>Est. value</span><b>${j.rec_estimated_value ? fmtMoney(j.rec_estimated_value) : "-"}</b></div>
          <div class="r"><span>Stage</span><b>${adminEsc(STAGE_LABEL[canonStage(j.stage)] || j.stage || "-")}</b></div>
          <div class="r"><span>Sale status</span><b>${adminEsc(j.sale_status || "unknown")}</b></div>
        </div></div>
      </div>
      ${editor}
      ${auditSection}
    </div>`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(html);
  }
  // Explorer table
  const range = bizRange(req), mode = bizMode(req);
  const b = await computeBusiness(env, range, mode);
  const q = String(req.query?.q || "").toLowerCase();
  const fStage = String(req.query?.stage || ""), fPs = String(req.query?.ps || ""), fPlat = String(req.query?.plat || "");
  const fReg = String(req.query?.region || "");                                  // Item 2: Census region filter
  const fUid = String(req.query?.uid || ""), fAid = String(req.query?.aid || ""); // Item 3b: person filter (click-through from Visitors)
  const fSort = String(req.query?.sort || "");                                    // clickable-header sort (currently: stage)
  const fTier = String(req.query?.tier || "");                                    // tier filter chip (e.g. guest30)
  const fVin = String(req.query?.vin || "");                                      // entry-method filter chip (VIN-originated journeys)
  let rows = b.journeys;
  if (q) rows = rows.filter(j => [j.vehicle_make, j.vehicle_model, j.vehicle_trim, j.vehicle_location].filter(Boolean).join(" ").toLowerCase().includes(q));
  if (fPs) rows = rows.filter(j => j.rec_powerseller === fPs);
  if (fPlat) rows = rows.filter(j => j.rec_platform === fPlat);
  if (fReg) rows = rows.filter(j => stateRegion(j.vehicle_location) === fReg);
  if (fUid) rows = rows.filter(j => j.user_id === fUid);
  if (fAid) rows = rows.filter(j => j.anon_id === fAid && !j.user_id);
  // Tier filter + chips (guest30, free, tdv, ...): count over the current rows, then filter.
  const tierCounts = new Map();
  for (const j of rows) { const t = b.tierBy.get(j.journey_id) || "(none)"; tierCounts.set(t, (tierCounts.get(t) || 0) + 1); }
  if (fTier) rows = rows.filter(j => (b.tierBy.get(j.journey_id) || "(none)") === fTier);
  // Stage filter + chips: count each stage over everything EXCEPT the stage filter, so a
  // chip shows how many of the currently-filtered journeys sit at that stage (and the
  // active stage's chip stays visible with its count). Funnel order = STAGE_LABEL order.
  const STAGE_KEYS = Object.keys(STAGE_LABEL);
  const stageRank = s => { const i = STAGE_KEYS.indexOf(canonStage(s)); return i < 0 ? 999 : i; };
  const stageCounts = new Map();
  for (const j of rows) { const s = canonStage(j.stage); stageCounts.set(s, (stageCounts.get(s) || 0) + 1); }
  if (fStage) rows = rows.filter(j => canonStage(j.stage) === fStage);
  // VIN-origin chip: count over the current rows (post other filters), then isolate.
  const vinCount = rows.filter(j => b.entryMethodBy.get(j.journey_id) === "vin").length;
  if (fVin) rows = rows.filter(j => b.entryMethodBy.get(j.journey_id) === "vin");
  // Sort by Stage (funnel order) when the Stage header is clicked; default stays date-desc.
  if (fSort === "stage") rows = [...rows].sort((x, y) => stageRank(x.stage) - stageRank(y.stage) || String(y.created_at || "").localeCompare(String(x.created_at || "")));
  const anyFilter = q || fStage || fPs || fPlat || fReg || fUid || fAid || fTier || fVin;
  const shown = rows.slice(0, 300);
  const emailBy = await fetchEmailsByUserId(env, shown.map(j => j.user_id));   // Item 1: signed-in requester email
  const tr = shown.map(j => `<tr>
    <td>${fmtDayET(j.created_at)}</td>
    <td><a class="jlink" href="?view=journeys&jid=${encodeURIComponent(j.journey_id)}&key=${bizKey(req)}">${adminEsc([j.vehicle_year, j.vehicle_make, j.vehicle_model].filter(Boolean).join(" ") || "?")}</a>${b.entryMethodBy.get(j.journey_id) === "vin" ? ` <span style="display:inline-block;font-size:9.5px;font-weight:700;letter-spacing:.4px;color:#0b5c3e;background:#e7f3ec;border:1px solid #bfe3cc;border-radius:4px;padding:1px 4px;vertical-align:middle;margin-left:5px" title="Started from a VIN">VIN</span>` : ""}</td>
    <td>${adminEsc(j.user_id ? (emailBy.get(j.user_id) || "") : "")}</td>
    <td>${adminEsc(j.vehicle_location || "")}</td>
    <td>${adminEsc(stateRegion(j.vehicle_location))}</td>
    <td class="num">${fmtAsk(attrOf(j, "price"))}</td>
    <td>${prefLabel(attrOf(j, "preference"))}</td>
    <td>${adminEsc(attrOf(j, "timeline") || "")}</td>
    <td>${adminEsc(j.rec_platform || "")}</td>
    <td>${adminEsc(j.rec_powerseller || "")}</td>
    <td>${adminEsc(STAGE_LABEL[canonStage(j.stage)] || j.stage || "")}</td>
    <td>${adminEsc(j.actual_platform || "")}</td>
    <td>${adminEsc(j.sale_status || "")}</td>
    <td class="num">${j.sale_price ? fmtMoney(j.sale_price) : ""}</td>
    <td class="num">${j.gas_revenue ? fmtMoney(j.gas_revenue) : ""}</td>
  </tr>`).join("");
  // CSV download links carry ALL current filters (Items 2/4/3b).
  const filterQS = `${range.range === "custom" ? `&from=${encodeURIComponent(req.query?.from || "")}&to=${encodeURIComponent(req.query?.to || "")}` : ""}${q ? `&q=${encodeURIComponent(req.query?.q || "")}` : ""}${fStage ? `&stage=${encodeURIComponent(fStage)}` : ""}${fPs ? `&ps=${encodeURIComponent(fPs)}` : ""}${fPlat ? `&plat=${encodeURIComponent(fPlat)}` : ""}${fReg ? `&region=${encodeURIComponent(fReg)}` : ""}${fUid ? `&uid=${encodeURIComponent(fUid)}` : ""}${fAid ? `&aid=${encodeURIComponent(fAid)}` : ""}${fTier ? `&tier=${encodeURIComponent(fTier)}` : ""}${fVin ? `&vin=${encodeURIComponent(fVin)}` : ""}`;
  const csvParams = extra => `?view=journeys&format=csv&key=${bizKey(req)}&range=${encodeURIComponent(range.range)}&biz=${encodeURIComponent(mode)}${filterQS}${extra}`;
  // Region rollup filter chips (Item 2). Preserve every other current filter.
  const regionBase = `?view=journeys&key=${bizKey(req)}&range=${encodeURIComponent(range.range)}&biz=${encodeURIComponent(mode)}${range.range === "custom" ? `&from=${encodeURIComponent(req.query?.from || "")}&to=${encodeURIComponent(req.query?.to || "")}` : ""}${q ? `&q=${encodeURIComponent(req.query?.q || "")}` : ""}${fStage ? `&stage=${encodeURIComponent(fStage)}` : ""}${fPs ? `&ps=${encodeURIComponent(fPs)}` : ""}${fPlat ? `&plat=${encodeURIComponent(fPlat)}` : ""}${fUid ? `&uid=${encodeURIComponent(fUid)}` : ""}${fAid ? `&aid=${encodeURIComponent(fAid)}` : ""}${fTier ? `&tier=${encodeURIComponent(fTier)}` : ""}${fVin ? `&vin=${encodeURIComponent(fVin)}` : ""}${fSort ? `&sort=${encodeURIComponent(fSort)}` : ""}`;
  const regionChips = `<div class="filters" style="margin:4px 0"><span style="color:#6b6861;font-size:12px">Region:</span> <a class="${!fReg ? "on" : ""}" href="${regionBase}">All</a>${CENSUS_REGIONS.map(rg => `<a class="${fReg === rg ? "on" : ""}" href="${regionBase}&region=${encodeURIComponent(rg)}">${rg}</a>`).join("")}</div>`;
  // Stage filter chips (same pattern as Region). Preserves every other filter; shows only
  // stages present in the current view, each with its own count so "just CTA clicked" etc.
  // reads its count at a glance. "All" clears the stage filter.
  const stageBase = `?view=journeys&key=${bizKey(req)}&range=${encodeURIComponent(range.range)}&biz=${encodeURIComponent(mode)}${range.range === "custom" ? `&from=${encodeURIComponent(req.query?.from || "")}&to=${encodeURIComponent(req.query?.to || "")}` : ""}${q ? `&q=${encodeURIComponent(req.query?.q || "")}` : ""}${fPs ? `&ps=${encodeURIComponent(fPs)}` : ""}${fPlat ? `&plat=${encodeURIComponent(fPlat)}` : ""}${fReg ? `&region=${encodeURIComponent(fReg)}` : ""}${fUid ? `&uid=${encodeURIComponent(fUid)}` : ""}${fAid ? `&aid=${encodeURIComponent(fAid)}` : ""}${fTier ? `&tier=${encodeURIComponent(fTier)}` : ""}${fVin ? `&vin=${encodeURIComponent(fVin)}` : ""}${fSort ? `&sort=${encodeURIComponent(fSort)}` : ""}`;
  const presentStages = STAGE_KEYS.filter(s => stageCounts.get(s));
  const stageChips = presentStages.length ? `<div class="filters" style="margin:4px 0"><span style="color:#6b6861;font-size:12px">Stage:</span> <a class="${!fStage ? "on" : ""}" href="${stageBase}">All</a>${presentStages.map(s => `<a class="${fStage === s ? "on" : ""}" href="${stageBase}&stage=${encodeURIComponent(s)}">${adminEsc(STAGE_LABEL[s])} (${fmtN(stageCounts.get(s))})</a>`).join("")}</div>` : "";
  // Tier filter chips (guest30, free, tdv, ...). Preserves every other filter; guest30 is
  // included by default (not internal), so this is the way to isolate a guest cohort.
  const tierBase = `?view=journeys&key=${bizKey(req)}&range=${encodeURIComponent(range.range)}&biz=${encodeURIComponent(mode)}${range.range === "custom" ? `&from=${encodeURIComponent(req.query?.from || "")}&to=${encodeURIComponent(req.query?.to || "")}` : ""}${q ? `&q=${encodeURIComponent(req.query?.q || "")}` : ""}${fStage ? `&stage=${encodeURIComponent(fStage)}` : ""}${fPs ? `&ps=${encodeURIComponent(fPs)}` : ""}${fPlat ? `&plat=${encodeURIComponent(fPlat)}` : ""}${fReg ? `&region=${encodeURIComponent(fReg)}` : ""}${fUid ? `&uid=${encodeURIComponent(fUid)}` : ""}${fAid ? `&aid=${encodeURIComponent(fAid)}` : ""}${fVin ? `&vin=${encodeURIComponent(fVin)}` : ""}${fSort ? `&sort=${encodeURIComponent(fSort)}` : ""}`;
  const presentTiers = [...tierCounts.keys()].filter(t => t && t !== "(none)").sort();
  const tierChips = presentTiers.length ? `<div class="filters" style="margin:4px 0"><span style="color:#6b6861;font-size:12px">Tier:</span> <a class="${!fTier ? "on" : ""}" href="${tierBase}">All</a>${presentTiers.map(t => `<a class="${fTier === t ? "on" : ""}" href="${tierBase}&tier=${encodeURIComponent(t)}">${adminEsc(t)} (${fmtN(tierCounts.get(t))})</a>`).join("")}</div>` : "";
  // Entry-method chip: isolate VIN-originated journeys at a glance. Preserves every other
  // filter; only rendered when at least one VIN journey is present in the current view.
  const vinBase = `?view=journeys&key=${bizKey(req)}&range=${encodeURIComponent(range.range)}&biz=${encodeURIComponent(mode)}${range.range === "custom" ? `&from=${encodeURIComponent(req.query?.from || "")}&to=${encodeURIComponent(req.query?.to || "")}` : ""}${q ? `&q=${encodeURIComponent(req.query?.q || "")}` : ""}${fStage ? `&stage=${encodeURIComponent(fStage)}` : ""}${fPs ? `&ps=${encodeURIComponent(fPs)}` : ""}${fPlat ? `&plat=${encodeURIComponent(fPlat)}` : ""}${fReg ? `&region=${encodeURIComponent(fReg)}` : ""}${fUid ? `&uid=${encodeURIComponent(fUid)}` : ""}${fAid ? `&aid=${encodeURIComponent(fAid)}` : ""}${fTier ? `&tier=${encodeURIComponent(fTier)}` : ""}${fSort ? `&sort=${encodeURIComponent(fSort)}` : ""}`;
  const vinChip = (vinCount > 0 || fVin) ? `<div class="filters" style="margin:4px 0"><span style="color:#6b6861;font-size:12px">Entry:</span> <a class="${!fVin ? "on" : ""}" href="${vinBase}">All</a><a class="${fVin ? "on" : ""}" href="${vinBase}&vin=1">VIN journeys (${fmtN(vinCount)})</a></div>` : "";
  // Clickable Stage column header: toggles funnel-order sort on/off (filterQS already
  // carries every active filter; sort is added/removed on top).
  const stageSortHref = `?view=journeys&key=${bizKey(req)}&range=${encodeURIComponent(range.range)}&biz=${encodeURIComponent(mode)}${filterQS}${fSort === "stage" ? "" : "&sort=stage"}`;
  const stageHeader = `<a href="${stageSortHref}" style="color:inherit;text-decoration:none" title="Sort by stage (funnel order)">Stage ${fSort === "stage" ? "▲" : "⇅"}</a>`;
  // Person-filter banner when arriving from the Visitors view (Item 3b).
  const personBanner = (fUid || fAid) ? `<div class="note">Showing journeys for ${fUid ? `signed-in user ${adminEsc((emailBy.get(fUid) || fUid.slice(0, 8) + "…"))}` : `anonymous device ${adminEsc(fAid.slice(0, 12) + "…")}`}. <a class="jlink" href="?view=visitors&range=${range.range}&biz=${mode}&key=${bizKey(req)}">Back to Visitors</a></div>` : "";
  const html = `${bizChrome("Journey Explorer", key, "journeys")}
    ${bizFilters(req, "journeys")}
    ${regionChips}
    ${stageChips}
    ${tierChips}
    ${vinChip}
    ${personBanner}
    <form method="get" style="margin:8px 0"><input type="hidden" name="view" value="journeys"><input type="hidden" name="key" value="${bizKey(req)}"><input type="hidden" name="range" value="${range.range}"><input type="hidden" name="biz" value="${mode}">${range.range === "custom" ? `<input type="hidden" name="from" value="${adminEsc(req.query?.from || "")}"><input type="hidden" name="to" value="${adminEsc(req.query?.to || "")}">` : ""}${fReg ? `<input type="hidden" name="region" value="${adminEsc(fReg)}">` : ""}${fStage ? `<input type="hidden" name="stage" value="${adminEsc(fStage)}">` : ""}${fTier ? `<input type="hidden" name="tier" value="${adminEsc(fTier)}">` : ""}${fVin ? `<input type="hidden" name="vin" value="${adminEsc(fVin)}">` : ""}${fSort ? `<input type="hidden" name="sort" value="${adminEsc(fSort)}">` : ""}${fUid ? `<input type="hidden" name="uid" value="${adminEsc(fUid)}">` : ""}${fAid ? `<input type="hidden" name="aid" value="${adminEsc(fAid)}">` : ""}<input type="text" name="q" value="${adminEsc(req.query?.q || "")}" placeholder="Search vehicle or location"> <button>Search</button></form>
    <div class="sub">${rows.length} journeys ${anyFilter ? "(filtered)" : ""} &nbsp;·&nbsp; Download CSV (current filters): <a href="${csvParams("&dataset=journeys")}">journeys</a> · <a href="${csvParams("&dataset=journey_events")}">events</a> · <a href="${csvParams("&dataset=funnel_events")}">funnel</a></div>
    <table><tr><th>Date</th><th>Vehicle</th><th>Email</th><th>Location</th><th>Region</th><th class="num">Asking</th><th>Preference</th><th>Timing</th><th>Recommendation</th><th>PowerSeller</th><th>${stageHeader}</th><th>Actual platform</th><th>Sale status</th><th class="num">Sale price</th><th class="num">Revenue</th></tr>${tr || `<tr><td colspan=15>No journeys.</td></tr>`}</table>
  </div>`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(html);
}

// Item 3(b): group journeys into people. Signed-in users group by user_id (with email);
// anonymous visitors group by anon_id (best effort — fragments across devices/browsers).
function groupVisitors(journeys, emailBy) {
  const map = new Map();
  for (const j of journeys) {
    const signedIn = !!j.user_id;
    const id = signedIn ? j.user_id : j.anon_id;
    if (!id) continue;
    const key = (signedIn ? "u:" : "a:") + id;
    let v = map.get(key);
    if (!v) { v = { signedIn, id, email: signedIn ? (emailBy.get(id) || "") : "", journeys: 0, first: j.created_at, last: j.created_at, days: new Set() }; map.set(key, v); }
    v.journeys++;
    if (j.created_at < v.first) v.first = j.created_at;
    if (j.created_at > v.last) v.last = j.created_at;
    if (j.created_at) v.days.add(new Date(j.created_at).toLocaleDateString("en-CA", { timeZone: ET_TZ }));
  }
  return [...map.values()].map(v => ({ signedIn: v.signedIn, id: v.id, email: v.email, journeys: v.journeys, first: v.first, last: v.last, activeDays: v.days.size }))
    .sort((a, z) => z.journeys - a.journeys || (String(z.last) < String(a.last) ? -1 : 1));
}
// Item 3(b): Visitors view — repeat activity by person across journeys/days.
async function renderVisitorsView(req, res) {
  const env = supabaseEnv(); if (!env) return res.status(500).json({ error: "storage not configured" });
  const range = bizRange(req), mode = bizMode(req), key = req.query?.key;
  const b = await computeBusiness(env, range, mode);
  const emailBy = await fetchEmailsByUserId(env, b.journeys.map(j => j.user_id));
  const all = groupVisitors(b.journeys, emailBy);
  const returning = all.filter(v => v.journeys >= 2).length;
  const showAll = req.query?.all === "1";
  const visitors = (showAll ? all : all.filter(v => v.journeys >= 2)).slice(0, 500);
  const linkBase = `?view=journeys&key=${bizKey(req)}&range=${encodeURIComponent(range.range)}&biz=${encodeURIComponent(mode)}${range.range === "custom" ? `&from=${encodeURIComponent(req.query?.from || "")}&to=${encodeURIComponent(req.query?.to || "")}` : ""}`;
  const tr = visitors.map(v => {
    const label = v.signedIn ? (v.email || v.id.slice(0, 8) + "…") : ("anon " + String(v.id).slice(0, 12) + "…");
    const link = `${linkBase}&${v.signedIn ? "uid" : "aid"}=${encodeURIComponent(v.id)}`;
    return `<tr><td><a class="jlink" href="${link}">${adminEsc(label)}</a></td><td>${v.signedIn ? "signed-in" : "anon"}</td><td class="num">${fmtN(v.journeys)}</td><td>${fmtDayET(v.first)}</td><td>${fmtDayET(v.last)}</td><td class="num">${fmtN(v.activeDays)}</td></tr>`;
  }).join("");
  const csvParams = `?view=visitors&format=csv&key=${bizKey(req)}&range=${encodeURIComponent(range.range)}&biz=${encodeURIComponent(mode)}${range.range === "custom" ? `&from=${encodeURIComponent(req.query?.from || "")}&to=${encodeURIComponent(req.query?.to || "")}` : ""}`;
  const toggle = showAll
    ? `<a class="jlink" href="?view=visitors&range=${range.range}&biz=${mode}&key=${bizKey(req)}">Show returning only (2+)</a>`
    : `<a class="jlink" href="?view=visitors&all=1&range=${range.range}&biz=${mode}&key=${bizKey(req)}">Show all visitors</a>`;
  const html = `${bizChrome("Visitors", key, "visitors")}
    <div class="sub">${adminEsc(range.label)} &middot; ${mode === "exclude" ? "real sellers only" : mode === "only" ? "testers only" : "all traffic"}</div>
    ${bizFilters(req, "visitors")}
    <div class="note">Repeat activity grouped by person. Signed-in users group by account; anonymous visitors group by device id and will fragment if they switch device, browser, or clear cookies. ${fmtN(returning)} returning (2+ journeys) of ${fmtN(all.length)} total. ${toggle}</div>
    <div class="sub">${visitors.length} shown${showAll ? "" : " (returning only)"} &nbsp;·&nbsp; <a href="${csvParams}">Download CSV</a></div>
    <table><tr><th>Visitor</th><th>Type</th><th class="num">Journeys</th><th>First seen</th><th>Last seen</th><th class="num">Active days</th></tr>${tr || `<tr><td colspan=6>No repeat visitors in range.</td></tr>`}</table>
  </div>`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(html);
}

// CSV export (Item 4): journeys / journey_events / funnel_events for the current range +
// tier cohort, honoring the same filters as the Journey Explorer. Behind the same
// USAGE_DASHBOARD_KEY gate (checked in the handler before this ever runs). Timestamps
// stay ISO/UTC in the file (raw-data export convention; the on-screen dashboard is ET).
async function renderCsvExport(req, res) {
  const env = supabaseEnv();
  if (!env) return res.status(500).json({ error: "storage not configured" });
  const dataset = String(req.query?.dataset || "journeys").toLowerCase();
  const range = bizRange(req), mode = bizMode(req);
  const send = (name, csv) => {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="gas-${name}-${range.range}-${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.status(200).send(csv);
  };
  if (dataset === "journeys") {
    const b = await computeBusiness(env, range, mode);
    // Same explorer sub-filters as the view (q / stage / ps / plat / region / person).
    const q = String(req.query?.q || "").toLowerCase();
    const fStage = String(req.query?.stage || ""), fPs = String(req.query?.ps || ""), fPlat = String(req.query?.plat || "");
    const fReg = String(req.query?.region || ""), fUid = String(req.query?.uid || ""), fAid = String(req.query?.aid || "");
    let rows = b.journeys;
    if (q) rows = rows.filter(j => [j.vehicle_make, j.vehicle_model, j.vehicle_trim, j.vehicle_location].filter(Boolean).join(" ").toLowerCase().includes(q));
    if (fStage) rows = rows.filter(j => j.stage === fStage);
    if (fPs) rows = rows.filter(j => j.rec_powerseller === fPs);
    if (fPlat) rows = rows.filter(j => j.rec_platform === fPlat);
    if (fReg) rows = rows.filter(j => stateRegion(j.vehicle_location) === fReg);
    if (fUid) rows = rows.filter(j => j.user_id === fUid);
    if (fAid) rows = rows.filter(j => j.anon_id === fAid && !j.user_id);
    const emailBy = await fetchEmailsByUserId(env, rows.map(j => j.user_id));
    const headers = ["journey_id", "created_at", "tier", "anon_id", "user_id", "email", "vehicle_year", "vehicle_make", "vehicle_model", "vehicle_trim", "vehicle_location", "region", "asking_price", "sell_preference", "timing", "condition", "records", "title", "rec_platform", "rec_powerseller", "rec_scope", "rec_window", "rec_estimated_value", "stage", "sale_status", "listed_at", "consignment_at", "sold_at", "sale_price", "gas_revenue", "actual_platform", "listing_url", "last_activity_at", "contacted_at", "engaged_at", "intro_sent_at", "intro_requested_at"];
    const body = rows.map(j => [j.journey_id, j.created_at, b.tierBy.get(j.journey_id) || "", j.anon_id, j.user_id, j.user_id ? (emailBy.get(j.user_id) || "") : "", j.vehicle_year, j.vehicle_make, j.vehicle_model, j.vehicle_trim, j.vehicle_location, stateRegion(j.vehicle_location), attrOf(j, "price"), attrOf(j, "preference"), attrOf(j, "timeline"), attrOf(j, "condition"), attrOf(j, "records"), attrOf(j, "title"), j.rec_platform, j.rec_powerseller, j.rec_scope, j.rec_window, j.rec_estimated_value, j.stage, j.sale_status, j.listed_at, j.consignment_at, j.sold_at, j.sale_price, j.gas_revenue, j.actual_platform, j.listing_url, j.last_activity_at, j.contacted_at, j.engaged_at, j.intro_sent_at, j.intro_requested_at]);
    return send("journeys", toCsv(headers, body));
  }
  if (dataset === "journey_events") {
    const b = await computeBusiness(env, range, mode);   // b.evts is already filtered to the tier-filtered journey set + range
    const headers = ["journey_id", "occurred_at", "event_type", "platform_id", "powerseller_id", "tier", "metadata"];
    const body = b.evts.map(e => [e.journey_id, e.occurred_at, e.event_type, e.platform_id, e.powerseller_id, b.tierBy.get(e.journey_id) || "", e.metadata]);
    return send("journey_events", toCsv(headers, body));
  }
  if (dataset === "funnel_events") {
    // funnel_events are pre-recommendation step events with no tier attribution, so only
    // the time filter applies (the tier cohort is not meaningful at this stage).
    const rows = (await supabaseSelect(env, `funnel_events?created_at=gte.${encodeURIComponent(range.sinceIso)}&created_at=lt.${encodeURIComponent(range.toIso)}&select=id,event,anon_session_id,user_id,dedup_key,created_at&order=created_at.desc&limit=100000`)) || [];
    const headers = ["id", "event", "anon_session_id", "user_id", "dedup_key", "created_at"];
    const body = rows.map(r => [r.id, r.event, r.anon_session_id, r.user_id, r.dedup_key, r.created_at]);
    return send("funnel_events", toCsv(headers, body));
  }
  if (dataset === "visitors") {
    const b = await computeBusiness(env, range, mode);
    const emailBy = await fetchEmailsByUserId(env, b.journeys.map(j => j.user_id));
    const visitors = groupVisitors(b.journeys, emailBy);
    const headers = ["type", "id", "email", "journeys", "first_seen", "last_seen", "active_days"];
    const body = visitors.map(v => [v.signedIn ? "signed-in" : "anon", v.id, v.email, v.journeys, v.first, v.last, v.activeDays]);
    return send("visitors", toCsv(headers, body));
  }
  return res.status(400).json({ error: "Unknown dataset. Use dataset=journeys|journey_events|funnel_events|visitors." });
}

// Cost + operational events for a range (app_usage_events). Not tier-filterable:
// we pay OldCarsData + Claude for every search regardless of who ran it, so cost
// and quality are computed over ALL traffic (stated on each view).
async function fetchUsageInRange(env, sinceIso) {
  const cols = "event_type,status,duration_ms,oldcarsdata_cost_1k_usd,oldcarsdata_cost_10k_usd,anthropic_cost_usd,oldcarsdata_metered_requests,metadata,created_at";
  return (await supabaseSelect(env, `app_usage_events?created_at=gte.${encodeURIComponent(sinceIso)}&select=${cols}&order=created_at.desc&limit=50000`)) || [];
}
async function fetchFunnelInRange(env, sinceIso) {
  return (await supabaseSelect(env, `funnel_events?created_at=gte.${encodeURIComponent(sinceIso)}&select=event,created_at&limit=100000`)) || [];
}
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

// ===================== ECONOMICS (Phase 4) =====================
async function renderEconomicsView(req, res) {
  const env = supabaseEnv(); if (!env) return res.status(500).json({ error: "storage not configured" });
  const range = bizRange(req), key = req.query?.key;
  const [b, usage] = await Promise.all([computeBusiness(env, range, "include"), fetchUsageInRange(env, range.sinceIso)]);
  // Tracked VARIABLE costs only. Fixed costs (the $49/$X monthly plan floor) are NOT
  // variable and are deliberately excluded from gross contribution.
  const ocdCost = usage.reduce((s, e) => s + num(e.oldcarsdata_cost_1k_usd), 0);
  const claudeCost = usage.reduce((s, e) => s + num(e.anthropic_cost_usd), 0);
  const varCost = ocdCost + claudeCost;
  const meteredReq = usage.reduce((s, e) => s + num(e.oldcarsdata_metered_requests), 0);
  const perJourney = b.started > 0 ? varCost / b.started : null;
  const perRec = b.recs > 0 ? varCost / b.recs : null;
  const perIntro = b.psIntros > 0 ? varCost / b.psIntros : null;
  const revenue = b.revTracked ? b.revenue : null;
  const contribution = b.revTracked ? b.revenue - varCost : null;

  const kpi = (n, l, s) => `<div class="kpi"><div class="n">${n}</div><div class="l">${l}</div>${s ? `<div class="s">${s}</div>` : ""}</div>`;
  const usd2 = n => "$" + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); // cents-precise so low early-days spend never reads as $0/free
  const cards = `<div class="kpis">
    ${kpi(usd2(varCost), "Tracked variable cost", "OldCarsData + Claude")}
    ${kpi(usd2(ocdCost), "OldCarsData (metered)", `${fmtN(meteredReq)} requests`)}
    ${kpi(usd2(claudeCost), "Claude (chat + narration)")}
    ${kpi(perJourney == null ? NYT : "$" + perJourney.toFixed(2), "Cost per journey", `${fmtN(b.started)} journeys`)}
    ${kpi(perRec == null ? NYT : "$" + perRec.toFixed(2), "Cost per recommendation", `${fmtN(b.recs)} recommendations`)}
    ${kpi(perIntro == null ? NYT : "$" + perIntro.toFixed(2), "Cost per PowerSeller intro", `${fmtN(b.psIntros)} intros`)}
    ${kpi(revenue == null ? NYT : fmtMoney(revenue), "GoAskSam revenue", b.revTracked ? "from captured sales" : "manual, Phase 3")}
    ${kpi(contribution == null ? NYT : fmtMoney(contribution), "Gross contribution", "revenue minus tracked variable cost")}
  </div>`;
  const html = `${bizChrome("Economics", key, "economics")}
    <div class="sub">${adminEsc(range.label)} &middot; all traffic (cost is not tier-attributable)</div>
    ${bizFilters(req, "economics", { noMode: true })}
    <h2>Unit economics</h2>${cards}
    <div class="note">Gross contribution counts <b>tracked variable costs only</b> (OldCarsData metered requests + Claude tokens). It deliberately excludes fixed monthly plan costs, which are not variable and would distort per-journey economics. Revenue is manual (Phase 3) and reads Not yet tracked until real sale revenue is entered; contribution stays Not yet tracked until then rather than showing a cost-only negative that reads as a loss.</div>
    <p style="margin-top:18px"><a class="jlink" href="?view=business&range=${range.range}&key=${bizKey(req)}">&larr; Business</a> &middot; <a class="jlink" href="?view=quality&range=${range.range}&key=${bizKey(req)}">Product quality &rarr;</a></p>
  </div>`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(html);
}

// ===================== PRODUCT QUALITY (Phase 4) =====================
async function renderQualityView(req, res) {
  const env = supabaseEnv(); if (!env) return res.status(500).json({ error: "storage not configured" });
  const range = bizRange(req), key = req.query?.key;
  const [usage, funnel, b] = await Promise.all([fetchUsageInRange(env, range.sinceIso), fetchFunnelInRange(env, range.sinceIso), computeBusiness(env, range, "include")]);
  const fc = {}; for (const f of funnel) fc[f.event] = (fc[f.event] || 0) + 1;
  const decisions = usage.filter(e => e.event_type === "seller_decision");
  const policyFallback = decisions.filter(e => (e.metadata && e.metadata.evidenceBasis) === "regional_policy").length;
  const dataBacked = decisions.filter(e => (e.metadata && e.metadata.evidenceBasis) === "market_evidence").length;
  const dataUnavail = usage.filter(e => e.event_type === "data_unavailable").length;
  const resFallback = usage.filter(e => e.event_type === "vehicle_resolution_fallback").length;
  const meterBlind = usage.filter(e => e.event_type === "ocd_budget_meter_blind").length;
  const budgetGuard = usage.filter(e => e.event_type === "ocd_budget_guard").length;
  const chatErrors = usage.filter(e => e.event_type === "chat" && /error|fail/i.test(String(e.status || ""))).length;
  const durs = decisions.map(e => num(e.duration_ms)).filter(n => n > 0).sort((a, z) => a - z);
  const avgDur = durs.length ? durs.reduce((s, n) => s + n, 0) / durs.length : null;
  const p95 = durs.length ? durs[Math.min(durs.length - 1, Math.floor(durs.length * 0.95))] : null;
  const started = fc.wizard_start || 0, completed = fc.wizard_complete || 0;

  const kpi = (n, l, s) => `<div class="kpi"><div class="n">${n}</div><div class="l">${l}</div>${s ? `<div class="s">${s}</div>` : ""}</div>`;
  const ms = v => v == null ? NYT : (v >= 1000 ? (v / 1000).toFixed(1) + "s" : Math.round(v) + "ms");
  const resolution = `<h2>Vehicle resolution</h2><div class="kpis">
    ${kpi(fmtN(fc.out_of_scope || 0), "Out-of-scope searches", "forward-only from this deploy")}
    ${kpi(fmtN(fc.non_us_attempt || 0), "Non-US attempts")}
    ${kpi(fmtN(resFallback), "Resolver fallbacks", "used the live fallback resolver")}
  </div>`;
  const recq = `<h2>Recommendation quality</h2><div class="kpis">
    ${kpi(fmtN(decisions.length), "Recommendations run")}
    ${kpi(fmtN(dataBacked), "Data-backed", "real market evidence")}
    ${kpi(fmtN(policyFallback), "Policy fallback", "regional floor, no comps")}
    ${kpi(decisions.length ? fmtPct(policyFallback, decisions.length) : NYT, "Fallback rate", "lower is better")}
    ${kpi(fmtN(dataUnavail), "Zero-evidence dead-ends avoided", "returned honest data-unavailable")}
  </div>`;
  const perf = `<h2>Performance and errors</h2><div class="kpis">
    ${kpi(ms(avgDur), "Avg recommendation time")}
    ${kpi(ms(p95), "p95 recommendation time")}
    ${kpi(fmtN(chatErrors), "Chat errors")}
    ${kpi(fmtN(meterBlind), "Usage-meter blind events", meterBlind ? "investigate" : "")}
    ${kpi(fmtN(budgetGuard), "Budget-guard soft-degrades")}
  </div>`;
  const abandon = `<h2>Flow completion</h2><div class="kpis">
    ${kpi(fmtN(started), "Wizards started")}
    ${kpi(fmtN(completed), "Wizards completed")}
    ${kpi(started ? fmtPct(completed, started) : NYT, "Completion rate")}
    ${kpi(fmtN(Math.max(0, b.started - b.recs)), "Journeys without a recommendation", "started, no rec reached")}
  </div>`;
  // VIN entry (Sep 2026): VIN-originated journeys + decode/match/lead outcomes, read
  // from the seller_journey_started event metadata (booleans/enums only - the raw VIN
  // is NEVER stored in the journey path). Same honesty convention: sample sizes shown,
  // "Not yet tracked" until any journey carries the entry_method marker.
  const sjs = b.evts.filter(e => e.event_type === "seller_journey_started");
  const sjsTracked = sjs.filter(e => e.metadata && e.metadata.entry_method);
  const vinJ = sjs.filter(e => e.metadata && e.metadata.entry_method === "vin");
  const vinIds = new Set(vinJ.map(e => e.journey_id));
  const decodeKnown = vinJ.filter(e => e.metadata.vin_decode).length;
  const decodeOk = vinJ.filter(e => e.metadata.vin_decode === "success").length;
  const matchN = vinJ.filter(e => e.metadata.vin_archive_match === true).length;
  const vinLeads = [...vinIds].filter(id => b.has.powerseller_intro_requested.has(id)).length;
  const entryTracked = sjsTracked.length > 0;
  const vinq = `<h2>VIN entry</h2><div class="kpis">
    ${kpi(entryTracked ? fmtN(vinJ.length) : NYT, "VIN-originated journeys", entryTracked ? `of ${fmtN(sjsTracked.length)} with an entry marker` : "forward-only from this deploy")}
    ${kpi(entryTracked ? fmtPct(vinJ.length, sjsTracked.length) : NYT, "VIN-originated share")}
    ${kpi(decodeKnown ? fmtPct(decodeOk, decodeKnown) : NYT, "Decode success rate", decodeKnown ? `${decodeOk} / ${decodeKnown} VIN journeys` : "needs VIN journeys")}
    ${kpi(vinJ.length ? fmtPct(matchN, vinJ.length) : NYT, "Archive-match hit rate", vinJ.length ? `${matchN} / ${vinJ.length} VIN journeys` : "")}
    ${kpi(vinJ.length ? fmtPct(vinLeads, vinJ.length) : NYT, "VIN journey to lead", vinJ.length ? `${vinLeads} / ${vinJ.length}` : "")}
  </div>`;
  const html = `${bizChrome("Product quality", key, "quality")}
    <div class="sub">${adminEsc(range.label)} &middot; all traffic</div>
    ${bizFilters(req, "quality", { noMode: true })}
    ${resolution}${recq}${vinq}${perf}${abandon}
    <div class="note">Signals are forward-only from when each was wired; a metric with no source in range reads 0 for a genuine zero and Not yet tracked where nothing emits it yet. Out-of-scope capture starts at this deploy.</div>
    <p style="margin-top:18px"><a class="jlink" href="?view=business&range=${range.range}&key=${bizKey(req)}">&larr; Business</a> &middot; <a class="jlink" href="?view=economics&range=${range.range}&key=${bizKey(req)}">Economics &rarr;</a></p>
  </div>`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(html);
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  // GET serves the dashboard; POST is the Phase-3 audited manual update only.
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Metered ops jobs (probe/fill): own PROBE_KEY gate, runs BEFORE the dashboard-key
  // gate so it is independent of the read-only dashboard key.
  if (req.query?.view === "ops") {
    try { return await handleOps(req, res); } catch (err) { return res.status(500).json({ error: err.message }); }
  }

  const configuredKey = process.env.USAGE_DASHBOARD_KEY || process.env.ADMIN_DASHBOARD_KEY;
  const providedKey = req.headers["x-admin-key"] || req.query?.key || req.body?.key;
  if (!configuredKey) return res.status(500).json({ error: "Set USAGE_DASHBOARD_KEY in Vercel before using this dashboard." });
  if (providedKey !== configuredKey) return res.status(401).json({ error: "Unauthorized" });

  // Phase 3 write path: audited manual downstream update, then Post/Redirect/Get
  // back to the journey detail so a refresh never re-submits.
  if (req.method === "POST") {
    try {
      const env = supabaseEnv();
      if (!env) return res.status(500).json({ error: "storage not configured" });
      const result = await processManualUpdate(env, req);
      const params = new URLSearchParams({ view: "journeys", jid: result.jid || String(req.body?.jid || ""), key: String(providedKey || ""), saved: String(result.saved) });
      if (result.errors && result.errors.length) params.set("errs", result.errors.join(","));
      res.setHeader("Location", `?${params.toString()}`);
      return res.status(303).end();
    } catch (err) { return res.status(500).json({ error: err.message }); }
  }

  // View dispatch (consolidated admin function): accounts + funnel (2G), outbound
  // clicks, or the default usage view.
  try {
    if (req.query?.format === "csv") return await renderCsvExport(req, res);   // Item 4: CSV download, same key gate + filters
    if (req.query?.view === "business") return await renderBusinessView(req, res);
    if (req.query?.view === "journeys") return await renderJourneysView(req, res);
    if (req.query?.view === "visitors") return await renderVisitorsView(req, res);
    if (req.query?.view === "economics") return await renderEconomicsView(req, res);
    if (req.query?.view === "quality") return await renderQualityView(req, res);
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
    return res.status(200).send(renderHtml({ summary, events, days, key: req.query?.key }));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
