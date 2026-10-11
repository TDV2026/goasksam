// buildPool/buildResult SMOKE TEST (Oct 2026, pool-consistency root cause job). No DB, no network -
// pure synthetic rows, run every real branch of the shared pool computation and range builder. This
// is the test that WOULD have caught the live "exactStep is not defined" ReferenceError this round
// shipped and had to hotfix: a variable declared inside buildPool but referenced later in buildResult
// (after the extraction split the two apart) with no missed-reference check beyond `node --check`
// (syntax only - it does not execute the function body, so a destructure gap like this one is
// invisible to it) and a plain module import (which also never CALLS the function). Wired into
// scripts/prePush.mjs as a no-credentials-needed deterministic check, so it runs on every prePush
// invocation regardless of whether SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY are available locally.
//   node scripts/buildPoolSmoke.mjs
import { buildPool, buildResult } from "../lib/onebox.js";

const now = Date.now();
const DAY = 864e5;
const iso = days => new Date(now - days * DAY).toISOString();
const mkRow = (i, daysAgo, usd) => ({
  _usd: usd, raw_title: `2005 BMW M3 Coupe ${i}`, rtitle: `2005 BMW M3 Coupe ${i}`, year: 2005,
  auction_end_date: new Date(now - daysAgo * DAY).toISOString().slice(0, 10),
  source: "bringatrailer", mods: "", transmission: "Manual (6-Speed)", mileage: "50000"
});
function densePool(n, dayRange) {
  const rows = [];
  for (let i = 0; i < n; i++) rows.push(mkRow(i, Math.floor(Math.random() * dayRange), 20000 + Math.floor(Math.random() * 30000)));
  return rows;
}

const base = () => ({ resolvedCar: { make: "BMW", model: "M3", year: 2005 }, resolvedSpec: null, dedup: {}, vehicle: { make: "BMW", model: "M3", trim: null, year: 2005 }, exactSale: null, inlineSplits: [] });
const spec = { make: "BMW", model: "M3", trim: "", year: 2005, bodyStyle: "coupe", excludeVariants: [], genCode: null };

const cases = [
  { name: "normal result (recent window)", chosen: { rows: densePool(40, 400), step: "base", windowLabel: "past 2 years" }, refine: null },
  { name: "thin refusal (2 rows)", chosen: { rows: densePool(2, 400), step: "base", windowLabel: "past 2 years" }, refine: null },
  { name: "refine by transmission", chosen: { rows: densePool(40, 400), step: "base", windowLabel: "past 2 years" }, refine: { tx: "manual" } },
  { name: "exact_trim step (exactStep branch)", chosen: { rows: densePool(40, 400), step: "exact_trim", windowLabel: "past 2 years" }, refine: null },
  { name: "all-old window (useRecent false)", chosen: { rows: densePool(40, 400).map(r => ({ ...r, auction_end_date: new Date(now - (400 + Math.floor(Math.random() * 400)) * DAY).toISOString().slice(0, 10) })), step: "base", windowLabel: "past 5 years" }, refine: null },
  { name: "ladder step thin (chosen.step === thin)", chosen: { rows: densePool(10, 400), step: "thin", windowLabel: "past 2 years" }, refine: null }
];

let failed = 0;
for (const c of cases) {
  try {
    const pool = buildPool(c.chosen, base(), iso, spec, c.refine);
    if (!pool || !Array.isArray(pool.solid)) throw new Error("buildPool returned no solid array");
  } catch (e) {
    failed++; console.log(`FAIL  buildPool: ${c.name}  ${e.message}`);
    continue;
  }
  try {
    const result = buildResult(c.chosen, base(), iso, spec, c.refine);
    if (!result || !result.tier) throw new Error("buildResult returned no tier");
    console.log(`PASS  buildResult: ${c.name}  tier=${result.tier}`);
  } catch (e) {
    failed++; console.log(`FAIL  buildResult: ${c.name}  ${e.message}`);
  }
}
console.log(failed ? `\n${failed} case(s) failed.` : "\nAll buildPool/buildResult branches clear.");
process.exit(failed ? 1 : 0);
