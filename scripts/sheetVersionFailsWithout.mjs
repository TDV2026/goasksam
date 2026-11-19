// Each mutation below undoes ONE rule of the tier ladder / analyst mark change on a scratch copy of the tree; scripts/sheetVersionCheck.mjs must go red on every one (and be green on the real tree).
//   node scripts/sheetVersionFailsWithout.mjs
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { execFileSync } from "node:child_process"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const MUT = [
  ["the store write is not compare and set (memory)", "lib/desk/sheetStore.js", s => s.replace("if (!cur || (cur.version || 0) !== (expected || 0)) return false;", "if (!cur) return false;")],
  ["the database write drops the version filter", "lib/desk/sheetStore.js", s => s.replace("`&sheet-%3E%3Eversion=eq.${v}`", '""')],
  ["the database write cannot tell zero rows from one", "lib/desk/sheetStore.js", s => s.replace("return Array.isArray(rows) && rows.length > 0;", "return true;")],
  ["a save does not move the version", "lib/desk/sheetActions.js", s => s.replace("s.version = (sheet.version || 0) + 1;\n    if (!(await store.putIf(org, s, base0)))", "if (!(await store.putIf(org, s, base0)))")],
  ["Finalise ignores the version", "lib/desk/sheetActions.js", s => s.replace("const baseF = baseOf(body, sheet); if (baseF !== (sheet.version || 0)) return stale();", "const baseF = sheet.version || 0;")],
  ["the refusal line is changed", "lib/desk/sheetActions.js", s => s.replace("Reload to see the latest.", "Try again.")],
  ["the page stops sending the version with a save", "public/js/deskvals.js", s => s.replace("patch: patch, baseVersion: (S.sheets[id].v.sheet.version || 0) }", "patch: patch }")]
];
function copyTree(dst) {
  for (const d of ["lib", "scripts", "public", "api", "data", "docs"]) if (fs.existsSync(path.join(ROOT, d))) fs.cpSync(path.join(ROOT, d), path.join(dst, d), { recursive: true, filter: s => !/node_modules|proofs/.test(s) });
  for (const f of ["package.json", "vercel.json"]) if (fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(dst, f));
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dst, "node_modules"));
}
const run = dir => { try { const o = execFileSync("node", ["scripts/sheetVersionCheck.mjs", dir], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 110000 }); return { red: false, out: o }; } catch (e) { return { red: true, out: String(e.stdout || "") + String(e.stderr || "") }; } };
let bad = 0;
const base = fs.mkdtempSync(path.join(os.tmpdir(), "sv-")); copyTree(base);
const b0 = run(base); console.log((b0.red ? "FAIL" : "ok  ") + "  the real tree is green"); if (b0.red) { bad++; console.log(b0.out.split("\n").slice(-6).join("\n")); }
for (const [name, file, fn] of MUT) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sv-")); copyTree(dir);
  const p = path.join(dir, file), before = fs.readFileSync(p, "utf8"), after = fn(before);
  if (after === before) { console.log("FAIL  mutation did not apply: " + name); bad++; continue; }
  fs.writeFileSync(p, after); const r = run(dir);
  console.log((r.red ? "ok  " : "FAIL") + "  without the fix, the check goes red: " + name + (r.red ? "  (" + (r.out.split("\n").find(l => /^FAIL/.test(l)) || r.out.split("\n").filter(Boolean).slice(-1)[0] || "").slice(0, 90) + ")" : ""));
  if (!r.red) bad++;
  fs.rmSync(dir, { recursive: true, force: true });
}
fs.rmSync(base, { recursive: true, force: true });
console.log(`sheetVersionFailsWithout: ${bad ? bad + " PROBLEM" : "every mutation is caught"}`); process.exit(bad ? 1 : 0);
