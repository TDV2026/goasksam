// Each mutation undoes one rule of the case record on a scratch copy; scripts/deskCaseCheck.mjs must go red on every one.
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { execFileSync } from "node:child_process"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const MUT = [
  ["a conflict between sources is not recorded", "lib/desk/caseModel.js", s => s.replace('f.source = "conflicting"; f.verified = false;', 'f.verified = false;')],
  ["a field asked once is asked again", "lib/desk/caseModel.js", s => s.replace("c.fields[k].value == null && !c.asked.includes(k)", "c.fields[k].value == null")],
  ["a second ask is recorded twice", "lib/desk/caseModel.js", s => s.replace('!c.asked.includes(k));\n  c.asked.push', 'true);\n  c.asked.push').replace("ks = (keys || []).filter(k => FIELD_KEYS.includes(k) && !c.asked.includes(k))", "ks = (keys || []).filter(k => FIELD_KEYS.includes(k))")],
  ["the first photo is not the cover", "lib/desk/caseModel.js", s => s.replace("if (!c.photos.coverId) c.photos.coverId = String(photo.id);", "")],
  ["a waived item needs no reason", "lib/desk/caseModel.js", s => s.replace('if (state === "waived" && !str(reason).trim()) throw new Error("waiving an item needs a reason");', "")],
  ["an exclusion needs no reason", "lib/desk/caseModel.js", s => s.replace('if (!str(reason).trim()) throw new Error("an exclusion needs a reason");', "")],
  ["a repeated photo is added again", "lib/desk/caseModel.js", s => s.replace("if (c.photos.items.some(p => p.id === photo.id)) return c;", "")],
  ["the input case is changed in place", "lib/desk/caseModel.js", s => s.replace("const clone = x => structuredClone(x);", "const clone = x => x;")],
  ["an older sheet gets no case from its submission", "lib/desk/caseModel.js", s => s.replace('if (sub.mileage) c = setField(c, "mileage"', 'if (false) c = setField(c, "mileage"')],
  ["case_new with no lead data is refused", "lib/desk/sheetActions.js", s => s.replace('const v = body.vehicle && typeof body.vehicle === "object" ? body.vehicle : {};', 'const v = body.vehicle && typeof body.vehicle === "object" ? body.vehicle : {}; if (!v.vin) return refuse("Type a VIN.");')]
];
function copyTree(dst) { for (const d of ["lib", "scripts", "public", "api", "data", "docs"]) if (fs.existsSync(path.join(ROOT, d))) fs.cpSync(path.join(ROOT, d), path.join(dst, d), { recursive: true, filter: s => !/node_modules|proofs/.test(s) }); for (const f of ["package.json", "vercel.json"]) if (fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(dst, f)); fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dst, "node_modules")); }
const run = dir => { try { execFileSync("node", ["scripts/deskCaseCheck.mjs", dir], { cwd: dir, stdio: "pipe", timeout: 120000 }); return false; } catch { return true; } };
let bad = 0;
for (const [i, [name, file, fn]] of MUT.entries()) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dc-")); copyTree(dir);
  const p = path.join(dir, file), before = fs.readFileSync(p, "utf8"), after = fn(before);
  if (after === before) { console.log("FAIL  mutation did not apply: " + name); bad++; } else { fs.writeFileSync(p, after); const red = run(dir); console.log((red ? "ok  " : "FAIL") + `  [${i}] without the rule, the check goes red: ` + name); if (!red) bad++; }
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`deskCaseFailsWithout: ${bad ? bad + " PROBLEM" : "every mutation is caught"}`); process.exit(bad ? 1 : 0);
