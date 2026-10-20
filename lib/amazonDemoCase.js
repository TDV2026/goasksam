// THE AMAZON DEMO'S ANSWER CASES (Sam's revision 2, item 8; Lane E, Oct 20 2026). Every VIN or car typed in the car box
// or the "What's your car going for?" box gets a visible answer, decided from the partner answer itself (nothing
// computed): (a) a VIN that cannot be read: Sam's line; (b) read, no sales: the engine's own no-sales line, with the car's
// name; (c) outside the pilot scope: Sam's line, with the car's name; else the answer as today. The scope is the approved
// rules in api/_amazonDemo.js (amazonInScope: 25 years or older, the listed makes, the listed models), read, never copied.
import { amazonInScope, SCOPE_AGE_YEARS, SCOPE_MAKES, SCOPE_MODELS } from "../api/_amazonDemo.js";
export const OUT_OF_SCOPE_LINE = "Market Check covers enthusiast and specialty cars in this pilot.";   // Sam's words
export function demoAnswerCase(a, nowYear = new Date().getFullYear()) {
  if (!a || a.ok === false) return { kind: "error", line: null, name: null };
  if (a.answerType === "vin_unreadable") return { kind: "unreadable", line: a.line || null, name: null };
  const id = a.identity || null;
  const d = a.vinDecode || null;
  const name = a.carName || (id && id.make && id.model ? [id.year, id.make, id.model].filter(Boolean).join(" ") : null) || (d && d.make ? [d.year, d.make, d.model].filter(Boolean).join(" ") : null);
  const scopeId = id && id.make ? id : (d && d.make ? { year: d.year, make: d.make, model: d.model, variant: d.trim } : null);
  if (scopeId && !amazonInScope(scopeId, nowYear, { age: SCOPE_AGE_YEARS, makes: SCOPE_MAKES, models: SCOPE_MODELS })) return { kind: "out_of_scope", line: OUT_OF_SCOPE_LINE, name };
  if (a.answerType === "zero_result" || (a.answerType === "not_enough_data" && !(a.sales || []).length)) return { kind: "no_sales", line: a.thin || null, name };
  if (a.answerType === "identity_question" && !(a.question && (a.question.options || []).length)) return { kind: "no_sales", line: (a.question && a.question.text) || null, name };
  return { kind: "answer", line: null, name };
}
