# Repeat sales, second pass (Lane F, Nov 19 2026)

Read only. Counts and prices only: no listing text, no seller name, no VIN in this file or in the two csv files beside it (repeat-sales-2-groups.csv, repeat-sales-2-extremes.csv). Make, model, year and the set aside flags are the engine's own columns from the sold archive (poolrows), never titles. Nothing was written to production, no code changed, so the Class fix line does not apply.

## Method and limits (read first)

- A car is one distinct VIN of 11 to 32 characters. The archive was read end to end through poolrows (301,374 sold rows; 91,061 carry no lookable VIN and cannot be paired). Failed lots come from vinoverlap (the last unsold attempt of each car, 2,611 cars) and the venue of each failed lot from vinverify (1,226 cars).
- Value of an appearance: a sold row's hammer (house fee backed out, USD), or a failed lot's last high bid. Rows within 7 days of each other count once; a failed lot within 2 days of a sale is that sale. A pair is two consecutive appearances. Ratio is later over earlier, both at least $1,000. "Beat" means ratio above 1. Months is days over 30.44. Median ratio and median months are medians, never means.
- Set aside: the engine's own project and replica flags drop 5,616 rows; 604 rows under $1,000 and 466 pairs where year or make differ are dropped. The per car engine verdict (qualifyReason) cannot run archive wide, so it is not applied. That is why the pair counts here (**15,734 sold then sold, 1,224 failed then sold**) sit a little under the 16,715 and 1,248 in the order.
- **Cells under 10 pairs are marked (under 10) and are not to be read.** Cells under 30 pairs in the venue tables are left out.
- Only the last failed attempt per car is visible, so a car that failed twice shows once. A failed lot's high bid is a floor under the reserve, not a value.
- Mileage is the listing's own number, unit not recorded; the pair needs it on both sales (12,187 sold then sold pairs).
- Failed then sold pairs run from Q4 2025 to Q4 2026 only; there are none earlier in the tables.

## Reading the tables

Sold then sold overall: **15,734 pairs, median ratio 0.957, 41.0% sold for more, median 12.2 months apart.** Failed then sold overall: **1,224 pairs, median 1.104 of the refused high bid, 76.6% above it, median 1.6 months.**

The tables below are in the order of the request: (1) make and model, (2) decade, (3) price band, (4) months between, (5) calendar, (6) venue pairs, (7) mileage, (8) the 25 gains and 25 losses, (9) failed then sold (its make, decade, price band, months and calendar tables sit under the same headings marked failed then sold, and the same venue against moved table is at the end), (10) third appearances. For failed then sold the "ratio" is the second sale's price over the high bid it refused.

The two top gains (a 1990 and a 1989 Porsche 964 at about 18 times the first price) and the first loss (a 1994 Lamborghini Diablo at $1.9m, then $220k six weeks later) look like wrong prices or a reused chassis number, not real swings. The top and bottom of the extremes list include data errors (wrong price, reused or mistyped chassis number) as well as real swings; read them as outliers to check, not as findings. They do not move the medians.


#### By make (50 or more pairs) (sold then sold)

| group | pairs | median ratio | beat | median months |
|---|---:|---:|---:|---:|
| Acura | 117 | 1.088 | 67.5% | 13.1 |
| Ferrari | 474 | 1.045 | 59.1% | 18.8 |
| Plymouth | 111 | 1.021 | 53.2% | 11.2 |
| Lamborghini | 92 | 1.017 | 52.2% | 15.8 |
| Porsche | 1901 | 1.003 | 50.3% | 14.7 |
| Mazda | 180 | 0.995 | 46.1% | 11.1 |
| Dodge | 289 | 0.992 | 45.7% | 11.6 |
| Mini | 94 | 0.982 | 41.5% | 13.4 |
| Datsun | 50 | 0.979 | 48.0% | 14.2 |
| Aston Martin | 212 | 0.978 | 44.3% | 16.3 |
| Pontiac | 212 | 0.977 | 44.3% | 11.1 |
| GMC | 118 | 0.977 | 41.5% | 11.1 |
| MG | 55 | 0.969 | 43.6% | 13.8 |
| Chevrolet | 1916 | 0.965 | 42.1% | 12 |
| Honda | 336 | 0.96 | 40.8% | 12.2 |
| Lexus | 227 | 0.958 | 40.5% | 8.4 |
| BMW | 1644 | 0.951 | 38.7% | 13.2 |
| Lincoln | 109 | 0.95 | 41.3% | 12.3 |
| Ford | 1408 | 0.948 | 39.4% | 12.1 |
| Toyota | 593 | 0.945 | 39.1% | 9.9 |
| Buick | 74 | 0.943 | 35.1% | 6.5 |
| Nissan | 129 | 0.936 | 44.2% | 10.4 |
| Oldsmobile | 65 | 0.934 | 33.8% | 8.6 |
| Volvo | 114 | 0.933 | 39.5% | 14.7 |
| Mercedes-Benz | 2139 | 0.932 | 38.1% | 11.4 |
| Audi | 292 | 0.926 | 33.6% | 11.3 |
| Jeep | 316 | 0.914 | 34.5% | 11.9 |
| Cadillac | 207 | 0.91 | 32.9% | 10.3 |
| Land Rover | 409 | 0.91 | 35.0% | 8.8 |
| Volkswagen | 168 | 0.906 | 29.8% | 12.1 |
| Mitsubishi | 67 | 0.902 | 28.4% | 8.2 |
| Jaguar | 267 | 0.893 | 30.3% | 11.2 |
| Bentley | 183 | 0.891 | 26.2% | 11.8 |
| Fiat | 53 | 0.878 | 34.0% | 16.5 |
| Alfa Romeo | 84 | 0.866 | 33.3% | 13.9 |
| Subaru | 100 | 0.863 | 24.0% | 11.8 |
| Rolls-Royce | 50 | 0.86 | 26.0% | 11.1 |
| Saab | 57 | 0.847 | 26.3% | 15.3 |
| Maserati | 103 | 0.839 | 31.1% | 12.1 |

#### By model (30 or more pairs) (sold then sold)

| group | pairs | median ratio | beat | median months |
|---|---:|---:|---:|---:|
| Ferrari Testarossa | 33 | 1.256 | 78.8% | 24.4 |
| Ferrari 430 | 33 | 1.131 | 66.7% | 18.3 |
| Ferrari 355 | 37 | 1.128 | 81.1% | 14.8 |
| Mercedes-Benz 190 | 31 | 1.11 | 58.1% | 16.8 |
| Acura NSX | 60 | 1.099 | 73.3% | 14.4 |
| Porsche 964 | 52 | 1.085 | 61.5% | 23.6 |
| Ford GT | 52 | 1.06 | 61.5% | 20.4 |
| Porsche 997 | 124 | 1.058 | 62.9% | 17.4 |
| Chevrolet Chevelle | 63 | 1.052 | 54.0% | 11.9 |
| Ferrari 360 | 37 | 1.047 | 51.4% | 19.3 |
| Porsche 996 | 141 | 1.043 | 58.9% | 17.3 |
| BMW M3 | 67 | 1.041 | 56.7% | 20 |
| Chevrolet BEL AIR | 45 | 1.037 | 51.1% | 12 |
| Porsche 944 | 91 | 1.029 | 53.8% | 11.6 |
| Jeep Wagoneer/Grand Wagoneer (1963 to 1991) | 30 | 1.029 | 53.3% | 15.1 |
| Porsche 911 | 565 | 1.027 | 55.4% | 14.8 |
| Porsche 991 | 76 | 1.02 | 57.9% | 13.1 |
| Chevrolet Impala | 40 | 1.02 | 55.0% | 11.3 |
| Toyota Land Cruiser 80 Series | 58 | 1.02 | 53.4% | 8.5 |
| Dodge Viper | 57 | 1.019 | 54.4% | 17 |
| Toyota MR2 | 36 | 1.008 | 50.0% | 13.6 |
| Porsche Cayman | 53 | 1.006 | 50.9% | 19.5 |
| Aston Martin Vantage | 32 | 1.001 | 50.0% | 17.8 |
| Mercedes-Benz 560 | 71 | 1 | 45.1% | 10.6 |
| Porsche 992 | 33 | 1 | 45.5% | 12.9 |
| Honda S2000 | 79 | 1 | 48.1% | 12.2 |
| Mazda MX-5 | 118 | 1 | 46.6% | 11.4 |
| Porsche 928 | 43 | 0.997 | 44.2% | 14.6 |
| BMW M5 | 44 | 0.996 | 47.7% | 26.5 |
| Mini Cooper | 69 | 0.991 | 46.4% | 13.9 |
| Pontiac GTO | 33 | 0.979 | 48.5% | 9.6 |
| Audi R8 | 40 | 0.977 | 45.0% | 11.9 |
| Chevrolet Blazer | 89 | 0.976 | 43.8% | 12.1 |
| Porsche Boxster | 197 | 0.971 | 43.1% | 12.3 |
| Chevrolet Silverado | 81 | 0.971 | 46.9% | 7.9 |
| BMW 1-Series | 47 | 0.971 | 42.6% | 19.7 |
| Pontiac Firebird | 84 | 0.97 | 40.5% | 9.8 |
| Ford Mustang | 417 | 0.967 | 42.2% | 13.4 |
| Chevrolet Corvette | 665 | 0.966 | 40.5% | 12.1 |
| Toyota Supra | 32 | 0.963 | 37.5% | 13.3 |
| Toyota FJ Cruiser | 35 | 0.962 | 34.3% | 17.5 |
| Chevrolet C/K | 161 | 0.96 | 46.6% | 11.9 |
| Lexus LX | 69 | 0.96 | 40.6% | 12.7 |
| Chevrolet Camaro | 248 | 0.959 | 39.1% | 12.2 |
| Dodge Ram | 50 | 0.956 | 38.0% | 4.9 |
| Toyota Tacoma | 52 | 0.956 | 34.6% | 5 |
| Chevrolet Tahoe | 36 | 0.955 | 33.3% | 8.4 |
| Aston Martin V8 Vantage | 41 | 0.952 | 36.6% | 22.1 |
| Lincoln Continental | 63 | 0.95 | 42.9% | 13.1 |
| BMW 5-Series | 238 | 0.949 | 34.9% | 14.2 |
| Toyota Land Cruiser 100 Series | 38 | 0.949 | 39.5% | 7.3 |
| Lexus LS | 66 | 0.948 | 36.4% | 7 |
| BMW 7-Series | 71 | 0.948 | 45.1% | 11.4 |
| Porsche 718 | 36 | 0.948 | 36.1% | 13.6 |
| Lexus SC | 32 | 0.947 | 43.8% | 9.8 |
| BMW 3-Series | 534 | 0.946 | 36.9% | 12.8 |
| Dodge Challenger | 55 | 0.945 | 38.2% | 9.7 |
| Jeep Cherokee | 53 | 0.942 | 35.8% | 12.7 |
| Mercedes-Benz M-Class | 31 | 0.942 | 48.4% | 3.6 |
| BMW X5 | 52 | 0.94 | 36.5% | 3.9 |
| Volkswagen Golf | 38 | 0.939 | 34.2% | 11.3 |
| Mercedes-Benz E-Class | 294 | 0.938 | 38.8% | 11 |
| Jaguar XJS | 42 | 0.937 | 38.1% | 15 |
| Cadillac Eldorado | 44 | 0.937 | 38.6% | 9.4 |
| BMW Z3 | 91 | 0.935 | 41.8% | 12.5 |
| BMW 8-Series | 36 | 0.934 | 41.7% | 17.5 |
| Mercedes-Benz G-Class | 90 | 0.934 | 36.7% | 11.3 |
| Mercedes-Benz CLK-Class | 70 | 0.931 | 37.1% | 11.8 |
| Nissan 300ZX | 51 | 0.93 | 35.3% | 11 |
| BMW Z4 | 51 | 0.93 | 45.1% | 10.9 |
| Mercedes-Benz SL-Class | 415 | 0.928 | 37.3% | 11 |
| BMW 6-Series | 128 | 0.927 | 34.4% | 13.1 |
| Volkswagen Touareg | 30 | 0.921 | 26.7% | 7.7 |
| Jaguar XJ | 87 | 0.919 | 41.4% | 11.2 |
| Land Rover Discovery | 66 | 0.919 | 33.3% | 13.2 |
| Toyota 4Runner | 82 | 0.919 | 34.1% | 11.4 |
| Audi S4 | 43 | 0.917 | 39.5% | 10.8 |
| Ford F-Series | 242 | 0.916 | 32.2% | 10.1 |
| Ford Bronco | 213 | 0.916 | 36.6% | 12.4 |
| Subaru Impreza | 48 | 0.915 | 25.0% | 9.8 |
| Aston Martin DB9 | 34 | 0.91 | 26.5% | 10.3 |
| Land Rover Range Rover | 138 | 0.909 | 36.2% | 7.1 |
| Mercedes-Benz C-Class | 82 | 0.904 | 31.7% | 13.6 |
| Mercedes-Benz CL-Class | 42 | 0.902 | 31.0% | 8.2 |
| Toyota Land Cruiser 60 Series | 43 | 0.899 | 27.9% | 21.1 |
| Jeep Wrangler | 107 | 0.896 | 27.1% | 12 |
| Land Rover Defender | 111 | 0.894 | 37.8% | 12.7 |
| Mercedes-Benz W123 | 33 | 0.893 | 30.3% | 23.3 |
| Jeep CJ | 39 | 0.889 | 28.2% | 13.1 |
| Porsche Cayenne | 212 | 0.887 | 26.4% | 11.2 |
| Porsche Panamera | 31 | 0.882 | 16.1% | 12.9 |
| Land Rover Range Rover Sport | 53 | 0.879 | 20.8% | 4.2 |
| Ford Thunderbird | 82 | 0.875 | 25.6% | 14 |
| Mercedes-Benz S-Class | 218 | 0.873 | 32.6% | 9.7 |
| Alfa Romeo 105 Series | 30 | 0.866 | 36.7% | 9.7 |
| Saab 9-3 | 32 | 0.847 | 21.9% | 15.5 |
| Bentley Continental GT | 41 | 0.843 | 19.5% | 12.2 |

#### By decade of the car (sold then sold)

| group | pairs | median ratio | beat | median months |
|---|---:|---:|---:|---:|
| 1960s | 1377 | 0.975 | 43.9% | 13.1 |
| 1970s | 1321 | 0.962 | 42.8% | 12.6 |
| 1980s | 1927 | 0.981 | 46.0% | 13.5 |
| 1990s | 3089 | 0.976 | 45.3% | 12.2 |
| 2000s | 4866 | 0.948 | 39.1% | 12 |
| 2010s | 2455 | 0.943 | 35.1% | 11.8 |
| 2020s | 453 | 0.938 | 29.6% | 10.2 |
| pre 1960 | 246 | 0.974 | 41.1% | 16.7 |

#### By price band of the first result (sold then sold)

| group | pairs | median ratio | beat | median months |
|---|---:|---:|---:|---:|
| under $25k | 7089 | 0.952 | 40.9% | 9.9 |
| $25k to $50k | 3931 | 0.949 | 37.8% | 13.5 |
| $50k to $100k | 2549 | 0.97 | 42.8% | 14.3 |
| $100k to $250k | 1582 | 0.973 | 42.7% | 16.9 |
| $250k to $500k | 385 | 1 | 48.8% | 19 |
| $500k to $1m | 126 | 1.036 | 54.8% | 24 |
| over $1m | 72 | 1.099 | 61.1% | 31.1 |

#### By months between (sold then sold)

| group | pairs | median ratio | beat | median months |
|---|---:|---:|---:|---:|
| under 3 | 3071 | 0.976 | 41.4% | 1.3 |
| 3 to 6 | 1607 | 0.975 | 43.6% | 4.4 |
| 6 to 12 | 3051 | 0.971 | 43.6% | 9 |
| 12 to 24 | 3910 | 0.938 | 38.2% | 17.3 |
| 24 to 36 | 2265 | 0.924 | 37.4% | 28.8 |
| over 36 | 1830 | 0.96 | 44.3% | 44.9 |

#### By year and quarter of the second sale (sold then sold)

| group | pairs | median ratio | beat | median months |
|---|---:|---:|---:|---:|
| 2022 Q1 | 215 | 1.163 | 69.3% | 10.1 |
| 2022 Q2 | 278 | 1.012 | 51.8% | 3.8 |
| 2022 Q3 | 296 | 0.997 | 48.6% | 5.3 |
| 2022 Q4 | 362 | 0.945 | 39.2% | 6.4 |
| 2023 Q1 | 513 | 1 | 50.1% | 9.7 |
| 2023 Q2 | 570 | 0.951 | 39.3% | 8.8 |
| 2023 Q3 | 534 | 0.948 | 36.9% | 9.9 |
| 2023 Q4 | 577 | 0.929 | 32.8% | 10.9 |
| 2024 Q1 | 795 | 0.941 | 37.6% | 11.9 |
| 2024 Q2 | 758 | 0.938 | 38.4% | 12.3 |
| 2024 Q3 | 873 | 0.916 | 31.6% | 13.2 |
| 2024 Q4 | 891 | 0.925 | 35.8% | 13.8 |
| 2025 Q1 | 954 | 0.949 | 38.3% | 15.6 |
| 2025 Q2 | 1042 | 0.938 | 36.9% | 13.8 |
| 2025 Q3 | 1057 | 0.938 | 36.6% | 16.8 |
| 2025 Q4 | 1054 | 0.939 | 38.3% | 14.3 |
| 2026 Q1 | 1077 | 0.978 | 44.5% | 15.4 |
| 2026 Q2 | 1397 | 0.995 | 46.7% | 16.1 |
| 2026 Q3 | 1355 | 0.998 | 48.5% | 17 |
| 2026 Q4 | 669 | 0.962 | 42.0% | 15.5 |

#### By month of year of the second sale (sold then sold)

| group | pairs | median ratio | beat | median months |
|---|---:|---:|---:|---:|
| 01 | 1663 | 0.97 | 43.4% | 12.3 |
| 02 | 812 | 0.969 | 42.0% | 11.2 |
| 03 | 1181 | 0.978 | 45.3% | 12.1 |
| 04 | 1457 | 0.957 | 41.0% | 12.2 |
| 05 | 1329 | 0.975 | 43.2% | 11.8 |
| 06 | 1374 | 0.963 | 42.0% | 12.6 |
| 07 | 1309 | 0.951 | 39.9% | 12.2 |
| 08 | 1493 | 0.959 | 42.1% | 14.3 |
| 09 | 1459 | 0.95 | 39.1% | 12.7 |
| 10 | 1721 | 0.944 | 38.5% | 12.4 |
| 11 | 1147 | 0.938 | 37.9% | 12.1 |
| 12 | 789 | 0.943 | 36.9% | 10.2 |

#### By make (50 or more pairs) (failed then sold)

| group | pairs | median ratio | beat | median months |
|---|---:|---:|---:|---:|
| Chevrolet | 170 | 1.131 | 85.9% | 1.9 |
| Ford | 107 | 1.12 | 79.4% | 1.9 |
| BMW | 108 | 1.112 | 69.4% | 1.7 |
| Mercedes-Benz | 175 | 1.096 | 78.3% | 1.4 |
| Porsche | 158 | 1.08 | 77.8% | 1 |

#### By model (30 or more pairs) (failed then sold)

| group | pairs | median ratio | beat | median months |
|---|---:|---:|---:|---:|
| Mercedes-Benz SL-Class | 45 | 1.164 | 88.9% | 1.1 |
| Chevrolet Corvette | 67 | 1.114 | 88.1% | 1.6 |
| Ford Mustang | 39 | 1.1 | 87.2% | 1.5 |
| Porsche Cayenne | 31 | 1.01 | 61.3% | 1.1 |

#### By decade of the car (failed then sold)

| group | pairs | median ratio | beat | median months |
|---|---:|---:|---:|---:|
| 1960s | 125 | 1.135 | 77.6% | 2.3 |
| 1970s | 97 | 1.137 | 82.5% | 2 |
| 1980s | 114 | 1.156 | 82.5% | 2.2 |
| 1990s | 178 | 1.122 | 74.2% | 2 |
| 2000s | 268 | 1.086 | 76.5% | 1.1 |
| 2010s | 330 | 1.09 | 77.3% | 1.2 |
| 2020s | 92 | 1.028 | 64.1% | 1.9 |
| pre 1960 | 20 | 1.125 | 80.0% | 1.7 |

#### By price band of the first result (failed then sold)

| group | pairs | median ratio | beat | median months |
|---|---:|---:|---:|---:|
| under $25k | 553 | 1.149 | 78.5% | 1.3 |
| $25k to $50k | 344 | 1.086 | 78.5% | 1.4 |
| $50k to $100k | 204 | 1.074 | 73.5% | 2.1 |
| $100k to $250k | 92 | 1.074 | 72.8% | 2.3 |
| $250k to $500k | 21 | 1.044 | 61.9% | 3.3 |
| $500k to $1m (under 10) | 6 | 1.138 | 66.7% | 7 |
| over $1m (under 10) | 4 | 0.906 | 0.0% | 2.6 |

#### By months between (failed then sold)

| group | pairs | median ratio | beat | median months |
|---|---:|---:|---:|---:|
| under 3 | 870 | 1.09 | 75.6% | 1 |
| 3 to 6 | 226 | 1.136 | 79.6% | 4.3 |
| 6 to 12 | 124 | 1.14 | 79.0% | 7.9 |
| 12 to 24 (under 10) | 4 | 1.043 | 50.0% | 12.4 |

#### By year and quarter of the second sale (failed then sold)

| group | pairs | median ratio | beat | median months |
|---|---:|---:|---:|---:|
| 2025 Q4 | 120 | 1.116 | 79.2% | 0.7 |
| 2026 Q1 | 235 | 1.087 | 80.4% | 2.1 |
| 2026 Q2 | 319 | 1.11 | 79.6% | 1.6 |
| 2026 Q3 | 356 | 1.11 | 74.2% | 1.8 |
| 2026 Q4 | 194 | 1.08 | 70.1% | 1.8 |

#### By month of year of the second sale (failed then sold)

| group | pairs | median ratio | beat | median months |
|---|---:|---:|---:|---:|
| 01 | 82 | 1.086 | 81.7% | 2.1 |
| 02 | 66 | 1.107 | 80.3% | 2.5 |
| 03 | 87 | 1.071 | 79.3% | 1.5 |
| 04 | 104 | 1.114 | 80.8% | 1.4 |
| 05 | 117 | 1.107 | 79.5% | 1.7 |
| 06 | 98 | 1.113 | 78.6% | 1.8 |
| 07 | 120 | 1.112 | 77.5% | 1.6 |
| 08 | 123 | 1.103 | 70.7% | 1.9 |
| 09 | 113 | 1.098 | 74.3% | 1.7 |
| 10 | 163 | 1.093 | 76.1% | 1.1 |
| 11 | 119 | 1.086 | 69.7% | 0.9 |
| 12 | 32 | 1.114 | 75.0% | 1.1 |

#### Ten most common venue pairs (sold then sold)

| pair | pairs | median ratio | beat | median months |
|---|---:|---:|---:|---:|
| bringatrailer > bringatrailer | 7721 | 0.941 | 36.0% | 12.2 |
| barrettjackson > barrettjackson | 1408 | 0.921 | 37.8% | 12.2 |
| carsandbids > carsandbids | 1329 | 0.915 | 31.5% | 11.9 |
| carsandbids > bringatrailer | 856 | 1.031 | 53.9% | 12.4 |
| bringatrailer > carsandbids | 628 | 0.926 | 36.5% | 9.5 |
| barrettjackson > bringatrailer | 462 | 1.078 | 60.2% | 11.9 |
| bringatrailer > barrettjackson | 275 | 0.989 | 47.6% | 10.2 |
| pcarmarket > bringatrailer | 247 | 1.109 | 68.8% | 20 |
| bonhams > bonhams | 221 | 0.928 | 30.8% | 8.2 |
| rmsothebys > bringatrailer | 143 | 1.216 | 74.1% | 31.4 |

#### Each venue pair split by price band of the first sale (cells of 30 or more pairs)

| pair | band | pairs | median ratio | beat | median months |
|---|---|---:|---:|---:|---:|
| bringatrailer > bringatrailer | under $25k | 3722 | 0.936 | 36.8% | 10.1 |
| bringatrailer > bringatrailer | $25k to $50k | 2152 | 0.93 | 32.7% | 13.4 |
| bringatrailer > bringatrailer | $50k to $100k | 1134 | 0.95 | 37.7% | 14.9 |
| bringatrailer > bringatrailer | $100k to $250k | 591 | 0.965 | 38.1% | 15.5 |
| bringatrailer > bringatrailer | $250k to $500k | 92 | 0.99 | 44.6% | 11.4 |
| barrettjackson > barrettjackson | under $25k | 251 | 0.962 | 45.4% | 10.2 |
| barrettjackson > barrettjackson | $25k to $50k | 361 | 0.974 | 43.5% | 12.1 |
| barrettjackson > barrettjackson | $50k to $100k | 443 | 0.941 | 38.8% | 12.2 |
| barrettjackson > barrettjackson | $100k to $250k | 306 | 0.845 | 25.8% | 18 |
| barrettjackson > barrettjackson | $250k to $500k | 39 | 0.7 | 17.9% | 23.9 |
| carsandbids > carsandbids | under $25k | 965 | 0.931 | 34.8% | 11 |
| carsandbids > carsandbids | $25k to $50k | 259 | 0.885 | 22.8% | 16.1 |
| carsandbids > carsandbids | $50k to $100k | 82 | 0.903 | 22.0% | 10.8 |
| carsandbids > bringatrailer | under $25k | 561 | 1.064 | 57.6% | 11.3 |
| carsandbids > bringatrailer | $25k to $50k | 184 | 0.991 | 49.5% | 15.9 |
| carsandbids > bringatrailer | $50k to $100k | 78 | 0.966 | 39.7% | 11.7 |
| carsandbids > bringatrailer | $100k to $250k | 31 | 0.996 | 48.4% | 15.2 |
| bringatrailer > carsandbids | under $25k | 365 | 0.926 | 39.5% | 7.1 |
| bringatrailer > carsandbids | $25k to $50k | 157 | 0.912 | 28.7% | 14 |
| bringatrailer > carsandbids | $50k to $100k | 83 | 0.934 | 34.9% | 13.7 |
| barrettjackson > bringatrailer | under $25k | 120 | 1.137 | 70.0% | 6.4 |
| barrettjackson > bringatrailer | $25k to $50k | 119 | 1.071 | 58.8% | 14.3 |
| barrettjackson > bringatrailer | $50k to $100k | 127 | 1.029 | 55.1% | 14.6 |
| barrettjackson > bringatrailer | $100k to $250k | 76 | 1.056 | 53.9% | 18.1 |
| bringatrailer > barrettjackson | under $25k | 68 | 0.986 | 50.0% | 8 |
| bringatrailer > barrettjackson | $25k to $50k | 79 | 1.054 | 55.7% | 9.4 |
| bringatrailer > barrettjackson | $50k to $100k | 63 | 1 | 49.2% | 11 |
| bringatrailer > barrettjackson | $100k to $250k | 42 | 0.915 | 38.1% | 13 |
| pcarmarket > bringatrailer | under $25k | 68 | 1.267 | 70.6% | 17.1 |
| pcarmarket > bringatrailer | $25k to $50k | 71 | 1.069 | 66.2% | 20 |
| pcarmarket > bringatrailer | $50k to $100k | 53 | 1.133 | 71.7% | 19.1 |
| pcarmarket > bringatrailer | $100k to $250k | 42 | 1.053 | 66.7% | 27 |
| bonhams > bonhams | under $25k | 40 | 0.909 | 25.0% | 3.1 |
| bonhams > bonhams | $25k to $50k | 36 | 0.99 | 27.8% | 7.9 |
| bonhams > bonhams | $50k to $100k | 70 | 0.985 | 38.6% | 7.2 |
| bonhams > bonhams | $100k to $250k | 45 | 0.853 | 33.3% | 12 |
| rmsothebys > bringatrailer | $50k to $100k | 35 | 1.206 | 77.1% | 25.3 |
| rmsothebys > bringatrailer | $100k to $250k | 41 | 1.167 | 73.2% | 31.4 |

#### Mileage (sold then sold, both sales carry a mileage: 12187 pairs)

| Miles added between the sales | pairs | median ratio | beat | median months |
|---|---:|---:|---:|---:|
| odometer lower at the second sale | 478 | 1.021 | 52.9% | 5.1 |
| under 500 | 5112 | 0.964 | 39.7% | 4.2 |
| 500 to 2,000 | 2578 | 0.966 | 42.6% | 13.5 |
| 2,000 to 10,000 | 3169 | 0.93 | 36.6% | 18.7 |
| over 10,000 | 850 | 0.825 | 22.5% | 27.4 |

| Mileage at the second sale | pairs | median ratio | beat | median months |
|---|---:|---:|---:|---:|
| under 5,000 | 937 | 0.962 | 37.6% | 12 |
| 5,000 to 20,000 | 1601 | 0.966 | 40.5% | 13.2 |
| 20,000 to 50,000 | 2987 | 0.949 | 39.0% | 12 |
| 50,000 to 100,000 | 4206 | 0.946 | 38.1% | 11.5 |
| over 100,000 | 2456 | 0.94 | 39.1% | 11.4 |

#### The 25 largest gains (cars over $50k at the first sale; 4606 such pairs)

| year | make | model | first sale | second sale | months | miles first / second | ratio |
|---|---|---|---|---|---:|---|---:|
| 1990 | Porsche | 964 | pcarmarket 2021-07-29 $75,000 | gooding 2025-08-16 $1,350,000 | 48.6 | 67253 / none | 18.00 |
| 1989 | Porsche | 964 | bringatrailer 2023-04-03 $94,500 | bringatrailer 2026-08-07 $1,661,000 | 40.1 | 79000 / 123 | 17.58 |
| 1991 | Lamborghini | Diablo | rmsothebys 2020-03-28 $60,893 | bringatrailer 2022-11-03 $250,000 | 31.2 | none / 38000 | 4.11 |
| 1990 | Porsche | 964 | bringatrailer 2023-04-05 $150,000 | bringatrailer 2025-07-11 $583,000 | 27.2 | 40000 / 42000 | 3.89 |
| 1993 | Ferrari | 348 | bringatrailer 2022-06-25 $82,000 | bringatrailer 2026-10-07 $299,000 | 51.4 | 44000 / 44000 | 3.65 |
| 1963 | Chevrolet | CORVETTE 327/360 | bonhams 2017-08-18 $277,273 | barrettjackson 2026-01-24 $1,000,000 | 101.2 | 25 / none | 3.61 |
| 1962 | Chevrolet | Corvette | bringatrailer 2022-08-16 $155,000 | barrettjackson 2023-01-29 $520,000 | 5.5 | 10000 / none | 3.35 |
| 1997 | Toyota | Supra | rmsothebys 2021-05-26 $68,750 | bringatrailer 2022-07-25 $230,000 | 14.0 | none / 53000 | 3.35 |
| 2009 | Ferrari | 430 | bonhams 2019-08-16 $241,071 | bringatrailer 2026-09-02 $760,000 | 84.6 | 8000 / 12000 | 3.15 |
| 1967 | Ford | Mustang | barrettjackson 2022-01-29 $110,000 | barrettjackson 2026-06-27 $325,000 | 52.9 | none / none | 2.95 |
| 1971 | Chevrolet | Blazer | barrettjackson 2023-01-30 $67,000 | barrettjackson 2024-04-20 $192,000 | 14.7 | none / none | 2.87 |
| 1992 | Porsche | 968 | rmsothebys 2020-03-07 $57,500 | bringatrailer 2022-03-22 $164,000 | 24.5 | none / 8000 | 2.85 |
| 2004 | Ferrari | 360 | rmsothebys 2025-10-11 $265,909 | bringatrailer 2026-05-20 $750,000 | 7.3 | none / 9000 | 2.82 |
| 1995 | Ferrari | 355 | bringatrailer 2025-05-12 $91,500 | bringatrailer 2026-08-06 $245,355 | 14.8 | 26000 / 27000 | 2.68 |
| 1988 | Aston Martin | V8 Volante | bonhams 2020-03-05 $151,786 | bonhams 2024-02-29 $404,545 | 47.8 | none / 4300 | 2.67 |
| 2003 | Ford | Mustang | barrettjackson 2025-04-26 $66,000 | bringatrailer 2026-03-02 $175,067 | 10.2 | none / 14 | 2.65 |
| 2001 | Ferrari | 550 | rmsothebys 2023-08-19 $400,000 | bringatrailer 2026-05-22 $1,052,000 | 33.1 | none / 3400 | 2.63 |
| 1995 | Ferrari | F50 | gooding 2022-08-20 $4,200,000 | rmsothebys 2026-08-15 $11,000,000 | 47.8 | none / none | 2.62 |
| 1988 | Chevrolet | Corvette | barrettjackson 2025-10-18 $100,000 | barrettjackson 2026-04-17 $259,091 | 5.9 | none / none | 2.59 |
| 1989 | Lamborghini | LM002 | rmsothebys 2020-08-15 $245,536 | rmsothebys 2024-08-17 $635,000 | 48.1 | none / none | 2.59 |
| 1995 | Ferrari | 355 | bonhams 2018-01-18 $64,821 | pcarmarket 2021-06-23 $165,000 | 41.1 | 13950 / 15071 | 2.55 |
| 1998 | Ferrari | 355 | bonhams 2017-08-18 $58,929 | gooding 2023-03-02 $150,000 | 66.4 | 14161 / none | 2.55 |
| 1998 | Ferrari | 550 Maranello | bonhams 2019-03-07 $70,000 | bringatrailer 2026-04-24 $177,000 | 85.6 | 31250 / 33000 | 2.53 |
| 1971 | Chevrolet | Blazer | bringatrailer 2022-06-12 $51,500 | barrettjackson 2026-01-23 $130,000 | 43.4 | 70000 / none | 2.52 |
| 1995 | Aston Martin | Vantage | bonhams 2022-08-19 $90,000 | bringatrailer 2026-04-01 $226,000 | 43.4 | 8031 / 10000 | 2.51 |

#### The 25 largest losses

| year | make | model | first sale | second sale | months | miles first / second | ratio |
|---|---|---|---|---|---:|---|---:|
| 1994 | Lamborghini | Diablo VT | bonhams 2022-08-19 $1,900,000 | bonhams 2022-09-30 $220,000 | 1.4 | 322 / 322 | 0.12 |
| 2003 | Volkswagen | Eurovan | carsandbids 2020-08-25 $67,001 | carsandbids 2020-09-02 $8,461 | 0.3 | 185600 / 185600 | 0.13 |
| 2022 | Karma | GS-6 Sport “Mr | barrettjackson 2022-01-30 $636,364 | bringatrailer 2022-10-24 $119,805 | 8.8 | none / 65 | 0.19 |
| 1988 | Chevrolet | Corvette | barrettjackson 2025-01-24 $481,818 | barrettjackson 2025-10-18 $100,000 | 8.8 | none / none | 0.21 |
| 2006 | Hummer | H1 | barrettjackson 2022-01-30 $625,000 | barrettjackson 2025-01-25 $135,000 | 35.8 | none / none | 0.22 |
| 2010 | Chevrolet | Camaro | barrettjackson 2022-10-21 $227,273 | bringatrailer 2024-05-17 $50,001 | 18.9 | none / 158 | 0.22 |
| 1962 | Chevrolet | Corvette | barrettjackson 2023-01-29 $520,000 | barrettjackson 2024-01-28 $150,000 | 12.0 | none / none | 0.29 |
| 2007 | Bentley | Continental GT | barrettjackson 2022-01-28 $115,000 | barrettjackson 2024-01-28 $35,000 | 24.0 | none / none | 0.30 |
| 1974 | Dodge | Challenger | barrettjackson 2023-01-26 $170,000 | barrettjackson 2026-01-23 $55,000 | 35.9 | none / none | 0.32 |
| 1981 | Chevrolet | Camaro | barrettjackson 2023-01-26 $98,000 | barrettjackson 2026-01-23 $32,000 | 35.9 | none / none | 0.33 |
| 1979 | Jeep | CJ-5 | barrettjackson 2022-01-30 $55,000 | barrettjackson 2024-01-24 $18,000 | 23.8 | none / none | 0.33 |
| 2021 | Ford | Bronco | barrettjackson 2022-01-28 $120,000 | barrettjackson 2025-01-24 $41,000 | 35.9 | none / none | 0.34 |
| 1964 | Chevrolet | Corvette Convertible | barrettjackson 2023-01-27 $225,000 | mecum 2026-05-15 $77,000 | 39.6 | none / none | 0.34 |
| 2018 | Mercedes-Benz | S-Class | carsandbids 2021-07-09 $68,533 | carsandbids 2026-01-06 $23,750 | 53.9 | 35600 / 114100 | 0.35 |
| 1952 | Mercedes-Benz | 220 Cabriolet A | rmsothebys 2022-09-24 $220,982 | broadarrow 2025-08-14 $80,000 | 34.7 | none / 459 | 0.36 |
| 1987 | Jeep | GRAND WAGONEER | bringatrailer 2022-04-02 $52,000 | barrettjackson 2024-01-25 $19,000 | 21.8 | 99000 / none | 0.37 |
| 1985 | Rolls-Royce | Silver Spur Centenary Limousine | bonhams 2018-09-08 $88,348 | bonhams 2018-12-03 $33,130 | 2.8 | none / none | 0.37 |
| 1972 | Chevrolet | El Camino | barrettjackson 2024-10-11 $100,000 | barrettjackson 2025-10-17 $39,000 | 12.2 | none / none | 0.39 |
| 1974 | Ford | Bronco | barrettjackson 2022-10-22 $190,000 | barrettjackson 2024-01-27 $75,000 | 15.2 | none / none | 0.39 |
| 2017 | Carrozzeria | Touring Superleggera Sciàdipersia Coupé | bonhams 2021-03-10 $356,870 | bonhams 2022-11-18 $140,870 | 20.3 | 11500 / 11500 | 0.39 |
| 1972 | Chevrolet | BLAZER K5 | barrettjackson 2023-01-28 $175,000 | barrettjackson 2025-01-24 $70,000 | 23.9 | none / none | 0.40 |
| 1968 | Chevrolet | Corvette | barrettjackson 2021-03-27 $195,000 | barrettjackson 2021-09-18 $80,000 | 5.7 | none / none | 0.41 |
| 1964 | Lincoln | Continental | barrettjackson 2025-01-24 $300,000 | barrettjackson 2025-04-26 $125,000 | 3.0 | none / none | 0.42 |
| 2018 | Toyota | 4Runner | barrettjackson 2021-06-18 $67,000 | barrettjackson 2026-01-22 $28,000 | 55.2 | none / none | 0.42 |
| 1963 | Chevrolet | Corvette | barrettjackson 2023-01-29 $497,000 | barrettjackson 2024-01-28 $210,000 | 12.0 | none / none | 0.42 |

#### Failed then sold: back to the same venue or moved (venue of the failed lot known for 1224 of 1224)

| | pairs | median ratio to the refused bid | sold above it | median months |
|---|---:|---:|---:|---:|
| same venue | 727 | 1.086 | 74.1% | 1.6 |
| moved | 497 | 1.132 | 80.3% | 1.5 |
## Third and later appearances (10)

**1,501 cars appeared three or more times; they hold 1,480 pairs where the third (or later) result follows an earlier one: median ratio 0.995, 46.6% beat, median 8.5 months.**

| | pairs | median ratio | beat | median months |
|---|---:|---:|---:|---:|
| third or later sale after a sale | 1,308 | 0.971 | 42.7% | 10.2 |
| third or later sale after a failed bid | 172 | 1.092 | 76.2% | 2.2 |

So the third sale did what the second did: a car that sold again lost the same few percent (0.971 against 0.957 for second sales), and a car that failed and sold again beat its bid about as often as a second time failure did (76.2% against 76.6%).

## The ten most defensible sentences for an article

1. Of 15,734 cars that sold at auction twice in our records, 41.0% sold for more the second time, and the median second price was 95.7% of the first, a median 12.2 months later.
2. Of 1,224 cars that failed to meet their reserve and then sold, 76.6% sold above the high bid they had refused, at a median 110.4% of that bid, a median 1.6 months later.
3. The dearer the car, the better the repeat held up: cars first sold for $250,000 to $500,000 came back at a median 100.0% of the first price (385 pairs, 48.8% beat), against 95.2% under $25,000 (7,089 pairs, 40.9% beat); above $1m 61.1% beat but on only 72 pairs.
4. Newer cars lost the most: of 453 sales of 2020s cars the second time, 29.6% beat the first and the median was 93.8%; for 1980s cars (1,927 pairs) it was 46.0% and 98.1%.
5. Miles added between the sales mattered more than almost anything else: cars that gained over 10,000 miles came back at a median 82.5% with 22.5% beating the first price (850 pairs), against 96.4% and 39.7% for under 500 miles added (5,112 pairs).
6. Waiting did not help: the median ratio was 97.6% for cars back within 3 months (3,071 pairs), fell to 92.4% for 24 to 36 months (2,265 pairs) and was 96.0% over 36 months (1,830 pairs), the one band that recovers.
7. By make, Ferrari held best among those with 50 or more pairs (474 pairs, median 104.5%, 59.1% beat), Porsche was level (1,901 pairs, 100.3%, 50.3%), and Mercedes-Benz (2,139 pairs, 93.2%, 38.1%) and BMW (1,644 pairs, 95.1%, 38.7%) lost.
8. Moving venue paid more than staying: a car that went from Cars & Bids to Bring a Trailer beat its first price 53.9% of the time (856 pairs, median 103.1%), against 36.0% for Bring a Trailer to Bring a Trailer (7,721 pairs, 94.1%); RM Sotheby's to Bring a Trailer beat 74.1% (143 pairs, 121.6%).
9. The market's mood shows in the quarter of the second sale: 2024 Q3 was the weakest (873 pairs, 31.6% beat, median 91.6%) and 2026 Q3 the highest quarter since 2023 Q1 (1,355 pairs, 48.5% beat, 99.8%).
10. A third sale behaved like a second: 1,308 third or later sales after a sale came back at a median 97.1% with 42.7% beating the earlier one, and 172 after a failed bid sold above it 76.2% of the time.

## What could be selection (a car that comes back is not a random car)

- **Every sold then sold figure is for cars that returned.** A car that comes back within weeks is often one whose buyer backed out, a flip, or a car relisted after a poor result; the under 3 months band (3,071 pairs) and the same venue bands are the most exposed (sentence 6, 8).
- **Failed then sold is selection by construction (sentences 2, 10).** Only cars that eventually sold are in it; a car that failed and never sold, or sold elsewhere under a VIN we do not hold, is missing. A reserve not met bid is below the reserve, so beating it is expected; this measures what the next buyer paid against the bid, not what the car was worth. It is also seen on one attempt per car.
- **Price band and miles (sentences 3, 5) are partly mechanical.** A first price that happened to be low or high regresses; cars bought cheap and resold gain, cars bought at a peak lose (regression to the mean). Miles added also grows with time between, and the over 10,000 miles band holds the longest gaps.
- **Decade and make (4, 7)** mix what the owner did with the car, what the model did in the market over the window, and who tends to flip it (dealer stock). The 2020s cell has the shortest gap (median 10.2 months), so it may hold more quick resales; not tested.
- **Venue pairs (8)** compare cars that moved to a better selling room with cars that stayed because they were not moved for a reason; the house venues sell at a premium the hammer backs out, but only where the engine's house rule applies.
- **Calendar (9)** counts only pairs whose second sale is in the quarter; the later quarters are filled with cars whose first sale was in a weaker earlier year, so the quarter's ratio carries the first sale's year as well.
- **Coverage.** 91,061 of 301,374 sold rows (30%) carry no usable VIN, concentrated in older cars and some houses; the repeat share is for cars with a VIN. Venues we do not hold are absent.

Rule: pages and emails compute nothing, everything comes from oneEngineAnswer.
Class fix: not applicable, no code changed.

Search check: no public page touched.
