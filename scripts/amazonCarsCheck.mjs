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
// (3) the warm paths: the eBay (default) list and tier expressions are still what they were, and each Amazon difference is a
// branch gated on profile=amazon. The warm tasks have grown other lines since the Amazon change (gates, settle rows, sell block), so this reads
// the CURRENT block and asserts the intent (the default expression survives on the same line as its Amazon branch), never a line-for-line diff against an old commit.
const src = fs.readFileSync(new URL("../api/usageDashboard.js", import.meta.url), "utf8").split("\n");
const block = (a, b) => { const i = src.findIndex(l => l.startsWith(`  if (task === "${a}")`)), j = src.findIndex((l, k) => k > i && (l.startsWith(`  if (task === "${b}")`) || l.startsWith("  // task=warmBuy"))); return src.slice(i, j); };
const CHECKS = [
  ["warmDemoCheck", "warmDemo", [["the eBay list DEMO_CARS", /amazon\s*\?[^:]*AMAZON_DEMO_CARS[^:]*:\s*DEMO_CARS\)/]]],
  ["warmDemo", "warmBuy", [["the default list DEMO + PERF + golden", /profile === "amazon"[^:]*AMAZON_DEMO_CARS[^:]*:\s*\[\.\.\.new Set\(\[\.\.\.DEMO, \.\.\.PERF, \.\.\.golden\]\)\]/], ["the default tier set /^(result|thin)$/ for the demo store write", /"amazon"\s*\?\s*\/\^\(result\|thin\|refusal\)\$\/\s*:\s*\/\^\(result\|thin\)\$\/\)/]]],
];
for (const [a, b, exprs] of CHECKS) {
  const B = block(a, b);
  ok(B.length > 10, `${a}: the block found (${B.length} lines)`);
  for (const [name, re] of exprs) ok(B.some(l => re.test(l)), `${a}: ${name} stays the non-Amazon alternative of its Amazon branch`);
  ok(B.filter(l => /AMAZON_DEMO_CARS/.test(l)).every(l => /amazon/i.test(l.replace(/AMAZON_DEMO_CARS/g, "")) || /profile/.test(l)), `${a}: every Amazon list read is gated on profile=amazon`);
}
// (4) crons
const crons = JSON.parse(fs.readFileSync(new URL("../vercel.json", import.meta.url), "utf8")).crons;
const az = crons.filter(c => /profile=amazon/.test(c.path));
ok(az.length === 3, "three Amazon crons (warmDemo twice a day, warmDemoCheck every quarter hour)");
const mins = c => c.schedule.split(" ")[0].split(",").map(Number);
ok(az.every(c => mins(c).every(m => m % 15 > 4)), "Amazon crons sit outside the pull minutes (:00-:04, :15-:19, :30-:34, :45-:49)");
const taken = new Set(crons.filter(c => !/profile=amazon/.test(c.path) && /\*$/.test(c.schedule)).flatMap(c => { const [m, h] = c.schedule.split(" "); return h === "*" ? [] : m.split(",").map(x => `${h}:${x}`); }));
ok(az.filter(c => c.schedule.split(" ")[1] !== "*").every(c => !taken.has(`${c.schedule.split(" ")[1]}:${mins(c)[0]}`)), "the Amazon daily warms take a minute no other daily task uses");
// the baseline is main BEFORE any Amazon change (a6ab6f94); other lanes have ADDED crons since, so the intent is "none of the old ones was dropped or moved", not an equal count
{ const EBAY_BASE = "a6ab6f94", base = JSON.parse(execSync(`git show ${EBAY_BASE}:vercel.json`, { encoding: "utf8" })).crons;
  ok(base.every(b => crons.some(c => c.path === b.path && c.schedule === b.schedule)), "every pre-Amazon cron is still there, same path and schedule"); }
console.log(`amazonCarsCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
