// The compact overview card's count lines (Oct 25 2026). The server says them; the page prints them and computes nothing.
// "live": how many live cars the Task has, read from the SAME updates the thread below the card draws (Oct 26 2026: the card used to read only the
// opening update's own total, so a Task whose opening read found nothing and whose later check found a car said "No live cars match yet" above a thread
// that listed the car). The cars are every car in the Task's match updates (listing_ids and cards), counted once; when the caller passes the set of ids that are still live
// (the listing rows' own end times), a car that has ended is not counted. "liveCount" is that number for the card's own label. "fresh": the unread count.
export function matchCarIds(t) {
  const ids = [];
  for (const u of (t && t.updates) || []) {
    if (!u || u.role !== "sam" || u.kind !== "match" || !u.data) continue;
    // The opening update lists only its first cars as cards but every matched car in listing_ids, so both are read.
    const from = [...(Array.isArray(u.listing_ids) ? u.listing_ids : []), ...(Array.isArray(u.data.cards) ? u.data.cards.map(c => c && c.id) : [])];
    for (const x of from) { const id = Number(x); if (Number.isFinite(id) && !ids.includes(id)) ids.push(id); }
  }
  return ids;
}
export function overviewFacts(t, liveIds) {
  const ids = matchCarIds(t);
  let total = null;
  if (ids.length) total = liveIds ? ids.filter(id => liveIds.has(id)).length : ids.length;
  else {
    const ups = (t && t.updates) || [];
    for (let i = ups.length - 1; i >= 0; i--) {
      const u = ups[i];
      if (u && u.role === "sam" && u.kind === "match" && u.data && Number.isFinite(Number(u.data.total))) { total = Number(u.data.total); break; }
    }
  }
  const n = Number(t && t.unread) || 0;
  const none = ids.length ? "No live cars match right now" : "No live cars match yet";
  const live = total === null ? null : total === 0 ? none : total === 1 ? "1 live car matches" : `${total.toLocaleString("en-US")} live cars match`;
  return { live, liveCount: total || 0, fresh: n > 0 ? `${n} new` : null };
}
