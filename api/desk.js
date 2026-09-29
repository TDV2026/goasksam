// Sam Desk API (crew-gated B2B analytics over the archive).
// =====================================================================
// Its OWN serverless function since Vercel Pro (maxDuration 300s, set in vercel.json).
// It previously rode api/sellerDecision.js only because the Hobby plan capped functions
// at 12; that constraint is gone. Archive-only, ZERO OldCarsData. The heavy ranking /
// trend / comparison reads need more than sellerDecision's 60s budget, so they get their
// own function with a 300s ceiling and never share the storefront's timeout.
//
// Behaviour is identical to the old inlined block: crew-only ALWAYS (a non-crew,
// non-tester caller is refused regardless of the launch curtain), same context shape.
import { handleDeskRequest } from "../lib/desk/handler.js";
import { testerCodeExpired } from "../lib/_tester.js";
import { supabaseSelect } from "../lib/_supabase.js";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
function parseCookies(header) {
  const out = {};
  String(header || "").split(";").forEach(part => {
    const i = part.indexOf("=");
    if (i > 0) { try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch (e) {} }
  });
  return out;
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  const cookies = parseCookies(req.headers.cookie);
  const crew = cookies.gas_crew === "ok";
  const tester = cookies.gas_tester === "ok" && !testerCodeExpired();
  // Desk is crew-only ALWAYS (never public, unlike the storefront).
  if (!crew && !tester) return res.status(403).json({ status: "sealed", error: "Desk is crew-only." });

  // READ-ONLY archive diagnostic (crew-only, 300s budget): count duplicate
  // (vin_norm, sale_date, source_slug) rows archive-wide - the same physical sale ingested under two
  // source_record_ids. Keyset-pages the whole vin_norm-bearing archive by the indexed id and groups
  // in memory. Never deletes anything. Lives here (not sellerDecision) because the full scan needs
  // more than sellerDecision's 60s ceiling. Report-only.
  if (req.body && req.body.archiveDiag === "dupScan") {
    const env2 = { supabaseUrl, supabaseKey };
    const g = new Map(); let cursor = "", scanned = 0, pages = 0;
    for (let i = 0; i < 600; i++) {
      let q = `sales_archive?select=id,vin_norm,sale_date,source_slug&vin_norm=not.is.null&sale_date=not.is.null&order=id.asc&limit=1000`;
      if (cursor) q += `&id=gt.${encodeURIComponent(cursor)}`;
      let batch = null;
      for (let a = 0; a < 3 && batch === null; a++) { batch = await supabaseSelect(env2, q); if (batch === null && a < 2) await new Promise(r => setTimeout(r, 300 * (a + 1))); }
      if (batch === null) return res.status(200).json({ status: "dupScan", error: "query_failed", scanned, pages });
      if (!batch.length) break;
      pages++;
      for (const r of batch) {
        scanned++;
        const vn = String(r.vin_norm || "").trim(); if (!vn) continue;
        const k = `${vn}|${String(r.sale_date).slice(0, 10)}|${r.source_slug || ""}`;
        g.set(k, (g.get(k) || 0) + 1);
      }
      cursor = batch[batch.length - 1].id;
      if (batch.length < 1000) break;
    }
    let dupGroups = 0, extraRows = 0; const bySlug = {};
    for (const [k, n] of g) if (n > 1) { dupGroups++; extraRows += n - 1; const slug = k.split("|")[2] || "(null)"; bySlug[slug] = (bySlug[slug] || 0) + (n - 1); }
    return res.status(200).json({ status: "dupScan", scanned, pages, keyedGroups: g.size, dupGroups, extraRows, extraRowsBySlug: bySlug });
  }

  try {
    const out = await handleDeskRequest(req.body || {}, {
      env: { supabaseUrl, supabaseKey }, apiKey: process.env.ANTHROPIC_API_KEY,
      crew, tester, curtainSealed: process.env.CURTAIN_SEALED === "1",
      org: crew ? "sam" : (tester ? "tester" : "public"), seat: "crew"
    });
    const code = out.httpStatus || 200; delete out.httpStatus;
    return res.status(code).json(out);
  } catch (e) {
    return res.status(500).json({ status: "error", error: e.message || "desk failed" });
  }
}
