// GOOGLEBOT LOG (Lane S, Nov 20 2026): Search Console shows 241 crawl requests in 90 days, 7 percent of them HTML. We cannot tell whether Google's requests
// reach a function at all or are answered before it, at the edge (a cached page, a redirect, a static file). One line per request whose user agent names Googlebot,
// written by the handler itself: path, status and milliseconds. A request the edge answers never runs this, so the gap between this count and Search Console's
// crawl count is the edge's share. No address, no user agent text and no query string is kept: the path alone, and the ledger row is a count by day, status and kind.
import { recordUsageEvent } from "../api/_usage.js";

export const isGooglebot = ua => /googlebot/i.test(String(ua || ""));
// the path alone (no query), and the kind of page for the count
export const botPath = url => { try { return new URL(String(url || "/"), "https://x").pathname.slice(0, 200); } catch { return "/"; } };
export function botKind(p) {
  if (/^\/(sitemap[^/]*\.xml|robots\.txt)$/.test(p)) return "sitemap";
  if (/^\/history\/[^/]+\/[^/]+$/.test(p)) return "vin";
  if (/^\/history(\/|$)/.test(p)) return "hub";
  if (/^\/cars(\/|$)/.test(p)) return "spec";
  return "page";
}
export function botLine(req, status, ms) { const path = botPath(req && req.url); return { tag: "googlebot", path, kind: botKind(path), status: Number(status) || 0, ms: Math.max(0, Math.round(ms)) }; }

export function withGooglebotLog(handler) {
  return async function botLogged(req, res) {
    const ua = req && req.headers && req.headers["user-agent"];
    if (!isGooglebot(ua)) return handler(req, res);
    const t0 = Date.now();
    try { return await handler(req, res); }
    finally {
      try {
        const line = botLine(req, res && res.statusCode, Date.now() - t0);
        console.log(JSON.stringify(line));
        const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const p = recordUsageEvent({ event_type: "googlebot_request", route: line.path, status: String(line.status), metadata: { kind: line.kind, ms: line.ms, path: line.path } }, url, key).catch(() => {});
        try { const c = globalThis[Symbol.for("@vercel/request-context")]; const x = c && c.get && c.get(); if (x && x.waitUntil) x.waitUntil(p); } catch {}
      } catch {}
    }
  };
}
