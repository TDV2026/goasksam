-- CONDITION TIER (Lane B, Nov 2026, Desk Valuations spec item 1). Run ONCE in the Supabase SQL editor BEFORE the assign job or any engine read of a tier.
-- Every sale carries a tier 1 to 4 (null = Untiered) assigned from its own listing text and fields (lib/conditionTier.js), with the evidence lines that produced it.
--   condition_tier      smallint  1 concours, 2 excellent, 3 good, 4 fair; NULL = Untiered or not yet assigned (condition_version tells which)
--   condition_evidence  jsonb     [{ code, points, line }]: the lines that produced the tier
--   condition_version   text      lib/conditionTier.js TIER_VERSION; the job reassigns every row whose version differs
--   condition_at        timestamptz when it was assigned
alter table sales_archive add column if not exists condition_tier     smallint;
alter table sales_archive add column if not exists condition_evidence jsonb;
alter table sales_archive add column if not exists condition_version  text;
alter table sales_archive add column if not exists condition_at       timestamptz;
alter table sales_archive drop constraint if exists sales_archive_condition_tier_chk;
alter table sales_archive add constraint sales_archive_condition_tier_chk check (condition_tier is null or condition_tier between 1 and 4);

-- The job walks the rows it has not assigned at this version, in id order.
create index if not exists sales_archive_condition_todo_idx on sales_archive (id) where condition_version is null;

-- One batch write: p = [{ id, tier, evidence, version }, ...]. A plain UPDATE ... FROM (an upsert times out on this table).
create or replace function set_condition_tiers(p jsonb) returns integer
language plpgsql security invoker set search_path = public as $$
declare n integer;
begin
  update sales_archive s
     set condition_tier = x.tier, condition_evidence = x.evidence, condition_version = x.version, condition_at = now()
    from jsonb_to_recordset(p) as x(id uuid, tier smallint, evidence jsonb, version text)
   where s.id = x.id;
  get diagnostics n = row_count;
  return n;
end $$;

-- LOCK DOWN (standing rule): sales_archive already ships RLS-enabled with anon/authenticated revoked; the new columns inherit that. The function is service_role only.
alter table sales_archive enable row level security;
revoke all on sales_archive from anon, authenticated;
revoke execute on function set_condition_tiers(jsonb) from public, anon, authenticated;
grant execute on function set_condition_tiers(jsonb) to service_role;
