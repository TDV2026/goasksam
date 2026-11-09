// Each mutation undoes one workflow rule of desk v3 stage 2 on a scratch copy; the named check must go red on every one.
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { execFileSync } from "node:child_process"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const WF = "lib/desk/caseWorkflow.js", CM = "lib/desk/caseModel.js", SA = "lib/desk/sheetActions.js";
const MUT = [
  ["deskWorkflowCheck", "a correction does not reset verification", CM, s => s.replace('f.value = v; f.source = source; f.verified = false; f.candidates = [...f.candidates.filter(x => x.source !== source), { value: v, source }]; c.audit.push({ at, by, what: "corrected", field: key, from: was, to: v, source }); return c; }\n  else if (by', 'f.value = v; f.source = source; f.verified = true; f.candidates = [...f.candidates.filter(x => x.source !== source), { value: v, source }]; c.audit.push({ at, by, what: "corrected", field: key, from: was, to: v, source }); return c; }\n  else if (by')],
  ["deskWorkflowCheck", "a correction logs no audit line", CM, s => s.replace('c.audit.push({ at, by, what: "corrected", field: key, from: was, to: v, source }); return c; }\n  else if (by', 'return c; }\n  else if (by')],
  ["deskWorkflowCheck", "mileage no longer re-calls the engine", WF, s => s.replace("c.fields.mileage.value, c.fields.transmission.value", "c.fields.transmission.value")],
  ["deskWorkflowCheck", "transmission no longer re-calls the engine", WF, s => s.replace("c.fields.mileage.value, c.fields.transmission.value, c.fields.body.value", "c.fields.mileage.value, c.fields.body.value")],
  ["deskWorkflowCheck", "body no longer re-calls the engine", WF, s => s.replace("c.fields.transmission.value, c.fields.body.value, c.condition", "c.fields.transmission.value, c.condition")],
  ["deskWorkflowCheck", "generation is back in the recall key", WF, s => s.replace("c.fields.body.value, c.condition", "c.fields.body.value, c.fields.generation.value, c.condition")],
  ["deskWorkflowCheck", "a market_calc exclusion no longer re-calls the engine", WF, s => s.replace('c.exclusions.filter(e => e.scope !== "note_only").map(e => e.scope + ":" + e.saleId).sort()', "[]")],
  ["deskWorkflowCheck", "the exclusions are not sent to the engine", WF, s => s.replace("exclusions: c.exclusions.map(", "exclusions: [].map(")],
  ["deskWorkflowCheck", "a retry answer replaces the good read", WF, s => s.replace("if (!sheet || sheet.retry || !sheet.desk)", "if (!sheet)")],
  ["deskWorkflowCheck", "desk.original is not stored", WF, s => s.replace("readAt: iso(now), ...sheet.desk }", "readAt: iso(now), ...sheet.desk, original: undefined }")],
  ["deskWorkflowCheck", "the service documents item is material", WF, s => s.replace('id: "service_documents", material: false', 'id: "service_documents", material: true')],
  ["deskWorkflowCheck", "a VIN mismatch opens no item", WF, s => s.replace('c.fields.vin.source === "conflicting" || ["year", "make", "model"]', 'false && ["year", "make", "model"]')],
  ["deskWorkflowCheck", "a waived item is reopened while its cause stands", WF, s => s.replace('else if (on && it && it.state === "done") it.state = "open";', 'else if (on && it && it.state !== "open") it.state = "open";')],
  ["deskWorkflowCheck", "a same-value correction resets verification", WF, s => s.replace("return c0; return", "void 0; return")],
  ["deskWorkflowCheck", "note_only drops a comparable (the engine treats it as report_comps)", "lib/deskV3.js", s => s.replace('rep = new Set(ex.filter(e => e.scope === "report_comps").map(e => e.id));', 'rep = new Set(ex.filter(e => e.scope !== "market_calc").map(e => e.id));')],
  ["deskWorkflowCheck", "note_only drops a comparable from the workspace's list", "lib/desk/caseView.js", s => s.replace("c.desk.comparables.map(x => (ex.has(String(x.id)) ? { ...x, exclusion: ex.get(String(x.id)) } : x))", "c.desk.comparables.filter(x => !ex.has(String(x.id)))")],
  ["deskWorkflowCheck", "note_only re-calls the engine", WF, s => s.replace('c.exclusions.filter(e => e.scope !== "note_only")', "c.exclusions")],
  ["deskWorkflowCheck", "report_comps no longer re-calls (the comparables list goes stale)", WF, s => s.replace('c.exclusions.filter(e => e.scope !== "note_only")', 'c.exclusions.filter(e => e.scope === "market_calc")')],
  ["deskWorkflowCheck", "an exclusion leaves no audit line", CM, s => s.replace('c.audit.push({ at, by: "analyst", what: "excluded (" + scope + ")", field: "exclusions", to: String(saleId), reason: str(reason, 300) }); return c;', 'return c;')],
  ["deskWorkflowCheck", "the case spells a scope the engine does not know", CM, s => s.replace('["market_calc", "report_comps", "note_only"]', '["market_calc", "report", "note_only"]')],
  ["deskWorkflowCheck", "the note does not ride on the comparable", "lib/desk/caseView.js", s => s.replace("{ ...x, exclusion: ex.get(String(x.id)) }", "x")],
  ["deskWorkflowCheck", "a comparable the engine no longer lists still counts as selected", WF, s => s.replace(".filter(id => !listed || listed.has(String(id)))", "")],
  ["deskIndependenceCheck", "writing the assessment also writes the reserve", WF, s => s.replace("explanation: \"explanation\" in p ? String(p.explanation || \"\").slice(0, 2000) : a.explanation }; return settle(c, now); }", "explanation: \"explanation\" in p ? String(p.explanation || \"\").slice(0, 2000) : a.explanation }; if (\"figure\" in p) c.reserve = { ...c.reserve, figure: c.assessment.figure }; return settle(c, now); }")],
  ["deskIndependenceCheck", "writing the reserve also writes the assessment", WF, s => s.replace("seller_agreed: \"seller_agreed\" in p ? p.seller_agreed === true : r.seller_agreed }; return settle(c, now); }", "seller_agreed: \"seller_agreed\" in p ? p.seller_agreed === true : r.seller_agreed }; if (\"figure\" in p) c.assessment = { ...c.assessment, figure: c.reserve.figure }; return settle(c, now); }")],
  ["deskIndependenceCheck", "seller_agreed is set by any truthy value", WF, s => s.replace("p.seller_agreed === true : r.seller_agreed", "!!p.seller_agreed : r.seller_agreed")],
  ["deskReadinessCheck", "a missing photo does not block", WF, s => s.replace('if (!c.photos.items.length) add("photo", "No photo.");', "")],
  ["deskReadinessCheck", "no comparable selected does not block", WF, s => s.replace('add("comparable", "No comparable selected.");', "void 0;")],
  ["deskReadinessCheck", "an open material item does not block", WF, s => s.replace('if (n.material && n.state === "open") add(', 'if (false) add(')],
  ["deskReadinessCheck", "a reserve above q3 does not block", WF, s => s.replace('!(ev && ev.q3 != null && r.figure <= ev.q3) && !long(r.rationale)', "false")],
  ["deskReadinessCheck", "the explanation floor is 20 characters", WF, s => s.replace("const EXPLAIN_MIN = 60;", "const EXPLAIN_MIN = 20;")],
  ["deskReadinessCheck", "an assessment outside the evidence range does not block", WF, s => s.replace("&& !long(a.explanation)) add(\"assessment_range\"", "&& false) add(\"assessment_range\"")],
  ["deskReadinessCheck", "a missing rationale does not block", WF, s => s.replace('if (!String(r.rationale || "").trim()) add("rationale"', 'if (false) add("rationale"')],
  ["deskReadinessCheck", "a missing second photo blocks (an optional thing blocks)", WF, s => s.replace('if (!c.photos.items.length) add("photo", "No photo.");', 'if (c.photos.items.length < 2) add("photo", "No photo.");')],
  ["deskVersionCheck", "a later edit does not make a new version", SA, s => s.replace('c1.version += 1; c1.status = "in_review";', 'c1.status = "in_review";')],
  ["deskVersionCheck", "a later edit makes no revision sheet (the finalized sheet would be edited)", SA, s => s.replace('(s0.status === "Finalised" || s0.status === "Sent") && s0.case && s0.case.status === "finalized"', 'false && s0.case')],
  ["deskVersionCheck", "finalizing does not set the old Finalised status", SA, s => s.replace('    status: "Finalised",\n    read: { ...(read || {})', '    status: "In progress",\n    read: { ...(read || {})')],
  ["deskVersionCheck", "sheet.final is not made from the version row (reserve)", SA, s => s.replace('reserve: str(r.figure), low', 'reserve: str(a.figure), low')],
  ["deskVersionCheck", "the mirrored sheet has no read (the database check would refuse it)", SA, s => s.replace("read: { ...(read || {}), frozen: true, v3: true,", "read: null, x: { ...(read || {}), frozen: true, v3: true,")],
  ["deskVersionCheck", "a superseded sheet is counted as a second case", "lib/desk/caseView.js", s => s.replace("return sheets.filter(s => !gone.has(s.id)); };", "return sheets; };")],
  ["deskVersionCheck", "the version chain stops at the revision", SA, s => s.replace("cur = cur.corrects ? await get(cur.corrects) : null;", "cur = null;")],
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
