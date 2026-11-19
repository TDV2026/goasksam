// Each mutation undoes ONE rule of Send to seller on a scratch copy of the tree; scripts/caseSendCheck.mjs must go red on every one (and be green on the real tree).
//   node scripts/caseSendFailsWithout.mjs [only-a-number-to-run-one]
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { execFileSync } from "node:child_process"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const CS = "lib/desk/caseSend.js", SA = "lib/desk/sheetActions.js", SD = "lib/desk/send.js", CV = "lib/desk/caseView.js";
const MUT = [
  ["a draft can be sent", CS, s => s.replace('if (c.status !== "finalized" || !s0.final) return', "if (false) return")],
  ["a case edited since it was finalized can be sent", CS, s => s.replace("if (openRevision) return", "if (false) return")],
  ["a version that is not the finalized one is accepted", CS, s => s.replace("if (!preview && Number(version) !== c.version)", "if (false)")],
  ["an older version can be sent after a newer one was finalized", CS, s => s.replace("if (latest.id !== s0.id) return", "if (false) return")],
  ["any text is accepted as the address", CS, s => s.replace(/export const EMAIL = .*;/, "export const EMAIL = /.*/;")],
  ["an unverified sender is allowed to send", SA, s => s.replace("if (!sd.ready) return refuse(", "if (false) return refuse(")],
  ["a second press sends again without being asked", SA, s => s.replace("if (earlier.length && body.again !== true) {", "if (false) {")],
  ["the send is not recorded as a send export", SA, s => s.replace('kind: "send", version: c.version, detail: { to, subject,', 'kind: "pdf", version: c.version, detail: { to, subject,')],
  ["the bytes sent are not the report's bytes", SA, s => s.replace("pdf: { name: rep.filename, bytes: Buffer.from(rep.bytes) }", 'pdf: { name: rep.filename, bytes: Buffer.from("%PDF-1.4 x") }')],
  ["a sent case does not move to sent", SA, s => s.replace("if (store.markSent && !earlier.length) await store.markSent", "if (false) await store.markSent")],
  ["the export count of a second send is not counted", SA, s => s.replace("exports: earlier.length + 1 }", "exports: 1 }")],
  ["a refusal is a sentence typed in the action", SA, s => s.replace('refuse(reasonLine("send.refuse.address"))', 'refuse("Enter a valid address")')],
  ["a seat that does not own the case can send it", SA, s => s.replace('if (accessOf(s0, seat).role !== "owner") return refuse(reasonLine("send.refuse.owner"));', "")],
  ["the view never reads a sent case as sent", CV, s => s.replace('sheet && sheet.status === "Sent" ? "sent"', 'false ? "sent"')],
  ["a sent case has no handling line", CV, s => s.replace("sentLines: sendsOf(exports).map(x => x.line).filter(Boolean),", "sentLines: [],")],
  ["a resend may carry a different report", SD, s => s.replace('if (pdf && pdf.bytes && Buffer.compare(Buffer.from(pdf.bytes), stored) !== 0) return refuse("pdf_immutable", "This sheet already has a stored report PDF, and the one given is different.");', "")],
  ["a sheet that was never sent can be sent again", SD, s => s.replace('if (sheet.status !== "sent") return refuse("not_sent"', 'if (false) return refuse("not_sent"')]
];
function copyTree(dst) {
  for (const d of ["lib", "scripts", "public", "api", "data", "docs"]) if (fs.existsSync(path.join(ROOT, d))) fs.cpSync(path.join(ROOT, d), path.join(dst, d), { recursive: true, filter: s => !/node_modules|proofs/.test(s) });
  for (const f of ["package.json", "vercel.json"]) if (fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(dst, f));
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dst, "node_modules"));
}
const run = dir => { try { const o = execFileSync("node", ["scripts/caseSendCheck.mjs", dir], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 280000 }); return { red: false, out: o }; } catch (e) { return { red: true, out: String(e.stdout || "") + String(e.stderr || "") }; } };
let bad = 0; const only = process.argv[2] && /^\d+$/.test(process.argv[2]) ? Number(process.argv[2]) : null;
for (const [i, [name, file, fn]] of MUT.entries()) {
  if (only != null && only !== i) continue;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cs-")); copyTree(dir);
  const p = path.join(dir, file), before = fs.readFileSync(p, "utf8"), after = fn(before);
  if (after === before) { console.log("FAIL  mutation did not apply: " + name); bad++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
  fs.writeFileSync(p, after); const r = run(dir);
  console.log((r.red ? "ok  " : "FAIL") + `  [${i}] without the rule, the check goes red: ` + name + (r.red ? "  (" + (r.out.split("\n").find(l => /^FAIL/.test(l)) || r.out.split("\n").filter(Boolean).slice(-1)[0] || "").slice(0, 80) + ")" : ""));
  if (!r.red) bad++;
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`caseSendFailsWithout: ${bad ? bad + " PROBLEM" : "every mutation is caught"}`); process.exit(bad ? 1 : 0);
