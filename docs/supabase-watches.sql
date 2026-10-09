-- Watches (Lane C, Oct 2026): standing notices on real events, unlimited, no questions, no chat model.
-- Run ONCE in the Supabase SQL editor. Until it is run the page hides every watch control
-- (api/watch.js action "ready" answers false) and the run does nothing.
--
--   kind 'spec': the next sale of a spec (the same spec key Buy's cards and spec_market_cache use,
--                lib/live/search.js specKeyFor), read through the shared engine with Market Check's fences.
--   kind 'vin':  this exact car coming up again, as a sale or offered at auction (vin_index via
--                vinAppearances) or as a live listing (live_listings first seen after the watch began).
--
-- watch_sends is the sent log: one row per (watch, event), so nothing is ever sent twice. Several events
-- within seven days of the last message wait and go together as one digest.

create table if not exists watches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  email text,
  kind text not null check (kind in ('spec', 'vin')),
  key text not null,                      -- the spec key (JSON) or the normalised VIN
  label text not null,                    -- what the rail and the message call it
  spec jsonb,                             -- kind 'spec': { title, v, generation, refine } for the engine
  baseline_date date,                     -- kind 'spec': events are sales dated AFTER this day
  created_at timestamptz not null default now(),
  last_event_at timestamptz,
  last_event text,                        -- one plain line for the rail ("Sold on Bring a Trailer, October 8, $58,500")
  last_sent_at timestamptz,
  stopped_at timestamptz,
  unique (user_id, kind, key)
);
create index if not exists watches_active_idx on watches (kind) where stopped_at is null;
create index if not exists watches_user_idx on watches (user_id, created_at desc);

create table if not exists watch_sends (
  id bigint generated always as identity primary key,
  watch_id uuid not null references watches(id) on delete cascade,
  event_key text not null,                -- the sale's or listing's own key
  sent_at timestamptz not null default now(),
  send_status text,
  unique (watch_id, event_key)
);
create index if not exists watch_sends_watch_idx on watch_sends (watch_id, sent_at desc);

alter table watches enable row level security;
revoke all on watches from anon, authenticated;
alter table watch_sends enable row level security;
revoke all on watch_sends from anon, authenticated;
