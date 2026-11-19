// ONE LIMIT STYLE FOR A PUBLIC ROUTE THAT RUNS A DATABASE QUERY OR THE ENGINE (Lane D, Oct 27 2026; class fix for
// /api/history, /api/vehicleIdentity and the shared-result page). The same ledger and the same keys as
// lib/_ceilings.js checkCeiling (a device key and a daily-salted address hash, never an address), the same rules:
//   - crew and our own keyed jobs are exempt, as everywhere in the ceilings;
//   - it FAILS OPEN: an unreadable ledger, or one that takes longer than LEDGER_MS, lets the request through;
//   - a hit logs the existing limit_hit event with the route and the scope, so the Held back panel shows it. Unlike
//     checkCeiling it logs at most one limit_hit a minute per route and limit on an instance, so a flood costs the
//     ledger reads and no more writes than that (a bot that is being refused must not become a write load itself).
// It changes no ceiling that already exists: new scopes are added to CEILINGS in lib/_ceilings.js beside the old ones.
import { CEILINGS, deviceKey, deviceKeys, addressKey, addressKeys, countSince, record, isCrew } from "./_ceilings.js";
import { hasServerCredential } from "./_credential.js";
import { track } from "./track/log.js";

const H = 3600e3, D = 864e5;
export const LEDGER_MS = 1500;
const lastLogged = new Map();

const slow = ms => new Promise(r => setTimeout(() => r(null), ms));

// Returns { ok: true } or { ok: false, kind, retryAfter }. scope: a key of CEILINGS. route: the path, for the event.
export async function routeLimit(env, req, scope, { route, ms = LEDGER_MS } = {}) {
  const spec = CEILINGS[scope];
  if (!env || !spec || isCrew(req) || hasServerCredential(req)) return { ok: true };
  const out = await Promise.race([check(env, req, scope, spec, route), slow(ms)]);
  return out || { ok: true };   // null: the ledger was slow or unreadable, so the request goes through
}

async function check(env, req, scope, spec, route) {
  try {
    const dev = deviceKey(req), devs = deviceKeys(req), adr = addressKey(req), adrs = addressKeys(req), kind = "c:" + scope;
    const checks = [];
    for (const [win, max] of spec.device || []) if (dev) checks.push({ key: devs, win, max, what: "device" });
    for (const [win, max] of spec.address || []) if (adr) checks.push({ key: adrs, win, max, what: "address" });
    const now = Date.now();
    const counts = await Promise.all(checks.map(c => countSince(env, c.key, kind, new Date(now - c.win).toISOString())));
    const hit = checks.find((c, i) => counts[i] != null && counts[i] >= c.max);
    if (hit) {
      const k = `${hit.what}_${hit.win >= D ? "day" : hit.win >= H ? "hour" : "minute"}`;
      const lk = scope + "|" + k, t = Date.now();
      if (!(lastLogged.get(lk) > t - 60000)) {
        lastLogged.set(lk, t); if (lastLogged.size > 200) lastLogged.clear();
        try { track(req, "limit_hit", { limit: k, scope, route: String(route || scope).slice(0, 60) }, { product: "site", surface: "api" }); } catch { /* never blocks */ }
      }
      return { ok: false, kind: k, retryAfter: hit.win >= H ? 600 : 60 };
    }
    record(env, [dev, adr].filter(Boolean), kind).catch(() => {});   // not awaited: a slow write never slows the page
    return { ok: true };
  } catch { return null; }
}

// The plain answer for a page that is over its limit: 429 with Retry-After, no body that varies, nothing logged as an error.
export function sendTooMany(res, retryAfter = 60) {
  res.setHeader("Retry-After", String(retryAfter));
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  return res.status(429).send("Too many requests. Try again in a minute.");
}
