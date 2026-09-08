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
import { supabaseSelect } from "../lib/_supabase.js";

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
  // TEMP read-only diagnostic (Murcielago VIN-match investigation). Nonce-gated, no writes.
  if (req.query && req.query.diag === "lam9v") {
    const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    const h = { apikey: key, Authorization: `Bearer ${key}` };
    const VIN = "ZHWBC8AH7ALA03815";
    const get = async (tbl, q) => { try { const r = await fetch(`${url}/rest/v1/${tbl}?${q}`, { headers: h }); const t = await r.text(); let j; try { j = JSON.parse(t); } catch { return { err: t.slice(0, 150) }; } return Array.isArray(j) ? j : { err: JSON.stringify(j).slice(0, 150) }; } catch (e) { return { err: e.message }; } };
    const cnt = async (tbl, f) => { try { const r = await fetch(`${url}/rest/v1/${tbl}?${f}&select=id`, { headers: { ...h, Prefer: "count=exact", Range: "0-0" } }); const cr = r.headers.get("content-range") || ""; return cr.includes("/") ? Number(cr.split("/")[1]) : ("hdr:" + r.status); } catch (e) { return "err:" + e.message; } };
    const cb = "Cars%20%26%20Bids";
    const slim = rows => Array.isArray(rows) ? rows.map(r => ({ platform: r.platform, date: r.sale_date || r.auction_end_date, price: r.sale_price || r.price, make: r.make, model: r.model, vin: r.vin, rawVin: r.raw_record && (r.raw_record.vin || r.raw_record.VIN), title: r.listing_title || (r.raw_record && r.raw_record.title) })) : rows;
    const out = {};
    // Per-platform VIN coverage (fast count queries): how often a VIN match could fire.
    out.coverage = {};
    for (const pf of ["Cars %26 Bids", "Bring a Trailer", "RM Sotheby's", "Gooding %26 Co", "Hagerty", "All Collector Cars", "PCARMarket"]) {
      const name = pf.replace("%26", "&");
      const total = await cnt("sales_archive", `platform=eq.${encodeURIComponent(name)}`);
      const withVin = await cnt("sales_archive", `platform=eq.${encodeURIComponent(name)}&vin=not.is.null`);
      out.coverage[name] = { total, withVin, pct: (typeof total === "number" && total) ? Math.round(1000 * (typeof withVin === "number" ? withVin : 0) / total) / 10 : null };
    }
    // sales_archive
    out.SA_byVinExact = slim(await get("sales_archive", `vin=eq.${VIN}&select=platform,sale_date,sale_price,make,model,vin,listing_title,raw_record`));
    out.SA_byDateMake = slim(await get("sales_archive", `platform=eq.${cb}&make=ilike.*lamborghini*&sale_date=eq.2023-06-15&select=platform,sale_date,sale_price,make,model,vin,listing_title,raw_record`));
    out.SA_byPrice = slim(await get("sales_archive", `sale_price=eq.700000&make=ilike.*lamborghini*&select=platform,sale_date,sale_price,make,model,vin,listing_title,raw_record`));
    out.SA_murcielago2023 = slim(await get("sales_archive", `make=ilike.*lamborghini*&model=ilike.*murcielago*&sale_date=gte.2023-01-01&sale_date=lt.2024-01-01&select=platform,sale_date,sale_price,make,model,vin,listing_title,raw_record&limit=20`));
    // vehicle_market_records: does it even have a vin column?
    out.VMR_hasVinColumn = await get("vehicle_market_records", `select=vin&limit=1`);
    out.VMR_byPrice = slim(await get("vehicle_market_records", `price=eq.700000&make=ilike.*lamborghini*&select=platform,auction_end_date,price,make,model,raw_record&limit=10`));
    // C&B coverage + range in sales_archive
    out.SA_cbTotal = await cnt("sales_archive", `platform=eq.${cb}`);
    out.SA_cbVinNull = await cnt("sales_archive", `platform=eq.${cb}&vin=is.null`);
    out.SA_cb2023Total = await cnt("sales_archive", `platform=eq.${cb}&sale_date=gte.2023-01-01&sale_date=lt.2024-01-01`);
    out.SA_cbEarliest = slim(await get("sales_archive", `platform=eq.${cb}&select=sale_date&order=sale_date.asc.nullslast&limit=1`));
    // Does OCD even have this VIN? (informational - via any store)
    out.SA_vinIlike = slim(await get("sales_archive", `vin=ilike.*ZHWBC8AH7ALA03815*&select=platform,sale_date,vin,make,model`));
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(out);
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
