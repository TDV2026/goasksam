// TASKS LEFTOVER WORDS (Sam's order, Oct 23 2026; Lane C): the engine's unusedLine reaches the Task setup reply through CODE (the tool
// result's `say`, which codeReply joins word for word), never through the model; it appears only when the engine sent one, in the
// same sentence; the question cap is untouched. Static read of the shipped source. No network.   node scripts/tasksLeftoverCheck.mjs
import fs from "node:fs";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const s = fs.readFileSync(new URL("../lib/tasks/tasks.js", import.meta.url), "utf8");
ok(/if \(ctx && r && r\.unusedLine\) ctx\.unusedLine = String\(r\.unusedLine\);/.test(s), "the engine's line is kept from the resolver read, as sent");
ok(/typedFilters\(env, ctx\.typed, v0\.filters, ctx\)/.test(s), "propose_task hands its context to the typed read");
ok(/say: ctx\.unusedLine \? \[ctx\.unusedLine, question\] : \[question\]/.test(s) && /say: ctx\.unusedLine \? \[ctx\.unusedLine, asks\.prompt\] : \[asks\.prompt\]/.test(s), "a question reply carries the line first and still ends in the one question");
ok(/\[sum\]\.concat\(ctx\.unusedLine \? \[ctx\.unusedLine\] : \[\], \["Start\?"\]\)/.test(s), "the read-back carries the line between the summary and 'Shall Sam start?'; unchanged when none");
ok(/codeReply: trace =>[^\n]*t\.result\.say\.join\(" "\)/.test(s), "the reply is the tool result's say, joined by code");
ok(!/["`]Sam didn't use/.test(s), "the sentence is never worded here");
console.log(`tasksLeftoverCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
