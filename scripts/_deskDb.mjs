// Shared by rlsCheck / retentionCheck / orgSettingsCheck (Lane S, Nov 4 2026): build a scratch database from the real DDL files
// (optionally with a MUTATED copy of one file, to prove a check can fail), and seed two orgs with two seats each plus objects.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { available, startCluster } from "./_deskPg.mjs";

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DDL = ["supabase-desk-org.sql", "supabase-desk-dictionary-queue.sql", "supabase-desk-aggregates.sql", "supabase-desk-storage.sql"];
export const readDdl = () => Object.fromEntries(DDL.map(f => [f, fs.readFileSync(path.join(ROOT, "docs", f), "utf8")]));
export { available };

// Users: A (hagerty admin), A2 (hagerty member), B (sam seat), C (signed in, no seat), D (hagerty seat, deactivated).
export const U = {
  A: "aaaaaaaa-0000-4000-8000-00000000000a", A2: "aaaaaaaa-0000-4000-8000-0000000000a2", B: "bbbbbbbb-0000-4000-8000-00000000000b",
  C: "cccccccc-0000-4000-8000-00000000000c", D: "dddddddd-0000-4000-8000-00000000000d"
};
export const S1 = "11111111-1111-4111-8111-111111111111", S2 = "22222222-2222-4222-8222-222222222222";

let cluster = null, n = 0;
export async function cl(baseDir) { if (!cluster) cluster = await startCluster(baseDir); return cluster; }
export function stop() { if (cluster) { cluster.stop(); cluster = null; } }

// files: the DDL map (possibly mutated). Returns { c, db, errors } where errors lists any file that failed to apply.
export async function build(files, { seed = true, baseDir } = {}) {
  const c = await cl(baseDir); const db = c.newDb("d" + (++n)); const errors = [];
  for (const f of DDL) { const r = c.run(db, files[f]); if (!r.ok) errors.push(`${f}: ${r.err.split("\n").find(l => /ERROR/.test(l)) || r.err.split("\n")[0]}`); }
  if (seed && !errors.length) {
    const r = c.run(db, `
      update desk_org_settings set licence_starts_on = '2026-11-01', licence_ends_on = '2027-10-31' where org_id in ('hagerty','sam');
      insert into desk_seats (org_id, subject, email, role) values
        ('hagerty','${U.A}','a@hagerty.test','admin'), ('hagerty','${U.A2}','a2@hagerty.test','member'), ('sam','${U.B}','b@sam.test','member');
      insert into desk_seats (org_id, subject, email, role, active) values ('hagerty','${U.D}','d@hagerty.test','member', false);
      insert into desk_sheets (id, org_id, seat_id, vin, car_label) select '${S1}', 'hagerty', id, 'WP0AA2A97HS000001', 'Hagerty car' from desk_seats where subject = '${U.A}';
      insert into desk_sheets (id, org_id, seat_id, vin, car_label) select '${S2}', 'sam', id, 'WP0AA2A97HS000002', 'Sam car' from desk_seats where subject = '${U.B}';
      insert into desk_sheet_photos (sheet_id, org_id, seat_id, original_path, resized_path) select '${S1}', 'hagerty', id, 'hagerty/${S1}/orig/a.jpg', 'hagerty/${S1}/web/a.jpg' from desk_seats where subject = '${U.A}';
      insert into desk_sheet_photos (sheet_id, org_id, seat_id, original_path, resized_path) select '${S2}', 'sam', id, 'sam/${S2}/orig/b.jpg', 'sam/${S2}/web/b.jpg' from desk_seats where subject = '${U.B}';
      insert into desk_sheet_documents (sheet_id, org_id, seat_id, kind, storage_path) select '${S1}', 'hagerty', id, 'file', 'hagerty/${S1}/doc/t.pdf' from desk_seats where subject = '${U.A}';
      insert into desk_sheet_sent (sheet_id, org_id, seat_id, to_address, from_address) select '${S1}', 'hagerty', id, 'seller@x.test', 'marketplace@hagerty.test' from desk_seats where subject = '${U.A}';
      insert into storage.objects (bucket_id, name) values ('desk-hagerty','hagerty/${S1}/orig/a.jpg'), ('desk-hagerty','hagerty/${S1}/web/a.jpg'), ('desk-hagerty','hagerty/brand/logo.png'),
        ('desk-sam','sam/${S2}/orig/b.jpg'), ('desk-hagerty','sam/${S2}/orig/stray.jpg'), ('desk-sam','hagerty/${S1}/orig/stray.jpg');`);
    if (!r.ok) errors.push("seed: " + r.err.split("\n")[0]);
  }
  return { c, db, errors };
}

// Run sql as role/sub; "reads nothing" = permission denied or zero rows.
export const denied = r => !r.ok && /permission denied|row-level security|must be owner|does not exist/i.test(r.err);
export const readsNothing = r => denied(r) || (r.ok && (r.out === "" || r.out === "0"));
