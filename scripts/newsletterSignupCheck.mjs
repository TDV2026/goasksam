// THE SIGN-IN CARD'S DAILY VROOM BOX (Sam, Oct 26 2026), offline with Beehiiv faked: ticking the box calls Beehiiv's create subscription ONCE after sign-in, in the
// background; unticked (or no answer) never calls it; a Beehiiv failure, refusal or timeout never blocks sign-in and logs only an outcome word, never an address; the switch
// (app_config signin_newsletter_enabled) stops it; the daily ceiling limits it; the call carries utm_source goasksam and utm_medium signin and never re-adds someone who left;
// the box is on the form step, unticked by default, with the new wording; /api/account does not wait for the call. No network, no real address.
//   node scripts/newsletterSignupCheck.mjs
import fs from "node:fs";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
process.env.BEEHIIV_API_KEY = "test-key-not-real"; process.env.BEEHIIV_PUBLICATION_ID = "pub_test";
const mod = await import("../lib/newsletterSignup.js"), ceil = await import("../lib/_ceilings.js");
const env = { supabaseUrl: "https://stub.invalid", supabaseKey: "stub" };
const req = { headers: { host: "goasksam.com", "x-forwarded-for": "198.51.100.7" }, query: {} };
let calls = [], logs = [], switchRow = [], ledger = 0, mode = "ok";
const realFetch = globalThis.fetch, realLog = console.log;
console.log = (...a) => { logs.push(a.join(" ")); };
globalThis.fetch = async (u, o = {}) => {
  u = String(u);
  if (u.startsWith("https://api.beehiiv.com/")) {
    calls.push({ url: u, method: o.method, body: o.body ? JSON.parse(o.body) : null, auth: (o.headers || {}).Authorization });
    if (mode === "hang") return await new Promise((_, rej) => o.signal.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))));
    if (mode === "throw") throw new Error("network down");
    const code = mode === "500" ? 500 : mode === "403" ? 403 : mode === "429" ? 429 : mode === "400" ? 400 : 201;
    return { ok: code < 300, status: code, json: async () => ({}) };
  }
  if (u.includes("/rest/v1/app_config")) return { ok: true, status: 200, json: async () => switchRow };
  if (o.method === "HEAD") return { ok: true, status: 206, headers: { get: () => "0-0/" + ledger } };
  return { ok: true, status: 201, headers: { get: () => null }, json: async () => ({}) };
};
const reset = () => { calls = []; logs = []; mode = "ok"; switchRow = []; ledger = 0; mod.resetNewsletterSwitchCache(); };
// ticked: one call, right shape
reset(); let p = mod.maybeSubscribeAfterSignin(req, env, "Pat+Test@Example.com", true); let out = await p.promise;
ok(out === "subscribed" && calls.length === 1, "ticked: one create-subscription call after sign-in (" + out + ", " + calls.length + ")");
const c = calls[0] || {};
ok(c.method === "POST" && /\/v2\/publications\/pub_test\/subscriptions$/.test(c.url) && c.auth === "Bearer test-key-not-real", "ticked: a POST to the publication's subscriptions with the environment key");
ok(c.body && c.body.email === "pat+test@example.com" && c.body.utm_source === "goasksam" && c.body.utm_medium === "signin" && c.body.reactivate_existing === false, "ticked: the email, utm_source goasksam, utm_medium signin, and reactivate_existing false (no duplicate, no re-adding someone who left)");
ok(!("send_welcome_email" in c.body) && !("double_opt_override" in c.body), "ticked: the publication's own confirmation settings decide (neither is overridden)");
ok(logs.length === 1 && /^newsletter signup outcome=[a-z_]+$/.test(logs[0]) && !logs.join(" ").includes("example.com") && !logs.join(" ").includes("test-key"), "the only log line is an outcome word: no address, no key");
// unticked or silent: never
for (const v of [false, undefined, null, "true", 1]) { reset(); const r = mod.maybeSubscribeAfterSignin(req, env, "a@example.com", v); await new Promise(r2 => setTimeout(r2, 20)); ok(r === null && calls.length === 0, "consent " + JSON.stringify(v) + ": Beehiiv is never called"); }
// failures never block, never throw, return fast
for (const m of ["500", "403", "429", "400", "throw"]) { reset(); mode = m; const t0 = Date.now(); const r = await mod.maybeSubscribeAfterSignin(req, env, "a@example.com", true).promise; ok(typeof r === "string" && /^(beehiiv_error|denied|busy|refused|failed)$/.test(r) && Date.now() - t0 < 500, "a " + m + " answer: an outcome word (" + r + "), no throw, no wait"); }
reset(); mode = "hang"; { const t0 = Date.now(); const r = await mod.maybeSubscribeAfterSignin(req, env, "a@example.com", true).promise; ok(r === "timeout" && Date.now() - t0 < 4500, "a hung Beehiiv ends at the short timeout (" + r + ", " + (Date.now() - t0) + " ms)"); }
// the switch
for (const v of ["off", false, 0, "false", "0"]) { reset(); switchRow = [{ value: v }]; const r = await mod.maybeSubscribeAfterSignin(req, env, "a@example.com", true).promise; ok(r === "switch_off" && calls.length === 0, "switch " + JSON.stringify(v) + ": nothing is sent"); }
reset(); switchRow = [{ value: "on" }]; ok(await mod.maybeSubscribeAfterSignin(req, env, "a@example.com", true).promise === "subscribed", "switch on (or no row): it runs");
// the ceiling
ok(JSON.stringify(ceil.CEILINGS.newsletter_signup) === JSON.stringify({ device: [[86400e3, 5]], address: [[86400e3, 20]] }), "newsletter_signup ceiling: 5 a day per device, 20 per address");
reset(); ledger = 99; { const r = await mod.maybeSubscribeAfterSignin(req, env, "a@example.com", true).promise; ok(r === "limited" && calls.length === 0, "over the ceiling: no Beehiiv call"); }
// not configured
reset(); { const k = process.env.BEEHIIV_API_KEY; delete process.env.BEEHIIV_API_KEY; const r = await mod.maybeSubscribeAfterSignin(req, env, "a@example.com", true).promise; ok(r === "not_configured" && calls.length === 0, "no key in the environment: nothing is sent"); process.env.BEEHIIV_API_KEY = k; }
// SURVIVING THE FUNCTION ENDING: a started call must be registered with the platform's keep-alive (waitUntil) or awaited inside the request; never just started and dropped
{ reset(); const kept = []; globalThis[Symbol.for("@vercel/request-context")] = { get: () => ({ waitUntil: p => kept.push(p) }) };
  const sub = mod.maybeSubscribeAfterSignin(req, env, "a@example.com", true);
  ok(sub && sub.registered === true && kept.length === 1 && kept[0] === sub.promise, "with the platform's keep-alive present, the call is registered with waitUntil (the very promise)");
  ok(await mod.waitBounded(sub) === null, "a registered call is not awaited in the request (the sign-in never waits for it)"); await sub.promise;
  delete globalThis[Symbol.for("@vercel/request-context")];
  reset(); const sub2 = mod.maybeSubscribeAfterSignin(req, env, "a@example.com", true);
  ok(sub2 && sub2.registered === false, "with no keep-alive available, the call reports it is NOT registered");
  const w = await mod.waitBounded(sub2); ok(w === "subscribed" && calls.length === 1, "so the request awaits it, and it completes inside the request (" + w + ")");
  reset(); mode = "hang"; const t0 = Date.now(); const sub3 = mod.maybeSubscribeAfterSignin(req, env, "a@example.com", true); const w3 = await mod.waitBounded(sub3); ok(Date.now() - t0 < 4500 && /^(timeout)$/.test(w3), "and a hung Beehiiv holds the sign-in no longer than the short timeout (" + (Date.now() - t0) + " ms)"); }
console.log = realLog; globalThis.fetch = realFetch;
// the wiring and the card
const acc = fs.readFileSync("api/account.js", "utf8");
ok(/await waitBounded\(maybeSubscribeAfterSignin\(req, env, auth\.email, consent\)\);/.test(acc), "/api/account starts the call AND hands it to waitBounded: registered with the keep-alive, or awaited inside the request, never just started");
ok(!/^\s*maybeSubscribeAfterSignin\(/m.test(acc), "the call is never a bare fire-and-forget statement");
ok(acc.indexOf("validateBearer(req.headers.authorization)") < acc.indexOf("maybeSubscribeAfterSignin(req"), "the call comes after validateBearer");
const src = fs.readFileSync("lib/newsletterSignup.js", "utf8");
ok(!/BEEHIIV_API_KEY\s*=\s*["']|pub_[A-Za-z0-9]{6,}|Bearer [A-Za-z0-9]{10,}/.test(src) && !/console\.(log|error)\([^)]*email/.test(src), "no key, publication id or address in the code or its logs");
const au = fs.readFileSync("public/js/auth.js", "utf8");
ok(/<input id="auth-consent" type="checkbox" \/> <span>Sign me up to The Daily Vroom<\/span>/.test(au) && !/<input id="auth-consent"[^>]*checked/.test(au), "the form step: the box says Sign me up to The Daily Vroom and is unticked by default");
ok(/No passwords\. We email you a one-time code\. You get The Daily Vroom only if you tick the box\./.test(au) && !/Marketing notes only if you tick|Send me Sam's market notes/.test(au), "the small line is the new one; the old label and line are gone");
ok((au.match(/id="auth-consent"/g) || []).length === 1, "the box appears once (the code step has none)");
console.log(`newsletterSignupCheck: ${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0);
