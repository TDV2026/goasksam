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
// Nov 18 2026 (Lane C): two ways a check prints and exits that the first rules did not see, both in use by 27 checks that print a count and fail with a code when run: (1) a local alias for the printer (a check that
// declares const log = console.log, or print/say/tally/done), (2) a shared harness the check imports (scripts/deskV3Harness.mjs: tally and done print the result and set the exit code). A check counts as printing and able to
// exit when its own text does, or when a local helper it imports (a file in scripts/ with ./ or ../scripts/ in the path) does. The rule is still source only; the helper has to meet the SAME two rules itself.
const ALIAS = /\b(?:log|print|say|emit|report|tally|done|finish)\s*\([^;]*?(?:pass|PASS|FAIL|fail|\bok\b|SKIP|REFUSED|clean|\ball\b)/;
const helperOf = (text, dir, read, depth = 3, seen = new Set()) => { const out = []; for (const m of text.matchAll(/from\s+["'](\.{1,2}\/[^"']+?\.m?js)["']/g)) { const f = path.join(dir, m[1]); if (seen.has(f)) continue; seen.add(f); let h = null; try { h = read(f); } catch { /* not a file */ } if (h) { out.push(h); if (depth > 1) out.push(...helperOf(h, path.dirname(f), read, depth - 1, seen)); } } return out; };   // a helper may itself import the shared harness (deskV4Harness.mjs imports deskV3Harness.mjs): three steps down
export function verdict(text, dir = SCRIPTS, read = f => fs.readFileSync(f, "utf8")) {
  const own = { prints: PRINTS.test(text) || ALIAS.test(text), exits: EXITS.test(text) };
  if (own.prints && own.exits) return own;
  for (const h of helperOf(text, dir, read)) { own.prints = own.prints || PRINTS.test(h) || ALIAS.test(h); own.exits = own.exits || EXITS.test(h); }
  return own;
}
// the rule on made-up scripts: a silent one fails, an alias printer and a harness import pass (so a new silent check still fails here)
{ const silent = 'const x = 1;\nfoo(x);', alias = 'const log = console.log;\nlet pass = 0, fail = 0;\nlog(`name: ${pass} pass, ${fail} FAIL`);\nprocess.exit(fail ? 1 : 0);', harness = 'import { tally } from "./h.mjs";\ntally("name");', helper = 'export const tally = n => { console.log(n + ": " + 3 + " pass, 0 FAIL"); process.exit(0); };';
  const rd = f => { if (/h\.mjs$/.test(f)) return helper; throw new Error("no file"); };
  ok(!verdict(silent, "x", rd).prints && !verdict(silent, "x", rd).exits, "the rule: a script that prints nothing and cannot exit non-zero is silent");
  ok(verdict(alias, "x", rd).prints && verdict(alias, "x", rd).exits, "the rule: a local alias for the printer counts");
  ok(verdict(harness, "x", rd).prints && verdict(harness, "x", rd).exits, "the rule: a shared harness that prints and exits counts");
  ok(!verdict('import { tally } from "./missing.mjs";\ntally("n");', "x", rd).prints, "the rule: an import that cannot be read counts for nothing"); }
for (const f of [...listed].sort()) {
  const t = fs.readFileSync(path.join(SCRIPTS, f), "utf8"), v = verdict(t);
  ok(v.prints, `${f}: prints no result line (a pass and fail count, ok, SKIP or REFUSED)`);
  ok(v.exits, `${f}: has no way to exit non-zero`);
}
console.log(`checkSilenceCheck: ${pass} pass, ${fail} FAIL (${listed.size} checks read)`);
process.exit(fail ? 1 : 0);
