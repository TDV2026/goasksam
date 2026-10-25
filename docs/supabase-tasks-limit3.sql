-- Tasks limit 1 -> 3 (Lane D, Oct 2026). Run in the Supabase SQL editor, ONE BLOCK AT A TIME, AFTER the code is deployed.
-- Order: (1) the code deploys, (2) block 1, (3) block 2. The limit itself lives in code only (lib/tasks/limit.js FREE_TASK_LIMIT);
-- nothing here stores the number. No new table and no function, so nothing new to lock down.
-- Until block 1 runs, the database refuses a second running Task per account (unique violation), whatever the code allows.

-- BLOCK 1: remove the one-working-Task-per-account rule.
-- Changes: drops the unique index tasks_one_active_per_user (running or needs_you, one per user). No rows are touched; no data can be lost.
-- Reverse (only valid while no account has two or more working Tasks, or it fails):
--   create unique index if not exists tasks_one_active_per_user on tasks (user_id) where state in ('running', 'needs_you');
-- To find accounts that would block the reverse:
--   select user_id, count(*) from tasks where state in ('running','needs_you') group by user_id having count(*) > 1;
drop index if exists tasks_one_active_per_user;

-- BLOCK 2: a plain (non-unique) index so "this account's working Tasks" stays a fast read.
-- Changes: adds the index tasks_user_working_idx. No rows are touched; no data can be lost. Safe to skip (reads only get slower).
-- Reverse:
--   drop index if exists tasks_user_working_idx;
create index if not exists tasks_user_working_idx on tasks (user_id) where state in ('running', 'needs_you');
