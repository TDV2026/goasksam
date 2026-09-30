-- Backfill functions for sale_price_usd / high_bid_usd (currency fix part 2a, THIRD attempt).
--
-- Earlier attempts timed out (57014) because they SCANNED for work: a whole-row UPSERT (recomputes the
-- natkey expression index per row), then a LIMIT + "is null" scan + an fx_rates exists() check per row.
-- Even the first call died. Sam confirmed a plain UPDATE of ~4k rows succeeds but ~20k times out, so the
-- fix is: the caller (scripts/backfillUsd.js) hands each function an explicit INDEX RANGE, and the WHERE
-- is nothing but that bounded range plus the "*_usd is null" resumability guard. No ORDER BY, no LIMIT,
-- no subquery in the WHERE, no raw_record read in the WHERE. The fx conversion (scalar subquery on
-- fx_rates + raw_record read) runs only in the SET, over the ~2,000 rows the range covers.
--   - sales_archive: range on the PRIMARY KEY id (uuid). The script slices the uuid space into ~2k-row
--     batches and halves on timeout.
--   - auction_attempts: no single id; range on the indexed (source_slug, attempt_date) key.
-- USD or missing/empty currency -> the native price unchanged; a currency in fx_rates for the sale month
-- -> price * usd_per_unit; anything else -> left null (the scalar subquery yields null). Resumable: a
-- rerun re-touches only rows still null in the given range.
--
-- Run once in the Supabase SQL editor, after supabase-fx-rates.sql (+ the pre-2019 extension). Replaces
-- the earlier backfill_sales_price_usd(integer) / backfill_attempts_high_bid_usd(integer).

drop function if exists backfill_sales_price_usd(integer);
drop function if exists backfill_attempts_high_bid_usd(integer);

create or replace function backfill_sales_usd_range(lo uuid, hi uuid)
returns integer language sql as $$
  with upd as (
    update sales_archive s
    set sale_price_usd = case
        when upper(coalesce(nullif(s.raw_record->>'currency', ''), 'USD')) = 'USD' then round(s.sale_price)
        else round(s.sale_price * (
          select f.usd_per_unit from fx_rates f
          where f.currency = upper(s.raw_record->>'currency')
            and f.month = date_trunc('month', s.sale_date)::date))
      end
    where s.id >= lo and s.id < hi
      and s.sale_price_usd is null and s.sale_price is not null
    returning 1
  )
  select count(*)::int from upd;
$$;

create or replace function backfill_attempts_usd_range(src text, d_lo date, d_hi date)
returns integer language sql as $$
  with upd as (
    update auction_attempts a
    set high_bid_usd = case
        when upper(coalesce(nullif(a.currency, ''), 'USD')) = 'USD' then round(a.high_bid)
        else round(a.high_bid * (
          select f.usd_per_unit from fx_rates f
          where f.currency = upper(a.currency)
            and f.month = date_trunc('month', a.attempt_date)::date))
      end
    where a.source_slug = src
      and a.attempt_date >= d_lo and a.attempt_date < d_hi
      and a.high_bid_usd is null and a.high_bid is not null
    returning 1
  )
  select count(*)::int from upd;
$$;

-- Attempts with a null attempt_date fall outside every date range; sweep them once per source (small).
create or replace function backfill_attempts_usd_nulldate(src text)
returns integer language sql as $$
  with upd as (
    update auction_attempts a
    set high_bid_usd = case
        when upper(coalesce(nullif(a.currency, ''), 'USD')) = 'USD' then round(a.high_bid)
        else null   -- no attempt_date -> no month -> cannot convert; leave null
      end
    where a.source_slug = src
      and a.attempt_date is null
      and a.high_bid_usd is null and a.high_bid is not null
    returning 1
  )
  select count(*)::int from upd;
$$;

-- Locked down (DB security standing rule): service role only; browser never gets execute.
revoke all on function backfill_sales_usd_range(uuid, uuid) from public, anon, authenticated;
grant execute on function backfill_sales_usd_range(uuid, uuid) to service_role;
revoke all on function backfill_attempts_usd_range(text, date, date) from public, anon, authenticated;
grant execute on function backfill_attempts_usd_range(text, date, date) to service_role;
revoke all on function backfill_attempts_usd_nulldate(text) from public, anon, authenticated;
grant execute on function backfill_attempts_usd_nulldate(text) to service_role;
