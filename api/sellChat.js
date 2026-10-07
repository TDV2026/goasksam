// /sell conversation endpoint (Lane C, Oct 2026): POST {action:"chat", messages, state, turns} ->
// text/event-stream through the shared chat endpoint (lib/live/chatHttp.js). "done" carries the page
// data the turn produced: places, tiles, the latest sales and a matched PowerSeller.
import { supabaseEnv } from "../lib/_supabase.js";
import { chatOut } from "../lib/live/chatHttp.js";
import { runSellTurn } from "../lib/sell/sellChat.js";

export default async function handler(req, res) {
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
    return res.status(200).json(out);
  }
  if (b.action !== "chat") return res.status(400).json({ error: "unknown action" });
  return chatOut(res, env, b, { surface: "sell", run: runSellTurn, shape: async out => ({ page: out.page || null, cards: [] }) });
}
