// DESK V4 SEND CHECK (Lane S, Nov 10 2026). "Send to seller" in the Reserve panel, against Lane D's posted contract and names (docs/lane-notes.md, Nov 10 2026): case_send_preview { id } answers flat (to, toLine, subject, message, attachmentName, version, from, fromName, sendingReady, alreadySent[]);
// case_send { id, version, to, again? } answers { ok, sent, case, exports }; every refusal is { ok:false, refused:true, why }; the sent line is case.handling.sentLine and every send is case.handling.sentLines (case.handling.clock stays the handling time); case.exports is [{ version, to, at, line }]; case.stage becomes "sent".
// A check NEVER sends: every send action is answered by this file's own stub (scripts/deskV4Harness.mjs) and the real reader never sees one.
//   1 NO BUTTON before there is a finalized version; 2 AFTER FINALIZE (the real flow) the button shows, enabled; 3 THE CONFIRM PANEL, in the page, prints exactly the preview (recipient editable, subject, message, attachment name, version, sender, earlier sends); Cancel sends nothing.
//   4 SEND uses the address SHOWN, the previewed version and this case, ONCE despite a double click, and the FIRST send carries no `again`. 5 AFTER SUCCESS the sent line is case.handling.sentLine (not the clock), the export is a Documents tile printing its own line, the button reads Send again.
//   6 SEND AGAIN: the preview now names the earlier send, the second call carries again: true, and both sends' lines show oldest first. 7 A REFUSAL prints why exactly as given. 8 AFTER AN EDIT the revision's button is disabled with "Finalize again to send the updated report".
//   MUTANTS (each run through the same assertion, each must fail): a button before finalize, not disabled after an edit, a page worded refusal, a double click that sends twice, a typed sent line, a typed subject; and EACH NAME READ FROM THE WRONG FIELD: the sent line read from handling.clock, the refusal read from message, the recipient read from toLine, the attachment read from subject, the export line read from to, `again` on the first send, no `again` on the second.
//   CLASS: a page that words, double fires, or reads a contract name from the wrong field. Every word printed is a field the server sent under its posted name.
//   node scripts/deskV4SendCheck.mjs
import { launch, openLive, tally, V3, PV, finalizeDemo } from "./deskV4Harness.mjs";
const { ok, done } = tally(), wait = (ms = 700) => new Promise(r => setTimeout(r, ms));
const PREVIEW = { to: "hal@example.com", toLine: "Hal Moreau <hal@example.com>", subject: "Hagerty Marketplace: your 1999 Porsche 911 Carrera", message: "Hello Hal,\nYour report is attached.\nThank you.", attachmentName: "1999-Porsche-911-Carrera-report.pdf", version: 1, from: "desk@hagerty.example", fromName: "Hagerty Marketplace", sendingReady: true };
const REFUSAL = "This sheet is being sent, or was just sent.", CLOCK = "Handled in 18 min.";
const LINES = ["Version 1 of the report was sent to pat@example.com on 10 November 2026.", "Version 1 of the report was sent to pat@example.com on 11 November 2026."];
let sends = [];
// a stub with a memory: `prior` earlier sends already made when the page opens (the real server answers from its export records)
const stubOf = (mode = "ok", delay = 250, prior = 0) => { let n = prior; return async b => {
  if (b.action === "case_send_preview") return { ok: true, id: b.id, ...PREVIEW, alreadySent: Array.from({ length: n }, (_, i) => ({ to: "pat@example.com", at: "2026-11-10T14:05:00Z", version: 1 })) };
  if (b.action === "case_send") { sends.push(b); await wait(delay); if (mode === "refuse") return { ok: false, refused: true, why: REFUSAL, message: "Wrong field", line: "Wrong field too" };
    n++; const g = await PV.previewDeskApi({ action: "case_get", id: b.id }), lines = LINES.slice(0, n);
    return { ok: true, sent: { to: b.to, at: "2026-11-10T14:05:00Z", version: b.version, subject: PREVIEW.subject }, case: { ...g.case, stage: "sent", handling: { ...g.case.handling, clock: CLOCK, sentLine: lines[lines.length - 1], sentLines: lines }, exports: lines.map((line, i) => ({ version: b.version, to: b.to, at: "2026-11-10T14:0" + i + ":00Z", line })) }, exports: n }; }
  return { ok: false, why: "stub" }; }; };
const b = await launch();
const state = p => p.evaluate(() => { const q = i => document.getElementById(i), vis = e => !!e && !e.hidden && !!(e.offsetWidth || e.getClientRects().length);
  return { box: vis(q("sendBox")), btn: vis(q("bSend")), text: (q("bSend") || {}).textContent, dis: !!(q("bSend") || {}).disabled, hint: (q("sendHint") || {}).textContent, sentLines: vis(q("sentLine")) ? [...document.querySelectorAll("#sentLine [data-sent]")].map(t => t.textContent) : [], dlg: vis(q("sendScrim")),
    to: (q("sendTo") || {}).value, subject: (q("sendSubject") || {}).textContent, message: (q("sendMsg") || {}).textContent, att: (q("sendAtt") || {}).textContent, ver: (q("sendVer") || {}).textContent, from: (q("sendFrom") || {}).textContent, earlier: [...document.querySelectorAll("#sendEarlier .ro")].map(e => e.textContent), exportTiles: [...document.querySelectorAll("#docs [data-export]")].map(e => e.textContent), err: vis(q("sendErr")) ? q("sendErr").textContent : null, goDis: !!(q("sendGo") || {}).disabled }; });
const SEND_ONCE = async (p, { to = null, dbl = false } = {}) => { await p.click("#bSend"); await wait(500); if (to) { await p.focus("#sendTo"); await p.evaluate(() => document.getElementById("sendTo").select()); await p.keyboard.type(to); } await p.click("#sendGo", dbl ? { clickCount: 2, delay: 20 } : {}); if (dbl) await p.evaluate(() => document.getElementById("sendGo").click()); await wait(1200); };

// ---- 1 no button before finalize ----
{ const p = await openLive(b, { stub: stubOf() }); const s = await state(p); ok(!s.box && !s.btn, "no Send button before the case has a finalized version"); await p.close(); }
{ const p = await openLive(b, { stub: stubOf(), mutate: h => h.replace("function hasFinal() { return !!K.finalized_at; }", "function hasFinal() { return true; }") }); const s = await state(p); ok(s.btn === true, "mutant caught: a Send button before finalize"); await p.close(); }

// ---- 2 finalize through the real flow ----
const fin = await finalizeDemo(); ok(fin.ok === true, "the demonstration case finalizes through the real actions" + (fin.ok ? "" : " (" + (fin.why || "") + ")"));

// ---- the name mutants: each reads one contract name from the wrong field and must change what the page prints or sends ----
sends = [];
{ const M = async (mutate, prior = 0, mode = "ok") => { sends = []; const p = await openLive(b, { stub: stubOf(mode, 250, prior), mutate }); await SEND_ONCE(p); const s = await state(p); await p.close(); return s; };
  ok((await M(h => h.replace("return h.sentLines && h.sentLines.length ? h.sentLines : (h.sentLine ? [h.sentLine] : []);", "return h.clock ? [h.clock] : [];"))).sentLines[0] !== LINES[0], "mutant caught: the sent line read from handling.clock (the handling time) instead of handling.sentLine");
  ok((await M(h => h.replace("return (r && r.why) || \"\";", "return (r && r.message) || \"\";"), 0, "refuse")).err !== REFUSAL, "mutant caught: the refusal read from message instead of why");
  { sends = []; const p = await openLive(b, { stub: stubOf(), mutate: h => h.replace("to: r.to,", "to: r.toLine,") }); await p.click("#bSend"); await wait(500); const s = await state(p); await p.close(); ok(s.to !== PREVIEW.to, "mutant caught: the recipient read from toLine instead of to"); }
  { const p = await openLive(b, { stub: stubOf(), mutate: h => h.replace("attachment: r.attachmentName", "attachment: r.subject") }); await p.click("#bSend"); await wait(500); const s = await state(p); await p.close(); ok(s.att !== PREVIEW.attachmentName, "mutant caught: the attachment name read from subject instead of attachmentName"); }
  ok((await M(h => h.replace('el("span", { text: x.line || "" })', 'el("span", { text: x.to || "" })'))).exportTiles.every(t => !t.includes(LINES[0])), "mutant caught: the export's line read from to instead of line");
  { await M(h => h.replace("SEND.again(pv) ?", "true ?")); ok(sends.length === 1 && "again" in sends[0], "mutant caught: again: true on the FIRST send"); }
  await M(h => h.replace("SEND.again(pv) ?", "false ?"), 1); ok(sends.length === 1 && !("again" in sends[0]), "mutant caught: no again on an explicit SECOND send"); }

// ---- 3 to 6 the flow on the finalized case ----
sends = [];
{ const p = await openLive(b, { stub: stubOf() }); const s = await state(p); ok(s.btn && !s.dis && s.text === "Send to seller" && !s.hint && !s.sentLines.length, "after finalize: Send to seller is shown, enabled, no sent line yet");
  await p.click("#bSend"); await wait(500); const o = await state(p);
  ok(o.dlg && o.to === PREVIEW.to && o.subject === PREVIEW.subject && o.message === PREVIEW.message && o.att === PREVIEW.attachmentName && o.ver === String(PREVIEW.version) && o.from === PREVIEW.fromName + " " + PREVIEW.from && o.earlier.length === 0, "the confirm panel prints exactly the preview: recipient, subject, message, attachment name, version and the sender; no earlier sends yet");
  ok(p._posts.filter(x => x.action === "case_send_preview").length === 1 && sends.length === 0, "opening it asks for the preview and sends nothing");
  ok(await p.evaluate(() => document.getElementById("sendTo").type === "email" && document.activeElement.id === "sendTo" && !!document.querySelector('#sendDlg[role="dialog"][aria-modal="true"]')), "the recipient is an editable email input with focus, in an in-page dialog");
  await p.click("#sendNo"); await wait(200); ok(!(await state(p)).dlg && sends.length === 0, "Cancel closes the panel and sends nothing");
  await p.click("#bSend"); await wait(500); await p.focus("#sendTo"); await p.evaluate(() => document.getElementById("sendTo").select()); await p.keyboard.type("pat@example.com");
  await p.click("#sendGo", { clickCount: 2, delay: 20 }); await p.evaluate(() => document.getElementById("sendGo").click()); await wait(1200);
  ok(sends.length === 1 && sends[0].to === "pat@example.com" && sends[0].version === 1 && sends[0].id === V3.DEMO_ID && !("again" in sends[0]), `Send uses the address shown, the previewed version and this case, ONCE despite a double click, and the first send carries no again (${sends.length} call)`);
  const a = await state(p); ok(!a.dlg && a.sentLines.length === 1 && a.sentLines[0] === LINES[0] && a.sentLines[0] !== CLOCK && a.text === "Send again" && !a.dis && a.exportTiles.length === 1 && a.exportTiles[0].includes(LINES[0]), "after success: the panel closes, the sent line is case.handling.sentLine (not the clock), the export is a Documents tile printing its own line, the button reads Send again");
  // 6 send again
  await p.click("#bSend"); await wait(500); const o2 = await state(p); ok(o2.dlg && o2.earlier.length === 1 && o2.earlier[0].includes("pat@example.com") && p._posts.filter(x => x.action === "case_send_preview").length === 3, "Send again goes through the same confirm panel and the preview now names the earlier send");
  await p.click("#sendGo"); await wait(1200); const a2 = await state(p); ok(sends.length === 2 && sends[1].again === true && a2.sentLines.length === 2 && a2.sentLines[0] === LINES[0] && a2.sentLines[1] === LINES[1] && a2.exportTiles.length === 2, "the explicit second send carries again: true, and both sends' lines show, oldest first, with both exports");
  ok(p._err.length === 0, "no page error"); await p.close(); }
// ---- 7 a refusal is shown as given ----
sends = [];
{ const p = await openLive(b, { stub: stubOf("refuse") }); await p.click("#bSend"); await wait(500); await p.click("#sendGo"); await wait(900); const s = await state(p); ok(s.dlg && s.err === REFUSAL && !s.goDis, "a refusal is shown exactly as the server gave it (why), the dialog stays and Send works again"); await p.close(); }
{ const p = await openLive(b, { stub: stubOf("refuse"), mutate: h => h.replace('return (r && r.why) || "";', 'return "That could not be sent.";') }); await p.click("#bSend"); await wait(500); await p.click("#sendGo"); await wait(900); const s = await state(p); ok(s.err !== REFUSAL, "mutant caught: a refusal worded by the page"); await p.close(); }
sends = [];
{ const p = await openLive(b, { stub: stubOf("ok", 500), mutate: h => h.replace("if (sending || !pv) return; sending = true; $(\"sendGo\").disabled = true;", "if (!pv) return; $(\"sendGo\").disabled = false;") }); await p.click("#bSend"); await wait(500); await p.click("#sendGo"); await p.evaluate(() => document.getElementById("sendGo").click()); await wait(1200); ok(sends.length !== 1, "mutant caught: a double click that sends twice"); await p.close(); }
{ const p = await openLive(b, { stub: stubOf("ok"), mutate: h => h.replace('return h.sentLines && h.sentLines.length ? h.sentLines : (h.sentLine ? [h.sentLine] : []);', 'return h.sentLine ? ["Sent just now."] : [];') }); await SEND_ONCE(p); const s = await state(p); ok(s.sentLines[0] !== LINES[0], "mutant caught: a typed sent line"); await p.close(); }
sends = [];
{ const p = await openLive(b, { stub: stubOf(), mutate: h => h.replace('$("sendSubject").textContent = pv.subject || "";', '$("sendSubject").textContent = "Your report";') }); await p.click("#bSend"); await wait(500); const s = await state(p); ok(s.subject !== PREVIEW.subject, "mutant caught: a typed subject in the confirm panel"); await p.close(); }
ok(sends.length === 0, "no send reached the real reader or the stub outside the steps above");

// ---- 8 after an edit the case is a revision: disabled with the line ----
const rev = await PV.previewDeskApi({ action: "case_edit", id: V3.DEMO_ID, op: "reserve", patch: { why: "Edited after finalizing, so the report must be finalized again." } }); ok(rev.ok && rev.id !== V3.DEMO_ID, "an edit after finalize makes the next version (a revision sheet)");
{ const p = await openLive(b, { id: rev.id, stub: stubOf() }); const s = await state(p); ok(s.btn && s.dis && s.hint === "Finalize again to send the updated report", `after an edit: Send is disabled with "${s.hint}"`); await p.click("#bSend").catch(() => {}); await wait(300); ok(!(await state(p)).dlg, "a disabled Send opens nothing"); await p.close(); }
{ const p = await openLive(b, { id: rev.id, stub: stubOf(), mutate: h => h.replace('b.disabled = edited || sending;', 'b.disabled = sending;') }); const s = await state(p); ok(s.dis === false, "mutant caught: Send not disabled after an edit"); await p.close(); }
await b.close();
done("deskV4SendCheck");
