-- Tasks limit 1 -> 3 (Lane D, Oct 2026). Run once in the Supabase SQL editor, BEFORE the code that lets a second
-- Task start is deployed to production: until this index is gone the database refuses a second running Task per
-- account (unique violation), whatever the code allows.
-- The limit itself lives in code only (lib/tasks/limit.js FREE_TASK_LIMIT) and is enforced server side where a Task
-- is created, restarted or resumed, with a recount after the write so two simultaneous creates cannot pass it.
-- No new table or function: nothing to lock down. Existing rows are untouched (every account keeps its Task).
drop index if exists tasks_one_active_per_user;
-- Reads by "this account's working Tasks" (the slot check) use a plain index instead.
create index if not exists tasks_user_working_idx on tasks (user_id) where state in ('running', 'needs_you');
