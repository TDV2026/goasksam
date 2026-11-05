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
import { supabaseSelect } from "../lib/_supabase.js";

import { sendDisguisedNotFound } from "../lib/_notFound.js";
import { cors as gasCors } from "../lib/_cors.js";
import { deskDoor } from "../lib/desk/door.js";
import { listViewable, viewableSeat, mintViewAsValue, viewAsHeader, clearViewAsHeader } from "../lib/desk/viewAs.js";
import { recordUsageEvent } from "./_usage.js";
import { routeLimit, sendTooMany } from "../lib/_routeLimit.js";
import { failBody } from "../lib/_fail.js";
// One CORS helper (lib/_cors.js, security F-06): only GoAskSam's own hosts get a cross-origin answer.
function setCors(res, req) { gasCors(req || { headers: {} }, res, { methods: "POST, OPTIONS", headers: "Content-Type" }); }

export default async function handler(req, res) {
  // Crew/tester check FIRST, before anything else (CORS headers, method handling) can tell a
  // stranger this endpoint is even here. Desk is crew-only ALWAYS (never public, unlike the
  // storefront) - a non-crew, non-tester caller gets the exact same plain 404 regardless of HTTP
  // method, with no JSON, no CORS headers, and no mention of Desk anywhere in the response.
  // A SEAT (Lane C, Nov 4 2026): a signed gas_seat cookie whose seat row is still active (re-read on every call, so a removed seat is out on the next one). It runs Valuations (sheet_) actions only.
  const e1 = { supabaseUrl: process.env.SUPABASE_URL, supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY };
  // WHICH DOOR (lib/desk/door.js): crew, crew viewing as ONE seat (explicit switch), tester, or a seat cookie. Nothing else gets past the disguised 404.
  const door = await deskDoor(req, { env: e1.supabaseUrl ? e1 : null });
  if (!door) return sendDisguisedNotFound(res, req);
  const seat = door.seat, viewing = door.viewing;

  setCors(res, req);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  // The switch itself: crew only (the real signed cookie, even while viewing, so the crew can always switch back). Logged. A seat or a tester never reaches these.
  const body0 = req.body || {};
  if (door.realCrew && typeof body0.action === "string" && body0.action.startsWith("viewas_")) {
    const log = what => recordUsageEvent({ event_type: "desk_view_as", metadata: { what, seat_id: body0.seatId || null } }, e1.supabaseUrl, e1.supabaseKey).catch(() => {});
    if (body0.action === "viewas_list") { const rows = await listViewable(e1).catch(() => null); return res.status(200).json({ ok: true, viewing: seat ? { seatId: seat.seatId, org: seat.org, name: seat.name } : null, seats: rows || [] }); }
    if (body0.action === "viewas_set") {
      const target = await viewableSeat(e1, Number(body0.seatId)), v = target ? mintViewAsValue(target.seatId) : null;
      if (!target || !v) return res.status(200).json({ ok: false, error: "That seat cannot be viewed (not active, or not signed in yet)." });
      await log("on:" + target.org + ":" + target.seatId); res.setHeader("Set-Cookie", viewAsHeader(v)); res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ ok: true, viewing: { seatId: target.seatId, org: target.org, name: target.name } });
    }
    if (body0.action === "viewas_clear") { await log("off"); res.setHeader("Set-Cookie", clearViewAsHeader()); res.setHeader("Cache-Control", "no-store"); return res.status(200).json({ ok: true, viewing: null }); }
    return res.status(400).json({ ok: false, error: "unknown viewas action" });
  }
  if (seat) {
    const lim = await routeLimit({ supabaseUrl: process.env.SUPABASE_URL, supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY }, req, "desk_seat", { route: "/api/desk" }); if (!lim.ok) return sendTooMany(res, lim.retryAfter);
    const act = req.body && req.body.action;
    if (typeof act !== "string" || !act.startsWith("sheet_") || req.body.archiveDiag) return res.status(403).json({ ok: false, error: "A seat runs the Valuations actions only." });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  // READ-ONLY archive diagnostic (crew-only, 300s budget): count duplicate
  // (vin_norm, sale_date, source_slug) rows archive-wide - the same physical sale ingested under two
  // source_record_ids. Keyset-pages the whole vin_norm-bearing archive by the indexed id and groups
  // in memory. Never deletes anything. Lives here (not sellerDecision) because the full scan needs
  // more than sellerDecision's 60s ceiling. Report-only.
  if (req.body && req.body.archiveDiag === "dupScan") {
    const env2 = { supabaseUrl, supabaseKey };
    // The duplication mechanism is OCD re-assigning source_record_id to the SAME physical HOUSE sale
    // (the RM Sotheby's example), so the scan iterates the house source_slugs (small, index-backed,
    // fits the budget) rather than the whole vin_norm archive (which does not finish in 300s). Online
    // sources (BaT/C&B) upsert on a stable source_id, so they do not accumulate (vin,date,slug) dups
    // the same way. Pass archiveDiagSlugs to override the source set. Report-only; never deletes.
    // Filter on the DISPLAY LABEL (`platform`, always populated, index-backed with sale_date) via an
    // apostrophe-free ILIKE token (platform=eq."RM Sotheby's" errored on the apostrophe). Page by
    // sale_date offset (uses the (platform, sale_date) index). Key the dedup on the row's own platform.
    const HOUSE_TOKENS = Array.isArray(req.body.archiveDiagTokens) && req.body.archiveDiagTokens.length
      ? req.body.archiveDiagTokens
      : ["Sotheby", "Gooding", "Bonhams", "Broad Arrow", "Mecum", "Barrett"];
    const g = new Map(); let scanned = 0, pages = 0; const perToken = {};
    for (const tok of HOUSE_TOKENS) {
      let off = 0, tokRows = 0;
      for (let i = 0; i < 200; i++) {
        const q = `sales_archive?select=vin_norm,sale_date,platform&platform=ilike.${encodeURIComponent("*" + tok + "*")}&vin_norm=not.is.null&sale_date=not.is.null&order=id&limit=1000&offset=${off}`;
        let batch = null;
        for (let a = 0; a < 3 && batch === null; a++) { batch = await supabaseSelect(env2, q); if (batch === null && a < 2) await new Promise(r => setTimeout(r, 300 * (a + 1))); }
        if (batch === null) return res.status(200).json({ status: "dupScan", error: "query_failed", scanned, pages, token: tok });
        if (!batch.length) break;
        pages++;
        for (const r of batch) {
          scanned++; tokRows++;
          const vn = String(r.vin_norm || "").trim(); if (!vn) continue;
          const k = `${vn}|${String(r.sale_date).slice(0, 10)}|${r.platform || ""}`;
          g.set(k, (g.get(k) || 0) + 1);
        }
        off += batch.length;
        if (batch.length < 1000) break;
      }
      perToken[tok] = tokRows;
    }
    let dupGroups = 0, extraRows = 0; const bySource = {};
    for (const [k, n] of g) if (n > 1) { dupGroups++; extraRows += n - 1; const lab = k.split("|")[2] || "(null)"; bySource[lab] = (bySource[lab] || 0) + (n - 1); }
    return res.status(200).json({ status: "dupScan", scope: "house_sources", sourcesScanned: HOUSE_TOKENS, scanned, pages, rowsPerSource: perToken, keyedGroups: g.size, dupGroups, extraRows, extraRowsBySource: bySource });
  }

  try {
    if (viewing) recordUsageEvent({ event_type: "desk_view_as", metadata: { what: "action", action: String((req.body || {}).action || "").slice(0, 40), seat_id: seat.seatId, org: seat.org, sheet: String((req.body || {}).id || "").slice(0, 40) } }, e1.supabaseUrl, e1.supabaseKey).catch(() => {});
    const out = await handleDeskRequest(req.body || {}, {
      env: { supabaseUrl, supabaseKey }, apiKey: process.env.ANTHROPIC_API_KEY,
      ...door.ctx, curtainSealed: process.env.CURTAIN_SEALED === "1"
    });
    const code = out.httpStatus || 200; delete out.httpStatus;
    return res.status(code).json(out);
  } catch (e) {
    return res.status(500).json(failBody("desk", e, { status: "error" }));
  }
}
