-- live_listings (Oct 2026, Lane C): the live auction feed behind /buy, filled by api/pullLive.js
-- (cron every 4 hours) from OCD /auctions/live. Server-side writes only (service role).
-- Locked down from creation per the standing database rule.
create table if not exists live_listings (
  id bigint generated always as identity primary key,
  source text not null,
  source_listing_id text not null,
  url text, listing_title text, make text, model text, model_family text,
  year integer, vin text, vin_norm text, mileage integer, body text, transmission text,
  location text, country text, currency text,
  current_bid numeric, current_bid_usd numeric, end_time timestamptz,
  status text not null default 'live' check (status in ('live','ended_sold','ended_unsold')),
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  final_price numeric, photo_url text,
  unique (source, source_listing_id)
);
create index if not exists live_listings_status_idx on live_listings (status, end_time);
create index if not exists live_listings_vin_norm_idx on live_listings (vin_norm);
create index if not exists live_listings_family_idx on live_listings (make, model_family) where status = 'live';
alter table live_listings enable row level security;
revoke all on live_listings from anon, authenticated;

-- search_events: /buy searches log here with surface='buy', user_id NULL and an anon id, so they
-- never count toward any per-user cap (the cap queries count by user_id).
alter table public.search_events add column if not exists surface text;
alter table public.search_events add column if not exists anon_id text;
alter table public.search_events alter column user_id drop not null;
