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
  ok(!!e && e.noEpoch === 0, `no stored row lacks an epoch stamp (${e && e.noEpoch})`);
  console.log(`epochMatchCheck --live: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
}
const rows = [{ key: "a", engineVersion: "v", warmEpoch: "E2" }, { key: "b", engineVersion: "v", warmEpoch: "E2" }, { key: "c", engineVersion: "v", warmEpoch: "E1" }, { key: "d", engineVersion: "v", warmEpoch: null }, { key: "e", engineVersion: "old", warmEpoch: "E0" }];
const r = epochMatch(rows, "E2", "v");
ok(r.checked === 4 && r.match === 2 && r.mismatch === 1 && r.noEpoch === 1 && r.examples[0].key === "c", `the rule counts match, mismatch and no stamp over the live engine's rows only (${JSON.stringify(r)})`);
ok(epochMatch(rows.slice(0, 2), "E2", "v").mismatch === 0, "all rows on the live epoch: no mismatch");
const ud = fs.readFileSync("api/usageDashboard.js", "utf8");
ok(/we:market->>warmEpoch/.test(ud) && /epoch: epochMatch\(mc,/.test(ud), "warmDay reports the epoch match for every stored Market Check row");
console.log(`epochMatchCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
