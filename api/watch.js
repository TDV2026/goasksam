// Watches (Lane C, Oct 2026): lib/live/watches.js. Standing notices, unlimited, never the chat model.
//   POST { action:"ready" }                          -> { ready } (docs/supabase-watches.sql run?)
//   POST { action:"arm", kind:"spec"|"vin", listing_id } (signed in) -> { watch, first }
//   POST { action:"stop", id } (signed in)           -> { ok }
//   POST { action:"list" } (signed in)               -> { watches:[{ id, kind, label, last_event, ... }] }
//   GET  ?run=1                                      -> the send run (Vercel cron, CRON_SECRET; or the probe key)
//   POST { action:"test", kind, listing_id|vin, since, to } (probe) -> the real message for real events
//        since a past day, sent to `to` only, recorded nowhere
// Stopping from a message is the before-it-ends signed stop link (/api/buySearch?alert=stop), which stops
// every notice on the account, watches included (lib/live/buyAlerts.js stopAll).
import { supabaseEnv } from "../lib/_supabase.js";
import { validateBearer } from "../lib/_auth.js";
import { readVisitorId } from "../lib/_visitor.js";
import { hasServerCredential } from "../lib/_credential.js";
import { ready, arm, stop, list, run, testSend, isMissingTable, probeBackdate, probeInspect, verifySoldTaskTap, soldTaskTap, soldTaskName, getWatch, setWatchState } from "../lib/live/watches.js";

export default async function handler(req, res) {
  const env = supabaseEnv();
  if (!env) return res.status(500).json({ error: "not configured" });
  // Our own tests: the header credential only (lib/_credential.js), never a key in the address or body.
  const probe = hasServerCredential(req);
  res.setHeader("Cache-Control", "private, no-store");
  // Pause and Stop links from a sold task email (Oct 2026): ONE task each. GET shows a confirm page naming the
  // task; only its POST (or the mail provider's one-click POST on Stop) acts. Signed links, constant-time check.
  const tapAct = req.query && /^(pause|stop|resume)$/.test(String(req.query.a || "")) ? String(req.query.a) : null;
  if (tapAct) {
    res.setHeader("Content-Type", "text/html; charset=utf-8"); res.setHeader("X-Robots-Tag", "noindex, nofollow"); res.setHeader("Cache-Control", "private, no-store");
    const e = x => String(x == null ? "" : x).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const page = (status, title, body) => res.status(status).send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>${e(title)} | GoAskSam</title><style>body{margin:0;background:#F6F3EC;color:#15201A;font:400 17px/1.55 system-ui,-apple-system,'Segoe UI',sans-serif}main{max-width:520px;margin:0 auto;padding:48px 20px}h1{font:500 26px/1.25 Georgia,serif;margin:0 0 12px}button{min-height:44px;padding:0 22px;border:0;border-radius:8px;background:#1E4D38;color:#fff;font:600 15px system-ui,sans-serif;cursor:pointer}.quiet{color:#5F5A53;font-size:15px}a{color:#15201A}</style></head><body><main>${body}</main></body></html>`);
    const id = verifySoldTaskTap(req.query.t, tapAct);
    if (!id) return page(400, "Link expired", `<h1>That link has expired.</h1><p class="quiet"><a href="/tasks/mine">Open your tasks</a></p>`);
    const w = await getWatch(env, id).catch(() => null);
    if (!w) return page(404, "Task gone", `<h1>That task is gone.</h1><p class="quiet"><a href="/tasks/mine">Open your tasks</a></p>`);
    const name = soldTaskName(w);
    const words = { pause: ["Pause the task", "Its emails stop until you start it again. Your other tasks keep running.", "Pause this task"], stop: ["Stop the task", "This ends this one task. Your other tasks keep running.", "Stop this task"], resume: ["Start the task again", "Sam tells you again when the next one sells.", "Start it again"] }[tapAct];
    if (req.method !== "POST") return page(200, words[0], `<h1>${e(words[0])}: ${e(name)}</h1><p>${e(words[1])}</p><form method="post" action="/api/watch?a=${tapAct}&t=${encodeURIComponent(String(req.query.t))}"><button type="submit">${e(words[2])}</button></form><p class="quiet"><a href="/tasks/mine">Open your tasks instead</a></p>`);
    const r = await setWatchState(env, id, tapAct).catch(err => ({ ok: false, error: String(err && err.message) }));
    if (r.notReady) return page(503, "Not ready", `<h1>Pause isn't ready yet.</h1><p>Nothing changed. You can stop this task instead from its email.</p>`);
    if (!r.ok) return page(500, "Try again", `<h1>That didn't go through.</h1><p>Nothing changed. Try the link again in a moment.</p>`);
    const done = tapAct === "pause" ? `<h1>Paused: ${e(name)}</h1><p>You can <a href="${e(soldTaskTap(id, "resume"))}">start it again</a> any time.</p>` : tapAct === "stop" ? `<h1>Stopped: ${e(name)}</h1><p>Your other tasks keep running.</p>` : `<h1>Running again: ${e(name)}</h1>`;
    return page(200, "Done", done + `<p class="quiet"><a href="/tasks/mine">Open your tasks</a></p>`);
  }
  try {
    if (req.method === "GET" && req.query && req.query.run) {
      const cron = process.env.CRON_SECRET && String(req.headers.authorization || "") === `Bearer ${process.env.CRON_SECRET}`;
      if (!cron && !probe) return res.status(401).json({ error: "Unauthorized." });
      if (!(await ready(env))) return res.status(200).json({ ok: true, setup: true });
      // A probe run can be held to one account (?user=<id>), so a test never sends to anyone else.
      return res.status(200).json(await run(env, { dry: probe && req.query.dry === "1", userId: probe && /^[0-9a-f-]{36}$/.test(String(req.query.user || "")) ? String(req.query.user) : null }));
    }
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
    const b = req.body || {};
    if (b.action === "ready") return res.status(200).json({ ready: await ready(env) });
    if (b.action === "test") {
      if (!probe) return res.status(401).json({ error: "Unauthorized." });
      return res.status(200).json(await testSend(env, { kind: b.kind, listing_id: b.listing_id, vin: b.vin, since: b.since, to: b.to || null, first: b.first !== false, userId: b.user_id || null }));
    }
    // Probe: is watches.paused_at there yet? (a no-op PATCH on an id that cannot exist; nothing changes)
    if (b.action === "paused_ready") {
      if (!probe) return res.status(401).json({ error: "Unauthorized." });
      const r = await setWatchState(env, "00000000-0000-4000-8000-00000000ffff", "resume").catch(e => ({ ok: false, error: String(e && e.message).slice(0, 160) }));
      return res.status(200).json({ ready: !!r.ok, notReady: !!r.notReady, error: r.error || null });
    }
    if (b.action === "probe_backdate" || b.action === "probe_inspect") {
      if (!probe) return res.status(401).json({ error: "Unauthorized." });
      if (b.action === "probe_inspect") return res.status(200).json(await probeInspect(env, String(b.user_id || "")));
      return res.status(200).json({ rows: await probeBackdate(env, String(b.id || ""), { baseline_date: b.baseline_date, created_at: b.created_at }) });
    }
    const user = await validateBearer(req.headers.authorization || "").catch(() => null);
    if (!user || !user.userId) return res.status(401).json({ ok: false, needSignIn: true });
    if (b.action === "arm") return res.status(200).json(await arm(env, user, { kind: b.kind, listing_id: b.listing_id, vin: b.vin, car: b.car, visitorId: readVisitorId(req) }));
    if (b.action === "stop") return res.status(200).json(await stop(env, user, b.id));
    if (b.action === "list") return res.status(200).json(await list(env, user));
    return res.status(400).json({ error: "unknown action" });
  } catch (e) {
    if (isMissingTable(e)) return res.status(200).json({ ok: false, setup: true });
    console.error("watch:", (e && e.stack) || e);
    return res.status(500).json({ error: "Sam couldn't do that just now." });
  }
}
