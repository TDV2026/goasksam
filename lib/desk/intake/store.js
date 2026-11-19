// DESK INTAKE: where rows and files go (Lane D, Nov 2026), on Lane S's schema (docs/supabase-desk-storage.sql): desk_sheets, desk_sheet_photos,
// desk_sheet_documents, desk_sheet_sent, desk_org_settings and the per-org private bucket "desk-<org>", reached through lib/desk/storage.js.
// Two implementations of ONE interface: the Supabase store (service role, server only) and a memory store the checks use. Every read and write is
// scoped by org_id; every object path is <org>/<sheet>/... (storage.js objectPath), so nothing lands outside the org's rows and its own bucket.
import crypto from "node:crypto";
import { supabaseEnv, supabaseFetch } from "../../_supabase.js";
import { getOrgSettings, effectiveSettings } from "../orgSettings.js";
import { storeSheetPhoto, storeSheetDocument, putObject, bucketFor, pathInOrg, objectPath, validOrg, UUID_RE, PHOTO_ORIGINAL_TYPES, PHOTO_RESIZED_TYPES, DOCUMENT_TYPES } from "../storage.js";

export { objectPath };
export const SHEET_STATUSES = ["new", "in_progress", "finalised", "sent", "needs_car"];   // desk_sheets_status_check

// ---------------------------------------------------------------- Supabase
export function supabaseStore(env = supabaseEnv()) {
  if (!env) throw new Error("no database credentials");
  const H = { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}` };
  const rest = async (path, init = {}) => {
    const r = await fetch(`${env.supabaseUrl}/rest/v1/${path}`, { ...init, headers: { ...H, "Content-Type": "application/json", ...(init.headers || {}) } });
    const text = await r.text();
    if (!r.ok) { const e = new Error(`${init.method || "GET"} ${path.split("?")[0]} ${r.status}: ${text.slice(0, 200)}`); e.status = r.status; e.body = text; throw e; }
    return text ? JSON.parse(text) : [];
  };
  const q = s => encodeURIComponent(s);
  const S = "desk_sheets";
  return {
    kind: "supabase",
    async orgByInbound(local) { return (await rest(`desk_orgs?inbound_local=ilike.${q(String(local).replace(/[%*_]/g, ""))}&select=*&limit=1`))[0] || null; },
    async orgById(id) { return (await rest(`desk_orgs?id=eq.${q(id)}&select=*&limit=1`))[0] || null; },
    async settingsOf(orgId) { return (await getOrgSettings(env, orgId)) || effectiveSettings(null); },
    async seatsOf(orgId) { return rest(`desk_seats?org_id=eq.${q(orgId)}&active=eq.true&select=id,email,role,subject`); },
    // The claim row. A repeated delivery of the same email finds it and stops; an old claim that never finished (error, or still "received" after 3 minutes) is taken over.
    async claim(emailId, meta) {
      try {
        const rows = await rest("desk_intake_log", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify([{ inbound_email_id: emailId, outcome: "received", ...meta }]) });
        return { claimed: true, row: rows[0] };
      } catch (e) {
        if (e.status !== 409 && !/23505|duplicate/i.test(e.body || "")) throw e;
        const row = (await rest(`desk_intake_log?inbound_email_id=eq.${q(emailId)}&select=*&limit=1`))[0];
        const stale = row && (row.outcome === "error" || (row.outcome === "received" && Date.now() - Date.parse(row.updated_at) > 180000));
        if (stale) {
          const got = await rest(`desk_intake_log?inbound_email_id=eq.${q(emailId)}&updated_at=eq.${q(row.updated_at)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ outcome: "received", updated_at: new Date().toISOString() }) });
          if (got.length) return { claimed: true, row: got[0], retried: true };
        }
        return { claimed: false, row };
      }
    },
    async setLog(emailId, patch) { await rest(`desk_intake_log?inbound_email_id=eq.${q(emailId)}`, { method: "PATCH", body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) }); },
    async sheetsOfOrg(orgId, filter = {}) {
      let p = `${S}?org_id=eq.${q(orgId)}&select=*&order=created_at.desc&limit=50`;
      if (filter.vin) p += `&vin_norm=eq.${q(String(filter.vin).toUpperCase())}`;
      if (filter.threadIds && filter.threadIds.length) p += `&thread_ids=ov.${q("{" + filter.threadIds.map(t => `"${t.replace(/"/g, "")}"`).join(",") + "}")}`;
      if (filter.subjectKey) p += `&subject_key=eq.${q(filter.subjectKey)}`;
      if (filter.consignorEmail) p += `&consignor_email=ilike.${q(String(filter.consignorEmail).replace(/[%*_]/g, ""))}`;
      return rest(p);
    },
    async getSheet(orgId, id) { return (await rest(`${S}?org_id=eq.${q(orgId)}&id=eq.${q(id)}&select=*&limit=1`))[0] || null; },
    async createSheet(row) { return (await rest(S, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify([row]) }))[0]; },
    async patchSheet(orgId, id, patch) { const r = await rest(`${S}?org_id=eq.${q(orgId)}&id=eq.${q(id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) }); return r[0] || null; },
    // conditional patch: applies only while every key of `where` still matches; returns the row, or null when another request got there first
    async patchSheetIf(orgId, id, where, patch) {
      const cond = Object.entries(where).map(([k, v]) => `${k}=${typeof v === "boolean" || v === null ? (v === null ? "is.null" : "is." + v) : "eq." + q(v)}`).join("&");
      const r = await rest(`${S}?org_id=eq.${q(orgId)}&id=eq.${q(id)}&${cond}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) });
      return r[0] || null;
    },
    // files: S's storage helpers write the objects and the row together (and undo the objects if the row fails)
    async addPhoto(a) {
      const r = await storeSheetPhoto(env, a);
      if (!r.ok) return r;
      if (a.sha256) await rest(`desk_sheet_photos?org_id=eq.${q(a.org)}&id=eq.${q(r.photo.id)}`, { method: "PATCH", body: JSON.stringify({ sha256: a.sha256 }) }).catch(() => {});
      return r;
    },
    async addDocument(a) {
      const r = await storeSheetDocument(env, a);
      if (!r.ok) return r;
      if (a.sha256) await rest(`desk_sheet_documents?org_id=eq.${q(a.org)}&id=eq.${q(r.document.id)}`, { method: "PATCH", body: JSON.stringify({ sha256: a.sha256 }) }).catch(() => {});
      return r;
    },
    async fileHashes(orgId, sheetId) {
      const [p, d] = await Promise.all([rest(`desk_sheet_photos?org_id=eq.${q(orgId)}&sheet_id=eq.${q(sheetId)}&select=sha256`), rest(`desk_sheet_documents?org_id=eq.${q(orgId)}&sheet_id=eq.${q(sheetId)}&select=sha256,link_url`)]);
      return { hashes: new Set([...p, ...d].map(r => r.sha256).filter(Boolean)), links: new Set(d.map(r => r.link_url).filter(Boolean)) };
    },
    async filesOf(orgId, sheetId) {
      const [photos, documents] = await Promise.all([rest(`desk_sheet_photos?org_id=eq.${q(orgId)}&sheet_id=eq.${q(sheetId)}&select=*&order=position.asc`), rest(`desk_sheet_documents?org_id=eq.${q(orgId)}&sheet_id=eq.${q(sheetId)}&select=*&order=created_at.asc`)]);
      return { photos, documents };
    },
    async putObject(org, path, bytes, contentType) { const r = await putObject(env, org, path, Buffer.from(bytes), contentType); if (!r.ok) throw new Error(r.error); return path; },
    async getObject(org, path) {
      if (!pathInOrg(org, path)) return null;
      const r = await supabaseFetch(`${env.supabaseUrl}/storage/v1/object/${bucketFor(org)}/${path.split("/").map(encodeURIComponent).join("/")}`, { headers: H }, 60000);
      return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
    },
    async insertSent(row) { return (await rest("desk_sheet_sent", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify([row]) }))[0]; },
    async sentOf(orgId, sheetId) { return (await rest(`desk_sheet_sent?org_id=eq.${q(orgId)}&sheet_id=eq.${q(sheetId)}&select=*&order=sent_at.desc&limit=1`))[0] || null; },
    async deleteSent(orgId, sheetId) { await rest(`desk_sheet_sent?org_id=eq.${q(orgId)}&sheet_id=eq.${q(sheetId)}`, { method: "DELETE" }); }
  };
}

// ---------------------------------------------------------------- memory (checks). It enforces what the database would: S's status list, the path rules,
// the accepted file types, a seat on every sheet and photo, one sent row per sheet.
export function memoryStore({ orgs = [], seats = [], settings = {} } = {}) {
  const St = { orgs: orgs.map(o => ({ ...o })), seats: seats.map((s, i) => ({ id: i + 1, active: true, ...s })), settings: { ...settings }, log: new Map(), sheets: [], photos: [], documents: [], sent: [], objects: new Map(), seq: 0 };
  const uid = () => "00000000-0000-4000-8000-" + String(++St.seq).padStart(12, "0");
  const orgOk = (orgId, row) => row.org_id === orgId;
  const need = (c, m) => { if (!c) { const e = new Error("memory store: " + m); e.status = 400; throw e; } };
  return {
    kind: "memory", _state: St,
    async orgByInbound(local) { return St.orgs.find(o => String(o.inbound_local || "").toLowerCase() === String(local).toLowerCase()) || null; },
    async orgById(id) { return St.orgs.find(o => o.id === id) || null; },
    async settingsOf(orgId) { return effectiveSettings(St.settings[orgId] || null); },
    async seatsOf(orgId) { return St.seats.filter(s => s.org_id === orgId && s.active); },
    async claim(emailId, meta) {
      const have = St.log.get(emailId);
      if (have) return { claimed: false, row: have };
      const row = { inbound_email_id: emailId, outcome: "received", ...meta, updated_at: new Date().toISOString() }; St.log.set(emailId, row); return { claimed: true, row };
    },
    async setLog(emailId, patch) { Object.assign(St.log.get(emailId) || {}, patch); },
    async sheetsOfOrg(orgId, f = {}) {
      return St.sheets.filter(s => orgOk(orgId, s)
        && (!f.vin || String(s.vin_norm || "") === String(f.vin).toUpperCase())
        && (!f.threadIds || !f.threadIds.length || (s.thread_ids || []).some(t => f.threadIds.includes(t)))
        && (!f.subjectKey || s.subject_key === f.subjectKey)
        && (!f.consignorEmail || String(s.consignor_email || "").toLowerCase() === String(f.consignorEmail).toLowerCase())).slice().reverse();
    },
    async getSheet(orgId, id) { return St.sheets.find(s => s.id === id && orgOk(orgId, s)) || null; },
    async createSheet(row) {
      need(SHEET_STATUSES.includes(row.status || "new"), "status " + row.status + " is not in desk_sheets_status_check");
      need(St.seats.some(s => s.id === row.seat_id && s.org_id === row.org_id), "sheet seat is not a seat of the org (desk_sheets_seat_fk)");
      const r = { id: uid(), created_at: new Date().toISOString(), status: "new", sheet: {}, ...row }; St.sheets.push(r); return r;
    },
    async patchSheet(orgId, id, patch) {
      const r = St.sheets.find(s => s.id === id && orgOk(orgId, s)); if (!r) return null;
      if (patch.status) need(SHEET_STATUSES.includes(patch.status), "status " + patch.status + " is not in desk_sheets_status_check");
      if (patch.source_email_path) need(String(patch.source_email_path).startsWith(`${orgId}/${id}/`), "source_email_path must sit under <org>/<sheet>/ (desk_sheets_path_in_org)");
      if (["finalised", "sent"].includes(r.status)) {   // desk_sheet_immutable: the sheet's content is frozen; only the finalised -> sent move and the send bookkeeping may change
        const free = new Set(["status", "sending", "sent_at", "sent_to", "sent_provider_id", "pdf_path", "updated_at", "engine_status"]);
        need(Object.keys(patch).every(k => free.has(k)), "sheet is finalised and cannot be changed: " + Object.keys(patch).filter(k => !free.has(k)).join(","));
      }
      Object.assign(r, patch); return r;
    },
    async patchSheetIf(orgId, id, where, patch) { const r = St.sheets.find(s => s.id === id && orgOk(orgId, s)); if (!r || !Object.entries(where).every(([k, v]) => (r[k] ?? null) === v)) return null; return this.patchSheet(orgId, id, patch); },
    async addPhoto(a) {
      need(St.sheets.some(s => s.id === a.sheetId && s.org_id === a.org), "no such sheet in this org");
      if (!PHOTO_ORIGINAL_TYPES[a.original && a.original.contentType] || !PHOTO_RESIZED_TYPES[a.resized && a.resized.contentType]) return { ok: false, error: "photo type not accepted" };
      const id = uid(), ext = PHOTO_ORIGINAL_TYPES[a.original.contentType], rext = PHOTO_RESIZED_TYPES[a.resized.contentType];
      const origPath = objectPath(a.org, a.sheetId, "orig", id, ext), webPath = objectPath(a.org, a.sheetId, "web", id, rext);
      St.objects.set(origPath, Buffer.from(a.original.buf)); St.objects.set(webPath, Buffer.from(a.resized.buf));
      const photo = { id, sheet_id: a.sheetId, org_id: a.org, seat_id: a.seatId, original_path: origPath, resized_path: webPath, filename: a.filename || null, content_type: a.original.contentType, bytes: a.original.buf.length, width: a.resized.width || null, height: a.resized.height || null, position: a.position || 0, in_report: false, is_hero: false, source: a.source || "email", sha256: a.sha256 || null };
      St.photos.push(photo); return { ok: true, photo, origPath, webPath };
    },
    async addDocument(a) {
      need(St.sheets.some(s => s.id === a.sheetId && s.org_id === a.org), "no such sheet in this org");
      const id = uid();
      if (a.link) {
        if (!/^https:\/\/(www\.)?(drive\.google\.com|docs\.google\.com|dropbox\.com|www\.dropbox\.com|dl\.dropboxusercontent\.com)\//i.test(a.link)) return { ok: false, error: "link not accepted" };
        const document = { id, sheet_id: a.sheetId, org_id: a.org, seat_id: a.seatId, kind: "link", link_url: a.link, filename: a.filename || null }; St.documents.push(document); return { ok: true, document };
      }
      const ext = DOCUMENT_TYPES[a.file && a.file.contentType]; if (!ext) return { ok: false, error: "document type not accepted" };
      const path = objectPath(a.org, a.sheetId, "doc", id, ext); St.objects.set(path, Buffer.from(a.file.buf));
      const document = { id, sheet_id: a.sheetId, org_id: a.org, seat_id: a.seatId, kind: "file", storage_path: path, filename: a.filename || null, content_type: a.file.contentType, bytes: a.file.buf.length, sha256: a.sha256 || null };
      St.documents.push(document); return { ok: true, document, path };
    },
    async fileHashes(orgId, sheetId) { const rows = [...St.photos, ...St.documents].filter(r => r.sheet_id === sheetId && r.org_id === orgId); return { hashes: new Set(rows.map(r => r.sha256).filter(Boolean)), links: new Set(rows.map(r => r.link_url).filter(Boolean)) }; },
    async filesOf(orgId, sheetId) { return { photos: St.photos.filter(r => r.sheet_id === sheetId && r.org_id === orgId), documents: St.documents.filter(r => r.sheet_id === sheetId && r.org_id === orgId) }; },
    async putObject(org, path, bytes) { need(pathInOrg(org, path), "path is outside the org"); St.objects.set(path, Buffer.from(bytes)); return path; },
    async getObject(org, path) { return pathInOrg(org, path) ? St.objects.get(path) || null : null; },
    async insertSent(row) {
      need(St.seats.some(s => s.id === row.seat_id && s.org_id === row.org_id), "sent seat is not a seat of the org (desk_sent_seat_fk)");
      need(!row.pdf_path || String(row.pdf_path).startsWith(`${row.org_id}/${row.sheet_id}/`), "pdf_path must sit under <org>/<sheet>/ (desk_sent_pdf_in_sheet)");
      if (St.sent.some(s => s.sheet_id === row.sheet_id)) { const e = new Error("duplicate key desk_sheet_sent_one"); e.status = 409; e.body = "23505"; throw e; }
      const r = { id: uid(), sent_at: new Date().toISOString(), ...row }; St.sent.push(r); return r;
    },
    async patchSent() { const e = new Error("desk: the sent log is never edited"); e.status = 400; throw e; },   // desk_sent_immutable_trg
    async sentOf(orgId, sheetId) { return St.sent.find(s => s.sheet_id === sheetId && orgOk(orgId, s)) || null; },
    async deleteSent(orgId, sheetId) { St.sent = St.sent.filter(s => !(s.sheet_id === sheetId && orgOk(orgId, s))); }
  };
}
