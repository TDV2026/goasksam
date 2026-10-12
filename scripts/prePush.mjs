// PRE-PUSH SMOKE TEST (job 2, Oct 2026; addendum same day). The ONE entry point for every lane
// before every push. No push without a green (or baseline-only) run - see docs/lane-notes.md
// "PREPUSH RULE".
//   node scripts/prePush.mjs                 # browser check against https://goasksam.com
//   node scripts/prePush.mjs --base <url>     # browser check against a specific deploy
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
  const { checkDepthWinsFixtures } = await import("./crossProductCheck.js");
  const r = checkDepthWinsFixtures();
  record("depthWins fixtures", r.ok ? "PASS" : "FAIL", r.ok ? `${r.cases.length} cases` : JSON.stringify(r.cases.filter(c => !c.pass)));
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
  const env = supabaseEnv();
  if (!env) {
    record("representative invariants (archive)", "SKIP", "SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set in this environment");
    record("live-comparable fence check (archive)", "SKIP", "SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set in this environment");
    record("split-pool invariants (archive)", "SKIP", "SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set in this environment");
    record("live-listing disclosure (archive)", "SKIP", "SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set in this environment");
    record("63-spec cross-product sweep (archive)", "SKIP", "SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set in this environment");
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

// Before it ends (Oct 12 2026, Lane C): a fixture day of quarter-hour send runs, no network; fails on any email
// dropped, doubled or sent outside the two hours.
try {
  const out = execSync("node scripts/beforeItEndsCheck.mjs", { encoding: "utf8" });
  record("before it ends fixture day (scripts/beforeItEndsCheck.mjs)", "PASS", (out.match(/beforeItEndsCheck: .*/) || [""])[0]);
} catch (e) {
  record("before it ends fixture day (scripts/beforeItEndsCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
}

// The engine's fallback rung (Oct 2026, Lane C): Lane B's new fields faked on fixtures through the real Buy, Task door
// and Task email renderers; fails if a fields-absent render changes or a rung line breaks a copy rule. No network.
try {
  const out = execSync("node scripts/rungCheck.mjs", { encoding: "utf8" });
  record("fallback rung fixtures (scripts/rungCheck.mjs)", "PASS", (out.match(/rungCheck: .*/) || [""])[0]);
} catch (e) {
  record("fallback rung fixtures (scripts/rungCheck.mjs)", "FAIL", String(e.stdout || "").split("\n").filter(l => /^FAIL/.test(l)).slice(0, 4).join(" | "));
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

// ---- summary ----
console.log("\n=== SUMMARY ===");
const fails = results.filter(r => r.status === "FAIL");
const skips = results.filter(r => r.status === "SKIP");
for (const r of results) console.log(`${r.status.padEnd(4)}  ${r.name}`);
console.log(`\n${fails.length} FAIL, ${skips.length} SKIP, ${results.length - fails.length - skips.length} PASS`);
if (skips.length) console.log("SKIPPED checks are not a pass - state them plainly in the push report, per docs/lane-notes.md PREPUSH RULE.");
if (BASELINE_FAILURES.length) console.log(`${BASELINE_FAILURES.length} baseline (known, pre-existing) failure(s) tracked - see the list at the top of this file.`);
process.exit(fails.length ? 1 : 0);
