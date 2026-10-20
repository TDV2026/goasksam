// rangeRulesCheck (Lane B, Oct 20 2026): offline check of the two range rules shipped OFF and the read-only preview task.
// The module switches are false; only env.rangeRules turns a rule on; the one-family test reads titles as intended; the
// preview task refuses without the ops key. No network, no database.
process.env.PROBE_KEY = "local-check-key"; process.env.OLDCARSDATA_API_KEY = "unused-local-check";
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY; delete process.env.SUPABASE_ANON_KEY;
const ob = await import("../lib/onebox.js");
let bad = 0; const ok = (c, m) => { if (!c) bad++; console.log(`${c ? "ok  " : "FAIL"} ${m}`); };
ok(ob.RANGE_RULES.blendOneFamily === false && ob.RANGE_RULES.gearboxFirst === false && ob.RANGE_RULES.houseOnlyBody === false, "all three range rules ship OFF");
ok(!ob.rangeRuleOn({}, "blendOneFamily") && !ob.rangeRuleOn(null, "gearboxFirst"), "no request turns a rule on by default");
ok(ob.rangeRuleOn({ rangeRules: { blendOneFamily: true } }, "blendOneFamily") && !ob.rangeRuleOn({ rangeRules: { blendOneFamily: true } }, "gearboxFirst"), "env.rangeRules turns on only the named rule");
const r = t => ({ raw_title: t }), F512 = { make: "Ferrari", model: "512" }, VIP = { make: "Dodge", model: "Viper" };
ok(ob.blendOneFamily(F512, [r("1982 Ferrari 512 BBi"), r("1981 Ferrari 512 BB"), r("Ex-David Letterman 1983 Ferrari 512 BBi")]) === "512 BB", "512 BB and BBi read as one family");
ok(ob.blendOneFamily(F512, [r("1992 Ferrari 512 TR"), r("1993 Ferrari 512 TR Spider Conversion")]) === "512 TR", "512 TR reads as one family");
ok(ob.blendOneFamily(F512, [r("1982 Ferrari 512 BBi"), r("1992 Ferrari 512 TR")]) === null, "BB with TR is two families");
ok(ob.blendOneFamily(VIP, [r("1997 Dodge Viper GTS"), r("1997 Dodge Viper RT/10")]) === null, "a GTS with an RT/10 is two families");
ok(ob.blendOneFamily(VIP, [r("1994 Dodge Viper RT/10"), r("1994 Dodge Viper")]) === null, "a title naming no family keeps the refusal");
ok(ob.blendOneFamily({ make: "Ferrari", model: "F430" }, [r("2006 Ferrari F430 Spider")]) === null, "a name outside the blend list is never touched");
const { default: handler } = await import("../api/usageDashboard.js");
let code = 0; const res = { setHeader() {}, getHeader() {}, status(c) { code = c; return this; }, json() { return this; }, send() { return this; }, end() { return this; } };
await handler({ method: "GET", url: "/api/usageDashboard?view=ops&task=rangepreview", query: { view: "ops", task: "rangepreview" }, headers: {} }, res);
ok(code === 401, "task=rangepreview refuses without the ops key");
// warmDemo keeps the demo's thin answers too (Oct 20 2026, the 1966 275 GTB): the demo row is refreshed for tier result AND thin
const fs = await import("fs");
const ud = fs.readFileSync(new URL("../api/usageDashboard.js", import.meta.url), "utf8");
ok(/if \(\/\^\(result\|thin\)\$\/\.test\(String\(d\.tier\)\)\) \{ try \{ const \{ refreshDemoAnswer \}/.test(ud), "warmDemo refreshes the demo's stored answer for thin answers as well as ranges");
// rule 3's one-line diagnostic (Oct 20 2026): written only when the switch is on, shown by task=rangepreview
const obSrc = fs.readFileSync(new URL("../lib/onebox.js", import.meta.url), "utf8");
ok(/diag\.houseOnlyBody = \{ read: /.test(obSrc) && /else if \(rangeRuleOn\(env, "houseOnlyBody"\)\) diag\.houseOnlyBody = \{ skipped:/.test(obSrc) && /houseOnlyBody: \(d\.dedup && d\.dedup\.houseOnlyBody\)/.test(ud), "rule 3 writes its diagnostic only with the switch on, and the preview shows it");
console.log(bad ? `rangeRulesCheck: ${bad} failed` : "rangeRulesCheck: all passed");
process.exit(bad ? 1 : 0);
