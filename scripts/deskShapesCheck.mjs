// Desk v3 shapes Lane E builds on: case.stage, case.queue, case.handling.lines, all made on the server. node scripts/deskShapesCheck.mjs [rootDir]
import path from "node:path"; import { pathToFileURL } from "node:url"; import fs from "node:fs";
const root = path.resolve(process.argv[2] || "."), imp = f => import(pathToFileURL(path.join(root, f)).href);
const M = await imp("lib/desk/caseModel.js"), V = await imp("lib/desk/caseView.js"), D = await imp("lib/desk/caseDemo.js"), A = await imp("lib/desk/sheetActions.js"), { memoryStore } = await imp("lib/desk/sheetStore.js");
let pass = 0, fail = 0; const ok = (n, c) => { if (c) pass++; else { fail++; console.log("FAIL " + n); } };
const T = "2026-11-08T10:00:00.000Z";
ok("the stages are exactly new, review, ready, final", M.STAGES.join() === "new,review,ready,final");
ok("every stored status maps to a stage, and no two share one", M.CASE_STATUS.map(s => M.STAGE_OF[s]).join() === "new,review,ready,final");
// a mixed org: the page is told the counts, none are worked out from the list
const mk = (id, status, extra = {}) => ({ id, created_at: T, submission: { typed: true, photos: [], documents: [] }, case: { ...M.newCase({ now: T }), status, ...extra } });
const sheets = [mk("a", "new"), mk("b", "new"), mk("c", "in_review"), mk("d", "ready"), mk("e", "finalized", { finalized_at: T, handling_seconds: 600 }), mk("f", "finalized", { finalized_at: "2026-11-07T10:00:00Z", handling_seconds: 1200, version: 2 }), mk("g", "in_review", { version: 3 })];
const q = V.queueCounts(sheets, T);
ok("the rail counts are 2 new, 2 review, 1 ready, 2 final", q.new === 2 && q.review === 2 && q.ready === 1 && q.final === 2);
ok("the counts add up to the cases", q.new + q.review + q.ready + q.final === sheets.length);
const h = V.handlingLines(sheets, T);
ok("the operations block has four lines, each a label and a value", h.length === 4 && h.every(l => typeof l.label === "string" && typeof l.value === "string"));
ok("the four labels are the four named", h.map(l => l.label).join("|") === "Reports finalized today|Median handling time|Cases needing more from the seller|Reports revised after finalizing");
ok("one report finalized today", h[0].value === "1");
ok("the median handling time is worded (10 min and 20 min give 15 min)", h[1].value === "15 min");
ok("one report revised after finalizing (a draft at version 3 is not one)", h[3].value === "1");
ok("with no cases the lines say none yet and never divide by zero", V.handlingLines([], T)[1].value === "none yet" && V.handlingLines([], T)[2].value === "none yet");
ok("no per analyst figure rides on the lines", !/seat|analyst|owner/i.test(JSON.stringify(h)));
const demo = D.demoCase();
ok("the demonstration case is the 1999 Porsche 911 Carrera, lead HM-24117", demo.lead_ref === "HM-24117" && demo.fields.year.value === 1999 && demo.fields.model.value === "911" && demo.fields.trim.value === "Carrera");
ok("the demonstration case has a conflict-free VIN, a decoded generation, two photos, one outstanding document, two needs", demo.fields.vin.value && demo.fields.generation.source === "vin_decoded" && demo.photos.items.length === 2 && demo.documents[0].status === "outstanding" && demo.needs_review.length === 2);
ok("the demonstration case carries no figure", demo.assessment.figure === null && demo.reserve.figure === null);
// through the action the page calls
const store = memoryStore(), ctx = { org: "t", seat: "crew", store, now: T, env: {} };
await store.insert("t", { id: "lead1", owner_seat: "crew", status: "New", created_at: T, submission: { typed: false, mileage: 61200, consignor: { name: "Hal" }, photos: [], documents: [] }, state: {}, case: D.demoCase() });
await A.handleSheetAction("case_new", {}, ctx);
const g = await A.handleSheetAction("case_get", { id: "lead1" }, ctx);
ok("case_get serves stage, queue and handling.lines with the case", g.case.stage === "new" && g.case.queue.new === 2 && g.case.handling.lines.length === 4 && g.case.lead_ref === "HM-24117");
// the class: the page counts nothing
const page = fs.existsSync(path.join(root, "public/js/deskvals.js")) ? fs.readFileSync(path.join(root, "public/js/deskvals.js"), "utf8") : "";
ok("the Desk page does not count cases itself", !/\.queue\.(new|review|ready|final)\s*[+\-]|handling\.lines\.(reduce|filter)|filter\(function\s*\(\w+\)\s*\{\s*return \w+\.stage/.test(page));
console.log(`deskShapesCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
