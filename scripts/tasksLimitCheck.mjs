// TASKS LIMIT (Lane D, Oct 2026): three working Tasks per account, in ONE place (lib/tasks/limit.js), enforced server side through the
// real engine (startDraft / controlTask / firstRun) on the in-memory store. No network, nothing written. node scripts/tasksLimitCheck.mjs
// Named cases: accounts with 0, 1, 2 and 3 Tasks; a direct repeated create at the limit (refused); closing one at the limit and starting
// another; resume at the limit; the count facts the page and the badge read; two creates racing past the check; the start split
// (the Task exists and runs at once, the first match run is the next call, and a repeat does nothing); the sentences.
import fs from "node:fs";
globalThis.fetch = async () => new Response("[]", { status: 200 });
const { FREE_TASK_LIMIT, limitLine, limitEntryLine, limitFacts, freeTasksWords, tasksCount } = await import("../lib/tasks/limit.js");
const T = await import("../lib/tasks/tasks.js");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL  " + m); } };
const draftOf = (make, model) => ({ kind: "hunt", filters: { make, model }, words: `${make} ${model}`, summary: `Sam is looking for ${make} ${model}s.` });
const NAMES = [["Porsche", "911"], ["Ford", "Mustang"], ["Chevrolet", "Camaro"], ["BMW", "M3"], ["Toyota", "Supra"]];
const mk = () => ({ env: { mem: T.memStore() }, user: { userId: "bbbbbbbb-0000-4000-8000-" + String(Math.floor(Math.random() * 1e12)).padStart(12, "0"), email: null } });
const opts = { rows: [], testDrafts: [] };
async function start(c, i, extra = {}) { return T.startDraft(c.env, c.user, draftOf(...NAMES[i]), { ...opts, ...extra }); }
const working = async c => (await T.workingTasks(c.env, c.user.userId)).length;
const facts = async c => limitFacts((await T.userTasks(c.env, c.user.userId)).filter(t => ["running", "needs_you"].includes(t.state)).length);

ok(FREE_TASK_LIMIT === 3, "the limit is three");
ok(limitLine(3) === "You have 3 Tasks running. Stop one to start this one." && limitEntryLine(3) === "You have 3 Tasks running. Stop one to start another.", "the two sentences, word for word");
ok(freeTasksWords() === "three active Tasks" && tasksCount(1) === "1 Task", "the plain words come from the one number");
ok(!/[–—]/.test(limitLine() + limitEntryLine() + freeTasksWords()), "no dashes");
// one place: no other file holds the number as a limit
for (const f of ["../lib/tasks/tasks.js", "../api/tasks.js", "../api/tasksPage.js", "../api/_chrome.js", "../lib/appShell.js"]) {
  const s = fs.readFileSync(new URL(f, import.meta.url), "utf8");
  ok(!/(?:max|limit|MAX|LIMIT)\w*\s*(?:=|>=|>|===)\s*3\b/.test(s) && !/\bthree (?:active )?Tasks\b/i.test(s.replace(/\/\/.*$/gm, "")), `${f} does not hold the number itself`);
}
// accounts with 0, 1, 2 and 3 Tasks
{ const c = mk(); ok((await facts(c)).working === 0 && !(await facts(c)).atLimit && (await T.slotTask(c.env, c.user.userId)) === null, "0 Tasks: not at the limit"); }
const c3 = mk();
for (let n = 1; n <= 3; n++) {
  const r = await start(c3, n - 1);
  ok(r.task && r.task.state === "running" && !r.blocked, `Task ${n} starts`);
  const f = await facts(c3);
  ok(f.working === n && f.atLimit === (n === 3), `after ${n}: working ${f.working}, atLimit ${f.atLimit}`);
  ok(f.line === limitLine(n), `the facts carry the sentence for ${n}`);
}
// a direct repeated create at the limit (refused server side, twice, nothing written)
for (let k = 0; k < 2; k++) {
  const before = c3.env.mem.tasks.length, r = await start(c3, 3 + (k % 2));
  ok(r.blocked && r.blocked.max === 3 && r.blocked.tasks.length === 3 && r.blocked.line === limitLine(3) && !r.task, `repeat create ${k + 1} at the limit is refused with the three Tasks`);
  ok(c3.env.mem.tasks.length === before && (await working(c3)) === 3, `repeat create ${k + 1} wrote nothing`);
}
// the setup turn is refused at the limit too (before any model turn)
{ const r = await T.draftTurn(c3.env, c3.user, { draft: null, text: "find me a Miata", apiKey: "stub", model: "stub" }); ok(r.blocked && r.blocked.tasks.length === 3, "a new Task's setup turn is refused at the limit"); }
// pause frees a slot; resume at the limit is refused, and works under it
{ const t = (await T.userTasks(c3.env, c3.user.userId))[0];
  await T.controlTask(c3.env, c3.user, t.id, "pause"); ok((await working(c3)) === 2, "pausing frees a slot");
  const r4 = await start(c3, 3); ok(r4.task && (await working(c3)) === 3, "a new Task starts in the freed slot");
  const rr = await T.controlTask(c3.env, c3.user, t.id, "resume"); ok(rr.blocked && rr.blocked.tasks.length === 3 && (await T.getTask(c3.env, t.id)).state === "paused", "resume at the limit is refused and the Task stays paused");
  // closing one at the limit and starting another
  const open = await T.workingTasks(c3.env, c3.user.userId);
  await T.controlTask(c3.env, c3.user, open[0].id, "stop"); ok((await working(c3)) === 2 && (await T.getTask(c3.env, open[0].id)).state === "done", "closing one frees its slot at once");
  const r5 = await start(c3, 4); ok(r5.task && (await working(c3)) === 3, "closing one at the limit then starting another works");
  await T.controlTask(c3.env, c3.user, open[1].id, "stop"); const rr2 = await T.controlTask(c3.env, c3.user, t.id, "resume"); ok(rr2.task && rr2.task.state === "running", "resume works once a slot is free");
}
// accounts with 1 and 2 Tasks (existing accounts keep their Task and gain two slots)
{ const c = mk(); await start(c, 0); const f = await facts(c); ok(f.working === 1 && !f.atLimit, "1 Task: not at the limit"); const r = await start(c, 1); ok(r.task && !r.blocked, "an account with 1 Task can start a second (gains two slots)");
  const f2 = await facts(c); ok(f2.working === 2 && !f2.atLimit, "2 Tasks: not at the limit"); const r3 = await start(c, 2); ok(r3.task && (await facts(c)).atLimit, "and a third; then at the limit"); }
// two accounts never share a limit
{ const a = mk(), b = mk(); for (let i = 0; i < 3; i++) await start(a, i); const r = await start(b, 0); ok(r.task && !r.blocked, "another account is not at the limit"); }
// a race: two creates that both passed the check; the later one yields (beginTask recount)
{ const c = mk(); await start(c, 0); await start(c, 1);
  const mem = c.env.mem, orig = mem.activeOther; let n = 0;
  mem.activeOther = async (...a) => (++n === 3 ? [] : orig(...a));   // calls: s3 slot check (1), s3 recount (2), s4 slot check (3: the stale one that lets it through), s4 recount (4)
  const s3 = await start(c, 2), s4 = await start(c, 3);
  mem.activeOther = orig;
  ok(s3.task && !s3.blocked, "the racing create that came first holds the third slot");
  ok(s4.blocked && !s4.task && (await working(c)) === 3, "the racing create that passed a stale check is refused by the recount (never a fourth)");
}
// the start split: deferred start returns the running Task at once, no opening update yet; firstRun does it once
{ const c = mk(); const r = await start(c, 0, { defer: true });
  ok(r.task && r.task.state === "running" && r.task.starting === true, "a deferred start returns the running Task, marked starting");
  const before = (await T.taskUpdates(c.env, r.task.id)).length; ok(before === 1, "only the Started line exists before the first run");
  const f1 = await T.firstRun(c.env, c.user, r.task.id, opts); ok(f1.ran === true && (await T.taskUpdates(c.env, r.task.id)).some(u => u.kind === "match" && u.data && u.data.opening), "the first run writes the opening update");
  const n = (await T.taskUpdates(c.env, r.task.id)).length; const f2 = await T.firstRun(c.env, c.user, r.task.id, opts);
  ok(f2.ran === false && (await T.taskUpdates(c.env, r.task.id)).length === n, "a repeat first run does nothing");
  ok((await T.firstRun(c.env, { userId: "other" }, r.task.id, opts)).error === "not found", "another account cannot run it"); }
console.log(`tasksLimitCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
