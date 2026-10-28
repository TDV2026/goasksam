// TASK EMAIL FORM (Lane D, Oct 28 2026). The REAL runDigest over the fixtures in scripts/emailFixtures.mjs (golden rows 73 to 75, a Task whose car has options, every emailMode), no network.
// Fails on: (1) a count of cars or updates in a form the shared count helper (lib/countNoun.js) would not write: "3 cars" next to "three updates", or "eleven cars";
// (2) the sale counts of one email in two forms; (3) the first email after a Task is created not headed Live right now, a later email headed so, the heading repeated over each
// Task, or a car listed twice in one email; (4) more than one footer line, or the stop link and the cadence in separate lines; (5) a question in any email, or a mode that prints what
// its emailMode does not allow. A second part feeds the detector the old wording and proves it fails. node scripts/emailFormCheck.mjs
import fs from "node:fs";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const { buildEmails, runMail, addCars, CARS } = await import("./emailFixtures.mjs");
const { countNoun } = await import("../lib/countNoun.js");
const { moreCarsLine, FIRST_EMAIL_CARS, LATER_EMAIL_CARS, CATCH_UP_HEADING, NEW_HEADING } = await import("../lib/tasks/emailCaps.js");

const W = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const BIG = ["eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
const num = t => { const i = W.concat(BIG).indexOf(t.toLowerCase()); return i >= 0 ? i : Number(String(t).replace(/,/g, "")); };
const plain = html => String(html).replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
const NUM = "(\\d[\\d,]*|" + W.concat(BIG).join("|") + ")";
// every "N car(s)" and "N update(s)" (with more / new / live between) in a text: the form the helper writes for that number is the only allowed one
export function carCountProblems(text) {
  const bad = [], re = new RegExp(`\\b${NUM}\\s+((?:more|new|live)\\s+)*(cars?|updates?)\\b`, "gi");
  for (const m of String(text).matchAll(re)) {
    const n = num(m[1]), want = countNoun(n, "x", { words: true }).split(" ")[0];
    if (m[1].toLowerCase() !== want.toLowerCase()) bad.push(`${m[0]} (the helper writes ${want})`);
  }
  return bad;
}
// the sale counts in one email: all digits or all words, never both
export function saleFormProblems(text) {
  const forms = new Set(); for (const m of String(text).matchAll(new RegExp(`\\b${NUM}\\s+sales?\\b`, "gi"))) forms.add(/^\d/.test(m[1]) ? "digits" : "words");
  return forms.size > 1 ? ["sale counts in both digits and words"] : [];
}
export function footerProblems(m) {
  const bad = [], t = m.text, h = m.html;
  const often = (t.match(/Sam sends (?:one|up to \w+) emails? a day|Sam emails you as soon/g) || []).length;
  if (often !== 1) bad.push(`the cadence sentence appears ${often} times`);
  const stopAll = (t.match(/Stop all Task emails/g) || []).length;
  if (stopAll !== 1) bad.push(`"Stop all Task emails" appears ${stopAll} times`);
  const line = t.split("\n").find(l => /Stop all Task emails/.test(l)) || "";
  if (!/Sam sends|Sam emails you/.test(line)) bad.push("the stop link is not in the cadence line");
  const ps = (h.match(/<p[^>]*>[\s\S]*?<\/p>/g) || []).filter(p => /Stop all Task emails/.test(p));
  if (ps.length !== 1 || !/Sam sends|Sam emails you/.test(ps[0]) || !/Open your Tasks/.test(ps[0])) bad.push("the html footer is not one paragraph with the cadence, the Tasks link and the stop link");
  if ((t.match(/Before it ends emails/g) || []).length > 1) bad.push("the Before it ends sentence is repeated");
  return bad;
}
const QUESTION = /\?/;
const textOf = m => m.subject + "\n" + m.text + "\n" + plain(m.html);
const noUrls = s => s.replace(/https?:\/\/\S+/g, " ");
const headings = (m, h) => (m.text.match(new RegExp(h, "g")) || []).length;
const lists = m => { const ids = [...m.text.matchAll(/https:\/\/example\.com\/listing\/(\d+)/g)].map(x => x[1]); return ids; };

const E = await buildEmails();
// ---- 1. the set: every email on the form
for (const [k, m] of Object.entries(E)) {
  ok(!!m, `${k}: the email was built`); if (!m) continue;
  const all = noUrls(textOf(m));
  ok(carCountProblems(all).length === 0, `${k}: counts of cars and updates follow the helper (${carCountProblems(all)})`);
  ok(saleFormProblems(all).length === 0, `${k}: one form for the sale counts`);
  ok(footerProblems(m).length === 0, `${k}: one footer line (${footerProblems(m)})`);
  ok(!QUESTION.test(noUrls(m.subject + m.text)), `${k}: no question in the email`);
  const ids = lists(m); ok(new Set(ids).size === ids.length, `${k}: no car is listed twice (${ids})`);
  ok(!/—|–/.test(m.subject + m.text + plain(m.html)), `${k}: no em or en dash`);
}
// ---- 2. the first email is the catch-up, later ones are not, and the heading is written once
ok(headings(E.first, CATCH_UP_HEADING) === 1 && headings(E.first, NEW_HEADING) === 0, `the first email after three Tasks were created is headed ${CATCH_UP_HEADING} once (${headings(E.first, CATCH_UP_HEADING)})`);
ok(headings(E.options, CATCH_UP_HEADING) === 1, "a new Task's first email is headed Live right now");
ok(headings(E.later, CATCH_UP_HEADING) === 0 && headings(E.later, NEW_HEADING) === 1, "a later email is headed as new since the last email, once, and never Live right now");
ok(headings(E.modes, CATCH_UP_HEADING) === 0, "a later email with other Tasks is not a catch-up");
{ const mix = await runMail({ updates: [{ taskKey: "A", cars: ["p911"] }, { taskKey: "D", cars: ["m3conv"] }], emailedTasks: ["D"] });
  ok(headings(mix, CATCH_UP_HEADING) === 1 && headings(mix, NEW_HEADING) === 1, "a Task with an earlier email and one without: each heading once over its own sections"); }
// ---- 3. one count, one word form, the same number everywhere
{ const keys = addCars(8);
  const first = await runMail({ updates: [{ taskKey: "E", cars: keys }] });
  const shown = lists(first).length, more = (first.text.match(/(\w[\w,]*) more cars match/) || [])[1];
  ok(shown === FIRST_EMAIL_CARS, `the first email shows ${FIRST_EMAIL_CARS} cars (got ${shown})`);
  ok(/^Sam found eight cars for your Task, live now$/.test(first.subject) && more === "Three", `eight cars: the subject says eight and the more line says three (${first.subject} / ${more})`);
  ok(carCountProblems(first.subject + " " + first.text).length === 0, "the subject and the more line are in the helper's form");
  const later = await runMail({ updates: [{ taskKey: "E", cars: keys }], emailedTasks: ["E"] });
  ok(lists(later).length === LATER_EMAIL_CARS && /Two more new cars\. Open the Task to see them\./.test(later.text) && /^Sam found eight cars/.test(later.subject), "a later email: six cars, 'Two more new cars', subject eight");
  const big = addCars(14, "y"), e14 = await runMail({ updates: [{ taskKey: "E", cars: big }], emailedTasks: ["E"] });
  ok(/^Sam found 14 cars/.test(e14.subject) && /Eight more new cars/.test(e14.text) && carCountProblems(e14.subject + e14.text).length === 0, `fourteen cars read 14 in the subject (${e14.subject}), eight more in the line`);
  // the same car queued in two updates of one Task is listed once
  const twice = await runMail({ updates: [{ taskKey: "A", cars: ["p911"] }, { taskKey: "A", cars: ["p911", "vette"] }] });
  const ids = lists(twice); ok(new Set(ids).size === ids.length && ids.length === 2, `a car queued twice is listed once (${ids})`); }
// ---- 4. every mode prints what its emailMode allows, never a question
{ const t = E.first.text, o = E.options.text, md = E.modes.text;
  ok(/Carrera \$118,000 to \$139,000, 9 sales/.test(t) && /Carrera S \$141,000 to \$154,000, 11 sales/.test(t) && !/\$118,000 to \$154,000/.test(t), "options (911): each option's own range, no pooled range");
  ok(/\$150,000 to \$235,000/.test(t) && /L76 \$160,000 to \$230,000, 8 sales/.test(t) && /L75 \$152,000/.test(t), "range with options (Corvette): the pooled range and each option's line");
  ok(/S430 \$6,500 to \$10,500, 8 sales/.test(t) && !/\$7,500 to \$14,500/.test(t), "options (S-Class): each option's own range, no pooled range");
  ok(/\$22,500 to \$41,000/.test(o) && /Convertible \$29,000 to \$42,500, 9 sales/.test(o) && /Coupe \$22,500 to \$31,500, 8 sales/.test(o), "a new Task with a car that has options: the pooled range and each option");
  ok(/\$22,500 to \$41,000/.test(md) && /\$1,063,000/.test(md) && !/ to \$1,0/.test(md), "range prints a range; sales prints the sales and no range");
  const none = md.slice(md.indexOf("1987 Porsche 959")), seg = none.slice(0, none.indexOf("Sam is looking")); ok(!/\$\d/.test(seg.replace(/Last bid seen \$30,000 at [^\n]*/, "")), "none prints nothing about the market"); }
// ---- 5. the detector: the old wording fails it
ok(carCountProblems("Sam found three cars for your Task. 4 live cars match.").length === 1, "detector: 'three cars' beside '4 live cars match' fails");
ok(carCountProblems("3 more cars match. Two updates").length === 1, "detector: a digit where the helper writes a word fails, the word form passes");
ok(carCountProblems("Sam found eleven cars").length === 1 && carCountProblems("Sam found 11 cars").length === 0, "detector: eleven must be 11");
ok(carCountProblems("since January 2024 there were 5 sales").length === 0, "a date is not a count of cars");
ok(saleFormProblems("9 sales and three sales").length === 1 && saleFormProblems("9 sales and 11 sales").length === 0, "detector: sale counts in both forms fail");
ok(footerProblems({ text: "Sam sends one email a day. Open your Tasks: x\nStop all Task emails: y", html: "<p>Sam sends one email a day.</p><p>Stop all Task emails</p>" }).length > 0, "detector: a footer in two lines fails");
// ---- 6. the code: no email line types a digit count with a noun
for (const f of ["lib/tasks/emailCaps.js", "lib/tasks/digest.js", "lib/tasks/fullCards.js"]) {
  const src = fs.readFileSync(f, "utf8").split("\n").filter(l => !/^\s*\/\//.test(l)).join("\n");
  ok(!/\$\{(?:n|k)\} (?:more |new |live )*(?:cars?|updates?)\b/.test(src) && !/countText\(/.test(src), `${f}: no count typed in front of its noun`);
}
console.log(`emailFormCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
