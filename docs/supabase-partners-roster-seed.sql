-- Four-partner roster seed (Aug 2026), values supplied by Sam. Run once in the
-- Supabase SQL editor. `partners` currently holds one row (howS); this normalizes
-- howS's display_name and inserts the three regional partners.
--
-- Schema note: min_value_usd is a SINGLE gate (no secondary category column), so
-- Ingo's motorcycle floor (15000) can't be stored separately; his single gate is
-- 40000 per Sam. Dan takes pre-war through memorabilia with no floor -> null.
-- specialties/regions here drive the matching ladder (partnerRegionCovered +
-- partnerSegmentMatch). partner_provided notes carry a "(per <handle>)" attribution.

-- 1) howS -> Howard Silvers (handle unchanged)
update partners set display_name = 'Howard Silvers', updated_at = now()
  where lower(name) = 'hows';

-- 2) Ingo Schmoldt (GenauAutoWerks) - West Coast, regional-only (nationwide TBC=false)
insert into partners (slug, name, display_name, active, regions, specialties, platforms, service_claims, seller_usernames, referral_terms, min_value_usd)
values (
  'genau-auto-werks', 'GenauAutoWerks', 'Ingo Schmoldt', true,
  '["California","San Francisco Peninsula","East Bay","Marin County","Bay Area","West Coast"]'::jsonb,
  '{"makes":[],"segments":["collector","premium_collectors","classic_european"],"notes":"Collector and specialty vehicles (per GenauAutoWerks)","source":"partner_provided"}'::jsonb,
  '[]'::jsonb, '[]'::jsonb,
  '["GenauAutoWerks"]'::jsonb, null, 40000
)
on conflict (slug) do update set
  name = excluded.name, display_name = excluded.display_name, active = excluded.active,
  regions = excluded.regions, specialties = excluded.specialties,
  seller_usernames = excluded.seller_usernames, min_value_usd = excluded.min_value_usd, updated_at = now();

-- 3) Dan Gray (AuthenticAuctions) - New England, nationwide, no floor
insert into partners (slug, name, display_name, active, regions, specialties, platforms, service_claims, seller_usernames, referral_terms, min_value_usd)
values (
  'authentic-auctions', 'AuthenticAuctions', 'Dan Gray', true,
  '["New England","Maine","New Hampshire","Vermont","Massachusetts","Rhode Island","Connecticut","Nationwide"]'::jsonb,
  '{"makes":["Audi"],"segments":["classic_european","european_sports","collector","older_enthusiast","pre_1990"],"notes":"Older Audis, high-end camper vans, and collections; pre-war through memorabilia (per AuthenticAuctions)","source":"partner_provided"}'::jsonb,
  '[]'::jsonb, '[]'::jsonb,
  '["AuthenticAuctions"]'::jsonb, null, null
)
on conflict (slug) do update set
  name = excluded.name, display_name = excluded.display_name, active = excluded.active,
  regions = excluded.regions, specialties = excluded.specialties,
  seller_usernames = excluded.seller_usernames, min_value_usd = excluded.min_value_usd, updated_at = now();

-- 4) Chris Carbine (carbine123) - South, nationwide (South primary), German+European marques
insert into partners (slug, name, display_name, active, regions, specialties, platforms, service_claims, seller_usernames, referral_terms, min_value_usd)
values (
  'carbine123', 'carbine123', 'Chris Carbine', true,
  '["South","Louisiana","Mississippi","Alabama","Florida","Georgia","Texas","Nationwide"]'::jsonb,
  '{"makes":["BMW","Porsche","Mercedes-Benz","Jaguar","Ferrari","Lexus"],"segments":["classic_european","european_sports","porsche","bmw_m","modern_enthusiast"],"notes":"BMW, Porsche, Mercedes, Jaguar, Ferrari and Lexus (per carbine123)","source":"partner_provided"}'::jsonb,
  '[]'::jsonb, '[]'::jsonb,
  '["carbine123"]'::jsonb, null, 40000
)
on conflict (slug) do update set
  name = excluded.name, display_name = excluded.display_name, active = excluded.active,
  regions = excluded.regions, specialties = excluded.specialties,
  seller_usernames = excluded.seller_usernames, min_value_usd = excluded.min_value_usd, updated_at = now();

-- Verify:
select name, display_name, active, regions, min_value_usd from partners order by name;
