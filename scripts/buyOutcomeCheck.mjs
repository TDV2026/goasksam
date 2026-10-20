// THE COMPOSER'S OUTCOME (Lane E, Oct 20 2026; Sam's Buy Stage 1c item 6): lib/live/samChat.js needsZip and outcomeOf on
// fixed turns, no network, no model. Every input lands in one outcome with a message (only a first search and a
// question carry none, their answer is the message); "near me" with no zip asks for one. Exits 1 on any break.
//   node scripts/buyOutcomeCheck.mjs
import { needsZip, outcomeOf, suggestFor } from "../lib/live/samChat.js";
let failed = 0;
const check = (name, ok, got) => { if (!ok) failed++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  (got " + JSON.stringify(got) + ")"}`); };
const prev = { make: "Ferrari", colour: "red" };
const s = [{ tool: "search_live" }];
check("near me, no zip, after a search: ask for the zip", needsZip("near me", { zip: null, prevFilters: prev }) === true);
check("closest to me: ask for the zip", needsZip("which is closest to me?", { zip: null, prevFilters: prev }) === true);
check("within 100 miles, no zip: ask for the zip", needsZip("within 100 miles", { zip: null, prevFilters: prev }) === true);
check("near me WITH a zip this visit: no ask", needsZip("near me", { zip: "90210", prevFilters: prev }) === false);
check("near me with a zip typed: no ask", needsZip("near me 90210", { zip: null, prevFilters: prev }) === false);
check("near a named place: no ask", needsZip("anything near Boston", { zip: null, prevFilters: prev }) === false);
check("near me as the first words of a visit: no ask (no search yet)", needsZip("Ferrari near me", { zip: null, prevFilters: {} }) === false);
let o = outcomeOf({ prevFilters: prev, filters: { ...prev, gearbox: "manual" }, trace: s, meta: { live: 4 } });
check("refinement says what changed and the count", o.kind === "refinement" && o.line === "Now showing manual cars only: 4 live matches.", o);
o = outcomeOf({ prevFilters: prev, filters: { ...prev, budget_max: 80000 }, trace: s, meta: { live: 1 } });
check("refinement under a price, singular", o.kind === "refinement" && o.line === "Now showing cars under $80,000: 1 live match.", o);
o = outcomeOf({ prevFilters: prev, filters: { make: "BMW", colour: "white" }, trace: s, meta: { live: 9 }, newCar: true, noun: "white BMWs" });
check("new search names the car and the rail", o.kind === "new_search" && o.line === "New search: white BMWs. Your last search is in the list on the left.", o);
o = outcomeOf({ prevFilters: prev, filters: { ...prev }, trace: s, meta: { live: 8, asks: [{ chips: [{ label: "Coupe" }, { label: "Spider" }] }] } });
check("nothing changed: never silent, two things it can do", o.kind === "unsupported" && o.line === "Sam can't do that here yet. You can show only Coupe or show only Spider.", o);
o = outcomeOf({ prevFilters: prev, filters: { ...prev }, trace: s, meta: { live: 8 } });
check("nothing changed, no question: the two plain things", o.kind === "unsupported" && /set a price limit or ask which of these have sold before\.$/.test(o.line), o);
o = outcomeOf({ prevFilters: prev, filters: prev, trace: [{ tool: "market_check" }], meta: null });
check("a question: the guarded answer is the message", o.kind === "question" && o.line === null, o);
o = outcomeOf({ prevFilters: {}, filters: prev, trace: s, meta: { live: 8 } });
check("the first search: no line (the header says it)", o.kind === "search" && o.line === null, o);
// The suggestions: at most three, typed words, never an active filter.
let sg = suggestFor({ meta: { live: 12, asks: [{ dim: "model", chips: [{ label: "911", n: 6, patch: { model: "911" } }, { label: "Panamera", n: 4, patch: { model: "Panamera" } }, { label: "930", n: 2, patch: { model: "930" } }] }] }, filters: { make: "Porsche" }, seenAny: true });
check("suggestions: two model options and sold-before", JSON.stringify(sg) === JSON.stringify(["only 911", "only Panamera", "which have sold before?"]), sg);
sg = suggestFor({ meta: { live: 9, asks: [{ dim: "gearbox", chips: [{ label: "Manual", n: 5, patch: { gearbox: "manual" } }, { label: "Automatic", n: 4, patch: { gearbox: "automatic" } }] }] }, filters: { make: "Ferrari", location: "90210" } });
check("suggestions: gearbox words and a radius once a zip is known", JSON.stringify(sg) === JSON.stringify(["only manuals", "only automatics", "within 100 miles"]), sg);
sg = suggestFor({ meta: { live: 9, asks: [{ dim: "gearbox", chips: [{ label: "Manual", n: 5, patch: { gearbox: "manual" } }] }] }, filters: { make: "Ferrari", gearbox: "manual" } });
check("suggestions: never an active filter", !sg.includes("only manuals"), sg);
sg = suggestFor({ meta: { live: 1, widen: [{ send: "Any year" }] }, filters: { make: "BMW" } });
check("suggestions: a small set offers the engine's first widening", JSON.stringify(sg) === JSON.stringify(["Any year"]), sg);
check("suggestions: no meta, none", suggestFor({}).length === 0, suggestFor({}));
console.log(failed ? `buyOutcomeCheck: ${failed} FAIL` : "buyOutcomeCheck: all pass");
process.exit(failed ? 1 : 0);
