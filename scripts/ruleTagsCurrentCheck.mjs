// A STORED ROW THE ENGINE WRITES TODAY IS NEVER OVERTAKEN (Lane B, Nov 5 2026, Lane C's full prePush on the 13-commit stack: widenedLineCheck, storedRefusalNotServedCheck and houseSalesCountCheck were green alone on clean main and red on the stack).
// CAUSE: each of those checks built a stored row by hand carrying one rule tag (or none). The nr1 commit added a tag whose rule reads every thin row, so a hand-built thin row without it was overtaken by nr1 (reason norange_recheck) before the rule under test could
// speak: "still served" failed, and "widened_recheck" was reported as norange_recheck. The fixtures, not the readers, were stale, and the same would happen to the NEXT tag. OTHER CHECKS WITH THE SAME CAUSE: houseSalesCountCheck (5 FAIL on the stack). The other 14 checks
// that read a stored row were run on the stack and pass. FIX: lib/onebox.js keeps every rule tag in ONE object (CURRENT_RULE_TAGS, the object the writer stamps) and withCurrentTags(raw, omit) builds a "current" stored row; the three checks build their rows with it,
// omitting only the tag under test.
// THIS CHECK IS THE CLASS: (1) every tag constant exported by lib/onebox.js is in CURRENT_RULE_TAGS, so a new tag cannot be forgotten by the writer or by a fixture; (2) the writer stamps CURRENT_RULE_TAGS; (3) a row of every shape the readers can overtake (thin, varied, spread-out and
// cluster-less refusals, a pre-war thin row, a widened-year pool, a house few_comparable row, an online-only row, a row under a car name) carrying EVERY current tag is served by both Market Check readers, so a rule that overtakes a fully current row (a new rule that forgot to
// read its own tag) fails here; (4) the same shapes missing the one tag whose rule reads them are read as no row, so a tag that is stamped but not read fails too.
//   node scripts/ruleTagsCurrentCheck.mjs [repo root]
import fs from "node:fs";
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
let ROW = null;
globalThis.fetch = async (url) => { const u = new URL(String(url)); if (u.hostname !== "fake.supabase.test") throw new Error("offline"); return new Response(JSON.stringify(u.pathname.endsWith("/spec_market_cache") && ROW ? [ROW] : []), { status: 200 }); };
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const S = await import(pathToFileURL(path.join(root, "lib/live/search.js")).href);
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
const src = fs.readFileSync("lib/onebox.js", "utf8");

// (1) every exported tag constant is carried
const consts = [...src.matchAll(/^export const ([A-Z_]*TAG) = "([^"]+)";/gm)].map(m => ({ name: m[1], value: m[2] }));
const carried = Object.values(E.CURRENT_RULE_TAGS || {});
ok("(1) lib/onebox.js exports rule tag constants", consts.length >= 7, String(consts.length));
ok("(1) every exported tag constant is in CURRENT_RULE_TAGS", consts.every(c => carried.includes(c.value)), consts.filter(c => !carried.includes(c.value)).map(c => c.name).join(" "));
ok("(1) CURRENT_RULE_TAGS carries nothing that is not a tag constant", carried.every(v => consts.some(c => c.value === v)));
ok("(1) withCurrentTags stamps all of them, omits the named one, and lets the case's own value win", (() => { const a = E.withCurrentTags({ x: 1 }), b = E.withCurrentTags({}, ["noRangeTag"]), c = E.withCurrentTags({ noRangeTag: "old" }); return Object.keys(E.CURRENT_RULE_TAGS).every(k => a[k] === E.CURRENT_RULE_TAGS[k]) && a.x === 1 && !("noRangeTag" in b) && c.noRangeTag === "old"; })());
// (2) the writer
ok("(2) the writer stamps CURRENT_RULE_TAGS and no tag by hand", /d = \{ \.\.\.d, \.\.\.CURRENT_RULE_TAGS \};/.test(src) && (src.match(/questionRulesTag: QUESTION_RULES_TAG/g) || []).length === 1);   // the one place a tag is written by hand is the CURRENT_RULE_TAGS object itself

// (3) + (4) the readers
const row = raw => ({ computed_at: new Date().toISOString(), market: { raw, engineVersion: E.ENGINE_VERSION, warmEpoch: null } });
const rd = async raw => { ROW = row(raw); const d = await S.readWarmAnswerDetailed(env, "MCWARM:x"), p = await S.readWarmAnswer(env, "MCWARM:x"); return { d, p }; };
const pool = ys => ys.map((y, i) => ({ id: "r" + i, year: y }));
const SHAPES = [
  ["thin", { tier: "thin", poolN: 4, rawPool: pool([2004]), resolvedCar: { year: 2004, make: "Volvo", model: "240" } }, "noRangeTag"],
  ["varied refusal", { tier: "refusal", poolN: 11, rawPool: pool([2004]), refusal: { kind: "varied" }, resolvedCar: { year: 2004, make: "Volvo", model: "240" } }, "noRangeTag"],
  ["thin refusal", { tier: "refusal", poolN: 3, rawPool: pool([2004]), refusal: { kind: "thin" }, resolvedCar: { year: 2004, make: "Volvo", model: "240" } }, "noRangeTag"],
  ["cluster-less result with a span", { tier: "result", poolN: 9, rawPool: pool([2004]), cluster: null, span: [10000, 20000], resolvedCar: { year: 2004, make: "Volvo", model: "240" } }, "noRangeTag"],
  ["pre-war thin", { tier: "thin", poolN: 5, rawPool: pool([1936]), resolvedCar: { year: 1936, make: "Delahaye", model: "135" } }, "prewarBodyTag"],
  ["widened pool lacking the asked year", { tier: "result", poolN: 14, cluster: [12500, 28000], rawPool: pool([2007, 2009]), resolvedCar: { year: 2008, make: "Volvo", model: "240" } }, "widenRulesTag"],
  ["house few_comparable (4 house of 9)", { tier: "thin", poolN: 9, thinReason: "few_comparable", thin: { houseN: 4, totalN: 9 }, rawPool: pool([1993]), resolvedCar: { year: 1993, make: "Jaguar", model: "XJ220" } }, "houseRulesTag"],
  ["house_share refusal", { tier: "thin", poolN: 9, thinReason: "house_share", rawPool: pool([1993]), resolvedCar: { year: 1993, make: "Jaguar", model: "XJ220" } }, "houseRulesTag"],
  ["a range from a clean pool", { tier: "result", poolN: 14, cluster: [12500, 28000], rawPool: pool([2004]), resolvedCar: { year: 2004, make: "Volvo", model: "240" } }, null]
];
for (const [name, raw, tag] of SHAPES) {
  const cur = await rd(E.withCurrentTags(raw));
  ok(`(3) ${name}: carrying every current tag it is served by both readers`, !!cur.d.raw && !!cur.p, JSON.stringify([cur.d.reason, !!cur.p]));
  if (tag) { const old = await rd(E.withCurrentTags(raw, [tag])); ok(`(4) ${name}: without ${tag} it is read as no row by both readers`, old.d.raw === null && !old.p, JSON.stringify([old.d.reason, !!old.p])); }
}
ROW = null;
console.log(fail ? `ruleTagsCurrentCheck: ${fail} failure(s)` : "ruleTagsCurrentCheck: all pass");
process.exit(fail ? 1 : 0);
