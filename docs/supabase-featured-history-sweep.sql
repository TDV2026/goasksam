-- FEATURED HISTORY SWEEP (Lane B, Nov 2026). READ ONLY. Run in the Supabase SQL editor. Nothing is written.
-- Answers: how many live cars could the crew-only Homepage feature (lib/live/featuredHistory.js) feature, where do the others fall out, three examples and three near misses.
-- It mirrors the code's rules on vin_index (the history match's first source). Two rules cannot be tested in SQL: the HEAD check that an evidence link and a photo are not dead (404/410), and the archive fallback
-- (a VIN with no vin_index row is read from sales_archive/auction_attempts by vinAppearances). So the counts here are the upper bound of the vin_index path; the code's own sweep is the final word.

-- 1. THE FUNNEL: how many live cars survive each rule, in order
with live as (
  select id, source, url, listing_title, year, make, model, vin_norm, mileage, end_time, photo_url
  from live_listings where status = 'live' and end_time > now()
), a as (select * from live),
b as (select * from a where length(coalesce(vin_norm,'')) >= 6 and photo_url ~* '^https?://' and photo_url !~* '(placeholder|no-?image|noimage|default|logo|blank|spacer|sprite|icon|avatar)|\.(svg|gif)(\?|$)'),
c as (select b.*, e.appearance_date, e.source as e_source, e.url as e_url, e.photo_url as e_photo, e.mileage as e_miles, e.result as e_result, e.price_usd as e_price, e.year as e_year, e.make as e_make
      from b join vin_index e on e.vin_norm = b.vin_norm and e.appearance_date < current_date and coalesce(e.url,'') <> coalesce(b.url,'')),
d as (select * from c where (e_year is null or e_year = year) and (e_make is null or lower(regexp_replace(e_make,'[^a-z0-9]','','gi')) = lower(regexp_replace(make,'[^a-z0-9]','','gi')))),
e as (select * from d where e_photo ~* '^https?://' and e_photo !~* '(placeholder|no-?image|noimage|default|logo|blank|spacer|sprite|icon|avatar)|\.(svg|gif)(\?|$)'),
f as (select * from e where e_url ~* '^https?://'),
g as (select * from f where coalesce(e_miles,0) > 0 and e_source is not null and (e_result !~* '^(sold|ended_sold|sale)' or coalesce(e_price,0) > 0))
select '1 live now (future end time)' as step, count(*) as cars from a
union all select '2 + VIN and a real current photo', count(*) from b
union all select '3 + an earlier vin_index record, not this listing', count(distinct id) from c
union all select '4 + the earlier record agrees on year and make', count(distinct id) from d
union all select '5 + the earlier record has a real photo', count(distinct id) from e
union all select '6 + the earlier record has an evidence link', count(distinct id) from f
union all select '7 + mileage, platform, and a price when sold (ELIGIBLE, before the dead-link check)', count(distinct id) from g
union all select '7a   of those, with a completed sale', count(distinct id) from g where e_result ~* '^(sold|ended_sold|sale)' and e_price > 0
union all select '7b   of those, listed only', count(distinct id) from g where id not in (select id from g where e_result ~* '^(sold|ended_sold|sale)' and e_price > 0);

-- 2. THREE EXAMPLES (eligible, sold, fewest earlier records first): the live listing, the earlier record and its links
with live as (select id, source, url, listing_title, vin_norm, mileage, end_time, photo_url, year, make from live_listings where status = 'live' and end_time > now() and length(coalesce(vin_norm,'')) >= 6 and photo_url ~* '^https?://')
select l.listing_title, l.source as live_on, l.url as live_url, l.photo_url as live_photo, l.mileage as live_miles, l.end_time,
       e.appearance_date as earlier_date, e.source as earlier_on, e.result as earlier_result, e.price_usd as earlier_price, e.mileage as earlier_miles, e.url as evidence_url, e.photo_url as earlier_photo,
       (select count(*) from vin_index x where x.vin_norm = l.vin_norm and x.appearance_date < current_date) as earlier_records
from live l join vin_index e on e.vin_norm = l.vin_norm and e.appearance_date < current_date and coalesce(e.url,'') <> coalesce(l.url,'')
where e.result ~* '^(sold|ended_sold|sale)' and e.price_usd > 0 and e.mileage > 0 and e.photo_url ~* '^https?://' and e.url ~* '^https?://'
  and (e.year is null or e.year = l.year)
order by earlier_records asc, l.end_time desc limit 3;

-- 3. NEAR MISSES: live cars that DO have an earlier record but fail one rule, with the rule they fail
with live as (select id, listing_title, url, vin_norm, year, make from live_listings where status = 'live' and end_time > now() and length(coalesce(vin_norm,'')) >= 6 and photo_url ~* '^https?://')
select l.listing_title, l.url as live_url, e.appearance_date, e.source, e.result, e.url as earlier_url,
       case when e.photo_url is null or e.photo_url !~* '^https?://' then 'earlier record has no photo'
            when e.url is null or e.url !~* '^https?://' then 'earlier record has no evidence link'
            when coalesce(e.mileage,0) <= 0 then 'earlier record has no mileage'
            when e.result ~* '^(sold|ended_sold|sale)' and coalesce(e.price_usd,0) <= 0 then 'a sale with no price'
            when e.year is not null and e.year <> l.year then 'earlier record is another year'
            else 'other' end as fails
from live l join vin_index e on e.vin_norm = l.vin_norm and e.appearance_date < current_date and coalesce(e.url,'') <> coalesce(l.url,'')
where e.photo_url is null or e.photo_url !~* '^https?://' or e.url is null or e.url !~* '^https?://' or coalesce(e.mileage,0) <= 0
   or (e.result ~* '^(sold|ended_sold|sale)' and coalesce(e.price_usd,0) <= 0) or (e.year is not null and e.year <> l.year)
order by e.appearance_date desc limit 30;   -- take any three
