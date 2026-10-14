// Tester access (Oct 2026, Lane C): no code written into lib/_tester.js, the code and a mandatory expiry from the
// environment only, a signed cookie, and the plain "ok" cookie never accepted. Fixture values only; no network.
//   node scripts/testerCheck.mjs      Run by scripts/prePush.mjs.
import fs from "node:fs";
let fails = 0, passes = 0;
const ok = (c, what) => { if (c) passes++; else { fails++; console.log("FAIL  " + what); } };
const src = fs.readFileSync(new URL("../lib/_tester.js", import.meta.url), "utf8");
ok(!/process\.env\.CURTAIN_TESTER_CODE\s*\|\|\s*(?!"")\S/.test(src) && !/process\.env\.TESTER_CODE_EXPIRES\s*\|\|\s*(?!"")\S/.test(src) && !/["'`][a-z]+-tester-[a-z0-9]{4,}/i.test(src) && !/export const TESTER_CODE\b/.test(src), "no written-in code or date fallback");
const NOW = Date.parse("2026-10-14T12:00:00Z"), LATER = "2026-11-01T00:00:00Z";
const T = await import("../lib/_tester.js");
const set = (code, exp) => { if (code == null) delete process.env.CURTAIN_TESTER_CODE; else process.env.CURTAIN_TESTER_CODE = code; if (exp == null) delete process.env.TESTER_CODE_EXPIRES; else process.env.TESTER_CODE_EXPIRES = exp; };
const CODE = "fixture-tester-code-0123456789";
set(null, null);
ok(T.testerCodeExpired(NOW) && T.mintTesterCookieValue(NOW) === null && !T.testerCodeMatches("", NOW), "nothing set: tester access off");
set(CODE, null);
ok(T.testerCodeExpired(NOW) && T.mintTesterCookieValue(NOW) === null && !T.testerCodeMatches(CODE, NOW), "a code with no expiry: off (the date is mandatory)");
set("short-code", LATER);
ok(T.testerCodeExpired(NOW) && !T.testerCodeMatches("short-code", NOW), "a code under 16 characters: off");
set(CODE, "2026-10-01T00:00:00Z");
ok(T.testerCodeExpired(NOW) && !T.testerCodeMatches(CODE, NOW), "a past date: off");
set(CODE, LATER);
ok(!T.testerCodeExpired(NOW) && T.testerCodeMatches(CODE, NOW) && !T.testerCodeMatches(CODE + "x", NOW), "code and future date: on, the code must match exactly");
const v = T.mintTesterCookieValue(NOW);
ok(/^t1\.\d{13}\.[A-Za-z0-9_-]{43}$/.test(v) && T.isTesterCookieValue(v, NOW), "a signed cookie verifies");
ok(T.isTesterRequest(`a=1; gas_tester=${v}; b=2`, NOW) && T.isTesterRequest({ headers: { cookie: `gas_tester=${v}` } }, NOW), "isTesterRequest reads the cookie");
ok(!T.isTesterRequest("gas_tester=ok", NOW), "the old plain ok cookie is not a tester");
ok(!T.isTesterCookieValue(v.slice(0, -1) + (v.endsWith("A") ? "B" : "A"), NOW), "a changed signature fails");
ok(!T.isTesterCookieValue(v, Date.parse("2026-11-02T00:00:00Z")), "past the date the cookie stops");
set(CODE + "-rotated", LATER);
ok(!T.isTesterCookieValue(v, NOW), "a new code ends every old cookie");
set(CODE, LATER);
ok(/^gas_tester=t1\./.test(T.testerSetCookie(NOW)) && /Max-Age=\d+/.test(T.testerSetCookie(NOW)), "the Set-Cookie line");
// Every server reader uses the signed check, never the plain value; none prints or imports a code.
const read = f => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");
for (const f of ["api/crew.js", "api/desk.js"]) ok(!/gas_tester=ok|gas_tester === "ok"|\bTESTER_CODE\b/.test(read(f).replace(/\/\/.*$/gm, "")), `${f}: no plain cookie, no code`);
ok(/testerCodeMatches\(tcode\)/.test(read("api/crew.js")) && /testerSetCookie\(\)/.test(read("api/crew.js")), "crew.js: the code is checked and the cookie minted by lib/_tester.js");
ok(/isTesterRequest\(req\)/.test(read("api/desk.js")), "desk.js: the signed check");
ok(/"key": "gas_tester", "value": "t1\\\\\.\.\*"/.test(read("vercel.json")) && !/"key": "gas_tester", "value": "ok"/.test(read("vercel.json")), "vercel.json: /desk follows the signed shape");
console.log(`testerCheck: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
