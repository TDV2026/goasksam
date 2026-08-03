-- Phase 3 / Stage 2A: accounts.
-- One row per authenticated user, keyed by the Supabase Auth user id. The table
-- is server-controlled: the service role (our API functions) is the only writer,
-- and the browser never queries it directly (only /api/account and Supabase
-- Auth). Run once in the Supabase SQL editor.

create table if not exists public.accounts (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  email             text not null,
  tier              text not null default 'free',   -- 'free' | 'tdv'  (2B sets tdv from Beehiiv)
  tier_checked_at   timestamptz,                     -- last Beehiiv check (2B)
  bonus_searches    integer not null default 0,      -- wired into the limit math in 2C; unused at launch
  marketing_consent boolean not null default false,  -- "Send me Sam's market notes" opt-in (2A)
  created_at        timestamptz not null default now()
);

-- RLS ON with NO policies => no access for anon/authenticated roles through the
-- client. The service-role key (server only) bypasses RLS, so every read/write
-- flows through our API. Nothing about the account is reachable from the browser.
alter table public.accounts enable row level security;

create index if not exists accounts_created_at_idx on public.accounts (created_at);
create index if not exists accounts_tier_idx on public.accounts (tier);
