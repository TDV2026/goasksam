// THE OPEN SITE HAS ONE STATE (Lane E, Oct 30 2026, launch-day regression: "For business" missing from the rail for a stranger and /business redirecting to /sell, with LAUNCH_STAGE=2 and the curtain gone).
// CAUSE: the rail's For business link and the /business route read their own switch, LAUNCH_BUSINESS=1 (lib/_launchStage.js launchBusinessOn), which the runbook says to leave off; nothing in the runbook's open-site state (CURTAIN_SEALED removed, LAUNCH_STAGE=2, SELL_NEXT_ON=1, LAUNCH_AT set) turned it on.
// FIX: business is released at stage 2 like Find; LAUNCH_BUSINESS=0 is the explicit hold-back, unset or 1 follows the stage.
// CLASS: any public page that redirects, 404s or drops a rail item for a stranger when the site is open. This check opens the site exactly as the runbook does (and nothing else: no crew cookie, no probe key, no sign-in, no PUBLIC_LAUNCH, no LAUNCH_BUSINESS)
// and requests every public route as a stranger: each must answer 200 with a page (no redirect, no 404, no sealed or holding page), and every public rail and footer item must be in each page's rail. Then the one-state rule: LAUNCH_BUSINESS=0 is the only thing that holds /business back.
//   node scripts/openSiteGateCheck.mjs
import fs from "node:fs"; import path from "node:path"; import { pathToFileURL, fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
globalThis.fetch = async (u, init = {}) => { const url = String(u); if (init.method === "HEAD") return new Response(null, { status: 206, headers: { "content-range": "0-0/0" } }); return new Response("[]", { status: 200, headers: { "content-type": "application/json", "content-range": "0-0/0" } }); };
const OPEN = () => { for (const k of ["CURTAIN_SEALED", "PUBLIC_LAUNCH", "LAUNCH_BUSINESS", "CURTAIN_CREW_CODE", "GAS_CREW_SECRET"]) delete process.env[k];
  Object.assign(process.env, { LAUNCH_STAGE: "2", SELL_NEXT_ON: "1", LAUNCH_AT: "2026-10-29T07:00:00-07:00", SUPABASE_URL: "https://x.test", SUPABASE_SERVICE_ROLE_KEY: "k" }); };
const mkRes = () => ({ h: {}, c: 200, b: "", setHeader(k, v) { this.h[k.toLowerCase()] = v; }, getHeader(k) { return this.h[k.toLowerCase()]; }, status(c) { this.c = c; this.statusCode = c; return this; }, send(b) { this.b = b == null ? "" : String(b); return this; }, json(o) { this.b = JSON.stringify(o); return this; }, end(b) { if (b) this.b = String(b); return this; }, redirect(a, b) { this.c = typeof a === "number" ? a : b; this.h.location = typeof a === "number" ? b : a; return this; } });
const stranger = (url, query = {}) => ({ url, method: "GET", query, headers: { "x-forwarded-for": "203.0.113.9", "user-agent": "Mozilla/5.0 (iPhone)", host: "goasksam.com" }, socket: {}, cookies: {} });
// every public route a stranger can reach: [path, handler file, query]
const ROUTES = [["/", "api/home.js", {}], ["/sell", "api/sell.js", {}], ["/find", "api/buy.js", {}], ["/market-check", "api/marketCheck.js", {}], ["/tasks", "api/tasksPage.js", {}], ["/business", "api/business.js", {}],
  ["/how-sam-decides", "api/howSamDecides.js", {}], ["/about", "api/about.js", {}], ["/feedback", "api/feedback.js", {}], ["/privacy", "api/legal.js", { page: "privacy" }], ["/terms", "api/legal.js", { page: "terms" }], ["/cars/porsche/911", "api/specPage.js", { slug: "/cars/porsche/911" }]];
const RAIL = [["Home", /<a [^>]*href="\/"[^>]*>(?:\s*<[^>]*>)*\s*Home/], ["Find", /href="\/find"/], ["Market Check", /href="\/market-check"/], ["Sell", /href="\/sell"/], ["Tasks", /href="\/tasks"/], ["For business", /href="\/business"/], ["How Sam decides", /href="\/how-sam-decides"/], ["About", /href="\/about"/], ["Feedback", /href="\/feedback"/]];
const run = async (file, url, q) => { const mod = await imp(file), res = mkRes(); try { await mod.default(stranger(url, q), res); } catch (e) { res.c = 500; res.b = String(e && e.stack || e); } return res; };
OPEN();
for (const [url, file, q] of ROUTES) {
  const r = await run(file, url, q);
  ok(r.c === 200 && !r.h.location, `${url}: a stranger gets the page when the site is open (status ${r.c}${r.h.location ? " to " + r.h.location : ""})`);
  ok(/<html|<!doctype/i.test(r.b) && !/Not open yet|coming soon|holding/i.test(r.b.slice(0, 4000)), `${url}: it is a page, not a holding or sealed screen`);
  if (r.c === 200 && /gas-navitem|class="rail/.test(r.b)) for (const [name, re] of RAIL) ok(re.test(r.b), `${url}: a stranger's rail has ${name}`);
}
// the one-state rule: LAUNCH_BUSINESS=0 is the explicit hold-back, nothing else
process.env.LAUNCH_BUSINESS = "0"; { const r = await run("api/business.js", "/business", {}); ok(r.c === 302 && r.h.location === "/sell", "LAUNCH_BUSINESS=0 holds /business back (the explicit hold)"); } OPEN();
process.env.LAUNCH_STAGE = "1"; { const r = await run("api/business.js", "/business", {}); ok(r.c === 302, "below stage 2 /business is still held"); } OPEN();
const ls = await imp("lib/_launchStage.js"); ok(ls.fullyLaunched() === true, "fullyLaunched() is true in the open-site state (public pages may be cached)");
console.log(`openSiteGateCheck: ${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0);
