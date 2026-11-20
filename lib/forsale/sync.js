// FOR SALE: THE SYNC (Lane D, lane-d-forsale-sync, Nov 2026). The vendor's classifieds into OUR table by CHANGES, not by walking everything every time. The vendor is a supplier: it is called here and nowhere in a visitor's request.
// The vendor key is read from the environment by the caller and handed to callOldCarsData; it is never printed, logged, stored or returned.
// THREE PARTS, per source (the vendor's own docs, https://oldcarsdata.com/docs/classifieds#polling-for-changes; every successful page is one query):
//   1. THE LOAD (once per source, resumable): status=active, country US, direction=asc, 100 a page, the page cursor saved after each page is written. ASCENDING, because a presence check re-stamps updated_at and sends a listing to the END of an ascending order
//      (it is visited later) but to the FRONT of a descending one (a walk past it would miss it). Cursors expire 24 hours after their first page: an expired one restarts that source's load. A load that is not finished serves nothing and marks nothing.
//   2. THE CHANGE POLL: status=all, direction=asc, changed_since fixed, the saved meta.next_sync_cursor passed back as cursor with the SAME filters. Applies price changes (and our dated price facts) and moves to sold, withdrawn, gone (or back to active).
//   3. THE STALE POLL: status=active, last_seen_before = 24 hours before the poll, no cursor to start. A listing it returns is HIDDEN (not deleted). A hidden listing RETURNS when (a) a later change poll shows it with a last_seen_at inside 24 hours,
//      or (b) a later COMPLETE stale poll no longer lists it while it is still active (a presence check since then moved its last_seen_at past the cutoff: that is the usual road back, because a presence check is not a change and a change poll never carries it).
// NOTHING IS EVER MARKED GONE FROM A WALK THAT ENDED: not an unfinished load, not a finished one. A listing is gone only when the vendor says so (a status in a change poll). Hiding and gone are different: hidden comes back by itself, gone comes back only if the vendor says active again.
// SPENDING: the run is given an allowance (vendor queries, from lib/forsale/budget.js planRun) and makes none past it; 0 or none given: no query. Order of work when the allowance is short: change polls, then stale polls, then loads (a dead card shown costs more than a late one).
import { callOldCarsData } from "../_ocd.js";
import { pulledSources, pullVerdict, rowOf, isHeld, SOURCE_TABLE, FRESH_MS, mergeFacts } from "./rules.js";
import { BUDGET } from "./budget.js";

export const PAGE = 100;
export const STATE_PREFIX = "forsale_sync:";
export const SYNC_DEFAULT = { lapse_hours: 30, overlap_minutes: 60 };
const syncCfg = () => ({ ...SYNC_DEFAULT, ...(BUDGET.sync || {}) });
export const lapseMs = () => Math.max(1, Number(syncCfg().lapse_hours) || SYNC_DEFAULT.lapse_hours) * 3600e3;
const hdr = env => ({ apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, "Content-Type": "application/json" });
const iso = ms => new Date(ms).toISOString();

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
async function select(env, query) {
  const r = await fetch(`${env.supabaseUrl}/rest/v1/for_sale_listings?${query}`, { headers: hdr(env) });
  if (!r.ok) throw new Error(`for_sale_listings read ${r.status}`);
  const out = await r.json(); return Array.isArray(out) ? out : [];
}

// ONE STATE ROW PER SOURCE in app_config (key forsale_sync:<source>), written after each page is written. null when unreadable: the run then does nothing and the serve side serves nothing (fail closed).
export async function loadStates(env) {
  try {
    const r = await fetch(`${env.supabaseUrl}/rest/v1/app_config?key=like.${encodeURIComponent(STATE_PREFIX + "*")}&select=key,value`, { headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}` } });
    if (!r.ok) return null;
    const rows = await r.json(); if (!Array.isArray(rows)) return null;
    const out = {};
    for (const x of rows) { try { out[String(x.key).slice(STATE_PREFIX.length)] = typeof x.value === "string" ? JSON.parse(x.value) : x.value; } catch { /* a row that does not parse is a source with no state: it loads again */ } }
    return out;
  } catch { return null; }
}
async function saveState(env, source, st) {
  const r = await fetch(`${env.supabaseUrl}/rest/v1/app_config?on_conflict=key`, { method: "POST", headers: { ...hdr(env), Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([{ key: STATE_PREFIX + source, value: st }]) });
  if (!r.ok) throw new Error(`sync state write ${r.status}`);
}

// THE SOURCES WHOSE SYNC IS CURRENT, as the serve side reads it: loaded, and a change poll and a stale poll that finished within the lapse window. Any other source is not served.
export function liveSources(states, now) {
  const live = new Set(); if (!states) return live;
  const ok = t => { const x = Date.parse(t); return Number.isFinite(x) && now - x <= lapseMs() && now - x > -3600e3; };
  for (const [src, st] of Object.entries(states)) if (st && st.load && st.load.done === true && st.change && ok(st.change.ok_at) && st.stale && ok(st.stale.ok_at)) live.add(src);
  return live;
}

const idKey = v => String(Number(v));
// opts: { call(params) -> a vendor page { data, meta } (the check's stand-in; default is the real endpoint), maxRequests (THE ALLOWANCE; none or 0 means no vendor query), groups, maxPagesPerSource, budgetMs, now }
export async function syncForSale(env, apiKey, opts = {}) {
  const t0 = Date.now(), now = opts.now ? new Date(opts.now) : new Date(), at = now.toISOString(), nowMs = now.getTime();
  const allowance = Math.max(0, Math.floor(Number(opts.maxRequests) || 0)), maxPages = Math.max(1, Number(opts.maxPagesPerSource) || Number(BUDGET.max_pages_per_source) || 400);
  const timeMs = Number(opts.budgetMs) || 240000;   // the function's own limit is pinned at 300 s (vercel.json): the run stops before it, cleanly
  const call = opts.call || (params => callOldCarsData("/classifieds", params, apiKey));
  const order = pulledSources(opts.groups || BUDGET.pull), overlapMs = Math.max(0, Number(syncCfg().overlap_minutes) || 0) * 60e3;
  const out = { allowance, requests: 0, order, sources: {}, seen: 0, kept: 0, dropped: { not_us: 0, not_active: 0, unknown_source: 0, held_source: 0, no_id: 0 }, wrote: 0, priceChanges: 0, moved: { sold: 0, withdrawn: 0, gone: 0, unknown: 0, active: 0 }, hidden: 0, unhidden: 0, resetToResolver: 0, markedGone: 0, heldMarkedGone: 0, errors: [], stopped: null, stoppedForBudget: false };
  let lastRl = null;
  const states = await loadStates(env);
  if (!states) { out.stopped = { reason: "state_unreadable", requests: 0, allowance }; out.ms = Date.now() - t0; return out; }   // the state of the sync cannot be read: nothing is queried, nothing is written
  const sref = s => (out.sources[s] = out.sources[s] || { load: { pages: 0, rows: 0, complete: false }, change: { pages: 0, rows: 0, complete: false }, stale: { pages: 0, hidden: 0, unhidden: 0, complete: false } });
  // one more vendor query, or the reason there is none
  const spend = (phase, source) => {
    const why = out.requests >= allowance ? "allowance" : Date.now() - t0 > timeMs ? "time" : null;
    if (why) { out.stopped = { reason: why, phase, source, requests: out.requests, allowance, sourcesLeft: order.slice(Math.max(0, order.indexOf(source))) }; return false; }
    return true;
  };
  const fetchPage = async (phase, source, params, cursor) => {
    const page = await call({ ...params, ...(cursor ? { cursor } : {}) });
    out.requests++;
    if (page && page.__rateLimit) lastRl = page.__rateLimit;   // the vendor's own figures from this response's headers
    return page;
  };
  const ids = rows => [...new Set(rows.map(x => Number(x.id)).filter(n => n > 0))];

  // WRITE ONE PAGE: the records a page carries, as rows (US, dollars, source typed; a non-active record only for a listing we already hold), our dated price facts merged, a listing whose identity changed sent back to the resolver
  async function applyPage(source, data, mode) {
    const rows = [], resets = [], repriced = [], st = sref(source);
    const held = new Map();
    const want = ids(data);
    if (want.length) for (let i = 0; i < want.length; i += 100) for (const x of await select(env, `source=eq.${encodeURIComponent(source)}&vendor_id=in.(${want.slice(i, i + 100).join(",")})&select=id,vendor_id,title,year,vin_norm,make,model,asking_price_usd,price_history,status,resolve_state`)) held.set(idKey(x.vendor_id), x);
    for (const rec of data) {
      out.seen++;
      const v = pullVerdict(rec, { anyStatus: mode === "change" }), ex = held.get(idKey(rec.id));
      if (!v.keep) {
        out.dropped[v.why] = (out.dropped[v.why] || 0) + 1;
        if (ex && v.why === "not_us") { await patch(env, `id=eq.${ex.id}&select=id`, { gone: true, gone_at: at, status: "unknown", updated_at: at }); out.moved.unknown++; }   // a listing we hold that the vendor now says is not US dollars is no longer served
        continue;
      }
      const row = rowOf(rec, at);
      if (!ex && row.status !== "active") { out.dropped.not_active++; continue; }   // a listing we never held and the vendor calls sold, withdrawn or gone: nothing to store
      out.kept++; st[mode].rows++;
      if (ex) {
        row.price_history = mergeFacts(ex.price_history, row.price_history);
        if (Number(ex.asking_price_usd) > 0 && row.asking_price_usd !== Number(ex.asking_price_usd)) { out.priceChanges++; repriced.push(ex.id); }   // a listing whose asking price changed has its read made again at once (the read lives 7 days otherwise)
        if (ex.status && ex.status !== row.status) out.moved[row.status] = (out.moved[row.status] || 0) + 1;
        if (ex.resolve_state === "resolved") { row.make = ex.make || row.make; row.model = ex.model || row.model; }   // the ENGINE's make and model stay until the engine is asked again
        const same = (a, b) => String(a == null ? "" : a) === String(b == null ? "" : b);
        if (!same(ex.title, row.title) || !same(ex.year, row.year) || !same(ex.vin_norm, row.vin_norm)) resets.push(ex.id);   // what the car IS changed: the resolver and the read are made again
      }
      rows.push(row);
    }
    if (rows.length) { await upsert(env, rows); out.wrote += rows.length; }
    for (const id of repriced) { if (resets.includes(id)) continue; await patch(env, `id=eq.${id}&select=id`, { read: null, updated_at: at }); out.requeuedForPrice = (out.requeuedForPrice || 0) + 1; }
    for (const id of resets) { await patch(env, `id=eq.${id}&select=id`, { resolve_state: null, car: null, car_key: null, read: null, history: null, updated_at: at }); out.resetToResolver++; }
  }

  // ---- 1. THE CHANGE POLLS (only for a source whose load is finished) ----
  const failed = new Set();
  async function changePoll(source, state) {
    const st = sref(source), ch = state.change = state.change || {};
    if (!ch.since) ch.since = iso(Date.parse(state.load.started_at || at) - overlapMs);
    const filters = { source, country_code: "US", status: "all", direction: "asc", changed_since: ch.since, limit: PAGE };
    let tries = 0;
    for (;;) {
      if (st.change.pages >= maxPages) { out.stopped = { reason: "page_cap", phase: "change", source, requests: out.requests, allowance, sourcesLeft: order.slice(order.indexOf(source)) }; return false; }
      if (!spend("change", source)) return false;
      const cursor = ch.page_cursor || ch.checkpoint || null;
      let page;
      try { page = await fetchPage("change", source, filters, cursor); }
      catch (e) {
        if (e && e.status === 400 && cursor && tries++ < 2) {   // an expired page cursor restarts the traversal from the checkpoint; a refused checkpoint (filters or key changed) starts from the fixed changed_since
          if (ch.page_cursor) ch.page_cursor = null; else ch.checkpoint = null;
          out.errors.push({ source, error: "change cursor refused (400): restarted from " + (ch.checkpoint ? "the checkpoint" : "changed_since") });
          await saveState(env, source, state); continue;
        }
        throw e;
      }
      st.change.pages++;
      const data = Array.isArray(page && page.data) ? page.data : [], meta = (page && page.meta) || {};
      await applyPage(source, data, "change");
      if (meta.has_more && meta.next_cursor) { ch.page_cursor = String(meta.next_cursor); await saveState(env, source, state); continue; }   // saved only after the page was written
      if (meta.next_sync_cursor) ch.checkpoint = String(meta.next_sync_cursor);   // an initial empty search has none: the next poll keeps its filters
      ch.page_cursor = null; ch.ok_at = at; ch.pages_last = st.change.pages; ch.rows_last = st.change.rows;
      await saveState(env, source, state); st.change.complete = true; return true;
    }
  }

  // ---- 2. THE STALE POLLS ----
  async function stalePoll(source, state) {
    const st = sref(source), cutoff = iso(nowMs - FRESH_MS), listed = new Set();
    const filters = { source, country_code: "US", status: "active", last_seen_before: cutoff, limit: PAGE };
    let cursor = null;
    for (;;) {
      if (st.stale.pages >= maxPages) { out.stopped = { reason: "page_cap", phase: "stale", source, requests: out.requests, allowance, sourcesLeft: order.slice(order.indexOf(source)) }; return false; }
      if (!spend("stale", source)) return false;
      const page = await fetchPage("stale", source, filters, cursor);
      st.stale.pages++;
      const data = Array.isArray(page && page.data) ? page.data : [], meta = (page && page.meta) || {};
      const got = ids(data); for (const i of got) listed.add(idKey(i));
      for (let i = 0; i < got.length; i += 100) {   // hide (never delete): the row stays and keeps everything it had
        const n = await patch(env, `source=eq.${encodeURIComponent(source)}&vendor_id=in.(${got.slice(i, i + 100).join(",")})&status=eq.active&gone=eq.false&select=id`, { hidden: true, hidden_at: at, updated_at: at });
        st.stale.hidden += n; out.hidden += n;
      }
      if (meta.has_more && meta.next_cursor) { cursor = String(meta.next_cursor); continue; }
      break;
    }
    // A COMPLETE stale poll: a hidden listing it no longer lists, still active, was seen again since: it comes back
    const hiddenNow = await select(env, `source=eq.${encodeURIComponent(source)}&hidden=eq.true&status=eq.active&gone=eq.false&select=id,vendor_id`);
    for (const h of hiddenNow) if (!listed.has(idKey(h.vendor_id))) { const n = await patch(env, `id=eq.${h.id}&select=id`, { hidden: false, hidden_at: null, updated_at: at }); st.stale.unhidden += n; out.unhidden += n; }
    state.stale = { ok_at: at, cutoff, listed: listed.size, hidden: st.stale.hidden, unhidden: st.stale.unhidden };
    await saveState(env, source, state); st.stale.complete = true; return true;
  }

  // ---- 3. THE LOAD (resumable) ----
  async function loadStep(source, state) {
    const st = sref(source); let ld = state.load = state.load || { done: false, cursor: null, pages: 0, rows: 0, started_at: null };
    if (!ld.started_at) ld.started_at = at;
    const filters = { source, country_code: "US", status: "active", direction: "asc", limit: PAGE };
    let restarted = false;
    for (;;) {
      if (st.load.pages >= maxPages) { out.stopped = { reason: "page_cap", phase: "load", source, requests: out.requests, allowance, sourcesLeft: order.slice(order.indexOf(source)) }; return false; }
      if (!spend("load", source)) return false;
      let page;
      try { page = await fetchPage("load", source, filters, ld.cursor); }
      catch (e) {
        if (e && e.status === 400 && ld.cursor && !restarted) { restarted = true; ld = state.load = { done: false, cursor: null, pages: 0, rows: 0, started_at: at, restarts: (ld.restarts || 0) + 1 }; out.errors.push({ source, error: "load cursor refused (400, expired after 24 hours): the load for this source restarts" }); await saveState(env, source, state); continue; }
        throw e;
      }
      st.load.pages++; ld.pages++;
      const data = Array.isArray(page && page.data) ? page.data : [], meta = (page && page.meta) || {};
      const k0 = out.kept; await applyPage(source, data, "load"); ld.rows += out.kept - k0; st.load.rows += out.kept - k0;
      if (meta.has_more && meta.next_cursor) { ld.cursor = String(meta.next_cursor); await saveState(env, source, state); continue; }   // saved only after the page was written: a stopped run resumes here
      ld.done = true; ld.cursor = null; ld.done_at = at;
      state.change = { since: iso(Date.parse(ld.started_at) - overlapMs), checkpoint: null, page_cursor: null };   // changes since the load began (with an overlap): nothing between the load and the first poll is missed
      await saveState(env, source, state); st.load.complete = true; return true;
    }
  }

  const run = async (phase, fn, need) => {
    for (const source of order) {
      if (out.stopped) return;
      const state = states[source] = states[source] || {};
      if (need(state) === false || failed.has(source)) continue;
      try { await fn(source, state); } catch (e) { out.errors.push({ source, error: `${phase}: ` + String(e && e.message || e).replace(/Bearer\s+\S+/gi, "Bearer ").slice(0, 160) }); failed.add(source); }
    }
  };
  const loaded = s => !!(s.load && s.load.done === true);
  await run("change", changePoll, loaded);
  await run("stale", stalePoll, loaded);
  await run("load", loadStep, s => !loaded(s));
  out.stoppedForBudget = !!(out.stopped && out.stopped.reason === "allowance");
  // a source that is held (or was removed from the file) is never served: whatever it left in the table is marked gone (this reads no vendor page, so a stopped run still does it)
  try {
    const heldSrc = Object.keys(SOURCE_TABLE).filter(isHeld);
    if (heldSrc.length) out.heldMarkedGone = await patch(env, `source=in.(${heldSrc.map(encodeURIComponent).join(",")})&gone=eq.false&select=id`, { gone: true, gone_at: at, updated_at: at });
  } catch (e) { out.errors.push({ source: "held", error: String(e && e.message || e).slice(0, 120) }); }
  out.ms = Date.now() - t0;
  out.rateLimit = lastRl;
  return out;
}
