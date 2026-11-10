// DESK V4 SEND CHECK (Lane S, Nov 10 2026). "Send to seller" in the Reserve panel, against Lane D's contract (case_send_preview { id }, case_send { id, version, to }). A check NEVER sends: every send action is answered by this file's own stub (scripts/deskV4Harness.mjs) and the real reader never sees one.
//   1 NO BUTTON before there is a finalized version (the fresh case in review shows no Send).
//   2 AFTER FINALIZE (the real finalize flow) the button shows, enabled, reading "Send to seller".
//   3 THE CONFIRM PANEL, inside the page (a dialog, no browser dialog), prints exactly what case_send_preview returned: recipient (an editable input), subject, message, attachment name, version. Cancel closes it and sends nothing.
//   4 SEND calls case_send with the address SHOWN (edited), the previewed version and this case; a DOUBLE CLICK sends ONCE (the button disables while sending).
//   5 AFTER SUCCESS the panel closes, the sent line from the case is shown as the case carries it, and the button reads "Send again" and goes through the same confirm panel.
//   6 A REFUSAL is shown exactly as given (the server's own line, no wording of the page's), the dialog stays, Send works again.
//   7 AFTER AN EDIT the case is a revision (the real server behaviour): the button is disabled with "Finalize again to send the updated report".
//   MUTANTS (each run through the same assertion, each must fail): the button before finalize, not disabled after an edit, a page worded refusal, a double click that sends twice, a typed sent line, a typed subject in the confirm panel.
//   CLASS: a page that words, or double fires, a send. Every word printed is a field the server sent; nothing here writes to the world.
//   node scripts/deskV4SendCheck.mjs
import { launch, openLive, tally, V3, PV, finalizeDemo } from "./deskV4Harness.mjs";
const { ok, done } = tally(), wait = (ms = 700) => new Promise(r => setTimeout(r, ms));
const PREVIEW = { to: "hal@example.com", subject: "Hagerty Marketplace: your 1999 Porsche 911 Carrera", message: "Hello Hal,\nYour report is attached.\nThank you.", attachmentName: "1999-Porsche-911-Carrera-report.pdf", version: 1 };
const REFUSAL = "This sheet is being sent, or was just sent.", SENT = "Sent to pat@example.com on 10 November 2026 at 14:05.";
let sends = [];
const stubOf = (mode = "ok", delay = 250) => async b => {
  if (b.action === "case_send_preview") return { ok: true, preview: PREVIEW };
  if (b.action === "case_send") { sends.push(b); await wait(delay); if (mode === "refuse") return { ok: false, refused: true, why: REFUSAL }; const g = await PV.previewDeskApi({ action: "case_get", id: b.id }); return { ok: true, case: { ...g.case, sentLine: SENT } }; }
  return { ok: false, why: "stub" };
};
const b = await launch();
const state = p => p.evaluate(() => { const q = i => document.getElementById(i), vis = e => !!e && !e.hidden && !!(e.offsetWidth || e.getClientRects().length);
  return { box: vis(q("sendBox")), btn: vis(q("bSend")), text: (q("bSend") || {}).textContent, dis: !!(q("bSend") || {}).disabled, hint: (q("sendHint") || {}).textContent, sentLine: vis(q("sentLine")) ? q("sentLine").textContent : null, dlg: vis(q("sendScrim")),
    to: (q("sendTo") || {}).value, subject: (q("sendSubject") || {}).textContent, message: (q("sendMsg") || {}).textContent, att: (q("sendAtt") || {}).textContent, ver: (q("sendVer") || {}).textContent, err: vis(q("sendErr")) ? q("sendErr").textContent : null, goDis: !!(q("sendGo") || {}).disabled }; });

// ---- 1 no button before finalize ----
{ const p = await openLive(b, { stub: stubOf() }); const s = await state(p); ok(!s.box && !s.btn, "no Send button before the case has a finalized version"); await p.close(); }
{ const p = await openLive(b, { stub: stubOf(), mutate: h => h.replace("function hasFinal() { return !!K.finalized_at; }", "function hasFinal() { return true; }") }); const s = await state(p); ok(s.btn === true, "mutant caught: a Send button before finalize"); await p.close(); }

// ---- 2 finalize through the real flow ----
const fin = await finalizeDemo(); ok(fin.ok === true, "the demonstration case finalizes through the real actions" + (fin.ok ? "" : " (" + (fin.why || "") + ")"));
{ const p = await openLive(b, { stub: stubOf() }); const s = await state(p); ok(s.btn && !s.dis && s.text === "Send to seller" && !s.hint && s.sentLine === null, "after finalize: Send to seller is shown, enabled, no sent line yet");

  // ---- 3 the confirm panel ----
  await p.click("#bSend"); await wait(500); const o = await state(p);
  ok(o.dlg && o.to === PREVIEW.to && o.subject === PREVIEW.subject && o.message === PREVIEW.message && o.att === PREVIEW.attachmentName && o.ver === String(PREVIEW.version), "the confirm panel prints exactly the preview: recipient, subject, message, attachment name and version");
  ok(p._posts.filter(x => x.action === "case_send_preview").length === 1 && sends.length === 0, "opening it asks for the preview and sends nothing");
  ok(await p.evaluate(() => document.getElementById("sendTo").type === "email" && document.activeElement.id === "sendTo" && !!document.querySelector('#sendDlg[role="dialog"][aria-modal="true"]')), "the recipient is an editable email input with focus, in an in-page dialog");
  await p.click("#sendNo"); await wait(200); ok(!(await state(p)).dlg && sends.length === 0, "Cancel closes the panel and sends nothing");

  // ---- 4 send with the shown address, once ----
  await p.click("#bSend"); await wait(500); await p.focus("#sendTo"); await p.evaluate(() => document.getElementById("sendTo").select()); await p.keyboard.type("pat@example.com");
  await p.click("#sendGo", { clickCount: 2, delay: 20 }); await p.evaluate(() => document.getElementById("sendGo").click()); await wait(1200);
  ok(sends.length === 1 && sends[0].to === "pat@example.com" && sends[0].version === 1 && sends[0].id === V3.DEMO_ID, `Send calls case_send with the address shown, the previewed version and this case, ONCE despite a double click (${sends.length} call)`);
  // ---- 5 after success ----
  const a = await state(p); ok(!a.dlg && a.sentLine === SENT && a.text === "Send again" && !a.dis, "after success: the panel closes, the case's sent line is shown as given and the button reads Send again");
  await p.click("#bSend"); await wait(500); ok((await state(p)).dlg && p._posts.filter(x => x.action === "case_send_preview").length === 3, "Send again goes through the same confirm panel (a new preview)"); await p.click("#sendNo");
  ok(p._err.length === 0, "no page error"); await p.close(); }
// ---- 6 a refusal is shown as given ----
sends = [];
{ const p = await openLive(b, { stub: stubOf("refuse") }); await p.click("#bSend"); await wait(500); await p.click("#sendGo"); await wait(900); const s = await state(p);
  ok(s.dlg && s.err === REFUSAL && !s.goDis, "a refusal is shown exactly as the server gave it, the dialog stays and Send works again"); await p.close(); }
{ const p = await openLive(b, { stub: stubOf("refuse"), mutate: h => h.replace('refusal: function (r) { return (r && (r.why || r.message || r.line)) || ""; }', 'refusal: function (r) { return "That could not be sent."; }') }); await p.click("#bSend"); await wait(500); await p.click("#sendGo"); await wait(900); const s = await state(p); ok(s.err !== REFUSAL, "mutant caught: a refusal worded by the page"); await p.close(); }
sends = [];
{ const p = await openLive(b, { stub: stubOf("ok", 500), mutate: h => h.replace("if (sending || !pv) return; sending = true; $(\"sendGo\").disabled = true;", "if (!pv) return; $(\"sendGo\").disabled = false;") }); await p.click("#bSend"); await wait(500); await p.click("#sendGo"); await p.evaluate(() => document.getElementById("sendGo").click()); await wait(1200); ok(sends.length !== 1, "mutant caught: a double click that sends twice"); await p.close(); }
{ const p = await openLive(b, { stub: stubOf("ok"), mutate: h => h.replace('return k.sentLine || (k.sent && (k.sent.line || k.sent.sentLine)) || null;', 'return k.sentLine ? "Sent just now." : null;') }); await p.click("#bSend"); await wait(500); await p.click("#sendGo"); await wait(1200); const s = await state(p); ok(s.sentLine !== SENT, "mutant caught: a typed sent line"); await p.close(); }
sends = [];
{ const p = await openLive(b, { stub: stubOf(), mutate: h => h.replace('$("sendSubject").textContent = pv.subject || "";', '$("sendSubject").textContent = "Your report";') }); await p.click("#bSend"); await wait(500); const s = await state(p); ok(s.subject !== PREVIEW.subject, "mutant caught: a typed subject in the confirm panel"); await p.close(); }
ok(sends.length === 0, "no send reached the real reader or the stub outside the steps above");

// ---- 7 after an edit the case is a revision: disabled with the line ----
const rev = await PV.previewDeskApi({ action: "case_edit", id: V3.DEMO_ID, op: "reserve", patch: { why: "Edited after finalizing, so the report must be finalized again." } }); ok(rev.ok && rev.id !== V3.DEMO_ID, "an edit after finalize makes the next version (a revision sheet)");
{ const p = await openLive(b, { id: rev.id, stub: stubOf() }); const s = await state(p); ok(s.btn && s.dis && s.hint === "Finalize again to send the updated report", `after an edit: Send is disabled with "${s.hint}"`); await p.click("#bSend", { }).catch(() => {}); await wait(300); ok(!(await state(p)).dlg, "a disabled Send opens nothing"); await p.close(); }
{ const p = await openLive(b, { id: rev.id, stub: stubOf(), mutate: h => h.replace('b.disabled = edited || sending;', 'b.disabled = sending;') }); const s = await state(p); ok(s.dis === false, "mutant caught: Send not disabled after an edit"); await p.close(); }
await b.close();
done("deskV4SendCheck");
