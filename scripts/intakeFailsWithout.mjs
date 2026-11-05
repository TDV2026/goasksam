// DESK INTAKE AND SEND: PROVE EACH CHECK CAN FAIL (Lane D, Nov 4 2026). Copies the tree to a throwaway folder, puts ONE realistic bug back at a time (the code the
// fix replaced), runs the check that owns that rule, and requires it to go red. A mutation whose check stays green means the check does not cover the rule: this
// script then fails. It never touches the working tree.
//   node scripts/intakeFailsWithout.mjs [--keep]
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { execFileSync, spawnSync } from "node:child_process"; import { fileURLToPath } from "node:url";
const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), "intake-mut-"));
for (const d of ["lib", "scripts", "docs", "api"]) fs.cpSync(path.join(here, d), path.join(tmp, d), { recursive: true, filter: s => !/proofs|node_modules/.test(s) && !/docs[\\/](screens|mockups|desk-mockups)/.test(s) });
fs.copyFileSync(path.join(here, "package.json"), path.join(tmp, "package.json"));
fs.symlinkSync(path.join(here, "node_modules"), path.join(tmp, "node_modules"));

const P = "lib/desk/intake/parse.js", R = "lib/desk/intake/run.js", I = "lib/desk/intake/images.js", S = "lib/desk/send.js", W = "lib/desk/intake/resendInbound.js", ST = "lib/desk/intake/store.js";
const PARSE = "intakeParseCheck", AUTH = "intakeAuthCheck", SEND = "sendCheck", SIGN = "signedWebhookCheck", H = "api/deskInbound.js", CARS = "carNamesCheck", CN = "lib/desk/intake/carName.js";
const M = [
  // ---- reading a submission ----
  [PARSE, "structure not checked: any 17 characters is a VIN", P, "  if (!vinStructureOk(v)) return { state: \"rejected\", makerUnknown: false, reason: \"structure\" };", ""],
  [PARSE, "a failing check digit drops the VIN (the reversed rule: European market VINs lost)", P, "return { state: vinCheckDigitOk(v) ? \"valid\" : \"check_digit_not_valid\", makerUnknown: !knownWmi(v) };", "return vinCheckDigitOk(v) ? { state: \"valid\", makerUnknown: !knownWmi(v) } : { state: \"rejected\", reason: \"check_digit\" };"],
  [PARSE, "an unknown maker code with a failing check digit is rejected (the maker list used as a gate)", P, "return { state: vinCheckDigitOk(v) ? \"valid\" : \"check_digit_not_valid\", makerUnknown: !knownWmi(v) };", "return !vinCheckDigitOk(v) && !knownWmi(v) ? { state: \"rejected\", makerUnknown: true, reason: \"unknown_wmi\" } : { state: vinCheckDigitOk(v) ? \"valid\" : \"check_digit_not_valid\", makerUnknown: !knownWmi(v) };"],
  [PARSE, "the maker-unknown marker is not set", P, "makerUnknown: !knownWmi(v) };", "makerUnknown: false };"],
  [PARSE, "a tried VIN with no decode and no car in the words becomes a New sheet", R, "const hasIdentity = !!(car || read.chassis || (read.vin && !triedOnly));", "const hasIdentity = !!(car || read.chassis || read.vin);"],
  [PARSE, "a failing check digit is not marked on the row", P, "vinCheckInvalid: !!(vins.valid[0] && vins.checkDigitNotValid.includes(vins.valid[0])),", "vinCheckInvalid: false,"],
  [PARSE, "consignor taken from the newest message, not the earliest", P, "for (let i = messages.length - 1; i >= 1; i--) {", "for (let i = 1; i < messages.length; i++) {"],
  [PARSE, "More VINs flag not kept", P, "moreVins: vins.valid.slice(1),", "moreVins: [],"],
  [PARSE, "chassis (pre 1981) not read", P, "const chassis = vins.valid.length ? null : findChassis(searchable);", "const chassis = null;"],
  [PARSE, "a later email on the same thread makes a second sheet", R, "if (!match && threadIds.length) {", "if (false) {"],
  [PARSE, "a later email with the same VIN makes a second sheet", R, "if (read.vin) { match = (await store.sheetsOfOrg(org.id, { vin: read.vin }))[0] || null; if (match) matchBy = \"vin\"; }", ""],
  [PARSE, "a mail with no car is dropped instead of becoming Needs the car", R, "const hasIdentity = !!(car || read.chassis || (read.vin && !triedOnly));", "const hasIdentity = !!(car || read.chassis || (read.vin && !triedOnly)); if (!hasIdentity) return finish(\"dropped_no_car\", { org_id: org.id });"],
  [PARSE, "HEIC is stored as sent, not converted", I, "if (isHeicBytes(input) || /heic|heif/i.test(contentType) || HEIC_EXT.test(filename)) {", "if (false) {"],
  [PARSE, "photos are not turned upright", I, "      .rotate()\n", "\n"],
  [PARSE, "photos are not resized", I, "withoutEnlargement: true", "withoutEnlargement: true, kernel: undefined, width: undefined"],
  [PARSE, "a share link is opened during intake", P, "const mileage = findMileage(text), links = findShareLinks(text);", "const mileage = findMileage(text), links = findShareLinks(text); for (const l of links) fetch(l).catch(() => {});"],
  [PARSE, "a finalised sheet takes the later email's photos", R, "export const LOCKED_STATUSES = [\"finalised\", \"sent\"];", "export const LOCKED_STATUSES = [];"],
  [PARSE, "the same photo is stored twice", R, "if (have.has(hash)) { summary.skippedDuplicate++; continue; }", ""],
  [PARSE, "the engine read is not started", R, "deps.startRead(sheet, car, read); }", "}"],
  [PARSE, "the original email is not kept", R, "await store.putObject(org.id, originalPath, rawBytes, \"message/rfc822\");", ""],
  // ---- who may send ----
  [AUTH, "anyone is accepted, not only a seat", R, "const seat = fromAddr ? seats.find(s => String(s.email || \"\").toLowerCase() === fromAddr.email) : null;", "const seat = fromAddr ? (seats.find(s => String(s.email || \"\").toLowerCase() === fromAddr.email) || { id: 0, email: fromAddr.email }) : null;"],
  [AUTH, "a seat of any org is accepted (not only this org)", R, "const seats = await store.seatsOf(org.id);", "const seats = (await store.seatsOf(org.id)).concat(await store.seatsOf(\"other\"));"],
  [AUTH, "the display name is read as the sender", P, "const am = (angle && ADDR.exec(angle[1])) || (angle ? null : ADDR.exec(raw));", "const am = ADDR.exec(raw);"],
  [AUTH, "failed mail authentication is accepted", R, "if (!auth.ok) return", "if (false) return"],
  [AUTH, "a repeated delivery is processed again", R, "if (!claim.claimed) return { outcome: \"duplicate\", row: claim.row && claim.row.outcome };", ""],
  [AUTH, "a dropped mail is not logged", R, "const finish = async (outcome, extra = {}) => { await store.setLog(emailId, { outcome, ...extra }).catch(() => {}); return { outcome, ...extra }; };", "const finish = async (outcome, extra = {}) => ({ outcome, ...extra });"],
  [AUTH, "the webhook timestamp is not checked (replay)", W, "Math.abs(nowMs / 1000 - t) > WEBHOOK_TOLERANCE_S", "false"],
  [AUTH, "the webhook signature is not compared", W, "if (got.length === want.length && crypto.timingSafeEqual(got, want)) return { ok: true };", "return { ok: true };"],
  // ---- the signed webhook (a genuine Resend delivery refused as "bad signature") ----
  [SIGN, "the signed content is built from a re-stringified body", W, "toBytes(raw)])).digest();", "Buffer.from(JSON.stringify(JSON.parse(Buffer.isBuffer(raw) ? raw.toString(\"utf8\") : raw)))])).digest();"],
  [SIGN, "the body is decoded as latin1 instead of kept as bytes", W, "const toBytes = raw => Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw == null ? \"\" : raw), \"utf8\");", "const toBytes = raw => Buffer.from(Buffer.isBuffer(raw) ? raw.toString(\"latin1\") : String(raw == null ? \"\" : raw), \"utf8\");"],
  [SIGN, "the secret is not cleaned (quotes, space and newline break it)", W, "  let s = String(secret == null ? \"\" : secret).trim();\n  s = s.replace(/^[\"'`]+|[\"'`]+$/g, \"\").trim();\n  return s.replace(/^whsec_/i, \"\").trim();", "  return String(secret == null ? \"\" : secret).replace(/^whsec_/, \"\");"],
  [SIGN, "the secret without the whsec_ prefix is refused", W, "  return s.replace(/^whsec_/i, \"\").trim();", "  if (!/^whsec_/.test(s)) return \"\";\n  return s.slice(6);"],
  [SIGN, "only the first entry of the signature header is tried", W, "for (const part of sig.split(/\\s+/)) {", "for (const part of sig.split(/\\s+/).slice(0, 1)) {"],
  [SIGN, "the five minute tolerance is gone (a late delivery or retry is refused)", W, "export const WEBHOOK_TOLERANCE_S = 300;", "export const WEBHOOK_TOLERANCE_S = 0;"],
  [SIGN, "every refusal is a bare message with no reason code", H, "return res.status(401).json({ error: \"bad signature\", reason: v.reason, body: from });", "return res.status(401).json({ error: \"bad signature\" });"],
  [SIGN, "the log line prints the signature header", H, "console.warn(`deskInbound rejected: reason=${v.reason} body=${from} bytes=${raw.length}`);", "console.warn(`deskInbound rejected: reason=${v.reason} sig=${req.headers[\"svix-signature\"]}`);"],
  [SIGN, "the route reads each chunk as text (a multi byte character split across chunks is corrupted)", H, "if (chunks.length) return { raw: Buffer.concat(chunks), from: \"stream\" };", "if (chunks.length) return { raw: Buffer.from(chunks.map(c => c.toString(\"utf8\")).join(\"\"), \"utf8\"), from: \"stream\" };"],
  [SIGN, "the route leaves the body parser on", H, "export const config = { api: { bodyParser: false } };", "export const config = { api: { bodyParser: true } };"],
  // ---- the car's plain name on the sheet (M3Ci) ----
  [CARS, "the sheet label is the decoder's words joined (the original M3Ci bug)", R, "export const labelOf = c => carLabel(c);", "export const labelOf = c => c ? [c.year, c.make, c.model, c.trim].filter(Boolean).join(\" \") : null;"],
  [CARS, "the decode wording is not cleaned and nothing downstream repairs it", [[R, "plainCar({ year: y, make, model, trim: trim || null, body: String(row.BodyClass || \"\").trim() || null })", "{ year: y, make, model, trim: trim || null, body: String(row.BodyClass || \"\").trim() || null }"], [R, "car = plainCar(v ?", "car = (v ?"], [R, "source: \"vin\" });\n      } else decodeNote", "source: \"vin\" });\n      } else decodeNote"], [CN, "export function carLabel(c) {\n  if (!c) return null;\n  const p = plainCar(c);", "export function carLabel(c) {\n  if (!c) return null;\n  const p = c;"]]],
  [CARS, "BMW M suffix (M3Ci) is kept in the model", CN, "if (m && /^bmw$/i.test(make)) model = m[1].toUpperCase();", ""],
  [CARS, "the body name is left off the label", CN, "return [...parts, body].filter(Boolean).join(\" \");", "return parts.join(\" \");"],
  [CARS, "Porsche trim codes (C2S, TT) are shown as they came", CN, "if (PORSCHE_TRIM_CODES[k]) trim = PORSCHE_TRIM_CODES[k];", ""],
  [CARS, "a filler trim (Base) is shown", CN, "if (trim && FILLER_TRIM.test(trim)) trim = null;", ""],
  [CARS, "the make is left shouting (HONDA)", CN, "const make = prettyMake(c.make);", "const make = String(c.make || \"\").trim();"],
  [AUTH, "a sheet query is not scoped to the org (production store)", ST, "let p = `${S}?org_id=eq.${q(orgId)}&select=*&order=created_at.desc&limit=50`;", "let p = `${S}?select=*&order=created_at.desc&limit=50`;"],
  [AUTH, "a path in another org's folder is accepted by the storage layer", "lib/desk/storage.js", "return validOrg(org) && typeof path === \"string\" && path.startsWith(org + \"/\")", "return validOrg(org) && typeof path === \"string\" && true"],
  // ---- send ----
  [SEND, "a sent sheet can be sent again (no status check, no claim, no unique copy)", S, "if (sheet.status === \"sent\") return refuse(\"already_sent\", \"This sheet has already been sent.\", { sentAt: sheet.sent_at, sentTo: sheet.sent_to });\n  if (sheet.status !== \"finalised\") return refuse(\"not_finalised\", \"Only a finalised sheet can be sent.\");", ""],
  [SEND, "all three locks gone (status check, claim, unique copy): a second press sends again", S,
    [["if (sheet.status === \"sent\") return refuse(\"already_sent\", \"This sheet has already been sent.\", { sentAt: sheet.sent_at, sentTo: sheet.sent_to });\n  if (sheet.status !== \"finalised\") return refuse(\"not_finalised\", \"Only a finalised sheet can be sent.\");", ""],
     ["if (!claimed) return refuse(\"already_sending\", \"This sheet is being sent, or was just sent.\");", ""],
     ["return refuse(\"already_sent\", \"A copy of this sheet's email already exists; it was sent.\");", "/* ignored */"],
     ["await release(); return refuse(\"copy_not_stored\", \"The copy could not be stored, so nothing was sent.\");", ""]]],
  [SEND, "claim and unique copy gone: five presses at once all send", S,
    [["if (!claimed) return refuse(\"already_sending\", \"This sheet is being sent, or was just sent.\");", ""],
     ["return refuse(\"already_sent\", \"A copy of this sheet's email already exists; it was sent.\");", "/* ignored */"],
     ["await release(); return refuse(\"copy_not_stored\", \"The copy could not be stored, so nothing was sent.\");", ""]]],
  [SEND, "the copy of the email is not stored", S, "await store.insertSent({", "(async () => ({}))({"],
  [SEND, "the sheet does not move to Sent", S, "{ status: \"sent\", sent_at: at, sent_to: addr, sent_provider_id: out.id || null, sending: false }", "{ sent_provider_id: null, sending: false }"],
  [SEND, "a provider refusal is treated as sent", S, "if (!out || !out.ok) {", "if (false) {"],
  [SEND, "a failure after the provider accepted releases the claim (a retry sends again)", S, "if (wentOut) return { ok: true, sentAt: stamped, to: addr, from: settings.sending_address, subject: subj, mode, warning: \"sent_status_not_saved\" };", ""],
  [SEND, "automatic sending is on whatever the org says", S, "if (mode === \"auto\" && !settings.auto_send) return", "if (false) return"],
  [SEND, "automatic sending defaults to on", "docs/supabase-desk-storage.sql", "auto_send                    boolean not null default false", "auto_send                    boolean not null default true"],
  [SEND, "any seat can send any seat's sheet", S, "if (mode === \"manual\" && !(seat && seat.id != null && sheet.seat_id === seat.id)) return", "if (false) return"],
  [SEND, "an unverified sending address sends anyway", S, "if (!sendingReady(settings)) return", "if (false) return"],
  [SEND, "the expert's address goes out as the sender", S, "const from = `${nameOf(org, settings)} <${settings.sending_address}>`;", "const from = `${seat && seat.email} <${seat && seat.email}>`;"],
  [SEND, "the PDF on a sheet can be replaced", S, "return refuse(\"pdf_immutable\", \"This sheet already has a report PDF; it cannot be replaced.\");", ""],
  [SEND, "no idempotency key on the provider call", S, "idempotencyKey: `desk-send-${sheetId}`", "idempotencyKey: undefined"],
  [SEND, "an address outside the verified domain is sent from (verification not consulted)", S, "if (!sendingReady(settings)) return refuse(", "if (false) return refuse("],
  [SEND, "the sent log is edited after the send (Lane S's table refuses edits)", S, "const moved = await store.patchSheet(", "await store.patchSent(org.id, sheetId, { provider_message_id: out.id || null }); const moved = await store.patchSheet("],
];
let bad = 0, n = 0;
const run = chk => spawnSync(process.execPath, [path.join(tmp, "scripts", chk + ".mjs"), tmp], { encoding: "utf8", env: { ...process.env, SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "" } });
for (const c of [PARSE, AUTH, SEND]) { const r = run(c); const out = r.stdout.split("\n").filter(l => /^FAIL/.test(l)); console.log(`${r.status === 0 ? "PASS" : "FAIL"}  baseline: ${c} is green on the real tree`); if (r.status !== 0) { bad++; console.log(out.join("\n")); } }
for (const [chk, name, file, find, repl] of M) {
  n++;
  // one edit [find, repl] in one file, several in one file [[find, repl], ...], or several files [[file, find, repl], ...] (when one bug lives in more than one place)
  const list = Array.isArray(file) ? file : [[file, ...(Array.isArray(find) ? [find] : [find, repl])]];
  const trip = list.flatMap(e => Array.isArray(e[1]) ? e[1].map(x => [e[0], x[0], x[1]]) : [[e[0], e[1], e[2]]]);
  const origs = new Map(trip.map(([fl]) => [fl, fs.readFileSync(path.join(tmp, fl), "utf8")]));
  const missing = trip.find(([fl, a]) => !origs.get(fl).includes(a));
  if (missing) { bad++; console.log(`FAIL  [${chk}] ${name}: the code to remove is not in ${missing[0]} (update this script)`); continue; }
  for (const [fl] of trip) origs.set("w:" + fl, origs.get(fl));
  const cur = new Map(origs); for (const [fl, a, b2] of trip) cur.set(fl, cur.get(fl).replace(a, () => b2));
  for (const [fl] of trip) fs.writeFileSync(path.join(tmp, fl), cur.get(fl));
  const r = run(chk), failed = (r.stdout.match(/^FAIL/gm) || []).length;
  for (const [fl] of trip) fs.writeFileSync(path.join(tmp, fl), origs.get(fl));
  const red = r.status !== 0 && (failed > 0 || /Error/.test(r.stderr));
  if (!red) bad++;
  console.log(`${red ? "PASS" : "FAIL"}  [${chk}] without the fix (${name}): ${red ? `red, ${failed || "crash"} ${failed ? "checks fail" : ""}` : "STAYED GREEN: the check does not cover this rule"}`);
}
console.log(`\n${n} mutations, ${bad} not caught`);
if (!process.argv.includes("--keep")) fs.rmSync(tmp, { recursive: true, force: true });
process.exit(bad ? 1 : 0);
