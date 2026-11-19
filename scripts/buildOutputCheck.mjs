// BUILD OUTPUT NEVER CHANGES A CHECK (Lane C, Nov 18 2026). THE CLASS: a check that sweeps the repo tree (to find every file that holds a sentence, a call, a literal) must see the files a clean checkout holds. A machine
// that has built or deployed keeps ignored copies of the whole code base (.vercel/output holds every function, .next and dist hold bundles); a sweep that reads them counts each sentence twice and gives one answer there and another
// in CI. This is how sellRefusalCheck went red ("a second copy of the not-seen sentence") only on the machine that had run `vercel build` on Nov 15.
// WHAT IT DOES: it runs every check that sweeps the tree (scripts/*Check.mjs that read a directory and walk it) once as the tree stands, then again with DECOY build folders holding copies of lib, api and public/js
// in .vercel/output, .next, dist, build, out, .output, .turbo, .cache and coverage, and requires the same pass and fail count and the same exit from every one. A check that reads a decoy changes its count and is named here.
// The fix for such a check is one import: repoFiles() from scripts/_repoWalk.mjs (git's list of the files a clean checkout holds, never a build folder).   node scripts/buildOutputCheck.mjs [--only a,b]
// It writes the decoys into the worktree and removes them at the end (marked serial in scripts/checkMap.json: nothing else may sweep the tree beside it).
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELF = "buildOutputCheck.mjs", FOLDERS = [".vercel/output/functions", ".next/server", "dist", "build", "out", ".output", ".turbo", ".cache", "coverage"];
let pass = 0, fail = 0; const fails = []; const ok = (n, c, d) => { if (c) pass++; else { fail++; fails.push(n + (d !== undefined ? " " + JSON.stringify(d).slice(0, 240) : "")); } };
const only = process.argv.includes("--only") ? new Set(process.argv[process.argv.indexOf("--only") + 1].split(",")) : null;

// which checks sweep the tree: they read directories and walk them (the same words checkMap.json's builder uses to find what a check opens), and are offline
let map = {}; try { map = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/checkMap.json"), "utf8")).checks || {}; } catch { /* no map */ }
const sweepers = fs.readdirSync(path.join(ROOT, "scripts")).filter(f => /Check\.mjs$/.test(f) && f !== SELF && !f.startsWith("_")).filter(f => { const t = fs.readFileSync(path.join(ROOT, "scripts", f), "utf8"); return (/readdirSync/.test(t) && /walk|recurs/i.test(t)) || /_repoWalk\.mjs/.test(t); })
  .filter(f => { const m = map[f.replace(/\.mjs$/, "")]; return !m || m.kind !== "live"; }).filter(f => !only || only.has(f.replace(/\.mjs$/, "")));

const runOne = f => new Promise(res => {
  const t0 = Date.now(); const c = spawn(process.execPath, [path.join("scripts", f)], { cwd: ROOT, env: { ...process.env, PROBE_KEY: process.env.PROBE_KEY || "offline" }, stdio: ["ignore", "pipe", "pipe"] }); let out = "";
  const to = setTimeout(() => { try { c.kill("SIGKILL"); } catch { /* gone */ } }, 600000);
  c.stdout.on("data", d => out += d); c.stderr.on("data", d => out += d);
  c.on("close", code => { clearTimeout(to); const m = [...out.matchAll(/(\d+) pass(?:ed)?,? (\d+) (?:FAIL|failed)/gi)].pop(); res({ f, code, counts: m ? m[1] + "/" + m[2] : "no count line", ms: Date.now() - t0 }); });
});
async function runAll(list, workers = 6) { const out = []; let i = 0; await Promise.all(Array.from({ length: workers }, async () => { while (i < list.length) { const f = list[i++]; let r = await runOne(f); if (r.counts === "no count line") r = await runOne(f);   // a run that died under load (no count line) is asked once more
          out.push(r); } })); return Object.fromEntries(out.map(r => [r.f, r])); }

// A person's own build output (the stale .vercel/output of a machine that has deployed) is moved out of the tree for the first run, so "as the tree stands" means a clean checkout, and put back at the end (also on a signal).
import os from "node:os";
const STASH = path.join(os.tmpdir(), "buildOutputCheck-stash-" + process.pid), PLANTS = FOLDERS.map(d => d.startsWith(".vercel/") ? ".vercel/output" : d.split("/")[0]), moved = [], made = [];
for (const d of PLANTS) if (fs.existsSync(path.join(ROOT, d))) { fs.mkdirSync(path.join(STASH, path.dirname(d)), { recursive: true }); try { fs.renameSync(path.join(ROOT, d), path.join(STASH, d)); moved.push(d); } catch (e) { console.log("buildOutputCheck: SKIP cannot move " + d + " out of the tree (" + e.code + "): remove it to run the decoy proof"); process.exit(0); } }
const hadBefore = moved.slice();
const cleanup = () => { for (const d of made.splice(0)) try { fs.rmSync(path.join(ROOT, d), { recursive: true, force: true }); } catch { /* gone */ } for (const d of moved.splice(0)) try { fs.mkdirSync(path.join(ROOT, path.dirname(d)), { recursive: true }); fs.renameSync(path.join(STASH, d), path.join(ROOT, d)); } catch { /* put back by hand from the stash */ } try { fs.rmSync(STASH, { recursive: true, force: true }); } catch { /* gone */ } };
process.on("exit", cleanup); process.on("SIGINT", () => { cleanup(); process.exit(130); }); process.on("SIGTERM", () => { cleanup(); process.exit(143); });

ok("the sweepers found (the checks that read a directory and walk it)", sweepers.length >= (only ? 1 : 10), sweepers.length);
const before = await runAll(sweepers);
for (const d of FOLDERS) {
  const top = d.startsWith(".vercel/") ? (fs.existsSync(path.join(ROOT, ".vercel")) ? ".vercel/output" : ".vercel") : d.split("/")[0];
  fs.mkdirSync(path.join(ROOT, d), { recursive: true }); if (!made.includes(top)) made.push(top);
  for (const src of ["lib", "api", "public/js"]) { fs.mkdirSync(path.join(ROOT, d, path.dirname(src)), { recursive: true }); spawnSync("cp", ["-Rc", path.join(ROOT, src), path.join(ROOT, d, src)]); if (!fs.existsSync(path.join(ROOT, d, src))) spawnSync("cp", ["-R", path.join(ROOT, src), path.join(ROOT, d, src)]); }
}
ok("the decoy build folders hold copies of lib and api", made.length > 0 && made.every(d => fs.existsSync(path.join(ROOT, d))), made);
const after = await runAll(sweepers);
cleanup();
for (const f of sweepers) { const a = before[f], b = after[f]; ok(f.replace(/\.mjs$/, "") + ": the same count and exit with build folders present (" + a.counts + " exit " + a.code + ")", a.counts === b.counts && a.code === b.code, { without: a.counts + " exit " + a.code, with: b.counts + " exit " + b.code }); }
ok("the decoys are gone and the person\'s own build folders are back", made.length === 0 && moved.length === 0 && hadBefore.every(d => fs.existsSync(path.join(ROOT, d))));
console.log(`buildOutputCheck: ${pass} pass, ${fail} FAIL (${sweepers.length} sweepers)`); for (const f of fails) console.log("FAIL " + f);
process.exit(fail ? 1 : 0);
