// clock: real-ok its fixture rows are stamped computed_at at now, so freshness is always relative to the clock the engine reads; no calendar date is asserted (Lane B, Oct 30 2026)
// A STORED RESULT THAT A QUESTION RULE HAS SINCE OVERTAKEN IS NEVER SERVED (Lane B, Oct 30 2026, the launch gate: Market Check "Audi RS 6 Avant" with no year served the stored pooled row, Audi RS6 2003 to 2011, $12,500 to $28,000).
// CAUSE: the generation table gained the RS6 (and the Rabbit), so the same text now computes to a generation question. A question stores no row, a warm never deletes the old row, and the stamp did not move, so the old row counted as fresh and was served;
// Lane C's warmFind --force and warmNamed --force stored 0 and the old row read back. The same happens to any text whose generation, trim or body question is decided after its row was written.
// FIX (read side, as for the stored refusals in 79681107): every answer carries questionRulesTag (lib/onebox.js QUESTION_RULES_TAG). A stored result or thin row for a text with NO YEAR (the texts those questions are asked of) that lacks the current tag is read as no row
// (readWarmAnswerDetailed, readWarmAnswer): the car is computed again under today's rules, the question (or the answer, stored again with the tag) is served. A row with a year, or with the tag, is served as before.
// CLASS: every make and model in the generation table with two or more generations (the no-year text of each), and every stored no-year result or thin row. Fails without the fix: the tagless rows are served.
//   node scripts/storedQuestionRecheckCheck.mjs [repo root]
import fs from "node:fs";
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
let ROW = null;
globalThis.fetch = async (url) => { const u = new URL(String(url)); if (u.hostname !== "fake.supabase.test") throw new Error("offline"); return new Response(JSON.stringify(u.pathname.endsWith("/spec_market_cache") && ROW ? [ROW] : []), { status: 200 }); };
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const S = await import(pathToFileURL(path.join(root, "lib/live/search.js")).href), G = await import(pathToFileURL(path.join(root, "lib/generations.js")).href);
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
const row = raw => ({ computed_at: new Date().toISOString(), market: { raw, engineVersion: E.ENGINE_VERSION, warmEpoch: null } });
const stored = (make, model, year, extra = {}) => ({ tier: "result", poolN: 14, rawPool: [{ id: "a" }], cluster: [12500, 28000], resolvedCar: { year, make, model }, ...extra });
// 1. the two cars named: RS6 and Rabbit, no year, stored before the rules moved
for (const [make, model] of [["Audi", "RS6"], ["Volkswagen", "Rabbit"]]) {
  ok(`${make} ${model} has two or more generations in the table (the question is asked)`, G.generationsForModel(make, model).length >= 2, String(G.generationsForModel(make, model).length));
  ROW = row(stored(make, model, null)); const d = await S.readWarmAnswerDetailed(env, "MCWARM:x"), p = await S.readWarmAnswer(env, "MCWARM:x");
  ok(`${make} ${model}, no year, stored without the tag: read as no row (both readers)`, d.raw === null && d.reason === "question_recheck" && !p, JSON.stringify([d.reason, !!p]));
}
// 2. the class: every model in the generation table with two or more generations
const models = new Map(); for (const g of G.CURATED_GENERATIONS) { const k = g.make + "|" + g.model; if (!models.has(k)) models.set(k, [g.make, g.model]); }
let multi = 0, served = 0, rechecked = 0;
for (const [make, model] of models.values()) {
  if (G.generationsForModel(make, model).length < 2) continue; multi++;
  ROW = row(stored(make, model, null)); const d = await S.readWarmAnswerDetailed(env, "MCWARM:x"); if (d.raw === null && d.reason === "question_recheck") rechecked++; else served++;
}
ok(`all ${multi} models with two or more generations: a tagless no-year stored row is read as no row`, multi > 20 && served === 0, `${rechecked} rechecked, ${served} served`);
// 3. what is still served
ROW = row(stored("Audi", "RS6", null, { questionRulesTag: E.QUESTION_RULES_TAG })); { const d = await S.readWarmAnswerDetailed(env, "MCWARM:x"); ok("a no-year row carrying the current tag is served (it was computed under today's rules)", !!d.raw, d.reason); }
ROW = row(stored("Audi", "RS6", 2004)); { const d = await S.readWarmAnswerDetailed(env, "MCWARM:x"); ok("a row for a text WITH a year is served (a generation question is not asked of it)", !!d.raw, d.reason); }
ROW = row(stored("Audi", "RS6", null, { tier: "thin" })); { const d = await S.readWarmAnswerDetailed(env, "MCWARM:x"); ok("a tagless no-year thin row is rechecked too", d.raw === null && d.reason === "question_recheck", d.reason); }
ROW = row({ tier: "refusal", refusal: { kind: "not_a_car" }, resolvedCar: { year: null } }); { const d = await S.readWarmAnswerDetailed(env, "MCWARM:x"); ok("a stored not-a-car refusal is served as before", !!d.raw, d.reason); }
// 4. the engine tags what it computes, so a recomputed result is not rechecked again
{ let r = null; try { r = await E.oneEngineAnswer({ year: null, make: "Audi", model: "RS6", trim: null, nameModel: "RS6" }, null, "Audi RS6", { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" }, null); } catch (e) { r = null; }
  ok("an answer the engine computes carries the current questionRulesTag", !!r && r.raw && r.raw.questionRulesTag === E.QUESTION_RULES_TAG, r && r.raw && r.raw.tier); }
console.log(fail ? `storedQuestionRecheckCheck: ${fail} failure(s)` : "storedQuestionRecheckCheck: all pass");
process.exit(fail ? 1 : 0);
