// THE SEARCHING LINE (Sam's decision 10, Oct 20 2026; Lane C). While Buy reads the live market, the waiting line cycles the
// sixteen sites the live read uses in Sam's form, one constant ("Sam is searching {site} for your car"); it stops the moment
// the answer is here (never delays the results); no count, no ticks, nothing per site; past 20 s the still-finding line.
// Runs the client's own searchingBlock on a fake clock. No network.
//   node scripts/buySearchLineCycleCheck.mjs     exit 1 on any failure.
import fs from "node:fs";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const s = fs.readFileSync(new URL("../api/buy.js", import.meta.url), "utf8");
const i = s.indexOf("const CLIENT = ") + "const CLIENT = ".length, c = JSON.parse(s.slice(i, s.indexOf('";\n', i) + 1));
const block = (from, to) => { const a = c.indexOf(from), b = c.indexOf(to, a); if (a < 0 || b < 0) throw new Error("missing " + from); return c.slice(a, b); };
const SIXTEEN = ["Bring a Trailer", "Car & Classic", "Collecting Cars", "RM Sotheby's", "Mecum", "Gooding & Co", "Cars & Bids", "All Collector Cars", "Hemmings", "Hagerty", "PistonHeads", "PCAR Market", "Sotheby's Motorsport", "The Market", "MB Market", "Bonhams"];
ok(c.includes(`var LIVE_SITES = ${JSON.stringify(SIXTEEN).replace(/","/g, '", "')};`), "the sixteen sites of the live read, in Sam's order");
ok(!/AutoHunter/i.test(block("  var SEARCH_LINE = ", "  function searchingBlock(said){")), "no AutoHunter");
ok((c.match(/Sam is searching \{site\} for your car/g) || []).length === 1 && !/Sam is searching [A-Z]/.test(c), "Sam's phrase is ONE constant, never written out per site");
// Run it: a fake DOM and a fake clock.
let now = 0; const timers = [];
const setInterval = (f, ms) => { const t = { f, ms, next: now + ms, every: true }; timers.push(t); return t; };
const setTimeout = (f, ms) => { const t = { f, ms, next: now + ms, every: false }; timers.push(t); return t; };
const clearInterval = t => { const k = timers.indexOf(t); if (k >= 0) timers.splice(k, 1); }, clearTimeout = clearInterval;
const tick = ms => { const end = now + ms; for (;;) { const due = timers.filter(t => t.next <= end).sort((a, b) => a.next - b.next)[0]; if (!due) break; now = due.next; if (due.every) due.next += due.ms; else clearTimeout(due); due.f(); } now = end; };
const st = { textContent: "" };
const document = { createElement: () => ({ setAttribute() {}, set innerHTML(v) {}, querySelector: q => (q === ".sq-st" ? st : null) }) };
const env = "function esc(x){ return String(x); } function skeletonHtml(){ return ''; } function stillFindingLine(l){ return 'Sam is still finding the sales for ' + l + '. Try again in a minute.'; }\n" + block("  var SEARCH_LINE = ", "  // The answer is here");
const searchingBlock = new Function("document", "setInterval", "setTimeout", "clearInterval", "clearTimeout", env + "\nreturn searchingBlock;")(document, setInterval, setTimeout, clearInterval, clearTimeout);
const el = searchingBlock("black manual Porsche");
const seen = [st.textContent];
for (let k = 0; k < 15; k++) { tick(1100); seen.push(st.textContent); }
ok(seen[0] === "Sam is searching Bring a Trailer for your car" && seen[1] === "Sam is searching Car & Classic for your car", "it starts at once with the first site and moves on one name at a time");
ok(seen.length === 16 && seen.every((x, k) => x === "Sam is searching " + SIXTEEN[k] + " for your car"), "all sixteen, each in Sam's form");
ok(seen.every(x => !/\d|✓|no cars|nothing|none/i.test(x)), "no count, no ticks, never a claim a site had no cars");
// The answer arrives: the line stops at once, nothing keeps cycling.
el.stop(); const at = st.textContent; tick(10000);
ok(st.textContent === at && timers.length === 0, "the moment the answer is here it stops; no timer left (never delays the results)");
// A slow read: past 20 s the still-finding line takes over and the cycle stops.
const el2 = searchingBlock("red Ferrari"); el2.name("red Ferraris"); tick(20000);
ok(/^Sam is still finding the sales for red Ferraris\./.test(st.textContent), "past 20 s: the still-finding line");
tick(5000); ok(/^Sam is still finding/.test(st.textContent), "and the cycle does not overwrite it");
el2.stop(); ok(timers.length === 0, "and stopping clears everything");
const sb = block("  function searchingBlock(said){", "  // The answer is here");
ok(!/[\u2013\u2014]/.test(block("  var SEARCH_LINE = ", "  function searchingBlock(said){")), "no dashes");
ok(/el\.stop = function\(\)\{ clearInterval\(t\); clearTimeout\(t2\); \};/.test(sb), "stop clears the cycle");
console.log(`buySearchLineCycleCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
