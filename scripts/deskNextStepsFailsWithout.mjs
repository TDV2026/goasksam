// Each mutation undoes ONE fix of Desk v4 stage 3 on a scratch copy; scripts/deskNextStepsCheck.mjs must go red on every one.
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { execFileSync } from "node:child_process"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const NS = "lib/desk/nextSteps.js", SA = "lib/desk/sheetActions.js";
const MUT = [
  ["the invoice step never drops itself", NS, s => s.replace("if (at >= 0 && !on && !c.nextSteps[at].edited) c.nextSteps.splice(at, 1);", "if (false) c.nextSteps.splice(at, 1);")],
  ["an edited invoice step is dropped anyway", NS, s => s.replace("!on && !c.nextSteps[at].edited)", "!on)")],
  ["a removed seeded step is put back", NS, s => s.replace("&& !c.nextStepsRemoved.includes(key)) {", ") {")],
  ["reorder loses a step", NS, s => s.replace("if (want.length !== ids.length || new Set(want).size !== ids.length || !want.every(i => ids.includes(i))) throw", "if (false) throw")],
  ["edit does not mark the step edited", NS, s => s.replace("{ ...c.nextSteps[i], text: t, edited: true }", "{ ...c.nextSteps[i], text: t }")],
  ["the report prints the seeds, not the analyst's words", "lib/desk/reportState.js", s => s.replace("const steps = printedSteps(c);", 'const steps = [reasonLine("report.next.call")];')],
  ["a seeded sentence is typed in nextSteps.js", NS, s => s.replace('text: reasonLine("report.next." + key)', 'text: "We will call you to talk through this report."')],
  ["the step ops read the step from body.id (the sheet)", SA, s => s.replace('else if (op === "step_edit") c = W.editNextStep(c, String(body.step || ""),', 'else if (op === "step_edit") c = W.editNextStep(c, String(body.id || ""),')],
  ["the caseView carries no nextSteps", "lib/desk/caseView.js", s => s.replace("nextSteps: syncSteps(c).nextSteps, ", "")],
  ["a step is added without a limit", NS, s => s.replace('if (c.nextSteps.length >= MAX_STEPS) throw new Error("a report takes up to " + MAX_STEPS + " steps");', "")]
];
function copyTree(dst) {
  for (const d of ["lib", "scripts", "public", "api", "data", "docs"]) if (fs.existsSync(path.join(ROOT, d))) fs.cpSync(path.join(ROOT, d), path.join(dst, d), { recursive: true, filter: s => !/node_modules|proofs/.test(s) });
  for (const f of ["package.json", "vercel.json"]) if (fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(dst, f));
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dst, "node_modules"));
}
const run = dir => { try { const o = execFileSync("node", ["scripts/deskNextStepsCheck.mjs", dir], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 200000 }); return { red: false, out: o }; } catch (e) { return { red: true, out: String(e.stdout || "") + String(e.stderr || "") }; } };
let bad = 0;
for (const [i, [name, file, fn]] of MUT.entries()) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ar-")); copyTree(dir);
  const p = path.join(dir, file), before = fs.readFileSync(p, "utf8"), after = fn(before);
  if (after === before) { console.log("FAIL  mutation did not apply: " + name); bad++; }
  else { fs.writeFileSync(p, after); const r = run(dir); console.log((r.red ? "ok  " : "FAIL") + `  [${i}] the check goes red without the fix: ` + name + (r.red ? "  (" + (r.out.split("\n").find(l => /^FAIL/.test(l)) || r.out.split("\n").filter(Boolean).slice(-1)[0] || "").slice(0, 80) + ")" : "")); if (!r.red) bad++; }
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`deskActionsResolveFailsWithout: ${bad ? bad + " PROBLEM" : "every mutation is caught"}`); process.exit(bad ? 1 : 0);
