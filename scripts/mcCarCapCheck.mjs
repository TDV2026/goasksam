// MARKET CHECK DAILY CAP (Sam, Oct 27 2026): 30 distinct cars a day per device; at the cap the reply is Sam's message (a 200, tier business_limit, the sentence below) and the event
// limit_hit fires with props route, limit and tier, through the existing event path; no address and no device id is stored. No network.   node scripts/mcCarCapCheck.mjs
process.env.SUPABASE_URL = "https://db.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.SUPABASE_ANON_KEY = "a"; delete process.env.MARKET_CHECK_DAILY_CARS; delete process.env.CURTAIN_CREW_CODE;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
import fs from "node:fs";
const MSG = "That’s 30 cars checked today, the most Market Check shows one visitor in a day while Sam is in beta. It starts fresh tomorrow, so come back then. Find and Sell are still open. If this got in your way, tell us at feedback@goasksam.com.";
const sd = fs.readFileSync("api/sellerDecision.js", "utf8"), oj = fs.readFileSync("public/js/onebox.js", "utf8");
ok(sd.includes('"That’s " + marketCheckDailyCarCap() + " cars checked today, the most Market Check shows one visitor in a day while Sam is in beta. It starts fresh tomorrow, so come back then. Find and Sell are still open. If this got in your way, tell us at feedback@goasksam.com."'), "the server reply is Sam's message (the number is the cap)");
ok(oj.includes(MSG), "the page's own fallback is the same message");
ok(!/limit of|If you would like more searches|set you up|get you set up/.test(sd.slice(sd.indexOf('tier: "business_limit"'), sd.indexOf('tier: "business_limit"') + 600)), "the old 'today's limit ... email and we will get you set up' reply is gone");
ok(!/[–—]/.test(MSG), "no dashes");
// the cap fires the event
const { setTrackSink } = await import("../lib/track/log.js");
const rows = []; setTrackSink(r => rows.push(r));
const { checkMarketCheckCarLimit, marketCheckDailyCarCap } = await import("../lib/_ceilings.js");
ok(marketCheckDailyCarCap() === 30, "the cap is 30");
const DEVICE_IP = "203.0.113.77", UA = "CapCheck/1";
globalThis.fetch = async (url, o) => {
  const u = String(url), isHead = o && o.method === "HEAD";
  if (isHead) { const n = /kind=like\./.test(u) ? 30 : 0; return new Response(null, { status: 206, headers: { "content-range": `0-0/${n}` } }); }
  return new Response("[]", { status: 200 });
};
const env = { supabaseUrl: process.env.SUPABASE_URL, supabaseKey: "k" };
for (const [tier, auth] of [["anonymous", ""], ["signed_in", "Bearer abc.def.ghi"]]) {
  rows.length = 0;
  const req = { headers: { "x-forwarded-for": DEVICE_IP, "user-agent": UA, cookie: "", authorization: auth, host: "goasksam.com" }, socket: {} };
  const r = await checkMarketCheckCarLimit(env, req, "BMW|325i|null|2006");
  await new Promise(res => setTimeout(res, 50));
  ok(r && r.ok === false, `${tier}: at 30 cars the next new car is refused`);
  const ev = rows.find(x => (x.event || x.event_name || x.name) === "limit_hit" || JSON.stringify(x).includes("limit_hit"));
  const props = ev && (ev.props || ev.properties || {});
  ok(ev && props.limit === "device_cars_day" && props.route === "market_check" && props.tier === tier, `${tier}: limit_hit fires with limit device_cars_day, route market_check, tier ${tier} (${JSON.stringify(props)})`);
  ok(ev && !JSON.stringify(ev).includes(DEVICE_IP) && !JSON.stringify(ev).includes("abc.def.ghi") && !/dev:/.test(JSON.stringify(ev)), `${tier}: the event stores no address, no device key and no token`);
}
// under the cap: allowed, no event
rows.length = 0;
globalThis.fetch = async (url, o) => (o && o.method === "HEAD") ? new Response(null, { status: 206, headers: { "content-range": `0-0/${/kind=like\./.test(String(url)) ? 29 : 0}` } }) : new Response("[]", { status: 200 });
const under = await checkMarketCheckCarLimit(env, { headers: { "x-forwarded-for": DEVICE_IP, "user-agent": UA, cookie: "", host: "goasksam.com" }, socket: {} }, "BMW|325i|null|2006");
await new Promise(res => setTimeout(res, 50));
ok(under.ok === true && !rows.some(x => JSON.stringify(x).includes("limit_hit")), "29 cars: the 30th new car is allowed and fires no event");
const cat = fs.readFileSync("lib/track/catalog.js", "utf8");
ok(/limit_hit: \{.*opt: \{ scope: "key", route: "key", tier: "key" \}/.test(cat), "the catalog knows the route and tier props");
console.log(`mcCarCapCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
