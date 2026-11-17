-- VALUE DRIVER MINING (Lane B, Nov 17 2026, branch lane-b-factmine; order bc85). RUN ONCE in the Supabase SQL Editor (prod otkmxyrglikdoychnmvy). Lane B runs no DDL.
-- Three tables. NO listing text and NO seller name in any of them: a mention is a topic in a few plain words written by the miner, a category and a type from fixed lists,
-- two flags, and the character span it came from (numbers into text the miner read and the database does not hold).
-- listing_id is source_slug || ':' || the source's own listing id (sales_archive.source_id, auction_attempts.source_record_id).

create table if not exists listing_mining_runs (
  listing_id      text        not null,
  miner_version   text        not null,
  source          text        not null,
  family          text        not null,
  sold_or_attempt text        not null check (sold_or_attempt in ('sold','attempt')),
  status          text        not null check (status in ('done','failed','skipped_no_text')),
  characters_read integer     not null default 0,
  items_found     integer     not null default 0,
  tokens_input    integer     not null default 0,
  tokens_output   integer     not null default 0,
  error           text,
  created_at      timestamptz not null default now(),
  primary key (listing_id, miner_version)
);
create index if not exists listing_mining_runs_family_idx on listing_mining_runs (family, miner_version, status);

create table if not exists listing_mentions (
  id              bigint generated always as identity primary key,
  listing_id      text        not null,
  source          text        not null,
  family          text        not null,
  sold_or_attempt text        not null check (sold_or_attempt in ('sold','attempt')),
  miner_version   text        not null,
  topic           text        not null,   -- as written by the miner, a few plain words
  category        text        not null,
  statement_type  text        not null check (statement_type in ('work_done','condition_present','absence_stated','claim')),
  polarity        text        not null check (polarity in ('positive','negative','neutral')),
  has_date        boolean     not null default false,
  has_mileage     boolean     not null default false,
  span_start      integer     not null,
  span_end        integer     not null,
  created_at      timestamptz not null default now(),
  check (span_end > span_start and span_start >= 0)
);
create index if not exists listing_mentions_listing_idx on listing_mentions (listing_id, miner_version);
create index if not exists listing_mentions_family_idx  on listing_mentions (family, miner_version, topic);

create table if not exists topic_map (
  raw_topic       text        not null,
  canonical_topic text        not null,
  family          text        not null,
  map_version     text        not null,
  created_at      timestamptz not null default now(),
  primary key (family, map_version, raw_topic)
);

-- STANDING RULE (CLAUDE.md, Database security): locked down from creation.
alter table listing_mining_runs enable row level security;
alter table listing_mentions    enable row level security;
alter table topic_map           enable row level security;
revoke all on listing_mining_runs from anon, authenticated;
revoke all on listing_mentions    from anon, authenticated;
revoke all on topic_map           from anon, authenticated;
