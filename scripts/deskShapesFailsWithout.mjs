// Each mutation breaks one served shape on a scratch copy; scripts/deskShapesCheck.mjs must go red on every one.
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { execFileSync } from "node:child_process"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const MUT = [
  ["the review stage is named in_review", "lib/desk/caseModel.js", s => s.replace('in_review: "review"', 'in_review: "in_review"')],
  ["the final stage is named finalized", "lib/desk/caseModel.js", s => s.replace('finalized: "final" }', 'finalized: "finalized" }')],
  ["a finalized case is counted as ready", "lib/desk/caseView.js", s => s.replace('STAGE_OF[c.status] || "new"', '(c.status === "finalized" ? "ready" : STAGE_OF[c.status]) || "new"')],
  ["the queue counts are not sent with the case", "lib/desk/caseView.js", s => s.replace("queue: queueCounts(allSheets, now), ", "")],
  ["the median handling time is the first value, not the median", "lib/desk/caseView.js", s => s.replace("n % 2 ? a[(n - 1) / 2] : Math.round((a[n / 2 - 1] + a[n / 2]) / 2)", "a[0]")],
  ["the share needing more divides by zero", "lib/desk/caseView.js", s => s.replace('leads.length ? `${Math.round((more.length / leads.length) * 100)}%` : "none yet"', '`${Math.round((more.length / leads.length) * 100)}%`')],
  ["a revision is counted before the report was finalized", "lib/desk/caseView.js", s => s.replace("c.finalized_at && c.version > 1", "c.version > 1")],
  ["a label is renamed", "lib/desk/caseView.js", s => s.replace("Reports finalized today", "Done today")],
  ["finalized today counts any day", "lib/desk/caseView.js", s => s.replace("String(c.finalized_at).slice(0, 10) === today", "true")],
  ["the demonstration case is a different lead", "lib/desk/caseDemo.js", s => s.replace('leadRef: "HM-24117"', 'leadRef: "HM-1"')]
];
function copyTree(dst) { for (const d of ["lib", "scripts", "public", "api", "data", "docs"]) if (fs.existsSync(path.join(ROOT, d))) fs.cpSync(path.join(ROOT, d), path.join(dst, d), { recursive: true, filter: s => !/node_modules|proofs/.test(s) }); for (const f of ["package.json", "vercel.json"]) if (fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(dst, f)); fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dst, "node_modules")); }
const run = dir => { try { execFileSync("node", ["scripts/deskShapesCheck.mjs", dir], { cwd: dir, stdio: "pipe", timeout: 120000 }); return false; } catch { return true; } };
let bad = 0;
for (const [i, [name, file, fn]] of MUT.entries()) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ds-")); copyTree(dir);
  const p = path.join(dir, file), before = fs.readFileSync(p, "utf8"), after = fn(before);
  if (after === before) { console.log("FAIL  mutation did not apply: " + name); bad++; } else { fs.writeFileSync(p, after); const red = run(dir); console.log((red ? "ok  " : "FAIL") + `  [${i}] ` + name); if (!red) bad++; }
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`deskShapesFailsWithout: ${bad ? bad + " PROBLEM" : "every mutation is caught"}`); process.exit(bad ? 1 : 0);
