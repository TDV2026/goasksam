// SAVED SEARCH NAMES (Sam's order 4, Oct 21 2026; Lane C): "Your searches" names a search by the chips as shown ('white Porsche near
// 90210'), never 'within 150 miles of California' (the header's sentence, built from the engine's radius). The page's real searchLabel
// is rendered with the radius the engine sends and with none. No network.   node scripts/savedNameCheck.mjs   (from the repo root)
import fs from "node:fs";
import vm from "node:vm";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const page = fs.readFileSync(new URL("../api/buy.js", import.meta.url), "utf8");
const c = JSON.parse(/^const CLIENT = (".*");$/m.exec(page)[1]);
const grab = (from, to) => { const a = c.indexOf(from), b = c.indexOf(to, a); if (a < 0 || b < 0) throw new Error("missing " + from); return c.slice(a, b); };
const env = "function usd(n){ return '$' + Math.round(Number(n)).toLocaleString('en-US'); } function num(n){ return Number(n).toLocaleString('en-US'); } function band(a,b,fn){ return fn(a) + ' to ' + fn(b); } function eraWords(){ return ''; } function genWord(x){ return x; } function pluralWord(x){ return x + 's'; }\n" + grab("function searchLabel(", "\n  function ") + "\nwindow.__label = searchLabel;";
const ctx = vm.createContext({ window: {}, Number, String, Array, Object, Math, RegExp }); vm.runInContext(env, ctx);
const L = ctx.window.__label;
const f = { make: "Porsche", colour: "White", location: "90210" };
ok(L(f, "Beverly Hills, CA", false, 0) === "white Porsche near 90210", "the saved name: 'white Porsche near 90210' (" + L(f, "Beverly Hills, CA", false, 0) + ")");
ok(L({ make: "Porsche", colour: "White", location: "California" }, "California", false, 0) === "white Porsche near California", "a typed place: 'white Porsche near California', no radius sentence");
ok(/within 150 miles of 90210/.test(L(f, "Beverly Hills, CA", false, 150)), "the header's own line keeps the engine's radius (unchanged), which is what the rail no longer uses");
ok(/setAddress\(d, q, block, \(!named && typed\) \? typed : \(searchLabel\(f, place, false, 0\) \|\| typed\)\);/.test(c), "the rail label is built with no radius");
ok(/addVisit\(url, railQ \|\| q \|\| conv\.title, /.test(c), "the visit (rail and saved list) takes the rail label");
console.log(`savedNameCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
