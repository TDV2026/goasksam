// THE HISTORY PAGES CANNOT STARVE SELL (Lane B, lane-b-read-resilience, Nov 18 2026; order bc85 item 6). Crawlers read /history VIN and hub pages cold in bulk (199 of the last 200 page views were /history pages, one VIN each, about one every two seconds,
// 27 of them named AI bots and 170 with no referrer and no named bot): each cold page runs a full engine read of the archive. 42 of the 50 failed archive reads of Nov 18 17:29 to 18:16 PT were History pages. A slot gate caps how many
// COLD engine reads the History pages run at once on one instance (HISTORY_COLD_SLOTS, default 2); a page that finds no slot is the existing reading placeholder (opts.cold.timedOut), which asks again, and starts no read. A stored answer
// never needs a slot. Sell, Market Check and Find are never behind this gate. The cap is per instance: the database is shared, so the cap bounds each instance's share, not the fleet's (the failure line now names its caller, so the
// History share of the load can be counted again).
const slots = new Map();   // name -> { inflight, refused, granted }
export function coldLimit(name) { return name === "history" ? Math.max(1, Math.min(8, Number(process.env.HISTORY_COLD_SLOTS) || 2)) : Number.MAX_SAFE_INTEGER; }
// returns release() or null when no slot is free
export function acquireCold(name) {
  const s = slots.get(name) || slots.set(name, { inflight: 0, refused: 0, granted: 0 }).get(name);
  if (s.inflight >= coldLimit(name)) { s.refused++; return null; }
  s.inflight++; s.granted++;
  let done = false; return () => { if (!done) { done = true; s.inflight = Math.max(0, s.inflight - 1); } };
}
export const coldState = name => { const s = slots.get(name); return s ? { ...s } : { inflight: 0, refused: 0, granted: 0 }; };
export function resetColdGate() { slots.clear(); }
