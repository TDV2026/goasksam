create table if not exists vehicle_market_records (
  id bigserial primary key,
  source text not null,
  source_record_id text not null,
  source_url text,
  platform text,
  make text,
  model text,
  year integer,
  raw_title text,
  raw_listing_model text,
  raw_description text,
  price numeric,
  auction_status text,
  auction_end_date timestamptz,
  seller_username text,
  raw_record jsonb not null,
  ingested_at timestamptz not null default now(),
  ingestion_batch_id uuid,
  unique (source, source_record_id)
);

alter table vehicle_market_records add column if not exists source_url text;
alter table vehicle_market_records add column if not exists platform text;
alter table vehicle_market_records add column if not exists raw_title text;
alter table vehicle_market_records add column if not exists raw_listing_model text;
alter table vehicle_market_records add column if not exists raw_description text;
alter table vehicle_market_records add column if not exists auction_status text;
alter table vehicle_market_records add column if not exists auction_end_date timestamptz;
alter table vehicle_market_records add column if not exists seller_username text;
alter table vehicle_market_records add column if not exists raw_record jsonb;
alter table vehicle_market_records add column if not exists ingested_at timestamptz default now();
alter table vehicle_market_records add column if not exists ingestion_batch_id uuid;

create table if not exists vehicle_classifications (
  id bigserial primary key,
  market_record_id bigint references vehicle_market_records(id),
  source_record_id text,
  normalized_make text,
  normalized_model text,
  normalized_year integer,
  normalized_generation text,
  normalized_trim text,
  searched_year integer,
  searched_color text,
  target_match boolean,
  comparison_tier text,
  exclusion_reasons jsonb,
  classification_source text,
  classification_confidence text,
  matched_terms jsonb,
  needs_review boolean default false,
  classifier_version integer not null default 1,
  classified_at timestamptz not null default now(),
  classification_batch_id uuid
);

alter table vehicle_classifications add column if not exists exclusion_reasons jsonb;

create table if not exists seller_leads (
  id bigserial primary key,
  reference text not null unique,
  submitted_at timestamptz not null default now(),
  lead_status text not null default 'submitted',
  car_raw text,
  vin text,
  car_region text,
  mileage text,
  condition text,
  service_records text,
  title_status text,
  target_price text,
  timeline text,
  involvement_preference text,
  notes text,
  chosen_destination text,
  chosen_destination_type text,
  chosen_option_key text,
  seller_email text not null,
  seller_phone text,
  decision_summary jsonb
);

alter table seller_leads add column if not exists car_region text;

create index if not exists vehicle_market_records_make_model_idx
  on vehicle_market_records (make, model);

create index if not exists vehicle_market_records_end_date_idx
  on vehicle_market_records (auction_end_date desc);

create index if not exists vehicle_classifications_source_record_idx
  on vehicle_classifications (source_record_id);

create index if not exists seller_leads_submitted_at_idx
  on seller_leads (submitted_at desc);

notify pgrst, 'reload schema';
