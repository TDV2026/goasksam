// PREFERRED VERSUS REQUIRED IN A TASK (Lane B, Nov 2026, CREW ONLY, NOT LIVE). Lane F's audit: "preferably black" became a hard requirement and the read-back said "black manual".
// CAUSE: the Task's job had one kind of criterion, a required one; the setup model's words "preferably / ideally / would like" had no field to land in, so the colour filter excluded every non-black car and
// the read-back printed the colour as a requirement. Affects every colour, gearbox, body and trim a buyer words as a wish (not the budget, miles or distance, which stay required) in a hunt's read-back
// (jobPhrase), its reasons (matchReasonList), the match itself (findMatchesDetail) and its cards (cardOfMatch). FIX: `preferred` on the job, set only from the buyer's words and only by a crew request.
//   (1) preferredFrom: only the criterion the marker is next to; nothing else; a budget, miles or place is never preferred
//   (2) the read-back: "black preferred", never "black manual"; the three requests Lane F ran
//   (3) the match: the required criteria admit; preferred ones flag and order first; nothing is excluded for a preferred criterion
//   (4) crew only: a non crew proposal, draft, start and edit never keeps the key; a crew one sets it from the words; a stored one is kept while its value holds
//   (5) NOTHING CHANGES WITHOUT IT: with no `preferred`, validateJob, jobPhrase, matchReasons, summaryFor and findMatchesDetail give exactly what the code before this change gave (base tree 4fd772dd, run side by side)
//   node scripts/tasksPreferredCheck.mjs [repo root]      --mutants proves each rule by breaking it in a copy
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { fileURLToPath, pathToFileURL } from "node:url"; import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), rootArg = args.find(a => !a.startsWith("--"));
const root = path.resolve(rootArg || path.join(here, ".."));
const BASE = "4fd772ddfa8e0e5667f76f8533cff8a69b2f77b9";
if (args.includes("--mutants")) {
  const L = "lib/tasks/tasks.js";
  const muts = [
    [L, 'if (re.test(text)) out.push(k);', 'out.push(k);', "(1) everything is preferred when any word is"],
    [L, 'const val = f[k]; if (!val) continue;', 'const val = f[k]; if (!val) continue; if (k === "gearbox" && !/\\b(manual|stick)/i.test(text)) continue;', "(1) a gearbox preferred"],
    [L, 'export const PREF_KEYS = ["colour", "gearbox", "body", "trim"];', 'export const PREF_KEYS = ["colour", "gearbox", "body", "trim", "budget_max", "miles_max"];', "(1) a budget, miles or place is never preferred"],
    [L, 'pk.includes("colour") ? null : f.colour, pk.includes("gearbox") ? null :', 'f.colour, pk.includes("gearbox") ? null :', "(2) the read-back says black preferred"],
    [L, 'const required = { ...task, filters: withoutKeys(task.filters, prefKeys) };', 'const required = task;', "(3) a preferred criterion is not a requirement"],
    [L, 'b.m.length - a.m.length || a.i - b.i', 'a.i - b.i', "(3) cars that meet the preferred criteria come first"],
    [L, "preferred: { met: m, of: prefKeys, all: m.length === prefKeys.length }", "preferred: { met: [], of: prefKeys, all: false }", "(3) a car that meets the preferred criteria is flagged"],
    [L, "if (!ctx.crew) return stripPreferred(p);", "if (!ctx.crew) return p;", "(4) a non crew proposal never keeps the key"],
    [L, "crew ? (d.filters || {}) : (stripPreferred(d.filters) || {})", "(d.filters || {})", "(4) a non crew draft never keeps the key"],
    [L, "(opts.crew ? (draft && draft.filters) : stripPreferred(draft && draft.filters))", "(draft && draft.filters)", "(4) a non crew start never keeps the key"],
    [L, "(opts.crew ? (pending && pending.filters) : stripPreferred(pending && pending.filters))", "(pending && pending.filters)", "(4) a non crew edit never keeps the key"],
    [L, "for (const k of preferredKeys(prior)) if (p[k] && p[k] === prior[k]) keys.add(k);", "", "(4) a stored preferred criterion is kept"],
    [L, "if (!prefKeys.length) return findMatchesCore(env, task, opts, since);", "", "(5) nothing changes without it"],
    [L, "const pk = preferredKeys(f), pw = (k, w) => (pk.includes(k) ? `${w} preferred` : w);", "const pk = preferredKeys(f), pw = (k, w) => `${w} preferred`;", "(5) nothing changes without it"]
  ];
  let survivors = 0;
  for (const [file, from, to, want] of muts) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tpref-"));
    spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", root + "/", dir + "/"]);
    fs.symlinkSync(path.join(root, "node_modules"), path.join(dir, "node_modules"));
    const fp = path.join(dir, file), src = fs.readFileSync(fp, "utf8"), m = src.replace(from, to);
    if (m === src) { console.log(`MUTANT NOT APPLIED  ${want}`); survivors++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
    fs.writeFileSync(fp, m);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/tasksPreferredCheck.mjs"), dir], { encoding: "utf8" });
    const out = (r.stdout || "") + (r.stderr || ""), sec = (/^\((\d)\)/.exec(want) || [])[1], killed = r.status !== 0 && out.split("\n").some(l => l.startsWith("FAIL  (" + sec + ")"));
    console.log(`${killed ? "killed  " : "SURVIVED"}  ${want}`); if (!killed) { survivors++; console.log(out.split("\n").filter(l => /^FAIL|rror/.test(l)).slice(0, 3).join("\n")); }
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(survivors ? `\n${survivors} mutant(s) survived` : "\nall mutants killed"); process.exit(survivors ? 1 : 0);
}
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
globalThis.fetch = async () => new Response("[]", { status: 200 });
let failed = 0, n = 0; const ok = (name, c, d) => { n++; if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${d ? "  " + d : ""}`); };
const imp = f => import(pathToFileURL(path.join(root, f)).href);
const T = await imp("lib/tasks/tasks.js");
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
// the three requests Lane F ran, as the setup model's jobs for them
const W1 = "Find me a red Ferrari within 100 miles of Chicago with fewer than 20,000 miles", F1 = { make: "Ferrari", colour: "red", miles_max: 20000, location: "Chicago", radius_miles: 100 };
const W2 = "Find me a manual Porsche 997 Carrera S under $70,000, preferably black, within 500 miles of Los Angeles", F2 = { make: "Porsche", model: "911", generation: "997", trim: "Carrera S", gearbox: "manual", colour: "black", budget_max: 70000, location: "Los Angeles", radius_miles: 500 };
const W3 = "Find me a black manual 997 with under 50,000 miles and a budget of $65k", F3 = { make: "Porsche", model: "911", generation: "997", gearbox: "manual", colour: "black", miles_max: 50000, budget_max: 65000 };
// (1) the words
{
  ok("(1) 'preferably black' makes the colour preferred and nothing else", JSON.stringify(T.preferredFrom(W2, F2)) === '["colour"]', JSON.stringify(T.preferredFrom(W2, F2)));
  ok("(1) the other two requests prefer nothing", T.preferredFrom(W1, F1).length === 0 && T.preferredFrom(W3, F3).length === 0);
  ok("(1) 'I would like it in black', 'black if possible' and 'ideally a manual' are read", T.preferredFrom("I would like it in black", { colour: "black" })[0] === "colour" && T.preferredFrom("a black one if possible", { colour: "black" })[0] === "colour" && T.preferredFrom("ideally a manual", { gearbox: "manual" })[0] === "gearbox");
  ok("(1) the marker belongs to the criterion next to it, not the whole sentence", JSON.stringify(T.preferredFrom("a black Porsche, preferably manual", { colour: "black", gearbox: "manual" })) === '["gearbox"]');
  ok("(1) a budget, miles or distance is never preferred", T.preferredFrom("ideally under $70,000 and preferably within 100 miles", { budget_max: 70000, location: "Chicago", colour: "red" }).length === 0);
  ok("(1) a criterion the job does not have cannot be preferred", T.preferredFrom("preferably black", { make: "Ferrari" }).length === 0);
  ok("(1) no marker, nothing preferred", T.preferredFrom("a black manual Porsche", { colour: "black", gearbox: "manual" }).length === 0);
  ok("(1) 'preferably a manual' is the gearbox, 'preferably automatic' the automatic one", T.preferredFrom("preferably a stick shift", { gearbox: "manual" })[0] === "gearbox" && T.preferredFrom("preferably automatic", { gearbox: "auto" })[0] === "gearbox");
}
// (2) the read-back
{
  const pref = { ...F2, preferred: "colour" };
  const ph = T.jobPhrase(pref);
  ok("(2) Lane F's request 2 reads back 'black preferred' with the manual still required", /, black preferred$/.test(ph) && /\bmanual\b/.test(ph) && !/black manual/.test(ph), ph);
  ok("(2) without the preference it still reads 'black manual' (a required colour is unchanged)", /^black manual Porsche 997/.test(T.jobPhrase(F2)), T.jobPhrase(F2));
  ok("(2) the reasons list says 'black preferred' for the preferred criterion only", T.matchReasonList(pref).includes("black preferred") && T.matchReasonList(pref).includes("manual") && !T.matchReasonList(F2).some(x => /preferred/.test(x)), T.matchReasons(pref));
  ok("(2) request 3 reads back black manual, as before", /^black manual Porsche 997s under \$65,000 with under 50,000 miles$/.test(T.jobPhrase(F3)), T.jobPhrase(F3));
  ok("(2) request 1 reads back red Ferraris within 100 miles of Chicago", /^red Ferraris with under 20,000 miles within 100 miles of Chicago$/.test(T.jobPhrase(F1)), T.jobPhrase(F1));
  ok("(2) a preferred gearbox reads 'manual preferred' and the colour stays", /black.*manual preferred$/.test(T.jobPhrase({ ...F2, preferred: "gearbox" })), T.jobPhrase({ ...F2, preferred: "gearbox" }));
  ok("(2) both preferred read both", /black preferred, manual preferred$/.test(T.jobPhrase({ ...F2, preferred: "colour,gearbox" })), T.jobPhrase({ ...F2, preferred: "colour,gearbox" }));
  ok("(2) the summary sentence carries it", /black preferred/.test(T.summaryFor("hunt", pref)));
}
// (3) the match
{
  const mk = (id, colour, o = {}) => ({ id, source: "bringatrailer", url: `https://example.test/${id}`, listing_title: `2008 Porsche 911 Carrera S 6-Speed ${colour}`, year: 2008, make: "Porsche", model: "911", mileage: 30000, mileage_unit: "miles", current_bid_usd: 50000, transmission: "Manual", exterior_color: colour, location: "Los Angeles, CA", country: "US", photo_url: "https://i.example.test/p.jpg", end_time: new Date(Date.now() + 5 * 864e5).toISOString(), status: "live", first_seen: new Date().toISOString(), bid_count: 3, ...o });
  const rows = [mk(1, "Red"), mk(2, "Black"), mk(3, "Blue"), mk(4, "Black", { transmission: "Automatic", listing_title: "2008 Porsche 911 Carrera S Tiptronic Black" })];
  const run = async f => (await T.findMatchesDetail(env, { filters: f, reported_ids: [] }, { rows }, null)).matches;
  const base = { make: "Porsche", model: "911", gearbox: "manual", budget_max: 70000 };
  const required = await run({ ...base, colour: "black" }), pref = await run({ ...base, colour: "black", preferred: "colour" });
  ok("(3) with the colour REQUIRED only the black manual car matches (today's behaviour)", required.length === 1 && required[0].r.id === 2, required.map(x => x.r.id).join());
  ok("(3) with the colour PREFERRED every manual car under budget matches, none excluded for its colour", pref.map(x => x.r.id).sort().join() === "1,2,3", pref.map(x => x.r.id).join());
  ok("(3) the black car is flagged and comes first; the others are not flagged", pref[0].r.id === 2 && pref[0].preferred.all === true && pref.slice(1).every(x => x.preferred.all === false), JSON.stringify(pref.map(x => [x.r.id, x.preferred.all])));
  ok("(3) a required criterion is still required: the automatic black car never matches", !pref.some(x => x.r.id === 4));
  ok("(3) the card carries the flag", T.cardOfMatch(pref[0]).preferred && T.cardOfMatch(pref[0]).preferred.all === true && !("preferred" in T.cardOfMatch(required[0])));
  const none = await run({ ...base, colour: "green", preferred: "colour" });
  ok("(3) a preferred colour no car has still matches the required ones (none flagged)", none.length >= 3 && none.every(x => x.preferred.all === false));
}
// (4) crew only
{
  const base = { make: "Porsche", model: "911", generation: "997", gearbox: "manual", colour: "black", budget_max: 70000 };
  const crew = T.withPreferred(base, { crew: true, typed: ["x", W2] }), plain = T.withPreferred(base, { crew: false, typed: ["x", W2] });
  ok("(4) a crew proposal gets the key from the words", crew.preferred === "colour", crew.preferred);
  ok("(4) a non crew proposal gets nothing, even from the same words", plain.preferred === undefined);
  ok("(4) a non crew proposal that carries the key (a hand made one) loses it", T.withPreferred({ ...base, preferred: "colour" }, { crew: false, typed: ["x"] }).preferred === undefined);
  ok("(4) a crew proposal whose words prefer nothing gets no key, whatever the model sent", T.withPreferred({ ...base, preferred: "colour" }, { crew: true, typed: ["a black manual 997"] }).preferred === undefined);
  const edited = T.withPreferred(base, { crew: true, typed: ["make it under $60,000"], task: { filters: { ...base, preferred: "colour" } } });
  ok("(4) a stored preferred criterion stays preferred through an edit that does not touch it", edited.preferred === "colour");
  const changed = T.withPreferred({ ...base, colour: "red" }, { crew: true, typed: ["make it red"], task: { filters: { ...base, preferred: "colour" } } });
  ok("(4) but not when its value is changed by the edit", changed.preferred === undefined);
  ok("(1) only a colour, gearbox, body or trim can be preferred; a budget, miles or place named preferred is ignored", JSON.stringify(T.PREF_KEYS) === '["colour","gearbox","body","trim"]' && T.preferredKeys({ budget_max: 70000, miles_max: 5, location: "X", preferred: "budget_max,miles_max,location" }).length === 0);
  const mkc = () => ({ env: { mem: T.memStore() }, user: { userId: "cccccccc-0000-4000-8000-" + String(Math.floor(Math.random() * 1e12)).padStart(12, "0"), email: null } });
  const draft = { kind: "hunt", filters: { make: "Porsche", model: "911", colour: "black", gearbox: "manual", preferred: "colour" }, words: W2, summary: "x" };
  const storedOf = async c => ((await T.userTasks(c.env, c.user.userId))[0] || {}).filters || {};
  const cc = mkc(); await T.startDraft(cc.env, cc.user, draft, { rows: [], testDrafts: [], crew: true });
  const nc = mkc(); await T.startDraft(nc.env, nc.user, draft, { rows: [], testDrafts: [] });
  ok("(4) a crew start stores the preferred criterion; a non crew start with the same draft stores the job without it", (await storedOf(cc)).preferred === "colour" && (await storedOf(nc)).preferred === undefined && (await storedOf(nc)).colour === "black", JSON.stringify([(await storedOf(cc)).preferred, (await storedOf(nc)).preferred]));
  const ec = mkc(); await T.startDraft(ec.env, ec.user, { ...draft, filters: { make: "Porsche", model: "911", colour: "black" } }, { rows: [], testDrafts: [], crew: true });
  const tid = (await T.userTasks(ec.env, ec.user.userId))[0].id;
  await T.applyEdit(ec.env, ec.user, tid, { kind: "hunt", filters: { make: "Porsche", model: "911", colour: "black", preferred: "colour" } }, { rows: [] });
  ok("(4) a non crew edit that carries the key does not store it", ((await storedOf(ec)).preferred) === undefined, JSON.stringify((await storedOf(ec)).preferred));
  await T.applyEdit(ec.env, ec.user, tid, { kind: "hunt", filters: { make: "Porsche", model: "911", colour: "black", preferred: "colour" } }, { rows: [], crew: true });
  ok("(4) a crew edit stores it", (await storedOf(ec)).preferred === "colour");
  const src = fs.readFileSync(path.join(root, "lib/tasks/tasks.js"), "utf8"), api = fs.readFileSync(path.join(root, "api/tasks.js"), "utf8");
  ok("(4) the API passes crew: isCrewRequest(req) on the draft, start, edit and apply doors", (api.match(/crew: isCrewRequest\(req\)/g) || []).length >= 5);
  ok("(4) the preferred key is read nowhere outside the Task job (Buy, Market Check, Sell and the landing do not know it)", ["lib/live/search.js", "lib/live/samChat.js", "lib/live/converse.js", "lib/onebox.js", "api/sellerDecision.js", "api/buySearch.js", "api/home.js"].filter(f => fs.existsSync(path.join(root, f))).every(f => !/\bpreferredKeys\b|\bpreferredFrom\b|\.preferred\b|\bPREF_KEYS\b/.test(fs.readFileSync(path.join(root, f), "utf8"))));
}
// (4b) the REAL draftTurn with the setup model stubbed (as tasksDraftCheck does): the same request from a crew and a non crew request
{
  let calls = 0, script = [];
  const sse = events => new Response(new ReadableStream({ start(c) { for (const e of events) c.enqueue(new TextEncoder().encode(`event: x\ndata: ${JSON.stringify(e)}\n\n`)); c.close(); } }), { status: 200 });
  const toolTurn = input => [{ type: "message_start", message: { usage: { input_tokens: 1 } } }, { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "t" + calls, name: "propose_task" } }, { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify(input) } }, { type: "content_block_stop", index: 0 }, { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 1 } }];
  const textTurn = text => [{ type: "message_start", message: { usage: { input_tokens: 1 } } }, { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }, { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } }, { type: "content_block_stop", index: 0 }, { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 1 } }];
  globalThis.fetch = async url => { if (String(url).includes("api.anthropic.com")) { calls++; return sse(script.shift() || textTurn("")); } return new Response("[]", { status: 200 }); };
  const user = { userId: "aaaaaaaa-0000-4000-8000-000000000009", email: "fixture@example.invalid" };
  const turn = async (words, input, crew) => { script = [toolTurn(input), textTurn("ok")]; return T.draftTurn({ mem: T.memStore() }, user, { draft: null, text: words, apiKey: "stub", model: "stub", crew }); };
  const j2 = { kind: "hunt", make: "Porsche", model: "911", generation: "997", trim: "Carrera S", gearbox: "manual", colour: "black", budget_max: 70000, location: "Los Angeles", radius_miles: 500 };
  const rc = await turn(W2, j2, true), rn = await turn(W2, j2, false);
  ok("(4) the real draft: a crew request with 'preferably black' stores colour as preferred and reads back 'black preferred'", rc.draft && rc.draft.filters.preferred === "colour" && /black preferred/.test(rc.draft.summary || "") && !/black manual/.test(rc.draft.summary || ""), JSON.stringify([rc.draft && rc.draft.filters.preferred, rc.draft && rc.draft.summary]));
  ok("(4) the real draft: the SAME request from a non crew request is today's: black required, read back 'black manual'", rn.draft && rn.draft.filters.preferred === undefined && /black manual/.test(rn.draft.summary || ""), JSON.stringify([rn.draft && rn.draft.filters.preferred, rn.draft && rn.draft.summary]));
  const hand = await turn("Find me a black manual 997", { ...j2, preferred: "colour" }, true);
  ok("(4) the real draft: a model that sends the key for words that prefer nothing is ignored", hand.draft && hand.draft.filters.preferred === undefined);
  script = [textTurn("ok")];
  const carried = await T.draftTurn({ mem: T.memStore() }, user, { draft: rc.draft, text: "what does that mean", apiKey: "stub", model: "stub", crew: false });
  ok("(4) the real draft: a draft that carries the key, sent back by a non crew request, loses it", carried.draft && carried.draft.filters.preferred === undefined, JSON.stringify(carried.draft && carried.draft.filters.preferred));
  globalThis.fetch = async () => new Response("[]", { status: 200 });
}
// (5) nothing changes without the key, against the base tree
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tpbase-"));
  const ar = spawnSync("git", ["archive", BASE], { cwd: root, maxBuffer: 1 << 28 }); let baseOk = ar.status === 0;
  if (baseOk) { const tx = spawnSync("tar", ["-x", "-C", dir], { input: ar.stdout }); baseOk = tx.status === 0; }
  ok("(5) the base tree 4fd772dd is available to compare against", baseOk);
  if (baseOk) {
    fs.symlinkSync(path.join(root, "node_modules"), path.join(dir, "node_modules"));
    fs.appendFileSync(path.join(dir, "lib/tasks/tasks.js"), "\nexport { findMatchesDetail as __fmd };\n");
    const B = await import(pathToFileURL(path.join(dir, "lib/tasks/tasks.js")).href);
    const corpus = [];
    for (const make of ["Porsche", "Ferrari", "Ford", ""]) for (const model of ["911", "F430", "Mustang", ""]) for (const colour of [null, "black", "red"]) for (const gearbox of [null, "manual", "auto"]) for (const extra of [{}, { budget_max: 70000 }, { miles_max: 50000, location: "Chicago", radius_miles: 100 }, { year_min: 1990, year_max: 1999, trim: "Carrera S", generation: "997" }, { any_model: "1" }]) corpus.push({ make, model, colour, gearbox, ...extra });
    corpus.length = Math.min(corpus.length, 400);
    const clean = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== ""));
    let diff = 0;
    for (const f0 of corpus) {
      const f = clean(f0);
      const a = [JSON.stringify(T.validateJob("hunt", f)), T.jobPhrase(f), T.matchReasons(f), T.summaryFor("hunt", f)], b = [JSON.stringify(B.validateJob("hunt", f)), B.jobPhrase(f), B.matchReasons(f), B.summaryFor("hunt", f)];
      if (JSON.stringify(a) !== JSON.stringify(b)) diff++;
    }
    ok(`(5) validateJob, jobPhrase, matchReasons and summaryFor give the same words on ${corpus.length} jobs without the key`, diff === 0, `${diff} differ`);
    const mk = (id, colour, tx, o = {}) => ({ id, source: "bringatrailer", url: `https://example.test/${id}`, listing_title: `2008 Porsche 911 Carrera S ${colour}`, year: 2008, make: "Porsche", model: "911", mileage: 20000 + id * 3000, mileage_unit: "miles", current_bid_usd: 40000 + id * 1000, transmission: tx, exterior_color: colour, location: "Los Angeles, CA", country: "US", photo_url: "https://i.example.test/p.jpg", end_time: new Date(Date.now() + 5 * 864e5).toISOString(), status: "live", first_seen: new Date().toISOString(), bid_count: 3, ...o });
    const rows = [mk(1, "Red", "Manual"), mk(2, "Black", "Manual"), mk(3, "Blue", "Automatic"), mk(4, "Black", "Automatic"), mk(5, "Silver", "Manual", { mileage: 90000 }), mk(6, "Black", "Manual", { year: 1995, listing_title: "1995 Porsche 911 Carrera Black" })];
    let mdiff = 0, ran = 0;
    for (const f of [{ make: "Porsche", model: "911" }, { make: "Porsche", model: "911", colour: "black" }, { make: "Porsche", model: "911", gearbox: "manual" }, { make: "Porsche", model: "911", colour: "black", gearbox: "manual", budget_max: 70000 }, { make: "Porsche", model: "911", miles_max: 50000 }, { make: "Porsche", model: "911", location: "Los Angeles, CA", radius_miles: 50 }, { make: "Porsche", model: "911", year_min: 2000, year_max: 2010 }, { make: "Ferrari", model: "F430" }]) {
      ran++;
      const x = (await T.findMatchesDetail(env, { filters: f, reported_ids: [] }, { rows }, null)).matches, y = (await B.__fmd(env, { filters: f, reported_ids: [] }, { rows }, null)).matches;
      if (JSON.stringify(x.map(m => [m.r.id, m.distance ?? null, Object.keys(m).sort()])) !== JSON.stringify(y.map(m => [m.r.id, m.distance ?? null, Object.keys(m).sort()]))) mdiff++;
    }
    ok(`(5) findMatchesDetail returns the same cars, the same order and the same fields on ${ran} stored-shape hunts without the key`, mdiff === 0, `${mdiff} differ`);
    const cardsSame = (() => { const m = { r: rows[1], facts: { colour: "black", gearbox: "manual" } }; return JSON.stringify(T.cardOfMatch(m)) === JSON.stringify(B.cardOfMatch(m)); })();
    ok("(5) a card without a preferred flag is byte for byte the card before", cardsSame);
  }
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(failed ? `\ntasksPreferredCheck: ${failed} FAILED of ${n}` : `\ntasksPreferredCheck: ${n} pass, 0 FAIL`);
process.exit(failed ? 1 : 0);
