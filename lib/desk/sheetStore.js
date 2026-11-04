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
export const summaryOf = (s, now = Date.now()) => { const minutes = Math.max(0, Math.round((now - Date.parse(s.created_at)) / 60000)); return { id: s.id, car: s.car_label || "Needs the car", vin: s.vin || null, status: s.status, owner: s.owner_seat, since: s.created_at, timeIn: timeIn(minutes), reportNumber: (s.final && s.final.reportNumber) || null, date: String(s.created_at).slice(0, 10) }; };

const MEM = new Map();   // org -> Map(id -> sheet)
const COUNTERS = new Map();
export function memoryStore() {
  const tbl = org => { if (!MEM.has(org)) MEM.set(org, new Map()); return MEM.get(org); };
  return {
    kind: "memory",
    async insert(org, sheet) { tbl(org).set(sheet.id, structuredClone(sheet)); return sheet; },
    async get(org, id) { const s = tbl(org).get(id); return s ? structuredClone(s) : null; },
    async put(org, sheet) { tbl(org).set(sheet.id, structuredClone(sheet)); return sheet; },
    async list(org) { return [...tbl(org).values()].map(s => structuredClone(s)); },
    async nextReport(org, year) { const k = org + ":" + year; const n = (COUNTERS.get(k) || 0) + 1; COUNTERS.set(k, n); return n; },
    async exportsThisMonth(org, month) { return [...tbl(org).values()].reduce((t, s) => t + ((s.exports || []).filter(e => String(e.at).slice(0, 7) === month).length), 0); },
    reset() { MEM.clear(); COUNTERS.clear(); }
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
  const unwrap = rows => (rows || []).map(r => r.sheet);
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
    async get(org, id) { return unwrap(await supabaseSelect(env, q(org, `&id=eq.${encodeURIComponent(id)}&select=sheet&limit=1`)))[0] || null; },
    async put(org, sh) { const { id, org_id, ...cols } = await rowOf(org, sh); const r = await supabasePatch(env, q(org, `&id=eq.${encodeURIComponent(sh.id)}`), { ...cols, updated_at: new Date().toISOString() }); if (r && r.error) throw new Error("sheet not saved"); return sh; },
    async list(org) { return unwrap(await supabaseSelect(env, q(org, "&select=sheet&order=created_at.desc&limit=500"))); },
    async nextReport(org, year) {
      const rows = await supabaseSelect(env, q(org, "&status=in.(finalised,sent)&select=id&limit=5000")); return (rows ? rows.length : 0) + 1;
    },
    async exportsThisMonth(org, month) { const all = unwrap(await supabaseSelect(env, q(org, "&select=sheet&limit=5000"))); return all.reduce((t, s) => t + ((s.exports || []).filter(e => String(e.at).slice(0, 7) === month).length), 0); }
  };
}
export function storeFor(env) { return env && env.supabaseUrl && env.supabaseKey ? supabaseStore(env) : memoryStore(); }
