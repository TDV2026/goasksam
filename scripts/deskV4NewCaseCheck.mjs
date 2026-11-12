// DESK V4 NEW CASE PANEL CHECK (Lane S, Nov 12 2026, the redesign). Offline: the V4 page in Chrome, its POSTs answered by the real in-process Desk reader, with case_decode, case_pickers and case_new refusals answered by the check's own stubs in the posted shape.
//   1 TWO STEPS: opening the panel shows one large field and Start, no grid of boxes before the car is known. Mutant: the old grid (step two always open).
//   2 A VIN (case_decode {vin} -> decoded.{field}.value): the car card shows the title in Newsreader, the VIN as the spec line, "Decoded from the VIN" small and grey (no uppercase), each decoded value a quiet tag with a pencil that edits it; body and gearbox arrive in their pickers with a small "decoded" tag on the value. Mutants: no decode; an uppercase label.
//   3 TYPED WORDS: case_decode takes a VIN only, so words are never sent to it; the words as typed are the card and Create sends them as `text`.
//   4 STEP TWO: labels above fields, two columns, one field height, pickers for body, transmission and colour, units inside the mileage and asking price fields, one primary button and one quiet one.
//   5 PHOTOS: a drop zone (a drop adds), thumbnails, a Remove each, JPG, PNG, WebP and HEIC accepted, accumulate, the same file twice is one, Create sends exactly the list. Mutant: a pick that replaces the list.
//   6 THE REFUSAL IS LANE D'S WORD AND NO OTHER: the server's `why` as sent under the button; a raw database error with no why is never printed. Mutants: the why dropped; the raw error printed.
//   NAMES: case_decode {vin}, case_discard and photo types are Lane D's (on main); case_pickers is still planned, so its answer here is the check's stub.
//   node scripts/deskV4NewCaseCheck.mjs
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { launch, openLive, tally } from "./deskV4Harness.mjs";
const { ok, done } = tally(), wait = ms => new Promise(r => setTimeout(r, ms)), b = await launch();
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v4nc-")), JPG = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64");
const pic = n => { const f = path.join(dir, n); fs.writeFileSync(f, JPG); return f; }, A = pic("front.jpg"), B2 = pic("rear.jpg"), C = pic("left.jpg"), D = pic("right.jpg"), H = pic("side.heic");
const openForm = async (opts = {}) => { const p = await openLive(b, opts); await p.evaluate(() => document.getElementById("newcase-btn").click()); await wait(200); return p; };
const VIN = "WP0AA2995XS626785", f = v => ({ value: v, source: "vin_decoded", verified: false }), opt = (v, n) => ({ value: v, label: v, count: n });
const DECODED = { ok: true, vin: VIN, decoded: { year: f(1999), make: f("Porsche"), model: f("911"), trim: f("Carrera"), body: f("Coupe"), transmission: f("Manual") } };
const LISTS = { ok: true, body: [opt("Coupe", 9), opt("Convertible", 4)], trim: [opt("Carrera", 7), opt("Carrera 4", 3)], transmission: [opt("Manual", 8), opt("Automatic", 5)], colour: [opt("Guards Red", 2), opt("Arctic Silver", 3)] };
const asked = [];
const stub = async bd => { if (bd.action === "case_decode") return bd.vin ? DECODED : { ok: false, refused: true, why: "case_decode takes a VIN only." }; if (bd.action === "case_pickers") { asked.push(bd); return LISTS; } };
const start = async (p, text) => { await p.type("#nc-start", text); await p.click("#nc-startbtn"); await wait(600); };
const vis = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return !!e && e.offsetWidth > 0 && e.offsetHeight > 0; }, sel);

{ // 1 two steps
  const run = async mutate => { const p = await openForm({ mutate }); const r = await p.evaluate(() => { const v = e => e.offsetWidth > 0 && e.offsetHeight > 0, box = document.getElementById("newcase"); const inputs = [...box.querySelectorAll("input,textarea,select")].filter(v), big = document.getElementById("nc-start").getBoundingClientRect(); return { inputs: inputs.map(i => i.id), bigH: Math.round(big.height), start: v(document.getElementById("nc-startbtn")), lead: (document.querySelector(".nc-lead") || {}).textContent, h: getComputedStyle(document.querySelector(".nc-h")).fontFamily }; }); await p.close(); return r; };
  const g = await run(null); ok(g.inputs.join() === "nc-start" && g.bigH >= 48 && g.start && g.lead === "VIN, or year, make and model" && /Newsreader/.test(g.h), `opening New case shows one large field (${g.bigH} px) labelled "${g.lead}" and a Start button, in Newsreader, and no grid of boxes`);
  const m = await run(h => h.replace('<div id="nc-s2" hidden>', '<div id="nc-s2">').replace("function step(n) {", "function step(n) { return;")); ok(m.inputs.length > 3, `mutant caught: the old form with every box open before the car is known (${m.inputs.length} fields)`); }

{ // 2 a VIN
  const run = async mutate => { const p = await openForm({ intercept: stub, mutate }); asked.length = 0; await start(p, VIN);
    const r = await p.evaluate(() => { const q = i => document.getElementById(i), cs = e => getComputedStyle(e), src = q("nc-src"), tags = [...document.querySelectorAll("#nc-tags .ntag")].map(t => ({ k: t.dataset.tag, v: t.querySelector("b").textContent, pen: !!t.querySelector(".pen") }));
      return { s2: !q("nc-s2").hidden, title: q("nc-title").textContent, tf: cs(q("nc-title")).fontFamily, spec: q("nc-spec").textContent, src: src.textContent, srcSize: parseFloat(cs(src).fontSize), srcCase: cs(src).textTransform, tags, body: q("nc-body").value, trans: q("nc-trans").value, bd: !q("nc-body-dec").hidden, bdCase: cs(q("nc-body-dec")).textTransform, bdText: q("nc-body-dec").textContent, lists: ["dl-body", "dl-trim", "dl-trans", "dl-colour"].map(i => [...q(i).options].map(o => o.value).join("|")) }; });
    await p.click('#nc-tags [data-tag="model"] .pen'); await p.keyboard.type("911 Targa"); await p.keyboard.press("Enter"); await wait(100); const edited = await p.evaluate(() => ({ t: document.getElementById("nc-title").textContent, v: document.querySelector('#nc-tags [data-tag="model"] b').textContent })); await p.close(); return { ...r, edited }; };
  const g = await run(null);
  ok(g.s2 && g.title === "1999 Porsche 911 Carrera" && /Newsreader/.test(g.tf) && g.spec === VIN, `a VIN opens the car card: the title in Newsreader (${g.title}) and the VIN as the spec line`);
  ok(g.src === "Decoded from the VIN" && g.srcSize <= 12.5 && g.srcCase === "none", `"${g.src}" is small (${g.srcSize}px) and not uppercase`);
  ok(g.tags.map(t => t.k + "=" + t.v).join() === "year=1999,make=Porsche,model=911,trim=Carrera" && g.tags.every(t => t.pen), "each decoded value is a quiet tag with a pencil");
  ok(g.edited.v === "911 Targa" && g.edited.t === "1999 Porsche 911 Targa Carrera", `the pencil edits a value and the title follows (${g.edited.t})`);
  ok(g.body === "Coupe" && g.trans === "Manual" && g.bd && g.bdText === "decoded" && g.bdCase === "none", "body and gearbox arrive filled, each with a small lowercase tag \"decoded\" on the value");
  ok(g.lists.join("  ") === "Coupe|Convertible  Carrera|Carrera 4  Manual|Automatic  Guards Red|Arctic Silver" && asked.some(x => x.vin === VIN), `the pickers are the server's case_pickers lists, asked for the decoded VIN (${g.lists[0]})`);
  const m0 = await run(h => h.replace('(isVin ? post({ action: "case_decode", vin: vin }) : Promise.resolve(null))', 'Promise.resolve({ ok: false })')); ok(!m0.tags.some(t => t.v === "Porsche"), "mutant caught: a panel that does not decode the VIN");
  const m1 = await run(h => h.replace("</style>", ".nc-src{text-transform:uppercase}</style>")); ok(m1.srcCase === "uppercase", "mutant caught: an uppercase DECODED style label"); }

{ // 3 typed words: case_decode takes a VIN only (Lane D), so words are never sent to it; the words as typed are the card and Create sends them as text
  const run = async (text, mutate) => { const p = await openForm({ intercept: stub, mutate }); await start(p, text); const dec = p._posts.filter(x => x.action === "case_decode").length; const r = await p.evaluate(() => ({ s2: !document.getElementById("nc-s2").hidden, title: document.getElementById("nc-title").textContent, src: document.getElementById("nc-src").textContent, tags: [...document.querySelectorAll("#nc-tags .ntag b")].map(b => b.textContent).join() }));
    p._posts.length = 0; await p.click("#nc-go"); await wait(2500); const sent = p._posts.find(x => x.action === "case_new") || {}; await p.close(); return { ...r, sent, dec }; };
  const g = await run("1965 mustang fastback"); ok(g.dec === 0 && g.s2 && g.title === "1965 mustang fastback" && g.src === "As you typed it" && g.sent.text === "1965 mustang fastback" && !g.sent.vin, `typed words: no decode is asked, the words are the card (${g.title}) and Create sends them as text`);
  const m = await run("1965 mustang fastback", h => h.replace('(isVin ? post({ action: "case_decode", vin: vin }) : Promise.resolve(null))', 'post({ action: "case_decode", vin: vin })')); ok(m.dec > 0, "mutant caught: words sent to a decode that takes only a VIN"); }

{ // 4 step two
  const p = await openForm({ intercept: stub }); await start(p, VIN);
  const m = await p.evaluate(() => { const R = e => e.getBoundingClientRect(), q = i => document.getElementById(i), fld = id => { const w = q(id).closest(".nf"), l = w.querySelector("label"), c = w.querySelector(".txt, textarea") , box = (c.closest(".unit") || c.closest(".pk") || c); return { lb: R(l).bottom, top: R(box).top, left: R(box).left, h: Math.round(R(box).height), w: R(box).width, ctl: c }; };
    const ids = ["nc-body", "nc-trans", "nc-colour", "nc-mileage", "nc-asking", "nc-seller"], F = Object.fromEntries(ids.map(i => [i, fld(i)])), mi = q("nc-mileage").closest(".unit"), as = q("nc-asking").closest(".unit"), post = mi.querySelector(".post"), pre = as.querySelector(".pre"), pri = [...q("nc-s2").querySelectorAll(".btn.pri")].length;
    return { above: ids.every(i => F[i].lb <= F[i].top + 0.5), cols: new Set(ids.map(i => Math.round(F[i].left))).size, row1: Math.abs(F["nc-body"].top - F["nc-trans"].top) < 2, hs: [...new Set(ids.map(i => F[i].h))], lists: ["nc-body", "nc-trans", "nc-colour"].map(i => q(i).getAttribute("list")), unitIn: post.textContent === "miles" && R(post).right <= R(mi).right && R(post).left >= R(mi).left, preIn: pre.textContent === "$" && R(pre).left >= R(as).left, pri, quiet: getComputedStyle(q("nc-x")).backgroundColor, last: ["nc-seller", "nc-notes"].every(i => !!q(i)) && R(q("nc-notes")).top > R(q("nc-seller")).top, v: q("nc-asking").value }; });
  ok(m.above && m.cols === 2 && m.row1 && m.hs.length === 1, `step two: labels above the fields, two columns, one field height (${m.hs.join()} px)`);
  ok(m.lists.every(l => /^dl-/.test(l)) && m.unitIn && m.preIn && m.v === "", "pickers for body, gearbox and colour; \"miles\" and \"$\" sit inside their fields and the asking field starts empty (no sign in the value)");
  ok(m.pri === 1 && (await vis(p, "#nc-x")) && /rgba\(0, 0, 0, 0\)|transparent/.test(m.quiet), "one primary button (Create case) and one quiet one (Cancel)"); await p.close(); }

{ // 5 photos (the photo answers are the check's: the 1 pixel pictures are not real photographs for the server's reader)
  const run = async mutate => { const p = await openForm({ mutate, intercept: async bd => bd.op === "photo_add" ? { ok: true } : stub(bd) }); await start(p, VIN); const names = () => p.evaluate(() => [...document.querySelectorAll("#nc-list .ncf span")].map(s => s.textContent)), up = async (...x) => { await (await p.$("#nc-photos")).uploadFile(...x); await wait(150); };
    const acc = await p.evaluate(() => document.getElementById("nc-photos").accept); await up(A); const one = await names(p); await up(B2); const two = await names(p); await up(C, D); const four = await names(p); await up(A); const dup = await names(p);
    await p.evaluate(() => { const n = [...document.querySelectorAll("#nc-list .ncf")].find(r => /rear/.test(r.textContent)); if (n) n.querySelector("button").click(); }); const three = await names(p);
    const thumb = await p.evaluate(() => getComputedStyle(document.querySelector("#nc-list .th") || document.body).backgroundImage !== "none");
    await p.evaluate(B => { const dt = new DataTransfer(); dt.items.add(new File([Uint8Array.from(atob(B), c => c.charCodeAt(0))], "dropped.jpg", { type: "image/jpeg" })); const z = document.getElementById("nc-drop"); z.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true })); }, JPG.toString("base64")); const dropped = await names(p);
    p._posts.length = 0; await p.click("#nc-go"); for (let i = 0; i < 60 && p._posts.filter(x => x.op === "photo_add").length < dropped.length; i++) await wait(250); await wait(300); const adds = p._posts.filter(x => x.op === "photo_add").map(x => x.name); await p.close(); const msg = await p.evaluate(() => document.getElementById('nc-msg').textContent).catch(() => ''); return { acc, one, two, four, dup, three, thumb, dropped, adds, msg }; };
  const g = await run(null);
  ok(/jpeg/.test(g.acc) && /png/.test(g.acc) && /heic/.test(g.acc) && /webp/.test(g.acc), `the photo input accepts JPG, PNG, WebP and HEIC (${g.acc})`);
  ok(g.one.join() === "front.jpg" && g.two.join() === "front.jpg,rear.jpg" && g.four.length === 4 && g.dup.length === 4 && g.three.length === 3 && !g.three.includes("rear.jpg") && g.thumb, "photos accumulate, the same file twice is one, each has a thumbnail and its own Remove");
  ok(g.dropped.includes("dropped.jpg") && g.adds.join() === g.dropped.join(), `a drop on the zone adds, and Create case sends exactly the photos listed, one photo_add each (${g.adds.length} of ${g.dropped.length}) ${g.msg}`);
  const mu = await run(h => h.replace("function addFiles(list) {", "function addFiles(list) { files.length = 0;")); ok(mu.two.length < 2, "mutant caught: a second pick that replaces the first");
  const mh = await run(h => h.replace("image/heic,image/heif,", "").replace(".heic,.heif", "")); ok(!/heic/.test(mh.acc), "mutant caught: an input that does not take HEIC"); }

{ // 6 the refusal is Lane D's word
  const WHY = "That VIN is already on an open case, so it was not made again.", RAW = 'duplicate key value violates unique constraint "desk_sheets_pkey"';
  const run = async (body, mutate) => { const p = await openForm({ mutate, intercept: async bd => bd.action === "case_new" ? { ok: false, refused: true, ...body } : stub(bd) }); await start(p, VIN); await p.click("#nc-go"); await wait(500);
    const r = await p.evaluate(() => { const m = document.getElementById("nc-msg"), g = document.getElementById("nc-go").getBoundingClientRect(), r = m.getBoundingClientRect(); return { t: m.textContent, vis: !m.hidden && r.height > 0, below: r.top >= g.bottom - 1, enabled: !document.getElementById("nc-go").disabled }; }); await p.close(); return r; };
  const g = await run({ why: WHY }); ok(g.t === WHY && g.vis && g.below && g.enabled, `a refused Create case prints the server's why as sent, under the button (${g.t})`);
  const w = await run({ error: RAW, message: RAW }); ok(/^The case could not be created/.test(w.t) && !/duplicate key|constraint/.test(w.t), `a raw database error with no why is never printed (${w.t})`);
  const m1 = await run({ why: WHY }, h => h.replace("msg(\"nc-msg\", (e && (e.why || e.line)) || ", "msg(\"nc-msg\", ")); ok(m1.t !== WHY, "mutant caught: the why dropped for the generic line");
  const m2 = await run({ error: RAW }, h => h.replace("(e && (e.why || e.line)) ||", "(e && (e.why || e.line || e.error)) ||")); ok(/duplicate key/.test(m2.t), "mutant caught: a raw database message printed"); }
{ // 7 a refused photo takes the case out again (Lane D's case_discard), so nothing is left half made
  const WHY = "That photo could not be read.";
  const run = async mutate => { const p = await openForm({ mutate, intercept: async bd => bd.op === "photo_add" ? { ok: false, refused: true, why: WHY } : stub(bd) }); await start(p, VIN); await (await p.$("#nc-photos")).uploadFile(A); await wait(150); await p.click("#nc-go"); await wait(3000);
    const r = await p.evaluate(() => ({ t: document.getElementById("nc-msg").textContent, btn: document.getElementById("nc-go").textContent, on: !document.getElementById("nc-go").disabled })); r.discards = p._posts.filter(x => x.action === "case_discard").length; await p.close(); return r; };
  const g = await run(null); ok(g.t.startsWith("The case was not made: " + WHY) && g.discards === 1 && g.on && g.btn === "Create case", `a refused photo prints the server's why, the made case is discarded and nothing is left half made (${g.t})`);
  const m = await run(h => h.replace('action: "case_discard"', 'action: "case_keep"')); ok(m.discards === 0, "mutant caught: a refused photo that leaves the case behind"); }
await b.close(); fs.rmSync(dir, { recursive: true, force: true });
done("deskV4NewCaseCheck");
