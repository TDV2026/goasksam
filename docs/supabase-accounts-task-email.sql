-- Tasks email preference on the account (Lane C, Oct 2026). Run once in the Supabase SQL editor.
-- task_email_on: send task emails (default on). task_email: where they go, when the buyer changed it
-- (null = the account's sign-in email). Read and written server-side only (api/tasks.js, service role);
-- the accounts table is already RLS-on with no anon/authenticated grants (docs/supabase-accounts.sql).
alter table public.accounts add column if not exists task_email_on boolean not null default true;
alter table public.accounts add column if not exists task_email text;
-- Standing database rule (unchanged for this table, restated so the file and the database match):
alter table public.accounts enable row level security;
revoke all on public.accounts from anon, authenticated;
