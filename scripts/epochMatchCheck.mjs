// EVERY STORED ANSWER CARRIES THE LIVE EPOCH (Sam, Oct 28 2026). Cause: scripts/ingest.js is the ONLY writer of the sales epoch (lib/_epoch.js bumpEpoch, app_config sales_epoch) and it bumps whenever a run inserts rows;
// five golden specs read epoch_mismatch because the nightly delta ingest (nightly.yml, 07:11 UTC) ran after the warm. Class: every warmed Market Check row (MCWARM) stamped with an earlier epoch is served
// stale and recomputed on a visitor's read. This check: offline, the counting rule; --live, the warmDay ops task: the live epoch against every stored row of the live engine version, FAIL on any mismatch.
// Run it right after the final warm and again at 5 AM Thursday.   node scripts/epochMatchCheck.mjs [--live]
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { epochMatch } from "../lib/warmDay.js";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
if (process.argv.includes("--live")) {
  const key = execFileSync("security", ["find-generic-password", "-s", "goasksam-probe", "-w"], { encoding: "utf8" }).trim(), byp = execFileSync("security", ["find-generic-password", "-s", "goasksam-bypass", "-w"], { encoding: "utf8" }).trim();
  const r = await fetch("https://goasksam.com/api/usageDashboard?view=ops&task=warmDay", { headers: { "x-ops-key": key, "x-vercel-protection-bypass": byp } }).then(x => x.json());
  const e = r.epoch;
  ok(!!e && !!e.current, "the live epoch was read");
  ok(!!e && e.checked > 0, `stored rows of the live engine were read (${e && e.checked})`);
  ok(!!e && e.mismatch === 0, `no stored row carries an earlier epoch (${e && e.mismatch} do; live epoch ${e && e.current}; examples ${JSON.stringify(e && e.examples)})`);
  ok(!!e && e.noEpoch === 0, `no stored row lacks an epoch stamp (${e && e.noEpoch}; keys ${JSON.stringify(e && e.noEpochExamples)})`);
  // NO ENDED AUCTION ON FIND (Sam, Oct 28 2026): the live feed is its own cron (/api/pullLive every 15 minutes, a quiet run can wait up to about an hour), so a lot can sit "live" up to a pull behind its end; Find's search
  // drops any lot whose end time has passed. The feed is current when no lot is more than 90 minutes past its end; a lot past that is listed on its own line with its house (Sam, Oct 28: the outlier class is one platform's own cadence).
  const la = await fetch("https://goasksam.com/api/buySearch", { method: "POST", headers: { "content-type": "application/json", "x-ops-key": key, "x-launch-stage-test": "2", "x-vercel-protection-bypass": byp }, body: JSON.stringify({ action: "liveaudit" }) }).then(x => x.json()).catch(() => null);
  const now = Date.now(), rowsLive = (la && la.rows) || [], endedLate = rowsLive.filter(x => x.end_time && Date.parse(x.end_time) < now - 90 * 60e3), endedJust = rowsLive.filter(x => x.end_time && Date.parse(x.end_time) <= now);
  ok(rowsLive.length > 0, `the live set was read (${rowsLive.length} cars)`);
  ok(endedLate.length === 0, `no lot in the live set ended more than 90 minutes ago, the feed is current (${endedLate.length}: ${endedLate.slice(0, 3).map(x => x.source + " " + x.title + " ended " + Math.round((now - Date.parse(x.end_time)) / 60e3) + " min ago").join(" | ")})`);
  console.log(`live set ${rowsLive.length}, ended and not yet marked ended ${endedJust.length} (Find drops them)`);
  console.log(`epochMatchCheck --live: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
}
const rows = [{ key: "a", engineVersion: "v", warmEpoch: "E2" }, { key: "b", engineVersion: "v", warmEpoch: "E2" }, { key: "c", engineVersion: "v", warmEpoch: "E1" }, { key: "d", engineVersion: "v", warmEpoch: null }, { key: "e", engineVersion: "old", warmEpoch: "E0" }];
const r = epochMatch(rows, "E2", "v");
ok(r.checked === 4 && r.match === 2 && r.mismatch === 1 && r.noEpoch === 1 && r.examples[0].key === "c", `the rule counts match, mismatch and no stamp over the live engine's rows only (${JSON.stringify(r)})`);
ok(epochMatch(rows.slice(0, 2), "E2", "v").mismatch === 0, "all rows on the live epoch: no mismatch");
const ud = fs.readFileSync("api/usageDashboard.js", "utf8");
ok(/we:market->>warmEpoch/.test(ud) && /epoch: epochMatch\(mc,/.test(ud), "warmDay reports the epoch match for every stored Market Check row");

// A ROW IS NEVER STORED WITHOUT THE EPOCH IT WAS COMPUTED UNDER (Lane B, Nov 3 2026, item 3). The writers took the epoch from currentEpoch, which answers null on a cold instance whose app_config read failed (right for a reader, wrong for a writer): the row went in with
// warmEpoch null and nothing could confirm it fresh. Class: every writer of a stored answer (MCWARM, MCQ question rows, sell blocks) and every reader of one.
{
  const EP = "2026-11-03T05:00:00.000Z"; let epochMode = "ok"; const puts = [];
  const readEpoch = () => epochMode === "fail" ? new Response("{}", { status: 500 }) : new Response(JSON.stringify(epochMode === "unseeded" ? [] : [{ value: EP }]), { status: 200 });
  globalThis.fetch = async (url, init = {}) => { const u = new URL(String(url));
    if (u.pathname.endsWith("/app_config")) return readEpoch();
    if (u.pathname.endsWith("/spec_market_cache") && init.method === "POST") { puts.push(JSON.parse(init.body)[0]); return new Response("", { status: 201 }); }
    return new Response("[]", { status: 200 }); };
  const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
  const SE = await import("../lib/live/search.js"), SB = await import("../lib/sell/sellBlock.js");
  const answer = { tier: "result", poolN: 9 };
  // a cold instance: the per-instance cache holds nothing and the read fails
  epochMode = "fail"; puts.length = 0;
  await SE.writeWarmAnswer(env, "MCWARM:a", answer); await SE.writeQuestionRow(env, "MCQ:a|x", { tier: "model_choice" }); await SB.writeBlock(env, "SELLBLOCK:a", { kind: "sellblock", warmEpoch: undefined, places: { total: 1 } });
  ok(puts.length === 0, `an epoch that cannot be read stores no warm answer, no question row and no sell block (stored ${puts.length}: ${JSON.stringify(puts.map(x => [x.spec_key, x.market.warmEpoch]))})`);
  epochMode = "ok"; puts.length = 0;
  await SE.writeWarmAnswer(env, "MCWARM:b", answer); await SE.writeQuestionRow(env, "MCQ:b|x", { tier: "model_choice" });
  ok(puts.length === 2 && puts.every(x => x.market.warmEpoch === EP), `with the epoch readable both rows are stamped with it (${JSON.stringify(puts.map(x => x.market.warmEpoch))})`);
  // the readers: a row with no stamp, the live epoch known, is not read as fresh
  const rowNoStamp = { computed_at: new Date().toISOString(), market: { raw: { tier: "result", poolN: 9, cluster: [1, 2], resolvedCar: { year: 2001 } }, engineVersion: (await import("../lib/onebox.js")).ENGINE_VERSION, warmEpoch: null } };
  globalThis.fetch = async (url) => { const u = new URL(String(url)); if (u.pathname.endsWith("/app_config")) return readEpoch(); if (u.pathname.endsWith("/spec_market_cache")) return new Response(JSON.stringify([rowNoStamp]), { status: 200 }); return new Response("[]", { status: 200 }); };
  epochMode = "ok";
  const rd = await SE.readWarmAnswerDetailed(env, "MCWARM:c");
  ok(!!rd && (rd.raw === null || rd.stale === true), `a stored row with no epoch stamp is served stale or computed again when the live epoch is known, never fresh (raw ${!!rd.raw}, stale ${rd.stale}, reason ${rd.reason})`);
}
// an ended auction never draws a Find card, whatever the pull has marked
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
globalThis.fetch = async () => new Response("[]", { status: 200 });
const S = await import("../lib/live/search.js");
const mk = (id, endMs) => ({ id, listing_title: "2001 BMW M3", make: "BMW", model: "M3", year: 2001, status: "live", source: "bringatrailer", country: "US", end_time: new Date(Date.now() + endMs).toISOString(), current_bid_usd: 30000 });
const res = await S.searchLive({ supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" }, { make: "BMW", model: "M3", year: 2001 }, S.emptyFilters(), "2001 BMW M3", { rows: [mk(1, 3 * 3600e3), mk(2, -5 * 60e3), mk(3, -3 * 3600e3)] });
ok((res.rows || []).map(x => (x.r || x).id).join() === "1", `an auction that ended 5 minutes ago does not draw a card (got ${(res.rows || []).map(x => (x.r || x).id)})`);
console.log(`epochMatchCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
