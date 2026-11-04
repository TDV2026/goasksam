-- Pool source sweep (Lane B, Nov 5 2026, job lane-b-rick2 point 3). READ ONLY. Written from lib/onebox.js (fetchPool / onlineOf), not run against the live table. HEAVY: one scan of sales_archive; run it alone.
-- THE RULE: Market Check cut a car's house sales out of the pool once it held three or more online sales. Now, when the houses are two-thirds or more of the car's record (five years, US and Canada), the pool is the whole record.
-- A car's pool CHANGES when it has at least 8 online sales (fewer is a thin record, which already kept its house sales) and a house share of 67% or more. This lists those cars, the count of them, and the pool before (online only) against after (whole record).
with rec as (
  select make, model,
         count(*) filter (where platform in ('RM Sotheby''s','Gooding & Co','Barrett-Jackson','Mecum','Broad Arrow','Bonhams')) as house,
         count(*) filter (where platform not in ('RM Sotheby''s','Gooding & Co','Barrett-Jackson','Mecum','Broad Arrow','Bonhams')) as online
  from sales_archive
  where sale_date >= current_date - interval '1825 days' and sale_price is not null and vehicle_type = 'car'
  group by make, model
)
select count(*) as cars_whose_pool_changes, sum(house) as house_sales_now_in_the_pool from rec where online >= 8 and house::numeric / nullif(house + online, 0) >= 2.0 / 3;
-- the first forty of them, biggest gain first
-- (run separately after reading the count)
-- select make, model, online as pool_before, house + online as pool_after, round(100.0 * house / (house + online)) as house_pct from rec where online >= 8 and house::numeric / nullif(house + online, 0) >= 2.0 / 3 order by house desc limit 40;
