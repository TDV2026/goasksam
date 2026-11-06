-- CONDITION TIER, MODEL ORDER (Lane B, Nov 5 2026). Run ONCE in the Supabase SQL editor. Adds an index, nothing else: no table, no function, no data change, so no RLS/grant lines are needed.
-- The tier job now takes the untiered sales model by model (make, model, id). This partial index holds only the sales still without a tier, in that order, so every read of the job is a short index
-- range scan, and it shrinks as the backfill proceeds. Without it the job still runs but each read is slower; the job watches the database's own answer time and stops when it is slow.
create index if not exists sales_archive_condition_todo_model_idx on sales_archive (make, model, id) where condition_version is null;

-- SIZING, read-only, run after the index exists: how many sales still have no tier and how many models they span (the two numbers the nightly plan needs).
select count(*) as untiered_sales, count(distinct (make, model)) as models, round(count(*)::numeric / nullif(count(distinct (make, model)), 0), 1) as sales_per_model from sales_archive where condition_version is null;
-- and the biggest models (these take the longest single visit):
select make, model, count(*) as untiered from sales_archive where condition_version is null group by 1, 2 order by 3 desc limit 20;
