// A refusal with count 0 says "no sales on record" (Oct 25 2026). No DB: finalStamp on synthetic results.
//   node scripts/zeroRefusalCheck.mjs
import { finalStamp } from "../lib/onebox.js";
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const spec = { year: 1973, make: "DeTomaso", model: "Pantera", trim: "" };
const ctx = { spec, resolvedCar: { make: "DeTomaso", model: "Pantera" }, asked: 0, askCapped: false, mark: () => {}, refine: null, env: {} };
const empty = { tier: "refusal", ladderStep: "thin", thinReason: "few_sales", thinLine: "Not enough sales", refusal: { kind: "thin" }, cards: [], rawPool: [], setAsideRows: [], setAsideCount: 0, qualifyingTotal: 0 };
const a = finalStamp({ ...empty }, ctx);
ok("an empty refusal becomes not_tracked", a.tier === "not_tracked");
ok("it says the standard sentence", /^No sales of a 1973 .*Pantera are on record in the last five years, so there is no range to show\.$/.test(a.samLine || ""), a.samLine);
const withCards = finalStamp({ ...empty, rawPool: [{ year: 1973 }], cards: [{ title: "x" }], qualifyingTotal: 2 }, ctx);
ok("a refusal with sales stays a refusal", withCards.tier === "refusal");
const aside = finalStamp({ ...empty, setAsideCount: 3, qualifyingTotal: 3, setAsideRows: [{}] }, ctx);
ok("sales that were all set aside keep their own answer", aside.tier === "refusal");
const thin = finalStamp({ ...empty, tier: "thin" }, ctx);
ok("an empty thin answer is not_tracked too", thin.tier === "not_tracked");
process.exit(failed ? 1 : 0);
