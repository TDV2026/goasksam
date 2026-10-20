// trimChipKeyCheck (Lane B, Oct 20 2026, Lane F's option b): the stored-answer key (lib/live/search.js specKeyFor, the one key
// builder for rangeCache, spec_market_cache, the Market Check warm row and the Sell facts row) carries a pool marker for a
// TRIM-chip answer only, so those stored rows recompute under the trim chip's new pool (it narrows the bare page's finished
// pool). Every key without refine.trim is unchanged. Offline: the key builder on sample cars.
import { specKeyFor, TRIM_CHIP_POOL } from "../lib/live/search.js";
let bad = 0;
const ok = (c, m) => { if (c) console.log("ok   " + m); else { bad++; console.log("FAIL " + m); } };
const v = { make: "Ford", model: "Mustang", trim: null, year: 1965, bodyStyle: "coupe" };
const g = { code: "1G" };
// the key layout of record before this change (index 11 is refine.trim)
const before = (v, g, r) => JSON.stringify([v.make, v.model, v.trim, v.year || null, (g && g.code) || null, v.bodyStyle, v.edition || null, v.variant || null, v.wheelbase || null, r && r.tx, (r && r.body) || null, (r && r.trim) || null, (r && r.variant) || null]);
const same = [null, { tx: "manual" }, { body: "convertible" }, { variant: "competition" }, { body: "coupe", tx: "auto" }];
for (const r of same) ok(specKeyFor(v, g, r) === before(v, g, r), `no trim refine, key unchanged: ${JSON.stringify(r)}`);
for (const r of [{ trim: "330i" }, { trim: "other", notTrims: "330i,m340i" }, { trim: "gt", body: "coupe" }]) {
  const k = specKeyFor(v, g, r);
  ok(k !== before(v, g, r) && JSON.parse(k)[11] === r.trim + TRIM_CHIP_POOL, `trim refine, key carries the pool marker: ${JSON.stringify(r)}`);
}
ok(specKeyFor(v, g, { trim: "330i" }) !== specKeyFor(v, g, { trim: "m340i" }), "two trim chips still have two keys");
console.log(bad ? `trimChipKeyCheck: ${bad} failed` : "trimChipKeyCheck: all passed");
process.exit(bad ? 1 : 0);
