-- BaT day counts, READ ONLY (Lane C, Nov 5 2026). For Sam, in the Supabase SQL Editor. Writes nothing.
-- Question: is any Bring a Trailer sale day between Oct 20 and Nov 4 short in sales_archive?
-- Lane F reads the later delta pulls as fetching 138 (Oct 27) and 143 (Oct 28) BaT records, so those days may already be whole.
-- Run each statement by itself. Both use the (platform, sale_date) index and a 16 day window, so they are light.

-- 1. The platform spellings in the window (so the next statement counts every one of them).
select platform, count(*) as sales
from sales_archive
where sale_date between date '2026-10-20' and date '2026-11-04'
  and platform ilike '%trailer%'
group by platform
order by sales desc;

-- 2. BaT sales per sale date, with sold-with-a-price separated from no-sale rows, and a flag for any day under half the window's median.
with d as (
  select sale_date,
         count(*)                                   as rows_in_archive,
         count(*) filter (where sale_price is not null) as sold_with_price
  from sales_archive
  where sale_date between date '2026-10-20' and date '2026-11-04'
    and platform in ('Bring a Trailer', 'bringatrailer')
  group by sale_date
), days as (
  select generate_series(date '2026-10-20', date '2026-11-04', interval '1 day')::date as sale_date
), med as (
  select percentile_cont(0.5) within group (order by sold_with_price) as m from d
)
select days.sale_date,
       to_char(days.sale_date, 'Dy')                as weekday,
       coalesce(d.rows_in_archive, 0)               as rows_in_archive,
       coalesce(d.sold_with_price, 0)               as sold_with_price,
       case when coalesce(d.sold_with_price, 0) < 0.5 * (select m from med) then 'SHORT' else '' end as flag
from days left join d using (sale_date)
order by days.sale_date;

-- Reading it: a day marked SHORT, or a day with 0, is a hole. Oct 27 and Oct 28 should each be near 138 and 143 rows.
-- If statement 1 shows a spelling other than the two in statement 2, add it to the IN list and re-run statement 2.
