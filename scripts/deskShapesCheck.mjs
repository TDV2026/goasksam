// Desk v3 shapes Lane E builds on: case.stage, case.queue, case.handling.lines, all made on the server. node scripts/deskShapesCheck.mjs [rootDir]
import path from "node:path"; import { pathToFileURL } from "node:url"; import fs from "node:fs";
const root = path.resolve(process.argv[2] || "."), imp = f => import(pathToFileURL(path.join(root, f)).href);
const M = await imp("lib/desk/caseModel.js"), V = await imp("lib/desk/caseView.js"), D = await imp("lib/desk/caseDemo.js"), A = await imp("lib/desk/sheetActions.js"), { memoryStore } = await imp("lib/desk/sheetStore.js");
let pass = 0, fail = 0; const ok = (n, c) => { if (c) pass++; else { fail++; console.log("FAIL " + n); } };
const T = "2026-11-08T10:00:00.000Z";
ok("the stages are exactly new, review, ready, final, sent, archived (sent is the sheet's own state, not a case status)", M.STAGES.join() === "new,review,ready,final,sent,archived");
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
ok("the demonstration case has a conflict-free VIN, a decoded generation, six photos, one outstanding document, two needs", demo.fields.vin.value && demo.fields.generation.source === "vin_decoded" && demo.photos.items.length === 6 && demo.documents[0].status === "outstanding" && demo.needs_review.length === 2);
ok("the demonstration case carries no figure", demo.assessment.figure === null && demo.reserve.figure === null);
// through the action the page calls
const store = memoryStore(), ctx = { org: "t", seat: "crew", store, now: T, env: {} };
await store.insert("t", { id: "lead1", owner_seat: "crew", status: "New", created_at: T, submission: { typed: false, mileage: 61200, consignor: { name: "Hal" }, photos: [], documents: [] }, state: {}, case: D.demoCase() });
await A.handleSheetAction("case_new", {}, ctx);
const g = await A.handleSheetAction("case_get", { id: "lead1" }, ctx);
ok("case_get serves stage, queue and handling.lines with the case", g.case.stage === "new" && g.case.queue.new === 2 && g.case.handling.lines.length === 4 && g.case.lead_ref === "HM-24117");

// LANE E'S THREE FIELDS: photo ops through case_edit, the lines on caseView, vehicle.mileageLine
{ const { setup } = await import("./_deskCaseWorld.mjs"), world = await setup(root), K = world.K, base = await world.readyCase(), st2 = memoryStore(), cx = { org: "t", seat: "crew", store: st2, now: T, env: {} }, J = x => JSON.stringify(x);
  await st2.insert("t", { id: "p1", owner_seat: "crew", status: "In progress", created_at: T, submission: { typed: true, photos: [], documents: [] }, state: {}, case: base, version: 1 });
  const jpg = (await (await import("sharp")).default({ create: { width: 64, height: 48, channels: 3, background: "#446688" } }).jpeg().toBuffer()).toString("base64");   // a real picture: the server now reads and converts every photo (a header with junk after it is refused as unreadable)
  const add = await A.handleSheetAction("case_edit", { id: "p1", op: "photo_add", name: "side.jpg", data: jpg }, cx);
  ok("case_edit photo_add adds a photo to the case, append only", add.ok && add.case.photos.items.length === base.photos.items.length + 1 && add.case.photos.items.some(p => p.name === "side.jpg") && add.case.photos.reportIds.length === base.photos.reportIds.length + 1, J(add).slice(0, 160));
  ok("the photo is also on the sheet's submission, so the old strip and the report see it", (await st2.get("t", "p1")).submission.photos.length === 1);
  ok("photo_add refuses a file that is not a photo", (await A.handleSheetAction("case_edit", { id: "p1", op: "photo_add", name: "x.jpg", data: Buffer.from("hello").toString("base64") }, cx)).refused === true);
  const newId = add.case.photos.items[add.case.photos.items.length - 1].id;
  const cov = await A.handleSheetAction("case_edit", { id: "p1", op: "cover", photoId: newId }, cx);
  ok("case_edit cover makes that photo the cover and logs it", cov.ok && cov.case.photos.coverId === newId && cov.case.audit.some(a => a.what === "cover set"));
  ok("a cover that is not a photo of the case is refused", (await A.handleSheetAction("case_edit", { id: "p1", op: "cover", photoId: "nope" }, cx)).refused === true);
  const oldId = base.photos.items[0].id, sel = await A.handleSheetAction("case_edit", { id: "p1", op: "report_photos", ids: [oldId] }, cx);
  ok("case_edit report_photos selects the report photos and keeps the cover in", sel.ok && sel.case.photos.reportIds.includes(newId) && sel.case.photos.reportIds.includes(oldId) && sel.case.photos.items.length === add.case.photos.items.length);
  ok("none of the three re-calls the engine", !K.needsRecall(K.addCasePhoto(base, { id: "zz", name: "z" }, T)) && !K.needsRecall(K.setCover(base, base.photos.items[0].id, T)) && !K.needsRecall(K.selectPhotos(base, [], T)));
  // the lines on caseView
  const v = (await A.handleSheetAction("case_get", { id: "p1" }, cx)).case, rsv = (await import(pathToFileURL(path.resolve(root, "lib/desk/reportState.js")).href)).reportState(v);
  ok("assessment.differenceLine is on the case and is the report's own line", typeof v.assessment.differenceLine === "string" && v.assessment.differenceLine === rsv.differenceLine && /market reference of \$/.test(v.assessment.differenceLine), v.assessment.differenceLine);
  ok("reserve.positionLine is on the case and is the report's own line", typeof v.reserve.positionLine === "string" && v.reserve.positionLine === rsv.reservePositionLine && v.reserve.position === rsv.reservePosition);
  ok("vehicle.mileageLine is the mileage in words", v.vehicle.mileageLine === "61,400 miles", v.vehicle.mileageLine);
  const blank = (await A.handleSheetAction("case_new", {}, cx)).case;
  ok("a case with no figures or mileage has none of the three lines (null, never blank text)", blank.assessment.differenceLine === null && blank.reserve.positionLine === null && blank.vehicle.mileageLine === null);
}
// the class: the page counts nothing
const page = fs.existsSync(path.join(root, "public/js/deskvals.js")) ? fs.readFileSync(path.join(root, "public/js/deskvals.js"), "utf8") : "";
ok("the Desk page does not count cases itself", !/\.queue\.(new|review|ready|final)\s*[+\-]|handling\.lines\.(reduce|filter)|filter\(function\s*\(\w+\)\s*\{\s*return \w+\.stage/.test(page));
// ---------- the shapes Lane E's walkthrough reads from case_new, photo_add and a condition change (Lane D, Nov 9 2026)
{ const FX = await imp("lib/preview/deskV3Fixture.js"), store = memoryStore(), calls = [], ctx = { now: T, env: {}, org: "s", seat: "ava", store, orgSettings: { name: "Hagerty" }, readSheet: async (e, i) => { calls.push(i); return (await imp("lib/preview/recordedRead.js")).recordedRead(i); } };
  const run = (a, b) => A.handleSheetAction(a, b, ctx), JPG = Buffer.from("/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAMABADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAABf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJQA0If/2Q==", "base64").toString("base64");
  const nw = await run("case_new", { text: "WP0AA2995XS626785", mileage: "72,000", transmission: "Manual", body: "Coupe", colour: "Silver", seller_name: "Hal Moreau", asking_price: "58,000", seller_notes: "Garaged" });
  ok("case_new answers { ok, id, recalled, case, sheet } and the engine was asked at most twice (the start, then the check of its reserve)", nw.ok && nw.id && nw.recalled === true && nw.case && nw.sheet && calls.length >= 1 && calls.length <= 2);
  { const cv = await import(pathToFileURL(path.join(root, "lib/desk/caseView.js")).href), lead = M.newCase({ now: T, leadRef: "HM-1", submittedAt: "2026-11-04T09:00:00.000Z" }), none = M.newCase({ now: T });
    ok("vehicle.submittedLine is the received date in words, the table's, and null when there is no submitted date", cv.caseView({ id: "a", case: lead, submission: { typed: false } }, [], T).vehicle.submittedLine === "Received 4 November 2026." && cv.caseView({ id: "b", case: none, submission: { typed: true } }, [], T).vehicle.submittedLine === null);
    const days = ["2026-01-02", "2026-02-09", "2026-03-15", "2026-04-30", "2026-05-01", "2026-06-21", "2026-07-04", "2026-08-31", "2026-09-10", "2026-10-11", "2026-11-12", "2026-12-25"], names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"], badM = [];
    days.forEach((d, i) => { const l = cv.caseView({ id: "m" + i, case: M.newCase({ now: T, leadRef: "L" + i, submittedAt: d + "T10:00:00.000Z" }), submission: { typed: false } }, [], T).vehicle.submittedLine; if (l !== `Received ${Number(d.slice(8))} ${names[i]} 2026.`) badM.push(l); });
    ok("the received sentence is the table's, not typed in caseView", !/"Received /.test(fs.readFileSync(path.join(root, "lib/desk/caseView.js"), "utf8")));
    ok("it is right for every month of the year (the class: a date in words is the same table for every case)", badM.length === 0, badM.join(" | ")); }
  // (a period and a mileage correction need a read of a question the recording does not hold; with no archive the engine's refusal is the answer, held by deskDemoCarCheck.)
  // reserve.figureLine: the reserve figure in words (moneyWords), on every case view and in the answer of every case_edit that moves the reserve. THE CLASS: whichever op moves the figure, the line is the table's money words for exactly that figure.
  { const RW = await import(pathToFileURL(path.join(root, "lib/reasonWords.js")).href), fc = await run("case_new", { text: "WP0AA2995XS626785", mileage: "72,000", transmission: "Manual", body: "Coupe" }), id = fc.id, evid = fc.case.desk.evidence, bad = [];
    const ops = [["a typed figure", { op: "reserve", patch: { figure: evid.q3 + 1234 } }], ["restart", { op: "reserve", patch: { restart: true } }], ["a condition", { op: "condition", selected: { tier: 3, name: "Good" } }], ["a typed figure again", { op: "reserve", patch: { figure: 41000 } }], ["a why only", { op: "reserve", patch: { why: "Held." } }], ["clearing the figure", { op: "reserve", patch: { figure: null } }]];
    for (const [name, b] of ops) { const r = await run("case_edit", { id, ...b }); const f = r.ok ? r.case.reserve.figure : "x", want = f == null ? null : RW.moneyWords(f); if (!(r.ok && r.case.reserve.figureLine === want && r.reserveFigureLine === want)) bad.push(name + ": " + JSON.stringify([f, r.case && r.case.reserve.figureLine, r.reserveFigureLine])); }
    ok("figureLine is moneyWords of the reserve in the case and at the top of the answer, for every op that moves the figure (" + ops.length + " ops)", bad.length === 0, bad.join(" | "));
    ok("it is null with no figure and a dollar line with one", (await run("case_get", { id })).case.reserve.figureLine === null || /^\$[\d,]+$/.test((await run("case_get", { id })).case.reserve.figureLine));
    ok("the line is the table's: caseView builds it with moneyWords and types no dollar sign", /moneyWords\(f\)/.test(fs.readFileSync(path.join(root, "lib/desk/caseView.js"), "utf8").split("reserveFigureLine = ")[1].split("\n")[0]) && !/"\$"/.test(fs.readFileSync(path.join(root, "lib/desk/caseView.js"), "utf8")));
    const cvv = (await import(pathToFileURL(path.join(root, "lib/desk/caseView.js")).href)); ok("every case view rebuilds it from the case's own figure (a stored case with a figure and nothing else)", cvv.reserveFigureLine({ reserve: { figure: 55500, rationale: "x" } }) === "$55,500" && cvv.reserveFigureLine({ reserve: { figure: null } }) === null); }
  ok("the form's fields are on the case: seller { name, email, asking_price, notes } and each fact with source seller", nw.case.seller.name === "Hal Moreau" && nw.case.seller.asking_price === 58000 && nw.case.seller.notes === "Garaged" && "email" in nw.case.seller && nw.case.fields.mileage.source === "seller" && nw.case.fields.colour.source === "seller");
  ok("the market reference is on the case: desk.evidence { count, median, q1, q3, insufficient, sentence }, original, comparables, outside, quarters, live, condition, factors, excluded, key", ["evidence", "original", "comparables", "outside", "quarters", "live", "condition", "factors", "excluded", "key"].every(k => k in nw.case.desk) && ["count", "median", "q1", "q3", "insufficient", "sentence"].every(k => k in nw.case.desk.evidence));
  ok("the case view keeps stage, queue and handling.lines in every answer", nw.case.stage === "new" && nw.case.queue && nw.case.handling.lines.length === 4);
  const ph = await run("case_edit", { id: nw.id, op: "photo_add", name: "front.jpg", data: JPG });
  ok("photo_add answers the case view with photos.items [{ id, name, addedAt, url, width, height }], coverId and reportIds, the first photo the cover", ph.ok && ph.case.photos.items.length === 1 && ["id", "name", "addedAt", "url", "width", "height"].every(k => k in ph.case.photos.items[0]) && ph.case.photos.coverId === ph.case.photos.items[0].id && ph.case.photos.reportIds.length === 1 && /^data:image\/jpeg/.test(ph.case.photos.items[0].url));
  const c = await run("case_edit", { id: nw.id, op: "condition", selected: { tier: 4, name: "Fair" } });
  ok("a condition change answers { ok, id, version, recalled, case, readiness, reservePosition } from the view the engine already sent for the tier, no read", c.ok && c.recalled === false && c.version > 0 && "readiness" in c && "reservePosition" in c && c.case.desk.view.tier === 4);
  ok("a tier with too few sales answers desk.evidence { insufficient: true, sentence } with no median, q1 or q3", c.case.desk.evidence.insufficient === true && c.case.desk.evidence.sentence && c.case.desk.evidence.median == null && c.case.desk.evidence.q1 == null && c.case.desk.evidence.q3 == null);
  const g = await run("case_edit", { id: nw.id, op: "condition", selected: { tier: 3, name: "Good" } });
  ok("a tier with five or more sales answers a range from them (insufficient false, q1 and q3 set), different from the untiered one", g.case.desk.evidence.insufficient === false && g.case.desk.evidence.q1 > 0 && g.case.desk.evidence.q3 >= g.case.desk.evidence.q1 && g.case.desk.evidence.count !== nw.case.desk.evidence.count);
  // THE MARKET LINE IS THE STORED READ OF THE CASE AS ENTERED (Lane C's question, Nov 9 2026): the engine's population for the car's mileage, transmission, body and condition tier, the same read the Desk sheet makes. Untiered until the analyst picks a condition (every condition of that gearbox), the tier pool after.
  { const stored = (await store.get("s", nw.id)).case, K2 = await imp("lib/desk/caseWorkflow.js"), ev = stored.desk.evidence, line = (await run("case_get", { id: nw.id })).case.marketLine;
    ok("the market line is built from the stored read: its range, count and date are the stored evidence's q1, q3, count and asOf", ev.insufficient ? line === ev.sentence : line.includes("$" + ev.q1.toLocaleString("en-US") + " to $" + ev.q3.toLocaleString("en-US") + ", " + ev.count + " sales"), line);
    ok("the stored read is the case as entered: its key is the recall key of the stored case (mileage, transmission, body, tier)", stored.desk.key === K2.recallKey(stored));
    const asked = calls.filter(x => x.desk && x.desk.transmission === "Manual").pop();
    ok("the engine was asked with the case's mileage, gearbox and body, and the condition tier once one is picked", asked && asked.mileage === 72000 && asked.desk.transmission === "Manual" && asked.bodyStyle === "Coupe" && calls.some(x => x.tier === 3));
    const t3 = await run("case_edit", { id: nw.id, op: "condition", selected: { tier: 3, name: "Good" } }), st3 = (await store.get("s", nw.id)).case;
    ok("with a tier picked the market line is the tier pool's, not the any condition pool's: it is the stored tier read and its count differs from the untiered one", t3.case.marketLine.includes(st3.desk.evidence.count + " sales") && st3.desk.evidence.count !== nw.case.desk.evidence.count && st3.desk.key === K2.recallKey(st3) && calls[calls.length - 1].tier === 3); }
  // the assessment starts at the engine's median and the market line says where it came from
  const ev0 = nw.case.desk.evidence, asm = nw.case.assessment;
  ok("a new case's assessment starts at the engine's median, range q1 to q3, source engine, with one audit line", asm.figure === ev0.median && asm.low === ev0.q1 && asm.high === ev0.q3 && asm.source === "engine" && nw.case.audit.filter(a => a.field === "assessment" && a.by === "engine").length === 1);
  ok("caseView.marketLine reads Market: low to high, N sales, evidence as of D Mon YYYY: " + nw.case.marketLine, /^Market: \$[\d,]+ to \$[\d,]+, \d+ sales, evidence as of \d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}$/.test(nw.case.marketLine) && nw.case.marketLine.includes("$" + ev0.q1.toLocaleString("en-US")) && nw.case.marketLine.includes(ev0.count + " sales"));
  { const RSm = await imp("lib/desk/reportState.js"), c2 = structuredClone(nw.case); c2.desk.evidence.stale = { days: 400, threshold: 180, flag: true, sentence: "The newest sale is 400 days old." };
    ok("a stale flag adds the engine's stale sentence to the market line", RSm.reportState(c2).marketLine.endsWith("The newest sale is 400 days old.") && !nw.case.marketLine.includes("days old")); }
  const sw = await run("case_edit", { id: nw.id, op: "condition", selected: { tier: 3, name: "Good" } });
  ok("while the figure is still the engine's, a new read moves it with the evidence (source engine)", sw.case.assessment.source === "engine" && sw.case.assessment.figure === sw.case.desk.evidence.median && sw.case.assessment.figure !== asm.figure);
  const ex2 = await run("case_edit", { id: nw.id, op: "condition", selected: { tier: 4, name: "Fair" } });
  ok("a read with too few sales clears an engine figure rather than leaving the old pool's", ex2.case.assessment.figure === null && ex2.case.assessment.source === null);
  await run("case_edit", { id: nw.id, op: "condition", selected: { tier: 3, name: "Good" } });
  const an = await run("case_edit", { id: nw.id, op: "assessment", patch: { figure: 61000 } });
  ok("the analyst's first change makes the source analyst, logged", an.case.assessment.source === "analyst" && an.case.assessment.figure === 61000 && an.case.audit.some(a => a.what === "assessment taken over from the engine"));
  const after = await run("case_edit", { id: nw.id, op: "condition", selected: { tier: 2, name: "Excellent" } });
  ok("after that no read touches the analyst's figure", after.case.assessment.figure === 61000 && after.case.assessment.source === "analyst");
}
// ---------- THE RESERVE THE ENGINE PROPOSES IS A ROUND FIGURE (Lane D, Nov 11 2026, Sam's first run: "Recommended reserve is a round number") ----------
// CAUSE: reserveStart was the first quartile as the engine read it ($27,460), and the case took it as the reserve. To the nearest $500 under $50,000 and $1,000 from $50,000 up (lib/deskV3.js roundReserve); the analyst may still type any figure and the typical range itself is never rounded.
// OTHER PAGES: every page that prints the reserve (workspace, report, preview, the send dialog) takes it from the case; none makes its own. CLASS: every figure the engine proposes as a reserve, in every view of every read, is round.
{ const { setup } = await imp("scripts/_deskCaseWorld.mjs"), DV = await imp("lib/deskV3.js"), W = await setup(root), c = await W.readyCase(), step = n => (n < 50000 ? 500 : 1000);
  const isRound = n => Number.isInteger(n) && n % step(n) === 0;
  ok("roundReserve: to the nearest 500 under 50,000 and the nearest 1,000 from 50,000 up", DV.roundReserve(27460) === 27500 && DV.roundReserve(27249) === 27000 && DV.roundReserve(49749) === 49500 && DV.roundReserve(54400) === 54000 && DV.roundReserve(54500) === 55000 && DV.roundReserve(null) === null && DV.roundReserve(0) === null);
  const figs = Object.entries(c.desk.views).map(([k, v]) => [k, v.reserveStart && v.reserveStart.figure]).filter(x => x[1] != null);
  ok("every view of the read proposes a round reserve (" + figs.length + " views with a range)", figs.length >= 5 && figs.every(([, f]) => isRound(f)), figs.filter(([, f]) => !isRound(f)).join(" "));
  const nw = await W.K.refreshEvidence(M.newCase({ now: T, vehicle: { year: 1999, make: "Porsche", model: "911", trim: "Carrera", body: "Coupe", transmission: "Manual", mileage: 61400 }, source: "seller" }), W.read, { caseDate: T.slice(0, 10), now: T });
  ok("a new case's reserve is the engine's round start, and the typical range is not rounded", isRound(nw.case.reserve.figure) && nw.case.reserve.figure === nw.case.desk.reserveStart.figure, JSON.stringify([nw.case.reserve.figure, nw.case.desk.evidence.q1]));
  ok("the sentence says what the figure is: rounded, to what", /rounded to the nearest \$(500|1,000)\./.test(c.desk.reserveStart.sentence), c.desk.reserveStart.sentence);
  const typed = W.K.setReserve(c, { figure: 31234 }, T); ok("the analyst may type any figure and it is kept as typed", typed.reserve.figure === 31234 && typed.reserve.source === "analyst");
}
console.log(`deskShapesCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
