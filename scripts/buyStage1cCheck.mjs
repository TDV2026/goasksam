// BUY STAGE 1c (Sam's review of the live Buy page, Oct 20 2026; Lane C). Runs Buy's own client helpers and reads the
// client. Item 1: the exact-car history once, inside the Sam area. No network.
//   node scripts/buyStage1cCheck.mjs     exit 1 on any failure.
import fs from "node:fs";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const s = fs.readFileSync(new URL("../api/buy.js", import.meta.url), "utf8");
const i = s.indexOf("const CLIENT = ") + "const CLIENT = ".length, c = JSON.parse(s.slice(i, s.indexOf('";\n', i) + 1));
const ci = s.indexOf("const BUY_CARD_CSS = ") + "const BUY_CARD_CSS = ".length, css = JSON.parse(s.slice(ci, s.indexOf('";\n', ci) + 1));
const block = (from, to) => { const a = c.indexOf(from), b = c.indexOf(to, a); if (a < 0 || b < 0) throw new Error("missing " + from); return c.slice(a, b); };
// ---- Item 1: EXACT-CAR HISTORY ONCE.
const sl = block("  function noRange(l){", "  // SPEC CHIPS");
ok(/ls = ls\.filter\(function\(x\)\{ return x\.kind !== "same"; \}\);/.test(sl), "the 'This exact car sold for ...' sentence is not printed on a card");
const env = "function esc(s){ return String(s); } var READING_LINE = 'r', REL_MC = true; function rangeFirst(){ return ''; } function rungHtml(){ return ''; } function rungShown(){ return []; } function saleLink(t){ return t; }\n" + sl;
const samLine = new Function(env + "\nreturn samLine;")();
const same = { kind: "same", lead: "This exact car ", link: "sold for $128,000 in February 2023", tail: "." };
ok(samLine({ market: { kind: "range" }, sam_lines: [same] }) === null, "a card whose only line was the exact-car sentence has no line of its own");
ok(!/This exact car/.test((samLine({ market: { kind: "range" }, sam_lines: [{ kind: "range", text: "The middle half ..." }, same] }) || {}).html), "a range card keeps its range line and drops the sentence");
const seen = block("  function seenHtml(l){", "  function card(l, big, eager){");
ok(/esc\("Sam has seen this exact car before\."\) \+ '<\/p><button type="button" class="act hact" data-hist="' \+ l\.id/.test(seen) && /esc\(priorWords\(sameCar\(l\)\)\.button\)/.test(seen), "'Sam has seen this exact car before.' with the history button (its own words: See its earlier sale / See its history) directly under it");
ok(/\(line \|\| hist\) \? '<span class="who">Sam<\/span>' \+ \(line \? line\.html : ""\) \+ \(hist \? seenHtml\(l\) : ""\) : ""/.test(seen), "inside the Sam area, after the range block; a card with history and no line still gets the Sam area");
const card = block("  function card(l, big, eager){", "  // THE ADAPTIVE GRID");
ok(!/class="hrow"/.test(card) && !/data-hist/.test(card) && /\(sl \? '<div class="sl">' \+ sl \+ "<\/div>" : ""\)/.test(card), "no separate history row on the card; the button is not in the action row");
ok(/var h = slInner\(l\), sl = tx\.querySelector\("\.sl"\);/.test(c), "a line that arrives later rebuilds the same Sam area, history included");
ok(/priorSold|sold before|listed before/.test(c), "the popup and its Oct 15 heading rule are untouched");
ok(/\.cgrid \.car \.sl \.seen\{/.test(css) && !/[–—]/.test(seen), "styled inside the Sam area; no dashes in the copy");
// ---- Item 4a: the last row left-aligned (five cards: three, then two in the first two columns, on a wide screen).
ok(/@media \(min-width:1100px\)\{\.cgrid\.n5 > article\.car:nth-of-type\(4\)\{grid-column:1\/3\}\.cgrid\.n5 > article\.car:nth-of-type\(5\)\{grid-column:3\/5\}\}/.test(css), "five cards: the last two start in the first column (left-aligned), wide screens only");
// ---- Item 4b: THE COMPACT NO-RANGE CARD.
const thin = { id: 7, market: { kind: "count", query: "1982 Ferrari 512", noCluster: true }, sam_lines: [{ kind: "range", rung: ["512 models, 1981 to 1983"], text: "Sales of cars like it vary too widely to show one range. These are the sales we found." }] };
const tl = (samLine(thin) || {}).html || "";
ok(/<p class="nr-line">Sales of cars like it vary too widely to show one range\.<\/p>/.test(tl) && !/These are the sales we found/.test(tl), "a no-range card prints the engine's line, first sentence only");
ok(/<button type="button" class="mclink" data-mc="7" aria-expanded="false"[^>]*>See the sales in Market Check<\/button>/.test(tl), "with 'See the sales in Market Check', which opens the card's own inline Market Check (data-mc, the same as its action)");
ok(/function compactNoRange\(l, x\)\{[\s\S]*'<p class="nr-scope">' \+ rungHtml\(\{ rungLines: rungShown\(l, x\.rung\) \}\)/.test(c), "the scope label when the engine gives one");
const rg = { id: 8, market: { kind: "range", low: 55000, high: 78000, query: "q" }, sam_lines: [{ kind: "range", rung: [], text: "The middle half of 1M sales landed at $55,000 to $78,000. These are recent." }] };
ok(!/nr-line|mclink/.test((samLine(rg) || {}).html || ""), "a card with a range is not the compact card");
ok(samLine({ id: 9, swap: true, market: { kind: "count" }, sam_lines: [] }) === null, "an engine-swapped card stays as it is");
const nomc = { id: 10, market: { kind: "count", noCluster: true }, sam_lines: [{ kind: "range", rung: [], text: "Too few sales to compare. More words." }] };
ok(!/mclink/.test(samLine(nomc).html) && /Too few sales to compare\./.test(samLine(nomc).html), "no Market Check for the card: no link, still the engine's first sentence");
ok(!/\+ rowsHtml\(l\)/.test(c), "no grid card lists its sales inline");
ok(/querySelectorAll\('\[data-mc="' \+ x\.getAttribute\("data-for"\) \+ '"\]'\)/.test(c), "closing the panel resets both openers (the link and the action)");
const dr = block("  function drawerHtml(l, j){", "  function openDrawer(btn){");
ok(/var sfc = j && j\.engineAnswer && window\.sellsForCardHtml \? window\.sellsForCardHtml\(j\.engineAnswer, \{\}\) : "";\n\s*if \(sfc\) \{ out\.push\(sfc\); \} else \{/.test(dr) && /else if \(m && m\.soldLine\) out\.push/.test(dr), "the inline panel draws the engine's own card (its line and its sales) and, if that read fails, the card's own line: never blank");
// ---- Item 4c: no big gap under the shorter cards (actions follow the content; each card its own height).
ok(/\.cgrid\{align-items:start\}\n\.cgrid \.car \.acts\{margin-top:0;padding-top:14px\}/.test(css), "the actions follow the card's content; no empty band above them on a short card");
// ---- Item 8b: rail names told apart (wrap up to three lines; the full name as the tooltip; one row per name).
ok(/#gas-rail \.srch,\.vlist \.srch\{white-space:normal;overflow:visible;overflow-wrap:anywhere;text-overflow:clip\}/.test(css) && /title="' \+ esc\(label\) \+ '"/.test(c) && /String\(v\.label \|\| ""\)\.replace\(\/\\s\+\/g, " "\)\.trim\(\)\.toLowerCase\(\) !== key/.test(c), "saved searches show the whole name, wrapping, with the full name as the tooltip, one row per name");
// ---- Item 2 (wiring Lane E's narrowMode): the quiet line for small and middle sets, the panel only for 25 and over.
const ds = block("  function drawSearch(d, typed){", "    lastDraw = d;");
ok(/var mode = \(d\.meta \|\| \{\}\)\.narrow, quiet = !!\(a && !a\.vague && !a\.zipAsk && !d\._showAll && \(mode === "quiet" \|\| mode === "light"\)\);/.test(ds) && /if \(a && !a\.vague && mode === "none"\) a = null;/.test(ds), "the server's mode decides: quiet and light get the quiet line, none gets nothing, question keeps the panel");
ok(/if \(quiet\) block\.insertAdjacentHTML\("beforeend", quietAskHtml\(a, mode\) \+ more\);\n\s*else if \(a && !d\._showAll\) block\.insertAdjacentHTML\("beforeend", askHtml\(a, d\.meta \|\| \{\}, qp\) \+ more\);/.test(ds), "the question panel only when the mode is not quiet or light");
const quietAskHtml = new Function("function esc(s){ return String(s); }\n" + block("  function quietAskHtml(a, mode){", "  function askHtml(a, m, qp){") + "\nreturn quietAskHtml;")();
const qa = { dim: "model", q: "Which model?", chips: [{ label: "911", patch: { model: "911" } }, { label: "Panamera", patch: { model: "Panamera" } }, { label: "930", patch: { model: "930" } }, { label: "Cayman", patch: { model: "Cayman" } }] };
const qh = quietAskHtml(qa, "quiet"), lh = quietAskHtml(qa, "light");
ok(/^<p class="narrowq"[^>]*><span class="nq-t">Want to narrow it\?<\/span>/.test(qh) && (qh.match(/data-askpatch/g) || []).length === 3, "3 to 8 cars: 'Want to narrow it?' with at most three options");
ok(/<span class="nq-t">Which model\?<\/span>/.test(lh) && (lh.match(/data-askpatch/g) || []).length === 4 && !/section class="ask"/.test(lh), "9 to 24: the question's own words with its options as light suggestions, no panel");
ok(!/\(\d/.test(qh) && !/any/i.test(qh.replace(/narrow it/i, "")), "no count and no Any chip on the quiet line");
console.log(`buyStage1cCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
