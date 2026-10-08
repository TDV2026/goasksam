// /sell conversation endpoint (Lane C, Oct 2026): POST {action:"chat", messages, state, turns} ->
// text/event-stream through the shared chat endpoint (lib/live/chatHttp.js). "done" carries the page
// data the turn produced: places, tiles, the latest sales and a matched PowerSeller.
import { supabaseEnv } from "../lib/_supabase.js";
import { chatOut } from "../lib/live/chatHttp.js";
import { runSellTurn } from "../lib/sell/sellChat.js";

export default async function handler(req, res) {
  // SWITCHED OFF (Oct 8 2026, Sam): /sell is back on the previous front page and wizard (api/sellPage.js).
  // The new Sell stays in the repo (lib/sell/ facts engine) but is not reachable by the public: 404 unless
  // SELL_NEXT_ON=1 or the probe key is presented (internal testing only).
  if (process.env.SELL_NEXT_ON !== "1" && !(process.env.PROBE_KEY && (req.headers["x-probe-key"] === process.env.PROBE_KEY || (req.query && req.query.key === process.env.PROBE_KEY)))) return res.status(404).json({ error: "Not found." });
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const env = supabaseEnv();
  if (!env) return res.status(503).json({ error: "unavailable" });
  const b = req.body || {};
  // Probe (PROBE_KEY): how a car resolves and what each pool step holds.
  if (b.action === "probe" && process.env.PROBE_KEY && b.key === process.env.PROBE_KEY) {
    const { resolveSellCar, specPool } = await import("../lib/sell/sellFacts.js");
    const { houseReceiptsForVehicle } = await import("../lib/onebox.js");
    const { car, said } = await resolveSellCar(String(b.car || ""), env);
    if (!car) return res.status(200).json({ said, car: null });
    car.env = env; if (said.gearbox) car.v.gearbox = said.gearbox;
    const out = { said, v: car.v, generation: car.generation };
    for (const days of [365, 1095]) { const sp = await specPool(car, days); out["pool" + days] = { n: sp.pool.length, step: sp.step, cohort: sp.cohort, spec: sp.spec && { model: sp.spec.model, trim: sp.spec.trim, bodyStyle: sp.spec.bodyStyle, yearMin: sp.spec.yearMin, yearMax: sp.spec.yearMax } }; }
    const hr = await houseReceiptsForVehicle(car.v, car.generation, env).catch(e => ({ err: String(e) }));
    out.house = hr ? { n: (hr.houseReceipts || []).length, totalN: hr.totalN, err: hr.err } : null;
    const hr2 = await houseReceiptsForVehicle({ ...car.v, bodyStyle: null }, car.generation, env).catch(() => null);
    out.houseNoBody = hr2 ? { n: (hr2.houseReceipts || []).length, totalN: hr2.totalN } : null;
    const { placesFor } = await import("../lib/sell/sellFacts.js");
    const pl = await placesFor(car).catch(e => ({ err: String(e) }));
    // How many unsold cars of each reserve kind each place records (24 months), for the reserve tile.
    out.unsoldKinds = {};
    for (const x of (pl && pl.places) || []) for (const hr of [true, false]) {
      const r = await fetch(`${env.supabaseUrl}/rest/v1/auction_attempts?source_slug=eq.${x.slug}&has_reserve=eq.${hr}&attempt_date=gte.${new Date(Date.now() - 730 * 864e5).toISOString().slice(0, 10)}&select=source_slug`, { method: "HEAD", headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, Prefer: "count=exact", Range: "0-0" } }).catch(() => null);
      out.unsoldKinds[x.slug + (hr ? " reserve" : " no reserve")] = r ? (r.headers.get("content-range") || "").split("/")[1] : null;
    }
    out.places = pl && { total: pl.total, cohort: pl.cohort, step: pl.step, places: (pl.places || []).map(x => [x.name, x.sales]), err: pl.err };
    return res.status(200).json(out);
  }
  if (b.action !== "chat") return res.status(400).json({ error: "unknown action" });
  return chatOut(res, env, b, { surface: "sell", run: runSellTurn, shape: async out => ({ page: out.page || null, cards: [] }) });
}
