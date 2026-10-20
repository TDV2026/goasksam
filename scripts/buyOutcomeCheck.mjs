// THE COMPOSER'S OUTCOME (Lane E, Oct 20 2026; Sam's Buy Stage 1c item 6): lib/live/samChat.js needsZip and outcomeOf on
// fixed turns, no network, no model. Every input lands in one outcome with a message (only a first search and a
// question carry none, their answer is the message); "near me" with no zip asks for one. Exits 1 on any break.
//   node scripts/buyOutcomeCheck.mjs
import { needsZip, outcomeOf, suggestFor, runSearch } from "../lib/live/samChat.js";
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
// CLOSEST FIRST HIDES NOTHING (the 08:18Z live look): a colour search with a zip, on fixed rows through runSearch's own
// filters (no network): the shown cars plus the cars set aside for no place equal the same search without the zip. The
// cars that do not state the colour are NOT in the place count (counted before the colour filter, the old order said 4).
const end = new Date(Date.now() + 864e5).toISOString();
const row = (id, colour, location) => ({ id, source: "bringatrailer", listing_title: `2004 Ferrari 360 Modena ${id}`, make: "Ferrari", model: "360", year: 2004, country: "US", location, exterior_color: colour, end_time: end, current_bid: 90000, current_bid_usd: 90000, mileage: 20000, mileage_unit: "mi" });
const rows = [row(1, "Rosso Corsa (red)", "Los Angeles, CA"), row(2, "Red", "San Diego, CA"), row(3, "Red", null), row(4, null, null), row(5, null, null), row(6, null, null), row(7, "Blue", "Austin, TX")];
const noZip = await runSearch({}, { colour: "red" }, { rows }).catch(e => ({ error: e.message }));
const withZip = await runSearch({}, { colour: "red", location: "90210", sort: "nearest" }, { rows }).catch(e => ({ error: e.message }));
const nz = noZip.matches ? noZip.matches.length : null, wz = withZip.matches ? withZip.matches.length : null;
check(`closest first hides nothing: without the zip ${nz}; with it ${wz} shown + ${withZip.unstatedPlace} set aside for no place`, nz === 3 && wz === 2 && withZip.unstatedPlace === 1 && wz + withZip.unstatedPlace === nz, { noZip: nz, withZip: wz, unstatedPlace: withZip.unstatedPlace, error: noZip.error || withZip.error });
console.log(failed ? `buyOutcomeCheck: ${failed} FAIL` : "buyOutcomeCheck: all pass");
process.exit(failed ? 1 : 0);
