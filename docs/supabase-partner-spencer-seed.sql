-- Fifth PowerSeller: Spencer Bailey / SpecWerksLTD (Aug 2026). Run once in the
-- Supabase SQL editor. Uses the SAME partners schema and matching fields as the
-- existing four; NO special-case recommendation logic is added anywhere.
--
-- active = FALSE on purpose. Spencer does not go live on any card until BOTH:
--   1) his premium vetting number has been computed and approved by Sam, and
--   2) the prewar-exclusion decision is made (see the flag in the handoff notes:
--      the current segment vocabulary cannot exclude prewar from his lane without
--      a shared-logic or negative-signal change, which was flagged, not built).
-- Flip to active = true only after both. loadActivePartners() reads active=is.true,
-- so while inactive he never matches, ranks, or renders. He is still seeded now so
-- the premium precompute (task=premium persist) can attach his data_verified tile.
--
-- FEE DATA IS NOT STORED. His seller fee ($800 + 7.5% + servicing) and referral
-- status are data-only and never render, exactly like Dan's 6%/5%. The partners
-- table has no fee column; nothing here carries a fee, floor-as-copy, or referral
-- figure. min_value_usd below is the ECONOMIC GATE (not rendered), same as the
-- others. Current floor per Spencer: ~$35,000.
--
-- intro_hook is the one curated true fact for card intros. Roster-truth rules still
-- apply to any marque-match intro: only marques genuinely in his specialty list can
-- be claimed. His differentiator is originality/preservation + hands-on prep, NOT a
-- marque, so the hook is deliberately marque-free.

insert into partners (slug, name, display_name, active, regions, specialties, platforms, service_claims, seller_usernames, referral_terms, min_value_usd)
values (
  'specwerks-ltd', 'SpecWerksLTD', 'Spencer Bailey', false,
  '["Colorado","Denver","Mountain West","Nationwide","International"]'::jsonb,
  jsonb_build_object(
    -- Marque list = his genuine specialty makes (German, Japanese, American
    -- enthusiast + 4x4). NOTE: partnerMarqueMatch is year-agnostic, so listing BMW
    -- and Mercedes here lets a PREWAR BMW/Mercedes marque-match him. That is the
    -- flagged prewar leak; it is tolerated only because he is inactive. Do not flip
    -- active=true until the prewar decision is made.
    'makes', '["BMW","Mercedes-Benz","Porsche","Audi","Volkswagen","Toyota","Nissan","Datsun","Honda","Mazda","Jeep","Land Rover","Ford","Chevrolet"]'::jsonb,
    -- Only vehicle-ASSIGNED segments can match (pre_1990/older_enthusiast/
    -- modern_enthusiast/classic_european/european_sports/porsche/bmw_m). These cover
    -- his 80s/90s/early-2000s modern-classic core across German + generic-older cars.
    -- older_enthusiast/pre_1990 have NO year floor, so they also admit prewar: the
    -- same flagged leak. Segment tuning is downstream of the prewar decision.
    'segments', '["modern_enthusiast","older_enthusiast","pre_1990","classic_european","european_sports","porsche","bmw_m"]'::jsonb,
    'wheelhouse', jsonb_build_object(
      'marques', '[]'::jsonb,
      'models', '[]'::jsonb,
      'display', '["Original and preserved modern classics","1980s to early-2000s enthusiast cars","Hands-on auction preparation"]'::jsonb
    ),
    'pronoun', jsonb_build_object('subj','he','obj','him','poss','his'),
    'intro_hook', 'He personally photographs, preps and manages every car he lists.',
    'notes', 'Original and preserved enthusiast vehicles, particularly 1980s to early-2000s modern classics; also 1960s/70s European sports, German, Japanese and American enthusiast cars, 4x4s and unusual vehicles (per SpecWerksLTD)',
    'company', 'SpecWerks LTD',
    'source', 'partner_provided'
  ),
  '[{"name":"Bring a Trailer","source":"partner_provided"}]'::jsonb,
  -- Operational roster facts (no attribution, no fee figures, no counts, no money
  -- claims per product rule 11: service framing only).
  '[{"text":"Based just south of Denver, Colorado","source":"partner_provided"},{"text":"Serves sellers nationwide and internationally, and ships cars","source":"partner_provided"},{"text":"Full-service preparation: assessment, mechanical and cosmetic repairs, return-to-stock, detailing and photography handled personally, with paint and body coordinated through outside specialists","source":"partner_provided"},{"text":"Recommends work only where he believes it is worthwhile, and discloses remaining flaws honestly","source":"partner_provided"}]'::jsonb,
  '["SpecWerksLTD"]'::jsonb,
  null, 35000
)
on conflict (slug) do update set
  name = excluded.name, display_name = excluded.display_name, active = excluded.active,
  regions = excluded.regions, specialties = excluded.specialties, platforms = excluded.platforms,
  service_claims = excluded.service_claims, seller_usernames = excluded.seller_usernames,
  min_value_usd = excluded.min_value_usd, updated_at = now();

-- Verify (Spencer should show active = f):
select name, display_name, active, min_value_usd, regions from partners order by name;
