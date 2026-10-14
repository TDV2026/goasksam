// Task emails: where they go and what they may say (Oct 2026, Lane C, Sam's decisions). No network, nothing sent.
//   1. Delivery: one function decides the targets (lib/tasks/delivery.js); the sign-in address only, never a typed
//      or stored one; a probe's test send only to feedback@goasksam.com; no address setting on the Tasks page.
//   2. Words: the screen (lib/tasks/emailWords.js) catches each banned word; a model-written research summary with a
//      hit is not emailed (the plain line goes instead); every code-written email template rendered here is clean,
//      in its words and in its link addresses (no /api/watch in a link a person reads).
//   node scripts/emailWordsCheck.mjs      Run by scripts/prePush.mjs.
process.env.TASK_LINK_SECRET = "fixture-only"; delete process.env.RESEND_API_KEY;
import fs from "node:fs";
const { bannedIn, bannedInLinks, emailText, RESEARCH_PLAIN } = await import("../lib/tasks/emailWords.js");
const { getDeliveryTargets, emailOf, testInbox } = await import("../lib/tasks/delivery.js");
const T = await import("../lib/tasks/tasks.js");
const { bidEmails } = await import("../lib/tasks/bidFixture.js");
const { rungEmails, RUNG_FIXTURES } = await import("../lib/tasks/rungFixture.js");
const { soldTaskTap } = await import("../lib/live/watches.js");

let fails = 0, passes = 0;
const ok = (c, what) => { if (c) passes++; else { fails++; console.log("FAIL  " + what); } };
const U = "aaaaaaaa-0000-4000-8000-000000000001";

// ---- 1. Delivery
{
  const mem = T.memStore(); mem.authEmails = { [U]: "feedback+owner@goasksam.com" };
  const env = { mem };
  const t = await getDeliveryTargets(env, U);
  ok(t.length === 1 && t[0].channel === "email" && t[0].to === "feedback+owner@goasksam.com", "targets: the sign-in address, one email channel");
  ok((await getDeliveryTargets(env, "bbbbbbbb-0000-4000-8000-000000000002")).length === 0 && emailOf([]) === null, "no confirmed address: no target");
  ok(testInbox("feedback@goasksam.com") && testInbox("Feedback+x@goasksam.com") && !testInbox("someone@example.com") && !testInbox("feedback@goasksam.com.evil.io"), "test sends: our own inbox only");
  // The address is not a setting: a typed one is ignored, and what the page shows is the sign-in address.
  const task = await mem.newTask({ user_id: U, email: "typed@example.com", state: "running", kind: "hunt", summary: "Sam is looking for Porsche 911s.", filters: { make: "Porsche", model: "911" } });
  const p = await T.setNotifyPrefs(env, { userId: U, email: null }, { email: "typed@example.com", on: true });
  ok(p.email === "feedback+owner@goasksam.com" && mem.tasks.every(x => x.email === "typed@example.com"), "setNotifyPrefs ignores a typed address and writes none");
  ok(!/email\s*[,}]/.test(String(T.setNotifyPrefs).split(")")[0]), "setNotifyPrefs takes no address");
  // Every sender reads the targets, never a stored address.
  const src = f => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");
  for (const f of ["lib/tasks/tasks.js", "lib/tasks/digest.js", "lib/live/watches.js", "lib/live/buyAlerts.js"]) {
    const s = src(f);
    ok(!/to:\s*(?:opts\.to\s*\|\|\s*)?(?:task|alert|w|a|p)\.email\b/.test(s) && !/prefs\.email\s*\|\|/.test(s) && !/acct\.task_email\b/.test(s), `${f}: no send to a stored address`);
  }
  ok(/targets:\s*userId => getDeliveryTargets\(env, userId\)/.test(src("lib/tasks/digest.js")), "the combined email and Before it ends read the one delivery function");
  const page = src("api/tasksPage.js");
  ok(!/data-edit-email|data-save-email|tkemail/.test(page) && /the address you sign in with/.test(page), "Tasks page: no address control, says where updates go");
  ok(/action === "notify"[^\n]*setNotifyPrefs\(env, user, \{ on:[^\n]*every:[^\n]*\}\)\);/.test(src("api/tasks.js")) && !/action === "notify"[^\n]*b\.email/.test(src("api/tasks.js")), "the notify action passes no address");
  // A start email built in test mode reaches only the test inbox.
  const r = await T.sendStartEmail(env, task, null, { to: "someone@example.com", test: true });
  ok(r === undefined, "start email to a non-test address: nothing built or sent");
}

// ---- 2. Words
for (const w of ["worth", "value", "valuation", "estimate", "appraisal", "median", "percentile", "alert", "watch", "pricing", "Values", "estimated", "watching"]) ok(bannedIn(`This one is about the ${w} here.`).length === 1, `screen catches "${w}"`);
ok(bannedIn("The middle half of 993 Carrera sales landed at $64,000 to $107,000 in the past year.").length === 0, "a clean line passes");
ok(bannedIn("Open it: https://goasksam.com/api/watch?a=stop").length === 0 && bannedInLinks("Open it: https://goasksam.com/api/watch?a=stop")[0] === "watch", "links are read apart from the words");
{
  const held = emailText("Its value has risen since 2019.", { generated: true, plain: RESEARCH_PLAIN });
  ok(held.text === RESEARCH_PLAIN && held.held.join() === "value", "a generated hit: plain line, the word logged");
  ok(emailText("Sam found three past sales of this car.", { generated: true, plain: RESEARCH_PLAIN }).held === null, "a clean generated line goes as written");
  // notify(): the research email with a hit carries the plain line; the Task page keeps the update as written.
  const mem = T.memStore(); mem.authEmails = { [U]: "feedback+owner@goasksam.com" };
  const env = { mem };
  const task = await mem.newTask({ user_id: U, state: "done", kind: "research", summary: "Sam is researching a 1995 Porsche 911 Carrera." });
  const up = await mem.addUpdate({ task_id: task.id, role: "sam", kind: "research", text: "The estimate for this car is high." });
  const out = await T.notify(env, task, up, "Sam finished your research", { test: true });
  ok(out.held && out.held.join() === "estimate" && out.text.startsWith(RESEARCH_PLAIN) && !/estimate/i.test(out.text), "research email with a hit: the plain line goes");
  ok(mem.ups.find(u => u.id === up.id).text === "The estimate for this car is high.", "the Task page keeps the update");
}
// Every code-written email template, rendered: subjects, text and html, words and link addresses.
{
  const now = new Date("2026-10-14T17:30:00Z"), mails = [];
  for (const c of ["fresh", "61min", "5h", "untimed"]) { const { daily, before } = bidEmails(c, now); mails.push(["bid " + c + " daily", daily], ["bid " + c + " before", before]); }
  for (const name of Object.keys(RUNG_FIXTURES)) { const m = rungEmails(name, now); for (const [k, v] of Object.entries(m)) if (v && typeof v === "object" && "subject" in v) mails.push([`rung ${name} ${k}`, v]); }
  const mem = T.memStore(); mem.authEmails = { [U]: "feedback+owner@goasksam.com" };
  const env = { mem };
  const task = await mem.newTask({ user_id: U, state: "running", kind: "hunt", summary: "Sam is looking for Porsche 911 Carreras from 1995.", filters: { make: "Porsche", model: "911" } });
  const start = await T.sendStartEmail(env, task, null, { to: "feedback@goasksam.com", test: true });
  mails.push(["start", { subject: start.subject, text: start.text, html: "" }]);
  const still = await mem.addUpdate({ task_id: task.id, role: "sam", kind: "still_looking", text: `Still looking? Sam has been looking for ${T.jobPhrase(task.filters)} for a while. One tap keeps the Task running.` });
  const sl = await T.notify(env, task, still, "Still looking?", { keepLooking: true, test: true });
  mails.push(["still looking", { subject: "Still looking?", text: sl.text, html: "" }]);
  ok(mails.length >= 12, `templates rendered (${mails.length})`);
  const strip = h => String(h || "").replace(/<[^>]+>/g, " ");
  for (const [name, m] of mails) {
    const words = bannedIn([m.subject, m.text, strip(m.html)].join("\n"));
    ok(!words.length, `${name}: no banned word (got ${words.join(", ")})`);
    const inLinks = bannedInLinks([m.text, String(m.html || "").replace(/href="/g, " ")].join("\n"));
    ok(!inLinks.length, `${name}: no banned word in a link (got ${inLinks.join(", ")})`);
  }
}
// The sold-car links: the neutral path, and the old one still reaches the same page.
ok(/^https:\/\/goasksam\.com\/api\/task-link\?a=pause&t=/.test(soldTaskTap("5e7a1c33-3333-4d4e-9f50-0a1b2c3d4e5f", "pause")), "sold-car links use /api/task-link");
{
  const vj = JSON.parse(fs.readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  ok((vj.rewrites || []).some(r => r.source === "/api/task-link" && r.destination === "/api/watch" && !r.has), "vercel.json: /api/task-link serves api/watch.js (old /api/watch links keep working)");
}

console.log(`emailWordsCheck: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
