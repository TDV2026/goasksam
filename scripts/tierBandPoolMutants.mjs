// MUTANTS for scripts/tierBandPoolCheck.mjs (Lane B, Nov 5 2026): copy the tree, break ONE rule of the band pool, require a FAIL line from the check. A survivor means the check does not cover that rule.
//   node scripts/tierBandPoolMutants.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const M = [
  ["the pool is the raw model value again (ct2)", "lib/tierPool.js", `return gen\n    ? {`, `return false ? {`, null, `const family = deskModelFamily(`, `const family = null && deskModelFamily(`],
  ["no generation narrowing: the whole family is one pool", "lib/tierPool.js", `gen = hits[0] || null;`, `gen = null;`],
  ["the read ignores the generation's years", "lib/tierPool.js", `return p.code ? \`\${base}&year=gte.\${p.yearStart}&year=lte.\${p.yearEnd}\` : base;`, `return base;`],
  ["the read is by raw model, not by family", "lib/tierPool.js", `const base = \`make=eq.\${q(p.make)}&model_family=eq.\${q(p.family)}\`;`, `const base = \`make=eq.\${q(p.make)}&model=eq.\${q(p.model || p.family)}\`;`],
  ["the key keeps the raw model value", "lib/tierPool.js", `{ key: \`\${make}|\${family}|\${gen.code}\``, `{ key: \`\${make}|\${r.model}|\${gen.code}\``],
  ["a year no generation covers gets its own pool per year", "lib/tierPool.js", `: { key: \`\${make}|\${family}|*\`, make, family };`, `: { key: \`\${make}|\${family}|*\${y}\`, make, family };`],
  ["the job reads quartiles by the raw model", "scripts/assignConditionTier.mjs", `sales_archive?\${poolFilter(pool, q)}&mileage_text`, `sales_archive?make=eq.\${q(r.make)}&model=eq.\${q(r.model)}&mileage_text`],
  ["the job memoises by the raw model", "scripts/assignConditionTier.mjs", `const keyOf = poolKeyOf;`, `const keyOf = r => \`\${r.make}|\${r.model}\`;`],
  ["the version is still ct2", "lib/conditionTier.js", `"ct3-20261105"`, `"ct2-20261105"`]
];
let survived = 0;
for (const [name, file, from, to, , from2, to2] of M) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tbpm-"));
  try {
    execFileSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", ROOT + "/", dir + "/"]);
    fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"));
    const f = path.join(dir, file); let s = fs.readFileSync(f, "utf8");
    if (!s.includes(from)) { console.log(`ERROR  mutant "${name}": text not found in ${file}`); survived++; continue; }
    s = s.replace(from, to); if (from2) s = s.replace(from2, to2); fs.writeFileSync(f, s);
    const r = spawnSync("node", [path.join(dir, "scripts/tierBandPoolCheck.mjs"), dir], { encoding: "utf8" });
    const killed = /^FAIL /m.test(r.stdout || "") || r.status !== 0;
    if (!killed) survived++;
    console.log(`${killed ? "KILLED  " : "SURVIVED"} ${name}`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
console.log(survived ? `\n${survived} SURVIVED` : `\nall ${M.length} mutants killed`);
process.exit(survived ? 1 : 0);
