// THE TASK EMAIL KILL SWITCH (Sam, Oct 24 2026), offline: lib/_email.js sendTaskEmail reads app_config "task_emails_enabled" at send time.
// A fake fetch plays Supabase and Resend. OFF stops the send before Resend is called; a missing row or "1" sends; a failed read FAILS OPEN;
// always:true (the internal Sam Desk notice) is never stopped; the answer is held about 5 seconds, not forever. No network.
//   node scripts/taskEmailSwitchCheck.mjs
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
process.env.SUPABASE_URL = "https://db.example"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.RESEND_API_KEY = "r";
const m = await import("../lib/_email.js");
let row = null, readStatus = 200, reads = 0, sent = 0; const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  if (String(url).includes("/rest/v1/app_config")) { reads++; return { ok: readStatus === 200, status: readStatus, json: async () => (row === null ? [] : [{ value: row }]) }; }
  if (String(url).includes("api.resend.com")) { sent++; return { ok: true, status: 200, json: async () => ({ id: "x" }) }; }
  throw new Error("unexpected fetch " + url);
};
const msg = { to: "feedback@goasksam.com", subject: "s", text: "t" };
const go = async (r, status = 200, extra = {}) => { row = r; readStatus = status; m.resetTaskEmailSwitchCache(); sent = 0; return { res: await m.sendTaskEmail({ ...msg, ...extra }), sent }; };
let o = await go(null); ok(o.res.ok && sent === 1, "no row: the email is sent (on is the default)");
o = await go("1"); ok(o.res.ok && sent === 1, "value \"1\": sent");
for (const v of ["0", 0, false, "off", "OFF", "false"]) { o = await go(v); ok(!o.res.ok && o.res.skipped && o.res.reason === "task_emails_off" && sent === 0, `value ${JSON.stringify(v)}: stopped before Resend is called`); }
o = await go("0", 200, { always: true }); ok(o.res.ok && sent === 1, "always:true (the internal Sam Desk notice) is never stopped");
const warn = console.error; console.error = () => {}; o = await go("0", 500); console.error = warn; ok(o.res.ok && sent === 1, "an unreadable switch fails open (and says so), it never drops real emails");
// Held for a few seconds: ten sends read the row once.
row = "1"; readStatus = 200; m.resetTaskEmailSwitchCache(); reads = 0; for (let i = 0; i < 10; i++) await m.sendTaskEmail(msg); ok(reads === 1, "ten sends in a row read the switch once, not ten times (read " + reads + ")");
// A flip is seen on the next read after the hold (the cache reset stands in for the 5 seconds).
row = "0"; m.resetTaskEmailSwitchCache(); o = { res: await m.sendTaskEmail(msg) }; ok(!o.res.ok && o.res.reason === "task_emails_off", "a flip to off is seen on the next read");
// Every Task email path reaches Resend through sendTaskEmail (the one choke point); sign-in codes are not among them.
import fs from "node:fs";
const direct = ["lib/tasks", "lib/live", "api"].flatMap(d => fs.readdirSync(d, { recursive: true }).filter(f => /\.js$/.test(f)).map(f => d + "/" + f)).filter(f => /api\.resend\.com\/emails["'`]/.test(fs.readFileSync(f, "utf8")));
// TEMPORARY exemption (Oct 24 2026): api/emailExperiment.js sends four sign-in TEST emails to one fixed address and is not a Task email; it is deleted with its exemption.
const EXEMPT = ["api/emailExperiment.js"];
const bad = direct.filter(f => !EXEMPT.includes(f));
ok(bad.length === 0, "no Task email file calls Resend directly: " + bad.join(", "));
globalThis.fetch = realFetch;
console.log(`taskEmailSwitchCheck: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
