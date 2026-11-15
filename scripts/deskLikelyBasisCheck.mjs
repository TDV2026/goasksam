// clock: real-ok the fixture sales are dated relative to now; no calendar date is asserted (Lane B, Nov 14 2026)
// DESK LIKELY BASIS (Lane B, Nov 14 2026, for Lane D's desk.likely; narrowed after pv_hm). desk.likelyBasis = { median, low, high, count, ids } is the engine's figure over the NEAREST comparables only: the rows of desk.comparables ranked in the top relevance tier (relevance close: year, gearbox, miles), in rank order, at most 8;
// under three in that tier it is extended down the ranking (skipping a sale of another gearbox) to reach three; fewer than three reachable: median, low and high null, count says the number. At the top of desk (the current view) and in every desk.views entry. No page or model computes it.
// CLASS: any view of any car. This check reads two cars (the 1999 911 case Lane D's workflow checks use, and an older car), unpacks EVERY view (15 each) and the top, and compares the field with the view's own comparables, by an independent median.
// MUTANTS (each must fail): the median is the whole population's; the ids are the sales'; the ids are re-sorted; the count is the sales'; a view carries none; the null floor is gone; low and high are the population's.
//   node scripts/deskLikelyBasisCheck.mjs [root]    --mutants
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { fileURLToPath, pathToFileURL } from "node:url"; import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url)), args = process.argv.slice(2), ROOT = path.resolve(args.find(a => !a.startsWith("--")) || path.join(here, ".."));
if (args.includes("--mutants")) {
  const DV = "lib/deskV3.js", muts = [
    [DV, "(!cut || (iso(c.soldDate) && iso(c.soldDate) >= cut))", "(true)", "an old top-tier sale is let into the set (no window)"],
    [DV, "months: likelyWindowOf(windowsOf(rowsCalc, when)) }", "months: 3 }", "the window is the shortest, not the longest the case offers"],
    [DV, "const list = nearestComparables(comparables, win), prices", "const list = (Array.isArray(comparables) ? comparables : []), prices", "every comparable is taken, not the nearest"],
    [DV, ".slice(0, LIKELY_CAP);", ".slice(0, 99);", "the cap of 8 is gone"],
    [DV, "if (set.length < LIKELY_MIN) for", "if (false) for", "a short top tier is not extended"],
    [DV, " && c.inPopulation !== false) set.push(c);", ") set.push(c);", "the extension takes a sale of another gearbox"],
    [DV, "list.filter(c => c.relevance === \"close\")", "list.filter(c => c)", "the top relevance tier is ignored (the first rows of the list)"],
    [DV, "ids: list.map(c => c.id) };", "ids: list.map(c => c.id).reverse() };", "the ids are in another order than desk.comparables"],
    [DV, "count: list.length, ids", "count: list.length + 1, ids", "the count is not the comparables'"],
    [DV, "ok = list.length >= LIKELY_MIN && prices.length >= LIKELY_MIN", "ok = list.length >= 1", "the null floor is gone"],
    [DV, "low: ok ? prices[0] : null", "low: ok ? prices[1] : null", "low is not the lowest"],
    [DV, "high: ok ? prices[prices.length - 1] : null", "high: ok ? prices[prices.length - 2] : null", "high is not the highest"],
    [DV, "likelyBasis = likelyBasisOf(comparables, { when, months: likelyWindowOf(windowsOf(rowsCalc, when)) }), evidenceOut", "likelyBasis = likelyBasisOf(comparables.slice(0, 2)), evidenceOut", "the basis covers only part of the list"],
    [DV, "likelyBasis = likelyBasisOf(comparables, { when, months: likelyWindowOf(windowsOf(rowsCalc, when)) }), evidenceOut", "likelyBasis = { ...likelyBasisOf(comparables), median: evidence.median, low: evidence.q1, high: evidence.q3 }, evidenceOut", "the median and range are taken from the whole population"],
    [DV, "likelyBasis = likelyBasisOf(comparables, { when, months: likelyWindowOf(windowsOf(rowsCalc, when)) }), evidenceOut", "likelyBasis = likelyBasisOf(sales), evidenceOut", "the basis is read over the sales, not the comparables"],
    [DV, "likelyBasis = likelyBasisOf(comparables, { when, months: likelyWindowOf(windowsOf(rowsCalc, when)) }), evidenceOut", "likelyBasis = null, evidenceOut", "no basis at all"]
  ];
  let survivors = 0;
  for (const [file, from, to, want] of muts) { if (!want) continue;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dlb-"));
    spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", ROOT + "/", dir + "/"]); fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"));
    const fp = path.join(dir, file), src = fs.readFileSync(fp, "utf8"), m = src.replace(from, to);
    if (m === src) { console.log(`MUTANT NOT APPLIED  ${want}`); survivors++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
    fs.writeFileSync(fp, m);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/deskLikelyBasisCheck.mjs"), dir], { encoding: "utf8" }), killed = r.status !== 0;
    console.log(`${killed ? "killed  " : "SURVIVED"}  ${want}`); if (!killed) survivors++;
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(survivors ? `\n${survivors} mutant(s) survived` : "\nall mutants killed"); process.exit(survivors ? 1 : 0);
}
process.chdir(ROOT);
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) pass++; else { fail++; console.log("FAIL " + n + (d ? " :: " + d : "")); } };
const J = x => JSON.stringify(x);
const { setup } = await imp("scripts/_deskCaseWorld.mjs");
const { readyCase } = await setup(ROOT);
const DV = await imp("lib/deskV3.js");
const base = await readyCase();
const cases = [{ name: "1999 Porsche 911 Carrera (the case world)", desk: base.desk }];
// the second car: an older car through the older-cars world, asked for its views
const WLD = await imp("scripts/_deskOlderWorld.mjs"), S = await imp("lib/sheetRead.js"); console.error = () => {};
const head = async () => ({ status: 200, bytes: 50000, type: "image/jpeg" }), today = new Date().toISOString().slice(0, 10), w = WLD.install(ROOT), old = WLD.loadCars(ROOT).find(c => c.n === 4);
const r4 = await S.sheetRead(w.env, { year: old.year, make: old.make, model: old.model, mileage: 60000, bodyStyle: old.typedBody || undefined, desk: { caseDate: today, transmission: "Manual", label: "x", case: { verification: {} }, exclusions: [], head, views: true } }, w.deps);
cases.push({ name: `${old.year} ${old.make} ${old.model} (an older car)`, desk: r4 && r4.desk });
// independent median: the middle of the sorted prices, the mean of the two middles rounded
const med = a => { const s = a.slice().sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : Math.round((s[n / 2 - 1] + s[n / 2]) / 2); };
let views = 0, thin = 0, differs = 0, served = 0, bigger = 0, leftOut = 0;
// the nearest set, derived here independently of the engine: the close tier in list order, at most 8; under 3, the next rows in list order that are in the population
const nearest = (all, cut) => { const comps = all.filter(c => c.soldDate && c.soldDate >= cut), set = comps.filter(c => c.relevance === "close").slice(0, 8); if (set.length < 3) for (const c of comps) { if (set.length >= 3) break; if (!set.includes(c) && c.inPopulation !== false) set.push(c); } return set; };
function judge(label, lb, comps, wholeMedian, cut) {
  views++;
  if (!lb || typeof lb !== "object") return ok(`${label}: desk.likelyBasis is an object`, false, J(lb));
  if (comps.some(c => c.relevance === "close" && !(c.soldDate && c.soldDate >= cut))) leftOut++;
  const set = nearest(comps, cut), ids = set.map(c => c.id), prices = set.map(c => Number(c.price));
  ok(`${label}: the ids are the nearest comparables' ids in rank order`, J(lb.ids) === J(ids), `${(lb.ids || []).length} vs ${ids.length}`);
  ok(`${label}: never more than 8 rows, every id is one of the comparables, and the close tier comes first`, lb.ids.length <= 8 && lb.ids.every(i => comps.some(c => c.id === i && c.soldDate >= cut)) && (set.filter(c => c.relevance === "close").length >= 3 ? set.every(c => c.relevance === "close") : true));
  ok(`${label}: count is the number of those rows`, lb.count === set.length, `${lb.count} vs ${set.length}`);
  if (comps.length > 8) bigger++;
  if (set.length < 3) { thin++; ok(`${label}: under three rows, median, low and high are null`, lb.median === null && lb.low === null && lb.high === null && lb.count === set.length, J(lb)); return; }
  ok(`${label}: median, low and high are of those rows' prices only`, lb.median === med(prices) && lb.low === Math.min(...prices) && lb.high === Math.max(...prices), `${J({ m: lb.median, l: lb.low, h: lb.high })} vs ${med(prices)} ${Math.min(...prices)} ${Math.max(...prices)}`);
  if (wholeMedian != null && lb.median !== wholeMedian) differs++;
}
for (const c of cases) {
  const d = c.desk; ok(`${c.name}: the engine read carries views`, !!d && DV.hasViews(d) && Object.keys(d.views).length >= 3, Object.keys((d && d.views) || {}).length + " views");
  if (!d) continue;
  const cut = DV.cutoffOf(d.caseDate || today, DV.likelyWindowOf(d.windows));   // the longest window the case offers (12 months, 24 when offered)
  judge(`${c.name}, top of desk`, d.likelyBasis, d.comparables || [], d.evidence && d.evidence.median, cut);
  for (const key of Object.keys(d.views || {})) { const v = DV.viewOf(d, key), from = v && v.likelyBasis && v.likelyBasis.servedFrom, src = from ? DV.viewOf(d, from) : v;   // a thin view is priced from its fallback view (desk.reserveLadder.fallbackView): its basis is that view's comparables
    if (from) served++; judge(`${c.name}, view ${key}${from ? " (served from " + from + ")" : ""}`, v && v.likelyBasis && (({ servedFrom, ...r }) => r)(v.likelyBasis), (src && src.comparables) || [], src && src.evidence && src.evidence.median, cut); }
  const cur = d.view && d.views && d.views[DV.viewKey(d.view.tier, d.view.months)]; if (cur) ok(`${c.name}: the top of desk equals the current view's basis`, J(cur.likelyBasis) === J(d.likelyBasis));
}
// the rule at the unit: ranked rows built to trigger each branch (the real views hold at most 8 close rows, so the cap and the extension are shown here)
{ const U = DV.likelyBasisOf, row = (i, rel, p, inPop = true) => ({ id: "s" + i, relevance: rel, price: p, inPopulation: inPop }), rows = (n, rel, base = 0) => Array.from({ length: n }, (_, i) => row(base + i, rel, 30000 + (base + i) * 1000));
  { const b = U([...rows(12, "close"), ...rows(10, "similar", 12)]); ok("unit: twelve close rows and ten more: only the first 8 close rows, in rank order", b.count === 8 && J(b.ids) === J(rows(8, "close").map(r => r.id)) && b.low === 30000 && b.high === 37000 && b.median === 33500, J(b)); }
  { const b = U([...rows(5, "close"), ...rows(20, "similar", 5)]); ok("unit: five close rows among twenty-five comparables: five, never the whole list", b.count === 5 && J(b.ids) === J(rows(5, "close").map(r => r.id)) && b.median === 32000, J(b)); }
  { const b = U([...rows(2, "close"), row(2, "similar", 99000, false), row(3, "similar", 40000), row(4, "similar", 50000)]); ok("unit: two close rows are extended down the ranking to three, skipping a sale of another gearbox", b.count === 3 && J(b.ids) === J(["s0", "s1", "s3"]) && b.median === 31000 && b.high === 40000, J(b)); }
  { const b = U([row(0, "close", 30000), row(1, "similar", 99000, false), row(2, "similar", 99000, false)]); ok("unit: fewer than three reachable: count states the number, figures null", b.count === 1 && b.median === null && b.low === null && b.high === null && J(b.ids) === J(["s0"]), J(b)); }
  for (const n of [0, 1, 2]) { const b = U(rows(n, "close")); ok(`unit: ${n} comparables in all: median, low and high null, count ${n}`, b.median === null && b.low === null && b.high === null && b.count === n && b.ids.length === n, J(b)); }
  const b3 = U(mk3()); ok("unit: three close rows: figures, ids in the given order", b3.median === 30000 && b3.low === 20000 && b3.high === 50000 && b3.count === 3 && J(b3.ids) === J(["s0", "s1", "s2"]), J(b3)); }
function mk3() { return [50000, 20000, 30000].map((p, i) => ({ id: "s" + i, relevance: "close", price: p, inPopulation: true })); }
// the window at the unit: an old sale of the top tier is left out however near it is; the rank, cap and extension work inside the window; under three inside it keeps the null rule
{ const when = "2026-11-14", win = { when, months: 12 }, old = DV.cutoffOf(when, 13), inside = DV.cutoffOf(when, 2), mkc = (i, rel, price, date, inPop = true) => ({ id: "w" + i, relevance: rel, price, soldDate: date, inPopulation: inPop });
  { const b = DV.likelyBasisOf([mkc(0, "close", 99000, old), mkc(1, "close", 30000, inside), mkc(2, "close", 31000, inside), mkc(3, "close", 32000, inside)], win); ok("window unit: an old top-tier sale ($99,000, 13 months back) is left out of the set and the figures", b.count === 3 && !b.ids.includes("w0") && b.high === 32000 && b.median === 31000, J(b)); }
  { const b = DV.likelyBasisOf([mkc(0, "close", 99000, old), mkc(1, "close", 30000, inside), mkc(2, "similar", 31000, old), mkc(3, "similar", 32000, inside), mkc(4, "similar", 33000, inside)], win); ok("window unit: a short top tier is extended inside the window only (the old similar sale is skipped)", J(b.ids) === J(["w1", "w3", "w4"]) && b.count === 3, J(b)); }
  { const b = DV.likelyBasisOf([mkc(0, "close", 99000, old), mkc(1, "close", 98000, old), mkc(2, "close", 30000, inside), mkc(3, "similar", 31000, inside)], win); ok("window unit: fewer than three inside the window keeps the null rule, count states the number", b.count === 2 && b.median === null && b.low === null && b.high === null, J(b)); }
  { const b = DV.likelyBasisOf([mkc(0, "close", 99000, DV.cutoffOf(when, 20)), mkc(1, "close", 30000, inside), mkc(2, "close", 31000, inside)], { when, months: 24 }); ok("window unit: with 24 months offered a sale 20 months back is inside", b.count === 3 && b.ids.includes("w0"), J(b)); }
  ok("window unit: the window is the longest the case offers (12; 24 when offered)", DV.likelyWindowOf([{ months: 3 }, { months: 6 }, { months: 12 }]) === 12 && DV.likelyWindowOf([{ months: 3 }, { months: 12 }, { months: 24 }]) === 24 && DV.likelyWindowOf([]) === 12); }
// the window at the engine: deskBlock over rows with a near-perfect sale 25 months back (outside even the 24 month window the old sale itself makes the case offer) among five inside it: left out of the comparables' set, kept in the list
{ const when = "2026-11-14", at = m => DV.cutoffOf(when, m), r = (i, date, price) => ({ id: "r" + i, price, date, year: 1999, generation: "996", body: "Coupe", gearbox: "manual", gearboxWord: "Manual", miles: 60000 + i * 500, platform: "Bring a Trailer", title: "1999 Porsche 911 Carrera", inPopulation: true, tier: null });
  const b = await DV.deskBlock([r(0, at(25), 99000), r(1, at(2), 30000), r(2, at(3), 31000), r(3, at(4), 32000), r(4, at(5), 33000)], { caseDate: when, windowMonths: 12, subjectFacts: { generation: "996", year: 1999, body: "Coupe", gearbox: "manual", miles: 60000 } }, null);
  ok("engine: the old top-tier sale is in desk.comparables and offers the 24 month window, and the likely basis leaves it out", b.comparables.some(c => c.id === "r0" && c.relevance === "close") && b.windows.some(w => w.months === 24) && J(b.likelyBasis.ids) === J(["r1", "r2", "r3", "r4"]) && b.likelyBasis.high === 33000 && b.likelyBasis.median === 31500, J(b.likelyBasis));
  const b2 = await DV.deskBlock([r(0, at(25), 99000), r(1, at(26), 98000), r(2, at(2), 30000)], { caseDate: when, windowMonths: 12, subjectFacts: { generation: "996", year: 1999, body: "Coupe", gearbox: "manual", miles: 60000 } }, null);
  ok("engine: two old and one new top-tier sale: fewer than three inside the window, the null rule, count 1", b2.likelyBasis.count === 1 && b2.likelyBasis.median === null && b2.likelyBasis.high === null, J(b2.likelyBasis)); leftOut += 2; }
ok("at least 20 views were compared across the two cars, some with more than 8 comparables and an old top-tier sale left out", views >= 20 && bigger >= 1 && leftOut >= 1, J({ views, bigger, leftOut }));
ok("the likely median is not simply the whole population's median in every view (the basis is the Closest sales set)", differs >= 1, String(differs));
console.log(`deskLikelyBasisCheck: ${pass} passed, ${fail} failed (${views} views, ${thin} under three rows, ${differs} differ from the whole population's median)`);
process.exit(fail ? 1 : 0);
