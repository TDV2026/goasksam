// THE CREW CODE BOX (Sam, Oct 25 2026), offline: /api/crew shows a box that POSTS the code as a form body. A right code sets the signed gas_crew cookie and
// 302s to /find (or a same-origin `to`); a wrong code gets the 403 page and sets nothing; attempts are limited; the code value never appears in any response
// body, header or redirect, nor in the page the box is served on. The old ?code= link still works. The holding page points to the box. No network.
//   node scripts/crewBoxCheck.mjs
import fs from "node:fs";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const CODE = "CrewBoxCheck" + "Z9x8w7v6u5t4s3r2q1p0";   // a throwaway test value, never a real code
process.env.CURTAIN_CREW_CODE = CODE; process.env.CURTAIN_SEALED = "1";
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY; delete process.env.SUPABASE_ANON_KEY;
const handler = (await import("../api/crew.js")).default, crew = await import("../lib/_crew.js"), hold = await import("../lib/_hold.js"), ceil = await import("../lib/_ceilings.js");
const mk = (method, query, body, headers = {}) => { const res = { code: 0, headers: {}, body: "" }; res.setHeader = (k, v) => { res.headers[k] = v; }; res.status = c => { res.code = c; return res; }; res.send = b => { res.body = String(b); return res; }; res.end = () => res;
  return { req: { method, query: query || {}, body, headers: { host: "goasksam.com", ...headers } }, res }; };
const everything = r => r.body + JSON.stringify(r.headers);
const go = async (...a) => { const { req, res } = mk(...a); await handler(req, res); return res; };
// the box
let r = await go("GET", {});
ok(r.code === 200 && /<form method="post" action="\/api\/crew"/.test(r.body), "the box: a form that posts to /api/crew");
ok(/type="password"/.test(r.body) && /name="code"/.test(r.body) && !/name="code"[^>]*value=/.test(r.body), "a password field named code, never pre-filled");
ok(/noindex/.test(r.body) && /no-store/.test(r.headers["Cache-Control"] || ""), "noindex and no-store");
ok(/prefers-color-scheme: dark/.test(r.body) && /name="viewport"/.test(r.body) && /Instrument Sans/.test(r.body), "the holding page's look: light and dark, phone width, fonts");
ok(!r.body.includes(CODE), "the box page does not hold the code");
// a right code in the body
r = await go("POST", {}, "code=" + encodeURIComponent(CODE));
ok(r.code === 302 && r.headers.Location === "/find", "POST right code (string body): 302 to /find");
const sc = String(r.headers["Set-Cookie"] || ""), val = (/gas_crew=([^;]+)/.exec(sc) || [])[1];
ok(val && crew.isCrewRequest({ headers: { cookie: "gas_crew=" + val }, query: {} }) && /Secure/.test(sc) && /SameSite=Lax/.test(sc), "the cookie is the signed gas_crew and passes isCrewRequest");
ok(!everything(r).includes(CODE) && !String(r.headers.Location).includes("code"), "the redirect and headers do not carry the code");
r = await go("POST", {}, { code: CODE, to: "/tasks" }); ok(r.code === 302 && r.headers.Location === "/tasks", "POST right code (parsed body) with a same-origin to");
for (const bad of ["//evil.example", "/\\evil.example", "https://evil.example", "evil"]) { r = await go("POST", {}, { code: CODE, to: bad }); ok(r.code === 302 && r.headers.Location === "/find", "to " + JSON.stringify(bad) + " is ignored"); }
r = await go("POST", {}, Buffer.from("code=" + CODE)); ok(r.code === 302, "POST right code (buffer body)");
// wrong codes
for (const [lab, body] of [["wrong", { code: "not-the-code-at-all-0000" }], ["empty body", {}], ["same length", { code: "X".repeat(CODE.length) }], ["prefix", { code: CODE.slice(0, -1) }]]) {
  r = await go("POST", {}, body);
  if (lab === "empty body") ok(r.code === 200 && !r.headers["Set-Cookie"], "no code at all: the box, no cookie");
  else ok(r.code === 403 && !r.headers["Set-Cookie"] && /did not work/.test(r.body) && /<form method="post"/.test(r.body), lab + ": 403 page, no cookie, the box again");
  ok(!everything(r).includes(CODE) && !everything(r).includes(String(body.code || "\u0000")), lab + ": neither the real nor the typed code is in the answer");
}
// the old link still works, and a wrong one is the same 403
r = await go("GET", { code: CODE }); ok(r.code === 302 && r.headers.Location === "/find" && /gas_crew=/.test(String(r.headers["Set-Cookie"])), "the old ?code= link still sets the cookie and goes to /find");
r = await go("GET", { code: CODE, to: "/sell" }); ok(r.headers.Location === "/sell", "the old link keeps its to");
r = await go("GET", { code: "wrong-code" }); ok(r.code === 403 && !r.headers["Set-Cookie"] && !everything(r).includes("wrong-code"), "the old link, wrong code: 403, nothing echoed");
// the limit: five tries a minute from one address, same 403 even for the right code; a crew device is exempt
ok(ceil.CEILINGS.crew_code && ceil.CEILINGS.crew_code.address[0][1] === 5 && ceil.CEILINGS.crew_code.device[0][1] === 5, "crew_code ceiling: 5 a minute per device and per address");
{
  process.env.SUPABASE_URL = "https://stub.invalid"; process.env.SUPABASE_SERVICE_ROLE_KEY = "stub-key";
  const realFetch = globalThis.fetch; let heads = 0;
  globalThis.fetch = async (u, o = {}) => { if (o.method === "HEAD") { heads++; return { ok: true, status: 206, headers: { get: () => "0-0/9" } }; } return { ok: true, status: 201, headers: { get: () => null } }; };
  r = await go("POST", {}, { code: CODE }, { "x-forwarded-for": "203.0.113.9" });
  ok(r.code === 403 && !r.headers["Set-Cookie"] && heads > 0, "over the limit the right code gets the 403 page and no cookie");
  r = await go("POST", {}, { code: CODE }, { "x-forwarded-for": "203.0.113.9", cookie: "gas_crew=" + crew.mintCrewCookieValue() }); ok(r.code === 302, "a crew device is not limited");
  globalThis.fetch = async () => { throw new Error("ledger down"); };
  r = await go("POST", {}, { code: CODE }, { "x-forwarded-for": "203.0.113.10" }); ok(r.code === 302, "an unreadable ledger fails open");
  globalThis.fetch = realFetch; delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
}
// no secret configured: nothing ever opens
{ const keep = process.env.CURTAIN_CREW_CODE; process.env.CURTAIN_CREW_CODE = ""; r = await go("POST", {}, { code: "" }); r = await go("POST", {}, { code: "x" }); ok(r.code === 403 && !r.headers["Set-Cookie"], "no crew secret on the server: a code opens nothing"); process.env.CURTAIN_CREW_CODE = keep; }
// the source never logs a request address or body, and the page and the docs point to the box
const src = fs.readFileSync(new URL("../api/crew.js", import.meta.url), "utf8");
ok(!/console\.(log|error|warn|info)/.test(src), "api/crew.js writes no log line");
ok(/href="\/api\/crew"/.test(hold.holdingHtml()), "the holding page points to the box");
const rb = fs.readFileSync(new URL("../docs/launch-runbook.md", import.meta.url), "utf8");
ok(!/api\/crew\?code=/.test(rb), "the runbook never names the ?code= link");
console.log(`crewBoxCheck: ${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0);
