# Source Certification

One row per OCD source. A source is **APPROVED FOR MATH** only when its price basis is verified, its records are ingested with correct fields, and (for houses) its premium schedule is verified against published terms. A source marked **NO** may still be shown as supporting evidence, but never affects the Live Take, span, cluster, or premiums.

Status as of 2026-09-14. "Latest" = most recent record OCD carries. Archive counts are `sales_archive`; a `—` means not yet backfilled (the DISPLAY map now lists all 19; the 12 new ones await a backfill run).

## Online marketplaces (price = hammer, no premium)

| Source (slug) | Latest | Cadence | Archive rows | VIN capture | Currency | APPROVED FOR MATH |
|---|---|---|---|---|---|---|
| Bring a Trailer (bringatrailer) | 09-14 | daily | dominant | high | USD | **YES** |
| Cars & Bids (carsandbids) | 09-14 | daily | 32,219 | high | USD | **YES** |
| Hagerty Marketplace (hagerty) | 09-14 | daily | 4,054 | high | USD | **YES** |
| PCARMarket (pcarmarket) | 09-10 | daily | 4,736 | high | USD | **YES** (screen "MarketPlace:" asking-price rows at ingest) |
| Hemmings (hemmings) | 09-12 | daily | — | present | USD | **NO** — not backfilled |
| Sotheby's Motorsport (sothebysmotorsport) | 09-10 | daily | — | present | USD | **NO** — not backfilled |
| MB Market (mbmarket) | 09-11 | daily | — | present | USD | **NO** — not backfilled; Mercedes-marque-gated |
| All Collector Cars (acc) | 09-07 | daily | 568 | sparse | USD | **NO** — dropped from launch evidence pool |
| AutoHunter (autohunter) | 07-31 | **defunct** | — | present | USD | **NO** — out of business; historical only |
| Car & Classic (carandclassic) | 09-14 | daily | — | sparse | EUR | **NO** — not backfilled; UK/EU only |
| Collecting Cars (collectingcars) | 08-28 | daily | — | present | AUD | **NO** — not backfilled; UK/EU/AU only |
| The Market (themarket) | 09-14 | daily | — | present | GBP | **NO** — not backfilled; UK only |
| PistonHeads (pistonheads) | 09-13 | daily | — | sparse | GBP | **NO** — not backfilled; UK only; screen asking-price rows |

## Live-auction houses (price = premium-inclusive; math runs on backed-out hammer)

Premium back-out verified live 2026-09-14 (RM/Gooding rows: `isHouseSource: true`, `backedOut: true`). Schedules in `lib/_houseComps.js` verified against published 2026 motor-car terms below.

| Source (slug) | Latest | Archive rows | VIN capture (20-sample) | Currency | Schedule used | Published (2026) | APPROVED FOR MATH |
|---|---|---|---|---|---|---|---|
| RM Sotheby's US (rmsothebys, USD) | 08-15 | 8,560 | high | USD | 12%/10%@$250k | Scottsdale/Miami/Monterey motor cars 12%/10%@$250k | **YES** ✅ exact |
| RM Sotheby's EU (rmsothebys, EUR) | 08-15 | (in 12,280) | high | EUR | 15%/12.5%@€200k (NO VAT) | Paris 15%/12.5%@€200k | **YES** ✅ — round-hammer test on 1,000 EUR lots: no-VAT 887 round vs +VAT 93. OCD's stored price does NOT include VAT; the EU_200 schedule is correct. |
| Gooding Christie's (gooding) | 08-15 | 2,645 | high | USD | 12%/10%@$250k | 12%/10%@$250k (US) | **YES** ✅ exact |
| Bonhams US (bonhams, USD) | 08-13 | — | 18/20 | USD | 12%/10%@$250k | US 12%/10%@$250k | **YES** ✅ (backfill pending) |
| Bonhams UK/FR (bonhams, GBP/EUR) | 08-13 | 19,561 | 18/20 | GBP/EUR | UK 15%/12%@£500k; FR flat 15% | UK 15%/12%@£500k; France flat 15% | **NO** — round-hammer inconclusive: GBP 1,013/3,000 (34%), EUR 1,552/2,605 (60%). Bonhams runs heavy automobilia (6,357 placeholder VINs, odd small prices) that pollutes the test; needs a car-only (validVin) re-verify before flipping. Schedule is built and correct-on-paper. |
| Broad Arrow US (broadarrow, USD) | 05-18 | — | 19/20 | USD | 12%/10%@$250k | US 12%/10%@$250k | **YES** ✅ exact (backfill pending) |
| Broad Arrow EU (broadarrow, EUR) | 05-18 | — | 19/20 | EUR | 15%/12.5%@€200k | EU terms unconfirmed | **NO** — EU terms TBD |
| Barrett-Jackson (barrettjackson) | 09-12 | — | 20/20 | USD | flat 10% | **10% confirmed: 100/100 lots back out to round $500 hammers at 10%** (12%→9/100, 13.5%→8/100) | **YES** ✅ flat 10% (backfill pending) |
| Mecum (mecum) | 07-25 | — | 17/20 | USD | flat 10% | **10% confirmed: 19/20 lots round at 10%** | **YES** ✅ flat 10% (backfill pending) |

## Schedule verification — agreement / disagreement (task #2)

- **Gooding, RM US, Bonhams US, Broad Arrow US** — our schedule EXACTLY matches published US motor-car terms (12%/10% at $250k). ✅
- **RM Paris (EU)** — our 15%/12.5% @ €200k matches, **but the published premium adds +20% VAT** on the premium. If OCD's stored house price is hammer+premium+VAT, our back-out (no VAT) overstates the implied hammer. **Must confirm whether OCD house prices include VAT before EU house comps are trusted.**
- **Bonhams non-USD** — DISAGREES. We apply NA_250 (12%/10%) to all Bonhams currencies, but published UK is **15%/12% @ £500k** and France is **flat 15%**. GBP/EUR Bonhams sales are under-backed-out. Needs a per-region Bonhams schedule.
- **Barrett-Jackson** — our flat 10% is the onsite baseline, but the published premium rises to 12–13.5% depending on bid channel (online/phone) and payment method. OCD does not tell us the channel, so a single rate cannot be exact. Flag as a known approximation; decide whether to widen to a blended rate.
- **Mecum** — one 2026 lot backs out to exactly 10% (matches); another implied ~5% (likely an approximate press figure). Re-verify against Mecum's published conditions before flipping to YES.

**Why the disagreements exist:** the schedules were calibrated empirically on *sampled lots* — which were predominantly USD/US sales, where they match published terms exactly. The non-US (Bonhams UK/FR) and channel-dependent (Barrett-Jackson) cases were outside that sample. The empirical basis and the published basis agree on US motor cars and diverge exactly where the sample didn't reach.

## Not yet populated (require the canonical transaction layer + backfill)

Per row, still to fill once the backfill and canonical layer land: expected-cadence SLA, three hand-verified transactions, dedupe/alias rate, sale-location coverage. These flip the remaining sources' APPROVED-FOR-MATH once verified.

**Sources:** [RM Sotheby's Paris bidder info](https://rmsothebys.com/auctions/pa26/bidder-info/), [Gooding Christie's terms](https://www.goodingco.com/terms/), [Bonhams US premium](https://www.bonhams.com/how-to-buy/buyers-premium-united-states/), [Bonhams UK premium](https://www.bonhams.com/how-to-buy/buyers-premium-united-kingdom/), [Bonhams France premium](https://www.bonhams.com/how-to-buy/buyers-premium-france-monaco/), [Broad Arrow conditions of sale](https://bid.broadarrowauctions.com/conditions-of-sale), [Barrett-Jackson bidding](https://www.barrett-jackson.com/media/articles/pro-tips-how-to-bid-at-a-barrett-jackson-auction).
