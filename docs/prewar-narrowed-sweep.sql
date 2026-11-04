-- Pre-war cars the body question narrowed to one body (Lane B, Nov 5 2026, lane-b-prewar2). READ ONLY. Tag pwb3-20261105: every row counted here is read as no row on its next read and stored again with the tag.
-- 1. Market Check whole answers, year before 1949, narrowed by the body question ("Only the Sedan has three or more sales"), by car.
select market->'raw'->'resolvedCar'->>'year' as year, market->'raw'->'resolvedCar'->>'make' as make, market->'raw'->'resolvedCar'->>'model' as model,
       market->'raw'->'questionResolved'->>'kept' as kept_body, market->'raw'->'questionResolved'->'dropped' as dropped_bodies, spec_key
  from spec_market_cache
 where spec_key like 'MCWARM:%'
   and (market->'raw'->'resolvedCar'->>'year')::int < 1949
   and market->'raw'->'questionResolved'->>'dimension' = 'body'
 order by 1, 2, 3;
-- 2. The count, and the count of pre-war apart-by-body rows from the earlier tag (they listed only the bodies with three or more sales).
select count(*) filter (where market->'raw'->'questionResolved'->>'dimension' = 'body') as narrowed_rows,
       count(*) filter (where market->'raw'->>'optionsState' = 'apart' and market->'raw'->>'headlineDimension' = 'body') as apart_rows_to_read_again
  from spec_market_cache
 where spec_key like 'MCWARM:%' and (market->'raw'->'resolvedCar'->>'year')::int < 1949
   and coalesce(market->'raw'->>'prewarBodyTag', '') <> 'pwb3-20261105';
-- 3. Question-eligibility rows that decided "one" for a pre-war car (no longer consulted for them).
select count(*) as qelig_one_rows from spec_market_cache where spec_key like 'QELIG|%' and market->>'action' = 'one';
