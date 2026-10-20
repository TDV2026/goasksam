// THE NARROWING QUESTION (Lane E, Oct 20 2026; Sam's Buy Stage 1c item 2): lib/live/narrow.js on fixed sets, no network.
// narrowMode by car count (0 to 2 none, 3 to 8 quiet, 9 to 24 light, 25 and over the question), and the hierarchy:
// when a model question qualifies it comes before body, even when body would remove more cars. Exits 1 on any break.
//   node scripts/narrowCheck.mjs
import { askRule, narrowMode } from "../lib/live/narrow.js";
let failed = 0;
const check = (name, ok, got) => { if (!ok) failed++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  (got " + JSON.stringify(got) + ")"}`); };
for (const [n, want] of [[0, "none"], [1, "none"], [2, "none"], [3, "quiet"], [5, "quiet"], [8, "quiet"], [9, "light"], [24, "light"], [25, "question"], [90, "question"]]) check(`narrowMode(${n}) is ${want}`, narrowMode(n) === want, narrowMode(n));
// 12 Porsches: 6 911s, 4 Panameras, 2 930s; bodies 4 coupe, 4 sedan, 4 cabriolet (body removes more cars than model).
const car = (model, body) => ({ r: { listing_title: `Porsche ${model}`, model }, facts: { body, gearbox: null, miles: null } });
const xs = [];
for (let i = 0; i < 6; i++) xs.push(car("911", i < 2 ? "coupe" : i < 4 ? "cabriolet" : "coupe"));
for (let i = 0; i < 4; i++) xs.push(car("Panamera", "sedan"));
for (let i = 0; i < 2; i++) xs.push(car("930", "cabriolet"));
const models = [{ label: "911", n: 6, patch: { model: "911" } }, { label: "Panamera", n: 4, patch: { model: "Panamera" } }, { label: "930", n: 2, patch: { model: "930" } }];
const asks = askRule(xs, { p: { make: "Porsche" }, v: { make: "Porsche" }, models });
check("a qualifying model question comes first (model before body)", asks[0] && asks[0].dim === "model", asks.map(a => a.dim));
check("the model chips are the models as given (911, Panamera, 930)", asks[0] && asks[0].chips.map(c => c.label).join(",") === "911,Panamera,930", asks[0] && asks[0].chips.map(c => c.label));
const noModel = askRule(xs, { p: { make: "Porsche", model: "911" }, v: { make: "Porsche", model: "911" } });
check("with the model fixed, no model question", !noModel.some(a => a.dim === "model"), noModel.map(a => a.dim));
console.log(failed ? `narrowCheck: ${failed} FAIL` : "narrowCheck: all pass");
process.exit(failed ? 1 : 0);
