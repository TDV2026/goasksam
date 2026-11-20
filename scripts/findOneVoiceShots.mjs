// Before and after screenshots of the Find states that stacked (Lane S, Nov 19 2026): node scripts/findOneVoiceShots.mjs <repo root> <out prefix>. The real page, the real handler (scripts/_findStates.mjs).
import path from "node:path"; import { pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || "."), pre = process.argv[3] || "proofs/find";
const NOW = Date.now(), mk = (i, t, y) => ({ id: 800 + i, source: "bringatrailer", source_listing_id: "s" + i, url: "https://auction.test/s/" + i, listing_title: t, make: "Porsche", model: "911", year: y, vin_norm: null, mileage: 40000, current_bid: 30000, end_time: new Date(NOW + 864e5).toISOString(), status: "active", body_style: "coupe", transmission: "Manual", color: "Red", state: "IL", first_seen_at: new Date(NOW - 864e5).toISOString(), last_seen_at: new Date(NOW).toISOString(), location: "Chicago, IL", images: ["https://x/y.jpg"] });
const { startFind } = await import(pathToFileURL(path.join(root, "scripts/_findStates.mjs")).href), search = await import(pathToFileURL(path.join(root, "lib/live/search.js")).href);
const f = await startFind(root, [mk(1, "1987 Porsche 911 Carrera Coupe", 1987), mk(2, "1995 Porsche 911 Carrera Cabriolet", 1995)]);
for (const w of [1100, 390]) {
  await f.run("Land Rover Range Rover 1990 to 1999", { w, wait: 4500, shot: `${pre}-rangerover-${w}.png` });
  await f.run("Porsche 911", { w, wait: 4500, shot: `${pre}-cold-cards-${w}.png`, tweak: j => { for (const c of j.cards || []) c.market = search.stillReadingMarket(); } });
}
await f.close();
