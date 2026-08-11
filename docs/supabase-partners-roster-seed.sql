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
-- Also: add the CLAIM wheelhouse (true specialty: air-cooled Porsche + vintage
-- Mustangs) + pronoun, and CLEAN profile_stats - drop the unfilled
-- {sellThroughPercent} placeholder (item 3a) and the false/duplicated
-- "Specializes in: ... European marques" line (item 3b), keeping only the auction
-- count that feeds the trophy tile. The matching `makes`/`segments` are left
-- untouched so the locked ladder (item 2) is unaffected. Shorten the prep claim
-- to one sentence (item 4c) and drop the fee-structure claim. The wheelhouse also
-- carries a `display` list (the exact three tile entries) and the regions revert
-- to Master v4 Northeast (nationwide flag kept), which strips Florida so a FL
-- Audi seller matches Chris (FL-local), not Howard.
update partners set
  display_name = 'Howard Silvers',
  regions = '["Northeast","Pennsylvania","New Jersey","New York","Connecticut","Massachusetts","Rhode Island","Vermont","New Hampshire","Maine","Nationwide"]'::jsonb,
  specialties = specialties
    || '{"wheelhouse":{"marques":["Porsche"],"models":[{"label":"Vintage Mustangs","make":"Ford","model":"Mustang"}],"display":["Air-cooled Porsche","911s","vintage Mustangs"]},"pronoun":{"subj":"he","obj":"him","poss":"his"},"intro_hook":"He has managed hundreds of enthusiast auctions end to end."}'::jsonb
    || jsonb_build_object('profile_stats',
         '[{"text":"400+ listings tracked across Bring a Trailer and other platforms","source":"partner_provided"}]'::jsonb),
  service_claims =
    '[{"text":"Based in Upper Makefield PA","source":"partner_provided"},{"text":"Manages the entire auction end to end, prep through paperwork","source":"partner_provided"}]'::jsonb,
  updated_at = now()
  where lower(name) = 'hows';

-- 2) Ingo Schmoldt (GenauAutoWerks) - West Coast, regional-only (nationwide TBC=false)
insert into partners (slug, name, display_name, active, regions, specialties, platforms, service_claims, seller_usernames, referral_terms, min_value_usd)
values (
  'genau-auto-werks', 'GenauAutoWerks', 'Ingo Schmoldt', true,
  '["California","San Francisco Peninsula","East Bay","Marin County","Bay Area","West Coast"]'::jsonb,
  '{"makes":[],"segments":["collector","premium_collectors","classic_european"],"wheelhouse":{"marques":[],"models":[]},"pronoun":{"subj":"he","obj":"him","poss":"his"},"intro_hook":"He photographs every car in his own studios and has represented collector cars across California for years.","notes":"Collector and specialty vehicles (per GenauAutoWerks)","source":"partner_provided","profile_stats":[{"text":"440+ enthusiast auctions represented, 300 on Bring a Trailer and 140 on Cars and Bids","source":"partner_provided"},{"text":"Top 10% of all Bring a Trailer sellers","source":"partner_provided"},{"text":"Bring a Trailer community member since March 2011","source":"partner_provided"}]}'::jsonb,
  '[]'::jsonb,
  '[{"text":"Based in the Bay Area, serving the San Francisco Peninsula, East Bay and Marin County","source":"partner_provided"}]'::jsonb,
  '["GenauAutoWerks"]'::jsonb, null, 40000
)
on conflict (slug) do update set
  name = excluded.name, display_name = excluded.display_name, active = excluded.active,
  regions = excluded.regions, specialties = excluded.specialties, service_claims = excluded.service_claims,
  seller_usernames = excluded.seller_usernames, min_value_usd = excluded.min_value_usd, updated_at = now();

-- 3) Dan Gray (AuthenticAuctions) - New England, nationwide, no floor
insert into partners (slug, name, display_name, active, regions, specialties, platforms, service_claims, seller_usernames, referral_terms, min_value_usd)
values (
  'authentic-auctions', 'AuthenticAuctions', 'Dan Gray', true,
  '["New England","Maine","New Hampshire","Vermont","Massachusetts","Rhode Island","Connecticut","Nationwide"]'::jsonb,
  '{"makes":["Audi"],"segments":["classic_european","european_sports","collector","older_enthusiast","pre_1990"],"wheelhouse":{"marques":["Audi"],"models":[]},"pronoun":{"subj":"he","obj":"him","poss":"his"},"intro_hook":"He runs listings coast to coast with his own network of professional photographers.","notes":"Older Audis, high-end camper vans, and collections; pre-war through memorabilia (per AuthenticAuctions)","source":"partner_provided"}'::jsonb,
  '[]'::jsonb,
  -- Operational roster facts (item 7): no "per {name}" attribution (that stays on
  -- performance claims only), no fee figures, no auction counts.
  '[{"text":"Based in New England","source":"partner_provided"},{"text":"Serves sellers nationwide","source":"partner_provided"},{"text":"Nationwide professional photographer network","source":"partner_provided"}]'::jsonb,
  '["AuthenticAuctions"]'::jsonb, null, null
)
on conflict (slug) do update set
  name = excluded.name, display_name = excluded.display_name, active = excluded.active,
  regions = excluded.regions, specialties = excluded.specialties, service_claims = excluded.service_claims,
  seller_usernames = excluded.seller_usernames, min_value_usd = excluded.min_value_usd, updated_at = now();

-- 4) Chris Carbine (carbine123) - South, nationwide (South primary), German+European marques
insert into partners (slug, name, display_name, active, regions, specialties, platforms, service_claims, seller_usernames, referral_terms, min_value_usd)
values (
  'carbine123', 'carbine123', 'Chris Carbine', true,
  '["South","Louisiana","Mississippi","Alabama","Florida","Georgia","Texas","Nationwide"]'::jsonb,
  '{"makes":["BMW","Porsche","Mercedes-Benz","Jaguar","Ferrari","Lexus"],"segments":["classic_european","european_sports","porsche","bmw_m","modern_enthusiast"],"wheelhouse":{"marques":["BMW","Porsche","Mercedes-Benz","Jaguar","Ferrari","Lexus"],"models":[]},"pronoun":{"subj":"he","obj":"him","poss":"his"},"intro_hook":"He preps every car in-house before it goes live, PDR and detailing included.","notes":"BMW, Porsche, Mercedes, Jaguar, Ferrari and Lexus (per carbine123)","company":"Carbine Motors","source":"partner_provided"}'::jsonb,
  '[]'::jsonb,
  -- Operational roster facts (item 7): no attribution, no fee figures, no counts.
  '[{"text":"Based in the South","source":"partner_provided"},{"text":"Serves Louisiana, Mississippi, Alabama, Florida, Georgia and Texas","source":"partner_provided"},{"text":"Full-service preparation: PDR, detailing and reconditioning handled in-house","source":"partner_provided"}]'::jsonb,
  '["carbine123"]'::jsonb, null, 40000
)
on conflict (slug) do update set
  name = excluded.name, display_name = excluded.display_name, active = excluded.active,
  regions = excluded.regions, specialties = excluded.specialties, service_claims = excluded.service_claims,
  seller_usernames = excluded.seller_usernames, min_value_usd = excluded.min_value_usd, updated_at = now();

-- Verify:
select name, display_name, active, regions, min_value_usd from partners order by name;
