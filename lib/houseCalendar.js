// Curated auction-house calendar for the six houses (Sep 2026, house-comparison build).
//
// PURPOSE: (1) infer the auction ROOM for a sold record when the data does not carry it (house +
// sale month -> event, shown as a SECOND fact, never merged into the sale claim); (2) tell a seller
// the NEXT sale at a house, its city + month, and the approximate consignment window.
//
// ACCURACY / HONESTY (locked, read before editing):
//  - This is curated to the CITY + TYPICAL MONTH from the houses' published annual schedules. Exact
//    dates shift year to year; only the month + city are treated as stable, and even those must be
//    refreshed each season. Never render an exact future date from this file.
//  - Every consignment window is APPROXIMATE and must be deferred to the house ("confirm with {house}").
//  - Rooms are only STATED as fact when the record's own data carries them (see eventFromRecord);
//    otherwise the calendar supplies an INFERRED room, which the copy must present as a separate,
//    hedged fact ("{House}'s {month} sale is typically {city}").
//
// SOURCES (cited per the build brief):
//  - Umbrella 2026 calendar: Motor Sport Magazine, "Global collector car auctions 2026" (May 2026)
//    https://www.motorsportmagazine.com/archive/article/may-2026/121/global-collector-car-auctions-2026-key-dates-from-rm-sothebys-to-bonhams/
//  - RM Sotheby's Miami / ModaMiami: https://rmsothebys.com/auctions/mi26/ + the "Miami Car Week 2026"
//    press release (ModaMiami returns last week of February 2027).
//  - House schedule pages (canonical, for the established Jan fixtures the May article predates):
//    rmsothebys.com/upcoming, goodingchristies.com, cars.bonhams.com, broadarrowauctions.com,
//    barrett-jackson.com/events, mecum.com/auctions.
// Refresh cadence: re-verify each Jan against the six schedule pages; treat anything unverified as stale.

// month: 1-12 (typical month). city: where the sale is held. intl:true = outside the US.
// consignWeeksBefore: APPROXIMATE weeks before the sale that major consignments typically close.
export const HOUSE_CALENDAR = {
  rmsothebys: {
    display: "RM Sotheby's",
    source: "rmsothebys.com/upcoming + Motor Sport 2026 calendar",
    events: [
      { name: "Arizona", city: "Phoenix", month: 1, consignWeeksBefore: 8 },
      { name: "ModaMiami", city: "Miami", month: 2, consignWeeksBefore: 8, note: "RM's Miami Car Week sale" },
      { name: "Monaco", city: "Monaco", month: 4, intl: true, consignWeeksBefore: 8 },
      { name: "Monterey", city: "Monterey", month: 8, consignWeeksBefore: 8 },
      { name: "London", city: "London", month: 11, intl: true, consignWeeksBefore: 8 }
    ]
  },
  gooding: {
    display: "Gooding Christie's",
    source: "goodingchristies.com + Motor Sport 2026 calendar",
    events: [
      { name: "Scottsdale", city: "Scottsdale", month: 1, consignWeeksBefore: 8 },
      { name: "Amelia Island", city: "Amelia Island", month: 3, consignWeeksBefore: 6 },
      { name: "Pebble Beach", city: "Pebble Beach", month: 8, consignWeeksBefore: 8 },
      { name: "London", city: "London", month: 9, intl: true, consignWeeksBefore: 6 },
      { name: "Retromobile New York", city: "New York", month: 11, consignWeeksBefore: 6 }
    ]
  },
  bonhams: {
    display: "Bonhams",
    source: "cars.bonhams.com + Motor Sport 2026 calendar",
    events: [
      { name: "Scottsdale", city: "Scottsdale", month: 1, consignWeeksBefore: 8 },
      { name: "Paris", city: "Paris", month: 2, intl: true, consignWeeksBefore: 8 },
      { name: "Amelia Island", city: "Amelia Island", month: 3, consignWeeksBefore: 6 },
      { name: "Miami", city: "Miami", month: 5, consignWeeksBefore: 6 },
      { name: "The Quail, Laguna Seca", city: "Carmel", month: 8, consignWeeksBefore: 8, dataCity: "Salinas" },
      { name: "Goodwood Revival", city: "Chichester", month: 9, intl: true, consignWeeksBefore: 6 }
    ]
  },
  broadarrow: {
    display: "Broad Arrow",
    source: "broadarrowauctions.com + Motor Sport 2026 calendar",
    events: [
      { name: "Scottsdale", city: "Scottsdale", month: 1, consignWeeksBefore: 8 },
      { name: "Amelia Island", city: "Amelia Island", month: 3, consignWeeksBefore: 6 },
      { name: "Porsche Air|Water", city: "Costa Mesa", month: 4, consignWeeksBefore: 6, note: "Porsche-focused sale" },
      { name: "The Quail", city: "Carmel", month: 8, consignWeeksBefore: 8 }
    ]
  },
  barrettjackson: {
    display: "Barrett-Jackson",
    source: "barrett-jackson.com/events + Motor Sport 2026 calendar",
    events: [
      { name: "Scottsdale", city: "Scottsdale", month: 1, consignWeeksBefore: 6 },
      { name: "Palm Beach", city: "Palm Beach", month: 4, consignWeeksBefore: 6 },
      { name: "Columbus", city: "Columbus", month: 6, consignWeeksBefore: 6 },
      { name: "Las Vegas", city: "Las Vegas", month: 9, consignWeeksBefore: 6 }
    ]
  },
  mecum: {
    display: "Mecum",
    source: "mecum.com/auctions + Motor Sport 2026 calendar",
    events: [
      { name: "Kissimmee", city: "Kissimmee", month: 1, consignWeeksBefore: 6 },
      { name: "Glendale", city: "Glendale", month: 3, consignWeeksBefore: 6 },
      { name: "Houston", city: "Houston", month: 4, consignWeeksBefore: 6 },
      { name: "Indy", city: "Indianapolis", month: 5, consignWeeksBefore: 6 },
      { name: "Monterey", city: "Monterey", month: 8, consignWeeksBefore: 6 },
      { name: "Las Vegas", city: "Las Vegas", month: 11, consignWeeksBefore: 6 }
    ]
  }
};

const MONTHS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export function houseDisplay(slug) { return (HOUSE_CALENDAR[slug] || {}).display || null; }
export function houseCalendarSource(slug) { return (HOUSE_CALENDAR[slug] || {}).source || null; }

// DATA-CARRIED event (stated as ONE fact when present): RM/Bonhams populate `city` with the sale
// location; Barrett-Jackson's listing URL path carries a human-readable event ("/2026-las-vegas/").
// Returns { room, source:"data" } or null. Gooding/Broad Arrow/Mecum carry neither -> null (the
// caller falls back to roomForHouseMonth as an INFERRED, hedged second fact).
export function eventFromRecord(rec) {
  if (!rec) return null;
  const slug = String(rec.slug || rec.source || "").toLowerCase();
  const city = rec.city && String(rec.city).trim();
  if (city && (slug === "rmsothebys" || slug === "bonhams")) {
    // Bonhams files its Monterey-week sale under the county town "Salinas"; name it as Carmel/Quail.
    const cal = HOUSE_CALENDAR[slug];
    const byDataCity = cal && cal.events.find(e => e.dataCity && e.dataCity.toLowerCase() === city.toLowerCase());
    return { room: byDataCity ? byDataCity.city : city, source: "data" };
  }
  const url = String(rec.url || "");
  if (slug === "barrettjackson") {
    const m = url.match(/barrett-jackson\.com\/([0-9]{4}-[a-z-]+)\//i);
    if (m) { const seg = m[1].replace(/^[0-9]{4}-/, "").replace(/-/g, " "); return { room: seg.replace(/\b[a-z]/g, c => c.toUpperCase()), source: "data" }; }
  }
  return null;
}

// INFERRED room from house + sale month (the SECOND, hedged fact when the data lacks it). Returns
// { room, month, source:"inferred" } or null. Never merge this into the sale claim.
export function roomForHouseMonth(slug, monthNum) {
  const cal = HOUSE_CALENDAR[slug]; if (!cal || !monthNum) return null;
  const e = cal.events.find(ev => ev.month === Number(monthNum));
  return e ? { room: e.city, event: e.name, month: monthNum, source: "inferred" } : null;
}

// NEXT sale at a house relative to today: the soonest upcoming event (cycling into next year).
// Returns { event, city, month, monthName, year, consignWeeksBefore, consignApprox, intl, source }.
export function nextSaleForHouse(slug, todayISO) {
  const cal = HOUSE_CALENDAR[slug]; if (!cal || !cal.events.length) return null;
  const today = new Date(todayISO || Date.now());
  const y = today.getUTCFullYear(), m = today.getUTCMonth() + 1;
  // Prefer a US event for a US seller's practicality, but include all; nearest-future by month.
  const scored = cal.events.map(e => {
    let dy = y, dm = e.month;
    // If this month is already past (or is this month), roll to next year.
    if (e.month < m || (e.month === m)) dy = y + 1;
    return { ...e, year: dy, monthsAway: (dy - y) * 12 + (e.month - m) };
  }).sort((a, b) => a.monthsAway - b.monthsAway);
  const n = scored[0];
  return {
    event: n.name, city: n.city, month: n.month, monthName: MONTHS[n.month], year: n.year,
    intl: !!n.intl, consignWeeksBefore: n.consignWeeksBefore,
    // Approximate consignment close, always deferred to the house.
    consignApprox: `consignments typically close about ${n.consignWeeksBefore} weeks before the sale, so around ${MONTHS[((n.month - 2 + 12) % 12) + 1]}; confirm with ${cal.display}`,
    source: cal.source
  };
}
