-- Backfill functions for sale_price_usd / high_bid_usd (currency fix part 2a). The whole-row UPSERT
-- approach timed out (57014): ON CONFLICT recomputes the natural-key expression index for every row.
-- These do a PLAIN UPDATE of ONLY the *_usd column (which is not in any index), one small LIMIT batch
-- at a time, so each statement is bounded and fast. The script (scripts/backfillUsd.js) calls each
-- repeatedly until it returns 0 (resumable: it only ever touches still-null rows).
--
-- Conversion rule: USD or a missing/empty currency -> the native price unchanged; a currency present in
-- fx_rates for the sale month -> price * usd_per_unit; anything else (AED, or a month not covered) is
-- NOT selected, so it stays null and the script reports it. NEVER guesses a rate.
--
-- Run once in the Supabase SQL editor, after supabase-fx-rates.sql (+ the pre-2019 extension).

create or replace function backfill_sales_price_usd(batch_limit integer)
returns integer
language sql
as $$
  with pick as (
    select s.id
    from sales_archive s
    where s.sale_price_usd is null and s.sale_price is not null
      and (
        upper(coalesce(nullif(s.raw_record->>'currency', ''), 'USD')) = 'USD'
        or exists (
          select 1 from fx_rates f
          where f.currency = upper(s.raw_record->>'currency')
            and f.month = date_trunc('month', s.sale_date)::date
        )
      )
    limit batch_limit
  ),
  upd as (
    update sales_archive s
    set sale_price_usd = case
        when upper(coalesce(nullif(s.raw_record->>'currency', ''), 'USD')) = 'USD'
          then round(s.sale_price)
        else round(s.sale_price * (
          select f.usd_per_unit from fx_rates f
          where f.currency = upper(s.raw_record->>'currency')
            and f.month = date_trunc('month', s.sale_date)::date
        ))
      end
    from pick
    where s.id = pick.id
    returning 1
  )
  select count(*)::int from upd;
$$;

create or replace function backfill_attempts_high_bid_usd(batch_limit integer)
returns integer
language sql
as $$
  with pick as (
    select a.source_slug, a.source_record_id
    from auction_attempts a
    where a.high_bid_usd is null and a.high_bid is not null
      and (
        upper(coalesce(nullif(a.currency, ''), 'USD')) = 'USD'
        or exists (
          select 1 from fx_rates f
          where f.currency = upper(a.currency)
            and f.month = date_trunc('month', a.attempt_date)::date
        )
      )
    limit batch_limit
  ),
  upd as (
    update auction_attempts a
    set high_bid_usd = case
        when upper(coalesce(nullif(a.currency, ''), 'USD')) = 'USD'
          then round(a.high_bid)
        else round(a.high_bid * (
          select f.usd_per_unit from fx_rates f
          where f.currency = upper(a.currency)
            and f.month = date_trunc('month', a.attempt_date)::date
        ))
      end
    from pick
    where a.source_slug = pick.source_slug and a.source_record_id = pick.source_record_id
    returning 1
  )
  select count(*)::int from upd;
$$;

-- Locked down (DB security standing rule): server code uses the service role key; the browser never
-- gets execute. These are specific backfill functions (not arbitrary SQL / EXPLAIN passthroughs).
revoke all on function backfill_sales_price_usd(integer) from public, anon, authenticated;
grant execute on function backfill_sales_price_usd(integer) to service_role;
revoke all on function backfill_attempts_high_bid_usd(integer) from public, anon, authenticated;
grant execute on function backfill_attempts_high_bid_usd(integer) to service_role;
