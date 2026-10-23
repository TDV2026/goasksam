// LEFTOVER WORDS + MILEAGE NOTE, the page half (Sam's Oct 23 2026 orders; Lane C): the engine's unusedLine prints under the search on
// One Box (Market Check and Sell) and under Buy's header, exactly as sent and only when sent; the engine's mileageNote prints in the
// hero-miles slot instead of "Range narrowed around N miles." and the old sentence stays when there is no note. Static reads of the
// shipped code plus the real helpers run in a vm. No network.   node scripts/leftoverPageCheck.mjs   (from the repo root)
import fs from "node:fs";
import vm from "node:vm";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const ob = fs.readFileSync(new URL("../public/js/onebox.js", import.meta.url), "utf8");
const buy = fs.readFileSync(new URL("../api/buy.js", import.meta.url), "utf8");
const a = ob.indexOf("  function unusedLineHtml(d)"), b = ob.indexOf("\n  }\n", a) + 4;
const ctx = vm.createContext({ esc: s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;") }); vm.runInContext(ob.slice(a, b) + "\nthis.f = unusedLineHtml;", ctx);
const line = "Sam didn't use 'xyz' in this search.";
ok(ctx.f({ unusedLine: line }) === '<p class="unused-line" role="note">Sam didn&#39;t use \'xyz\' in this search.</p>'.replace("&#39;", "'"), "One Box prints the engine's line exactly as sent");
ok(ctx.f({}) === "" && ctx.f(null) === "", "nothing sent, nothing printed");
ok(/inboxHtml\(lastQuery, "Your car or its VIN"\) \+ unusedLineHtml\(d\) \+ head/.test(ob), "the line sits under the search box, before the car line");
ok(/var mnote = d && d\.mileageNote \? String\(d\.mileageNote\) : "";/.test(ob) && /esc\(mnote \|\| \("Range narrowed around " \+ val \+ " miles\."\)\)/.test(ob), "mileageNote prints in the hero-miles slot; the old sentence stays when there is none");
const c = JSON.parse(/^const CLIENT = (".*");$/m.exec(buy)[1]);
ok(/var uw = \(d\.meta \|\| \{\}\)\.unusedLine; if \(uw\) block\.insertAdjacentHTML\("beforeend", '<p class="unusedl" role="note">' \+ esc\(uw\) \+ "<\/p>"\);/.test(c), "Buy prints meta.unusedLine under the header");
const sc = fs.readFileSync(new URL("../lib/live/samChat.js", import.meta.url), "utf8");
ok(/ctx\.searchMeta = \{ unusedLine: unusedFor\.line,/.test(sc) && /unusedWordsOf\(lu, v, null\)/.test(sc), "the engine reads the typed message and puts unusedLine into Buy's searchMeta");
ok(!/["`]Sam didn't use/.test(ob) && !/["`]Sam didn't use/.test(c), "the page never words the line itself");
console.log(`leftoverPageCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
