// Each mutation undoes ONE rule of the V4 report checks on a scratch copy of the tree; scripts/reportConsistencyCheck.mjs must go red on every one (and be green on the real tree).
//   node scripts/reportConsistencyFailsWithout.mjs [only-a-number-to-run-one]
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { execFileSync } from "node:child_process"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const CW = "lib/desk/caseWorkflow.js", CV = "lib/desk/caseView.js", RS = "lib/desk/reportState.js";
const MUT = [
  ["check four ignores an open item that is not material", CW, s => s.replace('const open = c.needs_review.filter(n => n.state === "open");', 'const open = c.needs_review.filter(n => n.state === "open" && n.material);')],
  ["one comparable is enough", CW, s => s.replace("if (picked.length < 2)", "if (picked.length < 1)")],
  ["a comparable without its own listing passes", CW, s => s.replace("else if (nolink.length)", "else if (false)")],
  ["the seller's stated facts are never checked", CW, s => s.replace("const sb = statedFactsBad(c);", "const sb = [];")],
  ["the seller's request does not lift the reserve check", CW, s => s.replace("else if (r.sellerRequested) checks.push(", "else if (false) checks.push(")],
  ["an unsupported reserve passes the check", CW, s => s.replace("else if (supported && !r.sellerRequested)", "else if (true)")],
  ["Finalize is always allowed", CW, s => s.replace("const ready = blockers.length === 0;", "const ready = true;")],
  ["the hint always says ready", CW, s => s.replace('reasonLine(ready ? "case.check.hint_ready" : "case.check.hint_blocked")', 'reasonLine("case.check.hint_ready")')],
  ["the case view carries no checks", CV, s => s.replace("checks: readinessOf(c).checks, ", "")],
  ["an unverified mileage is allowed to stand as a support", CW, s => s.replace('mileage_band: "mileage", ', "")],
  ["a seller stated service history is a support even without the invoice", CW, s => s.replace(' && !(sp.key === "service_ims" && c.documents.some(isServiceInvoice))', "")],
  ["an unverified mileage is worded as verified in the report", RS, s => s.replace("m.verified ? reasonLine(\"report.mileage_verified\", { miles: out.mileageWords }) : m.source", "true ? reasonLine(\"report.mileage_verified\", { miles: out.mileageWords }) : m.source")]
];
function copyTree(dst) {
  for (const d of ["lib", "scripts", "public", "api", "data", "docs"]) if (fs.existsSync(path.join(ROOT, d))) fs.cpSync(path.join(ROOT, d), path.join(dst, d), { recursive: true, filter: s => !/node_modules|proofs/.test(s) });
  for (const f of ["package.json", "vercel.json"]) if (fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(dst, f));
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dst, "node_modules"));
}
const run = dir => { try { const o = execFileSync("node", ["scripts/reportConsistencyCheck.mjs", dir], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 280000 }); return { red: false, out: o }; } catch (e) { return { red: true, out: String(e.stdout || "") + String(e.stderr || "") }; } };
let bad = 0; const only = process.argv[2] && /^\d+$/.test(process.argv[2]) ? Number(process.argv[2]) : null;
for (const [i, [name, file, fn]] of MUT.entries()) {
  if (only != null && only !== i) continue;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rc-")); copyTree(dir);
  const p = path.join(dir, file), before = fs.readFileSync(p, "utf8"), after = fn(before);
  if (after === before) { console.log("FAIL  mutation did not apply: " + name); bad++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
  fs.writeFileSync(p, after); const r = run(dir);
  console.log((r.red ? "ok  " : "FAIL") + `  [${i}] without the rule, the check goes red: ` + name + (r.red ? "  (" + (r.out.split("\n").find(l => /^FAIL/.test(l)) || r.out.split("\n").filter(Boolean).slice(-1)[0] || "").slice(0, 80) + ")" : ""));
  if (!r.red) bad++;
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`reportConsistencyFailsWithout: ${bad ? bad + " PROBLEM" : "every mutation is caught"}`); process.exit(bad ? 1 : 0);
