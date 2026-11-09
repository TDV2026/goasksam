// clock: real-ok the fixture sales are dated relative to now (days ago); the unit cases name their own dates (Lane B, Nov 2026)
// DESK V3 STAGE 3, QUARTERS AND LIVE LISTINGS (Lane B, Nov 8 2026). desk.quarters [{ label, median, count, shown }]: a quarter under DESK_QUARTER_MIN (default 3) sales has shown false and NO median, so the page draws nothing for it.
// desk.live [{ title, platform, type, figure, ends, url }]: type bid, ask or no_sale; live listings are never in the evidence or the comparables.
//   node scripts/deskQuarterCheck.mjs [root]     --mutants proves each rule by breaking it in a copy
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { fileURLToPath, pathToFileURL } from "node:url"; import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), rootArg = args.find(a => !a.startsWith("--")), ROOT = path.resolve(rootArg || path.join(here, ".."));
if (args.includes("--mutants")) {
  const DV = "lib/deskV3.js";
  const muts = [
    [DV, "shown = ps.length >= min;", "shown = true;", "a quarter under the minimum is shown"],
    [DV, "shown = ps.length >= min;", "shown = ps.length > min;", "the minimum itself is not shown"],
    [DV, "median: shown ? quant(ps, 0.5) : null, count: ps.length, shown", "median: quant(ps, 0.5), count: ps.length, shown", "a quarter that is not shown still carries a median"],
    [DV, "export const DESK_QUARTER_MIN_DEFAULT = 3,", "export const DESK_QUARTER_MIN_DEFAULT = 2,", "the default minimum is not 3"],
    [DV, "for (let k = lo; k <= hi; k++) {", "for (let k = Math.max(lo, hi - 1); k <= hi; k++) {", "quarters are dropped from the run"],
    [DV, "const type = /no.?sale|unsold|reserve.?not/i.test(status) ? \"no_sale\" : (!r.end_time && ask && !bid) ? \"ask\" : \"bid\";", "const type = \"bid\";", "an ask or a no sale is typed a bid"],
    ["lib/sheetRead.js", "desk: a.desk ? { ...a.desk, live: liveOf(liveRows) } : null,", "desk: a.desk ? { ...a.desk, live: liveOf(liveRows), comparables: [...a.desk.comparables, ...liveOf(liveRows).map(l => ({ id: l.url, inPopulation: true, relevance: \"close\" }))] } : null,", "a live listing is put into the comparables"]
  ];
  let survivors = 0;
  for (const [file, from, to, want] of muts) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dqc-"));
    spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", ROOT + "/", dir + "/"]); fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"));
    const fp = path.join(dir, file), src = fs.readFileSync(fp, "utf8"), m = src.replace(from, to);
    if (m === src) { console.log(`MUTANT NOT APPLIED  ${want}`); survivors++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
    fs.writeFileSync(fp, m);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/deskQuarterCheck.mjs"), dir], { encoding: "utf8" }), killed = r.status !== 0;
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
const w = W.install(); console.error = () => {};
const sale = (date, price) => ({ date, price });
{ // unit: the boundary at the minimum
  const rows = [sale("2026-01-05", 40000), sale("2026-02-05", 41000), sale("2026-03-05", 42000), sale("2026-04-05", 50000), sale("2026-05-05", 52000), sale("2026-08-05", 60000), sale("2026-08-20", 61000), sale("2026-09-01", 62000)];
  const q = DV.quartersOf(rows);
  ok("quarters run from the first to the last, with the labels", q.map(x => x.label).join(",") === "Q1 2026,Q2 2026,Q3 2026", q.map(x => x.label).join(","));
  ok("three sales is shown, with a median", q[0].count === 3 && q[0].shown === true && q[0].median === 41000);
  ok("two sales is not shown and carries no median", q[1].count === 2 && q[1].shown === false && q[1].median === null);
  ok("three sales in Q3 is shown", q[2].shown === true && q[2].median === 61000);
  ok("a quarter with no sale in the run is count 0, not shown, no median", (() => { const g = DV.quartersOf([sale("2026-01-05", 1), sale("2026-02-05", 1), sale("2026-03-05", 1), sale("2026-10-05", 1)]); return g.length === 4 && g[1].count === 0 && !g[1].shown && g[1].median === null; })());
  ok("DESK_QUARTER_MIN changes the minimum", DV.quartersOf(rows, { DESK_QUARTER_MIN: 2 })[1].shown === true && DV.quartersOf(rows, { DESK_QUARTER_MIN: 4 })[0].shown === false);
  ok("only the latest eight quarters are returned", DV.quartersOf(Array.from({ length: 12 }, (_, i) => sale(`${2023 + Math.floor(i / 4)}-${String((i % 4) * 3 + 1).padStart(2, "0")}-10`, 1000))).length === 8);
  ok("no sales gives no quarters", DV.quartersOf([]).length === 0);
}
const c0 = W.CASES[0], today = new Date().toISOString().slice(0, 10);
const liveRows = [{ listing_title: "1999 Porsche 911 Carrera", source: "bringatrailer", current_bid_usd: 41000, end_time: "2026-11-12T18:00:00Z", url: "https://live.example/a", status: "live" },
  { listing_title: "1999 Porsche 911 Carrera", source: "carsandbids", current_bid_usd: 0, end_time: null, ask_price_usd: 45000, url: "https://live.example/b", status: "live" },
  { listing_title: "1999 Porsche 911 Carrera", source: "bringatrailer", current_bid_usd: 36000, end_time: "2026-11-06T18:00:00Z", url: "https://live.example/c", status: "ended_no_sale" }];
const depsLive = { ...w.deps, liveFor: async () => ({ rows: liveRows, total: 3 }), bodyOfRow: () => "coupe" };
const withLive = await S.sheetRead(w.env, { year: c0.year, make: c0.make, model: c0.model, mileage: 61400, desk: { caseDate: today, transmission: "Manual" } }, depsLive);
const noLive = await S.sheetRead(w.env, { year: c0.year, make: c0.make, model: c0.model, mileage: 61400, desk: { caseDate: today, transmission: "Manual" } }, w.deps);
const d = withLive.desk;
ok("desk.quarters on the 996 read: shown false means no median, shown true means a median and 3 or more sales", d.quarters.length > 0 && d.quarters.every(q => q.shown ? q.median > 0 && q.count >= 3 : q.median === null && q.count < 3), JSON.stringify(d.quarters));
ok("the quarters add up to the evidence count", d.quarters.reduce((a, q) => a + q.count, 0) <= d.evidence.count && d.quarters.reduce((a, q) => a + q.count, 0) >= d.evidence.count - 4, `${d.quarters.reduce((a, q) => a + q.count, 0)} of ${d.evidence.count}`);
ok("desk.live types a bid, an ask and a no sale, with the figure and the end", d.live.length === 3 && d.live[0].type === "bid" && d.live[0].figure === 41000 && d.live[1].type === "ask" && d.live[1].figure === 45000 && d.live[2].type === "no_sale" && d.live[2].figure === 36000 && d.live[0].ends === "2026-11-12T18:00:00Z" && d.live[0].url === "https://live.example/a");
ok("every live row has the shape's fields", d.live.every(l => ["title", "platform", "type", "figure", "ends", "url"].every(k => k in l)));
ok("live listings are never in the evidence: the same evidence with and without live rows", JSON.stringify(d.evidence) === JSON.stringify(noLive.desk.evidence));
ok("live listings are never in the comparables", d.comparables.length === noLive.desk.comparables.length && !d.comparables.some(c => /live\.example/.test(String(c.url)) || /live\.example/.test(String(c.id))));
ok("with no live rows desk.live is an empty list", Array.isArray(noLive.desk.live) && noLive.desk.live.length === 0);
console.log("\ndeskQuarterCheck: " + (n - failed) + " pass, " + failed + " FAIL"); process.exit(failed ? 1 : 0);
