// clock: real-ok the world's sales are dated relative to now (Lane B, Nov 2026)
// DESK V4 STAGE 5, COMPARABLES, LIVE, QUARTERS AND THE HEADER (Lane B, Nov 10 2026):
//   (1) desk.titleLine is the engine's own title of the car and not the typed label; desk.specLine is the classified gearbox, body, generation, miles and rung
//   (2) every comparable row has a url key, and a photo that is null when the listing has none or failed the rule, never a substitute
//   (3) every live row has a url key; every quarter has a count and a shown flag, and a quarter under the minimum is not shown and has no median
//   node scripts/deskHeaderCheck.mjs [root]     --mutants proves each rule by breaking it in a copy
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { fileURLToPath, pathToFileURL } from "node:url"; import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), rootArg = args.find(a => !a.startsWith("--")), ROOT = path.resolve(rootArg || path.join(here, ".."));
if (args.includes("--mutants")) {
  const DV = "lib/deskV3.js", OB = "lib/onebox.js";
  const muts = [
    [OB, "titleLine: titleLineOf(d.resolvedCar), tier,", "titleLine: (cfg.subject && cfg.subject.label) || null, tier,", "(1) the title is the typed label"],
    [DV, "specLine: specLineOf(sub, desk),", "specLine: null,", "(1) no spec line"],
    [DV, "photo: photos[i] || null, relevance: o.rel", "photo: photos[i] || o.r.photo || \"/img/placeholder.png\", relevance: o.rel", "(2) a comparable without a passing photo gets a placeholder"],
    [DV, "url: o.r.url || null, photo: photos[i]", "photo: photos[i]", "(2) a comparable without a link key"],
    [DV, "shown = ps.length >= min;", "shown = ps.length >= 1;", "(3) a thin quarter is shown"],
    [DV, "median: shown ? quant(ps, 0.5) : null, count: ps.length, shown });", "median: quant(ps, 0.5), count: ps.length, shown });", "(3) a thin quarter has a median"],
    [DV, "ends: r.end_time || null, url: r.listing_url || r.url || null };", "ends: r.end_time || null };", "(3) a live row without a link key"]
  ];
  let survivors = 0;
  for (const [file, from, to, want] of muts) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dhc-"));
    spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", ROOT + "/", dir + "/"]); fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"));
    const fp = path.join(dir, file), src = fs.readFileSync(fp, "utf8"), m = src.replace(from, to);
    if (m === src) { console.log(`MUTANT NOT APPLIED  ${want}`); survivors++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
    fs.writeFileSync(fp, m);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/deskHeaderCheck.mjs"), dir], { encoding: "utf8" }), killed = r.status !== 0;
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
const w = W.install(); const quiet = console.error; console.error = () => {};
const today = new Date().toISOString().slice(0, 10);
const head = async u => (/9\.jpg$/.test(u) ? { status: 200, bytes: 3100000, type: "image/jpeg" } : /0\.jpg$/.test(u) ? { status: 404, bytes: null, type: "" } : { status: 200, bytes: 90000, type: "image/jpeg" });
for (const c of W.CASES) {
  const typed = c.label + " (typed by the analyst)";
  const sh = await S.sheetRead(w.env, { year: c.year, make: c.make, model: c.model, mileage: 40000, tier: 3, desk: { caseDate: today, transmission: c.transmission, label: typed, head } }, w.deps), d = sh && sh.desk;
  if (!d) { ok(`${c.model}: a desk block`, false); continue; }
  ok(`${c.model}: titleLine is the engine's title (year, make, model), not the typed label`, typeof d.titleLine === "string" && d.titleLine.includes(String(c.year)) && d.titleLine.includes(c.make) && d.titleLine !== typed && !/typed/.test(d.titleLine), d.titleLine);
  ok(`${c.model}: specLine holds the classified gearbox, the miles and the rung, with no dash`, typeof d.specLine === "string" && /miles/.test(d.specLine) && /Good/.test(d.specLine) && /^(Manual|Automatic)/.test(d.specLine) && !/[–—]/.test(d.specLine), d.specLine);
  ok(`${c.model}: every comparable has a url key, and a photo that is null or one that passed the rule`, d.comparables.length > 0 && d.comparables.every(x => "url" in x && (x.url === null || /^https?:/.test(x.url)) && (x.photo === null || (/^https:/.test(x.photo) && !/9\.jpg$/.test(x.photo) && !/0\.jpg$/.test(x.photo)) )) && d.comparables.every(x => !/placeholder|noimage|default|blank/i.test(String(x.photo))), String(d.comparables.length));
  ok(`${c.model}: every quarter has a count and a shown flag; a quarter under the minimum is not shown and has no median`, d.quarters.length > 0 && d.quarters.every(x => typeof x.count === "number" && typeof x.shown === "boolean" && (x.count >= DV.DESK_QUARTER_MIN_DEFAULT) === x.shown && (x.shown ? x.median > 0 : x.median === null)), JSON.stringify(d.quarters.map(x => [x.count, x.shown])));
}
{ const live = DV.liveOf([{ listing_title: "a", platform: "BaT", current_bid_usd: 40000, end_time: "2026-11-12", listing_url: "https://l.test/a" }, { title: "b", source: "cars", ask_price_usd: 50000, url: "https://l.test/b" }, { listing_title: "c", status: "no sale", current_bid_usd: 30000 }]);
  ok("(3) every live row has a url key: the listing's link, or null when it has none", live.length === 3 && live.every(x => "url" in x) && live[0].url === "https://l.test/a" && live[1].url === "https://l.test/b" && live[2].url === null, JSON.stringify(live.map(x => x.url)));
  const rows = [{ id: "a", price: 50000, date: "2026-10-01", url: null, photo: null, year: 1999, generation: "996", body: "coupe", gearbox: "manual", miles: 40000, inPopulation: true, platform: "BaT" }];
  const comps = await DV.comparablesOf(rows, { year: 1999, generation: "996", body: "coupe", gearbox: "manual", miles: 40000 }, head);
  ok("(2) a listing with no photo and no link: photo null, url null, the keys present", comps.length === 1 && comps[0].photo === null && comps[0].url === null && "url" in comps[0] && "photo" in comps[0]);
}
console.error = quiet;
console.log(`\ndeskHeaderCheck: ${n - failed} pass, ${failed} FAIL`); process.exit(failed ? 1 : 0);
