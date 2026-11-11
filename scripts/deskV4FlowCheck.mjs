// DESK V4 FLOW CHECK (Lane S, Nov 10 2026). The analyst's whole flow in Chrome on the REAL readers (the page's POSTs go to the in-process Desk reader, previewDeskApi, which runs Lane D's case actions and Lane B's engine read; no stub).
//   FLOW: open the demonstration case; tick and untick a comparable (the list stays); exclude one with a reason and restore it; click each condition; switch the window; type and drag the reserve and push it above the typical range;
//   tick the seller's request; add a document; resolve every attention item; Select all photos; edit a next step; Preview (a typed, unsaved why is flushed first); Finalize.
//   TWO FINALIZE PATHS: the flow case is made to pass Lane D's four report checks by the REAL ops (a supported or seller requested reserve, no unverified seller fact as a support, two comparables with their listings, every open item resolved) and Finalize is asserted to succeed; a second case that fails exactly ONE check (a reserve above the sales, not the seller's request) is refused by the server and the panel prints that check's line as the case sent it, with Finalize disabled.
//   NEW CASE BY VIN ALONE: the demonstration VIN typed in the form is sent as typed, with no year, make or model, and the case that comes back holds it.
//   MUTANTS, one per bug Sam hit, run through the same assertions BEFORE the flow (each leaves the case as it found it): a list that vanishes after a tick, a condition that is not clickable, an attention action that answers "say which item",
//   no way to add a document, and the reserve write sent unwrapped (the server answers ok and saves nothing, so the typed figure must be CHECKED against the saved one).
//   CLASS: an edit on this screen that looks done and is not. Every step asserts the SERVER's state after the edit (the case the answer carried), not only that a control moved.
//   node scripts/deskV4FlowCheck.mjs
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { launch, openLive, tally, V3, PV, imp, compIds } from "./deskV4Harness.mjs";
const { ok, done } = tally(), wait = (ms = 900) => new Promise(r => setTimeout(r, ms));
const b = await launch();
const stored = async (id = V3.DEMO_ID) => (await PV.previewDeskApi({ action: "case_get", id })).case;
const { DEMO_VIN } = await imp("lib/desk/demoCar.js"), CI = await compIds(), C6 = CI[0], C7 = CI[1], C8 = CI[2], C11 = CI[3];   // the engine's own sale ids (the recorded read), not typed ones
const rowsOf = p => p.evaluate(() => document.querySelectorAll("#comps .comp").length);

// ---------- the steps, each answering true when the SERVER's state shows the edit took ----------
const S = {
  async tick(p) { const n0 = await rowsOf(p); await p.click(`[data-in="${C6}"]`); await wait(); const on = (await stored()).selectedComparables.map(String).includes(C6), n1 = await rowsOf(p);
    await p.click(`[data-in="${C6}"]`); await wait(); const off = !(await stored()).selectedComparables.map(String).includes(C6), n2 = await rowsOf(p); return { n0, n1, n2, on, off, pass: on && off && n0 > 0 && n1 === n0 && n2 === n0 }; },
  async condition(p) { const out = []; for (const t of [1, 2, 3, 4]) { await p.click(`#cond [data-c="${t}"]`); await wait(); out.push(await p.evaluate(t2 => ({ on: document.querySelector(`#cond [data-c="${t2}"]`).getAttribute("aria-pressed"), line: document.getElementById("rungline").textContent }), t)); }
    const sv = await stored(); return { out, pass: out.every(o => o.on === "true" && o.line.length > 5) && !!(sv.condition.selected && sv.condition.selected.tier === 4) }; },
  async attention(p) { const n0 = await p.evaluate(() => document.querySelectorAll("#att .i:not(.done)").length); await p.click('[data-need="accident_unclear"] [data-act="waive"]'); await p.type('[data-reason-need="accident_unclear"]', "Seller states none and holds no records"); await p.click('[data-need="accident_unclear"] .btn.sm'); await wait();
    const n1 = await p.evaluate(() => document.querySelectorAll("#att .i:not(.done)").length), msg = await p.evaluate(() => document.getElementById("v4msg").textContent), st = (await stored()).needs_review.find(n => n.id === "accident_unclear"); return { n0, n1, msg, pass: n1 === n0 - 1 && st.state === "waived" && !/Say which item/.test(msg) }; },
  async document(p) { const f = path.join(os.tmpdir(), "v4flow-invoice.pdf"); fs.writeFileSync(f, "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"); const n0 = (await stored()).documents.length; const h = await p.$("#docfile"); if (!h) return { pass: false, why: "no file input" }; await h.uploadFile(f); await wait(1500);
    const sv = (await stored()).documents.length, shown = await p.evaluate(() => document.querySelectorAll("#docs .doc:not(.drop)").length); return { n0, sv, shown, pass: sv === n0 + 1 && shown === sv }; },
  async reserve(p) { await p.focus("#valIn"); await p.evaluate(() => document.getElementById("valIn").select()); await p.keyboard.type("66000"); await wait(1500); const sv = await stored(), shown = await p.evaluate(() => document.getElementById("valIn").value);
    return { saved: sv.reserve.figure, shown, pass: sv.reserve.figure === 66000 && shown === "66000" }; }
};
const MUT = [
  ["a list that vanishes after a tick", h => h.replace('paintRow(rows.filter(function (r) { return String(r.id) === String(id); })[0]); cc2();', 'rows = rows.filter(function (r) { return String(r.id) === String(id); }); clear($("comps")); rows.forEach(function (c) { $("comps").appendChild(rowEl(c)); }); rows.forEach(paintRow); cc2();'), "tick"],
  ["a condition that is not clickable", h => h.replace("onclick: function () { pickTier(r); }", "onclick: null"), "condition"],
  ["an attention action that answers with no item", h => h.replace('edit("need", { item: n.id, state: "waived"', 'edit("need", { state: "waived"'), "attention"],
  ["no way to add a document", h => h.replace('el("input", { type: "file", id: "docfile"', 'el("i", { id: "docfile_gone"'), "document"],
  ["the reserve write sent unwrapped (server answers ok, saves nothing)", h => h.replace('edit("reserve", { patch: { figure: fig } })', 'edit("reserve", { figure: fig })'), "reserve"]
];

// ---------- path B: a case that fails exactly one check is refused, and the panel prints that check's line as the case sent it ----------
const PB = await PV.previewDeskApi({ action: "case_new", vin: DEMO_VIN, mileage: "72000", seller_name: "Refusal path" }); ok(PB.ok === true, "path B: a case is made from the demonstration VIN");
{ const e = (op, x) => PV.previewDeskApi({ action: "case_edit", id: PB.id, op, ...x });
  await e("comparables", { ids: [C6, C11] }); await e("verify", { field: "mileage" }); for (const n of (await stored(PB.id)).needs_review.filter(n => n.state === "open")) await e("need", { item: n.id, state: "waived", reason: "Waived for the refusal path check" });
  await e("reserve", { patch: { figure: 66000 } });
  const sv = await stored(PB.id), failing = (sv.checks || []).filter(c => c.ok === false).map(c => c.key); ok(failing.length === 1 && failing[0] === "reserve", `path B: exactly one check fails, the reserve (${failing.join(", ")})`);
  const fin = await PV.previewDeskApi({ action: "case_finalize", id: PB.id }); ok(fin.ok === false && (fin.blockers || []).some(x => x.key === "reserve_support") && (await stored(PB.id)).status !== "finalized", "path B: Finalize is refused by the server (reserve_support) and the case stays open");
  const line = sv.checks.find(c => c.key === "reserve").line, others = sv.checks.filter(c => c.key !== "reserve").map(c => c.line);
  const PANEL = async mutate => { const p = await openLive(b, { id: PB.id, mutate }); const r = await p.evaluate(() => ({ rows: [...document.querySelectorAll("#chk div")].map(d => ({ key: d.getAttribute("data-key"), text: d.textContent, no: d.classList.contains("no") })), fin: document.getElementById("bFin").disabled })); await p.close(); return r; };
  const ui = await PANEL(null), want = ui.rows.find(r => r.key === "reserve");
  ok(!!want && want.text === line && want.no && ui.fin && others.every(l => ui.rows.some(r => r.text === l && !r.no)), `path B: the panel prints the failing check's line exactly as the case sent it ("${line}"), the three passing lines too, and Finalize is disabled`);
  const m1 = await PANEL(h => h.replace('text: l.line || "" }', 'text: "Not ready yet" }')); ok(!(m1.rows.find(r => r.key === "reserve") || {}).text || m1.rows.find(r => r.key === "reserve").text !== line, "mutant caught: a check line worded by the page");
  const m2 = await PANEL(h => h.replace('$("bFin").disabled = !R.ready || fin;', '$("bFin").disabled = fin;')); ok(m2.fin === false, "mutant caught: Finalize enabled on a case that fails a check"); }

// the mutants first: each leaves the case as it found it (a failed edit changes nothing; a tick is unticked; the reserve mutant saves nothing)
for (const [label, mutate, step] of MUT) { const p = await openLive(b, { mutate }); let r; try { r = await S[step](p); } catch (e) { r = { pass: false, why: String(e.message).slice(0, 80) }; } await p.close(); ok(r.pass === false, `mutant caught: ${label}`); }

// ---------- the flow on the unmutated page ----------
const p = await openLive(b, { w: 1440, h: 1000 });
const t = await S.tick(p); ok(t.pass, `tick then untick a comparable: the saved selection follows and the list stays at ${t.n0} rows (${t.n1}, ${t.n2})`);
// A SALE SET ASIDE changes the population the engine reads, so it is a question for the engine: this run has no archive and the recorded read answers only the question with no sale set aside, so the engine's refusal is the answer (nothing saved, the row stays as it was, the list stays).
// With the archive (the crew door on the deployed site, scripts/deskV4LiveCheck.mjs) the exclusion is read by the engine, saved with its reason, greyed with a Restore.
{ const n0 = await rowsOf(p); await p.click(`[data-x="${C7}"]`); await p.type(`[data-reason="${C7}"]`, "Wheels are aftermarket"); await p.click(`[data-xo="${C7}"]`); await wait(1300);
  const sv = await stored(), row = await p.evaluate(id => ({ cls: document.querySelector('[data-comp="' + id + '"]').className }), C7);
  ok(!sv.exclusions.some(e => e.saleId === C7) && !/\bex\b/.test(row.cls) && (await rowsOf(p)) === n0 && sv.desk.evidence.count === 39, "exclude with no archive to read it: the engine's refusal leaves the case as it was and the list stays"); }
{ await p.click(`[data-x="${C8}"]`); await p.click(`[data-xo="${C8}"]`); await wait(300); ok(!(await stored()).exclusions.some(e => e.saleId === C8), "an exclusion with no reason is not sent"); await p.click(`[data-comp="${C8}"] .exf .btn:last-child`); }
const rs = await S.reserve(p); ok(rs.pass, `type a reserve: the saved figure is the typed one (${rs.saved}) and the input shows it (${rs.shown})`);
{ const above = await p.evaluate(() => { const K = window.__v4.K(); return { warn: !document.getElementById("hiWarn").hidden, diff: document.getElementById("diff").textContent, q3: K.desk.evidence.q3, x: +document.getElementById("resline").getAttribute("x1"), bandR: +document.getElementById("band").getAttribute("x") + +document.getElementById("band").getAttribute("width"), sup: K.reserve.check && K.reserve.check.supported }; });
  ok(above.sup === false && above.warn && above.x > above.bandR && /above the typical range/.test(above.diff), "pushed above the typical range: the engine says unsupported, the warning shows, the marker sits right of the band, the engine's sentence is printed");
  await p.click("#sellerReq"); await wait(1300); const sv = await stored(); ok(sv.reserve.sellerRequested === true && !(await p.evaluate(() => [...document.querySelectorAll("#chk div")].some(d => /not supported/.test(d.textContent)))), "ticking the seller's request is saved and clears the support blocker"); }
{ await p.evaluate(() => document.getElementById("plot").scrollIntoView({ block: "center" })); await wait(200); const box = await (await p.$("#plot")).boundingBox(); await p.mouse.move(box.x + box.width * 0.5, box.y + 60); await p.mouse.down(); await p.mouse.move(box.x + box.width * 0.35, box.y + 60, { steps: 6 }); await p.mouse.up(); await wait(1600);
  const sv = await stored(), shown = await p.evaluate(() => document.getElementById("valIn").value); ok(shown === sv.reserve.figureLine && shown.replace(/[^0-9]/g, "") === String(sv.reserve.figure) && sv.reserve.figure < 66000, `drag the marker: the input prints the server's figure line (${shown}) and it equals the saved figure`); }
const reads0 = PV.previewReads.n, t0 = Date.now(), c = await S.condition(p); ok(c.pass, "each condition button is clickable: it lights, prints its rung's sentence and the choice is saved");
ok(PV.previewReads.n === reads0, `four condition clicks made no engine read (the case holds the engine's view for each condition): ${PV.previewReads.n - reads0} reads in ${Date.now() - t0} ms`);
await p.click('#cond [data-c="0"]'); await wait(1200); { const sv0 = await stored(), on0 = await p.evaluate(() => document.querySelector('#cond [data-c="0"]').getAttribute("aria-pressed")); ok(sv0.condition.selected === null && on0 === "true" && PV.previewReads.n === reads0, `Any condition: a button takes the case back to no condition (saved null, pressed ${on0}), no engine read`); }
await p.click('#cond [data-c="3"]'); await wait(1200);
// THE PERIOD: this run has no archive, so the engine's recorded read answers only the 12 month question (lib/preview/recordedRead.js). A period the engine cannot read is refused whole (nothing saved, the figures stay on the earlier read and the switch stays where it was); the 12 month switch is saved and follows. With the archive the 6 and 24 month reads are the engine's.
for (const m of [6, 24, 12]) { await p.click(`#period [data-m="${m}"]`); await wait(1200); const c = await stored(), on = await p.evaluate(() => document.querySelector("#period .on").dataset.m), unread = m !== 12; ok(unread ? c.windowMonths === 12 && on === "12" && c.desk.evidence.windowMonths === 12 : c.windowMonths === 12 && on === "12", `window ${m} months: ${unread ? "the engine could not read it, so nothing is saved and the switch stays at 12 (" + c.windowMonths + ", " + on + ")" : "saved on the case and the switch follows"}`); }
const d = await S.document(p); ok(d.pass, `add a document: the file goes through doc_add and the tile is drawn (${d.n0} to ${d.sv})`);
{ await p.click('[data-need="mileage_unconfirmed"] [data-act="verify"]'); await wait(1200); }
const a = await S.attention(p); ok(a.pass, `an attention action closes its item (${a.n0} open to ${a.n1}); no "say which item" answer`);
{ const open = (await stored()).needs_review.filter(n => n.state === "open").length; ok(open === 0 && /All clear/.test(await p.evaluate(() => document.getElementById("attN").textContent)), "every attention item is resolved (the invoice closed the service item, the others by verify and waive) and the panel says so"); }
{ await p.click("#pnone"); await wait(900); await p.click("#pall"); await wait(1000); const sv = await stored(); ok(sv.photos.reportIds.length === sv.photos.items.length && /6 of 6/.test(await p.evaluate(() => document.getElementById("pcount").textContent)), "Select all photos: every photo is in the saved report set"); }
{ await p.focus("[data-step]"); await p.keyboard.press("End"); await p.keyboard.type(" Thank you."); await p.keyboard.press("Tab"); await wait(1300); const sv = await stored(); ok(sv.nextSteps.some(s => /Thank you\./.test(s.text)), "edit a next step: the saved list carries the new words"); }
await p.click(`[data-in="${C6}"]`); await wait(900); await p.click(`[data-in="${C11}"]`); await wait(900);
{ await p.focus("#why"); await p.evaluate(() => document.getElementById("why").select()); await p.keyboard.type("The manual gearbox and one long ownership support this figure."); await p.click("#bPrev"); await wait(2500);
  const sv = await stored(), posts = p._posts.map(x => x.op || x.action), shown = await p.evaluate(() => ({ vis: !document.getElementById("v-report").hidden, frame: !!document.getElementById("pdfframe"), msg: document.getElementById("pdfmsg").textContent }));
  ok(/long ownership/.test(sv.reserve.why) && posts.lastIndexOf("case_pdf") > posts.lastIndexOf("reserve") && shown.vis && shown.frame && /Draft/.test(shown.msg), "Preview: the unsaved why was written first, then the draft report is built and shown without a reload"); await p.click("#n-desk"); }
{ const pre = await stored(), bad = (pre.checks || []).filter(c => c.ok === false).map(c => c.key); ok(bad.length === 0 && (pre.checks || []).length === 4, `before Finalize the flow case passes all four report checks by real ops (${(pre.checks || []).map(c => c.key + ":" + c.ok).join(" ")})`); }
{ await p.click("#bFin"); await wait(1500); const sv = await stored(), ui = await p.evaluate(() => ({ box: document.getElementById("finBox").textContent, pill: document.getElementById("status").textContent }));
  ok(sv.status === "finalized" && /Finalized as version/.test(ui.box) && /Finalized/.test(ui.pill), `Finalize: the case is finalized (${ui.pill}) and the panel says so`);
  await p.click("#n-report"); await wait(1800); ok(!/Draft/.test(await p.evaluate(() => (document.getElementById("pdfmsg") || {}).textContent || "")), "the Seller report tab after finalizing shows the finalized report, not a draft"); }
{ const q = await openLive(b, { w: 1440, h: 900 }); await q.click("#newcase-btn"); await q.type("#nc-vin", DEMO_VIN); await q.click("#nc-go"); await wait(2500); const post = q._posts.filter(x => x.action === "case_new").pop(), id = (/case\/([^/?#]+)/.exec(q.url()) || [])[1];
  const made = id && id !== V3.DEMO_ID ? await stored(id) : null; ok(!!post && post.vin === DEMO_VIN && !("year" in post) && !("make" in post) && !("model" in post) && !!made && made.fields.vin.value === DEMO_VIN, `new case by VIN alone: the VIN is sent as typed (no year, make or model) and the case holds it (${post && post.vin})`);
  const q2 = await openLive(b, { mutate: h => h.replace('["vin", vin],', '["vin", ""],') }); await q2.click("#newcase-btn"); await q2.type("#nc-vin", DEMO_VIN); await q2.click("#nc-go"); await wait(800); { const m = q2._posts.filter(x => x.action === "case_new").pop(); ok(!m || m.vin !== DEMO_VIN, "mutant caught: a form that drops the VIN"); } await q.close(); await q2.close(); }
ok(p._err.length === 0, "no page error through the whole flow" + (p._err.length ? ": " + p._err.join(" | ") : ""));
await p.close(); await b.close();
done("deskV4FlowCheck");
