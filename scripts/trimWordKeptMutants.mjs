// MUTANTS for scripts/trimWordKeptCheck.mjs (Lane B, Nov 5 2026): copy the tree, break ONE rule, require a FAIL line. A survivor means the check does not cover that rule.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const M = [
  ["Autobiography is not a trim word", "lib/vehicleData.js", "autobiography: /^(?:land rover|range rover|jaguar)$/i, ", ""],
  ["HSE is not a trim word", "lib/vehicleData.js", "hse: /^land rover$/i, ", ""],
  ["Maybach is not a trim word", "lib/vehicleData.js", "maybach: /^(?:mercedes-benz|mercedes|maybach)$/i, ", ""],
  ["Trackhawk is not a trim word", "lib/vehicleData.js", "trackhawk: /^jeep$/i, ", ""],
  ["Speed is not a Bentley trim", "lib/vehicleData.js", ", speed: /^bentley$/i", ""],
  ["a scoped word is a trim on any make (Speed in Mustang GT 5-Speed)", "lib/vehicle.js", "return !!make && MAKE_SCOPED_TRIM_WORDS[clean].test(String(make).trim());", "return true;"],
  ["the make is not passed to the trim gate", "lib/vehicle.js", "trimTokenAllowed(token, make, tokens[i - 1]) || displacementSuffix", "trimTokenAllowed(token, \"Bentley\", tokens[i - 1]) || displacementSuffix"],
  ["Tasks' trim gate ignores the make", "lib/tasks/tasks.js", "trimTokenAllowed(w, p.make, tokens[i - 1])", "trimTokenAllowed(w)"],
  ["a hyphenated make word is named unused again", "lib/live/unusedWords.js", 'if (w.includes("-") && w.split("-").filter(Boolean).length > 1 &&', 'if (false &&'],
  ["the sentence does not count the trim", "lib/onebox.js", "trimThinSentence(spec.trim, trimCarsIn(solid, spec.trim), solid.length)) || chosen.widening", "null) || chosen.widening"],
  ["the count ignores the titles", "lib/onebox.js", "return (rows || []).filter(r => { const t = String((r && (r.raw_title || r.rtitle || r.title)) || \"\").toLowerCase();", "return (rows || []).filter(r => { const t = \"autobiography\";"],
  ["no Narrow by pill", "lib/onebox.js", "export function pooledApartGuard(d, refine) { return withTrimPill(pooledApartGuardRead(d, refine)); }", "export function pooledApartGuard(d, refine) { return pooledApartGuardRead(d, refine); }"],
  ["the pill claims a trim with no sale in the pool", "lib/onebox.js", "if (!(n > 0)) return d;", ""]
];
let survived = 0;
for (const [name, file, from, to] of M) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "twk-"));
  try {
    execFileSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", ROOT + "/", dir + "/"]);
    fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"));
    const f = path.join(dir, file); let s = fs.readFileSync(f, "utf8");
    if (!s.includes(from)) { console.log(`ERROR  mutant "${name}": text not found in ${file}`); survived++; continue; }
    fs.writeFileSync(f, s.replace(from, to));
    const r = spawnSync("node", [path.join(dir, "scripts/trimWordKeptCheck.mjs"), dir], { encoding: "utf8" });
    const killed = /^FAIL /m.test(r.stdout || "") || r.status !== 0;
    if (!killed) survived++;
    console.log(`${killed ? "KILLED  " : "SURVIVED"} ${name}`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
console.log(survived ? `\n${survived} SURVIVED` : `\nall ${M.length} mutants killed`);
process.exit(survived ? 1 : 0);
