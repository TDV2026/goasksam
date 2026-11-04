// A STORED PRE-WAR ANSWER FROM BEFORE THE APART-BY-BODY RULE IS COMPUTED AGAIN (Lane B, Nov 4 2026, job lane-b-rick point 3, the invalidation).
// CAUSE: the rule (before 1949, two or more bodies with sales are an apart answer) changed no stamp, so stored Market Check rows (MCWARM:) of such cars kept serving the alike answer. THE FIRST PLAN, market.staleSince, does nothing here:
// only the core-row reader honours it; readWarmAnswerDetailed and readWarmAnswer (the two readers of an MCWARM row, behind Market Check, Buy, Tasks, Sell and the partner page) never read it. So the invalidation is a rule tag (PREWAR_BODY_TAG),
// read the same way by BOTH readers: a pre-war row with two or more bodies, not apart, and without the current tag is read as no row. Must hold:
//  (1) both readers return no row for such a row, whatever its staleSince; (2) a row WITH the tag, a post-war multi-body row, a pre-war single-body row and a pre-war apart row are all served; (3) a freshly computed answer carries the tag.
//   node scripts/prewarBodyStoredCheck.mjs [repo root]   (pointing it at a tree without the fix shows it fail)
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2";
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${!c && d ? "  " + d : ""}`); };
const imp = f => import(pathToFileURL(path.join(root, f)).href);
const E = await imp("lib/onebox.js"), S = await imp("lib/live/search.js");
const bodies = [{ dimension: "body", value: "pw_roadster", n: 9 }, { dimension: "body", value: "sedan", n: 8 }];
const raw = (year, extra = {}) => ({ tier: "result", resolvedCar: { year, make: "Ford", model: "Model A" }, questionRulesTag: E.QUESTION_RULES_TAG, bodyOptions: bodies, optionsState: "alike", poolN: 17, ...extra });
const now = new Date().toISOString(), rowOf = (r, market = {}) => ({ market: { engineVersion: E.ENGINE_VERSION, warmEpoch: null, raw: r, ...market }, computed_at: now });
const TAG = E.PREWAR_BODY_TAG;
const rows = {
  old: rowOf(raw(1930)),
  oldMarked: rowOf(raw(1930), { staleSince: now }),
  oldScalarBodies: rowOf(raw(1930, { bodyOptions: "none" })),
  tagged: rowOf(raw(1930, { prewarBodyTag: TAG })),
  postwar: rowOf(raw(1965)),
  oneBody: rowOf(raw(1930, { bodyOptions: [bodies[0]] })),
  apart: rowOf(raw(1930, { optionsState: "apart" })),
  noYear: rowOf({ ...raw(1930), resolvedCar: { make: "Ford" } }),
};
const f0 = globalThis.fetch;
globalThis.fetch = async url => { const u = String(url); const m = /spec_key=eq\.([^&]+)/.exec(u); if (/spec_market_cache/.test(u) && m) return new Response(JSON.stringify([rows[decodeURIComponent(m[1])]]), { status: 200 }); return new Response("[]", { status: 200 }); };
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
const served = { old: false, oldMarked: false, oldScalarBodies: true, tagged: true, postwar: true, oneBody: true, apart: true, noYear: true };
for (const k of Object.keys(rows)) {
  const a = await S.readWarmAnswerDetailed(env, k), b = await S.readWarmAnswer(env, k);
  ok(`${k}: readWarmAnswerDetailed ${served[k] ? "serves" : "reads no row"}`, !!(a && a.raw) === served[k], JSON.stringify(a && a.reason));
  ok(`${k}: readWarmAnswer ${served[k] ? "serves" : "reads no row"}`, !!b === served[k]);
}
globalThis.fetch = async () => new Response("[]", { status: 200 });
{ const d = await E.oneEngineAnswer({ year: 1930, make: "Ford", model: "Model A", raw: "1930 Ford Model A", trim: "" }, null, "1930 Ford Model A", { ...env, asked: 0, noStageLog: true }, null).then(r => r.raw).catch(() => null);
  ok("a freshly computed answer carries prewarBodyTag", !!d && !!TAG && d.prewarBodyTag === TAG, JSON.stringify(d && d.prewarBodyTag)); }
globalThis.fetch = f0;
console.log(fail ? `\nprewarBodyStoredCheck: ${fail} FAILED` : "\nprewarBodyStoredCheck: all passed"); process.exit(fail ? 1 : 0);
