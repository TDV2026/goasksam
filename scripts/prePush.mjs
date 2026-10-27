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
  const tracked = execSync("git diff --name-only --diff-filter=d origin/main...HEAD", { encoding: "utf8" })     /* --diff-filter=d: a deleted file cannot be loaded; the deleted-file check just below covers it (Oct 25 2026) */.trim().split("\n").filter(Boolean);
  changed = [...new Set(tracked)].filter(f => /^(lib|api)\/.*\.m?js$/.test(f));
} catch (e) {
  record("module load: diff against origin/main", "FAIL", String(e && e.message || e).split("\n")[0]);
}
// A DELETED lib/api file cannot be loaded, so it is not skipped quietly: it passes only when NOTHING left in lib, api, scripts or public still names it
// (a real missing import must never hide behind a deletion; Oct 25 2026, after the temporary experiment endpoint was removed).
try {
  const gone = execSync("git diff --name-only --diff-filter=D origin/main...HEAD", { encoding: "utf8" }).trim().split("\n").filter(f => /^(lib|api)\/.*\.m?js$/.test(f));
  for (const f of gone) {
    const base = f.split("/").pop();
    let users = []; try { users = execSync(`git grep -l -F -- ${JSON.stringify(base)} -- lib api scripts public`, { encoding: "utf8" }).trim().split("\n").filter(Boolean); } catch (e) { users = []; }
    record(`deleted file ${f}`, users.length ? "FAIL" : "PASS", users.length ? "still named in: " + users.slice(0, 4).join(", ") : "nothing references it any more");
  }
} catch (e) { record("deleted files", "FAIL", String(e && e.message || e).split("\n")[0]); }
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

// Launch dashboard (Oct 26 2026, Lane D): the new events log without personal data and never block, the Launch tab's numbers on a known
// fixture, the real /admin script in headless Chrome at 1440 and 390 with no sideways scroll, and /admin's 404 for anyone not allowed. No database, no keys.
try {
  const out = execSync("node scripts/launchDashCheck.mjs", { encoding: "utf8" });
  record("launch dashboard (scripts/launchDashCheck.mjs)", "PASS", (out.match(/launchDashCheck: .*/) || [""])[0]);
} catch (e) {
  record("launch dashboard (scripts/launchDashCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}

// Route limits (Oct 27 2026, Lane D): every api route that reads the database or calls the model has an address limit or a listed,
// verifiable reason; /api/history, /api/vehicleIdentity and /o/<id> refuse over the limit without a query and fail open. No database, no keys.
try {
  const out = execSync("node scripts/routeLimitCheck.mjs", { encoding: "utf8" });
  record("route limits (scripts/routeLimitCheck.mjs)", "PASS", (out.match(/routeLimitCheck: .*/) || [""])[0]);
} catch (e) {
  record("route limits (scripts/routeLimitCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}

// Cache headers (Oct 27 2026, Lane D): every HTML page route sets a shared cache or is listed as gated; /api/history and /o/<id> keep a repeat crawler hit off the engine. No database, no keys.
try {
  const out = execSync("node scripts/cacheHeaderCheck.mjs", { encoding: "utf8" });
  record("cache headers (scripts/cacheHeaderCheck.mjs)", "PASS", (out.match(/cacheHeaderCheck: .*/) || [""])[0]);
} catch (e) {
  record("cache headers (scripts/cacheHeaderCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
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
try {
  const out = execSync("node scripts/watchBidLineCheck.mjs", { encoding: "utf8" });
  record("VIN-watch email bid line (scripts/watchBidLineCheck.mjs)", "PASS", (out.match(/watchBidLineCheck: .*/) || [""])[0]);
} catch (e) {
  record("VIN-watch email bid line (scripts/watchBidLineCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/digestBidLineCheck.mjs", { encoding: "utf8" });
  record("Tasks digest bid lines (scripts/digestBidLineCheck.mjs)", "PASS", (out.match(/digestBidLineCheck: .*/) || [""])[0]);
} catch (e) {
  record("Tasks digest bid lines (scripts/digestBidLineCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
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
try {
  const out = execSync("node scripts/sellWeekdayCheck.mjs", { encoding: "utf8" });
  record("/sell states no price-median weekday (scripts/sellWeekdayCheck.mjs)", "PASS", (out.match(/sellWeekdayCheck: .*/) || [""])[0]);
} catch (e) {
  record("/sell states no price-median weekday (scripts/sellWeekdayCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/sellThinLineCheck.mjs", { encoding: "utf8" });
  record("/sell thin sentence, Sam's wording, no buyers (scripts/sellThinLineCheck.mjs)", "PASS", (out.match(/sellThinLineCheck: .*/) || [""])[0]);
} catch (e) {
  record("/sell thin sentence, Sam's wording, no buyers (scripts/sellThinLineCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/sellBestDayCheck.mjs", { encoding: "utf8" });
  record("/sell best-day line, Sam's wording, 10 per side (scripts/sellBestDayCheck.mjs)", "PASS", (out.match(/sellBestDayCheck: .*/) || [""])[0]);
} catch (e) {
  record("/sell best-day line, Sam's wording, 10 per side (scripts/sellBestDayCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/sellVoiceCheck.mjs", { encoding: "utf8" });
  record("/sell has no first-person Sam (scripts/sellVoiceCheck.mjs)", "PASS", (out.match(/sellVoiceCheck: .*/) || [""])[0]);
} catch (e) {
  record("/sell has no first-person Sam (scripts/sellVoiceCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/sellReserveLineCheck.mjs", { encoding: "utf8" });
  record("/sell reserve line, never a dollar figure (scripts/sellReserveLineCheck.mjs)", "PASS", (out.match(/sellReserveLineCheck: .*/) || [""])[0]);
} catch (e) {
  record("/sell reserve line, never a dollar figure (scripts/sellReserveLineCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/sellValueFloorCheck.mjs", { encoding: "utf8" });
  record("/sell value-floor note, no fee-value or money claim (scripts/sellValueFloorCheck.mjs)", "PASS", (out.match(/sellValueFloorCheck: .*/) || [""])[0]);
} catch (e) {
  record("/sell value-floor note, no fee-value or money claim (scripts/sellValueFloorCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/leadHardeningCheck.mjs", { encoding: "utf8" });
  record("lead endpoints hardened: ceiling, honeypot, reference, add-details, links (scripts/leadHardeningCheck.mjs)", "PASS", (out.match(/leadHardeningCheck: .*/) || [""])[0]);
} catch (e) {
  record("lead endpoints hardened: ceiling, honeypot, reference, add-details, links (scripts/leadHardeningCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/authPrefillCheck.mjs", { encoding: "utf8" });
  record("sign-in card never writes a URL value into HTML (scripts/authPrefillCheck.mjs)", /SKIP/.test(out) ? "SKIP" : "PASS", (out.match(/authPrefillCheck: .*/) || [""])[0]);
} catch (e) {
  record("sign-in card never writes a URL value into HTML (scripts/authPrefillCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/crewBhsCheck.mjs", { encoding: "utf8" });
  record("?bhs= mints no session; crew and tester paths unchanged (scripts/crewBhsCheck.mjs)", "PASS", (out.match(/crewBhsCheck: .*/) || [""])[0]);
} catch (e) {
  record("?bhs= mints no session; crew and tester paths unchanged (scripts/crewBhsCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// lint:cards (CLAUDE.md names it an authoritative gate): the /sell card copy and composition suites, offline.
try { execSync("npm run -s lint:cards", { encoding: "utf8", stdio: "pipe" }); record("lint:cards (cardV2Lint, verifyBugs and five more, offline)", "PASS", "0 FAIL"); }
catch (e) { record("lint:cards (cardV2Lint, verifyBugs and five more, offline)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | ")); }
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
try {
  const out = execSync("node scripts/answerWordsCheck.mjs", { encoding: "utf8" });
  record("An answer like \"all\" takes the Any option; no question twice (item 9) (scripts/answerWordsCheck.mjs)", "PASS", (out.match(/answerWordsCheck: .*/) || [""])[0]);
} catch (e) {
  record("An answer like \"all\" takes the Any option; no question twice (item 9) (scripts/answerWordsCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
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
// A card shows the record's own title, never the typed words (product rule 25; Lane E, cardTitleCheck). No network.
try {
  const out = execSync("node scripts/cardTitleCheck.mjs", { encoding: "utf8" });
  record("A card shows its own title, rule 25 (scripts/cardTitleCheck.mjs)", "PASS", (out.match(/cardTitleCheck: .*/) || [""])[0]);
} catch (e) {
  record("A card shows its own title, rule 25 (scripts/cardTitleCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
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
// A trim_choice answer draws the engine's own prompt and chips, each re-asking with its trim refine, never the fallback (Lane F, Oct 20 2026; Lane C). No network.
try {
  const out = execSync("node scripts/trimChoiceDrawCheck.mjs", { encoding: "utf8" });
  record("Market Check draws trim_choice as a question (scripts/trimChoiceDrawCheck.mjs)", "PASS", (out.match(/trimChoiceDrawCheck: .*/) || [""])[0]);
} catch (e) {
  record("Market Check draws trim_choice as a question (scripts/trimChoiceDrawCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Every ?photo= address the partner pages build carries a width the photo path serves (Lane E's stage 5 find; Lane C). No network.
try {
  const out = execSync("node scripts/photoWidthCheck.mjs", { encoding: "utf8" });
  record("Every demo photo asks a served width (scripts/photoWidthCheck.mjs)", "PASS", (out.match(/photoWidthCheck: .*/) || [""])[0]);
} catch (e) {
  record("Every demo photo asks a served width (scripts/photoWidthCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// The Amazon Autos listing layout, Market Check placement, sales shown not linked (Sam, Oct 20 2026; Lane C). No network.
try {
  const out = execSync("node scripts/amazonR2Check.mjs", { encoding: "utf8" });
  record("Amazon demo revision 2, tab c (scripts/amazonR2Check.mjs)", "PASS", (out.match(/amazonR2Check: .*/) || [""])[0]);
} catch (e) {
  record("Amazon demo revision 2, tab c (scripts/amazonR2Check.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Titles from the VIN's decode, Key features from the decode only, the three case lines in Sam's words (Sam, Oct 20 2026; Lane C on Lane E). No network.
try {
  const out = execSync("node scripts/amazonCaseCheck.mjs", { encoding: "utf8" });
  record("Amazon demo revision 2, the answer cases (scripts/amazonCaseCheck.mjs)", "PASS", (out.match(/amazonCaseCheck: .*/) || [""])[0]);
} catch (e) {
  record("Amazon demo revision 2, the answer cases (scripts/amazonCaseCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Lane E's demo-vin checks (Sam's revision 2 items 7 and 8). No network.
try {
  const out = execSync("node scripts/demoVinCheck.mjs", { encoding: "utf8" });
  record("Amazon demo VIN decode and cases, server side (scripts/demoVinCheck.mjs)", "PASS", (out.match(/demoVinCheck: .*/) || [""])[0]);
} catch (e) {
  record("Amazon demo VIN decode and cases, server side (scripts/demoVinCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Every visitor-visible Buy string spells it color (Sam, Oct 20 2026; Lane C). No network.
try {
  const out = execSync("node scripts/buyColorSpellingCheck.mjs", { encoding: "utf8" });
  record("Buy says color, not colour (scripts/buyColorSpellingCheck.mjs)", "PASS", (out.match(/buyColorSpellingCheck: .*/) || [""])[0]);
} catch (e) {
  record("Buy says color, not colour (scripts/buyColorSpellingCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// amazonGridCheck (Lane E, Buy Stage 1c). No network.
try {
  const out = execSync("node scripts/amazonGridCheck.mjs", { encoding: "utf8" });
  record("amazonGridCheck (scripts/amazonGridCheck.mjs)", "PASS", (out.match(/amazonGridCheck: .*/) || [""])[0]);
} catch (e) {
  record("amazonGridCheck (scripts/amazonGridCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// amazonTypedCheck (Lane E, Buy Stage 1c). No network.
try {
  const out = execSync("node scripts/amazonTypedCheck.mjs", { encoding: "utf8" });
  record("amazonTypedCheck (scripts/amazonTypedCheck.mjs)", "PASS", (out.match(/amazonTypedCheck: .*/) || [""])[0]);
} catch (e) {
  record("amazonTypedCheck (scripts/amazonTypedCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// amazonCarStateCheck (Lane G, Amazon revision 3 item R3-A). No network.
try {
  const out = execSync("node scripts/amazonCarStateCheck.mjs", { encoding: "utf8" });
  record("Amazon revision 3, one current car (scripts/amazonCarStateCheck.mjs)", "PASS", (out.match(/amazonCarStateCheck: .*/) || [""])[0]);
} catch (e) {
  record("Amazon revision 3, one current car (scripts/amazonCarStateCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// amazonR3ListingCheck (Lane G, Amazon revision 3 item R3-B). No network.
try {
  const out = execSync("node scripts/amazonR3ListingCheck.mjs", { encoding: "utf8" });
  record("Amazon revision 3, the listing block and the Market Check row (scripts/amazonR3ListingCheck.mjs)", "PASS", (out.match(/amazonR3ListingCheck: .*/) || [""])[0]);
} catch (e) {
  record("Amazon revision 3, the listing block and the Market Check row (scripts/amazonR3ListingCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// amazonSalesListCheck (Lane G, Amazon revision 3 item R3-B). No network.
try {
  const out = execSync("node scripts/amazonSalesListCheck.mjs", { encoding: "utf8" });
  record("Amazon revision 3, the sales list (scripts/amazonSalesListCheck.mjs)", "PASS", (out.match(/amazonSalesListCheck: .*/) || [""])[0]);
} catch (e) {
  record("Amazon revision 3, the sales list (scripts/amazonSalesListCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// amazonQuestionChipsCheck (Lane G, Amazon revision 4 item R4-B). No network.
try {
  const out = execSync("node scripts/amazonQuestionChipsCheck.mjs", { encoding: "utf8" });
  record("Amazon revision 4, the engine's question as chips (scripts/amazonQuestionChipsCheck.mjs)", "PASS", (out.match(/amazonQuestionChipsCheck: .*/) || [""])[0]);
} catch (e) {
  record("Amazon revision 4, the engine's question as chips (scripts/amazonQuestionChipsCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// vinIdentityCheck (Lane E, Buy Stage 1c). No network.
try {
  const out = execSync("node scripts/vinIdentityCheck.mjs", { encoding: "utf8" });
  record("vinIdentityCheck (scripts/vinIdentityCheck.mjs)", "PASS", (out.match(/vinIdentityCheck: .*/) || [""])[0]);
} catch (e) {
  record("vinIdentityCheck (scripts/vinIdentityCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Buy Stage 1d (Sam, Oct 20 2026; Lane C). No network.
try {
  const out = execSync("node scripts/buyTopCheck.mjs", { encoding: "utf8" });
  record("buyTopCheck (scripts/buyTopCheck.mjs)", "PASS", (out.match(/buyTopCheck: .*/) || [""])[0]);
} catch (e) {
  record("buyTopCheck (scripts/buyTopCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Cards in a row share the height, actions on one baseline, title two lines, metadata one (Sam, Oct 20 2026; Lane C). No network.
try {
  const out = execSync("node scripts/buyGridCheck.mjs", { encoding: "utf8" });
  record("Buy Stage 1d item 3, the card grid (scripts/buyGridCheck.mjs)", "PASS", (out.match(/buyGridCheck: .*/) || [""])[0]);
} catch (e) {
  record("Buy Stage 1d item 3, the card grid (scripts/buyGridCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// The visible bid label reads Last bid seen on Buy, Market Check, VIN pages and Tasks (Sam, Oct 20 2026; Lane C). No network.
try {
  const out = execSync("node scripts/voiceGroupACheck.mjs", { encoding: "utf8" });
  record("Company voice, group A (scripts/voiceGroupACheck.mjs)", "PASS", (out.match(/voiceGroupACheck: .*/) || [""])[0]);
} catch (e) {
  record("Company voice, group A (scripts/voiceGroupACheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Every model with a car gets its own chip; the leftover line (Sam, Oct 20 2026; Lane E). No network.
try {
  const out = execSync("node scripts/modelChipsCheck.mjs", { encoding: "utf8" });
  record("Buy, a chip for every model (scripts/modelChipsCheck.mjs)", "PASS", (out.match(/modelChipsCheck: .*/) || [""])[0]);
} catch (e) {
  record("Buy, a chip for every model (scripts/modelChipsCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Home platform notes, About, PowerSellers, the PowerSeller disclosure and Tasks in company voice (Sam, Oct 20 2026; Lane C). No network.
try {
  const out = execSync("node scripts/voiceGroupDCheck.mjs", { encoding: "utf8" });
  record("Company voice, group D (scripts/voiceGroupDCheck.mjs)", "PASS", (out.match(/voiceGroupDCheck: .*/) || [""])[0]);
} catch (e) {
  record("Company voice, group D (scripts/voiceGroupDCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Buy Stage 1d (Sam, Oct 20 2026; Lane C). No network.
try {
  const out = execSync("node scripts/buyActionsCheck.mjs", { encoding: "utf8" });
  record("buyActionsCheck (scripts/buyActionsCheck.mjs)", "PASS", (out.match(/buyActionsCheck: .*/) || [""])[0]);
} catch (e) {
  record("buyActionsCheck (scripts/buyActionsCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Title and X on top, the shared card, no snippets, actions in Sam's order (Sam, Oct 20 2026; Lane C). No network.
try {
  const out = execSync("node scripts/buyPanelCheck.mjs", { encoding: "utf8" });
  record("Buy Stage 1d item 5, the inline Market Check panel (scripts/buyPanelCheck.mjs)", "PASS", (out.match(/buyPanelCheck: .*/) || [""])[0]);
} catch (e) {
  record("Buy Stage 1d item 5, the inline Market Check panel (scripts/buyPanelCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Six suggestion chips above the input, Sam's placeholder, a stronger bar (Sam, Oct 20 2026; Lane C). No network.
try {
  const out = execSync("node scripts/buyBarCheck.mjs", { encoding: "utf8" });
  record("Buy Stage 1d item 7, the follow-up bar (scripts/buyBarCheck.mjs)", "PASS", (out.match(/buyBarCheck: .*/) || [""])[0]);
} catch (e) {
  record("Buy Stage 1d item 7, the follow-up bar (scripts/buyBarCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Buy Stage 1e item 2 (Sam, Oct 21 2026; Lane C): the Sold before / Listed before chip. No network.
try {
  const out = execSync("node scripts/buyHistChipCheck.mjs", { encoding: "utf8" });
  record("buyHistChipCheck (scripts/buyHistChipCheck.mjs)", "PASS", (out.match(/buyHistChipCheck: .*/) || [""])[0]);
} catch (e) {
  record("buyHistChipCheck (scripts/buyHistChipCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Buy Stage 1e item 3 (Sam, Oct 21 2026; Lane C): the history popup over the page, the 1996 Turbo's row rendered. No network.
try {
  const out = execSync("node scripts/buyHistPopupCheck.mjs", { encoding: "utf8" });
  record("buyHistPopupCheck (scripts/buyHistPopupCheck.mjs)", "PASS", (out.match(/buyHistPopupCheck: .*/) || [""])[0]);
} catch (e) {
  record("buyHistPopupCheck (scripts/buyHistPopupCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Buy Stage 1e item 5 (Sam, Oct 21 2026; Lane C): the bar flush, a slim strip. No network.
try {
  const out = execSync("node scripts/buyBarFlushCheck.mjs", { encoding: "utf8" });
  record("buyBarFlushCheck (scripts/buyBarFlushCheck.mjs)", "PASS", (out.match(/buyBarFlushCheck: .*/) || [""])[0]);
} catch (e) {
  record("buyBarFlushCheck (scripts/buyBarFlushCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Buy Stage 1e item 6 (Sam, Oct 21 2026; Lane E's bucketing): each era chip counts the cards that print its code. No network.
try {
  const out = execSync("node scripts/eraChipsCheck.mjs", { encoding: "utf8" });
  record("eraChipsCheck (scripts/eraChipsCheck.mjs)", "PASS", (out.match(/eraChipsCheck: .*/) || [""])[0]);
} catch (e) {
  record("eraChipsCheck (scripts/eraChipsCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// The hub gate reads the slug as the page does (Lane B's diagnosis, Oct 21 2026; Lane C): no dead hub URLs in the sitemap. No network.
try {
  const out = execSync("node scripts/hubGateCheck.mjs", { encoding: "utf8" });
  record("hubGateCheck (scripts/hubGateCheck.mjs)", "PASS", (out.match(/hubGateCheck: .*/) || [""])[0]);
} catch (e) {
  record("hubGateCheck (scripts/hubGateCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Security job E/D (Sam approved, Oct 21 2026; Lane C): secHeadersCheck. No network.
try {
  const out = execSync("node scripts/secHeadersCheck.mjs", { encoding: "utf8" });
  record("secHeadersCheck (scripts/secHeadersCheck.mjs)", "PASS", (out.match(/secHeadersCheck: .*/) || [""])[0]);
} catch (e) {
  record("secHeadersCheck (scripts/secHeadersCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Security job E/D (Sam approved, Oct 21 2026; Lane C): corsCheck. No network.
try {
  const out = execSync("node scripts/corsCheck.mjs", { encoding: "utf8" });
  record("corsCheck (scripts/corsCheck.mjs)", "PASS", (out.match(/corsCheck: .*/) || [""])[0]);
} catch (e) {
  record("corsCheck (scripts/corsCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Security job E/D (Sam approved, Oct 21 2026; Lane C): beaconCeilingCheck. No network.
try {
  const out = execSync("node scripts/beaconCeilingCheck.mjs", { encoding: "utf8" });
  record("beaconCeilingCheck (scripts/beaconCeilingCheck.mjs)", "PASS", (out.match(/beaconCeilingCheck: .*/) || [""])[0]);
} catch (e) {
  record("beaconCeilingCheck (scripts/beaconCeilingCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// F-30 (Lane S's CodeQL triage, Oct 21 2026; Lane C): chip labels ride in data-chip. No network (a local browser).
try {
  const out = execSync("node scripts/chipLabelCheck.mjs", { encoding: "utf8" });
  record("chipLabelCheck (scripts/chipLabelCheck.mjs)", "PASS", (out.match(/chipLabelCheck: .*/) || [""])[0]);
} catch (e) {
  record("chipLabelCheck (scripts/chipLabelCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// buyStage1fCheck (Lane E, Buy Stage 1c). No network.
try {
  const out = execSync("node scripts/buyStage1fCheck.mjs", { encoding: "utf8" });
  record("buyStage1fCheck (scripts/buyStage1fCheck.mjs)", "PASS", (out.match(/buyStage1fCheck: .*/) || [""])[0]);
} catch (e) {
  record("buyStage1fCheck (scripts/buyStage1fCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// One left rail (Sam's new Buy 1f block item 8, Oct 21 2026; Lane C): every page's rail looks like Buy's, signed out and as crew. No network (a local browser).
try {
  const out = execSync("node scripts/railCheck.mjs", { encoding: "utf8" });
  record("railCheck (scripts/railCheck.mjs)", "PASS", (out.match(/railCheck: .*/) || [""])[0]);
} catch (e) {
  record("railCheck (scripts/railCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Market Check movement chart fixes (Sam, Oct 21 2026; Lane C): single-value quarters, counts, no overlaps, the axis room. No network (a local browser).
try {
  const out = execSync("node scripts/marketChartCheck.mjs", { encoding: "utf8" });
  record("marketChartCheck (scripts/marketChartCheck.mjs)", "PASS", (out.match(/marketChartCheck: .*/) || [""])[0]);
} catch (e) {
  record("marketChartCheck (scripts/marketChartCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Buy 1f (Sam's new block; Lane E's check, in prePush by Lane C): no S mark, the pale panel, what links where, the composer the only free input. No network.
try {
  const out = execSync("node scripts/buy1fCheck.mjs", { encoding: "utf8" });
  record("buy1fCheck (scripts/buy1fCheck.mjs)", "PASS", (out.match(/buy1fCheck: .*/) || [""])[0]);
} catch (e) {
  record("buy1fCheck (scripts/buy1fCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Market Check movement buckets from the engine (Lane B, Oct 21 2026): bucket size, minimum, none under two. No network.
try {
  const out = execSync("node scripts/movementCheck.mjs", { encoding: "utf8" });
  record("movementCheck (scripts/movementCheck.mjs)", "PASS", (out.match(/movementCheck: .*/) || [""])[0]);
} catch (e) {
  record("movementCheck (scripts/movementCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Market Check small fixes (Sam, Oct 21 2026; Lane C): the distribution legend and counts, the live rows. No network.
try {
  const out = execSync("node scripts/marketSectionsCheck.mjs", { encoding: "utf8" });
  record("marketSectionsCheck (scripts/marketSectionsCheck.mjs)", "PASS", (out.match(/marketSectionsCheck: .*/) || [""])[0]);
} catch (e) {
  record("marketSectionsCheck (scripts/marketSectionsCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// New search four ways in (Sam, Oct 21 2026; Lane C). No network.
try {
  const out = execSync("node scripts/newSearchCheck.mjs", { encoding: "utf8" });
  record("newSearchCheck (scripts/newSearchCheck.mjs)", "PASS", (out.match(/newSearchCheck: .*/) || [""])[0]);
} catch (e) {
  record("newSearchCheck (scripts/newSearchCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Buy model chips, the top 8 and More models (Sam, Oct 21 2026; Lane C). No network.
try {
  const out = execSync("node scripts/modelChipsTopCheck.mjs", { encoding: "utf8" });
  record("modelChipsTopCheck (scripts/modelChipsTopCheck.mjs)", "PASS", (out.match(/modelChipsTopCheck: .*/) || [""])[0]);
} catch (e) {
  record("modelChipsTopCheck (scripts/modelChipsTopCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Saved search names use the chips as shown (Sam, Oct 21 2026; Lane C). No network.
try {
  const out = execSync("node scripts/savedNameCheck.mjs", { encoding: "utf8" });
  record("savedNameCheck (scripts/savedNameCheck.mjs)", "PASS", (out.match(/savedNameCheck: .*/) || [""])[0]);
} catch (e) {
  record("savedNameCheck (scripts/savedNameCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Leftover words and mileage note, the page half (Sam, Oct 23 2026; Lane C). No network.
try {
  const out = execSync("node scripts/leftoverPageCheck.mjs", { encoding: "utf8" });
  record("leftoverPageCheck (scripts/leftoverPageCheck.mjs)", "PASS", (out.match(/leftoverPageCheck: .*/) || [""])[0]);
} catch (e) {
  record("leftoverPageCheck (scripts/leftoverPageCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Tasks leftover words through code (Sam, Oct 23 2026; Lane C). No network.
try {
  const out = execSync("node scripts/tasksLeftoverCheck.mjs", { encoding: "utf8" });
  record("tasksLeftoverCheck (scripts/tasksLeftoverCheck.mjs)", "PASS", (out.match(/tasksLeftoverCheck: .*/) || [""])[0]);
} catch (e) {
  record("tasksLeftoverCheck (scripts/tasksLeftoverCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Tasks limit of three (Oct 2026, Lane D): the one limit module, the server-side refusal at the limit, close-and-start, the race recount, the
// start split. No network.
try {
  const out = execSync("node scripts/tasksLimitCheck.mjs", { encoding: "utf8" });
  record("tasksLimitCheck (scripts/tasksLimitCheck.mjs)", "PASS", (out.match(/tasksLimitCheck: .*/) || [""])[0]);
} catch (e) {
  record("tasksLimitCheck (scripts/tasksLimitCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// The Tasks page rendered (Oct 2026, Lane D): the real page in headless Chrome against fixtures (0, 2, 3 Tasks, the limit card, the starting
// state, the badge, the stale notice, the reading line, the toggle and the card badge at 1440 and 390). No network.
try {
  const out = execSync("node scripts/tasksPageShots.mjs", { encoding: "utf8" });
  record("tasksPageShots (scripts/tasksPageShots.mjs)", "PASS", (out.match(/tasksPageShots: .*/) || [""])[0]);
} catch (e) {
  record("tasksPageShots (scripts/tasksPageShots.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Tasks setup questions and drafts (Oct 24 2026, Lane D): choices answered in any form, the cap of two questions, a draft older than a day dropped. No network.
try {
  const out = execSync("node scripts/tasksDraftCheck.mjs", { encoding: "utf8" });
  record("tasksDraftCheck (scripts/tasksDraftCheck.mjs)", "PASS", (out.match(/tasksDraftCheck: .*/) || [""])[0]);
} catch (e) {
  record("tasksDraftCheck (scripts/tasksDraftCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Task email caps (Oct 24 2026, Lane D): the first email shows the 5 cars ending soonest plus the count of the rest, later ones up to 6, every email well under 100KB. No network, no send.
try {
  const out = execSync("node scripts/tasksEmailCapCheck.mjs", { encoding: "utf8" });
  record("tasksEmailCapCheck (scripts/tasksEmailCapCheck.mjs)", "PASS", (out.match(/tasksEmailCapCheck: .*/) || [""])[0]);
} catch (e) {
  record("tasksEmailCapCheck (scripts/tasksEmailCapCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// GoAskSam 2.0 Stage 1, the one rail, Find and /buy 301 (Sam, Oct 23 2026; Lane C). No network.
try {
  const out = execSync("node scripts/rail2Check.mjs", { encoding: "utf8" });
  record("rail2Check (scripts/rail2Check.mjs)", "PASS", (out.match(/rail2Check: .*/) || [""])[0]);
} catch (e) {
  record("rail2Check (scripts/rail2Check.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// GoAskSam 2.0 Stage 2, the four start pages (Sam, Oct 23 2026; Lane C). No network.
try {
  const out = execSync("node scripts/startPagesCheck.mjs", { encoding: "utf8" });
  record("startPagesCheck (scripts/startPagesCheck.mjs)", "PASS", (out.match(/startPagesCheck: .*/) || [""])[0]);
} catch (e) {
  record("startPagesCheck (scripts/startPagesCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// GoAskSam 2.0 Stage 3 (Sam, Oct 23 2026; Lane C). Offline, needs Chrome.
try {
  const out = execSync("node scripts/voiceStartCheck.mjs", { encoding: "utf8" });
  record("voiceStartCheck (scripts/voiceStartCheck.mjs)", "PASS", (out.match(/voiceStartCheck: .*/) || [""])[0]);
} catch (e) {
  record("voiceStartCheck (scripts/voiceStartCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// GoAskSam 2.0 Stage 3 (Sam, Oct 23 2026; Lane C). Offline, needs Chrome.
try {
  const out = execSync("node scripts/valueIntentCheck.mjs", { encoding: "utf8" });
  record("valueIntentCheck (scripts/valueIntentCheck.mjs)", "PASS", (out.match(/valueIntentCheck: .*/) || [""])[0]);
} catch (e) {
  record("valueIntentCheck (scripts/valueIntentCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// A question that needs typing clears the box and keeps the original as context (Sam, Oct 23 2026; Lane C). Needs Chrome, no network.
try {
  const out = execSync("node scripts/askContextCheck.mjs", { encoding: "utf8" });
  record("askContextCheck (scripts/askContextCheck.mjs)", "PASS", (out.match(/askContextCheck: .*/) || [""])[0]);
} catch (e) {
  record("askContextCheck (scripts/askContextCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// The four start pages' placeholders (Sam, Oct 23 2026; Lane C): offline copy check always; the live engine run needs the probe key (skips itself without).
try {
  const out = execSync("node scripts/placeholderCheck.mjs", { encoding: "utf8" });
  record("placeholderCheck (scripts/placeholderCheck.mjs)", "PASS", (out.match(/placeholderCheck: .*/) || [""])[0]);
} catch (e) {
  record("placeholderCheck (scripts/placeholderCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Leftover words (Lane B, Oct 23 2026): chassis codes, place plus distance, hyphen forms, praise words count as used.
try {
  const out = execSync("node scripts/unusedWordsCheck.mjs", { encoding: "utf8" });
  record("unusedWordsCheck (scripts/unusedWordsCheck.mjs)", "PASS", (out.match(/unusedWordsCheck: .*/) || [""])[0]);
} catch (e) {
  record("unusedWordsCheck (scripts/unusedWordsCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// The Market Check address of a card (Sam, Oct 23 2026): VIN or the exact car, no question.
try {
  const out = execSync("node scripts/mcLinkCheck.mjs", { encoding: "utf8" });
  record("mcLinkCheck (scripts/mcLinkCheck.mjs)", "PASS", (out.match(/mcLinkCheck: .*/) || [""])[0]);
} catch (e) {
  record("mcLinkCheck (scripts/mcLinkCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// findCardKitCheck (GoAskSam 2.0 Tasks cards and emails, Oct 23 2026; Lane C).
try {
  const out = execSync("node scripts/findCardKitCheck.mjs", { encoding: "utf8" });
  record("findCardKitCheck (scripts/findCardKitCheck.mjs)", "PASS", (out.match(/findCardKitCheck: .*/) || [""])[0]);
} catch (e) {
  record("findCardKitCheck (scripts/findCardKitCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// placeCaseCheck (GoAskSam 2.0 Tasks cards and emails, Oct 23 2026; Lane C).
try {
  const out = execSync("node scripts/placeCaseCheck.mjs", { encoding: "utf8" });
  record("placeCaseCheck (scripts/placeCaseCheck.mjs)", "PASS", (out.match(/placeCaseCheck: .*/) || [""])[0]);
} catch (e) {
  record("placeCaseCheck (scripts/placeCaseCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// emailCardsCheck (GoAskSam 2.0 Tasks cards and emails, Oct 23 2026; Lane C).
try {
  const out = execSync("node scripts/emailCardsCheck.mjs", { encoding: "utf8" });
  record("emailCardsCheck (scripts/emailCardsCheck.mjs)", "PASS", (out.match(/emailCardsCheck: .*/) || [""])[0]);
} catch (e) {
  record("emailCardsCheck (scripts/emailCardsCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Every Task email send carries List-Unsubscribe and a text twin (Sam, Oct 23 2026).
try {
  const out = execSync("node scripts/emailHeadersCheck.mjs", { encoding: "utf8" });
  record("emailHeadersCheck (scripts/emailHeadersCheck.mjs)", "PASS", (out.match(/emailHeadersCheck: .*/) || [""])[0]);
} catch (e) {
  record("emailHeadersCheck (scripts/emailHeadersCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// The Task email kill switch (Sam, Oct 24 2026): off stops every Task email at send time, fails open, never touches sign-in. No network.
try {
  const out = execSync("node scripts/taskEmailSwitchCheck.mjs", { encoding: "utf8" });
  record("taskEmailSwitchCheck (scripts/taskEmailSwitchCheck.mjs)", "PASS", (out.match(/taskEmailSwitchCheck: .*/) || [""])[0]);
} catch (e) {
  record("taskEmailSwitchCheck (scripts/taskEmailSwitchCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Sign-in return (Sam, Oct 25 2026): after the emailed code, the person lands where they were going (Give Sam a Task goes to the Task page), existing and new account, 1440 and 390; same-origin destinations only. No network.
try {
  const out = execSync("node scripts/signinReturnCheck.mjs", { encoding: "utf8" });
  record("signinReturnCheck (scripts/signinReturnCheck.mjs)", "PASS", (out.match(/signinReturnCheck: .*/) || [""])[0]);
} catch (e) {
  record("signinReturnCheck (scripts/signinReturnCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// The holding page (Sam, Oct 25 2026): sealed, a stranger gets the countdown page (503, no noindex), at zero the site stays closed, crew and keyed jobs pass. No network.
try {
  const out = execSync("node scripts/holdPageCheck.mjs", { encoding: "utf8" });
  record("holdPageCheck (scripts/holdPageCheck.mjs)", "PASS", (out.match(/holdPageCheck: .*/) || [""])[0]);
} catch (e) {
  record("holdPageCheck (scripts/holdPageCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// The crew code box (Sam, Oct 25 2026): the code goes in a form body, never in an address, redirect, page or header; wrong codes get the 403 page and the limit. No network.
try {
  const out = execSync("node scripts/crewBoxCheck.mjs", { encoding: "utf8" });
  record("crewBoxCheck (scripts/crewBoxCheck.mjs)", "PASS", (out.match(/crewBoxCheck: .*/) || [""])[0]);
} catch (e) {
  record("crewBoxCheck (scripts/crewBoxCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// The Feedback form (Sam, Oct 25 2026): the recipient is fixed, header injection and over-long or empty messages are refused, the honeypot sends nothing, the limit and the kill switch answer the pause message, the route is open while sealed, nothing stored or logged. No network.
try {
  const out = execSync("node scripts/feedbackCheck.mjs", { encoding: "utf8" });
  record("feedbackCheck (scripts/feedbackCheck.mjs)", "PASS", (out.match(/feedbackCheck: .*/) || [""])[0]);
} catch (e) {
  record("feedbackCheck (scripts/feedbackCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// The Sell entry page (Sam, Oct 26 2026): the shared heading component, no script font, an "e.g." example in the box, the words kept. No network.
try {
  const out = execSync("node scripts/sellEntryCheck.mjs", { encoding: "utf8" });
  record("sellEntryCheck (scripts/sellEntryCheck.mjs)", "PASS", (out.match(/sellEntryCheck: .*/) || [""])[0]);
} catch (e) {
  record("sellEntryCheck (scripts/sellEntryCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// The start pages' input box and send button (Sam, Oct 26 2026): Sell, Find and Market Check share one send button and one box width; Market Check keeps its microphone. Rendered, no network.
try {
  const out = execSync("node scripts/startButtonCheck.mjs", { encoding: "utf8" });
  record("startButtonCheck (scripts/startButtonCheck.mjs)", "PASS", (out.match(/startButtonCheck: .*/) || [""])[0]);
} catch (e) {
  record("startButtonCheck (scripts/startButtonCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// The Privacy and Terms pages (Sam, Oct 26 2026): Sam's approved text word for word, the effective date, the shell and no footer, open while sealed, in the sitemap, no vendor names, linked from Home and the sign-in card. No network.
try {
  const out = execSync("node scripts/legalPagesCheck.mjs", { encoding: "utf8" });
  record("legalPagesCheck (scripts/legalPagesCheck.mjs)", "PASS", (out.match(/legalPagesCheck: .*/) || [""])[0]);
} catch (e) {
  record("legalPagesCheck (scripts/legalPagesCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// The "How this market has moved" card (Sam, Oct 26 2026): the heading and the "by quarter" line sit together at 1440 and 390, no empty band, no sideways scroll. Rendered with the page's own CSS, no network.
try {
  const out = execSync("node scripts/chartGapCheck.mjs", { encoding: "utf8" });
  record("chartGapCheck (scripts/chartGapCheck.mjs)", "PASS", (out.match(/chartGapCheck: .*/) || [""])[0]);
} catch (e) {
  record("chartGapCheck (scripts/chartGapCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// The sign-in card's Daily Vroom box (Sam, Oct 26 2026): ticked calls Beehiiv once after sign-in in the background, unticked never, failures never block, the switch stops it, the wording and the unticked default. Beehiiv faked, no network.
try {
  const out = execSync("node scripts/newsletterSignupCheck.mjs", { encoding: "utf8" });
  record("newsletterSignupCheck (scripts/newsletterSignupCheck.mjs)", "PASS", (out.match(/newsletterSignupCheck: .*/) || [""])[0]);
} catch (e) {
  record("newsletterSignupCheck (scripts/newsletterSignupCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Outbound link tags (Sam, Oct 26 2026): every listing or auction link on Find, Tasks, the Tasks emails, Market Check and Sell is tagged through the one helper; an existing utm stays; nothing about the person; no noreferrer. No network.
try {
  const out = execSync("node scripts/outboundUtmCheck.mjs", { encoding: "utf8" });
  record("outboundUtmCheck (scripts/outboundUtmCheck.mjs)", "PASS", (out.match(/outboundUtmCheck: .*/) || [""])[0]);
} catch (e) {
  record("outboundUtmCheck (scripts/outboundUtmCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Sell cut-off (Lane C, Oct 26 2026): the old Sell's conversation must keep the answer box and the newest message on screen after every step, at 1440x900 and 390x844. Real browser on the code being pushed; needs PROBE_KEY.
try {
  const out = execSync("node scripts/sellCutoffCheck.mjs", { encoding: "utf8", timeout: 600000 });
  if (/SKIP/.test(out)) record("sellCutoffCheck (scripts/sellCutoffCheck.mjs)", "SKIP", "no PROBE_KEY"); else record("sellCutoffCheck (scripts/sellCutoffCheck.mjs)", "PASS", (out.match(/sellCutoffCheck: .*/) || [""])[0]);
} catch (e) {
  record("sellCutoffCheck (scripts/sellCutoffCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Sell result page display changes (Lane C, Oct 26 2026): no Ask Sam section, no day-range sentence, the range card links to Market Check for the same car in a new tab. No network.
try {
  const out = execSync("node scripts/sellResultLinksCheck.mjs", { encoding: "utf8" });
  record("sellResultLinksCheck (scripts/sellResultLinksCheck.mjs)", "PASS", (out.match(/sellResultLinksCheck: .*/) || [""])[0]);
} catch (e) {
  record("sellResultLinksCheck (scripts/sellResultLinksCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// The header scrolls with the page on every shell page, and Find starts over (New search link, the rail's Find item, the bottom box line). Real browser; needs PROBE_KEY.
try {
  const out = execSync("node scripts/shellHeaderFindCheck.mjs", { encoding: "utf8", timeout: 900000 });
  if (/SKIP/.test(out)) record("shellHeaderFindCheck (scripts/shellHeaderFindCheck.mjs)", "SKIP", "no PROBE_KEY"); else record("shellHeaderFindCheck (scripts/shellHeaderFindCheck.mjs)", "PASS", (out.match(/shellHeaderFindCheck: .*/) || [""])[0]);
} catch (e) {
  record("shellHeaderFindCheck (scripts/shellHeaderFindCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | ") || String(e.message || "").slice(0, 160));
}
// Market Check's waiting state (Lane C, Oct 26 2026): the lines advance, the slow line after 20 seconds, a failed answer says so in place. Real browser; needs PROBE_KEY.
try {
  const out = execSync("node scripts/marketWaitCheck.mjs", { encoding: "utf8", timeout: 600000 });
  if (/SKIP/.test(out)) record("marketWaitCheck (scripts/marketWaitCheck.mjs)", "SKIP", "no PROBE_KEY"); else record("marketWaitCheck (scripts/marketWaitCheck.mjs)", "PASS", (out.match(/marketWaitCheck: .*/) || [""])[0]);
} catch (e) {
  record("marketWaitCheck (scripts/marketWaitCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | ") || String(e.message || "").slice(0, 160));
}
// Function region (Lane C, Oct 26 2026): the functions run next to the database. No network.
try {
  const out = execSync("node scripts/regionCheck.mjs", { encoding: "utf8" });
  record("regionCheck (scripts/regionCheck.mjs)", "PASS", (out.match(/regionCheck: .*/) || [""])[0]);
} catch (e) {
  record("regionCheck (scripts/regionCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Find's thin_sales (Lane B, Oct 26 2026, e93): the sales an answer holds when it has no range, from the engine's own pool. No network.
try {
  const out = execSync("node scripts/thinSalesCheck.mjs", { encoding: "utf8" });
  record("thin_sales on a no-range answer (scripts/thinSalesCheck.mjs)", "PASS", (out.match(/thinSalesCheck: .*/) || [""])[0]);
} catch (e) {
  record("thin_sales on a no-range answer (scripts/thinSalesCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// scope_reason, the 325xi receipts gate, refusal_line and Where to sell on the engine's counts (Lane B, Oct 26 2026, e93). No network.
try {
  const out = execSync("node scripts/scopeReasonCheck.mjs", { encoding: "utf8" });
  record("scope_reason, gate variants, refusal_line (scripts/scopeReasonCheck.mjs)", "PASS", (out.match(/scopeReasonCheck: .*/) || [""])[0]);
} catch (e) {
  record("scope_reason, gate variants, refusal_line (scripts/scopeReasonCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// One car, one answer: a Porsche 911 chassis code typed as the model and the VIN's nameplate return the same range, count and set-aside (Lane B, Oct 27 2026, e94). No network.
try {
  const out = execSync("node scripts/chassisCodeCheck.mjs", { encoding: "utf8" });
  record("typed chassis code and VIN nameplate agree (scripts/chassisCodeCheck.mjs)", "PASS", (out.match(/chassisCodeCheck: .*/) || [""])[0]);
} catch (e) {
  record("typed chassis code and VIN nameplate agree (scripts/chassisCodeCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Speedtail: a neighbouring model's title is another car; the gate fails such a pool (Lane B, Oct 27 2026, e94). No network.
try {
  const out = execSync("node scripts/modelIdentityCheck.mjs", { encoding: "utf8" });
  record("receipts are the car asked about, rival-model titles and model-less cars (scripts/modelIdentityCheck.mjs)", "PASS", (out.match(/modelIdentityCheck: .*/) || [""])[0]);
} catch (e) {
  record("receipts are the car asked about, rival-model titles and model-less cars (scripts/modelIdentityCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// 13k-Kilometer (Lane B, Oct 27 2026, e94). No network.
try {
  const out = execSync("node scripts/trimTextCheck.mjs", { encoding: "utf8" });
  record("title noise is never a trim, kilometres read in miles, one set of sales (scripts/trimTextCheck.mjs)", "PASS", (out.match(/trimTextCheck: .*/) || [""])[0]);
} catch (e) {
  record("title noise is never a trim, kilometres read in miles, one set of sales (scripts/trimTextCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// question rule (Lane B, Oct 27 2026, e94). No network.
try {
  const out = execSync("node scripts/questionRuleCheck.mjs", { encoding: "utf8" });
  record("a question is asked only with 3 or more sales an option in its own pool (scripts/questionRuleCheck.mjs)", "PASS", (out.match(/questionRuleCheck: .*/) || [""])[0]);
} catch (e) {
  record("a question is asked only with 3 or more sales an option in its own pool (scripts/questionRuleCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// BMW refusals (Lane B, Oct 27 2026, e94). No network.
try {
  const out = execSync("node scripts/refusalCauseCheck.mjs", { encoding: "utf8" });
  record("wrong refusals as classes: drive-train letters, non-trim words (scripts/refusalCauseCheck.mjs)", "PASS", (out.match(/refusalCauseCheck: .*/) || [""])[0]);
} catch (e) {
  record("wrong refusals as classes: drive-train letters, non-trim words (scripts/refusalCauseCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// One set of sales: the count, the range, every tile and the set-aside line of one answer come from the same sales (Lane B, Oct 27 2026, e95). No network.
try {
  const out = execSync("node scripts/sameSetCheck.mjs", { encoding: "utf8" });
  record("one set of sales behind every number on an answer (scripts/sameSetCheck.mjs)", "PASS", (out.match(/sameSetCheck: .*/) || [""])[0]);
} catch (e) {
  record("one set of sales behind every number on an answer (scripts/sameSetCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Rival rule fallback (Lane B, Oct 27 2026, e95). No network.
try {
  const out = execSync("node scripts/taxonomyUnreadableCheck.mjs", { encoding: "utf8" });
  record("the rival rule keeps its protection when the model list cannot be read (scripts/taxonomyUnreadableCheck.mjs)", "PASS", (out.match(/taxonomyUnreadableCheck: .*/) || [""])[0]);
} catch (e) {
  record("the rival rule keeps its protection when the model list cannot be read (scripts/taxonomyUnreadableCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Test flag guard (Lane B, Oct 27 2026, e95). No network.
try {
  const out = execSync("node scripts/noQuestionRuleCheck.mjs", { encoding: "utf8" });
  record("the question rule can only be switched off by the one test that sets it (scripts/noQuestionRuleCheck.mjs)", "PASS", (out.match(/noQuestionRuleCheck: .*/) || [""])[0]);
} catch (e) {
  record("the question rule can only be switched off by the one test that sets it (scripts/noQuestionRuleCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Question speed budget (Lane B, Oct 27 2026, e95). No network.
try {
  const out = execSync("node scripts/questionSpeedCheck.mjs", { encoding: "utf8" });
  record("a question is not slower than the old question by more than the budget (scripts/questionSpeedCheck.mjs)", "PASS", (out.match(/questionSpeedCheck: .*/) || [""])[0]);
} catch (e) {
  record("a question is not slower than the old question by more than the budget (scripts/questionSpeedCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// A question that cannot be settled inside the cap never prints one range over mixed bodies (Lane B, Oct 27 2026, e95). No network.
try {
  const out = execSync("node scripts/mixedRangeCheck.mjs", { encoding: "utf8" });
  record("a mixed-body pool past the question cap shows the sales, not one range (scripts/mixedRangeCheck.mjs)", "PASS", (out.match(/mixedRangeCheck: .*/) || [""])[0]);
} catch (e) {
  record("a mixed-body pool past the question cap shows the sales, not one range (scripts/mixedRangeCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Options that price apart never print one pooled headline or one pooled movement chart (Lane B, Oct 27 2026, e95). No network.
try {
  const out = execSync("node scripts/pooledAnswerCheck.mjs", { encoding: "utf8" });
  record("options that price apart print no pooled headline or chart; options that price alike do (scripts/pooledAnswerCheck.mjs)", "PASS", (out.match(/pooledAnswerCheck: .*/) || [""])[0]);
} catch (e) {
  record("options that price apart print no pooled headline or chart; options that price alike do (scripts/pooledAnswerCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// A car titled by its number and filed under its model (the 1985 Land Rover Defender 110) is that car; the G-Wagen is the G-Class (Lane B, Oct 27 2026, e95). No network.
try {
  const out = execSync("node scripts/numberNameCheck.mjs", { encoding: "utf8" });
  record("a car titled by its number is the model it is filed under; the G-Wagen is the G-Class (scripts/numberNameCheck.mjs)", "PASS", (out.match(/numberNameCheck: .*/) || [""])[0]);
} catch (e) {
  record("a car titled by its number is the model it is filed under; the G-Wagen is the G-Class (scripts/numberNameCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// How Sam decides (Sam, Oct 26 2026): the five agreed sections, exactly. No network.
try {
  const out = execSync("node scripts/howSamDecidesCheck.mjs", { encoding: "utf8" });
  record("How Sam decides copy (scripts/howSamDecidesCheck.mjs)", "PASS", (out.match(/howSamDecidesCheck: .*/) || [""])[0]);
} catch (e) {
  record("How Sam decides copy (scripts/howSamDecidesCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Find's thin card, four states (Sam, Oct 26 2026, e93): a card never reads blank. No network.
try {
  const out = execSync("node scripts/findThinSalesCheck.mjs", { encoding: "utf8" });
  record("Find thin card, four states (scripts/findThinSalesCheck.mjs)", "PASS", (out.match(/findThinSalesCheck: .*/) || [""])[0]);
} catch (e) {
  record("Find thin card, four states (scripts/findThinSalesCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Homepage tightening (Sam, Oct 26 2026): one-line box, no eyebrow, rotating examples, the new sidebar line. Local browser render, no network.
try {
  const out = execSync("node scripts/startPlaceCheck.mjs", { encoding: "utf8", timeout: 300000 });
  record("Start page place (scripts/startPlaceCheck.mjs)", "PASS", (out.match(/startPlaceCheck: .*/) || [""])[0]);
} catch (e) {
  record("Start page place (scripts/startPlaceCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/homeTightenCheck.mjs", { encoding: "utf8" });
  record("Homepage tightening (scripts/homeTightenCheck.mjs)", "PASS", (out.match(/homeTightenCheck: .*/) || [""])[0]);
} catch (e) {
  record("Homepage tightening (scripts/homeTightenCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// The two free-to-use lines, About and the sign-in card (Sam, Oct 26 2026). No network.
try {
  const out = execSync("node scripts/freeLinesCheck.mjs", { encoding: "utf8" });
  record("Free-to-use lines (scripts/freeLinesCheck.mjs)", "PASS", (out.match(/freeLinesCheck: .*/) || [""])[0]);
} catch (e) {
  record("Free-to-use lines (scripts/freeLinesCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Market Check result fixes: the tile's venue and the scope reason (Sam, Oct 26 2026). No network.
try {
  const out = execSync("node scripts/mcResultFixesCheck.mjs", { encoding: "utf8" });
  record("Market Check result fixes (scripts/mcResultFixesCheck.mjs)", "PASS", (out.match(/mcResultFixesCheck: .*/) || [""])[0]);
} catch (e) {
  record("Market Check result fixes (scripts/mcResultFixesCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// No error detail to the browser (Lane S review of a615b64a, Oct 27 2026). No network.
try {
  const out = execSync("node scripts/errorTextCheck.mjs", { encoding: "utf8" });
  record("No error detail to the browser (scripts/errorTextCheck.mjs)", "PASS", (out.match(/errorTextCheck: .*/) || [""])[0]);
} catch (e) {
  record("No error detail to the browser (scripts/errorTextCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Signed device id and the Market Check cap (Lane S review of a615b64a, Oct 27 2026). No network.
try {
  const out = execSync("node scripts/deviceIdCheck.mjs", { encoding: "utf8" });
  record("Signed device id and the Market Check cap (scripts/deviceIdCheck.mjs)", "PASS", (out.match(/deviceIdCheck: .*/) || [""])[0]);
} catch (e) {
  record("Signed device id and the Market Check cap (scripts/deviceIdCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Database failure is a calm page (Lane S review of a615b64a, Oct 27 2026). No network.
try {
  const out = execSync("node scripts/calmFailureCheck.mjs", { encoding: "utf8" });
  record("Database failure is a calm page (scripts/calmFailureCheck.mjs)", "PASS", (out.match(/calmFailureCheck: .*/) || [""])[0]);
} catch (e) {
  record("Database failure is a calm page (scripts/calmFailureCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Market Check daily cap: 30 cars, Sam's message, the limit_hit event (Oct 27 2026). No network.
try {
  const out = execSync("node scripts/mcCarCapCheck.mjs", { encoding: "utf8" });
  record("Market Check daily cap (scripts/mcCarCapCheck.mjs)", "PASS", (out.match(/mcCarCapCheck: .*/) || [""])[0]);
} catch (e) {
  record("Market Check daily cap (scripts/mcCarCapCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Candle chart labels: every quarter shown is labelled, none overlap, none leave the chart (Oct 27 2026). Local browser render, no network.
try {
  const out = execSync("node scripts/candleLabelsCheck.mjs", { encoding: "utf8", timeout: 600000 });
  record("Candle chart labels (scripts/candleLabelsCheck.mjs)", "PASS", (out.match(/candleLabelsCheck: \d+ pass.*/) || [""])[0] + " | " + (out.match(/candleLabelsCheck: \d+ charts.*/) || [""])[0]);
} catch (e) {
  record("Candle chart labels (scripts/candleLabelsCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// The engine's reason travels with its number (Oct 27 2026): scope reason, scope label, window, refusal line and mileage note on Market Check, Sell, the partner pages, Find and the Tasks email. No network.
try {
  const out = execSync("node scripts/carriedFieldsCheck.mjs", { encoding: "utf8", timeout: 600000 });
  record("Carried fields (scripts/carriedFieldsCheck.mjs)", "PASS", (out.match(/carriedFieldsCheck: .*/) || [""])[0]);
} catch (e) {
  record("Carried fields (scripts/carriedFieldsCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// No engine field is dropped silently (Oct 27 2026): one list of the fields the shared card carries; every field the engine adds is on it or acknowledged. No network.
try {
  const out = execSync("node scripts/engineFieldsCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("Engine fields (scripts/engineFieldsCheck.mjs)", "PASS", (out.match(/engineFieldsCheck: .*/) || [""])[0]);
} catch (e) {
  record("Engine fields (scripts/engineFieldsCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// The pooled states (Oct 27 2026, e95 fields): Market Check, the shared card, Find, the history page and the MCP tool print apart, split and alike, and a withheld chart. Local render, no network.
try {
  const out = execSync("node scripts/pooledStatesCheck.mjs", { encoding: "utf8", timeout: 600000 });
  record("Pooled states (scripts/pooledStatesCheck.mjs)", "PASS", (out.match(/pooledStatesCheck: .*/) || [""])[0]);
} catch (e) {
  record("Pooled states (scripts/pooledStatesCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// A count and its noun (Oct 27 2026): "One sales" is a class, so every line that joins a count to sale, car, listing or quarter is checked. No network.
try {
  const out = execSync("node scripts/countNounCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("Count and noun (scripts/countNounCheck.mjs)", "PASS", (out.match(/countNounCheck: \d+ pass.*/) || [""])[0]);
} catch (e) {
  record("Count and noun (scripts/countNounCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// The /sell door (Lane C, Oct 26 2026): crew sees the newer Sell, the public the previous one until SELL_NEXT_ON=1 flips it. No network.
try {
  const out = execSync("node scripts/sellRouteCheck.mjs", { encoding: "utf8" });
  record("sellRouteCheck (scripts/sellRouteCheck.mjs)", "PASS", (out.match(/sellRouteCheck: .*/) || [""])[0]);
} catch (e) {
  record("sellRouteCheck (scripts/sellRouteCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Cars shown at setup count as seen (Lane C, Oct 26 2026): no repeat in the thread or the combined email, the ending reminder stays. No network.
try {
  const out = execSync("node scripts/tasksSeenCheck.mjs", { encoding: "utf8" });
  record("tasksSeenCheck (scripts/tasksSeenCheck.mjs)", "PASS", (out.match(/tasksSeenCheck: .*/) || [""])[0]);
} catch (e) {
  record("tasksSeenCheck (scripts/tasksSeenCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
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

// ---- 2y. VIN / CHASSIS LOOKUP (Lane B, Stage 3): one shape test, exact-string chassis match, title body wins. No network. ----
try {
  const out = execSync("node scripts/vinLookupCheck.mjs", { encoding: "utf8" });
  record("VIN and chassis lookup (scripts/vinLookupCheck.mjs)", "PASS", (out.match(/vinLookupCheck: .*/) || [""])[0]);
} catch (e) {
  record("VIN and chassis lookup (scripts/vinLookupCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}

// ---- 2z. DELTA READ (Lane B, Oct 23 2026): the older-sales-only read returns exactly the rows of a full read. No network. ----
try {
  const out = execSync("node scripts/deltaReadCheck.mjs", { encoding: "utf8" });
  record("delta read equals the full read (scripts/deltaReadCheck.mjs)", "PASS", (out.match(/deltaReadCheck: .*/) || [""])[0]);
} catch (e) {
  record("delta read equals the full read (scripts/deltaReadCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}

// ---- 2za. NAMES (Lane B, Oct 24 2026): a 911 generation code is never the printed name ("996 Carrera", "996 911"). No network. ----
try {
  const out = execSync("node scripts/nameCheck.mjs", { encoding: "utf8" });
  record("Car names (scripts/nameCheck.mjs)", "PASS", (out.match(/nameCheck: .*/) || [""])[0]);
} catch (e) {
  record("Car names (scripts/nameCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// ---- 2zb. MODEL CHOICES FOR A BRAND (Lane B, Oct 25 2026, for Tasks): six models most-sold first plus Any. No network. ----
try {
  const out = execSync("node scripts/modelChoicesCheck.mjs", { encoding: "utf8" });
  record("Model choices for a brand (scripts/modelChoicesCheck.mjs)", "PASS", (out.match(/modelChoicesCheck: .*/) || [""])[0]);
} catch (e) {
  record("Model choices for a brand (scripts/modelChoicesCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// ---- 2zc. BULK SALE GUARD + EXACT-YEAR LINE (Lane B, Oct 25 2026). No network. ----
for (const [file, label] of [["bulkSaleCheck", "Bulk-sale guard"], ["exactYearLineCheck", "Exact-year line under a thin answer"], ["specLiveAbroadCheck", "Spec-page live count leaves abroad out"], ["marketPlaceCheck", "Place before currency (market check)"], ["amgBadgeCheck", "AMG badge and Shelby pools keep their own sales"], ["poolColumnsCheck", "Pool columns switch: identical rows, fail closed"], ["zeroRefusalCheck", "A refusal with count 0 says no sales on record"], ["archiveMakeCheck", "A make is never silently another make"], ["archiveModelCheck", "A known marque with an unknown model asks which model"], ["correctionMoveCheck", "A corrected row that moves out of a pool leaves it"], ["makeDisplayCheck", "Make display name, body page basis note, make-join leftover"], ["chatNumberGuardCheck", "The legacy chat refuses an invented number and passes supplied ones"], ["askedYearCheck", "A held or set-aside sentence claims only the asked year"], ["singerLeftoverCheck", "No leftover-word line above an answer the typed words made"], ["rawColumnsLineCheck", "The nightly log says raw columns on or off"], ["sellFieldsCheck", "Sell fields: best day and reserve split from the engine pool"],
  ["sellSpeedCheck", "Sell speed: one engine call per visit, no fetchQualifying of its own"],
  ["generationChipCheck", "Generation chips resolve for the whole generation with no invented year"]]) {
  try {
    const out = execSync(`node scripts/${file}.mjs`, { encoding: "utf8" });
    record(`${label} (scripts/${file}.mjs)`, "PASS", (out.match(new RegExp(file + ": .*")) || [""])[0]);
  } catch (e) {
    record(`${label} (scripts/${file}.mjs)`, "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
  }
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
// ---- 3a. REFUSAL CHECK (Lane B, Oct 23 2026): ten large-pool cars through the page's own request; ANY refusal fails the push ----
try {
  const out = execSync(`node scripts/refusalCheck.mjs --base ${BASE}`, { encoding: "utf8", timeout: 600000 });
  for (const w of out.split("\n").filter(l => /^WARN/.test(l))) console.log("   " + w);   // a chip fallback used = a WARN that names the car
  record("refusal check, 30 cars (scripts/refusalCheck.mjs)", /SKIP/.test(out) ? "SKIP" : "PASS", (out.match(/refusalCheck: .*/) || [""])[0]);
} catch (e) {
  record("refusal check, 30 cars (scripts/refusalCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL|^refusalCheck/.test(l)).slice(0, 6).join(" | "));
}
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
