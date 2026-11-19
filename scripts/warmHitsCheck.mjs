// A WARM CONFIRMATION IS NEVER A SEARCH (Sam, Oct 29 2026; found on the e96 warm). Reading each spec through the public Market Check path to confirm warmHit true is a search from the shared address: it
// fills the per-address ceiling ("Lots of searches from here just now") and Market Check's 30 cars a day, and the refused reads were counted as cold specs (59 of 67 golden specs). The confirmation reads
// the stored row instead: ops task warmHits (the same key, the engine stamp and the stale rule a visitor's read uses) writes nothing and searches nothing.
//   1. the warmHits task is read only: it reads through readWarmAnswerDetailed and has no write, no delete, no engine call, no sellerDecision call;
//   2. the warm tools' confirmation path (scripts/warmNamed.mjs) calls warmHits and no verify read posts to /api/sellerDecision;
//   3. CLASS: no script that confirms warmth (name or text says warm/verify) posts a oneBox search to production outside the page-load warm itself (postDeployWarm loads real pages by design).
//   node scripts/warmHitsCheck.mjs
import fs from "node:fs";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const ops = fs.readFileSync("api/usageDashboard.js", "utf8");
const i = ops.indexOf('task === "warmHits"'), j = ops.indexOf("// task=warmDay&day=YYYY-MM-DD", i);
const task = i > 0 ? ops.slice(i, j > i ? j : i + 4000) : "";
ok(task.length > 200, "ops task warmHits exists");
ok(/readWarmAnswerDetailed\(/.test(task) && /warmAnswerKeyFor\(/.test(task), "warmHits reads the stored row by the key and the stale rule a visitor's read uses");
ok(!/writeWarmAnswer|supabaseInsert|supabaseDelete|method: "POST"|oneEngineAnswer|runOneBox|sellerDecision|persistCore|markComputing/.test(task), "warmHits writes nothing, computes nothing and searches nothing");
const tool = fs.readFileSync("scripts/warmNamed.mjs", "utf8").replace(/^\s*\/\/.*$/gm, "");
ok(/task=warmHits/.test(tool) && !/\/api\/sellerDecision/.test(tool), "warmNamed confirms through warmHits and posts no search to /api/sellerDecision");
ok(/vercel.*includeFiles/.test("vercel includeFiles") && /warm-named/.test(fs.readFileSync("vercel.json", "utf8")), "the deployed function carries the named list file");
// the class
const files = fs.readdirSync("scripts").filter(f => /warm|verify|golden|named/i.test(f) && /\.(m?js)$/.test(f));
const SKIP = new Set(["postDeployWarm.mjs", "goldenTruth.mjs", "goldenLive.mjs", "warm.js", "warmMarketCheck.js", "warmDayCheck.mjs", "warmHitsCheck.mjs", "warmStoresFullAnswerCheck.mjs", "namedWarmCheck.mjs"]);
for (const f of files) { if (SKIP.has(f)) continue; const src = fs.readFileSync("scripts/" + f, "utf8").replace(/^\s*\/\/.*$/gm, ""); ok(!(/\/api\/sellerDecision/.test(src) && /oneBox\s*:\s*true/.test(src) && /warmHit/.test(src)), `scripts/${f}: a warm confirmation that posts a oneBox search (use ops task warmHits)`); }
console.log(`warmHitsCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
