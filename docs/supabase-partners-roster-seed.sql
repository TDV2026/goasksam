-- Four-partner roster seed (Aug 2026). Run once in the Supabase SQL editor.
--
-- STATE OF THE TABLE: `partners` currently holds ONE row (howS). The prior
-- display-name UPDATE matched only howS because Dan Gray, Ingo Schmoldt and Chris
-- Carbine have NO rows yet. This file inserts the three missing partners and
-- normalizes howS's display_name.
--
-- CONFIRMED from the roster (safe to run as-is):
--   handle           -> display_name (person)
--   hows             -> Howard Silvers
--   GenauAutoWerks   -> Ingo Schmoldt
--   AuthenticAuctions-> Dan Gray
--   carbine123       -> Chris Carbine
--
-- ⚠ NEEDS YOUR INPUT before the matching ladder works outside the Northeast:
-- regions, works-nationwide, specialties (makes/segments), and min_value_usd are
-- business facts I will NOT invent (product rule 1/11). Fill the <<TODO ...>>
-- placeholders for the three new partners with the real roster values, then run.
-- Everything a card renders as a claim must be true.

-- 1) howS: normalize display_name (person), handle stays "howS".
update partners set display_name = 'Howard Silvers', updated_at = now()
  where lower(name) = 'hows';

-- 2) Ingo Schmoldt (GenauAutoWerks)
insert into partners (slug, name, display_name, active, regions, specialties, platforms, service_claims, seller_usernames, min_value_usd)
values (
  'genau-auto-werks', 'GenauAutoWerks', 'Ingo Schmoldt', true,
  '<<TODO regions, e.g. ["Nationwide","California","West Coast"]>>'::jsonb,
  '<<TODO {"makes":["Porsche","Audi","BMW"],"segments":["german","european_sports"],"notes":"... (per GenauAutoWerks)"}>>'::jsonb,
  '[]'::jsonb, '[]'::jsonb,
  '["GenauAutoWerks"]'::jsonb,
  '<<TODO min_value_usd integer, e.g. 25000>>'
)
on conflict (slug) do update set
  name = excluded.name, display_name = excluded.display_name, active = excluded.active,
  regions = excluded.regions, specialties = excluded.specialties,
  seller_usernames = excluded.seller_usernames, min_value_usd = excluded.min_value_usd,
  updated_at = now();

-- 3) Dan Gray (AuthenticAuctions)
insert into partners (slug, name, display_name, active, regions, specialties, platforms, service_claims, seller_usernames, min_value_usd)
values (
  'authentic-auctions', 'AuthenticAuctions', 'Dan Gray', true,
  '<<TODO regions>>'::jsonb,
  '<<TODO {"makes":[...],"segments":[...],"notes":"... (per AuthenticAuctions)"}>>'::jsonb,
  '[]'::jsonb, '[]'::jsonb,
  '["AuthenticAuctions"]'::jsonb,
  '<<TODO min_value_usd>>'
)
on conflict (slug) do update set
  name = excluded.name, display_name = excluded.display_name, active = excluded.active,
  regions = excluded.regions, specialties = excluded.specialties,
  seller_usernames = excluded.seller_usernames, min_value_usd = excluded.min_value_usd,
  updated_at = now();

-- 4) Chris Carbine (carbine123)
insert into partners (slug, name, display_name, active, regions, specialties, platforms, service_claims, seller_usernames, min_value_usd)
values (
  'carbine123', 'carbine123', 'Chris Carbine', true,
  '<<TODO regions>>'::jsonb,
  '<<TODO {"makes":[...],"segments":[...],"notes":"... (per carbine123)"}>>'::jsonb,
  '[]'::jsonb, '[]'::jsonb,
  '["carbine123"]'::jsonb,
  '<<TODO min_value_usd>>'
)
on conflict (slug) do update set
  name = excluded.name, display_name = excluded.display_name, active = excluded.active,
  regions = excluded.regions, specialties = excluded.specialties,
  seller_usernames = excluded.seller_usernames, min_value_usd = excluded.min_value_usd,
  updated_at = now();

-- Verify:
select name, display_name, active, regions, min_value_usd from partners order by name;
