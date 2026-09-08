// Phase 3 / 2A: public front-end config. Returns the Supabase URL + ANON key so
// js/auth.js can talk to GoTrue (Supabase Auth) directly. The anon key is public
// by design (protected by RLS); serving it from env keeps it out of the repo and
// lets the frontend stay in sync with the deployed project. No secrets here.
//
// Also hosts the One Box shareable-result route (Task 4): GET /o/<id> is rewritten to
// /api/publicConfig?obShare=<id>. It shares this function (not a new one) because the Hobby
// plan caps deployments at 12 Serverless Functions. See handleOneboxShare below.
import fs from "node:fs";
import path from "node:path";
import { appConfigFlag } from "../lib/_flags.js";
import { supabaseSelect, supabaseInsert } from "../lib/_supabase.js";

let SHELL = null;
function shell() {
  if (SHELL != null) return SHELL;
  try { SHELL = fs.readFileSync(path.join(process.cwd(), "onebox.html"), "utf8"); }
  catch { SHELL = ""; }
  return SHELL;
}
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function usd(n) { return "$" + Math.round(Number(n)).toLocaleString("en-US"); }
function cap(s) { s = String(s || ""); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function carLabel(rc) {
  if (!rc) return "your car";
  return [rc.year, rc.make, rc.model, rc.trim, rc.bodyStyle ? cap(rc.bodyStyle) : ""].filter(Boolean).join(" ") || "your car";
}
// Plain-text mirror of js/onebox.js answerHtml() - the span/two/one sentence, no markup.
function answerSentence(d) {
  const a = d && d.answer; if (!a) return "";
  if (a.kind === "span") {
    const z = a.closest != null ? (" The one most like yours brought " + usd(a.closest) + (a.closestMonth ? " in " + a.closestMonth : "") + ".") : "";
    return "Cars like yours have been bringing " + usd(a.low) + " to " + usd(a.high) + "." + z;
  }
  if (a.kind === "two") return "The two closest sales brought " + usd(a.high) + " and " + usd(a.low) + ".";
  if (a.kind === "one") return "The one sale I'd actually use brought " + usd(a.one) + ".";
  return "";
}

// GET /o/<id>: serve the SAME onebox.html shell (crew/flag gate, CSS, bundle reused
// verbatim) with (1) OG/Twitter meta injected into the raw <head> carrying the answer line
// so a link unfurl / curl works with no JS, and (2) window.__OB_SNAPSHOT__ so the page
// renders that exact answer cold. The snapshot lives in saved_results tagged obShare:true;
// the read REQUIRES that tag, so it can never serve a /sell seller result. Missing/invalid
// id degrades to the plain empty box with default OG, never an error page.
async function handleOneboxShare(req, res, id) {
  const html = shell();
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  if (!html) { res.status(500).send("One Box unavailable"); return; }

  const defaultOg =
    '<meta property="og:title" content="GoAskSam One Box" />' +
    '<meta property="og:description" content="What have cars like yours actually sold for? Real auction results, no estimates." />' +
    '<meta property="og:type" content="website" /><meta property="og:site_name" content="GoAskSam" />' +
    '<meta name="twitter:card" content="summary" />';
  const finish = (ogTags, injectScript) => {
    const page = html.replace("</head>", ogTags + (injectScript || "") + "\n</head>");
    res.setHeader("Cache-Control", injectScript ? "public, max-age=300" : "public, max-age=120");
    res.status(200).send(page);
  };

  if (!/^[0-9a-fA-F-]{10,64}$/.test(id)) { finish(defaultOg, ""); return; }
  try {
    const rows = await supabaseSelect(
      { supabaseUrl: process.env.SUPABASE_URL, supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY },
      `saved_results?id=eq.${encodeURIComponent(id)}&select=payload&limit=1`);
    const payload = rows && rows[0] && rows[0].payload;
    if (!payload || payload.obShare !== true || !payload.oneBox || !payload.oneBox.tier) { finish(defaultOg, ""); return; }
    const ob = payload.oneBox;
    const name = carLabel(ob.resolvedCar);
    const sentence = answerSentence(ob);
    const n = Number(ob.count) || 0;
    const desc = (sentence ? sentence + " " : "") + (n ? ("Based on " + n + " real sale" + (n === 1 ? "" : "s") + ".") : "Real auction results, no estimates.");
    const title = name + " · GoAskSam"; // middot, never an em/en dash
    const og =
      '<meta property="og:title" content="' + esc(title) + '" />' +
      '<meta property="og:description" content="' + esc(desc) + '" />' +
      '<meta property="og:type" content="website" /><meta property="og:site_name" content="GoAskSam" />' +
      '<meta name="twitter:card" content="summary" />' +
      '<meta name="twitter:title" content="' + esc(title) + '" />' +
      '<meta name="twitter:description" content="' + esc(desc) + '" />';
    // Escape "<" so a "</script>" inside any string can't break out of the element.
    const j = s => JSON.stringify(s == null ? null : s).replace(/</g, "\\u003c");
    const script =
      "\n<script>window.__OB_SNAPSHOT__=" + j(ob) +
      ";window.__OB_QUERY__=" + j(payload.query || name) +
      ";window.__OB_ASOF__=" + j(payload.savedAt || null) +
      ";window.__OB_SNAPID__=" + j(id) + ";</script>";
    finish(og, script);
  } catch { finish(defaultOg, ""); }
}

export default async function handler(req, res) {
  // TEMP historical backfill phase 2 (Bring a Trailer into sales_archive). Nonce-gated +
  // server-side only (nonce never shipped to the browser); keyless because PROBE_KEY is not
  // pullable locally. Reuses scripts/ingest.js's exact row shape + on_conflict=source_id
  // upsert-merge. supabaseInsert IS imported (the Phase 1 persist bug). Removed after use.
  if (req.query && req.query.bf === "bat2v9") {
    const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    const apiKey = process.env.OLDCARSDATA_API_KEY;
    const h = { apikey: key, Authorization: `Bearer ${key}` };
    const { callOldCarsData } = await import("../lib/_ocd.js");
    const { recordUsageEvent } = await import("./_usage.js");
    const LABEL = "Bring a Trailer";
    const toDate = s => { const d = s ? new Date(s) : null; return d && !isNaN(d) ? d : null; };
    const dayKey = d => d ? d.toISOString().slice(0, 10) : null;
    const toMoney = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
    const toInt = v => { const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : null; };
    const toBool = v => typeof v === "boolean" ? v : (v == null ? null : /^(true|1|yes)$/i.test(String(v)));
    const toFullRow = (r, label) => { const d = toDate(r.auction_end_date); return {
      source_id: String(r.id ?? ""), sale_date: dayKey(d), platform: label,
      make: (r.ocd_make_name || r.listing_make || "Unknown").toString().trim(),
      model: (r.ocd_model_name || r.listing_model || "Unknown").toString().trim(),
      sale_price: toMoney(r.price), month: d ? d.toISOString().slice(0, 7) : null, raw_record: r,
      year: toInt(r.year), mileage: toInt(r.mileage), body_style: r.body_style ?? null,
      title_status: r.title_status ?? null, vin: r.vin ?? null, transmission: r.transmission ?? null,
      drivetrain: r.drivetrain ?? null, exterior_color: r.exterior_color ?? null, interior_color: r.interior_color ?? null,
      seller_type: r.seller_type ?? null, listing_title: r.title ?? null, description: r.description ?? null,
      has_reserve: toBool(r.has_reserve), views: toInt(r.stats?.views), bids: toInt(r.stats?.bids),
      known_flaws: r.known_flaws ?? null, recent_service_history: r.recent_service_history ?? null, modifications: r.modifications ?? null
    }; };
    const cnt = async (f) => { const r = await fetch(`${url}/rest/v1/sales_archive?${f}&select=id`, { headers: { ...h, Prefer: "count=exact", Range: "0-0" } }); const cr = r.headers.get("content-range") || ""; return cr.includes("/") ? Number(cr.split("/")[1]) : null; };
    const mode = String(req.query.mode || "count");

    if (mode === "count") {
      // Step 0: verify a real upsert PERSISTS (not just fetches) - the Phase 1 failure mode.
      let upsertTest = "ok", persistedProof = null;
      try {
        await supabaseInsert("sales_archive", [{ source_id: "bat-bf-test-delete-me", sale_date: "2022-01-01", platform: LABEL, make: "Test", model: "Test", raw_record: { t: 1 } }], url, key, "resolution=merge-duplicates,return=minimal", "?on_conflict=source_id");
        persistedProof = await cnt("source_id=eq.bat-bf-test-delete-me"); // 1 == persisted
      } catch (e) { upsertTest = "THREW: " + e.message; }
      const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
      const monthStart = new Date(new Date().toISOString().slice(0, 7) + "-01T00:00:00Z").toISOString();
      const sumMetered = async (sinceIso) => { const rows = await (await fetch(`${url}/rest/v1/app_usage_events?created_at=gte.${sinceIso}&oldcarsdata_metered_requests=gt.0&select=oldcarsdata_metered_requests&limit=20000`, { headers: h })).json(); return Array.isArray(rows) ? rows.reduce((s, r) => s + (Number(r.oldcarsdata_metered_requests) || 0), 0) : null; };
      const oldestRow = await (await fetch(`${url}/rest/v1/sales_archive?platform=eq.${encodeURIComponent(LABEL)}&select=sale_date&order=sale_date.asc.nullslast&limit=1`, { headers: h })).json();
      const newestRow = await (await fetch(`${url}/rest/v1/sales_archive?platform=eq.${encodeURIComponent(LABEL)}&select=sale_date&order=sale_date.desc.nullslast&limit=1`, { headers: h })).json();
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ upsertTest, persistedProof, batTotal: await cnt(`platform=eq.${encodeURIComponent(LABEL)}`), batSince2022: await cnt(`platform=eq.${encodeURIComponent(LABEL)}&sale_date=gte.2022-01-01`), oldest: oldestRow?.[0]?.sale_date || null, newest: newestRow?.[0]?.sale_date || null, spentMonth: await sumMetered(monthStart), spentToday: await sumMetered(todayStart.toISOString()), monthlyBudget: Number(process.env.OCD_MONTHLY_BUDGET || 10000) });
    }

    if (mode === "pull") {
      const from = String(req.query.from || "2022-01-01");
      const to = req.query.to ? String(req.query.to) : null;
      const pagesize = Math.max(50, Math.min(100, Number(req.query.pagesize || 100)));
      const maxcalls = Math.max(1, Math.min(120, Number(req.query.maxcalls || 70)));
      let page = Math.max(1, Number(req.query.startpage || 1));
      const t0 = Date.now();
      let metered = 0, persisted = 0, oldest = null, totalPages = null, ocdRemaining = null, done = false, stopReason = "maxcalls", buffer = [];
      const flush = async () => { if (!buffer.length) return; const uniq = [...new Map(buffer.filter(r => r.source_id).map(r => [r.source_id, r])).values()]; for (let i = 0; i < uniq.length; i += 250) { try { await supabaseInsert("sales_archive", uniq.slice(i, i + 250), url, key, "resolution=merge-duplicates,return=minimal", "?on_conflict=source_id"); persisted += Math.min(250, uniq.length - i); } catch (e) { /* non-fatal */ } } buffer = []; };
      try {
        while (metered < maxcalls && Date.now() - t0 < 230000) {
          metered++;
          const resp = await callOldCarsData("/auctions", { source: "bringatrailer", status: "sold", sort: "date", direction: "desc", page, limit: pagesize }, apiKey);
          ocdRemaining = resp.__rateLimit?.remaining ?? ocdRemaining;
          totalPages = resp.meta?.total_pages ?? totalPages;
          const rows = resp.data || [];
          if (!rows.length) { done = true; stopReason = "no_rows"; break; }
          let pageOldest = null;
          for (const r of rows) { const k = dayKey(toDate(r.auction_end_date)); if (k && (!pageOldest || k < pageOldest)) pageOldest = k; if (from && k && k < from) continue; if (to && k && k > to) continue; buffer.push(toFullRow(r, LABEL)); }
          if (pageOldest && (!oldest || pageOldest < oldest)) oldest = pageOldest;
          if (buffer.length >= 500) await flush();
          page++;
          if (from && pageOldest && pageOldest < from) { done = true; stopReason = "reached_floor"; break; }
          if (totalPages && page > totalPages) { done = true; stopReason = "last_page"; break; }
          if (rows.length < pagesize) { done = true; stopReason = "short_page"; break; }
        }
      } catch (e) { stopReason = e.rateLimited ? "ratelimit" : ("error:" + e.message); }
      await flush();
      if (metered > 0) { try { await recordUsageEvent({ event_type: "archive_backfill", route: "publicConfig?bf=bat", status: stopReason, oldcarsdata_metered_requests: metered, duration_ms: Date.now() - t0, metadata: { source: "bringatrailer", from, to, startpage: Number(req.query.startpage || 1), nextPage: page, persisted, oldest } }, url, key); } catch { /* non-fatal */ } }
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ source: "bringatrailer", from, to, pagesize, startpage: Number(req.query.startpage || 1), nextPage: page, done, stopReason, meteredThisRun: metered, persistedThisRun: persisted, oldestSeen: oldest, totalPages, ocdRemaining });
    }

    if (mode === "verify") {
      const out2 = {};
      try { await fetch(`${url}/rest/v1/sales_archive?source_id=eq.bat-bf-test-delete-me`, { method: "DELETE", headers: h }); out2.testRowDeleted = true; } catch (e) { out2.testRowDeleted = "err:" + e.message; }
      out2.batTotal = await cnt(`platform=eq.${encodeURIComponent(LABEL)}`);
      out2.batSince2022 = await cnt(`platform=eq.${encodeURIComponent(LABEL)}&sale_date=gte.2022-01-01`);
      out2.batBefore2022 = await cnt(`platform=eq.${encodeURIComponent(LABEL)}&sale_date=lt.2022-01-01`);
      out2.archiveTotal = await cnt("id=not.is.null");
      // chassis-style count across the archive
      let chassis = 0, withVin = 0;
      for (let offset = 0; offset < 200000; offset += 1000) { const rows = await (await fetch(`${url}/rest/v1/sales_archive?vin=not.is.null&select=vin&limit=1000&offset=${offset}`, { headers: h })).json(); if (!Array.isArray(rows) || !rows.length) break; for (const r of rows) { withVin++; const c = String(r.vin || "").replace(/[\s.\-\/]/g, ""); if (c.length !== 17) chassis++; } if (rows.length < 1000) break; }
      out2.chassisStyle = chassis; out2.withVin = withVin;
      // Spot-check 2022-2023 BaT records: vin + photo presence.
      const spot = await (await fetch(`${url}/rest/v1/sales_archive?platform=eq.${encodeURIComponent(LABEL)}&sale_date=gte.2022-01-01&sale_date=lt.2023-06-01&select=vin,make,model,year,sale_date,raw_record&limit=5`, { headers: h })).json();
      out2.spotCheck2022_2023 = (Array.isArray(spot) ? spot : []).map(r => ({ car: [r.year, r.make, r.model].filter(Boolean).join(" "), date: r.sale_date, vin: r.vin, hasPhoto: !!(r.raw_record && (r.raw_record.featured_image_url || r.raw_record.photo_url)) }));
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json(out2);
    }
    res.setHeader("Cache-Control", "no-store");
    return res.status(400).json({ error: "mode must be count|pull|verify" });
  }
  // One Box share route (rewritten from /o/<id>). Served here to stay under the Hobby
  // plan's 12-function cap. HTML response, distinct from the JSON config path below.
  if (req.query && typeof req.query.obShare !== "undefined") {
    return handleOneboxShare(req, res, String(req.query.obShare || "").trim());
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=120");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  const supabaseUrl = process.env.SUPABASE_URL || null;
  const anonKey = process.env.SUPABASE_ANON_KEY || null;
  // Optional custom auth domain (e.g. https://auth.goasksam.com). When set, the frontend
  // routes the Google OAuth authorize + magic-link through it so the consent screen and
  // email links read as goasksam.com instead of the raw <ref>.supabase.co. UNSET = byte-
  // identical to today (falls back to supabaseUrl), so this ships dark and the cutover is
  // a single env flip with instant rollback (unset it). The data API stays on SUPABASE_URL.
  const authUrl = process.env.SUPABASE_AUTH_URL || null;
  if (!supabaseUrl || !anonKey) { res.status(500).json({ error: "auth not configured" }); return; }
  // One Box public-launch flag (app_config onebox_public). OFF = crew/tester-gated
  // (today); ON = public at /onebox. Same VIN-launch flip pattern, instant rollback =
  // set 0. Read with the service-role key (app_config is not anon-exposed); fail-safe to
  // false so the page can never accidentally open itself if the read fails.
  const flagEnv = { supabaseUrl, supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY || anonKey };
  let oneboxPublic = false;
  try { oneboxPublic = await appConfigFlag("onebox_public", flagEnv); } catch (e) { oneboxPublic = false; }
  res.status(200).json({ supabaseUrl, anonKey, authUrl, oneboxPublic });
}
