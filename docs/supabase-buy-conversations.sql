-- buy_conversations (Oct 2026, Lane C): saved /buy conversations ("Your searches"). Written and read
-- server-side only (api/buySearch.js, service role, user_id from the validated Bearer token). One row
-- per saved conversation; watch=true means "Tell me when one comes up" (a watch_requests row keyed
-- search:<id> carries the email). Locked down from creation per the standing database rule.
create table if not exists buy_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  messages jsonb not null default '[]'::jsonb,
  filters jsonb not null default '{}'::jsonb,
  state jsonb not null default '{}'::jsonb,
  watch boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists buy_conversations_user_idx on buy_conversations (user_id, updated_at desc);
alter table buy_conversations enable row level security;
revoke all on buy_conversations from anon, authenticated;
