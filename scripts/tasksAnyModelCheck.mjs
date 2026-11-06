// ANY MODEL IN A TASK (Lane B, Nov 2026, CREW ONLY, NOT LIVE). Lane F's audit: "a red Ferrari near Chicago" was answered with "Which Ferrari model should Sam look for?" before it would start, and the read-back
// never said any model. CAUSE: validateJob asks the model question for every hunt with a make and no model (it had an Any option, but only after the question), and jobPhrase prints the make's plural
// ("Ferraris") whether the buyer chose a model or any. Affects every make-only hunt (Ferrari, Porsche, Ford ... with a colour, place, price or mileage) and its read-back, reasons and emails (jobPhrase / matchReasonList).
// FIX (crew only): a crew request with a make, no model and at least one other thing wanted starts as any model at once; the read-back says "<make> cars of any model" and the reasons list says "any <make> model".
//   (1) the real draftTurn, setup model stubbed: crew starts as any model with no question, the read-back says so; a non crew request is asked the question exactly as before
//   (2) a bare make still asks (with the Any option); choosing Any reads back "of any model" for crew and exactly today's words for everyone else
//   (3) the match: an any-model hunt matches every model of the make that meets the rest
//   (4) crew only: the key is stripped from a non crew draft, start and edit; kept for crew
//   (5) nothing changes without the key: jobPhrase, matchReasons and summaryFor for any_model jobs without it equal the base tree (4fd772dd)
//   node scripts/tasksAnyModelCheck.mjs [repo root]      --mutants proves each rule by breaking it in a copy
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { fileURLToPath, pathToFileURL } from "node:url"; import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), rootArg = args.find(a => !a.startsWith("--"));
const root = path.resolve(rootArg || path.join(here, ".."));
const BASE = "4fd772ddfa8e0e5667f76f8533cff8a69b2f77b9";
if (args.includes("--mutants")) {
  const L = "lib/tasks/tasks.js";
  const muts = [
    [L, "(ctx.noMoreAsks || crewAny(v.filters, ctx.crew))", "(ctx.noMoreAsks)", "(1) a crew request starts as any model with no question"],
    [L, "export const crewAny = (f, crew) => !!crew && !!f &&", "export const crewAny = (f, crew) => !!f &&", "(1) a non crew request is asked the question"],
    [L, "...(ctx.crew ? { any_model_read: \"1\" } : {}) }) : null;", "}) : null;", "(1) the read-back says any model"],
    [L, "noun = f.make + \" cars of any model\";", "noun = noun;", "(1) the read-back says any model"],
    [L, "any_model: \"1\", ...(crew ? { any_model_read: \"1\" } : {}) }", "any_model: \"1\" }", "(2) choosing Any reads back of any model for crew"],
    [L, "any_model: \"1\", ...(crew ? { any_model_read: \"1\" } : {}) }", "any_model: \"1\", any_model_read: \"1\" }", "(2) everyone else reads back today's words"],
    [L, "export const wantsMore = f => !!f && WANTS.some(k => f[k] != null && f[k] !== \"\");", "export const wantsMore = f => true;", "(2) a bare make still asks"],
    [L, "delete r.preferred; delete r.any_model_read; return r; };", "delete r.preferred; return r; };", "(4) a non crew draft never keeps the key"],
    [L, "const out = { ...p }; delete out.preferred; if (!out.any_model) delete out.any_model_read;", "const out = { ...p }; delete out.preferred;", "(4) the key goes with any_model"],
    [L, "`any ${f.make} model` : null, ", "null : null, ", "(1) the reasons list says any model"]
  ];
  let survivors = 0;
  for (const [file, from, to, want] of muts) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tany-"));
    spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", root + "/", dir + "/"]);
    fs.symlinkSync(path.join(root, "node_modules"), path.join(dir, "node_modules"));
    const fp = path.join(dir, file), src = fs.readFileSync(fp, "utf8"), m = src.replace(from, to);
    if (m === src) { console.log(`MUTANT NOT APPLIED  ${want}`); survivors++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
    fs.writeFileSync(fp, m);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/tasksAnyModelCheck.mjs"), dir], { encoding: "utf8" });
    const out = (r.stdout || "") + (r.stderr || ""), sec = (/^\((\d)\)/.exec(want) || [])[1], killed = r.status !== 0 && out.split("\n").some(l => l.startsWith("FAIL  (" + sec + ")"));
    console.log(`${killed ? "killed  " : "SURVIVED"}  ${want}`); if (!killed) { survivors++; console.log(out.split("\n").filter(l => /^FAIL|rror/.test(l)).slice(0, 3).join("\n")); }
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(survivors ? `\n${survivors} mutant(s) survived` : "\nall mutants killed"); process.exit(survivors ? 1 : 0);
}
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
let calls = 0, script = [];
const sse = events => new Response(new ReadableStream({ start(c) { for (const e of events) c.enqueue(new TextEncoder().encode(`event: x\ndata: ${JSON.stringify(e)}\n\n`)); c.close(); } }), { status: 200 });
const toolTurn = input => [{ type: "message_start", message: { usage: { input_tokens: 1 } } }, { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "t" + calls, name: "propose_task" } }, { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify(input) } }, { type: "content_block_stop", index: 0 }, { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 1 } }];
const textTurn = text => [{ type: "message_start", message: { usage: { input_tokens: 1 } } }, { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }, { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } }, { type: "content_block_stop", index: 0 }, { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 1 } }];
globalThis.fetch = async url => { if (String(url).includes("api.anthropic.com")) { calls++; return sse(script.shift() || textTurn("")); } return new Response("[]", { status: 200 }); };
let failed = 0, n = 0; const ok = (name, c, d) => { n++; if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${d ? "  " + d : ""}`); };
const T = await import(pathToFileURL(path.join(root, "lib/tasks/tasks.js")).href);
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
const user = { userId: "aaaaaaaa-0000-4000-8000-000000000009", email: "fixture@example.invalid" };
const mkEnv = () => ({ mem: T.memStore(), modelChoices: async (e, make) => ({ make, options: ["F430", "458 Italia", "355"].map(m => ({ label: m, value: m, n: 10, any: false })).concat([{ label: `Any ${make}`, value: "any", n: 30, any: true }]) }) });
const turn = (draft, text, input, crew, reply = "ok") => { script = input ? [toolTurn(input), textTurn(reply)] : [textTurn(reply)]; return T.draftTurn(mkEnv(), user, { draft, text, apiKey: "stub", model: "stub", crew }); };
const W1 = "Find me a red Ferrari within 100 miles of Chicago with fewer than 20,000 miles";
const J1 = { kind: "hunt", make: "Ferrari", colour: "red", miles_max: 20000, location: "Chicago", radius_miles: 100 };
const Q = "Which Ferrari model should Sam look for?";
// (1)
const c1 = await turn(null, W1, J1, true), n1 = await turn(null, W1, J1, false);
ok("(1) a crew request for a red Ferrari near Chicago starts with no question, as any model", c1.draft && !c1.draft.question && c1.draft.filters.any_model === "1", JSON.stringify([c1.draft && c1.draft.question, c1.draft && c1.draft.filters.any_model]));
ok("(1) and its read-back says any model", c1.draft && /Ferrari cars of any model/.test(c1.draft.summary || "") && /red/.test(c1.draft.summary) && /within 100 miles of Chicago/.test(c1.draft.summary), c1.draft && c1.draft.summary);
ok("(1) the same request from a non crew request is asked the question, with the Any option, as before", n1.draft && n1.draft.question === Q && n1.draft.any === "Any Ferrari" && n1.draft.qkind === "model" && !n1.draft.filters.any_model, JSON.stringify([n1.draft && n1.draft.question, n1.draft && n1.draft.any]));
ok("(1) the reasons list says any Ferrari model", T.matchReasonList({ make: "Ferrari", colour: "red", any_model: "1", any_model_read: "1" })[0] === "any Ferrari model" && !T.matchReasonList({ make: "Ferrari", colour: "red", any_model: "1" }).some(x => /any/.test(x)));
// (2)
{
  const bare = await turn(null, "a Ferrari", { kind: "hunt", make: "Ferrari" }, true);
  ok("(2) a bare make still asks, with the Any option, for crew too", bare.draft && bare.draft.question === Q && bare.draft.any === "Any Ferrari", JSON.stringify(bare.draft && bare.draft.question));
  const a = await turn(bare.draft, "any", null, true), b = await turn((await turn(null, "a Ferrari", { kind: "hunt", make: "Ferrari" }, false)).draft, "any", null, false);
  ok("(2) choosing Any, a crew request reads back 'of any model'", a.draft && !a.draft.question && a.draft.filters.any_model === "1" && /of any model/.test(a.draft.summary || ""), a.draft && a.draft.summary);
  ok("(2) choosing Any, a non crew request reads back exactly today's words (no 'any model')", b.draft && !b.draft.question && b.draft.filters.any_model === "1" && !/any model/.test(b.draft.summary || "") && /Ferraris/.test(b.draft.summary || ""), b.draft && b.draft.summary);
  const withModel = await turn(null, "a red F430 near Chicago", { ...J1, model: "F430" }, true);
  ok("(2) a request that names a model is untouched for crew", withModel.draft && !withModel.draft.question && !withModel.draft.filters.any_model && !/any model/.test(withModel.draft.summary || ""));
  const alone = await turn(null, "a Ferrari near Chicago", { kind: "hunt", make: "Ferrari", location: "Chicago", radius_miles: 150 }, true);
  ok("(2) a place alone is enough for crew to start as any model", alone.draft && !alone.draft.question && alone.draft.filters.any_model === "1");
}
// (3) the match
{
  const mk = (id, model, colour) => ({ id, source: "bringatrailer", url: `https://example.test/${id}`, listing_title: `2008 Ferrari ${model} ${colour}`, year: 2008, make: "Ferrari", model, mileage: 12000, mileage_unit: "miles", current_bid_usd: 90000, transmission: "Manual", exterior_color: colour, location: "Chicago, IL", country: "US", photo_url: "https://i.example.test/p.jpg", end_time: new Date(Date.now() + 5 * 864e5).toISOString(), status: "live", first_seen: new Date().toISOString(), bid_count: 3 });
  const rows = [mk(1, "F430", "Red"), mk(2, "458 Italia", "Red"), mk(3, "F430", "Black"), mk(4, "355", "Red")];
  const m = (await T.findMatchesDetail(env, { filters: { make: "Ferrari", colour: "red", miles_max: 20000, location: "Chicago, IL", radius_miles: 100, any_model: "1", any_model_read: "1" }, reported_ids: [] }, { rows }, null)).matches;
  ok("(3) an any-model hunt matches every red Ferrari model within the rest, and not the black one", m.map(x => x.r.id).sort().join() === "1,2,4", m.map(x => x.r.id).join());
}
// (4) crew only
{
  const mkc = () => ({ env: { mem: T.memStore() }, user: { userId: "cccccccc-0000-4000-8000-" + String(Math.floor(Math.random() * 1e12)).padStart(12, "0"), email: null } });
  const draft = { kind: "hunt", filters: { make: "Ferrari", colour: "red", any_model: "1", any_model_read: "1" }, words: W1, summary: "x" };
  const stored = async c => ((await T.userTasks(c.env, c.user.userId))[0] || {}).filters || {};
  const cc = mkc(); await T.startDraft(cc.env, cc.user, draft, { rows: [], testDrafts: [], crew: true });
  const nc = mkc(); await T.startDraft(nc.env, nc.user, draft, { rows: [], testDrafts: [] });
  ok("(4) a crew start stores the any-model read-back key; a non crew start with the same draft does not", (await stored(cc)).any_model_read === "1" && (await stored(nc)).any_model_read === undefined && (await stored(nc)).any_model === "1", JSON.stringify([(await stored(cc)).any_model_read, (await stored(nc)).any_model_read]));
  ok("(4) the key goes with any_model: a job that names a model keeps no any-model read-back", T.withPreferred({ make: "Ferrari", model: "F430", any_model_read: "1" }, { crew: true, typed: [] }).any_model_read === undefined);
  const carried = await turn(c1.draft, "what does that mean", null, false);
  ok("(4) a crew draft sent back by a non crew request loses the key (and reads back as it always did)", carried.draft && carried.draft.filters.any_model_read === undefined && !/any model/.test(carried.draft.summary || ""), carried.draft && carried.draft.summary);
}
// (5) nothing changes without the key, against the base tree
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tabase-"));
  const ar = spawnSync("git", ["archive", BASE], { cwd: root, maxBuffer: 1 << 28 }); let baseOk = ar.status === 0;
  if (baseOk) baseOk = spawnSync("tar", ["-x", "-C", dir], { input: ar.stdout }).status === 0;
  ok("(5) the base tree 4fd772dd is available to compare against", baseOk);
  if (baseOk) {
    fs.symlinkSync(path.join(root, "node_modules"), path.join(dir, "node_modules"));
    const B = await import(pathToFileURL(path.join(dir, "lib/tasks/tasks.js")).href);
    let diff = 0, count = 0;
    for (const make of ["Ferrari", "Porsche", "Ford"]) for (const colour of [null, "red"]) for (const any of [null, "1"]) for (const extra of [{}, { miles_max: 20000 }, { location: "Chicago", radius_miles: 100 }, { body: "coupe" }]) {
      const f = Object.fromEntries(Object.entries({ make, colour, any_model: any, ...extra }).filter(([, v]) => v != null)); count++;
      const a = [T.jobPhrase(f), T.matchReasons(f), T.summaryFor("hunt", f), JSON.stringify(T.validateJob("hunt", f))], b = [B.jobPhrase(f), B.matchReasons(f), B.summaryFor("hunt", f), JSON.stringify(B.validateJob("hunt", f))];
      if (JSON.stringify(a) !== JSON.stringify(b)) diff++;
    }
    ok(`(5) the read-back, reasons, summary and validated job of ${count} any-model and make-only jobs without the key equal the base tree`, diff === 0, `${diff} differ`);
  }
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(failed ? `\ntasksAnyModelCheck: ${failed} FAILED of ${n}` : `\ntasksAnyModelCheck: ${n} pass, 0 FAIL`);
process.exit(failed ? 1 : 0);
