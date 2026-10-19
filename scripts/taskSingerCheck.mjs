// A SINGER CAR IS NEVER COMPARED IN A TASK EMAIL (Sam's Singer rule, e68; Lane C, Oct 19 2026). The Task keeps the Singer
// mark from the buyer's own words (builder: "Singer", by the engine's isSingerPorsche), its row's title carries it, and
// every Task market read for it is the engine's builder answer: BUILDER_CAR_LINE, with no read, range, count or list. A
// plain 1992 Carrera 4 Task is unchanged. No network.
//   node scripts/taskSingerCheck.mjs     exit 1 on any failure.
import fs from "node:fs";
import { validateJob, builderOf, builderMarket, taskRow, blockLines, setupQuestion } from "../lib/tasks/tasks.js";
import { BUILDER_CAR_LINE } from "../lib/onebox.js";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const SAM = "Singer cars are not compared with standard 911s, so Sam shows no range for this car.";
ok(BUILDER_CAR_LINE === SAM, "the engine's line is Sam's approved wording");
// The mark, from the buyer's own words, on a Porsche only.
ok(builderOf("1992 Porsche 911 Carrera 4 by Singer", "Porsche") === "Singer" && builderOf("Reimagined by Singer 911", "Porsche") === "Singer", "Singer words on a Porsche: the mark");
ok(builderOf("1992 Porsche 911 Carrera 4", "Porsche") === null && builderOf("1958 Singer Gazelle", "Singer") === null, "no mark: plain words, or the British Singer make");
ok(validateJob("hunt", { make: "Porsche", model: "911", trim: "Carrera 4", year_min: 1992, builder: "singer" }).filters.builder === "Singer", "validateJob keeps the mark on a Porsche");
ok(!("builder" in validateJob("hunt", { make: "Ford", model: "Mustang", builder: "Singer" }).filters) && !("builder" in validateJob("hunt", { make: "Porsche", model: "911", builder: "Gunther" }).filters), "validateJob drops any other builder, or Singer on another make");
// The row's title carries the mark; a plain row is unchanged.
const F = { make: "Porsche", model: "911", trim: "Carrera 4", year_min: 1992, year_max: 1992 };
ok(taskRow({ ...F, builder: "Singer" }, 1992).listing_title === "1992 Porsche 911 Carrera 4 by Singer", "the Singer Task's row carries the mark");
ok(taskRow(F, 1992).listing_title === "1992 Porsche 911 Carrera 4", "a plain Task's row is unchanged");
// The market for it: the engine's builder answer, no read.
const bm = builderMarket("1992 Porsche 911 Carrera 4 by Singer", "Porsche");
ok(bm && bm.builderLine === SAM && bm.low == null && bm.high == null && bm.count == null, "the Singer market: the engine's line, no range or count");
ok(builderMarket("1992 Porsche 911 Carrera 4", "Porsche") === null, "a plain car: no builder market (the engine reads it as before)");
// The email block: the bid and the engine's line only.
const b = blockLines(bm, 600000, " as of 3pm", "Current bid $600,000 as of 3pm.");
ok(b.rangeLine === null && JSON.stringify(b.lines) === JSON.stringify(["Current bid $600,000 as of 3pm.", SAM]), "Singer email block: the bid, then the engine's line, nothing else");
ok(!b.lines.join(" ").match(/\$\d[\d,]* to \$|\bsales\b|of recent sales/), "Singer email block: no range, count or placing");
// A plain range answer: unchanged (placed against the range as before).
const plain = blockLines({ kind: "range", low: 91500, high: 131000, count: 30, bodyScoped: true }, 120000, " as of 3pm", "Current bid $120,000 as of 3pm.");
ok(plain.rangeLine && /Current bid \$120,000 as of 3pm, .* of recent sales\./.test(plain.rangeLine), "a plain 1992 Carrera 4 block: unchanged, placed against the range");
// Setup asks nothing else for a Singer Task, and reads nothing.
let reads = 0;
ok((await setupQuestion({}, { ...F, builder: "Singer" }, async () => { reads++; return null; })) === null && reads === 0, "setup: a Singer Task asks nothing else and reads nothing");
// The preview and the per-listing alert answer before any read.
const src = fs.readFileSync(new URL("../lib/tasks/tasks.js", import.meta.url), "utf8");
const ep = src.slice(src.indexOf("export async function emailPreview("));
ok(ep.indexOf("builderMarket(row.listing_title, f.make)") > 0 && ep.indexOf("builderMarket(row.listing_title, f.make)") < ep.indexOf("specOf(env, row"), "email preview: the builder answer before the spec or the stored line is read");
ok(/builderMarket\(r\.listing_title, r\.make\) \|\| await listingMarket\(env, r, listingFacts\(r\)\)/.test(src), "per-listing alert: a listing whose words carry the mark gets the builder answer, no read");
console.log(`taskSingerCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
