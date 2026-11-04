-- Non-car names sweep (Lane B, Nov 4 2026, job lane-b-names). READ ONLY. No UPDATE to run: the invalidation is a rule tag (NAME_RULES_TAG = 'nm1-20261104', lib/onebox.js), read by both Market Check readers (storedNameOvertaken).
-- HEAVY: each query scans sales_archive or spec_market_cache once. Run them ONE AT A TIME, never two together (the 3-heavy-reads rule), and read the counts before the next.
-- Written from lib/nameGuard.js, not run against the live tables. Column names (make, model, year, listing_title) are the sales_archive ones the other docs/*.sql use.

-- 1. COUNT PER PATTERN (sales_archive). One row per pattern; "rows" is how many sales a reader would see under a wrong name.
select 'coachbuilder phrase "by <Name>" in the title' as pattern, count(*) as rows
  from sales_archive where listing_title ~* '\s(coachwork |built |bodied )?by\s+[a-z]' and listing_title !~* '\sby\s+(auction|owner|bid|dealer|bat|the)\M'
union all select 'lot or reference number in the title', count(*) from sales_archive where listing_title ~* '(\mlot\s*#?\s*[0-9]+|\mRN[0-9]+|\mref(erence)?\M\.?\s*(no\.?|#)?\s*[a-z0-9-]*[0-9]|#\s?[a-z0-9-]*[0-9])'
union all select 'model column is a connective (By, The, And, Of, With, For)', count(*) from sales_archive where lower(model) in ('by','the','and','of','with','for')
union all select 'model column is an engine or gearbox word (Hemi, LT1, F1, V8 ...)', count(*) from sales_archive where lower(model) in ('hemi','v8','v6','v10','v12','diesel','tdi','turbo','supercharged','lt1','lt4','lt5','ls1','ls2','ls3','ls6','ls7','l88','l89','l98','l72','l79','f1','dct','pdk','manual','automatic','tiptronic','smg','cvt')
union all select 'Jaguar model is the front half of Mark VII, Mark X, Mk 2', count(*) from sales_archive where make = 'Jaguar' and lower(model) in ('mark','mk','mk.')
union all select 'Packard model is the front half of Super Eight (Eight, Super, Light, Standard, Custom, Deluxe, Twin)', count(*) from sales_archive where make = 'Packard' and lower(model) in ('eight','super','light','standard','custom','deluxe','twin')
union all select 'Alfa Romeo model is the badge GTA or GTAm', count(*) from sales_archive where make = 'Alfa Romeo' and lower(model) in ('gta','gtam')
union all select 'Hemi in the title with no model after it (Dodge Hemi R/T)', count(*) from sales_archive where listing_title ~* '\mdodge\s+hemi\s+r/?t\M';

-- 2. THE TOP 30 BAD NAMES WITH THE CORRECTED FORM (a model column that is not a model). corrected = what lib/nameGuard.js reads from the same text; "(keep title)" = no model is named and no answer is stored under the name.
select make, model as bad_model, count(*) as sales,
       case when lower(model) in ('by','the','and','of','with','for') then '(drop; the real model is the word before it in the title)'
            when make = 'Jaguar' and lower(model) in ('mark','mk','mk.') then 'Mark <numeral read from the title>'
            when make = 'Packard' then 'Super Eight / Light Eight / Standard Eight (read from the title)'
            when make = 'Alfa Romeo' and lower(model) in ('gta','gtam') then 'Giulia GTA / GTAm for 1965 to 1972 cars, (keep title) for any other year'
            else '(keep title)' end as corrected
from sales_archive
where lower(model) in ('by','the','and','of','with','for','hemi','v8','v6','v10','v12','diesel','tdi','turbo','supercharged','lt1','lt4','lt5','ls1','ls2','ls3','ls6','ls7','l88','l89','l98','l72','l79','f1','dct','pdk','manual','automatic','tiptronic','smg','cvt')
   or (make = 'Jaguar' and lower(model) in ('mark','mk','mk.'))
   or (make = 'Packard' and lower(model) in ('eight','super','light','standard','custom','deluxe','twin'))
   or (make = 'Alfa Romeo' and lower(model) in ('gta','gtam'))
group by make, model, 4
order by sales desc limit 30;

-- 3. STORED MARKET CHECK ANSWERS THE READERS NOW TREAT AS NO ROW (spec_market_cache): a car name of one of those patterns, without the current tag. Read only; deploying the tag is the invalidation.
select count(*) as stored_rows_under_a_non_car_name
from spec_market_cache
where spec_key like 'MCWARM:%'
  and coalesce(market->'raw'->>'nameRulesTag', '') <> 'nm1-20261104'
  and (lower(coalesce(market->'raw'->'resolvedCar'->>'model', '')) in ('by','the','and','of','with','for','hemi','v8','v6','v10','v12','diesel','tdi','turbo','supercharged','lt1','lt4','lt5','ls1','ls2','ls3','ls6','ls7','l88','l89','l98','l72','l79','f1','dct','pdk','manual','automatic','tiptronic','smg','cvt')
       or (market->'raw'->'resolvedCar'->>'make' = 'Jaguar' and lower(market->'raw'->'resolvedCar'->>'model') in ('mark','mk','mk.'))
       or (market->'raw'->'resolvedCar'->>'make' = 'Packard' and lower(market->'raw'->'resolvedCar'->>'model') in ('eight','super','light','standard','custom','deluxe','twin'))
       or (market->'raw'->'resolvedCar'->>'make' = 'Alfa Romeo' and lower(market->'raw'->'resolvedCar'->>'model') in ('gta','gtam'))
       or market->'raw'->'resolvedCar'->>'trim' ~* '(^|\s)(v[ -]?(6|8|10|12)|diesel|tdi|manual|automatic|stick|dct|pdk|smg|cvt|[0-9][ -]?speed)(\s|$)');
