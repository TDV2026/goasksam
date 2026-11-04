// DESK VALUATIONS: where the sheets live, and who may touch them (docs/desk-valuations-spec.md, "The queue and the rail", "Saving per seat and org").
// Every sheet is a private row owned by the org with the seat stamped. Two drivers: Supabase (desk_sheets, docs/supabase-desk-sheets.sql, RLS on) and a memory driver for checks and a
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
export const summaryOf = (s, now = Date.now()) => ({ id: s.id, car: s.car_label || "Needs the car", vin: s.vin || null, status: s.status, owner: s.owner_seat, since: s.created_at, minutes: Math.max(0, Math.round((now - Date.parse(s.created_at)) / 60000)), reportNumber: (s.final && s.final.reportNumber) || null });

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
export function supabaseStore(env) {
  const base = "desk_sheets";
  const q = (org, extra = "") => `${base}?org_id=eq.${encodeURIComponent(org)}${extra}`;
  const unwrap = rows => (rows || []).map(r => r.data);
  return {
    kind: "supabase",
    async insert(org, s) { await supabaseInsert(base, [{ id: s.id, org_id: org, owner_seat: s.owner_seat, vin: s.vin, status: s.status, data: s }], env.supabaseUrl, env.supabaseKey); return s; },
    async get(org, id) { return unwrap(await supabaseSelect(env, q(org, `&id=eq.${encodeURIComponent(id)}&select=data&limit=1`)))[0] || null; },
    async put(org, s) { await supabasePatch(env, q(org, `&id=eq.${encodeURIComponent(s.id)}`), { owner_seat: s.owner_seat, vin: s.vin, status: s.status, data: s, updated_at: new Date().toISOString() }); return s; },
    async list(org) { return unwrap(await supabaseSelect(env, q(org, "&select=data&order=created_at.desc&limit=500"))); },
    async nextReport(org, year) {
      const rows = await supabaseSelect(env, q(org, "&status=in.(Finalised,Sent)&select=id&limit=5000")); return (rows ? rows.length : 0) + 1;
    },
    async exportsThisMonth(org, month) { const all = unwrap(await supabaseSelect(env, q(org, "&select=data&limit=5000"))); return all.reduce((t, s) => t + ((s.exports || []).filter(e => String(e.at).slice(0, 7) === month).length), 0); }
  };
}
export function storeFor(env) { return env && env.supabaseUrl && env.supabaseKey ? supabaseStore(env) : memoryStore(); }
