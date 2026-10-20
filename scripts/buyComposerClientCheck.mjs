// THE BUY COMPOSER, CLIENT (Sam's decision 9, Oct 20 2026; Lane C, on Lane E's server outcome). Every input lands
// somewhere visible: the server's outcome line in one short row above the results; "near me" with no zip: one short line
// with a five-digit box, the cards kept, the zip kept for the visit only and the same words sent again; what Sam can't do
// here: the server's own line; up to three suggestions above the composer that send their words as typed. No network.
//   node scripts/buyComposerClientCheck.mjs     exit 1 on any failure.
import fs from "node:fs";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const s = fs.readFileSync(new URL("../api/buy.js", import.meta.url), "utf8");
const i = s.indexOf("const CLIENT = ") + "const CLIENT = ".length, c = JSON.parse(s.slice(i, s.indexOf('";\n', i) + 1));
const block = (from, to) => { const a = c.indexOf(from), b = c.indexOf(to, a); if (a < 0 || b < 0) throw new Error("missing " + from); return c.slice(a, b); };
const fin = block("    var finish = function(d){", "    fetch(\"/api/buySearch\"");
ok(/drawSuggest\(d && d\.suggest\);/.test(fin), "the suggestions are drawn every turn from the server's own list");
ok(/if \(d && d\.outcome && d\.outcome\.zipAsk\) \{ load\.remove\(\); unstale\(\); return zipAskRow\(d\.outcome\.line, lastU\); \}/.test(fin) && fin.indexOf("zipAskRow") < fin.indexOf("drawSearch(d, lastU)"), "near me with no zip: the ask row, the cards kept (unstale), before any redraw");
ok(/if \(d && d\.outcome && d\.outcome\.kind === "unsupported" && d\.outcome\.line\) reply = d\.outcome\.line;/.test(fin), "what Sam can't do here: the server's own line, never the same cards with no message");
const ds = block("  function drawSearch(d, typed){", "    lastDraw = d;");
ok(/if \(d\.outcome && d\.outcome\.line && !d\._outcomeShown\) \{ d\._outcomeShown = true; block\.insertAdjacentHTML\("afterbegin", '<p class="outcome" role="status">' \+ esc\(d\.outcome\.line\) \+ "<\/p>"\); \}/.test(ds), "the outcome line, once, in one short row above the results");
// The helpers, run on a stub DOM.
const sg = { hidden: true, innerHTML: "" }, bar = { parentNode: { insertBefore() {} } };
const document = { querySelector: q => (q === ".search[role=search]" ? bar : null) };
const $ = id => (id === "sugg" ? sg : null);
const drawSuggest = new Function("document", "$", "function esc(x){ return String(x).replace(/\"/g, '&quot;'); }\n" + block("  function drawSuggest(list){", "  function zipAskRow(") + "\nreturn drawSuggest;")(document, $);
drawSuggest(["only 911", "which have sold before?", "within 100 miles", "a fourth"]);
ok((sg.innerHTML.match(/class="sg" data-send=/g) || []).length === 3 && /data-send="only 911">only 911</.test(sg.innerHTML) && sg.hidden === false, "at most three suggestions, each sends its own words (data-send)");
drawSuggest([]); ok(sg.innerHTML === "" && sg.hidden === true, "none: the row is hidden");
const zr = block("  function zipAskRow(line, words){", "  function searchingBlock(said){");
ok(/<form class="ask-zip" data-zipresend><input name="zip" inputmode="numeric" maxlength="5" pattern="\[0-9\]\{5\}"/.test(zr) && /esc\(line \|\| "Which zip should I use\?"\)/.test(zr), "the zip row: the server's line and a five-digit box");
const sub = block('    var zr = e.target.closest && e.target.closest("[data-zipresend]");', '  document.addEventListener("submit", function(e){\n    var zf');
ok(/if \(!\/\^\\d\{5\}\$\/\.test\(z\)\)/.test(sub) && /setZip\(z\);/.test(sub) && /if \(words\) send\(words\);/.test(sub), "a five-digit zip is kept for the visit (setZip, session storage) and the same words are sent again");
ok(/function setZip\(z\)\{ try \{ sessionStorage\.setItem\("gas_buy_zip", z\); \} catch\(e\)\{\} \}/.test(c) && !/localStorage\.setItem\("gas_buy_zip"/.test(c), "the zip lives for the session only, never stored beyond it");
ok(/drawSuggest\(\[\]\);/.test(block("  function goStart(push){", "  // Re-show a search")), "a new start clears the suggestions");
ok(!/[–—]/.test(zr + block("  function drawSuggest(list){", "  function zipAskRow(")), "no dashes");
console.log(`buyComposerClientCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
