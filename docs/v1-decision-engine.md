# GoAskSam V1 Decision Engine

GoAskSam is a decision engine built on live automotive market intelligence. V1 is seller-first, but the backend should not become seller-only.

## V1 Permanent State

Keep durable state minimal:

- `vehicle_market_records`: immutable raw upstream auction/listing records.
- `vehicle_classifications`: computed classification of raw records against the searched vehicle.
- `seller_leads`: commerce follow-through when a seller acts.

Everything else is computed on demand or cached for speed.

## V1 Flow

```text
Search
-> Fetch recent relevant market data
-> Persist raw records
-> Classify records against the search
-> Persist classifications
-> Analyze current market behavior
-> Produce decision-ready facts
-> Sam explains why
-> Optional lead submission
```

## V1 Endpoints

- `POST /api/sellerDecision`: turns a seller's car description and criteria into evidence-backed decision facts.
- `POST /api/submitSellerLead`: records the seller's chosen destination and contact details after the decision.
- `POST /api/chat`: wording layer only. It should not invent market performance.

## Comparability

The engine should find the closest useful evidence, not the theoretically perfect match.

- Close matches: same make/model, close year band, similar mileage band when available.
- Relevant matches: same make/model or strongly related vehicle, wider year/mileage range.
- Broad matches: useful platform/category behavior when close data is thin.
- Attribute signals: color, mileage, condition, transmission and options adjust confidence but should not usually define the whole evidence set.

## Product Rule

No fake data. No fabricated percentages. If evidence is thin, the decision should say so clearly and explain what it used.
