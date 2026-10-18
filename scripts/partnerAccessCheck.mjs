// THE PARTNER DEMO ACCESS CODE (Lane C, Oct 16 2026; lib/_partnerAccess.js). No network: the real handlers run with
// made-up codes generated here (never a real value; nothing printed). Exits 1 on any failure.
import crypto from "node:crypto";
import fs from "node:fs";
const rnd = () => crypto.randomBytes(24).toString("base64url");
process.env.PARTNER_DEMO_CODE = rnd(); process.env.CURTAIN_CREW_CODE = rnd();
for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY"]) delete process.env[k];   // no ledger: the limit is proved by its table entry below
const { default: demo } = await import("../api/partnerDemo.js");
const { partnerAllowed } = await import("../api/partnerAnswer.js");
const A = await import("../lib/_partnerAccess.js");
const { mintCrewCookieValue, isCrewRequest } = await import("../lib/_crew.js");
const { CEILINGS } = await import("../lib/_ceilings.js").catch(() => ({}));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL  " + m); } };
async function call(query, cookie) {
  const h = {}; let status = 200, body = "";
  const res = { setHeader(k, v) { h[k.toLowerCase()] = v; }, status(c) { status = c; return this; }, send(b) { body = String(b); return this; }, end() { return this; } };
  await demo({ method: "GET", url: "/preview", query, headers: { host: "goasksam.com", cookie: cookie || "" } }, res);
  return { status, h, body };
}
const C = () => process.env.PARTNER_DEMO_CODE;
const cookieFrom = r => { const sc = [].concat(r.h["set-cookie"] || []); const m = /gas_partner=([^;]+)/.exec(sc[0] || ""); return m ? "gas_partner=" + m[1] : ""; };
const visitor = await call({}, "");
ok(visitor.status === 404 && visitor.body === "Not found", "no cookie, no code: the plain 404");
// 1. the right code
for (const p of ["k", "code"]) {
  const r = await call({ [p]: C() });
  const sc = [].concat(r.h["set-cookie"] || []);
  ok(r.status === 302 && r.h.location === "/preview", `?${p}= right code: 302 to /preview with no query string`);
  ok(sc.length === 2 && sc.some(s => /; Path=\/preview;/.test(s)) && sc.some(s => /; Path=\/api\/partnerAnswer;/.test(s)), `?${p}=: gas_partner set for exactly the demo path and the data endpoint`);
  ok(sc.every(s => /HttpOnly/.test(s) && /Secure/.test(s) && /SameSite=Lax/.test(s) && /Max-Age=1209600/.test(s) && !/Domain=/.test(s)), `?${p}=: HttpOnly, Secure, SameSite=Lax, 14 days, host-only`);
  ok(!sc.join(" ").includes(C()) && !String(r.h.location).includes(C()), `?${p}=: the code is in no header`);
}
const good = cookieFrom(await call({ k: C() }));
// 2. what the cookie opens
const page = await call({}, good);
ok(page.status === 200 && /What these sell for/.test(page.body), "gas_partner opens /preview");
ok((await call({ img: "hero" }, good)).status === 200, "gas_partner opens the demo's hero image (served under /prever-demo)");
ok(partnerAllowed({ headers: { cookie: good } }) === true, "gas_partner opens the partner data endpoint (api/partnerAnswer.js)");
ok(isCrewRequest({ headers: { cookie: good } }) === false, "gas_partner is never crew: every crew-gated page (Market Check, Business, Buy, Sell, Tasks, Desk, One Box, the VIN and spec crew views) still refuses it");
const readers = fs.readdirSync(new URL("../api/", import.meta.url)).filter(f => f.endsWith(".js") && /_partnerAccess|gas_partner|isPartnerRequest/.test(fs.readFileSync(new URL("../api/" + f, import.meta.url), "utf8")));
ok(readers.sort().join() === "partnerAnswer.js,partnerDemo.js", `only the demo and its data endpoint read gas_partner (api files that do: ${readers.join(", ")})`);
// 3. refused codes, all the same 404
for (const [what, q] of [["a wrong code", { k: rnd() }], ["an empty code", { k: "" }], ["an empty ?code=", { code: "" }], ["the code with one character changed", { k: C().slice(0, -1) + (C().endsWith("A") ? "B" : "A") }]]) {
  const r = await call(q);
  ok(r.status === 404 && r.body === visitor.body && !r.h["set-cookie"] && !r.h.location, `${what}: the same plain 404 as a visitor, no cookie, no redirect`);
}
ok(CEILINGS && CEILINGS.partner_code && CEILINGS.partner_code.address && CEILINGS.partner_code.address[0][1] <= 5, "code attempts are rate limited per address (lib/_ceilings.js partner_code)");
// 4. headers on every answer
for (const [what, r] of [["404", visitor], ["200", page], ["302", await call({ k: C() })]]) ok(r.h["x-robots-tag"] === "noindex, nofollow" && r.h["referrer-policy"] === "no-referrer" && r.h["cache-control"] === "private, no-store", `${what}: noindex, no-referrer, private no-store`);
// 5. the crew cookie still opens it
const crew = "gas_crew=" + mintCrewCookieValue();
ok((await call({}, crew)).status === 200 && partnerAllowed({ headers: { cookie: crew } }), "the crew cookie still opens the demo and the data endpoint");
ok((await call({ k: rnd() }, crew)).status === 302, "crew with a stray ?k= is sent to the clean address, never a 404");
// 6. rotation
process.env.CURTAIN_CREW_CODE = rnd();
ok((await call({}, good)).status === 200, "rotating CURTAIN_CREW_CODE leaves gas_partner working");
ok((await call({}, crew)).status === 404, "rotating CURTAIN_CREW_CODE ends the old crew cookie (as designed)");
process.env.PARTNER_DEMO_CODE = rnd();
ok((await call({}, good)).status === 404 && partnerAllowed({ headers: { cookie: good } }) === false, "changing PARTNER_DEMO_CODE ends every old gas_partner cookie (page and data endpoint)");
// 7. expiry, forgery, no variable
const past = A.mintPartnerCookieValue(Date.now() - 15 * 24 * 3600e3);
ok(A.isPartnerCookieValue(past) === false, "a gas_partner older than 14 days is refused");
ok(A.isPartnerCookieValue("p1." + (Date.now() + 1e9) + "." + "A".repeat(43)) === false, "a made-up gas_partner is refused");
const fresh = cookieFrom(await call({ k: C() }));
delete process.env.PARTNER_DEMO_CODE;
ok((await call({ k: "" })).status === 404 && (await call({ k: rnd() })).status === 404 && (await call({}, fresh)).status === 404, "no PARTNER_DEMO_CODE set: no code opens anything, no cookie works, the same 404");
// THE ADDRESS (Sam, Oct 18 2026, for the eBay showing): /preview serves the page, the old /partner-demo redirects to it
// (its query kept, so a saved link still enters), and the cookie is set for /preview and the data path only.
{ const vj = JSON.parse(fs.readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  ok((vj.rewrites || []).some(r => r.source === "/preview" && r.destination === "/api/partnerDemo") && !(vj.rewrites || []).some(r => r.source === "/partner-demo"), "vercel.json: /preview serves the page; /partner-demo is not served directly");
  ok((vj.redirects || []).some(r => r.source === "/partner-demo" && r.destination === "/preview" && r.permanent === false && !/\?/.test(r.destination)), "vercel.json: /partner-demo redirects to /preview, keeping the query");
  const { PARTNER_PATHS } = await import("../lib/_partnerAccess.js");
  ok(PARTNER_PATHS.join() === "/preview,/api/partnerAnswer", "the access cookie's paths are /preview and the data path only"); }
console.log(`partnerAccessCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
