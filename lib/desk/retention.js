// Sam Desk Valuations: retention (Lane S, Nov 4 2026). Spec: "Retention: licence plus ninety days, earlier deletion logged."
// =====================================================================
// A sheet's delete_after date is licence end + RETENTION_DAYS, stamped by the database trigger (desk_sheet_stamp) so no
// code path can forget it, and moved for every sheet of an org when the licence end moves. This module holds the same
// arithmetic for the app (retentionCheck proves both agree) and the sweep that deletes what is due.
// The sweep never deletes a sheet that is not due, never a sheet whose objects could not all be removed, and every deletion
// goes through deleteSheetEverywhere (storage first, rows second, logged by trigger).
import { supabaseSelect } from "../_supabase.js";
import { deleteSheetEverywhere } from "./storage.js";

export const RETENTION_DAYS = 90;

// 'YYYY-MM-DD' licence end -> 'YYYY-MM-DD' delete date. null for anything that is not a real calendar date.
export function deleteAfterDate(licenceEnd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(licenceEnd || ""));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (isNaN(d) || d.toISOString().slice(0, 10) !== licenceEnd) return null;
  d.setUTCDate(d.getUTCDate() + RETENTION_DAYS);
  return d.toISOString().slice(0, 10);
}
export function isDue(deleteAfter, today) { return !!deleteAfter && /^\d{4}-\d{2}-\d{2}$/.test(deleteAfter) && deleteAfter <= today; }

// Delete every sheet whose delete_after has passed. today = 'YYYY-MM-DD' (UTC). Returns a report; ok:false when anything failed.
// Sheets with no delete_after are reported (they should not exist: the database refuses a sheet for an org with no licence end).
export async function retentionSweep(env, { today = new Date().toISOString().slice(0, 10), limit = 200, actor = "retention" } = {}) {
  const due = await supabaseSelect(env, `desk_sheets?select=id,org_id,delete_after&delete_after=lte.${today}&order=delete_after.asc&limit=${limit}`);
  if (!Array.isArray(due)) return { ok: false, error: "could not read due sheets", deleted: 0 };
  const noDate = await supabaseSelect(env, `desk_sheets?select=id,org_id&delete_after=is.null&limit=50`);
  let deleted = 0, objects = 0; const failed = [];
  for (const s of due) {
    if (!isDue(s.delete_after, today)) continue;   // belt and braces: never trust the filter alone
    const d = await deleteSheetEverywhere(env, { org: s.org_id, sheetId: s.id, reason: "retention", actor });
    if (d.ok) { deleted++; objects += d.objects; } else failed.push({ sheetId: s.id, org: s.org_id, error: d.error });
  }
  return { ok: failed.length === 0, today, due: due.length, deleted, objects, failed, undated: Array.isArray(noDate) ? noDate.length : null };
}
