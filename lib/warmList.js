// WHAT A WARM-UP AFTER A STAMP BUMP REFILLS (Lane B, lane-b-read-resilience, Nov 18 2026; order bc85 item 4). After a bump every stored answer is ignored (the stamp is part of every key), so every car is read cold and the archive's reads fail in
// bursts under the load. The warm-up reads, once, the cars visitors actually read: the most read searches of the last 30 days (analytics search_run events, query_text) and the History hubs most read (page_view rows). Pure functions, so the
// list and the plan are checked offline; the production read of the rows is the ops task warmlist (api/usageDashboard.js) and the reads are scripts/warmAfterBump.mjs.
const VIN = /\b[A-HJ-NPR-Z0-9]{17}\b/i;
export const normQuery = t => String(t || "").toLowerCase().replace(/[^a-z0-9+\-\s./]/g, " ").replace(/\s+/g, " ").trim();
// the cars: [{ text, n }] most read first. A search that is a VIN, a chat sentence, a placeholder or too short is not a car to warm.
export function topCars(rows, max = 300) {
  const counts = new Map(), shown = new Map();
  for (const r of rows || []) {
    const raw = String((r && (r.query_text ?? (r.props && r.props.query_text))) || "").trim();
    const k = normQuery(raw);
    if (k.length < 4 || k.length > 60 || k === "-" || VIN.test(raw) || /\?|\b(how|what|why|where|should|can|does|is|are)\b/i.test(raw) || k.split(" ").length > 7) continue;
    counts.set(k, (counts.get(k) || 0) + 1); if (!shown.has(k)) shown.set(k, raw.replace(/\s+/g, " ").slice(0, 60));
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, max).map(([k, n]) => ({ text: shown.get(k), n }));
}
// the hubs: /history/<make-model-slug> (two path segments; a VIN page has three) from page_view rows, most read first
export function topHubs(rows, max = 200) {
  const counts = new Map();
  for (const r of rows || []) {
    const p = String((r && (r.route || (r.metadata && r.metadata.path))) || "").split("?")[0].replace(/\/$/, "");
    const m = /^\/history\/([a-z0-9-]+)$/.exec(p); if (!m) continue;
    counts.set("/history/" + m[1], (counts.get("/history/" + m[1]) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, max).map(([path, n]) => ({ path, n }));
}
// the plan and its cost BEFORE anyone runs it: reads, the engine's concurrency, wall time from the measured cold read times, and the spend (archive reads only, no OldCarsData)
export const COLD_MS = { car: 12000, hub: 9000 };   // Nov 18 measurements: a first Market Check read after a bump 15 to 20 s, a Sell range read 1.4 to 2.4 s, a History hub 8 to 12 s; the car read is the Market Check one, rounded down
export function planOf({ cars = 0, hubs = 0, concurrency = 3, coldMs = COLD_MS } = {}) {
  const c = Math.max(1, Math.min(3, Number(concurrency) || 3)), reads = cars + hubs, busyMs = cars * coldMs.car + hubs * coldMs.hub;
  return { cars, hubs, reads, concurrency: c, wallMinutes: Math.round(busyMs / c / 60000 * 10) / 10, functionSeconds: Math.round(busyMs / 1000), oldCarsDataRequests: 0, note: "archive reads only; at most three engine reads at once; the History hubs are read as pages" };
}
