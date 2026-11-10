// Each mutation undoes ONE rule of the forwarded lead becoming a case on a scratch copy of the tree; scripts/intakeToCaseCheck.mjs must go red on every one (and be green on the real tree).
//   node scripts/intakeToCaseFailsWithout.mjs [only-a-number-to-run-one]
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { execFileSync } from "node:child_process"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const RUN = "lib/desk/intake/run.js", TCm = "lib/desk/intake/toCase.js";
const MUT = [
  ["a forwarded lead makes no case (the bare row it was)", RUN, s => s.replace("if (created) caseMade = (await attachCase(", "if (false) caseMade = (await attachCase(")],
  ["the seller's fields are marked verified", TCm, s => s.replace('source: "seller", origin: "forwarded" });', 'source: "analyst_verified", origin: "forwarded" });')],
  ["the VIN's decode fills nothing", TCm, s => s.replace('if (car && car.source !== "typed") for', "if (false) for")],
  ["the case is not marked forwarded", TCm, s => s.replace('source: "seller", origin: "forwarded" });', 'source: "seller", origin: null });')],
  ["a car that is not identified has no needs attention line", "lib/desk/caseWorkflow.js", s => s.replace("applies: c => !(c.fields.vin.value || (c.fields.year.value && c.fields.make.value && c.fields.model.value)) },", "applies: c => false },")],
  ["the original email's address is never signed", "lib/desk/storage.js", s => s.replace("se = sub.sourceEmail && sub.sourceEmail.path ? await one(sub.sourceEmail) : sub.sourceEmail;", "se = sub.sourceEmail;")],
  ["the sheet does not carry the original email's path", "lib/desk/intake/toSheet.js", s => s.replace("...(row.source_email_path ? { sourceEmail:", "...(false ? { sourceEmail:")],
  ["the seller's phone is not read", "lib/desk/intake/parse.js", s => s.replace("phone: findPhone(consignorBodyOf(messages, internalEmails) || text),", "phone: null,")],
  ["the seller's ask line is typed by hand", "lib/desk/caseView.js", s => s.replace('reasonLine("case.reserve.seller_ask", { figure: c.seller.asking_price })', '"The seller asked for $" + c.seller.asking_price + "."')],
  ["a later email is not merged into the case", RUN, s => s.replace("else if (addedTo) await mergeIntoCase(", "else if (false) await mergeIntoCase(")],
  ["a later email rebuilds the case from scratch (the analyst's edits are lost)", TCm, s => s.replace("let c = row.case, nP = 0, nD = 0;", "let c = caseFromLead({ orgId, sheet: row, read, car: null, receivedAt }), nP = 0, nD = 0;")],
  ["the engine is read once and a case edited meanwhile is given up on", TCm, s => s.replace("attempt < 2", "attempt < 1")],
  ["the background read never asks the engine", TCm, s => s.replace("await openCaseRead(c, readSheet, { caseDate: at.slice(0, 10), now: at });", "{ recalled: false };")],
  ["an unknown sender is let through", RUN, s => s.replace('if (!seat) return finish("dropped_not_seat"', 'if (false) return finish("dropped_not_seat"')],
  ["the same email twice is not claimed", RUN, s => s.replace("if (!claim.claimed) return", "if (false) return")],
  ["a car nobody named is sent to the engine", TCm, s => s.replace('if (!(f("vin") || (f("year") && f("make") && f("model")))) return', "if (false) return")]
];
function copyTree(dst) {
  for (const d of ["lib", "scripts", "public", "api", "data", "docs"]) if (fs.existsSync(path.join(ROOT, d))) fs.cpSync(path.join(ROOT, d), path.join(dst, d), { recursive: true, filter: s => !/node_modules|proofs/.test(s) });
  for (const f of ["package.json", "vercel.json"]) if (fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(dst, f));
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dst, "node_modules"));
}
const run = dir => { try { const o = execFileSync("node", ["scripts/intakeToCaseCheck.mjs", dir], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 280000 }); return { red: false, out: o }; } catch (e) { return { red: true, out: String(e.stdout || "") + String(e.stderr || "") }; } };
let bad = 0; const only = process.argv[2] && /^\d+$/.test(process.argv[2]) ? Number(process.argv[2]) : null;
for (const [i, [name, file, fn]] of MUT.entries()) {
  if (only != null && only !== i) continue;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ic-")); copyTree(dir);
  const p = path.join(dir, file), before = fs.readFileSync(p, "utf8"), after = fn(before);
  if (after === before) { console.log("FAIL  mutation did not apply: " + name); bad++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
  fs.writeFileSync(p, after); const r = run(dir);
  console.log((r.red ? "ok  " : "FAIL") + `  [${i}] without the rule, the check goes red: ` + name + (r.red ? "  (" + (r.out.split("\n").find(l => /^FAIL/.test(l)) || r.out.split("\n").filter(Boolean).slice(-1)[0] || "").slice(0, 80) + ")" : ""));
  if (!r.red) bad++;
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`intakeToCaseFailsWithout: ${bad ? bad + " PROBLEM" : "every mutation is caught"}`); process.exit(bad ? 1 : 0);
