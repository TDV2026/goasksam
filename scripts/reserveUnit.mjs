// Phase 1.5 unit tests: the reserve-cell computation over a synthetic dataset.
import { computeReserveCells, findReserveContext, reserveBand } from "../lib/reserveContext.js";

let failures = 0;
const check = (name, ok, detail="") => { console.log(`${ok?"PASS":"FAIL"}  ${name}${ok?"":"  ->  "+detail}`); if(!ok)failures++; };

// Bands.
check("bands: 60000 -> $50k to $100k", reserveBand(60000)?.key === "$50k to $100k");
check("bands: 24999 -> under $25k", reserveBand(24999)?.key === "under $25k");
check("bands: 250000 -> $100k and up", reserveBand(250000)?.key === "$100k and up");
check("bands: 0/NaN -> null", reserveBand(0) === null && reserveBand("x") === null);

// A qualifying cell: 12 with-reserve avg 65000, 15 no-reserve avg 60000.
const withR = Array.from({length:12}, () => ({ platform:"Bring a Trailer", make:"Chevrolet", sale_price:65000, has_reserve:true }));
const noR = Array.from({length:15}, () => ({ platform:"Bring a Trailer", make:"Chevrolet", sale_price:60000, has_reserve:false }));
const cells = computeReserveCells([...withR, ...noR], "2026-06");
check("compute: one usable cell for the qualifying group", cells.length === 1, JSON.stringify(cells));
const c = cells[0] || {};
check("compute: averages and delta are correct", c.avg_with_reserve === 65000 && c.avg_no_reserve === 60000 && c.delta_dollars === 5000, JSON.stringify(c));
check("compute: delta_pct correct (~8.3%)", Math.abs(c.delta_pct - 8.3) < 0.2, String(c.delta_pct));
check("compute: n_with / n_without recorded", c.n_with === 12 && c.n_without === 15, `${c.n_with}/${c.n_without}`);
check("compute: data_month recorded", c.data_month === "2026-06");

// Gate: below 10 on either side -> no cell.
const thin = [...Array.from({length:9},()=>({platform:"Bring a Trailer",make:"Ford",sale_price:30000,has_reserve:true})),
  ...Array.from({length:20},()=>({platform:"Bring a Trailer",make:"Ford",sale_price:28000,has_reserve:false}))];
check("gate: 9-vs-20 cell is excluded (<10 on the reserve side)", computeReserveCells(thin, "2026-06").length === 0);

// Missing has_reserve flag -> no cell (platform with unreliable/absent flag).
const noFlag = Array.from({length:40}, (_,i) => ({ platform:"Cars & Bids", make:"Porsche", sale_price:80000, has_reserve: null }));
check("flag: rows with null has_reserve produce no cell", computeReserveCells(noFlag, "2026-06").length === 0);

// Lookup: exact platform + make + band; misses return null (no approximation).
const table = cells;
check("lookup: exact match by slug/make/band", findReserveContext("bringatrailer", "chevrolet", 60000, table) === cells[0]);
check("lookup: wrong band -> null (no approximation)", findReserveContext("bringatrailer", "chevrolet", 20000, table) === null);
check("lookup: wrong make -> null", findReserveContext("bringatrailer", "ford", 60000, table) === null);
check("lookup: wrong platform -> null", findReserveContext("hagerty", "chevrolet", 60000, table) === null);

console.log(failures ? `\n${failures} FAILURE(S)` : "\nRESERVE-UNIT ALL PASS");
process.exit(failures ? 1 : 0);
