// DESK INTAKE -> THE SHEET PAGE (Lane C, Nov 4 2026, integration job). Lane D's intake writes the row's own columns and the files' tables; Lane E's Valuations page and actions read ONE object, the sheet, from
// desk_sheets.sheet (lib/desk/sheetStore.js; shape in lib/desk/sheetShape.js and sheetActions.js). This is the single place that builds that object from an intake row, so an intake row always opens.
// The object is Lane E's shape and Lane E's code is untouched: id, owner_seat, forwarded_by, vin, car_label, status (title case), created_at, opened_at, submission { typed, mileage, consignor, photos, documents, note },
// state, read, events. Once the expert has the sheet (an object with an id is already there) their state, read, events, status and owner are kept; only the submission (what the email carried) is refreshed.
import { emptyState } from "../sheetActions.js";

const STATUS_E = { new: "New", in_progress: "In progress", finalised: "Finalised", sent: "Sent", needs_car: "Needs the car" };
const FROZEN = new Set(["finalised", "sent"]);

export function sheetObjectOf(row, files = {}, extra = {}) {
  const have = row.sheet && typeof row.sheet === "object" && row.sheet.id === row.id ? row.sheet : null;
  const seat = String(row.seat_id);
  const photos = (files.photos || []).map(p => ({ id: p.id, name: p.filename || "photo", path: p.resized_path || null, url: null, inReport: !!p.in_report }));
  const documents = (files.documents || []).map(d => ({ id: d.id, name: d.filename || d.link_url || "document", kind: d.kind, path: d.storage_path || null, url: d.link_url || null }));
  const consignor = row.consignor_name || row.consignor_email ? { name: row.consignor_name || null, email: row.consignor_email || null } : null;
  const submission = { typed: row.source === "typed", mileage: Number(row.mileage) > 0 ? Number(row.mileage) : null, consignor, photos, documents, note: row.subject || null, ...(row.source_email_path ? { sourceEmail: { path: row.source_email_path, ext: ".eml" } } : {}) };
  if (have) return { ...have, vin: have.vin || row.vin_norm || row.vin || null, car_label: row.car_label || have.car_label, submission, read: extra.read !== undefined ? extra.read : have.read };
  return {
    id: row.id, owner_seat: seat, forwarded_by: seat, vin: row.vin_norm || row.vin || null, car_label: row.car_label || null, status: STATUS_E[row.status] || "New",
    created_at: new Date(row.created_at || Date.now()).toISOString(), opened_at: null, submission, state: emptyState(), read: extra.read !== undefined ? extra.read : null,
    events: [{ at: new Date(row.created_at || Date.now()).toISOString(), seat, what: row.source === "typed" ? "created" : "forwarded by email" }]
  };
}

// Write the object into the row's `sheet` column. A finalised or sent sheet is frozen (the database trigger and Lane D's own LOCKED_STATUSES): never touched.
export async function syncSheet(store, orgId, sheetId, extra = {}) {
  const row = await store.getSheet(orgId, sheetId); if (!row || FROZEN.has(row.status)) return row || null;
  const files = await store.filesOf(orgId, sheetId).catch(() => ({ photos: [], documents: [] }));
  return (await store.patchSheet(orgId, sheetId, { sheet: sheetObjectOf(row, files, extra) })) || row;
}
