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
-> Fetch recent market data from OldCarsData in widening passes
-> Persist raw records
-> Classify records against the search
-> Persist classifications
-> Analyze current market behavior
-> Analyze observed seller activity
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
- Excluded records: records fetched by a broad search but not suitable for the decision, such as different make/model, turbo/race/replica/salvage examples when the seller did not describe that market.
- Attribute signals: color, mileage, condition, transmission and options adjust confidence but should not usually define the whole evidence set.

## Fetch Strategy

Supabase is not treated as a full copy of OldCarsData. A search triggers recent-data ingestion:

- exact pass for year/make/model where possible.
- same make/model pass when exact evidence is thin.
- nearby-year passes when the market needs more signal.

Fetched records are merged and deduped by source and source record id before raw persistence and classification. The recommendation can use broader evidence only when it labels that evidence clearly.

## Seller Activity

Seller activity is computed from the fetched market records and is not a permanent V1 table.

- Group recent sales by platform and seller username.
- Measure activity over 90, 180 and 270 days.
- Label observed sellers as `high_activity_seller`, `active_specialist` or `limited_signal`.
- Keep `consignmentStatus` as `unknown` and `recommendableToUser` as `false` unless a separate verified partner layer confirms that the seller accepts consignments.

For V1, seller activity supports platform confidence. It should not route a user to an individual seller.

## Power-Seller Referral Policy

The engine should separately evaluate a power-seller or specialist-consignor route when:

- the seller says they want six figures, or
- current market evidence indicates a six-figure context.

This is a structured decision signal, not fixed copy. Sam should use the signal to generate varied language. Until a verified partner layer exists, the referral object must keep `recommendableNow` as `false` and include constraints such as region, consignment status, minimum value and availability.

## Product Rule

No fake data. No fabricated percentages. If evidence is thin, the decision should say so clearly and explain what it used.
