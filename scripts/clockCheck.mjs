// clockCheck (Lane G, Oct 29 2026): NO PREPUSH CHECK DEPENDS ON THE REAL CLOCK WITHOUT A FAKE ONE. Cause it guards: holdPageCheck and holdZeroCheck wrote a launch time of
// 7:00 AM Oct 29 and read the real now, so they passed at 5:09 AM and failed on every build after 7:00 AM. Class: any check that reads the current time (Date.now(), new Date()
// with no argument) or runs code that does, against a date written in the check, passes or fails by the hour it is run. Rule: a check that reads the real clock must import
// scripts/_fakeClock.mjs (a fixed made-up day) or carry a line "// clock: real-ok <reason>" saying why the real time is harmless (it only measures elapsed time, or every date in it is
// built from the real now). The dynamic proof (every offline check run with the clock moved forward 2 and 60 days) is in docs/lane-notes.md; this scan keeps new checks honest.
// It also fails if a check names the real launch day as a literal moment (2026-10-29 with a time). No network. Usage: node scripts/clockCheck.mjs [rootDir]
import fs from "node:fs"; import path from "node:path";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const root = path.resolve(process.argv[2] || ".");
const pre = fs.readFileSync(path.join(root, "scripts/prePush.mjs"), "utf8");
const names = [...new Set([...pre.matchAll(/node scripts\/([A-Za-z0-9_.-]+\.m?js)/g)].map(m => m[1]))].filter(n => fs.existsSync(path.join(root, "scripts", n)));
ok(names.length > 100, "found the prePush checks (" + names.length + ")");
const READS = /\bDate\.now\(\)|\bnew Date\(\s*\)|\bperformance\.now\(\)/, FAKE = /_fakeClock\.mjs/, REAL_OK = /\/\/\s*clock:\s*real-ok\b/;
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map(l => l.replace(/(^|[^:"'`])\/\/.*$/, "$1")).join("\n");
const bad = [], launchLit = [], launchUse = [];
// Checks that were run once with the clock moved (real, +2 and +60 days) and gave the same answer, or are browser/network checks read only statically (Lane G, Oct 29 2026). A NEW check is not in this list: it must use the fake clock or say why.
const BASELINE = new Set(["analyticsCheck.mjs","answerWordsCheck.mjs","buildPoolSmoke.mjs","buyCardAskCheck.mjs","buyStage1Check.mjs","carriedFieldsCheck.mjs","chassisCodeCheck.mjs","coldPathCheck.mjs","deltaReadCheck.mjs","droppedTrimCheck.mjs","emailCardsCheck.mjs","emailModeCheck.mjs","endedLotCheck.mjs","epochMatchCheck.mjs","findCardKitCheck.mjs","findCardShapeCheck.mjs","findNoSaleLineCheck.mjs","findPrefillCheck.mjs","findWatchCheck.mjs","goldenTruth.mjs","historyWindowCheck.mjs","hubLinkCheck.mjs","identityLocalCheck.mjs","launchDashCheck.mjs","marketSectionsCheck.mjs","milesFaultCheck.mjs","mixedRangeCheck.mjs","modelIdentityCheck.mjs","newsletterSignupCheck.mjs","nonVehicleCheck.mjs","numberNameCheck.mjs","outboundUtmCheck.mjs","pageWaitCheck.mjs","partnerAccessCheck.mjs","partnerEngineMatch.mjs","placeholderCheck.mjs","pooledAnswerCheck.mjs","pullStarterCheck.mjs","pushCheck.mjs","questionRuleCheck.mjs","questionSpeedCheck.mjs","refusalCauseCheck.mjs","refusalCheck.mjs","resolverHangCheck.mjs","resolverLanesCheck.mjs","routeLimitCheck.mjs","rungAlwaysCheck.mjs","salePhotoCheck.mjs","salesPanelCheck.mjs","sameSetCheck.mjs","scopeReasonCheck.mjs","searchTextCheck.mjs","sellCutoffCheck.mjs","signinReturnCheck.mjs","standingControlsCheck.mjs","standingDrawerCheck.mjs","tasksDraftCheck.mjs","tasksPageShots.mjs","tasksSeenCheck.mjs","taxonomyUnreadableCheck.mjs","thinSalesCheck.mjs","trimTextCheck.mjs","valueIntentCheck.mjs"]);
for (const n of names) {
  const src = fs.readFileSync(path.join(root, "scripts", n), "utf8"), code = strip(src);
  if (n === "prePush.mjs" || n === "_fakeClock.mjs") continue;
  if (READS.test(code) && !FAKE.test(src) && !REAL_OK.test(src) && !BASELINE.has(n)) bad.push(n);
  // a check of anything that reads LAUNCH_AT or the holding page runs code that reads the clock inside lib/, so a text scan for Date.now() cannot see it: it must use the fake clock or pass explicit times
  if (/\b(heldFor|holdingHtml|launchAtMs|launchWords|LAUNCH_AT)\b/.test(code) && !FAKE.test(src) && !REAL_OK.test(src)) launchUse.push(n);
  if (/2026-10-29T0[0-9]:\d\d/.test(code) && !FAKE.test(src) && !REAL_OK.test(src)) launchLit.push(n);
}
ok(bad.length === 0, "every check that reads the real clock imports _fakeClock.mjs or says why not (// clock: real-ok <reason>)" + (bad.length ? ": " + bad.join(", ") : ""));
ok(launchUse.length === 0, "every check that reads the holding page or LAUNCH_AT uses the fake clock" + (launchUse.length ? ": " + launchUse.join(", ") : ""));
ok(launchLit.length === 0, "no check writes the real launch moment (2026-10-29T07:00) against the real clock" + (launchLit.length ? ": " + launchLit.join(", ") : ""));
console.log(`clockCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
