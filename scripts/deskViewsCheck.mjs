// DESK V4, THE VIEWS (Lane D, Nov 11 2026; Sam's first run: a click on 6, 12 or 24 months, or on a condition, felt broken).
// CAUSE: the period and the condition were part of the key the case recalls the engine by (lib/desk/caseWorkflow.js recallKey), so every click asked the engine for a whole new read, and a changed reserve then asked a second one (two reads a click). Today every click read:
//   the period (6, 12, 24)     one read, the second one to check the reserve the first had set
//   the condition (1 to 4, all)  one read, the second to check the reserve
//   an exclusion, a field, the reserve  one read (these do change what the engine is asked)
// FIX: the engine's one read carries a view for every period and every condition (desk.views, lib/deskV3.js packViews; built in lib/onebox.js withDesk from the same rows); a switch adopts the stored view and the engine's own reserveCheck is made over its sales. No read.
// OTHER PAGES AND CARS: every Desk case on every page that switches period or condition (the case workspace, the report preview, the PDF, a forwarded lead's case); every car, because the views are built for each read.
// CLASS (a switch that reads, or a view that is not what a read would have said): this check (1) counts engine reads on a period or condition switch at the action level, (2) compares EVERY view with the engine's direct read of that very question (condition x period), field by field.
//   node scripts/deskViewsCheck.mjs [rootDir]
import path from "node:path"; import { pathToFileURL } from "node:url"; import { setup } from "./_deskCaseWorld.mjs";
const root = path.resolve(process.argv[2] || "."), { K, read, calls, readyCase, T, today } = await setup(root);
const DV = await import(pathToFileURL(path.join(root, "lib/deskV3.js")).href);
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) pass++; else { fail++; console.log("FAIL " + n + (d ? " :: " + d : "")); } };
const J = x => JSON.stringify(x);
const base = await readyCase();
ok("the engine's read carries a view for every condition and period (5 x 3) and the sales are stored once", DV.hasViews(base.desk) && Object.keys(base.desk.views).length === 15 && base.desk.pool.length > 0 && base.desk.pool.length < 15 * 80, Object.keys(base.desk.views || {}).length + " views, pool " + (base.desk.pool || []).length);
// (1) no read on a switch, from every state to every other
let reads = 0, n0 = calls.length, c = base;
for (const m of [3, 6, 12]) { c = K.setWindow(c, m, T); ok(`period ${m}: the case is at that view and nothing asks the engine`, c.desk.view.months === m && c.desk.evidence.windowMonths === m && !K.needsRecall(c)); }
for (const t of [1, 2, 3, 4, null]) { c = K.setCondition(c, t ? { tier: t, name: "x" } : null, T); ok(`condition ${t || "all"}: the case is at that view and nothing asks the engine`, c.desk.view.tier === (t || 0) && !K.needsRecall(c)); }
const r0 = await K.refreshEvidence(c, read, { caseDate: today, now: T }); ok("no read was made by any switch (nor by the refresh after them)", calls.length === n0 && r0.recalled === false, `calls ${calls.length - n0}`);
// (2) every view is what a direct read of that question says. A direct read here is the engine asked for that tier and that period with no views (the way every click was answered before).
const ASKED = ["evidence", "original", "sales", "rungs", "reserveStart", "comparables", "outside", "quarters", "condition", "factors", "whyDraft", "supports", "considered", "conditionNote", "specLine"];
let compared = 0; const bad = [];
for (const t of [0, 1, 2, 3, 4]) for (const m of [3, 6, 12]) {
  let k = K.setWindow(K.setCondition(base, t ? { tier: t, name: "x" } : null, T), m, T);
  const direct = await read({ ...K.recallInput(k, today), desk: { ...K.recallInput(k, today).desk, views: false } }), dd = direct && direct.desk;
  if (!dd) { bad.push(`${t}:${m} no direct read`); continue; }
  for (const f of ASKED) { compared++; const a = J(k.desk[f]), b = J(dd[f]); if (a !== b) bad.push(`${t}:${m}.${f}`); }
}
ok(`every view equals the engine's direct read of that condition and period (${compared} fields over 15 views)`, compared >= 15 * ASKED.length && !bad.length, bad.slice(0, 8).join(" "));
// (2b) ONE ANSWER FOR THE CAR'S CONDITION SIGNALS (Lane F's run: "no signals counted" became "4 signals counted" after a window click). CAUSE: a click read the engine again, and the second read answered the car's own condition record differently from the first (the VIN's archive match is read with a timeout and may come back empty once and full the next time). The views come from the one read, so the signals line is the same whichever period or condition is shown.
{ const lines = new Set(); for (const t of [0, 1, 2, 3, 4]) for (const m of [3, 6, 12]) lines.add(J(K.setWindow(K.setCondition(base, t ? { tier: t, name: "x" } : null, T), m, T).desk.condition));
  ok("the car's condition signals read the same in every period and condition of one read", lines.size === 1 && J(base.desk.condition) === [...lines][0], lines.size + " different"); }
// (2c) ONE VIEW PER RUNG, STABLE ACROSS READS (Lane C's live run on pv_hm at 12 months: the buttons read Excellent 8, Good 14, Fair 4 before the first 24 month read of the day, and 5, 6, 3 after it with no period change).
// CAUSE: the rung lines were the car's sales of each condition with NO mileage cut, except the rung the case held, which was cut by the mileage band; the untiered read had no band, so the first read showed 8, 14, 4 and a later read made with a condition chosen showed the chosen rung (and, after that read replaced the stored answer, every rung) at the band's 5, 6, 3.
// THE RIGHT SET is the band's (5, 6, 3): a rung's count is the number of sales the case reads when that rung is picked (its condition AND the mileage band), the same number the header gives after the click, so the button promises what the click delivers (8, 14, 4 is the count with no mileage cut, 26 against the market line's 39 because untiered sales are in neither). Every rung is counted that way in every read, whichever condition the read was made with.
{ const off = []; for (const m of [3, 6, 12]) { const sets = []; for (const t of [0, 1, 2, 3, 4]) { const k = K.setWindow(K.setCondition(base, t ? { tier: t, name: "x" } : null, T), m, T), d = await read({ ...K.recallInput(k, today), desk: { ...K.recallInput(k, today).desk, views: false } }); sets.push(J(d.desk.rungs)); }
    if (new Set(sets).size !== 1) off.push(`${m} months: ${new Set(sets).size} different rung sets across reads made with different conditions`); }
  ok("the rungs are the same whichever condition the read was made with (one view per rung, stable across reads)", !off.length, off.join(" | ")); }
// (3) the reserve check after a switch is the engine's check of the reserve the case holds, over that view's sales
{ let k = K.setReserve(base, { figure: 30000 }, T); k = K.setWindow(k, 6, T); const ck = k.desk.reserveCheck, want = DV.reserveCheckOf(k.desk.sales, k.desk.evidence, 30000, 6);
  ok("the reserve check after a switch is of the case's own reserve over the new view's sales", !!ck && J(ck) === J(want) && ck.of === k.desk.evidence.count, J(ck)); }
// (4) an old case (no views) is read once on a switch, then holds views again
{ const old = structuredClone(base); delete old.desk.views; delete old.desk.pool; const sw = K.setWindow(old, 6, T), n = calls.length, r = await K.refreshEvidence(sw, read, { caseDate: today, now: T });
  ok("a case with no views reads once on a switch and then holds them", K.needsRecall(sw) && r.recalled === true && calls.length - n >= 1 && DV.hasViews(r.case.desk) && !K.needsRecall(r.case)); }
// (5) the page is not sent the pool
{ const V = await import(pathToFileURL(path.join(root, "lib/desk/caseView.js")).href), v = V.caseView({ id: "n", created_at: T, submission: { typed: true, photos: [], documents: [] }, case: base }, [], T);
  ok("the case view the page gets carries the active view and not the views or the pool", v.desk && !("views" in v.desk) && !("pool" in v.desk) && Array.isArray(v.desk.sales) && v.desk.sales.length === base.desk.sales.length); }
// (3) THE WINDOWS THE ARCHIVE CAN HONOUR (Lane D, Nov 13 2026): desk.windows is 3, 6 and 12, with 24 only when the car's sales on record start more than 12 months back; byWindow carries the 3 month view; a window the record cannot honour is not taken.
ok("WINDOWS 1: the case carries desk.windows 3, 6 and 12 with the table's labels, and no 24 (this record starts under a year back)", J(base.desk.windows) === J([{ months: 3, label: "3 months" }, { months: 6, label: "6 months" }, { months: 12, label: "12 months" }]), J(base.desk.windows));
ok("WINDOWS 2: byWindow carries the 3 month view, from the same population (its sales are a part of the 6 months', its lines are the engine's)", !!base.desk.evidence.byWindow["3"] && base.desk.evidence.byWindow["3"].months === 3 && base.desk.evidence.byWindow["3"].count <= base.desk.evidence.byWindow["6"].count && base.desk.evidence.byWindow["3"].count > 0 && typeof base.desk.evidence.byWindow["3"].populationLine === "string" && Array.isArray(base.desk.evidence.byWindow["3"].axisTicks), J(Object.keys(base.desk.evidence.byWindow)));
ok("WINDOWS 3: a view is stored for each condition and each window offered, none for 24", Object.keys(base.desk.views).sort().join() === [0, 1, 2, 3, 4].flatMap(t => [3, 6, 12].map(m => t + ":" + m)).sort().join(), Object.keys(base.desk.views).join());
ok("WINDOWS 4: a period the record cannot honour is refused (24 here), the case unchanged; a period that is not a window is refused too", K.setWindow(base, 24, T) === null && K.setWindow(base, 9, T) === null && K.setWindow(base, 3, T).desk.view.months === 3);
{ const when = "2026-11-13", rows = ms => ms.map((m, i) => ({ id: "r" + i, price: 20000 + i, date: DV.cutoffOf(when, m) })), has24 = ws => ws.some(w => w.months === 24), M = ws => ws.map(w => w.months).join();
  const young = DV.windowsOf(rows([2, 5, 9, 11]), when), old = DV.windowsOf(rows([2, 5, 14]), when), edge = DV.windowsOf(rows([12]), when), none = DV.windowsOf([], when), undated = DV.windowsOf([{ price: 1 }, { price: 2, date: null }], when);
  ok("WINDOWS 5: the unit: 24 only when the first sale on record is more than 12 months back; a sale exactly 12 months back, none, or no dates do not offer it", !has24(young) && has24(old) && !has24(edge) && !has24(none) && !has24(undated) && [young, old, edge, none, undated].every(w => M(w.filter(x => x.months !== 24)) === "3,6,12"), [young, old, edge, none, undated].map(M).join(" | ")); }
console.log(`deskViewsCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
