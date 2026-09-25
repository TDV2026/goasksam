-- Sam Desk — the dictionary REVIEW QUEUE (spec sections 3 + 4, "learning loop").
-- =====================================================================
-- Every unresolved phrase from real use lands here with the question it came from. Sam
-- reviews the queue and promotes entries into lib/desk/dictionary.js. The model NEVER writes
-- to the dictionary; it only feeds this queue. This is the roadmap for the dictionary.
--
-- Apply once in the Supabase SQL editor (secrets are not pullable locally, so Sam runs DDL).
-- Safe to re-run: CREATE ... IF NOT EXISTS + CREATE OR REPLACE FUNCTION.
-- =====================================================================

create table if not exists desk_dictionary_queue (
  id          bigint generated always as identity primary key,
  phrase      text        not null,                 -- the unresolved phrase, normalized (lowercased, single-spaced)
  question    text,                                 -- the most recent full question it came from (context for review)
  org_id      text        not null default 'global',-- the org that hit it (tenant isolation; 'global' when none)
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  count       integer     not null default 1,       -- how many times this phrase has been logged (ranks the backlog)
  status      text        not null default 'new',   -- new | reviewing | promoted | rejected
  unique (phrase, org_id)
);

-- Backlog is worked most-frequent first, within a status.
create index if not exists idx_desk_dict_queue_status_count on desk_dictionary_queue (status, count desc);
create index if not exists idx_desk_dict_queue_lastseen on desk_dictionary_queue (last_seen desc);

-- Atomic log-or-increment. The interpreter calls this (via /rest/v1/rpc/desk_queue_log) whenever
-- the validator returns an unresolved phrase. One row per (phrase, org); count increments; the
-- most recent question is kept for context. Returns the row so the caller can log the count.
create or replace function desk_queue_log(p_phrase text, p_question text, p_org text default 'global')
returns desk_dictionary_queue
language plpgsql
as $$
declare
  r desk_dictionary_queue;
  norm text := lower(btrim(regexp_replace(coalesce(p_phrase, ''), '\s+', ' ', 'g')));
begin
  if norm = '' then
    return null;
  end if;
  insert into desk_dictionary_queue (phrase, question, org_id)
    values (norm, p_question, coalesce(nullif(btrim(p_org), ''), 'global'))
  on conflict (phrase, org_id) do update
    set count     = desk_dictionary_queue.count + 1,
        last_seen = now(),
        question  = coalesce(excluded.question, desk_dictionary_queue.question),
        -- a re-seen phrase that was rejected re-opens as 'new' (the market changed its mind)
        status    = case when desk_dictionary_queue.status = 'rejected' then 'new' else desk_dictionary_queue.status end
  returning * into r;
  return r;
end;
$$;

-- Security (STANDING RULE for every new table + function): RLS on, grants revoked from anon +
-- authenticated at creation; the queue is written ONLY by the server via the service role, which
-- bypasses RLS. desk_queue_log is execute-restricted to service_role so a leaked anon/authenticated
-- key can neither read the queue nor call the logger. (Applied to the DB Sep 2026.)
alter table desk_dictionary_queue enable row level security;
revoke all on desk_dictionary_queue from anon, authenticated;
revoke execute on function desk_queue_log(text, text, text) from public, anon, authenticated;
grant execute on function desk_queue_log(text, text, text) to service_role;
