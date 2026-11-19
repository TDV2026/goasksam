// clock: real-ok no dates (Lane B, Nov 10 2026)
// The one place a prePush check's status is read. A check must hand record() a status WORD ("PASS", "FAIL", "SKIP"). Anything else (a boolean, undefined, a number)
// used to crash the whole run at status.padEnd; now it is a red row carrying the check's own name, so the run finishes and says which check was wrong.
export const STATUS_WORDS = ["PASS", "FAIL", "SKIP"];
export function normalizeStatus(name, status, detail) {
  if (typeof status === "string" && STATUS_WORDS.includes(status)) return { name, status, detail };
  const shape = status === null ? "null" : typeof status === "string" ? `the word "${status.slice(0, 20)}"` : `a ${typeof status} (${String(status).slice(0, 20)})`;
  return { name, status: "FAIL", detail: `this check returned ${shape} instead of PASS, FAIL or SKIP; it is counted red until it returns a status word${detail ? " | " + detail : ""}` };
}
