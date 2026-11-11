// DESK VALUATIONS: where the sheets live, and who may touch them (docs/desk-valuations-spec.md, "The queue and the rail", "Saving per seat and org").
// Every sheet is a private row owned by the org with the seat stamped. Two drivers: Supabase (desk_sheets, docs/supabase-desk-storage.sql, RLS on) and a memory driver for checks and a
// database that is not there yet. The OWNERSHIP RULES are pure functions here and are the only place they are written.
import { supabaseSelect, supabaseInsert, supabasePatch } from "../_supabase.js";

// A sheet belongs to the forwarding seat. Any seat can pick up an unopened New sheet; once opened, others see it read only; nobody finalises another seat's sheet. A finalised sheet is read only to everyone.
export function accessOf(sheet, seat) {
  if (!sheet) return { role: "none", canView: false, canEdit: false, canFinalise: false, canPickUp: false, why: "No such sheet." };
  const mine = sheet.owner_seat === seat, frozen = sheet.status === "Finalised" || sheet.status === "Sent";
  const unopened = sheet.status === "New" && !sheet.opened_at;
  if (mine) return { role: "owner", canView: true, canEdit: !frozen, canFinalise: !frozen && sheet.status !== "Needs the car", canPickUp: false, why: frozen ? "Finalised: the sheet is locked." : "" };
  if (unopened) return { role: "can_pick_up", canView: true, canEdit: false, canFinalise: false, canPickUp: true, why: "Unopened: opening it makes it yours." };
  return { role: "read_only", canView: true, canEdit: false, canFinalise: false, canPickUp: false, why: `Read only: this sheet is ${sheet.owner_seat}'s.` };
}
// the time in the queue is worded here, so the page prints it as it is given
export const timeIn = minutes => minutes < 1 ? "just now" : minutes < 60 ? `${minutes} min` : minutes < 1440 ? `${Math.floor(minutes / 60)} h` : `${Math.floor(minutes / 1440)} d`;
export const summaryOf = (s, now = Date.now()) => { const minutes = Math.max(0, Math.round((now - Date.parse(s.created_at)) / 60000)); return { id: s.id, car: (s.case && s.case.desk && s.case.desk.titleLine) || s.car_label || "Needs the car", vin: s.vin || null, status: s.status, owner: s.owner_seat, since: s.created_at, timeIn: timeIn(minutes), reportNumber: (s.final && s.final.reportNumber) || null, date: String(s.created_at).slice(0, 10), finalisedOn: s.final && s.final.finalisedAt ? String(s.final.finalisedAt).slice(0, 10) : null, sentOn: s.sent && s.sent.at ? String(s.sent.at).slice(0, 10) : null }; };

const MEM = new Map();   // org -> Map(id -> sheet)
const COUNTERS = new Map();
const VERS = new Map();
const EXPS = new Map();
const SENT = new Map();
const overlay = (s, org) => { const m = SENT.get(org + "|" + s.id); return m ? { ...s, status: "Sent", sent: s.sent || { at: m.at, to: m.to } } : s; };
export function memoryStore() {
  const tbl = org => { if (!MEM.has(org)) MEM.set(org, new Map()); return MEM.get(org); };
  return {
    kind: "memory",
    async insert(org, sheet) { tbl(org).set(sheet.id, structuredClone(sheet)); return sheet; },
    async get(org, id) { const s = tbl(org).get(id); return s ? overlay(structuredClone(s), org) : null; },
    // the sending backend's column write, for checks that stand a backend in: the Sent state beside the locked sheet
    async markSent(org, id, at, to) { SENT.set(org + "|" + id, { at, to }); },
    async put(org, sheet) { tbl(org).set(sheet.id, structuredClone(sheet)); return sheet; },
    // compare and set: the write lands only when the stored sheet is still at the version the writer read (a sheet without one is version 0). false = someone else wrote first.
    async putIf(org, sheet, expected) { const cur = tbl(org).get(sheet.id); if (!cur || (cur.version || 0) !== (expected || 0)) return false; tbl(org).set(sheet.id, structuredClone(sheet)); return true; },
    // a photo added by hand to a sheet: the memory store keeps the picture itself (a data url); the sheet's submission lists it
    async addPhoto(org, sheet, { name, jpeg }) { return { id: "ph_" + Math.random().toString(16).slice(2, 10), name, path: null, url: "data:image/jpeg;base64," + Buffer.from(jpeg).toString("base64"), inReport: false }; },
    // a document filed on a sheet: the memory store keeps its name, type and size (the file itself is not kept in memory)
    async addDocument(org, sheet, { name, contentType, buf }) { return { id: "doc_" + Math.random().toString(16).slice(2, 10), name, contentType, bytes: buf.length, path: null }; },
    async list(org) { return [...tbl(org).values()].map(s => overlay(structuredClone(s), org)); },
    // FINALIZED CASE VERSIONS (docs/supabase-desk-case-versions.sql): insert only. A version that exists is never replaced.
    async putCaseVersion(org, sheetId, row) { const k = org + "|" + sheetId + "|" + row.version; if (VERS.has(k)) throw new Error("version already written"); VERS.set(k, structuredClone(row)); return row; },
    // EXPORT RECORDS OF A CASE SHEET (docs/supabase-desk-case-versions.sql, desk_case_exports): insert only, beside the finalised sheet row, never in it (desk_sheet_immutable refuses a change to a finalised row).
    async addExport(org, sheetId, rec) { const k = org + "|" + sheetId; if (!EXPS.has(k)) EXPS.set(k, []); EXPS.get(k).push(structuredClone(rec)); return rec; },
    async exportsOf(org, sheetId) { return structuredClone(EXPS.get(org + "|" + sheetId) || []); },
    async caseExportsThisMonth(org, month) { return [...EXPS.entries()].filter(([k]) => k.startsWith(org + "|")).reduce((t, [, v]) => t + v.filter(e => String(e.at).slice(0, 7) === month).length, 0); },
    async caseVersions(org, sheetId) { return [...VERS.entries()].filter(([k]) => k.startsWith(org + "|" + sheetId + "|")).map(([, v]) => structuredClone(v)).sort((a, b) => a.version - b.version); },
    async nextReport(org, year) { const k = org + ":" + year; const n = (COUNTERS.get(k) || 0) + 1; COUNTERS.set(k, n); return n; },
    async exportsThisMonth(org, month) { return (await this.caseExportsThisMonth(org, month)) + [...tbl(org).values()].reduce((t, s) => t + ((s.exports || []).filter(e => String(e.at).slice(0, 7) === month).length), 0); },
    reset() { MEM.clear(); COUNTERS.clear(); VERS.clear(); EXPS.clear(); SENT.clear(); }
  };
}
// The database driver writes Lane S's desk_sheets (docs/supabase-desk-storage.sql, the one DDL). Lane E's whole sheet object rides in `sheet`; the columns beside it are what the queue filters on,
// and the finalised fields are the frozen copies Lane S's constraints require. Renames from the first draft: data -> sheet; owner_seat (text) -> seat_id (bigint, the seat row; "crew" is the org's crew seat);
// status 'New' | 'In progress' | 'Finalised' | 'Sent' | 'Needs the car' -> 'new' | 'in_progress' | 'finalised' | 'sent' | 'needs_car'; id is a uuid.
const STATUS_DB = { "New": "new", "In progress": "in_progress", "Finalised": "finalised", "Sent": "sent", "Needs the car": "needs_car" };
const normVin = v => { const t = String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); return t || null; };
export function supabaseStore(env) {
  const base = "desk_sheets", seatCache = new Map();
  const q = (org, extra = "") => `${base}?org_id=eq.${encodeURIComponent(org)}${extra}`;
  // THE LOCKED ROW'S STATE LIVES IN ITS COLUMNS: the sending backend moves status to sent and writes sent_at and sent_to, but never the sheet JSON (it is locked), so a read overlays the columns on the JSON
  const unwrap = rows => (rows || []).map(r => (r.status === "sent" && r.sheet ? { ...r.sheet, status: "Sent", sent: r.sheet.sent || { at: r.sent_at || null, to: r.sent_to || null } } : r.sheet));
  // a seat label to the seat row: a number is the seat id; "crew" is the org's crew seat (subject 'crew')
  async function seatId(org, label) {
    const t = String(label == null ? "crew" : label), k = org + "|" + t;
    if (/^\d+$/.test(t)) return Number(t);
    if (seatCache.has(k)) return seatCache.get(k);
    const rows = await supabaseSelect(env, `desk_seats?org_id=eq.${encodeURIComponent(org)}&subject=eq.${encodeURIComponent(t)}&select=id&limit=1`);
    const id = Array.isArray(rows) && rows[0] ? rows[0].id : null;
    if (id == null) throw new Error("no seat row for " + t + " in " + org);
    seatCache.set(k, id); return id;
  }
  async function rowOf(org, sh) {
    const fin = sh.final || null, done = sh.status === "Finalised" || sh.status === "Sent";
    return {
      id: sh.id, org_id: org, seat_id: await seatId(org, sh.owner_seat), status: STATUS_DB[sh.status] || "new",
      vin: sh.vin || null, vin_norm: normVin(sh.vin), car_label: sh.car_label || null, sheet: sh,
      engine_read: done ? (sh.read || null) : null, decision: done && fin ? (fin.decision || null) : null,
      report_number: fin ? (fin.reportNumber || null) : null, finalised_at: done && fin ? fin.finalisedAt : null,
      finalised_by_seat_id: done && fin ? await seatId(org, fin.seat) : null,
      sent_at: sh.status === "Sent" && sh.sent ? sh.sent.at : null, supersedes_sheet_id: sh.corrects || null
    };
  }
  return {
    kind: "supabase",
    async insert(org, sh) { const r = await supabaseInsert(base, [await rowOf(org, sh)], env.supabaseUrl, env.supabaseKey); if (r && r.ok === false) throw new Error("sheet not saved"); return sh; },
    async get(org, id) { return unwrap(await supabaseSelect(env, q(org, `&id=eq.${encodeURIComponent(id)}&select=sheet,status,sent_at,sent_to&limit=1`)))[0] || null; },
    async put(org, sh) { const { id, org_id, ...cols } = await rowOf(org, sh); const r = await supabasePatch(env, q(org, `&id=eq.${encodeURIComponent(sh.id)}`), { ...cols, updated_at: new Date().toISOString() }); if (r && r.error) throw new Error("sheet not saved"); return sh; },
    // compare and set in ONE statement: the PATCH carries the version the writer read as a filter, so two tabs saving at once cannot both land; zero rows back = someone else wrote first.
    async putIf(org, sh, expected) {
      const { id, org_id, ...cols } = await rowOf(org, sh), v = Number(expected) || 0, filt = v === 0 ? "&or=(sheet-%3E%3Eversion.is.null,sheet-%3E%3Eversion.eq.0)" : `&sheet-%3E%3Eversion=eq.${v}`;
      const res = await fetch(`${env.supabaseUrl}/rest/v1/${q(org, `&id=eq.${encodeURIComponent(sh.id)}${filt}`)}`, { method: "PATCH", headers: { "Content-Type": "application/json", apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, Prefer: "return=representation" }, body: JSON.stringify({ ...cols, updated_at: new Date().toISOString() }) });
      if (!res.ok) throw new Error("sheet not saved");
      const rows = await res.json().catch(() => null); return Array.isArray(rows) && rows.length > 0;
    },
    // a photo added by hand: the object goes to the org's bucket and a desk_sheet_photos row, the same place and the same row an emailed photo has (lib/desk/storage.js storeSheetPhoto)
    async addPhoto(org, sheet, { name, jpeg, width = null, height = null, position = 0 }) {
      const { storeSheetPhoto } = await import("./storage.js");
      const r = await storeSheetPhoto(env, { org, sheetId: sheet.id, seatId: await seatId(org, sheet.owner_seat), original: { buf: Buffer.from(jpeg), contentType: "image/jpeg" }, resized: { buf: Buffer.from(jpeg), contentType: "image/jpeg", width, height }, source: "typed", position, filename: name });
      if (!r.ok) throw new Error(r.error || "photo not saved");
      return { id: r.photo.id, name: name || "photo", path: r.webPath, url: null, inReport: false };
    },
    // a document filed by hand: the file goes to the org's bucket and a desk_sheet_documents row, the same place and row an emailed attachment has (lib/desk/storage.js storeSheetDocument)
    async addDocument(org, sheet, { name, contentType, buf }) {
      const { storeSheetDocument } = await import("./storage.js");
      const r = await storeSheetDocument(env, { org, sheetId: sheet.id, seatId: await seatId(org, sheet.owner_seat), file: { buf: Buffer.from(buf), contentType }, filename: name });
      if (!r.ok) throw new Error(r.error || "document not saved");
      return { id: r.document.id, name, contentType, bytes: buf.length, path: r.path };
    },
    async list(org) { return unwrap(await supabaseSelect(env, q(org, "&select=sheet,status,sent_at,sent_to&order=created_at.desc&limit=500"))); },
    async putCaseVersion(org, sheetId, row) { const r = await supabaseInsert("desk_case_versions", [{ org_id: org, sheet_id: sheetId, version: row.version, row }], env.supabaseUrl, env.supabaseKey); if (r && r.ok === false) throw new Error("version not saved"); return row; },
    async addExport(org, sheetId, rec) { const r = await supabaseInsert("desk_case_exports", [{ org_id: org, sheet_id: sheetId, version: rec.version, kind: rec.kind, report_number: rec.reportNumber || null, seat: String(rec.seat || ""), at: rec.at, detail: rec.detail || null }], env.supabaseUrl, env.supabaseKey); if (r && r.ok === false) throw new Error("export not recorded"); return rec; },
    async exportsOf(org, sheetId) { return ((await supabaseSelect(env, `desk_case_exports?org_id=eq.${encodeURIComponent(org)}&sheet_id=eq.${encodeURIComponent(sheetId)}&select=version,kind,report_number,seat,at,detail&order=at.asc`)) || []).map(r => ({ version: r.version, kind: r.kind, reportNumber: r.report_number, seat: r.seat, at: r.at, detail: r.detail })); },
    async caseExportsThisMonth(org, month) { const rows = await supabaseSelect(env, `desk_case_exports?org_id=eq.${encodeURIComponent(org)}&at=gte.${month}-01T00:00:00Z&select=id&limit=5000`); return Array.isArray(rows) ? rows.length : 0; },
    async caseVersions(org, sheetId) { return ((await supabaseSelect(env, `desk_case_versions?org_id=eq.${encodeURIComponent(org)}&sheet_id=eq.${encodeURIComponent(sheetId)}&select=row,version&order=version.asc`)) || []).map(r => r.row); },
    async nextReport(org, year) {
      const rows = await supabaseSelect(env, q(org, "&status=in.(finalised,sent)&select=id&limit=5000")); return (rows ? rows.length : 0) + 1;
    },
    async exportsThisMonth(org, month) { const all = unwrap(await supabaseSelect(env, q(org, "&select=sheet&limit=5000"))); return (await this.caseExportsThisMonth(org, month)) + all.reduce((t, s) => t + ((s.exports || []).filter(e => String(e.at).slice(0, 7) === month).length), 0); }
  };
}
export function storeFor(env) { return env && env.supabaseUrl && env.supabaseKey ? supabaseStore(env) : memoryStore(); }
