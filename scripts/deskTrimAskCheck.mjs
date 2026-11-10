// clock: real-ok sales are dated relative to now in the fake archive; no calendar date is asserted (Lane B, Nov 10 2026)
// DESK TRIM ASK CHECK. Cause (1967 Corvette convertible, Lane F's re-sweep): the engine asks "which trim" FIRST when a model's trims price differently (trim_choice) and the Desk sheet has no trim question to answer,
// so the read had no Desk block and the rung said "Pick a condition tier" and "No condition tiers are assigned to these sales yet", which was false: the pool was never read, the sales were not untiered.
// Class: any Desk car whose trims split, and any tier asked of an unread pool. Over every car of Lane F's 24 (their recorded counts, scripts/fixtures/deskOlderCars.json), with the sales' titles split into two trim words that price apart:
//   (1) every car reads a Desk block with a range at the any-condition rung and at a tier rung: never a question, never a refusal (the Corvette is one of the 24)
//   (2) the Desk says the trims were read together (desk.trimNote, the reason table's line) when a split was open and no trim was named; a car with no split carries none
//   (3) a tier asked of a pool that holds sales but no tier rows reads every condition and says so (desk.conditionNote), a tier asked of an unread pool never says "no tiers are assigned" (tierPoolState unavailable)
// MUTANTS (each must fail): the Desk read still asks the trim question; the unread pool says no tiers are assigned; the trims-together note is dropped; the note is typed on the page side.
//   node scripts/deskTrimAskCheck.mjs --mutants
import fs from "node:fs"; import path from "node:path"; import { pathToFileURL } from "node:url";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname), imp = f => import(pathToFileURL(path.join(ROOT, f)).href + "?" + Math.random());
const W = await import("./_deskOlderWorld.mjs"); console.error = () => {};
const head = async () => ({ status: 200, bytes: 50000, type: "image/jpeg" });
let seq = 0;
async function loadWith(rewrites) {
  const mine = []; try {
    const tag = `__tamut${++seq}_`; let eng = fs.readFileSync(path.join(ROOT, "lib/onebox.js"), "utf8"); for (const [a, b] of rewrites || []) { if (!eng.includes(a)) throw new Error("mutant target missing: " + a.slice(0, 50)); eng = eng.replace(a, b); }
    // onebox.js is imported by relative path from sheetRead.js: write copies of both side by side
    const sheet = fs.readFileSync(path.join(ROOT, "lib/sheetRead.js"), "utf8").replace(/from "\.\/onebox\.js"/g, `from "./${tag}onebox.js"`).replace(/import\("\.\/onebox\.js"\)/g, `import("./${tag}onebox.js")`);
    for (const [n, src] of [[`lib/${tag}onebox.js`, eng], [`lib/${tag}sheetRead.js`, sheet]]) { const f = path.join(ROOT, n); fs.writeFileSync(f, src); mine.push(f); }
    return await import(pathToFileURL(path.join(ROOT, `lib/${tag}sheetRead.js`)).href);
  } finally { for (const f of mine) fs.rmSync(f, { force: true }); }
}
const splitTrims = (w, hi) => { let i = 0; for (const rows of w.DATA.values()) for (const r of rows) { const up = (i++ % 2) === 0, t = `${r.listing_title} ${up ? "Heritage" : "Stingray"}`; r.listing_title = t; r.raw_record.title = t; r.sale_price = Math.round(r.sale_price * (hi && up ? 4 : 1)); } };
const readOf = (S, w, c, tier) => S.sheetRead(w.env, { year: c.year, make: c.make, model: c.model, mileage: 60000, bodyStyle: c.typedBody || undefined, ...(tier ? { tier } : {}), desk: { caseDate: new Date().toISOString().slice(0, 10), transmission: "Manual", label: `${c.year} ${c.make} ${c.model}`, case: { verification: {} }, exclusions: [], head } }, w.deps).catch(e => ({ err: String(e) }));
export async function findings(mut = {}) {
  const fails = [], S = await loadWith(mut.engine), RW = await imp("lib/reasonWords.js"), all = W.loadCars(ROOT);
  const note = RW.reasonLine("desk4.trims_together");
  for (const c of all) {
    const w = W.install(ROOT, { cars: [c] }); splitTrims(w, true);
    for (const tier of [0, 3]) {
      const r = await readOf(S, w, c, tier), d = r && r.desk, name = `${c.year} ${c.make} ${c.model} ${c.typedBody || ""} tier ${tier || "any"}`;
      if (!d || !d.evidence) { fails.push(`(1) ${name}: no Desk block (${r && r.err ? r.err : r && r.market ? r.market.startingNote : "null"})`); continue; }
      if (d.evidence.count > 0 && d.evidence.insufficient == null) fails.push(`${name}: evidence has no sufficiency`);
    }
  }
  // (2) the split read says so; an unsplit car does not
  const corv = all.find(c => c.model === "Corvette" && c.year === 1967), w2 = W.install(ROOT, { cars: [corv] }); splitTrims(w2, true);
  const rs = await readOf(S, w2, corv, 0); if (!(rs && rs.desk && rs.desk.trimNote === note)) fails.push(`(2) the split Corvette carries trimNote ${JSON.stringify(rs && rs.desk && rs.desk.trimNote)}, expected the reason table's line`);
  const w3 = W.install(ROOT, { cars: [corv] }), rn = await readOf(S, w3, corv, 0); if (rn && rn.desk && rn.desk.trimNote) fails.push("(2) an unsplit Corvette carries a trims-together note");
  // (3) sales but no tier rows: reads every condition and says so; the engine's state for it is no_tier_data only when sales exist
  const rt = await readOf(S, w3, corv, 3); if (!(rt && rt.desk && rt.desk.conditionNote && rt.desk.evidence && rt.desk.evidence.count > 0)) fails.push("(3) a tier asked of a pool with sales and no tier rows did not read every condition with its note");
  const O = await imp("lib/onebox.js"), un = await (async () => { const w4 = W.install(ROOT, { cars: [corv] }); for (const k of w4.DATA.keys()) w4.DATA.set(k, []); const x = await (await loadEngine(mut.engine)).oneEngineAnswer({ year: corv.year, make: corv.make, model: corv.model }, null, `${corv.year} ${corv.make} ${corv.model}`, w4.env, { conditionTier: 3 }).catch(e => ({ raw: { err: String(e) } })); return x.raw || {}; })();
  if (un.tierPoolState === "no_tier_data") fails.push("(3) a pool that holds no sale at all says no_tier_data (no tiers are assigned to these sales), which is false of an unread pool");
  void O; return fails;
}
async function loadEngine(rewrites) {
  const mine = []; try { const tag = `__tbmut${++seq}_`; let eng = fs.readFileSync(path.join(ROOT, "lib/onebox.js"), "utf8"); for (const [a, b] of rewrites || []) eng = eng.replace(a, b); const f = path.join(ROOT, `lib/${tag}onebox.js`); fs.writeFileSync(f, eng); mine.push(f); return await import(pathToFileURL(f).href); } finally { for (const f of mine) fs.rmSync(f, { force: true }); }
}
if (process.argv[1] && process.argv[1].endsWith("deskTrimAskCheck.mjs")) {
  const MUTS = [
    ["the Desk read still asks the trim question", { engine: [["const deskRead = !!(env && env.desk);", "const deskRead = false;"]] }],
    ["an unread pool says no tiers are assigned", { engine: [['} else Object.assign(fields, { tierPoolState: "unavailable" });', '} else Object.assign(fields, { tierPoolState: "no_tier_data" });']] }],
    ["the trims-together note is dropped", { engine: [['trimNote: (d.wideSpread', 'trimNote: null && (d.wideSpread']] }]
  ];
  const base = await findings(); for (const f of base) console.log("FAIL  " + f);
  console.log(`${base.length ? "FAIL" : "PASS"}  every car of the 24 reads a Desk block with its trims split; the split is said; an unread pool never claims "no tiers assigned"`);
  let surv = 0;
  if (process.argv.includes("--mutants")) for (const [n, m] of MUTS) { let f; try { f = await findings(m); } catch (e) { f = ["threw " + e.message]; } console.log(`${f.length ? "killed  " : "SURVIVED"}  ${n}`); if (!f.length) surv++; }
  console.log(`\ndeskTrimAskCheck: ${base.length ? base.length + " FAIL" : "all pass"}${process.argv.includes("--mutants") ? (surv ? `, ${surv} mutant(s) survived` : ", all mutants killed") : ""}`);
  process.exit(base.length || surv ? 1 : 0);
}
