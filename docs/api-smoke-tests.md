# API Smoke Tests

Run these against the Vercel deployment after applying the Supabase schema and setting env vars.

Set:

```sh
BASE_URL="https://goasksam.vercel.app"
```

## Seller Decision

```sh
curl -s "$BASE_URL/api/sellerDecision" \
  -H "Content-Type: application/json" \
  -d '{
    "car": {
      "raw": "black 1985 Porsche 911",
      "region": "US",
      "mileage": "60k miles",
      "condition": "Completely stock",
      "serviceRecords": "Full history",
      "title": "Clean title",
      "targetPrice": "not sure",
      "timeline": "Within a month",
      "involvement": "Either works"
    }
  }'
```

Expected:

- `status` is `decision_ready` or `needs_clarification`.
- No invented market claims.
- If `decision_ready`, response includes `evidence`, `analysis.platformPerformance`, and `decision`.
- `evidence.fetchPasses` shows which OldCarsData passes ran.
- `evidence.closeMatches`, `evidence.relevantMatches`, `evidence.broadMatches`, and `evidence.excludedRecords` are separate so broad comps are not presented as exact comps.

## Seller Lead

Use a destination returned by `/api/sellerDecision`.

```sh
curl -s "$BASE_URL/api/submitSellerLead" \
  -H "Content-Type: application/json" \
  -d '{
    "seller": {
      "email": "test@example.com",
      "phone": "555-000-0000"
    },
    "car": {
      "raw": "black 1985 Porsche 911",
      "region": "US",
      "mileage": "60k miles",
      "condition": "Completely stock",
      "serviceRecords": "Full history",
      "title": "Clean title",
      "targetPrice": "not sure",
      "timeline": "Within a month",
      "involvement": "Either works"
    },
    "choice": {
      "destination": "Cars & Bids",
      "destinationType": "Selling destination",
      "optionKey": "primary"
    },
    "decision": {
      "source": "smoke-test"
    }
  }'
```

Expected:

- `status` is `submitted`.
- Response includes a `reference`.
- Supabase has a new `seller_leads` row.

## Usage Dashboard

After running the latest Supabase schema, set `USAGE_DASHBOARD_KEY` in Vercel.

```sh
curl -s "$BASE_URL/api/usageDashboard?key=$USAGE_DASHBOARD_KEY&format=json"
```

Expected:

- Response includes `summary.totals.sellerSearches`.
- After one seller decision search, `oldCarsDataRequests` increases by the metered `/auctions` request count.
- After one `/api/chat` call, `anthropicInputTokens`, `anthropicOutputTokens`, and `anthropicCostUsd` increase.
