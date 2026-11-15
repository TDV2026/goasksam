// DESK, NO ENGINE TALK (Lane D, Nov 14 2026, order 2318 item 4). CAUSE: conditionOf answered a car with no suggested condition with its own counting ("No condition is suggested, no signals counted and three are needed."), engine talk that the case page and the report printed.
// CLASS: every car with no suggested condition, on the page and in the report, and every case stored before the fix; the note is null and nothing is printed. One sweep over every served source and one over what is served.
//   node scripts/deskNoEngineTalkCheck.mjs [rootDir]
import fs from "node:fs"; import path from "node:path"; import { pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || "."), U = f => import(pathToFileURL(path.join(root, f)).href), J = x => JSON.stringify(x);
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) pass++; else { fail++; console.log("FAIL " + n + (d ? " :: " + d : "")); } };
const TALK = /no signals counted|signals? counted and \w+ (is|are) needed|No condition is suggested|(is|are) needed\.?"/;
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
const withS = R.reportState({ ...c, desk: { version: 1, condition: { suggested: { tier: 3, name: "Good" }, basis: "Suggested Good from 61,400 miles, 3 signals counted." }, comparables: [], outside: [], factors: [] } });
ok("TALK 6: a suggested condition still prints its basis", withS.conditionBasis === "Suggested Good from 61,400 miles, 3 signals counted.", String(withS.conditionBasis));
console.log(`deskNoEngineTalkCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
