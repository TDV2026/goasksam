// Nightly health (Lane C, Nov 5 2026). A scheduled run of nightly.yml that ends red or cancelled is a defect, never background noise.
// CAUSE of the 30 red or cancelled nights (Oct 14 to Nov 5, runs 112 to 132): the cross-product and search checks sat inside the "caches" job. Uncapped, they ran the job
// into its 80 minute limit (15 nights cancelled); capped, a finding or a slow database step made the whole nightly read red while every cache was built (runs 129 to 132).
// This check holds the fix in place and watches the result:
//   1. STRUCTURE (offline): the judging checks are NOT steps of the nightly's caches job; they run in their own workflow that starts after the nightly; that workflow reads the
//      nightly's own history; the VIN swap carries its own timeout; the spec recompute keeps a backlog and a time budget.
//   2. HISTORY LOGIC (offline, with mutants): any scheduled run in the window that is failure, cancelled or timed_out fails the check.
//   3. LIVE (--live): reads the real run history from the GitHub API (public repo; GITHUB_TOKEN used when set) and applies the same judgement.
//   node scripts/nightlyHealthCheck.mjs [repo root] [--live] [--days=3]
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const argv = process.argv.slice(2);
const root = path.resolve(argv.find(a => !a.startsWith("--")) || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const LIVE = argv.includes("--live"), DAYS = Number((argv.find(a => a.startsWith("--days=")) || "--days=3").slice(7)) || 3;
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const read = f => { try { return fs.readFileSync(path.join(root, f), "utf8"); } catch { return ""; } };

// ---- the judgement, one function ----
export function judgeRuns(runs, { days = 3, now = Date.now() } = {}) {
  const since = now - days * 864e5;
  const scheduled = (runs || []).filter(r => r.event === "schedule" && Date.parse(r.created_at) >= since);
  const bad = scheduled.filter(r => ["failure", "cancelled", "timed_out", "startup_failure"].includes(r.conclusion));
  return { checked: scheduled.length, bad };
}

// ---- 1. structure ----
const nightly = read("docs/nightly-workflow.yml"), checks = read("docs/nightly-checks-workflow.yml");
const cachesJob = (() => { const i = nightly.indexOf("\n  caches:"), j = nightly.indexOf("\n  warm:"); return i >= 0 && j > i ? nightly.slice(i, j) : nightly; })();
ok("the judging checks are not steps of the nightly's caches job", !/scripts\/crossProductCheck\.js/.test(cachesJob) && !/scripts\/searchCheck\.js/.test(cachesJob), "a finding there turned the nightly red with every cache built");
ok("they run in their own workflow, started when the nightly ends", /workflow_run:/.test(checks) && /Nightly ingest and warm/.test(checks) && /scripts\/crossProductCheck\.js/.test(checks) && /scripts\/searchCheck\.js/.test(checks));
ok("that workflow also reads the nightly's own run history, so a red or cancelled night shows", /nightlyHealthCheck\.mjs --live/.test(checks));
ok("the VIN swap carries its own statement timeout (57014 on Nov 2 and 3)", /set statement_timeout\s*=\s*'\d+s'/.test(read("docs/supabase-vin-index-atomic-swap.sql")) && /alter function swap_vin_index\(\) set statement_timeout/.test(read("docs/supabase-vin-swap-timeout.sql")));
const rec = read("scripts/recomputeSpecCache.js");
ok("the spec recompute keeps a backlog between nights and a time budget (60 of 1,661 recomputed)", /spec_recompute_backlog|BACKLOG_KEY/.test(rec) && /--minutes|"minutes"/.test(rec) && /--cap=\d+ --minutes=\d+/.test(nightly));

// ---- 2. backlog logic, driven ----
try {
  const lib = await import(path.join(root, "lib/_specRecompute.js"));
  if (!lib.mergeBacklog || !lib.planRun) throw new Error("no backlog functions");
  const tonight = ["a", "b", "c"], backlog = ["c", "d", "e"];
  const merged = lib.mergeBacklog(tonight, backlog, new Set(["e"]));
  ok("tonight's list and the backlog merge once each, and a key a real read rebuilt is dropped", JSON.stringify(merged) === JSON.stringify(["a", "b", "c", "d"]), JSON.stringify(merged));
  let t = 0; const plan = lib.planRun(merged, { cap: 400, budgetMs: 2, startedAt: 0, now: () => t++ });
  ok("a spent time budget leaves the rest as tomorrow's backlog; nothing is forgotten", plan.done.length + plan.left.length === merged.length && plan.left.length > 0, JSON.stringify(plan));
  ok("a cap of 2 leaves the rest", lib.planRun(merged, { cap: 2, budgetMs: 1e9, startedAt: 0, now: () => 0 }).left.length === 2);
} catch (e) { ok("the backlog functions exist and behave", false, String(e.message || e).slice(0, 100)); }

// ---- 3. history logic with mutants ----
const NOW = Date.parse("2026-11-05T20:00:00Z"), mk = (conclusion, hoursAgo, event = "schedule") => ({ event, conclusion, created_at: new Date(NOW - hoursAgo * 36e5).toISOString() });
const green = [mk("success", 5), mk("success", 29), mk("success", 53)];
ok("three green scheduled nights pass", judgeRuns(green, { days: 3, now: NOW }).bad.length === 0);
ok("a failed night fails", judgeRuns([mk("failure", 5), ...green.slice(1)], { days: 3, now: NOW }).bad.length === 1);
ok("a cancelled night fails", judgeRuns([mk("cancelled", 29), ...green.slice(0, 1), ...green.slice(2)], { days: 3, now: NOW }).bad.length === 1);
ok("a red manual dispatch is not a scheduled night", judgeRuns([mk("failure", 5, "workflow_dispatch"), ...green], { days: 3, now: NOW }).bad.length === 0);
ok("a night older than the window is not counted", judgeRuns([mk("failure", 24 * 6), ...green], { days: 3, now: NOW }).bad.length === 0);
// the mutant: a judge that forgets cancelled would pass the cancelled night; the check above would catch it
const forgetful = (runs, o) => { const r = judgeRuns(runs, o); return { ...r, bad: r.bad.filter(x => x.conclusion !== "cancelled") }; };
ok("MUTANT proof: a judge that ignores cancelled passes a cancelled night, so the cancelled case above is what holds it", forgetful([mk("cancelled", 5)], { days: 3, now: NOW }).bad.length === 0 && judgeRuns([mk("cancelled", 5)], { days: 3, now: NOW }).bad.length === 1);

// ---- 4. live ----
if (LIVE) {
  const h = { "User-Agent": "goasksam-nightly-health", Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const repo = process.env.GITHUB_REPOSITORY || "TDV2026/goasksam";
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/nightly.yml/runs?per_page=40&event=schedule`, { headers: h, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`GitHub ${r.status}`);
    const j = await r.json(), res = judgeRuns(j.workflow_runs || [], { days: DAYS });
    ok(`every scheduled nightly in the last ${DAYS} days ended green`, res.bad.length === 0 && res.checked > 0, `${res.checked} scheduled runs read; ${res.bad.length} red or cancelled${res.bad.length ? ": " + res.bad.map(x => `#${x.run_number} ${x.created_at.slice(0, 10)} ${x.conclusion}`).join(", ") : ""}`);
  } catch (e) { ok("the nightly history could be read", false, String(e.message || e).slice(0, 100)); }
} else console.log("SKIP  live history (run with --live; the nightly-checks workflow does)");
console.log(`nightlyHealthCheck: ${fail ? fail + " FAIL" : "all pass"}`);
process.exit(fail ? 1 : 0);
