// PLACE NAMES (Sam, Oct 23 2026): "King Of Prussia" is "King of Prussia" on every product (Find's cards, Tasks, the task emails): one rule,
// lib/placeCase.js. Shouting places go to title case; small words inside a name stay lower case; state codes and ordinary names are untouched. No network.
import { placeCase } from "../lib/placeCase.js";
import fs from "node:fs";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const T = [["King Of Prussia, PA", "King of Prussia, PA"], ["KING OF PRUSSIA, PA", "King of Prussia, PA"], ["Isle Of Wight, UK", "Isle of Wight, UK"], ["SAINT LOUIS, MO", "Saint Louis, MO"], ["LA JOLLA, CA", "La Jolla, CA"], ["WINSTON-SALEM, NC", "Winston-Salem, NC"],
  ["The Villages, FL", "The Villages, FL"], ["Las Vegas, NV", "Las Vegas, NV"], ["Los Angeles, California", "Los Angeles, California"], ["Rancho Santa Margarita, CA", "Rancho Santa Margarita, CA"], ["Denver", "Denver"], ["", ""], ["Wilkes-Barre, PA", "Wilkes-Barre, PA"], ["Stratford Upon Avon, UK", "Stratford upon Avon, UK"], ["Rancho Del Mar, CA", "Rancho Del Mar, CA"]];
for (const [a, b] of T) ok(placeCase(a) === b, `${JSON.stringify(a)} -> ${JSON.stringify(placeCase(a))} (want ${JSON.stringify(b)})`);
const bs = fs.readFileSync(new URL("../api/buySearch.js", import.meta.url), "utf8"), tk = fs.readFileSync(new URL("../lib/tasks/tasks.js", import.meta.url), "utf8");
ok(/const titleCaseIfShouting = placeCase;/.test(bs) && /location: titleCaseIfShouting\(r\.location\)/.test(bs), "Find's cards use the one place rule");
ok(/location: placeCase\(r\.location\) \|\| null, house:/.test(tk), "Tasks cards (and so the task emails) use the one place rule");
console.log(`placeCaseCheck: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
