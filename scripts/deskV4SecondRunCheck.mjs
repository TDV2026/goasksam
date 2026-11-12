// DESK V4 SECOND RUN CHECK (Lane S, Nov 12 2026, from Sam's second run). Offline: the V4 page in Chrome, answered by the real in-process Desk reader (a stub only where the server name is planned).
//   1 NEEDS ATTENTION: each open item is the label on its own line, then the inline statement field and its buttons on the next, so the label never wraps against the buttons (1440, 1280, 390). Mutant: the old side by side row.
//   2 THE STATEMENT: Proceed without sends the typed words as the reason (nothing is sent empty), Seller states sends them as the statement (Lane D's planned state "stated"), a refusal prints the server's why under that row.
//   3 DOCUMENTS: a document added through a needs-attention pill, or the Add a document tile, is on the Documents list the moment it is added, and the item it answers closes. Class: after EVERY edit the page draws (documents, attention items, next steps, what we took into account) match the case the server last sent. Mutant: a pill that does not redraw.
//   4 WHAT WE TOOK INTO ACCOUNT (Lane D's planned report.takenIntoAccount [{id, text}], taken_edit / taken_remove / taken_add): editable in the centre column like the next steps; hidden when the case sends no list.
//   node scripts/deskV4SecondRunCheck.mjs
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { launch, openLive, tally, PV } from "./deskV4Harness.mjs";
const { ok, done } = tally(), wait = ms => new Promise(r => setTimeout(r, ms)), b = await launch();
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v4sr-")), PDF = path.join(dir, "invoice.pdf"); fs.writeFileSync(PDF, "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const CSSMUT = (h, css) => h.replace("</style>", css + "</style>");

{ // 1 the layout
  const LAY = () => [...document.querySelectorAll("#att .i.need")].map(r => { const R = e => e.getBoundingClientRect(), l = R(r.querySelector(".nl")), st = R(r.querySelector(".nstate")), bs = [...r.querySelectorAll(".nb button")].map(R), row = R(r);
    return { above: l.bottom <= st.top + 0.5, noOverlap: bs.every(x => x.top >= l.bottom - 0.5 || x.left >= l.right || x.right <= l.left), btns: r.querySelectorAll(".nb button").length, oneLine: new Set(bs.map(x => Math.round(x.top))).size === 1 || bs.length <= 3, inside: bs.every(x => x.right <= row.right + 0.5) && st.right <= row.right + 0.5, labelWhole: r.querySelector(".nl").scrollWidth <= r.querySelector(".nl").clientWidth + 1, wrap: [...r.querySelectorAll(".nb button")].every(x => getComputedStyle(x).whiteSpace === "nowrap") }; });
  const run = async (w, mutate) => { const p = await openLive(b, { w, mutate }); const r = await p.evaluate(LAY); await p.close(); return r; };
  const good = r => r.length >= 3 && r.every(x => x.above && x.noOverlap && x.inside && x.labelWhole && x.wrap);
  for (const w of [1440, 1280, 390]) { const r = await run(w); ok(good(r) && r.some(x => x.btns === 3), `@${w}: ${r.length} open items, the label on its own line, the statement field under it, the buttons under that (${r.map(x => x.btns).join(",")} buttons), nothing wrapped against them`); }
  const m = await run(1280, h => CSSMUT(h, ".att .i.need{flex-wrap:nowrap!important;align-items:center!important}.att .i .nl{flex:1 1 auto!important}.att .i.need .x{flex:0 0 auto!important;margin-left:auto!important;flex-wrap:nowrap!important}.att .i .nstate{flex:0 0 160px!important}")); ok(!good(m), "mutant caught: the old row with the label beside the buttons"); }

{ // 2 the statement
  const run = async (mutate, stub) => { PV.resetPreviewStore(); const p = await openLive(b, { mutate, intercept: stub }); p._posts.length = 0;
    await p.click('[data-need="accident_unclear"] [data-act="waive"]'); await wait(150); const empty = p._posts.filter(x => x.op === "need").length;
    await p.type('[data-statement="accident_unclear"]', "Seller states none and holds no records"); await p.click('[data-need="mileage_unconfirmed"] [data-act="state"]'); await wait(300); const noStmt = p._posts.filter(x => x.op === "need").length;
    await p.type('[data-statement="mileage_unconfirmed"]', "Seller states 61,200 from the odometer"); await p.click('[data-need="mileage_unconfirmed"] [data-act="state"]'); await wait(400);
    const st = p._posts.find(x => x.op === "need" && x.state === "stated"); const msg = await p.evaluate(() => { const m = document.querySelector('[data-nmsg="mileage_unconfirmed"]'); return m ? { t: m.textContent, vis: !m.hidden } : null; });
    await p.click('[data-need="accident_unclear"] [data-act="waive"]'); await wait(900); const wv = p._posts.find(x => x.op === "need" && x.state === "waived"); await p.close(); return { empty, noStmt, st, msg, wv }; };
  const REF = async bd => bd.op === "need" && bd.state === "stated" ? { ok: false, refused: true, why: "The server does not take a statement yet." } : undefined;
  const g = await run(null, REF);
  ok(g.empty === 0 && g.noStmt === 0, "nothing is sent while the statement field is empty");
  ok(g.st && g.st.item === "mileage_unconfirmed" && g.st.statement === "Seller states 61,200 from the odometer", "Seller states sends the typed words as the item's statement");
  ok(g.msg && g.msg.vis && g.msg.t === "The server does not take a statement yet.", `a refusal prints the server's why under that item's row (${g.msg && g.msg.t})`);
  ok(g.wv && g.wv.item === "accident_unclear" && g.wv.reason === "Seller states none and holds no records", "Proceed without sends the same field as its reason");
  const m = await run(h => h.replace("{ item: n.id, state: \"stated\", statement: t }", "{ item: n.id, state: \"stated\" }"), REF); ok(!(m.st && m.st.statement), "mutant caught: a statement that is dropped"); }

{ // 3 documents show at once; the class: every section is the case the server last sent
  const SYNC = () => { const K = window.__v4.K(), ids = [...document.querySelectorAll("#docs [data-doc]")].map(e => e.getAttribute("data-doc")).sort().join(), want = (K.documents || []).filter(x => !x.sellerWords).map(x => x.id).sort().join(), openN = [...document.querySelectorAll("#att .i:not(.done)")].length, openK = (K.needs_review || []).filter(n => n.state === "open").length + (((window.__v4.D.readiness || {}).blockers || []).some(x => x.key === "vehicle") ? 1 : 0), steps = [...document.querySelectorAll("#steps [data-step]")].map(e => e.getAttribute("data-step")).join(), wantS = (K.nextSteps || []).map(s => s.id).join(); return { docs: ids === want, needs: openN === openK, steps: steps === wantS, ids, want, openN, openK }; };
  const run = async (mutate, via) => { PV.resetPreviewStore(); const p = await openLive(b, { mutate }); const n0 = await p.evaluate(() => document.querySelectorAll("#docs [data-doc]").length);
    if (via === "pill") { const [fc] = await Promise.all([p.waitForFileChooser(), p.click('[data-need="service_documents"] [data-act="doc"]')]); await fc.accept([PDF]); } else await (await p.$("#docfile")).uploadFile(PDF);
    await wait(1500); const r = await p.evaluate(SYNC), n1 = await p.evaluate(() => document.querySelectorAll("#docs [data-doc]").length), named = await p.evaluate(() => /invoice/.test(document.getElementById("docs").innerText)), closed = await p.evaluate(() => !document.querySelector('#att [data-need="service_documents"] [data-act="doc"]')); await p.close(); return { ...r, n0, n1, named, closed }; };
  const pill = await run(null, "pill"); ok(pill.n1 === pill.n0 + 1 && pill.named && pill.docs && pill.needs, `a document added through the needs-attention pill is on the Documents list at once (${pill.n0} to ${pill.n1}), and the lists match the case (needs ${pill.openN}/${pill.openK})`);
  ok(pill.closed, "the pill's own item closes when its document arrives");
  const tile = await run(null, "tile"); ok(tile.n1 === tile.n0 + 1 && tile.docs && tile.needs && tile.steps, "a document added through the Add a document tile is listed at once and every section matches the case");
  const m = await run(h => h.replace("}).then(function (r) { everything(r, nm); }); }; pk.click(); }", "}).then(function () {}); }; pk.click(); }"), "pill"); ok(!(m.docs && m.needs && m.closed), "mutant caught: a pill that leaves the page on the earlier case"); }

{ // 4 what we took into account
  const L0 = [{ id: "t1", text: "Mileage verified from the photographs" }, { id: "t2", text: "Two comparables chosen by the analyst" }];
  const run = async (withList) => { let list = L0.map(x => ({ ...x }));
    const p = await openLive(b, { intercept: async bd => { if (bd.op === "taken_edit") { list = list.map(x => x.id === bd.item ? { ...x, text: bd.text } : x); } else if (bd.op === "taken_remove") list = list.filter(x => x.id !== bd.item); else if (bd.op === "taken_add") list = [...list, { id: "t" + (list.length + 5), text: bd.text }]; else return undefined;
      const base = (await PV.previewDeskApi({ action: "case_get", id: bd.id })).case; return { ok: true, case: { ...base, report: { ...(base.report || {}), takenIntoAccount: list } } }; } });
    if (withList) await p.evaluate(L => { const k = window.__v4.K(); window.__v4.setK({ ...k, report: { ...(k.report || {}), takenIntoAccount: L } }); window.__v4.taken(); }, L0);
    const card = await p.evaluate(() => { const c = document.getElementById("s-taken"), s = document.getElementById("s-steps"); return { vis: c.offsetHeight > 0, head: (c.querySelector("h3") || {}).textContent, sameCol: c.parentElement === s.parentElement, rows: [...c.querySelectorAll("[data-taken]")].map(i => i.value) }; });
    if (!withList) { await p.close(); return { card }; }
    p._posts.length = 0; await p.$eval('[data-taken="t1"]', e => { e.focus(); e.select(); }); await p.keyboard.type("Mileage verified from the odometer photo"); await p.evaluate(() => document.querySelector('[data-taken="t1"]').blur()); await wait(500); const ed = p._posts.find(x => x.op === "taken_edit");
    await p.click('[data-takenRow="t2"] button'); await wait(500); const rm = p._posts.find(x => x.op === "taken_remove"); await p.click("#addtaken"); await p.keyboard.type("Seller holds the service book"); await p.keyboard.press("Enter"); await wait(600); const ad = p._posts.find(x => x.op === "taken_add");
    const rows = await p.evaluate(() => [...document.querySelectorAll("#s-taken [data-taken]")].map(i => i.value)); await p.close(); return { card, ed, rm, ad, rows }; };
  const g = await run(true); ok(g.card.vis && /took into account/.test(g.card.head) && g.card.sameCol && g.card.rows.length === 2, `the card sits in the centre column beside the next steps and lists the case's own lines (${g.card.rows.length})`);
  ok(g.ed && g.ed.item === "t1" && /odometer photo/.test(g.ed.text) && g.rm && g.rm.item === "t2" && g.ad && /service book/.test(g.ad.text), "a line is editable, removable and one can be added (taken_edit, taken_remove, taken_add)");
  ok(g.rows.join("|") === "Mileage verified from the odometer photo|Seller holds the service book", `the card redraws from the case the server sent (${g.rows.join(" | ")})`);
  const n = await run(false); ok(!n.card.vis, "with no list on the case the card is not drawn"); }
await b.close(); fs.rmSync(dir, { recursive: true, force: true });
done("deskV4SecondRunCheck");
