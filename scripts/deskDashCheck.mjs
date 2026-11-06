// DESK COPY HAS NO DASH (Lane D, Nov 2026; Sam's rule: no em or en dash in anything a user reads). The cause of the two found in the dry run read: copy was written inline in code (an interpreter refusal, a generation label)
// and nothing scanned for the character, so it was only ever caught by eye. This covers the CLASS: every source file of the Desk (lib/desk, the Valuations and analyst pages, the Desk endpoints, the tier and sheet read files)
// may not hold an em dash or an en dash outside a comment, and the things that RENDER (the PDF, the email, the Send message, the sheet read) carry none in their output.
//   node scripts/deskDashCheck.mjs [repo root]        (scripts/deskDashFailsWithout.mjs: each mutant must turn it red)
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(ROOT);
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const DASH = /[–—]/;
const files = [];
const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.js$/.test(e.name)) files.push(p); } };
walk("lib/desk");
for (const f of ["public/js/deskvals.js", "public/js/desk.js", "lib/conditionTier.js", "lib/sheetRead.js", "lib/pdf/mini.js"]) if (fs.existsSync(f)) files.push(f);
for (const e of fs.readdirSync("api")) if (/^desk.*\.js$/.test(e)) files.push(path.join("api", e));
// code only: block comments and line comments out. A dash left is in a string, a template or a pattern, i.e. in something that can reach a user.
const codeOf = src => src.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " ")).split("\n").map(l => l.replace(/(^|\s)\/\/.*$/, "$1")).join("\n");
// lib/pdf/mini.js is the converter that maps a dash to a hyphen; it names the characters on purpose.
const EXEMPT = new Set([path.join("lib", "pdf", "mini.js")]);
const bad = [];
for (const f of files) { if (EXEMPT.has(f)) continue; const code = codeOf(fs.readFileSync(f, "utf8")).split("\n"); code.forEach((l, i) => { if (DASH.test(l)) bad.push(`${f}:${i + 1}`); }); }
ok(bad.length === 0, "no em or en dash in Desk code outside comments: " + bad.join(", "));
ok(files.length > 30, "the scan covered the Desk (" + files.length + " files)");
// what renders
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const SS = await imp("lib/desk/sheetStore.js"), A = await imp("lib/desk/sheetActions.js"), RP = await imp("lib/desk/reportPdf.js"), PM = await imp("lib/pdf/mini.js"), SD = await imp("lib/desk/send.js"), { seed } = await imp("scripts/deskValsRender.mjs");
const store = SS.memoryStore(), org = "dash-org", sent = [];
const cx = () => ({ now: "2026-11-06T12:00:00.000Z", env: {}, org, seat: "ava", store, orgSettings: { name: "Hagerty Marketplace", logo: null, monthlyExportCap: 50, standardMessage: "Thank you for sending your car. The valuation report is attached." }, send: async p => { sent.push(p); return { ok: true, subject: "s" }; } });
const sh = await seed(store, { seat: "ava", org }); await A.handleSheetAction("sheet_open", { id: sh.id }, cx());
await A.handleSheetAction("sheet_save", { id: sh.id, patch: { tier: 2, decision: { mode: "reserve", reserve: "68000", reasons: [], otherText: "", line: "", guardLines: {}, note: "A note." } } }, cx());
await A.handleSheetAction("sheet_finalise", { id: sh.id }, cx());
const fin = await store.get(org, sh.id);
const rawPdf = Buffer.from((await RP.buildReport(fin, { name: "Hagerty Marketplace", logo: null }, {})).bytes).toString("latin1");
const pdfText = PM.pdfPages((await RP.buildReport(fin, { name: "Hagerty Marketplace", logo: null }, {})).bytes).map(p => p.join(" | ")).join("\n");
ok(!DASH.test(pdfText) && !DASH.test(rawPdf), "the PDF carries no em or en dash");
const msg = SD.composeMessage({ org: { name: "Hagerty Marketplace" }, settings: { signature: "Ann, Hagerty" }, message: "Thank you for sending your car.", note: "Engine: tier 2. Analyst: 2 plus. A reason." });
ok(!DASH.test(msg.text) && !DASH.test(msg.html), "the Send email (text and html) carries no dash");
ok(!DASH.test(SD.defaultSubject({ name: "Hagerty Marketplace" }, {}, { car_label: "2008 Porsche 911 Carrera S" })), "the default subject carries no dash");
const view = await A.handleSheetAction("sheet_open", { id: sh.id }, cx());
ok(!DASH.test(JSON.stringify({ ladder: view.ladder, reasons: view.reasons, checklist: view.checklist, sections: view.sections, checkStates: view.checkStates, evaluation: view.evaluation })), "the sheet view's fixed copy (ladder, sections, checklist, reasons, evaluation) carries no dash");
console.log(`deskDashCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
