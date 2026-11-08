// Each mutation below undoes ONE fix of Desk dry run 2 on a scratch copy of the tree; scripts/deskDryrun2Check.mjs must go red on every one (and be green on the real tree).
//   node scripts/deskDryrun2FailsWithout.mjs [only-a-number-to-run-one]
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { execFileSync } from "node:child_process"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const MUT = [
  ["1 an open sheet cannot be given more photos (no Add photos control)", "public/js/deskvals.js", s => s.replace('data-addphoto="1"', 'data-x="1"')],
  ["1 an added photo is not selected for the report", "lib/desk/sheetActions.js", s => s.replace("fresh.state = { ...fresh.state, photosSelected: [...(fresh.state.photosSelected || []), ph.id] }; ", "")],
  ["1 the first photo is not the cover", "lib/desk/sheetShape.js", s => s.replace("|| ph[0] || {}).id", "|| {}).id")],
  ["1 the PDF cover shows only a hero that was set (never the first photo)", "lib/desk/reportPdf.js", s => s.replace("find(p => p.id === coverOf(sheet.submission, st));", "find(p => p.id === st.heroId);")],
  ["1 the PDF car page has no photo strip", "lib/desk/reportPdf.js", s => s.replace("if (all.length) { label(", "if (false) { label(")],
  ["2 a click waits for the engine before it lights (no optimistic render)", "public/js/deskvals.js", s => s.replace('|| "mileage" in patch; renderAll(); }', '|| "mileage" in patch; }')],
  ["2 no working state while the engine reads", "public/js/deskvals.js", s => s.replace("(h.working ? '<div class=\"workline\"", "(false ? '<div class=\"workline\"")],
  ["2 a second press on a loading sheet opens it again", "public/js/deskvals.js", s => s.replace("if (S.opening[id]) return; S.opening[id] = true;", "S.opening[id] = true;")],
  ["2 the sheet shows nothing until it has loaded (no loading card)", "public/js/deskvals.js", s => s.replace("if (!S.sheets[id]) { S.sheets[id] = { loading: true,", "if (false) { S.sheets[id] = { loading: true,")],
  ["4 the marker does not start at the engine median", "public/js/deskvals.js", s => s.replace("(fig || mt.median)", "(fig || mt.low)")],
  ["4 the analyst line reads the wrong side of the median", "lib/desk/decisionRules.js", s => s.replace('(${f > md ? "plus" : f < md ? "minus"', '(${f > md ? "minus" : f < md ? "plus"')],
  ["4 the fixture meter ignores the picked tier's sales", "lib/desk/sheetShape.js", s => s.replace("median: med(mset)", "median: med(all)")],
  ["5 a thin tier's sales are not highlighted in the table", "lib/desk/sheetShape.js", s => s.replace("inTier: tooFew ? c.tier === tier : null, photo:", "inTier: null, photo:")],
  ["6 the decision is held against no range when the tier is thin", "lib/desk/decisionRules.js", s => s.replace("const mt = m.meter && Number(m.meter.low) > 0 && Number(m.meter.high) > 0 ? m.meter : null,", "const mt = null,")],
  ["6 the edge of the range counts as outside", "lib/desk/decisionRules.js", s => s.replace("given.reserve >= lowE && given.reserve <= highE", "given.reserve > lowE && given.reserve <= highE")],
  ["3 Live now ignores the picked body (the fixture shows one car for both)", "lib/desk/sheetShape.js", s => s.replace("const liveRows = openAsk ? [] : f.split ?", "const liveRows = openAsk ? [] : false ?")],
  ["7 the question keeps its old label with no hint", "public/js/deskvals.js", s => s.replace("Question for the seller (prints on the report)", "Pinned question (prints on the report)")],
  ["8 the engine's no-listing line is the old analyst's call line", "lib/conditionTier.js", s => s.replace("No listing for this car in the record, so the engine suggests no tier. Pick the tier the photos show.", "No listing for this car yet; the tier is the analyst's call")],
  ["8 the statement after a pick does not say the engine has no suggestion", "lib/conditionTier.js", s => s.replace('"no suggestion"}. Analyst:', '"none"}. Analyst:')]
];
function copyTree(dst) {
  for (const d of ["lib", "scripts", "public", "api", "data", "docs"]) if (fs.existsSync(path.join(ROOT, d))) fs.cpSync(path.join(ROOT, d), path.join(dst, d), { recursive: true, filter: s => !/node_modules|proofs/.test(s) });
  for (const f of ["package.json", "vercel.json"]) if (fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(dst, f));
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dst, "node_modules"));
}
const run = dir => { try { const o = execFileSync("node", ["scripts/deskDryrun2Check.mjs", dir], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 280000 }); return { red: false, out: o }; } catch (e) { return { red: true, out: String(e.stdout || "") + String(e.stderr || "") }; } };
let bad = 0; const only = process.argv[2] && /^\d+$/.test(process.argv[2]) ? Number(process.argv[2]) : null;
if (only == null) { const base = fs.mkdtempSync(path.join(os.tmpdir(), "d2-")); copyTree(base); const b0 = run(base); console.log((b0.red ? "FAIL" : "ok  ") + "  the real tree is green"); if (b0.red) { bad++; console.log(b0.out.split("\n").slice(-6).join("\n")); } fs.rmSync(base, { recursive: true, force: true }); }
for (const [i, [name, file, fn]] of MUT.entries()) {
  if (only != null && only !== i) continue;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "d2-")); copyTree(dir);
  const p = path.join(dir, file), before = fs.readFileSync(p, "utf8"), after = fn(before);
  if (after === before) { console.log("FAIL  mutation did not apply: " + name); bad++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
  fs.writeFileSync(p, after); const r = run(dir);
  console.log((r.red ? "ok  " : "FAIL") + `  [${i}] without the fix, the check goes red: ` + name + (r.red ? "  (" + (r.out.split("\n").find(l => /^FAIL/.test(l)) || r.out.split("\n").filter(Boolean).slice(-1)[0] || "").slice(0, 90) + ")" : ""));
  if (!r.red) bad++;
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`deskDryrun2FailsWithout: ${bad ? bad + " PROBLEM" : "every mutation is caught"}`); process.exit(bad ? 1 : 0);
