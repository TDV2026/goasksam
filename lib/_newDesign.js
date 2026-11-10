// THE NEW DESIGN SWITCH (Lane E, Nov 10 2026, go live order; Sam approved the design in writing). ONE switch, per route, no redirect, no URL change.
//
//   NEW_DESIGN unset, "", "0", "off", "false"  -> OFF: every public route answers exactly what it answers today (the handler is called untouched; no byte moves).
//   NEW_DESIGN "1", "on", "true", "all"        -> ON for every route in scope.
//   NEW_DESIGN "home,find,about"               -> ON for those routes only (the route keys in ROUTES below; "find" is Find's landing and its results, "find-results" alone is its results).
// Lane C flips it in Vercel and redeploys; flipping it back restores today's site exactly (the off branch is the old handler, nothing else).
//
// HOW ON WORKS. The route's own handler is run first against a captured response with the request marked (req.__nd), so its status, headers, redirects, 404s, the
// holding page, the launch-stage redirect, the robots header and the cache rule are exactly today's. When that answer is a 200 page, ONLY THE BODY is replaced with the new
// design's page for the same address (api/crewPage.js newPageHtml, the same renderers the crew previews use). Any other status (302, 301, 404, 503) is replayed untouched.
// A new page that cannot be built answers today's page, never a blank. The new page's words are the engine's and the copy file's; nothing here computes a thing.
//
// CREW: with the switch off, a request that carries the signed crew cookie and ?design=new sees the ON state at the public address (private, no-store, noindex), so a
// live render check can look at it before the switch moves. Crew previews under /preview keep working either way.
import { isCrewRequest } from "./_crew.js";
import { applyPublicHead, publicAddresses, applyPublicScripts } from "./_publicHead.js";

export const ROUTES = ["home", "find", "find-results", "market-check", "sell", "tasks", "tasks-mine", "business", "how", "about", "whatsnew", "feedback", "terms", "privacy", "history"];
// the crew preview page each route's new design is served from (api/crewPage.js PAGES)
export const PAGE_OF = {
  home: "preview-home", find: "preview-find", "find-results": "preview-find", "market-check": "preview-market-check", sell: "preview-sell", tasks: "preview-tasks", "tasks-mine": "preview-tasks-mine",
  business: "preview-site-business", how: "preview-site-how", about: "preview-site-about", whatsnew: "preview-site-whatsnew", feedback: "preview-site-feedback",
  terms: "preview-site-terms", privacy: "preview-site-privacy", history: "preview-history"
};

export function switchRoutes(env = process.env) {
  const v = String(env.NEW_DESIGN == null ? "" : env.NEW_DESIGN).trim().toLowerCase();
  if (!v || v === "0" || v === "off" || v === "false" || v === "no") return [];
  if (v === "1" || v === "on" || v === "true" || v === "all" || v === "yes") return ROUTES.slice();
  const list = v.split(/[\s,]+/).filter(k => ROUTES.includes(k));
  return list.includes("find") && !list.includes("find-results") ? [...list, "find-results"] : list;   // Find is its landing and its results
}
export function switchOn(route, env = process.env) { return switchRoutes(env).includes(route); }

const asked = req => { try { return new URL(String(req.url || "/"), "https://x").searchParams.get("design") === "new"; } catch { return false; } };
// Is the new page wanted for this request? GET and HEAD only; never inside its own capture; the switch, or the crew's own look.
export function wantsNew(route, req, env = process.env) {
  if (!route || !PAGE_OF[route]) return { new: false };
  if (req.__nd) return { new: false };
  const m = String(req.method || "GET").toUpperCase();
  if (m !== "GET" && m !== "HEAD") return { new: false };
  if (switchOn(route, env)) return { new: true, look: false };
  if (asked(req) && isCrewRequest(req) === true) return { new: true, look: true };
  return { new: false };
}

// the same request without the crew cookie: what a visitor's request would be (the crew look shows the flip, so it reads the page the flip would read)
const asPublic = req => {
  const headers = { ...(req.headers || {}) }, c = String(headers.cookie || ""); if (c) headers.cookie = c.split(/;\s*/).filter(x => !/^gas_crew=/.test(x)).join("; ");
  let url = String(req.url || "/"); try { const u = new URL(url, "https://x"); u.searchParams.delete("design"); u.searchParams.delete("_crew"); url = u.pathname + (u.search || ""); } catch {}   // ?design=new is a query the current page would read as a different address (a query page is noindex)
  const query = { ...(req.query || {}) }; delete query.design; delete query._crew;
  return Object.assign(Object.create(Object.getPrototypeOf(req)), req, { headers, url, query });
};
function capture(handler, req) {
  return new Promise((resolve, reject) => {
    const res = {
      h: {}, code: 200, setHeader(k, v) { this.h[String(k).toLowerCase()] = v; return this; }, getHeader(k) { return this.h[String(k).toLowerCase()]; },
      removeHeader(k) { delete this.h[String(k).toLowerCase()]; }, writeHead(c, hh) { this.code = c; if (hh) for (const k of Object.keys(hh)) this.setHeader(k, hh[k]); return this; },
      status(c) { this.code = c; return this; }, json(o) { this.setHeader("content-type", "application/json; charset=utf-8"); return this.send(JSON.stringify(o)); }, end(x) { return this.send(x); },
      send(x) { if (!this.done) { this.done = true; resolve({ code: this.code, h: this.h, body: x == null ? "" : (Buffer.isBuffer(x) ? x : String(x)) }); } return this; }
    };
    Promise.resolve(handler(Object.assign(Object.create(Object.getPrototypeOf(req)), req, { __nd: true }), res)).then(() => { if (!res.done) resolve({ code: res.code, h: res.h, body: "" }); }, reject);
  });
}
function replay(res, cap, body) {
  for (const k of Object.keys(cap.h)) { if (k === "content-length") continue; res.setHeader(k, cap.h[k]); }
  return res.status(cap.code).send(body == null ? cap.body : body);
}

// route: a key, or a function (req) -> key | null, so one handler can serve several routes (terms and privacy, the history modes, Tasks and its app).
export function withNewDesign(route, handler) {
  return async function newDesignDoor(req, res) {
    let key = null;
    try { key = typeof route === "function" ? route(req) : route; } catch { key = null; }
    const w = wantsNew(key, req);
    if (!w.new) return handler(req, res);   // OFF: today's handler, untouched
    const cap = await capture(handler, w.look ? asPublic(req) : req);   // the crew look reads today's page as the PUBLIC gets it (Sell hands a crew cookie a different Sell, with noindex): the head must be the public one
    if (cap.code !== 200 || !/text\/html/i.test(String(cap.h["content-type"] || ""))) return replay(res, cap);
    let html = null;
    req.__nd = true; req.__legacy = { code: cap.code, h: cap.h, body: cap.body };   // the new page's own renderers call the live handlers; they must answer today's page inside it, never this door again
    try { const { newPageHtml } = await import("../api/crewPage.js"); html = await newPageHtml(PAGE_OF[key], req); } catch (e) { try { console.error(JSON.stringify({ tag: "new_design_failed", route: key, message: String(e && e.message || e).slice(0, 300) })); } catch {} }
    if (!html || typeof html !== "string") return replay(res, cap);   // a page that cannot be built answers today's page
    html = applyPublicHead(applyPublicScripts(publicAddresses(html, String(cap.body)), String(cap.body)), String(cap.body));   // the head of today's page, byte for byte; only the h1 and the body are the new design's
    res.setHeader("X-Design", "new");
    if (w.look) { res.setHeader("Cache-Control", "private, no-store"); res.setHeader("X-Robots-Tag", "noindex, nofollow"); }
    for (const k of Object.keys(cap.h)) { if (k === "content-length" || (w.look && (k === "cache-control" || k === "x-robots-tag"))) continue; res.setHeader(k, cap.h[k]); }
    return res.status(200).send(html);
  };
}
