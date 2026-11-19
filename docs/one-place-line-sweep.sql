-- The one-place line sweep (Lane B, Nov 4 2026, lane-b-onevenue2). READ ONLY. Counts the stored answers that still carry the venue fence's reason (house_share)
-- or either of its sentences. After the fence stack is pushed, every such row is read as no row (Market Check, Find cores) or restated at read time (saved payloads).
-- 1. Market Check whole answers (MCWARM rows): read again on their next read.
select count(*) as mcwarm_rows from spec_market_cache
 where spec_key like 'MCWARM:%'
   and (market->'raw'->>'thinReason' = 'house_share'
        or market->'raw'->>'thinLine' ilike '%mostly from one place%' or market->'raw'->>'thinLine' ilike '%too one-sided%');
-- 2. Find / Buy core rows (JSON-array keys): not served, computed on the cold path.
select count(*) as core_rows from spec_market_cache
 where spec_key not like 'MCWARM:%'
   and (market->>'thinReason' = 'house_share'
        or market->>'thinLine' ilike '%mostly from one place%' or market->>'thinLine' ilike '%too one-sided%');
-- 3. Saved results (reopen) that carry the line in their payload: restated at read time.
select count(*) as saved_results from saved_results
 where payload::text ilike '%mostly from one place%' or payload::text ilike '%too one-sided%' or payload::text like '%"thinReason":"house_share"%';
