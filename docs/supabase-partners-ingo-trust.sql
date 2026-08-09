-- Ingo (GenauAutoWerks) trust enrichment, Aug 2026. Adds two attributed trust
-- claims to his profile_stats, keeping the existing "440+ auctions" line. Both
-- carry source "partner_provided", so Sam renders them with "per Ingo" attribution.
--
-- Explicit UPDATE keyed on NAME (lands regardless of slug). The `||` on the
-- specialties jsonb replaces only profile_stats; segments/notes/source are kept.
-- Run once in the Supabase SQL editor; expect 1 row back.

UPDATE partners
SET specialties = specialties || jsonb_build_object('profile_stats', jsonb_build_array(
      jsonb_build_object('text','440+ enthusiast auctions represented, 300 on Bring a Trailer and 140 on Cars and Bids','source','partner_provided'),
      jsonb_build_object('text','Top 10% of all Bring a Trailer sellers','source','partner_provided'),
      jsonb_build_object('text','Bring a Trailer community member since March 2011','source','partner_provided')
    )),
    updated_at = now()
WHERE name = 'GenauAutoWerks'
RETURNING slug, name, specialties->'profile_stats' AS profile_stats;
