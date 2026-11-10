// Each mutation undoes ONE rule of the V4 reserve on a scratch copy of the tree; scripts/deskReserveFlowCheck.mjs must go red on every one (and be green on the real tree).
//   node scripts/deskReserveFlowFailsWithout.mjs [only-a-number-to-run-one]
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { execFileSync } from "node:child_process"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const CW = "lib/desk/caseWorkflow.js";
const MUT = [
  ["the reserve never takes the engine's start", CW, s => s.replace("start = d && d.reserveStart && d.reserveStart.figure != null ? d.reserveStart.figure : null", "start = null")],
  ["the why never takes the engine's draft", CW, s => s.replace('draft = d && d.whyDraft ? String(d.whyDraft) : ""', 'draft = ""')],
  ["the key leaves out the reserve figure (a typed figure costs no read, so it is never checked)", CW, s => s.replace(", windowOf(c), reserveOf(c).figure]);", ", windowOf(c)]);")],
  ["the key leaves out the period (a period change is never read)", CW, s => s.replace(".sort(), windowOf(c), reserveOf(c).figure]);", ".sort(), reserveOf(c).figure]);")],
  ["the read is not given the period", CW, s => s.replace("windowMonths: windowOf(c), reserve: reserveOf(c).figure,", "reserve: reserveOf(c).figure,")],
  ["the read is not given the reserve", CW, s => s.replace("windowMonths: windowOf(c), reserve: reserveOf(c).figure,", "windowMonths: windowOf(c),")],
  ["the analyst's figure is reseeded by a later read", CW, s => s.replace('const ownFigure = r.source === "analyst",', "const ownFigure = false,")],
  ["the analyst's edited why is reseeded by a later read", CW, s => s.replace("why = r.whyEdited ? r.why : draft;", "why = draft || r.why;")],
  ["the position is a comparison made here, not the engine's answer", CW, s => s.replace("return ck && ck.position ? ck.position : null; }", "const ev = c.desk && c.desk.evidence, f = reserveOf(c).figure; return f == null || !ev || ev.q1 == null ? null : f < ev.q1 ? \"below\" : f > ev.q3 ? \"above\" : \"inside\"; }")],
  ["the seller's request does not lift the unsupported blocker", CW, s => s.replace("else if (r.sellerRequested) checks.push(", "else if (false) checks.push(")],
  ["an unchecked figure counts as supported", CW, s => s.replace("const supported = !!(ck && ck.supported === true);", "const supported = !(ck && ck.supported === false);")],
  ["the engine is read only once, so the reserve it took is never checked", CW, s => s.replace("for (let i = 0; i < 2 && needsRecall(c); i++)", "for (let i = 0; i < 1 && needsRecall(c); i++)")],
  ["any number of months is accepted as the period", CW, s => s.replace("if (!WINDOWS.includes(m)) return null;", "if (!(m > 0)) return null;")],
  ["restart keeps the analyst's why", CW, s => s.replace("next.source = null; next.whyEdited = false; next.sellerRequested = false;", "next.source = null; next.sellerRequested = false;")],
  ["the period op is not in case_edit", "lib/desk/sheetActions.js", s => s.replace('op === "window"', 'op === "windowx"')],
  ["a new case takes the engine's start but never has it checked", "lib/desk/sheetActions.js", s => s.replace("c = (await W.refreshEvidence(c, input => (ctx.readSheet || readSheet)(ctx.env, input), { caseDate: now.slice(0, 10), now })).case; } }", "} }")],
  ["the report prints a position line of its own", "lib/desk/reportState.js", s => s.replace("out.reservePositionLine = ck && ck.positionLine ? ck.positionLine : null;", "out.reservePositionLine = pos ? \"The reserve is conservative.\" : null;")],
  ["the answer does not carry the engine's check", "lib/desk/sheetActions.js", s => s.replace("reserveCheck: W.reserveCheckOf(c), reserveStart", "reserveStartX")]
];
function copyTree(dst) {
  for (const d of ["lib", "scripts", "public", "api", "data", "docs"]) if (fs.existsSync(path.join(ROOT, d))) fs.cpSync(path.join(ROOT, d), path.join(dst, d), { recursive: true, filter: s => !/node_modules|proofs/.test(s) });
  for (const f of ["package.json", "vercel.json"]) if (fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(dst, f));
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dst, "node_modules"));
}
const run = dir => { try { const o = execFileSync("node", ["scripts/deskReserveFlowCheck.mjs", dir], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 280000 }); return { red: false, out: o }; } catch (e) { return { red: true, out: String(e.stdout || "") + String(e.stderr || "") }; } };
let bad = 0; const only = process.argv[2] && /^\d+$/.test(process.argv[2]) ? Number(process.argv[2]) : null;
for (const [i, [name, file, fn]] of MUT.entries()) {
  if (only != null && only !== i) continue;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rf-")); copyTree(dir);
  const p = path.join(dir, file), before = fs.readFileSync(p, "utf8"), after = fn(before);
  if (after === before) { console.log("FAIL  mutation did not apply: " + name); bad++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
  fs.writeFileSync(p, after); const r = run(dir);
  console.log((r.red ? "ok  " : "FAIL") + `  [${i}] without the rule, the check goes red: ` + name + (r.red ? "  (" + (r.out.split("\n").find(l => /^FAIL/.test(l)) || r.out.split("\n").filter(Boolean).slice(-1)[0] || "").slice(0, 80) + ")" : ""));
  if (!r.red) bad++;
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`deskReserveFlowFailsWithout: ${bad ? bad + " PROBLEM" : "every mutation is caught"}`); process.exit(bad ? 1 : 0);
