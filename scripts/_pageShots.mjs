// A PAGE OF THIS TREE IN CHROME, with sign in stubbed (Lane E, Nov 11 2026). Shared by goLiveSignedInCheck and goLiveShots. The pages come from the local site (scripts/_localSite.mjs); the scripts from public/js; the sign in doors (config, code request, code check, account) are stubbed; a signed in session is a stubbed token in localStorage, with a stand-in
// account (Saved searches, Before it ends, the Tasks list). With `proxy` the page's other /api calls go to the live site, read only, so the results are real.
import fs from "node:fs"; import path from "node:path";
export const EMAIL = "stub.user@example.test", SUPA = "https://stub.supabase.test";
const PLACEHOLDER = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#d9d3c4"/></svg>';
export async function openPage(browser, { ROOT, base, w, h = 900, url, session = false, remember = null, proxy = null, FX = null, seen = null, recent = false, restricted = false }) {
  const ctx = await browser.createBrowserContext(), pg = await ctx.newPage(); pg.__ctx = ctx; pg.__errs = []; pg.__calls = [];
  pg.on("pageerror", e => pg.__errs.push(String(e.message).slice(0, 140)));
  await pg.setViewport({ width: w, height: h, isMobile: w < 500, hasTouch: w < 500 }); await pg.setRequestInterception(true);
  const savedItems = [{ id: "s1", title: "Red Porsche 911", state: { url: "/find?q=red+Porsche+911" } }, { id: "s2", title: "1995 BMW M3 under 80k", state: { url: "/find?q=1995+BMW+M3" } }, { id: "s3", title: "Ferrari 308", state: { url: "/find?q=Ferrari+308" } }];
  const alertItems = [{ listing_id: "a1", title: "1987 Porsche 911 Carrera", url: "https://example.test/a1", end_time: new Date(Date.now() + 36 * 3600e3).toISOString(), ended: false }, { listing_id: "a2", title: "2004 Porsche 911 GT3", url: "https://example.test/a2", end_time: new Date(Date.now() + 5 * 3600e3).toISOString(), ended: false }];
  pg.on("request", async r => { try {
    const u = new URL(r.url()), local = r.url().startsWith(base), j = (o, st = 200) => r.respond({ status: st, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(o) });
    if (r.method() === "OPTIONS" && !local) return r.respond({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" }, body: "" });
    if (local && /^\/(js|obx|dsk)(\.[0-9a-z]+)?\/.+\.js$/.test(u.pathname)) { const f = path.join(ROOT, "public/js", u.pathname.replace(/^\/(js|obx|dsk)(\.[0-9a-z]+)?\//, "")); return fs.existsSync(f) ? r.respond({ status: 200, contentType: "text/javascript", body: fs.readFileSync(f) }) : r.respond({ status: 404, body: "" }); }
    if (local && /^\/img\//.test(u.pathname)) { const f = path.join(ROOT, "public", u.pathname); return fs.existsSync(f) ? r.respond({ status: 200, contentType: /\.png$/.test(f) ? "image/png" : "image/jpeg", body: fs.readFileSync(f) }) : r.respond({ status: 404, body: "" }); }
    if (u.pathname === "/api/publicConfig") return j({ supabaseUrl: SUPA, anonKey: "anon", turnstile: null }); if (u.pathname === "/api/signup") return j({ ok: true });
    if (r.url().startsWith(SUPA + "/auth/v1/otp")) return j({}); if (r.url().startsWith(SUPA + "/auth/v1/verify")) return j({ access_token: "tok", refresh_token: "ref", expires_in: 3600, user: { email: EMAIL } });
    if (r.url().startsWith(SUPA + "/auth/v1/authorize")) { if (seen) seen.authorize = r.url(); return r.respond({ status: 200, contentType: "text/html", body: "<p>stub</p>" }); } if (r.url().startsWith(SUPA)) return j({});
    if (local && u.pathname === "/api/account") return j({ email: EMAIL, tier: "free", marketingConsent: false }); if (u.pathname === "/api/deskSeat") return r.respond({ status: 404, body: "" });
    if (local && u.pathname === "/api/track") return u.searchParams.get("js") ? r.respond({ status: 200, contentType: "text/javascript", body: "window.gasTrack=window.gasTrack||function(){};" }) : j(restricted ? { consent: "declined", region_class: "restricted" } : { consent: "not_required", region_class: "open" });
    if (local && u.pathname === "/api/buySearch" && r.method() === "POST") { let a = {}; try { a = JSON.parse(r.postData() || "{}"); } catch {} pg.__calls.push(a.action || "");
      if (session && a.action === "alerts") return j({ items: alertItems }); if (session && a.action === "list") return j({ items: savedItems });
      if (a.action === "alerts_ready" || a.action === "ready") return j({ ok: true }); if (!(proxy && !["alerts", "list"].includes(a.action))) return j({ items: [] }); }
    if (local && u.pathname === "/api/watch") return j({ watches: [] });
    if (local && u.pathname === "/api/tasks" && r.method() === "POST") { let a = {}; try { a = JSON.parse(r.postData() || "{}"); } catch {} if (FX && a.action === "list") return j(FX.tasksFixture(10)); return j({ ok: true }); }
    if (local && proxy && /^\/api\//.test(u.pathname)) { const rr = await proxy.fetch(proxy.base + u.pathname + u.search, { method: r.method(), headers: { "content-type": r.headers()["content-type"] || "application/json", ...(proxy.bypass ? { "x-vercel-protection-bypass": proxy.bypass } : {}) }, body: ["GET", "HEAD"].includes(r.method()) ? undefined : r.postData() }); return r.respond({ status: rr.status, contentType: rr.headers.get("content-type") || "application/json", body: Buffer.from(await rr.arrayBuffer()) }); }
    if (local && /^\/api\//.test(u.pathname)) return j({}); if (local) return r.continue();
    if (r.resourceType() === "image") return proxy ? r.continue() : r.respond({ status: 200, contentType: "image/svg+xml", body: PLACEHOLDER });
    if (r.resourceType() === "font" || r.resourceType() === "stylesheet") return r.continue(); return r.respond({ status: 200, contentType: "text/plain", body: "" });
  } catch (e) { try { r.respond({ status: 500, body: String(e.message) }); } catch {} } });
  if (session || remember) await pg.evaluateOnNewDocument((s, rem, email) => { try { if (s) localStorage.setItem("gas_auth_session", JSON.stringify({ access_token: "tok", refresh_token: "ref", expires_at: Math.floor(Date.now() / 1000) + 3600, email })); if (rem) localStorage.setItem("gas_signin_return", JSON.stringify({ path: rem, typed: "", at: Date.now() })); } catch (e) {} }, session, remember, EMAIL);
  if (recent) await pg.evaluateOnNewDocument((s, email) => { try { const l = [{ url: "/find?q=red+Porsche", label: "red Porsche", p: "find" }, { url: "/market-check?q=1995+BMW+M3", label: "1995 BMW M3", p: "market-check" }, { url: "/find?q=Ferrari+308", label: "Ferrari 308", p: "find" }]; sessionStorage.setItem(s ? "gas_recent_u:" + email.toLowerCase() : "gas_recent_s", JSON.stringify(l)); } catch (e) {} }, session, EMAIL);
  await pg.goto(base + url, { waitUntil: "load", timeout: 45000 }).catch(() => {}); return pg;
}
export const closePage = async pg => { try { await pg.__ctx.close(); } catch {} };
