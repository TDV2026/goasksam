// A CHIP FOR EVERY MODEL (Sam's Buy Stage 1d item 2; Lane E, Oct 20 2026), offline: lib/live/samChat.js partitionModels and
// lib/live/narrow.js askRule on a seeded make-only Porsche result set with seven models, one of them a single 2016 Cayman.
// Every model with a car gets a chip, the counts partition the results (each car once; they add up to the result count
// less the cars whose model cannot be read), "Any Porsche" stays last, and when the spec reads are slow the listing rows'
// own models (a 997 counted as a 911) still give the chips. Nothing is computed on the page. Exits 1 on any failure.
//   node scripts/modelChipsCheck.mjs
import { partitionModels, parentModelOf } from "../lib/live/samChat.js";
import { askRule } from "../lib/live/narrow.js";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const MIX = [["911", 14], ["Boxster", 6], ["912", 4], ["914", 4], ["Cayenne", 3], ["Panamera", 2], ["Cayman", 1]];
const rows = [], specs = [];
for (const [m, n] of MIX) for (let i = 0; i < n; i++) { rows.push({ make: "Porsche", model: m === "911" ? (i % 2 ? "997" : "911") : m, listing_title: `Porsche ${m} ${i}` }); specs.push({ v: { make: "Porsche", model: m, parentModel: m } }); }
rows.push({ make: "Porsche", model: null, listing_title: "Porsche project car" }); specs.push(null);   // one car whose model cannot be read
const N = rows.length;
const { chips, unread } = partitionModels(rows, specs);
ok(chips.length === 7, `every model with a car gets a chip: ${chips.length} chips (7 models)`);
ok(chips.some(c => c.label === "Cayman" && c.n === 1), "the single 2016 Cayman has its own chip, not hidden in a leftover line");
ok(chips.reduce((a, c) => a + c.n, 0) + unread === N, `the counts partition the results: ${chips.reduce((a, c) => a + c.n, 0)} + ${unread} unread = ${N}`);
ok(chips.map(c => c.label).join(",") === "911,Boxster,912,914,Cayenne,Panamera,Cayman", `ordered by count, then name: ${chips.map(c => c.label + " " + c.n).join(", ")}`);
ok(chips.every(c => c.patch && c.patch.model === c.label), "each chip's tap sends that model");
// The engine's question for this set (askRule), with these chips.
const xs = rows.map(r => ({ r, facts: { body: null, gearbox: null, miles: null } }));
const asks = askRule(xs, { p: { make: "Porsche" }, v: { make: "Porsche" }, models: chips });
const q = asks.find(a => a.dim === "model");
ok(q && q.chips.length === 7, `the model question offers all ${q ? q.chips.length : 0} chips`);
ok(q && q.any && q.any.label === "Any Porsche" && q.any.n === N, `"Any Porsche" is the last choice, with the whole count (${q && q.any && q.any.n})`);
ok(q && q.unstated === unread && q.unstatedWhat === "don't say which model", `the leftover line counts only the unread car: ${q && q.unstated} "${q && q.unstatedWhat}"`);
// Slow spec reads: the rows' own models still give the chips (a 997 counts as a 911).
const slow = partitionModels(rows, null);
ok(slow.chips.find(c => c.label === "911").n === 14 && slow.chips.length === 7, `slow reads: the rows' own models give the same 7 chips (911 ${slow.chips.find(c => c.label === "911").n})`);
ok(parentModelOf("Porsche", "997") === "911" && parentModelOf("Porsche", "Cayman") === "Cayman", "a chassis code maps to its parent model; a model name stays itself");
// Seeded violation: a cap of six would hide the Cayman.
ok(partitionModels(rows, specs).chips.slice(0, 6).every(c => c.label !== "Cayman"), "seeded violation: a top-six cap WOULD hide the Cayman (so this check bites)");
console.log(`modelChipsCheck: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
