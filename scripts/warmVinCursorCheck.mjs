// clock: real-ok no dates (Lane B, Nov 10 2026)
// WARM VIN CURSOR CHECK. Cause: ops task=warmVin started at VIN 0 on every call, and a VIN found fresh counted against the call's limit, so Lane C's loop re-read the same fresh prefix and stalled near 700 of 11,185.
// Class: any ops task that walks a list in calls (a loop of calls must make progress): the pass takes a cursor, answers the next one, and a fresh VIN costs nothing against the limit.
//   (1) a loop of calls that passes each answer's `next` as `after` handles every VIN exactly once (never the same VIN twice across calls), ends with next null and notReached 0
//   (2) a fresh prefix longer than the limit does not stall the walk: the first call passes it and still does `limit` VINs of work
//   (3) two calls in a row never share a VIN; a cursor that is not in the list is refused with a line, not restarted at 0
//   (4) the ops task reads &after= and answers through warmVinPass (the same function this check runs)
// MUTANTS (each must fail): the cursor is ignored (every call starts at 0); a fresh VIN counts against the limit; next is always the first VIN; the ops task does not pass after.
//   node scripts/warmVinCursorCheck.mjs --mutants
import fs from "node:fs"; import path from "node:path"; import { pathToFileURL } from "node:url";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
let seq = 0;
async function load(rw) { const f = path.join(ROOT, `lib/__wvmut${++seq}.js`); let s = fs.readFileSync(path.join(ROOT, "lib/warmVinPass.js"), "utf8"); if (rw) { if (!s.includes(rw[0])) throw new Error("mutant target missing"); s = s.replace(rw[0], rw[1]); } fs.writeFileSync(f, s); try { return await import(pathToFileURL(f).href); } finally { fs.rmSync(f, { force: true }); } }
export async function findings(mut = {}) {
  const fails = [], { warmVinPass } = await load(mut.pass), VINS = Array.from({ length: 41 }, (_, i) => "VIN" + String(i).padStart(3, "0")), FRESH = new Set(VINS.slice(0, 12));
  const run = async (opts) => { const log = []; const warm = async v => { log.push(v); return { state: FRESH.has(v) || log.indexOf(v) < log.length - 1 ? "fresh" : "stored" }; }; const seen = new Set(); const warm2 = async v => { const again = seen.has(v); seen.add(v); log.push(v); return { state: FRESH.has(v) || again ? "fresh" : "stored" }; }; void warm; const out = await warmVinPass(VINS, { ...opts, warm: warm2 }); return { out, log }; };
  // (1) a loop of calls
  const all = []; let after = null, calls = 0, last = null;
  for (; calls < 30; calls++) { const { out, log } = await run({ after, limit: 5, width: 2 }); all.push(...log); last = out; if (out.next == null) break; if (out.next === after) { fails.push("(1) the cursor did not move between calls"); break; } after = out.next; }
  const dup = all.filter((v, i) => all.indexOf(v) !== i);
  if (dup.length) fails.push(`(1) ${dup.length} VIN(s) handled twice across calls, first ${dup[0]}`);
  if (all.length !== VINS.length) fails.push(`(1) ${all.length} of ${VINS.length} VINs handled`);
  if (!last || last.next != null || last.notReached !== 0) fails.push(`(1) the last call answers next ${last && last.next}, notReached ${last && last.notReached}`);
  // (2) the fresh prefix (12) is longer than the limit (5)
  const a = await run({ limit: 5, width: 1 });
  if (!(a.out.stored === 5 && a.out.fresh === 12 && a.out.handled === 17)) fails.push(`(2) first call: stored ${a.out.stored}, fresh ${a.out.fresh}, handled ${a.out.handled}; expected 5, 12 and 17 (a fresh VIN costs nothing against the limit)`);
  // (3) two calls in a row share no VIN, a stray cursor is refused
  const b = await run({ after: a.out.next, limit: 5, width: 1 }); const shared = b.log.filter(v => a.log.includes(v));
  if (shared.length) fails.push(`(3) two calls in a row both handled ${shared.slice(0, 3).join(", ")}`);
  const bad = await run({ after: "NOPE", limit: 5 });
  if (!(bad.out.error && bad.out.handled === 0 && bad.log.length === 0)) fails.push("(3) a cursor not in the list was not refused");
  if (!(a.out.listed === 41 && typeof a.out.notReached === "number" && "next" in a.out && "fresh" in a.out && "handled" in a.out)) fails.push("(3) the answer lacks listed, handled, fresh, notReached or next");
  // (4) the ops task
  let ops = fs.readFileSync(path.join(ROOT, "api/usageDashboard.js"), "utf8"); if (mut.ops) ops = mut.ops(ops);
  const blk = ops.slice(ops.indexOf('task === "warmVin"'), ops.indexOf('task === "warmLive"'));
  if (!/warmVinPass\(/.test(blk)) fails.push("(4) the ops task does not answer through warmVinPass");
  if (!/after:\s*req\.query\?\.after/.test(blk)) fails.push("(4) the ops task does not pass &after= to the pass");
  return fails;
}
if (process.argv[1] && process.argv[1].endsWith("warmVinCursorCheck.mjs")) {
  const MUTS = [
    ["the cursor is ignored (every call starts at 0)", { pass: ["qi = at + 1;", "qi = 0;"] }],
    ["a fresh VIN counts against the limit", { pass: ['if (r.state === "fresh") out.fresh++; else { out.asked++;', 'out.asked++; if (r.state === "fresh") out.fresh++; else {'] }],
    ["next is always the first VIN", { pass: ["out.next = qi >= list.length ? null : qi > 0 ? list[qi - 1] : null;", "out.next = qi >= list.length ? null : list[0];"] }],
    ["the ops task does not pass after", { ops: s => s.replace("after: req.query?.after ? String(req.query.after) : null, limit", "after: null, limit") }]
  ];
  const base = await findings(); for (const f of base) console.log("FAIL  " + f);
  console.log(`${base.length ? "FAIL" : "PASS"}  a loop of warmVin calls handles each VIN once, a fresh VIN costs no limit, the cursor moves`);
  let surv = 0;
  if (process.argv.includes("--mutants")) for (const [n, m] of MUTS) { let f; try { f = await findings(m); } catch (e) { f = ["threw " + e.message]; } console.log(`${f.length ? "killed  " : "SURVIVED"}  ${n}`); if (!f.length) surv++; }
  console.log(`\nwarmVinCursorCheck: ${base.length ? base.length + " FAIL" : "all pass"}${process.argv.includes("--mutants") ? (surv ? `, ${surv} mutant(s) survived` : ", all mutants killed") : ""}`);
  process.exit(base.length || surv ? 1 : 0);
}
