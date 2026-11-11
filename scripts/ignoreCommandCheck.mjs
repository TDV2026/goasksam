// ignoreCommandCheck (Lane E, Nov 11 2026): AN ENV-ONLY REDEPLOY MUST BUILD.
// CAUSE (Lane C, the flip, Nov 11): vercel.json ignoreCommand skips a build when nothing but docs changed since the last built commit (git diff <last built sha> HEAD -- . ":!docs"). A redeploy of the SAME commit (the only way an environment variable
// takes effect: NEW_DESIGN, PUBLIC_EXAMPLES, NEW_DESIGN_DATE are read at run time but only a new deployment sees a changed value) has HEAD equal to the last built sha, so the diff is empty and the redeploy was cancelled. Each env change then needed a fake comment commit.
// Since Nov 11 2026 the command is `bash scripts/vercelIgnore.sh` (Vercel limits the string to 256 characters).
// RULE: a docs-only PUSH is skipped (cost); a redeploy of the commit already built, a code change, a vercel.json change and an unknown previous commit all BUILD. Runs the real command from vercel.json in a scratch git repo, no network.
//   node scripts/ignoreCommandCheck.mjs [--mutants]
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { execFileSync, spawnSync } from "node:child_process"; import { fileURLToPath } from "node:url";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), ".."), args = process.argv.slice(2);
if (args.includes("--mutants")) {
  const f = path.join(ROOT, "scripts/vercelIgnore.sh"), orig = fs.readFileSync(f, "utf8"), from = '[ "$(git rev-parse HEAD)" != "$p" ] || exit 1\n';
  let bad = 0; if (!orig.includes(from)) { console.log("MUTANT NOT APPLICABLE: the redeploy rule is not in scripts/vercelIgnore.sh"); process.exit(1); }
  try { fs.writeFileSync(f, orig.replace(from, "")); let code = 0; try { execFileSync("node", [fileURLToPath(import.meta.url)], { stdio: "pipe" }); } catch (e) { code = e.status || 1; } console.log((code ? "caught   " : "MISSED   ") + "without the rule that builds a redeploy of the commit already built"); if (!code) bad++; } finally { fs.writeFileSync(f, orig); }
  console.log(bad ? "ignoreCommandCheck mutants: " + bad + " not caught" : "ignoreCommandCheck mutants: all 1 caught"); process.exit(bad ? 1 : 0);
}
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const cmd = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8")).ignoreCommand;
ok(typeof cmd === "string" && cmd.length > 0 && cmd.length <= 256 && /vercelIgnore\.sh/.test(cmd), "vercel.json has an ignoreCommand (short, running scripts/vercelIgnore.sh)");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ign-")), git = (...a) => execFileSync("git", a, { cwd: dir, encoding: "utf8" }).trim();
git("init", "-q"); git("config", "user.email", "t@t.test"); git("config", "user.name", "t");
const commit = (file, text, msg) => { fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); fs.writeFileSync(path.join(dir, file), text); git("add", "-A"); git("commit", "-qm", msg); return git("rev-parse", "HEAD"); };
fs.mkdirSync(path.join(dir, "scripts"), { recursive: true }); fs.copyFileSync(path.join(ROOT, "scripts/vercelIgnore.sh"), path.join(dir, "scripts/vercelIgnore.sh"));   // vercel.json runs the script from the checkout
const A = commit("api/x.js", "export default 1;\n", "code A"), B = commit("docs/notes.md", "note\n", "docs only"), C = commit("api/x.js", "export default 2;\n", "code change"), D = commit("vercel.json", "{}\n", "config only");
const run = (head, prev) => { git("checkout", "-q", head); const r = spawnSync("sh", ["-c", cmd], { cwd: dir, env: { ...process.env, VERCEL_GIT_PREVIOUS_SHA: prev }, encoding: "utf8" }); return r.status; };   // 0 = skip the build, 1 = build
ok(run(A, A) === 1, "a redeploy of the commit already built (an env-only change) BUILDS: HEAD equals the last built commit");
ok(run(B, A) === 0, "a docs-only push is skipped");
ok(run(C, A) === 1, "a code change builds");
ok(run(C, B) === 1, "a code change after a skipped docs push builds");
ok(run(D, C) === 1, "a vercel.json change builds");
ok(run(B, B) === 1, "a redeploy of a docs-only commit that was the last built commit builds");
ok(run(C, "") === 1, "no previous deployment: builds");
ok(run(C, "0123456789abcdef0123456789abcdef01234567") === 1, "a previous commit this checkout does not hold: builds");
fs.rmSync(dir, { recursive: true, force: true });
console.log(`ignoreCommandCheck: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
