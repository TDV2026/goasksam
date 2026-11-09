// Each mutation undoes one workflow rule of desk v3 stage 2 on a scratch copy; the named check must go red on every one.
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { execFileSync } from "node:child_process"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const WF = "lib/desk/caseWorkflow.js", CM = "lib/desk/caseModel.js", SA = "lib/desk/sheetActions.js";
const MUT = [
  ["deskWorkflowCheck", "a correction does not reset verification", CM, s => s.replace('f.value = v; f.source = source; f.verified = false; f.candidates = [...f.candidates.filter(x => x.source !== source), { value: v, source }]; c.audit.push({ at, by, what: "corrected", field: key, from: was, to: v, source }); return c; }\n  else if (by', 'f.value = v; f.source = source; f.verified = true; f.candidates = [...f.candidates.filter(x => x.source !== source), { value: v, source }]; c.audit.push({ at, by, what: "corrected", field: key, from: was, to: v, source }); return c; }\n  else if (by')],
  ["deskWorkflowCheck", "a correction logs no audit line", CM, s => s.replace('c.audit.push({ at, by, what: "corrected", field: key, from: was, to: v, source }); return c; }\n  else if (by', 'return c; }\n  else if (by')],
  ["deskWorkflowCheck", "mileage no longer re-calls the engine", WF, s => s.replace("c.fields.mileage.value, c.fields.transmission.value", "c.fields.transmission.value")],
  ["deskWorkflowCheck", "transmission no longer re-calls the engine", WF, s => s.replace("c.fields.mileage.value, c.fields.transmission.value, c.fields.body.value", "c.fields.mileage.value, c.fields.body.value")],
  ["deskWorkflowCheck", "body no longer re-calls the engine", WF, s => s.replace("c.fields.transmission.value, c.fields.body.value, c.fields.generation.value", "c.fields.transmission.value, c.fields.generation.value")],
  ["deskWorkflowCheck", "generation no longer re-calls the engine", WF, s => s.replace("c.fields.body.value, c.fields.generation.value,", "c.fields.body.value,")],
  ["deskWorkflowCheck", "a market_calc exclusion no longer re-calls the engine", WF, s => s.replace('c.exclusions.filter(e => e.scope === "market_calc").map(e => e.saleId).sort()', "[]")],
  ["deskWorkflowCheck", "a report scope exclusion re-calls too", WF, s => s.replace('c.exclusions.filter(e => e.scope === "market_calc")', "c.exclusions")],
  ["deskWorkflowCheck", "the exclusions are not sent to the engine", WF, s => s.replace("exclusions: c.exclusions.map(", "exclusions: [].map(")],
  ["deskWorkflowCheck", "a retry answer replaces the good read", WF, s => s.replace("if (!sheet || sheet.retry || !sheet.desk)", "if (!sheet)")],
  ["deskWorkflowCheck", "desk.original is not stored", WF, s => s.replace("readAt: iso(now), ...sheet.desk }", "readAt: iso(now), ...sheet.desk, original: undefined }")],
  ["deskWorkflowCheck", "the service documents item is material", WF, s => s.replace('id: "service_documents", material: false', 'id: "service_documents", material: true')],
  ["deskWorkflowCheck", "a VIN mismatch opens no item", WF, s => s.replace('c.fields.vin.source === "conflicting" || ["year", "make", "model"]', 'false && ["year", "make", "model"]')],
  ["deskWorkflowCheck", "a waived item is reopened while its cause stands", WF, s => s.replace('else if (on && it && it.state === "done") it.state = "open";', 'else if (on && it && it.state !== "open") it.state = "open";')],
  ["deskWorkflowCheck", "a same-value correction resets verification", WF, s => s.replace("return c0; return", "void 0; return")],
  ["deskIndependenceCheck", "writing the assessment also writes the reserve", WF, s => s.replace("explanation: \"explanation\" in p ? String(p.explanation || \"\").slice(0, 2000) : a.explanation }; return settle(c, now); }", "explanation: \"explanation\" in p ? String(p.explanation || \"\").slice(0, 2000) : a.explanation }; if (\"figure\" in p) c.reserve = { ...c.reserve, figure: c.assessment.figure }; return settle(c, now); }")],
  ["deskIndependenceCheck", "writing the reserve also writes the assessment", WF, s => s.replace("seller_agreed: \"seller_agreed\" in p ? p.seller_agreed === true : r.seller_agreed }; return settle(c, now); }", "seller_agreed: \"seller_agreed\" in p ? p.seller_agreed === true : r.seller_agreed }; if (\"figure\" in p) c.assessment = { ...c.assessment, figure: c.reserve.figure }; return settle(c, now); }")],
  ["deskIndependenceCheck", "seller_agreed is set by any truthy value", WF, s => s.replace("p.seller_agreed === true : r.seller_agreed", "!!p.seller_agreed : r.seller_agreed")],
  ["deskReadinessCheck", "a missing photo does not block", WF, s => s.replace('if (!c.photos.items.length) add("photo", "No photo.");', "")],
  ["deskReadinessCheck", "no comparable selected does not block", WF, s => s.replace('if (!(c.selectedComparables || []).length) add("comparable", "No comparable selected.");', "")],
  ["deskReadinessCheck", "an open material item does not block", WF, s => s.replace('if (n.material && n.state === "open") add(', 'if (false) add(')],
  ["deskReadinessCheck", "a reserve above q3 does not block", WF, s => s.replace('!(ev && ev.q3 != null && r.figure <= ev.q3) && !long(r.rationale)', "false")],
  ["deskReadinessCheck", "the explanation floor is 20 characters", WF, s => s.replace("const EXPLAIN_MIN = 60;", "const EXPLAIN_MIN = 20;")],
  ["deskReadinessCheck", "an assessment outside the evidence range does not block", WF, s => s.replace("&& !long(a.explanation)) add(\"assessment_range\"", "&& false) add(\"assessment_range\"")],
  ["deskReadinessCheck", "a missing rationale does not block", WF, s => s.replace('if (!String(r.rationale || "").trim()) add("rationale"', 'if (false) add("rationale"')],
  ["deskReadinessCheck", "a missing second photo blocks (an optional thing blocks)", WF, s => s.replace('if (!c.photos.items.length) add("photo", "No photo.");', 'if (c.photos.items.length < 2) add("photo", "No photo.");')],
  ["deskVersionCheck", "a later edit does not make a new version", WF, s => s.replace("c.version += 1; c.status = \"in_review\";", "c.status = \"in_review\";")],
  ["deskVersionCheck", "the store overwrites a version that exists", "lib/desk/sheetStore.js", s => s.replace('if (VERS.has(k)) throw new Error("version already written"); ', "")],
  ["deskVersionCheck", "a case that is not ready finalizes", WF, s => s.replace("if (!r.ready) return { ok: false, why", "if (false) return { ok: false, why")],
  ["deskVersionCheck", "finalize can run twice on one version", WF, s => s.replace('if (c0.status === "finalized") return { ok: false, why: "This version is already finalized." };', "")],
  ["deskVersionCheck", "the version row leaves out the original evidence", WF, s => s.replace("original: clone(d.original || null), ", "")]
];
function copyTree(dst) { for (const d of ["lib", "scripts", "public", "api", "data", "docs"]) if (fs.existsSync(path.join(ROOT, d))) fs.cpSync(path.join(ROOT, d), path.join(dst, d), { recursive: true, filter: s => !/node_modules|proofs/.test(s) }); for (const f of ["package.json", "vercel.json"]) if (fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(dst, f)); fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dst, "node_modules")); }
let bad = 0;
for (const [i, [chk, name, file, fn]] of MUT.entries()) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dw-")); copyTree(dir);
  const p = path.join(dir, file), before = fs.readFileSync(p, "utf8"), after = fn(before);
  if (after === before) { console.log("FAIL  mutation did not apply: " + name); bad++; }
  else { fs.writeFileSync(p, after); let red = false; try { execFileSync("node", [`scripts/${chk}.mjs`, dir], { cwd: dir, stdio: "pipe", timeout: 120000 }); } catch { red = true; } console.log((red ? "ok  " : "FAIL") + `  [${i}] ${chk} goes red without the rule: ` + name); if (!red) bad++; }
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`deskWorkflowFailsWithout: ${bad ? bad + " PROBLEM" : "every mutation is caught"}`); process.exit(bad ? 1 : 0);
