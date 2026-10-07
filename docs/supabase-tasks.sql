-- Tasks (Oct 2026, Lane C): the buyer agent. A signed-in buyer gives Sam one job in plain words; the
-- rules-based matching runs after every live pull and Sam writes each update. Written and read
-- server-side only (api/tasks.js, service role, user_id from the validated Bearer token). Locked down
-- from creation per the standing database rule. Run once in the Supabase SQL editor.

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  email text,                                   -- where task emails go (the account's email)
  kind text not null check (kind in ('hunt', 'research')),
  state text not null default 'draft' check (state in ('draft', 'running', 'needs_you', 'paused', 'done')),
  words text not null,                          -- the buyer's original words
  filters jsonb not null default '{}'::jsonb,   -- the parsed job (car, generation, colour, gearbox, budget, miles, years, location, radius, vin)
  summary text,                                 -- the read-back Sam confirmed ("Sam is looking for ...")
  question text,                                -- the one question Sam needs answered (state needs_you / draft)
  seeded_from text,                             -- buy_search | vin | hunt | watched_search | typed
  seed_ref text,                                -- the id it was seeded from (hunt id, buy_conversations id, vin)
  checkpoint timestamptz,                       -- matching watermark: live_listings.first_seen later than this is new
  reported_ids bigint[] not null default '{}',  -- live_listings ids already reported (never twice)
  channels jsonb not null default '["inapp","email"]'::jsonb,   -- sms / push can be added on opt-in later
  unread integer not null default 0,
  last_interaction_at timestamptz not null default now(),
  still_looking_sent_at timestamptz,            -- the 60-day "Still looking?" (auto-pause 7 days later)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tasks_user_idx on tasks (user_id, updated_at desc);
create index if not exists tasks_running_idx on tasks (state) where state in ('running', 'needs_you');
-- One ACTIVE task per account (paused, draft and done do not count).
create unique index if not exists tasks_one_active_per_user on tasks (user_id) where state in ('running', 'needs_you');

create table if not exists task_updates (
  id bigint generated always as identity primary key,
  task_id uuid not null references tasks(id) on delete cascade,
  role text not null check (role in ('buyer', 'sam')),
  kind text not null default 'message' check (kind in ('message', 'confirm', 'question', 'match', 'research', 'still_looking', 'system')),
  text text not null,
  listing_ids bigint[],                          -- the live listings a match update reports
  data jsonb,                                    -- the cards / facts behind the update (never a value for a car)
  emailed_at timestamptz,                        -- one email per update, never per listing
  email_status text,                             -- sent | skipped_no_key | failed | test
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists task_updates_task_idx on task_updates (task_id, created_at);

-- Standing database rule: RLS on, no anon/authenticated grants, server-side writes only.
alter table tasks enable row level security;
revoke all on tasks from anon, authenticated;
alter table task_updates enable row level security;
revoke all on task_updates from anon, authenticated;

-- live_listings.first_seen is the matching key (already there since the table was created):
create index if not exists live_listings_first_seen_idx on live_listings (first_seen) where status = 'live';
