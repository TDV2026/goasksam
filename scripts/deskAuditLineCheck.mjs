// EVERY AUDIT ENTRY CARRIES ITS OWN SENTENCE (Lane D, Nov 9 2026). CLASS: a sentence the page prints that the workflow typed or built from raw parts. Every writer of case.audit goes through logAudit, which builds `line` from a reasonWords line (moneyWords inside it); the page prints `line` as carried.
//   node scripts/deskAuditLineCheck.mjs [rootDir]
import path from "node:path"; import fs from "node:fs"; import { pathToFileURL } from "node:url"; import { setup } from "./_deskCaseWorld.mjs";
const root = path.resolve(process.argv[2] || "."), { M, K, readyCase, T, read, today } = await setup(root), imp = f => import(pathToFileURL(path.join(root, f)).href), RW = await imp("lib/reasonWords.js");
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) pass++; else { fail++; console.log("FAIL " + n + (d ? "  " + d : "")); } };
// a case taken through every road that writes the trail
let c = await readyCase();
c = K.correctField(c, "mileage", 70000, { now: T }); c = K.correctField(c, "colour", "Black", { now: T }); c = K.verify(c, "mileage", { now: T });
c = M.markAsked(c, ["trim", "generation"], T); c = K.addCasePhoto(c, { id: "p9", name: "x.jpg" }, T); c = K.setCover(c, "p9", T); c = K.selectPhotos(c, ["p9", "ph1"], T);
for (const scope of M.EXCLUSION_SCOPES) c = M.excludeSale(c, { saleId: "s-" + scope, scope, reason: "A reason", now: T });
c = M.setField(c, "trim", "Carrera 4", "seller", { by: "analyst", now: T });
const seeded = K.seedAssessment({ ...structuredClone(c), assessment: { figure: null, low: null, high: null, explanation: "", source: null } }, T);
const cleared = K.seedAssessment({ ...structuredClone(seeded), desk: { ...seeded.desk, evidence: { ...seeded.desk.evidence, insufficient: true, median: null } } }, T);
const taken = K.setAssessment(seeded, { figure: 58500 }, T), takenBlank = K.setAssessment({ ...structuredClone(c), assessment: { ...c.assessment, figure: null, source: null } }, { figure: 1 }, T);
const fin = K.finalize(await readyCase(), { now: T, seat: "ava" }), reopened = fin.ok ? K.setReserve(fin.case, { figure: 5 }, T) : null;
const all = [c, seeded, cleared, taken, takenBlank, ...(fin.ok ? [fin.case, reopened] : [])].flatMap(x => x.audit);
ok("every road wrote a trail to read (corrected, verified, asked, photo, cover, selected, three exclusions, seeded, cleared, taken over, finalized, reopened)", new Set(all.map(a => a.what)).size >= 14, [...new Set(all.map(a => a.what))].join(" | "));
ok("every audit entry carries its own sentence, line, and it ends in a full stop", all.length > 0 && all.every(a => typeof a.line === "string" && /[A-Za-z].*\.$/.test(a.line)), JSON.stringify(all.filter(a => !a.line).map(a => a.what)));
ok("no sentence carries a bare figure: a dollar amount is grouped by moneyWords and no number of four digits or more stands ungrouped", all.every(a => !/(^|[^\d,$])\d{4,}(?![\d,])/.test(a.line)) && all.every(a => !/\$\d{4,}/.test(a.line)), all.map(a => a.line).filter(l => /(^|[^\d,$])\d{4,}/.test(l) || /\$\d{4,}/.test(l)).join(" | "));
ok("the dollar figure in the assessment lines is moneyWords of the entry's own figure", [seeded, taken].every(x => { const a = x.audit.find(e => /assessment/.test(e.what)); const f = /taken/.test(a.what) ? a.from : a.to; return a.line.includes(RW.moneyWords(f)); }));
ok("a correction names the field and both values in words (mileage as miles)", all.some(a => a.what === "corrected" && a.field === "mileage" && /Mileage corrected from 61,400 miles to 70,000 miles\./.test(a.line)));
// the class: no writer pushes to the trail directly
const files = fs.readdirSync(path.join(root, "lib/desk")).filter(f => f.endsWith(".js")).map(f => "lib/desk/" + f), direct = [];
for (const f of files) { const src = fs.readFileSync(path.join(root, f), "utf8"); src.split("\n").forEach((l, i) => { if (/\baudit\.push\(/.test(l) && !/^export function logAudit/.test(l.trim())) direct.push(f + ":" + (i + 1)); }); }
ok("no writer pushes to case.audit directly (every entry goes through logAudit)", direct.length === 0, direct.join(" "));
// the page prints the line as carried
const page = fs.readFileSync(path.join(root, "lib/preview/deskV3.js"), "utf8"), aud = page.slice(page.indexOf("Audit trail"), page.indexOf("Audit trail") + 700);
ok("the page prints each audit entry's line as carried, never its parts", /esc\(x\.line/.test(aud) && !/x\.from|x\.to\b|esc\(x\.field\)/.test(aud));
console.log(`deskAuditLineCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
