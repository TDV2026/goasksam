// Each mutation below undoes ONE rule of the tier ladder / analyst mark change on a scratch copy of the tree; scripts/deskDashCheck.mjs must go red on every one (and be green on the real tree).
//   node scripts/deskDashFailsWithout.mjs
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { execFileSync } from "node:child_process"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const MUT = [
  ["a dash back in the interpreter refusal", "lib/desk/interpret.js", s => s.replace("because it isn't in this set.", "— it isn't in this set.")],
  ["an en dash back in the generation label", "lib/desk/execute.js", s => s.replace("${gen.yearStart} to ${gen.yearEnd}", "${gen.yearStart}–${gen.yearEnd}")],
  ["a dash in the Valuations page copy", "public/js/deskvals.js", s => s.replace("Click the tier the photos show.", "Click the tier — the photos show.")],
  ["a dash in the Send email template", "lib/desk/send.js", s => s.replace("`A note from ${who}:\\n${String(note).trim()}`", "`A note from ${who} —\\n${String(note).trim()}`")],
  ["a dash in a PDF row", "lib/desk/reportPdf.js", s => s.replace('row("Analyst note", mk.reason)', 'row("Analyst note —", mk.reason)')],
  ["a dash in a tier ladder line", "lib/conditionTier.js", s => s.replace("Near new, a careful restoration", "Near new — a careful restoration")]
];
function copyTree(dst) {
  for (const d of ["lib", "scripts", "public", "api", "data", "docs"]) if (fs.existsSync(path.join(ROOT, d))) fs.cpSync(path.join(ROOT, d), path.join(dst, d), { recursive: true, filter: s => !/node_modules|proofs/.test(s) });
  for (const f of ["package.json", "vercel.json"]) if (fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(dst, f));
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dst, "node_modules"));
}
const run = dir => { try { const o = execFileSync("node", ["scripts/deskDashCheck.mjs", dir], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 110000 }); return { red: false, out: o }; } catch (e) { return { red: true, out: String(e.stdout || "") + String(e.stderr || "") }; } };
let bad = 0;
const base = fs.mkdtempSync(path.join(os.tmpdir(), "dd-")); copyTree(base);
const b0 = run(base); console.log((b0.red ? "FAIL" : "ok  ") + "  the real tree is green"); if (b0.red) { bad++; console.log(b0.out.split("\n").slice(-6).join("\n")); }
for (const [name, file, fn] of MUT) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-")); copyTree(dir);
  const p = path.join(dir, file), before = fs.readFileSync(p, "utf8"), after = fn(before);
  if (after === before) { console.log("FAIL  mutation did not apply: " + name); bad++; continue; }
  fs.writeFileSync(p, after); const r = run(dir);
  console.log((r.red ? "ok  " : "FAIL") + "  without the fix, the check goes red: " + name + (r.red ? "  (" + (r.out.split("\n").find(l => /^FAIL/.test(l)) || r.out.split("\n").filter(Boolean).slice(-1)[0] || "").slice(0, 90) + ")" : ""));
  if (!r.red) bad++;
  fs.rmSync(dir, { recursive: true, force: true });
}
fs.rmSync(base, { recursive: true, force: true });
console.log(`deskDashFailsWithout: ${bad ? bad + " PROBLEM" : "every mutation is caught"}`); process.exit(bad ? 1 : 0);
