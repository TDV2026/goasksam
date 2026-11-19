// The ONE place the Task limit is chosen for a request (Nov 5 2026, NOT live). Ten Tasks for a request carrying the SIGNED crew cookie (lib/_crew.js isCrewRequest), three for everyone else, failing closed:
// no cookie, a forged or expired one, another door's cookie (tester, seat), a ?crew= query, a header: all the free limit. The limit rides on the user object (taskMax) into slotTask, blockedOf and limitFacts.
// The email one-tap links and every cron run build their user with tapUser: no taskMax, so they are ALWAYS the free limit, even when the browser that taps also holds a crew cookie. So a crew account's 4th to 10th
// Tasks cannot be resumed by an email tap: they resume from the Tasks page. That is deliberate; the gate is not widened.
import { isCrewRequest } from "../_crew.js";
import { taskLimitFor } from "./limit.js";

export function taskUserFor(req, u) {
  return u && u.userId ? { userId: u.userId, email: u.email || null, taskMax: taskLimitFor(isCrewRequest(req) === true) } : null;
}
export const tapUser = task => ({ userId: task.user_id });

// The Tasks nav badge number (Nov 5 2026, crew only, NOT live). Everyone else: the old count (open Tasks, watches and armed alerts, lib/live/looking.js badgeFacts). A request with the signed crew cookie: the sum of tasks.unread
// for the person, and nothing at zero (the page draws nothing for 0). It never marks anything read: only opening one Task resets that Task (api/tasks.js list, b.open).
export const badgeCount = (isCrew, badgeTotal, unreadSum) => (isCrew === true ? (Number(unreadSum) > 0 ? Number(unreadSum) : 0) : badgeTotal);

// The crew unread badge in the list answer (Nov 5 2026, crew only, NOT live): { unread: N } for a request with the signed crew cookie when N is above zero; nothing at all (the key is absent) at zero and for every other request,
// so a non crew answer is byte for byte the answer it always was. `open` is the Task the list call opens (its unread is reset by that same call, so it is left out of the sum, and the number equals what the next summary says).
export const badgeFor = (isCrew, tasks, openId) => {
  if (isCrew !== true) return null;
  const n = (tasks || []).reduce((k, t) => k + (t && t.id !== openId ? (Number(t.unread) || 0) : 0), 0);
  return n > 0 ? { unread: n } : null;
};
