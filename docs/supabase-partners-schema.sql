-- Partner (PowerSeller) registry. Run once in the Supabase SQL editor, then
-- seed with: npm run seed:partners
--
-- Every displayed claim carries a source: 'partner_provided' (the partner told
-- us; rendered with attribution, e.g. "per howS") or 'data_verified' (computed
-- at request time from vehicle_market_records; rendered as market data).
-- Nothing in this table is ever presented as market data.

create table if not exists partners (
  id bigint generated always as identity primary key,
  slug text not null unique,
  name text not null,
  display_name text,
  active boolean not null default true,
  -- coverage, e.g. ["Nationwide","Pennsylvania","New Jersey"] (partner_provided)
  regions jsonb not null default '[]'::jsonb,
  -- {"makes": [...], "segments": [...], "notes": "..."} (partner_provided)
  specialties jsonb not null default '{}'::jsonb,
  -- [{"name": "Bring a Trailer", "source": "partner_provided"}, ...]
  platforms jsonb not null default '[]'::jsonb,
  -- [{"text": "...", "source": "partner_provided"}, ...]
  service_claims jsonb not null default '[]'::jsonb,
  -- usernames in vehicle_market_records used to compute data_verified stats
  seller_usernames jsonb not null default '[]'::jsonb,
  referral_terms text,
  min_value_usd integer,
  updated_at timestamptz not null default now()
);

alter table partners enable row level security;
-- No anon read policy: referral terms are business data. sellerDecision reads
-- with the service role key, which bypasses RLS.
