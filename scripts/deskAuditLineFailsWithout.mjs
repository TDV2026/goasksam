// Each mutation puts one audit entry back to a typed or raw-parts sentence on a scratch copy; scripts/deskAuditLineCheck.mjs must go red on every one.
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { execFileSync } from "node:child_process"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const CM = "lib/desk/caseModel.js", WF = "lib/desk/caseWorkflow.js";
const MUT = [
  ["the assessment takeover line is built by hand with a raw figure (the Nov 9 red)", CM, s => s.replace("return e.from != null ? reasonLine(\"case.audit.assessment_taken\", { figure: e.from }) : reasonLine(\"case.audit.assessment_set\");", "return \"assessment taken over from the engine assessment: \" + e.from;")],
  ["the engine's seed line groups no digits", CM, s => s.replace("reasonLine(\"case.audit.assessment_seeded\", { figure: e.to })", "\"The assessment was set to the engine's median of $\" + e.to + \".\"")],
  ["the entry carries no line at all", CM, s => s.replace("c.audit.push({ ...e, line: auditLineOf(e) });", "c.audit.push({ ...e });")],
  ["a writer pushes to the trail directly (cover set)", WF, s => s.replace("logAudit(c, { at: iso(now), by: \"analyst\", what: \"cover set\"", "c.audit.push({ at: iso(now), by: \"analyst\", what: \"cover set\"")],
  ["a mileage correction prints the raw number", CM, s => s.replace("field === \"mileage\" ? countNoun(v, \"mile\", { words: false }) : String(v)", "String(v)")],
  ["the page prints the entry's parts again", "lib/preview/deskV3.js", s => s.replace("<span>${esc(x.line || x.what)}</span>", "<span>${esc(x.what)}${x.from != null ? \": \" + esc(x.from) : \"\"}</span>")],
  ["an exclusion line is blank", CM, s => s.replace("if (ex) return reasonLine(\"case.audit.excluded_\" + (SCOPE_WORDS[ex[1]] || \"note_only\"));", "if (ex) return \"\";")]
];
function copyTree(dst) {
  for (const d of ["lib", "scripts", "public", "api", "data", "docs"]) if (fs.existsSync(path.join(ROOT, d))) fs.cpSync(path.join(ROOT, d), path.join(dst, d), { recursive: true, filter: s => !/node_modules|proofs/.test(s) });
  for (const f of ["package.json", "vercel.json"]) if (fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(dst, f));
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dst, "node_modules"));
}
let bad = 0;
for (const [i, [name, file, fn]] of MUT.entries()) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "al-")); copyTree(dir);
  const p = path.join(dir, file), before = fs.readFileSync(p, "utf8"), after = fn(before);
  if (after === before) { console.log("FAIL  mutation did not apply: " + name); bad++; }
  else { fs.writeFileSync(p, after); let red = false; try { execFileSync("node", ["scripts/deskAuditLineCheck.mjs", dir], { cwd: dir, stdio: "pipe", timeout: 120000 }); } catch { red = true; }
    console.log((red ? "ok  " : "FAIL") + `  [${i}] deskAuditLineCheck goes red without the fix: ` + name); if (!red) bad++; }
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`deskAuditLineFailsWithout: ${bad ? bad + " PROBLEM" : "every mutation is caught"}`); process.exit(bad ? 1 : 0);
