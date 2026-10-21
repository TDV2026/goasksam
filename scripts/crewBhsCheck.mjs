// The ?bhs= newsletter-link sign-in is gone (Oct 21 2026, Lane D, Sam's decision, docs/lane-security.md): /api/crew no
// longer mints a session for a Beehiiv subscription id. Offline: every outside call (Beehiiv, Supabase) is stubbed and
// counted, and the real handler runs. Proves: a ?bhs= request (a made-up id, alone or with other parameters) mints no
// session, makes no outside call, sets no cookie and never redirects with tokens; the crew code and the tester code
// paths are unchanged (a right code sets its cookie and redirects, a wrong one sets nothing).
//   node scripts/crewBhsCheck.mjs
// Run by scripts/prePush.mjs.
process.env.CURTAIN_CREW_CODE = "crew-code-for-this-check-0123456789";
process.env.SUPABASE_URL = "https://db.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.SUPABASE_ANON_KEY = "a";
process.env.BEEHIIV_API_KEY = "b"; process.env.BEEHIIV_PUBLICATION_ID = "pub_x";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
let calls = [];
globalThis.fetch = async (url) => { calls.push(String(url)); return new Response(JSON.stringify({ data: { status: "active", email: "reader@example.com" }, access_token: "t", properties: { hashed_token: "h" } }), { status: 200, headers: { "content-type": "application/json" } }); };
const { default: crew } = await import("../api/crew.js");
const call = async query => {
  calls = [];
  const res = { code: 0, h: {}, body: "", setHeader(k, v) { this.h[k.toLowerCase()] = v; }, getHeader(k) { return this.h[k.toLowerCase()]; }, status(c) { this.code = c; return this; }, end() { return this; }, send(b) { this.body = String(b); return this; }, json(b) { this.body = JSON.stringify(b); return this; } };
  await crew({ method: "GET", query, headers: { host: "goasksam.com" } }, res);
  return res;
};
for (const q of [{ bhs: "sub_00000000-0000-4000-8000-000000000000" }, { bhs: "00000000-0000-4000-8000-000000000000" }, { bhs: "sub_madeup", to: "/sell" }]) {
  const r = await call(q);
  const loc = String(r.h.location || "");
  ok(!r.h["set-cookie"], `?bhs= sets no cookie (${JSON.stringify(q)})`);
  ok(calls.length === 0, `?bhs= makes no outside call, so no session is minted (${calls.join(", ")})`);
  ok(!/access_token|refresh_token|via=beehiiv|bhs_error/.test(loc + r.body), `?bhs= never redirects with tokens (${loc || r.code})`);
  ok(r.code === 403 && /That crew link did not work/.test(r.body), `?bhs= falls through to the crew page and changes nothing (${r.code})`);
}
let r = await call({ code: process.env.CURTAIN_CREW_CODE });
ok(r.code === 302 && /^gas_crew=v1\./.test(String(r.h["set-cookie"] || "")) && r.h.location === "/buy", `the crew code still sets the signed crew cookie and lands on /buy (${r.code} ${r.h.location})`);
r = await call({ code: process.env.CURTAIN_CREW_CODE, bhs: "sub_madeup" });
ok(r.code === 302 && /^gas_crew=v1\./.test(String(r.h["set-cookie"] || "")) && calls.length === 0, "the crew code with a stray ?bhs= still works, and bhs is ignored");
r = await call({ code: "wrong-code" });
ok(r.code === 403 && !r.h["set-cookie"], "a wrong crew code sets nothing");
r = await call({ tcode: "not-the-tester-code" });
ok(r.code === 302 && r.h.location === "/" && !r.h["set-cookie"], "a wrong tester code sets nothing and goes to /");
const src = (await import("node:fs")).readFileSync("api/crew.js", "utf8"), lib = (await import("node:fs")).readFileSync("lib/_beehiiv.js", "utf8");
ok(!/q\.bhs|beehiivBySubscriberId|mintSessionForEmail|generate_link/.test(src), "api/crew.js no longer reads bhs or mints a session for an email");
ok(!/export async function beehiivBySubscriberId/.test(lib) && /export async function beehiivTier/.test(lib), "lib/_beehiiv.js drops the subscription-id lookup and keeps beehiivTier");
console.log(`crewBhsCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
