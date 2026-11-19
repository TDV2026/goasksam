// RETENTION CHECK for Desk storage (Lane S, Nov 4 2026). Spec: "Retention: licence plus ninety days, earlier deletion logged"; photos and
// documents "deleted with the sheet or on org request".
// Proves (the date arithmetic in code AND in the database agree; the sweep deletes exactly what is due, in the safe order, and logs):
//   1. deleteAfterDate(licence end) = licence end + 90 days, incl. month ends, leap day and year ends; bad dates are null.
//   2. The database stamps the same date on every new sheet (trigger), refuses a sheet for an org with NO licence end, and moves every
//      sheet's date when the licence end moves (renewal). desk_retention_days() equals RETENTION_DAYS.
//   3. A finalised sheet cannot be edited and the sent log is never edited (immutability), and a sheet cannot be finalised without its read.
//   4. Deleting a sheet in the database removes its photo, document and sent rows (with the sheet) and ALWAYS writes a log row, even for a raw delete.
//   5. The sweep: deletes a sheet that is due and not one that is not; removes the STORAGE objects before the rows; when the objects cannot be
//      removed (or listed) it deletes NOTHING and reports the failure; logs the reason, actor and counts; one org's sweep never touches another org's objects.
//   6. An org purge removes every sheet's objects and the brand folder, and logs the org-level deletion.
// Then each of these is run against a MUTANT with the protection removed; every mutant must fail.
//   node scripts/retentionCheck.mjs      exit 1 on any failure; the database part says SKIP (never a pass) with no local Postgres.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT, readDdl, build, available, stop, S1, S2 } from "./_deskDb.mjs";
import { installFake } from "./_deskFakes.mjs";

const SCRATCH = process.env.DESK_CHECK_TMP || undefined;
const LIB = path.join(ROOT, "lib/desk");

// Load lib/desk/<file> with a source transform applied (for mutants). The copy sits beside the original so its relative imports resolve.
// storageT mutates storage.js; retention.js is then loaded from a copy that imports THAT storage copy, so the sweep runs through the mutant too.
let seq = 0;
async function loadPair(retentionT, storageT) {
  const read = f => fs.readFileSync(path.join(LIB, f), "utf8"), mine = [];
  const put = (name, src) => { const p = path.join(LIB, name); fs.writeFileSync(p, src); mine.push(p); return pathToFileURL(p).href; };
  try {
    const n = ++seq;
    if (!retentionT && !storageT) return { ret: await import(pathToFileURL(path.join(LIB, "retention.js")).href + "?real"), sto: await import(pathToFileURL(path.join(LIB, "storage.js")).href + "?real") };
    const stoName = `__mut${n}_storage.js`;
    const stoUrl = put(stoName, storageT ? storageT(read("storage.js")) : read("storage.js"));
    let rsrc = read("retention.js").replace('"./storage.js"', `"./${stoName}"`);
    if (retentionT) rsrc = retentionT(rsrc);
    const retUrl = put(`__mut${n}_retention.js`, rsrc);
    return { ret: await import(retUrl), sto: await import(stoUrl) };
  } finally { for (const p of mine) fs.rmSync(p, { force: true }); }
}

export async function jsFindings({ retentionT, storageT } = {}) {
  const fails = [], { ret, sto } = await loadPair(retentionT, storageT);
  // retention.js imports ./storage.js (the real one). For a storage mutant, rebuild a sweep over the mutated module by calling its deleteSheetEverywhere directly.
  const env = { supabaseUrl: "https://x.supabase.test", supabaseKey: "svc" };
  const eq = (a, b, m) => { if (a !== b) fails.push(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };

  // 1. arithmetic
  eq(ret.RETENTION_DAYS, 90, "RETENTION_DAYS");
  eq(ret.deleteAfterDate("2027-10-31"), "2028-01-29", "2027-10-31 + 90");
  eq(ret.deleteAfterDate("2027-12-31"), "2028-03-30", "year end + 90 (leap year)");
  eq(ret.deleteAfterDate("2028-02-29"), "2028-05-29", "leap day + 90");
  eq(ret.deleteAfterDate("2026-11-04"), "2027-02-02", "plain date + 90");
  eq(ret.deleteAfterDate("2027-02-30"), null, "impossible date");
  eq(ret.deleteAfterDate(""), null, "empty"); eq(ret.deleteAfterDate("31/10/2027"), null, "wrong format");
  eq(ret.isDue("2028-01-29", "2028-01-29"), true, "due on the day"); eq(ret.isDue("2028-01-30", "2028-01-29"), false, "not due the day before"); eq(ret.isDue(null, "2030-01-01"), false, "no date is not due");

  // 5. the sweep and the delete, against the in-memory Supabase
  const SA = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa", SB = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb", SC = "cccccccc-3333-4333-8333-cccccccccccc";
  const mk = () => ({
    fail: {},
    sheets: [{ id: SA, org_id: "hagerty", delete_after: "2028-01-29" }, { id: SB, org_id: "hagerty", delete_after: "2028-06-01" }, { id: SC, org_id: "sam", delete_after: "2028-01-29" }],
    objects: new Map([
      [`hagerty/${SA}/orig/1.jpg`, { bucket: "desk-hagerty", bytes: 100 }], [`hagerty/${SA}/web/1.jpg`, { bucket: "desk-hagerty", bytes: 10 }], [`hagerty/${SA}/doc/2.pdf`, { bucket: "desk-hagerty", bytes: 50 }],
      [`hagerty/${SB}/orig/3.jpg`, { bucket: "desk-hagerty", bytes: 100 }], [`hagerty/brand/logo.png`, { bucket: "desk-hagerty", bytes: 5 }],
      [`sam/${SC}/orig/4.jpg`, { bucket: "desk-sam", bytes: 100 }]
    ])
  });
  const sweep = async (state, today = "2028-01-29") => { const undo = installFake(state); try { return await ret.retentionSweep(env, { today }); } finally { undo(); } };
  let st = mk(); let r = await sweep(st);
  eq(r.deleted, 2, "sweep deletes the two due sheets (one per org)"); eq(st.sheets.map(s => s.id).join(), SB, "the not-yet-due sheet is kept");
  eq(st.objects.has(`hagerty/${SB}/orig/3.jpg`), true, "a not-due sheet's objects are kept");
  eq([...st.objects.keys()].some(k => k.includes(SA) || k.includes(SC)), false, "due sheets' objects are gone");
  eq(st.objects.has("hagerty/brand/logo.png"), true, "the org's logo is not a sheet's object and stays on a sheet sweep");
  eq(st.log.length, 2, "two log rows"); eq(st.log.every(l => l.reason === "retention" && l.actor === "retention" && l.objects >= 1), true, "log rows carry reason, actor, object count");
  const iLastRemove = st.calls.map((c, i) => /DELETE \/storage/.test(c) ? i : -1).filter(i => i >= 0).pop(), iFirstRpc = st.calls.findIndex(c => /rpc\/desk_delete_sheet/.test(c));
  eq(iLastRemove >= 0 && iFirstRpc >= 0 && st.calls.findIndex(c => /DELETE \/storage/.test(c)) < iFirstRpc, true, "storage objects are removed BEFORE the rows");
  st = mk(); st.fail.remove = true; r = await sweep(st);
  eq(r.deleted, 0, "objects cannot be removed: nothing deleted"); eq(st.sheets.length, 3, "objects cannot be removed: every row kept"); eq(r.ok, false, "objects cannot be removed: reported as failed"); eq(r.failed.length, 2, "both failures named");
  st = mk(); st.fail.list = true; r = await sweep(st);
  eq(r.deleted, 0, "listing fails: nothing deleted"); eq(st.sheets.length, 3, "listing fails: every row kept");
  st = mk(); r = await sweep(st, "2027-12-31"); eq(r.deleted, 0, "nothing due: nothing deleted"); eq(st.objects.size, 6, "nothing due: all objects kept");
  // a sheet asked for under the wrong org is not found, so another org's objects are never reached
  st = mk(); { const undo = installFake(st); const d = await sto.deleteSheetEverywhere(env, { org: "hagerty", sheetId: SC, reason: "sheet", actor: "seat:1" }); undo();
    eq(d.ok, false, "a hagerty delete of a sam sheet is refused"); eq(st.objects.has(`sam/${SC}/orig/4.jpg`), true, "a hagerty delete cannot touch a sam object"); eq(st.sheets.some(s => s.id === SC), true, "...or its row"); }
  st = mk(); { const undo = installFake(st); const d = await sto.deleteSheetEverywhere(env, { org: "hagerty", sheetId: SA, reason: "", actor: "x" }); undo(); eq(d.ok, false, "a deletion without a reason is refused"); eq(st.sheets.length, 3, "...and nothing is deleted"); }
  // 6. org purge
  st = mk(); { const undo = installFake(st); const d = await sto.purgeOrg(env, { org: "hagerty", actor: "crew" }); undo();
    eq(d.ok, true, "purge ok"); eq([...st.objects.keys()].filter(k => k.startsWith("hagerty/")).length, 0, "purge removes every hagerty object incl. the logo");
    eq(st.objects.has(`sam/${SC}/orig/4.jpg`), true, "purge leaves the other org's objects"); eq(st.sheets.filter(s => s.org_id === "hagerty").length, 0, "purge deletes the org's sheets");
    eq(st.log.some(l => l.scope === "org" && l.reason === "org_request" && l.org_id === "hagerty"), true, "purge logs the org-level deletion"); }
  // path hygiene
  eq(sto.pathInOrg("hagerty", "hagerty/../sam/x"), false, "no traversal"); eq(sto.pathInOrg("hagerty", "sam/x/y"), false, "another org's path"); eq(sto.pathInOrg("hagerty", "hagerty/s/orig/a.jpg"), true, "own path");
  eq(sto.seatMayRead("hagerty", `sam/${SC}/orig/4.jpg`), false, "a hagerty seat may not be signed a sam path");
  return fails;
}

export async function dbFindings(files) {
  const fails = [], { c, db, errors } = await build(files, { baseDir: SCRATCH });
  if (errors.length) return errors.map(e => "apply: " + e);
  const q = (sql) => c.run(db, sql);
  const eq = (a, b, m) => { if (a !== b) fails.push(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };
  const days = Number(q("select desk_retention_days()").out);
  eq(days, 90, "desk_retention_days()");
  eq(q(`select delete_after from desk_sheets where id='${S1}'`).out, "2028-01-29", "the trigger stamps licence end + 90");
  // no licence end -> refused
  q(`insert into desk_orgs (id, name) values ('nolic','No Licence'); insert into desk_seats (org_id, subject, role) values ('nolic','u-nolic','admin'); insert into desk_org_settings (org_id) values ('nolic');`);
  const noLic = q(`insert into desk_sheets (org_id, seat_id) select 'nolic', id from desk_seats where org_id='nolic'`);
  if (noLic.ok) fails.push("a sheet was created for an org with no licence end");
  // renewal moves every sheet
  q(`update desk_org_settings set licence_ends_on = '2028-10-31' where org_id='hagerty'`);
  eq(q(`select delete_after from desk_sheets where id='${S1}'`).out, "2029-01-29", "a renewal moves the sheet's delete date");
  eq(q(`select delete_after from desk_sheets where id='${S2}'`).out, "2028-01-29", "...and only that org's sheets");
  // immutability
  const hagSeat = q(`select id from desk_seats where subject like 'aaaaaaaa-0000-4000-8000-00000000000a'`).out;
  if (q(`update desk_sheets set status='finalised' where id='${S1}'`).ok) fails.push("a sheet was finalised without its read, decision and report number");
  const fin = q(`update desk_sheets set status='finalised', engine_read='{"n":1}', decision='{"reserve":1}', finalised_at=now(), finalised_by_seat_id=${hagSeat}, report_number='R-1' where id='${S1}'`);
  if (!fin.ok) fails.push("could not finalise a complete sheet: " + fin.err.split("\n")[0]);
  if (q(`update desk_sheets set car_label='changed' where id='${S1}'`).ok) fails.push("a finalised sheet's car was edited");
  if (q(`update desk_sheets set decision='{"reserve":2}' where id='${S1}'`).ok) fails.push("a finalised sheet's decision was edited");
  if (q(`update desk_sheets set status='in_progress' where id='${S1}'`).ok) fails.push("a finalised sheet was reopened");
  if (!q(`update desk_sheets set status='sent', sent_at=now() where id='${S1}'`).ok) fails.push("a finalised sheet could not be marked sent");
  if (q(`update desk_sheet_sent set to_address='x@y.test' where sheet_id='${S1}'`).ok) fails.push("the sent log was edited");
  // deletion with the sheet, always logged
  const del = q(`select desk_delete_sheet('${S1}', 'org_request', 'crew', 3, 160)`);
  if (!del.ok) fails.push("desk_delete_sheet failed: " + del.err.split("\n")[0]);
  eq(q(`select (select count(*) from desk_sheet_photos where sheet_id='${S1}') + (select count(*) from desk_sheet_documents where sheet_id='${S1}') + (select count(*) from desk_sheet_sent where sheet_id='${S1}')`).out, "0", "photos, documents and the sent copy go with the sheet");
  eq(q(`select reason || '|' || actor || '|' || objects || '|' || bytes from desk_deletion_log where sheet_id='${S1}'`).out, "org_request|crew|3|160", "the RPC logs reason, actor and counts");
  q(`delete from desk_sheets where id='${S2}'`);
  eq(q(`select reason from desk_deletion_log where sheet_id='${S2}'`).out, "unspecified", "a raw delete is still logged");
  return fails;
}

const rep = (s, from, to) => { if (!s.includes(from)) throw new Error("mutant did not apply: " + from.slice(0, 60)); return s.replace(from, () => to); };
export const JS_MUTANTS = [
  ["retention is 60 days, not 90", { retentionT: s => rep(s, "RETENTION_DAYS = 90", "RETENTION_DAYS = 60") }],
  ["rows deleted before the objects", { storageT: s => rep(rep(s, "  const gone = await removeObjects(env, org, listed.objects.map(o => o.path));\n  if (!gone.ok) return { ok: false, error: \"could not remove objects: \" + gone.error };\n", ""), "  return { ok: true, objects: listed.objects.length, bytes, rows: r.value };", "  await removeObjects(env, org, listed.objects.map(o => o.path));\n  return { ok: true, objects: listed.objects.length, bytes, rows: r.value };") }],
  ["objects failing to delete still delete the rows", { storageT: s => rep(s, "  if (!gone.ok) return { ok: false, error: \"could not remove objects: \" + gone.error };\n  const bytes", "  const bytes") }],
  ["a failed listing still deletes", { storageT: s => rep(s, "  if (!listed.ok) return { ok: false, error: \"could not list objects: \" + listed.error };\n", "") }],
  ["the sweep deletes sheets that are not due", { retentionT: s => rep(rep(s, "    if (!isDue(s.delete_after, today)) continue;   // belt and braces: never trust the filter alone\n", ""), "delete_after=lte.${today}", "delete_after=lte.9999-12-31") }],
  ["a delete under the wrong org goes through", { storageT: s => rep(s, "  const sheet = await sheetInOrg(env, org, sheetId);\n  if (!sheet) return { ok: false, error: \"no such sheet in this org\" };\n  const listed", "  const listed") }],
  ["a traversal path counts as inside the org", { storageT: s => rep(s, "&& !path.split(\"/\").some(p => p === \"..\" || p === \".\" || p === \"\")", "") }],
  ["a deletion needs no reason", { storageT: s => rep(s, "  if (![\"sheet\", \"retention\", \"org_request\", \"early\"].includes(reason)) return { ok: false, error: \"a deletion needs a reason\" };\n", "") }]
];
const sqlRep = (f, from, to) => ({ ...f, "supabase-desk-storage.sql": rep(f["supabase-desk-storage.sql"], from, to) });
export const DB_MUTANTS = [
  ["database retention is 60 days", f => sqlRep(f, "select 90 $$", "select 60 $$")],
  ["a sheet can be made with no licence end", f => sqlRep(f, "    if le is null then raise exception", "    if false then raise exception")],
  ["a renewal does not move the sheets", f => sqlRep(f, "    update desk_sheets set delete_after = new.licence_ends_on + desk_retention_days() where org_id = new.org_id;", "    null;")],
  ["a finalised sheet can be edited", f => sqlRep(f, "create trigger desk_sheet_immutable_trg before update on desk_sheets for each row execute function desk_sheet_immutable();", "")],
  ["a raw delete is not logged", f => sqlRep(f, "create trigger desk_sheet_delete_log_trg before delete on desk_sheets for each row execute function desk_sheet_delete_log();", "")],
  ["the sent log can be edited", f => sqlRep(f, "create trigger desk_sent_immutable_trg before update on desk_sheet_sent for each row execute function desk_sent_immutable();", "")],
  ["photos are not deleted with the sheet", f => sqlRep(f, "constraint desk_photos_sheet_fk foreign key (sheet_id, org_id) references desk_sheets(id, org_id) on delete cascade,", "constraint desk_photos_sheet_fk foreign key (sheet_id, org_id) references desk_sheets(id, org_id) on delete no action,")],
  ["a sheet can be finalised with no read", f => sqlRep(f, "  constraint desk_sheets_final_has_read check (status not in ('finalised','sent') or (engine_read is not null and decision is not null and finalised_at is not null and finalised_by_seat_id is not null and report_number is not null))\n", "  constraint desk_sheets_final_has_read check (true)\n")]
];

export async function main() {
  let pass = 0, fail = 0; const bad = m => { fail++; console.log("FAIL " + m); }, ok = () => { pass++; };
  const js = await jsFindings(); js.length ? js.forEach(bad) : ok();
  for (const [name, m] of JS_MUTANTS) {
    let f; try { f = await jsFindings(m); } catch (e) { f = ["threw: " + e.message]; }
    if (f.length) { ok(); if (process.env.VERBOSE) console.log(`  caught "${name}": ${f[0].slice(0, 120)}`); } else bad(`mutant "${name}" was NOT caught`);
  }
  if (!available()) { console.log("SKIP retentionCheck database part: no local Postgres. NOT a pass of the database part."); console.log(`retentionCheck: ${pass} passed, ${fail} failed, database part SKIPPED`); return fail ? 1 : 0; }
  const real = readDdl(), db = await dbFindings(real); db.length ? db.forEach(bad) : ok();
  for (const [name, m] of DB_MUTANTS) {
    let files; try { files = m(real); } catch (e) { bad(`mutant "${name}": ${e.message}`); continue; }
    const f = await dbFindings(files);
    if (f.length && /^apply:/.test(f[0])) { bad(`mutant "${name}" did not even apply (${f[0].slice(0, 100)}): it proves nothing`); continue; }
    if (f.length) { ok(); if (process.env.VERBOSE) console.log(`  caught "${name}": ${f[0].slice(0, 120)}`); } else bad(`mutant "${name}" was NOT caught`);
  }
  console.log(`retentionCheck: ${pass} passed, ${fail} failed (${JS_MUTANTS.length} code mutants + ${DB_MUTANTS.length} database mutants, each must be caught)`);
  return fail ? 1 : 0;
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) { const code = await main(); stop(); process.exit(code); }
