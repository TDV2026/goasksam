// A WARM LEAVES NO ANSWER ROW BEHIND A QUESTION, AND STORES NOTHING THE VISITOR PATH WOULD REFUSE (Lane B, Nov 1 2026). Worked offline against a fake spec_market_cache; no production write.
// CAUSE (read live on 26e7nsyan, warmwhy, 0 writes): "2025 Porsche 911", "2019 Porsche 911", "2003 S-Class", "1963 Corvette split window", "2019 AMG GT", "2019 AMG GT Roadster" and "1986 Porsche 911" are all a trim_choice QUESTION now. A question
// stores no answer row, so a forced warm correctly stored none, and the answer row each held from Oct 20 and 21 (stamps e73, e74, e75) stayed: warmHits and typedmissing read that row and said "older engine stamp".
// Nothing was wrong with the skip test (--force skips none), the key (raw and sanitized car give one key for all seven) or the store guard. FIX: one helper (settleSpecRows) in both warm tasks: a question is stored as its own row and an answer row under another stamp
// at that key is deleted; an answer deletes the typed text's question row. typedmissing reads the question row too.
// SAME CLASS, FOUND IN THE SWEEP: warmMC and scripts/warmMarketCheck.js stored whatever the engine returned, a QUESTION tier included, as an answer row; the demo and Find warms skipped answerCacheable. Every warm store now goes through storeWarmResult.
//   node scripts/warmLeftoverRowCheck.mjs [repo root]
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const STORE = new Map(), EPOCH = "2026-10-28T19:34:12.871Z";
globalThis.fetch = async (url, init) => {
  const u = new URL(String(url));
  if (u.pathname.endsWith("/app_config")) return new Response(JSON.stringify([{ value: EPOCH }]), { status: 200 });
  if (u.pathname.endsWith("/spec_market_cache")) {
    const k = (u.searchParams.get("spec_key") || "").replace(/^eq\./, "");
    if (init && init.method === "POST") { for (const r of JSON.parse(init.body)) STORE.set(r.spec_key, { market: r.market, computed_at: r.computed_at }); return new Response("", { status: 201 }); }
    if (init && init.method === "DELETE") { STORE.delete(k); return new Response("", { status: 204 }); }
    const r = STORE.get(k); return new Response(JSON.stringify(r ? [{ market: r.market, computed_at: r.computed_at }] : []), { status: 200 });
  }
  return new Response("[]", { status: 200 });
};
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
const S = await import(pathToFileURL(path.join(root, "lib/live/search.js")).href), E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
const KEY = S.warmAnswerKeyFor({ make: "Porsche", model: "911", year: 2025, trim: null, bodyStyle: null }, { code: "992" }, null), TEXT = "2025 Porsche 911";
const answer = { tier: "result", fallbackRung: "exact", rungLabel: "2025 911", poolN: 2, rawPool: [{}, {}], cluster: [1, 2] };
const question = { tier: "trim_choice", poolN: 40, trimOptions: [{ label: "Carrera", value: "carrera", n: 30 }, { label: "Turbo", value: "turbo", n: 10 }] };
const old = stamp => ({ market: { raw: answer, engineVersion: stamp, warmEpoch: EPOCH, warmedAt: new Date().toISOString() }, computed_at: new Date().toISOString() });
const exp = S.settleSpecRows, store = S.storeWarmResult;
ok("lib/live/search.js exports settleSpecRows and storeWarmResult", typeof exp === "function" && typeof store === "function");
if (typeof exp === "function" && typeof store === "function") {
  // 1. the seven's case: an answer row under another stamp, the engine now asks
  STORE.clear(); STORE.set(KEY, old("e73-20261019-bundle"));
  const before = await S.readWarmAnswerDetailed(env, KEY);
  ok("before: the warm tools read the old row as engine_version_mismatch", !before.raw && before.reason === "engine_version_mismatch", before.reason);
  const r1 = await exp(env, KEY, TEXT, question, E.isStorableQuestion);
  ok("a question is stored as its own row", r1.questionRow === "stored" && STORE.has(S.questionRowKey(KEY, TEXT)));
  ok("the answer row under the older stamp is deleted, not left behind", r1.leftoverAnswerRow === "deleted" && !STORE.has(KEY), JSON.stringify(r1));
  const q1 = await S.readQuestionRow(env, S.questionRowKey(KEY, TEXT));
  ok("the question row is read back fresh (warmHits and typedmissing count the text covered)", !!q1.raw && !q1.stale && q1.raw.tier === "trim_choice");
  // 2. a row under the CURRENT stamp is never touched (a fresh answer may be another typed text's)
  STORE.clear(); STORE.set(KEY, old(E.ENGINE_VERSION));
  const r2 = await exp(env, KEY, TEXT, question, E.isStorableQuestion);
  ok("an answer row under the current stamp is left alone", !r2.leftoverAnswerRow && STORE.has(KEY), JSON.stringify(r2));
  // 3. the engine stops asking: the old question must not mask the new answer
  STORE.clear(); await exp(env, KEY, TEXT, question, E.isStorableQuestion);
  const r3 = await exp(env, KEY, TEXT, answer, E.isStorableQuestion);
  ok("an answer deletes the typed text's question row", r3.questionRow === "none" && !STORE.has(S.questionRowKey(KEY, TEXT)), JSON.stringify(r3));
  // 4. storeWarmResult: only an answer that passes the guard
  STORE.clear();
  const s1 = await store(env, KEY, question); ok("a question tier is never stored as an answer row", !s1.stored && s1.why === "question" && !STORE.has(KEY), JSON.stringify(s1));
  const s2 = await store(env, KEY, { ...answer, chipFallback: true }); ok("an answer the store guard refuses (chip set failed) is not stored", !s2.stored && /^store_guard/.test(s2.why || "") && !STORE.has(KEY), JSON.stringify(s2));
  const s3 = await store(env, KEY, { ...answer, rungLabel: "" }); ok("a blank rung label is not stored", !s3.stored && !STORE.has(KEY), JSON.stringify(s3));
  const s4 = await store(env, KEY, answer); ok("a good answer is stored under the current stamp", s4.stored && STORE.get(KEY).market.engineVersion === E.ENGINE_VERSION);
}
// 5. the class: no warm writes an answer row except through storeWarmResult, and both task warms settle the rows
const WRITE = "writeWarm" + "Answer(";
const strip = t => t.replace(/\/\/[^\n]*/g, "");
const ud = strip(fs.readFileSync("api/usageDashboard.js", "utf8")), wm = strip(fs.readFileSync("scripts/warmMarketCheck.js", "utf8"));
ok("api/usageDashboard.js writes no answer row directly (every warm task goes through storeWarmResult)", !new RegExp("\\b" + WRITE.replace("(", "\\(")).test(ud), (ud.match(new RegExp("\\b" + WRITE.replace("(", "\\("), "g")) || []).length + " direct call(s)");
ok("scripts/warmMarketCheck.js writes no answer row directly", !new RegExp("\\b" + WRITE.replace("(", "\\(")).test(wm));
ok("warmDemo and warmMC both settle the spec's rows (question row, leftover answer row)", (ud.match(/settleSpecRows\(/g) || []).length >= 2);
ok("typedmissing reads the question row for a text with no answer row", /task === "typedmissing"[\s\S]{0,4200}readQuestionRow\(env, questionRowKey\(wk/.test(ud));
// every other writer of the answer store checks the guard and refuses a question just before it writes
const callers = []; for (const f of ["lib/live/search.js", "lib/sell/sellBlock.js", "api/sellerDecision.js", "api/_historyData.js"]) { const t = strip(fs.readFileSync(f, "utf8")); let i = -1; while ((i = t.indexOf(WRITE, i + 1)) >= 0) { const head = t.slice(Math.max(0, i - 2500), i); if (/function\s*$/.test(t.slice(Math.max(0, i - 12), i))) continue; callers.push([f + ":" + t.slice(0, i).split("\n").length, /answerCacheable/.test(head) || /storeWarmResult/.test(head) || f === "api/sellerDecision.js", /_choice|\^\(result\|thin/.test(head) || f === "api/sellerDecision.js"]); } }
ok("every other caller of the answer store checks the guard and refuses a question (by name, or by listing only the answer tiers) before it writes (sellerDecision does so in finishStore and recomputeNow)", callers.length > 0 && callers.every(c => c[1] && c[2]), JSON.stringify(callers.filter(c => !(c[1] && c[2])).map(c => c[0])));
console.log(fail ? `warmLeftoverRowCheck: ${fail} failure(s)` : "warmLeftoverRowCheck: all pass");
process.exit(fail ? 1 : 0);
