-- buy_alerts (Lane C, Oct 2026): Buy's "Sam will tell you before it ends". One row per (buyer, live listing):
-- armed from the Market Check drawer on a Buy card, one message about three hours before the auction ends
-- (or at arming when under three hours remain), then nothing (the arming ends itself with the auction).
-- Never a Task: it never counts toward or touches the account's one Tasks search.
-- Server-side only (service role, lib/live/buyAlerts.js). Run once in the Supabase SQL editor.
create table if not exists buy_alerts (
  id uuid primary key default gen_random_uuid(),
  listing_id bigint not null references live_listings(id) on delete cascade,
  user_id uuid not null,
  email text,
  armed_at timestamptz not null default now(),
  sent_at timestamptz,
  send_status text,
  cancelled_at timestamptz,
  unique (user_id, listing_id)
);
-- The send run (every 15 minutes) reads only armed, unsent, not-cancelled rows.
create index if not exists buy_alerts_due_idx on buy_alerts (armed_at) where sent_at is null and cancelled_at is null;
-- A buyer's own armed cars (the rail, the card pills) read by user_id: the unique (user_id, listing_id)
-- index above leads with user_id and covers it. Listing lookups (a car's arming) by listing_id:
create index if not exists buy_alerts_listing_idx on buy_alerts (listing_id);

alter table buy_alerts enable row level security;
revoke all on buy_alerts from anon, authenticated;
