// DESK, NO ENGINE TALK (Lane D, Nov 14 2026, order 2318 item 4). CAUSE: conditionOf answered a car with no suggested condition with its own counting ("No condition is suggested, no signals counted and three are needed."), engine talk that the case page and the report printed.
// CLASS: every car with no suggested condition, on the page and in the report, and every case stored before the fix; the note is null and nothing is printed. One sweep over every served source and one over what is served.
//   node scripts/deskNoEngineTalkCheck.mjs [rootDir]
import fs from "node:fs"; import path from "node:path"; import { pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || "."), U = f => import(pathToFileURL(path.join(root, f)).href), J = x => JSON.stringify(x);
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) pass++; else { fail++; console.log("FAIL " + n + (d ? " :: " + d : "")); } };
const TALK = /signals? counted|signals? counted and \w+ (is|are) needed|No condition is suggested|(is|are) needed\.?"/;
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => (e.name === "node_modules" || e.name.startsWith(".") ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : /\.(m?js|json|html)$/.test(e.name) ? [path.join(d, e.name)] : []));
// 1. the sweep: nothing in lib/ or public/ (what is served) carries the engine's counting line, the recorded engine answers included
const hits = ["lib", "public", "api"].filter(d => fs.existsSync(path.join(root, d))).flatMap(d => walk(path.join(root, d))).filter(f => TALK.test(fs.readFileSync(f, "utf8"))).map(f => path.relative(root, f));
ok("TALK 1: no served source (lib, public, api, the recorded reads included) carries the engine's counting line", hits.length === 0, hits.join(", "));
// 2. the engine: no suggestion, a null note, in every shape of the pool
const DV = await U("lib/deskV3.js");
const split = DV.conditionOf(null, [3, 3, 2, 2, 1, 1].map((t, i) => ({ miles: 60000 + i * 100, tier: t })).concat([{ miles: 60500, tier: 4 }]), null, 61400), bare = DV.conditionOf(null, [], null, null), one = DV.conditionOf({ notes: "" }, [], null, 50000);
ok("TALK 2: with no condition suggested the note is null, whatever the pool", [split, bare, one].every(x => x.suggested === null && x.basis === null), J([split, bare, one]));
// 3. a case stored before the fix: the page and the report say nothing
const A = await U("lib/desk/sheetActions.js"), S = await U("lib/desk/sheetStore.js"), M = await U("lib/desk/caseModel.js"), R = await U("lib/desk/reportState.js");
const NOW = "2026-11-14T12:00:00Z", store = S.memoryStore(); store.reset();
const ctx = { now: NOW, env: {}, org: "hm", seat: "Jane Park", seatName: "Jane Park", store, orgSettings: { name: "H" }, readSheet: async () => null };
const OLD = "No condition is suggested, no signals counted and three are needed.";
const c = M.newCase({ org: "hm", now: NOW, vehicle: { year: 1999, make: "Porsche", model: "911", trim: "Carrera" }, source: "seller" });
const id = "bb000001-0000-4000-8000-000000000000";
await store.insert("hm", { id, org_id: "hm", created_at: NOW, owner_seat: "Jane Park", status: "In progress", submission: { typed: true, photos: [], documents: [] }, state: {}, case: { ...c, desk: { version: 1, condition: { suggested: null, basis: OLD }, comparables: [], outside: [], factors: [] } }, car_label: "1999 Porsche 911", version: 0 });
const got = (await A.handleSheetAction("case_get", { id }, ctx)).case;
ok("TALK 3: a stored case serves a null condition note", got && got.desk && got.desk.condition && got.desk.condition.basis === null && got.desk.condition.suggested === null, J(got && got.desk && got.desk.condition));
ok("TALK 4: nothing served on the case carries the counting line", !TALK.test(J(got)), "");
const st = R.reportState({ ...c, desk: { version: 1, condition: { suggested: null, basis: OLD }, comparables: [], outside: [], factors: [] } });
ok("TALK 5: the report prints no condition note for it", st.conditionBasis === null && !TALK.test(J(st)), J(st.conditionBasis));
const withS = R.reportState({ ...c, desk: { version: 1, condition: { suggested: { tier: 3, name: "Good" }, basis: "Suggested Good, from the mileage and the seller's description." }, comparables: [], outside: [], factors: [] } });
ok("TALK 6: a suggested condition still prints its basis", withS.conditionBasis === "Suggested Good, from the mileage and the seller's description.", String(withS.conditionBasis));
const oldS = { ...c, desk: { version: 1, condition: { suggested: { tier: 3, name: "Good" }, basis: "Suggested Good from 61,400 miles, 3 signals counted." }, comparables: [], outside: [], factors: [] } };
const idO = "bb000002-0000-4000-8000-000000000000";
await store.insert("hm", { id: idO, org_id: "hm", created_at: NOW, owner_seat: "Jane Park", status: "In progress", submission: { typed: true, photos: [], documents: [] }, state: {}, case: oldS, car_label: "1999 Porsche 911", version: 0 });
const gotO = (await A.handleSheetAction("case_get", { id: idO }, ctx)).case, stO = R.reportState(oldS);
ok("TALK 7: a case stored with a counted suggestion note serves no count, on the page and in the report", gotO.desk.condition.basis === null && gotO.desk.condition.suggested.tier === 3 && stO.conditionBasis === null && !TALK.test(J(gotO)) && !TALK.test(J(stO)), J(gotO.desk.condition));
// the engine: every shape of suggestion names what it used, never a count
const sig = DV.conditionOf({ notes: "one owner, service records, no accidents, original paint", titleStatus: "Clean" }, [], null, 61400), rec = DV.conditionOf(null, [], { tier: 2, evidence: [{ code: "original" }, { code: "mileage_low" }] }, 61400), rec0 = DV.conditionOf(null, [], { tier: 2, evidence: [] }, 61400);
const near = DV.conditionOf(null, [1, 2, 3, 4, 5, 6, 7, 8].map(i => ({ miles: 60000 + i * 100, tier: 3 })), null, 61000);
ok("TALK 8: every suggestion names what it used in plain words and counts nothing", [sig, rec, rec0, near].every(x => x.suggested && x.basis && !TALK.test(x.basis) && !/\d+ signals?/.test(x.basis)) && /^Suggested \w+, from the seller's description and the title status\.$/.test(sig.basis) && rec.basis === "Suggested Excellent, from the last time this car was listed." && rec0.basis === rec.basis, J([sig.basis, rec.basis, rec0.basis, near.basis]));
// ---------- THE WORD LIST (order 2318, Nov 14 2026, Lane C's find on pv_hm: "assessment set from the engine's median", "4 signals counted") ----------
// CAUSE: the sweep above held ONE phrase, so every other line in the engine's voice passed. CLASS: every sentence served to the page, the case data and the report: no "signals", "counted", "engine", "population", "basis", "oneEngineAnswer" or "null" in any of them.
// A served sentence is a string of two or more words (a single machine word such as a source "engine" is a code, not a sentence). Surfaces: (a) every Desk line of the words table, (b) the case as served (the case world's ready case, with its audit trail, and the preview's sample cases pv_hm and the rest), (c) the report's state and its PDF text, (d) the page's own text.
const BAN = /\b(signals?|counted|engine|population|basis|oneEngineAnswer|null)\b/i, DESK_FIELD = /^(desk|case|report|reserve|v4|own|assessment|condition|queue|intake|document|photo)/;
const sentencesOf = (x, out = [], key = "") => { if (typeof x === "string") { if (/\s/.test(x.trim()) && x.length > 12 && !/^https?:/.test(x) && key !== "url") out.push(x); } else if (Array.isArray(x)) x.forEach(v => sentencesOf(v, out, key)); else if (x && typeof x === "object") for (const [k, v] of Object.entries(x)) if (k !== "pool" && k !== "views" && k !== "words" && k !== "photo") sentencesOf(v, out, k); return out; };
const bad = (label, list) => { const hit = [...new Set(list.filter(t => BAN.test(t)))]; ok(label, hit.length === 0, hit.slice(0, 40).map(t => JSON.stringify(t.slice(0, 110))).join(" | ") + (hit.length > 40 ? ` (+${hit.length - 40})` : "")); };
{ const RW = await U("lib/reasonWords.js"), PV = await U("lib/preview/deskPreview.js"), DVv4 = await U("lib/preview/deskV4.js"), mini = await U("lib/pdf/mini.js"), P = await U("lib/desk/reportPdfV3.js"), W = await (await import(pathToFileURL(path.join(root, "scripts/_deskCaseWorld.mjs")).href)).setup(root);
  const probe = new Proxy({}, { get: (_, k) => ["median", "figure", "price", "low", "high", "count", "reserve", "reached", "of", "first", "second", "third", "lo", "hi", "q1", "q3"].includes(k) ? 5000 : "x" });
  bad("TALK 9: no Desk line of the words table carries a banned word", Object.entries(RW.REASON_TABLE).filter(([, e]) => DESK_FIELD.test(String(e.field || ""))).map(([, e]) => { try { return e.text(probe); } catch { return ""; } }));
  // (b) the case as served: the ready case (it was set and moved by the workflow, so it holds an audit trail), and each sample case of the preview
  const base = await W.readyCase(), V = await U("lib/desk/caseView.js"), sheet = { id: "x", org_id: "t", owner_seat: "Jane Park", created_at: W.T, submission: { typed: true, photos: [], documents: [] }, state: {}, case: base, version: 0 };
  const served = V.caseView(sheet, [sheet], W.T);
  bad("TALK 10: the ready case as served (page data and audit trail) carries no banned word", sentencesOf(served));
  const store = await PV.previewStore(), rows = (await store.list(PV.PREVIEW_ORG.id)).filter(r => /^pv_/.test(r.id)), pvs = [];
  for (const r of rows) { const g = await PV.previewDeskApi({ action: "case_get", id: r.id }); if (g && g.case) { pvs.push(...sentencesOf(g.case)); for (const e of g.case.audit || []) if (BAN.test(String(e.by))) pvs.push("by " + e.by + " in the audit trail"); } }
  ok("TALK 10a: no audit entry is by, or says, a banned word (the author too, though it is one word)", served.audit.length > 0 && served.audit.every(e => !BAN.test(String(e.by)) && !BAN.test(String(e.what)) && !BAN.test(String(e.line))), JSON.stringify(served.audit.map(e => e.by)));
  { const old = structuredClone(base); old.audit = [{ at: W.T, by: "engine", what: "assessment set from the engine's median", field: "assessment", from: null, to: 32500, line: "The assessment was set to the engine's median of $32,500." }, { at: W.T, by: "engine", what: "reserve cleared: the engine has too few sales", field: "reserve", from: 20000, to: null, line: "The recommended reserve was cleared because the engine has too few sales." }, ...old.audit.slice(0, 1)];
    const sh2 = { ...sheet, case: old }, v2 = V.caseView(sh2, [sh2], W.T);
    ok("TALK 10c: a case stored with the old audit words serves the market's words, its author and its lines (page data)", v2.audit[0].line === "The assessment was set to the market median of $32,500." && v2.audit[1].line === "The recommended reserve was cleared because there are too few sales." && v2.audit.every(e => !BAN.test(String(e.by)) && !BAN.test(String(e.what)) && !BAN.test(String(e.line))), JSON.stringify(v2.audit.slice(0, 2).map(e => [e.by, e.what, e.line]))); }
  ok("TALK 10b: the preview's sample cases were read", rows.length >= 3 && pvs.length > 50, String(rows.length));
  bad("TALK 11: the preview's sample cases as served (pv_hm and the rest) carry no banned word", pvs);
  // (c) the report
  const R = await U("lib/desk/reportState.js"), PNG = (await import("node:fs")).readFileSync(path.join(root, "public/icon-512.png")), st = R.reportState(base);
  bad("TALK 12: the report's state carries no banned word", sentencesOf(st));
  const pdf = await P.buildReportV3({ ...sheet, final: { reportNumber: "DV-1", org: { name: "A" }, finalisedAt: W.T }, submission: { typed: false, photos: [{ id: base.photos.items[0].id, url: "https://real.example/c.jpg" }] } }, { name: "A", contactEmail: "a@b.example", sendingAddress: "n@b.example" }, { fetchImage: async () => PNG, draft: false });
  bad("TALK 13: the report's pages, as printed, carry no banned word", mini.pdfPages(pdf.bytes).flat());
  // (b2) THE DECISION LINES (order 2318): the condition line, the reserve choice line, the audit entries and the report's extra rung lines, with the analyst's own choices made
  { const K = W.K, step1 = K.setConditionChoice(base, 3, "the photos", W.T).case, step2 = K.reserveUse(K.setReserve(step1, { restart: true }, W.T), "safe", W.T).case, X = K.reportRungsSet(step2, ["ambitious"], W.T).case, sx = { ...sheet, case: X }, vx = V.caseView(sx, [sx], W.T), rsx = R.reportState(X);
    ok("TALK 16: the decision lines were made (condition line, reserve choice line, an extra rung line, three audit entries)", !!vx.condition.line && !!vx.reserveChoice.line && rsx.v4.extraRungs.length === 1 && vx.audit.filter(e => ["condition set", "reserve choice", "report rungs"].includes(e.what)).length === 3, JSON.stringify([vx.condition.line, vx.reserveChoice.line]));
    bad("TALK 17: the condition, reserve choice and rung lines, as served and as printed on the report, carry no banned word", [...sentencesOf(vx), ...sentencesOf(rsx.v4), ...vx.audit.map(e => e.line)]);
    const pdfX = await P.buildReportV3({ ...sx, final: { reportNumber: "DV-1", org: { name: "A" }, finalisedAt: W.T }, submission: { typed: false, photos: [{ id: X.photos.items[0].id, url: "https://real.example/c.jpg" }] } }, { name: "A", contactEmail: "a@b.example", sendingAddress: "n@b.example" }, { fetchImage: async () => PNG, draft: false });
    bad("TALK 18: page one of that report, as printed, carries no banned word", mini.pdfPages(pdfX.bytes)[0]); }
  // (d) the page's own text
  const html = DVv4.deskV4Shell().replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, "\n").split("\n").map(t => t.replace(/&amp;/g, "&").trim()).filter(Boolean);
  ok("TALK 14: the page's text was read", html.length > 20, String(html.length));
  bad("TALK 15: the page's own text carries no banned word", html.filter(t => /\s/.test(t)));
}
console.log(`deskNoEngineTalkCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
