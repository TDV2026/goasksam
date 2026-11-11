// clock: real-ok every time is built from the fixed NOW below; no real clock is read except as the default argument the calls here always override
// LIVE EXAMPLES ENDING SOON CHECK (Lane B, Nov 10 2026). CLASS: every picker that chooses a LIVE auction car for a public example (Home featured car, Find examples, Tasks demo, Watching demo) shares one rule (lib/live/endingSoon.js):
// an auction ending within 7 days is preferred (within 3 best); a car more than 14 days from its end is never picked while a car within 14 days qualifies. Cause of the 1999 Porsche 911 Carrera RUF Tribute (RM Sotheby's, January 2027) on Home:
// the choice ended in "longest time left" and the search read the table by end time descending. Market Check's examples are completed sales (no live car, no end), so the rule does not reach them: asserted below.
//   node scripts/liveExamplesSoonCheck.mjs          (--mutants breaks one thing at a time)
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { spawnSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const args = process.argv.slice(2), here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(args.find(a => !a.startsWith("--")) || path.join(here, ".."));
if (args.includes("--mutants")) process.exit(mutants());
process.chdir(root);
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) pass++; else { fail++; console.log("FAIL " + n + (d ? "  " + d : "")); } };
const imp = f => import(pathToFileURL(path.join(root, f)).href);
const E = await imp("lib/live/endingSoon.js"), FE = await imp("lib/live/findExamples.js"), RW = await imp("lib/reasonWords.js");
const NOW = Date.parse("2026-11-10T20:00:00Z"), DAY = 864e5, at = d => new Date(NOW + d * DAY).toISOString();
// (1) the bands and the cap
ok("(1) bands: 2 days is 0, 5 days is 1, 10 days is 2, 60 days is 3", [2, 5, 10, 60].map(d => E.soonBand(NOW + d * DAY, NOW)).join() === "0,1,2,3");
ok("(1) the cap keeps the cars within 14 days while any is, else all", E.capPool([{ end_time: at(60) }, { end_time: at(9) }], NOW).length === 1 && E.capPool([{ end_time: at(60) }, { end_time: at(30) }], NOW).length === 2);
// (2) the Find daily pick: a car at 60 days never beats a car at 2 days; a 60 day car is picked only when nothing within 14 days qualifies
const car = (id, make, source, days, extra = {}) => ({ row: { id, make, model: "X", year: 1995, source, end_time: at(days), first_seen: "2026-11-01T00:00:00Z", ...extra }, facts: { colour: "red", body: "coupe" }, sold: false, intel: { kind: "none" } });
{ const pool = [car(1, "Porsche", "bringatrailer", 60, {}), car(2, "BMW", "bringatrailer", 2), car(3, "Audi", "carsandbids", 60), car(4, "Ford", "carsandbids", 3), car(5, "Honda", "pcarmarket", 61), car(6, "Mazda", "pcarmarket", 4)];
  pool[0].sold = true; pool[2].sold = true; pool[4].sold = true;   // the far cars have the earlier sale: it must not beat the nearness
  const got = FE.pickDaily(pool, [], "2026-11-10", NOW).map(c => c.row.id).sort();
  ok("(2) Find: with three cars within 4 days and three at 60 days (the far ones sold before), the three near cars are picked", got.join() === "2,4,6", got.join());
  const two = FE.pickDaily(pool.filter(c => ![4, 6].includes(c.row.id)), [], "2026-11-10", NOW).map(c => c.row.id);
  ok("(2) Find: with one near car, it is in the pick; the far cars fill the rest only because nothing else qualifies", two.includes(2) && two.length === 3, two.join());
  const one = FE.chooseNext([pool[0], pool[1]], [], null, NOW);
  ok("(2) Find: chooseNext picks the 2 day car over the 60 day sold car", one.row.id === 2); }
// (3) the card's line is the engine's: Find items and the Home pick print pick.ends
ok("(3) pick.ends: 2 days out says Ends in 2 days; later today says Ends today; tomorrow says Ends tomorrow", RW.reasonLine("pick.ends", { endsAt: NOW + 2 * DAY, now: NOW }) === "Ends in 2 days" && RW.reasonLine("pick.ends", { endsAt: NOW + 3600e3, now: NOW }) === "Ends today" && RW.reasonLine("pick.ends", { endsAt: NOW + 20 * 3600e3, now: NOW }) === "Ends tomorrow", [RW.reasonLine("pick.ends", { endsAt: NOW + 2 * DAY, now: NOW }), RW.reasonLine("pick.ends", { endsAt: NOW + 3600e3, now: NOW }), RW.reasonLine("pick.ends", { endsAt: NOW + 20 * 3600e3, now: NOW })].join(" | "));
// (4) the sweep: every live picker imports the rule and reads the table nearest end first; the pages compute nothing
const src = f => fs.readFileSync(path.join(root, f), "utf8");
for (const f of ["lib/live/featuredHistory.js", "lib/live/findExamples.js", "lib/live/tasksDemo.js", "lib/live/watchingDemo.js"]) {
  const s = src(f);
  ok(`(4) ${f} uses lib/live/endingSoon.js`, /from "\.\/endingSoon\.js"/.test(s) && /soonBand|capPool/.test(s.replace(/import[^\n]*\n/, "")));
  ok(`(4) ${f} never reads the live table by end time descending (the farthest lots first, cut by a limit)`, !/order=end_time\.desc/.test(s));
}
ok("(4) the Market Check examples read no live listing (completed sales have no end)", !/live_listings|end_time/.test(src("lib/live/marketCheckExamples.js")));
for (const f of ["public/js/buy.js", "public/js/home.js", "public/js/tasks.js"]) if (fs.existsSync(path.join(root, f))) ok(`(4) ${f} builds no "Ends in" line itself`, !/["'`]Ends (in|today|tomorrow)/.test(src(f)));
console.log(`liveExamplesSoonCheck: ${fail ? fail + " FAIL" : "all pass"} (${pass})`); process.exit(fail ? 1 : 0);

function mutants() {
  const M = [
    ["lib/live/findExamples.js", ["const score = c => soonScore(c) + (!haveSold", "list = nearLeft() ? open.filter(c => withinCap(Date.parse(c.row.end_time), now)) : open,"], ["const score = c => (!haveSold", "list = open,"], "(2) Find: with three cars within 4 days"],
    ["lib/live/findExamples.js", 'if (makesIn(pool.filter(c => withinCap(Date.parse(c.row.end_time), now))) < MAX_ITEMS) pool = pool.concat(all.filter(c => !pool.includes(c) && withinCap(Date.parse(c.row.end_time), now)));', "", "(2) Find: with three cars within 4 days"],
    ["lib/live/findExamples.js", "&order=end_time.asc&limit=400", "&order=end_time.desc&limit=400", "(4) lib/live/findExamples.js never reads"],
    ["lib/live/tasksDemo.js", "&order=end_time.asc&limit=400", "&order=end_time.desc&limit=400", "(4) lib/live/tasksDemo.js never reads"],
    ["lib/live/endingSoon.js", "d <= BEST_DAYS ? 0 : d <= SOON_DAYS ? 1 : d <= CAP_DAYS ? 2 : 3", "d <= BEST_DAYS ? 0 : d <= SOON_DAYS ? 1 : d <= 90 ? 2 : 3", "(1) bands"],
    ["lib/live/endingSoon.js", "return near.length ? near : list;", "return list;", "(1) the cap keeps"],
    ["lib/reasonWords.js", "n <= 0 ? \"Ends today\"", "n <= 0 ? \"Live now\"", "(3) pick.ends"],
    ["lib/live/watchingDemo.js", 'import { soonBand, capPool } from "./endingSoon.js";', "", "(4) lib/live/watchingDemo.js uses"]
  ];
  let bad = 0;
  for (const [file, from, to, name] of M) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lesm-"));
    for (const d of ["lib", "api", "scripts", "public"]) fs.cpSync(path.join(root, d), path.join(tmp, d), { recursive: true, filter: s => !/node_modules/.test(s) });
    for (const f of ["vercel.json", "package.json"]) if (fs.existsSync(path.join(root, f))) fs.copyFileSync(path.join(root, f), path.join(tmp, f));
    fs.symlinkSync(path.join(root, "node_modules"), path.join(tmp, "node_modules"));
    const fp = path.join(tmp, file), srcText = fs.readFileSync(fp, "utf8");
    const FR = [].concat(from), TO = [].concat(to); if (!FR.every(x => srcText.includes(x))) { console.log("MUTANT BROKEN: " + name); bad++; continue; }
    let mut = srcText; FR.forEach((x, i) => { mut = mut.replace(x, TO[i]); }); fs.writeFileSync(fp, mut);
    const r = spawnSync("node", [path.join(tmp, "scripts/liveExamplesSoonCheck.mjs"), tmp], { encoding: "utf8", timeout: 120000 }), out = (r.stdout || "") + (r.stderr || "");
    const named = out.split("\n").some(l => l.startsWith("FAIL") && l.includes(name));
    if (!(r.status !== 0 && named)) { console.log(`MUTANT SURVIVED: ${name}`); out.split("\n").slice(0, 4).forEach(l => console.log("   " + l.slice(0, 160))); bad++; }
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`liveExamplesSoonCheck mutants: ${M.length - bad} of ${M.length} killed${bad ? `, ${bad} SURVIVED` : ""}`);
  return bad ? 1 : 0;
}
