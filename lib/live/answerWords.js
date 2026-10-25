// THE ANSWER TO A QUESTION SAM ASKED (Sam's Buy 1f item 9, Oct 21 2026; Lane D). One pure reader shared by Tasks, Buy and
// Market Check, so "all" means the same everywhere. A whole answer that only says "any of them" ("all", "any", "every",
// "everything", "doesn't matter", "no preference", "either", "whatever", and close forms) reads as the question's Any
// option. An answer that names one of the question's own options reads as that option. Anything else is NOT understood:
// the caller says so plainly and shows the options, and never asks the same question again in the same words.
// The whole answer must be an any-answer: "all red ones under 50k" adds facts and is NOT read here (the conversation
// reads it), so a buyer's extra words are never thrown away.
const LEAD = /^(?:(?:oh|um+|uh+|well|hmm+|just|honestly|i (?:guess|think)|i'?d say|i would say|i'?m|i am|we'?re|show me|give me|i want|i'?ll take|i will take|happy with|fine with|ok(?:ay)? with|open to|looking (?:at|for)|i|we)\s+)+/;
const TAIL = /(?:\s+(?:of (?:them|those|these|it)|ones?|models?|kinds?|types?|styles?|body styles?|versions?|options?|choices?|years?|generations?|eras?|gearboxe?s?|colou?rs?|please|thanks|thank you|is fine|are fine|is ok(?:ay)?|are ok(?:ay)?|works|will do|is good|are good|really|at all|really))+$/;
const ANY_CORE = /^(?:all|any|every|everything|anything|either|either one|both|whatever|whichever|any one|any of|all of|no preference|no pref|doesn'?t matter|does not matter|don'?t mind|do not mind|don'?t care|do not care|not fussy|not bothered|no matter|it doesn'?t matter|it does not matter|anywhere|any is fine|all is fine|all good|show (?:me )?(?:them )?all|all please|the lot|every one|everyone)$/;
export function normAnswer(text) {
  return String(text || "").toLowerCase().replace(/[‘’]/g, "'").replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
}
export function isAnyAnswer(text) {
  let t = normAnswer(text);
  if (!t || t.length > 60) return false;
  for (let i = 0; i < 3; i++) { const t2 = t.replace(LEAD, "").replace(TAIL, "").trim(); if (t2 === t) break; t = t2; }
  return ANY_CORE.test(t);
}
// The option the answer names: its label (or value) as the whole answer, or as whole words inside a short answer
// ("the coupe", "coupes please"). A plural s is allowed. Two options named, or none: null (not understood).
export function matchOption(text, options) {
  const t = normAnswer(text); if (!t || !Array.isArray(options) || !options.length) return null;
  const lab = o => normAnswer(typeof o === "string" ? o : (o && (o.label || o.value)) || "");
  const exact = options.filter(o => { const l = lab(o); return l && (l === t || l + "s" === t || l === t + "s"); });
  if (exact.length === 1) return exact[0];
  if (t.split(" ").length > 6) return null;
  const hits = options.filter(o => { const l = lab(o); if (!l) return false; const e = l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); return new RegExp(`(?:^| )${e}s?(?: |$)`).test(t); });
  if (hits.length === 1) return hits[0];
  if (hits.length) return null;
  // A small typo still counts (Lane D, Oct 24 2026): the whole answer, or one word of a short answer, one letter off a
  // label of five letters or more (two off for twelve or more), and only when exactly one option is that close.
  const near = options.filter(o => { const l = lab(o); if (l.length < 5) return false; const max = l.length >= 12 ? 2 : 1; return [t].concat(t.split(" ").length <= 3 ? t.split(" ") : []).some(w => w.length >= 4 && editWithin(w, l, max)); });
  return near.length === 1 ? near[0] : null;
}
function editWithin(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) { const cur = [i]; for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return prev[b.length] <= max;
}
// What the answer is: { kind: "any" } | { kind: "option", option } | { kind: "unknown" }.
// anyLabel: the question's own Any option ("Any Porsche"), which a button click sends word for word.
export function readAnswer(text, options = [], anyLabel = null) {
  if (isAnyAnswer(text) || (anyLabel && normAnswer(text) === normAnswer(anyLabel))) return { kind: "any" };
  const o = matchOption(text, options);
  return o ? { kind: "option", option: o } : { kind: "unknown" };
}
// The plain line for an answer not understood, with the options (and the Any option) named. Never the question again.
export function notUnderstoodLine(options, anyLabel) {
  const labs = (options || []).map(o => typeof o === "string" ? o : (o && o.label) || "").filter(Boolean).slice(0, 8);
  if (anyLabel) labs.push(anyLabel);
  if (!labs.length) return "Sam didn't understand that answer.";
  const list = labs.length === 1 ? labs[0] : labs.slice(0, -1).join(", ") + " or " + labs[labs.length - 1];
  return `Sam didn't understand that answer. The choices are ${list}.`;
}
// The same any-answer test as a source string, for the pages' own scripts (Buy's composer, Market Check's box), so a
// page never keeps its own list: the server writes this into the page.
export const ANY_ANSWER_JS = `(function(){var L=${LEAD.toString()},T=${TAIL.toString()},A=${ANY_CORE.toString()};return function(x){var t=String(x||"").toLowerCase().replace(/[\\u2018\\u2019]/g,"'").replace(/[^a-z0-9' ]+/g," ").replace(/\\s+/g," ").trim();if(!t||t.length>60)return false;for(var i=0;i<3;i++){var u=t.replace(L,"").replace(T,"").trim();if(u===t)break;t=u;}return A.test(t);};})()`;
