-- Roster display names (Aug 2026). Sets each partner's PERSON display_name for the
-- card's person references (headline, CTA, value line, why-title); the handle stays
-- in `name` for the "Known online as {handle}" line. Non-destructive: only
-- display_name and updated_at change, keyed on the handle (case-insensitive), so a
-- partner not yet in the table is simply a 0-row no-op. Run once in the Supabase SQL
-- editor. howS is also set by scripts/seedPartners.js; the other three are not in
-- that seed file, so this statement is how their display_name gets set.
update partners set display_name = 'Howard Silvers', updated_at = now() where lower(name) = 'hows';
update partners set display_name = 'Ingo Schmoldt',  updated_at = now() where lower(name) = 'genauautowerks';
update partners set display_name = 'Dan Gray',       updated_at = now() where lower(name) = 'authenticauctions';
update partners set display_name = 'Chris Carbine',  updated_at = now() where lower(name) = 'carbine123';

-- Verify:
select name, display_name, active from partners order by name;
