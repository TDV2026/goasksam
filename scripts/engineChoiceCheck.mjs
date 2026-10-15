// THE APPLIED CHOICE (Lane C, Oct 15 2026): a Task from a Buy page, and its email's car line, name the body the engine
// applied (resolvedCar), never the chip's label. Pure: no network (appliedChoice itself reads the engine live).
import fs from "node:fs";
import { choiceWords, choiceRefine, withChoice } from "../lib/tasks/engineChoice.js";
let passes = 0, fails = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.log("FAIL " + m); } };
ok(choiceWords({ make: "Porsche", model: "911", year_min: 2005, year_max: 2005, body: "Coupe" }) === "2005 Porsche 911" && choiceWords({ make: "Porsche", model: "911", year_min: 1999, year_max: 2004 }) === "Porsche 911", "the engine reads the page's car: one typed year, make, model");
ok(JSON.stringify(choiceRefine({ body: "Coupe" })) === '{"body":"coupe"}' && choiceRefine({ trim: "Carrera S" }) === null && choiceRefine({}) === null, "the page's body chip is the refine; a typed trim is not");
ok(withChoice({ make: "Porsche", body: "Coupe" }, { body: "coupe" }).body === "coupe" && withChoice({ make: "Ford", body: "Coupe" }, { body: "fastback" }).body === "fastback", "the body the engine applied replaces the chip's label");
ok(withChoice({ make: "Porsche", body: "Coupe" }, { body: null }).body === "Coupe" && withChoice({ make: "Porsche" }, { body: "coupe" }).body === undefined && withChoice({ make: "Porsche", body: "Coupe" }, null).body === "Coupe", "nothing applied: the page's filters stay as they were, never widened, never added to");
const t = fs.readFileSync(new URL("../lib/tasks/tasks.js", import.meta.url), "utf8");
ok(/buyJob\(withChoice\(seedIn\.filters, await appliedChoice\(env, seedIn\.filters\)/.test(t) && /applied = await appliedChoice\(env, filters\)\.catch\(\(\) => null\); job = buyJob\(withChoice\(filters, applied\)\)/.test(t), "the Task from Buy and the email preview both read the applied choice");
console.log(`engineChoiceCheck: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
