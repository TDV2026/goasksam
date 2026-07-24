# Monthly refresh: lib/winConditions.js

The Phase 2 win-condition table (`lib/winConditions.js`) is a **180-day snapshot**
and should be regenerated monthly. It drives production routing (which niche
platform can be Card 1/2), so the table edit stays **human-reviewed** — the
refresh produces a draft, a person confirms it, then commits + deploys.

## Steps (~145 metered OldCarsData requests, ~15% of the monthly plan)

```bash
# 1. Refresh 180 days of the niche platforms into sales_archive (~22 requests)
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... OLDCARSDATA_API_KEY=... \
  node scripts/pullSources.js hagerty pcarmarket --days=180

# 2. Recompute cross-platform share + emit a review-ready draft (~121 requests)
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... OLDCARSDATA_API_KEY=... \
  node scripts/denominators.js
```

`denominators.js` prints a `SUGGESTED lib/winConditions.js rows` block at the end.
A model only appears when the niche platform is the **#2 platform (beats C&B)**
and its share is **>=10%**; confidence is set by sample size (n>=100 high,
50-100 moderate, <50 low).

## Review before committing (routing change)
- Fill each `segmentLabel: "REVIEW"` with the qualitative copy label
  (e.g. "classic American muscle", "air-cooled 911s"). This is user-facing.
- Add `yearMax` / `yearMin` where a model spans eras (e.g. `911` -> `yearMax: 1998`
  for air-cooled; water-cooled must NOT match).
- Keep `confidence: "low"` rows in the file but know they are never auto-routed.
- Update the "Last regenerated" date in the header.
- Then commit `lib/winConditions.js` and `vercel --prod`. The smoke suite's
  `[wc]` assertions guard the marquee cases.

## Why not fully automated
The pull/compute is safe to schedule, but auto-committing a routing table without
review risks shipping a mis-labeled segment or a wrong era boundary to production.
Keep a human in the loop for the table edit. A scheduled reminder that runs
steps 1-2 and surfaces the draft is fine; the commit is manual.
