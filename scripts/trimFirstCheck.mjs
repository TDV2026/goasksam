// trimFirstCheck (Lane B, Oct 21 2026, Sam's trim-first rule, STEP 1): offline, no network. The switch ships OFF (no answer
// changes); a request can turn it on only for itself through env.rangeRules; the measure is the engine's ONE shared split rule
// (splitMaterial on the two largest named trims, 3+ sales each, middle-half bands that do not overlap), never a percentage.
globalThis.fetch = async () => { throw new Error("blocked"); };
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const ob = await import("../lib/onebox.js");
let bad = 0;
const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) bad++; };
ok(ob.RANGE_RULES.trimFirst === false, "RANGE_RULES.trimFirst ships OFF");
ok(ob.rangeRuleOn(null, "trimFirst") === false && ob.rangeRuleOn({}, "trimFirst") === false, "no request turns it on by default");
ok(ob.rangeRuleOn({ rangeRules: { trimFirst: true } }, "trimFirst") === true, "the preview (env.rangeRules) turns it on for itself only");
const spec = { make: "Ford", model: "Mustang" };
const rows = (title, prices) => prices.map(p => ({ title, raw_title: title, _usd: p }));
const apart = [...rows("2016 Ford Mustang GT", [29000, 31000, 33000, 30000, 32000]), ...rows("2016 Ford Mustang V6", [17000, 18000, 19000, 18500, 17500])];
const t1 = ob.trimsPriceDifferently(apart, spec);
ok(t1.differ === true && t1.a && t1.b && t1.lowerQ75 < t1.higherQ25, `two trims whose middle halves sit apart DIFFER (${JSON.stringify(t1)})`);
const overlap = [...rows("2016 Ford Mustang GT", [20000, 26000, 31000, 24000, 28000]), ...rows("2016 Ford Mustang V6", [21000, 25000, 29000, 23000, 27000])];
ok(ob.trimsPriceDifferently(overlap, spec).differ === false, "two trims whose middle halves overlap do NOT differ (today's range stays)");
ok(ob.trimsPriceDifferently(rows("2016 Ford Mustang GT", [20000, 26000, 31000, 24000]), spec).differ === false, "one trim only never asks");
const two = [...rows("2016 Ford Mustang GT", [30000, 31000]), ...rows("2016 Ford Mustang V6", [17000, 18000, 19000])];
ok(ob.trimsPriceDifferently(two, spec).differ === false, "a trim under 3 sales never forms a side");
ok(ob.trimsPriceDifferently([], spec).differ === false && ob.trimsPriceDifferently(null, spec).differ === false, "an empty pool never asks");
// 1b: exact chips only touch a trim question whose counts are pending (the 911 fence question asked first); every other answer
// passes through untouched, and none is pending while the switch is OFF
for (const d of [{ tier: "result", poolN: 9 }, { tier: "trim_choice", trimOptions: [{ value: "gt", label: "GT", n: 5 }] }, null]) {
  const back = await ob.exactTrimChipsForTest(d, {}, null, "x", {});
  ok(back === d, `exactTrimChips leaves a non-pending answer untouched (${d && d.tier})`);
}
// 1c: one read per request for the chips. With a memo the same query reads ONCE and every caller gets its OWN copy (a change
// to one copy never reaches another); without a memo (the switch off, every page today) each call reads, exactly as before
{
  let calls = 0; const fake = async (env, q) => { calls++; return [{ id: 1, title: "x", q }]; };
  const memo = new Map(); const env = { _readMemo: memo };
  const [a1, a2] = await Promise.all([ob.memoReadForTest(fake, "all", env, "sales_archive?select=id", []), ob.memoReadForTest(fake, "all", env, "sales_archive?select=id", [])]);
  ok(calls === 1, `with a memo, two runs asking the same query read it once (${calls})`);
  a1[0].title = "changed";
  ok(a2[0].title === "x" && a1 !== a2, "each run gets its own copy of the rows");
  await ob.memoReadForTest(fake, "all", env, "sales_archive?select=other", []);
  ok(calls === 2, "a different query reads on its own");
  calls = 0;
  await ob.memoReadForTest(fake, "all", {}, "sales_archive?select=id", []); await ob.memoReadForTest(fake, "all", {}, "sales_archive?select=id", []);
  ok(calls === 2, "without a memo every call reads, as today");
  const nul = async () => null; const m2 = { _readMemo: new Map() };
  ok((await ob.memoReadForTest(nul, "one", m2, "q", [])) === null, "a failed read stays a failed read (null), never an empty list");
}
// THE GUARD (trimFirstGuard, Lane F's option B, Oct 21 2026): a trim-first question is asked only when at least one chip's own
// answer carries a range. The live chips read on Oct 21: the 2003 S-Class (S430 7, S600 4, S500 3: all without a range) does
// NOT ask; the 2019 911 (Carrera, Carrera 4S, Carrera T with ranges, Carrera S 4 without) and the 2025 911 DO
ok(ob.RANGE_RULES.trimFirstGuard === true, "the guard ships ON (it only acts when trimFirst asks)");
const R = (lo, hi) => ({ tier: "result", cluster: [lo, hi], poolN: 8 }), THIN = n => ({ tier: "thin", cluster: null, poolN: n });
ok(ob.trimChipsCarryRange([THIN(7), THIN(4), THIN(3)]) === false, "the 2003 S-Class (7, 4, 3 sales, no chip with a range) does not ask");
ok(ob.trimChipsCarryRange([R(78500, 91000), THIN(4), R(94500, 121000), R(94000, 114000)]) === true, "the 2019 911 (three chips with a range) asks");
ok(ob.trimChipsCarryRange([THIN(5), R(153000, 166000), R(158000, 190000), R(132000, 147000)]) === true, "the 2025 911 asks");
ok(ob.trimChipsCarryRange([R(1, 2), R(3, 4)]) === true, "a pool whose chips all carry a range asks");
ok(ob.trimChipsCarryRange([THIN(6), { tier: "refusal", cluster: null, poolN: 9 }]) === false, "a pool where no chip carries a range (thin or too varied) does not ask");
ok(ob.trimChipsCarryRange([null, undefined]) === false && ob.trimChipsCarryRange([]) === false, "failed chip reads never make a question");
process.env.PROBE_KEY = "local-check-key"; process.env.OLDCARSDATA_API_KEY = "unused-local-check";
const { default: handler } = await import("../api/usageDashboard.js");
for (const task of ["trimmix", "rangepreview"]) {
  let code = 0; const res = { setHeader() {}, getHeader() {}, status(c) { code = c; return this; }, json() { return this; }, send() { return this; }, end() { return this; } };
  await handler({ method: "GET", url: `/api/usageDashboard?view=ops&task=${task}&rules=trimFirst`, query: { view: "ops", task, rules: "trimFirst", qs: "2019 porsche 911" }, headers: {} }, res);
  ok(code === 401, `task=${task} refuses without the ops key (${code})`);
}
console.log(bad ? `trimFirstCheck: ${bad} failed` : "trimFirstCheck: all passed");
process.exit(bad ? 1 : 0);
