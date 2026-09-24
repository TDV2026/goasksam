# Generation-map gaps (uncurated models where year +/- 2 crosses a boundary)

Found Sep 2026 during the GTO leak fix (e1). Root cause: a model with no curated entry in
`lib/generations.js` falls back to calendar year +/- 2 in `buildSpec`, so a search near a
generation or body boundary pools two different markets. Confirmed deterministically with
`buildSpec` offline (uncurated -> `[none=calendar]`, e.g. `944 1986 -> 1984-1988`; curated ->
binds a generation, e.g. `GTO 1968 -> 1968-1972`).

Ranked by archive sale count (reader-frequency proxy; /sell + One Box search logs are thin).
Counts are archive title-token tallies (approximate). All entries below are uncurated AND cross
a generation/body change within year +/- 2.

## IMPORTANT: verify before fixing (may not be real leaks)

Some entries are NOT necessarily leaks and must be checked against how OldCarsData files the model
before any generation is added:

- **Model-name changes** (OCD likely files them as SEPARATE models, so a search never pools across
  them): 308 -> 328, 240Z -> 260Z -> 280Z, Testarossa -> 512 TR -> 512 M. If filed separately, a
  "308" search never sees a 328 and there is no leak; adding a generation would be busywork.
- **Facelifts within one generation** (same body, minor change - pooling is usually fine): 2002 vs
  2002 taillight change (1974), Jaguar XJS pre/post facelift (1991), Diablo pre/post (1999).
- **Trims within one body** (same generation, a trim/engine difference - pooling may be correct or
  belongs to the halo/trim logic, not the generation map): Porsche 944 vs 944 Turbo vs S2, 928 vs
  S4. These are trim/variant questions, not generation boundaries.

For each candidate, confirm it is a genuine cross-generation/cross-body pool (distinct markets under
ONE model field) before curating. Prefer gaps over guesses: a wrong boundary poisons comps.

## Tier 1 - highest frequency (1,000+ archive sales)

| Model | Sales | Boundary year(s) -> years that wrongly pool |
|---|---|---|
| Land Rover Range Rover | 2,498 | 1996 (Classic->P38), 2003 (->L322), 2013 (->L405) |
| Porsche Cayenne | 2,452 | 2011 (957->958), 2019 (->9Y0) |
| Jeep Wrangler | 2,094 | 1997 (TJ), 2007 (JK), 2018 (JL) |
| Ford Thunderbird | 1,816 | 1958, 1961, 1964, 1967, 1972 (1955-57 two-seater vs 1958+ is the big one) |
| Pontiac Firebird / Trans Am | 1,536 / 1,183 | 1970 (1st->2nd), 1982 (->3rd), 1993 (->4th) |
| BMW 2002 | 1,481 | 1974 (facelift/tii - verify, may not be a real leak) |
| Chevrolet C10 | 1,408 | 1967, 1973, 1988 |
| Toyota 4Runner | 1,176 | 1990, 1996, 2003, 2010 |

## Tier 2 - high frequency (500-1,000)

| Model | Sales | Boundary -> note |
|---|---|---|
| Chevrolet Bel Air | 991 | 1955/1957 tri-five vs 1958+ (very different markets) |
| Alfa Romeo Spider (105) | 985 | 1970 (Duetto boattail->Kamm), 1983, 1990 |
| Porsche 944 | 909 | 1986 (Turbo), 1989 (S2) - TRIM, verify vs halo/trim logic |
| Ford F-100 | 899 | 1953, 1957, 1961, 1967, 1973 |
| Chevrolet Impala | 786 | 1961, 1965, 1971 |
| Chevrolet K5 Blazer | 760 | 1973 (full-size restyle) |
| Porsche 928 | 746 | 1985/1987 (S4) - TRIM/series, verify |
| Chevrolet Suburban | 586 | 1973, 1992 |
| Mazda RX-7 | 585 | 1986 (FB->FC), 1993 (FC->FD) - MAJOR body/market changes |
| Nissan 300ZX | 512 | 1990 (Z31->Z32) - MAJOR body change |
| Chevrolet Nova | 503 | 1968, 1975 |

## Tier 3 - moderate (200-500)

Int'l Scout 488 (1971), Chevrolet El Camino 486 (1968/73/78), Ferrari 308 485 (1986->328;
verify name-change), Toyota MR2 431 (1990/2000), Jaguar XJS 426 (1991 facelift; verify), Ford
Fairlane 376, Jeep Grand Wagoneer 366, Datsun 240Z/260Z/280Z 352 (1974/1975; verify name-change),
Jaguar XK8 349 (2003/2007), Toyota Celica 334, Ferrari Testarossa 325 (1992/1995; verify
name-change), Ford Galaxie 321, Oldsmobile 442 312, Acura Integra 299, Alfa GTV 289, Lotus Esprit
227, Honda Prelude 213, GMC Jimmy 210, Mercury Cougar 203.

## Tier 4 - lower volume but clear boundaries

Plymouth Barracuda/Cuda 199 (1967, 1970 E-body), Plymouth Road Runner 194, Ford Falcon 194,
Porsche 924 193, Ferrari Mondial 161, Lamborghini Diablo 144 (facelift; verify), Lamborghini
Countach 133 (1978/82/85), Buick Skylark 127, Ford Torino 124, Plymouth GTX 118, Mercedes 300SD 105.

## Caveats

- **Title-token undercounts (real gaps, unreliable counts):** BMW Z3, BMW 8-Series, BMW 6-Series
  (E24), Jaguar XJ, Jeep CJ, Mercedes G-Class, Honda/Acura NSX, Ford GT all returned near-zero
  because the archive titles use sub-badges ("633CSi", "850i", "CJ-7", "SALD..."). They are almost
  certainly also uncurated boundary-crossers; they just cannot be counted by a title token.
- **Excluded (single generation, no year +/- 2 harm despite volume):** Mercedes 190SL (234, one
  gen 1955-63), Porsche 914 (556, effectively one body), Land Rover Defender (2,240 - one long
  classic run with only a GAP to the 2020 model, so year +/- 2 rarely crosses). High count but not
  a boundary-crossing leak.

## Recommended fix order (after verification)

1. Mazda RX-7 and Nissan 300ZX first (severe body changes, distinct markets, one model field).
2. High-volume American muscle/truck cluster: Firebird/Trans Am, C10, Thunderbird, Bel Air, Nova,
   El Camino, Impala, K5 Blazer, F-100.
3. Range Rover, Cayenne, Wrangler, 4Runner (SUV generations, adjacent boundaries).
4. Only after confirming they are genuine cross-generation pools: the name-change and trim/facelift
   candidates (308/328, 240Z/280Z, Testarossa, 944, 928, XJS, 2002).
