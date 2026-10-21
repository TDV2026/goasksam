// BUY REDESIGN STAGE 2, THE SEARCH STATE (Sam, Oct 19 2026; Lane C). Runs Buy's own client helpers: the search is said
// once (no "Your search:", no "Here's what's for sale" line, the question does not repeat the count); the count reads
// "{N} live matches"; the active constraints are removable chips built from the search's own filters (a make takes its
// model with it); no permanent Near me, Any colour, Any gearbox or abroad pills (the engine's widenings only as the way
// out of one, two or no cars); a removed chip reruns at once; a click on the search text makes it editable. No network.
//   node scripts/buyStage2Check.mjs     exit 1 on any failure.
import fs from "node:fs";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const s = fs.readFileSync(new URL("../api/buy.js", import.meta.url), "utf8");
const i = s.indexOf("const CLIENT = ") + "const CLIENT = ".length, c = JSON.parse(s.slice(i, s.indexOf('";\n', i) + 1));
const line = from => { const a = c.indexOf(from); if (a < 0) throw new Error("missing " + from); return c.slice(a, c.indexOf("\n", a)) + "\n"; };
const block = (from, to) => { const a = c.indexOf(from), b = c.indexOf(to, a); if (a < 0 || b < 0) throw new Error("missing " + from); return c.slice(a, b); };
const env = ["  function esc(s)", "  function usd(n)", "  function num(n)", "  function genWord(v)", "  function band(lo, hi, fmt)"].map(line).join("") +
  block("  function eraWords(f){", "  function band(") + block("  // STAGE 2: \"{N} live matches\"", "  function headerHtml(");
const { matchesLine, filterParts, filterChips } = new Function(env + "\nreturn { matchesLine: matchesLine, filterParts: filterParts, filterChips: filterChips };")();
const labels = f => filterParts(f).map(p => p.label);
// The count, once.
ok(matchesLine(7, true) === "7 live matches" && matchesLine(1, true) === "1 live match" && matchesLine(1303, true) === "1,303 live matches", "the count reads N live matches");
ok(matchesLine(0, true) === "No live matches right now." && matchesLine(0, false) === "Nothing live fits yet.", "nothing live: one plain line, the search not repeated");
// The constraints as chips, from the filters.
ok(labels({ make: "Porsche", colour: "black", gearbox: "manual", miles_max: 50000 }).join("|") === "Porsche|Black|Manual|Under 50,000 miles", "black manual Porsche under 50,000 miles: Porsche, Black, Manual, Under 50,000 miles");
ok(labels({ make: "Porsche", model: "911", generation: "997", year_min: 2005, year_max: 2012 }).join("|") === "Porsche|911|997|2005 to 2012", "make, model, generation and years each a chip");
ok(labels({ make: "Porsche", model: "911", year_max: 1998 }).join("|") === "Porsche|911|Air-cooled", "an air-cooled 911 reads Air-cooled, not its years");
ok(labels({ year_min: 1999, year_max: 1999, colour: "red" }).join("|") === "1999|Red" && labels({ year_min: 1990 }).join("") === "From 1990" && labels({ year_max: 1975 }).join("") === "Up to 1975", "one year, from, up to");
ok(labels({ budget_max: 70000, bid_max: 40000, ends_within_days: 7 }).join("|") === "Under $70,000|Bid under $40,000|Ending this week", "budget, bid band and ending window");
ok(filterParts({ make: "BMW", location: "90210", radius_miles: 100 }, null, 100).map(p => p.label).join("|") === "BMW|Within 100 miles of 90210" && filterParts({ location: "90210" }, null, 100)[0].zip === true, "a place reads as the header does, and its removal also forgets the zip");
ok(labels({ sort: "newest", anywhere: true, include_unstated: true, vehicle: "car" }).length === 0, "sort, abroad, show-them-too and vehicle are not constraints");
const mk = filterParts({ make: "Porsche", model: "911", generation: "997", trim: "Carrera S" });
ok(mk[0].keys.join() === "make,model,generation,trim,era" && mk[1].keys.join() === "model,generation,trim,era", "removing a make takes its model, generation and trim; removing a model its generation and trim");
const ch = filterChips({ make: "Porsche", colour: "black" }).join("");
ok(/<button type="button" class="rchip fchip" data-rmf="make,model,generation,trim,era" aria-label="Remove Porsche">Porsche<span class="fx" aria-hidden="true">×<\/span><\/button>/.test(ch) && /data-rmf="colour"/.test(ch), "each chip is a button that names what it removes");
// The header and the searching block.
const hh = block("  function headerHtml(m, q, qp, f, asking){", "  // With cars that don't state");
const code = c.split("\n").filter(l => !/^\s*\/\//.test(l)).join("\n");
ok(!/Your search:/.test(code) && !/sq-k/.test(hh), "no 'Your search:' anywhere on the page");
ok(!/chip-live/.test(hh) && !/data-nearme/.test(hh) && /var chips = filterChips\(f, m\.place, m\.radius\);/.test(hh), "no Live or Near me pill; the chips are the search's constraints");
ok(/if \(n <= 2\) widen\.forEach/.test(hh), "the engine's widenings (Any colour, abroad and the rest) show only for one, two or no cars");
// Stage 1e item 7 (Sam, Oct 21 2026): no heading above the chips; the chips alone show the search.
ok(!/class="sq"|data-sqedit|esc\(q\)/.test(hh) && /return '<div class="shead">' \+\s*'<div class="srow2">/.test(hh), "no search heading above the chips (Stage 1e item 7): the header starts with the chips row");
ok(/esc\(matchesLine\(n, true\)\)/.test(hh) && /esc\(matchesLine\(0, !!qp\)\)/.test(hh), "the header's count is N live matches");
ok(!/insertAdjacentHTML\("beforeend", '<p class="snote">'/.test(c), "no 'Here's what's for sale' line over the cards");
ok(/var lead = "";/.test(block("  function askHtml(a, m, qp){", "  // Listings that don't state")), "the narrowing question does not repeat the count");
ok(/'<div class="shead"><p class="sq"><b>' \+ esc\(said\) \+ '<\/b><\/p>/.test(c) && /esc\(matchesLine\(n, !!searchLabel/.test(c), "the searching block says the search once and its count as N live matches");
// The clicks.
const ck = block("    var rf = e.target.closest(\"[data-rmf]\");", "    var ap = e.target.closest(\"[data-askpatch]\");");
ok(/drop\.forEach\(function\(k\)\{ delete cur\[k\]; \}\);/.test(ck) && /return chatAsk\(cur\);/.test(ck) && /conv\.railReplace = location\.pathname \+ location\.search;/.test(ck), "a removed chip reruns at once without it, relabelling its rail entry");
ok(/if \(!filterParts\(cur\)\.length\) return goStart\(true\);/.test(ck) && /if \(rf\.hasAttribute\("data-rmzip"\)\) setZip\("any"\);/.test(ck), "the last chip removed goes to the Buy start; a removed place forgets the zip");
ok(/<form class="sq-form" data-sfield><input id="sfin"/.test(ck) && /document\.addEventListener\("submit", function\(e\)\{ var fm = e\.target\.closest && e\.target\.closest\("\[data-sfield\]"\); if \(!fm\) return; e\.preventDefault\(\); var v = String\(\(\$\("sfin"\) \|\| \{\}\)\.value \|\| ""\)\.trim\(\); if \(!v\) return; conv = newConv\(\); send\(v\); \}\);/.test(c), "the edited search runs as a new search on Enter");
// Copy: no dashes, no banned words in what Stage 2 adds.
const added = block("  // STAGE 2: \"{N} live matches\"", "  function headerHtml(") + ck;
ok(!/[–—]/.test(added) && !/\b(worth|value|estimate|median|percentile|demo)\b/i.test(added.replace(/\.value\b|value="|\bvalue:/g, "")), "no em or en dash and no banned word in the new copy");
console.log(`buyStage2Check: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
