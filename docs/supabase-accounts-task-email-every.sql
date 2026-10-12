-- How often a person hears about Task matches (Lane C, Oct 2026). Run once in the Supabase SQL editor.
-- task_email_every: 'daily' (the default, one email a day), 'twice', 'thrice', or 'instant' ("as soon as one
-- comes"). Read and written server-side only (lib/tasks/tasks.js notifyPrefs / setNotifyPrefs, service role).
-- Until this runs, every person gets the default (once a day) and the Tasks page hides the choice.
alter table public.accounts add column if not exists task_email_every text not null default 'daily';
alter table public.accounts drop constraint if exists accounts_task_email_every_check;
alter table public.accounts add constraint accounts_task_email_every_check check (task_email_every in ('daily', 'twice', 'thrice', 'instant'));
-- Standing database rule (unchanged for this table, restated so the file and the database match):
alter table public.accounts enable row level security;
revoke all on public.accounts from anon, authenticated;
