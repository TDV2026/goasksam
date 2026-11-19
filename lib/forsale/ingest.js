// FOR SALE: THE PULL (Lane D, lane-d-forsale, Nov 2026). The vendor's classifieds endpoint into OUR table, every 6 hours (api/pullForSale.js). The vendor is a supplier: it is called here and nowhere in a visitor's request.
// The vendor key is read from the environment by the caller and handed to callOldCarsData; it is never printed, logged, stored or returned.
// One walk per source (cursor paging, 100 a page, active, country US), dealers first, then the classifieds, autotraderclassics last and only when switched on; held sources never asked for.
// SPENDING: the run is given an allowance (vendor queries, from lib/forsale/budget.js planRun) and makes none past it. 0 or none given: no query. A run that hits its allowance with a source or a page left STOPS: it marks NOTHING gone (a half read
// of the vendor proves nothing about what is missing), and says where it stopped. Only a run that finished every source it was asked for marks what a COMPLETE walk no longer lists as gone.
import { callOldCarsData } from "../_ocd.js";
import { pulledSources, pullVerdict, rowOf, isHeld, SOURCE_TABLE } from "./rules.js";
import { BUDGET } from "./budget.js";

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

// opts: { call(params) -> a vendor page { data, meta } (the check's stand-in; default is the real endpoint), maxRequests (THE ALLOWANCE; none or 0 means no vendor query), groups ({dealers, classifieds, autotraderclassics}, default the config's), maxPagesPerSource, now }
export async function pullForSale(env, apiKey, opts = {}) {
  const t0 = Date.now(), now = opts.now ? new Date(opts.now) : new Date(), pulledAt = now.toISOString();
  const allowance = Math.max(0, Math.floor(Number(opts.maxRequests) || 0)), maxPages = Math.max(1, Number(opts.maxPagesPerSource) || Number(BUDGET.max_pages_per_source) || 400);
  const timeMs = Number(opts.budgetMs) || 240000;   // the function's own limit is pinned at 300 s (vercel.json): the run stops before it, cleanly
  const call = opts.call || (params => callOldCarsData("/classifieds", params, apiKey));
  const order = pulledSources(opts.groups || BUDGET.pull);
  const out = { allowance, requests: 0, order, sources: {}, seen: 0, kept: 0, dropped: { not_us: 0, not_active: 0, unknown_source: 0, held_source: 0, no_id: 0 }, wrote: 0, markedGone: 0, heldMarkedGone: 0, errors: [], stopped: null, stoppedForBudget: false };
  const complete = []; let lastRl = null;
  outer: for (const source of order) {
    const st = out.sources[source] = { pages: 0, seen: 0, kept: 0, complete: false, gone: 0, started: false };
    let cursor = null;
    try {
      for (;;) {
        if (out.requests >= allowance) { out.stopped = { reason: "allowance", source, requests: out.requests, allowance, sourcesLeft: order.slice(order.indexOf(source)) }; break outer; }
        if (Date.now() - t0 > timeMs) { out.stopped = { reason: "time", source, requests: out.requests, allowance, sourcesLeft: order.slice(order.indexOf(source)) }; break outer; }
        if (st.pages >= maxPages) { out.stopped = { reason: "page_cap", source, requests: out.requests, allowance, sourcesLeft: order.slice(order.indexOf(source)) }; break outer; }
        st.started = true;
        // the parameters the vendor documents (openapi /classifieds): exact source, active, country US, 100 a page (its largest), the cursor of the page before (all other parameters unchanged)
        const page = await call({ source, status: "active", country_code: "US", limit: PAGE, ...(cursor ? { cursor } : {}) });
        out.requests++; st.pages++;
        if (page && page.__rateLimit) lastRl = page.__rateLimit;   // the vendor's own figures from this response's headers
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
        if (!cursor) { st.complete = meta.has_more !== true; if (st.complete) complete.push(source); break; }
      }
    } catch (e) { out.errors.push({ source, error: String(e && e.message || e).replace(/Bearer\s+\S+/gi, "Bearer ").slice(0, 160) }); st.complete = false; }
  }
  out.stoppedForBudget = !!(out.stopped && out.stopped.reason === "allowance");
  // A source walked to its end: what it no longer lists is gone. Only when the run was NOT stopped: a stopped run marks nothing.
  if (!out.stopped) for (const source of complete) {
    try { const st = out.sources[source]; st.gone = await patch(env, `source=eq.${encodeURIComponent(source)}&gone=eq.false&pulled_at=lt.${encodeURIComponent(pulledAt)}&select=id`, { gone: true, gone_at: pulledAt, updated_at: pulledAt }); out.markedGone += st.gone; }
    catch (e) { out.errors.push({ source, error: "mark gone: " + String(e && e.message || e).slice(0, 120) }); }
  }
  // a source that is held (or was removed from the file) is never served: whatever it left in the table is marked gone (this reads no vendor page, so a stopped run still does it)
  try {
    const held = Object.keys(SOURCE_TABLE).filter(isHeld);
    if (held.length) out.heldMarkedGone = await patch(env, `source=in.(${held.map(encodeURIComponent).join(",")})&gone=eq.false&select=id`, { gone: true, gone_at: pulledAt, updated_at: pulledAt });
  } catch (e) { out.errors.push({ source: "held", error: String(e && e.message || e).slice(0, 120) }); }
  out.ms = Date.now() - t0;
  out.rateLimit = lastRl;
  return out;
}
