// DESK INTAKE: where rows and files go (Lane D, Nov 2026). Two implementations of ONE interface: the Supabase store (service role, server only) and a
// memory store the checks use. Every read and write is scoped by org_id; every path in the bucket starts with the org id and the sheet id, so nothing is
// stored outside the org's rows and its folder of the private bucket "desk-intake".
import { supabaseEnv } from "../../_supabase.js";

export const BUCKET = "desk-intake";
export const objectPath = (orgId, sheetId, ...parts) => [orgId, sheetId, ...parts].join("/");

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
  return {
    kind: "supabase",
    async orgByInbound(local) {
      const rows = await rest(`desk_orgs?inbound_local=ilike.${q(String(local).replace(/[%*_]/g, ""))}&select=*&limit=1`);
      return rows[0] || null;
    },
    async orgById(id) { return (await rest(`desk_orgs?id=eq.${q(id)}&select=*&limit=1`))[0] || null; },
    async seatsOf(orgId) { return rest(`desk_seats?org_id=eq.${q(orgId)}&select=id,email,role,subject`); },
    // a signed-in user is the seat with their email; one org only (two matches is no match: never guess whose seat it is)
    async seatByEmail(email) {
      const rows = await rest(`desk_seats?email=ilike.${q(String(email).replace(/[%*_]/g, ""))}&select=id,org_id,email,role,subject&limit=2`);
      if (rows.length !== 1) return null;
      const org = await this.orgById(rows[0].org_id); return org ? { org, seat: rows[0] } : null;
    },
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
      let p = `desk_sheets?org_id=eq.${q(orgId)}&select=*&order=created_at.desc&limit=50`;
      if (filter.vin) p += `&vin=eq.${q(filter.vin)}`;
      if (filter.threadIds && filter.threadIds.length) p += `&thread_ids=ov.${q("{" + filter.threadIds.map(t => `"${t.replace(/"/g, "")}"`).join(",") + "}")}`;
      if (filter.subjectKey) p += `&subject_key=eq.${q(filter.subjectKey)}`;
      if (filter.consignorEmail) p += `&consignor_email=ilike.${q(String(filter.consignorEmail).replace(/[%*_]/g, ""))}`;
      return rest(p);
    },
    async getSheet(orgId, id) { return (await rest(`desk_sheets?org_id=eq.${q(orgId)}&id=eq.${q(id)}&select=*&limit=1`))[0] || null; },
    async createSheet(row) { return (await rest("desk_sheets", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify([row]) }))[0]; },
    async patchSheet(orgId, id, patch) { const r = await rest(`desk_sheets?org_id=eq.${q(orgId)}&id=eq.${q(id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) }); return r[0] || null; },
    // conditional patch: applies only while every key of `where` still matches; returns the row, or null when another request got there first
    async patchSheetIf(orgId, id, where, patch) {
      const cond = Object.entries(where).map(([k, v]) => `${k}=${typeof v === "boolean" || v === null ? (v === null ? "is.null" : "is." + v) : "eq." + q(v)}`).join("&");
      const r = await rest(`desk_sheets?org_id=eq.${q(orgId)}&id=eq.${q(id)}&${cond}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) });
      return r[0] || null;
    },
    async addFiles(rows) { if (!rows.length) return []; return rest("desk_sheet_files", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(rows) }); },
    async filesOf(orgId, sheetId) { return rest(`desk_sheet_files?org_id=eq.${q(orgId)}&sheet_id=eq.${q(sheetId)}&select=*&order=created_at.asc&limit=500`); },
    async insertSent(row) { return (await rest("desk_sent", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify([row]) }))[0]; },
    async patchSent(orgId, sheetId, patch) { return (await rest(`desk_sent?org_id=eq.${q(orgId)}&sheet_id=eq.${q(sheetId)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) }))[0] || null; },
    async sentOf(orgId, sheetId) { return (await rest(`desk_sent?org_id=eq.${q(orgId)}&sheet_id=eq.${q(sheetId)}&select=*&limit=1`))[0] || null; },
    async deleteSent(orgId, sheetId) { await rest(`desk_sent?org_id=eq.${q(orgId)}&sheet_id=eq.${q(sheetId)}`, { method: "DELETE" }); },
    async put(path, bytes, contentType = "application/octet-stream") {
      const r = await fetch(`${env.supabaseUrl}/storage/v1/object/${BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`, { method: "POST", headers: { ...H, "Content-Type": contentType, "x-upsert": "true" }, body: bytes });
      if (!r.ok) throw new Error(`storage put ${r.status}: ${(await r.text()).slice(0, 160)}`);
      return path;
    },
    async get(path) {
      const r = await fetch(`${env.supabaseUrl}/storage/v1/object/${BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`, { headers: H });
      if (!r.ok) return null;
      return Buffer.from(await r.arrayBuffer());
    }
  };
}

// ---------------------------------------------------------------- memory (checks)
export function memoryStore({ orgs = [], seats = [] } = {}) {
  const S = { orgs: orgs.map(o => ({ ...o })), seats: seats.map((s, i) => ({ id: i + 1, ...s })), log: new Map(), sheets: [], files: [], sent: [], objects: new Map(), seq: 0 };
  const uid = () => "00000000-0000-4000-8000-" + String(++S.seq).padStart(12, "0");
  const orgOk = (orgId, row) => row.org_id === orgId;
  return {
    kind: "memory", _state: S,
    async orgByInbound(local) { return S.orgs.find(o => String(o.inbound_local || "").toLowerCase() === String(local).toLowerCase()) || null; },
    async orgById(id) { return S.orgs.find(o => o.id === id) || null; },
    async seatsOf(orgId) { return S.seats.filter(s => s.org_id === orgId); },
    async seatByEmail(email) { const rows = S.seats.filter(s => String(s.email || "").toLowerCase() === String(email).toLowerCase()); if (rows.length !== 1) return null; const org = S.orgs.find(o => o.id === rows[0].org_id); return org ? { org, seat: rows[0] } : null; },
    async claim(emailId, meta) {
      const have = S.log.get(emailId);
      if (have) return { claimed: false, row: have };
      const row = { inbound_email_id: emailId, outcome: "received", ...meta, updated_at: new Date().toISOString() }; S.log.set(emailId, row); return { claimed: true, row };
    },
    async setLog(emailId, patch) { Object.assign(S.log.get(emailId) || {}, patch); },
    async sheetsOfOrg(orgId, f = {}) {
      return S.sheets.filter(s => orgOk(orgId, s)
        && (!f.vin || s.vin === f.vin)
        && (!f.threadIds || !f.threadIds.length || (s.thread_ids || []).some(t => f.threadIds.includes(t)))
        && (!f.subjectKey || s.subject_key === f.subjectKey)
        && (!f.consignorEmail || String(s.consignor_email || "").toLowerCase() === String(f.consignorEmail).toLowerCase())).slice().reverse();
    },
    async getSheet(orgId, id) { return S.sheets.find(s => s.id === id && orgOk(orgId, s)) || null; },
    async createSheet(row) { const r = { id: uid(), created_at: new Date().toISOString(), ...row }; S.sheets.push(r); return r; },
    async patchSheet(orgId, id, patch) { const r = S.sheets.find(s => s.id === id && orgOk(orgId, s)); if (!r) return null; Object.assign(r, patch); return r; },
    async patchSheetIf(orgId, id, where, patch) { const r = S.sheets.find(s => s.id === id && orgOk(orgId, s)); if (!r || !Object.entries(where).every(([k, v]) => (r[k] ?? null) === v)) return null; Object.assign(r, patch); return r; },
    async addFiles(rows) { const out = rows.map(r => ({ id: uid(), ...r })); S.files.push(...out); return out; },
    async filesOf(orgId, sheetId) { return S.files.filter(f => f.sheet_id === sheetId && orgOk(orgId, f)); },
    async insertSent(row) { if (S.sent.some(s => s.sheet_id === row.sheet_id)) { const e = new Error("duplicate key desk_sent_sheet_uidx"); e.status = 409; e.body = "23505"; throw e; } const r = { id: ++S.seq, sent_at: new Date().toISOString(), ...row }; S.sent.push(r); return r; },
    async patchSent(orgId, sheetId, patch) { const r = S.sent.find(s => s.sheet_id === sheetId && orgOk(orgId, s)); if (r) Object.assign(r, patch); return r || null; },
    async sentOf(orgId, sheetId) { return S.sent.find(s => s.sheet_id === sheetId && orgOk(orgId, s)) || null; },
    async deleteSent(orgId, sheetId) { S.sent = S.sent.filter(s => !(s.sheet_id === sheetId && orgOk(orgId, s))); },
    async put(path, bytes) { S.objects.set(path, Buffer.from(bytes)); return path; },
    async get(path) { return S.objects.get(path) || null; }
  };
}
