// Sam Desk — live vs online sale classifier for auction houses (change 2).
// Uniform across every house. OCD carries no explicit online flag, so:
//  - DATA: an explicit online marker in the record (url/title: "online", "geared online",
//    "online only", "open roads") -> online (data); a carried city that matches a live
//    calendar city for that house -> live (data).
//  - INFERRED: otherwise, from lib/houseCalendar.js — a sale in a month the house holds a
//    live flagship event -> live (inferred); else -> online (inferred).
// The label (data|inferred) rides with the value everywhere it is shown, exactly like rooms.
import { isHouseSource, sourceSlugOf } from "../_houseComps.js";
import { HOUSE_CALENDAR } from "../houseCalendar.js";

const ONLINE_RE = /\bonline(?:[\s-]?only)?\b|geared\s?online|open\s?roads?/i;

export function classifySaleType(row) {
  // Online marketplaces (BaT, Cars & Bids, ...) are online sales by nature.
  if (!isHouseSource(row)) return { type: "online", source: "data" };
  const slug = sourceSlugOf(row);
  const blob = `${row.srcurl || ""} ${row.srcurl2 || row.url || ""} ${row.raw_title || row.title || ""}`;
  if (ONLINE_RE.test(blob)) return { type: "online", source: "data" };
  const cal = HOUSE_CALENDAR[slug];
  const events = (cal && cal.events) || [];
  const city = String(row.city || "").toLowerCase().trim();
  if (city && events.some(e => String(e.city || e.dataCity || "").toLowerCase() === city)) return { type: "live", source: "data" };
  const d = row.auction_end_date || row.date;
  const month = d ? (new Date(d).getUTCMonth() + 1) : null;
  const liveMonths = new Set(events.map(e => e.month));
  if (month && liveMonths.has(month)) return { type: "live", source: "inferred" };
  return { type: "online", source: "inferred" };
}
