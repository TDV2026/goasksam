// Sam's Buy 1f item 9 (Oct 21 2026, Lane D): "all", "any", "every", "everything", "doesn't matter", "no preference" choose
// the question's Any option; no question is asked twice in a row; an answer not understood is said plainly with the
// options. The shared reader (lib/live/answerWords.js) and its page copy (ANY_ANSWER_JS), and a Tasks setup conversation
// through the REAL draftTurn with the Anthropic stream stubbed (no network, nothing written: env.mem).
//   node scripts/answerWordsCheck.mjs
const { isAnyAnswer, matchOption, readAnswer, notUnderstoodLine, ANY_ANSWER_JS } = await import("../lib/live/answerWords.js");
const { draftTurn, memStore } = await import("../lib/tasks/tasks.js");
let fails = 0, passes = 0;
const ok = (c, what) => { if (c) passes++; else { fails++; console.log("FAIL  " + what); } };
const pageAny = (0, eval)(ANY_ANSWER_JS);
// 1. The reader.
const ANY = ["all", "All.", "any", "every", "everything", "doesn't matter", "Doesn’t matter", "no preference", "No preference.", "all of them", "any of them please", "either", "both", "whatever", "I don't mind", "show me all", "any is fine", "Any body style", "all models", "the lot", "just any", "anything", "everything is fine"];
const NOT = ["all red ones under 50k", "911", "coupe", "any red Porsche 911 under 70k", "only manuals", "I want a 911", "everything except convertibles", "not sure", "", "which is cheapest?", "all the 911s", "any manual"];
for (const t of ANY) { ok(isAnyAnswer(t), `any-answer: "${t}"`); ok(pageAny(t) === true, `page copy agrees: "${t}"`); }
for (const t of NOT) { ok(!isAnyAnswer(t), `not an any-answer: "${t}"`); ok(pageAny(t) === false, `page copy agrees (not any): "${t}"`); }
const OPTS = [{ label: "Coupe" }, { label: "Cabriolet" }, { label: "Targa" }];
ok(matchOption("coupe", OPTS) === OPTS[0] && matchOption("the coupes please", OPTS) === OPTS[0] && matchOption("Targa", OPTS) === OPTS[2], "an option named is that option");
ok(matchOption("coupe or targa", OPTS) === null && matchOption("sedan", OPTS) === null, "two options or none: not understood");
ok(readAnswer("all", OPTS).kind === "any" && readAnswer("cabriolet", OPTS).kind === "option" && readAnswer("banana", OPTS).kind === "unknown", "readAnswer kinds");
ok(notUnderstoodLine(["911", "Cayenne"], "Any Porsche") === "Sam didn't understand that answer. The choices are 911, Cayenne or Any Porsche.", "the not-understood line names the choices and the Any option");
ok(!/[–—]/.test(notUnderstoodLine(OPTS, "Any")), "no dashes");
// 2. A Tasks setup conversation (the reported one: red Porsches, "Which Porsche model?", "all").
let calls = 0, script = [];
const sse = events => new Response(new ReadableStream({ start(c) { for (const e of events) c.enqueue(new TextEncoder().encode(`event: x\ndata: ${JSON.stringify(e)}\n\n`)); c.close(); } }), { status: 200 });
const toolTurn = input => [{ type: "message_start", message: { usage: { input_tokens: 1 } } }, { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "t" + calls, name: "propose_task" } }, { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify(input) } }, { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 1 } }];
const textTurn = text => [{ type: "message_start", message: { usage: { input_tokens: 1 } } }, { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }, { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } }, { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 1 } }];
globalThis.fetch = async (url) => { if (String(url).includes("api.anthropic.com")) { calls++; return sse(script.shift() || textTurn("")); } return new Response("[]", { status: 200 }); };
const env = { mem: memStore() }, user = { userId: "aaaaaaaa-0000-4000-8000-000000000009", email: "fixture@example.invalid" };
const Q = "Which Porsche model should Sam look for?";
script = [toolTurn({ kind: "hunt", make: "Porsche", colour: "red" }), textTurn(Q)];
let r = await draftTurn(env, user, { draft: null, text: "find me red porsches", apiKey: "stub", model: "stub" });
ok(r.reply === Q && r.draft && r.draft.question === Q, `turn 1 asks which model (${JSON.stringify(r.reply)})`);
ok(r.draft && r.draft.qkind === "model" && r.draft.any === "Any Porsche", "the draft keeps the open question's kind and its Any option");
const d1 = r.draft;
for (const said of ["all", "any", "every", "everything", "doesn't matter", "no preference"]) {
  const before = calls; const a = await draftTurn(env, user, { draft: d1, text: said, apiKey: "stub", model: "stub" });
  ok(a.reply === "Sam will look for red Porsches. Shall Sam start?", `"${said}" chooses Any Porsche and reads the job back (${JSON.stringify(a.reply)})`);
  ok(a.draft && a.draft.question === null && a.draft.filters.any_model === "1" && !a.draft.filters.model, `"${said}": no question left, the job is any Porsche`);
  ok(calls === before, `"${said}": read in code, no model turn`);
}
// An answer not understood: the model proposes the same job again, so the same question would come back.
script = [toolTurn({ kind: "hunt", make: "Porsche", colour: "red" }), textTurn(Q)];
r = await draftTurn(env, user, { draft: d1, text: "banana", apiKey: "stub", model: "stub" });
ok(r.reply !== Q && r.reply === "Sam didn't understand that answer. The choices are Any Porsche.", `not understood: said plainly with the choices, the question not repeated (${JSON.stringify(r.reply)})`);
ok(r.draft && r.draft.question === Q && r.draft.qkind === "model", "the question stays open for the next answer");
// The answer after that: "all" still works.
const a2 = await draftTurn(env, user, { draft: r.draft, text: "All of them", apiKey: "stub", model: "stub" });
ok(a2.reply === "Sam will look for red Porsches. Shall Sam start?", "after a not-understood line, \"All of them\" chooses Any");
// A real model answer still goes to the conversation (the model sets the model): no Any, no repeat.
script = [toolTurn({ kind: "hunt", make: "Porsche", model: "911", colour: "red" }), textTurn("Sam will look for red Porsche 911s. Shall Sam start?")];
r = await draftTurn(env, user, { draft: d1, text: "911", apiKey: "stub", model: "stub" });
ok(r.draft && r.draft.question === null && r.draft.filters.model === "911" && !r.draft.filters.any_model, "\"911\" goes to the conversation and sets the model");
// The engine's body question: Any of them drops the question for this job.
const dBody = { words: "red 911", kind: "hunt", filters: { make: "Porsche", model: "911", colour: "red" }, question: "Which body style is it?", qkind: "body", options: ["Coupe", "Cabriolet", "Targa"], any: "Any of them", thread: [] };
const b = await draftTurn(env, user, { draft: dBody, text: "doesn't matter", apiKey: "stub", model: "stub" });
ok(b.draft && b.draft.question === null && b.draft.filters.any_body === "1" && /^Sam will look for red Porsche 911s/.test(b.reply), `the body question: "doesn't matter" chooses Any (${JSON.stringify(b.reply)})`);
// 3. The pages use the SAME reader: Market Check's copy is the shared source verbatim; Buy's script gets it written in.
{
  const fs = await import("node:fs");
  const ob = fs.readFileSync(new URL("../public/js/onebox.js", import.meta.url), "utf8");
  ok(ob.includes("var OB_ANY_ANSWER = " + ANY_ANSWER_JS + ";"), "Market Check's page copy is the shared reader, verbatim");
  ok(/var submitText = function \(v\) \{[^\n]*if \(obAnswerOpen\(v\)\) return; run\(v\);/.test(ob), "Market Check's box reads an answer before it searches");
  const html = fs.readFileSync(new URL("../public/onebox.html", import.meta.url), "utf8"), vj = fs.readFileSync(new URL("../vercel.json", import.meta.url), "utf8");
  const stamp = (/<script src="\/(obx\.\d{8}[a-z])\/onebox\.js"><\/script>/.exec(html) || [])[1];
  ok(stamp && vj.includes(`"/${stamp}/(.*)"`), `the onebox.js stamp ${stamp} is routed in vercel.json`);
  const buy = fs.readFileSync(new URL("../api/buy.js", import.meta.url), "utf8");
  ok(buy.includes('.replace("__ANY_ANSWER__", () => ANY_ANSWER_JS)') && buy.includes("var ANY_ANSWER = __ANY_ANSWER__;"), "Buy's script gets the shared reader written in");
  ok(buy.includes("if (conv.askOpen && lastDraw && !conv.scripted) { var qa = answerOpen(text); if (qa) { qa.click(); return; } }"), "Buy's composer reads an answer to the open question before the conversation");
}
console.log(`answerWordsCheck: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
