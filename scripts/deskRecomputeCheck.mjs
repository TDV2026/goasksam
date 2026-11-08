// clock: real-ok the fixture sales are dated relative to now (days ago); no calendar date is asserted (Lane B, Nov 2026)
// DESK V3 STAGE 5, RECOMPUTE WITHOUT EXCLUDED SALES (Lane B, Nov 8 2026). desk.excludedIds with desk.exclusionScope { id: report_comps | market_calc | note_only }:
//   (1) desk.original is always the evidence block read with nothing excluded, and is unchanged by any exclusion
//   (2) note_only changes nothing (only the echo in desk.excluded)
//   (3) report_comps changes the comparables list only
//   (4) market_calc changes the market figures (evidence, quarters, factors, the outside sentence) and not the comparables
//   (5) nothing is written to a sales record (no request but a read)
//   node scripts/deskRecomputeCheck.mjs [root]     --mutants proves each rule by breaking it in a copy
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { fileURLToPath, pathToFileURL } from "node:url"; import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), rootArg = args.find(a => !a.startsWith("--")), ROOT = path.resolve(rootArg || path.join(here, ".."));
if (args.includes("--mutants")) {
  const DV = "lib/deskV3.js";
  const muts = [
    [DV, "calc = new Set(ex.filter(e => e.scope === \"market_calc\").map(e => e.id))", "calc = new Set()", "market_calc changes nothing"],
    [DV, "scope: SCOPES.includes(scopes[id]) ? scopes[id] : \"note_only\"", "scope: SCOPES.includes(scopes[id]) ? scopes[id] : \"market_calc\"", "an unknown scope leaves the market calculation"],
    [DV, "const original = evidenceOf(rows.filter(r => r.inPopulation !== false), rows, desk, env);", "const original = evidenceOf(rows.filter(r => r.inPopulation !== false && !new Set((desk.excludedIds || []).map(String)).has(String(r.id))), rows, desk, env);", "the original follows the exclusions"],
    [DV, "const comparables = await comparablesOf(rows.filter(r => !rep.has(String(r.id))), sub, desk.head || null);", "const comparables = await comparablesOf(rows.filter(r => !rep.has(String(r.id)) && !calc.has(String(r.id))), sub, desk.head || null);", "market_calc also leaves the comparables"],
    [DV, "const rowsCalc = rows.filter(r => !calc.has(String(r.id))), pop", "const rowsCalc = rows.filter(r => !calc.has(String(r.id)) && !rep.has(String(r.id))), pop", "report_comps also leaves the market calculation"],
    [DV, "rep = new Set(ex.filter(e => e.scope === \"report_comps\").map(e => e.id));", "rep = new Set(ex.filter(e => e.scope !== \"market_calc\").map(e => e.id));", "note_only also leaves the report comparables"],
    [DV, "const evidence = calc.size ? evidenceOf(pop, rowsCalc, desk, env) : original;", "const evidence = calc.size ? evidenceOf(pop, rowsCalc, desk, env) : { ...original, count: original.count };\n  original.count = evidence.count;", "the original is overwritten by the recompute"],
    [DV, "const quarters = quartersOf(pop, env), kase", "const quarters = quartersOf(rows.filter(r => r.inPopulation !== false), env), kase", "the quarters ignore market_calc"]
  ];
  let survivors = 0;
  for (const [file, from, to, want] of muts) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "drc-"));
    spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", ROOT + "/", dir + "/"]); fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"));
    const fp = path.join(dir, file), src = fs.readFileSync(fp, "utf8"), m = src.replace(from, to);
    if (m === src) { console.log("MUTANT NOT APPLIED  " + want); survivors++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
    fs.writeFileSync(fp, m);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/deskRecomputeCheck.mjs"), dir], { encoding: "utf8" }), killed = r.status !== 0;
    console.log((killed ? "killed  " : "SURVIVED") + "  " + want); if (!killed) survivors++;
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(survivors ? "\n" + survivors + " mutant(s) survived" : "\nall mutants killed"); process.exit(survivors ? 1 : 0);
}
process.chdir(ROOT);
let failed = 0, n = 0; const ok = (name, c, d) => { n++; if (!c) failed++; console.log((c ? "PASS" : "FAIL") + "  " + name + (d ? "  " + d : "")); };
const W = await import(pathToFileURL(path.join(ROOT, "scripts/_deskV3World.mjs")).href);
const S = await import(pathToFileURL(path.join(ROOT, "lib/sheetRead.js")).href);
console.error = () => {};
const today = new Date().toISOString().slice(0, 10);
const w = W.install(); const baseFetch = globalThis.fetch; const writes = []; globalThis.fetch = async (url, init) => { if (init && init.method && init.method !== "GET") writes.push(init.method + " " + String(url)); return baseFetch(url, init); };
const c0 = W.CASES[0], head = async () => ({ status: 200, bytes: 50000, type: "image/jpeg" });
const read = o => S.sheetRead(w.env, { year: c0.year, make: c0.make, model: c0.model, mileage: 61400, desk: { caseDate: today, transmission: "Manual", head, ...o } }, w.deps);
const J = x => JSON.stringify(x), strip = d => { const { excluded, ...rest } = d; return rest; };
const base = (await read({})).desk;
const inPop = base.comparables.filter(c => c.inPopulation), ids = inPop.slice(0, 3).map(c => c.id), outId = base.comparables.find(c => !c.inPopulation).id;
ok("with nothing excluded, original equals evidence and excluded is empty", J(base.original) === J(base.evidence) && base.excluded.length === 0);
// (2) note_only
{ const d = (await read({ excludedIds: ids, exclusionScope: Object.fromEntries(ids.map(i => [i, "note_only"])) })).desk;
  ok("note_only: every field is unchanged, only the echo differs", J(strip(d)) === J(strip(base)) && d.excluded.length === 3 && d.excluded.every(e => e.scope === "note_only" && e.found)); }
// (3) report_comps
{ const d = (await read({ excludedIds: ids, exclusionScope: Object.fromEntries(ids.map(i => [i, "report_comps"])) })).desk;
  ok("report_comps: the sales leave the comparables", ids.every(i => !d.comparables.some(c => c.id === i)) && d.comparables.length === base.comparables.length - 3);
  ok("report_comps: the evidence, original, quarters, factors, outside, condition are unchanged", J({ ...strip(d), comparables: 0 }) === J({ ...strip(base), comparables: 0 }));
  ok("report_comps: the rest of the comparables are the same, in the same order", J(d.comparables) === J(base.comparables.filter(c => !ids.includes(c.id)))); }
// (4) market_calc
{ const d = (await read({ excludedIds: ids, exclusionScope: Object.fromEntries(ids.map(i => [i, "market_calc"])) })).desk;
  ok("market_calc: the evidence count drops by the excluded sales", d.evidence.count === base.evidence.count - 3 && d.evidence.matching === base.evidence.matching - 3, `${d.evidence.count} vs ${base.evidence.count}`);
  const left = inPop.filter(c => !ids.includes(c.id)).map(c => c.price).sort((a, b) => a - b), q = (s, p) => { const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return Math.round(s[lo] + (s[hi] - s[lo]) * (i - lo)); };
  ok("market_calc: the median, q1 and q3 are those of the sales left", d.evidence.median === q(left, 0.5) && d.evidence.q1 === q(left, 0.25) && d.evidence.q3 === q(left, 0.75));
  ok("market_calc: the original is the untouched evidence", J(d.original) === J(base.original) && J(d.original) === J(base.evidence));
  ok("market_calc: the comparables are unchanged, the excluded sales still listed", J(d.comparables) === J(base.comparables));
  ok("market_calc: the quarters add up to the evidence count", d.quarters.reduce((a, q2) => a + q2.count, 0) <= d.evidence.count && d.quarters.reduce((a, q2) => a + q2.count, 0) < base.quarters.reduce((a, q2) => a + q2.count, 0));
  const sh = await read({ excludedIds: ids, exclusionScope: Object.fromEntries(ids.map(i => [i, "market_calc"])) });
  ok("market_calc: the sheet's meter is the recomputed evidence", sh.market.meter && sh.market.meter.count === sh.desk.evidence.count && sh.market.meter.median === sh.desk.evidence.median); }
// Lane D's case record shape: exclusions [{ saleId, scope, reason, at }]
{ const d = (await read({ exclusions: ids.map((i, k) => ({ saleId: i, scope: k === 0 ? "market_calc" : "report_comps", reason: "x", at: "2026-11-08" })) })).desk;
  ok("Lane D's exclusions [{ saleId, scope }] are read: one leaves the calculation, two leave the report", d.evidence.count === base.evidence.count - 1 && ids.slice(1).every(i => !d.comparables.some(c => c.id === i)) && d.excluded.length === 3 && J(d.original) === J(base.original)); }
// mixed scopes, unknown scope, unknown id
{ const sc = { [ids[0]]: "market_calc", [ids[1]]: "report_comps", [ids[2]]: "note_only" }, d = (await read({ excludedIds: ids, exclusionScope: sc })).desk;
  ok("mixed scopes: one leaves the calculation, one the report, one nothing", d.evidence.count === base.evidence.count - 1 && !d.comparables.some(c => c.id === ids[1]) && d.comparables.some(c => c.id === ids[0]) && d.comparables.some(c => c.id === ids[2]));
  const u = (await read({ excludedIds: [ids[0], "no-such-sale"], exclusionScope: { [ids[0]]: "banana", "no-such-sale": "market_calc" } })).desk;
  ok("an unknown scope reads as note_only; an unknown id changes nothing and is echoed as not found", J(strip(u)) === J(strip(base)) && u.excluded.find(e => e.id === ids[0]).scope === "note_only" && u.excluded.find(e => e.id === "no-such-sale").found === false);
  const o = (await read({ excludedIds: [outId], exclusionScope: { [outId]: "market_calc" } })).desk;
  ok("a sale outside the population excluded from the calculation changes no evidence figure", J(o.evidence) === J(base.evidence) || (o.evidence.count === base.evidence.count && o.evidence.median === base.evidence.median)); }
{ const all = inPop.map(c => c.id), d = (await read({ excludedIds: all, exclusionScope: Object.fromEntries(all.map(i => [i, "market_calc"])) })).desk;
  ok("excluding the whole population leaves insufficient evidence with no number, and the original keeps its figures", d.evidence.insufficient && d.evidence.median === null && !d.original.insufficient && d.original.median > 0); }
// (5)
ok("nothing is written to a sales record: every request was a read", writes.length === 0, writes.slice(0, 2).join(" | "));
console.log("\ndeskRecomputeCheck: " + (n - failed) + " pass, " + failed + " FAIL"); process.exit(failed ? 1 : 0);
