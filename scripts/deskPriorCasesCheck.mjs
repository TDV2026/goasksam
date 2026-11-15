// DESK, PRIOR CASES AND THE CASE LIST (Lane D, Nov 14 2026, order 2318 stage 3). case.priorCases = { count, line, items: [ { id, alias, title, analyst, openedAt, reserve, status } ] }: every other case of the org, archived included, on the same car, by the MODEL KEY the pool read uses
// (lib/desk/familyKey.js deskModelFamily with the make and the year), never by the title text. case_list takes { q, includeArchived }: q matches year, make, model and alias, and with a q the archived are included and marked.
// CLASS: every case on every page that shows a case (the view is made in lib/desk/caseView.js) and every list a typed word finds cases by (case_list).
//   node scripts/deskPriorCasesCheck.mjs [rootDir]
import fs from "node:fs"; import path from "node:path"; import { pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || "."), U = f => import(pathToFileURL(path.join(root, f)).href), J = x => JSON.stringify(x);
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) pass++; else { fail++; console.log("FAIL " + n + (d ? " :: " + d : "")); } };
const A = await U("lib/desk/sheetActions.js"), S = await U("lib/desk/sheetStore.js"), M = await U("lib/desk/caseModel.js"), PC = await U("lib/desk/priorCases.js"), RW = await U("lib/reasonWords.js");
const NOW = "2026-11-14T12:00:00Z", store = S.memoryStore(); store.reset();
const ctx = (seat = "Jane Park") => ({ now: NOW, env: {}, org: "hm", seat, seatName: seat, store, orgSettings: { name: "H" }, readSheet: async () => null });
let n = 0;
const make = async (v, o = {}) => { const id = "aa" + String(++n).padStart(6, "0") + "-0000-4000-8000-000000000000", c = M.newCase({ org: "hm", now: NOW, vehicle: v, source: "seller", ...(o.seller ? { seller: { name: o.seller } } : {}) });
  const sh = { id, org_id: "hm", created_at: o.at || NOW, owner_seat: o.owner || "Jane Park", status: o.status || "In progress", submission: { typed: true, photos: [], documents: [] }, state: {}, case: { ...c, ...(o.reserve ? { reserve: { ...c.reserve, figure: o.reserve } } : {}), status: o.stage || c.status }, car_label: [v.year, v.make, v.model].join(" "), version: 0, ...(o.final ? { final: o.final } : {}), ...(o.sent ? { sent: o.sent } : {}) };
  await store.insert("hm", sh); return sh; };
const P1 = await make({ year: 1999, make: "Porsche", model: "911", trim: "Carrera" }, { reserve: 31000, at: "2026-11-01T10:00:00Z" });
const P2 = await make({ year: 1999, make: "Porsche", model: "911", trim: "Carrera" }, { owner: "Lee Ames", reserve: 33000, at: "2026-11-05T10:00:00Z", stage: "in_review" });
const P3 = await make({ year: 1999, make: "Porsche", model: "996", trim: "Carrera 4" }, { at: "2026-11-07T10:00:00Z" });    // filed under the chassis code: the same model key as 911
const PX = await make({ year: 2001, make: "Porsche", model: "911", trim: "Carrera" }, { at: "2026-11-08T10:00:00Z" });          // another year of the same model
const PA = await make({ year: 1999, make: "Porsche", model: "911", trim: "Carrera" }, { at: "2026-10-01T10:00:00Z", reserve: 29500 });
const PS = await make({ year: 1999, make: "Porsche", model: "911", trim: "Carrera" }, { at: "2026-10-10T10:00:00Z", status: "Sent", final: { decision: { reserve: 30500 } }, sent: { at: "2026-10-12T00:00:00Z" } });
const Z1 = await make({ year: 1972, make: "Datsun", model: "240Z" }); const Z2 = await make({ year: 1972, make: "Datsun", model: "240Z" });
const ZS = await make({ year: 1969, make: "Chevrolet", model: "Camaro", vin: "WP0AA2995XS626785" }, { seller: "Hal Pemberton" });
const arch = await A.handleSheetAction("case_archive", { id: PA.id }, ctx("Jane Park"));
ok("setup: the archive op archived one case", arch.ok === true, J(arch).slice(0, 120));
const get = async (id, seat) => (await A.handleSheetAction("case_get", { id }, ctx(seat))).case;
const c1 = await get(P1.id), pc = c1.priorCases;
// 1. two cases on the same car see each other (and the case itself is never in its own list)
const c2 = await get(P2.id);
ok("PRIOR 1: two cases on the same car see each other, and neither lists itself", pc.items.some(i => i.id === P2.id) && c2.priorCases.items.some(i => i.id === P1.id) && !pc.items.some(i => i.id === P1.id) && !c2.priorCases.items.some(i => i.id === P2.id), J(pc.items.map(i => i.alias)));
// 2. the model key, not the title: the 996 filed under its chassis code is the same car; another year of the same model is not
ok("PRIOR 2: a case on another year of the same model is not listed; the same car filed under its chassis code (996) is", !pc.items.some(i => i.id === PX.id) && pc.items.some(i => i.id === P3.id) && !(await get(PX.id)).priorCases.items.some(i => i.id === P1.id), J(pc.items.map(i => i.title)));
// 3. archived and sent cases appear, with the mark; the count and the line are the table's
const byId = Object.fromEntries(pc.items.map(i => [i.id, i]));
ok("PRIOR 3: archived and sent cases appear with their status, and the count is the list's", byId[PA.id] && byId[PA.id].status === "archived" && byId[PS.id] && byId[PS.id].status === "sent" && byId[P2.id].status === "in review" && byId[P3.id].status === "open" && pc.count === pc.items.length && pc.count === 4, J(pc.items.map(i => i.status)));
ok("PRIOR 4: the line is the table's: some, and none", pc.line === `Your desk has worked ${pc.count} of these before.` && (await get(Z1.id)).priorCases.line === "Your desk has worked 1 of these before." && (await get(PX.id)).priorCases.line === "Your desk has not worked one of these before." && (await get(PX.id)).priorCases.count === 0 && J((await get(PX.id)).priorCases.items) === "[]", pc.line);
ok("PRIOR 5: each item carries id, alias, title, analyst, openedAt, reserve (as sent, or as it stands)", pc.items.every(i => ["id", "alias", "title", "analyst", "openedAt", "reserve", "status"].every(k => k in i)) && byId[P2.id].reserve === 33000 && byId[PS.id].reserve === 30500 && byId[PA.id].reserve === 29500 && byId[P2.id].analyst === "Lee Ames" && byId[P3.id].alias === P3.id.slice(0, 8), J(byId[P2.id]));
// 4. case_list by model word and by alias; archived included and marked when q is present
const L = async b => A.handleSheetAction("case_list", b, ctx());
const byWord = await L({ q: "porsche" }), byModel = await L({ q: "911" }), byAlias = await L({ q: P3.id.slice(0, 8) }), noQ = await L({}), withArch = await L({ includeArchived: true }), none = await L({ q: "ferrari" });
ok("LIST 1: q finds by make and by model word, and the archived come with it, marked", byWord.ok && byWord.rows.some(r => r.id === PA.id && r.archived === true && r.status === "archived") && byWord.rows.length === 6 && byModel.rows.some(r => r.id === P1.id) && !byModel.rows.some(r => r.id === Z1.id), J(byWord.rows.map(r => r.archived)));
ok("LIST 2: q finds by alias, and by year", byAlias.rows.length === 1 && byAlias.rows[0].id === P3.id && (await L({ q: "1972" })).rows.length === 2 && none.rows.length === 0, J(byAlias.rows.map(r => r.alias)));
ok("LIST 3: with no q the archived are left out unless includeArchived is asked", !noQ.rows.some(r => r.id === PA.id) && withArch.rows.some(r => r.id === PA.id && r.archived === true) && noQ.rows.length === withArch.rows.length - 1);
// 6. the queue's old narrowing (title, seller, VIN) is all in case_list's q: nothing is lost
{ const sel = await L({ q: "pemberton" }), vin = await L({ q: "xs626785" }), both = await L({ q: "hal camaro" }), title = await L({ q: "datsun 240z" });
  ok("LIST 4: q finds a case by a seller word and by a VIN fragment (and by title words together)", sel.rows.length === 1 && sel.rows[0].id === ZS.id && vin.rows.length === 1 && vin.rows[0].id === ZS.id && both.rows.length === 1 && title.rows.length === 2, J([sel.rows.length, vin.rows.length, both.rows.length, title.rows.length])); }
// 7. the worded lines of an item: nothing for the page to format
ok("PRIOR 8: each item carries openedLine and reserveLine as the table's words (sent says so), null when there is nothing to say", byId[P2.id].openedLine === "Opened Nov 5, 2026 by Lee Ames" && byId[P2.id].reserveLine === "Reserve $33,000" && byId[PS.id].reserveLine === "Reserve $30,500 as sent" && byId[P3.id].reserveLine === null && byId[PA.id].reserveLine === "Reserve $29,500" && pc.items.every(i => typeof i.openedLine === "string" && !/\d{4}-\d{2}-\d{2}/.test(i.openedLine)), J(pc.items.map(i => [i.openedLine, i.reserveLine])));
// 5. the class: the key is the model family, not the title text
{ const k = PC.carKeyOf; const same = k({ case: M.newCase({ org: "x", now: NOW, vehicle: { year: 1999, make: "Porsche", model: "996" }, source: "seller" }) }) === k({ case: M.newCase({ org: "x", now: NOW, vehicle: { year: 1999, make: "Porsche", model: "911" }, source: "seller" }) });
  const withTitle = M.newCase({ org: "x", now: NOW, vehicle: { year: 1999, make: "Porsche", model: "911" }, source: "seller" }); withTitle.desk = { titleLine: "1999 Ferrari 355" };
  ok("PRIOR 6: the key is the model family with the make and year (996 and 911 are one, a title word never is)", same && k({ case: withTitle }) === k({ case: M.newCase({ org: "x", now: NOW, vehicle: { year: 1999, make: "Porsche", model: "911" }, source: "seller" }) }) && k({ case: M.newCase({ org: "x", now: NOW, vehicle: { year: 1999, make: "Porsche" }, source: "seller" }) }) === null); }
const src = fs.readFileSync(path.join(root, "lib/desk/priorCases.js"), "utf8");
ok("PRIOR 7: the match calls deskModelFamily and reads no title text for the key", /deskModelFamily\(/.test(src) && !/titleLine|car_label/.test(src.split("export function priorCasesOf")[0].split("export function carKeyOf")[1].split("export const aliasOf")[0]));
console.log(`deskPriorCasesCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
