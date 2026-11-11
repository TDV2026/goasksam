-- ONE SEAT FOR THE HAGERTY ORG (Lane D, Nov 11 2026). Sam runs this himself in the Supabase SQL Editor, after replacing <SAM_EMAIL> with the address he forwards leads from.
-- A forwarded lead is accepted only from the email of an ACTIVE seat of the org (lib/desk/intake/run.js). No lane reads or prints the seat list.
-- Safe to run twice: the same subject is updated, never doubled. It adds no table and no function, so there is nothing to lock down here (desk_seats already has row level security on and no grant to anon or authenticated).
insert into desk_seats (org_id, subject, email, role, display_name, active)
values ('hagerty', 'sam', lower('<SAM_EMAIL>'), 'admin', 'Sam', true)
on conflict (org_id, subject) do update set email = excluded.email, active = true;
-- check (shows only this one seat): select id, org_id, subject, active from desk_seats where org_id = 'hagerty' and subject = 'sam';
