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
