// EVERY LIVE ROW IN THE BAND IS READ (Lane B, Nov 11 2026). The pickers (Find's three, the Tasks demo, the Watching demo, Home's featured car) read the live pool with ONE request ending in "&limit=400" (Home: "&limit=1000"): the 400 rows that end first,
// so a pool with more than 400 live rows ending soon (or ending inside 14 days) was read only in part and the best car of the band could be a row that was never read. CAUSE: that explicit limit, and PostgREST's own cap of 1000 rows a request beneath it.
// NOW: every row ending within 14 days (lib/live/endingSoon.js CAP_DAYS) is read, page by page in a fixed order (end time, then id, so no row is skipped or read twice between pages); beyond 14 days only the next BEYOND rows are read, because a car there is only the fallback.
import { CAP_DAYS, DAY_MS } from "./endingSoon.js";
export const PAGE = 1000, MAX_PAGES = 12, BEYOND = 400;
// select(env, query) -> rows | null; baseQuery has the table, the status and the columns; fromIso is the earliest end time (exclusive)
export async function readBand(select, env, baseQuery, { fromIso, nowMs, beyond = BEYOND, pageSize = PAGE } = {}) {
  const bandEnd = encodeURIComponent(new Date(nowMs + CAP_DAYS * DAY_MS).toISOString()), from = encodeURIComponent(fromIso), seen = new Set(), rows = [];
  const add = list => { for (const r of list) { const k = String(r.id); if (!seen.has(k)) { seen.add(k); rows.push(r); } } };
  for (let page = 0; page < MAX_PAGES; page++) {
    const got = await select(env, `${baseQuery}&end_time=gt.${from}&end_time=lt.${bandEnd}&order=end_time.asc,id.asc&limit=${pageSize}&offset=${page * pageSize}`);
    if (!Array.isArray(got)) return null;
    add(got); if (got.length < pageSize) break;
  }
  const far = await select(env, `${baseQuery}&end_time=gte.${bandEnd}&order=end_time.asc,id.asc&limit=${beyond}`);
  if (!Array.isArray(far)) return null;
  add(far);
  return rows;
}
