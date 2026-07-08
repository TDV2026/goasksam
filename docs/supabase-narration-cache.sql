-- Narration cache (Stage 3 cost hardening). One row per unique chat request
-- payload hash (model + system prompt + context + messages). Identical
-- decision facts reuse the stored narration instead of re-billing Anthropic;
-- any change to the facts, prompts, or model changes the hash, so entries
-- invalidate themselves. Run once in the Supabase SQL editor.

create table if not exists narration_cache (
  cache_key text primary key,
  response_text text not null,
  model text,
  created_at timestamptz not null default now(),
  hits integer not null default 0
);

alter table narration_cache enable row level security;
