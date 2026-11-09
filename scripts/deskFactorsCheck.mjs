// clock: real-ok the fixture sales are dated relative to now (days ago); no calendar date is asserted (Lane B, Nov 2026)
// DESK V3 STAGE 4, CONDITION AND FACTORS (Lane B, Nov 8 2026). desk.condition { suggested, basis } and desk.factors [{ key, title, basis, support, effectSentence, verification, evidenceRef }]:
//   (1) NO INVENTED MONEY: an effectSentence exists only when support is supported or in_population AND both groups have 3 or more sales AND their middle halves do not overlap; its dollars are the groups' median difference to the nearest $500
//   (2) every basis, effectSentence and condition basis is a reason table line, and no dollar figure is typed in the module
//   (3) service_ims is the 996 family only (lib/modelRules.js FACTOR_FAMILIES); it counts only sales that say (desk_facts.ims true or false), a sale stamped before the flag is not read
//   (4) the condition rung is one of the four of TIER_LADDER, suggested from the case's signals, the car's own listing or the sales near its mileage, else none
//   node scripts/deskFactorsCheck.mjs [root]     --mutants proves each rule by breaking it in a copy
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { fileURLToPath, pathToFileURL } from "node:url"; import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), rootArg = args.find(a => !a.startsWith("--")), ROOT = path.resolve(rootArg || path.join(here, "..")), Q = String.fromCharCode(96);
if (args.includes("--mutants")) {
  const DV = "lib/deskV3.js";
  const muts = [
    [DV, "return { state: \"effect\", a, b, diff: deskRoundDiff(a.median - b.median), dir:", "return { state: \"effect\", a, b, diff: 1500, dir:", "a fixed dollar effect"],
    [DV, "export const OVERLAP_MAX = 0.5, FACTOR_MIN = 3,", "export const OVERLAP_MAX = 0.5, FACTOR_MIN = 1,", "one sale in a group is enough"],
    [DV, "export const OVERLAP_MAX = 0.5,", "export const OVERLAP_MAX = 5,", "prices that overlap still give an effect"],
    [DV, "if (factorFamilyFor(\"service_ims\", sub.make, sub.model, sub.year, sub.generation)) {", "if (true) {", "service_ims on every family"],
    [DV, "effectSentence: r.state === \"effect\" ? effectLine(r, an, bn) : null,\n      basis: r.state ===", "effectSentence: effectLine({ ...r, diff: 1500, dir: \"more\" }, an, bn),\n      basis: r.state ===", "a transmission effect even where the groups are too small or overlap"],
    [DV, "const VERIFIED = new Set([\"verified\", \"documented\", \"seller_stated\", \"not_confirmed\"]);", "const VERIFIED = { has: v => !!v };", "a made up verification word passes"],
    [DV, "read = popSame.filter(r => typeof r.ims === \"boolean\")", "read = popSame.map(r => ({ ...r, ims: !!r.ims }))", "a sale that does not say is read as no IMS work"],
    [DV, "basis: reasonLine(\"desk3.basis_nomiles\") });", "basis: \"No mileage, so no mileage effect.\" });", "a basis sentence typed in the module"],
    [DV, "if (carTier && [1, 2, 3, 4].includes(Number(carTier.tier)))", "if (carTier && Number(carTier.tier) > 0)", "a tier outside the four rungs is suggested"],
    [DV, "if (top[1] * 2 >= near.length) return", "if (true) return", "the condition of sales nearby is suggested without a majority"]
  ];
  let survivors = 0;
  for (const [file, from, to, want] of muts) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dfc-"));
    spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", ROOT + "/", dir + "/"]); fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"));
    const fp = path.join(dir, file), src = fs.readFileSync(fp, "utf8"), m = src.replace(from, to);
    if (m === src) { console.log("MUTANT NOT APPLIED  " + want); survivors++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
    fs.writeFileSync(fp, m);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/deskFactorsCheck.mjs"), dir], { encoding: "utf8" }), killed = r.status !== 0;
    console.log((killed ? "killed  " : "SURVIVED") + "  " + want); if (!killed) survivors++;
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(survivors ? "\n" + survivors + " mutant(s) survived" : "\nall mutants killed"); process.exit(survivors ? 1 : 0);
}
process.chdir(ROOT);
let failed = 0, n = 0; const ok = (name, c, d) => { n++; if (!c) failed++; console.log((c ? "PASS" : "FAIL") + "  " + name + (d ? "  " + d : "")); };
const W = await import(pathToFileURL(path.join(ROOT, "scripts/_deskV3World.mjs")).href);
const S = await import(pathToFileURL(path.join(ROOT, "lib/sheetRead.js")).href);
const DV = await import(pathToFileURL(path.join(ROOT, "lib/deskV3.js")).href);
const RW = await import(pathToFileURL(path.join(ROOT, "lib/reasonWords.js")).href);
const MR = await import(pathToFileURL(path.join(ROOT, "lib/modelRules.js")).href);
const CT = await import(pathToFileURL(path.join(ROOT, "lib/conditionTier.js")).href);
console.error = () => {};
const today = new Date().toISOString().slice(0, 10);
const pats = RW.reasonPatterns();
const inTable = (field, line) => pats.some(p => p.field === field && new RegExp(p.re.source.split("\\$NaN").join("\\$[\\d,]+")).test(line));
const money = s => { const m = /about \$([\d,]+)/.exec(s || ""); return m ? Number(m[1].replace(/,/g, "")) : null; };
const readWith = async (opts, c, o = {}) => { const w = W.install(opts); return S.sheetRead(w.env, { year: c.year, make: c.make, model: c.model, mileage: 61400, ...o, desk: { caseDate: today, transmission: c.transmission, ...(o.desk || {}) } }, w.deps); };
const c996 = W.CASES[0], cVette = W.CASES[1], cM3 = W.CASES[2];
// (3) unit: the family rule
ok("the 996 is in the IMS family", MR.factorFamilyFor("service_ims", "Porsche", "911", 1999, "996"));
ok("the 986 Boxster is in the IMS family", MR.factorFamilyFor("service_ims", "Porsche", "Boxster", 2001, "986"));
ok("the 997 and the 993 are not", !MR.factorFamilyFor("service_ims", "Porsche", "911", 2006, "997") && !MR.factorFamilyFor("service_ims", "Porsche", "911", 1996, "993"));
ok("a Corvette and an M3 are not", !MR.factorFamilyFor("service_ims", "Chevrolet", "Corvette", 1970, "C3") && !MR.factorFamilyFor("service_ims", "BMW", "M3", 2003, "E46"));
// (1) unit: isolate
{ const g = (k, base, step = 100) => Array.from({ length: k }, (_, i) => ({ price: base + i * step }));
  ok("two sales against ten: few, no effect", DV.isolate(g(2, 40000), g(10, 30000)).state === "few");
  ok("three against three, far apart: an effect, rounded to $500", (() => { const r = DV.isolate(g(3, 40200), g(3, 30000)); return r.state === "effect" && r.diff === 10000 && r.dir === "more"; })());
  ok("prices that overlap: overlap, no effect", DV.isolate(g(8, 30000, 500), g(8, 30500, 500)).state === "overlap");
  ok("the lower group says less", DV.isolate(g(3, 30000), g(3, 40000)).dir === "less"); }
// the 996 read
const sh = await readWith({}, c996), f = Object.fromEntries(sh.desk.factors.map(x => [x.key, x]));
ok("the 996 read carries all six factors", ["transmission", "service_ims", "mileage_band", "owners", "cosmetic", "market_movement"].every(k => f[k]) && sh.desk.factors.length === 6, sh.desk.factors.map(x => x.key).join(","));
ok("every factor carries the shape's fields", sh.desk.factors.every(x => ["key", "title", "basis", "support", "effectSentence", "verification", "evidenceRef"].every(k => k in x) && ["in_population", "supported", "limited", "none"].includes(x.support)));
ok("transmission is in the population (a manual car was asked) and has an effect", f.transmission.support === "in_population" && /^Manual cars sold for about \$[\d,]+ more than automatic cars, \d+ sales against \d+\.$/.test(f.transmission.effectSentence), f.transmission.effectSentence);
ok("the transmission effect is the medians' difference to the nearest $500", (() => { const man = sh.desk.comparables.filter(c => /manual/i.test(c.transmission)).map(c => c.price), aut = sh.desk.comparables.filter(c => /tiptronic|automatic/i.test(c.transmission)).map(c => c.price); const md = a => { const s = [...a].sort((x, y) => x - y), i = (s.length - 1) / 2; return Math.round(s[Math.floor(i)] + (s[Math.ceil(i)] - s[Math.floor(i)]) * (i - Math.floor(i))); }; return money(f.transmission.effectSentence) === Math.round((md(man) - md(aut)) / 500) * 500; })());
ok("the mileage factor reads from the in-population sales: an effect with its dollars, or words, never both missing", f.mileage_band.support === "supported" && ((f.mileage_band.effectSentence !== null && /^Sales under 61,400 miles sold for about \$[\d,]+ (more|less) than sales over them, \d+ sales against \d+\.$/.test(f.mileage_band.effectSentence)) || /overlap too much|There are/.test(f.mileage_band.basis)), f.mileage_band.effectSentence || f.mileage_band.basis);
{ const rows = Array.from({ length: 14 }, (_, i) => ({ id: "m" + i, year: 1999, generation: "996", body: "coupe", gearbox: "manual", gearboxWord: "Manual", miles: i < 7 ? 40000 + i * 100 : 80000 + i * 100, price: 38000 + ((i * 7) % 5) * 300, tier: null, inPopulation: true }));
  const out = DV.factorsOf(rows, { insufficient: false }, [], { year: 1999, generation: "996", body: "coupe", gearbox: "manual", miles: 61400, make: "Porsche", model: "911" }, null), m = out.find(x => x.key === "mileage_band");
  ok("two mileage halves whose prices overlap give no effect and say so", m.effectSentence === null && /overlap too much to isolate an effect/.test(m.basis), m.basis);
  const few = rows.map((r, i) => (i < 2 ? r : { ...r, miles: 80000 + i * 100 })), mf = DV.factorsOf(few, { insufficient: false }, [], { year: 1999, generation: "996", body: "coupe", gearbox: "manual", miles: 61400, make: "Porsche", model: "911" }, null).find(x => x.key === "mileage_band");
  ok("two sales under the car's miles give no effect, support limited, and the counts of each side", mf.effectSentence === null && mf.support === "limited" && /^Sales under 61,400 miles number 2 and sales over them 12, and three of each are needed/.test(mf.basis), mf.basis); }
ok("owners and cosmetic are not recorded: none, no effect, a reason in words", ["owners", "cosmetic"].every(k => f[k].support === "none" && f[k].effectSentence === null && /do not record/.test(f[k].basis)));
ok("market movement is the first and latest quarter medians", f.market_movement.support === "supported" && new RegExp("from \\$" + sh.desk.quarters.filter(q => q.shown)[0].median.toLocaleString("en-US") + " in " + sh.desk.quarters.filter(q => q.shown)[0].label).test(f.market_movement.effectSentence), f.market_movement.effectSentence);
ok("INVARIANT: an effectSentence only with support supported or in_population", sh.desk.factors.every(x => x.effectSentence === null || ["supported", "in_population"].includes(x.support)));
// (2)
ok("every basis, effect and condition sentence is a reason table line", sh.desk.factors.every(x => inTable("desk.factors.basis", x.basis) && (x.effectSentence === null || inTable("desk.factors.effectSentence", x.effectSentence))) && inTable("desk.condition.basis", sh.desk.condition.basis), sh.desk.factors.filter(x => !inTable("desk.factors.basis", x.basis)).map(x => x.basis)[0]);
{ const src = fs.readFileSync(path.join(ROOT, "lib/deskV3.js"), "utf8").split("\n").filter(l => !/^\s*\/\//.test(l)).join("\n").replace(/\/\/.*$/gm, "");
  ok("no dollar figure is typed in lib/deskV3.js", !/\$\s?\d/.test(src) && !/["'][^"']*\b\d{1,3},\d{3}\b[^"']*["']/.test(src)); }
// (3) IMS
{ const none = f.service_ims; ok("the IMS factor on rows that never said: none, 'None of the N sales say', no effect", none.support === "none" && none.effectSentence === null && /^None of the \d+ sales say whether IMS work was done/.test(none.basis), none.basis);
  const up = await readWith({ ims: i => Math.floor(i / 4) % 2 === 0, imsUp: 6000 }, c996), g = up.desk.factors.find(x => x.key === "service_ims");
  ok("with IMS work stated on every sale and dearer by $6,000, the effect is read from the sales", g.support === "supported" && /^Cars with IMS work sold for about \$[\d,]+ more than those without, \d+ sales against \d+\.$/.test(g.effectSentence || ""), g.effectSentence || g.basis);
  ok("that dollar figure is the groups' difference (inside 4,500 to 8,000 for a $6,000 lift with price noise)", money(g.effectSentence) >= 4500 && money(g.effectSentence) <= 8000, String(money(g.effectSentence)));
  const flat = await readWith({ ims: i => Math.floor(i / 4) % 2 === 0, imsUp: 0 }, c996), h = flat.desk.factors.find(x => x.key === "service_ims");
  ok("with IMS work stated and no price difference, the prices overlap: no effect, said in words", h.effectSentence === null && /overlap too much/.test(h.basis), h.basis);
  const part = await readWith({ ims: i => (i < 8 ? true : i < 12 ? false : undefined), imsUp: 6000 }, c996), p = part.desk.factors.find(x => x.key === "service_ims");
  ok("with few sales saying either way, no effect and the count that do", p.effectSentence === null && /^Only \d+ of \d+ sales say|too few of each|too few to isolate/.test(p.basis), p.basis);
  const vette = await readWith({ ims: i => Math.floor(i / 4) % 2 === 0, imsUp: 6000 }, cVette), m3 = await readWith({ ims: i => Math.floor(i / 4) % 2 === 0, imsUp: 6000 }, cM3);
  ok("a Corvette and an M3 have no IMS factor even when their sales carry the flag", !vette.desk.factors.some(x => x.key === "service_ims") && !m3.desk.factors.some(x => x.key === "service_ims")); }
// verification
{ const v = await readWith({}, c996, { desk: { case: { verification: { transmission: "documented", mileage_band: "bogus", owners: "seller_stated", cosmetic: "not_confirmed" } } } }), g = Object.fromEntries(v.desk.factors.map(x => [x.key, x]));
  ok("verification comes from the case record, one of four words, anything else is null", g.transmission.verification === "documented" && g.owners.verification === "seller_stated" && g.cosmetic.verification === "not_confirmed" && g.mileage_band.verification === null && f.transmission.verification === null); }
// (4) condition
{ const rows = Array.from({ length: 8 }, (_, i) => ({ miles: 60000 + i * 500, tier: i < 6 ? 3 : 2, price: 40000 }));
  const sig = DV.conditionOf({ notes: "one owner, service records, no accidents, original paint", titleStatus: "Clean" }, rows, null, 61400);
  ok("case signals give a rung, named from the ladder, with the count in words", sig.suggested && [1, 2, 3, 4].includes(sig.suggested.tier) && sig.suggested.name === CT.TIER_NAMES[sig.suggested.tier] && /^Suggested \w+ from one owner, service records, no accidents, original paint and 61,400 miles, \d+ signals counted\.$/.test(sig.basis), sig.basis);
  const rec = DV.conditionOf(null, rows, { tier: 2, evidence: [1, 2, 3, 4] }, 61400);
  ok("the car's own listing gives its rung", rec.suggested.tier === 2 && rec.suggested.name === "Excellent" && /last listing of this car, 4 signals counted/.test(rec.basis));
  const near = DV.conditionOf(null, rows, null, 61400);
  ok("with no case or listing, the condition of the sales near its miles when most agree", near.suggested && near.suggested.tier === 3 && /^Suggested Good, as 6 of the 8 tiered sales near 61,400 miles sold in that condition\.$/.test(near.basis), near.basis);
  const split = DV.conditionOf(null, [3, 3, 2, 2, 1, 1].map((t, i) => ({ miles: 60000 + i * 100, tier: t })).concat([{ miles: 60500, tier: 4 }]), null, 61400);
  ok("no majority near its miles: nothing suggested", split.suggested === null && /^No condition is suggested, no signals counted and three are needed\.$/.test(split.basis), split.basis);
  ok("a tier outside the four rungs is never suggested", DV.conditionOf(null, [], { tier: 7, evidence: [] }, null).suggested === null);
  { const nm = await readWith({}, c996, { mileage: null }), g = nm.desk.factors.find(x => x.key === "mileage_band");
    ok("with no mileage given the mileage factor says so from the table", g.support === "none" && g.effectSentence === null && g.basis === "No mileage was given, so no mileage effect is read." && inTable("desk.factors.basis", g.basis), g.basis); }
  ok("every condition basis is a table line", [sig, rec, near, split].every(x => inTable("desk.condition.basis", x.basis)));
  ok("the rungs are the four of TIER_LADDER", Object.keys(CT.TIER_LADDER).length === 4 && ["Concours", "Excellent", "Good", "Fair"].every((nme, i) => CT.TIER_LADDER[i + 1].name === nme)); }
console.log("\ndeskFactorsCheck: " + (n - failed) + " pass, " + failed + " FAIL"); process.exit(failed ? 1 : 0);
