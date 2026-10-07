// /api/tasks (Lane C, Oct 2026): the Tasks buyer agent. Signed in only (Bearer, validated server-side).
//   GET  ?summary=1                     -> the rail badge: the active task's state + unread updates
//   POST {action:"list"}                -> the account's tasks with their threads, plus old hunts and
//                                          watched searches offered as starting tasks
//   POST {action:"say", text, draft?, seed?}     -> a new task's conversation: NOTHING is written; the draft
//                                                   (job + read-back) comes back for the page to hold
//   POST {action:"say", task_id, text, pending?} -> a message about an existing task (a change is proposed)
//   POST {action:"start", draft}                 -> the only way a task row is written (the read-back confirmed)
//   POST {action:"apply", task_id, pending}      -> a confirmed change to a task
//   POST {action:"control", task_id, act}        -> pause | resume | stop | keep_looking
// One task per account holds the slot (running, needs you, or paused): a new task while it is held
// returns { blocked: { task_id, state, summary } } and creates nothing, wherever the request came from.
//   GET  ?a=pause|stop|keep_looking&t=<signed token>  -> the one-tap links in task emails
//   GET  ?run=1                         -> the matching run after each live pull (Vercel cron, CRON_SECRET)
// Probe-keyed tests (PROBE_KEY): act as a test user, seed listing rows instead of the live table, mock
// the clock; test runs never send email (email_status "test").
import { supabaseEnv } from "../lib/_supabase.js";
import { validateBearer } from "../lib/_auth.js";
import { taskTurn, draftTurn, startDraft, applyEdit, slotTask, controlTask, userTasks, taskUpdates, getTask, saveTask, runTasks, suggestions, verifyTap, memStore, notify } from "../lib/tasks/tasks.js";
import crypto from "node:crypto";
import { CHAT_MODEL } from "../lib/live/chatHttp.js";
import { recordUsageEvent } from "./_usage.js";

const TEST_USER = /^00000000-0000-4000-8000-[0-9a-f]{12}$/;
const TEST_EMAIL = "feedback+taskstest@goasksam.com";   // the one real test account (sign-in checks)
const probeOk = req => process.env.PROBE_KEY && (req.headers["x-probe-key"] === process.env.PROBE_KEY || (req.query && req.query.key === process.env.PROBE_KEY));
async function who(req) {
  // Probe test users only: a fixed id prefix, so a probe call can never act as a real account.
  if (probeOk(req) && TEST_USER.test(String(req.headers["x-test-user"] || ""))) return { userId: String(req.headers["x-test-user"]), email: null, test: true };
  const u = await validateBearer(req.headers.authorization || "").catch(() => null);
  return u && u.userId ? { userId: u.userId, email: u.email || null } : null;
}

export default async function handler(req, res) {
  const env = supabaseEnv();
  if (!env) return res.status(503).json({ error: "unavailable" });
  const q = req.query || {};
  const apiKey = process.env.ANTHROPIC_API_KEY;
  try {
    // One-tap from an email: a signed token, no sign-in needed. Counts as an interaction.
    if (req.method === "GET" && q.a) {
      const act = String(q.a);
      if (!["pause", "stop", "keep_looking", "resume"].includes(act)) return res.status(400).send("Unknown action.");
      const id = verifyTap(q.t, act);
      if (!id) return res.status(400).send("That link has expired.");
      const task = await getTask(env, id);
      if (!task) return res.status(404).send("That task is gone.");
      await controlTask(env, { userId: task.user_id }, id, act, {});
      res.setHeader("Location", `/tasks/mine?task=${id}&done=${act}`); return res.status(302).end();
    }
    // The run after each live pull: Vercel cron (CRON_SECRET) or the probe key.
    if (req.method === "GET" && q.run) {
      const isCron = process.env.CRON_SECRET && req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`;
      if (!isCron && !probeOk(req)) return res.status(401).json({ error: "Unauthorized." });
      const t0 = Date.now();
      let out;
      try { out = await runTasks(env, { apiKey, model: CHAT_MODEL }); }
      catch (e) {   // a failed run leaves a row too, so a silent cron failure is queryable
        await recordUsageEvent({ event_type: "tasks_run", route: "tasks_run", status: "error", oldcarsdata_metered_requests: 0, metadata: { error: String((e && e.message) || e).slice(0, 300), ms: Date.now() - t0 } }, env.supabaseUrl, env.supabaseKey).catch(() => {});
        throw e;
      }
      await recordUsageEvent({ event_type: "tasks_run", route: "tasks_run", status: "ok", oldcarsdata_metered_requests: 0, metadata: { ran: out.ran, matched: out.report.reduce((k, r) => k + (r.matched || 0), 0), ms: Date.now() - t0 } }, env.supabaseUrl, env.supabaseKey).catch(() => {});
      return res.status(200).json(out);
    }
    // Probe: when each live pull finished (its final usage row) and when each task run ran, last 7 days.
    if (req.method === "GET" && q.pulltiming && probeOk(req)) {
      const since = new Date(Date.now() - 7 * 864e5).toISOString();
      const get = async f => { const r = await fetch(`${env.supabaseUrl}/rest/v1/app_usage_events?created_at=gte.${since}&${f}&select=created_at,event_type,route,status,metadata&order=created_at.asc&limit=1000`, { headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}` } }); return r.ok ? r.json() : `error ${r.status}`; };
      return res.status(200).json({ pulls: await get("route=eq.pull_live"), runs: await get("event_type=eq.tasks_run") });
    }
    // Probe: one account's UNCONFIRMED task rows (written by the old flow from raw words before any
    // read-back: no summary, or still a draft). Lists them; &delete=1 removes exactly those, nothing else.
    if (req.method === "GET" && q.orphans && q.email && probeOk(req)) {
      const H = { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}` };
      const f = `tasks?email=eq.${encodeURIComponent(String(q.email).toLowerCase())}&or=(summary.is.null,state.eq.draft)`;
      const rows = await (await fetch(`${env.supabaseUrl}/rest/v1/${f}&select=id,state,kind,words,summary,created_at`, { headers: H })).json();
      let deleted = 0;
      if (q.delete && Array.isArray(rows) && rows.length) { const r = await fetch(`${env.supabaseUrl}/rest/v1/${f}`, { method: "DELETE", headers: { ...H, Prefer: "return=representation" } }); deleted = r.ok ? (await r.json()).length : `error ${r.status}`; }
      const all = await (await fetch(`${env.supabaseUrl}/rest/v1/tasks?email=eq.${encodeURIComponent(String(q.email).toLowerCase())}&select=id,state,kind,summary,created_at`, { headers: H })).json();
      return res.status(200).json({ orphans: rows, deleted, account_rows_now: all });
    }
    // Probe: counts of the old watch_requests rows (reported, never emailed).
    if (req.method === "GET" && q.watchcounts && probeOk(req)) {
      const count = async f => { const r = await fetch(`${env.supabaseUrl}/rest/v1/watch_requests?select=id${f}`, { method: "HEAD", headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, Prefer: "count=exact", Range: "0-0" } }); return r.ok || r.status === 206 ? Number(((r.headers.get("content-range") || "").split("/")[1]) || 0) : `error ${r.status}`; };
      return res.status(200).json({ total: await count(""), with_email: await count("&email=like.*@*"), vin_keys: await count("&vin_norm=not.like.*:*"), search_keys: await count("&vin_norm=like.search:*"), family_or_live_keys: await count("&or=(vin_norm.like.family:*,vin_norm.like.live:*)") });
    }
    // Probe: a real one-time sign-in code for the ONE fixed test address (Supabase admin generate_link),
    // so the browser test can run the normal email-code sign-in end to end without reading an inbox.
    if (req.method === "POST" && req.body && req.body.action === "test_otp" && probeOk(req)) {
      const r = await fetch(`${env.supabaseUrl}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: TEST_EMAIL }) });
      const j = await r.json().catch(() => ({}));
      const otp = j.email_otp || (j.properties && j.properties.email_otp) || null;
      return res.status(r.ok && otp ? 200 : 500).json(r.ok && otp ? { email: TEST_EMAIL, otp } : { error: `generate_link ${r.status}`, detail: String(j.msg || j.message || "").slice(0, 200) });
    }
    // Probe: delete the fixed test account's tasks. Needs the account's own real token (verified
    // server-side), so it can only ever touch that account.
    if (req.method === "POST" && req.body && req.body.action === "test_real_cleanup" && probeOk(req)) {
      const u = await validateBearer(req.headers.authorization || "").catch(() => null);
      if (!u || String(u.email || "").toLowerCase() !== TEST_EMAIL) return res.status(403).json({ error: "only the test account" });
      const r = await fetch(`${env.supabaseUrl}/rest/v1/tasks?user_id=eq.${u.userId}`, { method: "DELETE", headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, Prefer: "return=representation" } });
      return res.status(200).json({ deleted_tasks: r.ok ? (await r.json()).length : `error ${r.status}` });
    }
    // Probe-keyed test scenario: the whole flow for a fresh test user against an in-memory store (no
    // table rows, no email), one request so the store holds. Steps: {say}, {control}, {run:{rows,now}},
    // {set:{...}}. Returns every step's result and the thread.
    if (req.method === "POST" && req.body && req.body.action === "test_scenario" && probeOk(req)) {
      const mem = memStore(), envT = { ...env, mem }, user = { userId: crypto.randomUUID(), email: null, test: true };
      const steps = []; let taskId = null, draft = null;
      for (const st of req.body.steps || []) {
        const t0 = Date.now(); let out;
        if (st.say != null && (st.new || !taskId)) { const r = await draftTurn(envT, user, { draft: st.new ? null : draft, text: st.say, seed: st.seed || null, apiKey, model: CHAT_MODEL }); draft = r.draft || null; if (r.task) taskId = r.task.id; out = { reply: r.reply, blocked: r.blocked || null, draft: draft && { kind: draft.kind, summary: draft.summary, question: draft.question, filters: draft.filters }, started: r.task ? r.task.state : null, rows: mem.tasks.length }; }
        else if (st.say != null) { const r = await taskTurn(envT, user, { taskId, text: st.say, apiKey, model: CHAT_MODEL }); out = { reply: r.reply, state: r.task && r.task.state, pending: r.pending || null, blocked: r.blocked || null }; }
        else if (st.control === "start") { const r = await startDraft(envT, user, draft || {}, { apiKey, model: CHAT_MODEL, rows: st.rows, testDrafts: st.testDrafts || null }); if (r.task) { taskId = r.task.id; draft = null; } out = { state: r.task && r.task.state, blocked: r.blocked || null, error: r.error || null, rows: mem.tasks.length }; }
        else if (st.control) { const r = await controlTask(envT, user, st.task_id || taskId, st.control, { apiKey, model: CHAT_MODEL, rows: st.rows }); out = { state: r.task && r.task.state, blocked: r.blocked || null, error: r.error }; }
        else if (st.run) { const r = await runTasks(envT, { taskId: st.task_id || taskId, rows: st.run.rows, now: st.run.now, testBad: !!st.run.testBad, testDrafts: st.run.testDrafts || null, test: true, apiKey, model: CHAT_MODEL }); out = r.report[0] || r; }
        else if (st.set) { await saveTask(envT, st.task_id || taskId, st.set); out = { set: Object.keys(st.set) }; }
        steps.push({ step: st, ms: Date.now() - t0, out });
      }
      return res.status(200).json({ steps, tasks: mem.tasks.map(t => ({ id: t.id, kind: t.kind, state: t.state, summary: t.summary, filters: t.filters, unread: t.unread })), updates: mem.ups.map(u => ({ task: u.task_id.slice(0, 8), role: u.role, kind: u.kind, text: u.text, listing_ids: u.listing_ids || null, email_status: u.email_status, tools: u.data && u.data.tools, guards: u.data && u.data.guards })) });
    }
    const user = await who(req);
    if (req.method === "GET" && q.summary) {
      res.setHeader("Cache-Control", "private, no-store");
      if (!user) return res.status(200).json({ signedIn: false });
      const tasks = await userTasks(env, user.userId);
      const active = tasks.find(t => ["running", "needs_you", "paused"].includes(t.state)) || null;
      return res.status(200).json({ signedIn: true, active: active ? { id: active.id, state: active.state, summary: active.summary } : null, unread: tasks.reduce((k, t) => k + (t.unread || 0), 0) });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
    if (!user) return res.status(401).json({ needSignIn: true });
    const b = req.body || {};
    if (b.action === "list") {
      const tasks = await userTasks(env, user.userId);
      const withThreads = await Promise.all(tasks.map(async t => ({ ...t, updates: await taskUpdates(env, t.id) })));
      // Opening the list is an interaction; the open thread's updates are read.
      if (b.open && /^[0-9a-f-]{36}$/.test(String(b.open))) { const t = tasks.find(x => x.id === b.open); if (t) await saveTask(env, t.id, { unread: 0, last_interaction_at: new Date().toISOString() }); }
      return res.status(200).json({ tasks: withThreads, suggestions: await suggestions(env, user.userId).catch(() => []) });
    }
    if (b.action === "say") {
      const text = String(b.text || "").trim().slice(0, 2000);
      if (!text) return res.status(400).json({ error: "empty" });
      if (!apiKey) return res.status(503).json({ error: "Sam is unavailable right now." });
      if (/^[0-9a-f-]{36}$/.test(String(b.task_id || ""))) return res.status(200).json(await taskTurn(env, user, { taskId: b.task_id, text, pending: b.pending || null, apiKey, model: CHAT_MODEL }));
      return res.status(200).json(await draftTurn(env, user, { draft: b.draft || null, text, seed: b.seed || null, apiKey, model: CHAT_MODEL }));
    }
    if (b.action === "start") return res.status(200).json(await startDraft(env, user, b.draft || {}, { apiKey, model: CHAT_MODEL }));
    if (b.action === "apply") return res.status(200).json(await applyEdit(env, user, String(b.task_id || ""), b.pending || null));
    if (b.action === "control") {
      return res.status(200).json(await controlTask(env, user, String(b.task_id || ""), String(b.act || ""), { apiKey, model: CHAT_MODEL }));
    }
    // Probe test run: one task, seeded listing rows, a mocked clock, no email.
    if (b.action === "test_run" && probeOk(req)) {
      const out = await runTasks(env, { taskId: b.task_id, rows: Array.isArray(b.rows) ? b.rows : undefined, now: b.now || undefined, test: true, apiKey, model: CHAT_MODEL });
      const task = await getTask(env, b.task_id);
      return res.status(200).json({ ...out, task, updates: await taskUpdates(env, b.task_id) });
    }
    // Probe: delete every row of this test user (tasks cascade to task_updates). Test ids only.
    if (b.action === "test_cleanup" && probeOk(req) && user.test) {
      const r = await fetch(`${env.supabaseUrl}/rest/v1/tasks?user_id=eq.${user.userId}`, { method: "DELETE", headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, Prefer: "return=representation" } });
      const gone = r.ok ? (await r.json()).length : `error ${r.status}`;
      const left = await (await fetch(`${env.supabaseUrl}/rest/v1/tasks?user_id=eq.${user.userId}&select=id`, { headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}` } })).json();
      return res.status(200).json({ deleted_tasks: gone, tasks_left: Array.isArray(left) ? left.length : left });
    }
    // Probe: send one real email of a test task's latest Sam update, to Sam's own address only.
    if (b.action === "test_email" && probeOk(req) && user.test) {
      const task = await getTask(env, String(b.task_id), user.userId);
      if (!task) return res.status(404).json({ error: "no such test task" });
      const up = (await taskUpdates(env, task.id)).filter(u => u.role === "sam").pop();
      if (!up) return res.status(400).json({ error: "no Sam update to send" });
      const out = await notify(env, { ...task, email: "feedback@goasksam.com" }, up, "A car matching your task just came up", {});
      return res.status(200).json({ ...out, update_id: up.id, text: up.text });
    }
    if (b.action === "test_set" && probeOk(req)) {   // mock time: move a task's interaction / still-looking stamps
      const patch = {}; for (const k of ["last_interaction_at", "still_looking_sent_at", "checkpoint", "state"]) if (k in b) patch[k] = b[k];
      return res.status(200).json({ task: await saveTask(env, String(b.task_id), patch) });
    }
    return res.status(400).json({ error: "unknown action" });
  } catch (e) {
    console.error("tasks failed:", (e && e.stack) || e);
    return res.status(500).json({ error: String((e && e.message) || e).slice(0, 300) });
  }
}
