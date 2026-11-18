// FOR SALE: THE PULL (Lane D, lane-d-forsale, Nov 2026). The vendor's classifieds endpoint into OUR table, every 6 hours (api/pullForSale.js). The vendor is a supplier: it is called here and nowhere in a visitor's request.
// The vendor key is read from the environment by the caller and handed to callOldCarsData; it is never printed, logged, stored or returned.
// One walk per source (cursor paging, 100 a page, active, country US), held sources never asked for. A source's rows no longer listed after a COMPLETE walk are marked gone; a walk that did not finish marks nothing.
import { callOldCarsData } from "../_ocd.js";
import { pulledSources, pullVerdict, rowOf, isHeld, SOURCE_TABLE } from "./rules.js";

export const PAGE = 100;
const hdr = env => ({ apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, "Content-Type": "application/json" });

async function upsert(env, rows) {
  for (let i = 0; i < rows.length; i += 200) {
    const r = await fetch(`${env.supabaseUrl}/rest/v1/for_sale_listings?on_conflict=source,source_listing_id`, { method: "POST", headers: { ...hdr(env), Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(rows.slice(i, i + 200)) });
    if (!r.ok) throw new Error(`for_sale_listings write ${r.status}: ${(await r.text().catch(() => "")).slice(0, 160)}`);
  }
}
async function patch(env, query, body) {
  const r = await fetch(`${env.supabaseUrl}/rest/v1/for_sale_listings?${query}`, { method: "PATCH", headers: { ...hdr(env), Prefer: "return=representation" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`for_sale_listings patch ${r.status}: ${(await r.text().catch(() => "")).slice(0, 160)}`);
  const out = await r.json().catch(() => []);
  return Array.isArray(out) ? out.length : 0;
}

// opts: { call(params) -> a vendor page { data, meta } (the check's stand-in; default is the real endpoint), maxRequests, maxPagesPerSource, now }
export async function pullForSale(env, apiKey, opts = {}) {
  const t0 = Date.now(), now = opts.now ? new Date(opts.now) : new Date(), pulledAt = now.toISOString();
  const maxReq = Math.max(1, Number(opts.maxRequests) || 200), maxPages = Math.max(1, Number(opts.maxPagesPerSource) || 60);
  const call = opts.call || (params => callOldCarsData("/classifieds", params, apiKey));
  const out = { requests: 0, sources: {}, seen: 0, kept: 0, dropped: { not_us: 0, not_active: 0, unknown_source: 0, held_source: 0, no_id: 0 }, wrote: 0, markedGone: 0, heldMarkedGone: 0, errors: [], stoppedForBudget: false };
  for (const source of pulledSources()) {
    const st = out.sources[source] = { pages: 0, seen: 0, kept: 0, complete: false, gone: 0 };
    let cursor = null;
    try {
      for (;;) {
        if (out.requests >= maxReq || st.pages >= maxPages) { out.stoppedForBudget = out.stoppedForBudget || out.requests >= maxReq; break; }
        // the parameters the vendor documents (openapi /classifieds): exact source, active, country US, 100 a page, the cursor of the page before (all other parameters unchanged)
        const page = await call({ source, status: "active", country_code: "US", limit: PAGE, ...(cursor ? { cursor } : {}) });
        out.requests++; st.pages++;
        const data = Array.isArray(page && page.data) ? page.data : [];
        const rows = [];
        for (const rec of data) {
          out.seen++; st.seen++;
          const v = pullVerdict(rec);
          if (!v.keep) { out.dropped[v.why] = (out.dropped[v.why] || 0) + 1; continue; }
          out.kept++; st.kept++; rows.push(rowOf(rec, pulledAt));
        }
        if (rows.length) { await upsert(env, rows); out.wrote += rows.length; }
        const meta = (page && page.meta) || {};
        cursor = meta.has_more && meta.next_cursor ? String(meta.next_cursor) : null;
        if (!cursor) { st.complete = meta.has_more !== true; break; }
      }
    } catch (e) { out.errors.push({ source, error: String(e && e.message || e).replace(/Bearer\s+\S+/gi, "Bearer ").slice(0, 160) }); st.complete = false; }
    // a source walked to its end: what it no longer lists is gone (a failed or cut short walk marks nothing)
    if (st.complete) {
      try { st.gone = await patch(env, `source=eq.${encodeURIComponent(source)}&gone=eq.false&pulled_at=lt.${encodeURIComponent(pulledAt)}&select=id`, { gone: true, gone_at: pulledAt, updated_at: pulledAt }); out.markedGone += st.gone; }
      catch (e) { out.errors.push({ source, error: "mark gone: " + String(e && e.message || e).slice(0, 120) }); }
    }
  }
  // a source that is held (or was removed from the file) is never served: whatever it left in the table is marked gone
  try {
    const held = Object.keys(SOURCE_TABLE).filter(isHeld);
    if (held.length) out.heldMarkedGone = await patch(env, `source=in.(${held.map(encodeURIComponent).join(",")})&gone=eq.false&select=id`, { gone: true, gone_at: pulledAt, updated_at: pulledAt });
  } catch (e) { out.errors.push({ source: "held", error: String(e && e.message || e).slice(0, 120) }); }
  out.ms = Date.now() - t0;
  return out;
}
