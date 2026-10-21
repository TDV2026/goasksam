// BEACON CEILINGS (security F-08, Sam approved Oct 21 2026; Lane C): funnel, pageview, track and out each ask
// lib/_ceilings.js beaconAllowed before writing; over the ceiling the caller gets the same answer and no row is written;
// the entry diagnostic is cut to its own keys and 2 KB. Runs beaconAllowed against a stubbed ledger. No network.
//   node scripts/beaconCeilingCheck.mjs     exit 1 on any failure.
import fs from "node:fs";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
let count = 0, writes = 0;
globalThis.fetch = async (url, o = {}) => { if ((o.method || "GET") === "HEAD") return { ok: true, status: 200, headers: { get: () => "*/" + count } }; writes++; return { ok: true, status: 201, json: async () => ({}) }; };
const { beaconAllowed, CEILINGS } = await import("../lib/_ceilings.js");
const env = { supabaseUrl: "https://stub.invalid", supabaseKey: "unused" }, req = { headers: { "x-forwarded-for": "203.0.113.9", "user-agent": "x" }, socket: {} };
for (const s of ["beacon_funnel", "beacon_pageview", "beacon_track", "beacon_out"]) ok(CEILINGS[s] && CEILINGS[s].address && CEILINGS[s].address.length === 1, `${s}: one address window`);
count = 10; writes = 0; ok(await beaconAllowed(env, req, "beacon_funnel") === true && writes === 1, "under the ceiling: allowed, one ledger write");
count = 3000; writes = 0; ok(await beaconAllowed(env, req, "beacon_funnel") === false && writes === 0, "at the ceiling: refused, and nothing written (no event row either)");
count = 99999; ok(await beaconAllowed(null, req, "beacon_funnel") === true, "no database env: never blocks");
globalThis.fetch = async () => { throw new Error("down"); };
ok(await beaconAllowed(env, req, "beacon_out") === true, "an unreadable ledger fails open (the redirect is never at stake)");
const src = f => fs.readFileSync(new URL(`../api/${f}.js`, import.meta.url), "utf8");
ok(/if \(!\(await beaconAllowed\(supabaseEnv\(\), req, "beacon_funnel"\)\)\) \{ res\.status\(204\)\.end\(\); return; \}/.test(src("funnel")), "funnel: same 204, no write, over the ceiling");
ok(/if \(await beaconAllowed\(env, req, "beacon_pageview"\)\) await logPageView/.test(src("pageview")) && /send\(PIXEL\)/.test(src("pageview")), "pageview: the pixel is always sent");
ok(/if \(!\(await beaconAllowed\(supabaseEnv\(\), req, "beacon_track"\)\)\) return res\.status\(204\)\.end\(\);/.test(src("track")), "track: same 204, no write");
const out = src("out");
ok(/if \(env && await beaconAllowed\(env, req, "beacon_out"\)\) \{/.test(out) && out.indexOf("beaconAllowed") < out.indexOf('res.setHeader("Location", withUtm(target));'), "out: the redirect always happens; only the click row is skipped");
const { diagOf, DIAG_MAX_BYTES } = await import("../api/funnel.js");
const d = diagOf({ kind: "jserror", path: "/", msg: "boom", line: 3, evil: { a: 1 }, __proto__x: 1 });
ok(d && JSON.stringify(Object.keys(d)) === JSON.stringify(["kind", "path", "msg", "line"]), "the diagnostic keeps only its own keys");
ok(diagOf({ kind: "x", msg: "y".repeat(400), stack: "z".repeat(400), src: "a".repeat(400), ua: "u".repeat(400), path: "p".repeat(400), cover: "c".repeat(400) }) === null && DIAG_MAX_BYTES === 2048, "over 2 KB: not stored");
ok(diagOf(null) === null && diagOf([1]) === null, "not an object: not stored");
console.log(`beaconCeilingCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
