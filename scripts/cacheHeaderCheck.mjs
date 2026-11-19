// CACHE HEADER CHECK (Lane D, Oct 27 2026). No network, no database, no key.
// A repeat crawler hit on an indexed page must be answerable by the edge without running the engine. So:
//   1. every api/*.js that serves an HTML page sets a shared cache (s-maxage) for the public response, or is on the short list of files that
//      are gated, noindex or not pages, each of which must say so in the file. A NEW page route with neither FAILS.
//   2. /api/history: a page that exists gets s-maxage with stale-while-revalidate, one that does not exist a short s-maxage, a 503, a 500 and a
//      429 are never kept; crew, a keyed job and a pre-launch site stay private and no-store; the sitemaps keep their day cache.
//   3. /o/<id> carries s-maxage (max-age alone is not kept by the edge).
//   node scripts/cacheHeaderCheck.mjs
import fs from "node:fs"; import path from "node:path"; import { pathToFileURL, fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL  " + m); } };
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ---- 1. every HTML page route
const NOT_INDEXED = {   // file -> what the file must show for the exemption to be true
  "admin.js": /noindex/, "crew.js": /noindex/, "crewPage.js": /noindex/, "partnerDemo.js": /noindex/, "tasks.js": /noindex/, "usageDashboard.js": /noindex/, "watch.js": /noindex/,
  "gsc.js": /verification|google-site-verification|search console/i, "mcp.js": /ui:\/\/|openai\/outputTemplate/,
};
const files = fs.readdirSync(path.join(ROOT, "api")).filter(f => f.endsWith(".js") && !f.startsWith("_"));
const bad = [];
for (const f of files) {
  const raw = read("api/" + f), src = strip(raw);
  if (!/text\/html/.test(src)) continue;
  if (/s-maxage/.test(src)) { ok(true, f); continue; }
  if (NOT_INDEXED[f] && NOT_INDEXED[f].test(raw)) { ok(true, f); continue; }
  bad.push(f);
}
ok(bad.length === 0, "page routes with no shared cache header and no listed reason: " + bad.join(", "));
for (const f of Object.keys(NOT_INDEXED)) ok(files.includes(f), `list entry ${f} no longer exists`);

// ---- 2. /api/history
const hist = await imp("api/history.js");
ok(/s-maxage=\d+/.test(hist.HISTORY_PAGE_CACHE) && /stale-while-revalidate=\d+/.test(hist.HISTORY_PAGE_CACHE) && /^public/.test(hist.HISTORY_PAGE_CACHE), "history: a page that exists gets a public shared cache with stale-while-revalidate (" + hist.HISTORY_PAGE_CACHE + ")");
ok(/^public, s-maxage=\d+$/.test(hist.HISTORY_MISS_CACHE), "history: a page that does not exist gets a short shared cache (" + hist.HISTORY_MISS_CACHE + ")");
const hsrc = strip(read("api/history.js"));
ok(/status === 200 \? HISTORY_PAGE_CACHE : status === 404 \? HISTORY_MISS_CACHE : "no-store"/.test(hsrc), "history: only 200 and 404 are kept; every other status is no-store");
ok(/\(crew \|\| hasCrewCookie \|\| hasServerCredential\(req\) \|\| !fullyLaunched\(\)\) \? "private, no-store"/.test(hsrc), "history: crew, any crew cookie, a keyed job and a pre-launch site stay private and no-store");
ok(/s-maxage=86400, stale-while-revalidate=86400/.test(hsrc) && /s-maxage=3600/.test(hsrc), "history: sitemaps keep their day cache and redirects their hour");
const mkRes = () => ({ h: {}, c: null, b: null, setHeader(k, v) { this.h[k.toLowerCase()] = v; }, getHeader(k) { return this.h[k.toLowerCase()]; }, status(c) { this.c = c; this.statusCode = c; return this; }, send(b) { this.b = b; return this; }, json(b) { this.b = b; return this; }, end() { return this; } });
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, init = {}) => { const url = String(u); if (/ip_rate_hits/.test(url) && init.method === "HEAD") return new Response(null, { status: 206, headers: { "content-range": "0-0/0" } }); return new Response("[]", { status: 200, headers: { "content-type": "application/json" } }); };
process.env.SUPABASE_URL = "https://x.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; delete process.env.CURTAIN_SEALED;
const req = (q, extra = {}) => ({ headers: { "x-forwarded-for": "203.0.113.5", "user-agent": "Googlebot/2.1", ...(extra.headers || {}) }, query: q, method: "GET", socket: {} });
try {
  process.env.LAUNCH_STAGE = "2"; process.env.LAUNCH_BUSINESS = "1";
  let res = mkRes(); await hist.default(req({ slug: "1990-porsche-911", vin: "WP0AB0961LS450123" }), res);
  ok(res.c === 404 && res.h["cache-control"] === hist.HISTORY_MISS_CACHE, "history: an unknown VIN is a 404 kept for the short time at the edge (" + res.c + ", " + res.h["cache-control"] + ")");
  res = mkRes(); await hist.default(req({ slug: "-1990-porsche-911-", vin: "WP0AB0961LS450123" }), res);
  ok(res.c === 301 && /s-maxage=3600/.test(res.h["cache-control"]), "history: a tidy-slug redirect is kept an hour");
  res = mkRes(); await hist.default(req({ slug: "1990-porsche-911", vin: "WP0AB0961LS450123" }, { headers: { cookie: "gas_crew=x" } }), res);
  ok(/no-store/.test(res.h["cache-control"] || ""), "history: any crew cookie is no-store");
  process.env.LAUNCH_STAGE = "0"; delete process.env.LAUNCH_BUSINESS;
  res = mkRes(); await hist.default(req({ slug: "1990-porsche-911", vin: "WP0AB0961LS450123" }), res);
  ok(/no-store/.test(res.h["cache-control"] || ""), "history: before the site is fully launched nothing is shared");
  // ---- 3. /o/<id>
  process.env.LAUNCH_STAGE = "2"; process.env.LAUNCH_BUSINESS = "1";
  const cfg = (await imp("api/publicConfig.js")).default;
  res = mkRes(); await cfg({ ...req({ obShare: "0123456789abcdef0123" }), url: "/o/0123456789abcdef0123" }, res);
  ok(res.c === 200 && /s-maxage=\d+/.test(res.h["cache-control"] || "") && /stale-while-revalidate/.test(res.h["cache-control"] || ""), "/o/<id>: a shared result page carries s-maxage with stale-while-revalidate (" + res.c + ", " + res.h["cache-control"] + ")");
  res = mkRes(); await cfg({ ...req({ obShare: "0123456789abcdef0123" }, { headers: { cookie: "gas_crew=x" } }), url: "/o/0123456789abcdef0123" }, res);
  ok(/no-store/.test(res.h["cache-control"] || ""), "/o/<id>: any crew cookie is no-store");
} finally { globalThis.fetch = realFetch; }
console.log(`cacheHeaderCheck: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
