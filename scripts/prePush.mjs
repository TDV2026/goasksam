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
import fs from "node:fs";

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

// Desk storage (Nov 2026, Lane S; docs/supabase-desk-storage.sql): RLS on every desk_ table and bucket, retention, org settings and seats. Each check builds the
// real DDL in a throwaway local Postgres and runs its own mutants, so it takes a minute or two: it runs only when this branch touches the Desk storage files
// (or the changed files could not be read). With no local Postgres the database part prints SKIP and is never counted as a pass.
if (!allChanged || allChanged.some(f => /^(lib\/desk\/(storage|retention|orgSettings|domain|seats|sheetActions)\.js|api\/deskOrg\.js|docs\/supabase-desk.*\.sql|scripts\/(rls|retention|orgSettings)Check\.mjs|scripts\/_desk(Pg|Db|Fakes|Urls)\.mjs)$/.test(f))) {
  for (const c of ["rlsCheck", "retentionCheck", "orgSettingsCheck"]) {
    try {
      const out = execSync(`node scripts/${c}.mjs`, { encoding: "utf8", timeout: 600000 });
      record(`desk storage (scripts/${c}.mjs)`, /SKIP/.test(out) ? "SKIP" : "PASS", (out.match(new RegExp(c + ": .*")) || [""])[0]);
    } catch (e) {
      record(`desk storage (scripts/${c}.mjs)`, "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
    }
  }
}

// Desk seat access (Nov 4 2026, Lane C): a Hagerty seat reaches the Desk through a signed gas_seat cookie; active seat in, removed seat out on the next call, no crew actions, everyone else the platform's own 404.
try {
  const out = execSync("node scripts/seatAccessCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("Desk seat access (scripts/seatAccessCheck.mjs)", "PASS", (out.match(/seatAccessCheck: .*/) || [""])[0]);
} catch (e) { record("Desk seat access (scripts/seatAccessCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | ")); }

// Dismiss controls and counts (Oct 29 2026, Lane D): every dismiss, close and "never mind" control on the Tasks page is clicked in headless Chrome at 1440 and 390 and what it dismisses must be gone; a count of cars on a Task card has the cars behind it; no 'close ones'. Offline.
try {
  const out = execSync("node scripts/tasksDismissCountCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("dismiss and counts (scripts/tasksDismissCountCheck.mjs)", "PASS", (out.match(/tasksDismissCountCheck: .*/) || [""])[0]);
} catch (e) {
  record("dismiss and counts (scripts/tasksDismissCountCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}

// Arrival (Oct 29 2026, Lane D): the launch email link /?via=beehiiv is read as the source on every path that reads the address, and the Launch tab shows limit, sign-in, Task and watch per source. Offline.
try {
  const out = execSync("node scripts/arrivalCheck.mjs", { encoding: "utf8" });
  record("arrival source (scripts/arrivalCheck.mjs)", "PASS", (out.match(/arrivalCheck: .*/) || [""])[0]);
} catch (e) {
  record("arrival source (scripts/arrivalCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}

// People tab (Oct 29 2026, Lane D): every /admin part answers the plain 404 without an admin sign-in; the list and the drill-in read only stored events. Offline.
try {
  const out = execSync("node scripts/peopleTabCheck.mjs", { encoding: "utf8" });
  record("people tab (scripts/peopleTabCheck.mjs)", "PASS", (out.match(/peopleTabCheck: .*/) || [""])[0]);
} catch (e) {
  record("people tab (scripts/peopleTabCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}

// Launch dashboard (Oct 26 2026, Lane D): the new events log without personal data and never block, the Launch tab's numbers on a known
// fixture, the real /admin script in headless Chrome at 1440 and 390 with no sideways scroll, and /admin's 404 for anyone not allowed. No database, no keys.
try {
  const out = execSync("node scripts/launchDashCheck.mjs", { encoding: "utf8" });
  record("launch dashboard (scripts/launchDashCheck.mjs)", "PASS", (out.match(/launchDashCheck: .*/) || [""])[0]);
} catch (e) {
  record("launch dashboard (scripts/launchDashCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}

// Launch tab status strip and readiness blocks (Oct 28 2026, Lane D): the thresholds, a strip that never says GOOD on an unread number, "not recorded" where a number is missing,
// held visits never an error, the page at 1440 and 390. No database, no keys.
try {
  const out = execSync("node scripts/launchHealthCheck.mjs", { encoding: "utf8" });
  record("launch status strip (scripts/launchHealthCheck.mjs)", "PASS", (out.match(/launchHealthCheck: .*/) || [""])[0]);
} catch (e) {
  record("launch status strip (scripts/launchHealthCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}

// Stored search text (Oct 28 2026, Lane D): no stored free text holds an email, a phone number or a VIN (every event with a text field), real car texts are kept
// word for word, and the Searches tab's list of what people typed carries no visitor identity. No database, no keys.
try {
  const out = execSync("node scripts/searchTextCheck.mjs", { encoding: "utf8" });
  record("stored search text (scripts/searchTextCheck.mjs)", "PASS", (out.match(/searchTextCheck: .*/) || [""])[0]);
} catch (e) {
  record("stored search text (scripts/searchTextCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
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
// The probe key travels in a header only, and no tracked .claude json holds a credential (Lane S's check, adopted by Lane D, Oct 28 2026). Repo mode: tracked files only, so a local settings file cannot fail another lane's run; node scripts/credStorageCheck.mjs --full [claudeRoot] is the sweep.
try {
  const out = execSync("node scripts/credStorageCheck.mjs", { encoding: "utf8" });
  record("Probe key in headers only, no credential in tracked .claude json (scripts/credStorageCheck.mjs)", "PASS", (out.match(/PASS credStorageCheck[^\n]*/) || [""])[0]);
} catch (e) {
  record("Probe key in headers only, no credential in tracked .claude json (scripts/credStorageCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^\s+(sender|storage)|^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// No plain comparison of a secret (PROBE_KEY, CRON_SECRET, crew and tester codes): the shared helpers only. No network.
try {
  const out = execSync("node scripts/keyedCompareCheck.mjs", { encoding: "utf8" });
  record("Secrets compared in constant time (scripts/keyedCompareCheck.mjs)", "PASS", (out.match(/PASS keyedCompareCheck: .*/) || [""])[0]);
} catch (e) {
  record("Secrets compared in constant time (scripts/keyedCompareCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// /sitemap.xml answers the real sitemap index, never a stale page list. No network.
try {
  const out = execSync("node scripts/sitemapRouteCheck.mjs", { encoding: "utf8" });
  record("/sitemap.xml reaches the sitemap index (scripts/sitemapRouteCheck.mjs)", "PASS", (out.match(/sitemapRouteCheck: .*/) || [""])[0]);
} catch (e) {
  record("/sitemap.xml reaches the sitemap index (scripts/sitemapRouteCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
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
// No orphan history pages (Lane E, Nov 7 2026): footer links to /history, index > make > hub in three hops, VIN pages from their hubs, plain links on the result pages. No network.
try {
  const out = execSync("node scripts/historyReachCheck.mjs", { encoding: "utf8" });
  record("History pages are reachable by link (scripts/historyReachCheck.mjs)", "PASS", (out.match(/historyReachCheck: .*/) || [""])[0]);
} catch (e) {
  record("History pages are reachable by link (scripts/historyReachCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
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
  const out = execSync("node scripts/noDesignControlsCheck.mjs", { encoding: "utf8" });
  record("No page carries a design test control: no palette switcher, no stored look (scripts/noDesignControlsCheck.mjs)", "PASS", (out.match(/noDesignControlsCheck: .*/) || [""])[0]);
} catch (e) {
  record("No page carries a design test control: no palette switcher, no stored look (scripts/noDesignControlsCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/crewPublicColoursCheck.mjs", { encoding: "utf8" });
  record("A signed crew cookie changes no colour on any page (scripts/crewPublicColoursCheck.mjs)", "PASS", (out.match(/crewPublicColoursCheck: .*/) || [""])[0]);
} catch (e) {
  record("A signed crew cookie changes no colour on any page (scripts/crewPublicColoursCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/pageWaitCheck.mjs", { encoding: "utf8" });
  record("No page carries a wait of its own for a cold answer (scripts/pageWaitCheck.mjs)", "PASS", (out.match(/pageWaitCheck: .*/) || [""])[0]);
} catch (e) {
  record("No page carries a wait of its own for a cold answer (scripts/pageWaitCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/salesPanelCheck.mjs", { encoding: "utf8" });
  record("The sale rows read across (See the sales panel, Market Check lists) (scripts/salesPanelCheck.mjs)", "PASS", (out.match(/salesPanelCheck: .*/) || [""])[0]);
} catch (e) {
  record("The sale rows read across (See the sales panel, Market Check lists) (scripts/salesPanelCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/landingExampleCheck.mjs", { encoding: "utf8" });
  record("Landing examples never print empty for a split car (scripts/landingExampleCheck.mjs)", "PASS", (out.match(/landingExampleCheck: .*/) || [""])[0]);
} catch (e) {
  record("Landing examples never print empty for a split car (scripts/landingExampleCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/underlineCheck.mjs", { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  record("Market Check and Find rendered: counts agree, footer contract, no null, one underline (scripts/underlineCheck.mjs)", "PASS", (out.match(/underlineCheck: .*/) || [""])[0]);
} catch (e) {
  record("Market Check and Find rendered: counts agree, footer contract, no null, one underline (scripts/underlineCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/cardLinesCheck.mjs", { encoding: "utf8" });
  record("Every line on a Find card sits inside its box in the card's own style (scripts/cardLinesCheck.mjs)", "PASS", (out.match(/cardLinesCheck: .*/) || [""])[0]);
} catch (e) {
  record("Every line on a Find card sits inside its box in the card's own style (scripts/cardLinesCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/wayOutAndLabelCheck.mjs", { encoding: "utf8" });
  record("Every question has its way out; no label prints over an empty body (scripts/wayOutAndLabelCheck.mjs)", "PASS", (out.match(/wayOutAndLabelCheck: .*/) || [""])[0]);
} catch (e) {
  record("Every question has its way out; no label prints over an empty body (scripts/wayOutAndLabelCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/appliedFiltersCheck.mjs", { encoding: "utf8" });
  record("A narrowing shows: the engine's applied line and a clear control per filter (scripts/appliedFiltersCheck.mjs)", "PASS", (out.match(/appliedFiltersCheck: .*/) || [""])[0]);
} catch (e) {
  record("A narrowing shows: the engine's applied line and a clear control per filter (scripts/appliedFiltersCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/showMoreCheck.mjs", { encoding: "utf8" });
  record("A show more control ends: gone when every row is shown, its count the rows still hidden (scripts/showMoreCheck.mjs)", "PASS", (out.match(/showMoreCheck: .*/) || [""])[0]);
} catch (e) {
  record("A show more control ends: gone when every row is shown, its count the rows still hidden (scripts/showMoreCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/noChartLayoutCheck.mjs", { encoding: "utf8" });
  record("No chart, for any reason, is one full-width layout with no empty panel (scripts/noChartLayoutCheck.mjs)", "PASS", (out.match(/noChartLayoutCheck: .*/) || [""])[0]);
} catch (e) {
  record("No chart, for any reason, is one full-width layout with no empty panel (scripts/noChartLayoutCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
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
// partnerDemoCheck (Lane E, Oct 31 2026): the eBay demo, four views at 1440 and 390, never a blank panel. No network.
try {
  const out = execSync("node scripts/partnerDemoCheck.mjs", { encoding: "utf8", timeout: 600000 });
  record("partnerDemoCheck (scripts/partnerDemoCheck.mjs)", "PASS", (out.match(/partnerDemoCheck: .*/) || [""])[0]);
} catch (e) {
  record("partnerDemoCheck (scripts/partnerDemoCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// liveSalesDatesCheck (Lane E, Oct 31 2026): the live feed's refresh and the sales date are two facts, never one date for both (Home, Find, Market Check, Sell, the admin Launch tab). No network.
try {
  const out = execSync("node scripts/liveSalesDatesCheck.mjs", { encoding: "utf8", timeout: 280000 });
  record("liveSalesDatesCheck (scripts/liveSalesDatesCheck.mjs)", "PASS", (out.match(/liveSalesDatesCheck: .*/) || [""])[0]);
} catch (e) {
  record("liveSalesDatesCheck (scripts/liveSalesDatesCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// whatsNewCheck (Lane E, Oct 31 2026): /whats-new at 0, 1 and 12 entries, 1440 and 390; the entry words; the rail and footer link on every page. No network.
try {
  const out = execSync("node scripts/whatsNewCheck.mjs", { encoding: "utf8", timeout: 280000 });
  record("whatsNewCheck (scripts/whatsNewCheck.mjs)", "PASS", (out.match(/whatsNewCheck: .*/) || [""])[0]);
} catch (e) {
  record("whatsNewCheck (scripts/whatsNewCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// checkSilenceCheck (Lane E, Nov 1 2026): every check prints a result line and can exit non-zero (a check that prints nothing cannot fail). No network.
try {
  const out = execSync("node scripts/checkSilenceCheck.mjs", { encoding: "utf8" });
  record("checkSilenceCheck (scripts/checkSilenceCheck.mjs)", "PASS", (out.match(/checkSilenceCheck: .*/) || [""])[0]);
} catch (e) {
  record("checkSilenceCheck (scripts/checkSilenceCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// findExcludedCheck (Lane E, Nov 1 2026): Find prints the engine's own "left out" lines above the cards, and nothing when excluded[] is empty. 1440 and 390. No network.
try {
  const out = execSync("node scripts/findExcludedCheck.mjs", { encoding: "utf8", timeout: 280000 });
  record("findExcludedCheck (scripts/findExcludedCheck.mjs)", "PASS", (out.match(/findExcludedCheck: .*/) || [""])[0]);
} catch (e) {
  record("findExcludedCheck (scripts/findExcludedCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// popupSalesCheck (Lane E, Nov 2 2026): a Find card's popup prints the sales behind the count it states (warm, cold instance with a failed second read, nothing stored: the engine's still-reading line), for every card type; the Market Check link carries the car beside the VIN. Real engine over a fake archive, no network.
try {
  const out = execSync("node scripts/popupSalesCheck.mjs", { encoding: "utf8", timeout: 280000 });
  record("popupSalesCheck (scripts/popupSalesCheck.mjs)", "PASS", (out.match(/popupSalesCheck: .*/) || [""])[0]);
} catch (e) {
  record("popupSalesCheck (scripts/popupSalesCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// cardPopupCountCheck (Lane B, Nov 3 2026, lane-b-genline): a Find card and its popup count one pool (the near-miles card, the whole-pool card, two cars, two mileages); fails on any difference in count or sales.
try {
  const out = execSync("node scripts/cardPopupCountCheck.mjs", { encoding: "utf8", timeout: 280000 });
  record("cardPopupCountCheck (scripts/cardPopupCountCheck.mjs)", "PASS", (out.match(/cardPopupCountCheck: .*/) || [""])[0]);
} catch (e) {
  record("cardPopupCountCheck (scripts/cardPopupCountCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// bodyTrustCheck (Lane B, Nov 6 2026): a stored body is trusted only for a body the model came in (lib/modelBodies.js); the WRX, WRX STI and Lancer Evolution stored as Convertible are not convertibles; a sample per body value; the title wins; nothing is guessed; mutants in scripts/bodyTrustCheck.mjs --mutants.
try {
  const out = execSync("node scripts/bodyTrustCheck.mjs", { encoding: "utf8", timeout: 280000 });
  record("bodyTrustCheck (scripts/bodyTrustCheck.mjs)", "PASS", (out.match(/bodyTrustCheck: .*/) || [""])[0]);
} catch (e) {
  record("bodyTrustCheck (scripts/bodyTrustCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// crewKeysCheck (Lane B, Nov 6 2026): ops task=crewkeys reports what the two crew keys hold and the funnel counts, read only, behind the ops key; mutants in scripts/crewKeysCheck.mjs --mutants.
try {
  const out = execSync("node scripts/crewKeysCheck.mjs", { encoding: "utf8", timeout: 280000 });
  record("crewKeysCheck (scripts/crewKeysCheck.mjs)", "PASS", (out.match(/crewKeysCheck: .*/) || [""])[0]);
} catch (e) {
  record("crewKeysCheck (scripts/crewKeysCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// pillFenceCheck (Lane B, Nov 6 2026): every pill Find shows fences the pool on every path (body, title word, venue, ends within, colour, trim; truck is a pickup; an unknown value fences to nothing); a pill with no cars prints "No live cars match: ..." and keeps its words; mutants in scripts/pillFenceCheck.mjs --mutants.
try {
  const out = execSync("node scripts/pillFenceCheck.mjs", { encoding: "utf8", timeout: 280000 });
  record("pillFenceCheck (scripts/pillFenceCheck.mjs)", "PASS", (out.match(/pillFenceCheck: .*/) || [""])[0]);
} catch (e) {
  record("pillFenceCheck (scripts/pillFenceCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// clockShiftCheck (Lane B, Nov 6 2026): every check that pins a calendar date and does not use the fake clock passes with the real clock at +0, +3 and +60 days (tasksDemoCheck passed at 06:00 UTC and was red from 18:00 UTC on a fixture date written in the file); --mutants restores the old pin.
try {
  const out = execSync("node scripts/clockShiftCheck.mjs", { encoding: "utf8", timeout: 590000 });
  record("clockShiftCheck (scripts/clockShiftCheck.mjs)", "PASS", (out.match(/clockShiftCheck: .*/) || [""])[0]);
} catch (e) {
  record("clockShiftCheck (scripts/clockShiftCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// prewarYearlessCheck (Lane B, Nov 6 2026): a query with no year reads the same pre-war car as the year query (the live "Delahaye 135": one pooled "Too few sales" list over a 1937 to 1949 pool); twelve cars, the engine and the real Market Check page in Chrome; mutants in scripts/prewarYearlessCheck.mjs --mutants.
try {
  const out = execSync("node scripts/prewarYearlessCheck.mjs", { encoding: "utf8", timeout: 590000 });
  record("prewarYearlessCheck (scripts/prewarYearlessCheck.mjs)", "PASS", (out.match(/prewarYearlessCheck: .*/) || [""])[0]);
} catch (e) {
  record("prewarYearlessCheck (scripts/prewarYearlessCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// smallLabelsCheck (Lane B, Nov 6 2026): a numeric nameplate carries its make in the label (the Delahaye 135), the Auburn Speedster is one body by its titles, the comparing line names the years the answer used (the 1998 Carrera 4 Cabriolet); mutants in scripts/smallLabelsCheck.mjs --mutants.
try {
  const out = execSync("node scripts/smallLabelsCheck.mjs", { encoding: "utf8", timeout: 280000 });
  record("smallLabelsCheck (scripts/smallLabelsCheck.mjs)", "PASS", (out.match(/smallLabelsCheck: .*/) || [""])[0]);
} catch (e) {
  record("smallLabelsCheck (scripts/smallLabelsCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// oneOptionPoolCheck (Lane B, Nov 6 2026): the question rule never drops a body the pool shows (the live 1963 Corvette: "Only the Convertible" over 31 coupes and 14 convertibles); a decision expires with its row; a failed option read is unknown, never zero; the four products read the same 45; mutants in scripts/oneOptionPoolCheck.mjs --mutants.
try {
  const out = execSync("node scripts/oneOptionPoolCheck.mjs", { encoding: "utf8", timeout: 280000 });
  record("oneOptionPoolCheck (scripts/oneOptionPoolCheck.mjs)", "PASS", (out.match(/oneOptionPoolCheck: .*/) || [""])[0]);
} catch (e) {
  record("oneOptionPoolCheck (scripts/oneOptionPoolCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// warmResolveCheck (Lane B, Nov 6 2026): the warm resolves a typed name the way the page does (the six pre-war cars the warm refused as rung_label_blank were an identity with no model, not an apart answer with no label); the guard names the cause; no warm uses the bare resolver; mutants in scripts/warmResolveCheck.mjs --mutants.
try {
  const out = execSync("node scripts/warmResolveCheck.mjs", { encoding: "utf8", timeout: 280000 });
  record("warmResolveCheck (scripts/warmResolveCheck.mjs)", "PASS", (out.match(/warmResolveCheck: .*/) || [""])[0]);
} catch (e) {
  record("warmResolveCheck (scripts/warmResolveCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// warmEpochCheck (Lane B, Nov 7 2026): a warm says it ran ahead of the day's ingest bump (the bare Delahaye 135 and Duesenberg Model J rows read epoch_mismatch because the epoch was bumped by the ingest hours after the warm stamped it), and a writer never stamps an epoch the last poll could not confirm; mutants in scripts/warmEpochCheck.mjs --mutants
try {
  const out = execSync("node scripts/warmEpochCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("warmEpochCheck (scripts/warmEpochCheck.mjs)", "PASS", (out.match(/warmEpochCheck: .*/) || [""])[0]);
} catch (e) {
  record("warmEpochCheck (scripts/warmEpochCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// warmGateCheck (Lane B, Nov 8 2026): a person's warm declines before the day's ingest has finished (marker app_config ingest_done written by scripts/ingest.js after the bump), cron and force=1 bypass it, every ops task that writes warm rows is gated (found by scanning the source); mutants in scripts/warmGateCheck.mjs --mutants
try {
  const out = execSync("node scripts/warmGateCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("warmGateCheck (scripts/warmGateCheck.mjs)", "PASS", (out.match(/warmGateCheck: .*/) || [""])[0]);
} catch (e) {
  record("warmGateCheck (scripts/warmGateCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// hubOneGateCheck, vinFirstVisitCheck, sitemapHonestyCheck (Lane B, Nov 8 2026, Lane F's sitemap audit): the hub page and the sitemap's hub file ask ONE gate (hubGate), the VIN files list only VINs a verified hub links, a first visit to a VIN page is a stored read inside a time bound,
// and the live sitemap is sampled (every file) for URLs that are not 200, indexable and self-canonical. The live sample SKIPs without the bypass secret, and while the live hub file predates the gate (--gate-required), so the push that ships the gate is not blocked by the list it replaces.
for (const [label, cmd, to] of [["hubOneGateCheck (scripts/hubOneGateCheck.mjs)", "node scripts/hubOneGateCheck.mjs", 120000], ["vinFirstVisitCheck (scripts/vinFirstVisitCheck.mjs)", "node scripts/vinFirstVisitCheck.mjs", 180000], ["sitemapHonestyCheck (scripts/sitemapHonestyCheck.mjs, live sample)", "node scripts/sitemapHonestyCheck.mjs --gate-required --per-file=6", 280000]]) {
  try {
    const out = execSync(cmd, { encoding: "utf8", timeout: to });
    const skip = out.match(/^(?:\w+: )?SKIP .*/m);
    record(label, skip ? "SKIP" : "PASS", skip ? skip[0].replace(/^(?:\w+: )?SKIP\s*/, "").slice(0, 140) : (out.match(/(hubOneGateCheck|vinFirstVisitCheck|sitemapHonestyCheck): .*/) || [""])[0]);
  } catch (e) {
    record(label, "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
  }
}
// liveExamplesCheck (Lane B, Nov 7 2026): the Find examples (up to three live cars, different makes, soldBefore only on a VIN-confirmed completed sale, stable while live), the Tasks watching card (a different make from the Tasks example, status only within 24 hours, no reminder claim) and tasksDemo.shortRequest; crew gated; mutants in scripts/liveExamplesCheck.mjs --mutants.
try {
  const out = execSync("node scripts/liveExamplesCheck.mjs", { encoding: "utf8", timeout: 280000 });
  record("liveExamplesCheck (scripts/liveExamplesCheck.mjs)", "PASS", (out.match(/liveExamplesCheck: .*/) || [""])[0]);
} catch (e) {
  record("liveExamplesCheck (scripts/liveExamplesCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// exampleFallbackCheck (Lane B, Nov 8 2026): the three crew fallbacks (Find: three recent completed Porsche 911 sales; Tasks and watching: the last proved car kept after it ends, "Ended" and "Recent example", "Last bid $X"), figures only from the record, never a live label on an ended car, crew gated.
try {
  const out = execSync("node scripts/exampleFallbackCheck.mjs", { encoding: "utf8", timeout: 280000 });
  record("exampleFallbackCheck (scripts/exampleFallbackCheck.mjs)", "PASS", (out.match(/exampleFallbackCheck: .*/) || [""])[0]);
} catch (e) {
  record("exampleFallbackCheck (scripts/exampleFallbackCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// publicExamplesCheck (Lane B, Nov 10 2026): the entry page examples are STORED daily picks. Flag off (PUBLIC_EXAMPLES unset, the default): the public gets null for all nine, with no read; flag on: the public gets the stored pick byte equal to the crew read; a public request with no stored pick (or a stale one) makes zero engine, zero builder and zero vendor calls, writes nothing and answers null; each kill switch holds; the cron builds what the public reads. 14 mutants, among them one that builds on a public request.
try {
  const out = execSync("node scripts/publicExamplesCheck.mjs", { encoding: "utf8", timeout: 280000 });
  record("publicExamplesCheck (scripts/publicExamplesCheck.mjs)", "PASS", (out.match(/publicExamplesCheck: .*/) || [""])[0]);
} catch (e) {
  record("publicExamplesCheck (scripts/publicExamplesCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// engineCardShapeCheck (Lane B, Nov 8 2026): the three crew fields in Lane E's refine8 shapes (Find's engine card with its bid badge, platform tag, pills and SAM block lines; the Task row with Sam's read back sentence and the live count; the watching row), live and ended (card.sold).
try {
  const out = execSync("node scripts/engineCardShapeCheck.mjs", { encoding: "utf8", timeout: 280000 });
  record("engineCardShapeCheck (scripts/engineCardShapeCheck.mjs)", "PASS", (out.match(/engineCardShapeCheck: .*/) || [""])[0]);
} catch (e) {
  record("engineCardShapeCheck (scripts/engineCardShapeCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// sheetPoolCheck (Lane B, Nov 8 2026): the Desk sheet reads as the whole market: every sale of the body and tier pool with its own photo, the venue's name and its tier (never three rows), the count and the range stated plainly (no wider pool, no apology), only live cars of the picked body, the range meter's low, p25, median, p75 and high.
try {
  const out = execSync("node scripts/sheetPoolCheck.mjs", { encoding: "utf8", timeout: 280000 });
  record("sheetPoolCheck (scripts/sheetPoolCheck.mjs)", "PASS", (out.match(/sheetPoolCheck: .*/) || [""])[0]);
} catch (e) {
  record("sheetPoolCheck (scripts/sheetPoolCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// tasksEmailExampleCheck (Lane B, Nov 8 2026): the Task email example: the block the email template renders for a stored match update (the 1995 BMW M3 Coupe, else the latest real one), never invented, crew gated.
try {
  const out = execSync("node scripts/tasksEmailExampleCheck.mjs", { encoding: "utf8", timeout: 280000 });
  record("tasksEmailExampleCheck (scripts/tasksEmailExampleCheck.mjs)", "PASS", (out.match(/tasksEmailExampleCheck: .*/) || [""])[0]);
} catch (e) {
  record("tasksEmailExampleCheck (scripts/tasksEmailExampleCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// findPickVarietyCheck (Lane B, Nov 8 2026): the Find examples' pick prefers three platforms, then decades, colours and bodies; always different makes.
try {
  const out = execSync("node scripts/findPickVarietyCheck.mjs", { encoding: "utf8", timeout: 280000 });
  record("findPickVarietyCheck (scripts/findPickVarietyCheck.mjs)", "PASS", (out.match(/findPickVarietyCheck: .*/) || [""])[0]);
} catch (e) {
  record("findPickVarietyCheck (scripts/findPickVarietyCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// findPickCheck (Lane B, Nov 8 2026): the Find examples' daily pick (Bring a Trailer, Cars & Bids, a third platform; three makes; never the three newest; a real photo; a car sold before) and the hourly revalidation (an ended or withdrawn car replaced at once; the existing cron slot).
try {
  const out = execSync("node scripts/findPickCheck.mjs", { encoding: "utf8", timeout: 280000 });
  record("findPickCheck (scripts/findPickCheck.mjs)", "PASS", (out.match(/findPickCheck: .*/) || [""])[0]);
} catch (e) {
  record("findPickCheck (scripts/findPickCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// hourlyRevalidateCheck (Lane B, Nov 8 2026): the Tasks example and the Homepage pick are confirmed live hourly by keyed reads only (no matcher, no OldCarsData); an ended one is cleared and the fallback serves.
try {
  const out = execSync("node scripts/hourlyRevalidateCheck.mjs", { encoding: "utf8", timeout: 280000 });
  record("hourlyRevalidateCheck (scripts/hourlyRevalidateCheck.mjs)", "PASS", (out.match(/hourlyRevalidateCheck: .*/) || [""])[0]);
} catch (e) {
  record("hourlyRevalidateCheck (scripts/hourlyRevalidateCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// photoRuleCheck (Lane B, Nov 8 2026): every crew example pick HEADs its first photo at selection (a 200 image under 600 KB), else the listing's next photo, else the car is skipped.
try {
  const out = execSync("node scripts/photoRuleCheck.mjs", { encoding: "utf8", timeout: 280000 });
  record("photoRuleCheck (scripts/photoRuleCheck.mjs)", "PASS", (out.match(/photoRuleCheck: .*/) || [""])[0]);
} catch (e) {
  record("photoRuleCheck (scripts/photoRuleCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/mcExamplesCheck.mjs", { encoding: "utf8", timeout: 280000 });
  record("Market Check example sales in Lane E's shape: the reader accepts it, no card without a real sale and a photo under 600 KB, the daily pick stable and different across days, the kill switch hides the section, the photos re-checked hourly; eleven mutants (scripts/mcExamplesCheck.mjs)", "PASS", (out.match(/mcExamplesCheck: .*/) || [""])[0]);
} catch (e) {
  record("Market Check example sales in Lane E's shape: the reader accepts it, no card without a real sale and a photo under 600 KB, the daily pick stable and different across days, the kill switch hides the section, the photos re-checked hourly; eleven mutants (scripts/mcExamplesCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/sellExampleCheck.mjs", { encoding: "utf8", timeout: 280000 });
  record("Sell example in Lane E's shape: the reader accepts it, every number traces to the Sell answer, sentences from the reason table, fewer than two cars hides the section, the kill switch; nine mutants (scripts/sellExampleCheck.mjs)", "PASS", (out.match(/sellExampleCheck: .*/) || [""])[0]);
} catch (e) {
  record("Sell example in Lane E's shape: the reader accepts it, every number traces to the Sell answer, sentences from the reason table, fewer than two cars hides the section, the kill switch; nine mutants (scripts/sellExampleCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// mcExampleCheck (Lane B, Nov 9 2026): the Market Check entry card (range, count, period and recent sale from one engine answer, the sale inside the pool, no narrowing, the most focused range preferred); eleven mutants.
try {
  const out = execSync("node scripts/mcExampleCheck.mjs", { encoding: "utf8", timeout: 250000 });
  record("Market Check entry card: one engine answer, recent sale inside the pool, no narrowing; eleven mutants (scripts/mcExampleCheck.mjs)", /, 0 FAIL/.test(out), (out.match(/mcExampleCheck: .*/) || [""])[0]);
} catch (e) {
  record("Market Check entry card: one engine answer, recent sale inside the pool, no narrowing; eleven mutants (scripts/mcExampleCheck.mjs)", false, String(e.stdout || e.message).split("\n").filter(l => /FAIL/.test(l)).slice(0, 3).join(" | "));
}
// findIntelCheck (Lane B, Nov 9 2026): the Find cards' intelligence line (sold_before only with a recorded sale, listed_before never with a price, market_range equals the engine's band, no invented line, cars only); eleven mutants.
try {
  const out = execSync("node scripts/findIntelCheck.mjs", { encoding: "utf8", timeout: 250000 });
  record("Find card intelligence: sold before, market range, listed before, none; cars only; eleven mutants (scripts/findIntelCheck.mjs)", /, 0 FAIL/.test(out), (out.match(/findIntelCheck: .*/) || [""])[0]);
} catch (e) {
  record("Find card intelligence: sold before, market range, listed before, none; cars only; eleven mutants (scripts/findIntelCheck.mjs)", false, String(e.stdout || e.message).split("\n").filter(l => /FAIL/.test(l)).slice(0, 3).join(" | "));
}
// functionBundleCheck (Lane B, Nov 9 2026): every file a module loaded by a variable path needs (api/crewPage.js readers, api/pullLive.js run) is reached by a literal import or copied by includeFiles; the Sell example was empty because three files were in no bundle.
try {
  const out = execSync("node scripts/functionBundleCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("Function bundles: every file a variable-path module needs ships with its function, and so does the closure of every public function that imports an example reader; six mutants (scripts/functionBundleCheck.mjs)", /, 0 FAIL/.test(out), (out.match(/functionBundleCheck: .*/) || [""])[0]);
} catch (e) {
  record("Function bundles: every file a variable-path module needs ships with its function, and so does the closure of every public function that imports an example reader; six mutants (scripts/functionBundleCheck.mjs)", false, String(e.stdout || e.message).split("\n").filter(l => /FAIL/.test(l)).slice(0, 3).join(" | "));
}
// entryExamplesCheck (Lane B, Nov 8 2026): marketCheckExampleSales (three real sales of one model that show mileage moving the price) and sellExample (one model's record by venue from the Sell engine): daily pick, crew gate, never invented.
try {
  const out = execSync("node scripts/entryExamplesCheck.mjs", { encoding: "utf8", timeout: 280000 });
  record("entryExamplesCheck (scripts/entryExamplesCheck.mjs)", "PASS", (out.match(/entryExamplesCheck: .*/) || [""])[0]);
} catch (e) {
  record("entryExamplesCheck (scripts/entryExamplesCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// findSortsCheck (Lane E, Nov 3 2026): the sort menu's "Furthest below the range" and "Closest to me" are the engine's orders, re-applied on every Show more at 1440 and 390; the ZIP is asked once and kept for the session.
try {
  const out = execSync("node scripts/findSortsCheck.mjs", { encoding: "utf8", timeout: 280000 });
  record("findSortsCheck (scripts/findSortsCheck.mjs)", "PASS", (out.match(/findSortsCheck: .*/) || [""])[0]);
} catch (e) {
  record("findSortsCheck (scripts/findSortsCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// hiddenCrewCheck (Lane E, Nov 3 2026, lane-e-hidecrew): a crew-only address asked without the crew cookie answers the ordinary 404 (status, headers, body), with the cookie it works, and no public file names it.
try {
  const out = execSync("node scripts/hiddenCrewCheck.mjs", { encoding: "utf8", timeout: 200000 });
  record("hiddenCrewCheck (scripts/hiddenCrewCheck.mjs)", "PASS", (out.match(/hiddenCrewCheck.*: .*/) || [""])[0]);
} catch (e) {
  record("hiddenCrewCheck (scripts/hiddenCrewCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// pageSortCheck (Lane E, Nov 4 2026, lane-e-pagesort): pages sort nothing. Every sort in page code is reviewed (an engine list is never sorted by a page), and three cars rendered in Chrome (a result card, a thin car with set-aside rows, the partner page with Highest price chosen) print the order the engine sent.
try {
  const out = execSync("node scripts/pageSortCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("Pages sort nothing: sales, tiles, set-aside rows print in the engine's order (scripts/pageSortCheck.mjs)", "PASS", (out.match(/pageSortCheck: .*/) || [""])[0]);
} catch (e) {
  record("Pages sort nothing: sales, tiles, set-aside rows print in the engine's order (scripts/pageSortCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// sheetRenderCheck (Lane E, Nov 4 2026, lane-e-desk-valuations): Desk Valuations: every section of the sheet prints from the sheetRead object, the page computes nothing (three mutants caught).
try {
  const out = execSync("node scripts/sheetRenderCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("Desk Valuations: every section of the sheet prints from the sheetRead object, the page computes nothing (three mutants caught) (scripts/sheetRenderCheck.mjs)", "PASS", (out.match(/sheetRenderCheck: .*/) || [""])[0]);
} catch (e) {
  record("Desk Valuations: every section of the sheet prints from the sheetRead object, the page computes nothing (three mutants caught) (scripts/sheetRenderCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// reasonRulesCheck (Lane E, Nov 4 2026, lane-e-desk-valuations): Desk Valuations: the reserve, range and guard rules at finalise, refused and allowed, and printed inline.
try {
  const out = execSync("node scripts/reasonRulesCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("Desk Valuations: the reserve, range and guard rules at finalise, refused and allowed, and printed inline (scripts/reasonRulesCheck.mjs)", "PASS", (out.match(/reasonRulesCheck: .*/) || [""])[0]);
} catch (e) {
  record("Desk Valuations: the reserve, range and guard rules at finalise, refused and allowed, and printed inline (scripts/reasonRulesCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// tasksCrewExportCheck (Lane S, Nov 5 2026, lane-s-tasks10-exports): Tasks: the crew limit export and badge.unread are crew only and a non crew answer is unchanged.
try {
  const out = execSync("node scripts/tasksCrewExportCheck.mjs", { encoding: "utf8", timeout: 600000 });
  record("Tasks: the crew limit export and badge.unread are crew only and a non crew answer is unchanged (scripts/tasksCrewExportCheck.mjs)", "PASS", (out.match(/tasksCrewExportCheck: .*/) || [""])[0]);
} catch (e) {
  record("Tasks: the crew limit export and badge.unread are crew only and a non crew answer is unchanged (scripts/tasksCrewExportCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// tasksLeftCheck (Lane S, Nov 6 2026, lane-s-tasks10-left): Tasks: limit.left and counts.tasks.left are max minus working, never below zero, and no page subtracts.
try {
  const out = execSync("node scripts/tasksLeftCheck.mjs", { encoding: "utf8", timeout: 600000 });
  record("Tasks: limit.left is max minus working for three and ten, and no page subtracts (scripts/tasksLeftCheck.mjs)", "PASS", (out.match(/tasksLeftCheck: .*/) || [""])[0]);
} catch (e) {
  record("Tasks: limit.left is max minus working for three and ten, and no page subtracts (scripts/tasksLeftCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// tasksTapPageCheck (Lane S, Nov 5 2026, lane-s-tasks10-exports): Tasks: the email tap page when the account is at its limit.
try {
  const out = execSync("node scripts/tasksTapPageCheck.mjs", { encoding: "utf8", timeout: 600000 });
  record("Tasks: the email tap page when the account is at its limit (scripts/tasksTapPageCheck.mjs)", "PASS", (out.match(/tasksTapPageCheck: .*/) || [""])[0]);
} catch (e) {
  record("Tasks: the email tap page when the account is at its limit (scripts/tasksTapPageCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// tasksCrewLimitCheck (Lane S, Nov 5 2026, lane-s-tasks10): Tasks: the crew-only limit of ten fails closed on every other door.
try {
  const out = execSync("node scripts/tasksCrewLimitCheck.mjs", { encoding: "utf8", timeout: 600000 });
  record("Tasks: the crew-only limit of ten fails closed on every other door (scripts/tasksCrewLimitCheck.mjs)", "PASS", (out.match(/tasksCrewLimitCheck[^\n]*: .*/) || out.trim().split("\n").slice(-1))[0]);
} catch (e) {
  record("Tasks: the crew-only limit of ten fails closed on every other door (scripts/tasksCrewLimitCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// taskLimitLiteralCheck (Lane S, Nov 5 2026, lane-s-tasks10): Tasks: no hard coded limit, the limit checks pass with the constant at 3 and at 10.
try {
  const out = execSync("node scripts/taskLimitLiteralCheck.mjs", { encoding: "utf8", timeout: 600000 });
  record("Tasks: no hard coded limit, the limit checks pass with the constant at 3 and at 10 (scripts/taskLimitLiteralCheck.mjs)", "PASS", (out.match(/taskLimitLiteralCheck[^\n]*: .*/) || out.trim().split("\n").slice(-1))[0]);
} catch (e) {
  record("Tasks: no hard coded limit, the limit checks pass with the constant at 3 and at 10 (scripts/taskLimitLiteralCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// tasksMatcherReadCheck (Lane S, Nov 5 2026, lane-s-tasks10): Tasks: the matcher reads every running Task, fairly, inside its time budget.
try {
  const out = execSync("node scripts/tasksMatcherReadCheck.mjs", { encoding: "utf8", timeout: 600000 });
  record("Tasks: the matcher reads every running Task, fairly, inside its time budget (scripts/tasksMatcherReadCheck.mjs)", "PASS", (out.match(/tasksMatcherReadCheck[^\n]*: .*/) || out.trim().split("\n").slice(-1))[0]);
} catch (e) {
  record("Tasks: the matcher reads every running Task, fairly, inside its time budget (scripts/tasksMatcherReadCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// tasksSendPaceCheck (Lane S, Nov 5 2026, lane-s-tasks10): Tasks: the email runs pace, back off on a rate limit and lose no queued update.
try {
  const out = execSync("node scripts/tasksSendPaceCheck.mjs", { encoding: "utf8", timeout: 600000 });
  record("Tasks: the email runs pace, back off on a rate limit and lose no queued update (scripts/tasksSendPaceCheck.mjs)", "PASS", (out.match(/tasksSendPaceCheck[^\n]*: .*/) || out.trim().split("\n").slice(-1))[0]);
} catch (e) {
  record("Tasks: the email runs pace, back off on a rate limit and lose no queued update (scripts/tasksSendPaceCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// tasksBadgeCheck (Lane S, Nov 5 2026, lane-s-tasks10): Tasks: the crew-only unread badge, everyone else byte for byte as before.
try {
  const out = execSync("node scripts/tasksBadgeCheck.mjs", { encoding: "utf8", timeout: 600000 });
  record("Tasks: the crew-only unread badge, everyone else byte for byte as before (scripts/tasksBadgeCheck.mjs)", "PASS", (out.match(/tasksBadgeCheck[^\n]*: .*/) || out.trim().split("\n").slice(-1))[0]);
} catch (e) {
  record("Tasks: the crew-only unread badge, everyone else byte for byte as before (scripts/tasksBadgeCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// tasksRunTimeCheck (Lane S, Nov 5 2026, lane-s-tasks10): Tasks: the nightly run time check's own logic.
try {
  const out = execSync("node scripts/tasksRunTimeCheck.mjs --selftest", { encoding: "utf8", timeout: 600000 });
  record("Tasks: the nightly run time check's own logic (scripts/tasksRunTimeCheck.mjs)", "PASS", (out.match(/tasksRunTimeCheck[^\n]*: .*/) || out.trim().split("\n").slice(-1))[0]);
} catch (e) {
  record("Tasks: the nightly run time check's own logic (scripts/tasksRunTimeCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// tasksRunTimeCheck, the nightly read itself (Lane S, Nov 5 2026, lane-s-tasks10-offline): with no Supabase it prints "tasksRunTimeCheck: SKIP ..." and exits 0, which is a SKIP here, never a pass. With Supabase it reads the real log and the 60% rule decides.
try {
  const out = execSync("node scripts/tasksRunTimeCheck.mjs", { encoding: "utf8", timeout: 120000 });
  const line = (out.match(/tasksRunTimeCheck: .*/) || [""])[0];
  record("Tasks: the nightly run time read (scripts/tasksRunTimeCheck.mjs)", /SKIP/.test(line) ? "SKIP" : "PASS", line);
} catch (e) {
  record("Tasks: the nightly run time read (scripts/tasksRunTimeCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// skipSummaryCheck (Lane S, Nov 5 2026): a check that skips as a whole prints its own "<name>: ... SKIP" line, so prePush reads it as a SKIP, not a FAIL.
try {
  const out = execSync("node scripts/skipSummaryCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("a whole-check SKIP prints its own summary line (scripts/skipSummaryCheck.mjs)", "PASS", (out.match(/skipSummaryCheck: .*/) || [""])[0]);
} catch (e) {
  record("a whole-check SKIP prints its own summary line (scripts/skipSummaryCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// deskDoorsCheck (Lane S, Nov 5 2026): Desk doors: a crew + seat person, the View as switch, org isolation, the seat cookie at sign in.
try {
  const out = execSync("node scripts/deskDoorsCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("Desk doors: a crew + seat person, the View as switch, org isolation, the seat cookie at sign in (scripts/deskDoorsCheck.mjs)", "PASS", (out.match(/deskDoorsCheck: .*/) || [""])[0]);
} catch (e) {
  record("Desk doors: a crew + seat person, the View as switch, org isolation, the seat cookie at sign in (scripts/deskDoorsCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// deskViewAsPageCheck (Lane S, Nov 5 2026): Desk footer says who is looking and offers the way back.
try {
  const out = execSync("node scripts/deskViewAsPageCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("Desk footer says who is looking and offers the way back (scripts/deskViewAsPageCheck.mjs)", "PASS", (out.match(/deskViewAsPageCheck: .*/) || [""])[0]);
} catch (e) {
  record("Desk footer says who is looking and offers the way back (scripts/deskViewAsPageCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// deskSaveOrderCheck (Lane S, Nov 5 2026): the Desk page's saves are merged, ordered and flushed before Finalise seals a sheet; each rule runs against a mutant that drops it.
try {
  const out = execSync("node scripts/deskSaveOrderCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("Desk Valuations: saves merged, ordered and flushed before Finalise (scripts/deskSaveOrderCheck.mjs)", "PASS", (out.match(/deskSaveOrderCheck: .*/) || [""])[0]);
} catch (e) {
  record("Desk Valuations: saves merged, ordered and flushed before Finalise (scripts/deskSaveOrderCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// pdfLayoutCheck (Lane E, Nov 4 2026, lane-e-desk-valuations): Desk Valuations: the report PDF has the ten parts, the org logo, no expert's name, the footer and watermark on every page, and the Send panel.
try {
  const out = execSync("node scripts/pdfLayoutCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("Desk Valuations: the report PDF has the ten parts, the org logo, no expert's name, the footer and watermark on every page, and the Send panel (scripts/pdfLayoutCheck.mjs)", "PASS", (out.match(/pdfLayoutCheck: .*/) || [""])[0]);
} catch (e) {
  record("Desk Valuations: the report PDF has the ten parts, the org logo, no expert's name, the footer and watermark on every page, and the Send panel (scripts/pdfLayoutCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// deskRailCheck (Lane E, Nov 4 2026, lane-e-desk-valuations): Desk Valuations: the rail, the queue, company search, ownership, pick up, read only and tenant isolation.
try {
  const out = execSync("node scripts/deskRailCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("Desk Valuations: the rail, the queue, company search, ownership, pick up, read only and tenant isolation (scripts/deskRailCheck.mjs)", "PASS", (out.match(/deskRailCheck: .*/) || [""])[0]);
} catch (e) {
  record("Desk Valuations: the rail, the queue, company search, ownership, pick up, read only and tenant isolation (scripts/deskRailCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// previewCopyCheck (Lane E, Nov 4 2026, lane-e-home-preview): the crew previews /preview/home and /preview/find keep the copy and palette rules (no typed figure, dash, orange or red, first person Sam, competitor name, live bid), and the check catches each when injected.
try {
  const out = execSync("node scripts/previewCopyCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("The crew previews keep the copy and palette rules (scripts/previewCopyCheck.mjs)", "PASS", (out.match(/previewCopyCheck: .*/) || [""])[0]);
} catch (e) {
  record("The crew previews keep the copy and palette rules (scripts/previewCopyCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// logLinesCheck (Lane E, Nov 3 2026, lane-e-vercelcost): a hot path (Find search, Show more, enrich, the card popup, Market Check) prints at most 2 console lines per request; no un-gated diagnostic line in api/ or lib/; only runtime folders are deployable.
try {
  const out = execSync("node scripts/logLinesCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("logLinesCheck (scripts/logLinesCheck.mjs)", "PASS", (out.match(/logLinesCheck: .*/) || [""])[0]);
} catch (e) {
  record("logLinesCheck (scripts/logLinesCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// sitemapValidCheck (Lane E, Nov 3 2026): every sitemap response is application/xml; charset=utf-8, starts with the XML declaration, is valid against the sitemaps.org schema, lists only absolute goasksam.com URLs, and an index lists no index.
try {
  const out = execSync("node scripts/sitemapValidCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("sitemapValidCheck (scripts/sitemapValidCheck.mjs)", "PASS", (out.match(/sitemapValidCheck.*: .*/) || [""])[0]);
} catch (e) {
  record("sitemapValidCheck (scripts/sitemapValidCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// indexingCheck (Lane E, Nov 3 2026): every public page answers 200 to Googlebot, one self canonical, no noindex, title and H1 in the server HTML, in the pages sitemap; vercel.app and the second addresses 301. (--live reads goasksam.com; not run here.)
try {
  const out = execSync("node scripts/indexingCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("indexingCheck (scripts/indexingCheck.mjs)", "PASS", (out.match(/indexingCheck.*: .*/) || [""])[0]);
} catch (e) {
  record("indexingCheck (scripts/indexingCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// pageSliceCheck (Lane E, Nov 3 2026): no check runs a fragment of a page function (a lift must start at a declaration).
try {
  const out = execSync("node scripts/pageSliceCheck.mjs", { encoding: "utf8", timeout: 60000 });
  record("pageSliceCheck (scripts/pageSliceCheck.mjs)", "PASS", (out.match(/pageSliceCheck: .*/) || [""])[0]);
} catch (e) {
  record("pageSliceCheck (scripts/pageSliceCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// findShowMoreCheck (Lane E, Nov 2 2026): any Find search with more matches than one batch shows ONE "Show N more" at the foot that asks the engine for the next batch of the same search; the shown and remaining counts are the engine's own (pageMeta), the filters go back, the last batch removes the button. 1440 and 390. No network.
try {
  const out = execSync("node scripts/findShowMoreCheck.mjs", { encoding: "utf8", timeout: 280000 });
  record("findShowMoreCheck (scripts/findShowMoreCheck.mjs)", "PASS", (out.match(/findShowMoreCheck: .*/) || [""])[0]);
} catch (e) {
  record("findShowMoreCheck (scripts/findShowMoreCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// findMoreReadingCheck (Lane E, Nov 2 2026): a Show more batch returns within the engine's batch time with each card either ranged or on the engine's being-read line, the button says Reading... and ignores a second press, one ask at a time, no card twice, a failed ask gives the button back. 1440 and 390. No network.
try {
  const out = execSync("node scripts/findMoreReadingCheck.mjs", { encoding: "utf8", timeout: 280000 });
  record("findMoreReadingCheck (scripts/findMoreReadingCheck.mjs)", "PASS", (out.match(/findMoreReadingCheck: .*/) || [""])[0]);
} catch (e) {
  record("findMoreReadingCheck (scripts/findMoreReadingCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// copyCheck (Lane E, Nov 1 2026): data/copy.json, the one file of static page words, is valid and within the copy rules (no dashes, competitors, source counts, first person, over-long titles). No network.
try {
  const out = execSync("node scripts/copyCheck.mjs", { encoding: "utf8", timeout: 280000 });
  record("copyCheck (scripts/copyCheck.mjs)", "PASS", (out.match(/copyCheck: .*/) || [""])[0]);
} catch (e) {
  record("copyCheck (scripts/copyCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// copyProposalsCheck (Lane E, Nov 1 2026): docs/copy-proposals.md matches data/copy.json, its counts are right, every proposal fits and follows the copy rules, and every over-length title or description has one. No network.
try {
  const out = execSync("node scripts/copyProposalsCheck.mjs", { encoding: "utf8", timeout: 280000 });
  record("copyProposalsCheck (scripts/copyProposalsCheck.mjs)", "PASS", (out.match(/copyProposalsCheck: .*/) || [""])[0]);
} catch (e) {
  record("copyProposalsCheck (scripts/copyProposalsCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
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
// The open site has one state (Lane E, Oct 30 2026): every public route answers a stranger with a page, and every rail and footer item is there, when the site is open as the runbook opens it. No network.
try {
  const out = execSync("node scripts/openSiteGateCheck.mjs", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  record("openSiteGateCheck (scripts/openSiteGateCheck.mjs)", "PASS", (out.match(/openSiteGateCheck: .*/) || [""])[0]);
} catch (e) {
  record("openSiteGateCheck (scripts/openSiteGateCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
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
// The launch holding page at, before and after zero, in a real browser (no network, no key; SKIP when Chrome is not installed).
try {
  if (!fs.existsSync(process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")) record("holdZeroCheck (scripts/holdZeroCheck.mjs)", "SKIP", "no Chrome");
  else { const out = execSync("node scripts/holdZeroCheck.mjs", { encoding: "utf8", timeout: 120000 }); record("holdZeroCheck (scripts/holdZeroCheck.mjs)", "PASS", (out.match(/holdZeroCheck: .*/) || [""])[0]); }
} catch (e) {
  record("holdZeroCheck (scripts/holdZeroCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// No check depends on the real clock without a fake one (Lane G, Oct 29 2026; holdPageCheck and holdZeroCheck failed after 7:00 AM). Reads the scripts only, no network.
try {
  const out = execSync("node scripts/clockCheck.mjs", { encoding: "utf8", timeout: 60000 });
  record("clockCheck (scripts/clockCheck.mjs)", "PASS", (out.match(/clockCheck: .*/) || [""])[0]);
} catch (e) {
  record("clockCheck (scripts/clockCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// The opening time is one setting that starts empty: no served file holds a launch time, and with LAUNCH_AT empty nothing prints a time or says "Opening now" (no network).
try {
  const out = execSync("node scripts/openingTimeCheck.mjs", { encoding: "utf8", timeout: 60000 });
  record("openingTimeCheck (scripts/openingTimeCheck.mjs)", "PASS", (out.match(/openingTimeCheck: .*/) || [""])[0]);
} catch (e) {
  record("openingTimeCheck (scripts/openingTimeCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
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
// The read-only storedsweep ops task finds a count that is not its pool, another car's sales, a noise word in a stored trim, and the pooled states (Lane B, Oct 27 2026, e95). No network.
try {
  const out = execSync("node scripts/storedSweepCheck.mjs", { encoding: "utf8" });
  record("storedsweep finds mismatched counts, wrong-car pools, noise trims and the pooled states, and writes nothing (scripts/storedSweepCheck.mjs)", "PASS", (out.match(/storedSweepCheck: .*/) || [""])[0]);
} catch (e) {
  record("storedsweep finds mismatched counts, wrong-car pools, noise trims and the pooled states, and writes nothing (scripts/storedSweepCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// The read-only milesfault ops task lists old cars with a stored mileage under 500 and nothing else (Lane B, Oct 28 2026). No network.
try {
  const out = execSync("node scripts/milesFaultCheck.mjs", { encoding: "utf8" });
  record("milesfault flags old low-mileage sales only, counts them by source and decade, and writes nothing (scripts/milesFaultCheck.mjs)", "PASS", (out.match(/milesFaultCheck: .*/) || [""])[0]);
} catch (e) {
  record("milesfault flags old low-mileage sales only, counts them by source and decade, and writes nothing (scripts/milesFaultCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// No dead end on a cold spec: the computing state asks again for 45 seconds, then one plain line (Sam, Oct 28 2026). Rendered in a browser.
try {
  const out = execSync("node scripts/coldPathCheck.mjs", { encoding: "utf8", timeout: 600000 });
  record("cold spec: reading line, asks every 2 seconds up to the engine's wait, then the plain line (scripts/coldPathCheck.mjs)", "PASS", (out.match(/coldPathCheck: .*/) || [""])[0]);
} catch (e) {
  record("cold spec: reading line, asks every 2 seconds up to the engine's wait, then the plain line (scripts/coldPathCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// A split answer with an option over the candle floor is never withheld: the scoped chart tries every option (Lane B, Oct 29 2026).
try {
  const out = execSync("node scripts/chartSplitFloorCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("chart: a split answer with an option over the floor draws that option's candles (scripts/chartSplitFloorCheck.mjs)", "PASS", (out.match(/chartSplitFloorCheck: .*/) || [""])[0]);
} catch (e) {
  record("chart: a split answer with an option over the floor draws that option's candles (scripts/chartSplitFloorCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// A make and a year with more than one model that has sales asks which one, before any range (Lane B, Oct 29 2026).
try {
  const out = execSync("node scripts/makeYearAskCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("resolver: a make and a year with more than one model that has sales asks which (scripts/makeYearAskCheck.mjs)", "PASS", (out.match(/makeYearAskCheck: .*/) || [""])[0]);
} catch (e) {
  record("resolver: a make and a year with more than one model that has sales asks which (scripts/makeYearAskCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// A stored none row always carries its reason (Lane B, Oct 29 2026).
try {
  const out = execSync("node scripts/noneRowReasonCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("core rows: a none row always carries its reason (scripts/noneRowReasonCheck.mjs)", "PASS", (out.match(/noneRowReasonCheck: .*/) || [""])[0]);
} catch (e) {
  record("core rows: a none row always carries its reason (scripts/noneRowReasonCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Every question the engine returns has a way out that reaches the normal search (Lane B, Oct 29 2026).
try {
  const out = execSync("node scripts/questionWayOutCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("questions: every question the engine returns has a way out to the normal search (scripts/questionWayOutCheck.mjs)", "PASS", (out.match(/questionWayOutCheck: .*/) || [""])[0]);
} catch (e) {
  record("questions: every question the engine returns has a way out to the normal search (scripts/questionWayOutCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Every taxonomy model has years or a named bucket, and no years we hold go unused (Lane B, Oct 29 2026).
try {
  const out = execSync("node scripts/modelYearsBucketCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("taxonomy: every model has production years or a named bucket, the calculator's years are used (scripts/modelYearsBucketCheck.mjs)", "PASS", (out.match(/modelYearsBucketCheck: .*/) || [""])[0]);
} catch (e) {
  record("taxonomy: every model has production years or a named bucket, the calculator's years are used (scripts/modelYearsBucketCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// The total count is printed once (Lane B, Oct 29 2026).
try {
  const out = execSync("node scripts/totalCountOnceCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("pages: the total count is stated once, the title line has none (scripts/totalCountOnceCheck.mjs)", "PASS", (out.match(/totalCountOnceCheck: .*/) || [""])[0]);
} catch (e) {
  record("pages: the total count is stated once, the title line has none (scripts/totalCountOnceCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// A Find card never says to pick, and the listing's own fields settle its option (Lane B, Oct 29 2026).
try {
  const out = execSync("node scripts/findNoPickCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("Find: the card never says pick or choose, real listings' fields settle the option (scripts/findNoPickCheck.mjs)", "PASS", (out.match(/findNoPickCheck: .*/) || [""])[0]);
} catch (e) {
  record("Find: the card never says pick or choose, real listings' fields settle the option (scripts/findNoPickCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// A row stored before the Find wording and the title line changed serves the current text (Lane B, Oct 29 2026, after e2b58967).
try {
  const out = execSync("node scripts/storedTextCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("stored rows: a row stored before the wording change serves the current lines (scripts/storedTextCheck.mjs)", "PASS", (out.match(/storedTextCheck: .*/) || [""])[0]);
} catch (e) {
  record("stored rows: a row stored before the wording change serves the current lines (scripts/storedTextCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// A withheld chart says the options' reason, not the pooled answer's (Lane B, Oct 29 2026).
try {
  const out = execSync("node scripts/chartWhyCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("chart: a withheld chart says why the options were withheld (scripts/chartWhyCheck.mjs)", "PASS", (out.match(/chartWhyCheck: .*/) || [""])[0]);
} catch (e) {
  record("chart: a withheld chart says why the options were withheld (scripts/chartWhyCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// A Find card stands on the answer of its own spec, whatever the typed text would ask (Lane B, Oct 29 2026).
try {
  const out = execSync("node scripts/findResolveCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("Find: a card stands on its own spec's answer for every question kind, never the stale core's numbers (scripts/findResolveCheck.mjs)", "PASS", (out.match(/findResolveCheck: .*/) || [""])[0]);
} catch (e) {
  record("Find: a card stands on its own spec's answer for every question kind, never the stale core's numbers (scripts/findResolveCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// The Find pre-fill writes rows the card reads without computing (Lane B, Oct 29 2026).
try {
  const out = execSync("node scripts/findPrefillCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("Find: the pre-fill writes the rows a card reads without computing (scripts/findPrefillCheck.mjs)", "PASS", (out.match(/findPrefillCheck: .*/) || [""])[0]);
} catch (e) {
  record("Find: the pre-fill writes the rows a card reads without computing (scripts/findPrefillCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// An answer with options states no total in its footer, each option its own count and since date, the title line never repeats the title's year (Lane B, Oct 29 2026).
try {
  const out = execSync("node scripts/footerOptionsCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("pages: options answers state no total in the footer, each option its own window, no repeated year (scripts/footerOptionsCheck.mjs)", "PASS", (out.match(/footerOptionsCheck: .*/) || [""])[0]);
} catch (e) {
  record("pages: options answers state no total in the footer, each option its own window, no repeated year (scripts/footerOptionsCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// The range sentence says what the range is, never "most" (Lane B, Oct 29 2026).
try {
  const out = execSync("node scripts/rangeSentenceShareCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("engine: the range sentence claims no share the range does not cover (scripts/rangeSentenceShareCheck.mjs)", "PASS", (out.match(/rangeSentenceShareCheck: .*/) || [""])[0])
} catch (e) {
  record("engine: the range sentence claims no share the range does not cover (scripts/rangeSentenceShareCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "))
}
// A range over far wider sales says so (Lane B, Oct 29 2026).
try {
  const out = execSync("node scripts/spreadLineCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("engine: Sam's range footer (two sentences, real low and high), the updated line, and the Find bid line with the time left (scripts/spreadLineCheck.mjs)", "PASS", (out.match(/spreadLineCheck: .*/) || [""])[0])
} catch (e) {
  record("engine: Sam's range footer (two sentences, real low and high), the updated line, and the Find bid line with the time left (scripts/spreadLineCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "))
}
// Lane B, Oct 29 2026: wrong-model classes (pool wildcard, title fragments, same-car table, code name forms).
try {
  const out = execSync("node scripts/poolWildcardCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("engine: the archive wildcard bridges a separator, not a sentence (scripts/poolWildcardCheck.mjs)", "PASS", (out.match(/poolWildcardCheck: .*/) || [""])[0])
} catch (e) {
  record("engine: the archive wildcard bridges a separator, not a sentence (scripts/poolWildcardCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "))
}
try {
  const out = execSync("node scripts/titleFragmentModelCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("resolver: a title fragment (Years, Single, Custom) is never a model (scripts/titleFragmentModelCheck.mjs)", "PASS", (out.match(/titleFragmentModelCheck: .*/) || [""])[0])
} catch (e) {
  record("resolver: a title fragment (Years, Single, Custom) is never a model (scripts/titleFragmentModelCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "))
}
try {
  const out = execSync("node scripts/invariantNameFormsCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("engine: the receipts invariant reads a code in every form titles write it (scripts/invariantNameFormsCheck.mjs)", "PASS", (out.match(/invariantNameFormsCheck: .*/) || [""])[0])
} catch (e) {
  record("engine: the receipts invariant reads a code in every form titles write it (scripts/invariantNameFormsCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "))
}
try {
  const out = execSync("node scripts/distinctTrimPoolCheck.mjs", { encoding: "utf8", timeout: 150000 });
  record("engine: a typed trim that names a distinct car (Spyder, GT3, Z06...) is never another car's answer (scripts/distinctTrimPoolCheck.mjs)", "PASS", (out.match(/distinctTrimPoolCheck: .*/) || [""])[0])
} catch (e) {
  record("engine: a typed trim that names a distinct car (Spyder, GT3, Z06...) is never another car's answer (scripts/distinctTrimPoolCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "))
}
try {
  const out = execSync("node scripts/chassisCodeTypedCheck.mjs", { encoding: "utf8", timeout: 150000 });
  record("engine: a chassis code typed in front of the model (997.2) is the car's own generation, not a different model (scripts/chassisCodeTypedCheck.mjs)", "PASS", (out.match(/chassisCodeTypedCheck: .*/) || [""])[0])
} catch (e) {
  record("engine: a chassis code typed in front of the model (997.2) is the car's own generation, not a different model (scripts/chassisCodeTypedCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "))
}
try {
  const out = execSync("node scripts/generationQuestionCheck.mjs", { encoding: "utf8", timeout: 150000 });
  record("engine: a model whose sales span generations asks which when no year is typed, with years and counts (scripts/generationQuestionCheck.mjs)", "PASS", (out.match(/generationQuestionCheck: .*/) || [""])[0])
} catch (e) {
  record("engine: a model whose sales span generations asks which when no year is typed, with years and counts (scripts/generationQuestionCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "))
}
try {
  const out = execSync("node scripts/photoHostCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("engine: a photo on a dead host is never handed to a page (scripts/photoHostCheck.mjs)", "PASS", (out.match(/photoHostCheck: .*/) || [""])[0])
} catch (e) {
  record("engine: a photo on a dead host is never handed to a page (scripts/photoHostCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "))
}
// A lot that is not a vehicle is not a car anywhere: no Find card, no spec match, no sales pool (Lane B, Oct 29 2026).
// An answer that prices apart places a typed price against each option's own range, never an empty list (Lane B, Nov 1 2026).
try {
  const out = execSync("node scripts/partnerApartCheck.mjs", { encoding: "utf8", timeout: 280000 });
  record("partner demo: an answer apart by body, gearbox, year or mileage places typed prices and sales per option (scripts/partnerApartCheck.mjs)", "PASS", (out.match(/partnerApartCheck: .*/) || [""])[0]);
} catch (e) {
  record("partner demo: an answer apart by body, gearbox, year or mileage places typed prices and sales per option (scripts/partnerApartCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// partnerOrderCheck (Lane E, Nov 1 2026): each sort order picks its five from the engine's FULL set of sales (highest price returns the five highest, newest the five most recent, closest miles the five nearest), for every demo car, on a single range and on every option of an apart answer. No network.
try {
  const out = execSync("node scripts/partnerOrderCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("partner demo: every sort order returns the right five of the full set (scripts/partnerOrderCheck.mjs)", "PASS", (out.match(/partnerOrderCheck: .*/) || [""])[0]);
} catch (e) {
  record("partner demo: every sort order returns the right five of the full set (scripts/partnerOrderCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/nonVehicleCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("lots: an engine, wheels, literature or parts lot is never a car card, a spec match or a sale in a pool (scripts/nonVehicleCheck.mjs)", "PASS", (out.match(/nonVehicleCheck: .*/) || [""])[0]);
} catch (e) {
  record("lots: an engine, wheels, literature or parts lot is never a car card, a spec match or a sale in a pool (scripts/nonVehicleCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// A generation phrase ("first gen", "Mk1") is the generation table's row, never a trim or years the chat made up (Lane B, Nov 1 2026).
try {
  const out = execSync("node scripts/genPhraseCheck.mjs", { encoding: "utf8", timeout: 280000 });
  record("generation phrases: first gen, Mk1, gen 1 on every car with a generation table are the table's row, never a trim or made-up years (scripts/genPhraseCheck.mjs)", "PASS", (out.match(/genPhraseCheck: .*/) || [""])[0]);
} catch (e) {
  record("generation phrases: first gen, Mk1, gen 1 on every car with a generation table are the table's row, never a trim or made-up years (scripts/genPhraseCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/namedModelCheck.mjs", { encoding: "utf8", timeout: 280000 });
  record("Find and every live search: a model or trim the reader named is never dropped to the whole make, no filter appears that was not typed, and a badge-engineered car (Ford and Mercury Capri) is read under both badges (scripts/namedModelCheck.mjs)", "PASS", (out.match(/namedModelCheck: .*/) || [""])[0]);
} catch (e) {
  record("Find and every live search: a model or trim the reader named is never dropped to the whole make, no filter appears that was not typed, and a badge-engineered car (Ford and Mercury Capri) is read under both badges (scripts/namedModelCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/bareModelCheck.mjs", { encoding: "utf8", timeout: 280000 });
  record("a bare model name, a make and model, a badge twin (Capri under Ford and Mercury) and a style word in a title (RS-Style) never read as nothing or as a trim, on Find, Market Check, the chat and Tasks (scripts/bareModelCheck.mjs)", "PASS", (out.match(/bareModelCheck: .*/) || [""])[0]);
} catch (e) {
  record("a bare model name, a make and model, a badge twin (Capri under Ford and Mercury) and a style word in a title (RS-Style) never read as nothing or as a trim, on Find, Market Check, the chat and Tasks (scripts/bareModelCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/whichChipsCheck.mjs", { encoding: "utf8", timeout: 180000 });
  record("Which model: no chip cut at a space, no duplicate, no variant beside its model (scripts/whichChipsCheck.mjs)", "PASS", (out.match(/whichChipsCheck: .*/) || [""])[0]);
} catch (e) {
  record("Which model: no chip cut at a space, no duplicate, no variant beside its model (scripts/whichChipsCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/countsCheck.mjs", { encoding: "utf8", timeout: 180000 });
  record("counts: options, remainder and the table caption add up, no chip cut at a space (Lane F's check) (scripts/countsCheck.mjs)", "PASS", (out.match(/countsCheck: .*/) || [""])[0]);
} catch (e) {
  record("counts: options, remainder and the table caption add up, no chip cut at a space (Lane F's check) (scripts/countsCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/filtersRangeCheck.mjs", { encoding: "utf8", timeout: 180000 });
  record("filters: a narrowed answer is computed from its own sales, says which filter is on, keeps its basis once (scripts/filtersRangeCheck.mjs)", "PASS", (out.match(/filtersRangeCheck: .*/) || [""])[0]);
} catch (e) {
  record("filters: a narrowed answer is computed from its own sales, says which filter is on, keeps its basis once (scripts/filtersRangeCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/bodiesOrderAsideCheck.mjs", { encoding: "utf8", timeout: 180000 });
  record("bodies, option order and the set-aside line (one vocabulary, ranges first, the count said once) (scripts/bodiesOrderAsideCheck.mjs)", "PASS", (out.match(/bodiesOrderAsideCheck: .*/) || [""])[0]);
} catch (e) {
  record("bodies, option order and the set-aside line (one vocabulary, ranges first, the count said once) (scripts/bodiesOrderAsideCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// A VIN search is a typed search of the car it names, plus the car's own facts (Lane B, Oct 29 2026).
try {
  const out = execSync("node scripts/vinTypedCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("VIN: the VIN answer and the typed answer of the same car are the same, field by field (scripts/vinTypedCheck.mjs)", "PASS", (out.match(/vinTypedCheck: .*/) || [""])[0]);
} catch (e) {
  record("VIN: the VIN answer and the typed answer of the same car are the same, field by field (scripts/vinTypedCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// A nightly cache builder survives an apart, a thin and a no-range answer, and the warm jobs do not wait for it (Lane B, Nov 2 2026).
try {
  const out = execSync("node scripts/nightlyExampleCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("Nightly: every example builder survives an apart, thin and no-range answer; warm, attempts, premium and cube need ingest only (scripts/nightlyExampleCheck.mjs)", "PASS", (out.match(/nightlyExampleCheck: .*/) || [""])[0]);
} catch (e) {
  record("Nightly: every example builder survives an apart, thin and no-range answer; warm, attempts, premium and cube need ingest only (scripts/nightlyExampleCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Market Check, a VIN and its mileage: stored key, sibling trims, nearest sales, one mileage, one "Narrowed to" (Lane B, Nov 2 2026).
try {
  const out = execSync("node scripts/mcVinCheck.mjs", { encoding: "utf8", timeout: 280000 });
  record("Market Check: a VIN reads its trim's stored key, an asked trim never shows a sibling's range, nearestSales, one mileage, one Narrowed to (scripts/mcVinCheck.mjs)", "PASS", (out.match(/mcVinCheck: .*/) || [""])[0]);
} catch (e) {
  record("Market Check: a VIN reads its trim's stored key, an asked trim never shows a sibling's range, nearestSales, one mileage, one Narrowed to (scripts/mcVinCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// The narrowed family read (behind pool_columns_enabled, off) gives the same verdict as the full read (Lane B, Nov 2 2026).
try {
  const out = execSync("node scripts/narrowReadCheck.mjs", { encoding: "utf8", timeout: 290000 });
  record("Thin read: the narrowed family read gives the same verdict as the full read on every seeded pool (scripts/narrowReadCheck.mjs)", "PASS", (out.match(/narrowReadCheck: .*/) || [""])[0]);
} catch (e) {
  record("Thin read: the narrowed family read gives the same verdict as the full read on every seeded pool (scripts/narrowReadCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// The narrowed-read override reaches only the read-only task, only with the crew cookie (Lane B, Nov 2 2026).
try {
  const out = execSync("node scripts/narrowFlagCheck.mjs", { encoding: "utf8", timeout: 290000 });
  record("Thin read: the per-request narrowed-read override is ignored without the crew cookie and reaches no page path (scripts/narrowFlagCheck.mjs)", "PASS", (out.match(/narrowFlagCheck: .*/) || [""])[0]);
} catch (e) {
  record("Thin read: the per-request narrowed-read override is ignored without the crew cookie and reaches no page path (scripts/narrowFlagCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// A VIN never asks a question it already answers (Lane B, Nov 2 2026).
try {
  const out = execSync("node scripts/vinSettleCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("VIN: a question the decode or the archive record of the VIN answers is not asked; an unsettled one is asked alone with its reason (scripts/vinSettleCheck.mjs)", "PASS", (out.match(/vinSettleCheck: .*/) || [""])[0]);
} catch (e) {
  record("VIN: a question the decode or the archive record of the VIN answers is not asked; an unsettled one is asked alone with its reason (scripts/vinSettleCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// The Sell flow never ends on the watch line alone, and a search never hangs without end (Lane B, Oct 29 2026).
try {
  const out = execSync("node scripts/sellEndingCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("Sell: the flow always ends on an answer or a plain sentence, and a wait always ends (scripts/sellEndingCheck.mjs)", "PASS", (out.match(/sellEndingCheck: .*/) || [""])[0]);
} catch (e) {
  record("Sell: the flow always ends on an answer or a plain sentence, and a wait always ends (scripts/sellEndingCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Every question the resolver and the engine ask carries a way out (Lane B, Oct 29 2026, Lane E's FULL).
try {
  const out = execSync("node scripts/questionPayloadsCheck.mjs", { encoding: "utf8", timeout: 180000 });
  record("questions: every clarification the resolver asks carries a way out, every engine question a way out or its skip (scripts/questionPayloadsCheck.mjs)", "PASS", (out.match(/questionPayloadsCheck: .*/) || [""])[0]);
} catch (e) {
  record("questions: every clarification the resolver asks carries a way out, every engine question a way out or its skip (scripts/questionPayloadsCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Every way the engine narrows an answer is named, with the refine that clears it (Lane B, Oct 29 2026, Lane E's FULL: typed mileage).
try {
  const out = execSync("node scripts/bodyNamePhraseCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("body: a body word inside a model's own name (Power Wagon, Traction Avant, Van Diemen) is not a body (scripts/bodyNamePhraseCheck.mjs)", "PASS", (out.match(/bodyNamePhraseCheck: .*/) || [""])[0]);
} catch (e) {
  record("body: a body word inside a model's own name (Power Wagon, Traction Avant, Van Diemen) is not a body (scripts/bodyNamePhraseCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/spacedTaxonomyModelCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("engine: a taxonomy model named with a space (RS 6 Avant, M 3, RX 7) is not refused for its own glued sales (scripts/spacedTaxonomyModelCheck.mjs)", "PASS", (out.match(/spacedTaxonomyModelCheck: .*/) || [""])[0]);
} catch (e) {
  record("engine: a taxonomy model named with a space (RS 6 Avant, M 3, RX 7) is not refused for its own glued sales (scripts/spacedTaxonomyModelCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/unusedWordsCodeCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("Find: a piece of the car's own name (the RS of RS 6) is never named as a word Sam did not use (scripts/unusedWordsCodeCheck.mjs)", "PASS", (out.match(/unusedWordsCodeCheck: .*/) || [""])[0]);
} catch (e) {
  record("Find: a piece of the car's own name (the RS of RS 6) is never named as a word Sam did not use (scripts/unusedWordsCodeCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/refusalNoCountCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("engine: a refusal prints no Based on N sales line, stored or fresh (scripts/refusalNoCountCheck.mjs)", "PASS", (out.match(/refusalNoCountCheck: .*/) || [""])[0]);
} catch (e) {
  record("engine: a refusal prints no Based on N sales line, stored or fresh (scripts/refusalNoCountCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/firstQuestionNowCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("Sell: the first question is drawn the moment the car is named, never after a cold read (the computing answer hands the car to Sell) (scripts/firstQuestionNowCheck.mjs)", "PASS", (out.match(/firstQuestionNowCheck: .*/) || [""])[0]);
} catch (e) {
  record("Sell: the first question is drawn the moment the car is named, never after a cold read (the computing answer hands the car to Sell) (scripts/firstQuestionNowCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/earlyQuestionEndCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("Sell: the early first question ends with an answer that is not a result, so the next search draws its question (no stuck loading bar) (scripts/earlyQuestionEndCheck.mjs)", "PASS", (out.match(/earlyQuestionEndCheck: .*/) || [""])[0]);
} catch (e) {
  record("Sell: the early first question ends with an answer that is not a result, so the next search draws its question (no stuck loading bar) (scripts/earlyQuestionEndCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/sellFirstQuestionRender.mjs", { encoding: "utf8", timeout: 280000 });
  record("Sell in Chrome at 1440 and 390: first question at the computing answer, once, bar gone, later steps and a new search work (cold question-tier, stored, cold result-tier) (scripts/sellFirstQuestionRender.mjs)", "PASS", (out.match(/sellFirstQuestionRender: .*/) || [""])[0]);
} catch (e) {
  record("Sell in Chrome at 1440 and 390: first question at the computing answer, once, bar gone, later steps and a new search work (cold question-tier, stored, cold result-tier) (scripts/sellFirstQuestionRender.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/storedRefusalNotServedCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("engine: a stored could-not-be-checked refusal is never served (read as no row), so a known car is recomputed with today's rules (scripts/storedRefusalNotServedCheck.mjs)", "PASS", (out.match(/storedRefusalNotServedCheck: .*/) || [""])[0]);
} catch (e) {
  record("engine: a stored could-not-be-checked refusal is never served (read as no row), so a known car is recomputed with today's rules (scripts/storedRefusalNotServedCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/ruleTagsCurrentCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("engine: a stored row carrying every current rule tag is served and every rule tag is carried by the writer, so a new tag cannot overtake a current row or be forgotten by a fixture (scripts/ruleTagsCurrentCheck.mjs)", "PASS", (out.match(/ruleTagsCurrentCheck: .*/) || [""])[0]);
} catch (e) {
  record("engine: a stored row carrying every current rule tag is served and every rule tag is carried by the writer, so a new tag cannot overtake a current row or be forgotten by a fixture (scripts/ruleTagsCurrentCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/sellLabelCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("engine: cross-product Sell lane prints the engine's own label, rung, sibling and counts as given (scripts/sellLabelCheck.mjs)", "PASS", (out.match(/sellLabelCheck: .*/) || [""])[0]);
} catch (e) {
  record("engine: cross-product Sell lane prints the engine's own label, rung, sibling and counts as given (scripts/sellLabelCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 6).join(" | ") || String(e.message || e).slice(0, 300));
}
try {
  const out = execSync("node scripts/onePickFixtureCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("engine: ONE PICK compares what each page shows and the pick rules hold on synthetic pools through the real pickPlatform and decide (scripts/onePickFixtureCheck.mjs)", "PASS", (out.match(/onePickFixtureCheck: .*/) || [""])[0]);
} catch (e) {
  record("engine: ONE PICK compares what each page shows and the pick rules hold on synthetic pools through the real pickPlatform and decide (scripts/onePickFixtureCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 6).join(" | ") || String(e.message || e).slice(0, 300));
}
try {
  const out = execSync("node scripts/liveListingStatusCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("engine: the live-listing check is status aware: an ended auction is never expected live and a live car is never reported as not live (scripts/liveListingStatusCheck.mjs)", "PASS", (out.match(/liveListingStatusCheck: .*/) || [""])[0]);
} catch (e) {
  record("engine: the live-listing check is status aware: an ended auction is never expected live and a live car is never reported as not live (scripts/liveListingStatusCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 6).join(" | ") || String(e.message || e).slice(0, 300));
}
try {
  const out = execSync("node scripts/specPinCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("engine: a failed spec resolution is never pinned: a miss expires, a find is kept, and the resolved vehicle is in the spec key (scripts/specPinCheck.mjs)", "PASS", (out.match(/specPinCheck: .*/) || [""])[0]);
} catch (e) {
  record("engine: a failed spec resolution is never pinned: a miss expires, a find is kept, and the resolved vehicle is in the spec key (scripts/specPinCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 6).join(" | ") || String(e.message || e).slice(0, 300));
}
try {
  const out = execSync("node scripts/specKeyRoundTripCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("engine: a spec key is read back as the car it names, so the recompute never writes a row for a different car than its key (scripts/specKeyRoundTripCheck.mjs)", "PASS", (out.match(/specKeyRoundTripCheck: .*/) || [""])[0]);
} catch (e) {
  record("engine: a spec key is read back as the car it names, so the recompute never writes a row for a different car than its key (scripts/specKeyRoundTripCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 6).join(" | ") || String(e.message || e).slice(0, 300));
}
try {
  const out = execSync("node scripts/featuredHistoryCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("homepage feature (CREW ONLY, NOT LIVE): the one featured car passes every eligibility rule (same VIN, live, real photos, evidence link, complete, listed never sold), stays put, replaces itself when its auction ends, is null on a failed refresh and never stale, and no public route, page, feed or cache key can return it (scripts/featuredHistoryCheck.mjs)", "PASS", (out.match(/featuredHistoryCheck: .*/) || [""])[0]);
} catch (e) {
  record("homepage feature (CREW ONLY, NOT LIVE): the one featured car passes every eligibility rule (same VIN, live, real photos, evidence link, complete, listed never sold), stays put, replaces itself when its auction ends, is null on a failed refresh and never stale, and no public route, page, feed or cache key can return it (scripts/featuredHistoryCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/featuredWireCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("homepage feature preview (CREW ONLY, NOT LIVE): a stored sold or listed pick prints through the crew route, anything short of a complete live pick is hidden, a failed image hides the section, the route is a bare 404 without the cookie (scripts/featuredWireCheck.mjs)", "PASS", (out.match(/featuredWireCheck: .*/) || [""])[0]);
} catch (e) {
  record("homepage feature preview (CREW ONLY, NOT LIVE): a stored sold or listed pick prints through the crew route, anything short of a complete live pick is hidden, a failed image hides the section, the route is a bare 404 without the cookie (scripts/featuredWireCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /FAIL/.test(l)).slice(0, 4).join(" | ") || String(e.message).slice(0, 200));
}
try {
  const out = execSync("node scripts/crewLocalRun.mjs", { encoding: "utf8", timeout: 240000 });
  record("Crew previews on a local run with Lane B's real readers: three Find cards and two Task cards, real components, lined up (scripts/crewLocalRun.mjs)", "PASS", (out.match(/crewLocalRun: .*/) || [""])[0]);
} catch (e) {
  record("Crew previews on a local run with Lane B's real readers: three Find cards and two Task cards, real components, lined up (scripts/crewLocalRun.mjs)", "FAIL", String(e.stdout || e.message).split("\n").filter(l => /FAIL/.test(l)).join(" | ").slice(0, 400));
}
try {
  const out = execSync("node scripts/crewReadCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("A failed crew preview read is never silent and its module is in the bundle (scripts/crewReadCheck.mjs)", "PASS", (out.match(/crewReadCheck: .*/) || [""])[0]);
} catch (e) {
  record("A failed crew preview read is never silent and its module is in the bundle (scripts/crewReadCheck.mjs)", "FAIL", String(e.stdout || e.message).split("\n").filter(l => /FAIL/.test(l)).join(" | ").slice(0, 400));
}
try {
  const out = execSync("node scripts/livePreviewCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("Crew previews render their sections (offline self-test; the live run is node scripts/livePreviewCheck.mjs --live with GAS_CREW_COOKIE) (scripts/livePreviewCheck.mjs)", "PASS", (out.match(/livePreviewCheck: .*/) || [""])[0]);
} catch (e) {
  record("Crew previews render their sections (offline self-test; the live run is node scripts/livePreviewCheck.mjs --live with GAS_CREW_COOKIE) (scripts/livePreviewCheck.mjs)", "FAIL", String(e.stdout || e.message).split("\n").filter(l => /FAIL/.test(l)).join(" | ").slice(0, 400));
}
try {
  const out = execSync("node scripts/mcSellShellCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("Market Check and Sell on the shared shell, entry and results: one Find header, the Find rail per product, one footer, no old navigation, nothing inside the results changed, the approved entry copy (scripts/mcSellShellCheck.mjs)", "PASS", (out.match(/mcSellShellCheck: .*/) || [""])[0]);
} catch (e) {
  record("Market Check and Sell on the shared shell, entry and results: one Find header, the Find rail per product, one footer, no old navigation, nothing inside the results changed, the approved entry copy (scripts/mcSellShellCheck.mjs)", "FAIL", String(e.stdout || e.message).split("\n").filter(l => /FAIL/.test(l)).join(" | ").slice(0, 400));
}
try {
  const out = execSync("node scripts/deskV4ShellCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("Desk v4 shell: zones (queue 232, centre, Reserve panel 372 sticky), no Vehicle, Market evidence or Decision tabs, one shadow, top bar, no overflow at 1440, 1280, 1024 and 390, light and dark, crew only (scripts/deskV4ShellCheck.mjs)", "PASS", (out.match(/deskV4ShellCheck: .*/) || [""])[0]);
} catch (e) {
  record("Desk v4 shell: zones (queue 232, centre, Reserve panel 372 sticky), no Vehicle, Market evidence or Decision tabs, one shadow, top bar, no overflow at 1440, 1280, 1024 and 390, light and dark, crew only (scripts/deskV4ShellCheck.mjs)", "FAIL", String(e.stdout || e.message).split("\n").filter(l => /FAIL/.test(l)).join(" | ").slice(0, 400));
}
try {
  const out = execSync("node scripts/goLiveSwitchCheck.mjs --base ee488ab5", { encoding: "utf8", timeout: 240000 });
  record("Go live switch: NEW_DESIGN off serves bytes identical to the baseline on every public route, on keeps status and headers and replays redirects, per route, crew look, no POST switched (scripts/goLiveSwitchCheck.mjs)", "PASS", (out.match(/goLiveSwitchCheck: .*/) || [""])[0]);
} catch (e) {
  record("Go live switch: NEW_DESIGN off serves bytes identical to the baseline on every public route, on keeps status and headers and replays redirects, per route, crew look, no POST switched (scripts/goLiveSwitchCheck.mjs)", "FAIL", String(e.stdout || e.message).split("\n").filter(l => /^FAIL|goLiveSwitchCheck:/.test(l)).slice(0, 5).join(" | "));
}
try {
  const out = execSync("node scripts/goLiveParityCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("Go live parity: per route, the new public page wears the current page's title, description, robots, canonical, Open Graph and JSON-LD byte for byte, one h1, no preview address or title, no unlisted lost link or script (scripts/goLiveParityCheck.mjs; the held list is docs/go-live-held.json, --ready is the go live gate)", "PASS", (out.match(/goLiveParityCheck: .*/) || [""])[0]);
} catch (e) {
  record("Go live parity: per route, the new public page wears the current page's title, description, robots, canonical, Open Graph and JSON-LD byte for byte, one h1, no preview address or title, no unlisted lost link or script (scripts/goLiveParityCheck.mjs; the held list is docs/go-live-held.json, --ready is the go live gate)", "FAIL", String(e.stdout || e.message).split("\n").filter(l => /^FAIL|goLiveParityCheck:/.test(l)).slice(0, 5).join(" | "));
}
try {
  const out = execSync("node scripts/goLiveExamplesCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("Go live examples: Home, Find, Market Check, Sell and Tasks on a public address hide a section whose example is null, fails, says could-not-read or never answers (time boxed), keep the search box, print the live Tasks limit (scripts/goLiveExamplesCheck.mjs)", "PASS", (out.match(/goLiveExamplesCheck: .*/) || [""])[0]);
} catch (e) {
  record("Go live examples: Home, Find, Market Check, Sell and Tasks on a public address hide a section whose example is null, fails, says could-not-read or never answers (time boxed), keep the search box, print the live Tasks limit (scripts/goLiveExamplesCheck.mjs)", "FAIL", String(e.stdout || e.message).split("\n").filter(l => /^FAIL|goLiveExamplesCheck:/.test(l)).slice(0, 5).join(" | "));
}
try {
  const out = execSync("node scripts/goLivePerfCheck.mjs", { encoding: "utf8", timeout: 300000 });
  record("Go live performance: the new landing pages are no heavier to download and no slower to a first usable search than today's at 1440 and 390 (scripts/goLivePerfCheck.mjs)", "PASS", (out.match(/goLivePerfCheck: .*/) || [""])[0]);
} catch (e) {
  record("Go live performance: the new landing pages are no heavier to download and no slower to a first usable search than today's at 1440 and 390 (scripts/goLivePerfCheck.mjs)", "FAIL", String(e.stdout || e.message).split("\n").filter(l => /^FAIL|goLivePerfCheck:/.test(l)).slice(0, 5).join(" | "));
}
try {
  const out = execSync("node scripts/findResultsCheck.mjs", { encoding: "utf8", timeout: 300000 });
  record("Find results in the new shell: today's results page inside the new header, rail (New search, recent searches) and footer, results byte identical in text, figures, links, buttons and style at 1440 and 390, the search address serves the results not the landing (scripts/findResultsCheck.mjs)", "PASS", (out.match(/findResultsCheck: .*/) || [""])[0]);
} catch (e) {
  record("Find results in the new shell: today's results page inside the new header, rail (New search, recent searches) and footer, results byte identical in text, figures, links, buttons and style at 1440 and 390, the search address serves the results not the landing (scripts/findResultsCheck.mjs)", "FAIL", String(e.stdout || e.message).split("\n").filter(l => /^FAIL|findResultsCheck:/.test(l)).slice(0, 5).join(" | "));
}
try {
  const out = execSync("node scripts/goLiveTasksFlowCheck.mjs", { encoding: "utf8", timeout: 300000 });
  record("Go live Tasks signed in on the public address: create, edit and stop send their calls to /api/tasks, the Account button opens the same sign in card (scripts/goLiveTasksFlowCheck.mjs)", "PASS", (out.match(/goLiveTasksFlowCheck: .*/) || [""])[0]);
} catch (e) {
  record("Go live Tasks signed in on the public address: create, edit and stop send their calls to /api/tasks, the Account button opens the same sign in card (scripts/goLiveTasksFlowCheck.mjs)", "FAIL", String(e.stdout || e.message).split("\n").filter(l => /^FAIL|goLiveTasksFlowCheck:/.test(l)).slice(0, 5).join(" | "));
}
try {
  const out = execSync("node scripts/previewShellCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("Preview shell is one full height column (footer at the bottom of a short page, after a long one, on every preview page at 1440, 1280, 1024 and 390) and the Tasks email section sits on the hero's left edge (scripts/previewShellCheck.mjs)", "PASS", (out.match(/previewShellCheck: .*/) || [""])[0]);
} catch (e) {
  record("Preview shell is one full height column (footer at the bottom of a short page, after a long one, on every preview page at 1440, 1280, 1024 and 390) and the Tasks email section sits on the hero's left edge (scripts/previewShellCheck.mjs)", "FAIL", String(e.stdout || e.message).split("\n").filter(l => /FAIL/.test(l)).join(" | ").slice(0, 400));
}
try {
  const out = execSync("node scripts/deskV3MarketCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("Desk v3 Market evidence: the engine's evidence, original beside current, comparables with exclude (reason required) greyed in place, quarters with shown false drawn as nothing, listings labelled, outsiders (scripts/deskV3MarketCheck.mjs)", "PASS", (out.match(/deskV3MarketCheck: .*/) || [""])[0]);
} catch (e) {
  record("Desk v3 Market evidence: the engine's evidence, original beside current, comparables with exclude (reason required) greyed in place, quarters with shown false drawn as nothing, listings labelled, outsiders (scripts/deskV3MarketCheck.mjs)", "FAIL", String(e.stdout || e.message).split("\n").filter(l => /FAIL/.test(l)).join(" | ").slice(0, 400));
}
try {
  const out = execSync("node scripts/deskV3DecisionCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("Desk v3 Decision: the reference, assessment and difference side by side, numeric input first, keyboard slider, reserve that never moves with the assessment, condition control, factors, readiness, Finalize disabled until ready, audit trail (scripts/deskV3DecisionCheck.mjs)", "PASS", (out.match(/deskV3DecisionCheck: .*/) || [""])[0]);
} catch (e) {
  record("Desk v3 Decision: the reference, assessment and difference side by side, numeric input first, keyboard slider, reserve that never moves with the assessment, condition control, factors, readiness, Finalize disabled until ready, audit trail (scripts/deskV3DecisionCheck.mjs)", "FAIL", String(e.stdout || e.message).split("\n").filter(l => /FAIL/.test(l)).join(" | ").slice(0, 400));
}
try {
  const out = execSync("node scripts/deskV3PreviewCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("Desk v3 report preview: Preview report opens the PDF in a pane on the same page, keeps the unsaved changes and saves nothing (scripts/deskV3PreviewCheck.mjs)", "PASS", (out.match(/deskV3PreviewCheck: .*/) || [""])[0]);
} catch (e) {
  record("Desk v3 report preview: Preview report opens the PDF in a pane on the same page, keeps the unsaved changes and saves nothing (scripts/deskV3PreviewCheck.mjs)", "FAIL", String(e.stdout || e.message).split("\n").filter(l => /FAIL/.test(l)).join(" | ").slice(0, 400));
}
try {
  const out = execSync("node scripts/entryFinalCheck.mjs", { encoding: "utf8", timeout: 420000 });
  record("Entry pages final: Find, Market Check and Sell share header, rail, search, chips and spacing within 1px at 1440, 1024 and 390; hero words from the table; chips are real searches; the featured content equals Lane B's fields; results sources unchanged; no duplicate reason ids (scripts/entryFinalCheck.mjs, 7 mutants)", "PASS", (out.match(/entryFinalCheck: .*/) || [""])[0]);
} catch (e) {
  record("Entry pages final: Find, Market Check and Sell share header, rail, search, chips and spacing within 1px at 1440, 1024 and 390; hero words from the table; chips are real searches; the featured content equals Lane B's fields; results sources unchanged; no duplicate reason ids (scripts/entryFinalCheck.mjs, 7 mutants)", "FAIL", String(e.stdout || e.message).split("\n").filter(l => /FAIL/.test(l)).join(" | ").slice(0, 400));
}
try {
  const out = execSync("node scripts/sitePagesShellCheck.mjs", { encoding: "utf8", timeout: 420000 });
  record("Site pages on the new shell: the approved header and footer match the homepage's within 1px, no rail, the homepage's content width and type, at 1440, 1024 and 390 (scripts/sitePagesShellCheck.mjs, 6 mutants)", "PASS", (out.match(/sitePagesShellCheck: .*/) || [""])[0]);
} catch (e) {
  record("Site pages on the new shell: the approved header and footer match the homepage's within 1px, no rail, the homepage's content width and type, at 1440, 1024 and 390 (scripts/sitePagesShellCheck.mjs, 6 mutants)", "FAIL", String(e.stdout || e.message).split("\n").filter(l => /FAIL/.test(l)).join(" | ").slice(0, 400));
}
try {
  const out = execSync("node scripts/sitePagesContentCheck.mjs", { encoding: "utf8", timeout: 420000 });
  record("Site pages keep the live page's content exactly: the same main, text lines, links, form fields, lists and structured data (scripts/sitePagesContentCheck.mjs, 6 mutants)", "PASS", (out.match(/sitePagesContentCheck: .*/) || [""])[0]);
} catch (e) {
  record("Site pages keep the live page's content exactly: the same main, text lines, links, form fields, lists and structured data (scripts/sitePagesContentCheck.mjs, 6 mutants)", "FAIL", String(e.stdout || e.message).split("\n").filter(l => /FAIL/.test(l)).join(" | ").slice(0, 400));
}
try {
  const out = execSync("node scripts/sitePagesHistoryCheck.mjs", { encoding: "utf8", timeout: 420000 });
  record("History pages on the new shell: the index, hubs and VIN pages keep the live page's content (main, links, sale rows, photo URLs, JSON-LD) in the approved header and footer, no rail, at 1440, 1024 and 390 (scripts/sitePagesHistoryCheck.mjs, 5 mutants)", "PASS", (out.match(/sitePagesHistoryCheck: .*/) || [""])[0]);
} catch (e) {
  record("History pages on the new shell: the index, hubs and VIN pages keep the live page's content (main, links, sale rows, photo URLs, JSON-LD) in the approved header and footer, no rail, at 1440, 1024 and 390 (scripts/sitePagesHistoryCheck.mjs, 5 mutants)", "FAIL", String(e.stdout || e.message).split("\n").filter(l => /FAIL/.test(l)).join(" | ").slice(0, 400));
}
try {
  const out = execSync("node scripts/deskV3ClickCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("Desk v3: the Valuation figure lands on its input from the summary and the sticky bar; tabs keep state (scripts/deskV3ClickCheck.mjs)", "PASS", (out.match(/deskV3ClickCheck: .*/) || [""])[0]);
} catch (e) {
  record("Desk v3: the Valuation figure lands on its input from the summary and the sticky bar; tabs keep state (scripts/deskV3ClickCheck.mjs)", "FAIL", String(e.stdout || e.message).split("\n").filter(l => /FAIL/.test(l)).join(" | ").slice(0, 400));
}
try {
  const out = execSync("node scripts/deskV3DemoFlowCheck.mjs", { encoding: "utf8", timeout: 420000 });
  record("Desk v3 demo walkthrough: a case from nothing, two photos, condition Good then Excellent then Fair with the market line moving, valuation, reserve, preview in the pane, Finalize, version 1 (4 mutants) (scripts/deskV3DemoFlowCheck.mjs)", "PASS", (out.match(/deskV3DemoFlowCheck: .*/) || [""])[0]);
} catch (e) {
  record("Desk v3 demo walkthrough: a case from nothing, two photos, condition Good then Excellent then Fair with the market line moving, valuation, reserve, preview in the pane, Finalize, version 1 (4 mutants) (scripts/deskV3DemoFlowCheck.mjs)", "FAIL", String(e.stdout || e.message).split("\n").filter(l => /FAIL/.test(l)).join(" | ").slice(0, 400));
}
try {
  const out = execSync("node scripts/deskV3WireCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("Desk v3: every figure and sentence on the case traces to desk.*, market.meter or a case field; a typed sentence or page arithmetic fails (scripts/deskV3WireCheck.mjs)", "PASS", (out.match(/deskV3WireCheck: .*/) || [""])[0]);
} catch (e) {
  record("Desk v3: every figure and sentence on the case traces to desk.*, market.meter or a case field; a typed sentence or page arithmetic fails (scripts/deskV3WireCheck.mjs)", "FAIL", String(e.stdout || e.message).split("\n").filter(l => /FAIL/.test(l)).join(" | ").slice(0, 400));
}
try {
  const out = execSync("node scripts/mcSellResultsCheck.mjs", { encoding: "utf8", timeout: 580000 });
  const line = (out.match(/mcSellResultsCheck: .*/) || [""])[0];
  record("Market Check and Sell results inside the shell are the live results: every section, figure, chart, table, link and style the same at 1440, 1024 and 390, from recorded engine answers (scripts/mcSellResultsCheck.mjs)", /: SKIP/.test(line) ? "SKIP" : "PASS", line);
} catch (e) {
  record("Market Check and Sell results inside the shell are the live results: every section, figure, chart, table, link and style the same at 1440, 1024 and 390, from recorded engine answers (scripts/mcSellResultsCheck.mjs)", "FAIL", String(e.stdout || e.message).split("\n").filter(l => /FAIL/.test(l)).join(" | ").slice(0, 400));
}
try {
  const out = execSync("node scripts/crewWiringCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("Crew previews read the engine's fallbacks: live first, fallback when null, three Find cards and two Task cards (scripts/crewWiringCheck.mjs)", "PASS", (out.match(/crewWiringCheck: .*/) || [""])[0]);
} catch (e) {
  record("Crew previews read the engine's fallbacks: live first, fallback when null, three Find cards and two Task cards (scripts/crewWiringCheck.mjs)", "FAIL", String(e.stdout || e.message).split("\n").filter(l => /FAIL/.test(l)).join(" | ").slice(0, 400));
}
try {
  const out = execSync("node scripts/previewRealCardCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("Preview cards are the real cards: Find's card and the dashboard's Task card, same components, aligned, with the engine's fallback (scripts/previewRealCardCheck.mjs)", "PASS", (out.match(/previewRealCardCheck: .*/) || [""])[0]);
} catch (e) {
  record("Preview cards are the real cards: Find's card and the dashboard's Task card, same components, aligned, with the engine's fallback (scripts/previewRealCardCheck.mjs)", "FAIL", String(e.stdout || e.message).split("\n").filter(l => /FAIL/.test(l)).join(" | ").slice(0, 400));
}
try {
  const out = execSync("node scripts/homeFindPreviewCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("Home and Find previews (CREW ONLY, NOT LIVE): copy, layout at four widths, the featured history gate, crew only and never public (scripts/homeFindPreviewCheck.mjs)", "PASS", (out.match(/homeFindPreviewCheck: .*/) || [""])[0]);
} catch (e) {
  record("Home and Find previews (CREW ONLY, NOT LIVE): copy, layout at four widths, the featured history gate, crew only and never public (scripts/homeFindPreviewCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /FAIL/.test(l)).slice(0, 4).join(" | ") || String(e.message).slice(0, 200));
}
try {
  const out = execSync("node scripts/previewHeaderCheck.mjs", { encoding: "utf8", timeout: 300000 });
  record("preview header (CREW ONLY, NOT LIVE): one logo, nav, height and padding position on Find, Market Check, Sell and Tasks at five widths; Find's rail starts where the logo starts (scripts/previewHeaderCheck.mjs)", "PASS", (out.match(/previewHeaderCheck: .*/) || [""])[0]);
} catch (e) {
  record("preview header (CREW ONLY, NOT LIVE): one logo, nav, height and padding position on Find, Market Check, Sell and Tasks at five widths; Find's rail starts where the logo starts (scripts/previewHeaderCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 6).join(" | ") || String(e.message || e).slice(0, 300));
}
try {
  const out = execSync("node scripts/tasksPreviewCheck.mjs", { encoding: "utf8", timeout: 300000 });
  record("Tasks previews (CREW ONLY, NOT LIVE): Sam's copy, the crew gate, nothing of it in any live page, no hard coded limit, a typed request carried through sign in, every live control kept, the dashboard prints what the API sends (scripts/tasksPreviewCheck.mjs)", "PASS", (out.match(/tasksPreviewCheck: .*/) || [""])[0]);
} catch (e) {
  record("Tasks previews (CREW ONLY, NOT LIVE): Sam's copy, the crew gate, nothing of it in any live page, no hard coded limit, a typed request carried through sign in, every live control kept, the dashboard prints what the API sends (scripts/tasksPreviewCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /FAIL/.test(l)).slice(0, 4).join(" | ") || String(e.message).slice(0, 200));
}
try {
  const out = execSync("node scripts/tasksDemoCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("Tasks demo (crew only, not live): the request is written from a real live car, read back and matched by the Task matcher, stable, crew gated, no public surface (scripts/tasksDemoCheck.mjs)", "PASS", (out.match(/tasksDemoCheck: .*/) || [""])[0]);
} catch (e) {
  record("Tasks demo (crew only, not live): the request is written from a real live car, read back and matched by the Task matcher, stable, crew gated, no public surface (scripts/tasksDemoCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 6).join(" | ") || String(e.message || e).slice(0, 300));
}
try {
  const out = execSync("node scripts/tasksPreferredCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("Tasks preferred versus required (crew only, not live): a wish is flagged and ordered first, never a requirement; a Task without it runs the code it ran before (scripts/tasksPreferredCheck.mjs)", "PASS", (out.match(/tasksPreferredCheck: .*/) || [""])[0]);
} catch (e) {
  record("Tasks preferred versus required (crew only, not live): a wish is flagged and ordered first, never a requirement; a Task without it runs the code it ran before (scripts/tasksPreferredCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 6).join(" | ") || String(e.message || e).slice(0, 300));
}
try {
  const out = execSync("node scripts/tasksAnyModelCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("Tasks any model (crew only, not live): a make with something else wanted starts as any model and reads back so; everyone else is asked as before (scripts/tasksAnyModelCheck.mjs)", "PASS", (out.match(/tasksAnyModelCheck: .*/) || [""])[0]);
} catch (e) {
  record("Tasks any model (crew only, not live): a make with something else wanted starts as any model and reads back so; everyone else is asked as before (scripts/tasksAnyModelCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 6).join(" | ") || String(e.message || e).slice(0, 300));
}
try {
  const out = execSync("node scripts/stageTimerCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("engine: every cold compute logs its stage milliseconds (engine, trim chips, question rule, sell fields, store) (scripts/stageTimerCheck.mjs)", "PASS", (out.match(/stageTimerCheck: .*/) || [""])[0]);
} catch (e) {
  record("engine: every cold compute logs its stage milliseconds (engine, trim chips, question rule, sell fields, store) (scripts/stageTimerCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/snapshotAfterResponseCheck.mjs", { encoding: "utf8", timeout: 60000 });
  record("engine: a stored hit answers before its share snapshot is written, and the link waits for its row (scripts/snapshotAfterResponseCheck.mjs)", "PASS", (out.match(/snapshotAfterResponseCheck: .*/) || [""])[0]);
} catch (e) {
  record("engine: a stored hit answers before its share snapshot is written, and the link waits for its row (scripts/snapshotAfterResponseCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/coldResolverCheck.mjs", { encoding: "utf8", timeout: 60000 });
  record("engine: a cold instance loads the resolver tables once and together, and a table past its window never holds a car (scripts/coldResolverCheck.mjs)", "PASS", (out.match(/coldResolverCheck: .*/) || [""])[0]);
} catch (e) {
  record("engine: a cold instance loads the resolver tables once and together, and a table past its window never holds a car (scripts/coldResolverCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/storedReadNeedsNoFxCheck.mjs", { encoding: "utf8", timeout: 60000 });
  record("engine: a stored read does not wait for the exchange-rate table, and every compute arms it (scripts/storedReadNeedsNoFxCheck.mjs)", "PASS", (out.match(/storedReadNeedsNoFxCheck: .*/) || [""])[0]);
} catch (e) {
  record("engine: a stored read does not wait for the exchange-rate table, and every compute arms it (scripts/storedReadNeedsNoFxCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/chipCasingCheck.mjs", { encoding: "utf8", timeout: 60000 });
  record("engine: every model, generation, trim and body chip prints the way the model is written (one display rule) (scripts/chipCasingCheck.mjs)", "PASS", (out.match(/chipCasingCheck: .*/) || [""])[0]);
} catch (e) {
  record("engine: every model, generation, trim and body chip prints the way the model is written (one display rule) (scripts/chipCasingCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/expiredRowServedCheck.mjs", { encoding: "utf8", timeout: 60000 });
  record("engine: a stored row over 24 hours and under 7 days is served and refreshed behind the response, one refresh per row, a few at once (scripts/expiredRowServedCheck.mjs)", "PASS", (out.match(/expiredRowServedCheck: .*/) || [""])[0]);
} catch (e) {
  record("engine: a stored row over 24 hours and under 7 days is served and refreshed behind the response, one refresh per row, a few at once (scripts/expiredRowServedCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/prewarAnySizeCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("engine: a pre-war car whose pool holds two or more bodies shows the bodies apart at any pool size, no pooled headline, a range only at 3 or more sales (scripts/prewarAnySizeCheck.mjs)", "PASS", (out.match(/checked .*/) || [""])[0]);
} catch (e) {
  record("engine: a pre-war car whose pool holds two or more bodies shows the bodies apart at any pool size, no pooled headline, a range only at 3 or more sales (scripts/prewarAnySizeCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/modelSpacingCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("engine: a model written as a number and letters (540K, 300SL, 190E) is the same car glued or spaced, and a different model is still refused (scripts/modelSpacingCheck.mjs)", "PASS", (out.match(/modelSpacingCheck: .*/) || [""])[0]);
} catch (e) {
  record("engine: a model written as a number and letters (540K, 300SL, 190E) is the same car glued or spaced, and a different model is still refused (scripts/modelSpacingCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/noRangeFieldsCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("engine: every card that shows sales and no range carries the total, the close matches, the floor, a reason code and the line (scripts/noRangeFieldsCheck.mjs)", "PASS", (out.match(/noRangeFieldsCheck: .*/) || [""])[0]);
} catch (e) {
  record("engine: every card that shows sales and no range carries the total, the close matches, the floor, a reason code and the line (scripts/noRangeFieldsCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/servedCardKeysCheck.mjs", { encoding: "utf8", timeout: 60000 });
  record("engine: the sale rows a card answer serves carry only the whitelisted keys (id, price, date, mi, title, image, venue, url, gearbox), no vehicle number, person or place, under 900 bytes (scripts/servedCardKeysCheck.mjs)", "PASS", (out.match(/servedCardKeysCheck: .*/) || [""])[0]);
} catch (e) {
  record("engine: the sale rows a card answer serves carry only the whitelisted keys (id, price, date, mi, title, image, venue, url, gearbox), no vehicle number, person or place, under 900 bytes (scripts/servedCardKeysCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/toolRetryCheck.mjs", { encoding: "utf8", timeout: 90000 });
  record("engine: a read that did not finish is try again, never a data claim or a blank, on every path that reads the engine (scripts/toolRetryCheck.mjs)", "PASS", (out.match(/^callers .*/m) || [""])[0]);
} catch (e) {
  record("engine: a read that did not finish is try again, never a data claim or a blank, on every path that reads the engine (scripts/toolRetryCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/distanceZipCheck.mjs", { encoding: "utf8", timeout: 90000 });
  record("buy: a city with a distance is never asked for a zip, and cars of another year carry the engine's stated reason (scripts/distanceZipCheck.mjs)", "PASS", (out.match(/distanceZipCheck: .*/) || [""])[0]);
} catch (e) {
  record("buy: a city with a distance is never asked for a zip, and cars of another year carry the engine's stated reason (scripts/distanceZipCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/noRangeCardsCheck.mjs", { encoding: "utf8", timeout: 180000 });
  record("pages: a card with no range prints the engine's line (behind its flag), keeps See the sales opening every sale, and shows pre-war bodies apart (scripts/noRangeCardsCheck.mjs)", "PASS", (out.match(/noRangeCardsCheck: .*/) || [""])[0]);
} catch (e) {
  record("pages: a card with no range prints the engine's line (behind its flag), keeps See the sales opening every sale, and shows pre-war bodies apart (scripts/noRangeCardsCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/vpicErrorCacheCheck.mjs", { encoding: "utf8", timeout: 60000 });
  record("resolver: a vPIC error is never kept as an empty list (retry after 30 s), a real empty list is (scripts/vpicErrorCacheCheck.mjs)", "PASS", (out.match(/vpicErrorCacheCheck: .*/) || [""])[0]);
} catch (e) {
  record("resolver: a vPIC error is never kept as an empty list (retry after 30 s), a real empty list is (scripts/vpicErrorCacheCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/questionColdCheck.mjs", { encoding: "utf8", timeout: 60000 });
  record("engine: a question-first text is stored as its own question row and a second read does no archive read (scripts/questionColdCheck.mjs)", "PASS", (out.match(/questionColdCheck: .*/) || [""])[0]);
} catch (e) {
  record("engine: a question-first text is stored as its own question row and a second read does no archive read (scripts/questionColdCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/warmLeftoverRowCheck.mjs", { encoding: "utf8", timeout: 60000 });
  record("warm: a question leaves no old answer row behind and every warm stores only what the visitor path would store (scripts/warmLeftoverRowCheck.mjs)", "PASS", (out.match(/warmLeftoverRowCheck: .*/) || [""])[0]);
} catch (e) {
  record("warm: a question leaves no old answer row behind and every warm stores only what the visitor path would store (scripts/warmLeftoverRowCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/exclusionCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("engine: a negated word (not, no, non, without, except, excluding, -RF) removes cars on Market Check, Find and Sell and is announced, never read as a word to look for (scripts/exclusionCheck.mjs)", "PASS", (out.match(/exclusionCheck: .*/) || [""])[0]);
} catch (e) {
  record("engine: a negated word (not, no, non, without, except, excluding, -RF) removes cars on Market Check, Find and Sell and is announced, never read as a word to look for (scripts/exclusionCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/nomenclatureCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("resolver: Rick Carey's period body names are read on input as their pool and never printed back; coachbuilder spellings merge (scripts/nomenclatureCheck.mjs)", "PASS", (out.match(/nomenclatureCheck: .*/) || [""])[0]);
} catch (e) {
  record("resolver: Rick Carey's period body names are read on input as their pool and never printed back; coachbuilder spellings merge (scripts/nomenclatureCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/partnerFirstLoadCheck.mjs", { encoding: "utf8", timeout: 180000 });
  record("partner: a demo car's first load is served from storage with typed prices placed from the stored range; the bar's ends are the exact lowest and highest sale (scripts/partnerFirstLoadCheck.mjs)", "PASS", (out.match(/partnerFirstLoadCheck: .*/) || [""])[0]);
} catch (e) {
  record("partner: a demo car's first load is served from storage with typed prices placed from the stored range; the bar's ends are the exact lowest and highest sale (scripts/partnerFirstLoadCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/partnerPositionCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("partner: typed prices are placed and the sales come in three orders by the engine; no page compares a price with the range (scripts/partnerPositionCheck.mjs)", "PASS", (out.match(/partnerPositionCheck: .*/) || [""])[0]);
} catch (e) {
  record("partner: typed prices are placed and the sales come in three orders by the engine; no page compares a price with the range (scripts/partnerPositionCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/foreignCarsTaskCheck.mjs", { encoding: "utf8", timeout: 60000 });
  record("ops: task=foreigncars reads in bounded pages, never sorts or filters on a raw_record field (scripts/foreignCarsTaskCheck.mjs)", "PASS", (out.match(/foreignCarsTaskCheck: .*/) || [""])[0]);
} catch (e) {
  record("ops: task=foreigncars reads in bounded pages, never sorts or filters on a raw_record field (scripts/foreignCarsTaskCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/storedFitCheck.mjs", { encoding: "utf8", timeout: 60000 });
  record("Stored fit read: nothing stored is never counted as the engine returning nothing; the read never computes or writes (scripts/storedFitCheck.mjs)", "PASS", (out.match(/storedFitCheck: .*/) || [""])[0]);
} catch (e) {
  record("Stored fit read: nothing stored is never counted as the engine returning nothing; the read never computes or writes (scripts/storedFitCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 3).join(" | ") || String(e.message).slice(0, 160));
}
try {
  const out = execSync("node scripts/exactYearParallelCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("engine: a car with a trim reads its exact-year line beside the first answer, not after it (scripts/exactYearParallelCheck.mjs)", "PASS", (out.match(/exactYearParallelCheck: .*/) || [""])[0]);
} catch (e) {
  record("engine: a car with a trim reads its exact-year line beside the first answer, not after it (scripts/exactYearParallelCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/salesOrderCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("engine: every sales list is sent date newest first, no salesOrder option, no page-side sort (scripts/salesOrderCheck.mjs)", "PASS", (out.match(/salesOrderCheck: .*/) || [""])[0]);
} catch (e) {
  record("engine: every sales list is sent date newest first, no salesOrder option, no page-side sort (scripts/salesOrderCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/engineWordFilterCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("engine: every engine and N-speed word filters live listings and stored sales like a gearbox word, and an applied word is never named unused (scripts/engineWordFilterCheck.mjs)", "PASS", (out.match(/engineWordFilterCheck: .*/) || [""])[0]);
} catch (e) {
  record("engine: every engine and N-speed word filters live listings and stored sales like a gearbox word, and an applied word is never named unused (scripts/engineWordFilterCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/prewarBodyApartCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("engine: before 1949 body style is an apart dimension by default, each body with its own range, plain labels (scripts/prewarBodyApartCheck.mjs)", "PASS", (out.match(/prewarBodyApartCheck: .*/) || [""])[0]);
} catch (e) {
  record("engine: before 1949 body style is an apart dimension by default, each body with its own range, plain labels (scripts/prewarBodyApartCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/refineKeyParityCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("engine: every refine shape keys the same stored row as on main (scripts/refineKeyParityCheck.mjs)", "PASS", (out.match(/refineKeyParityCheck: .*/) || [""])[0]);
} catch (e) {
  record("engine: every refine shape keys the same stored row as on main (scripts/refineKeyParityCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/groupFenceCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("engine: the price fence is read within the group a sale belongs to (body, gearbox, year, mileage band), never across a pool that prices apart (scripts/groupFenceCheck.mjs)", "PASS", (out.match(/groupFenceCheck: .*/) || [""])[0]);
} catch (e) {
  record("engine: the price fence is read within the group a sale belongs to (body, gearbox, year, mileage band), never across a pool that prices apart (scripts/groupFenceCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/salesListOrderCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("engine: every dated sales list in an answer is newest first on every tier, thin and apart included (scripts/salesListOrderCheck.mjs)", "PASS", (out.match(/salesListOrderCheck: .*/) || [""])[0]);
} catch (e) {
  record("engine: every dated sales list in an answer is newest first on every tier, thin and apart included (scripts/salesListOrderCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/poolSourceCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("engine: a house-heavy car's Market Check pool is the whole record, house sales included; an online-heavy car keeps the online band (scripts/poolSourceCheck.mjs)", "PASS", (out.match(/poolSourceCheck: .*/) || [""])[0]);
} catch (e) {
  record("engine: a house-heavy car's Market Check pool is the whole record, house sales included; an online-heavy car keeps the online band (scripts/poolSourceCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/sheetReadCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("Desk item 2: the one sheet read call carries Market Check's figures for twenty cars (count, range, window, splits, tier pool, starting figure), reads a VIN's car, returns null for a car it cannot read (scripts/sheetReadCheck.mjs)", "PASS", (out.match(/all passed/) || [""])[0]);
} catch (e) {
  record("Desk item 2: the one sheet read call carries Market Check's figures for twenty cars (count, range, window, splits, tier pool, starting figure), reads a VIN's car, returns null for a car it cannot read (scripts/sheetReadCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 3).join(" | "));
}
try {
  const out = execSync("node scripts/deskWindowCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("Desk v4 stage 1: desk.evidence.byWindow for 6, 12 and 24 months holds exactly the dated sales on or after each cutoff, the chosen window (default 12) is desk.evidence and market.meter, an insufficient window has a sentence and no number; twelve mutants (scripts/deskWindowCheck.mjs)", "PASS", (out.match(/deskWindowCheck: .*/) || [""])[0]);
} catch (e) {
  record("Desk v4 stage 1: desk.evidence.byWindow for 6, 12 and 24 months holds exactly the dated sales on or after each cutoff, the chosen window (default 12) is desk.evidence and market.meter, an insufficient window has a sentence and no number; twelve mutants (scripts/deskWindowCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 3).join(" | "));
}
try {
  const out = execSync("node scripts/deskSalesCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("Desk v4 stage 2: desk.sales is the chosen window's population (every dot a pool sale, newest first, photo own or null) and desk.rungs counts agree with the dots, a band only at five or more and a thin rung lists what it sold for; ten mutants (scripts/deskSalesCheck.mjs)", "PASS", (out.match(/deskSalesCheck: .*/) || [""])[0]);
} catch (e) {
  record("Desk v4 stage 2: desk.sales is the chosen window's population (every dot a pool sale, newest first, photo own or null) and desk.rungs counts agree with the dots, a band only at five or more and a thin rung lists what it sold for; ten mutants (scripts/deskSalesCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 3).join(" | "));
}
try {
  const out = execSync("node scripts/deskReserveCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("Desk v4 stage 3: desk.reserveCheck reached equals the window's sales at or above the figure for a sweep of figures, position and supported follow q1 and q3, an insufficient window has no position, desk.reserveStart is q1; thirteen mutants (scripts/deskReserveCheck.mjs)", "PASS", (out.match(/deskReserveCheck: .*/) || [""])[0]);
} catch (e) {
  record("Desk v4 stage 3: desk.reserveCheck reached equals the window's sales at or above the figure for a sweep of figures, position and supported follow q1 and q3, an insufficient window has no position, desk.reserveStart is q1; thirteen mutants (scripts/deskReserveCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 3).join(" | "));
}
try {
  const out = execSync("node scripts/deskWhyCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("Desk v4 stage 4: desk.supports, desk.considered and desk.whyDraft from the factors and the case's verification states; a seller stated item is never support and reads outstanding until verified for every factor and state, no figure unless the sales isolated an effect, the draft is one or two table sentences; ten mutants (scripts/deskWhyCheck.mjs)", "PASS", (out.match(/deskWhyCheck: .*/) || [""])[0]);
} catch (e) {
  record("Desk v4 stage 4: desk.supports, desk.considered and desk.whyDraft from the factors and the case's verification states; a seller stated item is never support and reads outstanding until verified for every factor and state, no figure unless the sales isolated an effect, the draft is one or two table sentences; ten mutants (scripts/deskWhyCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 3).join(" | "));
}
try {
  const out = execSync("node scripts/deskHeaderCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("Desk v4 stage 5: desk.titleLine is the engine's title and not the typed label, desk.specLine, comparables carry url and a photo that is null or passed the rule, live rows carry url, quarters carry count and shown; seven mutants (scripts/deskHeaderCheck.mjs)", "PASS", (out.match(/deskHeaderCheck: .*/) || [""])[0]);
} catch (e) {
  record("Desk v4 stage 5: desk.titleLine is the engine's title and not the typed label, desk.specLine, comparables carry url and a photo that is null or passed the rule, live rows carry url, quarters carry count and shown; seven mutants (scripts/deskHeaderCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 3).join(" | "));
}
try {
  const out = execSync("node scripts/deskEvidenceCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("Desk v3 stage 1: desk.evidence (as of date, count, median, quartiles, range, latest sale, stale flag) equals the meter for every Desk model; an insufficient population carries a sentence and no number; the stale flag flips at the threshold; eight mutants (scripts/deskEvidenceCheck.mjs)", "PASS", (out.match(/deskEvidenceCheck: .*/) || [""])[0]);
} catch (e) {
  record("Desk v3 stage 1: desk.evidence (as of date, count, median, quartiles, range, latest sale, stale flag) equals the meter for every Desk model; an insufficient population carries a sentence and no number; the stale flag flips at the threshold; eight mutants (scripts/deskEvidenceCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 3).join(" | "));
}
try {
  const out = execSync("node scripts/deskCompsCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("Desk v3 stage 2: desk.comparables are decided by verified year, generation, body, gearbox and miles (never the model name), why sentences come from the reason table, a photo is the one that passed the photo rule or null, outside groups are never inside the population; eleven mutants (scripts/deskCompsCheck.mjs)", "PASS", (out.match(/deskCompsCheck: .*/) || [""])[0]);
} catch (e) {
  record("Desk v3 stage 2: desk.comparables are decided by verified year, generation, body, gearbox and miles (never the model name), why sentences come from the reason table, a photo is the one that passed the photo rule or null, outside groups are never inside the population; eleven mutants (scripts/deskCompsCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 3).join(" | "));
}
try {
  const out = execSync("node scripts/deskOlderCarsCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("Desk older cars (the 24 recorded answers of Lane F as the fixture): no refusal (a typed body falls back to sibling words then all bodies, each named; a tier with no data reads all conditions), the years widen by the engine's own walk until the Desk population meets the minimum, a thin 12 months defaults to 24 with a sentence, three or more comparables with why lines, one name for the car; sixteen mutants (scripts/deskOlderCarsCheck.mjs)", "PASS", (out.match(/deskOlderCarsCheck: .*/) || [""])[0]);
} catch (e) {
  record("Desk older cars (the 24 recorded answers of Lane F as the fixture): no refusal (a typed body falls back to sibling words then all bodies, each named; a tier with no data reads all conditions), the years widen by the engine's own walk until the Desk population meets the minimum, a thin 12 months defaults to 24 with a sentence, three or more comparables with why lines, one name for the car; sixteen mutants (scripts/deskOlderCarsCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 3).join(" | "));
}
try {
  const out = execSync("node scripts/tasksCriteriaCheck.mjs --mutants", { encoding: "utf8", timeout: 240000 });
  record("Tasks criteria: the signed in owner's list answer carries each Task's criteria in the engine's words (criteriaOf, the match email's source), equal to the crew preview door's, empty for a Task with no filters or a research Task, never another user's; six mutants (scripts/tasksCriteriaCheck.mjs)", "PASS", (out.match(/tasksCriteriaCheck: .*/) || [""])[0]);
} catch (e) {
  record("Tasks criteria: the signed in owner's list answer carries each Task's criteria in the engine's words (criteriaOf, the match email's source), equal to the crew preview door's, empty for a Task with no filters or a research Task, never another user's; six mutants (scripts/tasksCriteriaCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^(FAIL|SURVIVED)/.test(l)).slice(0, 3).join(" | "));
}
try {
  const out = execSync("node scripts/deskQuarterCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("Desk v3 stage 3: a quarter under DESK_QUARTER_MIN sales has shown false and no median; live listings are typed bid, ask or no_sale and never in the evidence or the comparables; seven mutants (scripts/deskQuarterCheck.mjs)", "PASS", (out.match(/deskQuarterCheck: .*/) || [""])[0]);
} catch (e) {
  record("Desk v3 stage 3: a quarter under DESK_QUARTER_MIN sales has shown false and no median; live listings are typed bid, ask or no_sale and never in the evidence or the comparables; seven mutants (scripts/deskQuarterCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 3).join(" | "));
}
try {
  const out = execSync("node scripts/deskFactorsCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("Desk v3 stage 4: desk.condition (one of the four rungs, from the case, the car's listing or the sales near its miles) and desk.factors (an effect only where both groups have three sales and their prices do not overlap, no fixed dollar figure, service_ims the 996 family only, sentences from the reason table); ten mutants (scripts/deskFactorsCheck.mjs)", "PASS", (out.match(/deskFactorsCheck: .*/) || [""])[0]);
} catch (e) {
  record("Desk v3 stage 4: desk.condition (one of the four rungs, from the case, the car's listing or the sales near its miles) and desk.factors (an effect only where both groups have three sales and their prices do not overlap, no fixed dollar figure, service_ims the 996 family only, sentences from the reason table); ten mutants (scripts/deskFactorsCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 3).join(" | "));
}
try {
  const out = execSync("node scripts/deskRecomputeCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("Desk v3 stage 5: desk.original is the untouched evidence; note_only changes nothing, report_comps changes the comparables only, market_calc changes the market figures and not the comparables; nothing is written; eight mutants (scripts/deskRecomputeCheck.mjs)", "PASS", (out.match(/deskRecomputeCheck: .*/) || [""])[0]);
} catch (e) {
  record("Desk v3 stage 5: desk.original is the untouched evidence; note_only changes nothing, report_comps changes the comparables only, market_calc changes the market figures and not the comparables; nothing is written; eight mutants (scripts/deskRecomputeCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 3).join(" | "));
}
try {
  const out = execSync("node scripts/tierAssignCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("Desk item 1: every sale gets a condition tier from its own listing (every evidence line, Untiered, hard negatives), the nightly job writes batches with a pause and is resumable, the SQL carries RLS (scripts/tierAssignCheck.mjs)", "PASS", (out.match(/all passed/) || [""])[0]);
} catch (e) {
  record("Desk item 1: every sale gets a condition tier from its own listing (every evidence line, Untiered, hard negatives), the nightly job writes batches with a pause and is resumable, the SQL carries RLS (scripts/tierAssignCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 3).join(" | "));
}
try {
  const out = execSync("node scripts/tierMarkCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("Desk tier ladder from one source, four tiers, analyst plus or minus changes nothing the engine said, Untiered refuses, finalised keeps it, PDF and email carry it (scripts/tierMarkCheck.mjs)", "PASS", (out.match(/tierMarkCheck: .*/) || [""])[0]);
} catch (e) {
  record("Desk tier ladder from one source, four tiers, analyst plus or minus changes nothing the engine said, Untiered refuses, finalised keeps it, PDF and email carry it (scripts/tierMarkCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 3).join(" | ") || String(e.message).slice(0, 160));
}
try {
  const out = execSync("node scripts/deskDashCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("Desk copy has no em or en dash: Desk code outside comments, the PDF, the Send email, the sheet view (scripts/deskDashCheck.mjs)", "PASS", (out.match(/deskDashCheck: .*/) || [""])[0]);
} catch (e) {
  record("Desk copy has no em or en dash: Desk code outside comments, the PDF, the Send email, the sheet view (scripts/deskDashCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 3).join(" | ") || String(e.message).slice(0, 160));
}
try {
  const out = execSync("node scripts/deskDemoCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("Desk demo: New valuation by hand with the shared naming and photos, the org's own name logo and colour on the PDF and email with no GoAskSam, the whole same tier pool with the median marked, My reports with dates, the preview carries it (scripts/deskDemoCheck.mjs)", "PASS", (out.match(/deskDemoCheck: .*/) || [""])[0]);
} catch (e) {
  record("Desk demo: New valuation by hand with the shared naming and photos, the org's own name logo and colour on the PDF and email with no GoAskSam, the whole same tier pool with the median marked, My reports with dates, the preview carries it (scripts/deskDemoCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 3).join(" | ") || String(e.message).slice(0, 160));
}
try {
  const out = execSync("node scripts/deskBlockersCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("Desk demo blockers: a pool that splits asks the body first and reads that body's tier pool, every same tier sale with real miles and the mileage band marked, a draft PDF before finalise, the no-listing line (scripts/deskBlockersCheck.mjs)", "PASS", (out.match(/deskBlockersCheck: .*/) || [""])[0]);
} catch (e) {
  record("Desk demo blockers: a pool that splits asks the body first and reads that body's tier pool, every same tier sale with real miles and the mileage band marked, a draft PDF before finalise, the no-listing line (scripts/deskBlockersCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 3).join(" | ") || String(e.message).slice(0, 160));
}
try {
  const out = execSync("node scripts/deskDryrun2Check.mjs", { encoding: "utf8", timeout: 280000 });
  record("Desk dry run 2: photos addable any time with a cover and a strip, every click lights under 100 ms with a working state, one press opens a sheet, the range meter follows the picked body and tier, the analyst marker, the reserve held against the meter's range, the question for the seller, the engine's tier lines (scripts/deskDryrun2Check.mjs)", "PASS", (out.match(/deskDryrun2Check: .*/) || [""])[0]);
} catch (e) {
  record("Desk dry run 2: photos addable any time with a cover and a strip, every click lights under 100 ms with a working state, one press opens a sheet, the range meter follows the picked body and tier, the analyst marker, the reserve held against the meter's range, the question for the seller, the engine's tier lines (scripts/deskDryrun2Check.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 3).join(" | ") || String(e.message).slice(0, 160));
}
try {
  const out = execSync("node scripts/deskCaseCheck.mjs", { encoding: "utf8", timeout: 60000 });
  record("Desk v3 stage 1: the case record (one source per field, asked once, mileage in one place, photos append only, needs review and exclusions carry reasons) (scripts/deskCaseCheck.mjs)", "PASS", (out.match(/deskCaseCheck: .*/) || [""])[0]);
} catch (e) {
  record("Desk v3 stage 1: the case record (scripts/deskCaseCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 3).join(" | ") || String(e.message).slice(0, 160));
}
try {
  const out = execSync("node scripts/deskPreviewImageCheck.mjs", { encoding: "utf8", timeout: 90000 });
  record("Desk v3 preview door: the report fetches its cover, comparables and logo from the listing photo hosts only, https, under the photo rule (scripts/deskPreviewImageCheck.mjs)", "PASS", (out.match(/deskPreviewImageCheck: .*/) || [""])[0]);
} catch (e) {
  record("Desk v3 preview door images (scripts/deskPreviewImageCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 3).join(" | ") || String(e.message).slice(0, 160));
}
try {
  const out = execSync("node scripts/deskReserveFlowCheck.mjs", { encoding: "utf8", timeout: 200000 });
  record("Desk v4 stage 1: the recommended reserve is the case's one figure, the engine starts and checks it, the period is an engine input, no file compares a reserve to a range (scripts/deskReserveFlowCheck.mjs)", "PASS", (out.match(/deskReserveFlowCheck: .*/) || [""])[0]);
} catch (e) {
  record("Desk v4 stage 1 reserve (scripts/deskReserveFlowCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 3).join(" | ") || String(e.message).slice(0, 160));
}
try {
  const out = execSync("node scripts/deskNextStepsCheck.mjs", { encoding: "utf8", timeout: 200000 });
  record("Desk v4 stage 3: next steps are the case's own list, seeded through reasonWords, edited, removed, added and reordered by step key, printed as written (scripts/deskNextStepsCheck.mjs)", "PASS", (out.match(/deskNextStepsCheck: .*/) || [""])[0]);
} catch (e) {
  record("Desk v4 stage 3 next steps (scripts/deskNextStepsCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 3).join(" | ") || String(e.message).slice(0, 160));
}
try {
  const out = execSync("node scripts/deskActionsResolveCheck.mjs", { encoding: "utf8", timeout: 200000 });
  record("Desk v4 stage 2: every needs attention action on every case resolves by item key and returns the caseView; doc_add, Select all, touched comparable rows (scripts/deskActionsResolveCheck.mjs)", "PASS", (out.match(/deskActionsResolveCheck: .*/) || [""])[0]);
} catch (e) {
  record("Desk v4 stage 2 ops that always resolve (scripts/deskActionsResolveCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 3).join(" | ") || String(e.message).slice(0, 160));
}
try {
  const out = execSync("node scripts/deskDemoCarCheck.mjs", { encoding: "utf8", timeout: 60000 });
  record("Desk v3 demonstration car is a real archive sale: VIN, listing and first photo from one record, recorded rung counts in the lane notes (scripts/deskDemoCarCheck.mjs)", "PASS", (out.match(/deskDemoCarCheck: .*/) || [""])[0]);
} catch (e) {
  record("Desk v3 demonstration car (scripts/deskDemoCarCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 3).join(" | ") || String(e.message).slice(0, 160));
}
try {
  const out = execSync("node scripts/deskAuditLineCheck.mjs", { encoding: "utf8", timeout: 60000 });
  record("Desk v3 audit trail: every entry carries its own reasonWords sentence, no writer builds one by hand, the page prints it as carried (scripts/deskAuditLineCheck.mjs)", "PASS", (out.match(/deskAuditLineCheck: .*/) || [""])[0]);
} catch (e) {
  record("Desk v3 audit trail (scripts/deskAuditLineCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 3).join(" | ") || String(e.message).slice(0, 160));
}
try {
  const out = execSync("node scripts/deskRungsCheck.mjs", { encoding: "utf8", timeout: 60000 });
  record("Desk v3 condition rungs: the engine's count and range per rung for a demonstration car, read only (scripts/deskRungsCheck.mjs)", "PASS", (out.match(/deskRungsCheck: .*/) || [""])[0]);
} catch (e) {
  record("Desk v3 condition rungs (scripts/deskRungsCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 3).join(" | ") || String(e.message).slice(0, 160));
}
try {
  const out = execSync("node scripts/deskShapesCheck.mjs", { encoding: "utf8", timeout: 60000 });
  record("Desk v3 shapes: case.stage, case.queue and case.handling.lines come from the server, the page counts nothing (scripts/deskShapesCheck.mjs)", "PASS", (out.match(/deskShapesCheck: .*/) || [""])[0]);
} catch (e) {
  record("Desk v3 shapes (scripts/deskShapesCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 3).join(" | ") || String(e.message).slice(0, 160));
}
try {
  const out = execSync("node scripts/deskWorkflowCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("Desk v3 stage 2: correcting a field logs and resets verification, mileage, transmission, body, generation and market_calc exclusions re-call the engine and store desk.original and desk.evidence, needs review is generated from source states (scripts/deskWorkflowCheck.mjs)", "PASS", (out.match(/deskWorkflowCheck: .*/) || [""])[0]);
} catch (e) {
  record("Desk v3 stage 2 (scripts/deskWorkflowCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 3).join(" | ") || String(e.message).slice(0, 160));
}
try {
  const out = execSync("node scripts/deskReadinessCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("Desk v3 stage 2: each readiness blocker alone blocks, optional missing things never do (scripts/deskReadinessCheck.mjs)", "PASS", (out.match(/deskReadinessCheck: .*/) || [""])[0]);
} catch (e) {
  record("Desk v3 stage 2 (scripts/deskReadinessCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 3).join(" | ") || String(e.message).slice(0, 160));
}
try {
  const out = execSync("node scripts/deskIndependenceCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("Desk v3 stage 2: assessment and reserve are independent numbers (scripts/deskIndependenceCheck.mjs)", "PASS", (out.match(/deskIndependenceCheck: .*/) || [""])[0]);
} catch (e) {
  record("Desk v3 stage 2 (scripts/deskIndependenceCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 3).join(" | ") || String(e.message).slice(0, 160));
}
try {
  const out = execSync("node scripts/deskVersionCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("Desk v3 stage 2: a finalized version is immutable and a later edit makes version n plus 1 (scripts/deskVersionCheck.mjs)", "PASS", (out.match(/deskVersionCheck: .*/) || [""])[0]);
} catch (e) {
  record("Desk v3 stage 2 (scripts/deskVersionCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 3).join(" | ") || String(e.message).slice(0, 160));
}
try {
  const out = execSync("node scripts/deskStateCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("Desk v3 stage 3: every report sentence is built from the case through reasonWords and changes with its case field (documents received, mileage verified, reserve across q1 and q3, seller agreed, comparable excluded); a draft never claims what the case cannot support (scripts/deskStateCheck.mjs)", "PASS", (out.match(/deskStateCheck: .*/) || [""])[0]);
} catch (e) {
  record("Desk v3 stage 3 (scripts/deskStateCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 3).join(" | ") || String(e.message).slice(0, 160));
}
try {
  const out = execSync("node scripts/deskPdfCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("Desk v3 stage 4: the four page report (four pages, no empty page, no placeholder picture, DRAFT only on previews, page numbers, links, only shown quarters, content from the case) (scripts/deskPdfCheck.mjs)", "PASS", (out.match(/deskPdfCheck: .*/) || [""])[0]);
} catch (e) {
  record("Desk v3 stage 4 (scripts/deskPdfCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 3).join(" | ") || String(e.message).slice(0, 160));
}
try {
  const out = execSync("node scripts/deskFormatCheck.mjs", { encoding: "utf8", timeout: 60000 });
  record("Desk and PDF files format no figure of their own: dollars from moneyWords, counts and mileages from countNoun (scripts/deskFormatCheck.mjs)", "PASS", (out.match(/deskFormatCheck: .*/) || [""])[0]);
} catch (e) {
  record("Desk and PDF files format no figure of their own (scripts/deskFormatCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 3).join(" | ") || String(e.message).slice(0, 160));
}
try {
  const out = execSync("node scripts/deskHandlingCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("Desk v3 stage 5: opened_at on the first open per analyst, handling seconds on finalize, the crew dashboard block per org with no per analyst figure (scripts/deskHandlingCheck.mjs)", "PASS", (out.match(/deskHandlingCheck: .*/) || [""])[0]);
} catch (e) {
  record("Desk v3 stage 5 (scripts/deskHandlingCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 3).join(" | ") || String(e.message).slice(0, 160));
}
try {
  const out = execSync("node scripts/deskTypedSentenceCheck.mjs", { encoding: "utf8", timeout: 60000 });
  record("Desk typed sentences: no Desk file types an engine reason line, reads optionsNote/windowNote, or joins a count to a plural by hand (scripts/deskTypedSentenceCheck.mjs)", "PASS", (out.match(/deskTypedSentenceCheck: .*/) || [""])[0]);
} catch (e) {
  record("Desk typed sentences: no Desk file types an engine reason line, reads optionsNote/windowNote, or joins a count to a plural by hand (scripts/deskTypedSentenceCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 3).join(" | ") || String(e.message).slice(0, 160));
}
try {
  const out = execSync("node scripts/sheetVersionCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("Desk two tabs: a sheet save or finalise names the version it read, a stale one is refused with the reload line, nothing is overwritten (scripts/sheetVersionCheck.mjs)", "PASS", (out.match(/sheetVersionCheck: .*/) || [""])[0]);
} catch (e) {
  record("Desk two tabs: a sheet save or finalise names the version it read, a stale one is refused with the reload line, nothing is overwritten (scripts/sheetVersionCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 3).join(" | ") || String(e.message).slice(0, 160));
}
try {
  const out = execSync("node scripts/tierWordsCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("Desk item 1: no common word flips a condition tier on its own (project, custom, incomplete, crash, collision, struck, receipts, numbers matching, factory paint, tuned, lowered, swapped, upgraded, a none modifications field, Not salvage), the real cases still fire, ct2 (scripts/tierWordsCheck.mjs)", "PASS", (out.match(/all passed/) || [""])[0]);
} catch (e) {
  record("Desk item 1: no common word flips a condition tier on its own (project, custom, incomplete, crash, collision, struck, receipts, numbers matching, factory paint, tuned, lowered, swapped, upgraded, a none modifications field, Not salvage), the real cases still fire, ct2 (scripts/tierWordsCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 3).join(" | "));
}
try {
  const out = execSync("node scripts/trimWordKeptCheck.mjs", { encoding: "utf8", timeout: 400000 });
  record("A real trim word is never silently dropped (2024 Range Rover Autobiography printed \"Sam didn't use 'autobiography'\" and read the bare model): Land Rover, Jaguar, Maybach, Jeep, Rolls-Royce, Tesla, Toyota, Maserati, Bentley, Porsche trim words are read, a thin trim says how many of the sales are its own and offers a Narrow by pill (scripts/trimWordKeptCheck.mjs, mutants in trimWordKeptMutants.mjs)", "PASS", (out.match(/trimWordKeptCheck: .*/) || [""])[0]);
} catch (e) {
  record("A real trim word is never silently dropped (2024 Range Rover Autobiography printed \"Sam didn't use 'autobiography'\" and read the bare model): Land Rover, Jaguar, Maybach, Jeep, Rolls-Royce, Tesla, Toyota, Maserati, Bentley, Porsche trim words are read, a thin trim says how many of the sales are its own and offers a Narrow by pill (scripts/trimWordKeptCheck.mjs, mutants in trimWordKeptMutants.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 6).join(" | ") || String(e.message || e).slice(0, 300));
}
try {
  const out = execSync("node scripts/cardQueryReadBackCheck.mjs", { encoding: "utf8", timeout: 400000 });
  record("Find card: the Market Check question a card carries reads back as the card's own spec (1995 Ferrari F355 Spider read 14 sales on the card and 12 behind its button), and the live sample asks the card's own question (scripts/cardQueryReadBackCheck.mjs, mutants in cardQueryReadBackMutants.mjs)", "PASS", (out.match(/cardQueryReadBackCheck: .*/) || [""])[0]);
} catch (e) {
  record("Find card: the Market Check question a card carries reads back as the card's own spec (1995 Ferrari F355 Spider read 14 sales on the card and 12 behind its button), and the live sample asks the card's own question (scripts/cardQueryReadBackCheck.mjs, mutants in cardQueryReadBackMutants.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 6).join(" | ") || String(e.message || e).slice(0, 300));
}
try {
  const out = execSync("node scripts/tierSpeedCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("Desk item 1: the condition tier job takes sales model by model (each model read once), gives the same tiers as the id-order job, judges slowness on the database's own request times, and tiers the Desk's and most searched models first (scripts/tierSpeedCheck.mjs)", "PASS", (out.match(/tierSpeedCheck: .*/) || [""])[0]);
} catch (e) {
  record("Desk item 1: the condition tier job takes sales model by model (each model read once), gives the same tiers as the id-order job, judges slowness on the database's own request times, and tiers the Desk's and most searched models first (scripts/tierSpeedCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 6).join(" | ") || String(e.message || e).slice(0, 300));
}
try {
  const out = execSync("node scripts/tierBandPoolCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("Desk item 1: a condition tier reads a sale's mileage against its Desk family and generation (911, 996 and 997 are one family, each generation its own pool), one quartile read per pool (scripts/tierBandPoolCheck.mjs, mutants in tierBandPoolMutants.mjs)", "PASS", (out.match(/tierBandPoolCheck: .*/) || [""])[0]);
} catch (e) {
  record("Desk item 1: a condition tier reads a sale's mileage against its Desk family and generation (911, 996 and 997 are one family, each generation its own pool), one quartile read per pool (scripts/tierBandPoolCheck.mjs, mutants in tierBandPoolMutants.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 6).join(" | ") || String(e.message || e).slice(0, 300));
}
try {
  const out = execSync("node scripts/tierJobSafetyCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("Desk item 1: the condition tier job is safe on the live site (a max or batch that is not a whole number fails, bounded batches, a failed read is never 'no band', no half written row, slow batches stop the run, schedule outside the ingest) (scripts/tierJobSafetyCheck.mjs)", "PASS", (out.match(/all passed/) || [""])[0]);
} catch (e) {
  record("Desk item 1: the condition tier job is safe on the live site (a max or batch that is not a whole number fails, bounded batches, a failed read is never 'no band', no half written row, slow batches stop the run, schedule outside the ingest) (scripts/tierJobSafetyCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 3).join(" | "));
}
try {
  const out = execSync("node scripts/tierPoolCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("Desk item 1: refine.conditionTier returns the same tier pool, the pool after tier and mileage band and a starting figure (median, null under five); no tier passed changes nothing (scripts/tierPoolCheck.mjs)", "PASS", (out.match(/all passed/) || [""])[0]);
} catch (e) {
  record("Desk item 1: refine.conditionTier returns the same tier pool, the pool after tier and mileage band and a starting figure (median, null under five); no tier passed changes nothing (scripts/tierPoolCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 3).join(" | "));
}
try {
  const out = execSync("node scripts/nameGuardCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("names: a coachbuilder phrase, a lot or reference number, an engine or gearbox word and the front half of a two-word model never become a car's name, and a stored row under such a name is read as no row (scripts/nameGuardCheck.mjs)", "PASS", (out.match(/nameGuardCheck: .*/) || [""])[0]);
} catch (e) {
  record("names: a coachbuilder phrase, a lot or reference number, an engine or gearbox word and the front half of a two-word model never become a car's name, and a stored row under such a name is read as no row (scripts/nameGuardCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/prewarBodyStoredCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("engine: a stored pre-war multi-body answer from before the apart rule is read as no row by both Market Check readers, whatever its staleSince (scripts/prewarBodyStoredCheck.mjs)", "PASS", (out.match(/prewarBodyStoredCheck: .*/) || [""])[0]);
} catch (e) {
  record("engine: a stored pre-war multi-body answer from before the apart rule is read as no row by both Market Check readers, whatever its staleSince (scripts/prewarBodyStoredCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/typedAttributeCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("engine: a typed gearbox, engine or body word is applied or announced, never dropped; the classic bodies are separate pools; sales can be read by date (scripts/typedAttributeCheck.mjs)", "PASS", (out.match(/typedAttributeCheck: .*/) || [""])[0]);
} catch (e) {
  record("engine: a typed gearbox, engine or body word is applied or announced, never dropped; the classic bodies are separate pools; sales can be read by date (scripts/typedAttributeCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/mileageBandNearCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("engine: a car in a thin mileage band headlines the nearest band with a range, the option list never restates the headline, bands print ascending, a Task match reason names the car (scripts/mileageBandNearCheck.mjs)", "PASS", (out.match(/mileageBandNearCheck: .*/) || [""])[0]);
} catch (e) {
  record("engine: a car in a thin mileage band headlines the nearest band with a range, the option list never restates the headline, bands print ascending, a Task match reason names the car (scripts/mileageBandNearCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Lane E, Oct 30 2026: the pages print the engine's near-band fields and nothing of their own. No network.
try {
  const out = execSync("node scripts/nearBandPagesCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("engine fields on the pages: Market Check prints nearBand.line, Find's panel prints findAnswer.otherLines (scripts/nearBandPagesCheck.mjs)", "PASS", (out.match(/nearBandPagesCheck: .*/) || [""])[0]);
} catch (e) {
  record("engine fields on the pages: Market Check prints nearBand.line, Find's panel prints findAnswer.otherLines (scripts/nearBandPagesCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/trimCodesCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("resolver: a short trim code (C4S, C2S, Z4 3.0) is read as the trim's full name on its own car only (scripts/trimCodesCheck.mjs)", "PASS", (out.match(/trimCodesCheck: .*/) || [""])[0]);
} catch (e) {
  record("resolver: a short trim code (C4S, C2S, Z4 3.0) is read as the trim's full name on its own car only (scripts/trimCodesCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/unknownTrimReadsModelCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("engine: a typed trim with no sales of its own reads the model's market and says so, never not tracked (scripts/unknownTrimReadsModelCheck.mjs)", "PASS", (out.match(/unknownTrimReadsModelCheck: .*/) || [""])[0]);
} catch (e) {
  record("engine: a typed trim with no sales of its own reads the model's market and says so, never not tracked (scripts/unknownTrimReadsModelCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/storedQuestionRecheckCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("engine: a stored result a question rule has since overtaken (a no-year text) is read as no row, so the generation, trim or body question is served (scripts/storedQuestionRecheckCheck.mjs)", "PASS", (out.match(/storedQuestionRecheckCheck: .*/) || [""])[0]);
} catch (e) {
  record("engine: a stored result a question rule has since overtaken (a no-year text) is read as no row, so the generation, trim or body question is served (scripts/storedQuestionRecheckCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/emptyHeadingCheck.mjs", { encoding: "utf8", timeout: 590000 });
  record("Market Check and Find: no heading is followed by blank space or an empty region (withheld, none, drawn chart, thin tiles, options, Find) (scripts/emptyHeadingCheck.mjs)", "PASS", (out.match(/emptyHeadingCheck: .*/) || [""])[0]);
} catch (e) {
  record("Market Check and Find: no heading is followed by blank space or an empty region (withheld, none, drawn chart, thin tiles, options, Find) (scripts/emptyHeadingCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/pendingCardFillCheck.mjs", { encoding: "utf8", timeout: 590000 });
  record("Find: a pending card keeps being asked for until the engine answers or its wait passes, and redraws in place, never stranded on the pending line (scripts/pendingCardFillCheck.mjs)", "PASS", (out.match(/pendingCardFillCheck: .*/) || [""])[0]);
} catch (e) {
  record("Find: a pending card keeps being asked for until the engine answers or its wait passes, and redraws in place, never stranded on the pending line (scripts/pendingCardFillCheck.mjs)", "FAIL", String(e.stdout || e.message).split("\n").filter(l => /FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/cardLevelCheck.mjs", { encoding: "utf8", timeout: 590000 });
  record("Find: the Sam block is a fixed-height slot and the chips row a fixed two-line height, so the View auction buttons of every card in a row sit on one line in every state, at 1440 and 390 (scripts/cardLevelCheck.mjs)", "PASS", (out.match(/cardLevelCheck: .*/) || [""])[0]);
} catch (e) {
  record("Find: the Sam block is a fixed-height slot and the chips row a fixed two-line height, so the View auction buttons of every card in a row sit on one line in every state, at 1440 and 390 (scripts/cardLevelCheck.mjs)", "FAIL", String(e.stdout || e.message).split("\n").filter(l => /FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/spacedModelCodeCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("resolver: a model code typed with a space (RS 6, M 3, X 5) is the glued model, so a known car is never refused as unchecked (scripts/spacedModelCodeCheck.mjs)", "PASS", (out.match(/spacedModelCodeCheck: .*/) || [""])[0]);
} catch (e) {
  record("resolver: a model code typed with a space (RS 6, M 3, X 5) is the glued model, so a known car is never refused as unchecked (scripts/spacedModelCodeCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/chartNoReasonCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("chart: a withheld chart prints the engine's plain heading and no reason on any page, and a stored row serves it at read time (scripts/chartNoReasonCheck.mjs)", "PASS", (out.match(/chartNoReasonCheck: .*/) || [""])[0]);
} catch (e) {
  record("chart: a withheld chart prints the engine's plain heading and no reason on any page, and a stored row serves it at read time (scripts/chartNoReasonCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/numberSentenceCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("pages print engine sentences: the year-before, last-sale, sold-before, distribution, facts and latest-quarter lines are engine lines at read time, none written by a page (scripts/numberSentenceCheck.mjs)", "PASS", (out.match(/numberSentenceCheck: .*/) || [""])[0]);
} catch (e) {
  record("pages print engine sentences: the year-before, last-sale, sold-before, distribution, facts and latest-quarter lines are engine lines at read time, none written by a page (scripts/numberSentenceCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/rungAlwaysCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("engine: every result, thin and refusal answer leaves with a recognized rung and a label, so the store guard never refuses a Find pre-fill for fallback_rung_not_recognized (scripts/rungAlwaysCheck.mjs)", "PASS", (out.match(/rungAlwaysCheck: .*/) || [""])[0]);
} catch (e) {
  record("engine: every result, thin and refusal answer leaves with a recognized rung and a label, so the store guard never refuses a Find pre-fill for fallback_rung_not_recognized (scripts/rungAlwaysCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/droppedTrimCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("engine: a typed trim the pool does not carry reads the model's pool and says so, never a 'could not be checked' refusal (scripts/droppedTrimCheck.mjs)", "PASS", (out.match(/droppedTrimCheck: .*/) || [""])[0]);
} catch (e) {
  record("engine: a typed trim the pool does not carry reads the model's pool and says so, never a 'could not be checked' refusal (scripts/droppedTrimCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/chartYearScopeCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("chart: on a year split the chart is never drawn from another year's sales (scripts/chartYearScopeCheck.mjs)", "PASS", (out.match(/chartYearScopeCheck: .*/) || [""])[0]);
} catch (e) {
  record("chart: on a year split the chart is never drawn from another year's sales (scripts/chartYearScopeCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/vinPlanCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("vin: the VIN's own resolved car is never refused by a re-read of its words (a question or an invalid year), so typed and VIN do not differ into a dead end (scripts/vinPlanCheck.mjs)", "PASS", (out.match(/vinPlanCheck: .*/) || [""])[0]);
} catch (e) {
  record("vin: the VIN's own resolved car is never refused by a re-read of its words (a question or an invalid year), so typed and VIN do not differ into a dead end (scripts/vinPlanCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/appliedAllCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("filters: every way the engine narrows (pill, band, typed miles, gearbox, body, year, edition, trim, history, detail) is named with its clear (scripts/appliedAllCheck.mjs)", "PASS", (out.match(/appliedAllCheck: .*/) || [""])[0]);
} catch (e) {
  record("filters: every way the engine narrows (pill, band, typed miles, gearbox, body, year, edition, trim, history, detail) is named with its clear (scripts/appliedAllCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// An ended lot never stays unmarked past one pull cycle (Lane B, Oct 29 2026).
try {
  const out = execSync("node scripts/endedLotCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("live: an ended lot is marked ended on the next pull cycle and never read as live (scripts/endedLotCheck.mjs)", "PASS", (out.match(/endedLotCheck: .*/) || [""])[0]);
} catch (e) {
  record("live: an ended lot is marked ended on the next pull cycle and never read as live (scripts/endedLotCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// A landing example is the engine's answer and nothing else: no cluster rule, sales floor or generation floor of a builder's own (Lane B, Oct 29 2026).
try {
  const out = execSync("node scripts/exampleFromEngineCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("examples: the Market Check and Desk builders store the engine's answer as it is (scripts/exampleFromEngineCheck.mjs)", "PASS", (out.match(/exampleFromEngineCheck: .*/) || [""])[0]);
} catch (e) {
  record("examples: the Market Check and Desk builders store the engine's answer as it is (scripts/exampleFromEngineCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// A cold Market Check never ends "still reading" with no answer following: the page waits as long as the compute can still land, and one search writes one failed row (Lane B, Oct 29 2026).
try {
  const out = execSync("node scripts/coldWaitCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("cold spec: the wait reaches the end of the compute, one failed row per search (scripts/coldWaitCheck.mjs)", "PASS", (out.match(/coldWaitCheck: .*/) || [""])[0]);
} catch (e) {
  record("cold spec: the wait reaches the end of the compute, one failed row per search (scripts/coldWaitCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// The account pill covers nothing on any page, result views included (Sam, Oct 27 2026). Rendered in a browser.
try {
  const out = execSync("node scripts/pillOverlapCheck.mjs", { encoding: "utf8" });
  record("account pill covers nothing, every page and result view (scripts/pillOverlapCheck.mjs)", "PASS", (out.match(/pillOverlapCheck: .*/) || [""])[0]);
} catch (e) {
  record("account pill covers nothing, every page and result view (scripts/pillOverlapCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// A stored Market Check answer is the whole answer: every writer feeds writeWarmAnswer from oneEngineAnswer, never runOneBox (Sam, Oct 28 2026). No network.
try {
  const out = execSync("node scripts/warmStoresFullAnswerCheck.mjs", { encoding: "utf8" });
  record("stored answers are the whole answer (scripts/warmStoresFullAnswerCheck.mjs)", "PASS", (out.match(/warmStoresFullAnswerCheck: .*/) || [""])[0]);
} catch (e) {
  record("stored answers are the whole answer (scripts/warmStoresFullAnswerCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// A warm confirmation is never a search (Sam, Oct 29 2026). No network.
try {
  const out = execSync("node scripts/warmHitsCheck.mjs", { encoding: "utf8", timeout: 600000 });
  record("a warm confirmation reads the stored row, never a search (scripts/warmHitsCheck.mjs)", "PASS", (out.match(/warmHitsCheck: .*/) || [""])[0]);
} catch (e) {
  record("a warm confirmation reads the stored row, never a search (scripts/warmHitsCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// The history pages' window is the engine's (Sam, Oct 29 2026). Fake archive, no database.
try {
  const out = execSync("node scripts/historyWindowCheck.mjs", { encoding: "utf8", timeout: 600000 });
  record("history pages print the engine's window, never one they work out (scripts/historyWindowCheck.mjs)", "PASS", (out.match(/historyWindowCheck: .*/) || [""])[0]);
} catch (e) {
  record("history pages print the engine's window, never one they work out (scripts/historyWindowCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// The house tier's gearbox words, split flag and pattern line are the engine's (Sam, Oct 29 2026). Rendered in a browser.
try {
  const out = execSync("node scripts/houseGearboxCheck.mjs", { encoding: "utf8", timeout: 600000 });
  record("the house tier's box words come from the engine (scripts/houseGearboxCheck.mjs)", "PASS", (out.match(/houseGearboxCheck: .*/) || [""])[0]);
} catch (e) {
  record("the house tier's box words come from the engine (scripts/houseGearboxCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// The named warm list is Sam's 19 specs and the warm tool reads it (Sam, Oct 28 2026). The live half (--live) runs after a warm, not here. No network.
try {
  const out = execSync("node scripts/namedWarmCheck.mjs", { encoding: "utf8" });
  record("named warm list (scripts/namedWarmCheck.mjs)", "PASS", (out.match(/namedWarmCheck: .*/) || [""])[0]);
} catch (e) {
  record("named warm list (scripts/namedWarmCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// The Find card's five-line Sam box (Sam, Oct 29 2026). The real Find path on fixtures.
try {
  const out = execSync("node scripts/findCardShapeCheck.mjs", { encoding: "utf8", timeout: 600000 });
  record("the Find card's Sam box has one shape, every line the engine's (scripts/findCardShapeCheck.mjs)", "PASS", (out.match(/findCardShapeCheck: .*/) || [""])[0]);
} catch (e) {
  record("the Find card's Sam box has one shape, every line the engine's (scripts/findCardShapeCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// No sale line on a Find card (Sam, Oct 28 2026, ENGINE READY 10): the box, Tasks' cars and the email's modes. No network.
try {
  const out = execSync("node scripts/findNoSaleLineCheck.mjs", { encoding: "utf8", timeout: 600000 });
  record("a Find card prints no sale line (scripts/findNoSaleLineCheck.mjs)", "PASS", (out.match(/findNoSaleLineCheck: .*/) || [""])[0]);
} catch (e) {
  record("a Find card prints no sale line (scripts/findNoSaleLineCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// See the sales and the sale modal on Find (Sam, Oct 29 2026). No network.
try {
  const out = execSync("node scripts/findSalesButtonCheck.mjs", { encoding: "utf8", timeout: 600000 });
  record("See the sales and the sale modal on Find (scripts/findSalesButtonCheck.mjs)", "PASS", (out.match(/findSalesButtonCheck: .*/) || [""])[0]);
} catch (e) {
  record("See the sales and the sale modal on Find (scripts/findSalesButtonCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// What Find's toggles and buttons make (Sam, Oct 29 2026). A fake table behind fetch.
// Everything that can email a person is on the Tasks page with a Stop, and the before-it-ends wording (Lane D, Oct 29 2026): the tables the send paths read are listed or named as not a notice, the saved-search watch is listed, counted and capped, and every copy says "about two hours before". Offline.
try {
  const out = execSync("node scripts/standingNoticesCheck.mjs", { encoding: "utf8", timeout: 600000 });
  record("everything that can email a person is on the Tasks page with a Stop; 'about two hours before' everywhere (scripts/standingNoticesCheck.mjs)", "PASS", (out.match(/standingNoticesCheck: .*/) || [""])[0]);
} catch (e) {
  record("everything that can email a person is on the Tasks page with a Stop; 'about two hours before' everywhere (scripts/standingNoticesCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// A browser check that drives a Tasks or watch control reads no live data (Lane D, Oct 29 2026): the engine answer is a complete stub. Offline.
try {
  const out = execSync("node scripts/liveStubCheck.mjs", { encoding: "utf8", timeout: 60000 });
  record("browser checks that drive Tasks or watch controls read no live data (scripts/liveStubCheck.mjs)", "PASS", (out.match(/liveStubCheck: .*/) || [""])[0]);
} catch (e) {
  record("browser checks that drive Tasks or watch controls read no live data (scripts/liveStubCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | ") || String(e.message).slice(0, 200));
}
// The admin People and Launch tabs in Chrome at 1440 and 390, data stubbed (Lane D, Oct 29 2026). Offline.
try {
  const out = execSync("node scripts/peopleBrowserCheck.mjs", { encoding: "utf8", timeout: 240000 });
  record("admin People and Launch tabs in Chrome, stubbed (scripts/peopleBrowserCheck.mjs)", /SKIP/.test(out) ? "SKIP" : "PASS", (out.match(/peopleBrowserCheck: .*/) || [out.trim()])[0]);
} catch (e) {
  record("admin People and Launch tabs in Chrome, stubbed (scripts/peopleBrowserCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | ") || String(e.message).slice(0, 200));
}
// Checks that read a real auction end time pin it to the clock (Lane D, Oct 29 2026): the before-it-ends toggle is off inside two hours, so an unpinned check changes verdict with the hour. Offline.
try {
  const out = execSync("node scripts/clockPinCheck.mjs", { encoding: "utf8", timeout: 60000 });
  record("checks that read an auction end time pin it to the clock (scripts/clockPinCheck.mjs)", "PASS", (out.match(/clockPinCheck: .*/) || [""])[0]);
} catch (e) {
  record("checks that read an auction end time pin it to the clock (scripts/clockPinCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | ") || String(e.message).slice(0, 200));
}
// The Find drawer in Chrome (Lane D, Oct 29 2026): this branch's page code against a fake server, a stored Find answer for the 2005 SL65 AMG. Needs Chrome, the network and the crew code in the Keychain; says SKIP without them.
try {
  const out = execSync("node scripts/standingDrawerCheck.mjs", { encoding: "utf8", timeout: 600000 });
  record("the Find drawer: sends, says what happened and where, fails in plain words, state from the stored row (scripts/standingDrawerCheck.mjs)", /SKIP/.test(out) ? "SKIP" : "PASS", (out.match(/standingDrawerCheck: .*/) || [""])[0]);
} catch (e) {
  record("the Find drawer: sends, says what happened and where, fails in plain words, state from the stored row (scripts/standingDrawerCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Every "Sam is looking" control as one class (Lane D, Oct 29 2026): a click writes a row and an event, the one badge counts it, the Tasks page lists it in the server's words, a refusal or a drop shows a plain line. No network.
try {
  const out = execSync("node scripts/standingControlsCheck.mjs", { encoding: "utf8", timeout: 600000 });
  record("every Sam-is-looking control writes a row and a log, counts on the one badge, and fails in plain words (scripts/standingControlsCheck.mjs)", "PASS", (out.match(/standingControlsCheck: .*/) || [""])[0]);
} catch (e) {
  record("every Sam-is-looking control writes a row and a log, counts on the one badge, and fails in plain words (scripts/standingControlsCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/findWatchCheck.mjs", { encoding: "utf8", timeout: 600000 });
  record("everything a Find toggle or button makes is on Tasks, limited and named by the engine (scripts/findWatchCheck.mjs)", "PASS", (out.match(/findWatchCheck: .*/) || [""])[0]);
} catch (e) {
  record("everything a Find toggle or button makes is on Tasks, limited and named by the engine (scripts/findWatchCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Every stored answer carries the live epoch (Sam, Oct 28 2026); offline rule only (the --live read runs after the final warm).
try {
  const out = execSync("node scripts/epochMatchCheck.mjs", { encoding: "utf8", timeout: 600000 });
  record("every stored answer carries the live epoch, the counting rule (scripts/epochMatchCheck.mjs)", "PASS", (out.match(/epochMatchCheck: .*/) || [""])[0]);
} catch (e) {
  record("every stored answer carries the live epoch, the counting rule (scripts/epochMatchCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// No page carries a copy of an engine reason line (Sam, Oct 28 2026).
try {
  const out = execSync("node scripts/pageReasonCopyCheck.mjs", { encoding: "utf8", timeout: 600000 });
  record("no page carries a copy of an engine reason line (scripts/pageReasonCopyCheck.mjs)", "PASS", (out.match(/pageReasonCopyCheck: .*/) || [""])[0]);
} catch (e) {
  record("no page carries a copy of an engine reason line (scripts/pageReasonCopyCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// A stored-core fixture uses the engine's SPEC_V (Oct 28 2026).
try {
  const out = execSync("node scripts/specVersionFixtureCheck.mjs", { encoding: "utf8", timeout: 600000 });
  record("a stored-core fixture uses SPEC_V, never a version of its own (scripts/specVersionFixtureCheck.mjs)", "PASS", (out.match(/specVersionFixtureCheck: .*/) || [""])[0]);
} catch (e) {
  record("a stored-core fixture uses SPEC_V, never a version of its own (scripts/specVersionFixtureCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// The launch warm is the union of every live spec (Sam, Oct 28 2026).
try {
  const out = execSync("node scripts/warmUnionCheck.mjs", { encoding: "utf8", timeout: 600000 });
  record("the launch warm covers every live spec, not the traffic slice (scripts/warmUnionCheck.mjs)", "PASS", (out.match(/warmUnionCheck: .*/) || [""])[0]);
} catch (e) {
  record("the launch warm covers every live spec, not the traffic slice (scripts/warmUnionCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
try {
  const out = execSync("node scripts/warmBaseCheck.mjs", { encoding: "utf8", timeout: 120000 });
  record("no warm script targets goasksam.com by default (scripts/warmBaseCheck.mjs)", "PASS", (out.match(/warmBaseCheck: .*/) || [""])[0]);
} catch (e) {
  record("no warm script targets goasksam.com by default (scripts/warmBaseCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// The launch warm counts rows by UTC day, never by age (Sam, Oct 28 2026). No network.
try {
  const out = execSync("node scripts/warmDayCheck.mjs", { encoding: "utf8" });
  record("launch warm counts by UTC day, not age (scripts/warmDayCheck.mjs)", "PASS", (out.match(/warmDayCheck: .*/) || [""])[0]);
} catch (e) {
  record("launch warm counts by UTC day, not age (scripts/warmDayCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// e96 checks (Lane B): each registers one script, no network.
for (const [file, label] of [["modsPillCheck", "Modified and Original pills: the wide line that names modified cars (or the years) has its pills, the headline stays the whole pool (scripts/modsPillCheck.mjs)"], ["nullIsNoNumberCheck", "null is no number at every customer-path site (scripts/nullIsNoNumberCheck.mjs)"], ["cardsRangeCheck", "cards outside the range are labelled, the three cards come from inside, a low-mile tile on an old car prints no mileage (scripts/cardsRangeCheck.mjs)"], ["windowWordsCheck", "the card names its window, the chart caption states its span, one line when they differ (scripts/windowWordsCheck.mjs)"], ["mileageYearSplitCheck", "a wide range that mileage explains splits by band, a widened set whose years price apart splits by year (scripts/mileageYearSplitCheck.mjs)"], ["yearNoteCheck", "a range that leaves out the typed year says so (scripts/yearNoteCheck.mjs)"], ["wideCauseCheck", "a wide range carries its cause and lever from its own sales, on the headline and on wide options (scripts/wideCauseCheck.mjs)"], ["gearboxWordCheck", "the gearbox word comes from one table by make, model, year and generation (scripts/gearboxWordCheck.mjs)"], ["splitStateCheck", "split and apart withhold the pooled headline, one dimension at a time, refine returns the combined set (scripts/splitStateCheck.mjs)"], ["generationPoolCheck", "a pool is its own model and generation: Impala SS is not a halo, a Bel Air is no Impala, a rescue never crosses a generation (scripts/generationPoolCheck.mjs)"], ["findThinThresholdCheck", "one thin threshold on Find and Market Check, the engine reason line at 8 or more, year and body per price (scripts/findThinThresholdCheck.mjs)"], ["findEqualsMarketCheckCheck", "a Find card is the Market Check answer for the listing; no rules of its own on the Find path; parts and unmatched lots do not draw (scripts/findEqualsMarketCheckCheck.mjs)"], ["findAnswerCheck", "the Find card answers for the listing's own option: one range, no sale lines, no pick one, a near-miles headline only at 8 or more sales (scripts/findAnswerCheck.mjs)"], ["chartNoDotsCheck", "never dots: no answer, fixture or code carries a dots chart type or a per-sale series (scripts/chartNoDotsCheck.mjs)"], ["chartLadderCheck", "the chart ladder: a mix-withheld split spec comes back scoped, a thin spec dots or withheld, and no chart data disagrees with the answer's own sales (scripts/chartLadderCheck.mjs)"], ["vinTypedCheck", "typed equals VIN: the identity a VIN page hands the engine and the typed name read the same stored answer; a difference is no-go (scripts/vinTypedCheck.mjs)"], ["learnVinTrimCodesCheck", "the VIN trim learner builds its prefix table from sales, never writes and applies no rule (scripts/learnVinTrimCodesCheck.mjs)"], ["vinNamesCheck", "a VIN decoded with a maker code name (M3Ci) reads the plain model on every VIN path (scripts/vinNamesCheck.mjs)"], ["vinTypedMatchCheck", "a VIN with a decoded trim (Demon, Hellcat, GT3 RS, Z06, ...) reads the typed answer of year make model trim: same pool count, range, scope line, cards and hero photo on the partner text and the VIN plan (scripts/vinTypedMatchCheck.mjs)"], ["liveScopeCheck", "the live feed matches the launch scope: no excluded platform or non-US car reaches Find, and a card is never an empty Sam box (scripts/liveScopeCheck.mjs)"], ["staleMarkCheck", "ingest marks touched core rows stale and deletes none; a marked row serves at once and refreshes behind (scripts/staleMarkCheck.mjs)"], ["matchedOptionCheck", "a title or typed words that name an option (gearbox word, body, edition, mileage band) make the engine mark it and send it first (scripts/matchedOptionCheck.mjs)"], ["reasonWordsCheck", "every reason line a visitor can read is in the one wording table, plain and one sentence (scripts/reasonWordsCheck.mjs)"], ["ownTrimRivalCheck", "a trim the asked car carries is never its rival, even when the make lists it as a model (Buick Grand National) (scripts/ownTrimRivalCheck.mjs)"], ["notACarCheck", "an identity missing make or model (and year, on a listing) is refused not_a_car by the engine, never answered or stored (scripts/notACarCheck.mjs)"], ["findRefineStoredCheck", "a refine on a Find card reads the stored bare pool like Market Check: no pool read, no second row (scripts/findRefineStoredCheck.mjs)"], ["mileageNearCheck", "a listing that states its mileage carries the mileage band answer: range at 8 or more, span of sales at 3 to 7, empty under 3, bid placed (scripts/mileageNearCheck.mjs)"], ["refineFromStoredCheck", "a refine of a stored market reads the stored pool in the same request: no pool read, no cold marker, no second row (scripts/refineFromStoredCheck.mjs)"], ["twoRangeSplitCheck", "a split or apart replaces the pooled headline only when two options carry a range (scripts/twoRangeSplitCheck.mjs)"], ["optionsFieldCheck", "every answer with options carries its own figures; a window note only beside a range (scripts/optionsFieldCheck.mjs)"], ["bidPlaceCheck", "every sentence about where a bid sits agrees with the figures printed beside it; one engine function compares a bid with a low and high (scripts/bidPlaceCheck.mjs)"], ["exampleKeepsGoodCheck", "a landing example build that does not qualify never overwrites the stored example with nothing (scripts/exampleKeepsGoodCheck.mjs)"], ["optionsAddUpCheck", "the options of a group add up to the footer count or a remainder is shown; no pill appears twice (scripts/optionsAddUpCheck.mjs)"], ["crossProductCapCheck", "the cross-product check samples its specs, stops at its cap and says what it read and skipped (scripts/crossProductCapCheck.mjs)"], ["nightlyTimeoutCheck", "every step of the nightly workflow has a timeout and a job's steps never add up past its limit (scripts/nightlyTimeoutCheck.mjs)"], ["nightlyHealthCheck", "nightly: the judging checks run outside the caches job, the VIN swap and recompute are bounded and resumable, and a red or cancelled scheduled night fails (scripts/nightlyHealthCheck.mjs; --live reads the real history)"], ["warmCoverageCheck", "the specs the cross-product check had to compute cold and the article test cars are in a warm list (scripts/warmCoverageCheck.mjs)"], ["zeroStreakGapCheck", "a zero-sale run is flagged only when longer than the source's own longest earlier gap (scripts/zeroStreakGapCheck.mjs)"], ["modelClashCheck", "a listing whose title names a different model from its Sam line is found by the engine's own reading, plain or coded (scripts/modelClashCheck.mjs)"]]) {
  try {
    const out = execSync(`node scripts/${file}.mjs`, { encoding: "utf8" });
    record(label, "PASS", (out.match(new RegExp(file + ": .*")) || [""])[0]);
  } catch (e) {
    record(label, "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
  }
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
// Every car count on the Tasks surfaces is the shared helper's (Lane D, Oct 28 2026): the overview card, the Show label, the status line, the update line and the email lines at 0 to 45, and no count typed in front of its noun. No network.
try {
  const out = execSync("node scripts/taskCountsCheck.mjs", { encoding: "utf8", timeout: 300000 });
  record("Task counts use the helper (scripts/taskCountsCheck.mjs)", "PASS", (out.match(/taskCountsCheck: .*/) || [""])[0]);
} catch (e) {
  record("Task counts use the helper (scripts/taskCountsCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Task email form (Lane D, Oct 28 2026): the first email is a catch-up headed Live right now, later ones only new cars, one count in one word form (the shared helper), one footer line, every emailMode. No network.
try {
  const out = execSync("node scripts/emailFormCheck.mjs", { encoding: "utf8", timeout: 300000 });
  record("Task email form (scripts/emailFormCheck.mjs)", "PASS", (out.match(/emailFormCheck: .*/) || [""])[0]);
} catch (e) {
  record("Task email form (scripts/emailFormCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}
// Desk intake and send (Lane D, Nov 4 2026; docs/desk-valuations-spec.md): a submission read as the spec says, only a seat of the org accepted, a sheet sent once with the copy kept. Offline. scripts/intakeFailsWithout.mjs puts each bug back and requires the check to go red (run it when intake or send code changes).
for (const [chk, label] of [["intakeParseCheck", "Desk intake reads a submission (scripts/intakeParseCheck.mjs)"], ["intakeToSheetCheck", "An intake row always opens on the Valuations page (scripts/intakeToSheetCheck.mjs)"], ["signedWebhookCheck", "Desk inbound webhook signature, every way a genuine delivery is refused (scripts/signedWebhookCheck.mjs)"], ["intakeAuthCheck", "Desk intake accepts only a seat of the org (scripts/intakeAuthCheck.mjs)"], ["sendCheck", "Desk send: copy stored, status moved, nothing sent twice (scripts/sendCheck.mjs)"], ["carNamesCheck", "Desk intake names the car plainly: M3Ci reads M3 Convertible, no decoder codes (scripts/carNamesCheck.mjs)"]]) {
  try {
    const out = execSync(`node scripts/${chk}.mjs`, { encoding: "utf8", timeout: 240000 });
    record(label, "PASS", (out.match(new RegExp(chk + ": .*")) || [""])[0]);
  } catch (e) {
    record(label, "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
  }
}
// A Task email prints by the engine's emailMode and never a question (Oct 27 2026): the block lines and the card, every mode, an answer that also asked a question. No network.
try {
  const out = execSync("node scripts/emailModeCheck.mjs", { encoding: "utf8", timeout: 300000 });
  record("Email mode (scripts/emailModeCheck.mjs)", "PASS", (out.match(/emailModeCheck: .*/) || [""])[0]);
} catch (e) {
  record("Email mode (scripts/emailModeCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
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
  const out = execSync("node scripts/e96PagesCheck.mjs", { encoding: "utf8", timeout: 600000 });
  record("E96 pages print the engine's lines and compute nothing (scripts/e96PagesCheck.mjs)", "PASS", (out.match(/e96PagesCheck: .*/) || [""])[0]);
} catch (e) {
  record("E96 pages print the engine's lines and compute nothing (scripts/e96PagesCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
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
for (const [file, label] of [["bulkSaleCheck", "Bulk-sale guard"], ["sellFieldsLegCheck", "A lost leg in the sell_fields stage is never served or stored"], ["containedReadCheck", "A read inside a window the request already holds is not read again"], ["exactYearLineCheck", "Exact-year line under a thin answer"], ["specLiveAbroadCheck", "Spec-page live count leaves abroad out"], ["marketPlaceCheck", "Place before currency (market check)"], ["amgBadgeCheck", "AMG badge and Shelby pools keep their own sales"], ["poolColumnsCheck", "Pool columns switch: identical rows, fail closed"], ["zeroRefusalCheck", "A refusal with count 0 says no sales on record"], ["archiveMakeCheck", "A make is never silently another make"], ["archiveModelCheck", "A known marque with an unknown model asks which model"], ["correctionMoveCheck", "A corrected row that moves out of a pool leaves it"], ["makeDisplayCheck", "Make display name, body page basis note, make-join leftover"], ["chatNumberGuardCheck", "The legacy chat refuses an invented number and passes supplied ones"], ["askedYearCheck", "A held or set-aside sentence claims only the asked year"], ["singerLeftoverCheck", "No leftover-word line above an answer the typed words made"], ["rawColumnsLineCheck", "The nightly log says raw columns on or off"], ["sellFieldsCheck", "Sell fields: best day and reserve split from the engine pool"],
  ["sellSpeedCheck", "Sell speed: one engine call per visit, no fetchQualifying of its own"],
  ["readFailureCheck", "Read failure: a failed or timed-out archive read is never served or stored as a finished answer"],
  ["readRetryCheck", "Read retry: a timed-out page is never retried and the whole read stops at the first timeout"],
  ["readConcurrencyCheck", "Read concurrency: one request never holds more than 2 archive queries in flight"],
  ["readAbortCheck", "Read abort: a caller that gives up stops its archive reads, a shared flight survives one caller"],
  ["readCallerCheck", "Read caller: every archive read is attributed to warm, ops, visitor, Find or Sell in Query Performance"],
  ["houseReadCheck", "House read: a failed read is could-not-read, never no house sales; an ops task never prints 0 for a failed read"],
  ["readRetryRequestCheck", "Request retry: no retry on a timeout or an abort, one retry on a network blip, a failed read is never replayed from a memo"],
  ["readRacerCheck", "Read racers: every Promise.race is classified; one whose result is dropped stops its archive reads"],
  ["widenedLineCheck", "Widened pools: a range for an asked year comes from a pool that holds it or says in words which years it covers; a far pool prints no range"],
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
