// Watches (Lane C, Oct 2026): lib/live/watches.js. Standing notices, unlimited, never the chat model.
//   POST { action:"ready" }                          -> { ready } (docs/supabase-watches.sql run?)
//   POST { action:"arm", kind:"spec"|"vin", listing_id } (signed in) -> { watch, first }
//   POST { action:"stop", id } (signed in)           -> { ok }
//   POST { action:"list" } (signed in)               -> { watches:[{ id, kind, label, last_event, ... }] }
//   GET  ?run=1                                      -> the send run (Vercel cron, CRON_SECRET; or the probe key)
//   POST { action:"test", key, kind, listing_id|vin, since, to } (probe) -> the real message for real events
//        since a past day, sent to `to` only, recorded nowhere
// Stopping from a message is the before-it-ends signed stop link (/api/buySearch?alert=stop), which stops
// every notice on the account, watches included (lib/live/buyAlerts.js stopAll).
import { supabaseEnv } from "../lib/_supabase.js";
import { validateBearer } from "../lib/_auth.js";
import { ready, arm, stop, list, run, testSend, isMissingTable } from "../lib/live/watches.js";

export default async function handler(req, res) {
  const env = supabaseEnv();
  if (!env) return res.status(500).json({ error: "not configured" });
  const probe = !!(process.env.PROBE_KEY && ((req.query && req.query.key) === process.env.PROBE_KEY || (req.body && req.body.key) === process.env.PROBE_KEY));
  res.setHeader("Cache-Control", "private, no-store");
  try {
    if (req.method === "GET" && req.query && req.query.run) {
      const cron = process.env.CRON_SECRET && String(req.headers.authorization || "") === `Bearer ${process.env.CRON_SECRET}`;
      if (!cron && !probe) return res.status(401).json({ error: "Unauthorized." });
      if (!(await ready(env))) return res.status(200).json({ ok: true, setup: true });
      return res.status(200).json(await run(env, { dry: probe && req.query.dry === "1" }));
    }
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
    const b = req.body || {};
    if (b.action === "ready") return res.status(200).json({ ready: await ready(env) });
    if (b.action === "test") {
      if (!probe) return res.status(401).json({ error: "Unauthorized." });
      return res.status(200).json(await testSend(env, { kind: b.kind, listing_id: b.listing_id, vin: b.vin, since: b.since, to: b.to || null, first: b.first !== false, userId: b.user_id || null }));
    }
    const user = await validateBearer(req.headers.authorization || "").catch(() => null);
    if (!user || !user.userId) return res.status(401).json({ ok: false, needSignIn: true });
    if (b.action === "arm") return res.status(200).json(await arm(env, user, { kind: b.kind, listing_id: b.listing_id }));
    if (b.action === "stop") return res.status(200).json(await stop(env, user, b.id));
    if (b.action === "list") return res.status(200).json(await list(env, user));
    return res.status(400).json({ error: "unknown action" });
  } catch (e) {
    if (isMissingTable(e)) return res.status(200).json({ ok: false, setup: true });
    console.error("watch:", (e && e.stack) || e);
    return res.status(500).json({ error: "Sam couldn't do that just now." });
  }
}
