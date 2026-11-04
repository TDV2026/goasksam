-- Pre-war body-style sweep (Lane B, Nov 4 2026, job lane-b-rick point 3). READ ONLY until step 3. Unverified against the live table: written from lib/_staleMark.js and lib/live/search.js
-- (spec_market_cache.spec_key is a JSON array [make, model, trim, year, genCode, ...] for the Find/Buy/Tasks core rows; MCWARM:* rows hold the whole engine answer under market->'raw').
-- A stored answer is stale for this change when its car is before 1949, its answer carries two or more body options, and it is not already an apart answer.

-- 1. How many Market Check answers (MCWARM rows) are pre-war, hold two or more bodies, and are not apart. This is the count to report.
select count(*) as stale_prewar_multi_body
from spec_market_cache
where spec_key like 'MCWARM:%'
  and (market->'raw'->'resolvedCar'->>'year')::int < 1949
  and jsonb_array_length(coalesce(market->'raw'->'bodyOptions', '[]'::jsonb)) >= 2
  and coalesce(market->'raw'->>'optionsState', '') <> 'apart';

-- 2. The same, by make and model, so the list can be read before anything is touched.
select market->'raw'->'resolvedCar'->>'make' as make, market->'raw'->'resolvedCar'->>'model' as model, market->'raw'->'resolvedCar'->>'year' as year, spec_key
from spec_market_cache
where spec_key like 'MCWARM:%'
  and (market->'raw'->'resolvedCar'->>'year')::int < 1949
  and jsonb_array_length(coalesce(market->'raw'->'bodyOptions', '[]'::jsonb)) >= 2
  and coalesce(market->'raw'->>'optionsState', '') <> 'apart'
order by 1, 2, 3;

-- 3. TARGETED INVALIDATION (run only after step 1 is read; no stamp bump). Marks exactly those rows stale the way lib/_staleMark.js does (market.staleSince): they are served at once and refreshed behind the response.
update spec_market_cache
set market = jsonb_set(market, '{staleSince}', to_jsonb(to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')))
where spec_key like 'MCWARM:%'
  and (market->'raw'->'resolvedCar'->>'year')::int < 1949
  and jsonb_array_length(coalesce(market->'raw'->'bodyOptions', '[]'::jsonb)) >= 2
  and coalesce(market->'raw'->>'optionsState', '') <> 'apart'
  and market->>'staleSince' is null;
