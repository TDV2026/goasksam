// A CHECK THAT PRINTS NO RESULT CANNOT FAIL (Lane E, Nov 1 2026). e98DomCheck.mjs was a library with no runner: run on its own it printed nothing and exited 0, and two sweeps
// counted it as quiet. The class: any scripts/*Check* file, and any script prePush runs, must (1) print a result line (a pass and fail count, ok, SKIP or REFUSED) and (2) be able to
// exit non-zero. Source rules, so this is quick and runs in prePush; a script that is only a generator (build*) is not a check.
//   node scripts/checkSilenceCheck.mjs  [dir]   exit 1 on any silent check.
import fs from "node:fs";
import path from "node:path";
const ROOT = path.resolve(process.argv[2] || new URL("..", import.meta.url).pathname), SCRIPTS = path.join(ROOT, "scripts");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const listed = new Set(fs.readdirSync(SCRIPTS).filter(f => /Check.*\.(mjs|js)$/.test(f) && !/^build/.test(f)));
const pre = fs.existsSync(path.join(SCRIPTS, "prePush.mjs")) ? fs.readFileSync(path.join(SCRIPTS, "prePush.mjs"), "utf8") : "";
for (const m of pre.matchAll(/node scripts\/([A-Za-z0-9_]+\.(?:mjs|js))/g)) if (fs.existsSync(path.join(SCRIPTS, m[1]))) listed.add(m[1]);
const PRINTS = /console\.(?:log|error|info)\([^;]*?(?:pass|PASS|FAIL|fail|\bok\b|SKIP|REFUSED|clean|\ball\b)/;
const EXITS = /process\.exit|process\.exitCode|process\.kill|\bthrow\b/;
for (const f of [...listed].sort()) {
  const t = fs.readFileSync(path.join(SCRIPTS, f), "utf8");
  ok(PRINTS.test(t), `${f}: prints no result line (a pass and fail count, ok, SKIP or REFUSED)`);
  ok(EXITS.test(t), `${f}: has no way to exit non-zero`);
}
console.log(`checkSilenceCheck: ${pass} pass, ${fail} FAIL (${listed.size} checks read)`);
process.exit(fail ? 1 : 0);
