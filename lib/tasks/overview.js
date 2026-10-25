// The compact overview card's count lines (Oct 25 2026). The server says them; the page prints them and computes nothing.
// "live": how many live cars matched at the Task's latest match read (the engine's own total), "fresh": the unread count.
export function overviewFacts(t) {
  const ups = (t && t.updates) || [];
  let total = null;
  for (let i = ups.length - 1; i >= 0; i--) {
    const u = ups[i];
    if (u && u.role === "sam" && u.kind === "match" && u.data && Number.isFinite(Number(u.data.total))) { total = Number(u.data.total); break; }
  }
  const n = Number(t && t.unread) || 0;
  const live = total === null ? null : total === 0 ? "No live cars match yet" : total === 1 ? "1 live car matches" : `${total.toLocaleString("en-US")} live cars match`;
  return { live, fresh: n > 0 ? `${n} new` : null };
}
