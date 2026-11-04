// DESK SEND (Lane D, Nov 4 2026; spec "Finalise, PDF, send"). Offline: the provider is a recording stub, the store is in memory.
// The three promises: the copy that went out is STORED exactly, the sheet MOVES to Sent with the time and address logged, and NOTHING IS SENT TWICE
// (a second press, five presses at once, a retry after a failure, a failure after the provider already accepted). Plus: automatic sending is off by default,
// and a sheet is sent only by its owner, only when finalised, only inside its own org.
//   node scripts/sendCheck.mjs [repo root]   (a tree without the fix fails: scripts/intakeFailsWithout.mjs)
import path from "node:path"; import fs from "node:fs"; import { fileURLToPath } from "node:url";
import { loadKit, reporter } from "./deskIntakeKit.mjs";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root); process.env.SUPABASE_URL = ""; process.env.SUPABASE_SERVICE_ROLE_KEY = "";
const { ok, result } = reporter();
const K = await loadKit(root);
const S = K.send;
if (!S) { ok("lib/desk/send.js exists", false, "missing"); { const r = result(); console.log(`\nsendCheck: ${r.pass} pass, ${r.fail} FAIL`); process.exit(r.fail ? 1 : 0); } }
const PDF = Buffer.from("%PDF-1.4\n% fixture report\n%%EOF");
const recorder = (behaviour = () => ({ ok: true, id: "re_1" })) => { const calls = []; const fn = async args => { calls.push(args); return behaviour(calls.length, args); }; fn.calls = calls; return fn; };

async function world({ status = "Finalised", pdfStored = true, seatId = 1, orgPatch = {} } = {}) {
  const { st } = K.fresh();
  const org = { ...st._state.orgs.find(o => o.id === "hagerty"), ...orgPatch }; st._state.orgs[0] = org;
  const sheet = await st.createSheet({ org_id: "hagerty", seat_id: seatId, seat_email: "ann@hagerty.example", status, car_label: "2008 Porsche 911 Carrera S", consignor_email: "john@seller.example", sending: false });
  if (pdfStored) { const p = `hagerty/${sheet.id}/report/r.pdf`; await st.put(p, PDF); sheet.pdf_path = p; }
  return { st, org, sheet, ann: { id: 1, email: "ann@hagerty.example" }, bob: { id: 2, email: "bob@hagerty.example" } };
}
const args = (w, over = {}) => ({ store: w.st, org: w.org, seat: w.ann, sheetId: w.sheet.id, to: "john@seller.example", subject: "Your 2008 Porsche", message: "Thank you for your submission.\n\nOur report is attached.", note: "The seller asked about a reserve.", provider: over.provider, ...over });

// ---- 1. the send: as the org, with the note, signature and PDF; copy stored; sheet moved and logged ----
{ const w = await world(), prov = recorder();
  const r = await S.sendSheet(args(w, { provider: prov }));
  const sent = await w.st.sentOf("hagerty", w.sheet.id), c = prov.calls[0], sh = await w.st.getSheet("hagerty", w.sheet.id);
  ok("sends once, through the provider, to the consignor", r.ok && prov.calls.length === 1 && c.to === "john@seller.example", r);
  ok("sent AS the org: its verified sending address and name, no expert's name or address anywhere", c.from === "Hagerty Marketplace <marketplace@hagerty.example>" && !/ann@|\bAnn\b/i.test(c.text + c.html + c.from + c.subject), c.from);
  ok("the message as edited, then the note under the org's name, then the org's signature", /^Thank you for your submission\.\n\nOur report is attached\.\n\nA note from Hagerty Marketplace:\nThe seller asked about a reserve\.\n\nHagerty Marketplace\nvaluations@hagerty\.example$/.test(c.text), c.text);
  ok("the PDF is attached, byte for byte", c.pdf && Buffer.compare(Buffer.from(c.pdf.bytes), PDF) === 0 && /\.pdf$/.test(c.pdf.name));
  ok("the exact copy is stored: text, html, address, subject, note and the PDF it carried", sent && sent.body_text === c.text && sent.body_html === c.html && sent.to_address === "john@seller.example" && sent.from_address === "marketplace@hagerty.example" && sent.subject === "Your 2008 Porsche" && sent.note === "The seller asked about a reserve." && sent.pdf_path === w.sheet.pdf_path, sent);
  ok("the sheet moved to Sent with the time and the address logged", sh.status === "Sent" && sh.sent_at === sent.sent_at && sh.sent_to === "john@seller.example" && sh.sending === false, sh);
  ok("the provider is given a key made from the sheet (a retry upstream cannot send a second mail)", c.idempotencyKey === `desk-send-${w.sheet.id}`); }

// ---- 2. nothing sent twice ----
{ const w = await world(), prov = recorder();
  await S.sendSheet(args(w, { provider: prov })); const again = await S.sendSheet(args(w, { provider: prov }));
  ok("a second press is refused as already sent; the provider was called once", !again.ok && again.reason === "already_sent" && prov.calls.length === 1, again); }
{ const w = await world(), prov = recorder(async () => { await new Promise(r => setTimeout(r, 20)); return { ok: true, id: "re_x" }; });
  const slow = recorder(); const rs = await Promise.all([1, 2, 3, 4, 5].map(() => S.sendSheet(args(w, { provider: async a => { slow.calls.push(a); await new Promise(r => setTimeout(r, 15)); return { ok: true, id: "re_c" }; } }))));
  ok("five presses at once: exactly one send, four refused", slow.calls.length === 1 && rs.filter(r => r.ok).length === 1 && rs.filter(r => !r.ok).length === 4, rs.map(r => r.reason || "ok")); }
{ const w = await world(), prov = recorder(n => n === 1 ? { ok: false, reason: "provider_refused", message: "domain not verified" } : { ok: true, id: "re_2" });
  const a = await S.sendSheet(args(w, { provider: prov }));
  ok("a provider refusal leaves the sheet Finalised, no copy kept, no claim held", !a.ok && (await w.st.getSheet("hagerty", w.sheet.id)).status === "Finalised" && (await w.st.sentOf("hagerty", w.sheet.id)) === null && (await w.st.getSheet("hagerty", w.sheet.id)).sending === false, a);
  const b = await S.sendSheet(args(w, { provider: prov }));
  ok("...and a retry then sends, once", b.ok && prov.calls.length === 2 && (await w.st.getSheet("hagerty", w.sheet.id)).status === "Sent"); }
{ const w = await world(), prov = recorder(() => { throw new Error("socket hang up"); });
  const a = await S.sendSheet(args(w, { provider: prov }));
  ok("a provider that throws is a refusal too: nothing recorded as sent", !a.ok && (await w.st.getSheet("hagerty", w.sheet.id)).status === "Finalised" && (await w.st.sentOf("hagerty", w.sheet.id)) === null, a); }
{ // the provider accepted, then the status write fails: it must NOT be sendable again
  const w = await world(), prov = recorder(), real = w.st.patchSheet.bind(w.st);
  w.st.patchSheet = async (o, id, patch) => { if (patch.status === "Sent") throw new Error("database down"); return real(o, id, patch); };
  const a = await S.sendSheet(args(w, { provider: prov }));
  w.st.patchSheet = real;
  const b = await S.sendSheet(args(w, { provider: prov }));
  ok("the provider accepted but the status write failed: still reported as sent, the copy is kept, and a retry sends nothing", a.ok && a.warning && prov.calls.length === 1 && !b.ok && (await w.st.sentOf("hagerty", w.sheet.id)) && prov.calls.length === 1, [a, b.reason]); }

{ // an exception AFTER the provider accepted (here: the clock) must not release the claim or drop the copy
  const w = await world(), prov = recorder(); let calls = 0;
  const a = await S.sendSheet({ ...args(w, { provider: prov }), now: () => { if (++calls >= 2) throw new Error("clock"); return "2026-11-04T12:00:00.000Z"; } });
  const b = await S.sendSheet(args(w, { provider: prov }));
  ok("an error after the provider accepted is reported as sent; the copy stays and a retry sends nothing", a.ok && a.warning && prov.calls.length === 1 && !b.ok && prov.calls.length === 1 && (await w.st.sentOf("hagerty", w.sheet.id)), [a, b.reason, prov.calls.length]); }

// ---- 3. who and when ----
for (const [name, mk, over, reason] of [
  ["a sheet still In progress", () => world({ status: "In progress" }), {}, "not_finalised"],
  ["a New sheet", () => world({ status: "New" }), {}, "not_finalised"],
  ["another seat of the same org", () => world(), { seat: { id: 2, email: "bob@hagerty.example" } }, "not_your_sheet"],
  ["a sending address that is not verified", () => world({ orgPatch: { sending_verified: false } }), {}, "sending_not_verified"],
  ["no sending address at all", () => world({ orgPatch: { sending_address: null } }), {}, "sending_not_verified"],
  ["a consignor address that is not an address", () => world(), { to: "john at seller" }, "bad_address"],
  ["an empty message", () => world(), { message: "  " }, "no_message"],
  ["no PDF", () => world({ pdfStored: false }), {}, "no_pdf"],
  ["a PDF that is not a PDF", () => world({ pdfStored: false }), { pdf: { name: "x.pdf", bytes: Buffer.from("hello") } }, "not_a_pdf"],
  ["a different PDF handed in after one is stored", () => world(), { pdf: { name: "x.pdf", bytes: Buffer.from("%PDF-1.4 different") } }, "pdf_immutable"]
]) {
  const w = await mk(), prov = recorder(); const r = await S.sendSheet(args(w, { provider: prov, ...over }));
  ok(`refused: ${name} (${reason}); nothing sent, nothing recorded`, !r.ok && r.reason === reason && prov.calls.length === 0 && (await w.st.sentOf("hagerty", w.sheet.id)) === null && (await w.st.getSheet("hagerty", w.sheet.id)).sending === false, r);
}
{ const w = await world({ pdfStored: false }), prov = recorder();
  const r = await S.sendSheet(args(w, { provider: prov, pdf: { name: "report.pdf", bytes: PDF } }));
  ok("a PDF handed in when none is stored is stored with the sheet and attached", r.ok && prov.calls[0].pdf.bytes.equals(PDF) && (await w.st.getSheet("hagerty", w.sheet.id)).pdf_path.startsWith(`hagerty/${w.sheet.id}/`)); }
{ const w = await world(), prov = recorder();
  const r = await S.sendSheet({ ...args(w, { provider: prov }), org: { id: "other", name: "Other Org" } });
  ok("another org cannot send this org's sheet", !r.ok && r.reason === "no_sheet" && prov.calls.length === 0, r); }

// ---- 4. automatic sending is off by default ----
{ const w = await world(), prov = recorder();
  const r1 = await S.sendSheet(args(w, { provider: prov, mode: "auto" })), r2 = await S.autoSend({ store: w.st, org: w.org, sheetId: w.sheet.id, provider: prov });
  ok("auto mode with the org's switch off: refused, nothing sent", !r1.ok && r1.reason === "auto_send_off" && !r2.ok && prov.calls.length === 0, [r1, r2]);
  ok("the switch defaults to off in the schema", /auto_send\s+boolean not null default false/.test(fs.readFileSync(path.join(root, "docs/supabase-desk-intake.sql"), "utf8"))); }
{ const w = await world({ orgPatch: { auto_send: true } }), prov = recorder();
  const r = await S.autoSend({ store: w.st, org: w.org, sheetId: w.sheet.id, provider: prov });
  const sent = await w.st.sentOf("hagerty", w.sheet.id);
  ok("auto mode with the switch on: sends the org's standard message to the consignor, marked auto, once", r.ok && prov.calls.length === 1 && sent.mode === "auto" && /^Thank you for your submission\. Our valuation is attached\./.test(sent.body_text) && prov.calls[0].to === "john@seller.example", r);
  const r2 = await S.autoSend({ store: w.st, org: w.org, sheetId: w.sheet.id, provider: prov });
  ok("...and a second automatic send of the same sheet sends nothing", !r2.ok && prov.calls.length === 1); }

// ---- 5. the Resend adapter: the org's own key, from the environment, never printed ----
{ const w = await world(), seen = []; const fetchFn = async (url, init) => { seen.push({ url, init }); return { ok: true, json: async () => ({ id: "re_real" }) }; };
  const out = await S.providers.resend({ org: w.org, from: "Hagerty Marketplace <marketplace@hagerty.example>", to: "john@seller.example", subject: "s", text: "t", html: "<p>t</p>", pdf: { name: "r.pdf", bytes: PDF }, idempotencyKey: "desk-send-1", env: { DESK_SEND_KEY_HAGERTY: "re_test_key" }, fetchFn });
  const body = JSON.parse(seen[0].init.body);
  ok("resend adapter: the org's own key, an idempotency key, from the org, the PDF as base64", out.ok && out.id === "re_real" && seen[0].url === "https://api.resend.com/emails" && seen[0].init.headers.Authorization === "Bearer re_test_key" && seen[0].init.headers["Idempotency-Key"] === "desk-send-1" && body.from.includes("marketplace@hagerty.example") && body.attachments[0].content === PDF.toString("base64"));
  const none = await S.providers.resend({ org: w.org, from: "x", to: "y", subject: "s", text: "t", html: "t", idempotencyKey: "k", env: { RESEND_API_KEY: "re_goasksam_key", DESK_SEND_KEY_OTHER: "re_other_org_key" }, fetchFn });
  ok("resend adapter: no key for the org means no send (never falls back to another org's key or ours)", !none.ok && none.reason === "no_provider_key" && seen.length === 1); }
{ const r = result(); console.log(`\nsendCheck: ${r.pass} pass, ${r.fail} FAIL`); process.exit(r.fail ? 1 : 0); }
