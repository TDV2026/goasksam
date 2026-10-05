-- watch_requests (Oct 2026, Lane C): "Watch this car" sign-ups from the /history VIN pages.
-- Written server-side only (api/history.js, service role). Locked down from creation per the
-- standing database rule: RLS on, no anon/authenticated grants.
create table if not exists watch_requests (
  id bigint generated always as identity primary key,
  vin_norm text not null,
  email text not null,
  created_at timestamptz not null default now(),
  unique (vin_norm, email)
);
create index if not exists watch_requests_vin_norm_idx on watch_requests (vin_norm);
alter table watch_requests enable row level security;
revoke all on watch_requests from anon, authenticated;
