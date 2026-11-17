// Each guard of the value census removed in turn; valueCensusCheck must go red on every one (Lane D, Nov 17 2026).
import fs from "node:fs"; import { spawnSync } from "node:child_process";
const SRC = new URL("../lib/valueCensus.js", import.meta.url).pathname, TMP = new URL("../lib/_vcMutant.js", import.meta.url).pathname;
const src = fs.readFileSync(SRC, "utf8");
const OFF = 'export const assertCountsOnly = out => {';
const M = [
  ["no window required (dates optional)", s => s.replace('if (!DATE.test(from) || !DATE.test(to)) return { ok: false', 'if (false) return { ok: false')],
  ["no 366 day cap", s => s.replace('if (days(from, to) > MAX_WINDOW_DAYS)', 'if (false)')],
  ["no source required", s => s.replace('if (!/^[a-z0-9_]{2,40}$/.test(source)) return', 'if (false) return')],
  ["counts guard off and a description leaks into the counts", s => s.replace(OFF, OFF + ' return out;').replace('out.description = { null_count', 'out.leak = inn.map(r => descOf(t, r)); out.description = { null_count')],
  ["counts answer carries the seller name", s => s.replace(OFF, OFF + ' return out;').replace('out.total = inn.length;', 'out.total = inn.length; out.sellers = inn.map(r => raw(r).seller);')],
  ["sample mode allows eleven (limit)", s => s.replace('if (n > SAMPLE_MAX) return', 'if (false) return')],
  ["sample mode allows eleven ids", s => s.replace('if (ids.length > SAMPLE_MAX) return', 'if (false) return')],
  ["the 90 day rule is 400 days", s => s.replace("RELIST_DAYS = 90", "RELIST_DAYS = 400")],
  ["a title in both families counted in carrera", s => s.replace('return carrera && mezger ? "both"', 'return carrera && mezger ? "carrera"')],
  ["replicas not set aside", s => s.replace('for (const [k, re] of SETASIDE) if (re.test(title)) return k;', '')],
  ["the read selects a seller column", s => s.replace('const SOLD_COLS = "source_id,', 'const SOLD_COLS = "seller_name,source_id,')]
];
let missed = 0;
for (const [name, f] of M) {
  const m = f(src);
  if (m === src) { console.log("MUTANT DID NOT APPLY:", name); missed++; continue; }
  fs.writeFileSync(TMP, m);
  const r = spawnSync("node", ["scripts/valueCensusCheck.mjs"], { env: { ...process.env, VC_LIB: TMP }, encoding: "utf8", cwd: new URL("..", import.meta.url).pathname });
  const red = r.status !== 0;
  console.log(red ? "caught  " : "SURVIVED", "-", name);
  if (!red) missed++;
}
fs.rmSync(TMP, { force: true });
console.log(missed ? missed + " mutant(s) not caught" : "all " + M.length + " mutants caught");
process.exit(missed ? 1 : 0);
