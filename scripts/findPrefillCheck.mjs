// THE FIND PRE-FILL WRITES ROWS THE CARD READS WITHOUT COMPUTING (Lane B, Oct 29 2026). Launch is 10,000 subscribers at 7 AM: a card whose spec the engine asks a question about first computed its own Find answer the first time a reader opened it
// (the card said "still reading"). The pre-fill (lib/live/search.js prefillFindAnswer, run by ops task warmFind and scripts/warmFind.mjs) computes and stores that answer under FINDANS:<spec key> ahead of the read.
// This check runs the real writer and the real reader against an in-memory spec_market_cache: before the pre-fill a split card is "still reading"; after it, the card stands on the stored row and never shows "still reading"; a row already stored is
// skipped (--force recomputes); a spec whose read gives no sales answer is stored too, and its card says so in the engine's words.
//   node scripts/findPrefillCheck.mjs [repo root]
import fs from "node:fs";
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2";
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const table = new Map();   // spec_key -> { market, computed_at }
globalThis.fetch = async (url, init) => {
  const u = new URL(String(url));
  if (u.hostname !== "fake.supabase.test") throw new Error("offline");
  if (u.pathname.endsWith("/spec_market_cache")) {
    if ((init && init.method) === "POST") { for (const r of JSON.parse(init.body)) table.set(r.spec_key, { market: r.market, computed_at: r.computed_at || new Date().toISOString() }); return new Response("[]", { status: 201 }); }
    const k = (u.searchParams.get("spec_key") || "").replace(/^eq\./, ""), row = table.get(decodeURIComponent(k)) || table.get(k);
    return new Response(JSON.stringify(row ? [row] : []), { status: 200 });
  }
  return new Response("[]", { status: 200 });
};
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
const S = await import(pathToFileURL(path.join(root, "lib/live/search.js")).href);
const OLD_PICK = "These sales split into options priced apart, so pick one to see its range.";
const answer = kind => ({ tier: "result", poolN: 23, rawPool: Array.from({ length: 23 }, (_, i) => ({ id: "r" + i, _usd: 30000 + i * 1100, year: 1995, auction_end_date: "2026-0" + (1 + (i % 8)) + "-10", rtitle: "x", transmission: i < 14 ? "Manual" : "Tiptronic" })), cluster: null, optionsState: "split", headlineDimension: "gearbox",
  options: [{ dimension: "gearbox", label: "Manual", value: "manual", n: 14, low: 52000, high: 88000, rangeFloor: false, ownWindow: false, windowWords: "since October 2025" }, { dimension: "gearbox", label: "Tiptronic", value: "auto", n: 9, low: 41000, high: 61000, rangeFloor: false, ownWindow: false, windowWords: "since October 2025" }],
  windowWords: "since October 2025", thinReason: "pooled_apart", thinLine: OLD_PICK, resolvedCar: { year: 1995 }, fallbackRung: "model_any_year", rungLabel: "1995 911", escalatedFrom: { tier: kind } });
const CORE = { v: S.SPEC_V, engineVersion: S.ENGINE_VERSION_FOR_CHECK || "x", kind: "count", count: 23, window: "since October 2025", optionsState: "split", optionLines: ["Manual $57,000 to $92,500, 18 sales", "Tiptronic $48,000 to $65,500, 13 sales"], thinReason: "pooled_apart", thinLine: OLD_PICK, countLine: "23 sales since October 2025.", answerLine: OLD_PICK, family: "1995 911 Carrera cars" };
const LISTINGS = [["dochistory_choice", "1995 Porsche 911 Carrera Cabriolet", 1995, "Porsche", "911"], ["trim_choice", "1999 Porsche 911 Carrera 4 Coupe 6-Speed", 1999, "Porsche", "911"], ["generation_choice", "2004 BMW M3 Coupe", 2004, "BMW", "M3"], ["body_choice", "1990 Porsche 911 Carrera 4", 1990, "Porsche", "911"], ["gearbox_choice", "2008 Porsche 911 Carrera S", 2008, "Porsche", "911"], ["variant_choice", "1984 Land Rover Defender 110", 1984, "Land Rover", "Defender"]];
let engineCalls = 0; const engine = kind => async () => { engineCalls++; return { raw: answer(kind) }; };
for (const [kind, title, year, make, model] of LISTINGS) {
  const spec = { v: { year, make, model }, generation: null, title, key: JSON.stringify([make, model, null, year, null, null, null, null, null, null, null, null, null]) }, row = { listing_title: title, transmission: "Manual (6-speed)", body: null, year, make, model }, facts = { miles: 102000, gearbox: "manual", priceUsd: 70000 };
  const readBefore = await S.readWarmAnswerDetailed(env, S.findAnswerKeyFor(spec));
  const before = S.serveSplitCard(CORE, null, readBefore && readBefore.raw, row, facts, spec);
  ok(`${kind} [${title}]: before the pre-fill the card has no answer behind it and is "still reading"`, before.pending === true);
  const w = await S.prefillFindAnswer(env, spec, false, engine(kind));
  ok(`${kind}: the pre-fill stores the spec's Find answer under FINDANS:`, w.stored === true && !w.skipped && table.has(S.findAnswerKeyFor(spec)));
  const readAfter = await S.readWarmAnswerDetailed(env, S.findAnswerKeyFor(spec)), c0 = engineCalls;
  const after = S.serveSplitCard(CORE, null, readAfter && readAfter.raw, row, facts, spec);
  ok(`${kind}: after the pre-fill the card is never "still reading": it stands on the stored row and computes nothing (no engine call)`, after.pending === false && !!after.mk && after.mk.matchedOption && after.mk.matchedOption.value === "manual" && engineCalls === c0);
  const again = await S.prefillFindAnswer(env, spec, false, engine(kind)), n1 = engineCalls;
  ok(`${kind}: a row already stored at the current epoch and stamp is skipped, not recomputed`, again.stored === true && again.skipped === true && n1 === c0);
  const forced = await S.prefillFindAnswer(env, spec, true, engine(kind));
  ok(`${kind}: --force recomputes it`, forced.stored === true && !forced.skipped && engineCalls === n1 + 1);
}
// a spec whose read gives no sales answer is stored too; its card says so in the engine's words
{ const [kind, title, year, make, model] = LISTINGS[0], spec = { v: { year, make, model }, generation: null, title, key: "unresolvable-spec" }, row = { listing_title: title, transmission: "Manual", year, make, model };
  const w = await S.prefillFindAnswer(env, spec, false, async () => ({ raw: { tier: "not_tracked", poolN: 0 } }));
  const rd = await S.readWarmAnswerDetailed(env, S.findAnswerKeyFor(spec)), card = S.serveSplitCard(CORE, null, rd && rd.raw, row, { miles: 1 }, spec);
  ok("a spec that cannot be read is stored too, and its card says so plainly (not 'still reading', no figures)", w.stored === true && card.pending === false && /sales for this exact car cannot be read/.test(String(card.mk && card.mk.answerLine)) && !/\d/.test(String(card.mk && card.mk.answerLine).replace(/this exact car/, ""))); }
// a spec that stores nothing says WHY (the 1966 Corvette 427: trim_choice, tier result, not stored): a question still at asked 2, a result the store guard rejects (named), nothing from the engine
{ const sp = { v: { year: 1966, make: "Chevrolet", model: "Corvette" }, generation: null, title: "427-Powered 1966 Chevrolet Corvette Convertible", key: "k-427" };
  const q = await S.prefillFindAnswer(env, sp, true, async () => ({ raw: { tier: "trim_choice" } }));
  ok("a question still asked at asked 2 says so", q.stored === false && /still_a_question_at_asked_2:trim_choice/.test(q.reason || ""), q.reason);
  const g = await S.prefillFindAnswer(env, sp, true, async () => ({ raw: { tier: "result", poolN: 20, rawPool: new Array(18).fill({}), fallbackRung: "model_any_year", rungLabel: "x" } }));
  ok("a result the store guard rejects names the rule and the counts", g.stored === false && /store_guard:poolsize_ne_receipts:20!=18/.test(g.reason || "") && g.poolN === 20 && g.rawPool === 18, g.reason);
  const n = await S.prefillFindAnswer(env, sp, true, async () => ({ raw: null }));
  ok("nothing from the engine says so", n.stored === false && n.reason === "engine_returned_nothing", n.reason); }
// the runner and the task exist and are wired
{ const ud = fs.readFileSync("api/usageDashboard.js", "utf8"), sc = fs.readFileSync("scripts/warmFind.mjs", "utf8");
  ok("ops task warmFind (write) and findasks (read) exist", /task === "warmFind"/.test(ud) && /task === "findasks"/.test(ud));
  ok("the runner chains, resumes, forces, counts and prints a progress line every 500 specs", /--chain/.test(sc) && /--from/.test(sc) && /--force/.test(sc) && /--count/.test(sc) && /% 500|\/ 500/.test(sc)); }
console.log(fail ? `findPrefillCheck: ${fail} failure(s)` : "findPrefillCheck: all pass");
process.exit(fail ? 1 : 0);
