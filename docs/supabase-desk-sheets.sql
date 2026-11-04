-- Desk Valuations: the sheets (Lane E, Nov 4 2026; docs/desk-valuations-spec.md "Saving per seat and org").
-- Run ONCE in the Supabase SQL editor (Sam runs DDL; secrets are not pullable). Idempotent. Needs docs/supabase-desk-org.sql first (desk_orgs, desk_seats).
-- Every sheet is a private row owned by the org with the seat stamped. The whole sheet (submission, state, the frozen read, the decision, the send log) is `data`; the columns beside it
-- are what the queue and the rail filter on.
create table if not exists desk_sheets (
  id          text primary key,
  org_id      text not null references desk_orgs(id),
  owner_seat  text not null,
  vin         text,
  status      text not null default 'New',     -- New | In progress | Finalised | Sent | Needs the car
  data        jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists desk_sheets_org_idx on desk_sheets (org_id, created_at desc);
create index if not exists desk_sheets_vin_idx on desk_sheets (org_id, vin);
create index if not exists desk_sheets_owner_idx on desk_sheets (org_id, owner_seat, status);
-- locked down from creation (the standing database rule): the browser never reaches this table; the server uses the service role
alter table desk_sheets enable row level security;
revoke all on desk_sheets from anon, authenticated;
