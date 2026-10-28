// e96: null is no number. Number.isFinite(Number(null)) is true (Number(null) is 0), so an optional figure that is missing must be
// tested with isNum (lib/_num.js) before it is read. One case per customer-path site, plus the class: no unguarded
// Number.isFinite(Number(x)) on a customer path outside the judge-only and already-guarded allowlist.
//   node scripts/nullIsNoNumberCheck.mjs [repo root]
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const src = f => fs.readFileSync(path.join(root, f), "utf8");
// behaviour where the function is exported
const V = await import(pathToFileURL(path.join(root, "lib/vehicle.js")).href);
const sv = V.sanitizeResolvedVehicle({ make: "BMW", model: "M3", year: 2001, mileage: null, yearRange: { start: null, end: null } });
ok("vehicle 1495: a null mileage stays null, never 0", sv && sv.mileage === null, JSON.stringify(sv && sv.mileage));
ok("vehicle 1491: a yearRange with null ends stays null, never 0 to 0", sv && sv.yearRange === null, JSON.stringify(sv && sv.yearRange));
const sv2 = V.sanitizeResolvedVehicle({ make: "BMW", model: "M3", year: 2001, mileage: "45000", yearRange: { start: "2001", end: 2003 } });
ok("vehicle: real figures still read", sv2.mileage === 45000 && sv2.yearRange.start === 2001 && sv2.yearRange.end === 2003);
const { fullCardsFor } = await import(pathToFileURL(path.join(root, "lib/tasks/fullCards.js")).href);
let asked = null;
await fullCardsFor({}, [{ id: null }, { id: 12 }, { id: "" }], { select: async (e, q) => { asked = q; return []; }, enrich: async () => [], facts: () => ({}) }).catch(() => {});
ok("fullCards 16: a card with a null or empty id is not read as listing 0", !asked || !/\b(in|eq)\.\(?0\b/.test(String(asked)) && !/,0[,)]/.test(String(asked)), String(asked));
// source cases: each customer-path site tests with isNum
const SITES = [
  ["lib/onebox.js", "const rescueYears", "onebox 6230 rescue years from a null yearMin"],
  ["lib/onebox.js", "const sameYear = r =>", "onebox 6793 a record with a null year"],
  ["api/sellerDecision.js", "const year = isNum(vehicle.year)", "sellerDecision 731/795 a null vehicle year", 2],
  ["api/sellerDecision.js", "generation && isNum(generation.yearStart)", "sellerDecision 1294 a null generation start"],
  ["api/sellerDecision.js", ".filter(item => isNum(item.classification.price))", "sellerDecision 1467/1790 a null price counted as $0", 2],
  ["api/sellerDecision.js", "miMin: isNum(rawRefine.miMin)", "sellerDecision 3455 null miMin"],
  ["api/sellerDecision.js", "miMax: isNum(rawRefine.miMax)", "sellerDecision 3456 null miMax"],
  ["api/sellerDecision.js", "miTarget: isNum(rawRefine.miTarget)", "sellerDecision 3458 null miTarget"],
  ["api/out.js", "year: isNum(q.year)", "out 51 a missing year logged as 0"],
  ["api/partnerAnswer.js", "count: isNum(c.count)", "partnerAnswer 369 a missing count shown as 0"],
  ["lib/vehicle.js", "if (badge && ((isNum(year)", "vehicle 3002 a null year read as before 1973"],
  ["lib/live/search.js", "isNum(m.poolYears[0])", "live/search 469 a null pool year"],
  ["lib/live/watches.js", "const row = isNum(listing_id)", "watches 294 a null listing id read as listing 0"]
];
for (const [f, anchor, name, want = 1] of SITES) { const s = src(f); const n = s.split(anchor).length - 1; ok(`${name}: the site tests with isNum`, n >= want, `${f} has ${n} of "${anchor}"`); }
// the class: nothing on a customer path may use the bare test outside the allowlist (judge-only, ops-only, or an explicit >0 / != null guard on the same line)
const CUSTOMER = ["lib/onebox.js", "api/sellerDecision.js", "api/out.js", "api/partnerAnswer.js", "lib/vehicle.js", "lib/live/search.js", "lib/live/watches.js", "lib/tasks/fullCards.js"];
for (const f of CUSTOMER) {
  const bad = src(f).split("\n").map((l, i) => [i + 1, l]).filter(([, l]) => /Number\.isFinite\(Number\(/.test(l) && !/> ?0|!= ?null|!== ?null|=== ?"" |runOutputInvariants|out\.push|setConsistencyOf|v\.remaining/.test(l)).filter(([i]) => true);
  ok(`class: ${f} has no unguarded Number.isFinite(Number(x))`, f === "lib/onebox.js" ? bad.every(([i, l]) => /d\.(poolN|qualifyingTotal)|mapped\.|c\.price|o\.n|years\.year|subject\.mileage|latencyMs|c\.id/.test(l)) : bad.length === 0, bad.slice(0, 3).map(([i]) => i).join(","));
}
console.log(failed ? `nullIsNoNumberCheck: ${failed} FAIL` : "nullIsNoNumberCheck: all PASS");
process.exit(failed ? 1 : 0);
