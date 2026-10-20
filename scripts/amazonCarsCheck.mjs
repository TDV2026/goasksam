// Amazon revision 2 item 6 (Lane E, Oct 20 2026): the Amazon demo's own car list. OFFLINE, no network, no env.
// Proves: (1) DEMO_CARS (eBay) is unchanged; (2) the stored-answer store accepts both lists and nothing else;
// (3) the eBay warm paths are byte-identical to main apart from the added Amazon branch; (4) the Amazon crons sit
// outside the pull minutes and clear of the existing warms. Run: node scripts/amazonCarsCheck.mjs
import fs from "node:fs";
import { execSync } from "node:child_process";
const { DEMO_CARS, refreshDemoAnswer } = await import("../api/partnerAnswer.js");
const { AMAZON_DEMO_CARS } = await import("../api/_amazonDemoCars.js");
let fail = 0, pass = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const EBAY = ["2014 Porsche 911 GT3", "2015 Porsche 911 GT3", "2005 Porsche 911", "1965 Ford Mustang", "1957 Porsche 356 Speedster", "1966 Ferrari 275 GTB", "2023 Porsche 911 GT3"];
ok(JSON.stringify(DEMO_CARS) === JSON.stringify(EBAY), "DEMO_CARS (eBay) is unchanged, same cars, same order");
ok(AMAZON_DEMO_CARS.length === 7 && new Set(AMAZON_DEMO_CARS.map(c => c.toLowerCase())).size === 7, "the Amazon list holds seven distinct cars");
ok(AMAZON_DEMO_CARS.every(c => !EBAY.some(e => e.toLowerCase() === c.toLowerCase())), "no Amazon car is an eBay car (the two stores never share a row)");
ok(AMAZON_DEMO_CARS.every(c => !/[–—]/.test(c)), "no dash characters in the Amazon names");
for (const c of [...EBAY, ...AMAZON_DEMO_CARS]) { const r = await refreshDemoAnswer(null, c); ok(r.why === "no env", `${c}: the store accepts it (why=${r.why})`); }
for (const c of ["2018 Toyota Camry", "2016 Mercedes-Benz E-Class", "1969 Chevrolet Camaro"]) { const r = await refreshDemoAnswer(null, c); ok(r.why === "not a demo car", `${c}: the store refuses it (why=${r.why})`); }
// (3) the warm paths: every line main had is still there, verbatim, except the three lines each widened by an Amazon branch,
// and each of those still carries main's eBay expression unchanged.
const before = execSync("git show origin/main:api/usageDashboard.js", { encoding: "utf8" }).split("\n");
const after = fs.readFileSync(new URL("../api/usageDashboard.js", import.meta.url), "utf8").split("\n");
const block = (L, a, b) => { const i = L.findIndex(l => l.startsWith(`  if (task === "${a}")`)), j = L.findIndex((l, k) => k > i && l.startsWith(`  if (task === "${b}")`) || (k > i && l.startsWith("  // task=warmBuy"))); return L.slice(i, j); };
for (const [a, b] of [["warmDemoCheck", "warmDemo"], ["warmDemo", "warmBuy"]]) {
  const B = block(before, a, b), A = block(after, a, b), set = new Set(A);
  const missing = B.filter(l => !set.has(l));
  ok(B.length > 10, `${a}: main's block found (${B.length} lines)`);
  ok(missing.length === 1, `${a}: exactly one of main's lines was widened (${missing.length}: ${missing.map(m => m.trim().slice(0, 60)).join(" | ")})`);
  const kept = { warmDemoCheck: "DEMO_CARS)) {", warmDemo: ': [...new Set([...DEMO, ...PERF, ...golden])];' }[a];
  ok(missing.every(m => A.some(l => l.includes(kept) && l.includes('profile === "amazon"') || l.includes(kept) && l.includes("amazon ?"))), `${a}: the widened line still carries main's eBay expression and only adds the Amazon branch`);
  ok(A.filter(l => !B.includes(l)).every(l => /amazon/i.test(l)), `${a}: every added line is the Amazon branch`);
}
// (4) crons
const crons = JSON.parse(fs.readFileSync(new URL("../vercel.json", import.meta.url), "utf8")).crons;
const az = crons.filter(c => /profile=amazon/.test(c.path));
ok(az.length === 3, "three Amazon crons (warmDemo twice a day, warmDemoCheck every quarter hour)");
const mins = c => c.schedule.split(" ")[0].split(",").map(Number);
ok(az.every(c => mins(c).every(m => m % 15 > 4)), "Amazon crons sit outside the pull minutes (:00-:04, :15-:19, :30-:34, :45-:49)");
const taken = new Set(crons.filter(c => !/profile=amazon/.test(c.path) && /\*$/.test(c.schedule)).flatMap(c => { const [m, h] = c.schedule.split(" "); return h === "*" ? [] : m.split(",").map(x => `${h}:${x}`); }));
ok(az.filter(c => c.schedule.split(" ")[1] !== "*").every(c => !taken.has(`${c.schedule.split(" ")[1]}:${mins(c)[0]}`)), "the Amazon daily warms take a minute no other daily task uses");
ok(crons.filter(c => !/profile=amazon/.test(c.path)).length === JSON.parse(execSync("git show origin/main:vercel.json", { encoding: "utf8" })).crons.length, "every existing cron is still there");
console.log(`amazonCarsCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
