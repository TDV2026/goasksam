// /sell conversation endpoint (Lane C, Oct 2026): POST {action:"chat", messages, state, turns} ->
// text/event-stream through the shared chat endpoint (lib/live/chatHttp.js). "done" carries the page
// data the turn produced: places, tiles, the latest sales and a matched PowerSeller.
import { supabaseEnv } from "../lib/_supabase.js";
import { chatOut } from "../lib/live/chatHttp.js";
import { runSellTurn } from "../lib/sell/sellChat.js";
import { checkCeiling, followupGuard, testLimits, CALM } from "../lib/_ceilings.js";
import { hasServerCredential } from "../lib/_credential.js";

export default async function handler(req, res) {
  // SWITCHED OFF (Oct 8 2026, Sam): /sell is back on the previous front page and wizard (api/sellPage.js).
  // The new Sell stays in the repo (lib/sell/ facts engine) but is not reachable by the public: 404 unless
  // SELL_NEXT_ON=1 or the probe key is presented (internal testing only).
  if (process.env.SELL_NEXT_ON !== "1" && !(process.env.PROBE_KEY && (req.headers["x-probe-key"] === process.env.PROBE_KEY || (req.query && req.query.key === process.env.PROBE_KEY)))) return res.status(404).json({ error: "Not found." });
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const env = supabaseEnv();
  if (!env) return res.status(503).json({ error: "unavailable" });
  const b = req.body || {};
  // The one-direction Sell (lib/sell/sellFlow.js). The car questions are Market Check's own (api/sellNext.js
  // serves its page); {action:"flow", step:"result", car, state, how} -> the result; step:"ask" -> follow-up.
  if (b.action === "flow") {
    const { buildResult, stateOf } = await import("../lib/sell/sellFlow.js");
    try {
      if (b.step === "state") return res.status(200).json({ state: stateOf(b.text) });
      // A follow-up question after the result: Claude on the shared chat core, the engine's facts in words.
      // The follow-up calls the model: the ONE gated action, through the same guard as live /sell's chat.
      if (b.step === "ask") {
        const g = await followupGuard(env, req);
        if (!g.ok) return res.status(200).json(g.body);
        const { followUp } = await import("../lib/sell/sellFollow.js");
        const { CHAT_MODEL } = await import("../lib/live/chatHttp.js");
        if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: "Sam is unavailable right now." });
        return res.status(200).json(await followUp(env, { carText: String(b.car || "").slice(0, 300), state: stateOf(b.state) || null, how: ["self", "handled", "house", "unsure"].includes(b.how) ? b.how : "unsure", rush: ["fast", "month", "none"].includes(b.rush) ? b.rush : null, question: String(b.question || "").slice(0, 600), history: b.history, apiKey: process.env.ANTHROPIC_API_KEY, model: CHAT_MODEL }));
      }
      // The result: open to everyone, under the same invisible ceiling as live /sell's search (one guard).
      if (b.step === "result") { const cred = hasServerCredential(req), lim = testLimits(req, cred); if (!cred || lim) { const ce = await checkCeiling(env, req, "sell_search", { tool: "sell", limits: lim }); if (!ce.ok) return res.status(200).json({ empty: CALM.search, limited: true }); } }
      if (b.step === "result") return res.status(200).json(await buildResult(env, { carText: String(b.car || "").slice(0, 300), state: stateOf(b.state) || null, how: ["self", "handled", "house", "unsure"].includes(b.how) ? b.how : "unsure", rush: ["fast", "month", "none"].includes(b.rush) ? b.rush : null }));
      return res.status(400).json({ error: "unknown step" });
    } catch (e) { console.error("sell flow failed:", (e && e.stack) || e); return res.status(500).json({ error: "Sam couldn't read that just now." }); }
  }
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
  // The conversational Sell calls the model on every turn: the same gate as the follow-up (one guard).
  { const g = await followupGuard(env, req); if (!g.ok) return res.status(200).json(g.body); }
  return chatOut(res, env, b, { surface: "sell", run: runSellTurn, shape: async out => ({ page: out.page || null, cards: [] }) });
}
