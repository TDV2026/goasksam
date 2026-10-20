// "COLOR", NOT "COLOUR", WHERE A VISITOR READS IT (Sam, Oct 20 2026, his answer 5): every visitor-visible Buy string
// (buttons, the unstated line, the example band, aria labels, How Sam decides, the Task update instructions) spells it
// "color". Code identifiers (colourKey, f.colours, "colour" keys) stay. No network.
//   node scripts/buyColorSpellingCheck.mjs     exit 1 on any failure.
import fs from "node:fs";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const src = f => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");
const buy = src("api/buy.js");
ok(/anycolour: \\"Any color\\"/.test(buy) && !/\\"Any colour\\"/.test(buy), "Buy: the widening button reads 'Any color'");
ok(/colour: \\"their color\\"/.test(buy) && !/\\"their colour\\"/.test(buy), "Buy: the unstated line reads 'don't say their color'");
ok(/out\.push\("any color"\)/.test(src("lib/live/buyExample.js")), "Buy example band: 'any color'");
ok(/aria-label="Color palette"/.test(src("lib/appShell.js")), "the palette bar's aria label: 'Color palette'");
ok(/does not state its color, gearbox/.test(src("api/howSamDecides.js")), "How Sam decides (Buy): 'its color'");
ok((src("lib/tasks/tasks.js").match(/color and gearbox if known/g) || []).length === 2 && !/colour and gearbox if known/.test(src("lib/tasks/tasks.js")), "Task updates: the instructions say 'color'");
// Any sentence-like string in the Buy client (a quoted run with a space in it, comments left out) that still says "colour".
const m = /^const CLIENT = (".*");$/m.exec(buy), client = m ? JSON.parse(m[1]) : "";
const code = client.split("\n").filter(l => !/^\s*\/\//.test(l)).join("\n");
const lits = (code.match(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g) || []).filter(l => / /.test(l) && /\bcolours?\b/i.test(l));
ok(client.length > 1000, "the Buy client was read");
ok(lits.length === 0, "Buy client: no visible string still says 'colour' " + JSON.stringify(lits.slice(0, 3)));
console.log(`buyColorSpellingCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
