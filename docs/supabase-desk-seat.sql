-- DESK PREVIEW SETUP FOR THE HAGERTY ORG (Lane D, Nov 11 2026). Sam runs this ONCE in the Supabase SQL Editor.
-- THE ONE LINE TO EDIT: the last statement, where it says <SAM_EMAIL>. Put the address you forward leads from, between the quotes, and keep the quotes.
-- Safe to run twice: every statement does nothing on a repeat (an existing row is left as it is). It adds no table and no function, so there is nothing to lock down here (the desk tables already have row level security on and no grant to anon or authenticated).
-- Run it AFTER docs/supabase-desk-org.sql, docs/supabase-desk-storage.sql and docs/supabase-desk-intake.sql.
-- It does not print or read the seat list.

-- 1. The org, and the address forwards arrive at (hagerty@desk.goasksam.com).
insert into desk_orgs (id, name, inbound_local)
values ('hagerty', 'Hagerty Marketplace', 'hagerty')
on conflict (id) do nothing;
update desk_orgs set inbound_local = 'hagerty' where id = 'hagerty' and inbound_local is null;

-- 2. The org's settings with a licence end (a case cannot be saved without one) and room for the seats below. Existing values are kept.
insert into desk_org_settings (org_id, seat_limit, licence_starts_on, licence_ends_on)
values ('hagerty', 5, '2026-11-04', '2027-11-04')
on conflict (org_id) do nothing;
update desk_org_settings set licence_starts_on = coalesce(licence_starts_on, '2026-11-04'), licence_ends_on = coalesce(licence_ends_on, '2027-11-04'), seat_limit = greatest(seat_limit, 5) where org_id = 'hagerty';

-- 3. The preview's seat (subject crew): the Desk preview saves every case under it.
insert into desk_seats (org_id, subject, email, role, display_name, active)
values ('hagerty', 'crew', null, 'owner', 'Crew preview', true)
on conflict (org_id, subject) do nothing;

-- 4. Sam's seat. EDIT THE NEXT LINE ONLY: replace <SAM_EMAIL> with your address. It refuses to run while the placeholder is still there.
do $$
declare addr text := lower('<SAM_EMAIL>');   -- EDIT THIS LINE: replace <SAM_EMAIL> with your email address, keep the quotes
begin
  if addr like '%<%' or addr not like '%_@_%' then raise exception 'Put your email address in place of <SAM_EMAIL> first'; end if;
  insert into desk_seats (org_id, subject, email, role, display_name, active)
  values ('hagerty', 'sam', addr, 'admin', 'Sam', true)
  on conflict (org_id, subject) do nothing;
end $$;
-- check (shows no addresses): select o.id, o.inbound_local, (select count(*) from desk_seats where org_id = o.id and subject = 'crew') as crew_seat, (select count(*) from desk_seats where org_id = o.id and subject = 'sam') as sam_seat, s.licence_ends_on from desk_orgs o left join desk_org_settings s on s.org_id = o.id where o.id = 'hagerty';
