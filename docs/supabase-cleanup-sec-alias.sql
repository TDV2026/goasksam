-- Golden-path FAIL #12 residual (Aug 14 2026): the spaced form "560 SEC" / "500 SEC"
-- still drops its body suffix and reads as rarity, because a DB nickname alias
--   sec -> Mercedes-Benz S-Class
-- consumes "sec" in the alias layer BEFORE trim extraction, leaving bare "560".
-- (The no-space form "560SEC" already resolves mainstream; CE/TE/SEL/SD/TD/D are
-- fixed in code via TRIM_VOCABULARY + the combined model+trim classifier.)
--
-- Removing this one alias lets "sec" survive as the trim, so "560 SEC" resolves to
-- model "560" + trim "SEC" -> modelIsMainstream sees "560 sec" -> mainstream (neutral),
-- matching the Option-1 boundary (SEC coupes are mainstream). The only loss is the
-- standalone "SEC" -> S-Class shortcut, which is ambiguous anyway (which S-Class coupe?).
--
-- Verify first, then delete. Adjust the make/model filter if the stored shape differs.

-- 1) INSPECT what is actually there:
select alias_slug, make, model, trim, kind
from taxonomy_aliases
where lower(alias_slug) = 'sec';

-- 2) DELETE the sec -> S-Class nickname (scoped to Mercedes S-Class so nothing else is touched):
delete from taxonomy_aliases
where lower(alias_slug) = 'sec'
  and lower(make) = 'mercedes-benz'
  and lower(model) like '%s-class%';

-- Partners cache / resolver reads this table directly; no redeploy needed. Re-run the
-- golden-path #12 check afterward (a 1990 560 SEC should render neutral, not rarity).
