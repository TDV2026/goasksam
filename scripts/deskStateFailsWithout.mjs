// Each mutation breaks one rule of the report wording (desk v3 stage 3) on a scratch copy; scripts/deskStateCheck.mjs must go red on every one.
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { execFileSync } from "node:child_process"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const RS = "lib/desk/reportState.js", RW = "lib/reasonWords.js", WF = "lib/desk/caseWorkflow.js", SA = "lib/desk/sheetActions.js";
const MUT = [
  ["IMS always reads documented (hard coded)", RS, s => s.replace('!speaks ? null : received ? reasonLine("report.ims_documented") : reasonLine("report.ims_reported")', '!speaks ? null : reasonLine("report.ims_documented")')],
  ["IMS reads documented when only some invoice exists, received or not", RS, s => s.replace('const received = c.documents.some(d => d.kind === "service" && d.status === "received");', 'const received = c.documents.some(d => d.kind === "service");')],
  ["IMS is reported for every car, even when the case never speaks of it", RS, s => s.replace("const speaks = IMS_WORDS.test", "const speaks = true || IMS_WORDS.test")],
  ["the seller agreement always prints", RS, s => s.replace('r.seller_agreed === true ? reasonLine("report.seller_agreed") : null', 'reasonLine("report.seller_agreed")')],
  ["the seller agreement prints for any truthy value", RS, s => s.replace('r.seller_agreed === true ? reasonLine', 'r.seller_agreed ? reasonLine')],
  ["mileage always reads verified", RS, s => s.replace("m.value == null ? null : m.verified ?", "m.value == null ? null : true ?")],
  ["mileage never reads as stated by the seller", RS, s => s.replace('m.source === "seller" ? reasonLine("report.mileage_stated"', 'false ? reasonLine("report.mileage_stated"')],
  ["the reserve position edge: q1 counts as below", WF, s => s.replace("f < ev.q1 ? \"below\"", "f <= ev.q1 ? \"below\"")],
  ["the reserve position edge: q3 counts as above", WF, s => s.replace("f > ev.q3 ? \"above\"", "f >= ev.q3 ? \"above\"")],
  ["the report compares the reserve to the median, not the quartiles", WF, s => s.replace("f > ev.q3 ? \"above\" : \"inside\"", "f > ev.median ? \"above\" : \"inside\"")],
  ["the invoices step stays when the documents are received", RS, s => s.replace('c.documents.some(d => d.kind === "service") && !received', 'c.documents.some(d => d.kind === "service")')],
  ["the confirm-the-mileage step stays when verified", RS, s => s.replace("m.value != null && !m.verified", "m.value != null")],
  ["a done item is listed as a limitation", RS, s => s.replace('n.state === "open" || n.state === "waived")', 'true)')],
  ["a waived item loses its reason", RS, s => s.replace('reasonLine("report.limit_waived", { label: n.label, reason: n.reason })', 'reasonLine("report.limit_waived", { label: n.label, reason: "" })')],
  ["the no prior record note prints for a case with no VIN", RS, s => s.replace('out.noteLines = f("vin").value && c.record', 'out.noteLines = c.record')],
  ["the no prior record note prints when the VIN has a record", RS, s => s.replace("c.record.appearances === 0", "c.record.appearances >= 0")],
  ["the condition line is the same for every rung", RS, s => s.replace('{ name: TIER_LADDER[t].name, tier: t, line: TIER_LADDER[t].line }', '{ name: TIER_LADDER[3].name, tier: 3, line: TIER_LADDER[3].line }')],
  ["the typical range line uses the wrong sales count", RS, s => s.replace('median: ev.median, sales: countNoun(ev.count,', 'median: ev.median, sales: countNoun(ev.matching,')],
  ["the wording is not kept in the finalized version", SA, s => s.replace("wording: reportState(c0), seat", "wording: null, seat")],
  ["the engine's no prior record line is typed in sheetRead again", "lib/sheetRead.js", s => s.replace('reasonLine("desk.no_prior_vin")', '"No prior auction record for this VIN."')],
  ["a Desk file types a report claim", WF, s => s.replace("const EXPLAIN_MIN = 60;", 'const EXPLAIN_MIN = 60; const TYPED = "The seller has agreed to this reserve.";')],
  ["the difference line reads the wrong side of the median", RS, s => s.replace('reasonLine(a.figure > ev.median ? "report.assess_above" : "report.assess_below"', 'reasonLine(a.figure > ev.median ? "report.assess_below" : "report.assess_above"')],
  ["the difference line measures against q1, not the median", RS, s => s.replace("Math.abs(a.figure - ev.median)", "Math.abs(a.figure - ev.q1)")],
  ["the difference line says at the reference only never", RS, s => s.replace("a.figure === ev.median ? reasonLine", "false ? reasonLine")],
  ["the mileage is formatted by hand, not through countNoun", RS, s => s.replace('countNoun(m.value, "mile", { words: false })', 'm.value.toLocaleString("en-US") + " miles"')],
  ["the workspace prints a position line of its own", "lib/desk/caseView.js", s => s.replace("positionLine: rs.reservePositionLine", 'positionLine: rs.reservePosition ? "The reserve is " + rs.reservePosition + " the range." : null')],
  ["the reserve sentence names the wrong quartiles", RS, s => s.replace('reasonLine("report.reserve_" + pos, { q1: ev.q1, q3: ev.q3 })', 'reasonLine("report.reserve_" + pos, { q1: ev.low, q3: ev.high })')]
];
function copyTree(dst) { for (const d of ["lib", "scripts", "public", "api", "data", "docs"]) if (fs.existsSync(path.join(ROOT, d))) fs.cpSync(path.join(ROOT, d), path.join(dst, d), { recursive: true, filter: s => !/node_modules|proofs/.test(s) }); for (const f of ["package.json", "vercel.json"]) if (fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(dst, f)); fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dst, "node_modules")); }
let bad = 0;
for (const [i, [name, file, fn]] of MUT.entries()) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dw-")); copyTree(dir);
  const p = path.join(dir, file), before = fs.readFileSync(p, "utf8"), after = fn(before);
  if (after === before) { console.log("FAIL  mutation did not apply: " + name); bad++; }
  else { fs.writeFileSync(p, after); let red = false; try { execFileSync("node", [`scripts/deskStateCheck.mjs`, dir], { cwd: dir, stdio: "pipe", timeout: 120000 }); } catch { red = true; } console.log((red ? "ok  " : "FAIL") + `  [${i}] deskStateCheck goes red without the rule: ` + name); if (!red) bad++; }
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`deskStateFailsWithout: ${bad ? bad + " PROBLEM" : "every mutation is caught"}`); process.exit(bad ? 1 : 0);
