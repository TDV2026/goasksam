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
process.env.PROBE_KEY = "local-check-key"; process.env.OLDCARSDATA_API_KEY = "unused-local-check";
const { default: handler } = await import("../api/usageDashboard.js");
for (const task of ["trimmix", "rangepreview"]) {
  let code = 0; const res = { setHeader() {}, getHeader() {}, status(c) { code = c; return this; }, json() { return this; }, send() { return this; }, end() { return this; } };
  await handler({ method: "GET", url: `/api/usageDashboard?view=ops&task=${task}&rules=trimFirst`, query: { view: "ops", task, rules: "trimFirst", qs: "2019 porsche 911" }, headers: {} }, res);
  ok(code === 401, `task=${task} refuses without the ops key (${code})`);
}
console.log(bad ? `trimFirstCheck: ${bad} failed` : "trimFirstCheck: all passed");
process.exit(bad ? 1 : 0);
