// e66 (Lane C's live find, Sam's rule): the Buy card's sold-prices sentence (lib/live/search.js soldLine) prints the
// engine's OWN thin line for a thin answer, so "not enough sales" wording appears only under few_sales; a house_share or
// few_comparable pool never reads "not enough". Offline, no database. Exit 1 on any failure.
import { soldLine } from "../lib/live/search.js";
import { THIN_LINES } from "../lib/onebox.js";
let fail = 0;
const check = (name, got, ok) => { if (ok) console.log(`ok   ${name}`); else { fail++; console.log(`FAIL ${name}: "${got}"`); } };
for (const r of ["house_share", "few_sales", "few_comparable"]) {
  const got = soldLine({ kind: "count", count: 6, thinReason: r, thinLine: THIN_LINES[r] });
  check(`thin ${r} prints its own line`, got, got === THIN_LINES[r]);
  if (r !== "few_sales") check(`thin ${r} never says not enough`, got, !/not enough/i.test(got));
}
const range = soldLine({ kind: "range", low: 100000, high: 120000, family: "911 Carrera 4S Coupes", thinLine: THIN_LINES.few_sales });
check("a range is unchanged by a stray thin line", range, /^The middle half of /.test(range));
const spread = soldLine({ kind: "count", spread: true });
check("too spread out keeps its line", spread, /vary too widely/.test(spread));
console.log(`thinSoldLine: ${fail ? fail + " failed" : "all passed"}`);
process.exit(fail ? 1 : 0);
