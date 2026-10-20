// PRE-PUSH SMOKE TEST (job 2, Oct 2026; addendum same day). The ONE entry point for every lane
// before every push. No push without a green (or baseline-only) run - see docs/lane-notes.md
// "PREPUSH RULE".
//   node scripts/prePush.mjs                 # browser check against https://goasksam.com
//   node scripts/prePush.mjs --base <url>     # browser check against a specific deploy
//   node scripts/prePush.mjs --tier full|fast  # force the full tier (fast is refused when an engine-and-data file changed)
//   node scripts/prePush.mjs --tier-only      # print which tier this branch gets, and why, then stop
//
// What it checks, in order, and why:
//   1. MODULE LOAD - every lib/** and api/** file in this branch's own COMMITTED history since it
//      diverged from origin/main (never the dirty working tree - this is a shared, multi-lane
//      checkout) is dynamically imported. This alone would have caught the fb4c4fc incident (job 1):
//      a module-level array literal called a helper before that helper's own `const` declaration
//      executed later in the file, throwing "Cannot access 'X' before initialization" on the FIRST
//      request after deploy, in every route that transitively imports lib/onebox.js. A plain
//      `node --check` (syntax only) does not catch this - TDZ errors only surface when the module
//      actually runs. Run AFTER committing what you're about to push (commit, then prePush, then
//      push), not before - an uncommitted file is not "the commit."
//   2. DETERMINISTIC ENGINE CHECKS - a FIXED list of cars with their expected counts/ranges recorded
//      directly in this script (DETERMINISTIC_CASES below), so a change to the engine shows up as a
//      diff in THIS file, not a silent drift. Plus depthWins fixtures (pure, no DB, always runs), and
//      - when SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY are set - representative invariants and the
//      live-comparable fence check from scripts/crossProductCheck.js. Without those two env vars
//      (the normal case for an agent's environment - Sam's own standing note, these are sensitive and
//      not pullable), the archive-backed checks are SKIPPED LOUDLY, never silently treated as passing.
//   3. BROWSER CHECK - scripts/pushCheck.mjs (Lane C), the ONE browser check every lane shares - this
//      file does not duplicate it. Loads a Market Check result, a Buy result, a spec page and the
//      Sell first step in a real browser via the crew test-only override (x-launch-stage-test header
//      + PROBE_KEY, read from the environment only, never printed - see pushCheck.mjs's own header),
//      and fails on any 5xx or console/page error.
//   4. BASELINE - a short, dated list of KNOWN pre-existing failures (BASELINE_FAILURES below). A
//      pushCheck failure whose message matches a baseline entry is reported as "BASELINE (known)",
//      not as a new, blocking regression - but it is still PRINTED, never hidden, so a baseline entry
//      that silently clears is visible too (remove it from the list once confirmed fixed, with the
//      commit that fixed it). A failure NOT on the baseline is a new regression and blocks the push.
//
// DRY-RUN SAFETY: no check in this file calls any endpoint capable of a write, a pull, or a live
// vendor fetch. If a future check needs to reach one (e.g. a pull/ingest endpoint), it MUST pass that
// endpoint's dry-run flag - this is a standing rule for every lane's prePush additions, not just this
// file's current checks (see docs/lane-notes.md "PREPUSH RULE").
//
// Exit code 0 when every check that actually ran passed or matched a baseline entry. A SKIPPED check
// is reported as SKIP, never counted as a pass - state it plainly in the push report.
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import path from "node:path";

const argBase = (() => { const i = process.argv.indexOf("--base"); return i >= 0 ? process.argv[i + 1] : null; })();
const BASE = argBase || process.env.BASE || "https://goasksam.com";

// ---- 0. THE TIER (Sam, Oct 17 2026; scripts/engineDataFiles.mjs) ----
// FULL when this branch changes an engine-and-data file (the list, its folders, or any file whose text reads the market
// tables or imports the engine); FAST otherwise: module load, every offline unit check and the identity pages, the search
// check report-only, and NO archive read, no browser check against the live site and no golden truth; the owning lane
// runs its live check after the deploy and posts it. --tier full forces FULL; --tier fast is refused (FULL is run) when
// an engine-and-data file changed.
const { engineDataTouched } = await import("./engineDataFiles.mjs");
const tierArg = (() => { const i = process.argv.indexOf("--tier"); return i >= 0 ? String(process.argv[i + 1] || "") : "auto"; })();
let allChanged = [];
try { allChanged = execSync("git diff --name-only origin/main...HEAD", { encoding: "utf8" }).trim().split("\n").filter(Boolean); } catch { allChanged = null; }
const committedText = f => { try { return execSync(`git show HEAD:${JSON.stringify(f).slice(1, -1)}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch { return null; } };
const touched = allChanged ? engineDataTouched(allChanged, committedText) : null;
const TIER = tierArg === "full" || !touched || touched.length ? "full" : "fast";
console.log(`-- tier: ${TIER.toUpperCase()} --`);
if (!touched) console.log("   the changed files could not be read, so FULL is run");
else if (touched.length) console.log(`   engine-and-data files changed: ${touched.map(t => t.file + " (" + t.why + ")").join(", ")}${tierArg === "fast" ? "; --tier fast refused" : ""}`);
else console.log(`   no engine-and-data file changed (${allChanged.length} file(s): ${allChanged.join(", ") || "none"})${tierArg === "full" ? "; --tier full asked, so FULL is run" : ""}`);
const FAST_WHY = "fast tier: no engine-and-data file changed; the owning lane runs its live check after the deploy";
// --tier-only: print the decision above and stop (no check runs; for proving the rule without loading the site).
if (process.argv.includes("--tier-only")) process.exit(0);

// BASELINE_FAILURES (dated, Oct 2026): known pushCheck console-error signatures that predate this
// script and are not yet fixed. Empty right now - the one known entry (the Sam's Take "averaged"
// console error on Market Check) was fixed the same day this baseline mechanism was built (lib/
// onebox.js stPlainClause + ST_BANNED), so there is nothing to carry forward. Add an entry here ONLY
// with a one-line reason and the date found; remove it the day it is confirmed fixed.
const BASELINE_FAILURES = [];

const results = [];
function record(name, status, detail) { results.push({ name, status, detail }); console.log(`${status.padEnd(4)}  ${name}${detail ? "  " + detail : ""}`); }

console.log("=== PRE-PUSH SMOKE TEST ===\n");

// ---- 1. MODULE LOAD ----
console.log("-- module load --");
let changed = [];
try {
  const tracked = execSync("git diff --name-only origin/main...HEAD", { encoding: "utf8" }).trim().split("\n").filter(Boolean);
  changed = [...new Set(tracked)].filter(f => /^(lib|api)\/.*\.m?js$/.test(f));
} catch (e) {
  record("module load: diff against origin/main", "FAIL", String(e && e.message || e).split("\n")[0]);
}
if (!changed.length) {
  record("module load", "SKIP", "no changed lib/api files in this branch's commits since origin/main");
} else {
  for (const f of changed) {
    try {
      await import(pathToFileURL(path.resolve(f)).href + `?t=${Date.now()}`);
      record(`module load: ${f}`, "PASS");
    } catch (e) {
      record(`module load: ${f}`, "FAIL", String(e && e.message || e).split("\n")[0]);
    }
  }
}

// ---- 2. DETERMINISTIC ENGINE CHECKS ----
console.log("\n-- deterministic engine checks --");
{
  const { checkDepthWinsFixtures, checkSpecKeyYearIsolation } = await import("./crossProductCheck.js");
  const r = checkDepthWinsFixtures();
  record("depthWins fixtures", r.ok ? "PASS" : "FAIL", r.ok ? `${r.cases.length} cases` : JSON.stringify(r.cases.filter(c => !c.pass)));
  // specKeyFor year-isolation (Lane B job, Oct 2026, Part 2): pure, no DB - the regression guard for
  // the 42-vs-30-sales 2025 Porsche 911 drift (two different typed years silently sharing one
  // spec_market_cache row). Runs on every push, not just when a live sweep happens to probe it.
  const k = checkSpecKeyYearIsolation();
  record("specKeyFor year isolation (synthetic, no DB)", k.ok ? "PASS" : "FAIL", k.ok ? `${k.cases.length} cases` : JSON.stringify(k.cases.filter(c => !c.pass)));
  // Output gate + fence word fixtures (Lane B job, Oct 13 2026, Jobs 1 and 4): pure, no DB - the shapes the
  // live gate wrongly refused (Grand National, 275 GTB/4, CLK63 Black Series, M3 Coupe) must be accepted, a
  // swapped pool must still fail, and the hyphenated/spaced replica spellings must be fenced.
  const { checkOutputGateFixtures, checkFenceWordFixtures } = await import("./crossProductCheck.js");
  const g = checkOutputGateFixtures();
  record("output gate fixtures (synthetic, no DB)", g.ok ? "PASS" : "FAIL", g.ok ? `${g.cases.length} cases` : JSON.stringify(g.cases.filter(c => !c.pass)));
  const fw = checkFenceWordFixtures();
  record("replica fence words (synthetic, no DB)", fw.ok ? "PASS" : "FAIL", fw.ok ? `${fw.cases.length} cases` : JSON.stringify(fw.cases.filter(c => !c.pass)));
  // Refine key isolation (e49, Sam's item 13): pure, no DB - the applied body/trim/variant refine is in every cache key.
  const { checkRefineKeyIsolation } = await import("./crossProductCheck.js");
  const rk = checkRefineKeyIsolation();
  record("refine key isolation (synthetic, no DB)", rk.ok ? "PASS" : "FAIL", rk.ok ? `${rk.cases.length} cases` : JSON.stringify(rk.cases.filter(c => !c.pass)));
}
{
  // buildPoolSmoke (job 3 addendum): no DB, no network - synthetic rows through every real branch of
  // buildPool/buildResult. This is the check that would have caught the live "exactStep is not
  // defined" ReferenceError this round's own buildPool extraction shipped with (a destructure gap
  // `node --check` cannot see, since syntax checking never executes the function body, and a plain
  // module import cannot see either, since it never CALLS the function).
  try {
    execSync("node scripts/buildPoolSmoke.mjs", { encoding: "utf8" });
    record("buildPool/buildResult smoke (synthetic, no DB)", "PASS");
  } catch (e) {
    record("buildPool/buildResult smoke (synthetic, no DB)", "FAIL", String((e.stdout || "") + (e.stderr || "")).split("\n").filter(Boolean).slice(-3).join(" | "));
  }
}
{
  // offWindowCheck (Lane A, Oct 2026): no DB, no network - runs js/onebox.js's offWindowLabel and
  // api/buy.js's CLIENT drawerHtml (the actual shipped functions) in a vm sandbox against a stubbed
  // offWindow:true card, asserting both render identical text. Registered here per Lane A's request.
  try {
    execSync("node scripts/offWindowCheck.mjs", { encoding: "utf8" });
    record("off-window wording parity (synthetic, no DB)", "PASS");
  } catch (e) {
    record("off-window wording parity (synthetic, no DB)", "FAIL", String((e.stdout || "") + (e.stderr || "")).split("\n").filter(Boolean).slice(-3).join(" | "));
  }
}
{
  const { supabaseEnv } = await import("../lib/_supabase.js");
  const env = TIER === "fast" ? null : supabaseEnv();
  const noArchive = TIER === "fast" ? FAST_WHY : "SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set in this environment";
  if (!env) {
    record("representative invariants (archive)", "SKIP", noArchive);
    record("live-comparable fence check (archive)", "SKIP", noArchive);
    record("split-pool invariants (archive)", "SKIP", noArchive);
    record("live-listing disclosure (archive)", "SKIP", noArchive);
    record("63-spec cross-product sweep (archive)", "SKIP", noArchive);
  } else {
    const { checkRepresentativeInvariants, checkLiveComparableFences, checkSplitPoolInvariants, checkOverTimeInvariants, checkLiveListingDisclosure, runEngineCheck, DEFAULT_SPECS } = await import("./crossProductCheck.js");
    const rep = await checkRepresentativeInvariants(env).catch(e => ({ ok: false, error: String(e && e.message || e) }));
    record("representative invariants (archive)", rep.ok ? "PASS" : "FAIL", rep.ok ? "" : JSON.stringify(rep));
    const live = await checkLiveComparableFences(env).catch(e => ({ ok: false, error: String(e && e.message || e) }));
    record("live-comparable fence check (archive)", live.ok ? "PASS" : "FAIL", live.ok ? "" : JSON.stringify(live));
    const sp = await checkSplitPoolInvariants(env).catch(e => ({ ok: false, error: String(e && e.message || e) }));
    record("split-pool invariants (archive)", sp.ok ? "PASS" : "FAIL", sp.ok ? "" : JSON.stringify(sp));
    const lld = await checkLiveListingDisclosure(env).catch(e => ({ ok: false, error: String(e && e.message || e) }));
    record("live-listing disclosure (archive)", lld.ok ? "PASS" : "FAIL", lld.ok ? "" : JSON.stringify(lld));
    const ot = await checkOverTimeInvariants(env).catch(e => ({ ok: false, error: String(e && e.message || e) }));
    record("over-time invariants (archive)", ot.ok ? "PASS" : "FAIL", ot.ok ? "" : JSON.stringify(ot));
    // 63-spec cross-product sweep (Oct 2026, one-engine-entry-point job; STRICTENED Oct 2026,
    // one-pool-for-widened-years job): calls runEngineCheck directly against this env (no HTTP hop
    // through goasksam.com - same engine, same Supabase, just skipping the live ops endpoint so
    // this never depends on a deploy already being live). Runs all four lanes but skips the OTHER
    // sub-checks (already covered individually above) to keep this one call to its actual job.
    // GATE WIDENED: this used to filter on `lanesOk` alone (did each lane answer AT ALL), which is
    // blind to two lanes BOTH answering but DISAGREEING - confirmed live, the exact shape of the
    // 2017 Porsche 911 Carrera S Coupe mismatch Lane C found (Market Check "last twelve months"/
    // $95,500-$113,000 against Buy/Tasks "past 2 years"/$87,500-$95,500: every lane.ok was true,
    // so the old filter below would have reported this spec as clean). Now also fails on
    // `row.anyMismatch` (row.compare's per-field MISMATCH flags - label/low/high/count/latest/
    // recent/referenceFigure/window/poolYears, the last two added this pass specifically so a
    // window or year-span disagreement is caught even when low/high happen to sit inside the 10%
    // price tolerance, as this exact case's `low` values did). Sam's own instruction: "the gate
    // also compares the pool itself, not only lanesOk."
    const sweep = await runEngineCheck(env, DEFAULT_SPECS, { singlePick: false, buyPaths: false, liveFences: false, representative: false, splitPools: false, overTime: false }).catch(e => ({ error: String(e && e.message || e) }));
    if (sweep && sweep.error) {
      record("63-spec cross-product sweep (archive)", "FAIL", sweep.error);
    } else {
      const badLanes = (sweep.rows || []).filter(r => r.lanesOk && !Object.values(r.lanesOk).every(Boolean));
      const badMismatch = (sweep.rows || []).filter(r => r.anyMismatch && !badLanes.includes(r));
      const bad = [...badLanes, ...badMismatch];
      record("63-spec cross-product sweep (archive)", bad.length ? "FAIL" : "PASS",
        bad.length ? `${badLanes.length} with lanesOk:false, ${badMismatch.length} with a field mismatch (lanesOk all true): ${bad.map(r => r.q).join(" | ")}` : `${sweep.total} specs, 0 lanesOk:false, 0 field mismatches`);
    }
  }
}

// Analytics layer (Oct 2026, Lane C; docs/analytics-events.md): the event list, consent groups with simulated
// region headers, what is never stored, the store being down, ledger reconciliation, and the dashboard's 404 gate.
// A child process, because the check points the store at a closed local port on purpose. No database, no keys.
try {
  const out = execSync("node scripts/analyticsCheck.mjs", { encoding: "utf8" });
  record("analytics layer (scripts/analyticsCheck.mjs)", "PASS", (out.match(/analyticsCheck: .*/) || [""])[0]);
} catch (e) {
  record("analytics layer (scripts/analyticsCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}

// GA consent by country (Oct 17 2026, Lane C): EEA, UK and Switzerland load the tag with consent required, everywhere
// else loads it with no banner, crew and other hosts load nothing. The real handler with the country header. No network.
try {
  const out = execSync("node scripts/gaConsentCheck.mjs", { encoding: "utf8" });
  record("GA consent by country (scripts/gaConsentCheck.mjs)", "PASS", (out.match(/gaConsentCheck: .*/) || [""])[0]);
} catch (e) {
  record("GA consent by country (scripts/gaConsentCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Before it ends (Oct 12 2026, Lane C): a fixture day of quarter-hour send runs, no network; fails on any email
// dropped, doubled or sent outside the two hours.
try {
  const out = execSync("node scripts/beforeItEndsCheck.mjs", { encoding: "utf8" });
  record("before it ends fixture day (scripts/beforeItEndsCheck.mjs)", "PASS", (out.match(/beforeItEndsCheck: .*/) || [""])[0]);
} catch (e) {
  record("before it ends fixture day (scripts/beforeItEndsCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}

// Tasks read reductions (Oct 2026, Lane D): the same fixture day through the legacy io and the slim io must give the
// same emails, marks and report lines, and the slim io must read only the people due and the cars inside the window.
try {
  const out = execSync("node scripts/tasksReadsCheck.mjs", { encoding: "utf8" });
  record("tasks read reductions (scripts/tasksReadsCheck.mjs)", "PASS", (out.match(/tasksReadsCheck: .*/) || [""])[0]);
} catch (e) {
  record("tasks read reductions (scripts/tasksReadsCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}

// The engine's fallback rung (Oct 2026, Lane C): Lane B's new fields faked on fixtures through the real Buy, Task door
// and Task email renderers; fails if a fields-absent render changes or a rung line breaks a copy rule. No network.
try {
  const out = execSync("node scripts/rungCheck.mjs", { encoding: "utf8" });
  record("fallback rung fixtures (scripts/rungCheck.mjs)", "PASS", (out.match(/rungCheck: .*/) || [""])[0]);
} catch (e) {
  record("fallback rung fixtures (scripts/rungCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// One car for one name on every lane (Oct 2026, Lane B2): the same words through Market Check's resolver and Buy/Tasks'
// resolveForBuy must give the same car, with its casing and hyphens. No vendor request.
try {
  const out = execSync("node scripts/resolverLanesCheck.mjs && node scripts/resolverOfflineCheck.mjs && node scripts/resolverHangCheck.mjs", { encoding: "utf8" });
  record("one car per name on every lane (scripts/resolverLanesCheck.mjs)", "PASS", (out.match(/resolverLanesCheck: .*/) || [""])[0] + " | " + (out.match(/resolverOfflineCheck: .*/) || [""])[0]);
} catch (e) {
  record("one car per name on every lane (scripts/resolverLanesCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// The attempts pull's stop-at-known-page rule on a recorded page set (Oct 2026, Lane B2). No network, no vendor request.
try {
  const out = execSync("node scripts/attemptsWalkCheck.mjs", { encoding: "utf8" });
  record("attempts pull stop rule (scripts/attemptsWalkCheck.mjs)", "PASS", (out.match(/attemptsWalkCheck: .*/) || [""])[0]);
} catch (e) {
  record("attempts pull stop rule (scripts/attemptsWalkCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Who started each pull (Oct 2026, Lane C): started_by on the pull job's rows and every ocd_call row, and the report's
// split. No network, no vendor request.
try {
  const out = execSync("node scripts/pullStarterCheck.mjs", { encoding: "utf8" });
  record("pull starter (scripts/pullStarterCheck.mjs)", "PASS", (out.match(/pullStarterCheck: .*/) || [""])[0]);
} catch (e) {
  record("pull starter (scripts/pullStarterCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Partner premium freshness (Oct 2026, Lane C): the premiumfresh read, the /admin line, and the nightly premium step's
// readable failure with the key kept off curl's command line. No network.
try {
  const out = execSync("node scripts/premiumFreshCheck.mjs", { encoding: "utf8" });
  record("premium freshness (scripts/premiumFreshCheck.mjs)", "PASS", (out.match(/premiumFreshCheck: .*/) || [""])[0]);
} catch (e) {
  record("premium freshness (scripts/premiumFreshCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// The Sell pick card's venue line (Oct 2026, Lane C, lib/sell/sellFlow.js pickFacts). No network.
try {
  const out = execSync("node scripts/sellVenueLineCheck.mjs", { encoding: "utf8" });
  record("Sell venue line (scripts/sellVenueLineCheck.mjs)", "PASS", (out.match(/sellVenueLineCheck: .*/) || [""])[0]);
} catch (e) {
  record("Sell venue line (scripts/sellVenueLineCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// The Sell day-of-week tile (Oct 2026, Lane B2, lib/sell/sellFacts.js dayBuckets + sellFlow.js dayTile). No network.
try {
  const out = execSync("node scripts/sellDayTileCheck.mjs", { encoding: "utf8" });
  record("Sell day tile (scripts/sellDayTileCheck.mjs)", "PASS", (out.match(/sellDayTileCheck: .*/) || [""])[0]);
} catch (e) {
  record("Sell day tile (scripts/sellDayTileCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Task filters carry the car as typed (Oct 2026, Lane C, lib/tasks/tasks.js typedCar). No network.
try {
  const out = execSync("node scripts/taskFiltersCheck.mjs", { encoding: "utf8" });
  record("Task filters carry the typed car (scripts/taskFiltersCheck.mjs)", "PASS", (out.match(/taskFiltersCheck: .*/) || [""])[0]);
} catch (e) {
  record("Task filters carry the typed car (scripts/taskFiltersCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// The page after a Task is stopped from its email (Oct 2026, Lane C): the second line only when it is true. No network.
try {
  const out = execSync("node scripts/taskStopCheck.mjs", { encoding: "utf8" });
  record("Task stopped page + Tasks probe key (scripts/taskStopCheck.mjs)", "PASS", (out.match(/taskStopCheck: .*/) || [""])[0]);
} catch (e) {
  record("Task stopped page + Tasks probe key (scripts/taskStopCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Task emails go to the sign-in address only, and no banned word reaches one (Oct 2026, Lane C). No network.
try {
  const out = execSync("node scripts/emailWordsCheck.mjs", { encoding: "utf8" });
  record("Task email delivery + words (scripts/emailWordsCheck.mjs)", "PASS", (out.match(/emailWordsCheck: .*/) || [""])[0]);
} catch (e) {
  record("Task email delivery + words (scripts/emailWordsCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// No key in an address: header only on pullLive, refreshSpecLiveCounts, photocheck, the dashboard, alerts=run. No network.
try {
  const out = execSync("node scripts/keyInAddressCheck.mjs", { encoding: "utf8" });
  record("Keys in the header only (scripts/keyInAddressCheck.mjs)", "PASS", (out.match(/keyInAddressCheck: .*/) || [""])[0]);
} catch (e) {
  record("Keys in the header only (scripts/keyInAddressCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Tester access: env code, mandatory expiry, signed cookie, no written-in code (Oct 2026, Lane C). No network.
try {
  const out = execSync("node scripts/testerCheck.mjs", { encoding: "utf8" });
  record("Tester cookie signed (scripts/testerCheck.mjs)", "PASS", (out.match(/testerCheck: .*/) || [""])[0]);
} catch (e) {
  record("Tester cookie signed (scripts/testerCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Thin cards never print a range (e62, Sam): a thin answer carries the exact lowest and highest sale as data, and the
// shared card must not show them as "lowest to highest". No network.
try {
  const out = execSync("node scripts/thinCardNoRange.mjs", { encoding: "utf8" });
  record("thin card shows no range (scripts/thinCardNoRange.mjs)", "PASS", (out.match(/thinCardNoRange: .*/) || [""])[0]);
} catch (e) {
  record("thin card shows no range (scripts/thinCardNoRange.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// The Buy card's sold-prices sentence prints the engine's own thin line (e66, Lane C's live find, Sam's rule): "not
// enough" wording only under few_sales. No network.
try {
  const out = execSync("node scripts/thinSoldLine.mjs", { encoding: "utf8" });
  record("Buy card thin line is the engine's (scripts/thinSoldLine.mjs)", "PASS", (out.match(/thinSoldLine: .*/) || [""])[0]);
} catch (e) {
  record("Buy card thin line is the engine's (scripts/thinSoldLine.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Buy's card and its one question (Oct 14 2026, Lane C): the question rule on three fixtures, the no-question case, spec
// chips left out when the listing doesn't state them, both Sam lines when the car has a history, the Task from the page's
// spec. No network.
try {
  const out = execSync("node scripts/buyCardAskCheck.mjs", { encoding: "utf8" });
  record("Buy card and question rule (scripts/buyCardAskCheck.mjs)", "PASS", (out.match(/buyCardAskCheck: .*/) || [""])[0]);
} catch (e) {
  record("Buy card and question rule (scripts/buyCardAskCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Set-aside sales (Lane C, Oct 15 2026): labelled with the engine's reason, never placed against the range, in the sold
// Task email, Buy's prior-sale popup and an ended car's card. No network.
try {
  const out = execSync("node scripts/setAsideCheck.mjs", { encoding: "utf8" });
  record("Set-aside sales labelled, never placed (scripts/setAsideCheck.mjs)", "PASS", (out.match(/setAsideCheck: .*/) || [""])[0]);
} catch (e) {
  record("Set-aside sales labelled, never placed (scripts/setAsideCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Shared "What these sell for" card (Lane A, Oct 16 2026): every piece from the engine's own answer,
// the house-steered thin shape (answer.thin.*) never read directly, client/server byte-identical. No network.
try {
  const out = execSync("node scripts/sellsForCardCheck.mjs", { encoding: "utf8" });
  record("Shared sells-for card (scripts/sellsForCardCheck.mjs)", "PASS", (out.match(/sellsForCardCheck: .*/) || [""])[0]);
} catch (e) {
  record("Shared sells-for card (scripts/sellsForCardCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// No page-written thin wording (Lane C, Oct 19 2026, Sam): the engine's line and latest sale, drawn by the shared card, are
// the only explanation under a thin card and on the refusals. No network.
try {
  const out = execSync("node scripts/thinWordsCheck.mjs", { encoding: "utf8" });
  record("No page-written thin wording (scripts/thinWordsCheck.mjs)", "PASS", (out.match(/thinWordsCheck: .*/) || [""])[0]);
} catch (e) {
  record("No page-written thin wording (scripts/thinWordsCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Sell asks the engine's question first (Lane C, Oct 19 2026, Sam's rule): a bare "1965 Ford Mustang" asks the body, as
// Market Check does, before any range. No network.
try {
  const out = execSync("node scripts/sellQuestionCheck.mjs", { encoding: "utf8" });
  record("Sell asks the engine's question first (scripts/sellQuestionCheck.mjs)", "PASS", (out.match(/sellQuestionCheck: .*/) || [""])[0]);
} catch (e) {
  record("Sell asks the engine's question first (scripts/sellQuestionCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// A builder car is never compared on Sell (Lane C, Oct 19 2026, Sam's Singer rule, e68): the engine's line alone. No network.
try {
  const out = execSync("node scripts/sellBuilderCheck.mjs", { encoding: "utf8" });
  record("Sell shows a builder car's refusal alone (scripts/sellBuilderCheck.mjs)", "PASS", (out.match(/sellBuilderCheck: .*/) || [""])[0]);
} catch (e) {
  record("Sell shows a builder car's refusal alone (scripts/sellBuilderCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Sell on a refusal (Lane C, Oct 19 2026, Sam): every refusal kind and a thin answer draw only the engine's own card;
// a normal range answer is unchanged. No network.
try {
  const out = execSync("node scripts/sellRefusalCheck.mjs", { encoding: "utf8" });
  record("Sell shows the engine's own card on a refusal (scripts/sellRefusalCheck.mjs)", "PASS", (out.match(/sellRefusalCheck: .*/) || [""])[0]);
} catch (e) {
  record("Sell shows the engine's own card on a refusal (scripts/sellRefusalCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// The partner demo's listing frame and reads (Lane C, Oct 19 2026, Sam's demo orders): the six sample cars' frame, the
// sample price inside the engine's range, one read per page, photos at a width. Local browser, fixture answers.
try {
  const out = execSync("node scripts/demoFrameCheck.mjs", { encoding: "utf8" });
  record("Partner demo sample listing frame (scripts/demoFrameCheck.mjs)", "PASS", (out.match(/demoFrameCheck: .*/) || [""])[0]);
} catch (e) {
  record("Partner demo sample listing frame (scripts/demoFrameCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// FIX 2, the demo's stored answer first (Lane C, Oct 19 2026, Sam's demo speed order): current version, under a day, after the last ingest. No network.
try {
  const out = execSync("node scripts/demoStoredCheck.mjs", { encoding: "utf8" });
  record("The demo serves only a current stored answer first (scripts/demoStoredCheck.mjs)", "PASS", (out.match(/demoStoredCheck: .*/) || [""])[0]);
} catch (e) {
  record("The demo serves only a current stored answer first (scripts/demoStoredCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Sell sends the visitor's own words to the one engine (e69, Lane C, Oct 19 2026, Sam approved). No network.
try {
  const out = execSync("node scripts/sellTypedCheck.mjs", { encoding: "utf8" });
  record("Sell reads the visitor's own words (scripts/sellTypedCheck.mjs)", "PASS", (out.match(/sellTypedCheck: .*/) || [""])[0]);
} catch (e) {
  record("Sell reads the visitor's own words (scripts/sellTypedCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// A Singer car is never compared in a Task email (Lane C, Oct 19 2026, Sam's Singer rule): the mark kept, the engine's
// line only, a plain Task unchanged. No network.
try {
  const out = execSync("node scripts/taskSingerCheck.mjs", { encoding: "utf8" });
  record("A Task email never compares a Singer car (scripts/taskSingerCheck.mjs)", "PASS", (out.match(/taskSingerCheck: .*/) || [""])[0]);
} catch (e) {
  record("A Task email never compares a Singer car (scripts/taskSingerCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// A thin Buy card shows its sales (Lane C, Oct 19 2026, Sam's rule): the engine's own rows when the engine flags cardListsSales; no rows on a range card. No network.
try {
  const out = execSync("node scripts/buyRowsCheck.mjs", { encoding: "utf8" });
  record("A thin Buy card lists its sales (scripts/buyRowsCheck.mjs)", "PASS", (out.match(/buyRowsCheck: .*/) || [""])[0]);
} catch (e) {
  record("A thin Buy card lists its sales (scripts/buyRowsCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Buy redesign Stage 1, the card (Lane C, Oct 19 2026, Sam's order): a labelled money figure, one meta line, no VIN pill, no keep pill, the order. No network.
try {
  const out = execSync("node scripts/buyStage1Check.mjs", { encoding: "utf8" });
  record("Buy redesign Stage 1 card markup (scripts/buyStage1Check.mjs)", "PASS", (out.match(/buyStage1Check: .*/) || [""])[0]);
} catch (e) {
  record("Buy redesign Stage 1 card markup (scripts/buyStage1Check.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// the search said once, N live matches, removable constraint chips, no permanent widening pills, editable search text
try {
  const out = execSync("node scripts/buyStage2Check.mjs", { encoding: "utf8" });
  record("Buy Stage 2 search state (scripts/buyStage2Check.mjs)", "PASS", (out.match(/buyStage2Check: .*/) || [""])[0]);
} catch (e) {
  record("Buy Stage 2 search state (scripts/buyStage2Check.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// A hub slug never carries a leading or doubled dash (Lane C, Oct 19 2026, Lane E's audit). No network.
try {
  const out = execSync("node scripts/hubSlugCheck.mjs", { encoding: "utf8" });
  record("A hub slug never carries a leading dash (scripts/hubSlugCheck.mjs)", "PASS", (out.match(/hubSlugCheck: .*/) || [""])[0]);
} catch (e) {
  record("A hub slug never carries a leading dash (scripts/hubSlugCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// A car page links its model and year hubs only when the hub has a car on it (drop only; Lane C, Oct 19 2026). No network.
try {
  const out = execSync("node scripts/hubLinkCheck.mjs", { encoding: "utf8" });
  record("Car pages link only hubs that exist (scripts/hubLinkCheck.mjs)", "PASS", (out.match(/hubLinkCheck: .*/) || [""])[0]);
} catch (e) {
  record("Car pages link only hubs that exist (scripts/hubLinkCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Buy Stage 1c (Sam's review, Oct 20 2026; Lane C): history once in the Sam area, compact no-range cards, the grid. No network.
try {
  const out = execSync("node scripts/buyStage1cCheck.mjs", { encoding: "utf8" });
  record("Buy Stage 1c (scripts/buyStage1cCheck.mjs)", "PASS", (out.match(/buyStage1cCheck: .*/) || [""])[0]);
} catch (e) {
  record("Buy Stage 1c (scripts/buyStage1cCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// The palette picker is for the crew only (Sam, Buy Stage 1c item 8a; Lane C). No network.
try {
  const out = execSync("node scripts/paletteCrewOnlyCheck.mjs", { encoding: "utf8" });
  record("The palette picker is crew only (scripts/paletteCrewOnlyCheck.mjs)", "PASS", (out.match(/paletteCrewOnlyCheck: .*/) || [""])[0]);
} catch (e) {
  record("The palette picker is crew only (scripts/paletteCrewOnlyCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// The narrowing question by set size and the hierarchy first (Lane E, Buy Stage 1c item 2). No network.
try {
  const out = execSync("node scripts/narrowCheck.mjs", { encoding: "utf8" });
  record("Buy narrowing by set size (scripts/narrowCheck.mjs)", "PASS", (out.match(/narrowCheck: .*/) || [""])[0]);
} catch (e) {
  record("Buy narrowing by set size (scripts/narrowCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// A listing's gearbox read by gearboxOf (Lane E, Buy Stage 1c item 3). No network.
try {
  const out = execSync("node scripts/gearboxCheck.mjs", { encoding: "utf8" });
  record("A listing's gearbox read (scripts/gearboxCheck.mjs)", "PASS", (out.match(/gearboxCheck: .*/) || [""])[0]);
} catch (e) {
  record("A listing's gearbox read (scripts/gearboxCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Keep Looking's sentence trimmed and the Before it ends email's last bid seen line (Sam's decision 8; Lane C). No network.
try {
  const out = execSync("node scripts/keepLookingLineCheck.mjs", { encoding: "utf8" });
  record("Keep Looking sentence and the email's bid line (scripts/keepLookingLineCheck.mjs)", "PASS", (out.match(/keepLookingLineCheck: .*/) || [""])[0]);
} catch (e) {
  record("Keep Looking sentence and the email's bid line (scripts/keepLookingLineCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// hubLeadCheck (Lane C). No network.
try {
  const out = execSync("node scripts/hubLeadCheck.mjs", { encoding: "utf8" });
  record("hubLeadCheck (scripts/hubLeadCheck.mjs)", "PASS", (out.match(/hubLeadCheck: .*/) || [""])[0]);
} catch (e) {
  record("hubLeadCheck (scripts/hubLeadCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// hubDashRedirectCheck (Lane C). No network.
try {
  const out = execSync("node scripts/hubDashRedirectCheck.mjs", { encoding: "utf8" });
  record("hubDashRedirectCheck (scripts/hubDashRedirectCheck.mjs)", "PASS", (out.match(/hubDashRedirectCheck: .*/) || [""])[0]);
} catch (e) {
  record("hubDashRedirectCheck (scripts/hubDashRedirectCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// A leading, trailing or doubled dash in a /history slug 301s to the same page at its tidy address (Sam's decision 3; Lane C). No network.
try {
  const out = execSync("node scripts/hubDashRedirectCheck.mjs", { encoding: "utf8" });
  record("Dashed hub address 301s to the tidy one (scripts/hubDashRedirectCheck.mjs)", "PASS", (out.match(/hubDashRedirectCheck: .*/) || [""])[0]);
} catch (e) {
  record("Dashed hub address 301s to the tidy one (scripts/hubDashRedirectCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// partnerDemoInertCheck (Lane E, Buy Stage 1c). No network.
try {
  const out = execSync("node scripts/partnerDemoInertCheck.mjs", { encoding: "utf8" });
  record("partnerDemoInertCheck (scripts/partnerDemoInertCheck.mjs)", "PASS", (out.match(/partnerDemoInertCheck: .*/) || [""])[0]);
} catch (e) {
  record("partnerDemoInertCheck (scripts/partnerDemoInertCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// The Amazon Autos pilot scope, Sam's approved rules (a) 25 years or older, (b) the makes, (c) the models (Lane C). No network.
try {
  const out = execSync("node scripts/amazonScopeCheck.mjs", { encoding: "utf8" });
  record("The Amazon pilot scope (scripts/amazonScopeCheck.mjs)", "PASS", (out.match(/amazonScopeCheck: .*/) || [""])[0]);
} catch (e) {
  record("The Amazon pilot scope (scripts/amazonScopeCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// buyComposerClientCheck (Lane C). No network.
try {
  const out = execSync("node scripts/buyComposerClientCheck.mjs", { encoding: "utf8" });
  record("buyComposerClientCheck (scripts/buyComposerClientCheck.mjs)", "PASS", (out.match(/buyComposerClientCheck: .*/) || [""])[0]);
} catch (e) {
  record("buyComposerClientCheck (scripts/buyComposerClientCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// buySearchLineCycleCheck (Lane C). No network.
try {
  const out = execSync("node scripts/buySearchLineCycleCheck.mjs", { encoding: "utf8" });
  record("buySearchLineCycleCheck (scripts/buySearchLineCycleCheck.mjs)", "PASS", (out.match(/buySearchLineCycleCheck: .*/) || [""])[0]);
} catch (e) {
  record("buySearchLineCycleCheck (scripts/buySearchLineCycleCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Prior listings (Lane C, Oct 15 2026): "sold before" only when an earlier listing of the same car sold. No network.
try {
  const out = execSync("node scripts/priorListingCheck.mjs", { encoding: "utf8" });
  record("Prior listings say sold only when one sold (scripts/priorListingCheck.mjs)", "PASS", (out.match(/priorListingCheck: .*/) || [""])[0]);
} catch (e) {
  record("Prior listings say sold only when one sold (scripts/priorListingCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// The Buy box and voice button (Lane C, Oct 15 2026): mic works on iPhone, box clears after a search. No network.
try {
  const out = execSync("node scripts/buyBoxCheck.mjs", { encoding: "utf8" });
  record("Buy box clears and the mic answers one tap (scripts/buyBoxCheck.mjs)", "PASS", (out.match(/buyBoxCheck: .*/) || [""])[0]);
} catch (e) {
  record("Buy box clears and the mic answers one tap (scripts/buyBoxCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/buyNameBodyCheck.mjs", { encoding: "utf8" });
  record("A Buy card names its body (every resolver body word reads back as the same pool) (scripts/buyNameBodyCheck.mjs)", "PASS", (out.match(/buyNameBodyCheck: .*/) || [""])[0]);
} catch (e) {
  record("A Buy card names its body (every resolver body word reads back as the same pool) (scripts/buyNameBodyCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// The partner demo (Lane C, Oct 15 2026): api/partnerAnswer.js gives Market Check's range, count, window and sales for
// the same car, with no venue, link, title or listing id. The fixed answers run always; the five live cars only when
// GAS_CREW_COOKIE is set, and are reported as SKIP otherwise, never as a pass.
try {
  const out = execSync("node scripts/partnerEngineMatch.mjs", { encoding: "utf8" });
  const line = (out.match(/partnerEngineMatch: .*/) || [""])[0];
  record("Partner endpoint matches Market Check, no venues (scripts/partnerEngineMatch.mjs)", "PASS", line);
  if (/live part skipped/.test(line)) record("Partner endpoint, the five live cars", "SKIP", "GAS_CREW_COOKIE not set in this environment");
} catch (e) {
  record("Partner endpoint matches Market Check, no venues (scripts/partnerEngineMatch.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// The partner demo's own access code (Lane C, Oct 16 2026; lib/_partnerAccess.js). No network.
try {
  const out = execSync("node scripts/partnerAccessCheck.mjs", { encoding: "utf8" });
  const line = (out.match(/partnerAccessCheck: .*/) || [""])[0];
  record("The partner demo code opens the demo and its data endpoint only (scripts/partnerAccessCheck.mjs)", "PASS", line);
} catch (e) {
  record("The partner demo code opens the demo and its data endpoint only (scripts/partnerAccessCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// The demo's sale photo proxy (Lane C, Oct 18 2026; lib/_salePhoto.js): an id only, a public https image only, same-host
// redirects, size and type caps, no address or venue header, behind the demo gate. No network.
try {
  const out = execSync("node scripts/salePhotoCheck.mjs", { encoding: "utf8" });
  const line = (out.match(/salePhotoCheck: .*/) || [""])[0];
  record("The demo's sale photo takes an id only and never shows where it came from (scripts/salePhotoCheck.mjs)", "PASS", line);
} catch (e) {
  record("The demo's sale photo takes an id only and never shows where it came from (scripts/salePhotoCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// The applied choice (Lane C, Oct 15 2026): a Task from a Buy page names the body the engine applied. No network.
try {
  const out = execSync("node scripts/engineChoiceCheck.mjs", { encoding: "utf8" });
  record("Task from Buy reads the applied choice (scripts/engineChoiceCheck.mjs)", "PASS", (out.match(/engineChoiceCheck: .*/) || [""])[0]);
} catch (e) {
  record("Task from Buy reads the applied choice (scripts/engineChoiceCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}

if (TIER === "fast") {
  record("browser check (pushCheck.mjs)", "SKIP", FAST_WHY);
  console.log("\n-- golden truth: not run in the fast tier (it reads the archive) --");
  // The search check (scripts/searchCheck.js, docs/search-rules.md): titles, H1s, lead sentences and canonicals on the
  // live public pages, REPORT-ONLY here (it reads the live site, not the code being pushed).
  // A plain fetch gets Vercel's bot challenge (HTTP 429) unless the automation bypass secret is in the environment, so
  // without it the same rules run from a real browser (scripts/searchCheckBrowser.mjs), which is never challenged.
  const sc = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ? "scripts/searchCheck.js --report" : "scripts/searchCheckBrowser.mjs";
  console.log(`\n-- search check, report-only (${sc}) --`);
  try { console.log(execSync("node " + sc, { encoding: "utf8", timeout: 240000 }).trim().split("\n").slice(-14).join("\n")); }
  catch (e) { console.log(String((e.stdout || "") + (e.stderr || "")).trim().slice(-1200) || "searchCheck did not complete (report-only, not blocking)."); }
} else {
// ---- 3 & 4. BROWSER CHECK (Lane C's pushCheck.mjs) + BASELINE ----
console.log(`\n-- browser check via scripts/pushCheck.mjs (${BASE}) --`);
let browserOutput = "";
let browserExit = 0;
try {
  browserOutput = execSync(`node scripts/pushCheck.mjs --base ${BASE}`, { encoding: "utf8" });
} catch (e) {
  browserExit = e.status || 1;
  browserOutput = (e.stdout || "") + (e.stderr || "");
}
console.log(browserOutput.trim());
if (browserExit === 0) {
  record("browser check (pushCheck.mjs)", "PASS");
} else {
  const unmatched = [];
  for (const line of browserOutput.split("\n")) {
    if (!/^\s{6}/.test(line)) continue; // pushCheck indents 5xx/console/page-error lines with 6 spaces
    const onBaseline = BASELINE_FAILURES.some(b => line.includes(b.match));
    if (onBaseline) console.log(`      ^ BASELINE (known): ${BASELINE_FAILURES.find(b => line.includes(b.match)).reason}`);
    else unmatched.push(line.trim());
  }
  if (unmatched.length) record("browser check (pushCheck.mjs)", "FAIL", `${unmatched.length} failure(s) not on the baseline: ${unmatched.join(" | ")}`);
  else record("browser check (pushCheck.mjs)", "PASS", "only baseline (known, pre-existing) failures seen");
}

// ---- 5. GOLDEN TRUTH (Lane B2, Oct 2026): REPORT-ONLY. Printed, never blocking, never recorded as a PASS or FAIL. ----
// Compares the four product paths to the hand-derived answers in docs/golden-rules.md (quick subset: 3 cars, about 3 minutes). Needs
// PROBE_KEY in the environment (it SKIPs itself without one). Run the full 20 with `node scripts/goldenTruth.mjs`.
console.log("\n-- golden truth, report-only (scripts/goldenTruth.mjs --quick) --");
try {
  console.log(execSync("node scripts/goldenTruth.mjs --quick", { encoding: "utf8", timeout: 420000 }).trim());
} catch (e) {
  console.log(String((e.stdout || "") + (e.stderr || "")).trim().slice(-1500) || "goldenTruth did not complete (report-only, not blocking).");
}

}
// ---- 6. IDENTITY PAGES ON THE CODE BEING PUSHED (Sam, Oct 15 2026, after the e53 blank pages): BLOCKING, LOCAL. ----
// scripts/identityLocalCheck.mjs runs the pushed code (buildResult, the body options, every option's own page, and the
// output gate the shared entry applies) on synthetic sold rows, with no network and no database, so it can never fail
// on a bug the push itself fixes or pass on a bug the push introduces. Fails on an empty answer, a missing count, a gate
// refusal, an option opening a different count, a zero-count option, or options that do not sum to Any. The live-site
// version of this check (scripts/identityPagesProof.mjs, the public API) runs in the post-deploy chain only.
console.log("\n-- identity pages on the code being pushed (scripts/identityLocalCheck.mjs, no network) --");
{
  let idOut = "", idExit = 0;
  try { idOut = execSync("node scripts/identityLocalCheck.mjs", { encoding: "utf8", timeout: 120000 }); }
  catch (e) { idExit = e.status || 1; idOut = (e.stdout || "") + (e.stderr || ""); }
  console.log(idOut.trim());
  if (idExit === 0) record("identity pages on the pushed code (synthetic, no DB)", "PASS");
  else record("identity pages on the pushed code (synthetic, no DB)", "FAIL", (idOut.split("\n").filter(l => /^(FAIL|      )/.test(l)).join(" | ") || "identityLocalCheck exited " + idExit).slice(0, 600));
}

// ---- summary ----
console.log("\n=== SUMMARY ===");
const fails = results.filter(r => r.status === "FAIL");
const skips = results.filter(r => r.status === "SKIP");
for (const r of results) console.log(`${r.status.padEnd(4)}  ${r.name}`);
console.log(`\nTier: ${TIER.toUpperCase()}${touched && touched.length ? " (engine-and-data files changed)" : TIER === "fast" ? " (no engine-and-data file changed)" : ""}`);
console.log(`${fails.length} FAIL, ${skips.length} SKIP, ${results.length - fails.length - skips.length} PASS`);
if (skips.length) console.log("SKIPPED checks are not a pass - state them plainly in the push report, per docs/lane-notes.md PREPUSH RULE.");
if (BASELINE_FAILURES.length) console.log(`${BASELINE_FAILURES.length} baseline (known, pre-existing) failure(s) tracked - see the list at the top of this file.`);
process.exit(fails.length ? 1 : 0);
