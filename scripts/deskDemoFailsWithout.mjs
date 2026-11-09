// Each mutation below undoes ONE rule of the tier ladder / analyst mark change on a scratch copy of the tree; scripts/deskDemoCheck.mjs must go red on every one (and be green on the real tree).
//   node scripts/deskDemoFailsWithout.mjs
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { execFileSync } from "node:child_process"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const MUT = [
  ["the preview answers the 996's sales for any car", "lib/preview/deskV3Fixture.js", s => s.replace("  if (!isDemoCar(input)) return null;", "")],
  ["the preview's engine stand-in ignores the tier", "lib/preview/deskV3Fixture.js", s => s.replace("tierOut = tier && t !== tier;", "tierOut = false;")],
  ["a listed preview case has no stored case (the seeding is skipped)", "lib/preview/deskPreview.js", s => s.replace("if (row.case) continue;", "continue;")],
  ["the demonstration case is stored only when a page renders (not at the first read)", "lib/preview/deskPreview.js", s => s.replace("await store.insert(PREVIEW_ORG.id, { id: DEMO_ID,", "if (false) await store.insert(PREVIEW_ORG.id, { id: DEMO_ID,")],
  ["a draft report refuses a sheet that has no stored case", "lib/desk/sheetActions.js", s => s.replace('if (!s0.case && body.draft !== true) return refuse', 'if (!s0.case) return refuse')],
  ["a new sheet is named from the read's raw label, not the shared naming", "lib/desk/sheetActions.js", s => s.replace("(carLabel(read.car.decode) || read.car.label)", "read.car.label")],
  ["a typed sheet is not asked of the engine", "lib/desk/sheetActions.js", s => s.replace("(s.typedText ? { text: s.typedText, ...extra } : null)", "null")],
  ["the miles typed at the top are dropped", "lib/desk/sheetActions.js", s => s.replace("submission: { typed: true, mileage: miles,", "submission: { typed: true, mileage: null,")],
  ["a file that is not a picture is accepted", "lib/desk/sheetActions.js", s => s.replace("if (!(isJpg || isPng || isWebp))", "if (false)")],
  ["no limit on photos", "lib/desk/sheetActions.js", s => s.replace("if ((s0.submission.photos || []).length >= MAX_HAND_PHOTOS)", "if (false)")],
  ["another seat may add a photo", "lib/desk/sheetActions.js", s => s.replace("if (!accessOf(s0, seat).canEdit) return refuse(accessOf(s0, seat).why || \"This sheet is read only to you.\");", "")],
  ["the PDF ignores the org colour", "lib/desk/reportPdf.js", s => s.replace("accentOf((fin.org && fin.org.color) || org.color)", "GREEN_DEFAULT")],
  ["the PDF file carries GoAskSam again", "lib/pdf/mini.js", s => s.replace("/Producer (Valuation report writer)", "/Producer (GoAskSam Desk)")],
  ["the email loses the org colour", "lib/desk/send.js", s => s.replace("border-bottom:3px solid ${accent};font-weight:600;color:${accent}", "font-weight:600")],
  ["the colour is not frozen at finalise", "lib/desk/sheetActions.js", s => s.replace("color: set.color || null } }, events:", "color: null } }, events:")],
  ["the PDF stops at 24 sales", "lib/desk/reportPdf.js", s => s.replace("(m.comparables || [])) {", "(m.comparables || []).slice(0, 24)) {")],
  ["the median is not marked in the PDF", "lib/desk/reportPdf.js", s => s.replace('if (s.mid) T(', 'if (false) T(')],
  ["the PDF does not say the starting figure is the median", "lib/desk/reportPdf.js", s => s.replace("is taken from the ${countNoun(num(cd.bandCount), \"sale\", { words: false })} below", "is a figure")],
  ["the read stops marking the median", "lib/sheetRead.js", s => s.replace('(lo === hi ? "median" : "middle")', "null")],
  ["the read cuts the pool to twelve", "lib/sheetRead.js", s => s.replace("cardsOf.slice(0, tierOk ? MAX_PROOF_ROWS : 12)", "cardsOf.slice(0, 12)")],
  ["the page cuts the median line", "public/js/deskvals.js", s => s.replace("esc(rd.condition.proofLine) + \" The sale marked Median", "esc(\"\") + \" The sale marked Median")],
  ["the org settings do not read the org's logo and colour", "lib/desk/sheetActions.js", s => s.replace("desk_org_settings?org_id=", "desk_org_settingsX?org_id=")],
  ["any text is a brand colour", "lib/desk/orgSettings.js", s => s.replace("!/^#[0-9a-fA-F]{6}$/.test(v.trim())", "false")],
  ["the queue row loses its finalised date", "lib/desk/sheetStore.js", s => s.replace("finalisedOn: s.final && s.final.finalisedAt", "finalisedOnX: s.final && s.final.finalisedAt")],
  ["My reports is a flat list again", "public/js/deskvals.js", s => s.replace("S.lists.mine) +", "S.lists.mine) .replace(/Drafts/g, \"\") +").replace("reportsHtml(S.lists.mine)", "listHtml(S.lists.mine)")],
  ["the ladder is numbered again, Untiered becomes a fifth", "public/js/deskvals.js", s => s.replace('<ul class="ladder"', '<ol class="ladder"')],
  ["the proof sentence prints with no pool count", "public/js/deskvals.js", s => s.replace("m.meter && m.meter.basis === \"tier\" && rd.condition.proofLine", "m.meter")],
  ["the preview reads any text", "lib/preview/deskPreview.js", s => s.replace("sheet_new\" && !FIXTURE_VINS", "sheet_new\" && false && !FIXTURE_VINS")]
];
function copyTree(dst) {
  for (const d of ["lib", "scripts", "public", "api", "data", "docs"]) if (fs.existsSync(path.join(ROOT, d))) fs.cpSync(path.join(ROOT, d), path.join(dst, d), { recursive: true, filter: s => !/node_modules|proofs/.test(s) });
  for (const f of ["package.json", "vercel.json"]) if (fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(dst, f));
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dst, "node_modules"));
}
const run = dir => { try { const o = execFileSync("node", ["scripts/deskDemoCheck.mjs", dir], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 110000 }); return { red: false, out: o }; } catch (e) { return { red: true, out: String(e.stdout || "") + String(e.stderr || "") }; } };
let bad = 0;
const base = fs.mkdtempSync(path.join(os.tmpdir(), "dm-")); copyTree(base);
const b0 = run(base); console.log((b0.red ? "FAIL" : "ok  ") + "  the real tree is green"); if (b0.red) { bad++; console.log(b0.out.split("\n").slice(-6).join("\n")); }
for (const [name, file, fn] of MUT) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dm-")); copyTree(dir);
  const p = path.join(dir, file), before = fs.readFileSync(p, "utf8"), after = fn(before);
  if (after === before) { console.log("FAIL  mutation did not apply: " + name); bad++; continue; }
  fs.writeFileSync(p, after); const r = run(dir);
  console.log((r.red ? "ok  " : "FAIL") + "  without the fix, the check goes red: " + name + (r.red ? "  (" + (r.out.split("\n").find(l => /^FAIL/.test(l)) || r.out.split("\n").filter(Boolean).slice(-1)[0] || "").slice(0, 90) + ")" : ""));
  if (!r.red) bad++;
  fs.rmSync(dir, { recursive: true, force: true });
}
fs.rmSync(base, { recursive: true, force: true });
console.log(`deskDemoFailsWithout: ${bad ? bad + " PROBLEM" : "every mutation is caught"}`); process.exit(bad ? 1 : 0);
