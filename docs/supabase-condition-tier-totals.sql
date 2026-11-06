-- CONDITION TIER, TOTALS (Lane B, Nov 5 2026). Read-only. ONE result row: sales still without a tier at the current version, the models they span, sales per model.
select count(*) as untiered_sales, count(distinct (make, model)) as models, round(count(*)::numeric / nullif(count(distinct (make, model)), 0), 1) as sales_per_model from sales_archive where condition_version is null;
