// DESK V4 NEW CASE FORM CHECK (Lane S, Nov 11 2026, from Sam's first run). Offline: the V4 page in Chrome, its POSTs answered by the real in-process Desk reader (a case_decode and case_pickers answer, and a case_new refusal, by the check's own stub).
//   1 PHOTOS ACCUMULATE: picking one file and then another keeps both; several at once add several; each row has its Remove; the same file picked twice is one; Create case sends exactly the photos listed, one photo_add each. Mutant: a pick that replaces the list.
//   2 A VIN FILLS THE CAR: typing a 17 character VIN fills the year, make, model, trim, body and gearbox the server's decode returned, each marked "decoded"; editing a field clears its mark; a field the analyst already typed is never overwritten;
//     make, model, body, transmission and colour are pickers (a datalist from the server) and a typed value that is not in the list is still sent. Mutants: no decode; a decode that overwrites a typed field.
//   3 THE REFUSAL IS THE SERVER'S WORD: a refused Create case prints the server's own `why` as sent, under the button, never the generic line when a why was sent. Mutant: the why dropped.
//   NAMES: the decode and picker ops are PROPOSED by Lane S (case_decode {vin} -> {ok, fields:{year,make,model,trim,body,transmission}}; case_pickers {make?} -> {ok, makes, models, bodies, transmissions, colours}); Lane D confirms or renames them in docs/lane-notes.md. Until then the page leaves the fields plain when the server does not answer.
//   node scripts/deskV4NewCaseCheck.mjs
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { launch, openLive, tally } from "./deskV4Harness.mjs";
const { ok, done } = tally(), wait = ms => new Promise(r => setTimeout(r, ms)), b = await launch();
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v4nc-")), PNG = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64");
const pic = n => { const f = path.join(dir, n); fs.writeFileSync(f, PNG); return f; }, A = pic("front.jpg"), B2 = pic("rear.jpg"), C = pic("left.jpg"), D = pic("right.jpg");
const names = p => p.evaluate(() => [...document.querySelectorAll("#nc-list .ncf span")].map(s => s.textContent));
const openForm = async (opts = {}) => { const p = await openLive(b, opts); await p.evaluate(() => document.getElementById("newcase-btn").click()); await wait(200); return p; };

{ // 1 photos accumulate
  const run = async mutate => { const p = await openForm({ mutate }); const up = async (...f) => { await (await p.$("#nc-photos")).uploadFile(...f); await wait(150); };
    await up(A); const one = await names(p); await up(B2); const two = await names(p); await up(C, D); const four = await names(p); await up(A); const dup = await names(p);
    await p.evaluate(() => { const x = document.querySelector('#nc-list [data-file^="rear.jpg"] button') || document.querySelector("#nc-list button"); if (x) x.click(); }); const three = await names(p);
    await p.type("#nc-year", "1999"); await p.type("#nc-make", "Porsche"); await p.type("#nc-model", "911"); p._posts.length = 0; await p.click("#nc-go"); for (let i = 0; i < 60 && p._posts.filter(x => x.op === "photo_add").length < three.length; i++) await wait(250); await wait(400);
    const adds = p._posts.filter(x => x.op === "photo_add").map(x => x.name); await p.close(); return { one, two, four, dup, three, adds }; };
  const g = await run(null);
  ok(g.one.join() === "front.jpg" && g.two.join() === "front.jpg,rear.jpg", `picking one file and then another keeps both (${g.two.join(", ")})`);
  ok(g.four.length === 4 && g.dup.length === 4, `several at once add several (${g.four.length}), and the same file twice is one`);
  ok(g.three.length === 3 && !g.three.includes("rear.jpg"), "each row has its Remove, one at a time");
  ok(g.adds.join() === g.three.join(), `Create case sends exactly the photos listed, one photo_add each (${g.adds.join(", ")})`);
  const m = await run(h => h.replace("[].slice.call(ph.files || []).forEach(", "files.length = 0; [].slice.call(ph.files || []).forEach(")); ok(m.two.length < 2, "mutant caught: a second pick that replaces the first"); }

const DECODED = { ok: true, fields: { year: 1999, make: "Porsche", model: "911", trim: "Carrera", body: "Coupe", transmission: "Manual" } }, LISTS = { ok: true, makes: ["Ferrari", "Porsche"], models: ["911", "944"], bodies: ["Coupe", "Convertible"], transmissions: ["Manual", "Automatic"], colours: ["Guards Red", "Black"] };
const stub = async bd => bd.action === "case_decode" ? DECODED : bd.action === "case_pickers" ? { ...LISTS, ...(bd.make ? { models: ["911", "944", "968"] } : {}) } : undefined;
const VIN = "WP0AA2995XS626785";
{ // 2 the VIN fills the car, the pickers
  const F = ["year", "make", "model", "trim", "body", "trans"];
  const state = p => p.evaluate(F => Object.fromEntries(F.map(k => [k, { v: document.getElementById("nc-" + k).value, d: !document.getElementById("nc-" + k + "-dec").hidden, l: document.getElementById("nc-" + k).getAttribute("list") }])), F);
  const run = async mutate => { const p = await openForm({ intercept: stub, mutate }); await wait(300);
    const lists = await p.evaluate(() => ["dl-make", "dl-model", "dl-body", "dl-trans", "dl-colour"].map(i => [...document.getElementById(i).options].map(o => o.value).join("|")));
    await p.type("#nc-vin", VIN); await wait(500); const filled = await state(p);
    await p.evaluate(() => { const e = document.getElementById("nc-body"); e.value = "Targa"; e.dispatchEvent(new Event("input", { bubbles: true })); }); const edited = await state(p);
    await p.evaluate(() => { document.getElementById("newcase-btn").click(); }); await p.close();
    const q = await openForm({ intercept: stub, mutate }); await q.type("#nc-trans", "Tiptronic"); await q.type("#nc-vin", VIN); await wait(500); const typed = await state(q); await q.close(); return { lists, filled, edited, typed }; };
  const g = await run(null);
  ok(g.filled.year.v === "1999" && g.filled.make.v === "Porsche" && g.filled.model.v === "911" && g.filled.trim.v === "Carrera" && g.filled.body.v === "Coupe" && g.filled.trans.v === "Manual" && F.every(k => g.filled[k].d), "a VIN typed in fills year, make, model, trim, body and gearbox from the server's decode, each marked decoded");
  ok(g.edited.body.v === "Targa" && !g.edited.body.d && g.edited.make.d, "editing a decoded field clears its mark and keeps the edit; the others stay marked");
  ok(g.typed.trans.v === "Tiptronic" && !g.typed.trans.d && g.typed.make.v === "Porsche", "a field the analyst already typed is never overwritten by the decode");
  ok(g.lists[0] === "Ferrari|Porsche" && g.lists[2] === "Coupe|Convertible" && g.lists[3] === "Manual|Automatic" && g.lists[4] === "Guards Red|Black" && /911\|944/.test(g.lists[1]) && ["make", "model", "body", "trans"].every(k => /^dl-/.test(g.filled[k].l || "")), "make, model, body, gearbox and colour are pickers filled from the server's lists");
  { const p = await openForm({ intercept: stub }); await p.type("#nc-year", "1999"); await p.type("#nc-make", "Ferrari"); await p.type("#nc-model", "Dino 246 GT"); await p.type("#nc-colour", "Blu Dino"); p._posts.length = 0; await p.click("#nc-go"); await wait(2200); const sent = p._posts.find(x => x.action === "case_new") || {}; await p.close();
    ok(sent.model === "Dino 246 GT" && sent.colour === "Blu Dino", "a typed value that is not in a list is still sent as typed"); }
  const m1 = await run(h => h.replace("function decode() {", "function decode() { return;")); ok(!m1.filled.make.v, "mutant caught: a form that does not decode the VIN");
  const m2 = await run(h => h.replace("(e.value.trim() && !dec[p[1]])", "false")); ok(m2.typed.trans.v !== "Tiptronic", "mutant caught: a decode that overwrites what the analyst typed"); }

{ // 3 the refusal
  const WHY = "That VIN is already on an open case, so it was not made again.";
  const run = async (why, mutate) => { const p = await openForm({ mutate, intercept: async bd => bd.action === "case_new" ? { ok: false, refused: true, ...(why ? { why } : {}) } : undefined }); await p.type("#nc-vin", VIN); await p.click("#nc-go"); await wait(500);
    const r = await p.evaluate(() => { const m = document.getElementById("nc-msg"), g = document.getElementById("nc-go").getBoundingClientRect(), r = m.getBoundingClientRect(); return { t: m.textContent, vis: !m.hidden && r.height > 0, below: r.top >= g.bottom - 1, enabled: !document.getElementById("nc-go").disabled }; }); await p.close(); return r; };
  const g = await run(WHY); ok(g.t === WHY && g.vis && g.below && g.enabled, `a refused Create case prints the server's why as sent, under the button (${g.t})`);
  const n = await run(null); ok(n.t === "The case could not be created.", "with no why sent, the generic line is the fallback");
  const m = await run(WHY, h => h.replace("msg((e && (e.why || e.line)) || ", "msg(")); ok(m.t !== WHY, "mutant caught: the why dropped for the generic line"); }
{ // 4 a photo the server refuses never loses the case that was made
  const WHY = "This session takes JPG photos only.";
  const run = async mutate => { const p = await openForm({ mutate, intercept: async bd => bd.op === "photo_add" ? { ok: false, refused: true, why: WHY } : undefined }); await (await p.$("#nc-photos")).uploadFile(A); await wait(150); await p.type("#nc-year", "1999"); await p.type("#nc-make", "Porsche"); await p.type("#nc-model", "911"); await p.click("#nc-go"); await wait(2500);
    const r = await p.evaluate(() => ({ t: document.getElementById("nc-msg").textContent, btn: document.getElementById("nc-go").textContent, on: !document.getElementById("nc-go").disabled })); await p.close(); return r; };
  const g = await run(null); ok(g.t.startsWith(WHY) && g.btn === "Open the case" && g.on, `a refused photo prints the server's why and the button opens the case that was made (${g.btn})`);
  const m = await run(h => h.replace('go.textContent = "Open the case"; ', "")); ok(m.btn !== "Open the case", "mutant caught: a refused photo that leaves no way into the case"); }
await b.close(); fs.rmSync(dir, { recursive: true, force: true });
done("deskV4NewCaseCheck");
