// MUTANTS for scripts/cardQueryReadBackCheck.mjs (Lane B, Nov 5 2026): copy the tree, break ONE rule, require a FAIL line. A survivor means the check does not cover that rule.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const F = "lib/live/search.js";
const M = [
  ["the card path no longer asks the read-back", F, "mk.query = await readBackQuery(env, spec, mk.query);", ""],
  ["the read-back returns the resolved words", F, "if (!spec || !spec.key || !query || spec.refine) return query;", "return query;"],
  ["the listing's own words are not tried", F, "for (const t of [query, String(spec.title || \"\").trim()])", "for (const t of [query])"],
  ["any text counts as reading back", F, "return !!sp && sp.key === spec.key; };", "return !!sp; };"],
  ["a narrowed spec is rewritten too", F, "if (!spec || !spec.key || !query || spec.refine) return query;", "if (!spec || !spec.key || !query) return query;"],
  ["a question nothing reads back becomes empty", F, "const out = got || query;", "const out = got || \"\";"],
  ["the live sample asks the listing title again", "scripts/buyEngineMatch.mjs", "const askOf = c => (c.market && c.market.query) ||", "const askOf = c => (null) ||"]
];
let survived = 0;
for (const [name, file, from, to] of M) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cqrb-"));
  try {
    execFileSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", ROOT + "/", dir + "/"]);
    fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"));
    const f = path.join(dir, file); let s = fs.readFileSync(f, "utf8");
    if (!s.includes(from)) { console.log(`ERROR  mutant "${name}": text not found in ${file}`); survived++; continue; }
    fs.writeFileSync(f, s.replace(from, to));
    const r = spawnSync("node", [path.join(dir, "scripts/cardQueryReadBackCheck.mjs"), dir], { encoding: "utf8" });
    const killed = /^FAIL /m.test(r.stdout || "") || r.status !== 0;
    if (!killed) survived++;
    console.log(`${killed ? "KILLED  " : "SURVIVED"} ${name}`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
console.log(survived ? `\n${survived} SURVIVED` : `\nall ${M.length} mutants killed`);
process.exit(survived ? 1 : 0);
