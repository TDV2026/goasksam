// DESK INTAKE: one inbound email in, one queue row out (Lane D, Nov 2026; docs/desk-valuations-spec.md "Intake by email").
//
//   claim the email -> org from the address -> sender must be a seat of THAT org (and authenticated) -> read the submission (VIN with check digit, chassis,
//   car words, mileage, gearbox, colour, share links, consignor from the EARLIEST message) -> match an existing sheet (same VIN, or same thread) or create
//   one owned by the forwarding seat -> keep the original email -> photos (HEIC converted, resized, upright; originals kept) and documents -> start the
//   engine read in the background.
//
// Never dropped silently: an email from a non seat is logged (who, to which org, when) and no row is made; an email that is a seat's but names no car
// becomes a "Needs the car" row. Nothing here computes a figure; the engine read is stored as the engine returned it. No link is ever fetched.
import crypto from "node:crypto";
import { syncSheet } from "./toSheet.js";
import { attachCase, mergeIntoCase } from "./toCase.js";
import { plainCar, carLabel } from "./carName.js";
import { readSubmission, threadIdsOf, subjectKey, parseAddress } from "./parse.js";
import { attachmentKind, resizeUpright, safeFilename, sniffType, MIN_PHOTO_EDGE, MAX_ATTACHMENTS, MAX_FILE_BYTES } from "./images.js";
import { objectPath, } from "./store.js";
import { PHOTO_ORIGINAL_TYPES, DOCUMENT_TYPES } from "../storage.js";

export const INBOUND_DOMAIN = () => String(process.env.DESK_INBOUND_DOMAIN || "desk.goasksam.com").toLowerCase();
export const LOCKED_STATUSES = ["finalised", "sent"];   // desk_sheets.status (lib/desk/storage schema): new, in_progress, finalised, sent, needs_car

const sha = b => crypto.createHash("sha256").update(b).digest("hex");
export function htmlToText(html) {
  return String(html || "").replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|tr|li|h\d|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ").replace(/\n[ \t]+/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ---- who sent it: the sender must be a seat of the org the address belongs to ----
export function localPartFor(toList, domain = INBOUND_DOMAIN()) {
  for (const t of toList || []) {
    const a = parseAddress(t); if (!a) continue;
    const [local, host] = a.email.split("@");
    if (host === domain) return { local, address: a.email };
  }
  return null;
}
// Resend reports spf, dkim and dmarc for the received mail. Pass = any one says pass. Not reported (an older mail) = accepted and said so on the row.
export function authVerdict(authentication) {
  if (!authentication || typeof authentication !== "object") return { ok: true, state: "not_reported" };
  const read = v => String(v && typeof v === "object" ? (v.result || v.status || v.verdict || v.value || "") : v || "").toLowerCase();
  const got = { spf: read(authentication.spf), dkim: read(authentication.dkim), dmarc: read(authentication.dmarc) };
  if (!got.spf && !got.dkim && !got.dmarc) return { ok: true, state: "not_reported", got };
  return Object.values(got).some(v => v === "pass") ? { ok: true, state: "pass", got } : { ok: false, state: "fail", got };
}

// ---- the car: VIN decode, or the words typed ----
export async function decodeVinPublic(vin) {
  try {
    const r = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const row = ((await r.json()).Results || [])[0] || {};
    const y = Number(row.ModelYear), make = String(row.Make || "").trim(), model = String(row.Model || "").trim(), trim = String(row.Trim || "").trim();
    // the decoder's own words are cleaned here (carName.js): "M3Ci" is the model M3, the body class is a body name
    return y > 1900 && make && model ? plainCar({ year: y, make, model, trim: trim || null, body: String(row.BodyClass || "").trim() || null }) : null;
  } catch { return null; }
}
export async function resolveCarWords(phrases, deps) {
  for (const p of phrases || []) {
    let r = null; try { r = await deps.resolveVehicle(p, {}); } catch { r = null; }
    const v = r && r.vehicle;
    // product rule 6: a typo never goes through unconfirmed; only a plain read with year, make and model is taken as the car
    if (r && r.status === "valid" && v && v.year && v.make && v.model) return { year: Number(v.year), make: v.make, model: v.model, trim: v.trim || null, bodyStyle: v.bodyStyle || null, source: "typed", phrase: p };
  }
  return null;
}
export const labelOf = c => carLabel(c);

// THE CAR AN EMAIL NAMES: the VIN's decode, else the words typed (shared by the webhook and the Re-read action).
export async function carOfRead(read, deps) {
  let car = null, decodeNote = null;
  if (read.vin) {
    const dec = deps.decodeVin ? await Promise.resolve(deps.decodeVin(read.vin)).catch(() => null) : null;
    if (dec) {
      const r = await deps.resolveVehicle([dec.year, dec.make, dec.model, dec.trim].filter(Boolean).join(" "), {}).catch(() => null);
      const v = r && r.status === "valid" && r.vehicle && r.vehicle.make && r.vehicle.model ? r.vehicle : null;
      car = plainCar(v ? { year: Number(v.year) || dec.year, make: v.make, model: v.model, trim: v.trim || dec.trim, bodyStyle: dec.body || v.bodyStyle, source: "vin" } : { year: dec.year, make: dec.make, model: dec.model, trim: dec.trim, bodyStyle: dec.body, source: "vin" });
    } else decodeNote = "vin_not_decoded";
  }
  if (!car) car = await resolveCarWords(read.carPhrases, deps);
  return { car, decodeNote };
}

// THE ONE READER OF AN EMAIL'S WORDS (Lane D, Nov 13 2026): the webhook reads a new email with it, and the "Re-read the email" action reads the stored .eml with it, so an old lead is read by the parser of today and never by a copy of it.
// mail: { subject, text, html, attachments[] }; internal: the addresses that are ours (never the seller). Returns { text, attachments (the mail's own plus the forwarded emails' attachments), read (lib/desk/intake/parse.js readSubmission) }.
export async function submissionOf(mail, deps, internal = []) {
  let text = String(mail.text || "").trim() || htmlToText(mail.html);
  const attachments = [...(mail.attachments || [])], extraText = [], inner = [];
  for (const a of attachments) {
    if (attachmentKind({ filename: a.filename, contentType: a.contentType }) !== "email" || !deps.simpleParser) continue;
    try {
      const buf = await a.load(); const p = await deps.simpleParser(buf);
      extraText.push(`---------- Forwarded message ---------\nFrom: ${p.from && p.from.text || ""}\nDate: ${p.date ? p.date.toUTCString() : ""}\nSubject: ${p.subject || ""}\nTo: ${p.to && p.to.text || ""}\n\n${p.text || htmlToText(p.html || "")}`);
      for (const ia of p.attachments || []) inner.push({ filename: ia.filename, contentType: ia.contentType, size: ia.size, load: async () => ia.content });
    } catch { /* an unreadable attachment is kept as a document below */ }
  }
  attachments.push(...inner);
  const read = readSubmission({ subject: mail.subject, body: text, internalEmails: internal, extraText: extraText.join("\n\n") });
  return { text, attachments, read };
}

// mail: { emailId, from, to[], subject, text, html, headers{}, authentication, messageId, raw:()=>Promise<Buffer>|Buffer|null, attachments:[{filename, contentType, size, load:()=>Promise<Buffer>}] }
// deps: { store, resolveVehicle, decodeVin, simpleParser, startRead(sheet,car)->Promise, now }
export async function processInbound(mail, deps) {
  const store = deps.store, now = deps.now || (() => new Date().toISOString());
  const emailId = String(mail.emailId || "").trim();
  if (!emailId) return { outcome: "error", reason: "no_email_id" };
  const fromAddr = parseAddress(Array.isArray(mail.from) ? mail.from[0] : mail.from);
  const to = Array.isArray(mail.to) ? mail.to : [mail.to].filter(Boolean);
  const claim = await store.claim(emailId, { from_address: fromAddr ? fromAddr.email : String(mail.from || "").slice(0, 200), to_address: to.join(", ").slice(0, 300), subject: String(mail.subject || "").slice(0, 300) });
  if (!claim.claimed) return { outcome: "duplicate", row: claim.row && claim.row.outcome };
  const finish = async (outcome, extra = {}) => { await store.setLog(emailId, { outcome, ...extra }).catch(() => {}); return { outcome, ...extra }; };

  try {
    const target = localPartFor(to);
    const org = target ? await store.orgByInbound(target.local) : null;
    if (!org) return finish("dropped_unknown_org", { detail: { to } });

    const seats = await store.seatsOf(org.id);
    const seat = fromAddr ? seats.find(s => String(s.email || "").toLowerCase() === fromAddr.email) : null;
    if (!seat) return finish("dropped_not_seat", { org_id: org.id, detail: { from: fromAddr && fromAddr.email, to: target.address, at: now() } });
    const auth = authVerdict(mail.authentication);
    if (!auth.ok) return finish("dropped_unauthenticated", { org_id: org.id, detail: { from: fromAddr.email, auth: auth.got, at: now() } });

    // ---- the submission: the email, plus any forwarded-as-attachment email read whole (submissionOf, the one reader the Re-read action also takes) ----
    const settings = await store.settingsOf(org.id);
    const internal = [...seats.map(s => s.email), target.address, settings && settings.sending_address].filter(Boolean);
    const { text, attachments, read } = await submissionOf(mail, deps, internal);

    // ---- the car ----
    const { car, decodeNote } = await carOfRead(read, deps);
    // a VIN that is both check-digit-invalid and maker-unknown is only TRIED as the car: with no decode and no car in the words the row is Needs the car, the string shown
    const triedOnly = !!(read.vin && read.vinCheckInvalid && read.vinMakerUnknown);
    const hasIdentity = !!(car || read.chassis || (read.vin && !triedOnly));

    // ---- an existing sheet? same VIN, else same thread (message ids, or same subject from the same consignor) ----
    const threadIds = threadIdsOf(mail.headers || {}), sKey = subjectKey(mail.subject);
    let match = null, matchBy = null;
    if (read.vin) { match = (await store.sheetsOfOrg(org.id, { vin: read.vin }))[0] || null; if (match) matchBy = "vin"; }
    if (!match && threadIds.length) {
      const cands = await store.sheetsOfOrg(org.id, { threadIds });
      match = cands.find(s => !read.vin || !s.vin || s.vin === read.vin) || null; if (match) matchBy = "thread";
    }
    if (!match && sKey && read.consignor) {
      const cands = await store.sheetsOfOrg(org.id, { subjectKey: sKey, consignorEmail: read.consignor.email });
      match = cands.find(s => !read.vin || !s.vin || s.vin === read.vin) || null; if (match) matchBy = "subject";
    }

    const raw = typeof mail.raw === "function" ? await mail.raw().catch(() => null) : mail.raw || null;
    const rawBytes = raw ? Buffer.from(raw) : Buffer.from(`From: ${mail.from}\nTo: ${to.join(", ")}\nSubject: ${mail.subject}\nDate: ${now()}\n\n${text}`);

    // ---- the row ----
    let sheet, created = false, addedTo = false;
    const facts = {
      vin: read.vin, vin_check_invalid: read.vinCheckInvalid, vin_maker_unknown: read.vinMakerUnknown, chassis: read.chassis, no_vin: read.noVin, more_vins: read.moreVins, vin_failed_check: read.vinFailedCheck,
      mileage: read.mileage ? read.mileage.miles : null, mileage_basis: read.mileage ? read.mileage.basis : null, gearbox: read.gearbox, colour: read.colour,
      consignor_name: read.consignor ? read.consignor.name : null, consignor_email: read.consignor ? read.consignor.email : null, links: read.links
    };
    if (match && !LOCKED_STATUSES.includes(match.status)) {
      // a later email: photos and anything newly stated are added to the existing sheet; nothing already on it is overwritten
      const fill = {};
      for (const k of ["mileage", "mileage_basis", "gearbox", "colour", "consignor_name", "consignor_email", "chassis"]) if (match[k] == null && facts[k] != null) fill[k] = facts[k];
      if (!match.vin && facts.vin) { fill.vin = facts.vin; fill.no_vin = false; fill.vin_check_invalid = facts.vin_check_invalid; fill.vin_maker_unknown = facts.vin_maker_unknown; }
      if (car && !match.make) Object.assign(fill, { year: car.year, make: car.make, model: car.model, trim: car.trim, car_label: labelOf(car) });
      const moreVins = [...new Set([...(match.more_vins || []), ...facts.more_vins.filter(v => v !== (match.vin || fill.vin))])];
      if (moreVins.length !== (match.more_vins || []).length) fill.more_vins = moreVins;
      fill.thread_ids = [...new Set([...(match.thread_ids || []), ...threadIds])];
      fill.inbound_email_ids = [...new Set([...(match.inbound_email_ids || []), emailId])];
      const linkSet = [...new Set([...(match.links || []), ...facts.links])]; if (linkSet.length !== (match.links || []).length) fill.links = linkSet;
      const triedOnlyVin = (vin, chk, mk) => !vin || (chk && mk);   // a VIN that is only being tried is not a car
      if (match.status === "needs_car" && (fill.make || match.make || fill.chassis || match.chassis || !triedOnlyVin(fill.vin || match.vin, fill.vin ? fill.vin_check_invalid : match.vin_check_invalid, fill.vin ? fill.vin_maker_unknown : match.vin_maker_unknown))) fill.status = "new";
      sheet = (await store.patchSheet(org.id, match.id, fill)) || match; addedTo = true;
    } else {
      sheet = await store.createSheet({
        org_id: org.id, seat_id: seat.id, seat_email: fromAddr.email, status: hasIdentity ? "new" : "needs_car", source: "email",
        car_label: labelOf(car), year: car && car.year || null, make: car && car.make || null, model: car && car.model || null, trim: car && car.trim || null,
        ...facts, vin_norm: facts.vin ? facts.vin.toUpperCase() : null, subject: String(mail.subject || "").slice(0, 300), subject_key: sKey, thread_key: threadIds[0] || sKey || null, thread_ids: threadIds, inbound_email_ids: [emailId],
        supersedes_sheet_id: match ? match.id : null, engine_status: null
      });
      created = true;
    }

    // ---- the first email of a sheet, kept whole (the file at source_email_path) ----
    if (created) {
      const originalPath = objectPath(org.id, sheet.id, "mail", crypto.randomUUID(), "eml");
      await store.putObject(org.id, originalPath, rawBytes, "message/rfc822");
      sheet = (await store.patchSheet(org.id, sheet.id, { source_email_path: originalPath })) || sheet;
    }

    // ---- attachments: photos to desk_sheet_photos (original kept, upright resized copy used), documents to desk_sheet_documents, links as text ----
    const seen = await store.fileHashes(org.id, sheet.id), have = seen.hashes;
    const summary = { photos: 0, documents: 0, converted: 0, upright: 0, skippedTiny: 0, skippedDuplicate: 0, skippedBig: 0, skippedType: [], originalNotKept: 0, failed: 0, overCap: 0 };
    let n = 0, position = 0;
    for (const a of attachments) {
      if (attachmentKind({ filename: a.filename, contentType: a.contentType }) === "email" && deps.simpleParser) continue;   // read whole above
      if (++n > MAX_ATTACHMENTS) { summary.overCap++; continue; }
      let bytes; try { bytes = Buffer.from(await a.load()); } catch { summary.failed++; continue; }
      if (!bytes.length) { summary.failed++; continue; }
      if (bytes.length > MAX_FILE_BYTES) { summary.skippedBig++; continue; }
      const hash = sha(bytes);
      if (have.has(hash)) { summary.skippedDuplicate++; continue; }
      const kind = attachmentKind({ filename: a.filename, contentType: a.contentType, bytes });
      const type = sniffType(bytes, a.contentType, a.filename);
      const name = safeFilename(a.filename, kind === "image" ? "photo" : "document");
      if (kind === "image") {
        const out = await resizeUpright(bytes, { filename: a.filename, contentType: type });
        if (!out.ok) { summary.failed++; continue; }
        if (Math.max(out.width, out.height) < MIN_PHOTO_EDGE) { summary.skippedTiny++; continue; }   // a signature logo or tracking pixel is not a photo of the car
        // the original as received when the store accepts its type; for any other image type (gif, tiff, bmp, avif) the converted JPEG stands in and is counted
        const keepOriginal = !!PHOTO_ORIGINAL_TYPES[type];
        if (!keepOriginal) summary.originalNotKept++;
        const r = await store.addPhoto({ org: org.id, sheetId: sheet.id, seatId: seat.id, original: keepOriginal ? { buf: bytes, contentType: type } : { buf: out.jpeg, contentType: "image/jpeg" }, resized: { buf: out.jpeg, contentType: "image/jpeg", width: out.width, height: out.height }, source: "email", position: position++, filename: name, sha256: hash });
        if (!r.ok) { summary.failed++; continue; }
        summary.photos++; if (out.converted) summary.converted++; if (out.rotated) summary.upright++;
      } else {
        if (!DOCUMENT_TYPES[type]) { summary.skippedType.push(name); continue; }   // still inside the original email
        const r = await store.addDocument({ org: org.id, sheetId: sheet.id, seatId: seat.id, file: { buf: bytes, contentType: type }, filename: name, sha256: hash });
        if (!r.ok) { summary.failed++; continue; }
        summary.documents++;
      }
      have.add(hash);
    }
    for (const link of read.links) if (!seen.links.has(link)) { const r = await store.addDocument({ org: org.id, sheetId: sheet.id, seatId: seat.id, link, filename: null }); if (r.ok) seen.links.add(link); }

    // ---- the sheet object Lane E's Valuations page opens (lib/desk/intake/toSheet.js): built from the row and its files, kept in step on every email
    sheet = (await syncSheet(store, org.id, sheet.id)) || sheet;

    // ---- the V4 case on that sheet (lib/desk/intake/toCase.js): a new lead lands in New leads as a stored case with its fields filled in and marked seller supplied; a later email on the lead is merged into it, never a second case ----
    let caseMade = false;
    if (deps.sheets && !LOCKED_STATUSES.includes(sheet.status)) {
      const receivedAt = now();
      try {
        if (created) caseMade = (await attachCase({ sheets: deps.sheets, orgId: org.id, sheetId: sheet.id, read, car, receivedAt })).made;
        else if (addedTo) await mergeIntoCase({ sheets: deps.sheets, orgId: org.id, sheetId: sheet.id, read, receivedAt });
      } catch { /* a case that could not be written leaves the lead as the bare row it was: the first edit builds the case from it, as before */ }
      sheet = (await store.getSheet(org.id, sheet.id)) || sheet;
    }

    // ---- the engine read, in the background; never awaited by the caller ----
    let readStarted = false;
    const wantsRead = !!car && (created || (addedTo && !match.make)) && !LOCKED_STATUSES.includes(sheet.status);
    if (wantsRead && deps.startRead) { readStarted = true; await store.patchSheet(org.id, sheet.id, { engine_status: "running" }); deps.startRead(sheet, car, read); }

    if (caseMade && car && deps.startCaseRead) deps.startCaseRead(org.id, sheet.id);   // the case's own engine read, in the background, the road a typed case takes

    const outcome = addedTo ? "added_to_sheet" : (sheet.status === "needs_car" ? "needs_the_car" : "created");
    return finish(outcome, { org_id: org.id, sheet_id: sheet.id, detail: { matchBy, seat: fromAddr.email, auth: auth.state, moreVins: read.moreVins, vinFailedCheck: read.vinFailedCheck, noVin: read.noVin, decodeNote, attachments: summary, links: read.links.length, readStarted, relatedTo: created && match ? match.id : null } });
  } catch (e) {
    return finish("error", { detail: { message: String(e && e.message || e).slice(0, 300) } });
  }
}

// ---- a VIN or year make model typed at the top of the Desk (the same pipeline, no email) ----
export async function createTypedSheet({ org, seat, text, deps }) {
  const store = deps.store, q = String(text || "").trim();
  if (!q) return { ok: false, reason: "empty" };
  const read = readSubmission({ subject: q, body: "" });
  let car = null;
  if (read.vin) { const dec = deps.decodeVin ? await Promise.resolve(deps.decodeVin(read.vin)).catch(() => null) : null; if (dec) car = plainCar({ year: dec.year, make: dec.make, model: dec.model, trim: dec.trim, bodyStyle: dec.body, source: "vin" }); }
  if (!car) car = await resolveCarWords([q], deps);
  if (!read.vin && !car) return { ok: false, reason: read.vinFailedCheck.length ? "vin_check_digit" : "no_car", vinFailedCheck: read.vinFailedCheck };
  const sheet = await store.createSheet({ org_id: org.id, seat_id: seat.id, seat_email: seat.email, status: !car && read.vinCheckInvalid && read.vinMakerUnknown ? "needs_car" : "new", source: "typed", car_label: labelOf(car), year: car && car.year || null, make: car && car.make || null, model: car && car.model || null, trim: car && car.trim || null, vin: read.vin, vin_norm: read.vin ? read.vin.toUpperCase() : null, vin_check_invalid: read.vinCheckInvalid, vin_maker_unknown: read.vinMakerUnknown, no_vin: !read.vin, more_vins: read.moreVins, subject: q.slice(0, 300), subject_key: subjectKey(q) });
  const synced = (await syncSheet(store, org.id, sheet.id)) || sheet;
  if (car && deps.startRead) { await store.patchSheet(org.id, sheet.id, { engine_status: "running" }); deps.startRead(sheet, car, read); }
  return { ok: true, sheet: synced };
}
