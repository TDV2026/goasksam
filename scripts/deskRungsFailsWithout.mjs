// Each mutation undoes one rule of the rung read on a scratch copy; scripts/deskRungsCheck.mjs must go red on every one.
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { execFileSync } from "node:child_process"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const RG = "lib/desk/rungs.js", API = "api/usageDashboard.js";
const MUT = [
  [RG, "an unread rung does not say why", s => s.replace("read: false, why, ", "read: false, ")],
  [API, "deskcars returns a photo that did not pass the photo rule", s => s.replace("const photo = await choosePhoto(photoCandidates({ photo_url: r.image }));", "const photo = r.image;")],
  [API, "deskcars is unbounded", s => s.replace("&order=sale_date.desc&limit=40`", "&order=sale_date.desc`")],
  [API, "deskcars writes a record", s => s.replace("const out = []; for (const r of rows || []) { if (out.length >= limit) break;", "await supabaseInsert(env, \"app_usage_events\", [{}]); const out = []; for (const r of rows || []) { if (out.length >= limit) break;")],
  [RG, "a rung under five sales is reported with a range", s => s.replace("range: e.insufficient ? null : {", "range: {")],
  [RG, "an unread rung is reported as zero sales", s => s.replace("read: false, why, ", "read: false, count: 0, why, ")],
  [RG, "an unknown tier is asked of the engine", s => s.replace(".filter(t => RUNG_TIERS.includes(Number(t)))", "")],
  [RG, "the untiered read is not asked", s => s.replace("const out = [await shape(null)];", "const out = [];")],
  [RG, "the sentence of a thin rung is dropped", s => s.replace("sentence: e.insufficient ? e.sentence : null", "sentence: null")],
  [RG, "the whole engine answer is returned even when not asked for", s => s.replace("...(full ? { answer: r } : {})", "answer: r")],
  [RG, "full returns a shortened answer, not the engine's own", s => s.replace("...(full ? { answer: r } : {})", "...(full ? { answer: { desk: { evidence: { count: 0 } } } } : {})")],
  [API, "the ops task writes a record", s => s.replace("const d = await rungsOf(input => sheetRead(env, input),", "await supabaseInsert(env, \"app_usage_events\", [{}]); const d = await rungsOf(input => sheetRead(env, input),")]
];
function copyTree(dst) {
  for (const d of ["lib", "scripts", "public", "api", "data", "docs"]) if (fs.existsSync(path.join(ROOT, d))) fs.cpSync(path.join(ROOT, d), path.join(dst, d), { recursive: true, filter: s => !/node_modules|proofs/.test(s) });
  for (const f of ["package.json", "vercel.json"]) if (fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(dst, f));
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dst, "node_modules"));
}
let bad = 0;
for (const [i, [file, name, fn]] of MUT.map((m, i) => [i, [m[0], m[1], m[2]]])) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rg-")); copyTree(dir);
  const p = path.join(dir, file), before = fs.readFileSync(p, "utf8"), after = fn(before);
  if (after === before) { console.log("FAIL  mutation did not apply: " + name); bad++; }
  else { fs.writeFileSync(p, after); let red = false; try { execFileSync("node", ["scripts/deskRungsCheck.mjs", dir], { cwd: dir, stdio: "pipe", timeout: 120000 }); } catch { red = true; }
    console.log((red ? "ok  " : "FAIL") + `  [${i}] deskRungsCheck goes red without the rule: ` + name); if (!red) bad++; }
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`deskRungsFailsWithout: ${bad ? bad + " PROBLEM" : "every mutation is caught"}`); process.exit(bad ? 1 : 0);
