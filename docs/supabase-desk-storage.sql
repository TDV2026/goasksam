-- Sam Desk Valuations: sheets, photos, documents, sent log, org settings, per-org storage (Lane S, Nov 4 2026)
-- =====================================================================
-- Run ONCE in the Supabase SQL editor (Sam pastes it; nobody runs it from a terminal). Safe to re-run:
-- IF NOT EXISTS / OR REPLACE / drop-then-create for policies. No CONCURRENTLY, no large-table scans.
-- Read docs/desk-valuations-spec.md ("Photos and documents", "Saving per seat and org", "Rules").
--
-- WHAT THIS DOES
--   1. Locks down the three Desk tables that shipped before the standing rule had its revoke line
--      (desk_orgs, desk_seats, desk_saved_views: RLS was on, grants were not revoked). Same class fix as below.
--   2. desk_org_settings   one row per org: branding, sending address + domain verification, signature,
--                          standard message, threshold (default 15), venue choice, reserve or range, auto send.
--                          Operator-only columns (seat limit, licence dates) are never org-editable.
--   3. desk_sheets, desk_sheet_photos, desk_sheet_documents, desk_sheet_sent, desk_deletion_log.
--      Every row carries org_id and the seat_id that owns it, and the seat must belong to the SAME org
--      (composite foreign keys), so a row can never name another org's seat.
--   4. One private storage bucket per org ("desk-<org>"), objects under "<org>/<sheet>/...". A seat may
--      READ only its own org's bucket; nothing but the service role writes.
--   5. Retention: licence end + 90 days, stamped on every sheet by trigger. A sheet cannot be created for an
--      org whose licence end is not set (fails loudly, never silently kept forever).
--   6. Deletion is logged by trigger on every path (sheet, retention, org request, or a raw delete = 'unspecified').
--
-- SECURITY (STANDING RULE, CLAUDE.md "Database security"): every new table ships RLS on + all grants revoked
-- from anon and authenticated; the server uses the service role key. The policies below are a second wall: if a
-- grant were ever restored by mistake, a seat still sees only its own org. The helper that policies call lives in
-- schema desk_private, which PostgREST does not expose, so it is not an RPC. storage.objects is Supabase's own
-- table (RLS already on, owned by the storage admin), so this file creates POLICIES on it and does not ALTER it.
--
-- AFTER RUNNING: paste docs/supabase-desk-storage-verify.sql (read-only) and send Sam's result back.
-- REQUIRED ONE-LINERS AFTER THE FIRST RUN (the licence end is a contract fact only Sam has):
--   update desk_org_settings set licence_starts_on = '<yyyy-mm-dd>', licence_ends_on = '<yyyy-mm-dd>' where org_id = 'hagerty';
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Private helper schema (not exposed through PostgREST)
-- ---------------------------------------------------------------------
create schema if not exists desk_private;
revoke all on schema desk_private from public, anon;
grant usage on schema desk_private to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 1. Seats: composite key so child tables can pin (seat, org) together; active flag; display name.
-- ---------------------------------------------------------------------
alter table desk_seats add column if not exists display_name text;
alter table desk_seats add column if not exists active boolean not null default true;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'desk_seats_id_org_uniq') then
    alter table desk_seats add constraint desk_seats_id_org_uniq unique (id, org_id);
  end if;
end $$;

-- The orgs the signed-in user holds an ACTIVE seat in. Policies call this; it reads desk_seats as its owner
-- (security definer) so no table grant has to be given to authenticated. Returns ONLY the caller's own orgs.
create or replace function desk_private.seat_orgs() returns setof text
language sql stable security definer set search_path = public, pg_temp as $$
  select s.org_id from public.desk_seats s where s.subject = auth.uid()::text and s.active
$$;
revoke execute on function desk_private.seat_orgs() from public, anon;
grant execute on function desk_private.seat_orgs() to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. Org settings (one row per org)
-- ---------------------------------------------------------------------
create table if not exists desk_org_settings (
  org_id                       text primary key references desk_orgs(id) on delete cascade,
  -- branding / sending (org-editable)
  logo_path                    text,                          -- object path in the org bucket, "<org>/brand/<file>"
  sending_name                 text,
  sending_address              text,
  sending_domain               text,                          -- the domain the org verifies (derived from sending_address)
  sending_domain_status        text not null default 'unverified' check (sending_domain_status in ('unverified','pending','verified','failed')),
  sending_domain_provider_id   text,                          -- the email provider's id for the domain
  sending_domain_records       jsonb,                         -- DNS records the org's admin must add
  sending_domain_verified_at   timestamptz,
  signature                    text,
  standard_message             text,
  threshold_pct                numeric(5,2) not null default 15 check (threshold_pct >= 0.5 and threshold_pct <= 100),
  venue_choice                 boolean not null default false,
  reserve_or_range             text not null default 'either' check (reserve_or_range in ('reserve','range','either')),
  auto_send                    boolean not null default false,
  -- operator-only (Sam; never in the org-editable list)
  seat_limit                   integer not null default 3 check (seat_limit between 1 and 25),
  licence_starts_on            date,
  licence_ends_on              date,
  updated_at                   timestamptz not null default now(),
  updated_by_seat_id           bigint,
  constraint desk_org_settings_seat_fk foreign key (updated_by_seat_id, org_id) references desk_seats(id, org_id),
  constraint desk_org_settings_address_domain check (sending_address is null or sending_domain is null or lower(split_part(sending_address, '@', 2)) = lower(sending_domain)),
  constraint desk_org_settings_verified_needs_domain check (sending_domain_status <> 'verified' or sending_domain is not null),
  constraint desk_org_settings_logo_in_org check (logo_path is null or logo_path like org_id || '/brand/%')
);

-- ---------------------------------------------------------------------
-- 3. Sheets
-- ---------------------------------------------------------------------
create table if not exists desk_sheets (
  id                    uuid primary key default gen_random_uuid(),
  org_id                text not null references desk_orgs(id),
  seat_id               bigint not null,                      -- the forwarding / owning seat
  status                text not null default 'new' check (status in ('new','in_progress','finalised','sent','needs_car')),
  vin                   text,
  vin_norm              text,
  car_label             text,
  consignor_name        text,
  consignor_email       text,
  thread_key            text,                                 -- email thread, so a later email adds photos to this sheet
  source_email_path     text,                                 -- the original email, kept in the org bucket
  sheet                 jsonb not null default '{}'::jsonb,   -- the expert's working state (sections 1 to 6)
  engine_read           jsonb,                                -- the oneEngineAnswer read, frozen at finalise
  decision              jsonb,                                -- reserve or range, reasons, note; frozen at finalise
  report_number         text,
  finalised_at          timestamptz,
  finalised_by_seat_id  bigint,
  sent_at               timestamptz,
  supersedes_sheet_id   uuid,                                 -- a correction is a NEW sheet referencing the old
  delete_after          date,                                 -- licence end + 90 days (trigger-stamped)
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint desk_sheets_id_org_uniq unique (id, org_id),
  constraint desk_sheets_seat_fk      foreign key (seat_id, org_id)              references desk_seats(id, org_id),
  constraint desk_sheets_final_seat_fk foreign key (finalised_by_seat_id, org_id) references desk_seats(id, org_id),
  constraint desk_sheets_supersedes_fk foreign key (supersedes_sheet_id, org_id)  references desk_sheets(id, org_id),
  constraint desk_sheets_path_in_org check (source_email_path is null or source_email_path like org_id || '/' || id::text || '/%'),
  constraint desk_sheets_final_has_read check (status not in ('finalised','sent') or (engine_read is not null and decision is not null and finalised_at is not null and finalised_by_seat_id is not null and report_number is not null))
);
create unique index if not exists desk_sheets_report_uniq on desk_sheets (org_id, report_number) where report_number is not null;
create index if not exists desk_sheets_org_status_idx on desk_sheets (org_id, status, created_at desc);
create index if not exists desk_sheets_org_vin_idx    on desk_sheets (org_id, vin_norm) where vin_norm is not null;
create index if not exists desk_sheets_seat_idx       on desk_sheets (org_id, seat_id, created_at desc);
create index if not exists desk_sheets_thread_idx     on desk_sheets (org_id, thread_key) where thread_key is not null;
create index if not exists desk_sheets_delete_after_idx on desk_sheets (delete_after);

create table if not exists desk_sheet_photos (
  id             uuid primary key default gen_random_uuid(),
  sheet_id       uuid not null,
  org_id         text not null,
  seat_id        bigint not null,                             -- the seat that brought the photo in
  original_path  text not null,                               -- kept as received
  resized_path   text not null,                               -- the copy the sheet and the report use
  filename       text,
  content_type   text,
  bytes          bigint,
  width          integer,
  height         integer,
  position       integer not null default 0,
  in_report      boolean not null default false,              -- the expert ticks which go in the report
  is_hero        boolean not null default false,
  source         text not null default 'email' check (source in ('email','upload')),
  created_at     timestamptz not null default now(),
  constraint desk_photos_sheet_fk foreign key (sheet_id, org_id) references desk_sheets(id, org_id) on delete cascade,
  constraint desk_photos_seat_fk  foreign key (seat_id, org_id)  references desk_seats(id, org_id),
  constraint desk_photos_orig_in_sheet    check (original_path like org_id || '/' || sheet_id::text || '/%'),
  constraint desk_photos_resized_in_sheet check (resized_path  like org_id || '/' || sheet_id::text || '/%'),
  constraint desk_photos_hero_in_report   check (not is_hero or in_report)
);
create unique index if not exists desk_photos_one_hero on desk_sheet_photos (sheet_id) where is_hero;
create index if not exists desk_photos_sheet_idx on desk_sheet_photos (sheet_id, position);

create table if not exists desk_sheet_documents (
  id            uuid primary key default gen_random_uuid(),
  sheet_id      uuid not null,
  org_id        text not null,
  seat_id       bigint not null,
  kind          text not null check (kind in ('file','link')),
  storage_path  text,                                          -- kind = file: object path in the org bucket
  link_url      text,                                          -- kind = link: a Drive or Dropbox link, kept unopened
  filename      text,
  content_type  text,
  bytes         bigint,
  created_at    timestamptz not null default now(),
  constraint desk_docs_sheet_fk foreign key (sheet_id, org_id) references desk_sheets(id, org_id) on delete cascade,
  constraint desk_docs_seat_fk  foreign key (seat_id, org_id)  references desk_seats(id, org_id),
  constraint desk_docs_kind_shape check ((kind = 'file' and storage_path is not null and link_url is null) or (kind = 'link' and link_url is not null and storage_path is null)),
  constraint desk_docs_path_in_sheet check (storage_path is null or storage_path like org_id || '/' || sheet_id::text || '/%')
);
create index if not exists desk_docs_sheet_idx on desk_sheet_documents (sheet_id);

-- What went out: a copy of the message and the PDF, kept with the sheet.
create table if not exists desk_sheet_sent (
  id                   uuid primary key default gen_random_uuid(),
  sheet_id             uuid not null,
  org_id               text not null,
  seat_id              bigint not null,                        -- the seat that pressed Send
  to_address           text not null,
  from_address         text not null,
  subject              text,
  body_text            text,                                   -- the message exactly as sent
  seller_note          text,
  pdf_path             text,                                   -- the PDF as attached, in the org bucket
  pdf_sha256           text,
  provider             text,
  provider_message_id  text,
  sent_at              timestamptz not null default now(),
  constraint desk_sent_sheet_fk foreign key (sheet_id, org_id) references desk_sheets(id, org_id) on delete cascade,
  constraint desk_sent_seat_fk  foreign key (seat_id, org_id)  references desk_seats(id, org_id),
  constraint desk_sent_pdf_in_sheet check (pdf_path is null or pdf_path like org_id || '/' || sheet_id::text || '/%')
);
create index if not exists desk_sent_sheet_idx on desk_sheet_sent (sheet_id, sent_at desc);

-- Every deletion, whichever path. No foreign keys: the log outlives the sheet, the seat and the org.
create table if not exists desk_deletion_log (
  id          bigserial primary key,
  org_id      text not null,
  scope       text not null check (scope in ('sheet','org')),
  sheet_id    uuid,
  reason      text not null check (reason in ('sheet','retention','org_request','early','unspecified')),
  actor       text,                                            -- 'seat:<id>', 'crew', 'retention', ...
  objects     integer,                                         -- storage objects removed
  bytes       bigint,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists desk_deletion_log_org_idx on desk_deletion_log (org_id, created_at desc);

-- ---------------------------------------------------------------------
-- 4. Triggers
-- ---------------------------------------------------------------------
-- 4a. Seat limit (three for the Hagerty org). Counts ACTIVE seats; the cap is the org's seat_limit (default 3).
create or replace function desk_seat_limit_guard() returns trigger language plpgsql set search_path = public, pg_temp as $$
declare lim integer; n integer;
begin
  if not new.active then return new; end if;
  select coalesce((select seat_limit from desk_org_settings where org_id = new.org_id), 3) into lim;
  select count(*) into n from desk_seats where org_id = new.org_id and active and id is distinct from new.id;
  if n >= lim then raise exception 'desk: org % already has % active seats (limit %)', new.org_id, n, lim using errcode = '23514'; end if;
  return new;
end $$;
drop trigger if exists desk_seat_limit on desk_seats;
create trigger desk_seat_limit before insert or update of active, org_id on desk_seats for each row execute function desk_seat_limit_guard();

-- 4b. Retention: delete_after = licence end + 90 days, stamped at insert. No licence end = refuse, loudly.
create or replace function desk_retention_days() returns integer language sql immutable as $$ select 90 $$;

create or replace function desk_sheet_stamp() returns trigger language plpgsql set search_path = public, pg_temp as $$
declare le date;
begin
  if tg_op = 'INSERT' then
    select licence_ends_on into le from desk_org_settings where org_id = new.org_id;
    if le is null then raise exception 'desk: org % has no licence end set, so a sheet cannot be created (retention is licence end + % days)', new.org_id, desk_retention_days() using errcode = '23514'; end if;
    new.delete_after := le + desk_retention_days();
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists desk_sheet_stamp_trg on desk_sheets;
create trigger desk_sheet_stamp_trg before insert or update on desk_sheets for each row execute function desk_sheet_stamp();

-- When the licence end moves (a renewal), every sheet of the org follows it.
create or replace function desk_settings_licence_follow() returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.licence_ends_on is distinct from old.licence_ends_on and new.licence_ends_on is not null then
    update desk_sheets set delete_after = new.licence_ends_on + desk_retention_days() where org_id = new.org_id;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists desk_settings_licence_follow_trg on desk_org_settings;
create trigger desk_settings_licence_follow_trg before update on desk_org_settings for each row execute function desk_settings_licence_follow();

-- 4c. A finalised sheet is immutable. Only finalised -> sent (sent_at) and the retention date may change.
create or replace function desk_sheet_immutable() returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if old.status in ('finalised','sent') then
    if (new.org_id, new.seat_id, new.vin, new.vin_norm, new.car_label, new.consignor_name, new.consignor_email, new.thread_key, new.source_email_path,
        new.sheet, new.engine_read, new.decision, new.report_number, new.finalised_at, new.finalised_by_seat_id, new.supersedes_sheet_id, new.created_at)
       is distinct from
       (old.org_id, old.seat_id, old.vin, old.vin_norm, old.car_label, old.consignor_name, old.consignor_email, old.thread_key, old.source_email_path,
        old.sheet, old.engine_read, old.decision, old.report_number, old.finalised_at, old.finalised_by_seat_id, old.supersedes_sheet_id, old.created_at) then
      raise exception 'desk: sheet % is finalised and cannot be changed (a correction is a new sheet)', old.id using errcode = '23514';
    end if;
    if not (new.status = old.status or (old.status = 'finalised' and new.status = 'sent')) then
      raise exception 'desk: sheet % cannot move from % to %', old.id, old.status, new.status using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists desk_sheet_immutable_trg on desk_sheets;
create trigger desk_sheet_immutable_trg before update on desk_sheets for each row execute function desk_sheet_immutable();

-- The sent log is a record of what went out: it is never edited.
create or replace function desk_sent_immutable() returns trigger language plpgsql set search_path = public, pg_temp as $$
begin raise exception 'desk: the sent log is never edited' using errcode = '23514'; end $$;
drop trigger if exists desk_sent_immutable_trg on desk_sheet_sent;
create trigger desk_sent_immutable_trg before update on desk_sheet_sent for each row execute function desk_sent_immutable();

-- 4d. Deletion is always logged. The RPC below sets the reason; a raw delete logs 'unspecified'.
create or replace function desk_sheet_delete_log() returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  insert into desk_deletion_log (org_id, scope, sheet_id, reason, actor, objects, bytes, note)
  values (old.org_id, 'sheet', old.id,
          coalesce(nullif(current_setting('desk.delete_reason', true), ''), 'unspecified'),
          nullif(current_setting('desk.delete_actor', true), ''),
          nullif(current_setting('desk.delete_objects', true), '')::integer,
          nullif(current_setting('desk.delete_bytes', true), '')::bigint,
          case when old.status in ('finalised','sent') then 'finalised sheet' else null end);
  return old;
end $$;
drop trigger if exists desk_sheet_delete_log_trg on desk_sheets;
create trigger desk_sheet_delete_log_trg before delete on desk_sheets for each row execute function desk_sheet_delete_log();

-- The one supported way to delete a sheet's rows (after its storage objects are gone). Service role only.
create or replace function desk_delete_sheet(p_sheet uuid, p_reason text, p_actor text, p_objects integer, p_bytes bigint)
returns integer language plpgsql set search_path = public, pg_temp as $$
declare n integer;
begin
  perform set_config('desk.delete_reason', coalesce(p_reason, ''), true);
  perform set_config('desk.delete_actor',  coalesce(p_actor, ''), true);
  perform set_config('desk.delete_objects', coalesce(p_objects::text, ''), true);
  perform set_config('desk.delete_bytes',  coalesce(p_bytes::text, ''), true);
  delete from desk_sheets where id = p_sheet;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- 5. Seed the Hagerty org (three experts are added by an admin; each logs in with their own account)
-- ---------------------------------------------------------------------
insert into desk_orgs (id, name) values ('hagerty', 'Hagerty Marketplace') on conflict (id) do nothing;
insert into desk_org_settings (org_id, seat_limit) values ('hagerty', 3) on conflict (org_id) do nothing;
insert into desk_org_settings (org_id, seat_limit) values ('sam', 5)     on conflict (org_id) do nothing;

-- One private bucket per org. "desk-<org>"; never public. New orgs get theirs from the server (lib/desk/storage.js).
insert into storage.buckets (id, name, public) values ('desk-hagerty', 'desk-hagerty', false) on conflict (id) do update set public = false;
insert into storage.buckets (id, name, public) values ('desk-sam', 'desk-sam', false)         on conflict (id) do update set public = false;

-- ---------------------------------------------------------------------
-- 6. SECURITY (standing rule): RLS on, grants revoked, service role only
-- ---------------------------------------------------------------------
-- 6a. The new tables.
alter table desk_org_settings   enable row level security;
alter table desk_sheets         enable row level security;
alter table desk_sheet_photos   enable row level security;
alter table desk_sheet_documents enable row level security;
alter table desk_sheet_sent     enable row level security;
alter table desk_deletion_log   enable row level security;
revoke all on desk_org_settings, desk_sheets, desk_sheet_photos, desk_sheet_documents, desk_sheet_sent, desk_deletion_log from anon, authenticated;
revoke all on sequence desk_deletion_log_id_seq from anon, authenticated;

-- 6b. The Desk tables that shipped before the revoke line existed (same class, same fix).
alter table desk_orgs         enable row level security;
alter table desk_seats        enable row level security;
alter table desk_saved_views  enable row level security;
revoke all on desk_orgs, desk_seats, desk_saved_views from anon, authenticated;

-- 6c. Second wall: read policies scoped to the seat's own org. Inert while the grants are revoked; if a
-- grant were ever restored, a seat still reads only its own org's rows. There is NO insert, update or delete
-- policy for anyone: writes are service role only.
drop policy if exists desk_seat_read_org on desk_sheets;
create policy desk_seat_read_org on desk_sheets for select to authenticated using (org_id in (select desk_private.seat_orgs()));
drop policy if exists desk_seat_read_org on desk_sheet_photos;
create policy desk_seat_read_org on desk_sheet_photos for select to authenticated using (org_id in (select desk_private.seat_orgs()));
drop policy if exists desk_seat_read_org on desk_sheet_documents;
create policy desk_seat_read_org on desk_sheet_documents for select to authenticated using (org_id in (select desk_private.seat_orgs()));
drop policy if exists desk_seat_read_org on desk_sheet_sent;
create policy desk_seat_read_org on desk_sheet_sent for select to authenticated using (org_id in (select desk_private.seat_orgs()));
drop policy if exists desk_seat_read_org on desk_org_settings;
create policy desk_seat_read_org on desk_org_settings for select to authenticated using (org_id in (select desk_private.seat_orgs()));
-- desk_deletion_log has no seat policy: an org asks for its log, it does not browse it.

-- 6d. Functions callable through PostgREST RPC: service role only.
revoke execute on function desk_delete_sheet(uuid, text, text, integer, bigint) from public, anon, authenticated;
grant  execute on function desk_delete_sheet(uuid, text, text, integer, bigint) to service_role;
revoke execute on function desk_retention_days() from public, anon, authenticated;
grant  execute on function desk_retention_days() to service_role;
-- Trigger functions are never called by a client; take away the default public execute anyway.
revoke execute on function desk_seat_limit_guard()          from public, anon, authenticated;
revoke execute on function desk_sheet_stamp()               from public, anon, authenticated;
revoke execute on function desk_settings_licence_follow()   from public, anon, authenticated;
revoke execute on function desk_sheet_immutable()           from public, anon, authenticated;
revoke execute on function desk_sent_immutable()            from public, anon, authenticated;
revoke execute on function desk_sheet_delete_log()          from public, anon, authenticated;

-- 6e. Storage: a seat READS only its own org's bucket and folder. No write policy exists for anyone.
-- (storage.objects already has RLS on; this file adds policies and does not alter the table.)
drop policy if exists desk_seat_read_own_org on storage.objects;
create policy desk_seat_read_own_org on storage.objects for select to authenticated
  using (
    bucket_id like 'desk-%'
    and (storage.foldername(name))[1] is not null
    and bucket_id = 'desk-' || (storage.foldername(name))[1]
    and (storage.foldername(name))[1] in (select desk_private.seat_orgs())
  );

-- Function search path (Lane S Stage 1 rule): fixed on every function above via "set search_path" at creation.
