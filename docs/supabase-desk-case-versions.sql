-- DESK V3 STAGE 2 (Lane D, Nov 8 2026): finalized case versions. One row per finalized version of a case, written once and never changed: the figures, the evidence block, the selected comparables, the verification states and the wording.
-- A later change to a finalized case writes version n plus 1; it never edits this row. Run once in the Supabase SQL editor (Sam). Locked down from creation (CLAUDE.md database security).
create table if not exists desk_case_versions (
  id         uuid primary key default gen_random_uuid(),
  org_id     text not null,
  sheet_id   uuid not null,
  version    integer not null check (version >= 1),
  row        jsonb not null,
  created_at timestamptz not null default now(),
  constraint desk_case_versions_sheet_fk foreign key (sheet_id, org_id) references desk_sheets(id, org_id) on delete cascade,
  constraint desk_case_versions_once unique (sheet_id, version)
);
create index if not exists desk_case_versions_sheet_idx on desk_case_versions (org_id, sheet_id, version);
create or replace function desk_case_version_immutable() returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' then raise exception 'a finalized case version is never edited; write version n plus 1'; end if;
  return old;
end $$;
drop trigger if exists desk_case_version_immutable_trg on desk_case_versions;
create trigger desk_case_version_immutable_trg before update on desk_case_versions for each row execute function desk_case_version_immutable();
alter table desk_case_versions enable row level security;
revoke all on desk_case_versions from anon, authenticated;
revoke execute on function desk_case_version_immutable() from public, anon, authenticated;
