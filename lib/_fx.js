// Shared FX helper (currency bug fix, part 1). Loads fx_rates (monthly USD-per-unit) once and
// converts a native amount to USD by the sale/attempt MONTH. Used by the ingest (fill sale_price_usd
// / high_bid_usd on the way in) and scripts/backfillUsd.js (fill existing rows). Read paths still use
// the legacy static table in lib/_houseComps.js until part 2 switches them to the *_usd columns.
//
// USD (or a missing currency) is always rate 1. A month outside the table's range clamps to the
// nearest available month for that currency. A currency absent from the table returns null (the
// caller decides: never silently guess a rate).
import { supabaseSelectAll } from "./_supabase.js";

export function makeFx(byCur) {
  return {
    // The USD-per-unit rate for a currency at a date, or null when the currency is unknown.
    rateFor(currency, dateISO) {
      const c = String(currency || "USD").toUpperCase();
      if (c === "USD" || !c) return 1;
      const arr = byCur.get(c);
      if (!arr || !arr.length) return null;
      const m = String(dateISO || "").slice(0, 7);   // YYYY-MM
      if (!m) return arr[arr.length - 1].rate;         // no date: newest
      for (const e of arr) if (e.month === m) return e.rate;   // exact month
      if (m < arr[0].month) return arr[0].rate;                 // before range: clamp earliest
      if (m > arr[arr.length - 1].month) return arr[arr.length - 1].rate; // after range: clamp latest
      let prev = arr[0];                                        // between: closest earlier month
      for (const e of arr) { if (e.month <= m) prev = e; else break; }
      return prev.rate;
    },
    // Native amount -> USD. USD/missing passes through. Unknown currency returns null (never a guess).
    toUsd(amount, currency, dateISO) {
      const n = Number(amount);
      if (!Number.isFinite(n)) return null;
      const c = String(currency || "USD").toUpperCase();
      if (c === "USD" || !c) return n;
      const r = this.rateFor(c, dateISO);
      return r == null ? null : n * r;
    },
    has(currency) { const c = String(currency || "").toUpperCase(); return c === "USD" || byCur.has(c); }
  };
}

// Load fx_rates from Supabase into an in-memory { currency -> [{month,rate}] sorted asc } lookup.
export async function loadFxRates(env) {
  const rows = (await supabaseSelectAll(env, "fx_rates?select=currency,month,usd_per_unit&order=currency.asc,month.asc")) || [];
  const byCur = new Map();
  for (const r of rows) {
    const c = String(r.currency || "").toUpperCase();
    const month = String(r.month || "").slice(0, 7);
    const rate = Number(r.usd_per_unit);
    if (!c || !month || !Number.isFinite(rate) || rate <= 0) continue;
    if (!byCur.has(c)) byCur.set(c, []);
    byCur.get(c).push({ month, rate });
  }
  for (const arr of byCur.values()) arr.sort((a, b) => (a.month < b.month ? -1 : 1));
  return makeFx(byCur);
}
