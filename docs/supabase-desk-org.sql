-- Sam Desk — tenant/org data model + private layer (Stage 1, change 4)
-- =====================================================================
-- Run ONCE in the Supabase SQL editor. Safe/idempotent (IF NOT EXISTS + an
-- idempotent seed). No CONCURRENTLY, no large-table scans, so no editor-timeout
-- risk (these tables are tiny). Secrets are not pullable locally, so Sam runs DDL.
--
-- WHEN TO RUN: run this BEFORE the saved-views feature goes live. Until it exists,
-- the Desk Analyst core (Ask/Build/result/export) works without it; only "Watch"
-- (save a query as a view) needs these tables. The Desk resolves a crew device to
-- org "sam" (seeded below); saved views / lead notes / outcomes are scoped by org_id.
--
-- Tenant-ready by design: the only tenant now is org "sam", but every private row
-- carries org_id so adding real seats/SSO later needs no data migration.
-- RLS is ENABLED with NO policy: only the service role (server-side) reaches these,
-- exactly like the other private tables in this project.
-- =====================================================================

-- Organizations (tenants).
create table if not exists desk_orgs (
  id          text primary key,           -- stable slug, e.g. 'sam'
  name        text not null,
  created_at  timestamptz not null default now()
);
alter table desk_orgs enable row level security;

-- Seats: a member of an org with a role. Identity is a stable subject string
-- (a Supabase auth user_id once login is added; the crew cookie maps to the
-- seeded owner seat for now). email is optional until real login.
create table if not exists desk_seats (
  id          bigserial primary key,
  org_id      text not null references desk_orgs(id),
  subject     text not null,              -- 'crew' now; a uuid user_id later
  email       text,
  role        text not null default 'member',   -- 'owner' | 'admin' | 'member'
  created_at  timestamptz not null default now(),
  unique (org_id, subject)
);
alter table desk_seats enable row level security;
create index if not exists desk_seats_org_idx on desk_seats (org_id);

-- Saved views (the "Watch" layer): a named, saved DSL query, per org.
create table if not exists desk_saved_views (
  id           bigserial primary key,
  org_id       text not null references desk_orgs(id),
  created_by   text,                      -- seat subject
  name         text not null,
  question     text,                      -- the plain-English question, if it came from Ask
  dsl          jsonb not null,            -- the validated DSL
  last_run_at  timestamptz,
  last_summary jsonb,                     -- {total, answerRowCount, ...} so a rerun can show what changed
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table desk_saved_views enable row level security;
create index if not exists desk_saved_views_org_idx on desk_saved_views (org_id, updated_at desc);

-- Seed the single tenant + its owner seat (idempotent).
insert into desk_orgs (id, name) values ('sam', 'Sam')
  on conflict (id) do nothing;
insert into desk_seats (org_id, subject, role) values ('sam', 'crew', 'owner')
  on conflict (org_id, subject) do nothing;

-- Note: Stage 3 (Leads) will add desk_lead_notes and desk_lead_outcomes, both
-- org_id-scoped the same way, plus an owner/org column on the shared lead intake.
