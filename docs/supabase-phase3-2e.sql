-- Phase 3 / 2E: the hunt door (buyer demand capture). Run once in the SQL editor.
-- One row per submission, tied to the signed-in account. Server-controlled
-- (RLS on, no policies -> service-role only).
create table if not exists public.hunts (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.accounts(user_id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);
create index if not exists hunts_created_idx on public.hunts (created_at);
alter table public.hunts enable row level security;
