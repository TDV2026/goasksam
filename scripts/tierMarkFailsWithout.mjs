// Each mutation below undoes ONE rule of the tier ladder / analyst mark change on a scratch copy of the tree; scripts/tierMarkCheck.mjs must go red on every one (and be green on the real tree).
//   node scripts/tierMarkFailsWithout.mjs
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { execFileSync } from "node:child_process"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const MUT = [
  ["the ladder line typed on the page (second copy)", "public/js/deskvals.js", s => s + '\nvar LADDER2 = "Near new, a careful restoration or an exceptional original";\n'],
  ["the ladder line typed in sheetShape (second copy)", "lib/desk/sheetShape.js", s => s + '\nexport const TYPED = "Runs and drives, visible wear or needs";\n'],
  ["a fifth tier added", "lib/conditionTier.js", s => s.replace('  4: { name: "Fair"', '  5: { name: "Poor", line: "Needs everything to run at all" },\n  4: { name: "Fair"')],
  ["the Hagerty citation removed", "lib/conditionTier.js", s => s.replace("FOUR TIERS ONLY", "TIERS").replace("Hagerty's four rung condition ladder", "a condition ladder")],
  ["a mark asks the engine again", "lib/desk/sheetActions.js", s => s.replace('if ("mark" in p) {', 'if ("mark" in p) { reread = true;')],
  ["a plus moves the tier", "lib/desk/sheetActions.js", s => s.replace("s.state.mark = p.mark && p.mark.mark ? sanitizeMark(s.state.tier, p.mark) : null;", "s.state.mark = p.mark && p.mark.mark ? sanitizeMark(s.state.tier, p.mark) : null; if (s.state.mark && s.state.mark.mark === \"plus\" && s.state.tier > 1) s.state.tier -= 1;")],
  ["an Untiered car takes a mark", "lib/desk/sheetActions.js", s => s.replace('if (p.mark && p.mark.mark && !s.state.tier) return refuse("An Untiered car takes no plus or minus. Pick a tier first.");', "")],
  ["a mark with no tier is stored by sanitizeMark", "lib/conditionTier.js", s => s.replace("if (!([1, 2, 3, 4].includes(Number(tier))) || !m ||", "if (!m ||")],
  ["a new tier keeps the old tier's mark", "lib/desk/sheetActions.js", s => s.replace("if (nt !== s.state.tier) s.state.mark = null; ", "")],
  ["finalise drops the mark", "lib/desk/sheetActions.js", s => s.replace(" mark: sanitizeMark(sheet.state.tier, sheet.state.mark), analystFigure: sheet.state.analystFigure || null, evaluation: ev,", " analystFigure: sheet.state.analystFigure || null, evaluation: ev,")],
  ["the PDF omits the analyst line", "lib/desk/reportPdf.js", s => s.replace('if (line) { row("Tier", line);', "if (false) { row(\"Tier\", line);")],
  ["the email omits the mark", "lib/desk/sheetActions.js", s => s.replace(' markNote(sheet.final.mark) || ""', ' ""')],
  ["the engine read carries a mark", "lib/sheetRead.js", s => s.replace("  out.condition.carEvidence =", "  out.condition.mark = { mark: \"plus\" };\n  out.condition.carEvidence =")],
  ["the sheet view loses the ladder", "lib/desk/sheetActions.js", s => s.replace("ladder: { tiers: Object.keys(TIER_LADDER)", "ladderX: { tiers: Object.keys(TIER_LADDER)")],
  ["the half hint is lost", "lib/sheetRead.js", s => s.replace('return p < lo ? "lower" : p > hi ? "upper" : null;', "return null;")]
];
function copyTree(dst) {
  for (const d of ["lib", "scripts", "public", "api", "data", "docs"]) if (fs.existsSync(path.join(ROOT, d))) fs.cpSync(path.join(ROOT, d), path.join(dst, d), { recursive: true, filter: s => !/node_modules|proofs/.test(s) });
  for (const f of ["package.json", "vercel.json"]) if (fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(dst, f));
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dst, "node_modules"));
}
const run = dir => { try { const o = execFileSync("node", ["scripts/tierMarkCheck.mjs", dir], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 110000 }); return { red: false, out: o }; } catch (e) { return { red: true, out: String(e.stdout || "") + String(e.stderr || "") }; } };
let bad = 0;
const base = fs.mkdtempSync(path.join(os.tmpdir(), "tmk-")); copyTree(base);
const b0 = run(base); console.log((b0.red ? "FAIL" : "ok  ") + "  the real tree is green"); if (b0.red) { bad++; console.log(b0.out.split("\n").slice(-6).join("\n")); }
for (const [name, file, fn] of MUT) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tmk-")); copyTree(dir);
  const p = path.join(dir, file), before = fs.readFileSync(p, "utf8"), after = fn(before);
  if (after === before) { console.log("FAIL  mutation did not apply: " + name); bad++; continue; }
  fs.writeFileSync(p, after); const r = run(dir);
  console.log((r.red ? "ok  " : "FAIL") + "  without the fix, the check goes red: " + name + (r.red ? "  (" + (r.out.split("\n").find(l => /^FAIL/.test(l)) || r.out.split("\n").filter(Boolean).slice(-1)[0] || "").slice(0, 90) + ")" : ""));
  if (!r.red) bad++;
  fs.rmSync(dir, { recursive: true, force: true });
}
fs.rmSync(base, { recursive: true, force: true });
console.log(`tierMarkFailsWithout: ${bad ? bad + " PROBLEM" : "every mutation is caught"}`); process.exit(bad ? 1 : 0);
