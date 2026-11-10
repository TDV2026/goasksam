// Desk v3 stage 5: handling time. opened_at on the first open per analyst, handling seconds on finalize, and the crew dashboard block with no per analyst figure. node scripts/deskHandlingCheck.mjs [rootDir]
import path from "node:path"; import { pathToFileURL } from "node:url"; import { setup } from "./_deskCaseWorld.mjs";
const root = path.resolve(process.argv[2] || "."), { M, K, readyCase, T } = await setup(root), imp = f => import(pathToFileURL(path.join(root, f)).href);
const A = await imp("lib/desk/sheetActions.js"), V = await imp("lib/desk/caseView.js"), { memoryStore } = await imp("lib/desk/sheetStore.js");
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) pass++; else { fail++; console.log("FAIL " + n + (d ? "  " + d : "")); } }; const J = x => JSON.stringify(x);
const at = (m, s = 0) => new Date(Date.parse(T) + m * 60000 + s * 1000).toISOString();
// opens: once per analyst, the first open of anyone is opened_at
let c = M.newCase({ now: T });
ok("a new case has no open", c.opened_at === null && c.opens.length === 0);
c = M.recordOpen(c, "7", at(1)); ok("the first open is recorded and is opened_at", c.opened_at === at(1) && c.opens.length === 1 && c.opens[0].seat === "7");
const again = M.recordOpen(c, "7", at(9)); ok("opening again by the same analyst changes nothing", again === c && again.opens.length === 1 && again.opened_at === at(1));
const second = M.recordOpen(c, "8", at(20)); ok("a second analyst's first open is recorded, opened_at stays the first", second.opens.length === 2 && second.opened_at === at(1) && second.opens[1].at === at(20));
ok("handling seconds run from the finalizing analyst's own first open", M.handlingSeconds(second, "8", at(25)) === 300 && M.handlingSeconds(second, "7", at(25)) === 1440);
ok("a seat that never opened falls back to the case's first open; no open at all is null", M.handlingSeconds(second, "9", at(25)) === 1440 && M.handlingSeconds(M.newCase({ now: T }), "7", at(25)) === null);
// through the actions
const store = memoryStore(), mk = seat => ({ org: "t", seat, store, now: at(0), env: {}, fetchImage: async () => null });
const base = await readyCase(); base.opened_at = null; base.opens = []; base.handling_seconds = null;
await store.insert("t", { id: "h1", owner_seat: "7", status: "In progress", created_at: T, submission: { typed: true, photos: [], documents: [] }, state: {}, case: base, version: 1 });
const g0 = await A.handleSheetAction("case_get", { id: "h1" }, { ...mk("7"), now: at(1) });
ok("case_get without open is a read: nothing is recorded", g0.case.opened_at === null && g0.case.opens.length === 0);
const g1 = await A.handleSheetAction("case_get", { id: "h1", open: true }, { ...mk("7"), now: at(2) });
ok("case_get with open records the first open", g1.ok && g1.case.opened_at === at(2) && g1.case.opens.length === 1, J(g1).slice(0, 120));
await A.handleSheetAction("case_get", { id: "h1", open: true }, { ...mk("7"), now: at(50) });
ok("a second open by the same analyst does not move it", (await A.handleSheetAction("case_get", { id: "h1" }, mk("7"))).case.opened_at === at(2));
const fin = await A.handleSheetAction("case_finalize", { id: "h1" }, { ...mk("7"), now: at(14) });
ok("finalize stores the handling seconds (12 minutes), on the case and on the version row", fin.ok && fin.case.handling_seconds === 720 && fin.row.handling_seconds === 720, J(fin).slice(0, 160));
const rev = await A.handleSheetAction("case_edit", { id: "h1", op: "field", field: "colour", value: "Black" }, { ...mk("7"), now: at(100) });
ok("a revision starts its own handling time and the finalized version keeps its own", rev.ok && rev.case.handling_seconds === null && rev.case.opens.length === 1 && rev.case.opens[0].at === at(100) && (await A.handleSheetAction("case_version", { id: "h1", version: 1 }, mk("7"))).row.handling_seconds === 720);
const fin2 = await A.handleSheetAction("case_finalize", { id: rev.id }, { ...mk("7"), now: at(104) });
ok("the revision's handling seconds are the time on the revision (4 minutes)", fin2.ok && fin2.row.handling_seconds === 240 && fin2.row.version === 2, J(fin2).slice(0, 120));
// a field asked once
{ const a1 = await A.handleSheetAction("case_edit", { id: "x", op: "ask", fields: ["mileage"] }, mk("7")); ok("ask on a sheet that is not there is refused", a1.refused === true);
  await store.insert("t", { id: "a1", owner_seat: "7", status: "In progress", created_at: T, submission: { typed: false, photos: [], documents: [] }, state: {}, case: M.newCase({ now: T, leadRef: "L-1" }), version: 1 });
  const r1 = await A.handleSheetAction("case_edit", { id: "a1", op: "ask", fields: ["mileage", "transmission"] }, mk("7")), r2 = await A.handleSheetAction("case_edit", { id: "a1", op: "ask", fields: ["mileage", "colour"] }, mk("7"));
  ok("ask returns the fields newly asked, and a field already asked is not returned again", J([...r1.asked].sort()) === '["mileage","transmission"]' && J(r2.asked) === '["colour"]' && r2.case.asked.filter(k => k === "mileage").length === 1); }
// the four lines: each from the cases, a superseded sheet counted once, no handling time from a case never opened
const day = at(0).slice(0, 10), cs = (id, status, over = {}) => ({ id, created_at: T, submission: { typed: false }, case: { ...M.newCase({ now: T, leadRef: "L-" + id }), status, ...over } });
const sheets = [cs("a", "finalized", { finalized_at: at(30), handling_seconds: 600, asked: ["mileage"], opens: [{ seat: "7", at: T }] }), cs("b", "finalized", { finalized_at: at(40), handling_seconds: 1800 }), cs("c", "finalized", { finalized_at: "2026-01-01T00:00:00Z", handling_seconds: 60, version: 2 }), cs("d", "in_review"), cs("e", "finalized", { finalized_at: at(50), handling_seconds: null }), cs("m", "in_review", { lead_ref: null })];   // m: a manual case with no lead
const lines = V.handlingLines(sheets, at(60)), by = Object.fromEntries(lines.map(l => [l.label, l.value]));
ok("reports finalized today counts only today's", by["Reports finalized today"] === "3", J(by));
ok("median handling time is of the cases that have one (600, 1800, 60 gives 10 min)", by["Median handling time"] === "10 min", by["Median handling time"]);
ok("share needing more from the seller is of the lead cases (1 of the 5 lead cases is 20%; the manual case is not a lead)", by["Cases needing more from the seller"] === "20%", by["Cases needing more from the seller"]);
ok("reports revised after finalizing counts a finalized case at version 2 or more", by["Reports revised after finalizing"] === "1");
// the dashboard: per org, crew key only, no seat anywhere
{ const rows = [...sheets.map(s => ({ org_id: "alpha", sheet: s })), { org_id: "alpha", sheet: { ...cs("a2", "in_review"), corrects: "a" } }, { org_id: "beta", sheet: cs("z", "finalized", { finalized_at: at(30), handling_seconds: 120, opens: [{ seat: "analyst-secret-9", at: T }] }) }, { org_id: "beta", sheet: { id: "old", created_at: T, submission: {}, status: "Finalised" } }];
  const ops = V.deskOpsByOrg(rows, at(60)), alpha = ops.find(o => o.org === "alpha"), beta = ops.find(o => o.org === "beta");
  ok("a sheet that a later version corrects is not counted again, and it no longer counts as finalized today", alpha.cases === 6);
  ok("one block per org, made from that org's own cases only", ops.length === 2 && alpha.cases === 6 && beta.cases === 1 && alpha.lines[0].value === "2" && beta.lines[0].value === "1" && beta.lines[1].value === "2 min");
  ok("a sheet with no case (a pre V3 sheet) is not a case here", beta.cases === 1);
  ok("no seat, analyst or owner figure is in the output", !/analyst-secret-9|"seat"|owner|opens/.test(J(ops)), J(ops).slice(0, 200));
  process.env.OPS_KEY = "k-test"; process.env.SUPABASE_URL = "https://x.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "svc";
  const realFetch = globalThis.fetch; globalThis.fetch = async u => (/desk_sheets/.test(String(u)) ? new Response(JSON.stringify(rows), { status: 200 }) : new Response("[]", { status: 200 }));
  const H = (await imp("api/usageDashboard.js")).default, run = async (headers, fmt) => { let out = { code: 0, body: null }; const res = { setHeader() {}, status(c) { out.code = c; return this; }, json(b) { out.body = b; return this; }, send(b) { out.body = b; return this; }, end() { return this; } }; await H({ method: "GET", query: { view: "desk", ...(fmt ? { format: "json" } : {}) }, headers }, res); return out; };
  const no = await run({}, true), yes = await run({ "x-ops-key": "k-test" }, true), html = await run({ "x-ops-key": "k-test" }, false); globalThis.fetch = realFetch;
  ok("the desk view is behind the crew header key", no.code === 401 && yes.code === 200, J([no.code, yes.code]));
  ok("the view serves the four lines for each org", yes.body && yes.body.orgs.length === 2 && yes.body.orgs.every(o => o.lines.length === 4 && o.lines.map(l => l.label).join("|") === "Reports finalized today|Median handling time|Cases needing more from the seller|Reports revised after finalizing"), J(yes.body).slice(0, 200));
  ok("the served view and the page carry no seat", !/analyst-secret-9|"seat"/.test(J(yes.body)) && typeof html.body === "string" && /Reports finalized today/.test(html.body) && !/analyst-secret-9/.test(html.body)); }
// THE CLOCK (Lane E's top bar): caseView.handling.clock is one line made on the server from the case's own opens, rebuilt on EVERY case view (get, new, every edit's answer, finalize). The page prints it as sent and runs no timer of its own.
{ const ck = c => c && c.handling && c.handling.clock, store2 = memoryStore(), mk2 = (seat, m) => ({ org: "t", seat, store: store2, now: at(m), env: {}, fetchImage: async () => null });
  const b2 = await readyCase(); b2.opened_at = null; b2.opens = []; b2.handling_seconds = null;
  await store2.insert("t", { id: "k1", owner_seat: "7", status: "In progress", created_at: T, submission: { typed: true, photos: [], documents: [] }, state: {}, case: b2, version: 1 });
  const g0 = await A.handleSheetAction("case_get", { id: "k1" }, mk2("7", 1));
  ok("a case not yet opened reads the plain line (the table's), and is not a time", ck(g0.case) === "Handling time starts when you open the case.", J(ck(g0.case)));
  const g1 = await A.handleSheetAction("case_get", { id: "k1", open: true }, mk2("7", 2));
  ok("opened, the clock is 0 seconds into the case", /^Handling time so far: 0 s\.$/.test(ck(g1.case)), J(ck(g1.case)));
  const e1 = await A.handleSheetAction("case_edit", { id: "k1", op: "field", field: "colour", value: "Black" }, mk2("7", 5));
  ok("every edit's answer carries a refreshed clock (3 minutes after the open)", e1.ok && /^Handling time so far: 3 min\.$/.test(ck(e1.case)), J(ck(e1.case)));
  const e2 = await A.handleSheetAction("case_edit", { id: "k1", op: "field", field: "colour", value: "Silver" }, mk2("7", 14));
  ok("and the next one moves it again (12 minutes), so a page that only prints the line is never stale", e2.ok && /^Handling time so far: 12 min\.$/.test(ck(e2.case)) && ck(e2.case) !== ck(e1.case), J(ck(e2.case)));
  const o8 = await A.handleSheetAction("case_get", { id: "k1" }, mk2("8", 14));
  ok("it is the viewing analyst's own time: a seat that never opened falls back to the case's first open", /^Handling time so far: 12 min\.$/.test(ck(o8.case)), J(ck(o8.case)));
  const f1 = await A.handleSheetAction("case_finalize", { id: "k1" }, mk2("7", 20));
  ok("finalized, the clock reads the recorded handling time (18 minutes) and no longer runs", f1.ok && ck(f1.case) === "Handled in 18 min." && ck((await A.handleSheetAction("case_get", { id: "k1" }, mk2("7", 90))).case) === "Handled in 18 min.", J(ck(f1.case)));
  const cn = await A.handleSheetAction("case_new", { text: "1999 Porsche 911 Carrera", mileage: "61,200" }, { ...mk2("7", 30), readSheet: async (e, input) => (await setup(root)).read(input) });
  ok("case_new answers the clock too", cn.ok && /Handling time starts/.test(ck(cn.case)), J(ck(cn.case)));
  const src = (await import("node:fs")).readFileSync(path.join(root, "lib/desk/caseView.js"), "utf8");
  ok("the clock's words are the table's: no typed 'Handling time' sentence in caseView", !/Handling time so far|Handled in|starts when you open/.test(src)); }
console.log(`deskHandlingCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
