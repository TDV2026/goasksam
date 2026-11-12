// A SMALL STAND-IN FOR PostgREST OVER THE DESK TABLES (Lane D, Nov 12 2026), for checks only: it answers the calls lib/desk/sheetStore.js supabaseStore makes (insert, select with eq / in / or filters, patch with return=representation) and ENFORCES the table's own constraints (the status values, a finalised or sent row needs its read, decision, time, seat and report number, the unique report number), so a write the real database would refuse is refused here too. It reads no network.
export function fakePostgrest({ seats = [{ id: 1, org_id: "hagerty", subject: "crew" }], refusePatch = null } = {}) {   // refusePatch(url, body): a reason string makes that PATCH answer 409 (a check's own way of making the database refuse one write)
  const tables = { desk_sheets: [], desk_case_versions: [], desk_case_exports: [], desk_seats: seats.map(s => ({ ...s })) }, log = [];
  const STATUS = ["new", "in_progress", "finalised", "sent", "needs_car"];
  const refuse = (row, rows, isNew) => {
    if (!STATUS.includes(row.status)) return "check desk_sheets_status";
    if (["finalised", "sent"].includes(row.status) && !(row.engine_read && row.decision && row.finalised_at && row.finalised_by_seat_id && row.report_number)) return "check desk_sheets_final_has_read";
    if (row.report_number && rows.some(r => r !== row && r.org_id === row.org_id && r.report_number === row.report_number)) return "unique desk_sheets_report_uniq";
    if (!tables.desk_seats.some(s => s.id === row.seat_id && s.org_id === row.org_id)) return "foreign key desk_sheets_seat_fk";
    if (isNew && rows.some(r => r.id === row.id)) return "duplicate key desk_sheets_pkey";
    return null;
  };
  const pick = (row, path) => path.split("->>").reduce((o, k) => (o == null ? o : o[k]), row);
  const match = (row, key, val) => {
    if (key === "or") return /sheet->>version\.is\.null/.test(decodeURIComponent(val)) ? (row.sheet && (row.sheet.version == null || Number(row.sheet.version) === 0)) : true;
    const k = decodeURIComponent(key), m = /^(eq|in|neq|gte|is)\.(.*)$/.exec(decodeURIComponent(val)); if (!m) return true;
    const got = pick(row, k); if (m[1] === "eq") return String(got) === m[2]; if (m[1] === "in") return m[2].replace(/[()]/g, "").split(",").includes(String(got));
    return true;
  };
  const filters = qs => [...new URLSearchParams(qs).entries()].filter(([k]) => !["select", "order", "limit"].includes(k));
  const fake = async (url, init = {}) => {
    const u = new URL(String(url)), table = u.pathname.split("/rest/v1/")[1], rows = tables[table], method = init.method || "GET";
    const f = [...u.searchParams.entries()].filter(([k]) => !["select", "order", "limit", "on_conflict"].includes(k)), res = (code, body) => ({ ok: code < 300, status: code, json: async () => body, text: async () => JSON.stringify(body) });
    if (!rows) return res(404, { message: "no table " + table });
    const hit = rows.filter(r => f.every(([k, v]) => match(r, k, v)));
    if (method === "GET") { log.push("GET " + table); return res(200, hit.map(r => ({ ...r }))); }
    if (method === "POST") { const body = JSON.parse(init.body); for (const b of body) { const why = table === "desk_sheets" ? refuse(b, rows, true) : null; if (why) { log.push("POST refused " + why); return res(409, { message: why }); } rows.push({ ...b }); } log.push("POST " + table); return res(201, body); }
    if (method === "PATCH") { const body = JSON.parse(init.body); const why0 = refusePatch && refusePatch(String(url), body); if (why0) { log.push("PATCH refused " + why0); return res(409, { message: why0 }); } for (const r of hit) { const next = { ...r, ...body }, why = table === "desk_sheets" ? refuse(next, rows.filter(x => x !== r).concat([next]), false) : null; if (why) { log.push("PATCH refused " + why); return res(409, { message: why }); } Object.assign(r, body); } log.push("PATCH " + table + " " + hit.length); return res(200, hit.map(r => ({ ...r }))); }
    if (method === "DELETE") { for (const r of hit) rows.splice(rows.indexOf(r), 1); log.push("DELETE " + table + " " + hit.length); return res(204, []); }
    return res(405, {});
  };
  return { fetch: fake, tables, log };
}
