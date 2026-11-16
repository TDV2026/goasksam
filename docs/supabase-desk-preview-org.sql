-- DESK PREVIEW ORG FOR THE THREE SAMPLE CASES (Lane D, Nov 15 2026; Sam's decision). Sam runs this ONCE in the Supabase SQL Editor, BEFORE Lane C runs the deskpreviewmove ops task.
-- The sample cases pv_240z, pv_thin and pv_fin leave the Hagerty org; they live in their own org, hagerty-preview, so the Hagerty queue shows real cases and the demonstration 911 (pv_hm) only.
-- It needs no edit. Safe to run twice: every statement does nothing on a repeat (an existing row is left as it is). It adds no table and no function, so there is nothing to lock down here.
-- Run it AFTER docs/supabase-desk-org.sql, docs/supabase-desk-storage.sql and docs/supabase-desk-seat.sql.

-- 1. The org (no intake address: nothing is forwarded to it).
insert into desk_orgs (id, name)
values ('hagerty-preview', 'Hagerty preview samples')
on conflict (id) do nothing;

-- 2. The org's settings with a licence end (a case cannot be saved without one).
insert into desk_org_settings (org_id, seat_limit, licence_starts_on, licence_ends_on)
values ('hagerty-preview', 3, '2026-11-04', '2027-11-04')
on conflict (org_id) do nothing;

-- 3. The preview's seat (subject crew): the Desk preview saves every sample case under it.
insert into desk_seats (org_id, subject, email, role, display_name, active)
values ('hagerty-preview', 'crew', null, 'owner', 'Crew preview', true)
on conflict (org_id, subject) do nothing;
