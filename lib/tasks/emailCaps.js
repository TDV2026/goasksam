// HOW MANY CARS ONE TASK EMAIL SHOWS (Lane D, Oct 24 2026, Sam's order): the first email after Start shows the 5 cars ending soonest, every
// later email up to 6 new cars (ending soonest first). The cars past the cap are counted and stay in the Task; the line below is the
// only place the sentence is written, so the email prints it and computes nothing.
// ONE WORD FORM (Lane D, Oct 28 2026): every count in a Task email is joined to its noun by the shared count helper (lib/countNoun.js:
// one to ten as words, 11 and up as digits, zero as "no"), so the subject, the "more" line and the heading can never read "three cars"
// in one place and "4 cars" in another. A line that types a digit and a noun here is a bug of that class (scripts/emailFormCheck.mjs).
import { countNoun } from "../countNoun.js";
export const FIRST_EMAIL_CARS = 5;
export const LATER_EMAIL_CARS = 6;
// The two headings a car section can carry. The first email after a Task is created is a catch-up of what is live now; every later one lists
// only cars that are new since the last email (the Task's seen set, lib/tasks/tasks.js splitSeen, keeps a car from coming twice).
export const CATCH_UP_HEADING = "Live right now";
export const NEW_HEADING = "New since your last email";
export const headingFor = catchUp => (catchUp ? CATCH_UP_HEADING : NEW_HEADING);
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
export function moreCarsLine(n, first) {
  const k = Math.round(Number(n) || 0);
  if (k < 1) return "";
  const them = k === 1 ? "it" : "them";
  return first ? `${cap(countNoun(k, "more car", { many: "more cars" }))} ${k === 1 ? "matches" : "match"}. Open the Task to see ${them}.` : `${cap(countNoun(k, "more new car", { many: "more new cars" }))}. Open the Task to see ${them}.`;
}
// The ONE footer line of the combined email (the cadence, the page that changes it, and the one-click stop live beside it in digest.js).
export const footerLine = often => String(often || "").replace(/\s+/g, " ").trim();
