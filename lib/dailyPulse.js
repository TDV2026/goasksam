// Today's Market daily pulse: three trend-only cards, refreshed nightly by
// scripts/refreshDailyPulse.js from the two most recent days of closed sales in
// sales_archive (zero OldCarsData calls). TRENDS ONLY, never absolute numbers;
// observation copy only, no advice verbs, no dashes. Thin data never produces a
// trend: it renders the honest quiet state instead.
//
// Rendering reads only lib/dailyPulse.json (served via /api/dailyPulse).

export const PULSE_MIN_OVERALL = 30;   // per day, cards 1 + 2
export const PULSE_MIN_PER_MAKE = 5;   // per make per day, card 3
export const PULSE_MIN_MAKES = 3;      // qualifying makes needed, card 3

const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const prices = rows => rows.map(r => Number(r.sale_price)).filter(n => Number.isFinite(n) && n > 0);
const bids = rows => rows.map(r => Number(r.bids)).filter(n => Number.isFinite(n) && n >= 0);
const pct = (now, prev) => (prev > 0 ? Math.round((now - prev) / prev * 100) : 0);

// "Up 3% on the previous day" / "Down 8% on the previous day" / the flat state.
function dayTrendLine(p) {
  if (p > 0) return `Up ${p}% on the previous day`;
  if (p < 0) return `Down ${Math.abs(p)}% on the previous day`;
  return "Unchanged from the previous day";
}
// "+5%" / "-3%" / "flat" for the per-make category line.
function makeTrendChip(p) {
  if (p > 0) return `+${p}%`;
  if (p < 0) return `${p}%`;
  return "flat";
}
const QUIET = "Quiet day in the market";

// Pure computation (unit-tested). yesterday / prior are arrays of closed-sale
// rows: { make, sale_price, bids }. Returns { generated_date, cards: [...] }.
export function computeDailyPulse(yesterday, prior, generatedDate) {
  const Y = yesterday || [], P = prior || [];
  const thinOverall = Y.length < PULSE_MIN_OVERALL || P.length < PULSE_MIN_OVERALL;

  // Card 1: average transaction price, yesterday vs prior.
  let card1;
  if (thinOverall) {
    card1 = { id: "avg_price", title: "Average Transaction Price", state: "quiet", line: QUIET };
  } else {
    const p = pct(mean(prices(Y)), mean(prices(P)));
    card1 = { id: "avg_price", title: "Average Transaction Price", state: "trend", dir: p > 0 ? "up" : p < 0 ? "down" : "flat", pct: p, line: dayTrendLine(p) };
  }

  // Card 2: bid momentum (average bids per auction), yesterday vs prior.
  let card2;
  const yb = bids(Y), pb = bids(P);
  if (thinOverall || yb.length < PULSE_MIN_OVERALL || pb.length < PULSE_MIN_OVERALL) {
    card2 = { id: "bid_momentum", title: "Bid Momentum", state: "quiet", line: QUIET };
  } else {
    const p = pct(mean(yb), mean(pb));
    card2 = { id: "bid_momentum", title: "Bid Momentum", state: "trend", dir: p > 0 ? "up" : p < 0 ? "down" : "flat", pct: p, line: dayTrendLine(p) };
  }

  // Card 3: category strength - top 3 makes by yesterday's sold volume, each
  // with its average-price trend vs the prior day. A make needs 5+ yesterday to
  // be included; its trend is computed only when the prior day also has 5+ of it
  // (otherwise it reads "flat", never a fabricated move).
  const norm = s => String(s || "").trim();
  const groupByMake = rows => {
    const m = new Map();
    for (const r of rows) { const k = norm(r.make); if (!k) continue; (m.get(k) || m.set(k, []).get(k)).push(r); }
    return m;
  };
  const yByMake = groupByMake(Y), pByMake = groupByMake(P);
  const qualifying = [...yByMake.entries()]
    .filter(([, rows]) => rows.length >= PULSE_MIN_PER_MAKE)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 3);
  let card3;
  if (qualifying.length < PULSE_MIN_MAKES) {
    card3 = { id: "category_strength", title: "Category Strength", state: "quiet", line: QUIET };
  } else {
    const makes = qualifying.map(([make, yr]) => {
      const pr = pByMake.get(make) || [];
      const p = pr.length >= PULSE_MIN_PER_MAKE ? pct(mean(prices(yr)), mean(prices(pr))) : 0;
      return { make, dir: p > 0 ? "up" : p < 0 ? "down" : "flat", pct: p, chip: makeTrendChip(p) };
    });
    card3 = { id: "category_strength", title: "Category Strength", state: "trend", makes, line: makes.map(m => `${m.make} ${m.chip}`).join(", ") };
  }

  return { generated_date: generatedDate || null, cards: [card1, card2, card3] };
}
