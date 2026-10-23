// THE MARKET CHECK LINK OF A CARD (Sam, Oct 23 2026): the engine names, for every live card, the address that opens Market Check on THAT car with no
// question to ask: the full VIN when the listing carries one (Market Check decodes it and finds the exact car), else the car as the engine named it
// (year, make, model; the market read's own query when it has one) plus the trim and the body style the listing states. Pages and emails only print
// this address; they never build one.
const slug = s => String(s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
export function mcUrlOf(r, facts, market) {
  r = r || {}; facts = facts || {};
  const vin = String(r.vin_norm || "").toUpperCase();
  if (/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return "/market-check?vin=" + vin;
  const car = (market && market.query) || [r.year, r.make, r.model].filter(Boolean).join(" ");
  const s = slug(car); if (!s) return null;
  const p = new URLSearchParams({ car: s });
  const trim = String(r.trim || "").trim(); if (trim && !s.includes(slug(trim))) p.set("trim", trim);
  const body = String(facts.body || "").toLowerCase().trim(); if (body && /^[a-z -]{3,20}$/.test(body)) p.set("body", body);
  return "/market-check?" + p.toString();
}
