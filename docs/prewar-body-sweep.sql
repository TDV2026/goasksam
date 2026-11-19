-- Pre-war body-style sweep (Lane B, Nov 4 2026, job lane-b-rick point 3). READ ONLY. There is NO UPDATE to run.
-- THE INVALIDATION IS A RULE TAG, not market.staleSince: only the core-row reader honours staleSince; the two readers of a Market Check row (MCWARM:*) in lib/live/search.js
-- (readWarmAnswerDetailed, readWarmAnswer) do not. They read a pre-war row with two or more bodies, not apart, and without raw.prewarBodyTag = PREWAR_BODY_TAG (lib/onebox.js) as no row,
-- so each such car is computed again on its next read, under the new rule, and stored with the tag. The engine stamp does not move. Deploying the tag is the whole invalidation.
-- The guards below are the ones that work on live rows (bodyOptions is not an array on some rows, and Postgres does not test conditions in order, so the length sits inside a CASE).

-- 1. How many Market Check answers the readers now treat as no row (live count on Nov 4 2026 before the tag: 84). After the deploy, the same query with the last line added counts only rows not yet recomputed.
select count(*) as stale_prewar_multi_body
from spec_market_cache
where spec_key like 'MCWARM:%'
  and (market->'raw'->'resolvedCar'->>'year') ~ '^[0-9]{4}$'
  and (market->'raw'->'resolvedCar'->>'year')::int < 1949
  and (case when jsonb_typeof(market->'raw'->'bodyOptions') = 'array'
            then jsonb_array_length(market->'raw'->'bodyOptions')
            else 0 end) >= 2
  and coalesce(market->'raw'->>'optionsState', '') <> 'apart'
  and coalesce(market->'raw'->>'prewarBodyTag', '') <> 'pwb2-20261105';

-- 2. The same rows by make, model and year, so the list can be read.
select market->'raw'->'resolvedCar'->>'make' as make, market->'raw'->'resolvedCar'->>'model' as model, market->'raw'->'resolvedCar'->>'year' as year, spec_key
from spec_market_cache
where spec_key like 'MCWARM:%'
  and (market->'raw'->'resolvedCar'->>'year') ~ '^[0-9]{4}$'
  and (market->'raw'->'resolvedCar'->>'year')::int < 1949
  and (case when jsonb_typeof(market->'raw'->'bodyOptions') = 'array'
            then jsonb_array_length(market->'raw'->'bodyOptions')
            else 0 end) >= 2
  and coalesce(market->'raw'->>'optionsState', '') <> 'apart'
  and coalesce(market->'raw'->>'prewarBodyTag', '') <> 'pwb2-20261105'
order by 1, 2, 3;
