// factCoverageCheck (Lane D, Nov 19 2026, lane-d-factmine-4): the coverage read of the value driver miner (lib/factCoverage.js, task=factcoverage), on fixtures and a fake database (no network, no model).
//  1 THE SENTENCES: a description is split into sentences (ends, line breaks, a few abbreviations kept whole, pieces with under 3 letters not counted); a sentence is mined when a statement's span overlaps it, skipped when none does.
//  2 THE SECOND READ: only the skipped sentences are sent, in a separate call with one question (a fact about the car, yes or no, and the kind in two words); the mined ones and the statements are never in it. No word list: the model answers, the code counts.
//  3 COUNTS ONLY: what is stored and what is returned is numbers and kinds of two words; no sentence text, no quote, no seller. The row's columns are all in docs/supabase-factmine.sql.
//  4 THE SAME DOOR AND LIMITS as factmine: the same refusals, the same three at once lease, the token cap, the time budget; a listing is read once per miner version and only after it was mined.
//   node scripts/factCoverageCheck.mjs [repo root]      --mutants breaks one rule at a time in a copy (each must fail)
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { spawnSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const args = process.argv.slice(2), here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(args.find(a => !a.startsWith("--")) || path.join(here, ".."));
if (args.includes("--mutants")) process.exit(mutants());
process.chdir(ROOT);
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const FM = await imp("lib/factMine.js"), FC = await imp("lib/factCoverage.js");
let pass = 0, fail = 0; const fails = []; const ok = (n, c, d) => { if (c) pass++; else { fail++; fails.push(n + (d !== undefined ? " " + JSON.stringify(d).slice(0, 240) : "")); } };
const section = async (name, fn) => { try { await fn(); } catch (e) { fail++; fails.push(name + " threw " + String(e && e.stack || e).slice(0, 240)); } };
const MARK = "SECRETSENTENCE";
// a description of eight sentences: three the miner will have written statements for (spans below), five it left out (two hold a fact, three do not)
const S = ["The timing chain guides were replaced in 2022.", "Service records are included from new.", "No accidents, clean title.", "It has rain-sensing wipers and a sunroof " + MARK + "1.", "The car lives in a heated garage " + MARK + "2.", "Thanks for looking and good luck bidding.", "Pickup is possible from the seller's town " + MARK + "3.", "Questions are welcome in the comments."];
const DESC = S.join(" ");
const spanOf = k => [DESC.indexOf(S[k]) + 4, DESC.indexOf(S[k]) + 20];   // a statement inside sentence k
const ROWS = n => Array.from({ length: n }, (_, i) => ({ source_id: "C" + (100 + i), listing_title: "2004 BMW M3 Coupe", year: 2004, sale_date: "2026-03-1" + (i % 9), description: DESC, project_flag: null, sale_price_usd: 4000000 + i, high_bid: null, raw_record: { description: DESC } }));
const Q = { source: "bringatrailer", family: "e46_m3", from: "2026-01-01", to: "2026-12-31" };
const mkDb = (n = 3, o = {}) => {
  const rows = o.rows || ROWS(n), db = { runs: new Map(), mentions: [], cover: new Map(), leases: [], modelCalls: 0, prompts: [], selects: [], tablesMissing: false, inserts: [] };
  for (const r of rows) { const id = "bringatrailer:" + r.source_id; if (!o.noRuns) db.runs.set(id, { listing_id: id, miner_version: FM.MINER_VERSION, status: "done" }); for (const k of o.minedSentences || [0, 1, 2]) db.mentions.push({ listing_id: id, miner_version: FM.MINER_VERSION, span_start: spanOf(k)[0], span_end: spanOf(k)[1] }); }
  db.select = async qs => {
    db.selects.push(qs);
    if (qs.startsWith("sales_archive?")) { const off = Number((/offset=(\d+)/.exec(qs) || [0, 0])[1]), lim = Number((/limit=(\d+)/.exec(qs) || [0, 100])[1]); return rows.slice(off, off + lim); }
    if (qs.startsWith("app_usage_events?")) { if (db.leaseDown) return null; const gte = decodeURIComponent((/created_at=gte\.([^&]*)/.exec(qs) || [0, ""])[1]); return db.leases.filter(l => !gte || l.at >= Date.parse(gte)).map(l => ({ id: l.id, status: l.status, metadata: l.metadata })); }
    const ids = () => decodeURIComponent((/listing_id=in\.([^&]*)/.exec(qs) || [0, ""])[1]).replace(/[()"]/g, "").split(",");
    if (qs.startsWith("listing_mining_runs?")) { if (db.tablesMissing) return null; return ids().filter(i => db.runs.has(i)).map(i => ({ listing_id: i, status: db.runs.get(i).status })); }
    if (qs.startsWith("listing_coverage?")) { if (db.tablesMissing) return null; return ids().filter(i => db.cover.has(i)).map(i => ({ listing_id: i })); }
    if (qs.startsWith("listing_mentions?")) { const id = decodeURIComponent((/listing_id=eq\.([^&]*)/.exec(qs) || [0, ""])[1]); return db.mentions.filter(m => m.listing_id === id).map(m => ({ span_start: m.span_start, span_end: m.span_end })); }
    return [];
  };
  db.insert = async (table, rs) => { if (table === "app_usage_events") { if (db.leaseWriteDown) return { error: "x" }; for (const r of rs) db.leases.push({ id: db.leases.length + 1, at: Date.now(), status: r.status, metadata: r.metadata }); return {}; } db.inserts.push([table, rs]); if (table === "listing_coverage") { if (db.writeDown) return { error: "x" }; for (const r of rs) db.cover.set(r.listing_id, r); } return {}; };
  return db;
};
// the second read's fake model: it answers each numbered line by what the line says (the check's own markers decide, never the code under test)
const lines = u => String(u).split("\n").map(l => /^(\d+)\.\s(.*)$/.exec(l)).filter(Boolean).map(m => [Number(m[1]), m[2]]);
const answerer = (kindFor = () => null, usage = { input_tokens: 700, output_tokens: 60 }) => async ({ system, user }) => ({ text: lines(user).map(([n, t]) => { const k = kindFor(t); return k ? `${n} | yes | ${k}` : `${n} | no | -`; }).join("\n"), usage, stop_reason: "end_turn" });
const KIND = t => /wipers/.test(t) ? "option package" : /garage/.test(t) ? "storage" : null;
const cover = (db, q, model, extra) => FC.runFactCoverage({ ...Q, ...q }, { select: db.select, insert: db.insert, callModel: async a => { db.modelCalls++; db.prompts.push(a); return (model || answerer(KIND))(a); }, ...(extra || {}) });

await section("sentences", async () => {
  const t = "The car was repainted in 2019. Approx. 61k miles on it! No. 12 of 40 built.\n- Sport seats\n12\nThanks for looking.\n\n";
  const sn = FC.sentencesOf(t).map(x => t.slice(x.s, x.e));
  ok("a description is split at sentence ends and line breaks; Approx. and No. do not end a sentence", JSON.stringify(sn) === JSON.stringify(["The car was repainted in 2019.", "Approx. 61k miles on it!", "No. 12 of 40 built.", "- Sport seats", "Thanks for looking."]), sn);
  ok("a piece with under three letters (a number, a bullet mark) is not a sentence; an empty text has none", !sn.includes("12") && FC.sentencesOf("").length === 0 && FC.sentencesOf("  \n - 12 ").length === 0);
  const s8 = FC.sentencesOf(DESC); ok("the fixture description is eight sentences", s8.length === 8, s8.length);
  const sp = FC.splitMined(s8, [spanOf(0), spanOf(1), spanOf(2)]);
  ok("a sentence is mined when a statement's span lies in it, skipped when none does: 3 mined, 5 skipped, in order", JSON.stringify(sp.mined) === "[0,1,2]" && JSON.stringify(sp.skipped) === "[3,4,5,6,7]", sp);
  ok("a span that only TOUCHES a sentence (ends where it starts, or starts where it ends) does not mark it mined", !FC.splitMined(s8, [[s8[3].s - 6, s8[3].s]]).mined.includes(3) && !FC.splitMined(s8, [[s8[3].e, s8[3].e + 5]]).mined.includes(3));
  ok("a span that crosses two sentences marks both mined", JSON.stringify(FC.splitMined(s8, [[s8[2].e - 4, s8[3].s + 3]]).mined) === "[2,3]");
});
await section("the second read", async () => {
  const db = mkDb(3), r = await cover(db, { limit: 3 });
  ok("it ran and read the three mined listings", r.ok && r.body.read === 3 && r.body.failed === 0 && db.modelCalls === 3, r.body || r);
  ok("COUNTS per listing and in the answer: 8 sentences, 3 mined, 5 skipped, 2 judged to hold a fact, a listing at a time", r.body.sentences === 24 && r.body.sentences_mined === 9 && r.body.sentences_skipped === 15 && r.body.skipped_with_fact === 6 && r.body.unanswered === 0 && r.body.skipped_with_fact_pct === 40, r.body);
  ok("by kind: option package 3 and storage 3 (the kind in two words, counted)", JSON.stringify(r.body.by_kind) === JSON.stringify({ "option package": 3, storage: 3 }), r.body.by_kind);
  const p = db.prompts[0];
  ok("the read is SEPARATE: its own system prompt, with ONE question (a fact about the car, yes or no) and the kind in TWO words", /does this sentence state a fact about the car/.test(p.system) && /yes or no/.test(p.system) && /TWO words at most/.test(p.system) && p.system !== FM.SYSTEM && !/topic \| category/.test(p.system), p.system.slice(0, 200));
  const sent = lines(p.user).map(x => x[1]);
  ok("only the five SKIPPED sentences are sent, numbered 1 to 5; none of the three mined sentences is in it", sent.length === 5 && sent.every(x => !S.slice(0, 3).some(m => x.includes(m.slice(0, 24)))) && sent.some(x => x.includes(MARK + "1")) && sent.some(x => x.includes("Thanks for looking")), sent);
  ok("no statement, topic, quote or category of the miner is in the second read (it knows nothing of what was mined)", !/topic|category|statement|timing chain|records/i.test(p.user), p.user.slice(0, 120));
  ok("NO WORD LIST: the code holds no list of words that mean a fact (the model answers, the code counts): no keyword regex in lib/factCoverage.js decides yes or no", !/\.test\(sentence|isFact|FACT_WORDS|KEYWORDS|\/\(garage\|/.test(fs.readFileSync(path.join(ROOT, "lib/factCoverage.js"), "utf8")));
  const row = [...db.cover.values()][0];
  ok("the stored row holds counts and kinds only (listing, version, source, family, the five counts, kinds, tokens): no text", JSON.stringify(Object.keys(row).sort()) === JSON.stringify(["family", "kinds", "listing_id", "miner_version", "sentences", "sentences_mined", "sentences_skipped", "skipped_with_fact", "source", "tokens_input", "tokens_output", "unanswered"].sort()) && row.sentences === 8 && row.sentences_mined === 3 && row.sentences_skipped === 5 && row.skipped_with_fact === 2, row);
  const all = JSON.stringify([r.body, [...db.cover.values()]]);
  ok("no sentence text anywhere in the answer or in what was stored (the marker in three skipped sentences, the sentence words)", !all.includes(MARK) && !/Thanks for looking|heated garage|chain guides|Pickup/.test(all), all.slice(0, 160));
  ok("every kind is at most two words and 30 characters", Object.keys(r.body.by_kind).every(k => k.split(" ").length <= 2 && k.length <= 30));
});
await section("a kind longer than two words, a missing answer, a bad answer", async () => {
  const db = mkDb(1), m = async ({ user }) => ({ text: lines(user).map(([n]) => n === 1 ? "1 | yes | very long kind of fact words" : n === 2 ? "2 | maybe | x" : n === 4 ? "4 | no" : n === 5 ? "garbage line" : "3 | YES | Paint Work").join("\n"), usage: { input_tokens: 500, output_tokens: 50 } });
  const r = await cover(db, { limit: 1 }, m);
  ok("a kind is cut to two words; a maybe, a missing number and a garbage line are UNANSWERED (never counted as a fact)", r.ok && r.body.skipped_with_fact === 2 && r.body.unanswered === 2 && r.body.by_kind["very long"] === 1 && r.body.by_kind["paint work"] === 1, r.body);
  const none = mkDb(1), r2 = await cover(none, { limit: 1 }, async () => ({ text: "", usage: { input_tokens: 400, output_tokens: 0 } }));
  ok("an empty answer is five unanswered, none a fact", r2.ok && r2.body.unanswered === 5 && r2.body.skipped_with_fact === 0, r2.body);
});
await section("a long listing is read in batches", async () => {
  const long = Array.from({ length: 300 }, (_, i) => `Sentence number ${i} about the car stands here.`).join(" "), db = mkDb(1, { rows: ROWS(1).map(r => ({ ...r, description: long, raw_record: { description: long } })), minedSentences: [] });
  db.mentions.length = 0; const r = await cover(db, { limit: 1 }, answerer(t => /number 7 /.test(t) ? "odd fact" : null));
  ok("300 skipped sentences go in three calls of at most 120, every one counted", r.ok && db.modelCalls === 3 && r.body.sentences === 300 && r.body.sentences_skipped === 300 && lines(db.prompts[0].user).length === 120 && r.body.skipped_with_fact === 1, [db.modelCalls, r.body.sentences]);
  const none = mkDb(1, { rows: ROWS(1).map(r => ({ ...r, description: DESC, raw_record: { description: DESC } })), minedSentences: [0, 1, 2, 3, 4, 5, 6, 7] }), r2 = await cover(none, { limit: 1 });
  ok("a listing whose every sentence was mined needs no second read: no model call, its row says 8 mined and 0 skipped", r2.ok && none.modelCalls === 0 && [...none.cover.values()][0].sentences_skipped === 0 && [...none.cover.values()][0].sentences_mined === 8, r2.body);
});
await section("once per miner version, and only after mining", async () => {
  const db = mkDb(3), a = await cover(db, { limit: 3 }), b = await cover(db, { limit: 3 });
  ok("a second call reads nothing again (already covered 3, no model call)", a.body.read === 3 && b.ok && b.body.asked === 0 && b.body.already_covered === 3 && db.modelCalls === 3, b.body);
  const n = mkDb(3, { noRuns: true }), c = await cover(n, { limit: 3 });
  ok("a listing the miner has not read (no done run for this version) is not read for coverage", c.ok && c.body.asked === 0 && n.modelCalls === 0, c.body);
  const f = mkDb(2); f.runs.set("bringatrailer:C100", { listing_id: "bringatrailer:C100", miner_version: FM.MINER_VERSION, status: "failed" }); const d = await cover(f, { limit: 2 });
  ok("a listing whose mining failed is not read for coverage", d.body.asked === 1, d.body);
  const w = mkDb(2); w.runs.get("bringatrailer:C100").miner_version = "fm3"; const e = await cover(w, { limit: 2 });
  ok("the version is the miner's own (a run row of an older version is not a mined listing for this one)", e.ok && e.body.miner_version === FM.MINER_VERSION, e.body);
  ok("the reads ask for this miner version only", db.selects.some(q => q.startsWith("listing_coverage?") && q.includes("miner_version=eq." + FM.MINER_VERSION)) && db.selects.some(q => q.startsWith("listing_mentions?") && q.includes("miner_version=eq." + FM.MINER_VERSION)));
});
await section("failures", async () => {
  const db = mkDb(3); let n = 0; const r = await cover(db, { limit: 3 }, async a => { n++; if (n === 1) throw new Error("model 429"); return answerer(KIND)(a); });
  ok("a failed model call fails that listing only, with a short code, and writes no row", r.ok && r.body.failed === 1 && r.body.read === 2 && r.body.failed_by_reason.model_429 === 1 && db.cover.size === 2, r.body);
  const again = await cover(db, { limit: 3 }); ok("the failed listing is read again next time", again.body.asked === 1 && again.body.read === 1, again.body);
  const w = mkDb(1); w.writeDown = true; const x = await cover(w, { limit: 1 }); ok("a row that cannot be written is a failed listing, not a counted one", x.ok && x.body.failed === 1 && x.body.read === 0 && x.body.sentences === 0, x.body);
  const t = mkDb(1); t.tablesMissing = true; const y = await cover(t, { limit: 1 }); ok("missing tables refuse cleanly with the SQL named", y.ok === false && y.status === 409 && /supabase-factmine\.sql/.test(y.why), y);
});
await section("the same door and limits as factmine", async () => {
  const refused = async (q, re) => { const db = mkDb(2), r = await cover(db, q); return r.ok === false && r.status === 400 && re.test(r.why) && db.modelCalls === 0 && db.leases.length === 0 && db.selects.length === 0; };
  ok("an unwindowed call, a window over 366 days, more than 25 listings, a token cap over its limit, a source with no full text and a family outside the pilot are refused, each before a lease or a read", await refused({ from: "" }, /from and to/) && await refused({ from: "2024-01-01", to: "2026-12-31" }, /366/) && await refused({ limit: 26 }, /25/) && await refused({ tokenCap: 999999 }, /tokenCap/) && await refused({ source: "ebay" }, /source/) && await refused({ family: "ferrari" }, /family/));
  const busy = mkDb(2); for (let i = 1; i <= 3; i++) busy.leases.push({ id: i, at: Date.now(), status: "running", metadata: { lease: "other" + i } });
  const r = await cover(busy, { limit: 2 });
  ok("it shares the three at once lease: with three calls running the fourth is refused (429) and reads nothing", r.ok === false && r.status === 429 && busy.modelCalls === 0 && busy.cover.size === 0, r);
  const db = mkDb(2); await cover(db, { limit: 2 }); const st = db.leases.map(l => l.status).join();
  ok("its lease is released when it answers (running then released)", st === "running,released", st);
  const th = mkDb(1); await cover(th, { limit: 1 }, async () => { throw new Error("boom"); }); ok("and when every read failed", th.leases.map(l => l.status).join() === "running,released");
  const down = mkDb(1); down.leaseDown = true; const rd = await cover(down, { limit: 1 }); ok("fail closed: the lease count unreadable means it does not start", rd.ok === false && rd.status === 503 && down.modelCalls === 0, rd);
  const cap = mkDb(5), rc = await cover(cap, { limit: 5, tokenCap: 1000 }, answerer(KIND, { input_tokens: 700, output_tokens: 400 }), { timing: { parallel: 1 } });
  ok("the token cap stops the call: it starts no listing once the cap is reached and says so", rc.ok && rc.body.stopped === "token_cap" && rc.body.read < 5 && rc.body.read >= 1, rc.body);
  const sl = mkDb(30), slow = async a => { await new Promise(r => setTimeout(r, 120)); return answerer(KIND)(a); }, rt = await cover(sl, { limit: 25 }, slow, { timing: { budgetMs: 700, modelTimeoutMs: 200, marginMs: 50, parallel: 2 } });
  ok("the time budget stops the call: it answers by the budget, says time, and what it read is stored", rt.ok && rt.body.stopped === "time" && rt.body.read > 0 && rt.body.read < 25 && rt.body.elapsed_ms < 1500, rt.body);
  const gu = mkDb(5), fast = async a => { await new Promise(r => setTimeout(r, 40)); return answerer(KIND)(a); }, rg = await cover(gu, { limit: 5 }, fast, { timing: { budgetMs: 300, modelTimeoutMs: 200, marginMs: 50, parallel: 1 } });
  ok("a listing is started only if it can finish inside the budget: it stops before the deadline, with what it started finished and none in flight", rg.ok && rg.body.stopped === "time" && rg.body.read >= 1 && rg.body.read < 5 && rg.body.elapsed_ms < 250, rg.body);
  const hung = mkDb(1), rh = await cover(hung, { limit: 1 }, () => new Promise(() => {}), { timing: { modelTimeoutMs: 150 } });
  ok("a model call that never comes back is cut at its timeout (a failed listing, the call answers)", rh.ok && rh.body.failed === 1 && rh.body.failed_by_reason.timeout === 1, rh.body);
});
await section("wiring and SQL", async () => {
  const api = fs.readFileSync(path.join(ROOT, "api/usageDashboard.js"), "utf8"), sql = fs.readFileSync(path.join(ROOT, "docs/supabase-factmine.sql"), "utf8");
  ok("the task is wired through the same door: factcoverage is in the ops task list, imports lib/factCoverage.js and runs runFactCoverage, with the same model and the same status passing", /task === "factcoverage"/.test(api) && /lib\/factCoverage\.js/.test(api) && /FM\.runFactCoverage/.test(api) && /makeCallModel\(env, task\)/.test(api));
  ok("the SQL has the table with counts only (no text column), RLS on and anon and authenticated revoked", /create table if not exists listing_coverage/.test(sql) && /alter table listing_coverage\s+enable row level security;/.test(sql) && /revoke all on listing_coverage\s+from anon, authenticated;/.test(sql) && !/listing_coverage \([^;]*\b(sentence_text|text|quote|description)\s+text/.test(sql.replace(/--.*$/gm, "")));
  const db = mkDb(1); await cover(db, { limit: 1 }); const keys = Object.keys([...db.cover.values()][0]), cols = sql.replace(/--.*$/gm, "");
  ok("CLASS (a column the code writes that the table does not have): every key of the coverage row is a column of listing_coverage in the SQL", keys.every(k => new RegExp("\\b" + k + "\\b").test(/create table if not exists listing_coverage \(([\s\S]*?)\n\);/.exec(cols)[1])), keys);
});
console.log(`factCoverageCheck: ${pass} pass, ${fail} FAIL`); for (const f of fails) console.log("FAIL " + f);
process.exit(fail ? 1 : 0);

function mutants() {
  const me = fileURLToPath(import.meta.url), R = ROOT;
  const sub = (file, from, to) => [file, s => { if (!s.includes(from)) return s; return s.replace(from, () => to); }, from];
  const M = [
    ["a mined sentence is sent to the second read", ...sub("lib/factCoverage.js", "(spans.some(([a, b]) => a < sn.e && b > sn.s) ? mined : skipped)", "(false ? mined : skipped)")],
    ["a skipped sentence counts as mined when its end touches a span", ...sub("lib/factCoverage.js", "a < sn.e && b > sn.s", "a <= sn.e && b >= sn.s")],
    ["a span that crosses two sentences marks only the first", ...sub("lib/factCoverage.js", "spans.some(([a, b]) => a < sn.e && b > sn.s)", "spans.some(([a, b]) => a >= sn.s && a < sn.e)")],
    ["Approx. ends a sentence", ...sub("lib/factCoverage.js", "if (m[0][0] !== \"\\n\" && ABBR.test(", "if (false && ABBR.test(")],
    ["a piece with under three letters is a sentence", ...sub("lib/factCoverage.js", ".length >= 3) {", ".length >= 0) {")],
    ["the answer is not asked for the kind in two words", ...sub("lib/factCoverage.js", "TWO words at most", "any number of words")],
    ["a kind is not cut to two words", ...sub("lib/factCoverage.js", ".slice(0, 2).join(\" \")", ".join(\" \")")],
    ["an unanswered sentence counts as a fact", ...sub("lib/factCoverage.js", "if (!ans.has(k)) { unanswered++; continue; }", "if (!ans.has(k)) { yes++; unanswered++; continue; }")],
    ["a maybe counts as yes", ...sub("lib/factCoverage.js", "if (yn === \"yes\") ans.set(k, kindWords(p[2])); else if (yn === \"no\") ans.set(k, null);", "if (yn !== \"no\") ans.set(k, kindWords(p[2])); else ans.set(k, null);")],
    ["the second read carries the mined statements", ...sub("lib/factCoverage.js", "return { system: COVERAGE_SYSTEM, user: sentencesText.map", "return { system: COVERAGE_SYSTEM, user: 'topic category statement | ' + sentencesText.map")],
    ["the sentence text is stored in the row", ...sub("lib/factCoverage.js", "kinds, tokens_input: tin, tokens_output: tout };", "kinds, tokens_input: tin, tokens_output: tout, text: text.slice(0, 200) };")],
    ["a sentence text is returned in the answer", ...sub("lib/factCoverage.js", "out.read++; out.sentences += sn.length;", "out.by_kind[text.slice(0, 20)] = 1; out.read++; out.sentences += sn.length;")],
    ["more than 120 sentences go in one call", ...sub("lib/factCoverage.js", "COVERAGE_BATCH = 120", "COVERAGE_BATCH = 100000")],
    ["a listing is read again when it is already covered", ...sub("lib/factCoverage.js", "mined.has(ids[i]) && !covered.has(ids[i])", "mined.has(ids[i])")],
    ["a listing that was not mined is read", ...sub("lib/factCoverage.js", "mined.has(ids[i]) && !covered.has(ids[i])", "!covered.has(ids[i])")],
    ["a failed mining run counts as mined", ...sub("lib/factCoverage.js", "if (r && r.status === \"done\") mined.add", "if (r) mined.add")],
    ["the coverage read ignores the miner version", ...sub("lib/factCoverage.js", "listing_coverage?select=listing_id&miner_version=eq.${MINER_VERSION}&", "listing_coverage?select=listing_id&")],
    ["the mentions read ignores the miner version", ...sub("lib/factCoverage.js", "&listing_id=eq.${encodeURIComponent(id)}&miner_version=eq.${MINER_VERSION}&limit=1000", "&listing_id=eq.${encodeURIComponent(id)}&limit=1000")],
    ["a failed model call still writes a row", ...sub("lib/factCoverage.js", "if (!got) { out.tokens_input += tin; out.tokens_output += tout; return failOne(code || \"no_answer\"); }", "if (!got) { out.tokens_input += tin; out.tokens_output += tout; got = { text: '', usage: {} }; }")],
    ["a row that cannot be written is counted as read", ...sub("lib/factCoverage.js", "if (w && w.error) return failOne(\"write_failed\");", "")],
    ["the lease is not taken", ...sub("lib/factCoverage.js", "const L = await takeLease(deps); if (!L.ok) return { ok: false, status: L.status, why: L.why };\n  try { return await run(p, deps); } finally { await releaseLease(deps, L.lease); }", "return await run(p, deps);")],
    ["the lease is not released", ...sub("lib/factCoverage.js", "finally { await releaseLease(deps, L.lease); }", "finally { }")],
    ["the door is skipped (no parse)", ...sub("lib/factCoverage.js", "if (!p.ok) return { ok: false, status: 400, why: p.why };", "if (!p.ok) p.call = p.call || {};")],
    ["the token cap is not applied", ...sub("lib/factCoverage.js", "if (out.tokens_input + out.tokens_output + inflight * T.estTokens >= call.tokenCap) {", "if (false) {")],
    ["the time budget is not applied", ...sub("lib/factCoverage.js", "if (Date.now() - t0 + T.modelTimeoutMs + T.marginMs > T.budgetMs) {", "if (false) {")],
    ["the model call has no timeout", ...sub("lib/factCoverage.js", "await callWithTimeout(deps, { system: pr.system, user: pr.user, maxTokens: COVERAGE_MAX_OUT }, T.modelTimeoutMs)", "await deps.callModel({ system: pr.system, user: pr.user, maxTokens: COVERAGE_MAX_OUT })")],
    ["the percent is of all sentences, not the skipped", ...sub("lib/factCoverage.js", "snap.skipped_with_fact / snap.sentences_skipped", "snap.skipped_with_fact / snap.sentences")],
    ["a word list decides a fact", ...sub("lib/factCoverage.js", "const a = parseCoverage(got.text, batch.length);", "const FACT_WORDS = /garage|wipers/; const a = parseCoverage(got.text, batch.length); void FACT_WORDS;")],
    ["the endpoint does not route factcoverage", ...sub("api/usageDashboard.js", "task === \"factcoverage\" ? FM.runFactCoverage", "task === \"factcoverage\" ? FM.runFactPrice")],
    ["the SQL has no coverage table", ...sub("docs/supabase-factmine.sql", "create table if not exists listing_coverage", "create table if not exists listing_coverage_x")],
    ["the coverage table is open to anon", ...sub("docs/supabase-factmine.sql", "revoke all on listing_coverage    from anon, authenticated;", "")],
    ["the unanswered column is missing from the SQL", ...sub("docs/supabase-factmine.sql", "  unanswered         integer     not null default 0,", "")],
  ];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "factcov-mut-")), copy = path.join(tmp, "tree");
  for (const d of ["lib", "api", "data", "docs", "scripts"]) fs.cpSync(path.join(R, d), path.join(copy, d), { recursive: true });
  for (const f of ["package.json"]) if (fs.existsSync(path.join(R, f))) fs.copyFileSync(path.join(R, f), path.join(copy, f));
  fs.symlinkSync(path.join(R, "node_modules"), path.join(copy, "node_modules"));
  let killed = 0, survived = 0;
  for (const [name, file, fn, from] of M) {
    const fp = path.join(copy, file), orig = fs.readFileSync(fp, "utf8"), mut = fn(orig);
    if (mut === orig) { console.log("SKIP (text not found) " + name); survived++; continue; }
    fs.writeFileSync(fp, mut);
    const r = spawnSync(process.execPath, [path.join(copy, "scripts/factCoverageCheck.mjs"), copy], { encoding: "utf8", timeout: 120000 });
    fs.writeFileSync(fp, orig);
    const dead = r.status !== 0; if (dead) killed++; else survived++; console.log((dead ? "KILLED   " : "SURVIVED ") + name);
  }
  console.log(`factCoverageCheck mutants: ${killed} of ${M.length} killed${survived ? `, ${survived} SURVIVED or skipped` : ""}`);
  fs.rmSync(tmp, { recursive: true, force: true });
  return survived ? 1 : 0;
}
