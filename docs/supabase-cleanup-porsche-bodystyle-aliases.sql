-- Cleanup (Aug 2026): remove the ambiguous Porsche mid-engine chassis-code
-- aliases that silently collapsed the shared 718 / 981 / 987 generation LINES
-- (which span both the Boxster roadster and the Cayman coupe) down to "Boxster",
-- hiding Cayman. See lib/vehicleData.js BODY_STYLE_SPLITS and the seedGenerations
-- ambiguity guard.
--
-- These were derived by scripts/seedGenerations.js before the ambiguity guard
-- existed. After deleting them, the resolver returns the shared code (e.g. "718")
-- and the wizard asks "Boxster or Cayman?" (or a body-specific trim like Spyder /
-- GT4 resolves the body directly). The resolver ALSO distrusts these rows at
-- runtime, so the fix is already live without this cleanup - this just removes the
-- dead rows. A future `npm run seed:generations` will NOT re-add them (the guard
-- skips codes that span 2+ distinct nameplates).
--
-- Run in the Supabase SQL editor for project otkmxyrglikdoychnmvy. Idempotent.

-- 1) Preview exactly what will be removed (should be the 718/981/987 -> Boxster rows):
SELECT alias, alias_slug, make, model, source
FROM taxonomy_aliases
WHERE alias_slug IN ('718', '981', '987')
  AND lower(make) = 'porsche';

-- 2) Delete them:
DELETE FROM taxonomy_aliases
WHERE alias_slug IN ('718', '981', '987')
  AND lower(make) = 'porsche'
  AND source = 'generated';

-- 3) Confirm none remain:
SELECT count(*) AS remaining_718_981_987_porsche_aliases
FROM taxonomy_aliases
WHERE alias_slug IN ('718', '981', '987')
  AND lower(make) = 'porsche';
