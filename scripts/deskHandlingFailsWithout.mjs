// Each mutation undoes ONE rule of the open case's handling clock on a scratch copy of the tree; scripts/deskHandlingCheck.mjs must go red on every one (and be green on the real tree).
//   node scripts/deskHandlingFailsWithout.mjs [only-a-number-to-run-one]
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { execFileSync } from "node:child_process"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const CV = "lib/desk/caseView.js";
const MUT = [
  ["the clock is a constant line, not rebuilt from the case's opens", CV, s => s.replace("clock: handlingClock(c, seat, now)", "clock: reasonLine(\"case.handling.clock_none\")")],
  ["the clock is measured to the first open, so it never moves", CV, s => s.replace("handlingSeconds(c, seat, now) : null;", "handlingSeconds(c, seat, c.opened_at) : null;")],
  ["a finalized case keeps running its clock", CV, s => s.replace("if (c.handling_seconds != null) return", "if (false) return")],
  ["the clock sentence is typed in caseView", CV, s => s.replace('reasonLine("case.handling.clock_open", { time: dur(s) })', '"Handling time so far: " + dur(s) + "."')],
  ["case_edit answers a view with no clock (the page would keep a stale one)", "lib/desk/caseView.js", s => s.replace(", clock: handlingClock(c, seat, now) }", " }")]
];
function copyTree(dst) {
  for (const d of ["lib", "scripts", "public", "api", "data", "docs"]) if (fs.existsSync(path.join(ROOT, d))) fs.cpSync(path.join(ROOT, d), path.join(dst, d), { recursive: true, filter: s => !/node_modules|proofs/.test(s) });
  for (const f of ["package.json", "vercel.json"]) if (fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(dst, f));
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dst, "node_modules"));
}
const run = dir => { try { const o = execFileSync("node", ["scripts/deskHandlingCheck.mjs", dir], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 280000 }); return { red: false, out: o }; } catch (e) { return { red: true, out: String(e.stdout || "") + String(e.stderr || "") }; } };
let bad = 0; const only = process.argv[2] && /^\d+$/.test(process.argv[2]) ? Number(process.argv[2]) : null;
for (const [i, [name, file, fn]] of MUT.entries()) {
  if (only != null && only !== i) continue;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hc-")); copyTree(dir);
  const p = path.join(dir, file), before = fs.readFileSync(p, "utf8"), after = fn(before);
  if (after === before) { console.log("FAIL  mutation did not apply: " + name); bad++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
  fs.writeFileSync(p, after); const r = run(dir);
  console.log((r.red ? "ok  " : "FAIL") + `  [${i}] without the rule, the check goes red: ` + name + (r.red ? "  (" + (r.out.split("\n").find(l => /^FAIL/.test(l)) || r.out.split("\n").filter(Boolean).slice(-1)[0] || "").slice(0, 80) + ")" : ""));
  if (!r.red) bad++;
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`deskHandlingFailsWithout: ${bad ? bad + " PROBLEM" : "every mutation is caught"}`); process.exit(bad ? 1 : 0);
