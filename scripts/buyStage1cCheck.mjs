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
const sl = block("  function samLine(l){", "  // SPEC CHIPS");
ok(/ls = ls\.filter\(function\(x\)\{ return x\.kind !== "same"; \}\);/.test(sl), "the 'This exact car sold for ...' sentence is not printed on a card");
const env = "function esc(s){ return String(s); } var READING_LINE = 'r'; function rangeFirst(){ return ''; } function rungHtml(){ return ''; } function rungShown(){ return []; } function saleLink(t){ return t; }\n" + sl;
const samLine = new Function(env + "\nreturn samLine;")();
const same = { kind: "same", lead: "This exact car ", link: "sold for $128,000 in February 2023", tail: "." };
ok(samLine({ market: { kind: "range" }, sam_lines: [same] }) === null, "a card whose only line was the exact-car sentence has no line of its own");
ok(!/This exact car/.test((samLine({ market: { kind: "range" }, sam_lines: [{ kind: "range", text: "The middle half ..." }, same] }) || {}).html), "a range card keeps its range line and drops the sentence");
const seen = block("  function seenHtml(l){", "  function card(l, big, eager){");
ok(/esc\("Sam has seen this exact car before\."\) \+ '<\/p><button type="button" class="act hact" data-hist="' \+ l\.id/.test(seen) && /esc\(priorWords\(sameCar\(l\)\)\.button\)/.test(seen), "'Sam has seen this exact car before.' with the history button (its own words: See its earlier sale / See its history) directly under it");
ok(/\(line \|\| hist\) \? '<span class="who">Sam<\/span>' \+ \(line \? line\.html : ""\) \+ rowsHtml\(l\) \+ \(hist \? seenHtml\(l\) : ""\) : ""/.test(seen), "inside the Sam area, after the range block and the rows; a card with history and no line still gets the Sam area");
const card = block("  function card(l, big, eager){", "  // THE ADAPTIVE GRID");
ok(!/class="hrow"/.test(card) && !/data-hist/.test(card) && /\(sl \? '<div class="sl">' \+ sl \+ "<\/div>" : ""\)/.test(card), "no separate history row on the card; the button is not in the action row");
ok(/var h = slInner\(l\), sl = tx\.querySelector\("\.sl"\);/.test(c), "a line that arrives later rebuilds the same Sam area, history included");
ok(/priorSold|sold before|listed before/.test(c), "the popup and its Oct 15 heading rule are untouched");
ok(/\.cgrid \.car \.sl \.seen\{/.test(css) && !/[–—]/.test(seen), "styled inside the Sam area; no dashes in the copy");
// ---- Item 4a: the last row left-aligned (five cards: three, then two in the first two columns, on a wide screen).
ok(/@media \(min-width:1100px\)\{\.cgrid\.n5 > article\.car:nth-of-type\(4\)\{grid-column:1\/3\}\.cgrid\.n5 > article\.car:nth-of-type\(5\)\{grid-column:3\/5\}\}/.test(css), "five cards: the last two start in the first column (left-aligned), wide screens only");
console.log(`buyStage1cCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
