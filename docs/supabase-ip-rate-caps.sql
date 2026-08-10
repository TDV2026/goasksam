-- Spec C: PER-IP RATE CAPS. Run once in the Supabase SQL editor.
-- A lightweight per-IP hit ledger + app_config dials, counted in a window by the
-- API (same pattern as search_events). Server-controlled (RLS on, no policies ->
-- service-role only). Crew devices bypass the whole gate in the API and never
-- reach this. Removed/relaxed post-launch as traffic patterns settle.

-- ---- the per-IP hit ledger (one row per counted event) ----------------------
create table if not exists public.ip_rate_hits (
  id bigint generated always as identity primary key,
  ip text not null,
  kind text not null,           -- 'search' (any), 'anon_search', 'signup'
  created_at timestamptz not null default now()
);
create index if not exists ip_rate_hits_ip_kind_created_idx on public.ip_rate_hits (ip, kind, created_at);
create index if not exists ip_rate_hits_created_idx on public.ip_rate_hits (created_at);
alter table public.ip_rate_hits enable row level security;

-- ---- the dials (change numbers here, no deploy) -----------------------------
insert into public.app_config (key, value) values
  ('ip_cap_anon_day',   '20'::jsonb),   -- (a) anonymous searches / IP / day
  ('ip_cap_all_hour',   '60'::jsonb),   -- (b) total searches / IP / hour (set high; signed-in users never hit it)
  ('ip_cap_signup_day', '5'::jsonb)     -- (c) account creations / IP / day (enforced by the Supabase auth hook below)
  on conflict (key) do nothing;

-- ---- optional housekeeping: prune old hits (safe to run on a schedule) -------
-- delete from public.ip_rate_hits where created_at < now() - interval '2 days';

-- =============================================================================
-- (c) ACCOUNT CREATIONS / IP / DAY
-- Account creation goes straight to Supabase Auth (GoTrue) from the browser, not
-- through our API, and the app is at the 12-function Hobby cap, so (c) cannot be
-- enforced in our API layer. It is enforced with a Supabase "before user created"
-- Auth Hook (Dashboard: Authentication -> Hooks). The hook function below rejects
-- a signup once the per-IP daily cap is reached. Enable it after creating it.
-- Note: the hook payload's IP field name can vary by Supabase version; adjust the
-- extraction if your project exposes it under a different key.
create or replace function public.before_user_created_ip_cap(event jsonb)
returns jsonb language plpgsql security definer as $$
declare
  v_ip text; v_cap integer; v_used integer;
begin
  v_ip := coalesce(event #>> '{claims,ip}', event #>> '{metadata,ip_address}', event #>> '{ip_address}');
  if v_ip is null or v_ip = '' then
    return event;  -- no IP to key on: never block a real signup
  end if;
  select coalesce((value #>> '{}')::int, 5) into v_cap from public.app_config where key = 'ip_cap_signup_day';
  v_cap := coalesce(v_cap, 5);
  select count(*) into v_used from public.ip_rate_hits
    where ip = v_ip and kind = 'signup' and created_at >= date_trunc('day', now());
  if v_used >= v_cap then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 429,
      'message', 'A lot of sign-ups are coming from your connection. Try again in a bit.'));
  end if;
  insert into public.ip_rate_hits (ip, kind) values (v_ip, 'signup');
  return event;
end; $$;
