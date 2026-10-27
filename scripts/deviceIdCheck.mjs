// THE DEVICE ID IS SERVER-ISSUED AND SIGNED (Lane S review, Oct 27 2026): a gas_vid value the client made up, an old unsigned one, or a tampered one is not a device, so changing the cookie on every
// call no longer slips a per-device limit; those requests count under the address plus browser hash. No network.   node scripts/deviceIdCheck.mjs
process.env.SUPABASE_SERVICE_ROLE_KEY = "unit-test-secret-not-real";
delete process.env.CURTAIN_CREW_CODE;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const { ensureVisitorId, readVisitorId, verifiedDeviceId } = await import("../lib/_visitor.js");
const { deviceKey, deviceKeys } = await import("../lib/_ceilings.js");
const resOf = () => { const r = { h: {}, setHeader(k, v) { this.h[k] = v; }, getHeader(k) { return this.h[k]; } }; return r; };
const reqOf = (cookie, ip = "203.0.113.9", ua = "UnitTest/1") => ({ headers: { cookie, "x-forwarded-for": ip, "user-agent": ua, "x-vercel-ip-country": "US" }, socket: {} });
// the server issues a signed id
const r1 = resOf(); const first = ensureVisitorId(reqOf(""), r1);
const set = [].concat(r1.h["Set-Cookie"] || [])[0] || "";
const value = (/^gas_vid=([^;]+)/.exec(set) || [])[1];
ok(first.minted && first.id && /^v1\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/.test(value || ""), "a new visitor gets a signed id: v1.<id>.<signature>");
ok(readVisitorId(reqOf("gas_vid=" + value)) === first.id && verifiedDeviceId(value) === first.id, "the signed id is read back as the same device");
const again = ensureVisitorId(reqOf("gas_vid=" + value), resOf());
ok(again.id === first.id && !again.minted, "a returning visitor keeps the id and nothing is re-issued");
// a client-chosen id is not a device
ok(readVisitorId(reqOf("gas_vid=attacker-chosen-id-123")) === null, "a made-up 8 to 64 character id is not a device (the old rule accepted it)");
ok(readVisitorId(reqOf("gas_vid=v1.AAAAAAAAAAAAAAAAAAAAAA." + "A".repeat(43))) === null, "a signed-looking value with a wrong signature is not a device");
ok(readVisitorId(reqOf("gas_vid=" + value.replace(/.$/, c => (c === "A" ? "B" : "A")))) === null, "a tampered signature is not a device");
ok(readVisitorId(reqOf("gas_vid=" + value.replace(/^v1\.[A-Za-z0-9_-]{22}/, "v1.ZZZZZZZZZZZZZZZZZZZZZZ"))) === null, "a signature moved onto another id is not a device");
const r2 = resOf(); const re = ensureVisitorId(reqOf("gas_vid=attacker-chosen-id-123"), r2);
ok(re.minted && re.id !== "attacker-chosen-id-123" && /v1\./.test([].concat(r2.h["Set-Cookie"] || []).join("")), "an unsigned cookie is replaced by a fresh signed id, never re-signed");
// the limits: a different made-up cookie on every call lands on the SAME key (address plus browser hash), so there is nothing to rotate
const keys = new Set();
for (let i = 0; i < 25; i++) keys.add(deviceKey(reqOf("gas_vid=rotating-" + i + "-abcdefgh")));
ok(keys.size === 1 && [...keys][0].startsWith("dev:h"), "rotating the cookie on every call gives one key: the address plus browser hash (" + [...keys][0] + ")");
ok(deviceKey(reqOf("gas_vid=" + value)) === "dev:" + first.id, "a real signed id keys its own device");
ok(deviceKeys(reqOf("gas_vid=rotating-1-abcdefgh")).every(k => k.startsWith("dev:h")), "the rolling read also falls back to the hash");
ok(deviceKey(reqOf("gas_vid=rotating-1-abcdefgh", "198.51.100.7")) !== deviceKey(reqOf("gas_vid=rotating-1-abcdefgh", "203.0.113.9")), "the hash is per address: the address limits are as they were");
// no secret: nothing is issued or trusted
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const r3 = resOf(); const none = ensureVisitorId(reqOf(""), r3);
ok(none.id === null && !r3.h["Set-Cookie"] && readVisitorId(reqOf("gas_vid=" + value)) === null, "with no server secret no id is issued and none is trusted");
// the Market Check distinct-car cap: 30 a day per device (Oct 27 2026), the env override still wins
{ const { marketCheckDailyCarCap } = await import("../lib/_ceilings.js"); delete process.env.MARKET_CHECK_DAILY_CARS;
  ok(marketCheckDailyCarCap() === 30, "Market Check distinct cars per device per day: 30 (lib/_ceilings.js marketCheckDailyCarCap)");
  process.env.MARKET_CHECK_DAILY_CARS = "12"; ok(marketCheckDailyCarCap() === 12, "the env override still wins"); delete process.env.MARKET_CHECK_DAILY_CARS; }
console.log(`deviceIdCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
