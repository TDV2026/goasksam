-- CONDITION TIER, BIGGEST MODELS (Lane B, Nov 5 2026). Read-only. ONE result: the 20 models with the most untiered sales.
select make, model, count(*) as untiered from sales_archive where condition_version is null group by 1, 2 order by 3 desc limit 20;
