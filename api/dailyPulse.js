// Serves the nightly Today's-Market pulse. Reads ONLY lib/dailyPulse.json
// (written by scripts/refreshDailyPulse.js). No computation, no OldCarsData.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PULSE_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "lib", "dailyPulse.json");

export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  try {
    const pulse = JSON.parse(fs.readFileSync(PULSE_PATH, "utf8"));
    res.setHeader("Cache-Control", "public, max-age=300");
    res.status(200).json(pulse);
  } catch (e) {
    // No file yet, or unreadable: return the honest quiet state.
    res.status(200).json({ generated_date: null, cards: [
      { id: "avg_price", title: "Average Transaction Price", state: "quiet", line: "Quiet day in the market" },
      { id: "bid_momentum", title: "Bid Momentum", state: "quiet", line: "Quiet day in the market" },
      { id: "category_strength", title: "Category Strength", state: "quiet", line: "Quiet day in the market" }
    ] });
  }
}
