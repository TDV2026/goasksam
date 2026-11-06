// The free Tasks limit: how many Tasks an account can have WORKING at once (running, or waiting on the buyer).
// ONE place. Every page, email and check reads it from here (or from what the API sends: list, summary and the
// blocked answer all carry max and the sentences); nothing else holds the number. Paused and stopped Tasks do not
// hold a slot. Stopping a Task frees its slot straight away. Enforced server side where a Task is created, restarted
// or resumed (lib/tasks/tasks.js slotTask), whatever page or request it came from.
export const FREE_TASK_LIMIT = 3;
// The CREW limit (Sam, Nov 5 2026): ten, for the signed crew cookie only, while the live allowance stays FREE_TASK_LIMIT. NOT live: nothing but a request carrying the signed crew cookie
// ever gets it. The one chooser is taskLimitFor, called in api/tasks.js behind isCrewRequest(req); it fails closed (only the boolean true widens, anything else is the free limit).
export const CREW_TASK_LIMIT = 10;
// The ONE source of the crew number for page and server code: read it here, never type it. It is a number, not a grant: nothing about a request decides it (taskLimitFor does), so only CREW-GATED code may import it
// (scripts/tasksCrewExportCheck.mjs holds the list of files that may); a non crew request is only ever told the free limit by the API (limit.max, counts, blocked.max, the sentences).
export const crewTaskLimit = () => CREW_TASK_LIMIT;
export const taskLimitFor = isCrew => (isCrew === true ? CREW_TASK_LIMIT : FREE_TASK_LIMIT);
// The limit for the account behind a request: the number api/tasks.js put on the user (taskMax), only ever the crew number or the free one. A user object that never went through the crew gate (an email tap, a cron run) has none: the free limit.
export const taskMaxOf = user => (user && user.taskMax === CREW_TASK_LIMIT ? CREW_TASK_LIMIT : FREE_TASK_LIMIT);
const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const countWord = n => WORDS[n] || String(n);
const Tasks = n => (n === 1 ? "Task" : "Tasks");
// "3 Tasks": the figure as the page prints it (digits, as Sam's brief words it).
export const tasksCount = n => `${n} ${Tasks(n)}`;
// The sentence under a blocked create (the card on the Tasks page): "this one" is the Task the person just asked for.
export const limitLine = (n = FREE_TASK_LIMIT) => `You have ${tasksCount(n)} running. Stop one to start this one.`;
// The sentence at an entry point that has no new Task in hand yet (the Tasks explainer, Buy's keep-looking button).
export const limitEntryLine = (n = FREE_TASK_LIMIT) => `You have ${tasksCount(n)} running. Stop one to add another.`;
// "three active Tasks" for the plain-words promises (the FAQ and the sign-in card).
export const freeTasksWords = (max = FREE_TASK_LIMIT) => `${countWord(max)} active ${Tasks(max)}`;
// The facts the API sends beside a list or a summary: the page prints these and computes nothing.
// statusLine: the one line at the top of the page below the limit ("You have 2 of 3 Tasks running. 1 Task left.").
// left: how many more Tasks may start, the one place it is worked out (max minus working, never below zero). A page prints it and never subtracts.
export const leftOf = (working, max = FREE_TASK_LIMIT) => Math.max(0, max - Math.max(0, Number(working) || 0));
export function limitFacts(working, max = FREE_TASK_LIMIT) {
  const w = Math.max(0, Number(working) || 0), left = leftOf(w, max);
  return { max, working: w, left, atLimit: w >= max, line: limitLine(w), entryLine: limitEntryLine(w), statusLine: left ? `You have ${w} of ${max} ${Tasks(max)} running. ${left} ${Tasks(left)} left.` : null };
}
