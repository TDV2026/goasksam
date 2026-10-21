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
// Stage 1e item 2 (Sam, Oct 21 2026) replaces Stage 1c item 1: the exact-car history is a chip in the chip row, never lines in the Sam area.
const seen = block("  function histChipHtml(l){", "  // THE ADAPTIVE GRID");
ok(!/Sam has seen this exact car before/.test(c) && /esc\(priorSold\(apps\) \? "Sold before" : "Listed before"\)/.test(seen) && /class="spec hchip" data-hist="' \+ l\.id/.test(seen), "the history is the 'Sold before' / 'Listed before' chip (the Oct 15 rule), opening the popup; no 'Sam has seen this exact car before.' line");
ok(/function slInner\(l\)\{ var line = samLine\(l\); return line \? '<span class="who">Sam<\/span>' \+ line\.html : ""; \}/.test(seen), "the Sam area carries the engine's line only; a card with history and no line has no Sam area");
const card = block("  function card(l, big, eager){", "  // THE ADAPTIVE GRID");
ok(!/class="hrow"/.test(card) && !/data-hist/.test(card) && /\(sl \? '<div class="sl">' \+ sl \+ "<\/div>" : ""\)/.test(card), "no separate history row on the card; the history chip is not in the action row");
ok(/var h = slInner\(l\), sl = tx\.querySelector\("\.sl"\);/.test(c), "a line that arrives later rebuilds the same Sam area");
ok(/priorSold|sold before|listed before/.test(c), "the popup and its Oct 15 heading rule are untouched");
ok(/\.cgrid \.car \.sl \.seen\{/.test(css) && !/[–—]/.test(seen), "styled inside the Sam area; no dashes in the copy");
// ---- Item 4a: the last row left-aligned (five cards: three, then two in the first two columns, on a wide screen).
ok(/@media \(min-width:1100px\)\{\.cgrid\.n5 > article\.car:nth-of-type\(4\)\{grid-column:1\/3\}\.cgrid\.n5 > article\.car:nth-of-type\(5\)\{grid-column:3\/5\}\}/.test(css), "five cards: the last two start in the first column (left-aligned), wide screens only");
// ---- Item 4b: THE COMPACT NO-RANGE CARD.
const thin = { id: 7, market: { kind: "count", query: "1982 Ferrari 512", noCluster: true }, sam_lines: [{ kind: "range", rung: ["512 models, 1981 to 1983"], text: "Sales of cars like it vary too widely to show one range. These are the sales we found." }] };
const tl = (samLine(thin) || {}).html || "";
ok(/<p class="nr-line">Sales of cars like it vary too widely to show one range\.<\/p>/.test(tl) && !/These are the sales we found/.test(tl), "a no-range card prints the engine's line, first sentence only");
// STAGE 1d ITEM 4 (Sam, Oct 20 2026): the thin card's "See the sales in Market Check" link is gone (it sat under the
// card's stretched title link and opened the auction site); the card's own Market Check action opens its panel.
ok(!/mclink|See the sales/.test(tl), "the thin card carries no 'See the sales in Market Check' link (Stage 1d item 4)");
ok(/function compactNoRange\(l, x\)\{[\s\S]*'<p class="nr-scope">' \+ rungHtml\(\{ rungLines: rungShown\(l, x\.rung\) \}\)/.test(c), "the scope label when the engine gives one");
const rg = { id: 8, market: { kind: "range", low: 55000, high: 78000, query: "q" }, sam_lines: [{ kind: "range", rung: [], text: "The middle half of 1M sales landed at $55,000 to $78,000. These are recent." }] };
ok(!/nr-line|mclink/.test((samLine(rg) || {}).html || ""), "a card with a range is not the compact card");
ok(samLine({ id: 9, swap: true, market: { kind: "count" }, sam_lines: [] }) === null, "an engine-swapped card stays as it is");
const nomc = { id: 10, market: { kind: "count", noCluster: true }, sam_lines: [{ kind: "range", rung: [], text: "Too few sales to compare. More words." }] };
ok(!/mclink/.test(samLine(nomc).html) && /Too few sales to compare\./.test(samLine(nomc).html), "no Market Check for the card: no link, still the engine's first sentence");
ok(!/\+ rowsHtml\(l\)/.test(c), "no grid card lists its sales inline");
ok(/querySelectorAll\('\[data-mc="' \+ x\.getAttribute\("data-for"\) \+ '"\]'\)/.test(c), "closing the panel resets both openers (the link and the action)");
const dr = block("  function drawerHtml(l, j){", "  function openDrawer(btn){");
ok(/var head = ea\.basisLine \|\| \(m && m\.basisLine\) \|\| ea\.thinLine \|\| \(m && \(m\.thinLine \|\| m\.soldLine\)\) \|\| "";/.test(dr) && /else if \(m && m\.kind === "range" && m\.low > 0 && m\.high > 0\) out\.push\('<p class="md-s">' \+ usd\(m\.low\)/.test(dr), "the inline panel draws the engine's own line (Stage 1e item 4) and, if that read fails, the card's own line: never blank");
// ---- Item 4c: no big gap under the shorter cards (actions follow the content; each card its own height).
ok(/\.cgrid\{align-items:start\}\n\.cgrid \.car \.acts\{margin-top:0;padding-top:14px\}/.test(css), "the actions follow the card's content; no empty band above them on a short card");
// ---- Item 8b: rail names told apart (wrap up to three lines; the full name as the tooltip; one row per name).
ok(/#gas-rail \.srch,\.vlist \.srch\{white-space:normal;overflow:visible;overflow-wrap:anywhere;text-overflow:clip\}/.test(css) && /title="' \+ esc\(label\) \+ '"/.test(c) && /String\(v\.label \|\| ""\)\.replace\(\/\\s\+\/g, " "\)\.trim\(\)\.toLowerCase\(\) !== key/.test(c), "saved searches show the whole name, wrapping, with the full name as the tooltip, one row per name");
// ---- Item 2 (wiring Lane E's narrowMode): the quiet line for small and middle sets, the panel only for 25 and over.
const ds = block("  function drawSearch(d, typed){", "    lastDraw = d;");
ok(/var mode = \(d\.meta \|\| \{\}\)\.narrow, quiet = !!\(a && !a\.vague && !a\.zipAsk && !d\._showAll && \(mode === "quiet" \|\| mode === "light"\)\);/.test(ds) && /if \(a && !a\.vague && mode === "none"\) a = null;/.test(ds), "the server's mode decides: quiet and light get the quiet line, none gets nothing, question keeps the panel");
ok(/if \(quiet\) block\.insertAdjacentHTML\("beforeend", quietAskHtml\(a, mode\) \+ more\);\n\s*else if \(a && !d\._showAll\) block\.insertAdjacentHTML\("beforeend", askHtml\(a, d\.meta \|\| \{\}, qp\) \+ more\);/.test(ds), "the question panel only when the mode is not quiet or light");
const quietAskHtml = new Function("function esc(s){ return String(s).replace(/\"/g, '&quot;'); }\n" + block("  function quietAskHtml(a, mode){", "  function askHtml(a, m, qp){") + "\nreturn quietAskHtml;")();
const qa = { dim: "model", q: "Which model?", chips: [{ label: "911", patch: { model: "911" } }, { label: "Panamera", patch: { model: "Panamera" } }, { label: "930", patch: { model: "930" } }, { label: "Cayman", patch: { model: "Cayman" } }] };
const qh = quietAskHtml(qa, "quiet"), lh = quietAskHtml(qa, "light");
ok(/^<p class="narrowq"[^>]*><span class="nq-t">Want to narrow it\?<\/span>/.test(qh) && (qh.match(/data-askpatch/g) || []).length === 3, "3 to 8 cars: 'Want to narrow it?' with at most three options");
ok(/<span class="nq-t">Which model\?<\/span>/.test(lh) && (lh.match(/data-askpatch/g) || []).length === 4 && !/section class="ask"/.test(lh), "9 to 24: the question's own words with its options as light suggestions, no panel");
// Stage 1e item 6 (Sam, Oct 21 2026): the light row carries the engine's counts and ends with its Any chip; never cut at four.
const ea = { dim: "generation", q: "Which era?", chips: [{ label: "Air-cooled, to 1998", n: 16, patch: { era: "901,G-Body,964,993" } }, { label: "996", n: 3, patch: { era: "996" } }, { label: "997", n: 1, patch: { era: "997" } }, { label: "991.1", n: 1, patch: { era: "991.1" } }, { label: "991.2", n: 1, patch: { era: "991.2" } }], any: { label: "Any 911", n: 22 } };
const eh = quietAskHtml(ea, "light"), et = eh.replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
ok(et === "Which era?Air-cooled, to 1998 (16)996 (3)997 (1)991.1 (1)991.2 (1)Any 911 (22)", "the era row: each chip with its engine count, all five, ending 'Any 911 (22)' (got " + et + ")");
ok(/data-askany="generation">Any 911 <span class="an">\(22\)<\/span><\/button><\/p>$/.test(eh), "the Any chip clears the question (data-askany), last in the row");
ok(!/\(\d/.test(qh) && !/any/i.test(qh.replace(/narrow it/i, "")), "no count and no Any chip on the quiet line");
// ---- A NOT-TRACKED MARKET (Lane B bb8715f6, Lane F's ask): until the card draws market.notTrackedLine, a card whose
// market is { kind: "not_tracked" } draws only the engine's notTrackedLine: no Market Check (it has no query), no placing, no basis.
const nt = { id: 11, market: { kind: "not_tracked", notTrackedLine: "Sam doesn't track this one." }, sam_lines: [] };
ok(samLine(nt) && samLine(nt).html === '<p class="nt">Sam doesn\'t track this one.</p>', "a not-tracked card draws the engine's own line, verbatim, and nothing else in the Sam area");
ok(samLine({ id: 12, market: { kind: "not_tracked" }, sam_lines: [] }) === null && samLine({ id: 13, swap: true, market: { kind: "not_tracked", notTrackedLine: "x" }, sam_lines: [] }) === null, "no line from the engine (or an engine-swapped card): nothing");
ok(!(nt.market && nt.market.query) && /var hasMc = !l\.swap && !!\(l\.market && l\.market\.query\);/.test(c), "and no Market Check button (the button needs the market's query, which a not-tracked market has none of)");
ok(/var isPend = function\(l\)\{ return l\.market === undefined \|\| \(l\.market && l\.market\.kind === "pending"\); \};/.test(c), "a not-tracked card is not pending, so the page never waits or asks again for it");
console.log(`buyStage1cCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
