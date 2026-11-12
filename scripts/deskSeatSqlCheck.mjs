// THE SETUP SQL LEAVES THE PREVIEW ABLE TO SAVE (Lane D, Nov 11 2026; Lane C's live run: deskpreviewseed failed with "no seat row for crew in hagerty", pv_hm answered 404, New case could not save).
// CAUSE: docs/supabase-desk-seat.sql added only Sam's seat and assumed the org row, the crew seat and a licence end already existed. Saving a case needs all of them: the org (foreign key), the seat the preview saves under (subject crew, read by sheetStore.seatId), and a licence end (the desk_sheets insert trigger refuses a sheet without one), within the org's seat limit.
// OTHER CARS AND PAGES: every case the preview saves (the demonstration car, the engine samples, New case by VIN), the rail, the report preview and the send dialog all read that store, so all stand on the same rows; the intake address needs the org's inbound_local and Sam's seat.
// The check reads the file Sam runs and fails when a row the preview needs is missing, when a statement would not do nothing on a second run, or when the placeholder guard is gone.
//   node scripts/deskSeatSqlCheck.mjs [rootDir] [--mutate]   (--mutate runs every mutant and expects each to fail)
import fs from "node:fs"; import path from "node:path";
const root = path.resolve(process.argv.find((a, i) => i > 1 && !a.startsWith("--")) || ".");
const read = f => fs.readFileSync(path.join(root, f), "utf8");
export function checkSql(sql, previewSeat = "crew") {
  const bad = [], need = (n, c) => { if (!c) bad.push(n); };
  const code = sql.split("\n").filter(l => !l.trim().startsWith("--")).join("\n"), flat = code.replace(/\s+/g, " ");
  need("the org row hagerty with inbound_local hagerty", /insert into desk_orgs \(id, name, inbound_local\) values \('hagerty', '[^']+', 'hagerty'\)/i.test(flat));
  need("the org settings row with a licence end", /insert into desk_org_settings \(org_id, seat_limit, licence_starts_on, licence_ends_on\) values \('hagerty', \d+, '\d{4}-\d\d-\d\d', '\d{4}-\d\d-\d\d'\)/i.test(flat));
  need("a licence end filled when the row existed without one", /update desk_org_settings set [^;]*licence_ends_on = coalesce\(licence_ends_on/i.test(flat));
  need("room for the seats (seat_limit raised to at least 3)", /seat_limit = greatest\(seat_limit, ([3-9]|\d\d)\)/i.test(flat) || /desk_org_settings \(org_id, seat_limit[^)]*\) values \('hagerty', ([3-9]|\d\d)/i.test(flat) && /greatest\(seat_limit/i.test(flat));
  need(`the preview seat (subject ${previewSeat})`, new RegExp(`insert into desk_seats \\([^)]*\\) values \\('hagerty', '${previewSeat}'`, "i").test(flat));
  need("Sam's seat with the email placeholder", /insert into desk_seats[^;]*'sam', addr/i.test(flat) && code.includes("<SAM_EMAIL>"));
  need("the placeholder guard (refuses to run unedited)", /raise exception[^;]*SAM_EMAIL/i.test(flat) && /addr like '%<%'/.test(flat));
  const inserts = flat.split(/insert into /i).slice(1);
  need("every insert does nothing on a repeat (on conflict do nothing)", inserts.length >= 4 && inserts.every(s => /on conflict \([^)]*\) do nothing/i.test(s.split(";")[0] + ";" + (s.split(";")[1] || "").slice(0, 0)) || /on conflict \([^)]*\) do nothing/i.test(s)));
  need("no table or function is created here", !/create (table|function)/i.test(flat));
  need("no email-address literal besides the placeholder", !/[a-z0-9._-]+@[a-z0-9-]+\.[a-z]{2,}/i.test(code.replace(/hagerty@desk\.goasksam\.com/g, "")));
  need("no em or en dash", !/[–—]/.test(sql));
  return bad;
}
const sql = read("docs/supabase-desk-seat.sql"), seatDefault = (read("lib/preview/deskPreview.js").match(/DESK_PREVIEW_SEAT \|\| "([^"]+)"/) || [])[1] || "crew";
const base = checkSql(sql, seatDefault);
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) pass++; else { fail++; console.log("FAIL " + n + (d ? " :: " + d : "")); } };
ok("the file leaves the preview able to save", base.length === 0, base.join("; "));
const mutants = [
  ["no org row", s => s.replace(/insert into desk_orgs[\s\S]*?do nothing;/i, "")],
  ["no crew seat", s => s.replace(/insert into desk_seats[^;]*'crew'[\s\S]*?do nothing;/i, "")],
  ["no licence end", s => s.replace(/insert into desk_org_settings[\s\S]*?do nothing;/i, "")],
  ["an insert that would double on a second run", s => s.replace("on conflict (org_id, subject) do nothing;\n\n-- 4", ";\n\n-- 4")],
  ["the placeholder guard removed", s => s.replace(/if addr like[^\n]*\n/, "")],
  ["a real address left in", s => s.replace("lower('<SAM_EMAIL>')", "lower('someone@example.com')")]
];
for (const [name, f] of mutants) { const b = checkSql(f(sql), seatDefault); ok(`fails without the fix: ${name}`, b.length > 0); }
console.log(`deskSeatSqlCheck: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
