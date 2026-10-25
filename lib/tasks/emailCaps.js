// HOW MANY CARS ONE TASK EMAIL SHOWS (Lane D, Oct 24 2026, Sam's order): the first email after Start shows the 5 cars ending soonest, every
// later email up to 6 new cars (ending soonest first). The cars past the cap are counted and stay in the Task; the line below is the
// only place the sentence is written, so the email prints it and computes nothing.
export const FIRST_EMAIL_CARS = 5;
export const LATER_EMAIL_CARS = 6;
export function moreCarsLine(n, first) {
  const k = Math.round(Number(n) || 0);
  if (k < 1) return "";
  return first ? `${k} more ${k === 1 ? "car matches" : "cars match"}. Open the Task to see ${k === 1 ? "it" : "them"}.` : `${k} more new ${k === 1 ? "car" : "cars"}. Open the Task to see ${k === 1 ? "it" : "them"}.`;
}
