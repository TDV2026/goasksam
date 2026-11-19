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

-- Lane D, Nov 18 2026 (lane-d-factmine-3): the kind of a canonical topic (set at factmap; factreport and factprice set equipment aside by default). RUN ONCE; safe to run again. Rows written before this have no kind and are asked once by the next factmap call.
alter table topic_map add column if not exists kind text check (kind in ('condition','history','work_done','modification','paperwork','equipment','other'));

-- Lane D, Nov 19 2026 (lane-d-factmine-4; Sam's rule: capture everything a seller states, decide nothing at reading time). RUN ONCE; safe to run again. On a table that already exists it adds the new fact columns and widens the lists the miner no longer has to stay inside.
-- The stated year and mileage of a fact (the numbers, null when the fact carries none) and whether records, receipts, invoices or photos are named as proof for it. has_date and has_mileage stay (true when the number is there).
alter table listing_mentions add column if not exists stated_year    integer;
alter table listing_mentions add column if not exists stated_miles   integer;
alter table listing_mentions add column if not exists proof_mentioned boolean not null default false;
-- statement_type and polarity keep their lists plus 'other' (a value the miner chose outside the list is stored as 'other', never dropped); the category is open (a column of free short words, there never was a list in the table).
alter table listing_mentions drop constraint if exists listing_mentions_statement_type_check;
alter table listing_mentions add constraint listing_mentions_statement_type_check check (statement_type in ('work_done','condition_present','absence_stated','claim','other'));
alter table listing_mentions drop constraint if exists listing_mentions_polarity_check;
alter table listing_mentions add constraint listing_mentions_polarity_check check (polarity in ('positive','negative','neutral','other'));
-- the map's kinds gain 'option' (a factory option or package named as such), beside 'equipment'.
alter table topic_map drop constraint if exists topic_map_kind_check;
alter table topic_map add constraint topic_map_kind_check check (kind in ('condition','history','work_done','modification','paperwork','equipment','option','other'));
-- THE COVERAGE COUNTS (task=factcoverage): one row per listing and miner version, COUNTS ONLY (no sentence text, no quote). skipped_with_fact = skipped sentences a second, separate read judged to state a fact about the car; kinds = {"kind in two words": count}.
create table if not exists listing_coverage (
  listing_id         text        not null,
  miner_version      text        not null,
  source             text        not null,
  family             text        not null,
  sentences          integer     not null default 0,
  sentences_mined    integer     not null default 0,
  sentences_skipped  integer     not null default 0,
  skipped_with_fact  integer     not null default 0,
  unanswered         integer     not null default 0,   -- skipped sentences the second read gave no answer for (never counted as holding a fact)
  kinds              jsonb       not null default '{}'::jsonb,
  tokens_input       integer     not null default 0,
  tokens_output      integer     not null default 0,
  created_at         timestamptz not null default now(),
  primary key (listing_id, miner_version)
);
create index if not exists listing_coverage_family_idx on listing_coverage (family, miner_version);

-- STANDING RULE (CLAUDE.md, Database security): locked down from creation.
alter table listing_mining_runs enable row level security;
alter table listing_mentions    enable row level security;
alter table topic_map           enable row level security;
alter table listing_coverage    enable row level security;
revoke all on listing_mining_runs from anon, authenticated;
revoke all on listing_mentions    from anon, authenticated;
revoke all on topic_map           from anon, authenticated;
revoke all on listing_coverage    from anon, authenticated;
