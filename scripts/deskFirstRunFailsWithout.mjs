// Each mutation undoes ONE fix from Sam's first run of Desk V4 (Nov 11 2026) on a scratch copy of the tree; the check named beside it must go red on every one (and the real tree is green: run the checks plainly).
//   node scripts/deskFirstRunFailsWithout.mjs [only-a-number-to-run-one]
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { execFileSync } from "node:child_process"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const CW = "lib/desk/caseWorkflow.js", DV = "lib/deskV3.js", OB = "lib/onebox.js";
const rep = (a, b) => s => s.replace(a, b);
const MUT = [
  // 1. a switch of period or condition must not read
  ["the engine's read carries no views, so every switch reads again", "deskViewsCheck", OB, rep("if (cfg.views === true) {", "if (false) {")],
  ["a period switch does not take the stored view", "deskViewsCheck", CW, rep("return settle(adoptView(c, now), now); }\n// A SWITCH", "return settle(c, now); }\n// A SWITCH")],
  ["a condition switch does not take the stored view", "deskViewsCheck", CW, rep("selected.name || \"\") } : null }; return settle(adoptView(c, now), now); }", "selected.name || \"\") } : null }; return settle(c, now); }")],
  ["the views are built with every condition read as all conditions", "deskViewsCheck", OB, rep("const useT = t && !noData ? t : null,", "const useT = null,")],
  ["the views are built at the chosen period only", "deskViewsCheck", OB, rep("windowMonths: m }), env);", "windowMonths: 12 }), env);")],
  ["the reserve check after a switch is the old one", "deskViewsCheck", CW, rep("c.desk.reserveCheck = fig != null ? engineReserveCheck(c.desk.sales, c.desk.evidence, fig, want.months) : null;", "")],
  ["on the page, a condition click reads the engine again", "deskV4FlowCheck", CW, rep("selected.name || \"\") } : null }; return settle(adoptView(c, now), now); }", "selected.name || \"\") } : null }; return settle(c, now); }")],
  // 2. one answer, one count
  ["the case's own condition line counts the car's sales of that condition with no mileage cut", "reportConsistencyCheck", DV, rep("months, when, desk.tier || desk.rungPools ? {", "months, when, false ? {")],
  // 5. every refusal of a new case says why
  ["a market read that throws reaches the page with no reason", "deskTypedCasesCheck", "lib/desk/sheetActions.js", rep('} catch (e) { return refuse(reasonLine("case.new.refuse.read_failed", { detail: String(e && e.message || e).slice(0, 80) })); }', '} catch (e) { throw e; }')],
  ["a VIN that does not decode says nothing about why", "deskTypedCasesCheck", "lib/desk/sheetActions.js", rep('? reasonLine("case.new.refuse.vin_not_decoded") : "The read is not', '? "no reason" : "The read is not')],
  ["a photo over 4 MB is refused in words of the code's own", "deskTypedCasesCheck", "lib/desk/sheetActions.js", rep('{ refuse: reasonLine("case.photo.refuse.size") }', '{ refuse: "too big" }')],
  ["the handler lets an action's error through", "deskTypedCasesCheck", "lib/desk/handler.js", rep('catch (e) { const { reasonLine }', 'catch (e) { throw e; const { reasonLine }')],
  // lane F 2. one answer per rung
  ["a rung button counts the car's sales of that condition with no mileage cut", "reportConsistencyCheck", DV, rep("byTier: desk.rungPools ? Object.fromEntries", "byTier: null && Object.fromEntries")],
  // lane F 3. where the record starts
  ["a window that reaches past the first sale on record says nothing", "reportConsistencyCheck", DV, rep("firstOn && firstOn > cutoffOf(caseDate, m) ?", "false ?")],
  // lane F 1. edits hold across sessions
  ["the preview keeps its cases in memory per instance and seeds them afresh (the store behind the door is ignored)", "deskPersistCheck", "lib/preview/deskPreview.js", rep("    if (backing) return backing;\n", "")],
  ["the preview's edits are written to a store and the PDF is built from the seeded case", "deskPersistCheck", "lib/desk/sheetActions.js", rep("if (action === \"case_pdf\")", "if (action === \"case_pdf_x\")")],
  // 4. a waived item whose cause is gone leaves the list
  ["a waived item stays when the mark that caused it is set", "reportConsistencyCheck", CW, rep('else if (!on && it && it.state === "waived") c.needs_review', 'else if (false) c.needs_review')],
  // 7. a switch with nothing to show says so
  ["a shorter period with the same sales prints no line", "reportConsistencyCheck", DV, rep("e1.count > 0 && e1.count === e2.count ?", "false ?")],
  // 3. the reserve the engine proposes is a round figure
  ["the engine proposes the first quartile as it is", "deskShapesCheck", DV, rep("figure: roundReserve(evidence.q1),", "figure: evidence.q1,")],
  ["the rounding step is $100", "deskShapesCheck", DV, rep("v < 50000 ? 500 : 1000", "v < 50000 ? 100 : 1000")]
];
function copyTree(dst) {
  for (const d of ["lib", "scripts", "public", "api", "data", "docs"]) if (fs.existsSync(path.join(ROOT, d))) fs.cpSync(path.join(ROOT, d), path.join(dst, d), { recursive: true, filter: s => !/node_modules|proofs/.test(s) });
  for (const f of ["package.json", "vercel.json"]) if (fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(dst, f));
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dst, "node_modules"));
}
const run = (dir, check) => { try { const o = execFileSync("node", ["scripts/" + check + ".mjs", dir], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 280000 }); return { red: false, out: o }; } catch (e) { return { red: true, out: String(e.stdout || "") + String(e.stderr || "") }; } };
let bad = 0; const only = process.argv[2] && /^\d+$/.test(process.argv[2]) ? Number(process.argv[2]) : null;
for (const [i, [name, check, file, fn]] of MUT.entries()) {
  if (only != null && only !== i) continue;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fr-")); copyTree(dir);
  const p = path.join(dir, file), before = fs.readFileSync(p, "utf8"), after = fn(before);
  if (after === before) { console.log("FAIL  mutation did not apply: " + name); bad++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
  fs.writeFileSync(p, after); const r = run(dir, check);
  console.log((r.red ? "ok  " : "FAIL") + `  [${i}] without the fix, ${check} goes red: ` + name + (r.red ? "  (" + (r.out.split("\n").find(l => /^FAIL/.test(l)) || r.out.split("\n").filter(Boolean).slice(-1)[0] || "").slice(0, 80) + ")" : ""));
  if (!r.red) bad++;
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`deskFirstRunFailsWithout: ${bad ? bad + " PROBLEM" : "every mutation is caught"}`); process.exit(bad ? 1 : 0);
