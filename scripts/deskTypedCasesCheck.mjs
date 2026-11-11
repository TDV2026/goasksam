// THE THREE TYPED CASES (Lane D, Nov 11 2026, Stage 6). A case made from typed year, make and model (the New case form's fields, case_new through the preview door) is read by the engine and carries a typical range, three or more comparables each with a why line,
// the car's name as typed, the assessment at the engine's median (nothing typed) and a four page report. The reads are the engine's own recorded answers (lib/preview/deskRecordedReads.js, made with the ops task deskrungs full=1 on Nov 11 2026, figures posted in docs/lane-notes.md).
// The class (a preview that answers a figure the engine did not read) is held by deskDemoCarCheck.mjs and the mutants in deskDemoFailsWithout.mjs.
//   node scripts/deskTypedCasesCheck.mjs [rootDir]   prints the case ids it made (in memory only: they last as long as the process)
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const U = f => import(pathToFileURL(path.join(ROOT, f)).href);
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) pass++; else { fail++; console.log("FAIL " + n + (d ? " :: " + d : "")); } };
const P = await U("lib/preview/deskPreview.js"), R = await U("lib/preview/deskRecordedReads.js"), RW = await U("lib/reasonWords.js"), notes = fs.readFileSync(path.join(ROOT, "docs/lane-notes.md"), "utf8");
const fmt = n => "$" + Number(n).toLocaleString("en-US");
const CARS = [
  { fields: { year: "1965", make: "Ford", model: "Mustang", body: "Coupe" }, title: "1965 Ford Mustang Coupe" },
  { fields: { year: "1972", make: "Datsun", model: "240Z", body: "Coupe" }, title: "1972 Datsun 240Z Coupe" },
  { fields: { year: "1974", make: "Triumph", model: "TR6", body: "Roadster" }, title: "1974 Triumph TR6 Roadster" }
];
const DEMO_VIN_FOR_CHECK = (await U("lib/desk/demoCar.js")).DEMO_VIN, ids = [];
for (const car of CARS) {
  const r = await P.previewDeskApi({ action: "case_new", ...car.fields, mileage: "60,000", transmission: "Manual" }), c = r.case, k = c && c.desk, ev = k && k.evidence, n = car.title;
  ok(n + ": the case is made and read once, no retry", r.ok === true && r.recalled === true && !r.retry && !!k && !!ev, JSON.stringify(r.retry || r.why || ""));
  if (!ev) continue; ids.push(r.id);
  const rec = R.RECORDED.find(x => x.tier === null && x.spec.year === Number(car.fields.year) && x.spec.model === car.fields.model);
  ok(n + ": the name is the car as typed (engine titleLine)", k.titleLine === car.title, String(k.titleLine));
  ok(n + ": a typical range from the recorded engine read, not a typed figure", ev.insufficient === false && rec && ev.q1 === rec.answer.desk.evidence.q1 && ev.median === rec.answer.desk.evidence.median && ev.q3 === rec.answer.desk.evidence.q3 && ev.count === rec.answer.desk.evidence.count && ev.q1 < ev.median && ev.median < ev.q3);
  ok(n + ": the figures are the ones posted in the lane notes", [ev.q1, ev.q3].every(v => notes.includes(v.toLocaleString("en-US"))) && notes.includes(ev.count + " sales"));
  ok(n + ": the market line is built from that range and count", c.marketLine.includes(fmt(ev.q1) + " to " + fmt(ev.q3)) && c.marketLine.includes(ev.count + " sales"), c.marketLine);
  const cp = k.comparables || [];
  ok(n + ": three or more comparables, each with a why line and its own title", cp.length >= 3 && cp.every(x => x.title && String(x.why || "").trim().length > 3 && /[.]$/.test(x.why)), String(cp.length));
  ok(n + ": the assessment starts at the engine's median and the reserve at the engine's start (source engine)", c.assessment.source === "engine" && c.assessment.figure === ev.median && c.assessment.low === ev.q1 && c.assessment.high === ev.q3 && c.reserve.source === "engine" && c.reserve.figure === k.reserveStart.figure);
  ok(n + ": the reserve check is the engine's (reached count out of the sales)", !!k.reserveCheck && k.reserveCheck.of === ev.count && /sales reached this figure|sale reached this figure/.test(k.reserveCheck.reachedLine));
  ok(n + ": the sales behind the range add up to the count the engine gave", Array.isArray(k.sales) && k.sales.length === ev.count);
  const pdf = await P.previewDeskApi({ action: "case_pdf", id: r.id, draft: true });
  ok(n + ": the draft report builds with four pages", pdf.ok === true && pdf.pages === 4 && !!pdf.pdf_b64, String(pdf.why || pdf.pages));
}
ok("three cases were made, each with its own id", ids.length === 3 && new Set(ids).size === 3);
ok("the recorded reads in the code are the ones the lane notes post as read (the date of the read)", notes.includes("HEAVY STEP DONE (Lane D, Nov 11 2026") && R.RECORDED_ON === "2026-11-11");

// ---------- THE PREVIEW STORE HOLDS NO TYPED FIGURE (Nov 11 2026): every sample sheet on the rail is a car the engine read ----------
{ const st = await P.previewStore(), rows = (await st.list(P.PREVIEW_ORG.id)).filter(r => /^pv_/.test(r.id)), ev = r => r.case && r.case.desk && r.case.desk.evidence, same = (a, b) => a && b && ["count", "q1", "median", "q3", "insufficient"].every(k => (a[k] ?? null) === (b[k] ?? null));
  const recorded = R.RECORDED.map(x => x.answer.desk.evidence), names = rows.map(r => r.id).sort().join();
  ok("the rail holds the demonstration case and three sample cases the engine read (no older sheet with typed sales)", names === "pv_240z,pv_fin,pv_hm,pv_thin", names);
  ok("every sheet in the preview store is a stored case whose market evidence is one of the engine's recorded answers, figure for figure", rows.every(r => recorded.some(x => same(ev(r), x))), rows.filter(r => !recorded.some(x => same(ev(r), x))).map(r => r.id).join());
  ok("no sheet carries a typed sale, a stored read that is not the engine's, a typed decision figure or a drawn picture", rows.every(r => (r.read == null || recorded.some(x => same(r.read.desk && r.read.desk.evidence, x))) && !(r.state && r.state.decision && (r.state.decision.low || r.state.decision.high || r.state.decision.reserve)) && !(r.submission.photos || []).some(p => /^data:/.test(p.url || "") || p.standIn)), "");
  ok("every assessment and reserve in the store is the engine's start (source engine) at the engine's median and its reserve start", rows.every(r => { const c = r.case; return (c.assessment.figure == null && c.assessment.source == null) || (c.assessment.source === "engine" && c.assessment.figure === c.desk.evidence.median && c.assessment.low === c.desk.evidence.q1 && c.assessment.high === c.desk.evidence.q3); }) && rows.every(r => r.case.reserve.figure == null || r.case.reserve.source === "engine" && r.case.reserve.figure === r.case.desk.reserveStart.figure), "");
  const byId = Object.fromEntries(rows.map(r => [r.id, r.case]));
  ok("one sample case shows a thin pool (the engine's too few sales sentence, no median), one is finalized through the real finalize, one is open with the engine's range", byId.pv_thin.desk.evidence.insufficient === true && byId.pv_thin.desk.evidence.median == null && byId.pv_fin.status === "finalized" && rows.find(r => r.id === "pv_fin").status === "Finalised" && byId.pv_240z.status !== "finalized" && byId.pv_240z.desk.evidence.insufficient === false);
  const old = await P.previewDeskApi({ action: "sheet_new", text: "WBSBR93422EX21856", mileage: "96,702" });
  ok("the preview makes no older sheet from a fixture VIN (the typed sample sales of lib/desk/sheetShape.js never enter the store)", old.ok === false && /New case/.test(old.why || ""), JSON.stringify(old).slice(0, 120));
  const strip = t => t.replace(/\/\/[^\n]*/g, ""), PS = strip(fs.readFileSync(path.join(ROOT, "lib/preview/deskPreview.js"), "utf8"));
  ok("the preview door's source names no fixture sheet, no drawn picture and no typed price", !/FIXTURE_VINS|fixtureRead|sheetShape|image\/svg|\bpv_m3\b|\bpv_none\b|\b[1-9]\d{4,5}\b/.test(PS.replace(/\bminutesAgo\b/g, "").replace(/\b60000\b/g, "")), "");
}
// ---------- A VIN CASE AND ITS TYPED TWIN READ THE SAME POOL (Nov 11 2026) ----------
// CAUSE of the 75 sales with Cabriolets (VIN WP0AA2995XS626785) against the typed Carrera Coupe's 39: lib/sheetRead.js took the body (and trim) the case holds onto the vehicle only on the TYPED branch, so a read that came by VIN dropped the body the case carried (decoded from the VIN or typed).
// A. at the case: every field the decode returns is put on the case as decoded and unverified, and the read that is stored carries it the way a typed field does (the same scoping inputs as the typed twin).
{ const A = await U("lib/desk/sheetActions.js"), S = await U("lib/desk/sheetStore.js"), rec = R.RECORDED.find(x => x.tier === null && x.spec.vin);
  const run = async (body) => { const calls = [], store = S.memoryStore(); store.reset(); const ctx = { now: "2026-11-11T12:00:00Z", env: {}, org: "s", seat: "a", store, orgSettings: { name: "H" }, readSheet: async (e, i) => { calls.push(JSON.parse(JSON.stringify(i))); const a = structuredClone(rec.answer); a.car.decode = { year: 1999, make: "Porsche", model: "911", trim: "Carrera", body: "Coupe", transmission: "Manual", source: i.vin ? "vin" : "typed" }; return a; } };
    const r = await A.handleSheetAction("case_new", body, ctx); return { r, calls, last: calls[calls.length - 1] }; };
  const vin = await run({ vin: DEMO_VIN_FOR_CHECK, mileage: "72000" }), twin = await run({ year: "1999", make: "Porsche", model: "911", trim: "Carrera", body: "Coupe", transmission: "Manual", mileage: "72000" });
  const scope = i => JSON.stringify([i.bodyStyle || null, i.trim || null, i.desk && i.desk.transmission || null, i.mileage, i.tier || null]);
  const f = vin.r.case && vin.r.case.fields;
  ok("a VIN case takes every field the decode returns (trim, body, gearbox) as decoded and unverified, the way intake does", !!f && ["trim", "body", "transmission"].every(k => f[k].source === "vin_decoded" && f[k].verified === false && f[k].value != null), JSON.stringify(f && ["trim", "body", "transmission"].map(k => [f[k].source, f[k].verified, f[k].value])));
  ok("the read a VIN case stores carries the decoded body, trim and gearbox exactly as its typed twin's read does", !!vin.last && !!twin.last && scope(vin.last) === scope(twin.last) && vin.last.bodyStyle === "Coupe" && vin.last.trim === "Carrera" && vin.last.desk.transmission === "Manual", scope(vin.last || {}) + " v " + scope(twin.last || {}));
  ok("the stored read is the one made with the decoded fields (its key is the key of the case as it stands), so the next edit does not re-read", !!vin.r.case && vin.r.case.desk && vin.r.case.desk.key === (await U("lib/desk/caseWorkflow.js")).recallKey((await S.memoryStore().get("s", vin.r.id)) ? vin.r.case : vin.r.case), "");
}
// B. at the engine: the real sheetRead on the older cars' world reads the same pool for a VIN as for the typed words, body and trim included (the decode here names no body, so the body is the one the case carries)
{ const W = await U("scripts/_deskOlderWorld.mjs"), SR = await U("lib/sheetRead.js"), cars = W.loadCars(ROOT).filter(c => c.read && c.typedBody && c.n <= 24), pick = [cars.find(c => c.model === "Mustang"), cars.find(c => c.model === "TR6"), cars.find(c => c.rtrim)].filter(Boolean), f0 = globalThis.fetch; let nCars = 0;
  try { for (const c of pick) {
    const w = W.install(ROOT, { cars: [c] }); const base = w.deps, depsVin = { ...base, decodeVin: async () => ({ year: c.year, make: c.make, model: c.rmodel, trim: null, bodyStyle: null }), archiveMatch: async () => null };
    const q = extra => ({ mileage: 60000, bodyStyle: c.typedBody, ...(c.rtrim ? { trim: c.rtrim } : {}), desk: { caseDate: new Date().toISOString().slice(0, 10), transmission: "Manual", label: `${c.year} ${c.make} ${c.model}`, case: { verification: {} }, exclusions: [] }, ...extra });
    const typed = await SR.sheetRead(w.env, q({ year: c.year, make: c.make, model: c.model }), base).catch(e => ({ err: String(e) })), byVin = await SR.sheetRead(w.env, q({ vin: DEMO_VIN_FOR_CHECK }), depsVin).catch(e => ({ err: String(e) })), n = `${c.year} ${c.make} ${c.model}`;
    if (!typed || !typed.desk || !byVin || !byVin.desk) { ok(n + ": both reads answer", false, JSON.stringify([!!typed && !!typed.desk, !!byVin && !!byVin.desk, byVin && byVin.err])); continue; } nCars++;
    const e1 = typed.desk.evidence, e2 = byVin.desk.evidence;
    ok(n + ": the VIN read and its typed twin read the same pool (count, range, comparables)", ["count", "q1", "median", "q3", "low", "high"].every(k => e1[k] === e2[k]) && typed.desk.comparables.length === byVin.desk.comparables.length, JSON.stringify([e1.count, e2.count, e1.median, e2.median]));
    ok(n + ": the VIN read names the car as the typed twin does (title, label, decoded body)", typed.desk.titleLine === byVin.desk.titleLine && typed.car.label === byVin.car.label && byVin.car.decode.body === typed.car.decode.body, JSON.stringify([typed.desk.titleLine, byVin.desk.titleLine, byVin.car.decode.body]));
  } } finally { globalThis.fetch = f0; }
  ok("the twin check ran on three older cars (a coupe, a roadster, a trimmed car)", nCars === 3, String(nCars)); }
console.log("CASE IDS " + ids.join(" "));
console.log(`deskTypedCasesCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
