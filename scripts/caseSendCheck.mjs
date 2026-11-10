// DESK V4: SEND TO SELLER (Lane D, Nov 10 2026). case_send_preview and case_send through the REAL actions, store and report builder, with the sender a STAND-IN: no check ever sends an email (a trap on fetch fails the run if anything reaches the provider).
// CLASS: whichever way a send can go wrong (a draft, a case edited since it was finalized, a version that is not the latest, a missing or invalid address, a sender that is not verified, a double press, a failing provider) it is refused with the table's sentence and writes
// nothing; a send that goes out sends exactly the stored report's bytes and records one export (version, address, when, who), moves the case to sent and leaves a handling line.   node scripts/caseSendCheck.mjs [rootDir]
import path from "node:path"; import fs from "node:fs"; import crypto from "node:crypto"; import { pathToFileURL } from "node:url"; import { setup } from "./_deskCaseWorld.mjs";
const root = path.resolve(process.argv[2] || "."), { K, readyCase, T, w, read } = await setup(root);
const imp = f => import(pathToFileURL(path.join(root, f)).href), A = await imp("lib/desk/sheetActions.js"), { memoryStore } = await imp("lib/desk/sheetStore.js"), CS = await imp("lib/desk/caseSend.js"), SEND = await imp("lib/desk/send.js"), STORE = await imp("lib/desk/intake/store.js");
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) pass++; else { fail++; console.log("FAIL " + n + (d !== undefined ? "  " + (typeof d === "string" ? d : JSON.stringify(d)).slice(0, 260) : "")); } };
const trapped = []; const realFetch = globalThis.fetch; globalThis.fetch = async (u, ...r) => { if (/resend\.com|api\.resend/.test(String(u))) { trapped.push(String(u)); throw new Error("a check reached the email provider"); } return realFetch(u, ...r); };
const sha = b => crypto.createHash("sha256").update(Buffer.from(b)).digest("hex");
const store = memoryStore(), sent = [], FAIL_NEXT = { v: false };
const mk = (o = {}) => ({ org: "t", seat: "crew", store, now: T, env: w.env, deps: w.deps, readSheet: async (e, i) => read(i), orgSettings: { name: "Hagerty Marketplace", standardMessage: "Thank you for sending your car. The valuation report is attached.", monthlyExportCap: 200 }, sending: { from: "marketplace@hagerty.example", fromName: "Hagerty Marketplace", ready: true }, fetchImage: async () => null, sendCase: async x => { if (FAIL_NEXT.v) return { ok: false, why: "The report could not be sent, so nothing was sent" }; sent.push(x); return { ok: true, id: "stub-" + sent.length, at: x.now }; }, ...o });
const run = (a, b, o) => A.handleSheetAction(a, b, mk(o));
const base = await readyCase(); base.seller = { name: "Dana Seller", email: "dana@example.com" };
await store.insert("t", { id: "s1", owner_seat: "crew", status: "In progress", created_at: T, submission: { typed: true, photos: [], documents: [] }, state: {}, case: base, version: 1 });
await store.insert("t", { id: "d1", owner_seat: "crew", status: "In progress", created_at: T, submission: { typed: true, photos: [], documents: [] }, state: {}, case: { ...structuredClone(base), status: "ready" }, version: 1 });
const nExp = async id => (await store.exportsOf("t", id)).filter(e => e.kind === "send").length, nothing = (name, r, id, n0, calls0, why) => ok(name, r.ok === false && r.refused === true && (!why || r.why === why) && sent.length === calls0 && (id ? (nExp(id), true) : true), r);
// 1. a draft: refused (preview says there is nothing finalized, send says a draft cannot be sent); nothing is sent or written
{ const p = await run("case_send_preview", { id: "d1" }), s = await run("case_send", { id: "d1", version: 1, to: "dana@example.com" });
  ok("a draft: the preview says there is no finalized version", p.ok === false && p.refused === true && p.why === "There is no finalized version to send yet", p);
  ok("a draft: case_send refuses it, nothing sent, nothing recorded", s.ok === false && s.why === "A draft cannot be sent, so finalize the case first" && sent.length === 0 && (await nExp("d1")) === 0, s); }
// finalize the case
const fin = await run("case_finalize", { id: "s1" }); ok("the case finalizes (version 1)", fin.ok && fin.version === 1, fin);
// 2. the preview of a finalized version
const pv = await run("case_send_preview", { id: "s1" });
ok("the preview returns the recipient line, subject, message, attachment name and the finalized version", pv.ok && pv.version === 1 && pv.to === "dana@example.com" && pv.toLine === "To: dana@example.com" && /^Hagerty Marketplace: your /.test(pv.subject) && pv.message === "Thank you for sending your car. The valuation report is attached." && /\.pdf$/.test(pv.attachmentName) && pv.from === "marketplace@hagerty.example" && pv.sendingReady === true && Array.isArray(pv.alreadySent) && pv.alreadySent.length === 0, pv);
ok("the preview sends nothing and records nothing", sent.length === 0 && (await nExp("s1")) === 0);
{ const sub = pv.subject + " " + pv.message; ok("the email's words carry no dash, no competitor name, no source count and no AI", !/[–—-]/.test(pv.message) && !/\b(AI|artificial|Bring a Trailer|Cars & Bids|Hemmings|Hagerty Valuation)\b/i.test(sub.replace("Hagerty Marketplace", "")) && !/\b\d+ (sales|sources|auctions|comparables)\b/i.test(sub), sub); }
// 3. refusals: wrong version, missing and invalid recipient, an unverified sender
const n0 = sent.length;
for (const [name, body, why, o] of [
  ["a version that is not the finalized one", { id: "s1", version: 2, to: "dana@example.com" }, "That is not the latest finalized version"],
  ["no version", { id: "s1", to: "dana@example.com" }, "That is not the latest finalized version"],
  ["a missing recipient", { id: "s1", version: 1 }, "Enter a valid address to send the report to"],
  ["an empty recipient", { id: "s1", version: 1, to: "  " }, "Enter a valid address to send the report to"],
  ["a recipient that is not an address", { id: "s1", version: 1, to: "dana at example" }, "Enter a valid address to send the report to"],
  ["two recipients in one", { id: "s1", version: 1, to: "a@x.com, b@y.com" }, "Enter a valid address to send the report to"],
  ["a sender that is not verified", { id: "s1", version: 1, to: "dana@example.com" }, "This organisation's sending address is not verified yet", { sending: { from: "x@y.example", fromName: "X", ready: false } }],
  ["a case that does not exist", { id: "nope", version: 1, to: "dana@example.com" }, "There is no such case"]]) { const r = await run("case_send", body, o); ok(name + ": refused with the table's sentence, nothing sent, nothing recorded", r.ok === false && r.refused === true && r.why === why && sent.length === n0 && (await nExp("s1")) === 0, r); }
// 4. success: the sent bytes are the stored export's bytes; one export is recorded; the case is sent; a handling line says to whom and when
const exp = await run("sheet_pdf", { id: "s1" }), expBytes = Buffer.from(exp.pdf_b64, "base64");
const ex0 = (await store.exportsOf("t", "s1")).length;
const ok1 = await run("case_send", { id: "s1", version: 1, to: "dana.corrected@example.com" }, { now: new Date(Date.parse(T) + 60000).toISOString() });
ok("a valid send succeeds with { sent: { to, at, version, subject }, case, exports }", ok1.ok && ok1.sent.to === "dana.corrected@example.com" && ok1.sent.version === 1 && !!ok1.sent.at && !!ok1.sent.subject && ok1.exports === 1 && ok1.case, ok1);
ok("the sender was called once, with the address the analyst corrected it to, the org's address and the report", sent.length === n0 + 1 && sent[sent.length - 1].to === "dana.corrected@example.com" && sent[sent.length - 1].pdf.name === exp.filename, sent.map(x => x.to));
ok("the bytes sent are the stored export's bytes, hash for hash", sha(sent[sent.length - 1].pdf.bytes) === sha(expBytes) && Buffer.compare(Buffer.from(sent[sent.length - 1].pdf.bytes), expBytes) === 0, [sha(sent[sent.length - 1].pdf.bytes).slice(0, 12), sha(expBytes).slice(0, 12)]);
{ const ex = (await store.exportsOf("t", "s1")).filter(e => e.kind === "send"); ok("one send export is recorded: version, address actually used, when and who", ex.length === 1 && ex[0].version === 1 && ex[0].detail.to === "dana.corrected@example.com" && !!ex[0].at && ex[0].seat === "crew", ex); }
ok("the case is in the sent stage and the sent count is one", ok1.case.stage === "sent" && ok1.case.queue.sent === 1, [ok1.case.stage, ok1.case.queue]);
ok("a handling line says the report was sent, to whom and when", ok1.case.handling.sentLines.length === 1 && ok1.case.handling.sentLine === ok1.case.handling.sentLines[0] && /^Version 1 of the report was sent to dana\.corrected@example\.com on \d{1,2} \w+ 20\d\d\.$/.test(ok1.case.handling.sentLines[0]) && ok1.case.exports.length === 1 && ok1.case.exports[0].to === "dana.corrected@example.com", ok1.case.handling.sentLines);
ok("the finalized case itself was not touched (version 1, status finalized, same figures)", ok1.case.status === "finalized" && ok1.case.version === 1 && JSON.stringify(ok1.case.reserve.figure) === JSON.stringify(base.reserve.figure));
// 5. sending again: only as an explicit second call, recorded as a second export
{ const d = await run("case_send", { id: "s1", version: 1, to: "dana.corrected@example.com" });
  ok("a second press without saying so is refused with the earlier send named, and nothing is sent", d.ok === false && /already sent to dana\.corrected@example\.com on/.test(d.why) && sent.length === n0 + 1 && (await nExp("s1")) === 1, d);
  const pv2 = await run("case_send_preview", { id: "s1" }); ok("the preview lists the earlier send", pv2.ok && pv2.alreadySent.length === 1 && pv2.alreadySent[0].to === "dana.corrected@example.com", pv2);
  const again = await run("case_send", { id: "s1", version: 1, to: "dana@example.com", again: true }, { now: new Date(Date.parse(T) + 120000).toISOString() });
  ok("an explicit second call sends again and is a second export", again.ok && again.exports === 2 && sent.length === n0 + 2 && (await nExp("s1")) === 2 && again.case.handling.sentLines.length === 2 && sha(sent[sent.length - 1].pdf.bytes) === sha(expBytes), again.ok ? again.exports : again); }
// 6. a failing provider: nothing is recorded and the case stays as it was
{ await store.insert("t", { id: "s2", owner_seat: "crew", status: "In progress", created_at: T, submission: { typed: true, photos: [], documents: [] }, state: {}, case: structuredClone(base), version: 1 }); await run("case_finalize", { id: "s2" });
  FAIL_NEXT.v = true; const f = await run("case_send", { id: "s2", version: 1, to: "dana@example.com" }); FAIL_NEXT.v = false;
  ok("a provider that fails: refused with the table's sentence, no export, the case is not sent", f.ok === false && f.sendFailed === true && f.why === "The report could not be sent, so nothing was sent" && (await nExp("s2")) === 0 && (await run("case_get", { id: "s2" })).case.stage === "final", f); }
// 7. edited since finalize: a change after finalizing makes a revision; the preview and the send refuse it, and the old version is not the latest
{ const e = await run("case_edit", { id: "s2", op: "field", field: "colour", value: "Black" }); ok("a change after finalizing opens a revision (version 2, in review)", e.ok && e.revisedFrom === "s2" && e.case.version === 2 && ["review", "ready"].includes(e.case.stage), e.ok ? [e.revisedFrom, e.case.version, e.case.stage] : e);
  const rev = e.id, p1 = await run("case_send_preview", { id: rev }), s1 = await run("case_send", { id: rev, version: 2, to: "dana@example.com" }), p0 = await run("case_send_preview", { id: "s2" }), s0 = await run("case_send", { id: "s2", version: 1, to: "dana@example.com" });
  ok("edited since the last finalize: the preview and the send of the revision are refused", p1.ok === false && p1.why === "The case was changed after it was finalized, so finalize the new version before sending" && s1.ok === false && s1.why === p1.why, [p1.why, s1.why]);
  ok("the old version cannot be sent while a revision is open", p0.ok === false && p0.why === p1.why && s0.ok === false, [p0.why]);
  await store.get("t", rev); const fin2 = await run("case_edit", { id: rev, op: "reserve", patch: { why: "Held at the lower quartile of the record." } }); void fin2; const f2 = await run("case_finalize", { id: rev });
  if (f2.ok) { const old = await run("case_send", { id: "s2", version: 1, to: "dana@example.com" }), cur = await run("case_send", { id: rev, version: 2, to: "dana@example.com" }); ok("once the revision is finalized, the old version is not the latest and version 2 sends", old.ok === false && old.why === "That is not the latest finalized version" && cur.ok === true && cur.sent.version === 2, [old.why, cur.ok ? cur.sent : cur]); }
  else ok("the revision finalizes again (version 2)", false, f2); }
// 8. a seat that does not own the case cannot send it
{ const sentBefore = sent.length; const o = await run("case_send", { id: "s1", version: 1, to: "x@example.com", again: true }, { seat: "other" }); ok("another seat cannot send a case it does not own", o.ok === false && o.refused === true && o.why === "Only the analyst who owns this case can send it" && sent.length === sentBefore, o); }
// 9. THE CLASS: nothing in a check ever reaches a provider, and no refusal leaves a trace
{ const refusals = ["no_case", "no_final", "draft", "edited", "version", "address", "not_ready", "not_switched", "cap", "failed", "already", "owner"].map(k => "send.refuse." + k), RW = await imp("lib/reasonWords.js");
  ok("every refusal is a line in the table", refusals.every(k => { try { return typeof RW.reasonLine(k, { to: "a@b.c", date: "1 January 2026" }) === "string"; } catch { return false; } }));
  ok("no check reached the email provider", trapped.length === 0, trapped);
  const code = fs.readFileSync(path.join(root, "lib/desk/sheetActions.js"), "utf8").split("action === \"case_send_preview\"")[1].split("action === \"case_finalize\"")[0];
  ok("the ops type no sentence (every why is reasonLine) and format no money", !/(refuse|why:)\(?\s*"[A-Z]/.test(code) && !/toLocaleString/.test(code)); }
// 10. the live adapter and the second send, over the intake store (the older Desk's own send code), with a stand-in provider
{ const st = STORE.memoryStore({ orgs: [{ id: "hagerty", name: "Hagerty Marketplace", inbound_local: "hagerty" }], seats: [{ org_id: "hagerty", email: "ann@hagerty.example", role: "member", subject: "u1" }], settings: { hagerty: { sending_address: "marketplace@hagerty.example", sending_name: "Hagerty Marketplace", sending_domain: "hagerty.example", sending_domain_status: "verified", signature: "Hagerty Marketplace", standard_message: "Thank you." } } });
  const row = await st.createSheet({ org_id: "hagerty", seat_id: 1, seat_email: "ann@hagerty.example", status: "finalised", source: "email", car_label: "1999 Porsche 911 Carrera", sending: false }), org = { id: "hagerty", name: "Hagerty Marketplace" }, calls = [], provider = async x => { calls.push(x); return { ok: true, id: "p" + calls.length }; };
  const pdf = { name: "report.pdf", bytes: Buffer.from("%PDF-1.4 stored") };
  const a = await SEND.sendSheet({ store: st, org, seat: { id: 1 }, sheetId: row.id, to: "dana@example.com", message: "Hello", pdf, provider }), b = await SEND.sendSheet({ store: st, org, seat: { id: 1 }, sheetId: row.id, to: "dana@example.com", message: "Hello", pdf, provider });
  ok("the first send goes out once, and a plain second call is still refused (the once-only locks are unchanged)", a.ok && b.ok === false && b.reason === "already_sent" && calls.length === 1, [a.ok, b.reason]);
  const c = await SEND.resendSheet({ store: st, org, seat: { id: 1 }, sheetId: row.id, to: "dana@example.com", message: "Hello", pdf, provider }), d = await SEND.resendSheet({ store: st, org, seat: { id: 1 }, sheetId: row.id, to: "dana@example.com", message: "Hello", pdf: { name: "x.pdf", bytes: Buffer.from("%PDF-1.4 other") }, provider }), n = await SEND.resendSheet({ store: st, org, seat: { id: 2 }, sheetId: row.id, to: "dana@example.com", message: "Hello", provider });
  ok("an explicit second send goes out with the stored PDF's bytes and its own idempotency key", c.ok && c.again === true && calls.length === 2 && calls[1].idempotencyKey !== calls[0].idempotencyKey && Buffer.compare(Buffer.from(calls[1].pdf.bytes), Buffer.from(calls[0].pdf.bytes)) === 0, calls.map(x => x.idempotencyKey));
  ok("a different PDF is refused as the stored one is immutable, and a seat that does not own the sheet cannot resend", d.ok === false && d.reason === "pdf_immutable" && n.ok === false && n.reason === "not_your_sheet" && calls.length === 2, [d.reason, n.reason]);
  const fresh = await st.createSheet({ org_id: "hagerty", seat_id: 1, seat_email: "ann@hagerty.example", status: "finalised", source: "email", sending: false }), nr = await SEND.resendSheet({ store: st, org, seat: { id: 1 }, sheetId: fresh.id, to: "dana@example.com", message: "Hello", provider });
  ok("a sheet never sent cannot be 'sent again'", nr.ok === false && nr.reason === "not_sent" && calls.length === 2, nr.reason);
  const dflt = await CS.defaultSendCase({ ctx: { env: null }, org: "hagerty", seat: 1, sheet: row, to: "dana@example.com", subject: "s", message: "m", pdf, again: false });
  ok("without a database the live sender says sending is not switched on and sends nothing", dflt.ok === false && /not switched on/.test(dflt.why) && trapped.length === 0, dflt); }
globalThis.fetch = realFetch;
console.log(`caseSendCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
