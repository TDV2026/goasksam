// clock: real-ok its fixture rows are stamped computed_at at now, so freshness is always relative to the clock the engine reads; no calendar date is asserted (Lane G, Oct 29 2026)
// A STORED "COULD NOT BE CHECKED" IS NEVER SERVED (Lane B, Oct 29 2026, Sam's phone on 84c54259: the first Find card, a live 2016 Porsche Boxster Spyder with 11,200 miles, printed "No figures are shown because this car could not be checked.").
// CAUSE FOR THIS CAR: the stored Market Check row of "Porsche Boxster Spyder 2016 (981)" is an invariant_failed refusal (typed_words_honoured_or_wider: the typed trim Spyder was dropped from the pool with no label), written before cc311e0f labelled a dropped trim. A fresh compute of the same
// car on 84c54259 is a result. The stamp did not change with that fix, so the row counted as fresh and was served, to the Market Check page and to the Find card's core. answerCacheable (lib/live/search.js) already refuses to store an invariant refusal, so these rows (103 of them, of the 313 stored
// refusals) came from older writers; nothing ever recomputed them. FIX: the readers treat a stored invariant refusal as no row (readWarmAnswerDetailed, readWarmAnswer) and the Find core prefetch skips a core written from one, so the next ask computes the car with today's rules and stores the answer.
// CLASS: every car whose stored row is an invariant refusal, on every page that reads the row. This check serves a stored refusal of every failed check through the readers and fails if any is served; a stored result and a stored thin answer are still served; a real refusal computed
// now still refuses (the engine's gate is unchanged).
//   node scripts/storedRefusalNotServedCheck.mjs [repo root]
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
// clock: real-ok the stored row is stamped "now" and read back at once, so no assertion depends on the date
const row = raw => ({ computed_at: new Date().toISOString(), market: { raw, engineVersion: E.ENGINE_VERSION, warmEpoch: null } });
for (const failed of [["typed_words_honoured_or_wider"], ["receipts_carry_resolved_car"], ["label_span_within_receipts", "typed_words_honoured_or_wider"], ["typed_model_mismatch"], ["range_from_receipts_only"], ["identity_options_sum_to_pool"]]) {
  ROW = row({ tier: "refusal", poolN: 11, rawPool: [{ id: "a" }], refusal: { kind: "invariant_failed", failedChecks: failed } });
  const d = await S.readWarmAnswerDetailed(env, "MCWARM:x"), p = await S.readWarmAnswer(env, "MCWARM:x");
  ok(`a stored refusal (${failed.join(" + ")}) is read as no row`, d.raw === null && d.reason === "refusal_not_served" && !p, JSON.stringify([d.reason, !!p]));
}
ROW = row({ tier: "result", poolN: 14, rawPool: [{ id: "a" }], cluster: [1, 2], resolvedCar: { year: 2004 } }); { const d = await S.readWarmAnswerDetailed(env, "MCWARM:x"); ok("a stored result is still served", !!d.raw && d.raw.tier === "result", d.reason); }
ROW = row({ tier: "thin", poolN: 4, rawPool: [{ id: "a" }], resolvedCar: { year: 2004 } }); { const d = await S.readWarmAnswerDetailed(env, "MCWARM:x"); ok("a stored thin answer is still served", !!d.raw && d.raw.tier === "thin", d.reason); }
ROW = row({ tier: "refusal", refusal: { kind: "not_a_car" } }); { const d = await S.readWarmAnswerDetailed(env, "MCWARM:x"); ok("a stored not-a-car refusal (a junk name, no pool) is still served as it was", !!d.raw, d.reason); }
{ const src = fs.readFileSync("lib/live/search.js", "utf8"); ok("the Find core prefetch skips a core written from the invariant refusal", /refusalLine === INVARIANT_REFUSAL_LINE \|\| r\.market\.refusal_line === INVARIANT_REFUSAL_LINE\) continue/.test(src)); }
console.log(fail ? `storedRefusalNotServedCheck: ${fail} failure(s)` : "storedRefusalNotServedCheck: all pass");
process.exit(fail ? 1 : 0);
