// A WAY OUT OF EVERY QUESTION THAT OFFERS BUTTONS (Lane B, Oct 29 2026, Sam: "Which model?" for a 1995 Honda or a 1969 Chevrolet had no way to say "none of these"). The engine returns it with the question, as `wayOut`, next to the
// options: { id: "type_it", kind, label, placeholder, prefill, mode: "search" }. A page renders `label` as the last button; a tap puts the cursor in the normal search box with `prefill` already in it ("1995 Honda ") and
// `placeholder` as its hint; what the person types goes through the same search as any typed text (the resolver, then the engine), with no matching of its own anywhere. A model the engine cannot match gets its normal no-match line.
import { reasonLine } from "./reasonWords.js";
export const WAY_OUT_KINDS = ["model", "trim", "body", "generation", "year", "car"];
export function wayOutFor(kind, car) {
  if (!WAY_OUT_KINDS.includes(kind)) return null;
  const c = car || {}, parts = kind === "model" ? [c.year, c.make] : kind === "generation" ? [c.make, c.nameModel || c.model] : kind === "year" ? [c.make, c.nameModel || c.model] : kind === "car" ? [] : [c.year, c.make, c.nameModel || c.model, kind === "body" ? c.trim : null];
  const prefill = parts.filter(Boolean).join(" ");
  return { id: "type_it", kind, label: reasonLine("way." + kind), placeholder: reasonLine("way." + kind + ".ph"), prefill: prefill ? prefill + " " : "", mode: "search" };
}
// the tier of a question the engine returns -> the kind of way out it gets. gearbox_choice, variant_choice and dochistory_choice are facts about one car (Manual or PDK, Competition or standard, documented or not) and
// carry the engine's own skip ("Just show what sold"); the four below name WHICH car, so a person whose car is not in the buttons needs to type it.
export const WAY_OUT_TIER = { model_choice: "model", generation_choice: "generation", body_choice: "body", trim_choice: "trim" };
export const SKIP_TIERS = ["gearbox_choice", "variant_choice", "dochistory_choice"];
export function applyWayOut(d, vehicle) {
  if (!d || typeof d !== "object" || d.wayOut) return d;
  const kind = WAY_OUT_TIER[d.tier]; if (!kind) return d;
  return { ...d, wayOut: wayOutFor(kind, d.resolvedCar || vehicle) };
}

// THE RESOLVER'S OWN QUESTIONS (Lane B, Oct 29 2026, Lane E's FULL: the clarify chips and the VIN model ask Lane E draws through renderChoice carried no way out): every clarification the resolver returns (a missing model or year, a "Did you mean", a VIN that
// did not decode or does not look like one, a chassis hint) carries `wayOut` beside its chips, the engine's own wording, in the same shape as the tiers above. A missing model reads "Another model", a missing year "Another year", anything else "Another car".
export function clarifyWayOut(cl, vehicle) {
  if (!cl || typeof cl !== "object" || cl.wayOut) return cl;
  const missing = Array.isArray(cl.missing) ? cl.missing : [], v = vehicle || {};
  // no make named (a VIN, a bare number, "sports car"): the whole car; a make with no model: the model; a model with no year: the year; anything else: the whole car
  const kind = /^(vin_|chassis_|typo_)/.test(String(cl.kind || "")) || missing.includes("make") || !v.make ? "car" : (missing.includes("model") || !v.model) ? "model" : (missing.includes("year") || !v.year) ? "year" : "car";
  return { ...cl, wayOut: wayOutFor(kind, vehicle) };
}
