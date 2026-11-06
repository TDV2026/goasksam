// Each mutation below undoes ONE rule of the demo blockers fix on a scratch copy of the tree; scripts/deskBlockersCheck.mjs must go red on every one (and be green on the real tree).
//   node scripts/deskBlockersFailsWithout.mjs
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { execFileSync } from "node:child_process"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const MUT = [
  ["the range-less read throws on a tier click (the cluster is not guarded)", "lib/sheetRead.js", s => s.replace("isResult && Array.isArray(a.cluster) ? { low: a.cluster[0]", "isResult ? { low: a.cluster[0]")],
  ["a split pool still shows a median of the mix", "lib/sheetRead.js", s => s.replace("headlineOk = isResult && !a.pooledApart", "headlineOk = isResult")],
  ["a pick is ignored by the engine call", "lib/sheetRead.js", s => s.replace("({ ...r, ...p.refine }), {})", "({ ...r }), {})")],
  ["the engine's tier pool stops at the band (the whole pool is not carried)", "lib/onebox.js", s => s.replace("tierPoolCards: shapeCards(same).map(", "tierPoolCards: shapeCards(inBand).map(")],
  ["sales cut by the mileage band show null miles (the card's own field is not read)", "lib/sheetRead.js", s => s.replace("mileage: num(c.mi) > 0 && !c.milesHidden ? num(c.mi) : num(c.mileage ?? c.miles)", "mileage: num(c.mileage ?? c.miles)")],
  ["every sale is called in band", "lib/onebox.js", s => s.replace("inBand: !band || inBandSet.has(same[i])", "inBand: true")],
  ["the median is marked over the whole pool, not the band", "lib/sheetRead.js", s => s.replace("const bandCards = tierOk ? cardsOf.filter(c => c.inBand !== false) : cardsOf;", "const bandCards = cardsOf;")],
  ["the VIN's body is not preselected", "lib/sheetRead.js", s => s.replace("if (!isFailedRead(a) && vinFamily) {", "if (false) {")],
  ["a sheet with the question open can be finalised", "lib/desk/decisionRules.js", s => s.replace("if (q && q.selected == null) missing.push", "if (false) missing.push")],
  ["the no-listing line is the old engine line", "lib/sheetRead.js", s => s.replace(": NO_LISTING_LINE);", ": \"The engine holds no listing signals for this car, so it counted none.\");")],
  ["the draft PDF is built as a final report", "lib/desk/reportPdf.js", s => s.replace("{ fetchImage, onlyPage, draft = false } = {}) {", "{ fetchImage, onlyPage, draft: _d = false } = {}) { const draft = false;")],
  ["a draft is stored as an export", "lib/desk/sheetActions.js", s => s.replace("return { ok: true, draft: true, filename:", "await store.put(org, { ...sheet, exports: [...(sheet.exports || []), { at: now, seat, reportNumber: \"x\" }] }); return { ok: true, draft: true, filename:")],
  ["a draft needs a finalised sheet", "lib/desk/sheetActions.js", s => s.replace("body.draft === true && !sheet.final", "false")],
  ["the pick is not saved", "lib/desk/sheetActions.js", s => s.replace("if (\"picks\" in p) { s.state.picks = sanitizePicks(p.picks); reread = true; }", "if (\"picks\" in p) { reread = true; }")],
  ["a failed re-read is passed off as the answer to the click", "lib/desk/sheetActions.js", s => s.replace("else retrySave = { retry: true, retryAfterMs: null,", "else retrySave = null && { retry: true, retryAfterMs: null,")],
  ["after a tier is picked the note still says Pick a condition tier", "lib/sheetRead.js", s => s.replace(": openAsk ? [openAsk.reason, `Pick the ${openAsk.noun} and the tier pool is read for it.`].filter(Boolean).join(\" \") :", ": openAsk ? \"Pick a condition tier for a starting figure.\" :")],
  ["the page does not print the question under the tier", "public/js/deskvals.js", s => s.replace("if (cd.state === \"needs_choice\") inner += asksHtml(rd.market, dis) +", "if (cd.state === \"needs_choice\") inner += ")],
  ["the page does not print the question in the market", "public/js/deskvals.js", s => s.replace("inner += asksHtml(m, dis || \"\");", "")],
  ["the PDF does not mark the band", "lib/desk/reportPdf.js", s => s.replace("if (s.inBand != null) T(s.inBand ?", "if (false) T(s.inBand ?")],
  ["the PDF leaves the empty evidence unexplained", "lib/desk/reportPdf.js", s => s.replace("else if (cd.selected && cd.carEvidenceNote) {", "else if (false) {")],
  ["the page has no draft button", "public/js/deskvals.js", s => s.replace("data-pdf=\"draft\"", "data-x=\"draft\"")]
];
function copyTree(dst) {
  for (const d of ["lib", "scripts", "public", "api", "data", "docs"]) if (fs.existsSync(path.join(ROOT, d))) fs.cpSync(path.join(ROOT, d), path.join(dst, d), { recursive: true, filter: s => !/node_modules|proofs/.test(s) });
  for (const f of ["package.json", "vercel.json"]) if (fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(dst, f));
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dst, "node_modules"));
}
const run = dir => { try { const o = execFileSync("node", ["scripts/deskBlockersCheck.mjs", dir], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 150000 }); return { red: false, out: o }; } catch (e) { return { red: true, out: String(e.stdout || "") + String(e.stderr || "") }; } };
let bad = 0;
const base = fs.mkdtempSync(path.join(os.tmpdir(), "db-")); copyTree(base);
const b0 = run(base); console.log((b0.red ? "FAIL" : "ok  ") + "  the real tree is green"); if (b0.red) { bad++; console.log(b0.out.split("\n").slice(-6).join("\n")); }
for (const [name, file, fn] of MUT) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "db-")); copyTree(dir);
  const p = path.join(dir, file), before = fs.readFileSync(p, "utf8"), after = fn(before);
  if (after === before) { console.log("FAIL  mutation did not apply: " + name); bad++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
  fs.writeFileSync(p, after); const r = run(dir);
  console.log((r.red ? "ok  " : "FAIL") + "  without the fix, the check goes red: " + name + (r.red ? "  (" + (r.out.split("\n").find(l => /^FAIL/.test(l)) || r.out.split("\n").filter(Boolean).slice(-1)[0] || "").slice(0, 90) + ")" : ""));
  if (!r.red) bad++;
  fs.rmSync(dir, { recursive: true, force: true });
}
fs.rmSync(base, { recursive: true, force: true });
console.log(`deskBlockersFailsWithout: ${bad ? bad + " PROBLEM" : "every mutation is caught"}`); process.exit(bad ? 1 : 0);
