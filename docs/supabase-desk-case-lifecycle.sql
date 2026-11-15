-- DESK CASE LIFECYCLE EVENTS (Lane D, Nov 15 2026, redesign order 2318 item 1). case_status and case_outcome write one row here each, insert only; a case's status is made from its own facts and its latest events. A finalised or sent sheet is locked in the database (desk_sheet_immutable), so the lifecycle lives beside the sheet, never in it.
-- Run once in the Supabase SQL editor (Sam), after docs/supabase-desk-storage.sql. Safe to run twice. Until it is run, a status change answers a plain "could not be saved just now" and every other action, and the status read from the case's own facts, works as before.
create table if not exists desk_case_lifecycle_events (
  id          uuid primary key default gen_random_uuid(),
  org_id      text not null,
  sheet_id    uuid not null,
  kind        text not null check (kind in ('status', 'outcome')),
  status      text check (status is null or status in ('assigned', 'in_review', 'waiting')),
  outcome     text check (outcome is null or outcome in ('converted', 'closed')),
  note        text,
  assigned_to text,
  by_seat     text not null default '',
  at          timestamptz not null default now(),
  constraint desk_case_lifecycle_events_sheet_fk foreign key (sheet_id, org_id) references desk_sheets(id, org_id) on delete cascade,
  constraint desk_case_lifecycle_events_shape check ((kind = 'status' and status is not null and outcome is null) or (kind = 'outcome' and outcome is not null and status is null))
);
create index if not exists desk_case_lifecycle_events_org_idx on desk_case_lifecycle_events (org_id, sheet_id, at);
alter table desk_case_lifecycle_events enable row level security;
revoke all on desk_case_lifecycle_events from anon, authenticated;
