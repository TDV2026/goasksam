// AN ENDED LOT NEVER STAYS UNMARKED PAST ONE PULL CYCLE (Lane B, Oct 29 2026). A Sotheby's Motorsport 2017 911 Carrera 4S Cabriolet that ended 181 minutes earlier was still status live.
// CAUSE: only the full walk (06:15, 14:45 and 22:15 Pacific) marked a vanished listing ended; the ending-soonest pulls (every 30 minutes from 09:00 to 14:30 Pacific) only refreshed what they saw, and the quarter
// hours between 14:45 and 22:15 had no pull at all. A lot that ended in the evening stayed live for up to 7.5 hours, and every reader of live_listings (the union warm, the header and landing counts, Tasks) counted it.
// FIX (three parts): (1) the ending pull marks over any lot whose end time passed more than 10 minutes ago and that the pull did not list again (feed.js markEndedPast; an extended auction is listed again and stays
// live); (2) a quarter hour with no pull marks over any lot ended more than an hour ago, database only, zero OCD; (3) liveRows never returns a lot whose end time has passed, whatever its status says.
// Affects every page and warm that reads live_listings: Find, Tasks, the header and landing counts, the spec pages' live counts, the union warm. Swept by the ops task endedunmarked.
//   node scripts/endedLotCheck.mjs [repo root]
import fs from "node:fs";
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2";
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const now = Date.now(), iso = ms => new Date(now + ms).toISOString(), MIN = 60e3;
const seenAt = iso(0);
let ROWS = [
  { id: 1, source: "sothebysmotorsport", listing_title: "2017 Porsche 911 Carrera 4S Cabriolet", status: "live", end_time: iso(-181 * MIN), last_seen: iso(-200 * MIN) },   // ended 181 minutes ago, not listed again
  { id: 2, source: "bringatrailer", listing_title: "extended auction, listed again", status: "live", end_time: iso(-181 * MIN), last_seen: iso(1000) },                   // this pull saw it
  { id: 3, source: "bringatrailer", listing_title: "ends in two hours", status: "live", end_time: iso(120 * MIN), last_seen: iso(-5 * MIN) },
  { id: 4, source: "carsandbids", listing_title: "ended 5 minutes ago", status: "live", end_time: iso(-5 * MIN), last_seen: iso(-20 * MIN) },                                // inside the grace
  { id: 5, source: "pcarmarket", listing_title: "no end time", status: "live", end_time: null, last_seen: iso(-60 * MIN) }
];
const q = (u, k) => u.searchParams.getAll(k).map(v => v.replace(/^[a-z]+\./, ""));
globalThis.fetch = async (url, init) => {
  const u = new URL(String(url));
  if (u.pathname.endsWith("/live_listings")) {
    const status = (u.searchParams.get("status") || "").replace(/^eq\./, ""), endLt = (u.searchParams.get("end_time") || "").replace(/^lt\./, ""), seenLt = (u.searchParams.get("last_seen") || "").replace(/^lt\./, "");
    const hit = ROWS.filter(r => (!status || r.status === status) && (!endLt || (r.end_time && Date.parse(r.end_time) < Date.parse(endLt))) && (!seenLt || Date.parse(r.last_seen) < Date.parse(seenLt)));
    if (init && init.method === "PATCH") { const b = JSON.parse(init.body); hit.forEach(r => Object.assign(r, b)); return new Response(JSON.stringify(hit.map(r => ({ id: r.id }))), { status: 200 }); }
    return new Response(JSON.stringify(ROWS.filter(r => !status || r.status === status)), { status: 200, headers: { "content-range": "0-" + ROWS.length + "/" + ROWS.length } });
  }
  return new Response("[]", { status: 200 });
};
const F = await import(pathToFileURL(path.join(root, "lib/live/feed.js")).href);
// 1. the ending pull's marking
ok("feed.js has markEndedPast", typeof F.markEndedPast === "function");
if (typeof F.markEndedPast === "function") {
  const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
  const r = await F.markEndedPast(env, seenAt);
  const by = id => ROWS.find(x => x.id === id).status;
  ok("a lot that ended 181 minutes ago and was not listed again is marked ended in the one pull", by(1) === "ended_unsold" && r.ended === 1, JSON.stringify(r));
  ok("an extended auction the pull listed again stays live", by(2) === "live");
  ok("a lot still running, a lot inside the grace and a lot with no end time stay live", by(3) === "live" && by(4) === "live" && by(5) === "live");
}
// 2. the wiring: the ending pull calls it, and a quarter hour with no pull sweeps too (zero OCD)
{ const p = fs.readFileSync("api/pullLive.js", "utf8");
  ok("the ending-soonest pull marks ended lots after its upsert", /markEndedPast\(env, seenAt\)/.test(p) && /mode === "ending"/.test(p.slice(p.indexOf("markEndedPast(env, seenAt)") - 200, p.indexOf("markEndedPast(env, seenAt)") + 50)));
  ok("a quarter hour with no pull marks over lots ended an hour ago, database only", /if \(!slot\.mode\) \{[^}]*markEndedPast\(env, new Date\(\)\.toISOString\(\), 60 \* 60e3\)/.test(p)); }
// 3. no pull cycle leaves a gap longer than the sweep: the schedule has a pull or a sweep at every quarter hour (the cron fires every 15 minutes)
{ const vj = fs.readFileSync("vercel.json", "utf8"); ok("the cron fires pullLive every 15 minutes (so the sweep runs every cycle)", /"path": "\/api\/pullLive\?mode=auto",\s*"schedule": "\*\/15 \* \* \* \*"/.test(vj)); }
// 4. every reader of the live rows: an ended lot is not returned whatever its status says
{ ROWS = [{ id: 1, source: "sothebysmotorsport", listing_title: "2017 Porsche 911 Carrera 4S Cabriolet", status: "live", end_time: iso(-181 * MIN), last_seen: iso(-200 * MIN), country: "US", location: "California", currency: "USD" },
    { id: 3, source: "bringatrailer", listing_title: "2004 BMW M3", status: "live", end_time: iso(120 * MIN), last_seen: iso(-5 * MIN), country: "US", location: "California", currency: "USD" }];
  const S = await import(pathToFileURL(path.join(root, "lib/live/search.js")).href);
  const rows = await S.liveRows({ supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" }, "id=gt.0");
  ok("liveRows does not return a lot whose end time has passed, whatever its status", rows.length === 1 && rows[0].id === 3, rows.map(r => r.id).join(","));
  const all = await S.liveRows({ supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" }, "id=gt.0", { allScope: true });
  ok("the audit read (allScope) still sees both, so endedunmarked can name them", all.length === 2); }
console.log(fail ? `endedLotCheck: ${fail} failure(s)` : "endedLotCheck: all pass");
process.exit(fail ? 1 : 0);
