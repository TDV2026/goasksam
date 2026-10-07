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
  if (b.action !== "chat") return res.status(400).json({ error: "unknown action" });
  return chatOut(res, env, b, { surface: "sell", run: runSellTurn, shape: async out => ({ page: out.page || null, cards: [] }) });
}
