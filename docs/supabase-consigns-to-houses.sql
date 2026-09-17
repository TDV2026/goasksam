-- consigns_to_houses partner attribute (House-tier / Thin mode HOUSE STEER, Sep 2026)
--
-- The /sell HOUSE STEER (house share >= 2/3 of a thin pool) routes the practical step to a
-- PowerSeller who genuinely consigns cars INTO the auction houses (RM / Gooding / Broad Arrow etc).
-- Until a partner is marked, the house-steer result STANDS WITHOUT A DOOR: it names the houses by
-- the car's own recorded results and explains consignment, but shows no partner card and never
-- implies GoAskSam holds a placement partner. Do NOT mark any partner true without a real,
-- confirmed house-consignment relationship (product rule 1 / 11).
--
-- The engine (api/sellerDecision.js -> partnerConsignsToHouses) reads the flag from EITHER a
-- top-level `consigns_to_houses` boolean column OR the `specialties` JSON, so you can seed it with
-- zero DDL today, or add the column for cleaner querying. Both paths are supported.

-- OPTION A (no DDL): set it inside the existing specialties JSON, via the partner-edit path or:
--   UPDATE partners
--   SET specialties = jsonb_set(coalesce(specialties,'{}'::jsonb), '{consigns_to_houses}', 'true')
--   WHERE name = '<partner name>';   -- ONLY a partner with a confirmed house relationship

-- OPTION B (add a column, cleaner for querying):
ALTER TABLE partners ADD COLUMN IF NOT EXISTS consigns_to_houses boolean NOT NULL DEFAULT false;
-- Then, per confirmed partner only:
--   UPDATE partners SET consigns_to_houses = true WHERE name = '<partner name>';

-- To clear (rollback to no-door for a partner):
--   UPDATE partners SET consigns_to_houses = false WHERE name = '<partner name>';
--   -- or remove the JSON key if you used OPTION A.
