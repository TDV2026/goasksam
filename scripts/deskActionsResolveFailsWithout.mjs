// Each mutation undoes ONE fix of Desk v4 stage 2 on a scratch copy; scripts/deskActionsResolveCheck.mjs must go red on every one.
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { execFileSync } from "node:child_process"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const SA = "lib/desk/sheetActions.js";
const MUT = [
  ["the need op reads its key from body.id again (the sheet id)", SA, s => s.replace('const key = String(body.item || "");', 'const key = String(body.id || "");')],
  ["the page sends the need key as id again", "lib/preview/deskV3.js", s => s.replace('edit("need",{item:id,state:"waived"', 'edit("need",{id:id,state:"waived"')],
  ["a service invoice no longer closes its item (only the old kind counts)", "lib/desk/caseModel.js", s => s.replace('kindOfDoc(d) === "invoice" && d.status === "received"', 'd.kind === "service" && d.status === "received"')],
  ["doc_add takes any kind", SA, s => s.replace('if (!DOC_KINDS.includes(kind)) return refuse(', 'if (false) return refuse(')],
  ["doc_add takes any file", SA, s => s.replace('if (!(pdf || jpg || png)) return refuse(', 'if (false) return refuse(')],
  ["Select all is not accepted", SA, s => s.replace('body.ids === "all" || body.all === true', 'false')],
  ["a ticked comparable comes back as not in the report", SA, s => s.replace('{ ...x, inReport: picked.has(id) }', '{ ...x, inReport: false }')],
  ["an exclusion drops the other comparables from the answer", SA, s => s.replace("case: view, readiness", "case: touched ? { ...view, desk: { ...view.desk, comparables: (view.desk.comparables || []).filter(k => touched.has(String(k.id))) } } : view, readiness")],
  ["Mark verified on an empty field answers nothing to verify again", SA, s => s.replace('if (c.fields[fk] && c.fields[fk].value == null) {', 'if (false) {')],
  ["done is accepted while the cause stands (and silently reopens)", SA, s => s.replace('if (String(body.state) === "done" && rule', 'if (false && rule')],
  ["the documents list is not on the caseView", "lib/desk/caseView.js", s => s.replace("documents: c.documents.map(d => ({ ...d, kind: kindOfDoc(d)", "documentsX: c.documents.map(d => ({ ...d, kind: kindOfDoc(d)")]
];
function copyTree(dst) {
  for (const d of ["lib", "scripts", "public", "api", "data", "docs"]) if (fs.existsSync(path.join(ROOT, d))) fs.cpSync(path.join(ROOT, d), path.join(dst, d), { recursive: true, filter: s => !/node_modules|proofs/.test(s) });
  for (const f of ["package.json", "vercel.json"]) if (fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(dst, f));
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dst, "node_modules"));
}
const run = dir => { try { const o = execFileSync("node", ["scripts/deskActionsResolveCheck.mjs", dir], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 200000 }); return { red: false, out: o }; } catch (e) { return { red: true, out: String(e.stdout || "") + String(e.stderr || "") }; } };
let bad = 0;
for (const [i, [name, file, fn]] of MUT.entries()) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ar-")); copyTree(dir);
  const p = path.join(dir, file), before = fs.readFileSync(p, "utf8"), after = fn(before);
  if (after === before) { console.log("FAIL  mutation did not apply: " + name); bad++; }
  else { fs.writeFileSync(p, after); const r = run(dir); console.log((r.red ? "ok  " : "FAIL") + `  [${i}] the check goes red without the fix: ` + name + (r.red ? "  (" + (r.out.split("\n").find(l => /^FAIL/.test(l)) || r.out.split("\n").filter(Boolean).slice(-1)[0] || "").slice(0, 80) + ")" : "")); if (!r.red) bad++; }
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`deskActionsResolveFailsWithout: ${bad ? bad + " PROBLEM" : "every mutation is caught"}`); process.exit(bad ? 1 : 0);
