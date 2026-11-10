// Each mutation breaks one served shape on a scratch copy; scripts/deskShapesCheck.mjs must go red on every one.
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { execFileSync } from "node:child_process"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const MUT = [
  ["the market line counts the matching sales, not the population of the case", "lib/desk/reportState.js", s => s.replace('sales: countNoun(ev.count, "sale", { words: false }), date: shortDate(ev.asOf) })', 'sales: countNoun(ev.matching, "sale", { words: false }), date: shortDate(ev.asOf) })')],
  ["the stored read is kept under a stale key (the case's tier is left out of the key)", "lib/desk/caseWorkflow.js", s => s.replace("c.condition.selected ? c.condition.selected.tier : null, c.exclusions", "null, c.exclusions")],
  ["the assessment is not seeded from the engine's median", "lib/desk/caseWorkflow.js", s => s.replace("return seedReserve(seedAssessment(c, iso(now)), iso(now));", "return seedReserve(c, iso(now));")],
  ["a seeded assessment is not marked source engine", "lib/desk/caseWorkflow.js", s => s.replace("source: ok ? \"engine\" : null };", "source: null };")],
  ["the seeded assessment writes no audit line", "lib/desk/caseWorkflow.js", s => s.replace("  logAudit(c, { at: iso(now), by: \"engine\", what: ok ?", "  void ({ at: iso(now), by: \"engine\", what: ok ?")],
  ["the analyst's change leaves the source engine", "lib/desk/caseWorkflow.js", s => s.replace("a.explanation, source: \"analyst\" };", "a.explanation, source: a.source };")],
  ["a later read overwrites the analyst's figure", "lib/desk/caseWorkflow.js", s => s.replace("if (a.source === \"analyst\" || (a.source !== \"engine\" && a.figure != null)) return c0;", "")],
  ["an engine figure survives a read with too few sales", "lib/desk/caseWorkflow.js", s => s.replace("const next = ok ? { figure: ev.median, low: ev.q1, high: ev.q3 } : { figure: null, low: null, high: null };", "if (!ok) return c0; const next = { figure: ev.median, low: ev.q1, high: ev.q3 };")],
  ["the case view carries no marketLine", "lib/desk/caseView.js", s => s.replace(" marketLine: rs.marketLine,", "")],
  ["the market line drops the stale sentence", "lib/desk/reportState.js", s => s.replace("ev.stale && ev.stale.flag ? ev.stale.sentence : null", "null")],
  ["the market line shows the wrong date format", "lib/desk/reportState.js", s => s.replace("date: shortDate(ev.asOf) }", "date: longDate(ev.asOf) }")],
  ["case_new answers no recalled flag", "lib/desk/sheetActions.js", s => s.replace("return { ok: true, id: sheet.id, recalled, ", "return { ok: true, id: sheet.id, ")],
  ["a photo item carries no width and height", "lib/desk/caseView.js", s => s.replace(", width: have.get(p.id).width || null, height: have.get(p.id).height || null", "")],
  ["case_new answers no sheet summary", "lib/desk/sheetActions.js", s => s.replace(", sheet: summaryOf(sheet, ctx.nowMs) };\n  }\n  if (action === \"case_edit\")", " };\n  }\n  if (action === \"case_edit\")")],
  ["the seller block carries no email key", "lib/desk/caseModel.js", s => s.replace("email: str(seller.email, 160) || null, ...(seller.asking", "...(seller.asking")],
  ["the review stage is named in_review", "lib/desk/caseModel.js", s => s.replace('in_review: "review"', 'in_review: "in_review"')],
  ["the final stage is named finalized", "lib/desk/caseModel.js", s => s.replace('finalized: "final" }', 'finalized: "finalized" }')],
  ["a finalized case is counted as ready", "lib/desk/caseView.js", s => s.replace('STAGE_OF[c.status] || "new"', '(c.status === "finalized" ? "ready" : STAGE_OF[c.status]) || "new"')],
  ["the queue counts are not sent with the case", "lib/desk/caseView.js", s => s.replace("queue: queueCounts(allSheets, now), ", "")],
  ["the median handling time is the first value, not the median", "lib/desk/caseView.js", s => s.replace("n % 2 ? a[(n - 1) / 2] : Math.round((a[n / 2 - 1] + a[n / 2]) / 2)", "a[0]")],
  ["the share needing more divides by zero", "lib/desk/caseView.js", s => s.replace('leads.length ? `${Math.round((more.length / leads.length) * 100)}%` : "none yet"', '`${Math.round((more.length / leads.length) * 100)}%`')],
  ["a revision is counted before the report was finalized", "lib/desk/caseView.js", s => s.replace("c.finalized_at && c.version > 1", "c.version > 1")],
  ["a label is renamed", "lib/desk/caseView.js", s => s.replace("Reports finalized today", "Done today")],
  ["finalized today counts any day", "lib/desk/caseView.js", s => s.replace("String(c.finalized_at).slice(0, 10) === today", "true")],
  ["case_edit has no cover op", "lib/desk/sheetActions.js", s => s.replace('else if (op === "cover")', 'else if (op === "cover_x")')],
  ["a cover change is not logged", "lib/desk/caseWorkflow.js", s => s.replace('logAudit(c, { at: iso(now), by: "analyst", what: "cover set", field: "photos", to: id }); return c; }', 'return c; }')],
  ["the report selection can drop the cover", "lib/desk/caseModel.js", s => s.replace("if (c.photos.coverId && !c.photos.reportIds.includes(c.photos.coverId)) c.photos.reportIds.unshift(c.photos.coverId); return c; }", "return c; }")],
  ["a photo added through the case is not on the sheet's submission", "lib/desk/sheetActions.js", s => s.replace("s0 = { ...s0, submission: { ...s0.submission, photos: [...(s0.submission.photos || []), ph] },", "s0 = { ...s0, submission: { ...s0.submission },")],
  ["photo_add takes a file that is not a photo", "lib/desk/sheetActions.js", s => s.replace('if (!(isJpg || isPng || isWebp)) return { refuse: "That file is not a photo (JPG, PNG or WebP)." };', "").replace('else if (!isJpg) return { refuse: "This session takes JPG photos only." };', "")],
  ["photo_add re-calls the engine", "lib/desk/caseWorkflow.js", s => s.replace("c.fields.mileage.value, c.fields.transmission.value", "c.fields.mileage.value, c.photos.items.length, c.fields.transmission.value")],
  ["caseView sends no difference line", "lib/desk/caseView.js", s => s.replace("assessment: { ...c.assessment, differenceLine: rs.differenceLine }", "assessment: { ...c.assessment }")],
  ["caseView sends no position line", "lib/desk/caseView.js", s => s.replace("positionLine: rs.reservePositionLine, ", "")],
  ["caseView sends no mileage line", "lib/desk/caseView.js", s => s.replace("vehicle: { mileageLine: rs.mileageWords, submittedLine: submittedLine(c) }", "vehicle: { submittedLine: submittedLine(c) }")],
  ["caseView sends no received line", "lib/desk/caseView.js", s => s.replace("submittedLine: submittedLine(c) }", "}")],
  ["the received line is typed in caseView", "lib/desk/caseView.js", s => s.replace("reasonLine(\"case.vehicle.received\", { date: d })", "\"Received \" + d + \".\"")],
  ["a blank case gets blank text instead of null", "lib/desk/reportState.js", s => s.replace("out.mileageWords = m.value == null ? null :", 'out.mileageWords = m.value == null ? "" :')],
  ["the demonstration case is a different lead", "lib/desk/caseDemo.js", s => s.replace('leadRef: "HM-24117"', 'leadRef: "HM-1"')]
];
function copyTree(dst) { for (const d of ["lib", "scripts", "public", "api", "data", "docs"]) if (fs.existsSync(path.join(ROOT, d))) fs.cpSync(path.join(ROOT, d), path.join(dst, d), { recursive: true, filter: s => !/node_modules|proofs/.test(s) }); for (const f of ["package.json", "vercel.json"]) if (fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(dst, f)); fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dst, "node_modules")); }
const run = dir => { try { execFileSync("node", ["scripts/deskShapesCheck.mjs", dir], { cwd: dir, stdio: "pipe", timeout: 120000 }); return false; } catch { return true; } };
let bad = 0;
for (const [i, [name, file, fn]] of MUT.entries()) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ds-")); copyTree(dir);
  const p = path.join(dir, file), before = fs.readFileSync(p, "utf8"), after = fn(before);
  if (after === before) { console.log("FAIL  mutation did not apply: " + name); bad++; } else { fs.writeFileSync(p, after); const red = run(dir); console.log((red ? "ok  " : "FAIL") + `  [${i}] ` + name); if (!red) bad++; }
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`deskShapesFailsWithout: ${bad ? bad + " PROBLEM" : "every mutation is caught"}`); process.exit(bad ? 1 : 0);
