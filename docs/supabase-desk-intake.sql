-- Sam Desk Valuations: inbound email (intake) and Send (Lane D, Nov 2026; docs/desk-valuations-spec.md).
-- =====================================================================
-- Run ONCE in the Supabase SQL editor, AFTER docs/supabase-desk-org.sql (desk_orgs, desk_seats). Idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- All tables are tiny. No CONCURRENTLY, no scans of the archive.
-- Every table ships locked down (STANDING RULE): RLS on, no policy, every grant revoked from anon and authenticated. Only the service role (the server) reaches them.
-- Every row carries org_id. Uploads (photos, documents, the original email, the PDF, the copy sent) live ONLY in the private bucket "desk-intake" under {org_id}/{sheet_id}/.
-- =====================================================================

-- ---- the org's intake and sending settings (columns on the existing desk_orgs) ----
alter table desk_orgs add column if not exists inbound_local     text;                    -- 'hagerty' -> hagerty@desk.goasksam.com
alter table desk_orgs add column if not exists sending_address   text;                    -- the address Send goes out as (verified by Lane S)
alter table desk_orgs add column if not exists sending_name      text;                    -- display name, the org's name
alter table desk_orgs add column if not exists sending_verified  boolean not null default false;
alter table desk_orgs add column if not exists send_provider     text not null default 'resend';   -- the org's own provider; 'resend' = the org's own Resend account (key in env DESK_SEND_KEY_<ORG>)
alter table desk_orgs add column if not exists signature         text;                    -- plain text signature, printed under the message
alter table desk_orgs add column if not exists standard_message  text;                    -- the org's standard message the expert may edit
alter table desk_orgs add column if not exists auto_send         boolean not null default false;   -- automatic sending: OFF unless the org turns it on
create unique index if not exists desk_orgs_inbound_local_uidx on desk_orgs (lower(inbound_local)) where inbound_local is not null;

-- ---- the queue row: one per car submitted. Lane E adds the sheet's own columns (checklist, decision, finalise) to this same table. ----
create table if not exists desk_sheets (
  id               uuid primary key default gen_random_uuid(),
  org_id           text not null references desk_orgs(id),
  seat_id          bigint references desk_seats(id),      -- the forwarding seat: owns the sheet
  seat_email       text,
  status           text not null default 'New',            -- New | In progress | Finalised | Sent | Needs the car
  source           text not null default 'email',          -- email | typed
  car_label        text,
  vin              text,
  chassis          text,
  no_vin           boolean not null default false,         -- "No VIN found" box (pre 1981 chassis, or no VIN in the email)
  more_vins        text[] not null default '{}',           -- "More VINs" flag: the other VINs in the same email
  vin_check_invalid boolean not null default false,        -- marker: the check digit fails (European market VINs have none): the expert reads it
  vin_maker_unknown boolean not null default false,        -- marker: the first three characters are not a maker code we know (never a gate)
  vin_failed_check text[] not null default '{}',           -- 17-character strings rejected as not a VIN (structure only)
  year             int,
  make             text,
  model            text,
  trim             text,
  mileage          int,
  mileage_basis    text,
  gearbox          text,
  colour           text,
  consignor_name   text,
  consignor_email  text,
  subject          text,
  subject_key      text,
  thread_ids       text[] not null default '{}',
  links            jsonb  not null default '[]'::jsonb,    -- shared-folder links as written, never opened
  related_sheet_id uuid,                                    -- a later email on a locked sheet makes a new sheet that references it
  inbound_email_ids text[] not null default '{}',
  original_path    text,                                    -- the first email, kept whole, in the bucket
  engine_status    text,                                    -- null | running | done | failed
  engine_read      jsonb,                                   -- the engine's read, started at intake
  pdf_path         text,
  opened_at        timestamptz,
  finalised_at     timestamptz,
  sent_at          timestamptz,
  sent_to          text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists desk_sheets_org_idx    on desk_sheets (org_id, created_at desc);
create index if not exists desk_sheets_vin_idx    on desk_sheets (org_id, vin) where vin is not null;
create index if not exists desk_sheets_thread_idx on desk_sheets using gin (thread_ids);
create index if not exists desk_sheets_seat_idx   on desk_sheets (org_id, seat_id, status);
-- columns Lane E may already have added are skipped by IF NOT EXISTS; the ones below are Lane D's if this file runs first
alter table desk_sheets add column if not exists sending boolean not null default false;   -- Send claimed: a second Send of the same sheet is refused

create table if not exists desk_sheet_files (
  id            uuid primary key default gen_random_uuid(),
  org_id        text not null references desk_orgs(id),
  sheet_id      uuid not null references desk_sheets(id) on delete cascade,
  kind          text not null,                              -- photo | document | original | report
  filename      text,
  content_type  text,
  size          int,
  path          text not null,                              -- the original bytes, in the bucket
  resized_path  text,                                       -- photos: the upright, resized copy used on the sheet
  width         int,
  height        int,
  converted     boolean not null default false,             -- HEIC converted
  sha256        text,                                       -- the original's hash: the same photo sent twice is stored once
  in_report     boolean not null default false,             -- Lane E: ticked for the report
  is_hero       boolean not null default false,
  inbound_email_id text,
  created_at    timestamptz not null default now()
);
create index if not exists desk_sheet_files_sheet_idx on desk_sheet_files (org_id, sheet_id);

-- ---- every inbound email, kept or dropped. The claim row makes a repeated delivery harmless. ----
create table if not exists desk_intake_log (
  id               bigserial primary key,
  inbound_email_id text not null,
  org_id           text,
  from_address     text,
  to_address       text,
  subject          text,
  outcome          text not null default 'received',        -- received | created | added_to_sheet | needs_the_car | dropped_not_seat | dropped_unknown_org | dropped_unauthenticated | error
  sheet_id         uuid,
  detail           jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index if not exists desk_intake_log_email_uidx on desk_intake_log (inbound_email_id);
create index if not exists desk_intake_log_org_idx on desk_intake_log (org_id, created_at desc);

-- ---- the copy of what went out: one row per sheet, ever (the unique index is the hard "nothing sent twice") ----
create table if not exists desk_sent (
  id            bigserial primary key,
  org_id        text not null references desk_orgs(id),
  sheet_id      uuid not null references desk_sheets(id),
  seat_id       bigint,
  seat_email    text,
  from_address  text not null,
  to_address    text not null,
  subject       text not null,
  body_text     text not null,                              -- exactly what went out
  body_html     text,
  note          text,
  pdf_path      text,
  pdf_name      text,
  provider      text,
  provider_id   text,
  mode          text not null default 'manual',             -- manual | auto
  sent_at       timestamptz not null default now()
);
create unique index if not exists desk_sent_sheet_uidx on desk_sent (sheet_id);
create index if not exists desk_sent_org_idx on desk_sent (org_id, sent_at desc);

-- ---- the private bucket: nothing public, no policy on storage.objects for anon or authenticated ----
insert into storage.buckets (id, name, public) values ('desk-intake', 'desk-intake', false) on conflict (id) do update set public = false;

-- ---- LOCK DOWN (standing rule) ----
alter table desk_sheets       enable row level security;
alter table desk_sheet_files  enable row level security;
alter table desk_intake_log   enable row level security;
alter table desk_sent         enable row level security;
revoke all on desk_sheets, desk_sheet_files, desk_intake_log, desk_sent from anon, authenticated;
revoke all on sequence desk_intake_log_id_seq, desk_sent_id_seq from anon, authenticated;
