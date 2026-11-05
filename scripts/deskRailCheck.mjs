// DESK VALUATIONS: THE RAIL AND WHO MAY TOUCH A SHEET (Lane E, Nov 4 2026; docs/desk-valuations-spec.md "The queue and the rail"). Today's queue, My sheets, Company (searchable), the org and seat at the
// bottom; several sheets open at once, each keeping its state; a sheet belongs to the forwarding seat, any seat can pick up an unopened New sheet, once opened others see it read only, nobody finalises
// another seat's sheet; another org sees nothing. The actions are checked directly and then on the real page.     node scripts/deskRailCheck.mjs
import { handleSheetAction } from "../lib/desk/sheetActions.js";
import { memoryStore, accessOf } from "../lib/desk/sheetStore.js";
import { startDesk, seed, wait, press, typeIn } from "./deskValsRender.mjs";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const ORG = "rail-org", SET = { name: "Hagerty Marketplace" };
// ---- the ownership rules, on their own
{ const mk = (o, st = "New", opened = null) => ({ owner_seat: o, status: st, opened_at: opened });
  ok(accessOf(mk("ava"), "ava").canEdit && accessOf(mk("ava"), "ava").canFinalise, "the forwarding seat edits and finalises its own sheet");
  ok(accessOf(mk("ava"), "ben").canPickUp && !accessOf(mk("ava"), "ben").canEdit, "any seat can pick up an unopened New sheet, and until it does it cannot edit it");
  ok(accessOf(mk("ava", "In progress", "t"), "ben").role === "read_only" && !accessOf(mk("ava", "In progress", "t"), "ben").canEdit && !accessOf(mk("ava", "In progress", "t"), "ben").canFinalise, "once opened, other seats see the sheet read only and cannot finalise it");
  ok(accessOf(mk("ava", "New", "t"), "ben").role === "read_only", "a New sheet that has been opened is no longer up for pick up");
  ok(!accessOf(mk("ava", "Finalised", "t"), "ava").canEdit && !accessOf(mk("ava", "Finalised", "t"), "ava").canFinalise && !accessOf(mk("ava", "Sent", "t"), "ava").canEdit, "a finalised or sent sheet is locked, to its owner too");
  ok(!accessOf(mk("ava", "Needs the car"), "ava").canFinalise, "a Needs the car row cannot be finalised until there is a car"); }
const store = memoryStore(), cx = (seat, org = ORG) => ({ env: {}, org, seat, store, orgSettings: SET });
const a1 = await seed(store, { org: ORG, seat: "ava", minutesAgo: 5 }), a2 = await seed(store, { org: ORG, seat: "ava", vin: "WP0CA29974S650321", minutesAgo: 90 }), b1 = await seed(store, { org: ORG, seat: "ben", minutesAgo: 30 }), nc = await seed(store, { org: ORG, seat: "ava", vin: null, status: "Needs the car", minutesAgo: 1 });
await handleSheetAction("sheet_open", { id: a2.id }, cx("ava"));   // ava opens her second sheet
// ---- the lists
{ const q = await handleSheetAction("sheet_queue", { view: "queue" }, cx("ava")), mine = await handleSheetAction("sheet_queue", { view: "mine" }, cx("ava")), ben = await handleSheetAction("sheet_queue", { view: "mine" }, cx("ben"));
  ok(q.rows.length === 4 && q.rows.every(r => r.car && r.status && r.owner && r.timeIn), `Today's queue lists every sheet with its car, status, owner and time in (${q.rows.map(r => r.timeIn).join(", ")})`);
  ok(q.rows.some(r => r.status === "Needs the car" && r.car === "Needs the car"), "a submission with no car is a row, Needs the car, never dropped");
  ok(q.rows.find(r => r.id === a1.id).timeIn === "5 min" && q.rows.find(r => r.id === a2.id).timeIn === "1 h", "time in is worded by the server (5 min, 1 h)");
  ok(mine.rows.length === 3 && mine.rows.every(r => r.owner === "ava") && ben.rows.length === 1 && ben.rows[0].owner === "ben", "My sheets are the seat's own");
  const co = async s => (await handleSheetAction("sheet_queue", { view: "company", q: s }, cx("ben"))).rows.map(r => r.id);
  ok((await co("WP0CA29974S650321")).join() === a2.id && (await co("ava")).length === 3 && (await co("ben")).join() === b1.id && (await co("needs the car")).join() === nc.id && (await co("in progress")).join() === a2.id && (await co(a1.created_at.slice(0, 10))).length === [a1, a2, b1, nc].filter(x => x.created_at.slice(0, 10) === a1.created_at.slice(0, 10)).length && (await co("carrera s")).length === 2, "Company searches by VIN, car, expert, status and date"); }
// ---- opening, picking up, read only
let o = await handleSheetAction("sheet_open", { id: a1.id }, cx("ava")); ok(o.ok && o.sheet.status === "In progress" && o.sheet.opened_at && o.access.role === "owner", "the owner opening a New sheet makes it In progress");
o = await handleSheetAction("sheet_open", { id: b1.id }, cx("ava")); ok(o.access.role === "can_pick_up" && o.sheet.owner_seat === "ben" && o.sheet.status === "New", "another seat looking at an unopened New sheet does not take it");
const save = (id, seat, patch = { tier: 3 }) => handleSheetAction("sheet_save", { id, patch }, cx(seat));
ok((await save(b1.id, "ava")).refused, "...and cannot change it until it picks it up");
o = await handleSheetAction("sheet_open", { id: b1.id, pickUp: true }, cx("ava")); ok(o.access.role === "owner" && o.sheet.owner_seat === "ava" && o.sheet.status === "In progress", "picking it up makes it the picker's, In progress");
o = await handleSheetAction("sheet_open", { id: b1.id }, cx("ben")); ok(o.access.role === "read_only" && /Read only/.test(o.access.why), "the seat it came from now sees it read only: " + o.access.why);
{ const r = await save(a2.id, "ben"); ok(r.refused && /ava/.test(r.why), "a seat cannot change another seat's opened sheet: " + r.why);
  const f = await handleSheetAction("sheet_finalise", { id: a2.id }, cx("ben")); ok(f.refused && /Only ava can finalise/.test(f.why), "nobody finalises another seat's sheet: " + f.why);
  ok((await handleSheetAction("sheet_pdf", { id: a2.id }, cx("ben"))).refused && (await handleSheetAction("sheet_send", { id: a2.id, to: "x@example.com" }, cx("ben"))).refused, "nor exports or sends it"); }
{ const f = await handleSheetAction("sheet_finalise", { id: nc.id }, cx("ava")); ok(f.refused, "a Needs the car row cannot be finalised: " + f.why); }
// ---- another org sees nothing
{ const q = await handleSheetAction("sheet_queue", { view: "company" }, cx("ava", "other-org")), g = await handleSheetAction("sheet_open", { id: a1.id }, cx("ava", "other-org")); ok(q.rows.length === 0 && g.refused && /No such sheet/.test(g.why), "another org's seat sees none of this org's sheets and cannot open one by id"); }
{ const t = await handleSheetAction("sheet_new", { text: "WP0AB29918S745123" }, cx("cara")); const q = await handleSheetAction("sheet_queue", { view: "mine" }, cx("cara")); ok(t.ok && q.rows.length === 1 && q.rows[0].owner === "cara" && q.rows[0].status === "New", "a VIN typed at the top makes a New sheet owned by the seat that typed it"); }

// ---- the page
const seatRef = { s: "ava" };
const D = await startDesk({ org: ORG, seat: "ava", orgSettings: SET, store }); D.state.setSeat("ava");
for (const w of [1440, 390]) {
  const p = await D.open(w);
  const rail = await p.evaluate(() => ({ secs: [...document.querySelectorAll("#rail-vals .sec")].map(e => e.textContent), rows: [...document.querySelectorAll("#l-queue .qrow")].map(r => ({ car: r.querySelector(".qcar").textContent, meta: r.querySelector(".qmeta").innerText })), seat: document.querySelector("#seatline").innerText }));
  ok(rail.secs.join("|") === "Today’s queue|My sheets|Company" && rail.rows.length >= 4 && rail.rows.every(r => /(New|In progress|Needs the car|Finalised|Sent)/i.test(r.meta) && /\b(ava|ben|cara)\b/.test(r.meta) && /(just now|\d+ (min|h|d))/.test(r.meta)), `${w}: the rail holds Today's queue, My sheets and Company; a row shows car, status, owner and time in`);
  ok(/Hagerty Marketplace/.test(rail.seat) && /seat: ava/.test(rail.seat), `${w}: the org and the seat sit at the bottom (${rail.seat.replace(/\s+/g, " ")})`);
  if (w === 390) { await p.click(`#l-queue [data-open="${a2.id}"]`); await wait(900); ok(await p.evaluate(() => document.querySelector(".sheet h1").textContent) === "2007 Porsche 911 Turbo" && await p.evaluate(() => document.querySelector("#rail-vals").getBoundingClientRect().width) > 300, "390: on a phone the rail is a strip above the sheet and a row opens it"); await p.close(); continue; }
  // several sheets open at once, each keeping its state
  await press(p, `#l-queue [data-open="${a1.id}"]`); await wait(900); await press(p, '[data-tier="2"]'); await wait(700); await press(p, '[data-dmode="reserve"]'); await wait(500); await typeIn(p, '[data-k="d-reserve"]', "68250"); await wait(900);
  await p.click(`#l-queue [data-open="${a2.id}"]`); await wait(900);
  ok((await p.evaluate(() => document.querySelectorAll(".vtab").length)) === 2 && (await p.evaluate(() => document.querySelector(".sheet h1").textContent)) === "2007 Porsche 911 Turbo", `${w}: two sheets open at once: two tabs, the second in front`);
  await p.click('.vtab:first-child'); await wait(500);
  const back = await p.evaluate(() => ({ h: document.querySelector(".sheet h1").textContent, v: (document.querySelector('[data-k="d-reserve"]') || {}).value, tier: document.querySelector(".tier.on") && document.querySelector(".tier.on").textContent }));
  ok(back.h === "2008 Porsche 911 Carrera S" && back.v === "68250" && /Excellent/.test(back.tier || ""), `${w}: going back to the first sheet finds its tier and reserve as left (${back.v})`);
  { const tc = await p.evaluate(() => [...document.querySelectorAll(".thiscar .tc")].map(e => e.innerText.replace(/\s+/g, " "))); ok(tc.length >= 2 && tc.every(t => /New|In progress|Finalised|Sent/.test(t)), `${w}: This car lists the earlier sheets for the same VIN beside the sheet (${tc.length})`); }
  ok((await store.get(ORG, a1.id)).state.decision.reserve === "68250" && (await store.get(ORG, a1.id)).state.tier === 2, `${w}: and they are saved on the sheet`);
  // read only, and pick up
  await p.click(`#l-company [data-open="${b1.id}"]`).catch(() => {}); await wait(800);
  ok(await p.evaluate(() => document.querySelector(".sheet h1").textContent) !== null, `${w}: a sheet of another seat opens`);
  await p.close();
}
{
  D.state.setSeat("ben"); const bsheet = await seed(store, { org: ORG, seat: "ava", minutesAgo: 2 }), p = await D.open(1440);
  await p.click(`#l-company [data-open="${a2.id}"]`); await wait(900);
  const ro = await p.evaluate(() => ({ banner: (document.querySelector(".banner") || {}).innerText, enabled: [...document.querySelectorAll(".sheet input, .sheet textarea, .sheet select, .sheet [data-tier], .sheet [data-chk], .sheet [data-dmode], .sheet [data-confirm]")].filter(e => !e.disabled).length, fin: !!document.querySelector("[data-finalise]:not([disabled])") }));
  ok(/Read only/.test(ro.banner) && ro.enabled === 0 && !ro.fin, `another seat's opened sheet: a read only banner, no field editable, Finalise disabled (${(ro.banner || "").slice(0, 60)})`);
  await p.click(`#l-company [data-open="${bsheet.id}"]`); await wait(900);
  const up = await p.evaluate(() => ({ b: (document.querySelector("[data-pickup]") || {}).innerText, enabled: [...document.querySelectorAll(".sheet input:not(:disabled)")].length }));
  ok(up.b === "Pick up this sheet" && up.enabled === 0, "an unopened New sheet of another seat offers Pick up this sheet, and nothing is editable until then");
  await p.click("[data-pickup]"); await wait(1000);
  ok((await store.get(ORG, bsheet.id)).owner_seat === "ben" && (await p.evaluate(() => [...document.querySelectorAll(".sheet [data-tier]:not(:disabled)")].length)) === 4, "picked up: the sheet is the seat's and its fields are editable");
  // company search on the page
  await p.type("#csearch", "needs the car"); await wait(700);
  ok((await p.evaluate(() => [...document.querySelectorAll("#l-company .qrow")].map(r => r.querySelector(".qcar").textContent))).join() === "Needs the car", "Company search narrows the list as you type");
  // the modes
  await p.click("#modeAnalyst"); await wait(300);
  ok(await p.evaluate(() => !!document.querySelector("#q") && getComputedStyle(document.querySelector(".chat")).display !== "none" && getComputedStyle(document.querySelector("#vals")).display === "none" && getComputedStyle(document.querySelector("#rail-vals")).display === "none"), "Analyst mode: the question box is back and the sheets are out of the way");
  await p.click("#modeVals"); await wait(500); ok(await p.evaluate(() => getComputedStyle(document.querySelector(".chat")).display === "none" && !!document.querySelector(".sheet")), "Valuations mode brings the open sheet back as it was");
  ok(p._errs.length === 0, "no page error (" + p._errs.join("; ").slice(0, 100) + ")"); await p.close();
}
await D.close();
console.log(`deskRailCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
