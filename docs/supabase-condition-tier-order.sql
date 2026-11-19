-- CONDITION TIER, MODEL ORDER (Lane B, Nov 5 2026). Run ONCE in the Supabase SQL editor. Adds an index, nothing else: no table, no function, no data change, so no RLS/grant lines are needed.
-- The tier job now takes the untiered sales model by model (make, model, id). This partial index holds only the sales still without a tier, in that order, so every read of the job is a short index
-- range scan, and it shrinks as the backfill proceeds. Without it the job still runs but each read is slower; the job watches the database's own answer time and stops when it is slow.
create index if not exists sales_archive_condition_todo_model_idx on sales_archive (make, model, id) where condition_version is null;
-- ct3 (Nov 5 2026): a sale's mileage is read against its Desk family and generation (make, model_family, year range), not its raw model. This partial index serves that read (sales with a listed odometer only).
create index if not exists sales_archive_family_year_miles_idx on sales_archive (make, model_family, year) where mileage_text is not null;
-- The sizing queries are one result per file now: docs/supabase-condition-tier-totals.sql (totals), docs/supabase-condition-tier-biggest.sql (biggest models), docs/supabase-condition-tier-family.sql (model_family check).
