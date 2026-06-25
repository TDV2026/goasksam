# Deploy V1 Seller Decision Path

This app now has a real seller decision path:

- `POST /api/sellerDecision`
- `POST /api/submitSellerLead`
- `POST /api/chat`

## 1. Apply Supabase Schema

Open Supabase SQL Editor and run:

```sql
-- contents of docs/supabase-v1-schema.sql
```

The V1 permanent tables are:

- `vehicle_market_records`
- `vehicle_classifications`
- `seller_leads`

## 2. Set Vercel Environment Variables

In Vercel, set these for Production:

```text
OLDCARSDATA_API_KEY
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
```

Use `SUPABASE_SERVICE_ROLE_KEY` for server-side writes. Do not expose it in browser code.

## 3. Deploy

Push to `main`. Vercel should deploy automatically.

## 4. Smoke Test

Open the deployed app and run one seller flow:

```text
Sell my car
black 1985 Porsche 911
Skip VIN
60k miles
Completely stock
Full history
Clean title
Not sure on price
Within a month
Either works
Skip notes/photo
Looks good
```

Expected result:

- Sam checks recent market evidence.
- Sam shows evidence counts, close matches, confidence and platform options.
- Sam does not show invented performance percentages.
- Contact submission writes a row to `seller_leads`.

## 5. Verify Database Writes

Check Supabase tables:

```sql
select count(*) from vehicle_market_records;
select count(*) from vehicle_classifications;
select * from seller_leads order by submitted_at desc limit 5;
```

## Known V1 Limits

- Platform ranking is based on recent fetched sold records only.
- Individual power seller ranking is not implemented yet.
- Buyer listing intelligence remains demo-only and should be built after seller V1 works end to end.
