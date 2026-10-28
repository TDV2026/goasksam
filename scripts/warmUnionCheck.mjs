// THE LAUNCH WARM IS THE UNION, NOT THE TRAFFIC SLICE (Sam, Oct 28 2026). Cause: warmLiveSpecs keeps only the live specs whose make|model was searched in the last 14 days (Sam's egress
// decision of Oct 16: about 919 of 1,934 live-set specs), so 629 specs a visitor can open on Find had no stored core row. The launch warm now asks for every spec any live listing resolves to
// (trafficDays=0). Class: any warm path that reads the live set through a filter narrower than the live set. This check reads the warm callers and the handler.   node scripts/warmUnionCheck.mjs
import fs from "node:fs";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const src = f => fs.readFileSync(f, "utf8");
const pd = src("scripts/postDeployWarm.mjs"), ud = src("api/usageDashboard.js"), sr = src("lib/live/search.js");
ok(/task=warmLive[^`'"]*trafficDays=0/.test(pd), "postDeployWarm asks warmLive for every live spec (trafficDays=0)");
ok(/trafficDays: Math\.max\(0, Number\(req\.query\.trafficDays\)/.test(ud), "the warmLive task passes trafficDays through");
ok(/trafficDays\) \? Number\(opts\.trafficDays\) : 14/.test(sr) && /off \(trafficDays=0\), every spec warmed/.test(sr), "warmLiveSpecs warms every spec when trafficDays is 0");
// every in-repo caller of the warmLive task is the union
for (const f of fs.readdirSync("scripts").filter(x => /\.(mjs|sh)$/.test(x) && x !== "warmUnionCheck.mjs")) { for (const line of src("scripts/" + f).split("\n")) { if (/^\s*(\/\/|#)/.test(line)) continue; for (const m of line.matchAll(/usageDashboard\?[^\s`'"]*task=warmLive[^\s`'"]*/g)) ok(/trafficDays=0/.test(m[0]), `scripts/${f}: a warmLive call without trafficDays=0 warms the traffic slice only`); } }
console.log(`warmUnionCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
