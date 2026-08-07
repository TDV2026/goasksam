-- Ingo (GenauAutoWerks) tile-data fix, Aug 2026.
-- The roster seed created his row with regions + segments but WITHOUT the two
-- fields the PowerSeller tiles render from: specialties.profile_stats (the
-- "440+ enthusiast auctions" trophy tile) and service_claims (the "Based in the
-- Bay Area" location tile). This is verified live: the engine surfaces Ingo as a
-- secondary partner but both fields come back empty.
--
-- This is an explicit UPDATE keyed on NAME (not an INSERT..ON CONFLICT on slug),
-- so it lands regardless of the row's slug. The `||` merges profile_stats INTO
-- the existing specialties jsonb, preserving segments/notes/source (do not wipe
-- them: they drive the specialty match). RETURNING shows the result inline.
--
-- Run once in the Supabase SQL editor. Expect exactly 1 row back with both
-- fields populated. If it returns 0 rows, run `select slug, name from partners;`
-- and tell Sam the exact stored name.

UPDATE partners
SET specialties = specialties || '{"profile_stats":[{"text":"440+ enthusiast auctions represented, 300 on Bring a Trailer and 140 on Cars and Bids","source":"partner_provided"}]}'::jsonb,
    service_claims = '[{"text":"Based in the Bay Area, serving the San Francisco Peninsula, East Bay and Marin County","source":"partner_provided"}]'::jsonb,
    updated_at = now()
WHERE name = 'GenauAutoWerks'
RETURNING slug, name, specialties->'profile_stats' AS profile_stats, service_claims;
