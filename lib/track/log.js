// The one write path for analytics events (Oct 2026, Lane C; docs/analytics-events.md).
//
// track(req, name, props, opts) for a request; trackSystem(name, props, opts) for cron and ledger events.
// Both return at once and never throw. The write is fire and forget: events queue in memory (200 at most per
// instance), go out in one batch per tick, give up after 1.5 seconds, and are idempotent on event_id. On
// Vercel the batch is handed to the platform's waitUntil so it finishes after the response. If the store is
// down, the product answers exactly as before and a failure counter (trackHealth()) goes up.
//
// Unknown events or fields: thrown in tests (TRACK_STRICT=1 or a test sink), dropped and counted in production.
import crypto from "crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { EVENTS, PRODUCTS, SURFACES, SCHEMA_VERSION, validateEvent, isServiceEvent } from "./catalog.js";
import { scrubText, uaClass, isBotUa, refDomain, pickUtm, pathTemplate, UTM_FIELDS } from "./privacy.js";
import { identity, isInternal } from "./consent.js";

const QUEUE_MAX = 200, BATCH_MAX = 100, TIMEOUT_MS = 1500, INFLIGHT_MAX = 3;
let inflight = 0;
const queue = [];
let flushScheduled = false;
let sink = null;   // tests: a function that receives each row instead of the network
const health = { queued: 0, written: 0, write_failures: 0, events_lost: 0, dropped_invalid: 0, dropped_full: 0,
  dropped_declined: 0, last_failure_at: null, last_failure: null, since: new Date().toISOString() };
let lastConsoleAt = 0;

export const trackHealth = () => ({ ...health, pending: queue.length });
export function setTrackSink(fn) { sink = typeof fn === "function" ? fn : null; }
const strict = () => process.env.TRACK_STRICT === "1" || !!sink;

function storeEnv() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

// The failure counter the dashboard reads: each instance adds its lost-event count to the usage ledger
// (app_usage_events, event_type analytics_write_failed) at most once a minute, so a write problem is visible
// across every instance. If the ledger is down too, the count waits for the next try.
let unreported = 0, lastReportAt = 0;
function reportFailures() {
  if (sink || !unreported || Date.now() - lastReportAt < 60000) return;
  const env = storeEnv(); if (!env) return;
  lastReportAt = Date.now();
  const n = unreported, what = health.last_failure;
  const ctrl = new AbortController(); const t = setTimeout(() => { try { ctrl.abort(); } catch {} }, TIMEOUT_MS);
  keepAlive(fetch(`${env.url}/rest/v1/app_usage_events`, { method: "POST", signal: ctrl.signal,
    headers: { apikey: env.key, Authorization: `Bearer ${env.key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ created_at: new Date().toISOString(), event_type: "analytics_write_failed", route: "analytics", status: String(what || "").slice(0, 40),
      oldcarsdata_metered_requests: 0, metadata: { lost: n, instance_total: health.events_lost } }) })
    .then(r => { if (r.ok) unreported -= n; }).catch(() => {}).finally(() => clearTimeout(t)));
}

function onFailure(what, n) {
  health.write_failures++; health.events_lost += n; unreported += n;
  health.last_failure_at = new Date().toISOString(); health.last_failure = String(what).slice(0, 60);
  if (Date.now() - lastConsoleAt > 60000) { lastConsoleAt = Date.now(); console.error(`analytics write failed (${health.last_failure}); ${health.events_lost} events lost on this instance so far`); }
  reportFailures();
}

async function flush() {
  flushScheduled = false;
  while (queue.length && inflight < INFLIGHT_MAX) await sendBatch();
}

async function sendBatch() {
  {
    const rows = queue.splice(0, BATCH_MAX);
    if (!rows.length) return;
    if (sink) { for (const r of rows) { try { sink(r); } catch {} } health.written += rows.length; return; }
    const env = storeEnv();
    if (!env) { onFailure("store not configured", rows.length); return; }
    const ctrl = new AbortController();
    const t = setTimeout(() => { try { ctrl.abort(); } catch {} }, TIMEOUT_MS);
    inflight++;
    try {
      const r = await fetch(`${env.url}/rest/v1/analytics_events?on_conflict=event_id`, {
        method: "POST", signal: ctrl.signal,
        headers: { apikey: env.key, Authorization: `Bearer ${env.key}`, "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=minimal" },
        body: JSON.stringify(rows)
      });
      if (r.ok) health.written += rows.length; else onFailure("http " + r.status, rows.length);
    } catch (e) { onFailure(/abort/i.test(String(e && e.message)) ? "timeout" : "network", rows.length); }
    finally { clearTimeout(t); inflight--; if (queue.length) schedule(); }
  }
}

function keepAlive(p) {
  try {
    const ctx = globalThis[Symbol.for("@vercel/request-context")];
    const c = ctx && ctx.get && ctx.get();
    if (c && typeof c.waitUntil === "function") c.waitUntil(p);
  } catch {}
}
// One batch per tick; a full batch goes out at once, so a burst inside one tick never fills the queue.
function schedule() {
  if (queue.length >= BATCH_MAX && inflight < INFLIGHT_MAX) { keepAlive(sendBatch().catch(() => {})); return; }
  if (flushScheduled) return;
  flushScheduled = true;
  keepAlive(new Promise(r => setTimeout(r, 0)).then(flush).catch(() => {}));
}

// Waits for the queue to empty (tests and the cron only; a product request never calls this).
export async function trackDrain() { while (queue.length || flushScheduled || inflight) { if (queue.length && inflight < INFLIGHT_MAX) await flush(); else await new Promise(r => setTimeout(r, 20)); } }

function reject(errors) {
  health.dropped_invalid++;
  if (strict()) throw new Error("analytics: " + errors.join("; "));
}

// Builds one stored row. Free text is scrubbed, a VIN moves to its own column, ids are dropped when declined.
export function buildRow(name, props, ctx) {
  const def = EVENTS[name];
  if (!def) return reject(["unknown event: " + name]);
  const p = { ...(props || {}) };
  let vin = ctx.vin ? String(ctx.vin).toUpperCase().slice(0, 17) : null;
  for (const [k, t] of Object.entries({ ...def.req, ...def.opt })) {
    if (t === "text" && p[k] != null) { const s = scrubText(p[k]); p[k] = s.text; if (s.vin && !vin) vin = s.vin; }
    if (t === "path" && p[k] != null) p[k] = pathTemplate(p[k]);
    // A short key with an odd character (an accent, an ampersand) is kept, the character replaced.
    if (t === "key" && (typeof p[k] === "string" || typeof p[k] === "number")) p[k] = String(p[k]).replace(/[^A-Za-z0-9_\-.|:/ ]/g, "-").slice(0, 60);
    // A key that is itself VIN-shaped (a listing or sale id can be): the VIN goes to its own column.
    if (t === "key" && p[k] != null) { const s = scrubText(p[k]); if (s.vin) { if (!vin) vin = s.vin; p[k] = ":vin"; } }
  }
  const v = validateEvent(name, p, ctx.by);
  if (!v.ok) return reject(v.errors);
  const product = PRODUCTS.includes(ctx.product) ? ctx.product : null;
  if (!product) return reject([`${name}: product missing or unknown (${ctx.product})`]);
  const surface = SURFACES.includes(ctx.surface) ? ctx.surface : null;
  const declined = ctx.consent === "declined";
  if (declined && !isServiceEvent(name)) { health.dropped_declined++; return null; }
  const ua = ctx.ua != null ? uaClass(ctx.ua) : { browser_family: null, device_class: null };
  const utm = pickUtm(ctx.utm || null);
  const row = {
    event_id: ctx.event_id && /^[0-9a-f-]{36}$/i.test(ctx.event_id) ? ctx.event_id.toLowerCase() : crypto.randomUUID(),
    ts: ctx.ts || new Date().toISOString(),
    name, schema_version: SCHEMA_VERSION, product, surface,
    anon_id: declined ? null : (ctx.anon_id || null),
    user_id: declined ? null : (ctx.user_id && /^[0-9a-f-]{36}$/i.test(ctx.user_id) ? ctx.user_id : null),
    session_id: declined ? null : (ctx.session_id || null),
    region_class: ctx.region_class || null,
    consent: ctx.consent || "not_required",
    ref_domain: ctx.ref != null ? refDomain(ctx.ref) : null,
    browser_family: ua.browser_family, device_class: ua.device_class,
    is_bot: ctx.ua != null ? isBotUa(ctx.ua) : false,
    internal: !!ctx.internal,
    engine_version: ctx.engine_version ? String(ctx.engine_version).slice(0, 60) : null,
    props: v.props,
    vin,
  };
  for (const k of UTM_FIELDS) row[k] = utm[k];
  return row;
}

function enqueue(row) {
  if (!row) return;
  if (queue.length >= QUEUE_MAX) { health.dropped_full++; return; }
  queue.push(row); health.queued++;
  schedule();
}

// A request's event. opts: product (required), surface, user_id, engine_version, vin, by ("server" default).
export function track(req, name, props, opts = {}) {
  try {
    const id = identity(req, null);
    const h = (req && req.headers) || {};
    enqueue(buildRow(name, props, {
      ...opts, by: opts.by || "server", ...id,
      ua: h["user-agent"] || "", internal: opts.internal || isInternal(req),
    }));
  } catch (e) { if (strict()) throw e; }
}

// No visitor: cron runs and ledger-derived events. Region null, consent not_required, no ids.
export function trackSystem(name, props, opts = {}) {
  try {
    enqueue(buildRow(name, props, { ...opts, by: "server", consent: "not_required", region_class: null, internal: !!opts.internal }));
  } catch (e) { if (strict()) throw e; }
}

// Browser hits from /api/track: identity is minted there (it is the helper's own response), the browser's
// own fields come from the body, and everything else from the request.
export function trackFromBrowser(req, res, events, page) {
  const id = identity(req, res, { mint: true });
  const h = (req && req.headers) || {};
  const internal = isInternal(req);
  const now = Date.now();
  let accepted = 0, refused = 0;
  for (const e of (Array.isArray(events) ? events : []).slice(0, 20)) {
    try {
      const t = Date.parse(e && e.ts);
      const ts = Number.isFinite(t) && t <= now + 60000 && t >= now - 24 * 3600 * 1000 ? new Date(t).toISOString() : new Date(now).toISOString();
      const row = buildRow(String(e && e.name), e && e.props, {
        by: "browser", product: e && e.product, surface: e && e.surface, event_id: e && e.event_id, ts,
        ...id, ua: h["user-agent"] || "", internal,
        ref: page && page.ref, utm: page && page.utm,
      });
      if (row) { enqueue(row); accepted++; } else refused++;
    } catch { refused++; }
  }
  return { accepted, refused, consent: id.consent };
}

// The request a wrapped handler is serving, so code deep in lib/ (a Task paused from a chat turn) can log a
// journey event with the visitor's consent and ids without being handed the request.
const current = new AsyncLocalStorage();

// For lib code: with a wrapped request, a normal track(); with none (a cron, a script), service events go out
// as system events and journey events are skipped (their consent is unknown).
export function trackCurrent(name, props, opts = {}) {
  const store = current.getStore();
  if (store && store.req) return track(store.req, name, props, opts);
  if (isServiceEvent(name)) return trackSystem(name, props, opts);
}

// Wraps an API handler: sets the current request, and logs one error event when the handler throws or answers
// 5xx. The response itself is untouched.
export function withTracking(route, handler, product = "site") {
  return function tracked(req, res) {
    return current.run({ req }, async () => {
      try {
        const out = await handler(req, res);
        const st = Number(res && res.statusCode) || 0;
        if (st >= 500) track(req, "error", { route, status: st }, { product, surface: "api" });
        return out;
      } catch (e) {
        track(req, "error", { route, status: 500, code: "threw" }, { product, surface: "api" });
        throw e;
      }
    });
  };
}

// Sign-in link (docs/analytics-events.md): earlier events from this browser's anon_id get the account's user_id.
// Never when consent is declined (there is no anon_id then, and the SQL function skips declined rows).
// Fire and forget, bounded like every other write.
export function linkAnonToUser(req, userId) {
  try {
    const id = identity(req, null);
    if (id.consent === "declined" || !id.anon_id || !/^[0-9a-f-]{36}$/i.test(String(userId || ""))) return;
    if (sink) { try { sink({ link: true, anon_id: id.anon_id, user_id: userId }); } catch {} return; }
    const env = storeEnv(); if (!env) return;
    const ctrl = new AbortController(); const t = setTimeout(() => { try { ctrl.abort(); } catch {} }, TIMEOUT_MS);
    const p = fetch(`${env.url}/rest/v1/rpc/analytics_link_anon`, { method: "POST", signal: ctrl.signal,
      headers: { apikey: env.key, Authorization: `Bearer ${env.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_anon: id.anon_id, p_user: userId }) })
      .then(r => { if (!r.ok) onFailure("link http " + r.status, 0); }).catch(() => onFailure("link network", 0)).finally(() => clearTimeout(t));
    try { const c = globalThis[Symbol.for("@vercel/request-context")]; const x = c && c.get && c.get(); if (x && x.waitUntil) x.waitUntil(p); } catch {}
  } catch {}
}
