// DESK V4 SECOND RUN CHECK (Lane S, Nov 12 2026, from Sam's second run). Offline: the V4 page in Chrome, answered by the real in-process Desk reader (a stub only where the server name is planned).
//   1 NEEDS ATTENTION: each open item is the label on its own line, then the inline statement field and its buttons on the next, so the label never wraps against the buttons (1440, 1280, 390). Mutant: the old side by side row.
//   2 THE STATEMENT: Proceed without sends the typed words as the reason (nothing is sent empty), Seller states sends them as the statement (Lane D's seller_said {field, text}), a refusal prints the server's why under that row.
//   3 DOCUMENTS: a document added through a needs-attention pill, or the Add a document tile, is on the Documents list the moment it is added, and the item it answers closes. Class: after EVERY edit the page draws (documents, attention items, next steps, what we took into account) match the case the server last sent. Mutant: a pill that does not redraw.
//   4 WHAT WE TOOK INTO ACCOUNT (Lane D's case.considered, considered_edit / considered_remove / considered_add): editable in the centre column like the next steps; hidden when the case sends no list.
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
    await p.click('[data-need="mileage_unconfirmed"] [data-act="waive"]'); await wait(150); const empty = p._posts.filter(x => x.op === "need").length;
    await p.click('[data-need="accident_unclear"] [data-act="state"]'); await wait(300); const noStmt = p._posts.filter(x => x.op === "seller_said").length;
    await p.type('[data-statement="accident_unclear"]', "Seller states none and holds no records"); await p.click('[data-need="accident_unclear"] [data-act="state"]'); await wait(400);
    const st = p._posts.find(x => x.op === "seller_said"); const msg = await p.evaluate(() => { const m = document.querySelector('[data-nmsg="accident_unclear"]'); return m ? { t: m.textContent, vis: !m.hidden } : null; });
    await p.type('[data-statement="mileage_unconfirmed"]', "Odometer photo not in the pack"); await p.click('[data-need="mileage_unconfirmed"] [data-act="waive"]'); await wait(900); const wv = p._posts.find(x => x.op === "need" && x.state === "waived"); await p.close(); return { empty, noStmt, st, msg, wv }; };
  const REF = async bd => bd.op === "seller_said" ? { ok: false, refused: true, why: "That could not be saved." } : undefined;
  const g = await run(null, REF);
  ok(g.empty === 0 && g.noStmt === 0, "nothing is sent while the statement field is empty");
  ok(g.st && g.st.field === "accident_history" && g.st.text === "Seller states none and holds no records", "Seller states sends the typed words to seller_said for that item's fact");
  ok(g.msg && g.msg.vis && g.msg.t === "That could not be saved.", `a refusal prints the server's why under that item's row (${g.msg && g.msg.t})`);
  ok(g.wv && g.wv.item === "mileage_unconfirmed" && g.wv.reason === "Odometer photo not in the pack", "Proceed without sends the same field as its reason");
  const m = await run(h => h.replace("{ field: SAID[n.id], text: t }", "{ field: SAID[n.id] }"), REF); ok(!(m.st && m.st.text), "mutant caught: a statement that is dropped"); }

{ // 3 documents show at once; the class: every section is the case the server last sent
  const SYNC = () => { const K = window.__v4.K(), ids = [...document.querySelectorAll("#docs [data-doc]")].map(e => e.getAttribute("data-doc")).sort().join(), want = (K.documents || []).filter(x => !x.sellerWords).map(x => x.id).sort().join(), openN = [...document.querySelectorAll("#att .i:not(.done)")].length, openK = (K.needs_review || []).filter(n => n.state === "open").length + (((window.__v4.D.readiness || {}).blockers || []).some(x => x.key === "vehicle") ? 1 : 0), steps = [...document.querySelectorAll("#steps [data-step]")].map(e => e.getAttribute("data-step")).join(), wantS = (K.nextSteps || []).map(s => s.id).join(); return { docs: ids === want, needs: openN === openK, steps: steps === wantS, ids, want, openN, openK }; };
  const run = async (mutate, via) => { PV.resetPreviewStore(); const p = await openLive(b, { mutate }); const n0 = await p.evaluate(() => document.querySelectorAll("#docs [data-doc]").length);
    if (via === "pill") { const [fc] = await Promise.all([p.waitForFileChooser(), p.click('[data-need="service_documents"] [data-act="doc"]')]); await fc.accept([PDF]); } else await (await p.$("#docfile")).uploadFile(PDF);
    await wait(1500); const r = await p.evaluate(SYNC), n1 = await p.evaluate(() => document.querySelectorAll("#docs [data-doc]").length), named = await p.evaluate(() => /invoice/.test(document.getElementById("docs").innerText)), closed = await p.evaluate(() => !document.querySelector('#att [data-need="service_documents"] [data-act="doc"]')); await p.close(); return { ...r, n0, n1, named, closed }; };
  const pill = await run(null, "pill"); ok(pill.n1 === pill.n0 + 1 && pill.named && pill.docs && pill.needs, `a document added through the needs-attention pill is on the Documents list at once (${pill.n0} to ${pill.n1}), and the lists match the case (needs ${pill.openN}/${pill.openK})`);
  ok(pill.closed, "the pill's own item closes when its document arrives");
  const tile = await run(null, "tile"); ok(tile.n1 === tile.n0 + 1 && tile.docs && tile.needs && tile.steps, "a document added through the Add a document tile is listed at once and every section matches the case");
  const m = await run(h => h.replace("}).then(function (r) { everything(r, nm); }); }; pk.click(); }", "}).then(function () {}); }; pk.click(); }"), "pill"); ok(!(m.docs && m.needs && m.closed), "mutant caught: a pill that leaves the page on the earlier case"); }

{ // 4 what we took into account (Lane D's case.considered [{id, key, title, text, edited}], considered_edit / considered_remove / considered_add)
  const run = async () => { PV.resetPreviewStore(); const p = await openLive(b, {});
    const card = await p.evaluate(() => { const c = document.getElementById("s-considered"), s = document.getElementById("s-steps"); return { vis: !!c && c.offsetHeight > 0, head: c && (c.querySelector("h3") || {}).textContent, sameCol: !!c && c.parentElement === s.parentElement, rows: [...document.querySelectorAll("#considered [data-conRow]")].map(r => r.getAttribute("data-conRow")), n: (window.__v4.K().considered || []).length }; });
    if (!card.rows.length) { await p.close(); return { card }; }
    const id = card.rows[0]; p._posts.length = 0; await p.$eval('[data-con-text="' + id + '"]', e => { e.focus(); e.select(); }); await p.keyboard.type("The analyst's own words for this item"); await p.evaluate(i => document.querySelector('[data-con-text="' + i + '"]').blur(), id); await wait(600); const ed = p._posts.find(x => x.op === "considered_edit");
    const kept = await p.evaluate(() => (window.__v4.K().considered || []).some(x => x.text === "The analyst's own words for this item"));
    await p.click('[data-conRow="' + id + '"] button'); await wait(600); const rm = p._posts.find(x => x.op === "considered_remove"); const gone = await p.evaluate(i => !document.querySelector('[data-conRow="' + i + '"]'), id);
    await p.click("#addcon"); await p.keyboard.type("Title"); await p.keyboard.press("Tab"); await p.keyboard.type("Seller holds the service book"); await p.keyboard.press("Enter"); await wait(700); const ad = p._posts.find(x => x.op === "considered_add"); const added = await p.evaluate(() => [...document.querySelectorAll("#considered [data-con-text]")].some(i => /service book/.test(i.value)));
    await p.close(); return { card, ed, rm, ad, kept, gone, added, id }; };
  const g = await run(); ok(g.card.vis && /took into account/.test(g.card.head) && g.card.sameCol && g.card.rows.length === g.card.n && g.card.n > 0, `the card sits in the centre column beside the next steps and lists the case's own items (${g.card.n})`);
  ok(g.ed && g.ed.item === g.id && /analyst's own words/.test(g.ed.text) && g.kept && g.rm && g.rm.item === g.id && g.gone && g.ad && /service book/.test(g.ad.text) && g.added, "an item is editable (considered_edit), removable (considered_remove) and one can be added (considered_add), and the card follows the case the server sent"); }
await b.close(); fs.rmSync(dir, { recursive: true, force: true });
done("deskV4SecondRunCheck");
