// HIDDEN CREW PAGES (Lane E, Nov 3 2026, lane-e-hidecrew). Sam: a crew-only page must be invisible. Asked without the crew cookie it answers the site's ORDINARY 404, identical in status, headers and body to any address that was never there: no redirect, no "sign in",
// no header of its own. With the cookie it works as before. CAUSE: each crew page hid itself its own way (a conditional rewrite for /desk; an unconditional rewrite and a 1.3 KB page of its own for /onebox-preview; a 9-byte "Not found" for /preview; a 307 redirect
// from /partner-demo that named /preview; a 40 KB dashboard page at status 404 for /admin; JSON {"error":"Not found"} from the partner answer), so each answered differently from an unknown address and told a stranger something was there.
// WHO ELSE: every address that reaches api/crewPage.js, api/desk.js, api/admin.js, api/partnerDemo.js, api/partnerAnswer.js and api/usageDashboard.js, directly or through vercel.json. THE CLASS: any address that routes to a crew function must (1) be a conditional rewrite or redirect
// at the router (so without the cookie the platform answers its own 404), (2) answer through sendDisguisedNotFound when the function is reached anyway, (3) never be named in a file or page a visitor or crawler can read.
//   node scripts/hiddenCrewCheck.mjs           offline: every crew function called with no cookie, a browser Accept, a plain Accept, a forged cookie; vercel.json; every public file
//   node scripts/hiddenCrewCheck.mjs --live    ALSO asks goasksam.com (the Vercel automation bypass) for each crew address and for a random unknown one and compares status, header names, content type and body (request id removed)
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);
const LIVE = process.argv.includes("--live");
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
process.env.CURTAIN_CREW_CODE = "fixture-crew-code"; process.env.LAUNCH_STAGE = "2";
for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY"]) delete process.env[k];
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const { mintCrewCookieValue } = await imp("lib/_crew.js"), { NATIVE_404_HTML } = await imp("lib/_notFoundTemplate.js");
const crewCookie = "gas_crew=" + mintCrewCookieValue();
const ID = "sfo1::abcde-1793729298955-0123456789ab";
// ---- what the platform answers for an address that was never there (captured live, Nov 3 2026): status 404, x-vercel-error NOT_FOUND, Cache-Control public max-age=0 must-revalidate, text/plain for a non-browser Accept, the HTML page for a browser Accept
const NATIVE = wantsHtml => ({ status: 404, ct: wantsHtml ? "text/html; charset=utf-8" : "text/plain; charset=utf-8", body: wantsHtml ? NATIVE_404_HTML.split("__ID__").join(ID) : "The page could not be found\n\nNOT_FOUND\n\n" + ID + "\n" });
const ALLOWED_HEADERS = new Set(["content-type", "cache-control", "x-vercel-error"]);
async function call(file, url, { cookie, accept, method = "GET", body } = {}) {
  const m = await imp(file);
  const res = { h: {}, code: 200, body: "", setHeader(k, v) { this.h[k.toLowerCase()] = v; return this; }, getHeader(k) { return this.h[k.toLowerCase()]; }, removeHeader(k) { delete this.h[k.toLowerCase()]; }, status(c) { this.code = c; return this; }, send(b) { this.body = Buffer.isBuffer(b) ? b.toString("utf8") : String(b); return this; }, json(b) { this.h["content-type"] = this.h["content-type"] || "application/json"; this.body = JSON.stringify(b); return this; }, end(b) { if (b) this.body = String(b); return this; }, writeHead(c, h) { this.code = c; Object.assign(this.h, h || {}); } };
  const u = new URL("https://goasksam.com" + url);
  const req = { url, method, query: Object.fromEntries(u.searchParams), body: body || {}, headers: { host: "goasksam.com", "user-agent": "Mozilla/5.0", "x-vercel-id": ID, ...(accept ? { accept } : {}), ...(cookie ? { cookie } : {}) } };
  await Promise.race([m.default(req, res), new Promise((_, r) => setTimeout(() => r(new Error("timed out")), 20000))]);
  return res;
}

// ---- 1. THE LIST: every address that routes to a crew function, read from vercel.json (a new one is found, not remembered)
const { PAGES: CREW_PAGES } = await imp("api/crewPage.js");   // every page api/crewPage.js can serve: the list is read, never remembered, so a page added there is covered below (Nov 4 2026: /preview/home and /preview/find joined it)
const PAGE_KEYS = Object.keys(CREW_PAGES);
const vj = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
const CREW_FUNCS = ["api/crewPage", "api/desk", "api/admin", "api/partnerDemo", "api/partnerAnswer"];
const routed = [...(vj.rewrites || []), ...(vj.redirects || [])].filter(r => CREW_FUNCS.some(f => String(r.destination).startsWith("/" + f)) || ["/preview", "/partner-demo"].includes(r.source));
const sources = [...new Set(routed.map(r => r.source))];
ok(["/desk", "/onebox-preview", "/admin", "/partner-demo", "/preview"].every(s => sources.includes(s)), `vercel.json routes the crew addresses (${sources.join(", ")})`);
for (const k of PAGE_KEYS) ok(routed.some(r => String(r.destination) === "/api/crewPage?page=" + k), `crew page ${k} has a route in vercel.json (a crew-cookie rewrite), so it can be reached and so the rule below covers it`);
// the router hides a page the platform way: a rewrite or redirect that applies only with the crew (or tester) cookie, so without it nothing matches and the platform answers its own 404.
// /preview is the exception: it is also the partner's door (a code, then a partner cookie), so it reaches the function, which answers the ordinary 404 itself.
for (const s of sources.filter(x => x !== "/preview")) {
  const rules = routed.filter(r => r.source === s);
  ok(rules.every(r => (r.has || []).some(h => h.type === "cookie" && /^(gas_crew|gas_tester)$/.test(h.key) || (s === "/desk" && h.key === "gas_seat" && h.value === "s1\\..*"))), `${s}: every rule for it applies only with the crew or tester cookie (or, for /desk, the signed seat cookie s1.), so without it the platform answers its own 404`);
}
{ const red = (vj.redirects || []).find(r => r.source === "/partner-demo"); ok(red && (red.has || []).length > 0, "/partner-demo does not redirect a stranger to /preview (that would name the page)"); }

// ---- 2. THE FUNCTIONS, reached anyway (a direct /api address, a forged cookie, the partner door): the ordinary 404 and nothing else
const FUNCS = [
  ...PAGE_KEYS.map(k => ["api/crewPage.js", "/api/crewPage?page=" + k]), ["api/desk.js", "/api/desk"], ["api/admin.js", "/api/admin?page=1"],
  ["api/partnerDemo.js", "/preview"], ["api/partnerDemo.js", "/preview?view=b"], ["api/partnerDemo.js", "/preview?img=logo"], ["api/partnerDemo.js", "/preview?k=wrong"], ["api/partnerAnswer.js", "/api/partnerAnswer"]
];
for (const [file, url] of FUNCS) {
  for (const [label, o] of [["no cookie, a browser", { accept: "text/html,application/xhtml+xml" }], ["no cookie, a plain Accept", { accept: "*/*" }], ["no cookie, no Accept", {}], ["a forged crew cookie", { cookie: "gas_crew=v1.9999999999999.forged", accept: "text/html" }], ["the old plain cookie", { cookie: "gas_crew=ok", accept: "*/*" }]]) {
    let r; try { r = await call(file, url, o); } catch (e) { ok(false, `${url} (${label}): threw ${e.message}`); continue; }
    const want = NATIVE(/text\/html/.test(o.accept || ""));
    ok(r.code === 404 && r.h["content-type"] === want.ct && r.body === want.body, `${url} (${label}): the ordinary 404 (status ${r.code}, ${r.h["content-type"]}, ${r.body.length} bytes against ${want.body.length})`);
    const extra = Object.keys(r.h).filter(k => !ALLOWED_HEADERS.has(k));
    ok(extra.length === 0 && r.h["x-vercel-error"] === "NOT_FOUND", `${url} (${label}): no header of its own (${extra.join(", ") || "none"}); x-vercel-error ${r.h["x-vercel-error"]}`);
    ok(!/sign.?in|crew|desk|dashboard|partner|preview/i.test(r.body.replace(/NOT_FOUND/g, "")), `${url} (${label}): no sign-in or app text in the body`);
  }
}
// the POST doors of the same functions
for (const [file, url, body] of [["api/admin.js", "/api/admin", { part: "me" }], ["api/partnerAnswer.js", "/api/partnerAnswer", { q: "x" }], ["api/desk.js", "/api/desk", { run: 1 }]]) {
  const r = await call(file, url, { method: "POST", body, accept: "*/*" }).catch(e => ({ code: 0, h: {}, body: e.message }));
  ok(r.code === 404 && r.body === NATIVE(false).body && Object.keys(r.h).every(k => ALLOWED_HEADERS.has(k)), `POST ${url} with no credential: the ordinary 404 (${r.code}, ${r.body.length} bytes)`);
}

// ---- 3. WITH THE COOKIE the page works as today
for (const [file, url] of [...PAGE_KEYS.map(k => ["api/crewPage.js", "/api/crewPage?page=" + k]), ["api/partnerDemo.js", "/preview"], ["api/admin.js", "/api/admin?page=1"]]) {
  const r = await call(file, url, { cookie: crewCookie, accept: "text/html" }).catch(e => ({ code: 0, body: e.message, h: {} }));
  ok(r.code === 200 && r.body.length > 2000 && r.body !== NATIVE(true).body, `${url} with the crew cookie: 200 and the page (${r.code}, ${r.body.length} bytes)`);
}

// ---- 4. NO PUBLIC FILE OR PAGE NAMES A CREW ADDRESS
const NAMES = [...new Set(["/desk", "/onebox-preview", "/partner-demo", "/admin", "/preview", ...sources])];   // every crew address vercel.json routes, so /preview/home and /preview/find are named-checked too
const refs = [];
const publicFiles = execSync("git ls-files public data", { encoding: "utf8" }).split("\n").filter(f => f && /\.(html|txt|xml|json|js|webmanifest|md)$/.test(f));
const retired = new Set((vj.redirects || []).filter(r => /\.html$/.test(r.source) && !(r.has || []).length).map(r => "public" + r.source));   // a public/*.html a redirect answers for is never served as a file
for (const f of publicFiles) {
  if (retired.has(f)) continue;
  const t = fs.readFileSync(f, "utf8").split("\n").filter(l => !/^\s*(\/\/|\/\*|\*|#|<!--)/.test(l)).join("\n");
  for (const n of NAMES) if (new RegExp("(^|[\"'(=\\s>])" + n.replace(/[/-]/g, "\\$&") + "(?![A-Za-z0-9_-])").test(t)) refs.push(`${f} names ${n}`);
}
ok(refs.length === 0, `no public file or data file a visitor or crawler can read names a crew address (${refs.join("; ") || "none"})`);
const robots = fs.readFileSync("public/robots.txt", "utf8");
ok(!NAMES.some(n => robots.includes(n)) && !/Disallow:\s*\/(desk|admin|preview|onebox-preview)/i.test(robots) && !/\/(desk|admin|preview)/i.test(robots), "robots.txt names no crew address (a Disallow line would announce it)");
// the pages and sitemaps a stranger is served, rendered with no cookie
{
  const { PAGES } = await imp("api/sitemapPages.js");
  const map = { "/": "api/home.js", "/sell": "api/sellNext.js", "/find": "api/buy.js", "/tasks": "api/tasksPage.js", "/market-check": "api/marketCheck.js", "/how-sam-decides": "api/howSamDecides.js", "/about": "api/about.js", "/whats-new": "api/whatsNew.js", "/privacy": "api/legal.js", "/terms": "api/legal.js", "/business": "api/business.js" };
  process.env.SELL_NEXT_ON = "1";
  const bad = [];
  for (const p of PAGES) { const f = map[p.loc]; if (!f) continue; const r = await call(f, p.loc === "/privacy" ? "/privacy?page=privacy" : p.loc === "/terms" ? "/terms?page=terms" : p.loc, { accept: "text/html" }).catch(() => null); if (!r) continue;
    const hrefs = [...r.body.matchAll(/(?:href|action|src)=["']([^"'#?]+)/g)].map(m => m[1]);
    for (const n of NAMES) if (hrefs.includes(n)) bad.push(`${p.loc} links ${n}`); }
  ok(bad.length === 0, `no public page links a crew address (${bad.join("; ") || "none of " + PAGES.length + " pages"})`);
  const sm = (await call("api/sitemapPages.js", "/sitemap-pages.xml")).body;
  ok(!NAMES.some(n => new RegExp("goasksam\\.com" + n.replace(/\//g, "\\/") + "(?![A-Za-z0-9_-])").test(sm)), "the pages sitemap lists no crew address");
}
// the response bodies of public copy: What's new
{ const wn = JSON.parse(fs.readFileSync("data/whatsNew.json", "utf8")), text = JSON.stringify(wn); ok(!/\/desk\b|onebox-preview|partner-demo|\/admin\b|\/preview\b|Sam Desk/i.test(text), "What's new names no crew page"); }

// ---- 5. THE CLASS: a crew function answers a stranger only through sendDisguisedNotFound
for (const f of CREW_FUNCS.map(x => x + ".js")) {
  const t = fs.readFileSync(f, "utf8");
  ok(/sendDisguisedNotFound/.test(t), `${f} answers a stranger through sendDisguisedNotFound`);
  const own404 = t.split("\n").filter(l => !/^\s*(\/\/|\*)/.test(l) && /status\(404\)/.test(l) && !/sendDisguisedNotFound/.test(l)).filter(l => !/pageHtml\(\)/.test(l));
  ok(own404.length === 0, `${f} has no 404 of its own (${own404.map(l => l.trim().slice(0, 70)).join(" | ") || "none"})`);
}

// ---- 6. LIVE
if (LIVE) {
  let byp = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";
  if (!byp) { try { byp = execSync("security find-generic-password -s goasksam-bypass -w", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { /* none */ } }
  const get = async (p, accept) => { const r = await fetch("https://goasksam.com" + p, { redirect: "manual", headers: { "user-agent": "Mozilla/5.0", accept, "x-vercel-protection-bypass": byp } }); const hn = [...r.headers.keys()].filter(k => !/^(date|x-vercel-id|content-length|etag|age|x-vercel-cache|set-cookie|content-encoding|vary|accept-ranges)$/.test(k)).sort(); const body = (await r.text()).replace(/sfo1::[a-z0-9-]+|iad1::[a-z0-9-]+|dub1::[a-z0-9-]+/g, "ID"); return { status: r.status, ct: r.headers.get("content-type"), hn: hn.join(","), hash: crypto.createHash("sha256").update(body).digest("hex").slice(0, 16), len: body.length }; };
  ok(!!byp, "live: the automation bypass is available");
  for (const accept of ["text/html", "*/*"]) {
    const ref = await get("/zz-never-" + Math.random().toString(36).slice(2, 8), accept);
    for (const p of [...NAMES, ...PAGE_KEYS.map(k => "/api/crewPage?page=" + k), "/api/desk", "/api/admin?page=1", "/api/partnerDemo", "/api/partnerAnswer"]) {
      const r = await get(p, accept);
      ok(r.status === ref.status && r.ct === ref.ct && r.hn === ref.hn && r.hash === ref.hash, `live ${p} (${accept}): same status, content type, header names and body as an unknown address (${r.status} ${r.len}B ${r.hash} ${r.hn === ref.hn ? "" : "headers differ: " + r.hn} against ${ref.status} ${ref.len}B ${ref.hash})`);
    }
  }
}
// ---- SWEEP (Nov 3 2026): every check that CALLS a crew page's own handler (api/admin.js, desk.js, partnerDemo.js, partnerAnswer.js, crewPage.js by its default export)
// must ask with the crew cookie, or say in a "crew-check: refusal" comment that it asks without one on purpose (it tests the 404). A new check cannot miss it:
// it fails here until it does one or the other. (searchTextCheck and peopleBrowserCheck missed it after the hide and went red in the full prePush.)
{
  const fs2 = await import("node:fs"), path2 = await import("node:path");
  const GATED = /(?:from|import|imp|require)\s*\(?\s*["'`][^"'`]*api\/(?:admin|desk|partnerDemo|partnerAnswer|crewPage)\.js["'`]/, CALLS = /\.default\(|\{\s*default\s*:\s*\w+\s*\}|import\s+\w+\s+from\s+["'][^"']*api\/(?:admin|desk|partnerDemo|partnerAnswer|crewPage)\.js/, ASKS = /gas_crew|mintCrew|CREW_COOKIE|crewCookie|isCrewRequest|gas_partner|x-partner-key|crew-check: refusal/;
  const dir = path2.join(ROOT, "scripts"), missed = [];
  for (const f of fs2.readdirSync(dir)) {
    if (!/\.(mjs|js)$/.test(f) || f === "hiddenCrewCheck.mjs") continue;
    const t = fs2.readFileSync(path2.join(dir, f), "utf8");
    if (GATED.test(t) && CALLS.test(t) && !ASKS.test(t)) missed.push(f);
  }
  ok(missed.length === 0, `every check that calls a crew page's handler sends the crew cookie or says it tests the refusal (${missed.join(", ") || "none missed"})`);
}
console.log(`hiddenCrewCheck${LIVE ? " (live)" : ""}: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
