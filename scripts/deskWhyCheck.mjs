// clock: real-ok the world's sales are dated relative to now; the direct tests name their own fixed dates (Lane B, Nov 2026)
// DESK V4 STAGE 4, WHY AND FACTORS (Lane B, Nov 10 2026). desk.supports and desk.considered = [{ key, title, line }], desk.whyDraft = one or two table sentences, all built from the factors and desk.case.verification:
//   (1) a seller stated item is NEVER in supports, for every factor and every other state; it is in considered and reads "Reported by the seller and outstanding until verified." until it is documented (or verified)
//   (2) a documented or verified item the sales read, and documented ownership, are in supports; manual gearbox and ownership support it, mileage and cosmetic notes are taken into account
//   (3) no dollar effect unless both groups meet the minimum: a supports line carries a figure only when the factor's own effect sentence does, a considered line and the draft never carry one
//   (4) the draft is one or two sentences, each a reason table line, no dash, no valuation word; it names the reported items as outstanding and never as support
//   (5) through the engine, every Desk model, the case's verification reaches the lists
//   node scripts/deskWhyCheck.mjs [root]     --mutants proves each rule by breaking it in a copy
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { fileURLToPath, pathToFileURL } from "node:url"; import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), rootArg = args.find(a => !a.startsWith("--")), ROOT = path.resolve(rootArg || path.join(here, ".."));
if (args.includes("--mutants")) {
  const DV = "lib/deskV3.js";
  const muts = [
    [DV, "if ((st === \"verified\" || st === \"documented\") && (read || f.key === \"owners\")) {", "if ((st === \"verified\" || st === \"documented\" || st === \"seller_stated\") && (read || f.key === \"owners\")) {", "(1) a seller stated item reads as support"],
    [DV, "const kind = st === \"seller_stated\" ? \"reported\" :", "const kind = st === \"seller_stated\" ? \"noted\" :", "(1) a seller stated item reads as taken into account, not outstanding"],
    [DV, "if ((st === \"verified\" || st === \"documented\") && (read || f.key === \"owners\")) {", "if (read || f.key === \"owners\") {", "(1) an unverified item the sales read is support"],
    [DV, "(read || f.key === \"owners\")) {\n      const base", "(read)) {\n      const base", "(2) documented ownership is not support"],
    [DV, "line: read && f.effectSentence ? `${base} ${f.effectSentence}` : base }", "line: read ? `${base} It sold for about $5,000 more.` : base }", "(3) a typed dollar effect on a support line"],
    [DV, "considered.push({ key: f.key, title, line: reasonLine(", "considered.push({ key: f.key, title, line: (f.effectSentence || \"\") + reasonLine(", "(3) a considered line carries the effect sentence"],
    [DV, "for (const x of [sSup, sRep, sNote]) if (x && out.length < 2) out.push(x);", "for (const x of [sSup, sRep, sNote]) if (x) out.push(x);", "(4) the draft runs past two sentences"],
    [DV, "const sRep = reported.length ? reasonLine(\"desk4.why_reported\"", "const sRep = false ? reasonLine(\"desk4.why_reported\"", "(4) the draft leaves out what is outstanding"],
    [DV, "const LIST_KEYS = [\"transmission\", \"service_ims\", \"mileage_band\", \"owners\", \"cosmetic\"];", "const LIST_KEYS = [\"transmission\", \"service_ims\", \"mileage_band\", \"owners\", \"cosmetic\", \"market_movement\"];", "(4) market movement is listed as a car factor"],
    ["lib/reasonWords.js", "`${p.list} ${p.verb} this read.`", "`${p.list} ${p.verb} the higher price.`", "(4) the draft claims a price"]
  ];
  let survivors = 0;
  for (const [file, from, to, want] of muts) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dwy-"));
    spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", ROOT + "/", dir + "/"]); fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"));
    const fp = path.join(dir, file), src = fs.readFileSync(fp, "utf8"), m = src.replace(from, to);
    if (m === src) { console.log(`MUTANT NOT APPLIED  ${want}`); survivors++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
    fs.writeFileSync(fp, m);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/deskWhyCheck.mjs"), dir], { encoding: "utf8" }), killed = r.status !== 0;
    console.log(`${killed ? "killed  " : "SURVIVED"}  ${want}`); if (!killed) survivors++;
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(survivors ? `\n${survivors} mutant(s) survived` : "\nall mutants killed"); process.exit(survivors ? 1 : 0);
}
process.chdir(ROOT);
let failed = 0, n = 0; const ok = (name, c, d) => { n++; if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${d ? "  " + d : ""}`); };
const W = await import(pathToFileURL(path.join(ROOT, "scripts/_deskV3World.mjs")).href);
const S = await import(pathToFileURL(path.join(ROOT, "lib/sheetRead.js")).href);
const DV = await import(pathToFileURL(path.join(ROOT, "lib/deskV3.js")).href);
const RW = await import(pathToFileURL(path.join(ROOT, "lib/reasonWords.js")).href);
const pats = RW.reasonPatterns().map(p => ({ ...p, re: new RegExp(p.re.source.replace(/\\\$NaN/g, "\\$[\\d,]+").replace(/NaN/g, "[\\d,]+")) })), line = (field, s) => typeof s === "string" && pats.some(p => p.field === field && p.re.test(s));
const noDash = s => !/[–—]|\s-\s/.test(String(s || "")), noValue = s => !/\b(worth|valuation|estimate|appraisal|undervalued|overvalued|best price|guarantee)\b/i.test(String(s || ""));
const CASE = "2026-11-10", sub = { transmission: "Manual", body: "Coupe" }, SF = { year: 1999, make: "Porsche", model: "911", generation: "996", body: "coupe", gearbox: "manual", miles: 40000, tier: null };
const row = (id, price, gearbox, miles, date = "2026-09-01") => ({ id, price, date, tier: null, year: 1999, generation: "996", body: "coupe", gearbox, gearboxWord: gearbox === "manual" ? "Manual" : "Automatic", title: "1999 Porsche 911", platform: "Bring a Trailer", url: "https://x.test/" + id, miles, inPopulation: true });
// manual cars dear and apart from automatics (both groups of 4 or more, middle halves do not overlap); mileage spread so the mileage factor isolates too
const sep = [...[0, 1, 2, 3].map(i => row("m" + i, 70000 + i * 500, "manual", 20000 + i * 1000)), ...[0, 1, 2, 3].map(i => row("a" + i, 40000 + i * 500, "automatic", 60000 + i * 1000))];
const thin = [...sep.slice(0, 4), row("a0", 40000, "automatic", 60000), row("a1", 41000, "automatic", 61000)];
const FACTORS = ["transmission", "service_ims", "mileage_band", "owners", "cosmetic"], STATES = ["verified", "documented", "seller_stated", "not_confirmed", undefined];
const blk = (rows, verification, extra = {}) => DV.deskBlock(rows, { caseDate: CASE, subject: sub, subjectFacts: SF, case: verification ? { verification } : null, ...extra });
const textOf = x => [x.whyDraft, ...x.supports.map(s => s.line), ...x.considered.map(s => s.line)].join(" ");
{ const d = await blk(sep, { transmission: "documented", owners: "documented", mileage_band: "seller_stated" });
  const sk = d.supports.map(s => s.key), ck = d.considered.map(s => s.key);
  ok("(2) a documented manual gearbox and documented ownership are the supports", sk.join() === "transmission,owners" && d.supports[0].title === "Manual gearbox" && d.supports[1].title === "Ownership", JSON.stringify(d.supports));
  ok("(1) the seller stated mileage is in considered and reads outstanding until verified", d.considered.find(c => c.key === "mileage_band").line === "Reported by the seller and outstanding until verified." && !sk.includes("mileage_band"));
  ok("(2) cosmetic condition with no state is taken into account", /Taken into account/.test(d.considered.find(c => c.key === "cosmetic").line));
  ok("(4) the draft is the two sentences: support, then what is outstanding", d.whyDraft === "Manual gearbox and ownership support this read. Mileage is reported by the seller and outstanding until verified.", d.whyDraft);
  ok("(1) every list is {key, title, line} and nothing else", [...d.supports, ...d.considered].every(x => JSON.stringify(Object.keys(x)) === JSON.stringify(["key", "title", "line"])));
}
{ // (1) the sweep: every factor in every state, one at a time
  let bad = [], seen = 0;
  for (const key of FACTORS) for (const st of STATES) {
    const d = await blk(sep, st ? { [key]: st } : {}); seen++;
    const inSup = d.supports.some(s => s.key === key), inCon = d.considered.some(s => s.key === key), item = d.considered.find(s => s.key === key);
    if (st === "seller_stated" && (inSup || !inCon || item.line !== "Reported by the seller and outstanding until verified.")) bad.push(key + ":" + st);
    if (st === "not_confirmed" && (inSup || !inCon)) bad.push(key + ":" + st);
    if (!st && inSup) bad.push(key + ":none");
    if (key === "service_ims" && (inSup || inCon)) { /* the 996 family has the IMS factor; any state is fine as long as the rules above hold */ }
    if (inSup === inCon && !(key === "service_ims" && !inSup && !inCon)) bad.push(key + ":" + st + ":both or neither");
  }
  ok(`(1) ${seen} factor and state pairs: a seller stated or not confirmed item is never support and is always considered; with no state nothing is support; an item is in exactly one list`, !bad.length, bad.join());
}
{ // (3) dollars
  const d = await blk(sep, { transmission: "documented", mileage_band: "documented" }), trans = d.factors.find(f => f.key === "transmission");
  ok("(3) the fixture isolates the transmission (both groups of four, apart)", trans.effectSentence && /\$[\d,]+/.test(trans.effectSentence), String(trans.effectSentence));
  const sup = d.supports.find(s => s.key === "transmission");
  ok("(3) a support line carries the dollar effect only as the factor's own sentence", sup.line.includes(trans.effectSentence) && (sup.line.match(/\$[\d,]+/g) || []).length === (trans.effectSentence.match(/\$[\d,]+/g) || []).length, sup.line);
  const t = await blk(thin, { transmission: "documented" }), ts = t.supports.find(s => s.key === "transmission");
  ok("(3) two automatics only: no effect, and the support line has no figure", t.factors.find(f => f.key === "transmission").effectSentence === null && (!ts || !/\$/.test(ts.line)), ts && ts.line);
  const r = await blk(sep, { transmission: "seller_stated", mileage_band: "seller_stated", owners: "seller_stated" });
  ok("(3) a considered line and the draft never carry a figure, even when the sales isolate an effect", r.considered.every(c => !/\$/.test(c.line)) && !/\$/.test(r.whyDraft || "") && r.factors.find(f => f.key === "transmission").effectSentence);
  let anyDollar = false;
  for (const key of FACTORS) for (const st of STATES) { const x = await blk(sep, st ? { [key]: st } : {}); if (x.considered.some(c => /\$/.test(c.line)) || /\$/.test(x.whyDraft || "")) anyDollar = true; }
  ok("(3) across every factor and state no considered line and no draft carries a dollar figure", !anyDollar);
}
{ // (4) sentences
  let all = true, two = true, sweep = 0;
  for (const key of FACTORS) for (const st of STATES) {
    const x = await blk(sep, st ? { [key]: st, owners: "documented" } : { owners: "documented" }); sweep++;
    const parts = String(x.whyDraft || "").split(/(?<=\.)\s+/).filter(Boolean);
    if (parts.length > 2) two = false;
    if (!parts.every(p => line("desk.whyDraft", p) && noDash(p) && noValue(p))) all = false;
    if (![...x.supports, ...x.considered].every(i => noDash(i.line) && noValue(i.line) && (line("desk.supports.line", i.line) || line("desk.considered.line", i.line) || /^(Documented|Verified)/.test(i.line)))) all = false;
  }
  ok(`(4) ${sweep} cases: the draft is one or two sentences, each a table line, no dash, no valuation word`, two && all);
  const none = await blk(sep, null);
  ok("(2) with no case: nothing is support, every item is considered, and the draft only says what is taken into account", none.supports.length === 0 && none.considered.length >= 4 && /taken into account/.test(none.whyDraft), none.whyDraft);
  const ns = await blk(sep, { transmission: "verified", owners: "verified", mileage_band: "verified", cosmetic: "verified" });
  ok("(2) all verified: the draft names support first, then what is taken into account", /support this read\./.test(ns.whyDraft) && ns.whyDraft.split(/(?<=\.)\s+/).length <= 2, ns.whyDraft);
  ok("(4) market movement is in neither list", ![...ns.supports, ...ns.considered].some(i => i.key === "market_movement"));
}
// ---- through the engine, every Desk model: the case's verification reaches the lists
const w = W.install(); const quiet = console.error; console.error = () => {};
const today = new Date().toISOString().slice(0, 10);
for (const c of W.CASES) {
  const sh = await S.sheetRead(w.env, { year: c.year, make: c.make, model: c.model, mileage: 40000, desk: { caseDate: today, transmission: c.transmission, label: c.label, case: { verification: { transmission: "seller_stated", owners: "documented", mileage_band: "documented" } } } }, w.deps), d = sh && sh.desk;
  if (!d || !Array.isArray(d.supports)) { ok(`${c.model}: the sheet read carries desk.supports`, false); continue; }
  ok(`${c.model}: a seller stated gearbox is considered and never support; documented ownership is support`, !d.supports.some(s => s.key === "transmission") && d.considered.some(s => s.key === "transmission" && /outstanding until verified/.test(s.line)) && d.supports.some(s => s.key === "owners"), JSON.stringify(d.supports.map(s => s.key)));
  ok(`${c.model}: the draft is a table sentence or two with no figure of its own`, typeof d.whyDraft === "string" && d.whyDraft.split(/(?<=\.)\s+/).length <= 2 && !/\$/.test(d.whyDraft));
}
console.error = quiet;
console.log(`\ndeskWhyCheck: ${n - failed} pass, ${failed} FAIL`); process.exit(failed ? 1 : 0);
