// RUN THE RIGHT CHECKS (Lane C, Nov 17 2026). One command: it works out which files this branch changed and runs the checks that cover them, side by side, and prints one line per check, a total, and the failures.
//   node scripts/runChecks.mjs                  the checks for this branch against main (origin/main when main is not here)
//   node scripts/runChecks.mjs --base <ref>     another base
//   node scripts/runChecks.mjs --all            every offline check
//   node scripts/runChecks.mjs --list           say which checks would run and why, run nothing
//   node scripts/runChecks.mjs --files a,b      use these as the changed files (no git)
//   --depth N (how many import steps below a file a check names still count: 1 by default, set in the map as depth; the engine files run the full set whatever the depth)
//   --trace FILE (write each check's start and end time, one JSON line each, to find checks that touch the same files)
//   --workers N (default: the cores less one, at most 8)   --serial (one at a time)   --live (also the checks that call production; only in a gap the lanes name)   --only a,b   --json   --timeout S (per check, default 900)
// THE MAP is scripts/checkMap.json (built from what each check imports and names by scripts/buildCheckMap.mjs, read by a person): each check with the paths it covers. A changed file selects a check when it is one of the check's paths, is directly under
// one of its directories, or is imported, one step down by default (map.depth), by a file the check names. A change under the engine (map.engine: lib/onebox.js, lib/vehicle.js, lib/bareModel.js, lib/numberPhrases.js, lib/live/ and the data files the engine reaches) runs the full set.
// A changed file no check covers and that map.ignore does not name is printed UNCOVERED and fails the run, so a gap is never silent. A check marked serial in the map runs alone, after the side by side ones, with its reason printed.
// Exit 0 only when every selected check passed and nothing is UNCOVERED.
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildGraph, reachDepth } from "./_checkGraph.mjs";

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argOf = (a, name, dflt) => { const i = a.indexOf(name); return i >= 0 && a[i + 1] && !a[i + 1].startsWith("--") ? a[i + 1] : (i >= 0 ? true : dflt); };

// ---- selection (exported: scripts/runChecksCheck.mjs tests it) ----------------------------------------------------------------------------------------------------------------------------------------
const matchesPath = (file, p) => p.endsWith("/") ? file.startsWith(p) : file === p;
const ignoredBy = (file, ignore) => (ignore || []).some(g => g.startsWith("*.") ? file.endsWith(g.slice(1)) : matchesPath(file, g));
export function selectChecks(changed, map, graph, { all = false, live = false, depth = map.depth == null ? 1 : map.depth } = {}) {
  const names = Object.keys(map.checks), runnable = n => map.checks[n].kind === "offline" || (live && map.checks[n].kind === "live");
  const why = new Map(), uncovered = [], liveOnly = [], ignored = [];
  const add = (n, reason) => { if (!why.has(n)) why.set(n, []); if (!why.get(n).includes(reason)) why.get(n).push(reason); };
  const engineHit = changed.find(f => (map.engine || []).some(e => matchesPath(f, e)));
  if (all || engineHit) { for (const n of names) if (runnable(n)) add(n, all ? "--all" : "the engine changed (" + engineHit + ")"); return { selected: [...why.keys()], why, uncovered, liveOnly, ignored, full: true }; }
  const closure = new Map(); const closureOf = n => { if (!closure.has(n)) { const c = map.checks[n], roots = c.covers.filter(p => !p.endsWith("/") && graph.files.has(p)); closure.set(n, reachDepth(graph, roots, depth)); } return closure.get(n); };
  for (const f of changed) {
    if (ignoredBy(f, map.ignore)) { ignored.push(f); continue; }
    let hit = false, liveHit = [];
    for (const n of names) {
      const c = map.checks[n], own = c.file === f, direct = c.covers.some(p => matchesPath(f, p)), deep = !direct && !own && closureOf(n).has(f);
      if (own || direct || deep) { if (runnable(n)) { add(n, own ? "its own file changed" : direct ? f : f + " (imported by a file it names)"); hit = true; } else if (c.kind === "live") liveHit.push(n); else if (c.kind === "args") hit = hit || false; }
    }
    if (!hit) { if (liveHit.length) liveOnly.push({ file: f, checks: liveHit }); else uncovered.push(f); }
  }
  return { selected: [...why.keys()], why, uncovered, liveOnly, ignored, full: false };
}
// ---- counts from what a check printed ----------------------------------------------------------------------------------------------------------------------------------------------------------------------
export function parseCounts(text, code) {
  const t = String(text).replace(/\x1b\[[0-9;]*m/g, ""), lines = t.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    let m = /(\d+)\s+(?:pass(?:ed|es)?|ok)\b[^\d\n]*?(\d+)\s+(?:FAIL(?:ED|S|URES)?|fail(?:ed|s|ures)?)/i.exec(l); if (m) return { pass: +m[1], fail: +m[2] };
    m = /(\d+)\s+FAIL(?:ED)?\b[^\d\n]*?(\d+)\s+(?:pass(?:ed)?|ok)/i.exec(l); if (m) return { pass: +m[2], fail: +m[1] };
  }
  const p = lines.filter(l => /^\s*(PASS|ok)\b/.test(l)).length, f = lines.filter(l => /^\s*(FAIL|not ok)\b/.test(l)).length;
  if (p || f) return { pass: p, fail: f };
  if (/all pass|all \d+ pass|0 FAIL/i.test(t)) return { pass: 1, fail: 0, approx: true };
  return { pass: code === 0 ? 1 : 0, fail: code === 0 ? 0 : 1, approx: true };
}
export const firstFailure = text => { const l = String(text).replace(/\x1b\[[0-9;]*m/g, "").split("\n").find(x => /^\s*(FAIL|not ok|✗|Error|AssertionError|TypeError|ReferenceError)\b|\bFAIL\b.*->|^\s*at .*:\d+:\d+/.test(x)); return (l || "").trim().slice(0, 240); };

const timesFile = root => path.join(os.tmpdir(), "runChecks-times-" + Buffer.from(path.resolve(root)).toString("base64url").slice(-24) + ".json");   // the last run's seconds per check, kept outside the repo so the longest checks start first
// ---- run -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
function runOne(root, name, file, timeoutS, env) {
  return new Promise(resolve => {
    const t0 = Date.now(); let out = "", killed = false;
    const child = spawn(process.execPath, [path.join(root, file)], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
    const cap = d => { if (out.length < 2e6) out += d; };
    child.stdout.on("data", cap); child.stderr.on("data", cap);
    const timer = setTimeout(() => { killed = true; child.kill("SIGKILL"); }, timeoutS * 1000);
    child.on("close", code => { clearTimeout(timer); const secs = (Date.now() - t0) / 1000, c = killed ? { pass: 0, fail: 1 } : parseCounts(out, code); resolve({ name, startedAt: t0, endedAt: Date.now(), code: killed ? 124 : code, secs, ...c, skipped: /\bSKIP\b/.test(out) && code === 0, first: killed ? "timed out after " + timeoutS + " s" : (code !== 0 || c.fail ? firstFailure(out) : ""), out }); });
    child.on("error", e => { clearTimeout(timer); resolve({ name, code: 1, secs: (Date.now() - t0) / 1000, pass: 0, fail: 1, first: String(e).slice(0, 200), out: "" }); });
  });
}
export async function runAll(root, map, names, { workers, timeout, serialAll, env }) {
  const results = new Map(), par = names.filter(n => !serialAll && !map.checks[n].serial), ser = names.filter(n => serialAll || map.checks[n].serial);
  // longest first keeps the pool busy: weights from the last run when the file is there
  let weights = {}; try { weights = JSON.parse(fs.readFileSync(timesFile(root), "utf8")); } catch { /* first run */ }
  par.sort((a, b) => (weights[b] || 0) - (weights[a] || 0));
  let next = 0; const lane = async () => { while (next < par.length) { const n = par[next++]; const r = await runOne(root, n, map.checks[n].file, timeout, env); results.set(n, r); line(r); } };
  await Promise.all(Array.from({ length: Math.min(workers, par.length) || 0 }, lane));
  for (const n of ser) { if (!serialAll && map.checks[n].serial) console.log(`  (serial: ${n}: ${map.checks[n].serial})`); const r = await runOne(root, n, map.checks[n].file, timeout, env); results.set(n, r); line(r); }
  return results;
}
const line = r => console.log(`${r.fail || r.code ? "FAIL" : r.skipped ? "SKIP" : "PASS"}  ${r.name.padEnd(42)} pass ${String(r.pass).padStart(5)}  fail ${String(r.fail).padStart(3)}  ${r.secs.toFixed(1).padStart(6)} s`);

async function main() {
  const a = process.argv.slice(2), root = path.resolve(argOf(a, "--root", HERE)), json = a.includes("--json");
  const mapFile = path.join(root, "scripts", "checkMap.json");
  if (!fs.existsSync(mapFile)) { console.error("no scripts/checkMap.json: run node scripts/buildCheckMap.mjs"); process.exit(2); }
  const map = JSON.parse(fs.readFileSync(mapFile, "utf8")), graph = buildGraph(root);
  let changed;
  if (typeof argOf(a, "--files") === "string") changed = argOf(a, "--files").split(",").map(s => s.trim()).filter(Boolean);
  else if (a.includes("--all")) changed = [];
  else {
    const g = (...x) => { try { return execFileSync("git", x, { cwd: root, encoding: "utf8", maxBuffer: 64e6 }).split("\n").filter(Boolean); } catch { return null; } };
    let base = typeof argOf(a, "--base") === "string" ? argOf(a, "--base") : (g("rev-parse", "--verify", "-q", "main") ? "main" : "origin/main");
    const mb = (g("merge-base", "HEAD", base) || [base])[0];
    const committed = g("diff", "--name-only", mb, "HEAD"), dirty = g("diff", "--name-only", "HEAD"), untracked = g("ls-files", "--others", "--exclude-standard");
    if (!committed) { console.error("git could not read the diff against " + base); process.exit(2); }
    changed = [...new Set([...committed, ...(dirty || []), ...(untracked || [])])].sort();
  }
  const sel = selectChecks(changed, map, graph, { all: a.includes("--all"), live: a.includes("--live"), ...(argOf(a, "--depth") !== undefined ? { depth: Number(argOf(a, "--depth")) } : {}) });
  let names = sel.selected; if (typeof argOf(a, "--only") === "string") { const only = new Set(argOf(a, "--only").split(",")); names = names.filter(n => only.has(n)); }
  console.log(`changed files: ${changed.length}${sel.full ? " (full set: " + (a.includes("--all") ? "--all" : "the engine changed") + ")" : ""}; checks selected: ${names.length}${a.includes("--live") ? "" : " (offline only)"}`);
  for (const f of sel.ignored.slice(0, 5)) if (a.includes("--list")) console.log("  ignored: " + f);
  for (const f of sel.uncovered) console.log("UNCOVERED  " + f + "   (no check covers it and the map does not ignore it: add a check, or add the path to ignore in scripts/checkMap.json, then rebuild with buildCheckMap.mjs)");
  for (const l of sel.liveOnly) console.log("LIVE ONLY  " + l.file + "   (covered only by checks that call production: " + l.checks.join(", ") + "; run with --live in a gap the lanes name)");
  if (a.includes("--list")) { for (const n of names) console.log("  " + n.padEnd(40) + (sel.why.get(n) || []).slice(0, 2).join("; ")); process.exit(sel.uncovered.length ? 1 : 0); }
  const cpus = Math.max(1, os.cpus().length - 1), workers = Number(argOf(a, "--workers", Math.min(8, cpus))) || 1, t0 = Date.now();
  const results = await runAll(root, map, names, { workers, timeout: Number(argOf(a, "--timeout", 900)) || 900, serialAll: a.includes("--serial"), env: { ...process.env } });
  if (typeof argOf(a, "--trace") === "string") fs.writeFileSync(argOf(a, "--trace"), [...results.values()].map(r => JSON.stringify({ name: r.name, start: r.startedAt, end: r.endedAt, code: r.code })).join("\n") + "\n");
  const rs = [...results.values()], failed = rs.filter(r => r.fail || r.code), pass = rs.reduce((x, r) => x + r.pass, 0), fail = rs.reduce((x, r) => x + r.fail, 0), wall = (Date.now() - t0) / 1000, cpu = rs.reduce((x, r) => x + r.secs, 0);
  try { const w = {}; for (const r of rs) w[r.name] = Math.round(r.secs); if (!a.includes("--files")) fs.writeFileSync(timesFile(root), JSON.stringify(w)); } catch { /* timing is a convenience */ }
  console.log(`\nTOTAL  ${rs.length} checks  pass ${pass}  fail ${fail}  ${failed.length} failing  wall ${wall.toFixed(1)} s (checks add up to ${cpu.toFixed(1)} s, ${a.includes("--serial") ? 1 : workers} at a time)${sel.uncovered.length ? "  UNCOVERED " + sel.uncovered.length : ""}`);
  if (failed.length) { console.log("\nFAILURES"); for (const r of failed) console.log(`  ${r.name}: ${r.first || "exit " + r.code}`); }
  if (json) console.log(JSON.stringify({ changed, selected: names, uncovered: sel.uncovered, results: rs.map(r => ({ name: r.name, pass: r.pass, fail: r.fail, secs: r.secs, code: r.code })) }));
  process.exit(failed.length || sel.uncovered.length ? 1 : 0);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
