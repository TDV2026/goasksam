// THE APPLIED CHOICE (Sam, Oct 15 2026; Lane B's e49 keys the refine): when a Buy page has a body or trim chosen, the
// car a Task from that page names, and its email's car line, read the chosen body and trim from the engine's own answer
// for the same words with the same choice applied (resolvedCar.bodyStyle / .trim / .applied), never from the chip's
// label or the typed words. Read only; the engine decides what was applied, this file only carries it.
import { resolveForBuy, engineAnswer } from "../live/search.js";
import { findGeneration } from "../generations.js";

// The words the engine reads for the page's car: the one typed year when the page has one, then make and model.
export function choiceWords(f) {
  const y = f.year_min && Number(f.year_min) === Number(f.year_max) ? Number(f.year_min) : null;
  return [y, f.make, f.model].filter(Boolean).join(" ");
}
// The refine the page's choice stands for: the body as the engine's own body value ("coupe"). Buy's questions offer a
// body, never a trim chip; a trim on a Buy page is typed words (part of the car the engine resolves), so it is not sent
// as a refine (the engine's trim refine takes a chip's own trim value).
export function choiceRefine(f) {
  const body = f && f.body ? String(f.body).trim().toLowerCase() : null;
  return body ? { body } : null;
}
// { body, trim } the engine applied, or null when there is no choice or the read did not come back (the caller then
// keeps the page's own filters unchanged).
export async function appliedChoice(env, f) {
  if (!f || !f.make || !f.model) return null;
  const refine = choiceRefine(f); if (!refine) return null;
  const words = choiceWords(f);
  const v = await resolveForBuy(words, env).catch(() => null);
  if (!v || !v.model) return null;
  const g = await findGeneration(v, env).catch(() => null);
  const d = await engineAnswer(v, g, words, env, refine).catch(() => undefined);
  const rc = d && d.resolvedCar;
  if (!rc) return null;
  const ap = rc.applied || {};
  return { body: ap.body || (refine.body ? rc.bodyStyle || null : null), trim: ap.trim || null, resolvedCar: { year: rc.year || null, make: rc.make || null, model: rc.model || null, trim: rc.trim || null, bodyStyle: rc.bodyStyle || null } };
}
// The page's filters with the engine's applied choice written in (body, trim). A choice the engine did not apply is
// left as the page had it (never widened by dropping it); nothing applied, the filters are unchanged.
export function withChoice(f, ap) {
  if (!ap) return f;
  const out = { ...f };
  if (out.body && ap.body) out.body = String(ap.body);
  if (out.trim && ap.trim) out.trim = String(ap.trim);
  return out;
}
