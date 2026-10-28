// The account caps on Find's standing notices (Sam, Oct 29 2026). A watch or a before-it-ends alert never uses up one of the working Task slots (lib/tasks/limit.js FREE_TASK_LIMIT); each has its own cap.
export const WATCH_CAP = 25, ALERT_CAP = 25;
export const CAP_LINES = {
  watch: `You are looking for ${WATCH_CAP} cars. Stop one to add another.`,
  alert: `You have ${ALERT_CAP} before-it-ends emails set. Stop one to add another.`
};
