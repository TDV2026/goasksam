// RLS CHECK for the Desk's tables and buckets (Lane S, Nov 4 2026; docs/supabase-desk-storage.sql, CLAUDE.md "Database security").
// What it proves, on a REAL Postgres built from the DDL files in docs/ (see scripts/_deskPg.mjs):
//   - ANON and any SIGNED-IN account read nothing from ANY desk_ table (the new ones AND the older desk_orgs, desk_seats,
//     desk_saved_views, desk_dictionary_queue, desk_aggregates: the class, not only the example), and cannot write.
//   - With a SELECT grant forced back on (a mistake someone could make), a seat still reads ONLY its own org's rows, an account
//     with no seat and a deactivated seat read nothing, and tables with no policy read nothing: RLS is the second wall.
//   - STORAGE: anon reads no object; a seat reads only its own org's bucket and folder; a stray object in the wrong bucket or the wrong
//     folder is invisible; nobody but the service role can write; no desk- bucket is public.
//   - No desk_ function can be executed by anon or authenticated (the one deliberate exception, desk_private.seat_orgs, is not in an exposed schema
//     and is executable by authenticated only).
//   - Rows cannot name another org's seat or sheet (composite foreign keys), or a path outside their own sheet.
//   - STATIC: every desk_ table declared in ANY docs/supabase-*.sql has RLS on and a revoke from anon, authenticated; every desk_ function revokes execute;
//     every JS reference to a desk_ table is declared in a DDL file (a new table cannot slip in without its DDL and its lock).
// Then the same assertions run against MUTANTS (the DDL with one protection removed): each must FAIL, so the check proves it can.
//   node scripts/rlsCheck.mjs          exit 1 on any failure; "SKIP" (never a pass) when no Postgres is installed.
import fs from "node:fs";
import path from "node:path";
import { urlFindings, URL_MUTANTS } from "./_deskUrls.mjs";
import { ROOT, readDdl, build, available, stop, U, S1, S2, denied, readsNothing } from "./_deskDb.mjs";

const SCRATCH = process.env.DESK_CHECK_TMP || undefined;

function allDdlText(files) {
  const dir = path.join(ROOT, "docs"), out = {};
  for (const f of fs.readdirSync(dir).filter(f => /^supabase-.*\.sql$/.test(f))) out[f] = files[f] != null ? files[f] : fs.readFileSync(path.join(dir, f), "utf8");
  return out;
}

export function staticFindings(files, extraSources = {}) {
  const fails = [], all = allDdlText(files);
  const joined = Object.values(all).join("\n");
  const revokes = [...joined.matchAll(/revoke\s+all\s+on\s+(?:table\s+)?([^;]*?)\s+from\s+anon\s*,\s*authenticated\s*;/gi)].flatMap(m => m[1].split(",").map(s => s.trim().toLowerCase()));
  const tables = new Set();
  for (const [f, t] of Object.entries(all)) for (const m of t.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(desk_\w+)/gi)) tables.add(m[1].toLowerCase());
  // ONE TABLE, ONE DDL (Lane C, Nov 4 2026): a desk_ table is created in exactly one docs/supabase-*.sql, so two lanes can never ship two shapes of the same table.
  { const where = new Map(); for (const [f, t] of Object.entries(all)) for (const m of t.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(desk_\w+)/gi)) { const k = m[1].toLowerCase(); where.set(k, [...new Set([...(where.get(k) || []), f])]); }
    for (const [t, fs] of where) if (fs.length > 1) fails.push(`static: ${t} is created in ${fs.length} DDL files (${fs.join(", ")}); one table has exactly one DDL`); }
  for (const t of tables) {
    if (!new RegExp(`alter\\s+table\\s+${t}\\s+enable\\s+row\\s+level\\s+security`, "i").test(joined)) fails.push(`static: ${t} has no "enable row level security"`);
    if (!revokes.includes(t)) fails.push(`static: ${t} has no "revoke all ... from anon, authenticated"`);
  }
  const fns = new Set([...joined.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(desk_\w+)\s*\(([^)]*)\)/gi)].map(m => `${m[1].toLowerCase()}(${m[2].trim().replace(/\s+/g, " ")})`));
  for (const fn of fns) {
    const name = fn.split("(")[0];
    if (!new RegExp(`revoke\\s+execute\\s+on\\s+function\\s+${name}\\s*\\([^)]*\\)\\s+from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated`, "i").test(joined)) fails.push(`static: function ${fn} does not revoke execute from public, anon, authenticated`);
  }
  for (const m of joined.matchAll(/insert\s+into\s+storage\.buckets[^;]*;/gi)) if (/'desk-/.test(m[0]) && !/,\s*false\s*\)/i.test(m[0])) fails.push("static: a desk- bucket is created without public = false");
  for (const m of joined.matchAll(/create\s+policy\s+[^;]*on\s+storage\.objects[^;]*;/gi)) {
    if (!/desk-/.test(m[0]) && !/desk_seat/.test(m[0])) continue;
    if (!/for\s+select/i.test(m[0])) fails.push("static: a storage policy for desk- objects is not read-only");
    if (!/seat_orgs\(\)/.test(m[0]) || !/foldername/.test(m[0])) fails.push("static: a storage policy for desk- objects does not scope by the seat's org and folder");
  }
  // JS side of the class: every desk_ table named in code must be declared in a DDL file.
  const declared = new Set([...tables, ...fns].map(s => s.split("(")[0]));
  declared.add("desk_queue_log");
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? (["node_modules", ".git", "proofs", "smoke-artifacts", "data"].includes(e.name) ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]);
  const sources = [];
  for (const base of ["lib", "api"]) for (const f of walk(path.join(ROOT, base)).filter(f => /\.(js|mjs)$/.test(f))) sources.push([f, fs.readFileSync(f, "utf8")]);
  for (const [name, t] of Object.entries(extraSources)) sources.push([path.join(ROOT, name), t]);
  for (const [f, t] of sources) {
    for (const m of t.matchAll(/(?:\/rest\/v1\/(?:rpc\/)?|supabaseSelect\([^`'"]*[`'"]|supabaseInsert\(\s*["']|supabaseDelete\([^`'"]*[`'"]|supabasePatch\([^`'"]*[`'"])(desk_\w+)/g))
      if (!declared.has(m[1])) fails.push(`static: ${path.relative(ROOT, f)} uses ${m[1]}, which no docs/supabase-*.sql declares`);
  }
  return [...new Set(fails)];
}

export async function dynamicFindings(files) {
  const fails = [], { c, db, errors } = await build(files, { baseDir: SCRATCH });
  if (errors.length) return errors.map(e => "apply: " + e);
  const q = (sql, role, sub) => c.run(db, sql, { role, sub });
  const tables = q("select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relkind='r' and relname like 'desk\\_%' order by 1").out.split("\n").filter(Boolean);
  if (tables.length < 11) fails.push(`only ${tables.length} desk_ tables exist`);

  // 0. The standing rule itself: no privilege at all for anon or authenticated on any desk_ table (RLS returning zero rows is not the same
  // as the grant being gone; this is the line a leaked key would otherwise lean on).
  for (const t of tables) for (const role of ["anon", "authenticated"]) {
    const g = q(`select has_table_privilege('${role}', 'public.${t}', 'select') or has_table_privilege('${role}', 'public.${t}', 'insert') or has_table_privilege('${role}', 'public.${t}', 'update') or has_table_privilege('${role}', 'public.${t}', 'delete')`).out;
    if (g !== "f") fails.push(`${role} still holds a privilege on ${t} (grant not revoked)`);
  }

  // 1. As shipped: no grant, no read, no write.
  for (const [who, role, sub] of [["anon", "anon", null], ["seat A", "authenticated", U.A], ["seat B", "authenticated", U.B], ["no-seat C", "authenticated", U.C]]) {
    for (const t of tables) {
      if (!readsNothing(q(`select count(*) from ${t}`, role, sub))) fails.push(`${who} can read ${t}`);
      const d = q(`with d as (delete from ${t} returning 1) select count(*) from d`, role, sub);
      if (!(denied(d) || (d.ok && d.out === "0"))) fails.push(`${who} can delete from ${t}`);
    }
  }
  if (q(`insert into desk_sheets (org_id, seat_id) select 'hagerty', id from desk_seats limit 1`, "authenticated", U.A).ok) fails.push("a seat can insert a sheet");
  if (q(`insert into desk_org_settings (org_id) values ('x')`, "authenticated", U.A).ok) fails.push("a seat can insert settings");
  if (q(`update desk_org_settings set licence_ends_on = '2099-01-01' where org_id = 'hagerty' returning 1`, "authenticated", U.A).out) fails.push("a seat can move its own licence date");

  // 2. The second wall: force SELECT back on and the policies must still keep a seat inside its org.
  q(`grant select on ${tables.join(", ")} to authenticated`);
  const cnt = (t, role, sub, where = "") => q(`select count(*) from ${t} ${where}`, role, sub).out;
  for (const t of ["desk_sheets", "desk_sheet_photos", "desk_sheet_documents", "desk_sheet_sent", "desk_org_settings"]) {
    if (cnt(t, "authenticated", U.A, "where org_id <> 'hagerty'") !== "0") fails.push(`${t}: seat A reads another org's rows once SELECT is granted`);
    if (cnt(t, "authenticated", U.B, "where org_id <> 'sam'") !== "0") fails.push(`${t}: seat B reads another org's rows once SELECT is granted`);
    if (cnt(t, "authenticated", U.C) !== "0") fails.push(`${t}: an account with no seat reads rows once SELECT is granted`);
    if (cnt(t, "authenticated", U.D) !== "0") fails.push(`${t}: a deactivated seat reads rows once SELECT is granted`);
    if (cnt(t, "authenticated", U.A) === "0") fails.push(`${t}: seat A cannot read its own org's rows (policy too tight, or the seed failed)`);
    if (cnt(t, "authenticated", U.A2) === "0") fails.push(`${t}: seat A2 cannot read its own org's rows`);
  }
  for (const t of ["desk_orgs", "desk_seats", "desk_saved_views", "desk_deletion_log", "desk_dictionary_queue", "desk_aggregates"]) {
    if (cnt(t, "authenticated", U.A) !== "0") fails.push(`${t}: RLS is not protecting it (a seat reads rows once SELECT is granted)`);
    if (cnt(t, "anon", null) !== "0" && !denied(q(`select count(*) from ${t}`, "anon", null))) fails.push(`${t}: anon reads rows once SELECT is granted`);
  }

  // 3. Storage.
  const objs = (role, sub) => q(`select name from storage.objects order by name`, role, sub).out.split("\n").filter(Boolean);
  if (objs("anon", null).length) fails.push("anon reads storage objects");
  const a = objs("authenticated", U.A), b = objs("authenticated", U.B);
  const wantA = [`hagerty/${S1}/orig/a.jpg`, `hagerty/${S1}/web/a.jpg`, `hagerty/brand/logo.png`].sort(), wantB = [`sam/${S2}/orig/b.jpg`];
  if (JSON.stringify([...a].sort()) !== JSON.stringify(wantA)) fails.push(`seat A reads storage objects [${a.join(", ")}] (want exactly its own org's)`);
  if (JSON.stringify(b) !== JSON.stringify(wantB)) fails.push(`seat B reads storage objects [${b.join(", ")}] (want exactly its own org's)`);
  if (objs("authenticated", U.C).length) fails.push("an account with no seat reads storage objects");
  if (objs("authenticated", U.D).length) fails.push("a deactivated seat reads storage objects");
  for (const [who, role, sub] of [["anon", "anon", null], ["seat A", "authenticated", U.A]]) {
    if (q(`insert into storage.objects (bucket_id, name) values ('desk-hagerty', 'hagerty/${S1}/orig/new.jpg')`, role, sub).ok) fails.push(`${who} can upload to a desk- bucket`);
    if (q(`with u as (update storage.objects set name = name || 'x' where bucket_id like 'desk-%' returning 1) select count(*) from u`, role, sub).out !== "0") fails.push(`${who} can rename a desk- object`);
    if (q(`with d as (delete from storage.objects where bucket_id like 'desk-%' returning 1) select count(*) from d`, role, sub).out !== "0") fails.push(`${who} can delete a desk- object`);
  }
  if (q(`select count(*) from storage.buckets where id like 'desk-%' and public`).out !== "0") fails.push("a desk- bucket is public");
  if (q(`select count(*) from storage.buckets where id in ('desk-hagerty','desk-sam')`).out !== "2") fails.push("the org buckets are missing");

  // 4. Functions.
  const fnLeak = q(`select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'desk\\_%' and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))`).out;
  if (fnLeak) fails.push(`anon or authenticated can execute: ${fnLeak.replace(/\n/g, ", ")}`);
  if (q(`select desk_delete_sheet('${S1}', 'sheet', 'x', 0, 0)`, "authenticated", U.A).ok) fails.push("a seat can call desk_delete_sheet");
  if (q(`select desk_private.seat_orgs()`, "anon", null).ok) fails.push("anon can call desk_private.seat_orgs");
  if (q(`select string_agg(x, ',') from desk_private.seat_orgs() x`, "authenticated", U.A).out !== "hagerty") fails.push("seat_orgs() does not return exactly the caller's own org");

  // 5. Rows cannot name another org's seat, sheet or path (as the service role would try).
  const samSeat = q(`select id from desk_seats where subject='${U.B}'`).out, hagSeat = q(`select id from desk_seats where subject='${U.A}'`).out;
  if (q(`insert into desk_sheets (org_id, seat_id) values ('hagerty', ${samSeat})`).ok) fails.push("a hagerty sheet can be owned by a sam seat");
  if (q(`insert into desk_sheet_photos (sheet_id, org_id, seat_id, original_path, resized_path) values ('${S2}', 'hagerty', ${hagSeat}, 'hagerty/${S2}/o.jpg', 'hagerty/${S2}/w.jpg')`).ok) fails.push("a hagerty photo can hang on a sam sheet");
  if (q(`insert into desk_sheet_photos (sheet_id, org_id, seat_id, original_path, resized_path) values ('${S1}', 'hagerty', ${hagSeat}, 'sam/${S2}/orig/b.jpg', 'hagerty/${S1}/w.jpg')`).ok) fails.push("a photo can point at another org's object");
  if (q(`insert into desk_sheet_documents (sheet_id, org_id, seat_id, kind, storage_path) values ('${S1}', 'hagerty', ${hagSeat}, 'file', 'hagerty/${S2}/doc/x.pdf')`).ok) fails.push("a document can point outside its own sheet");
  if (q(`update desk_org_settings set logo_path = 'sam/brand/logo.png' where org_id = 'hagerty'`).ok) fails.push("an org's logo can point at another org's folder");
  return fails;
}

const rep = (files, from, to, all = false) => { const s = files; if (!s.includes(from)) throw new Error("mutant did not apply: " + from.slice(0, 60)); return all ? s.split(from).join(to) : s.replace(from, () => to); };
export const MUTANTS = [
  ["new tables keep their grants", f => ({ ...f, "supabase-desk-storage.sql": rep(f["supabase-desk-storage.sql"], "revoke all on desk_org_settings, desk_sheets, desk_sheet_photos, desk_sheet_documents, desk_sheet_sent, desk_deletion_log from anon, authenticated;", "") })],
  ["older desk tables never revoked (the class)", f => ({ ...f, "supabase-desk-org.sql": rep(f["supabase-desk-org.sql"], "revoke all on desk_orgs, desk_seats, desk_saved_views from anon, authenticated;", ""), "supabase-desk-storage.sql": rep(f["supabase-desk-storage.sql"], "revoke all on desk_orgs, desk_seats, desk_saved_views from anon, authenticated;", "") })],
  ["RLS off on desk_sheets", f => ({ ...f, "supabase-desk-storage.sql": rep(f["supabase-desk-storage.sql"], "alter table desk_sheets         enable row level security;", "") })],
  ["sheets policy reads every org (using true)", f => ({ ...f, "supabase-desk-storage.sql": rep(f["supabase-desk-storage.sql"], "create policy desk_seat_read_org on desk_sheets for select to authenticated using (org_id in (select desk_private.seat_orgs()));", "create policy desk_seat_read_org on desk_sheets for select to authenticated using (true);") })],
  ["storage policy drops the org test", f => ({ ...f, "supabase-desk-storage.sql": rep(f["supabase-desk-storage.sql"], "    and (storage.foldername(name))[1] in (select desk_private.seat_orgs())\n", "") })],
  ["storage policy drops the bucket test", f => ({ ...f, "supabase-desk-storage.sql": rep(f["supabase-desk-storage.sql"], "    and bucket_id = 'desk-' || (storage.foldername(name))[1]\n", "") })],
  ["a storage write policy exists", f => ({ ...f, "supabase-desk-storage.sql": f["supabase-desk-storage.sql"] + "\ncreate policy desk_seat_write on storage.objects for insert to authenticated with check (bucket_id like 'desk-%');\n" })],
  ["the hagerty bucket is public", f => ({ ...f, "supabase-desk-storage.sql": rep(f["supabase-desk-storage.sql"], "values ('desk-hagerty', 'desk-hagerty', false) on conflict (id) do update set public = false;", "values ('desk-hagerty', 'desk-hagerty', true) on conflict (id) do update set public = true;") })],
  ["desk_delete_sheet executable by anyone", f => ({ ...f, "supabase-desk-storage.sql": rep(f["supabase-desk-storage.sql"], "revoke execute on function desk_delete_sheet(uuid, text, text, integer, bigint) from public, anon, authenticated;", "") })],
  ["a sheet can name another org's seat", f => ({ ...f, "supabase-desk-storage.sql": rep(f["supabase-desk-storage.sql"], "  constraint desk_sheets_seat_fk      foreign key (seat_id, org_id)              references desk_seats(id, org_id),\n", "") })],
  ["a deactivated seat still counts", f => ({ ...f, "supabase-desk-storage.sql": rep(f["supabase-desk-storage.sql"], "where s.subject = auth.uid()::text and s.active", "where s.subject = auth.uid()::text") })]
];

export async function main() {
  const real = readDdl(); let pass = 0, fail = 0;
  const bad = m => { fail++; console.log("FAIL " + m); }, ok = () => { pass++; };
  const st = staticFindings(real); st.length ? st.forEach(bad) : ok();
  // Signed urls: the caller's org only, one hour, never stored. Runs without Postgres; each mutant must fail.
  const uf = await urlFindings(); uf.length ? uf.forEach(bad) : ok();
  for (const [name, m] of URL_MUTANTS) {
    let f; try { f = await urlFindings(m); } catch (e) { bad(`url mutant "${name}": ${e.message}`); continue; }
    if (f.length) { ok(); if (process.env.VERBOSE) console.log(`  caught "${name}": ${f[0].slice(0, 110)}`); } else bad(`url mutant "${name}" was NOT caught`);
  }
  if (!available()) { console.log("SKIP rlsCheck dynamic part: no local Postgres (initdb/pg_ctl/psql). The static part ran; this is NOT a pass of the dynamic part."); console.log(`rlsCheck: ${pass} passed, ${fail} failed, dynamic SKIPPED`); return fail ? 1 : 0; }
  const dyn = await dynamicFindings(real); dyn.length ? dyn.forEach(bad) : ok();
  for (const [name, mut] of MUTANTS) {
    let files; try { files = mut(real); } catch (e) { bad(`mutant "${name}": ${e.message}`); continue; }
    const s = staticFindings(files), d = await dynamicFindings(files);
    if (d.length && /^apply:/.test(d[0])) { bad(`mutant "${name}" did not even apply (${d[0].slice(0, 100)}): it proves nothing`); continue; }
    // The live-database part must catch it ON ITS OWN: a regex over the SQL text alone is not proof the database is locked.
    if (d.length) { ok(); if (process.env.VERBOSE) console.log(`  caught "${name}" (database): ${d[0].slice(0, 110)}`); } else bad(`mutant "${name}" was NOT caught by the database part${s.length ? " (only the static text scan saw it)" : ""}`);
  }
  // The JS half of the class: a desk_ table used in code with no DDL for it (so no lock) must fail the static sweep.
  const ghost = staticFindings(real, { "lib/desk/_ghost.js": "await supabaseSelect(env, `desk_ghost_table?select=id`);" });
  if (ghost.some(x => /desk_ghost_table/.test(x))) ok(); else bad("mutant \"a desk_ table used in code with no DDL\" was NOT caught");
  // ONE TABLE, ONE DDL: a second file creating desk_sheets (here appended to the org DDL) must fail the static sweep.
  const twice = staticFindings({ ...real, "supabase-desk-org.sql": real["supabase-desk-org.sql"] + "\ncreate table if not exists desk_sheets (id text primary key);\n" });
  if (twice.some(x => /desk_sheets is created in 2 DDL files/.test(x))) ok(); else bad("mutant \"a second DDL file creates desk_sheets\" was NOT caught");
  console.log(`rlsCheck: ${pass} passed, ${fail} failed (${MUTANTS.length} DDL mutants + 1 undeclared-table mutant, each must be caught)`);
  return fail ? 1 : 0;
}
if (import.meta.url === `file://${process.argv[1]}`) { const code = await main(); stop(); process.exit(code); }
