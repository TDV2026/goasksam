// SETUP QUESTIONS AND DRAFTS, SERVER SIDE (Lane D, Oct 24 2026): "red porsche", "porsche", "a manual 911" never stall; a typed
// answer in any form or with a small typo counts; at most two questions per draft (the third reads as Any); a draft older than a
// day, or with no stamp, is dropped by the server. The REAL draftTurn and startDraft with the Anthropic stream stubbed.
//   node scripts/tasksDraftCheck.mjs
const { readAnswer, matchOption } = await import("../lib/live/answerWords.js");
const { draftTurn, startDraft, draftFresh, memStore } = await import("../lib/tasks/tasks.js");
let fails = 0, passes = 0;
const ok = (c, what) => { if (c) passes++; else { fails++; console.log("FAIL  " + what); } };
// 2. A Tasks setup conversation (the reported one: red Porsches, "Which Porsche model?", "all").
let calls = 0, script = [];
const sse = events => new Response(new ReadableStream({ start(c) { for (const e of events) c.enqueue(new TextEncoder().encode(`event: x\ndata: ${JSON.stringify(e)}\n\n`)); c.close(); } }), { status: 200 });
const toolTurn = input => [{ type: "message_start", message: { usage: { input_tokens: 1 } } }, { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "t" + calls, name: "propose_task" } }, { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify(input) } }, { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 1 } }];
const textTurn = text => [{ type: "message_start", message: { usage: { input_tokens: 1 } } }, { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }, { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } }, { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 1 } }];
globalThis.fetch = async (url) => { if (String(url).includes("api.anthropic.com")) { calls++; return sse(script.shift() || textTurn("")); } return new Response("[]", { status: 200 }); };
const env = { mem: memStore() }, user = { userId: "aaaaaaaa-0000-4000-8000-000000000009", email: "fixture@example.invalid" };
const Q = "Which Porsche model should Sam look for?";
const turn = (draft, text) => draftTurn(env, user, { draft, text, apiKey: "stub", model: "stub" });
// "red porsche" and "porsche": one question, with choices and the Any option, stamped, counted.
for (const w of ["red porsche", "porsche"]) {
  script = [toolTurn({ kind: "hunt", make: "Porsche", ...(w.startsWith("red") ? { colour: "red" } : {}) }), textTurn(Q)];
  const r = await turn(null, w);
  ok(r.draft && r.draft.question === Q && r.draft.qkind === "model" && r.draft.any === "Any Porsche" && r.draft.asks === 1 && !!r.draft.at, `"${w}": one model question with the Any option, counted and stamped`);
}
// "a manual 911": no question at all, read back.
script = [toolTurn({ kind: "hunt", make: "Porsche", model: "911", gearbox: "manual" }), textTurn("Sam will look for manual Porsche 911s. Start?")];
let r = await turn(null, "a manual 911");
ok(r.draft && !r.draft.question && !!r.draft.summary && (r.draft.asks || 0) === 0, `"a manual 911": read back, no question`);
// Typed answers in any form, and a small typo.
script = [toolTurn({ kind: "hunt", make: "Porsche", colour: "red" }), textTurn(Q)];
const open = (await turn(null, "red porsche")).draft; open.options = ["Panamera", "Cayenne"];
for (const said of ["any", "Any", "ANY PORSCHE", "any porsche", "doesn't matter", "no preference", "either"]) {
  const a = await turn(open, said); ok(a.draft && !a.draft.question && a.draft.filters.any_model === "1", `"${said}" chooses Any Porsche`);
}
for (const [said, want] of [["panamera", "Panamera"], ["PANAMERA", "Panamera"], ["Panamara", "Panamera"], ["cayen", null], ["cayene", "Cayenne"], ["the panamera please", "Panamera"]]) {
  const m = matchOption(said, ["Panamera", "Cayenne"]); ok((m && m) === want || (want === null && m === null), `"${said}" reads as ${want}`);
}
ok(readAnswer("banana", ["Panamera"], "Any Porsche").kind === "unknown", "an answer that is neither is not understood");
// Not understood: said once, the question stays open with its choices, flagged for the page.
script = [toolTurn({ kind: "hunt", make: "Porsche", colour: "red" }), textTurn(Q)];
r = await turn(open, "banana");
ok(r.miss === true && /^Sam didn't understand that answer\. The choices are Panamera, Cayenne or Any Porsche\.$/.test(r.reply) && r.draft.question === Q && r.draft.asks === 1, "not understood: said once, flagged, the question and its choices stay, not counted again");
// The cap: a third question is never asked.
const capped = { ...open, asks: 2 };
script = [toolTurn({ kind: "hunt", make: "Porsche", colour: "red" }), textTurn("Sam will look for red Porsches. Start?")];
r = await turn({ ...capped, question: null, qkind: null }, "red porsche again");
ok(r.draft && !r.draft.question && r.draft.filters.any_model === "1" && r.draft.asks === 2, "after two questions, a make with no model reads as Any, not a third question");
// A draft older than a day, or never stamped, is dropped by the server.
const old = { ...open, at: new Date(Date.now() - 25 * 3600e3).toISOString() };
ok(draftFresh(open) === open && !draftFresh(old) && !draftFresh({ ...open, at: undefined }) && !draftFresh(null), "draftFresh: under a day kept, over a day or unstamped dropped");
script = [toolTurn({ kind: "hunt", make: "Porsche", colour: "red" }), textTurn(Q)];
r = await turn(old, "any");
ok(r.draft_dropped === true && r.draft.question === Q && !r.draft.filters.any_model, "a stale draft is not used: the answer starts over and the server says it dropped the old one");
r = await startDraft(env, user, { ...readBackOf(), at: old.at }, {});
ok(r.draft_dropped === true && !r.task, "Start on a stale draft starts nothing");
function readBackOf() { return { words: "red porsches", kind: "hunt", filters: { make: "Porsche", colour: "red", any_model: "1" }, question: null, summary: "Sam is looking for red Porsches." }; }
console.log(`tasksDraftCheck: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
