// The compact overview card's count lines (Oct 25 2026). The server says them; the page prints them and computes nothing.
// "live": how many live cars MEET THE WHOLE TASK, read from the SAME stored cars the thread below the card draws, each car once (Oct 26 2026).
// The cars are the cards of the Task's match updates (data.cards: only cars the matcher passed on every part of the Task are ever written there),
// plus, for an opening update that still carries its own list, the cars past its first twelve (listing_ids; the thread says "N more match" for them).
// An update the status line has rewritten (data.total 0, data.loose: "Nothing red yet. 31 other cars match the rest.") keeps its old listing_ids
// column, which is NOT a list of matches any more: it is never read. The near misses are never stored as cars, only as a count in data.loose.count,
// so the card reports them as a count ("31 close ones") and never as "match". When the caller passes the ids that are still live (the listing rows'
// own end times), a car that has ended is not counted. "liveCount" is that number for the card's own label. "fresh": the unread count.
import { countNoun } from "../countNoun.js";
export function matchCarIds(t) {
  const ids = [];
  for (const u of (t && t.updates) || []) {
    if (!u || u.role !== "sam" || u.kind !== "match" || !u.data) continue;
    const d = u.data, cards = Array.isArray(d.cards) ? d.cards : [];
    const from = cards.map(c => c && c.id);
    // the opening list: only when the update still holds its own matches (cards present and its total is the length of its listing_ids)
    if (d.opening && cards.length && Array.isArray(u.listing_ids) && Number(d.total) === u.listing_ids.length) from.push(...u.listing_ids);
    for (const x of from) { const id = Number(x); if (Number.isFinite(id) && !ids.includes(id)) ids.push(id); }
  }
  return ids;
}
// A count of cars the person cannot open is a broken promise (Oct 29 2026): the near misses are stored as a number only, so no line may state it. Older stored
// status lines still carry "N other cars match the rest."; this takes that sentence out when they are read.
export const withoutRestCount = text => typeof text === "string" ? text.replace(/ ?(?:One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|\d[\d,]*) other cars? match(?:es)? the rest\./i, " Sam is watching.").replace(/\s+/g, " ").trim() : text;
export function closeCount(t) {
  const ups = (t && t.updates) || [];
  for (let i = ups.length - 1; i >= 0; i--) {
    const u = ups[i];
    if (u && u.role === "sam" && u.kind === "match" && u.data && u.data.loose && Number.isFinite(Number(u.data.loose.count))) return Number(u.data.loose.count);
  }
  return 0;
}
export function overviewFacts(t, liveIds) {
  const ids = matchCarIds(t);
  const ups = (t && t.updates) || [];
  const anyRead = ups.some(u => u && u.role === "sam" && u.kind === "match" && u.data);
  const total = ids.length ? (liveIds ? ids.filter(id => liveIds.has(id)).length : ids.length) : anyRead ? 0 : null;
  const n = Number(t && t.unread) || 0;
  const none = ids.length ? "No live cars match right now" : "No live cars match yet";
  // every count on the Tasks page is joined to its noun by the shared helper (lib/countNoun.js): one to ten as words, 11 and up as digits (Oct 28 2026)
  const live = total === null ? null : total === 0 ? none : `${countNoun(total, "live car", { many: "live cars", cap: true })} ${total === 1 ? "matches" : "match"}`;
  const c = total === 0 ? closeCount(t) : 0;
  return { live, liveCount: total || 0, close: null, closeCount: c, cars: total ? countNoun(total, "car") : null, fresh: n > 0 ? `${n} new` : null };
}
