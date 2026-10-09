-- Sam Desk "Request a walkthrough" leads (Lane A, Oct 2026). No existing contact form or lead path
-- was found anywhere in the codebase for /business (its old "Request a walkthrough" button was a bare
-- mailto: link) - this is the fallback the task spec asked for: a short form (name, company, work
-- email, one line), posted to a new, small, server-only endpoint (api/businessLead.js). Run ONCE in
-- the Supabase SQL editor. Locked down from creation per the standing database security rule: RLS on,
-- no anon/authenticated grants - only the server (service role key) can read or write.
create table if not exists business_leads (
  id bigint generated always as identity primary key,
  name text not null,
  company text,
  email text not null,
  message text,
  created_at timestamptz not null default now()
);
create index if not exists business_leads_created_at_idx on business_leads (created_at desc);
alter table business_leads enable row level security;
revoke all on business_leads from anon, authenticated;

-- Notification visibility (Lane A, Oct 2026, round 2): the lead-save was always reliable, but the
-- notification email to Sam was being fired without ever being awaited, so it silently never sent -
-- the lead row was the only evidence it had happened. These columns record the OUTCOME of the
-- (now awaited) send attempt directly on the row, so a missing notification can be found by reading
-- the table instead of re-diagnosing. RUN ONCE, additive only - no RLS/grant change needed, inherits
-- the table's existing lockdown above.
alter table business_leads add column if not exists notify_ok boolean;
alter table business_leads add column if not exists notify_error text;
alter table business_leads add column if not exists notified_at timestamptz;
