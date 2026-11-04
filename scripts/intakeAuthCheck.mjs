// DESK INTAKE: WHO MAY SEND TO AN ORG'S ADDRESS (Lane D, Nov 4 2026; spec: "Accept only from a seat of the org"). Offline.
// A mail from anyone who is not a seat of THAT org is dropped and logged (who, to which address, when) and makes no sheet, no file, no read. The class:
// every way a sender can look like a seat without being one (a display name holding a seat's address, an address quoted in the chain, a seat of ANOTHER org,
// a different letter case, a failed mail authentication) and every way a tenant could see another's rows (the same VIN in two orgs).
//   node scripts/intakeAuthCheck.mjs [repo root]   (a tree without the fix fails: scripts/intakeFailsWithout.mjs)
import path from "node:path"; import crypto from "node:crypto"; import { fileURLToPath } from "node:url";
import { loadKit, reporter } from "./deskIntakeKit.mjs";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root); process.env.SUPABASE_URL = ""; process.env.SUPABASE_SERVICE_ROLE_KEY = "";
const { ok, result } = reporter();
const K = await loadKit(root);
const { processInbound } = K.run;
const VIN = K.makeVin("WP0AB299", "8S745123");
const body = `2008 Porsche 911 Carrera S, VIN ${VIN}. 20,000 miles.`;
const att = [K.att("a.jpg", "image/jpeg", K.fx("big.jpg"))];
const objectsOf = st => st._state.objects.size, sheetsOf = st => st._state.sheets.length, filesN = (st, id) => st._state.photos.concat(st._state.documents).filter(f => !id || f.sheet_id === id).length;

async function dropped(name, mail, outcome, extraOk) {
  const { st, deps, reads } = K.fresh();
  const r = await processInbound(mail, deps);
  const log = st._state.log.get(mail.emailId);
  ok(`${name}: dropped (${outcome})`, r.outcome === outcome && sheetsOf(st) === 0 && objectsOf(st) === 0 && filesN(st) === 0 && reads.length === 0, { r, sheets: sheetsOf(st), objects: objectsOf(st) });
  ok(`${name}: logged with sender, address and time`, log && log.outcome === outcome && /@/.test(log.from_address || "") && log.to_address && log.detail && log.detail.at === "2026-11-04T12:00:00.000Z" || (outcome === "dropped_unknown_org" && log && log.detail && Array.isArray(log.detail.to)), log);
  if (extraOk) extraOk(log);
}
await dropped("a stranger", K.mail({ from: "mallory@evil.example", subject: "x", text: body, attachments: att }), "dropped_not_seat", log => ok("  the log names the sender", log.detail.from === "mallory@evil.example", log.detail));
await dropped("a seat of ANOTHER org writing to this org's address", K.mail({ from: "zed@other.example", subject: "x", text: body }), "dropped_not_seat");
await dropped("a display name holding a seat's address", K.mail({ from: '"ann@hagerty.example" <evil@elsewhere.example>', subject: "x", text: body }), "dropped_not_seat", log => ok("  the sender is read from the angle brackets", log.detail.from === "evil@elsewhere.example", log.detail));
await dropped("a seat's address only quoted inside the forwarded text", K.mail({ from: "mallory@evil.example", subject: "Fwd: x", text: `From: ann@hagerty.example\nSubject: car\nTo: x\n\n${body}` }), "dropped_not_seat");
await dropped("a seat whose mail failed authentication (spf, dkim, dmarc all fail)", K.mail({ from: "ann@hagerty.example", subject: "x", text: body, authentication: { spf: "fail", dkim: "fail", dmarc: "fail" } }), "dropped_unauthenticated");
await dropped("an address that belongs to no org", K.mail({ from: "ann@hagerty.example", to: ["nobody@desk.goasksam.com"], subject: "x", text: body }), "dropped_unknown_org");
await dropped("an address on another domain", K.mail({ from: "ann@hagerty.example", to: ["hagerty@evil.example"], subject: "x", text: body }), "dropped_unknown_org");

// seats pass: any case, a display name, and mail whose authentication is not reported
for (const [name, from, authentication] of [["a seat", "ann@hagerty.example"], ["a seat in capitals", "ANN@Hagerty.Example"], ["a seat with a display name", "Ann Lee <ann@hagerty.example>"], ["a seat, authentication not reported", "ann@hagerty.example", null], ["a seat, one of three verdicts passing", "ann@hagerty.example", { spf: "none", dkim: "pass", dmarc: "none" }]]) {
  const { st, deps } = K.fresh();
  const r = await processInbound(K.mail({ from, subject: "x", text: body, authentication }), deps);
  ok(`${name}: accepted, the sheet is owned by that seat`, r.outcome === "created" && st._state.sheets[0].seat_email === "ann@hagerty.example" && st._state.sheets[0].seat_id === 1, r);
}

// tenant isolation
{ const { st, deps } = K.fresh();
  await processInbound(K.mail({ id: "h1", from: "ann@hagerty.example", subject: "Fwd: x", text: body }), deps);
  const r = await processInbound(K.mail({ id: "o1", from: "zed@other.example", to: ["other@desk.goasksam.com"], subject: "Fwd: x", text: body, attachments: att }), deps);
  const [a, b] = st._state.sheets;
  ok("the same VIN sent to two orgs is two sheets, each in its own org", r.outcome === "created" && a.org_id === "hagerty" && b.org_id === "other" && a.id !== b.id);
  ok("the second org's files are under the second org only; the first org's sheet got nothing", filesN(st, b.id) >= 1 && filesN(st, a.id) === 0 && [...st._state.objects.keys()].every(p => p.startsWith("hagerty/") || p.startsWith("other/")) && st._state.photos.concat(st._state.documents).filter(f => f.sheet_id === b.id).every(f => f.org_id === "other"));
  ok("another org's seat reading this org's sheets by id gets nothing", (await st.getSheet("other", a.id)) === null && (await st.sheetsOfOrg("other", { vin: VIN })).every(s => s.org_id === "other")); }

// a repeated delivery of the same email (the provider retries) changes nothing
{ const { st, deps } = K.fresh();
  const m = K.mail({ id: "dup1", from: "ann@hagerty.example", subject: "x", text: body, attachments: att });
  await processInbound(m, deps); const again = await processInbound(m, deps);
  ok("the same email delivered twice makes one sheet and one set of files", again.outcome === "duplicate" && sheetsOf(st) === 1 && filesN(st) === 1, again); }

// the webhook itself: signed, fresh
{ const { verifyWebhook, signWebhook } = await K.imp("lib/desk/intake/resendInbound.js");
  const secret = "whsec_" + crypto.randomBytes(24).toString("base64"), raw = JSON.stringify({ type: "email.received", data: { email_id: "abc" } }), ts = String(Math.floor(Date.now() / 1000));
  const sign = (r, id, t, s) => ({ "svix-id": id, "svix-timestamp": t, "svix-signature": signWebhook(r, id, t, s) });
  ok("webhook: a correctly signed, fresh event is accepted", verifyWebhook(raw, sign(raw, "msg_1", ts, secret), secret).ok);
  ok("webhook: a changed body is refused", !verifyWebhook(raw + " ", sign(raw, "msg_1", ts, secret), secret).ok);
  ok("webhook: another secret is refused", !verifyWebhook(raw, sign(raw, "msg_1", ts, "whsec_" + crypto.randomBytes(24).toString("base64")), secret).ok);
  ok("webhook: an event older than five minutes is refused", !verifyWebhook(raw, sign(raw, "msg_1", String(Number(ts) - 900), secret), secret).ok);
  ok("webhook: no secret set, or no signature, is refused", !verifyWebhook(raw, sign(raw, "msg_1", ts, secret), "").ok && !verifyWebhook(raw, {}, secret).ok); }

// the PRODUCTION store (not the memory twin): every sheet, file, copy and seat query carries the org, so one org can never read or write another's rows
{ const { supabaseStore } = await K.imp("lib/desk/intake/store.js");
  const urls = []; const realFetch = globalThis.fetch;
  globalThis.fetch = async (u, init = {}) => { urls.push({ url: String(u), method: init.method || "GET", body: init.body && typeof init.body === "string" ? init.body : "" }); return { ok: true, status: 200, text: async () => "[]", json: async () => [], arrayBuffer: async () => new ArrayBuffer(0) }; };
  const st = supabaseStore({ supabaseUrl: "https://db.example", supabaseKey: "test-service-key" });
  const SID = "11111111-1111-4111-8111-111111111111";
  const calls = { seatsOf: () => st.seatsOf("hagerty"), settingsOf: () => st.settingsOf("hagerty"), sheetsOfOrg: () => st.sheetsOfOrg("hagerty", { vin: VIN, threadIds: ["a@b"], subjectKey: "x", consignorEmail: "j@x.example" }), getSheet: () => st.getSheet("hagerty", SID), patchSheet: () => st.patchSheet("hagerty", SID, { status: "in_progress" }), patchSheetIf: () => st.patchSheetIf("hagerty", SID, { status: "finalised", sending: false }, { sending: true }), filesOf: () => st.filesOf("hagerty", SID), fileHashes: () => st.fileHashes("hagerty", SID), sentOf: () => st.sentOf("hagerty", SID), deleteSent: () => st.deleteSent("hagerty", SID) };
  for (const [name, fn] of Object.entries(calls)) { urls.length = 0; await fn().catch(() => {}); ok(`production store ${name}: the query carries this org's id`, urls.length >= 1 && urls.every(c => /[?&]org_id=eq\.hagerty(&|$)/.test(c.url)), urls.map(c => c.url)); }
  urls.length = 0; await st.createSheet({ org_id: "hagerty", status: "new", seat_id: 1 }).catch(() => {}); await st.insertSent({ org_id: "hagerty", sheet_id: SID, seat_id: 1 }).catch(() => {});
  ok("production store: inserts carry the org in the row", urls.length === 2 && urls.every(c => JSON.parse(c.body)[0].org_id === "hagerty"), urls);
  urls.length = 0; await st.putObject("hagerty", `hagerty/${SID}/web/a b.jpg`.replace("a b", "22222222-2222-4222-8222-222222222222"), Buffer.from("x"), "image/jpeg").catch(() => {});
  ok("production store: files go to the org's own private bucket under the org's folder", urls.length === 1 && urls[0].url === `https://db.example/storage/v1/object/desk-hagerty/hagerty/${SID}/web/22222222-2222-4222-8222-222222222222.jpg`, urls);
  urls.length = 0; const wrong = await st.putObject("other", `hagerty/${SID}/web/x.jpg`, Buffer.from("x"), "image/jpeg").then(() => "wrote", () => "refused");
  ok("production store: a path in another org's folder is refused, nothing is sent", wrong === "refused" && urls.length === 0, urls);
  globalThis.fetch = realFetch; }
{ const r = result(); console.log(`\nintakeAuthCheck: ${r.pass} pass, ${r.fail} FAIL`); process.exit(r.fail ? 1 : 0); }
