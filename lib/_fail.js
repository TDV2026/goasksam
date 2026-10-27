// ONE FAILURE ANSWER (Sam / Lane S review, Oct 27 2026): a server error reaches the browser as one fixed plain sentence and nothing else. The detail (the error's own message,
// which can carry a table name, a path or a database reply) goes to the server log only. Every route that used to return err.message uses this.
export const CALM_FAIL = "Something went wrong on our side. Please try again in a moment.";
export function failBody(where, err, extra) {
  try { console.error("fail " + where + ":", (err && err.stack) || (err && err.message) || err); } catch {}
  return { error: CALM_FAIL, ...(extra || {}) };
}
