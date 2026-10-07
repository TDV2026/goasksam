-- spec_pages: the nightly-built, serve-from-table backing for the Porsche 911 spec/hub pages (search
-- rules, Spec page type). Pages READ from this table (rule 11, under 1 second) and never compute a
-- specPage() on request. Written by scripts/buildSpecPagesCache.js, right after the "Refresh spec
-- market cache" nightly step. live_listings is a lighter field, refreshed every 4 hours by
-- api/refreshSpecLiveCounts.js (the same cadence as the /api/pullLive cron) so the live count never
-- waits for the next full nightly build. Run this file once in the Supabase SQL editor.

create table if not exists spec_pages (
  slug text primary key,
  level text not null,                 -- "model" | "gen" | "trim" | "leaf"
  indexable boolean not null default false,
  count integer not null default 0,
  data jsonb not null,                 -- the full specPage(slug) object (lead, children, recentSales, repeatVins, ...)
  computed_at timestamptz not null default now(),
  live_updated_at timestamptz
);

create index if not exists spec_pages_level_idx on spec_pages (level);
create index if not exists spec_pages_indexable_idx on spec_pages (indexable);

alter table spec_pages enable row level security;
revoke all on spec_pages from anon, authenticated;
