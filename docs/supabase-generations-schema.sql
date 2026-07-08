-- Model generations (Phase 4). One row per (make, model, generation code)
-- with its US model-year range. Serves both the generation-aware evidence
-- ladder and chassis-code resolution hints. Seeded from the curated list in
-- lib/generations.js via `npm run seed:generations`.
-- Run once in the Supabase SQL editor.

create table if not exists taxonomy_generations (
  id bigint generated always as identity primary key,
  make text not null,
  model text not null,
  generation_code text not null,
  year_start integer not null,
  year_end integer not null,
  updated_at timestamptz not null default now(),
  unique (make, model, generation_code)
);

alter table taxonomy_generations enable row level security;
