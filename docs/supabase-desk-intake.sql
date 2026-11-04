-- Sam Desk Valuations: inbound email (intake) and Send (Lane D, Nov 2026; docs/desk-valuations-spec.md).
-- =====================================================================
-- Run ONCE in the Supabase SQL editor, AFTER docs/supabase-desk-org.sql and docs/supabase-desk-storage.sql (Lane S: desk_sheets, desk_sheet_photos,
-- desk_sheet_documents, desk_sheet_sent, desk_org_settings, the per-org buckets). This file only ADDS to those: columns Lane D needs on the queue row, one
-- unique index, and one new table (the inbound log). Idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS). All tables are tiny; no scans of the archive.
-- Every new table ships locked down (STANDING RULE): RLS on, no policy, every grant revoked from anon and authenticated. Only the service role reaches it.
-- Files live ONLY in the org's private bucket "desk-<org>" under <org>/<sheet>/ (lib/desk/storage.js); Lane D writes them through that module.
-- Retention (licence end + 90 days) is Lane S's trigger on desk_sheets: an org must have desk_org_settings.licence_ends_on set before a sheet can be created.
-- =====================================================================

-- ---- the org's inbound address: hagerty@desk.goasksam.com ----
alter table desk_orgs add column if not exists inbound_local text;
create unique index if not exists desk_orgs_inbound_local_uidx on desk_orgs (lower(inbound_local)) where inbound_local is not null;

-- ---- the queue row (Lane S's desk_sheets): what intake reads from a submission. Status values are Lane S's: new, in_progress, finalised, sent, needs_car. ----
alter table desk_sheets add column if not exists source            text not null default 'email';   -- email | typed
alter table desk_sheets add column if not exists seat_email        text;
alter table desk_sheets add column if not exists chassis           text;
alter table desk_sheets add column if not exists no_vin            boolean not null default false;   -- the "No VIN found" box (pre 1981 chassis, or no VIN in the email)
alter table desk_sheets add column if not exists more_vins         text[] not null default '{}';     -- the "More VINs" flag: the other VINs in the same email
alter table desk_sheets add column if not exists vin_check_invalid boolean not null default false;   -- marker: the check digit fails (European market VINs have none)
alter table desk_sheets add column if not exists vin_maker_unknown boolean not null default false;   -- marker: the first three characters are not a maker code we know (never a gate)
alter table desk_sheets add column if not exists vin_failed_check  text[] not null default '{}';     -- 17-character strings rejected as not a VIN (structure only)
alter table desk_sheets add column if not exists year              int;
alter table desk_sheets add column if not exists make              text;
alter table desk_sheets add column if not exists model             text;
alter table desk_sheets add column if not exists trim              text;
alter table desk_sheets add column if not exists mileage           int;
alter table desk_sheets add column if not exists mileage_basis     text;
alter table desk_sheets add column if not exists gearbox           text;
alter table desk_sheets add column if not exists colour            text;
alter table desk_sheets add column if not exists subject           text;
alter table desk_sheets add column if not exists subject_key       text;
alter table desk_sheets add column if not exists thread_ids        text[] not null default '{}';     -- message ids of the thread: a later email on it adds to this sheet
alter table desk_sheets add column if not exists links             jsonb not null default '[]'::jsonb;   -- shared-folder links as written, never opened
alter table desk_sheets add column if not exists inbound_email_ids text[] not null default '{}';
alter table desk_sheets add column if not exists engine_status     text;                              -- null | running | done | failed (the read itself is engine_read)
alter table desk_sheets add column if not exists pdf_path          text;                              -- the report PDF, in the org bucket
alter table desk_sheets add column if not exists sending           boolean not null default false;   -- Send claimed: a second Send of the same sheet is refused
alter table desk_sheets add column if not exists sent_to           text;
alter table desk_sheets add column if not exists sent_provider_id  text;                              -- the provider's message id (desk_sheet_sent is never edited)
create index if not exists desk_sheets_thread_ids_idx on desk_sheets using gin (thread_ids);
create index if not exists desk_sheets_subject_key_idx on desk_sheets (org_id, subject_key) where subject_key is not null;

-- ---- files: the hash makes the same photo sent twice a single row ----
alter table desk_sheet_photos    add column if not exists sha256 text;
alter table desk_sheet_documents add column if not exists sha256 text;

-- ---- the copy of what went out: the exact html, and how it was sent. One row per sheet, ever. ----
alter table desk_sheet_sent add column if not exists body_html text;
alter table desk_sheet_sent add column if not exists mode text not null default 'manual';   -- manual | auto
create unique index if not exists desk_sheet_sent_one on desk_sheet_sent (sheet_id);       -- the hard "nothing sent twice"

-- ---- every inbound email, kept or dropped. The claim row makes a repeated delivery harmless. ----
create table if not exists desk_intake_log (
  id               bigserial primary key,
  inbound_email_id text not null,
  org_id           text,
  from_address     text,
  to_address       text,
  subject          text,
  outcome          text not null default 'received',        -- received | created | added_to_sheet | needs_the_car | dropped_not_seat | dropped_unknown_org | dropped_unauthenticated | duplicate | error
  sheet_id         uuid,
  detail           jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index if not exists desk_intake_log_email_uidx on desk_intake_log (inbound_email_id);
create index if not exists desk_intake_log_org_idx on desk_intake_log (org_id, created_at desc);

-- ---- LOCK DOWN (standing rule) ----
alter table desk_intake_log enable row level security;
revoke all on desk_intake_log from anon, authenticated;
revoke all on sequence desk_intake_log_id_seq from anon, authenticated;
