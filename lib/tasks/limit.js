// The free Tasks limit: how many Tasks an account can have WORKING at once (running, or waiting on the buyer).
// ONE place. Every page, email and check reads it from here (or from what the API sends: list, summary and the
// blocked answer all carry max and the sentences); nothing else holds the number. Paused and stopped Tasks do not
// hold a slot. Stopping a Task frees its slot straight away. Enforced server side where a Task is created, restarted
// or resumed (lib/tasks/tasks.js slotTask), whatever page or request it came from.
export const FREE_TASK_LIMIT = 3;
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
export function limitFacts(working, max = FREE_TASK_LIMIT) {
  const w = Math.max(0, Number(working) || 0), left = Math.max(0, max - w);
  return { max, working: w, atLimit: w >= max, line: limitLine(w), entryLine: limitEntryLine(w), statusLine: left ? `You have ${w} of ${max} ${Tasks(max)} running. ${left} ${Tasks(left)} left.` : null };
}
