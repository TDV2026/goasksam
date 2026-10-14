// A stored live bid, by its own time (Oct 2026, Lane C). One rule for every email that prints a live bid (Before it
// ends, the combined Task email, the Keep looking section); Buy and the Tasks page apply the same rule in the browser.
//   fresh    the bid's own time (live_listings.bid_at, the feed's updated_at) is within the last hour: shown as before.
//   old      over an hour old: shown only with its time, "Last bid we saw: $42,000 at 4:12am PT.", never in a sentence
//            that says it is current.
//   untimed  a bid with no bid time: no bid at all. The line saying when bidding ends stays (it comes from the end time).
//   none     no bid.
// The time is the stored bid's own, never the send time, and never last_seen (when we last read the row). Emails have
// no reliable local time, so they name Pacific time. Bids are listing facts: nothing here touches a count or a range.
// The Buy card (Sam, Oct 14 2026) reads every live bid as "Last bid we saw $X at 3:12pm PT" from the same bid_at and zone,
// fresh or old, and an untimed bid as "Bid $X" (api/buy.js bidText).
export const BID_FRESH_MS = 3600e3;
const TZ = "America/Los_Angeles";

export function bidState(bid, bidAt, now = new Date()) {
  if (!(Number(bid) > 0)) return { kind: "none" };
  const t = Date.parse(bidAt || "");
  if (!Number.isFinite(t)) return { kind: "untimed" };
  return { kind: now.getTime() - t <= BID_FRESH_MS ? "fresh" : "old", at: new Date(t) };
}
const dayPT = d => d.toLocaleDateString("en-US", { timeZone: TZ });
// "4:12am PT", or "4:12am PT on Sunday" when the bid is from another day.
export function bidTimePT(at, now = new Date()) {
  const d = new Date(at);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ }).replace(" AM", "am").replace(" PM", "pm");
  return `${time} PT${dayPT(d) === dayPT(now) ? "" : " on " + d.toLocaleDateString("en-US", { weekday: "long", timeZone: TZ })}`;
}
// The whole line for an old bid ("$42,000" already formatted by the caller).
export const lastBidLine = (amount, at, now) => `Last bid we saw: ${amount} at ${bidTimePT(at, now)}.`;
