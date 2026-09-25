# Sam Desk grouping lists (first 10, DRAFT PENDING) — Stage A, revised Sep 24

Spec docs/desk-understanding-spec.md s4/s9/s12, revised per Sam's Stage-A follow-ups. Groupings are OPINIONS: each records who defined it and is shown in full on the reading card so the user can drop a member. **Status: pending — Sam approves each before it is marked `approved` in lib/desk/dictionary.js.**

Counts are all-time, sold-only, from sales_archive via the read-only `deskcounts` probe (no writes). A plain number is an exact count; **≈N (est.)** / **>1,000 (est.)** is a PostgreSQL planner estimate (a stated range) for a high-volume pool whose exact scan exceeds the 8s statement timeout. Structural filters (body, performance trims) are shown per grouping and are applied at query time; where a **perf-trim** filter is shown, the count is already scoped to titles carrying that trim. No overlapping years between generations within a grouping.

## 90s Japanese sports cars

- **Defined by:** GoAskSam (CC draft, Sep 2026); mirrors spec s9 example, revised per Sam Sep 24
- **Status:** pending
- **Members:** 16

| Member | Model years | Generation / label | Scope note | Archive sales |
|---|---|---|---|---|
| Toyota Supra | 1990–1992 | A70 | — | 52 |
| Toyota Supra | 1993–1998 | A80 | — | 263 |
| Mazda RX-7 | 1993–2002 | — | — | 259 |
| Acura NSX | 1990–1999 | — | — | 355 |
| Honda NSX | 1990–1999 | — | — | 64 |
| Nissan 300ZX | 1990–1996 | — | — | 363 |
| Nissan 240SX | 1990–1998 | — | — | 92 |
| Mitsubishi 3000GT | 1991–1999 | — | — | 168 |
| Mitsubishi Eclipse GSX | 1990–1999 | — | titles: Eclipse GSX/Eclipse GS-X | 33 |
| Mitsubishi Lancer Evolution | 1992–1999 | — | titles: Lancer Evolution/Lancer Evo/Evo IV/Evo V | 98 |
| Subaru Impreza WRX STi | 1992–1999 | — | titles: WRX STI/Impreza STI/22B | 108 |
| Toyota MR2 | 1990–1999 | — | — | 198 |
| Mazda MX-5 | 1990–1997 | NA | — | 663 |
| Mazda MX-5 | 1999–1999 | NB | — | 127 |
| Nissan Skyline | 1990–1999 | — | — | 365 |
| Acura Integra Type R | 1997–1999 | — | — | 44 |

*Evo/WRX STi are grey-market imports; Skyline where imported; MX-5 NA 1990-1997 then NB 1999 (no overlap)*

## air-cooled 911s

- **Defined by:** GoAskSam (CC draft); Porsche air-cooled 911 = 901 through 993, revised per Sam Sep 24
- **Status:** pending
- **Members:** 4

| Member | Model years | Generation / label | Scope note | Archive sales |
|---|---|---|---|---|
| Porsche 911 | 1964–1973 | 901 | — | 1,213 |
| Porsche 911 | 1974–1988 | G-body | — | >1,000 (est.) |
| Porsche 911 | 1989–1994 | 964 | — | >1,000 (est.) |
| Porsche 911 | 1995–1998 | 993 | — | >1,000 (est.) |

*G-body (1974-1988) is labelled G-body, not 930, and includes the 930 Turbo; 964 takes 1989 (the ambiguous handover) so there is no overlap with G-body; all one nameplate (Porsche 911) so this reads as a single 911<=1998 read, not a ranking (spec Q3)*

## muscle cars

- **Defined by:** GoAskSam (CC draft); classic-era US V8 muscle, revised per Sam Sep 24
- **Status:** pending
- **Performance trims (title filter):** SS, R/T, Boss, Mach 1, Z/28, 442, GS, GTX, Super Bee, Cobra Jet, Judge, GTO
- **Members:** 17

| Member | Model years | Generation / label | Scope note | Archive sales |
|---|---|---|---|---|
| Chevrolet Chevelle | 1964–1972 | — | perf-trim: SS/Super Sport | ≈660 (est.) |
| Chevrolet Camaro | 1967–1972 | — | perf-trim: SS/Z/28/Z28/Super Sport | ≈758 (est.) |
| Chevrolet Nova | 1968–1972 | — | perf-trim: SS/Super Sport | 32 |
| Pontiac GTO | 1964–1972 | — | — | ≈738 (est.) |
| Pontiac Firebird | 1967–1972 | — | perf-trim: Trans Am/Formula/400 | ≈135 (est.) |
| Dodge Charger | 1966–1972 | — | perf-trim: R/T/Super Bee/Daytona/500 | 101 |
| Dodge Challenger | 1970–1972 | — | perf-trim: R/T/T/A | 108 |
| Dodge Coronet | 1967–1970 | — | perf-trim: R/T/Super Bee | 42 |
| Dodge Super Bee | 1968–1971 | — | — | 54 |
| Plymouth Barracuda | 1970–1972 | — | perf-trim: Cuda/'Cuda/AAR | 77 |
| Plymouth Road Runner | 1968–1972 | — | — | 185 |
| Plymouth GTX | 1967–1971 | — | — | 118 |
| Ford Mustang | 1967–1971 | — | perf-trim: Boss/Mach 1/Cobra Jet/Shelby | 566 |
| Ford Torino | 1968–1971 | — | perf-trim: Cobra Jet/Cobra/GT | 77 |
| Mercury Cyclone | 1968–1971 | — | perf-trim: GT/Spoiler/Cobra Jet | 20 |
| Buick GS | 1965–1972 | — | — | 125 |
| Oldsmobile 442 | 1964–1972 | — | — | 285 |

*trimAny filters titles to the performance version for models with a base variant (Chevelle SS, Mustang Boss/Mach 1); inherently-performance models (GTO, Road Runner, GTX, Super Bee, 442, GS) are counted whole*

## pony cars

- **Defined by:** GoAskSam (CC draft); compact sporty coupes, revised per Sam Sep 24 (consistent 1964-1974)
- **Status:** pending
- **Members:** 8

| Member | Model years | Generation / label | Scope note | Archive sales |
|---|---|---|---|---|
| Ford Mustang | 1964–1974 | — | — | >1,000 (est.) |
| Chevrolet Camaro | 1967–1974 | — | — | 2,153 |
| Pontiac Firebird | 1967–1974 | — | — | 385 |
| Plymouth Barracuda | 1964–1974 | — | — | 198 |
| Mercury Cougar | 1967–1974 | — | — | 163 |
| Dodge Challenger | 1970–1974 | first | — | 243 |
| AMC Javelin | 1968–1974 | — | — | 45 |
| AMC AMX | 1968–1970 | — | — | 58 |

*consistent 1964-1974 pony era; the whole nameplate (not just performance trims), distinct from the muscle list*

## performance hatchbacks

- **Defined by:** GoAskSam (CC draft); renamed from 'hot hatches' per Sam Sep 24
- **Status:** pending
- **Body filter (applied at query time):** hatchback (and convertible/cabriolet)
- **Members:** 13

| Member | Model years | Generation / label | Scope note | Archive sales |
|---|---|---|---|---|
| Volkswagen Golf GTI | 1983–2026 | — | titles: GTI | 526 |
| Volkswagen Golf R | 2012–2026 | — | titles: Golf R | 191 |
| Volkswagen Golf R32 | 2004–2008 | — | titles: R32 | 185 |
| Honda Civic Type R | 1997–2026 | — | — | 99 |
| Honda CRX | 1984–1991 | — | — | 176 |
| Ford Focus RS | 2009–2018 | — | — | 166 |
| Ford Focus ST | 2013–2018 | — | — | 84 |
| Ford Fiesta ST | 2014–2019 | — | — | 88 |
| Renault Clio | 2001–2016 | — | perf-trim: RS/V6/Williams | 80 |
| Mini Cooper S | 2002–2026 | — | — | 781 |
| Toyota GR Corolla | 2023–2026 | — | — | 58 |
| Dodge Omni GLH | 1984–1986 | — | titles: Omni GLH/GLH | 13 |
| Hyundai Veloster N | 2019–2022 | — | titles: Veloster N | 6 |

*body=hatchback applies at query time (spec structural); WRX dropped (a sedan); Clio scoped to RS/V6/Williams*

## analog supercars

- **Defined by:** GoAskSam (CC draft); pre-electronic-aids supercars, revised per Sam Sep 24
- **Status:** pending
- **Members:** 13

| Member | Model years | Generation / label | Scope note | Archive sales |
|---|---|---|---|---|
| Ferrari F40 | 1987–1992 | — | — | 69 |
| Ferrari F50 | 1995–1997 | — | — | 25 |
| Ferrari 288 GTO | 1984–1987 | — | — | 18 |
| Porsche Carrera GT | 2004–2007 | — | — | 83 |
| Porsche 959 | 1986–1988 | — | — | 31 |
| Lamborghini Countach | 1984–1990 | — | — | 100 |
| Lamborghini Diablo | 1990–2001 | — | — | 138 |
| Jaguar XJ220 | 1992–1994 | — | — | 36 |
| Bugatti EB110 | 1991–1995 | — | — | 16 |
| McLaren F1 | 1992–1998 | — | — | ≈7 (est.) |
| Ford GT | 2005–2006 | — | titles: Ford GT | 389 |
| Honda NSX | 1990–2005 | — | — | 71 |
| Acura NSX | 1990–2005 | — | — | 483 |

*the 'analog' boundary is an opinion (traction control / paddle shift end the era); shown in full so the user can prune*

## British roadsters

- **Defined by:** GoAskSam (CC draft); classic UK open two-seaters, revised per Sam Sep 24
- **Status:** pending
- **Body filter (applied at query time):** roadster (and convertible/cabriolet)
- **Members:** 19

| Member | Model years | Generation / label | Scope note | Archive sales |
|---|---|---|---|---|
| MG MGB | 1963–1980 | — | — | 729 |
| MG MGA | 1955–1962 | — | — | 318 |
| MG Midget | 1961–1979 | — | — | 158 |
| Triumph TR6 | 1969–1976 | — | — | 561 |
| Triumph TR4 | 1961–1967 | — | — | 168 |
| Triumph TR3 | 1955–1962 | — | — | 175 |
| Triumph Spitfire | 1962–1980 | — | — | 165 |
| Austin-Healey 3000 | 1959–1967 | — | — | 410 |
| Austin-Healey 100 | 1953–1956 | — | — | ≈178 (est.) |
| Austin-Healey Sprite | 1958–1971 | — | — | 188 |
| Jaguar E-Type | 1961–1974 | — | — | 937 |
| Jaguar XK120 | 1948–1954 | — | — | 252 |
| Jaguar XK140 | 1954–1957 | — | — | 150 |
| Jaguar XK150 | 1957–1961 | — | — | 181 |
| Lotus Elan | 1962–1975 | — | — | 135 |
| Lotus Seven | 1957–1972 | — | — | 28 |
| Sunbeam Alpine | 1959–1968 | — | — | 53 |
| Sunbeam Tiger | 1964–1967 | — | — | 187 |
| Morgan Plus 4 | 1950–2000 | — | — | 107 |

*body=roadster/convertible applies at query time (spec structural); fixed-head coupes excluded there*

## Italian exotics

- **Defined by:** GoAskSam (CC draft); Italian FLAGSHIPS only, revised per Sam Sep 24
- **Status:** pending
- **Members:** 15

| Member | Model years | Generation / label | Scope note | Archive sales |
|---|---|---|---|---|
| Lamborghini Miura | 1966–1973 | — | — | 53 |
| Lamborghini Countach | 1974–1990 | — | — | 129 |
| Lamborghini Diablo | 1990–2001 | — | — | 138 |
| Lamborghini Murcielago | 2001–2010 | — | — | 106 |
| Ferrari Berlinetta Boxer | 1973–1984 | — | titles: Berlinetta Boxer/365 GT4 BB/512 BB/512 BBi | 167 |
| Ferrari Testarossa | 1984–1991 | — | — | 319 |
| Ferrari 512 TR | 1992–1994 | — | titles: 512 TR | 92 |
| Ferrari F512 M | 1995–1996 | — | titles: F512 M/512 M | 36 |
| Ferrari F40 | 1987–1992 | — | — | 69 |
| Ferrari F50 | 1995–1997 | — | — | 25 |
| Ferrari Enzo | 2002–2004 | — | — | 27 |
| Ferrari 288 GTO | 1984–1987 | — | — | 18 |
| Maserati Bora | 1971–1978 | — | — | 41 |
| De Tomaso Pantera | 1971–1992 | — | — | 210 |
| Pagani Zonda | 1999–2017 | — | — | 4 |

*flagships only (308/Ghibli removed); TR 1984-1991, 512 TR 1992-1994, F512 M 1995-1996 (no overlap)*

## overlanders

- **Defined by:** GoAskSam (CC draft); go-anywhere expedition 4x4s, revised per Sam Sep 24
- **Status:** pending
- **Members:** 12

| Member | Model years | Generation / label | Scope note | Archive sales |
|---|---|---|---|---|
| Toyota Land Cruiser | 1960–2021 | — | — | >1,000 (est.) |
| Land Rover Defender | 1983–2016 | — | — | >1,000 (est.) |
| Land Rover Series III | 1971–1985 | — | — | 244 |
| Ford Bronco | 1966–1996 | — | — | >1,000 (est.) |
| Mercedes-Benz G-Class | 1979–2026 | — | titles: G-Class/G-Wagen/G550/G500 | ≈864 (est.) |
| Toyota 4Runner | 1984–2026 | — | — | >1,000 (est.) |
| Nissan Patrol | 1980–2026 | — | — | 31 |
| Jeep Wrangler | 1987–2018 | — | — | >1,000 (est.) |
| Jeep CJ | 1945–1986 | — | — | ≈740 (est.) |
| International Scout | 1961–1980 | — | — | ≈567 (est.) |
| Toyota FJ Cruiser | 2007–2014 | — | — | ≈518 (est.) |
| Mitsubishi Delica | 1968–2007 | — | — | 125 |

*spans classic and modern; a window usually narrows it; G-Class counted by its designations (G500/G550/G63/G-Wagen), not the family label*

## malaise era

- **Defined by:** GoAskSam (CC draft); emblematic US 1973-1983 cars, revised per Sam Sep 24
- **Status:** pending
- **Members:** 15

| Member | Model years | Generation / label | Scope note | Archive sales |
|---|---|---|---|---|
| Chevrolet Corvette | 1973–1982 | C3 | — | 942 |
| Pontiac Firebird | 1973–1981 | — | perf-trim: Trans Am/Formula | 524 |
| Ford Mustang II | 1974–1978 | — | titles: Mustang II | 25 |
| Chevrolet Camaro | 1973–1981 | second | — | 251 |
| Cadillac Eldorado | 1973–1978 | — | — | 279 |
| Pontiac Grand Prix | 1973–1977 | — | — | 34 |
| Chevrolet Monte Carlo | 1973–1977 | — | — | 38 |
| AMC Pacer | 1975–1980 | — | — | 29 |
| AMC Gremlin | 1970–1978 | — | — | 17 |
| Ford Pinto | 1971–1980 | — | — | 34 |
| Chevrolet Vega | 1971–1977 | — | — | 26 |
| Chrysler Cordoba | 1975–1983 | — | — | 13 |
| Lincoln Continental Mark IV | 1972–1976 | — | titles: Mark IV/Continental Mark IV | 91 |
| Lincoln Continental Mark V | 1977–1979 | — | titles: Mark V/Continental Mark V | 153 |
| Ford Thunderbird | 1973–1979 | — | — | 51 |

*the era ENTRY (1973-1983) is the year span; this grouping is the emblematic-model reading; Mustang II counted specifically by 'Mustang II'*

