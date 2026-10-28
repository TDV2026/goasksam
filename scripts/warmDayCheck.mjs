// THE LAUNCH WARM COUNTS BY UTC DAY, NOT BY AGE (Sam, Oct 28 2026). A stored answer is "stale" for a visitor's read when it was stored on an earlier UTC day, even
// when it is under 24 hours old; the launch gate is zero rows off the launch day. Fixtures only; no network.
//   1. rowsOffDay counts a row stored at 23:50Z the day before as OFF the day, though it is 7 hours old at 07:00Z (the age rule would pass it);
//   2. a row stored at 00:05Z on the day is on it; a wrong-version row is counted apart and never as on or off;
//   3. a row with no time counts as off the day (never silently on it);
//   4. the ops task is wired (api/usageDashboard.js task=warmDay) and reads the helper;
//   5. the age-only count (the thing this replaces) passes the 23:50Z row: shown, so the check fails without the fix.
//   node scripts/warmDayCheck.mjs
import fs from "node:fs";
import { rowsOffDay, utcDayOf } from "../lib/warmDay.js";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const V = "e95-20261027-pooled", DAY = "2026-10-29", NOW = Date.parse("2026-10-29T14:00:00Z");
const rows = [
  { key: "MCWARM:a", computedAt: "2026-10-29T00:05:00Z", engineVersion: V },
  { key: "MCWARM:b", computedAt: "2026-10-29T13:00:00Z", engineVersion: V },
  { key: "MCWARM:c", computedAt: "2026-10-28T23:50:00Z", engineVersion: V },
  { key: "MCWARM:d", computedAt: null, engineVersion: V },
  { key: "MCWARM:e", computedAt: "2026-10-20T10:00:00Z", engineVersion: "e90-old" },
];
const r = rowsOffDay(rows, DAY, V);
ok(r.total === 4 && r.onDay === 2 && r.offDay === 2 && r.wrongVersion === 1 && r.noTime === 1, `counts: ${JSON.stringify({ t: r.total, on: r.onDay, off: r.offDay, wv: r.wrongVersion, nt: r.noTime })}`);
ok(r.examples.some(x => x.key === "MCWARM:c" && x.day === "2026-10-28"), "the 23:50Z row of the day before is named as off the day");
ok(utcDayOf("2026-10-29T00:00:00Z") === DAY && utcDayOf("2026-10-28T23:59:59Z") === "2026-10-28", "the UTC day line is 00:00Z");
ok(rowsOffDay(rows.filter(x => /[ab]$/.test(x.key)), DAY, V).offDay === 0, "a set stored entirely on the day counts zero");
const ageOnly = rows.filter(x => x.engineVersion === V && x.computedAt && NOW - Date.parse(x.computedAt) < 24 * 3600e3).length;
ok(ageOnly === 3 && r.onDay === 2, `WITHOUT the fix (age under 24 hours only) the 23:50Z row passes: ${ageOnly} would count as fresh against ${r.onDay} on the day`);
const OPS = fs.readFileSync("api/usageDashboard.js", "utf8");
ok(/task === "warmDay"/.test(OPS) && /rowsOffDay\(mc, day, ENGINE_VERSION\)/.test(OPS), "task=warmDay is wired and reads the helper");
ok(!/supabaseInsert|supabaseDelete|writeWarmAnswer|\.upsert/.test(OPS.slice(OPS.indexOf('task === "warmDay"'), OPS.indexOf('task === "warmDemoCheck"'))), "task=warmDay writes nothing");
console.log(`warmDayCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
