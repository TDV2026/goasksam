// clock: real-ok the fixture sales are dated relative to now; no calendar date is asserted (Lane B, Nov 14 2026)
// DESK LIKELY BASIS (Lane B, Nov 14 2026, for Lane D's desk.likely). desk.likelyBasis = { median, low, high, count, ids } is the engine's figure over EXACTLY the rows listed as desk.comparables (the Closest sales set) of that view: at the top of desk (the current
// view) and inside every desk.views entry. ids are the comparables' sale ids in the list's order; count their number; under three rows median, low and high are null. No page or model computes it.
// CLASS: any view of any car. This check reads two cars (the 1999 911 case Lane D's workflow checks use, and an older car), unpacks EVERY view (15 each) and the top, and compares the field with the view's own comparables, by an independent median.
// MUTANTS (each must fail): the median is the whole population's; the ids are the sales'; the ids are re-sorted; the count is the sales'; a view carries none; the null floor is gone; low and high are the population's.
//   node scripts/deskLikelyBasisCheck.mjs [root]    --mutants
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { fileURLToPath, pathToFileURL } from "node:url"; import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url)), args = process.argv.slice(2), ROOT = path.resolve(args.find(a => !a.startsWith("--")) || path.join(here, ".."));
if (args.includes("--mutants")) {
  const DV = "lib/deskV3.js", muts = [
    [DV, "ids: list.map(c => c.id) };", "ids: list.map(c => c.id).reverse() };", "the ids are in another order than desk.comparables"],
    [DV, "count: list.length, ids", "count: list.length + 1, ids", "the count is not the comparables'"],
    [DV, "ok = list.length >= LIKELY_MIN && prices.length >= LIKELY_MIN", "ok = list.length >= 1", "the null floor is gone"],
    [DV, "low: ok ? prices[0] : null", "low: ok ? prices[1] : null", "low is not the lowest"],
    [DV, "high: ok ? prices[prices.length - 1] : null", "high: ok ? prices[prices.length - 2] : null", "high is not the highest"],
    [DV, "likelyBasis = likelyBasisOf(comparables), evidenceOut", "likelyBasis = likelyBasisOf(comparables.slice(0, 2)), evidenceOut", "the basis covers only part of the list"],
    [DV, "likelyBasis = likelyBasisOf(comparables), evidenceOut", "likelyBasis = { ...likelyBasisOf(comparables), median: evidence.median, low: evidence.q1, high: evidence.q3 }, evidenceOut", "the median and range are taken from the whole population"],
    [DV, "likelyBasis = likelyBasisOf(comparables), evidenceOut", "likelyBasis = likelyBasisOf(sales), evidenceOut", "the basis is read over the sales, not the comparables"],
    [DV, "likelyBasis = likelyBasisOf(comparables), evidenceOut", "likelyBasis = null, evidenceOut", "no basis at all"]
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
let views = 0, thin = 0, differs = 0, served = 0;
function judge(label, lb, comps, wholeMedian) {
  views++;
  if (!lb || typeof lb !== "object") return ok(`${label}: desk.likelyBasis is an object`, false, J(lb));
  const ids = comps.map(c => c.id), prices = comps.map(c => Number(c.price));
  ok(`${label}: the ids are the comparables' ids in the list's order`, J(lb.ids) === J(ids), `${(lb.ids || []).length} vs ${ids.length}`);
  ok(`${label}: count is the number of comparables`, lb.count === comps.length, `${lb.count} vs ${comps.length}`);
  if (comps.length < 3) { thin++; ok(`${label}: under three rows, median, low and high are null`, lb.median === null && lb.low === null && lb.high === null && lb.count === comps.length, J(lb)); return; }
  ok(`${label}: median, low and high are of those rows' prices`, lb.median === med(prices) && lb.low === Math.min(...prices) && lb.high === Math.max(...prices), `${J({ m: lb.median, l: lb.low, h: lb.high })} vs ${med(prices)} ${Math.min(...prices)} ${Math.max(...prices)}`);
  if (wholeMedian != null && lb.median !== wholeMedian) differs++;
}
for (const c of cases) {
  const d = c.desk; ok(`${c.name}: the engine read carries views`, !!d && DV.hasViews(d) && Object.keys(d.views).length >= 3, Object.keys((d && d.views) || {}).length + " views");
  if (!d) continue;
  judge(`${c.name}, top of desk`, d.likelyBasis, d.comparables || [], d.evidence && d.evidence.median);
  for (const key of Object.keys(d.views || {})) { const v = DV.viewOf(d, key), from = v && v.likelyBasis && v.likelyBasis.servedFrom, src = from ? DV.viewOf(d, from) : v;   // a thin view is priced from its fallback view (desk.reserveLadder.fallbackView): its basis is that view's comparables
    if (from) served++; judge(`${c.name}, view ${key}${from ? " (served from " + from + ")" : ""}`, v && v.likelyBasis && (({ servedFrom, ...r }) => r)(v.likelyBasis), (src && src.comparables) || [], src && src.evidence && src.evidence.median); }
  const cur = d.view && d.views && d.views[DV.viewKey(d.view.tier, d.view.months)]; if (cur) ok(`${c.name}: the top of desk equals the current view's basis`, J(cur.likelyBasis) === J(d.likelyBasis));
}
// the floor, at the unit: no engine view here is thin, so the rule is shown on the function itself (0, 1, 2 rows: count only; 3 rows: figures; ids keep the order)
{ const mk = ps => ps.map((p, i) => ({ id: "s" + i, price: p })), U = DV.likelyBasisOf;
  for (const n of [0, 1, 2]) { const b = U(mk([30000, 50000].slice(0, n).concat(n === 1 ? [] : []))); ok(`unit: ${n} rows: median, low and high null, count ${n}`, b.median === null && b.low === null && b.high === null && b.count === n && b.ids.length === n, J(b)); }
  const b3 = U(mk([50000, 20000, 30000])); ok("unit: 3 rows: median, low, high, ids in the given order", b3.median === 30000 && b3.low === 20000 && b3.high === 50000 && b3.count === 3 && J(b3.ids) === J(["s0", "s1", "s2"]), J(b3)); }
ok("at least 20 views were compared across the two cars", views >= 20, String(views));
ok("the likely median is not simply the whole population's median in every view (the basis is the Closest sales set)", differs >= 1, String(differs));
console.log(`deskLikelyBasisCheck: ${pass} passed, ${fail} failed (${views} views, ${thin} under three rows, ${differs} differ from the whole population's median)`);
process.exit(fail ? 1 : 0);
