// THE THREE TYPED CASES (Lane D, Nov 11 2026, Stage 6). A case made from typed year, make and model (the New case form's fields, case_new through the preview door) is read by the engine and carries a typical range, three or more comparables each with a why line,
// the car's name as typed, the assessment at the engine's median (nothing typed) and a four page report. The reads are the engine's own recorded answers (lib/preview/deskRecordedReads.js, made with the ops task deskrungs full=1 on Nov 11 2026, figures posted in docs/lane-notes.md).
// The class (a preview that answers a figure the engine did not read) is held by deskDemoCarCheck.mjs and the mutants in deskDemoFailsWithout.mjs.
//   node scripts/deskTypedCasesCheck.mjs [rootDir]   prints the case ids it made (in memory only: they last as long as the process)
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const U = f => import(pathToFileURL(path.join(ROOT, f)).href);
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) pass++; else { fail++; console.log("FAIL " + n + (d ? " :: " + d : "")); } };
const P = await U("lib/preview/deskPreview.js"), R = await U("lib/preview/deskRecordedReads.js"), RW = await U("lib/reasonWords.js"), notes = fs.readFileSync(path.join(ROOT, "docs/lane-notes.md"), "utf8");
const fmt = n => "$" + Number(n).toLocaleString("en-US");
const CARS = [
  { fields: { year: "1965", make: "Ford", model: "Mustang", body: "Coupe" }, title: "1965 Ford Mustang Coupe" },
  { fields: { year: "1972", make: "Datsun", model: "240Z", body: "Coupe" }, title: "1972 Datsun 240Z Coupe" },
  { fields: { year: "1974", make: "Triumph", model: "TR6", body: "Roadster" }, title: "1974 Triumph TR6 Roadster" }
];
const ids = [];
for (const car of CARS) {
  const r = await P.previewDeskApi({ action: "case_new", ...car.fields, mileage: "60,000", transmission: "Manual" }), c = r.case, k = c && c.desk, ev = k && k.evidence, n = car.title;
  ok(n + ": the case is made and read once, no retry", r.ok === true && r.recalled === true && !r.retry && !!k && !!ev, JSON.stringify(r.retry || r.why || ""));
  if (!ev) continue; ids.push(r.id);
  const rec = R.RECORDED.find(x => x.tier === null && x.spec.year === Number(car.fields.year) && x.spec.model === car.fields.model);
  ok(n + ": the name is the car as typed (engine titleLine)", k.titleLine === car.title, String(k.titleLine));
  ok(n + ": a typical range from the recorded engine read, not a typed figure", ev.insufficient === false && rec && ev.q1 === rec.answer.desk.evidence.q1 && ev.median === rec.answer.desk.evidence.median && ev.q3 === rec.answer.desk.evidence.q3 && ev.count === rec.answer.desk.evidence.count && ev.q1 < ev.median && ev.median < ev.q3);
  ok(n + ": the figures are the ones posted in the lane notes", [ev.q1, ev.q3].every(v => notes.includes(v.toLocaleString("en-US"))) && notes.includes(ev.count + " sales"));
  ok(n + ": the market line is built from that range and count", c.marketLine.includes(fmt(ev.q1) + " to " + fmt(ev.q3)) && c.marketLine.includes(ev.count + " sales"), c.marketLine);
  const cp = k.comparables || [];
  ok(n + ": three or more comparables, each with a why line and its own title", cp.length >= 3 && cp.every(x => x.title && String(x.why || "").trim().length > 3 && /[.]$/.test(x.why)), String(cp.length));
  ok(n + ": the assessment starts at the engine's median and the reserve at the engine's start (source engine)", c.assessment.source === "engine" && c.assessment.figure === ev.median && c.assessment.low === ev.q1 && c.assessment.high === ev.q3 && c.reserve.source === "engine" && c.reserve.figure === k.reserveStart.figure);
  ok(n + ": the reserve check is the engine's (reached count out of the sales)", !!k.reserveCheck && k.reserveCheck.of === ev.count && /sales reached this figure|sale reached this figure/.test(k.reserveCheck.reachedLine));
  ok(n + ": the sales behind the range add up to the count the engine gave", Array.isArray(k.sales) && k.sales.length === ev.count);
  const pdf = await P.previewDeskApi({ action: "case_pdf", id: r.id, draft: true });
  ok(n + ": the draft report builds with four pages", pdf.ok === true && pdf.pages === 4 && !!pdf.pdf_b64, String(pdf.why || pdf.pages));
}
ok("three cases were made, each with its own id", ids.length === 3 && new Set(ids).size === 3);
ok("the recorded reads in the code are the ones the lane notes post as read (the date of the read)", notes.includes("HEAVY STEP DONE (Lane D, Nov 11 2026") && R.RECORDED_ON === "2026-11-11");
console.log("CASE IDS " + ids.join(" "));
console.log(`deskTypedCasesCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
