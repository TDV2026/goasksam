-- CONDITION TIER, FAMILY CHECK (Lane B, Nov 5 2026). Read-only. ONE row: how many sales carry a model_family (the pool key the tier bands now use). Share near 100 means the family pools are complete.
select count(*) as sales, count(model_family) as with_family, round(100.0 * count(model_family) / nullif(count(*), 0), 1) as pct_with_family from sales_archive;
