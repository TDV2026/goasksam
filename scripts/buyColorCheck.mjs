// "COLOR" ON BUY (Sam, Oct 20 2026; Lane E): the words a visitor sees spell "color", while the data key stays "colour".
// Offline: the composer's refinement line, the widening chip's label and the text it sends, the model's instruction that
// names that phrase, and meta.unstatedWhat (the page writes "don't state their color" from it). Exits 1 on any break.
//   node scripts/buyColorCheck.mjs
import fs from "node:fs";
import { changedWords } from "../lib/live/samChat.js";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const src = fs.readFileSync("lib/live/samChat.js", "utf8");
ok(changedWords({ make: "Ferrari", colour: "red" }, { make: "Ferrari" }).includes("any color"), "composer: removing the color reads \"any color\"");
ok(changedWords({ make: "Ferrari" }, { make: "Ferrari", colour: "red" }).includes("red cars"), "composer: adding a color reads \"red cars\"");
ok(/label: \(\) => "Any color", send: "Any color"/.test(src), "the widening chip's label and its text read \"Any color\"");
ok(!/"Any colour"|"any colour"/.test(src), "no visitor string spells \"Any colour\" or \"any colour\"");
ok(/unstatedWhat: unstatedWhat === "colour" \? "color"/.test(src), "meta.unstatedWhat sends \"color\" for the colour key");
ok(/colourKey/.test(src) && /"colour"/.test(src), "the data key \"colour\" stays (filters, Tasks, the trace)");
console.log(`buyColorCheck: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
