// clock: real-ok no dates (Lane B, Nov 10 2026)
// PREPUSH STATUS CHECK. Cause: three checks in scripts/prePush.mjs (Market Check entry card, Find card intelligence, Function bundles) handed record() a boolean, and record() called status.padEnd, so the whole run crashed instead of reporting a red.
// The class: any check that passes record() something that is not the word PASS, FAIL or SKIP.
//   (1) static sweep: every record( call in prePush.mjs has a status that is a literal word, or a ternary of literal words, or a variable named `status` inside record itself
//   (2) behaviour: normalizeStatus turns true, false, undefined, null, 1 and a stray word into a FAIL row that keeps the check's name and says what was returned; the three words pass through unchanged
//   (3) record() in prePush.mjs goes through normalizeStatus, so a bad check is a red row and the run ends (no crash)
// MUTANTS (each must fail): a check hands back true; a check hands back false; record() calls status.padEnd on the raw value; normalizeStatus lets a boolean through; normalizeStatus drops the check's name.
//   node scripts/prePushStatusCheck.mjs --mutants
import fs from "node:fs"; import path from "node:path"; import { pathToFileURL } from "node:url";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const WORD = /^"(PASS|FAIL|SKIP)"$/;
function recordCalls(src) {
  const out = [];
  for (const m of src.matchAll(/\brecord\(/g)) {
    let i = m.index + m[0].length, depth = 1, q = null, start = i, args = [], re = false;
    for (; i < src.length && depth; i++) {
      const c = src[i];
      if (q) { if (c === "\\") i++; else if (c === q) q = null; continue; }
      if (c === '"' || c === "'" || c === "`") { q = c; continue; }
      if (c === "/" && /[(,=?:&|!]\s*$/.test(src.slice(Math.max(0, i - 3), i)) && src[i + 1] !== "/" && src[i + 1] !== "*") { // a regex literal: skip to its closing slash
        let k = i + 1; while (k < src.length && src[k] !== "/" && src[k] !== "\n") { if (src[k] === "\\") k++; k++; } if (src[k] === "/") { i = k; continue; } }
      if ("([{".includes(c)) depth++; else if (")]}".includes(c)) depth--; else if (c === "," && depth === 1) { args.push(src.slice(start, i).trim()); start = i + 1; }
    }
    args.push(src.slice(start, i - 1).trim());
    out.push({ line: src.slice(0, m.index).split("\n").length, args });
  }
  return out;
}
const okStatus = s => WORD.test(s) || /\?\s*"(PASS|FAIL|SKIP)"\s*:\s*"(PASS|FAIL|SKIP)"\s*$/.test(s) || /\?\s*"(PASS|FAIL|SKIP)"\s*:\s*[^?]*\?\s*"(PASS|FAIL|SKIP)"\s*:\s*"(PASS|FAIL|SKIP)"\s*$/.test(s);
export async function findings(mut = {}) {
  const fails = [];
  let pp = fs.readFileSync(path.join(ROOT, "scripts/prePush.mjs"), "utf8"), st = fs.readFileSync(path.join(ROOT, "scripts/_prePushStatus.mjs"), "utf8");
  if (mut.pp) pp = mut.pp(pp); if (mut.st) st = mut.st(st);
  // (1) static sweep
  const calls = recordCalls(pp).filter(c => c.args.length >= 2 && !/^function\b/.test(c.args[0]));
  if (calls.length < 100) fails.push(`the sweep found only ${calls.length} record( calls; it is reading the file wrongly`);
  for (const c of calls) { const s = c.args[1]; if (s === "status") continue; if (!okStatus(s)) fails.push(`prePush.mjs line ${c.line}: record() gets "${s.slice(0, 60)}" as its status, not PASS, FAIL or SKIP`); }
  // (3) record goes through the normalizer and never touches the raw value
  const rec = /function record\([^)]*\)\s*\{[^\n]*\}/.exec(pp);
  if (!rec) fails.push("record() not found in prePush.mjs"); else { if (!/normalizeStatus\(/.test(rec[0])) fails.push("record() does not read the status through normalizeStatus"); if (/(?<![.\w])status\.padEnd/.test(rec[0])) fails.push("record() calls status.padEnd on the raw value, a boolean crashes the run"); }
  // (2) behaviour
  const tmp = path.join(ROOT, "scripts/__psmut_status.mjs"); fs.writeFileSync(tmp, st);
  try {
    const { normalizeStatus } = await import(pathToFileURL(tmp).href + "?" + Math.random());
    for (const w of ["PASS", "FAIL", "SKIP"]) { const r = normalizeStatus("n", w, "d"); if (r.status !== w || r.detail !== "d") fails.push(`${w} did not pass through unchanged`); }
    for (const [label, v] of [["true", true], ["false", false], ["undefined", undefined], ["null", null], ["1", 1], ["a stray word", "ok"]]) {
      let r; try { r = normalizeStatus("My check", v, "x"); } catch (e) { fails.push(`${label} threw ${e.message}`); continue; }
      if (r.status !== "FAIL") fails.push(`${label} reads ${r.status}, expected FAIL`);
      if (r.name !== "My check") fails.push(`${label} lost the check's name (${r.name})`);
      if (!/instead of PASS, FAIL or SKIP/.test(r.detail || "")) fails.push(`${label} red row does not say what was wrong`);
      if (typeof r.status !== "string" || r.status.padEnd(4).length < 4) fails.push(`${label} status is not a string`);
    }
  } finally { fs.rmSync(tmp, { force: true }); }
  return fails;
}
if (process.argv[1] && process.argv[1].endsWith("prePushStatusCheck.mjs")) {
  const MUTS = [
    ["a check hands back true", { pp: s => s.replace('"Function bundles: every file', '"Function bundles: every file').replace(/(record\("Function bundles[^\n]*?)\/, 0 FAIL\/\.test\(out\) \? "PASS" : "FAIL"/, "$1/, 0 FAIL/.test(out)") }],
    ["a check hands back false", { pp: s => s.replace(/(record\("Find card intelligence[^\n]*?)"FAIL", String\(e\.stdout/, "$1false, String(e.stdout") }],
    ["record() calls status.padEnd on the raw value", { pp: s => s.replace("const r = normalizeStatus(name, status, detail); results.push(r); console.log(`${r.status.padEnd(4)}", "const r = normalizeStatus(name, status, detail); results.push(r); console.log(`${status.padEnd(4)}").replace("normalizeStatus(name, status, detail); results", "{ name, status, detail }; results") }],
    ["normalizeStatus lets a boolean through", { st: s => s.replace('typeof status === "string" && STATUS_WORDS.includes(status)', 'typeof status !== "undefined"') }],
    ["normalizeStatus drops the check's name", { st: s => s.replace("return { name, status: \"FAIL\"", "return { name: \"\", status: \"FAIL\"") }]
  ];
  const base = await findings(); for (const f of base) console.log("FAIL  " + f);
  console.log(`${base.length ? "FAIL" : "PASS"}  every record() status is a word; a non-word status is a red row with the check's name`);
  let surv = 0;
  if (process.argv.includes("--mutants")) for (const [n, m] of MUTS) { let f; try { f = await findings(m); } catch (e) { f = ["threw " + e.message]; } console.log(`${f.length ? "killed  " : "SURVIVED"}  ${n}`); if (!f.length) surv++; }
  console.log(`\nprePushStatusCheck: ${base.length ? base.length + " FAIL" : "all pass"}${process.argv.includes("--mutants") ? (surv ? `, ${surv} mutant(s) survived` : ", all mutants killed") : ""}`);
  process.exit(base.length || surv ? 1 : 0);
}
