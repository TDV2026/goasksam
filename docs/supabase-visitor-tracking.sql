-- Visitor tracking (Oct 2026, open-search policy, Lane B Step 2).
-- Run once in the Supabase SQL editor (standing rule: Sam runs DDL by hand).
--
-- Two additive changes, zero risk to existing callers:
--   1. funnel_events gains visitor_id / tool / props columns. Every existing INSERT
--      (sellerDecision.js logFunnel, api/account.js funnel(), api/funnel.js) keeps working
--      unchanged - the new columns default to null for rows that don't set them.
--   2. visitor_links is a NEW table: many pseudonymous visitor ids -> one account, so a
--      person who searched anonymously on several devices before signing in keeps all of
--      that history attached once they sign in on any one of them (lib/events.js
--      stitchVisitorToAccount, called from api/account.js on every ensure).

alter table public.funnel_events add column if not exists visitor_id text;
alter table public.funnel_events add column if not exists tool text; -- 'buy' | 'market_check' | 'sell' | 'tasks' | null
alter table public.funnel_events add column if not exists props jsonb;

create index if not exists funnel_events_visitor_idx on public.funnel_events (visitor_id, created_at);
create index if not exists funnel_events_tool_event_idx on public.funnel_events (tool, event, created_at);

create table if not exists public.visitor_links (
  visitor_id text primary key,
  user_id uuid not null,
  first_seen_at timestamptz not null default now(),
  linked_at timestamptz not null default now()
);
create index if not exists visitor_links_user_idx on public.visitor_links (user_id);

-- Standing DB security rule: every new table ships locked down from creation.
alter table public.visitor_links enable row level security;
revoke all on public.visitor_links from anon, authenticated;

-- funnel_events RLS was already enabled + anon/authenticated already revoked in
-- docs/supabase-phase3-2c.sql; re-stating here is a harmless no-op if already applied.
alter table public.funnel_events enable row level security;
revoke all on public.funnel_events from anon, authenticated;
