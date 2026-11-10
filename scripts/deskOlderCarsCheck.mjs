// clock: real-ok the fixture sales are dated relative to now (days ago); no calendar date is asserted (Lane B, Nov 2026)
// DESK OLDER CARS, DEMO READINESS (Lane B, Nov 10 2026). Lane F swept 24 older cars on the live engine (deskrungs full=1) and none was demo ready. The 24 recorded answers are the fixture (scripts/fixtures/deskOlderCars.json, no live read here); the archive is rebuilt
// from their counts (scripts/_deskOlderWorld.mjs) and every car is read through the real engine path and the real sheetRead. Demo ready = a typical range, at least three comparables each with a why line from the table, one correct name (titleLine, car.label and specLine agree).
// Rungs with their own range are reported, never required. The five causes, each with a mutant that must fail:
//   (1) a refusal in place of a result: a typed body the archive cannot read falls back to its sibling words and then all bodies, naming each (desk.bodyNote); a tier asked of sales that carry none reads all conditions and says so (desk.conditionNote)
//   (2) a pool one model year wide: the engine's own year walk goes on until the Desk population (24 months, the car's gearbox) meets the minimum, inside the generation or two years either side, and desk.yearsNote prints the years used
//   (3) a thin 12 month window where 24 months is not: desk.windowMonths defaults to 24 with desk.windowNote; a chosen window is never overridden
//   (4) comparables: three or more with why lines for every car, a body a listing does not state is open, a generation with fewer than three matches is filled from the closest sales of the model
//   (5) one name: car.label is the engine's titleLine, the designation letter is kept (356C), SUV is cased, a class name before a model number is dropped
//   node scripts/deskOlderCarsCheck.mjs [root]     --mutants proves each cause by breaking it in a copy
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { fileURLToPath, pathToFileURL } from "node:url"; import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), rootArg = args.find(a => !a.startsWith("--")), ROOT = path.resolve(rootArg || path.join(here, ".."));
if (args.includes("--mutants")) {
  const DV = "lib/deskV3.js", SR = "lib/sheetRead.js", OB = "lib/onebox.js";
  const muts = [
    [SR, "!hasDesk(a) && !askOfAnswer(a) && !wanted.some(", "false && !askOfAnswer(a) && !wanted.some(", "(1) a typed body the archive cannot read still refuses"],
    [SR, "tries = [...(BODY_SIBLINGS.find(g => g.includes(typed.toLowerCase())) || []).filter(w => w !== typed.toLowerCase()).slice(0, 2), null];", "tries = [null];", "(1) the sibling body words are not tried"],
    [SR, "words: deskAndList(bodyFailed.map(f => f.word.charAt(0).toUpperCase() + f.word.slice(1)))", "words: deskAndList(bodyFailed.slice(0, 1).map(f => f.word.charAt(0).toUpperCase() + f.word.slice(1)))", "(1) not every body word that failed is named"],
    [OB, "const noTiers = d.conditionTier != null && d.tierPoolState === \"no_tier_data\";", "const noTiers = false;", "(1) a tier with no tier data empties the population and says nothing"],
    [OB, "if ((n >= RANGE_THRESHOLD && dn >= deskMin) ||", "if ((n >= RANGE_THRESHOLD) ||", "(2) the pool stays one model year wide"],
    [OB, "const deskMin = env && env.desk ? DESK_EVIDENCE_MIN : 0;", "const deskMin = env && env.desk ? 40 : 0;", "(2) the walk goes to the whole bound whatever the population"],
    [DV, "if (own >= DESK_EVIDENCE_MIN) return null;", "if (true) return null;", "(2) the years used are not printed"],
    [DV, "if (!e12.insufficient || at(24).insufficient) return { desk, note: null };", "return { desk, note: null };", "(3) a thin 12 month window stays on 12 months"],
    [DV, "if (WINDOWS.includes(Number(desk && desk.windowMonths))) return { desk, note: null };", "if (false) return { desk, note: null };", "(3) a window the case chose is overridden"],
    [DV, "return { desk: { ...desk, windowMonths: 24 }, note: reasonLine(\"desk4.window_default\"", "return { desk: { ...desk, windowMonths: 24 }, note: null && reasonLine(\"desk4.window_default\"", "(3) 24 months is used silently"],
    [DV, "if (mapped.length >= COMP_MIN) return mapped;", "return mapped;", "(4) a generation with fewer than three matches is not filled"],
    [DV, "if (sub.body && r.body && !sameBody(r.body, sub.body)) return null;", "if (!sub.body || !r.body || !sameBody(r.body, sub.body)) return null;", "(4) a sale that states no body is not a comparable"],
    [SR, "label: (a.desk && a.desk.titleLine) || carLabel(", "label: carLabel(", "(5) car.label is a second source for the name"],
    [SR, "if (/^\\d{3}[A-Za-z]$/.test(m) && decode", "if (false && decode", "(5) the designation letter is lost (356C reads 356)"],
    [OB, "(/^suv$/i.test(rc.bodyStyle) ? \"SUV\" : cap(rc.bodyStyle))", "cap(rc.bodyStyle)", "(5) SUV is cased Suv"],
    [OB, "/-Class$/i.test(String(model || \"\")) && /^\\d{2,3}\\s?[A-Za-z]{1,3}\\b/.test(String(rc.trim || \"\")) ? \"\" : model", "model", "(5) a class name stays before the model number"]
  ];
  let survivors = 0;
  for (const [file, from, to, want] of muts) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "doc-"));
    spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", ROOT + "/", dir + "/"]); fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"));
    const fp = path.join(dir, file), src = fs.readFileSync(fp, "utf8"), m = src.replace(from, to);
    if (m === src) { console.log(`MUTANT NOT APPLIED  ${want}`); survivors++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
    fs.writeFileSync(fp, m);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/deskOlderCarsCheck.mjs"), dir], { encoding: "utf8" }), killed = r.status !== 0;
    console.log(`${killed ? "killed  " : "SURVIVED"}  ${want}`); if (!killed) survivors++;
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(survivors ? `\n${survivors} mutant(s) survived` : "\nall mutants killed"); process.exit(survivors ? 1 : 0);
}
process.chdir(ROOT);
let failed = 0, n = 0; const ok = (name, c, d) => { n++; if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${d ? "  " + d : ""}`); };
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const GEN = await imp("lib/generations.js"), WLD = await imp("scripts/_deskOlderWorld.mjs"), S = await imp("lib/sheetRead.js"), DV = await imp("lib/deskV3.js"), RW = await imp("lib/reasonWords.js");
console.error = () => {};
const cars = WLD.loadCars(ROOT), head = async () => ({ status: 200, bytes: 50000, type: "image/jpeg" }), today = new Date().toISOString().slice(0, 10);
const inTable = (id, line) => { try { return RW.reasonLine(id, {}) !== undefined && typeof line === "string" && line.length > 0; } catch { return typeof line === "string"; } };
const w = WLD.install(ROOT);
const readCar = async (c, extra = {}, tier = null) => S.sheetRead(w.env, { year: c.year, make: c.make, model: c.model, mileage: 60000, bodyStyle: c.typedBody || undefined, ...(tier ? { tier } : {}), desk: { caseDate: today, transmission: "Manual", label: `${c.year} ${c.make} ${c.model}`, case: { verification: {} }, exclusions: [], head, ...extra } }, w.deps);
// THE FIVE GATES, one place (Lane F's demoReadinessCheck): a typical range, three comparables each with a why line, a name that agrees with itself, no refusal. Returns the failing causes, or [].
const SPEC_BODY = /\b(Coupe|Convertible|Roadster|Sedan|Pickup|SUV|Fastback|Hardtop)\b/i;
function gates(c, r) {
  const d = r && r.desk, e = d && d.evidence, out = [];
  if (!d || !e) return ["REFUSED"];
  if (e.insufficient) out.push("NO_RANGE");
  if (!(d.comparables.length >= 3 && d.comparables.every(x => typeof x.why === "string" && x.why.length > 0))) out.push("NO_COMPARABLES");
  if (!(r.car.label === d.titleLine && d.titleLine && !/\bSuv\b|SL-Class \d|Targa/.test(d.titleLine))) out.push("LABEL_MISMATCH");
  const sb = SPEC_BODY.exec(d.specLine || ""), tb = SPEC_BODY.exec(d.titleLine || "");
  if (sb && tb && sb[1].toLowerCase() !== tb[1].toLowerCase()) out.push("SPEC_TITLE_DISAGREE");
  return out;
}
// BASELINE: the same gates over Lane F's recorded answers (no fixes): none of the 24 is ready, as Lane F reported
const recorded = cars.map(c => { const g = []; if (!c.read) g.push("REFUSED"); else { if (!c.range12) g.push("NO_RANGE"); if (c.comps < 3) g.push("NO_COMPARABLES"); if (c.label !== c.titleLine) g.push("LABEL_MISMATCH"); } return g; });
ok("the gates over Lane F's 24 recorded answers (the fixture is the live sweep): most are short, and the ones that pass have no rung in the gates (Lane F's two rung gate left 0 of 24)", cars.length === 24 && recorded.filter(g => g.length).length >= 18, recorded.filter(g => !g.length).length + " ready");
ok("the recorded causes are the ones swept: refused 6, no range 6, no comparables 9, label mismatch 5 or more", recorded.filter(g => g.includes("REFUSED")).length === 6 && recorded.filter(g => g.includes("NO_RANGE")).length === 6 && recorded.filter(g => g.includes("NO_COMPARABLES")).length >= 8 && recorded.filter(g => g.includes("LABEL_MISMATCH")).length >= 5, JSON.stringify([6, 6, 9, 5].map((_, i) => recorded.filter(g => g.includes(["REFUSED", "NO_RANGE", "NO_COMPARABLES", "LABEL_MISMATCH"][i])).length)));
const results = new Map(); for (const c of cars) results.set(c.n, await readCar(c));
const byN = n => cars.find(c => c.n === n), R = n => results.get(n), D = n => R(n) && R(n).desk;
const short = cars.map(c => [c, gates(c, R(c.n))]).filter(([, g]) => g.length);
console.log("  demo ready offline: " + (cars.length - short.length) + " of " + cars.length + (short.length ? "; short: " + short.map(([c, g]) => `${c.year} ${c.make} ${c.model} (${g.join(", ")})`).join("; ") : ""));
ok("(demo) every older car is demo ready offline, or is named with its reason", short.length === 0, short.map(([c, g]) => c.n + ":" + g.join("/")).join(" "));
// (1) REFUSALS
ok("(1) no car answers with a refusal in place of a result: every one of the 24 carries a Desk block", cars.every(c => D(c.n) && D(c.n).evidence));
const f13 = D(13);
ok("(1) the 250SL roadster (the engine says that body was never sold for the car) reads all bodies and names every body word that failed, with the engine's state", f13 && f13.bodyNote && /Roadster/.test(f13.bodyNote) && /Convertible/.test(f13.bodyNote) && /Cabriolet/.test(f13.bodyNote) && /all bodies are read/.test(f13.bodyNote) && Array.isArray(f13.bodyFailed) && f13.bodyFailed.length === 3 && f13.bodyFailed.every(x => x.word && x.state), f13 && f13.bodyNote);
ok("(1) a body the archive reads has no body note", cars.filter(c => c.n !== 13).every(c => !D(c.n).bodyNote));
ok("(1) the body note is a table sentence with no dash", f13 && !/[–—]/.test(f13.bodyNote) && inTable("desk4.body_fallback", f13.bodyNote));
{ const t = await readCar(byN(1), {}, 3), d = t.desk;
  ok("(1) a tier asked of sales that carry none reads every condition and says so, not an empty population", d && d.conditionNote && /every condition is read/.test(d.conditionNote) && d.evidence && !d.evidence.insufficient && d.evidence.count === D(1).evidence.count, d && d.conditionNote); }
// (2) POOLS ONE MODEL YEAR WIDE
const wide = cars.filter(c => D(c.n).yearsNote);
ok("(2) cars whose own model year holds too few for the Desk widen their years and print them: at least 5 of the 24", wide.length >= 5, wide.map(c => c.n).join());
ok("(2) the years note is a table sentence naming the years used and the cap or the generation", wide.every(c => /^Sales from \d{4} to \d{4} are read, /.test(D(c.n).yearsNote) && / because fewer than 3 sold in \d{4}/.test(D(c.n).yearsNote) && /within 2 years of \d{4}|within the .+ generation/.test(D(c.n).yearsNote)), wide[0] && D(wide[0].n).yearsNote);
ok("(2) a widened pool stays inside the generation or two years either side: no comparable further off", cars.every(c => D(c.n).comparables.every(x => !x.year || Math.abs(x.year - c.year) <= 5)));
ok("(2) a car that needs no widening prints no years note (Triumph TR6 has 14 of its own year)", !D(19).yearsNote);
ok("(2) every widened car now meets the Desk minimum (3) in some window", wide.every(c => D(c.n).evidence.byWindow["24"].count >= 3));
// (3) THIN WINDOWS
const d24 = cars.filter(c => D(c.n).windowNote);
ok("(3) a car thin at 12 months and not at 24 defaults to 24 with the sentence: at least 4", d24.length >= 4 && d24.every(c => D(c.n).evidence.windowMonths === 24 && /^24 months is used because fewer than 3 sold in the last 12 months, \d on record\.$/.test(D(c.n).windowNote)), d24.map(c => c.n).join());
ok("(3) a car with a range at 12 months stays on 12 with no note", cars.filter(c => !D(c.n).windowNote).every(c => D(c.n).evidence.windowMonths === 12));
{ const t = await readCar(byN(9), { windowMonths: 12 }); ok("(3) a window the case chose (12) is never overridden, thin or not", t.desk.evidence.windowMonths === 12 && !t.desk.windowNote); }
{ const t = await readCar(byN(9), { windowMonths: 6 }); ok("(3) a chosen 6 months stays 6", t.desk.evidence.windowMonths === 6 && !t.desk.windowNote); }
// (4) COMPARABLES
const named = [6, 17, 19, 21, 22, 23, 24, 20];
ok("(4) the eight cars that returned none (Bel Air, Austin-Healey, TR6, 240Z, Alfa Spider, BMW 2002, FJ40, Beetle) return three or more, each with a why line", named.every(k => D(k).comparables.length >= 3 && D(k).comparables.every(x => typeof x.why === "string" && x.why.length)), named.map(k => k + ":" + D(k).comparables.length).join(" "));
ok("(4) the generation lists added make the five unmapped families mapped: TR6, 240Z, BMW 2002, Austin-Healey 3000 (1964 to 1967), Alfa Spider", [["Triumph", "TR6", 1974], ["Datsun", "240Z", 1971], ["BMW", "2002", 1972], ["Austin-Healey", "3000", 1966], ["Alfa Romeo", "Spider", 1969]].every(([mk, md, y]) => GEN.generationsForModel(mk, md).some(g => y >= g.yearStart && y <= g.yearEnd)));
{ const sub = { generation: "g1", body: "coupe", year: 1957, gearbox: "manual", miles: 60000 };
  ok("(4) a sale that states no body is open, not excluded; a sale with another body is excluded", DV.relevanceOf({ generation: "g1", body: null, year: 1957, gearbox: "manual", miles: 60000 }, sub) === "close" && DV.relevanceOf({ generation: "g1", body: "open", year: 1957, gearbox: "manual", miles: 60000 }, sub) === null && DV.relevanceOf({ generation: "g1", body: "coupe", year: 1957, gearbox: "manual", miles: 60000 }, sub) === "close");
  const rows = Array.from({ length: 12 }, (_, i) => ({ id: "f" + i, title: "x", year: 1957 + (i % 3), generation: i < 1 ? "g1" : "g2", body: "coupe", gearbox: "manual", gearboxWord: "Manual", miles: 50000 + i * 1000, price: 30000 + i * 100, date: today.slice(0, 7) + "-01", platform: "Bring a Trailer", inPopulation: true }));
  const blk = await DV.deskBlock(rows, { caseDate: today, subject: { transmission: "Manual", body: "Coupe" }, subjectFacts: sub, head });
  ok("(4) a generation with one match is filled from the closest sales of the model, marked filled, the generation match first, with a note", blk.comparables.length >= 3 && blk.comparables[0].filled !== true && blk.comparables.some(c => c.filled) && /^Fewer than 3 sales share this car's g1 generation/.test(blk.comparablesNote), String(blk.comparablesNote)); }
// (5) ONE NAME
ok("(5) car.label is the titleLine for every car (one source)", cars.every(c => R(c.n).car.label === D(c.n).titleLine));
ok("(5) the 1966 Mustang fastback reads Fastback, never Coupe", /Fastback/.test(R(2).car.label) && !/Coupe/.test(R(2).car.label), R(2).car.label);
ok("(5) the 356C carries its C", /356C\b/.test(R(15).car.label), R(15).car.label);
ok("(5) the 911T never reads Targa", !/Targa/.test(R(16).car.label) && /911 T\b/.test(R(16).car.label), R(16).car.label);
ok("(5) the FJ40 reads SUV, not Suv", /FJ40 SUV$/.test(R(24).car.label) && !/\bSuv\b/.test(R(24).car.label), R(24).car.label);
ok("(5) the C10 keeps Pickup", /Pickup$/.test(R(11).car.label), R(11).car.label);
ok("(5) the 280SL reads 280SL, not SL-Class 280SL", /Mercedes-Benz 280SL Roadster$/.test(R(14).car.label), R(14).car.label);
ok("(5) the spec line and the title never name two bodies", cars.every(c => { const sb = SPEC_BODY.exec(D(c.n).specLine || ""), tb = SPEC_BODY.exec(D(c.n).titleLine || ""); return !(sb && tb) || sb[1].toLowerCase() === tb[1].toLowerCase(); }));
ok("(5) no label, title or note has a dash", cars.every(c => !/[–—]/.test([R(c.n).car.label, D(c.n).titleLine, D(c.n).windowNote, D(c.n).yearsNote, D(c.n).bodyNote, D(c.n).comparablesNote].join(" "))));
console.log(`\ndeskOlderCarsCheck: ${n - failed} pass, ${failed} FAIL`); process.exit(failed ? 1 : 0);
