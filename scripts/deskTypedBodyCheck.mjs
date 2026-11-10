// clock: real-ok sales are dated relative to now in the fake archive; no calendar date is asserted (Lane B, Nov 10 2026)
// DESK TYPED BODY CHECK. Cause (Lane F's re-sweep): a typed Hardtop printed "1957 Chevrolet Bel Air Coupe" because the engine scopes a closed two door to its own word and builds the title from it. The expert's typed body is the body in the title and the label.
// Class: any typed body whose sibling the engine names. Over Lane F's 24 cars, every typed body that has siblings (Coupe, Hardtop, Fastback; Roadster, Convertible, Cabriolet), plus Sedan and SUV, and the demo 996:
//   (1) a Desk read whose typed body was read (no bodyNote) prints the TYPED word as the last word of titleLine, and car.label is the same string
//   (2) a typed body is never replaced by another body word in the title; when the body was not read (bodyNote names it) the title carries no body word the expert did not type
// MUTANTS (each must fail): the typed body is not carried (the engine's sibling stands); the typed word is carried in the wrong case; the title is carried but car.label keeps the engine's word.
//   node scripts/deskTypedBodyCheck.mjs --mutants
import fs from "node:fs"; import path from "node:path"; import { pathToFileURL } from "node:url";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const W = await import("./_deskOlderWorld.mjs"); console.error = () => {};
const head = async () => ({ status: 200, bytes: 50000, type: "image/jpeg" });
const BODIES = ["coupe", "hardtop", "fastback", "roadster", "convertible", "cabriolet", "spider", "sedan", "suv", "targa", "wagon", "pickup"];
const SIB = { coupe: ["Coupe", "Hardtop", "Fastback"], hardtop: ["Coupe", "Hardtop", "Fastback"], fastback: ["Coupe", "Hardtop", "Fastback"], roadster: ["Roadster", "Convertible", "Cabriolet"], convertible: ["Roadster", "Convertible", "Cabriolet"], cabriolet: ["Roadster", "Convertible", "Cabriolet"] };
const DEMO996 = { n: 99, year: 2001, make: "Porsche", model: "911", typedBody: "Coupe", read: true, c12: 8, m12: 8, c24: 8, m24: 8, range12: [60000, 70000, 80000], rungCounts: [0, 0, 0, 0], comps: 0, compYears: [], rmodel: "996", rtrim: "Carrera" };
let seq = 0;
async function loadSheet(rewrite) {
  const mine = []; try {
    const tag = `__tbmut${++seq}_`; let src = fs.readFileSync(path.join(ROOT, "lib/sheetRead.js"), "utf8"); if (rewrite) { const [a, b] = rewrite; if (!src.includes(a)) throw new Error("mutant target missing: " + a.slice(0, 50)); src = src.replace(a, b); }
    src = src.replace(/from "\.\/(?!\.)/g, 'from "./').replace(/import\("\.\/(?!\.)/g, 'import("./');
    const f = path.join(ROOT, `lib/${tag}sheetRead.js`); fs.writeFileSync(f, src); mine.push(f);
    return await import(pathToFileURL(f).href);
  } finally { for (const f of mine) fs.rmSync(f, { force: true }); }
}
const readOf = (S, w, c, typed) => S.sheetRead(w.env, { year: c.year, make: c.make, model: c.model, mileage: 60000, bodyStyle: typed, desk: { caseDate: new Date().toISOString().slice(0, 10), transmission: "Manual", label: `${c.year} ${c.make} ${c.model}`, case: { verification: {} }, exclusions: [], head } }, w.deps).catch(e => ({ err: String(e) }));
const bodyWordsIn = t => (String(t).toLowerCase().match(/\b(coupe|hardtop|fastback|roadster|convertible|cabriolet|spider|sedan|suv|targa|wagon|pickup)\b/g) || []);
export async function findings(mut = {}) {
  const fails = [], S = await loadSheet(mut.sheet), cars = [...W.loadCars(ROOT), DEMO996]; let n = 0;
  for (const base of cars) {
    const typedList = new Set([base.typedBody, ...(SIB[String(base.typedBody).toLowerCase()] || [])]);
    for (const typed of typedList) {
      const c = { ...base, typedBody: typed }, w = W.install(ROOT, { cars: [c] }), r = await readOf(S, w, c, typed), d = r && r.desk, name = `${c.year} ${c.make} ${c.model} typed ${typed}`;
      if (!d || !d.evidence || !d.titleLine) continue;   // no Desk block is the other checks' business
      n++;
      const words = bodyWordsIn(d.titleLine), tl = typed.toLowerCase();
      if (d.bodyNote) { const strangers = words.filter(x => x !== tl); if (strangers.length) fails.push(`${name}: the body was not read (bodyNote) yet the title names ${strangers.join(", ")}: "${d.titleLine}"`); continue; }
      if (words.length && words[words.length - 1] !== tl) fails.push(`${name}: the typed body is replaced in the title: "${d.titleLine}"`);
      if (!words.length && BODIES.includes(tl) && tl !== "pickup") fails.push(`${name}: the typed body is missing from the title: "${d.titleLine}"`);
      { const want = tl === "suv" ? "SUV" : typed.charAt(0).toUpperCase() + typed.slice(1).toLowerCase(), got = String(d.titleLine).split(" ").pop(); if (words.length && got !== want) fails.push(`${name}: the body word reads "${got}", expected "${want}"`); }
      if (r.car.label !== d.titleLine) fails.push(`${name}: car.label "${r.car.label}" is not the title "${d.titleLine}"`);
    }
  }
  if (n < 40) fails.push(`only ${n} typed-body reads came back with a Desk block; the sweep is not reaching the cars`);
  return fails;
}
if (process.argv[1] && process.argv[1].endsWith("deskTypedBodyCheck.mjs")) {
  const MUTS = [
    ["the typed body is not carried (the engine's sibling stands)", { sheet: ['if (input.desk && hasDesk(a) && a.desk.titleLine && typedBody0 && !bodyFailed.length) {', 'if (false) {'] }],
    ["the typed word is carried in the wrong case", { sheet: ["typedBody0.charAt(0).toUpperCase() + typedBody0.slice(1).toLowerCase()) } };\n  }\n", "typedBody0.toLowerCase()) } };\n  }\n"] }],
    ["the title carries the typed word but car.label keeps the engine's", { sheet: ['label: (a.desk && a.desk.titleLine) ||', 'label: (a.desk && a.desk.titleLine && String(a.desk.titleLine).replace(/Hardtop|Fastback/, "Coupe")) ||'] }]
  ];
  const base = await findings(); for (const f of base.slice(0, 12)) console.log("FAIL  " + f);
  console.log(`${base.length ? "FAIL" : "PASS"}  a typed body is the body in the title and the label, for every typed body with a sibling, the 24 cars and the demo 996`);
  let surv = 0;
  if (process.argv.includes("--mutants")) for (const [n, m] of MUTS) { let f; try { f = await findings(m); } catch (e) { f = ["threw " + e.message]; } console.log(`${f.length ? "killed  " : "SURVIVED"}  ${n}`); if (!f.length) surv++; }
  console.log(`\ndeskTypedBodyCheck: ${base.length ? base.length + " FAIL" : "all pass"}${process.argv.includes("--mutants") ? (surv ? `, ${surv} mutant(s) survived` : ", all mutants killed") : ""}`);
  process.exit(base.length || surv ? 1 : 0);
}
