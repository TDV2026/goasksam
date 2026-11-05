-- Desk demo setup for the Hagerty org (for Sam to run once in the Supabase SQL Editor).
-- Run AFTER docs/supabase-desk-org.sql, docs/supabase-desk-storage.sql and docs/supabase-desk-intake.sql.
-- Safe to run again: every statement is an upsert or does nothing on a repeat.
--
-- BEFORE YOU RUN: replace SEAT1_EMAIL, SEAT2_EMAIL, SEAT3_EMAIL with three addresses you control.
-- Each seat is invited as pending and binds to the account that signs in with that address.
-- No Hagerty address is used anywhere in this file.

-- 1. The org, and the address forwards arrive at: hagerty@desk.goasksam.com
insert into desk_orgs (id, name, inbound_local)
values ('hagerty', 'Hagerty Marketplace', 'hagerty')
on conflict (id) do update set name = excluded.name, inbound_local = excluded.inbound_local;

-- 2. Three demo seats on org hagerty.
insert into desk_seats (org_id, subject, email, role, display_name) values
  ('hagerty', 'pending:' || lower('SEAT1_EMAIL'), lower('SEAT1_EMAIL'), 'member', 'Demo seat 1'),
  ('hagerty', 'pending:' || lower('SEAT2_EMAIL'), lower('SEAT2_EMAIL'), 'member', 'Demo seat 2'),
  ('hagerty', 'pending:' || lower('SEAT3_EMAIL'), lower('SEAT3_EMAIL'), 'member', 'Demo seat 3')
on conflict (org_id, subject) do nothing;

-- 3. Sending set, as Lane S's domain check would leave it for a verified domain.
--    Sending domain: mail.goasksam.com (already in use for our mail).
--    When desk.goasksam.com is verified in Resend, change BOTH the address and the domain below to desk.goasksam.com.
--    The licence dates are demo dates; the trigger refuses to create a sheet for an org without a licence end.
insert into desk_org_settings (org_id, sending_name, sending_address, sending_domain,
                               sending_domain_status, sending_domain_verified_at,
                               licence_starts_on, licence_ends_on)
values ('hagerty', 'Hagerty Marketplace', 'hagerty@mail.goasksam.com', 'mail.goasksam.com',
        'verified', now(), '2026-11-04', '2027-11-04')
on conflict (org_id) do update set
  sending_name = excluded.sending_name,
  sending_address = excluded.sending_address,
  sending_domain = excluded.sending_domain,
  sending_domain_status = 'verified',
  sending_domain_verified_at = coalesce(desk_org_settings.sending_domain_verified_at, now()),
  licence_starts_on = coalesce(desk_org_settings.licence_starts_on, excluded.licence_starts_on),
  licence_ends_on = coalesce(desk_org_settings.licence_ends_on, excluded.licence_ends_on);

-- 4. Check (read only): expect 3 seats, status verified, inbound_local hagerty.
select o.id, o.inbound_local, s.sending_address, s.sending_domain_status, s.licence_ends_on,
       (select count(*) from desk_seats k where k.org_id = o.id and k.active) as active_seats
from desk_orgs o left join desk_org_settings s on s.org_id = o.id where o.id = 'hagerty';
