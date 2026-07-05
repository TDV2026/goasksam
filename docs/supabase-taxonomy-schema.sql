-- Taxonomy tables for the shared vehicle resolver (lib/vehicle.js).
-- Run once in the Supabase SQL editor, then seed with: npm run seed:taxonomy
-- (requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment).
--
-- The resolver works without these tables (it falls back to live OldCarsData
-- and vPIC calls, which are free). Seeding makes resolution faster and lets us
-- add aliases without a deploy.

create table if not exists taxonomy_makes (
  id bigint generated always as identity primary key,
  name text not null,
  slug text not null unique,
  source text not null default 'oldcarsdata',
  updated_at timestamptz not null default now()
);

create table if not exists taxonomy_models (
  id bigint generated always as identity primary key,
  make_slug text not null references taxonomy_makes(slug) on delete cascade,
  name text not null,
  slug text not null,
  -- [[start_year, end_year], ...] curated production ranges; null = unknown (permissive)
  year_ranges jsonb,
  source text not null default 'oldcarsdata',
  updated_at timestamptz not null default now(),
  unique (make_slug, slug)
);

create table if not exists taxonomy_aliases (
  id bigint generated always as identity primary key,
  alias text not null,
  alias_slug text not null,
  -- 'abbreviation' and 'nickname' expand silently; 'misspelling' requires user confirmation
  kind text not null check (kind in ('abbreviation', 'nickname', 'misspelling')),
  make text not null,
  model text,
  trim text,
  confirm boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (alias_slug, make)
);

create index if not exists taxonomy_models_make_slug_idx on taxonomy_models (make_slug);

alter table taxonomy_makes enable row level security;
alter table taxonomy_models enable row level security;
alter table taxonomy_aliases enable row level security;

-- Taxonomy is public, non-sensitive reference data: readable by anyone,
-- writable only via the service role (which bypasses RLS).
drop policy if exists "taxonomy_makes_read" on taxonomy_makes;
create policy "taxonomy_makes_read" on taxonomy_makes for select using (true);
drop policy if exists "taxonomy_models_read" on taxonomy_models;
create policy "taxonomy_models_read" on taxonomy_models for select using (true);
drop policy if exists "taxonomy_aliases_read" on taxonomy_aliases;
create policy "taxonomy_aliases_read" on taxonomy_aliases for select using (true);
