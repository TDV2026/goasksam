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
import { readSubmission, threadIdsOf, subjectKey, parseAddress } from "./parse.js";
import { attachmentKind, resizeUpright, safeFilename, MIN_PHOTO_EDGE, MAX_ATTACHMENTS, MAX_FILE_BYTES } from "./images.js";
import { objectPath } from "./store.js";

export const INBOUND_DOMAIN = () => String(process.env.DESK_INBOUND_DOMAIN || "desk.goasksam.com").toLowerCase();
export const LOCKED_STATUSES = ["Finalised", "Sent"];

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
    return y > 1900 && make && model ? { year: y, make, model, trim: trim || null, body: String(row.BodyClass || "").trim() || null } : null;
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
export const labelOf = c => c ? [c.year, c.make, c.model, c.trim].filter(Boolean).join(" ") : null;

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

    // ---- the submission: the email, plus any forwarded-as-attachment email read whole ----
    let text = String(mail.text || "").trim() || htmlToText(mail.html);
    const attachments = [...(mail.attachments || [])];
    const extraText = [];
    const inner = [];
    for (const a of attachments) {
      if (attachmentKind({ filename: a.filename, contentType: a.contentType }) !== "email" || !deps.simpleParser) continue;
      try {
        const buf = await a.load(); const p = await deps.simpleParser(buf);
        extraText.push(`---------- Forwarded message ---------\nFrom: ${p.from && p.from.text || ""}\nDate: ${p.date ? p.date.toUTCString() : ""}\nSubject: ${p.subject || ""}\nTo: ${p.to && p.to.text || ""}\n\n${p.text || htmlToText(p.html || "")}`);
        for (const ia of p.attachments || []) inner.push({ filename: ia.filename, contentType: ia.contentType, size: ia.size, load: async () => ia.content });
      } catch { /* an unreadable attachment is kept as a document below */ }
    }
    attachments.push(...inner);

    const internal = [...seats.map(s => s.email), target.address, org.sending_address].filter(Boolean);
    const read = readSubmission({ subject: mail.subject, body: text, internalEmails: internal, extraText: extraText.join("\n\n") });

    // ---- the car ----
    let car = null, decodeNote = null;
    if (read.vin) {
      const dec = deps.decodeVin ? await Promise.resolve(deps.decodeVin(read.vin)).catch(() => null) : null;
      if (dec) {
        const r = await deps.resolveVehicle([dec.year, dec.make, dec.model, dec.trim].filter(Boolean).join(" "), {}).catch(() => null);
        const v = r && r.status === "valid" && r.vehicle && r.vehicle.make && r.vehicle.model ? r.vehicle : null;
        car = v ? { year: Number(v.year) || dec.year, make: v.make, model: v.model, trim: v.trim || dec.trim, bodyStyle: v.bodyStyle || dec.body, source: "vin" } : { year: dec.year, make: dec.make, model: dec.model, trim: dec.trim, bodyStyle: dec.body, source: "vin" };
      } else decodeNote = "vin_not_decoded";
    }
    if (!car) car = await resolveCarWords(read.carPhrases, deps);
    const hasIdentity = !!(read.vin || read.chassis || car);

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
      vin: read.vin, chassis: read.chassis, no_vin: read.noVin, more_vins: read.moreVins, vin_failed_check: read.vinFailedCheck,
      mileage: read.mileage ? read.mileage.miles : null, mileage_basis: read.mileage ? read.mileage.basis : null, gearbox: read.gearbox, colour: read.colour,
      consignor_name: read.consignor ? read.consignor.name : null, consignor_email: read.consignor ? read.consignor.email : null, links: read.links
    };
    if (match && !LOCKED_STATUSES.includes(match.status)) {
      // a later email: photos and anything newly stated are added to the existing sheet; nothing already on it is overwritten
      const fill = {};
      for (const k of ["mileage", "mileage_basis", "gearbox", "colour", "consignor_name", "consignor_email", "chassis"]) if (match[k] == null && facts[k] != null) fill[k] = facts[k];
      if (!match.vin && facts.vin) { fill.vin = facts.vin; fill.no_vin = false; }
      if (car && !match.make) Object.assign(fill, { year: car.year, make: car.make, model: car.model, trim: car.trim, car_label: labelOf(car) });
      const moreVins = [...new Set([...(match.more_vins || []), ...facts.more_vins.filter(v => v !== (match.vin || fill.vin))])];
      if (moreVins.length !== (match.more_vins || []).length) fill.more_vins = moreVins;
      fill.thread_ids = [...new Set([...(match.thread_ids || []), ...threadIds])];
      fill.inbound_email_ids = [...new Set([...(match.inbound_email_ids || []), emailId])];
      const linkSet = [...new Set([...(match.links || []), ...facts.links])]; if (linkSet.length !== (match.links || []).length) fill.links = linkSet;
      if (match.status === "Needs the car" && (fill.vin || fill.make || match.vin || match.make || fill.chassis)) fill.status = "New";
      sheet = (await store.patchSheet(org.id, match.id, fill)) || match; addedTo = true;
    } else {
      sheet = await store.createSheet({
        org_id: org.id, seat_id: seat.id, seat_email: fromAddr.email, status: hasIdentity ? "New" : "Needs the car", source: "email",
        car_label: labelOf(car), year: car && car.year || null, make: car && car.make || null, model: car && car.model || null, trim: car && car.trim || null,
        ...facts, subject: String(mail.subject || "").slice(0, 300), subject_key: sKey, thread_ids: threadIds, inbound_email_ids: [emailId],
        related_sheet_id: match ? match.id : null, engine_status: null
      });
      created = true;
    }

    // ---- the original email, kept whole ----
    const originalPath = objectPath(org.id, sheet.id, "emails", `${emailId}.eml`);
    await store.put(originalPath, rawBytes, "message/rfc822");
    if (created) await store.patchSheet(org.id, sheet.id, { original_path: originalPath });
    const fileRows = [{ org_id: org.id, sheet_id: sheet.id, kind: "original", filename: `${emailId}.eml`, content_type: "message/rfc822", size: rawBytes.length, path: originalPath, inbound_email_id: emailId, sha256: sha(rawBytes) }];

    // ---- attachments ----
    const have = new Set((await store.filesOf(org.id, sheet.id)).map(f => f.sha256).filter(Boolean));
    const summary = { photos: 0, documents: 0, converted: 0, upright: 0, skippedTiny: 0, skippedDuplicate: 0, skippedBig: 0, failed: 0, overCap: 0 };
    let n = 0;
    for (const a of attachments) {
      if (attachmentKind({ filename: a.filename, contentType: a.contentType }) === "email" && deps.simpleParser) continue;   // read whole above
      if (++n > MAX_ATTACHMENTS) { summary.overCap++; continue; }
      let bytes; try { bytes = Buffer.from(await a.load()); } catch { summary.failed++; continue; }
      if (!bytes.length) { summary.failed++; continue; }
      if (bytes.length > MAX_FILE_BYTES) { summary.skippedBig++; continue; }
      const hash = sha(bytes);
      if (have.has(hash)) { summary.skippedDuplicate++; continue; }
      const kind = attachmentKind({ filename: a.filename, contentType: a.contentType, bytes });
      const name = safeFilename(a.filename, kind === "image" ? "photo" : "document");
      if (kind === "image") {
        const out = await resizeUpright(bytes, { filename: a.filename, contentType: a.contentType });
        if (!out.ok) { summary.failed++; fileRows.push({ org_id: org.id, sheet_id: sheet.id, kind: "document", filename: name, content_type: a.contentType || null, size: bytes.length, path: await store.put(objectPath(org.id, sheet.id, "originals", `${hash.slice(0, 12)}-${name}`), bytes, a.contentType || "application/octet-stream"), inbound_email_id: emailId, sha256: hash }); have.add(hash); continue; }
        if (Math.max(out.width, out.height) < MIN_PHOTO_EDGE) { summary.skippedTiny++; continue; }   // a signature logo or tracking pixel is not a photo of the car
        const origPath = await store.put(objectPath(org.id, sheet.id, "originals", `${hash.slice(0, 12)}-${name}`), bytes, a.contentType || "application/octet-stream");
        const resizedPath = await store.put(objectPath(org.id, sheet.id, "photos", `${hash.slice(0, 12)}.jpg`), out.jpeg, "image/jpeg");
        fileRows.push({ org_id: org.id, sheet_id: sheet.id, kind: "photo", filename: name, content_type: a.contentType || null, size: bytes.length, path: origPath, resized_path: resizedPath, width: out.width, height: out.height, converted: out.converted, inbound_email_id: emailId, sha256: hash });
        summary.photos++; if (out.converted) summary.converted++; if (out.rotated) summary.upright++;
      } else {
        const p = await store.put(objectPath(org.id, sheet.id, "originals", `${hash.slice(0, 12)}-${name}`), bytes, a.contentType || "application/octet-stream");
        fileRows.push({ org_id: org.id, sheet_id: sheet.id, kind: "document", filename: name, content_type: a.contentType || null, size: bytes.length, path: p, inbound_email_id: emailId, sha256: hash });
        summary.documents++;
      }
      have.add(hash);
    }
    await store.addFiles(fileRows);

    // ---- the engine read, in the background; never awaited by the caller ----
    let readStarted = false;
    const wantsRead = !!car && (created || (addedTo && !match.make)) && !LOCKED_STATUSES.includes(sheet.status);
    if (wantsRead && deps.startRead) { readStarted = true; await store.patchSheet(org.id, sheet.id, { engine_status: "running" }); deps.startRead(sheet, car, read); }

    const outcome = addedTo ? "added_to_sheet" : (sheet.status === "Needs the car" ? "needs_the_car" : "created");
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
  if (read.vin) { const dec = deps.decodeVin ? await Promise.resolve(deps.decodeVin(read.vin)).catch(() => null) : null; if (dec) car = { year: dec.year, make: dec.make, model: dec.model, trim: dec.trim, bodyStyle: dec.body, source: "vin" }; }
  if (!car) car = await resolveCarWords([q], deps);
  if (!read.vin && !car) return { ok: false, reason: read.vinFailedCheck.length ? "vin_check_digit" : "no_car", vinFailedCheck: read.vinFailedCheck };
  const sheet = await store.createSheet({ org_id: org.id, seat_id: seat.id, seat_email: seat.email, status: "New", source: "typed", car_label: labelOf(car), year: car && car.year || null, make: car && car.make || null, model: car && car.model || null, trim: car && car.trim || null, vin: read.vin, no_vin: !read.vin, more_vins: read.moreVins, subject: q.slice(0, 300), subject_key: subjectKey(q) });
  if (car && deps.startRead) { await store.patchSheet(org.id, sheet.id, { engine_status: "running" }); deps.startRead(sheet, car, read); }
  return { ok: true, sheet };
}
