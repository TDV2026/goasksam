-- DESK CASE ARCHIVE EVENTS (Lane D, Nov 12 2026). case_archive and case_restore write one row here each, insert only; the case is archived when its latest event is an archive. A finalised or sent sheet is locked in the database (desk_sheet_immutable), so the archive state lives beside the sheet, never in it.
-- Run once in the Supabase SQL editor (Sam), after docs/supabase-desk-storage.sql. Safe to run twice. Until it is run, archiving answers a plain "not set up yet" and every other action works as before.
create table if not exists desk_case_archive_events (
  id          uuid primary key default gen_random_uuid(),
  org_id      text not null,
  sheet_id    uuid not null,
  kind        text not null check (kind in ('archive', 'restore')),
  from_stage  text,                                            -- the stage the case had when it was archived (the stage a restore returns to)
  by_seat     text not null default '',
  at          timestamptz not null default now(),
  constraint desk_case_archive_events_sheet_fk foreign key (sheet_id, org_id) references desk_sheets(id, org_id) on delete cascade
);
create index if not exists desk_case_archive_events_org_idx on desk_case_archive_events (org_id, sheet_id, at);
alter table desk_case_archive_events enable row level security;
revoke all on desk_case_archive_events from anon, authenticated;
