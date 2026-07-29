// Unit tests for the daily-pulse computation (pure) + the rendered lines.
import { computeDailyPulse, PULSE_MIN_OVERALL } from "../lib/dailyPulse.js";

let failures = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  ->  " + detail}`); if (!ok) failures++; };

const rows = (n, make, price, bidCount) => Array.from({ length: n }, () => ({ make, sale_price: price, bids: bidCount }));

// --- Healthy two-day dataset (both days >= 30 overall) ---
// Yesterday: 20 Porsche @ $110k (8 bids), 10 Ford @ $60k (10 bids), 6 BMW @ $50k (12 bids) = 36.
// Prior:     20 Porsche @ $100k (10 bids), 10 Ford @ $60k (12 bids), 6 BMW @ $52k (12 bids) = 36.
const Y = [...rows(20, "Porsche", 110000, 8), ...rows(10, "Ford", 60000, 10), ...rows(6, "BMW", 50000, 12)];
const P = [...rows(20, "Porsche", 100000, 10), ...rows(10, "Ford", 60000, 12), ...rows(6, "BMW", 52000, 12)];
const pulse = computeDailyPulse(Y, P, "2026-07-23");
const [c1, c2, c3] = pulse.cards;

// Card 1: overall avg yesterday vs prior. Y avg = (20*110k+10*60k+6*50k)/36 = 2,900,000/36 = 80,555.
// P avg = (20*100k+10*60k+6*52k)/36 = 2,912,000/36 = 80,888. pct = round(-0.4%) = 0 -> unchanged.
check("card 1: computes an overall average-price trend (not quiet) on healthy data", c1.state === "trend", JSON.stringify(c1));
check("card 1: trend line reads as an observation on the previous day", /on the previous day|Unchanged/.test(c1.line), c1.line);

// Card 2: avg bids yesterday vs prior. Y bids avg = (20*8+10*10+6*12)/36 = 332/36 = 9.22.
// P bids avg = (20*10+10*12+6*12)/36 = 392/36 = 10.89. pct = round(-15%) = Down 15%.
check("card 2: bid momentum computes a down trend", c2.state === "trend" && c2.dir === "down" && /Down \d+% on the previous day/.test(c2.line), JSON.stringify(c2));

// Card 3: top 3 makes by yesterday volume = Porsche(20), Ford(10), BMW(6).
// Porsche +10% (110k vs 100k), Ford flat (60k vs 60k), BMW -4% (50k vs 52k).
check("card 3: top 3 makes by yesterday volume, in order", c3.state === "trend" && c3.makes.map(m => m.make).join(",") === "Porsche,Ford,BMW", JSON.stringify(c3.makes));
check("card 3: per-make trends are correct (+10% / flat / -4%)", c3.makes[0].chip === "+10%" && c3.makes[1].chip === "flat" && c3.makes[2].chip === "-4%", JSON.stringify(c3.makes.map(m => [m.make, m.chip])));
check("card 3: line reads 'Porsche +10%, Ford flat, BMW -4%'", c3.line === "Porsche +10%, Ford flat, BMW -4%", c3.line);

// --- Quiet gate: either day < 30 overall -> cards 1 & 2 quiet ---
const thin = computeDailyPulse(rows(10, "Porsche", 100000, 5), P, "2026-07-23");
check("quiet gate: fewer than 30 sales on a day -> card 1 quiet", thin.cards[0].state === "quiet" && thin.cards[0].line === "Quiet day in the market", JSON.stringify(thin.cards[0]));
check("quiet gate: fewer than 30 sales on a day -> card 2 quiet", thin.cards[1].state === "quiet", JSON.stringify(thin.cards[1]));

// --- Per-make gate: a make with < 5 yesterday is excluded; < 3 qualifying -> quiet ---
const Yfew = [...rows(20, "Porsche", 110000, 8), ...rows(6, "Ford", 60000, 10), ...rows(4, "BMW", 50000, 12), ...rows(4, "Audi", 40000, 9)]; // only Porsche + Ford qualify (>=5)
const Pfew = [...rows(20, "Porsche", 100000, 8), ...rows(6, "Ford", 60000, 10), ...rows(4, "BMW", 52000, 12), ...rows(4, "Audi", 41000, 9)];
const cat = computeDailyPulse(Yfew, Pfew, "2026-07-23").cards[2];
check("per-make gate: fewer than 3 makes with 5+ sales -> category strength quiet", cat.state === "quiet" && cat.line === "Quiet day in the market", JSON.stringify(cat));

// --- No dashes anywhere in the rendered lines ---
const allLines = [...pulse.cards, ...thin.cards, cat].map(c => c.line).join(" ");
check("no en/em dashes in any rendered pulse line", !/[–—]/.test(allLines), allLines);
// --- No advice verbs in card copy ---
check("card copy is observation only (no advice verbs)", !/\b(buy|sell|list|should|recommend|consider)\b/i.test(allLines), allLines);

console.log(`\nGates: ${PULSE_MIN_OVERALL} overall/day, 5 per make/day, 3 makes.`);
console.log(failures ? `\n${failures} FAILURE(S)` : "\nDAILY-PULSE-UNIT ALL PASS");
process.exit(failures ? 1 : 0);
