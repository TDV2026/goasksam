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
//   GET  ?a=pause|stop|keep_looking|resume&t=<signed token> -> the confirm page for an email link (changes
//                                          nothing: email scanners open every link); HEAD likewise
//   POST ?a=...&t=<signed token>        -> the confirm page's button, or a mail provider's one-click
//                                          unsubscribe (RFC 8058, List-Unsubscribe-Post): the only way a link acts
//   GET  ?run=1                         -> the matching run after each live pull (Vercel cron, CRON_SECRET)
// Probe-keyed tests (PROBE_KEY): act as a test user, seed listing rows instead of the live table, mock
// the clock; test runs never send email (email_status "test").
import { withTracking } from "../lib/track/log.js";
import { supabaseEnv, supabaseSelect } from "../lib/_supabase.js";
import { validateBearer } from "../lib/_auth.js";
import { readVisitorId } from "../lib/_visitor.js";
import { jobPhrase, notifyPrefs, setNotifyPrefs, taskTurn, draftTurn, startDraft, applyEdit, slotTask, controlTask, userTasks, taskUpdates, getTask, saveTask, runTasks, suggestions, verifyTap, memStore, notify, oneTap, sendStartEmail } from "../lib/tasks/tasks.js";
import crypto from "node:crypto";
import { CHAT_MODEL } from "../lib/live/chatHttp.js";
import { recordUsageEvent } from "./_usage.js";
import { isReleased, notReleasedJson } from "../lib/_launchStage.js";
import { tasksAllowance } from "../lib/_ceilings.js";
import { signupTicket } from "../lib/_signup.js";
// The per-account daily limits (Tasks setup chat turns, research started), crew exempt: what -> ok.
const gateOf = (req, user) => what => tasksAllowance(supabaseEnv(), req, user.userId, what).then(r => r.ok, () => true);

const TEST_USER = /^00000000-0000-4000-8000-[0-9a-f]{12}$/;
// The email links' confirm and result pages: plain words, one button, never an action on a click alone.
const TAP_WORDS = {
  pause: { title: "Pause the Task", ask: "Its emails stop until you start it again. Your other Tasks keep running.", button: "Pause this Task", done: "Paused." },
  stop: { title: "Stop the Task", ask: "This ends this one Task. Your other Tasks keep running.", button: "Stop this Task", done: "Stopped." },
  resume: { title: "Start this search again?", ask: "Sam keeps searching in the background, day and night, and you get an email when a car fits.", button: "Start it again", done: "Searching again." },
  keep_looking: { title: "Keep looking?", ask: "Sam keeps searching in the background, day and night, and you get an email when a car fits.", button: "Keep looking", done: "Sam keeps looking." }
};
const tapEsc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const TAP_CSS = "body{margin:0;background:#F6F3EC;color:#15201A;font:400 17px/1.55 system-ui,-apple-system,'Segoe UI',sans-serif}main{max-width:520px;margin:0 auto;padding:48px 20px}.brand{font:600 20px/1 Georgia,serif;margin:0 0 32px}h1{font:500 30px/1.15 Georgia,serif;margin:0 0 14px}.task{background:#fff;border:1px solid #E2DED3;border-radius:10px;padding:12px 14px}button{margin:10px 0 6px;min-height:48px;padding:0 22px;border:0;border-radius:10px;background:#1E4D38;color:#fff;font:600 16px/1 system-ui,sans-serif;cursor:pointer}a{color:#1E4D38}.quiet{font-size:14px;color:#5E6B63}";
const TEST_EMAIL = "feedback+taskstest@goasksam.com";   // the one real test account (sign-in checks)
const probeOk = req => process.env.PROBE_KEY && (req.headers["x-probe-key"] === process.env.PROBE_KEY || (req.query && req.query.key === process.env.PROBE_KEY));
async function who(req) {
  // Probe test users only: a fixed id prefix, so a probe call can never act as a real account.
  if (probeOk(req) && TEST_USER.test(String(req.headers["x-test-user"] || ""))) return { userId: String(req.headers["x-test-user"]), email: null, test: true };
  const u = await validateBearer(req.headers.authorization || "").catch(() => null);
  return u && u.userId ? { userId: u.userId, email: u.email || null } : null;
}

async function handler(req, res) {
  const env = supabaseEnv();
  if (!env) return res.status(503).json({ error: "unavailable" });
  const q = req.query || {};
  const apiKey = process.env.ANTHROPIC_API_KEY;
  try {
    // An email link (a signed token, no sign-in needed). GET and HEAD only show the confirm page: email
    // security scanners open every link in a message, so a click alone must never change a task. The
    // page's button POSTs back to the same link, and a mail provider's one-click unsubscribe POSTs there
    // too (RFC 8058); only a POST acts. Both pages are noindex and never cached.
    if (q.a && (req.method === "GET" || req.method === "HEAD" || req.method === "POST")) {
      const act = String(q.a);
      const page = (status, title, body) => {
        res.setHeader("Content-Type", "text/html; charset=utf-8"); res.setHeader("X-Robots-Tag", "noindex, nofollow"); res.setHeader("Cache-Control", "private, no-store");
        const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>${tapEsc(title)} | GoAskSam</title><style>${TAP_CSS}</style></head><body><main><p class="brand">GoAskSam</p>${body}</main></body></html>`;
        return req.method === "HEAD" ? res.status(status).end() : res.status(status).send(html);
      };
      // Stop ALL Task emails for one person (the List-Unsubscribe header, its one-click POST, and the combined email's
      // footer link): turns the "Email updates" switch off. Tasks keep running; nothing else changes.
      if (act === "emails_off") {
        const uid = verifyTap(q.t, "emails_off");
        if (!uid || !/^[0-9a-f-]{36}$/.test(uid)) return page(400, "Link expired", `<h1>That link has expired.</h1><p><a href="/tasks/mine">Open your Tasks</a></p>`);
        if (req.method !== "POST") return page(200, "Stop Task emails", `<h1>Stop all Task emails?</h1><p>Your Tasks keep running, and anything new still shows on your Tasks page. Sam just stops emailing you about them.</p>
          <form method="post" action="/api/tasks?a=emails_off&t=${encodeURIComponent(String(q.t))}"><button type="submit">Stop Task emails</button></form>
          <p class="quiet"><a href="/tasks/mine">Open your Tasks instead</a></p>`);
        const r = await setNotifyPrefs(env, { userId: uid, email: null }, { on: false }).catch(e => ({ error: String(e && e.message) }));
        if (r && r.error) return page(500, "Try again", `<h1>That didn't go through.</h1><p>Nothing changed. Try the link again in a moment.</p>`);
        return page(200, "Task emails off", `<h1>Task emails are off.</h1><p>Your Tasks keep running. You can turn emails back on from your Tasks page any time.</p><p><a href="/tasks/mine">Open your Tasks</a></p>`);
      }
      if (!TAP_WORDS[act]) return page(400, "Unknown link", `<h1>That link doesn't do anything.</h1>`);
      const id = verifyTap(q.t, act);
      if (!id) return page(400, "Link expired", `<h1>That link has expired.</h1><p><a href="/tasks/mine">Open your Tasks</a></p>`);
      const task = await getTask(env, id);
      if (!task) return page(404, "Task gone", `<h1>That task is gone.</h1><p><a href="/buy">Start a new search</a></p>`);
      const w = TAP_WORDS[act];
      if (req.method !== "POST") {
        // The heading names exactly what it acts on: "Stop the task: manual Porsche 911s from 1964 to 1998".
        const named = (act === "pause" || act === "stop") && task.filters ? `${w.title}: ${jobPhrase(task.filters)}` : w.title;
        return page(200, w.title, `<h1>${tapEsc(named)}</h1><p class="task">${tapEsc(task.summary || "This Task")}</p><p>${tapEsc(w.ask)}</p>
          <form method="post" action="/api/tasks?a=${encodeURIComponent(act)}&t=${encodeURIComponent(String(q.t))}"><button type="submit">${tapEsc(w.button)}</button></form>
          <p class="quiet"><a href="/tasks/mine?task=${encodeURIComponent(id)}">Open the Task instead</a></p>`);
      }
      const out = await controlTask(env, { userId: task.user_id }, id, act, { via: "email_link" });
      const after = (out && out.task) || task;
      const restart = act === "pause" && after.state === "paused" ? oneTap(id, "resume") : null;
      return page(200, w.done, `<h1>${tapEsc(w.done)}</h1><p class="task">${tapEsc(task.summary || "")}</p>${restart ? `<p>You can start it again <a href="${restart}">here</a>.</p>` : act === "stop" ? `<p>You can start a new search <a href="/buy">here</a>.</p>` : ""}<p class="quiet"><a href="/tasks/mine?task=${encodeURIComponent(id)}">Open the Task</a></p>`);
    }
    // The run after each live pull: Vercel cron (CRON_SECRET) or the probe key.
    // The combined Task email (lib/tasks/digest.js): the cron every quarter hour sends each person's email when their
    // setting says it is due, under the six a day cap. A probe may ask for a dry run (&dry=1): nothing sent or marked.
    if (req.method === "GET" && q.send) {
      const isCron = process.env.CRON_SECRET && req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`;
      if (!isCron && !probeOk(req)) return res.status(401).json({ error: "Unauthorized." });
      const { runDigest, runBeforeItEnds } = await import("../lib/tasks/digest.js");
      // The limits ledger keeps nothing past 24 hours (its address keys are daily salted hashes, lib/_addr.js).
      if (isCron) { const { pruneLedger } = await import("../lib/_ceilings.js"); await pruneLedger(env).catch(() => {}); }
      // Before it ends first: its own email two hours before the end, never waiting on the daily email.
      const dry = !isCron && q.dry === "1";
      const bie = await runBeforeItEnds(env, { dry }).catch(e => ({ error: String(e && e.message || e).slice(0, 120), sent: 0, ended: 0, failed: 0 }));
      const out = await runDigest(env, { dry });
      if (!dry) await recordUsageEvent({ event_type: "task_email_run", route: "tasks_send", status: "ok", oldcarsdata_metered_requests: 0, metadata: { people: out.people, sent: out.sent + (bie.sent || 0), capped: out.capped, notDue: out.notDue, emailOff: out.emailOff, matches: out.matches + (bie.sent || 0), endedBeforeSend: bie.ended || 0, failed: out.failed + (bie.failed || 0), beforeItEnds: { sent: bie.sent || 0, off: bie.off || 0, ended: bie.ended || 0, failed: bie.failed || 0, error: bie.error } } }, env.supabaseUrl, env.supabaseKey).catch(() => {});
      return res.status(200).json({ ...out, beforeItEnds: bie });
    }
    if (req.method === "GET" && q.run) {
      const isCron = process.env.CRON_SECRET && req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`;
      if (!isCron && !probeOk(req)) return res.status(401).json({ error: "Unauthorized." });
      const t0 = Date.now();
      // &ifnew=1 (THE cron, 5 minutes after every quarter-hour pull slot, lib/live/pullSchedule.js): exits at once
      // unless a live listing was first seen since the last run started, so a car found by any pull (a full walk
      // or an ending-soonest pull) reaches the tasks within minutes and an empty slot costs one query.
      if (q.ifnew) {
        const last = await supabaseSelect(env, `app_usage_events?event_type=eq.tasks_run&status=eq.ok&select=created_at,metadata&order=created_at.desc&limit=1`).catch(() => null);
        const l = last && last[0], since = l ? new Date(Date.parse(l.created_at) - (Number(l.metadata && l.metadata.ms) || 0) - 60e3).toISOString() : null;
        const fresh = since ? await supabaseSelect(env, `live_listings?first_seen=gt.${encodeURIComponent(since)}&select=id&limit=1`).catch(() => null) : [1];
        // ...unless the last full run is over 4 hours old: the periodic work (still-looking notes) keeps its pace.
        const stale = !l || Date.now() - Date.parse(l.created_at) > 4 * 3600e3;
        if (fresh && !fresh.length && !stale) return res.status(200).json({ ran: 0, nothingNew: true, since });
      }
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
    // Probe: a trim's sales pool under the old literal title filter vs the separator-neutral one (One Box
    // trimIlike + its code re-check), for one make/model, all years in the archive, with sample titles.
    if (req.method === "GET" && q.titlecount && q.make && q.trim && probeOk(req)) {
      const { trimIlike, trimCodePattern } = await import("../lib/onebox.js");
      const H = { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}` };
      const base = `sales_archive?make=ilike.${encodeURIComponent(String(q.make))}${q.model ? `&model=ilike.${encodeURIComponent("*" + q.model + "*")}` : ""}&sale_price=not.is.null&select=listing_title&limit=2000`;
      const get = async pat => { const r = await fetch(`${env.supabaseUrl}/rest/v1/${base}&listing_title=ilike.${encodeURIComponent("*" + pat + "*")}`, { headers: H }); return r.ok ? (await r.json()).map(x => x.listing_title) : `error ${r.status}`; };
      const lit = await get(String(q.trim)), wide = await get(trimIlike(String(q.trim)));
      const re = new RegExp(`(^|[^a-z0-9])${trimCodePattern(String(q.trim))}([^a-z0-9]|$)`, "i");
      const after = Array.isArray(wide) ? wide.filter(t => String(t).toLowerCase().includes(String(q.trim).toLowerCase()) || re.test(t)) : wide;
      const forms = {}; if (Array.isArray(after)) for (const t of after) { const m = new RegExp(trimCodePattern(String(q.trim)), "i").exec(t); const k = m ? m[0] : "?"; forms[k] = (forms[k] || 0) + 1; }
      const rejected = Array.isArray(wide) && Array.isArray(after) ? wide.filter(t => !after.includes(t)).slice(0, 8) : [];
      return res.status(200).json({ before_literal: Array.isArray(lit) ? lit.length : lit, after: Array.isArray(after) ? after.length : after, forms_after: forms, db_wider_but_rejected_in_code: rejected });
    }
    // Probe: live_listings data defects that could touch Tasks matching (currency, km, $0 bids, specials).
    if (req.method === "GET" && q.livecheck && probeOk(req)) {
      const { liveTrust } = await import("../lib/live/liveTrust.js");
      const H = { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}` };
      const rows = [];
      for (let from = 0; from < 20000; from += 1000) {
        const r = await fetch(`${env.supabaseUrl}/rest/v1/live_listings?status=eq.live&select=id,source,listing_title,location,country,currency,current_bid,current_bid_usd,mileage,description,has_reserve,bid_at&order=id.asc`, { headers: { ...H, Range: `${from}-${from + 999}` } });
        if (!r.ok) return res.status(500).json({ error: `read ${r.status}` });
        const page = await r.json(); rows.push(...page); if (page.length < 1000) break;
      }
      const c = { live_rows: rows.length, by_source: {}, currency_not_usd: 0, currency_not_usd_unconverted: 0, foreign_signal_but_usd: 0, km_signal: 0, km_signal_with_mileage: 0, mileage_unit_unknown: 0, bid_zero: 0, bid_null: 0, special: 0 };
      const ex = { currency_not_usd: [], foreign_signal_but_usd: [], km_signal_with_mileage: [], mileage_unit_unknown: [], bid_zero: [], special: [] };
      const exMax = Math.min(500, Number(q.exmax) || 6);
      const push = (k, r, extra) => { if (ex[k].length < exMax) ex[k].push({ id: r.id, title: r.listing_title, ...extra }); };
      for (const r of rows) {
        c.by_source[r.source] = (c.by_source[r.source] || 0) + 1;
        const t = liveTrust(r);
        if (String(r.currency || "USD").toUpperCase() !== "USD") { c.currency_not_usd++; if (r.current_bid_usd == null && Number(r.current_bid) > 0) c.currency_not_usd_unconverted++; push("currency_not_usd", r, { currency: r.currency, bid: r.current_bid, usd: r.current_bid_usd }); }
        if (t.foreignSignal && String(r.currency || "USD").toUpperCase() === "USD") { const k = `${r.source} | ${t.foreignSignal.replace(/^location .*,\s*/, "location ")}`; c.foreign_by = c.foreign_by || {}; c.foreign_by[k] = (c.foreign_by[k] || 0) + 1; c.foreign_signal_but_usd++; push("foreign_signal_but_usd", r, { signal: t.foreignSignal, bid: r.current_bid, country: r.country, location: r.location }); }
        if (t.unit === "km") { c.km_signal++; if (r.mileage) { c.km_signal_with_mileage++; push("km_signal_with_mileage", r, { stored: r.mileage }); } }
        if (r.mileage && t.unit === "unknown") { c.unknown_by = c.unknown_by || {}; const k = `${r.source}${r.description ? "" : " (no description)"}`; c.unknown_by[k] = (c.unknown_by[k] || 0) + 1; c.mileage_unit_unknown++; push("mileage_unit_unknown", r, { stored: r.mileage }); }
        if (r.current_bid != null && Number(r.current_bid) === 0) { c.bid_zero++; push("bid_zero", r, { bid_at: r.bid_at }); }
        if (r.current_bid == null) { c.bid_null++; c.bid_null_by = c.bid_null_by || {}; c.bid_null_by[r.source] = (c.bid_null_by[r.source] || 0) + 1; }
        if (t.milesAssumed) { c.miles_assumed_us = (c.miles_assumed_us || 0) + 1; }
        if (t.unit === "miles" && !t.milesAssumed && r.mileage) c.miles_stated = (c.miles_stated || 0) + 1;
        if (t.special) { c.special_by = c.special_by || {}; c.special_by[t.special] = (c.special_by[t.special] || 0) + 1; c.special++; push("special", r, { why: t.special }); }
      }
      return res.status(200).json({ counts: c, examples: ex });
    }
    // Probe: counts of the old watch_requests rows (reported, never emailed).
    if (req.method === "GET" && q.watchcounts && probeOk(req)) {
      const count = async f => { const r = await fetch(`${env.supabaseUrl}/rest/v1/watch_requests?select=id${f}`, { method: "HEAD", headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, Prefer: "count=exact", Range: "0-0" } }); return r.ok || r.status === 206 ? Number(((r.headers.get("content-range") || "").split("/")[1]) || 0) : `error ${r.status}`; };
      return res.status(200).json({ total: await count(""), with_email: await count("&email=like.*@*"), vin_keys: await count("&vin_norm=not.like.*:*"), search_keys: await count("&vin_norm=like.search:*"), family_or_live_keys: await count("&or=(vin_norm.like.family:*,vin_norm.like.live:*)") });
    }
    // Probe: a real one-time sign-in code for the ONE fixed test address (Supabase admin generate_link),
    // so the browser test can run the normal email-code sign-in end to end without reading an inbox.
    // Probe (Oct 2026, alert emails): the stored records for named lots, and the three real alert emails (a live
    // car with a bid, a live car with no bid, a sold notice) built from stored rows by the real builders and sent
    // ONLY to the fixed test inbox (TEST_EMAIL), subject marked [Test]. Never a real user's address.
    // Probe (Oct 2026): every active task's match on stored live listings, through the real search, listing any
    // car the search admits whose make, model or year does not fit the task (what the hard gate now removes).
    // Read-only: no update, no email.
    if (req.method === "POST" && req.body && req.body.action === "task_match_audit" && probeOk(req)) {
      const { taskFits } = await import("../lib/tasks/tasks.js");
      const { runSearch } = await import("../lib/live/samChat.js");
      const tasks = await (await fetch(`${env.supabaseUrl}/rest/v1/tasks?state=in.(running,needs_you,paused)&kind=eq.hunt&select=id,state,summary,filters&limit=500`, { headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}` } })).json();
      const out = { tasks: 0, matches: 0, mismatches: [] };
      for (const t of tasks || []) {
        if (!t.filters || t.filters.vin) continue;
        out.tasks++;
        const { include_unstated, ...f } = t.filters;
        const sr = await runSearch(env, f, { keep: r => r.status === "live" && !(r.end_time && Date.parse(r.end_time) <= Date.now()) }).catch(() => null);
        for (const x of (sr && sr.matches) || []) {
          out.matches++;
          if (!taskFits(t, x.r)) out.mismatches.push({ task: t.id.slice(0, 8), summary: t.summary, listing: x.r.id, make: x.r.make, model: x.r.model, year: x.r.year, title: String(x.r.listing_title || "").slice(0, 80) });
        }
      }
      return res.status(200).json(out);
    }
    if (req.method === "POST" && req.body && req.body.action === "task_email_tests" && probeOk(req)) {
      const { taskEmailBlocks, taskEmailBody, taskEmailSubject, cardOfMatch } = await import("../lib/tasks/tasks.js");
      const { listingFacts } = await import("../lib/live/search.js");
      const { testSend } = await import("../lib/live/watches.js");
      const { sendTaskEmail } = await import("../lib/_email.js");
      const sel = "id,source,url,listing_title,year,make,model,location,mileage,current_bid,current_bid_usd,currency,end_time,bid_at,status,exterior_color,std_color,description,transmission,vin_norm,first_seen,country";
      const q = async path => { const r = await fetch(`${env.supabaseUrl}/rest/v1/${path}`, { headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}` } }); return r.ok ? r.json() : []; };
      const lot = async (t, loc) => (await q(`live_listings?listing_title=ilike.${encodeURIComponent(t)}&location=ilike.${encodeURIComponent(loc)}&select=${sel}&order=first_seen.desc&limit=1`))[0] || null;
      const lots = { warminster: await lot("*1987*911*Carrera*Targa*", "*Warminster*"), dahlonega: await lot("*1990*911*Carrera 4*Cabriolet*", "*Dahlonega*") };
      const shape = r => r && { id: r.id, status: r.status, current_bid_usd: r.current_bid_usd, current_bid: r.current_bid, currency: r.currency, bid_at: r.bid_at, end_time: r.end_time, venue: r.source };
      const out = { lots: { warminster: shape(lots.warminster), dahlonega: shape(lots.dahlonega) }, sent: [] };
      if (req.body.send) {
        const nowIso = new Date().toISOString();
        const task = { id: "00000000-0000-4000-8000-0000000000e1", summary: "Sam is looking for manual Porsche 911s from 1964 to 1998", filters: { make: "Porsche", model: "911", year_min: 1964, year_max: 1998, gearbox: "manual" } };
        // Both live tests use a car that FITS the test task (the same hard gate a real run uses).
        const { taskFits } = await import("../lib/tasks/tasks.js");
        const { runSearch } = await import("../lib/live/samChat.js");
        // The real matching path: the same search a task run uses, then the hard gate.
        const sr = await runSearch(env, task.filters, { keep: r => r.status === "live" && !(r.end_time && Date.parse(r.end_time) <= Date.now()) });
        const pool = ((sr && sr.matches) || []).map(x => x.r).filter(r => taskFits(task, r));
        const withBid = pool.find(r => Number(r.current_bid_usd) > 0);
        let noBid = pool.find(r => r.current_bid_usd == null || Number(r.current_bid_usd) <= 0), noBidTask = task;
        if (!noBid) {   // none for the manual task right now: the same search for "Porsche 911s from 1964 to 1998"
          noBidTask = { id: "00000000-0000-4000-8000-0000000000e3", summary: "Sam is looking for Porsche 911s from 1964 to 1998", filters: { make: "Porsche", model: "911", year_min: 1964, year_max: 1998 } };
          const sr2 = await runSearch(env, noBidTask.filters, { keep: r => r.status === "live" && !(r.end_time && Date.parse(r.end_time) <= Date.now()) });
          noBid = ((sr2 && sr2.matches) || []).map(x => x.r).filter(r => taskFits(noBidTask, r)).find(r => r.current_bid_usd == null || Number(r.current_bid_usd) <= 0);
        }
        if (!noBid) {   // still none: a Task built from a real US no-bid listing's own make and model (it fits by construction)
          const cand = (await q(`live_listings?status=eq.live&end_time=gt.${nowIso}&current_bid_usd=is.null&country=eq.US&make=not.is.null&model=not.is.null&select=${sel}&order=end_time.asc&limit=20`)) || [];
          const { jobPhrase } = await import("../lib/tasks/tasks.js");
          for (const r of cand) {
            const t = { id: "00000000-0000-4000-8000-0000000000e4", filters: { make: r.make, model: r.model } };
            t.summary = "Sam is looking for " + jobPhrase(t.filters);
            if (taskFits(t, r)) { noBid = r; noBidTask = t; break; }
          }
        }
        for (const [label, r, tk] of [["live, with a bid", withBid, task], ["live, no bids", noBid, noBidTask]]) {
          if (!r) { out.sent.push({ label, error: "no stored listing of this kind right now" }); continue; }
          const card = cardOfMatch({ r, facts: listingFacts(r) });
          const blocks = (await taskEmailBlocks(env, [r], [card])).map(b => ({ ...b, card }));
          const msg = taskEmailBody(tk, blocks, { first: true });
          const subject = "[Test] " + taskEmailSubject([card]);
          const resp = await sendTaskEmail({ to: TEST_EMAIL, subject, text: msg.text, html: msg.html });
          out.sent.push({ label, listing: r.id, subject, status: resp.ok ? "sent" : (resp.reason || resp.error || resp.status), text: msg.text, html: msg.html });
        }
        const soldFrom = lots.warminster || withBid;
        if (soldFrom) {
          const since = new Date(Date.now() - (Number(req.body.soldDays) || 3) * 864e5).toISOString().slice(0, 10);
          const r = await testSend(env, { kind: "spec", listing_id: soldFrom.id, since, to: TEST_EMAIL, first: true, subjectPrefix: "[Test] " });
          out.sent.push({ label: "sold notice", listing: soldFrom.id, status: r.sent || r.error || (r.events === 0 ? "no sale since " + since : null), text: r.text || null, html: r.html || null, subject: r.subject || null, bands: r.bands || null });
        }
        // The sold DIGEST (several sales in one email): the busiest stored spec over the window, so the 10-sale cap
        // and "And N more are in your task." show when stored records hold a spec with more than ten.
        if (req.body.digest) {
          const days = Number(req.body.digestDays) || 30, since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
          const cands = (await q(`live_listings?status=eq.live&end_time=gt.${nowIso}&country=eq.US&current_bid_usd=gt.0&make=in.(Porsche,Chevrolet,Ford,BMW,Mercedes-Benz)&select=id,make,model,year&order=current_bid_usd.desc&limit=40`)) || [];
          let best = null; const seen = new Set();
          for (const c of cands) {
            const k = `${c.make}|${c.model}|${Math.floor(Number(c.year) / 5)}`; if (seen.has(k)) continue; seen.add(k);
            const r = await testSend(env, { kind: "spec", listing_id: c.id, since }).catch(() => null);
            if (r && r.events > ((best && best.events) || 1)) best = { id: c.id, events: r.events };
            if (best && best.events > 10) break;
          }
          if (!best) out.sent.push({ label: "sold digest", error: `no stored spec with two or more sales in ${days} days` });
          else {
            const r = await testSend(env, { kind: "spec", listing_id: best.id, since, to: TEST_EMAIL, first: false, subjectPrefix: "[Test] " });
            out.sent.push({ label: "sold digest", listing: best.id, events: r.events, status: r.sent || r.error, text: r.text || null, html: r.html || null, subject: r.subject || null, bands: r.bands || null });
          }
        }
      }
      return res.status(200).json(out);
    }
    if (req.method === "POST" && req.body && req.body.action === "test_otp" && probeOk(req)) {
      const r = await fetch(`${env.supabaseUrl}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: TEST_EMAIL, data: { signup_ticket: signupTicket(TEST_EMAIL) } }) });
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
    // Probe: the latest task_limit_hit events (indexed: idx_app_usage_events_type_created).
    if (req.method === "POST" && req.body && req.body.action === "test_limit_events" && probeOk(req)) {
      const r = await fetch(`${env.supabaseUrl}/rest/v1/app_usage_events?event_type=eq.task_limit_hit&select=created_at,status,metadata&order=created_at.desc&limit=20`, { headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}` } });
      return res.status(200).json({ events: r.ok ? await r.json() : `error ${r.status}` });
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
        else if (st.apply) { const r = await applyEdit(envT, user, taskId, st.apply, { apiKey, model: CHAT_MODEL, rows: st.rows }); out = { state: r.task && r.task.state, summary: r.task && r.task.summary, error: r.error || null }; }
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
      return res.status(200).json({ tasks: withThreads, suggestions: await suggestions(env, user.userId).catch(() => []), notify: await notifyPrefs(env, user).catch(() => null) });
    }
    if (b.action === "say") {
      const text = String(b.text || "").trim().slice(0, 2000);
      if (!text) return res.status(400).json({ error: "empty" });
      if (!apiKey) return res.status(503).json({ error: "Sam is unavailable right now." });
      // Per account per day (lib/_ceilings.js tasksAllowance, crew exempt): past it, the turn is answered with the
      // paused sentence and nothing else changes (lib/tasks/tasks.js modelTurn).
      const paused = !(await gateOf(req, user)("setup"));
      if (/^[0-9a-f-]{36}$/.test(String(b.task_id || ""))) return res.status(200).json(await taskTurn(env, user, { taskId: b.task_id, text, pending: b.pending || null, apiKey, model: CHAT_MODEL, paused }));
      // No task_id: this is the START of a brand-new task's conversation (nothing is written until
      // "start" below confirms it) - gated the same as "start" itself (Job 3: "Task creation").
      if (!isReleased("tasks", req)) return notReleasedJson(res);
      return res.status(200).json(await draftTurn(env, user, { draft: b.draft || null, text, seed: b.seed || null, apiKey, model: CHAT_MODEL, paused, gate: gateOf(req, user) }));
    }
    if (b.action === "notify") return res.status(200).json(await setNotifyPrefs(env, user, { on: typeof b.on === "boolean" ? b.on : undefined, email: b.email !== undefined ? b.email : undefined, every: typeof b.every === "string" ? b.every : undefined }));
    // Probe: Resend's own record of one email (delivery status), and the sending domain's verification.
    if (b.action === "test_resend" && probeOk(req)) {
      const H = { Authorization: `Bearer ${process.env.RESEND_API_KEY || ""}` };
      const em = b.id ? await (await fetch(`https://api.resend.com/emails/${encodeURIComponent(b.id)}`, { headers: H })).json().catch(e => ({ error: e.message })) : null;
      const doms = await (await fetch("https://api.resend.com/domains", { headers: H })).json().catch(e => ({ error: e.message }));
      const list = Array.isArray(doms && doms.data) ? doms.data : [];
      const detail = [];
      for (const d of list) { const one = await (await fetch(`https://api.resend.com/domains/${d.id}`, { headers: H })).json().catch(() => null); detail.push({ name: d.name, status: d.status, region: d.region, records: one && one.records ? one.records.map(r => ({ record: r.record, type: r.type, name: r.name, status: r.status })) : null }); }
      return res.status(200).json({ email: em && { id: em.id, to: em.to, from: em.from, subject: em.subject, last_event: em.last_event, created_at: em.created_at }, domains: detail, domains_error: doms && doms.message || null });
    }
    // Task CREATION (Job 3): the only way a task row is written. Managing an EXISTING task (list,
    // say with a task_id, notify, apply, control) is never gated - same "someone who already has one
    // must always be able to use it" principle the task-email Pause/Stop/confirm/resume pages follow.
    if (b.action === "start") {
      if (!isReleased("tasks", req)) return notReleasedJson(res);
      return res.status(200).json(await startDraft(env, user, b.draft || {}, { apiKey, model: CHAT_MODEL, visitorId: readVisitorId(req), gate: gateOf(req, user) }));
    }
    // One task at a time (beta): the page shows the choice when a second task is attempted. Every showing
    // and every button is logged as task_limit_hit (the user, the running task, the attempted job, the
    // button). "swap" pauses the running task, then resumes the paused one asked for, or starts the
    // draft; a seeded attempt is drafted by the page once the slot is free. "keep" changes nothing.
    if (b.action === "limit") {
      const ev = ["seen", "swap", "keep"].includes(b.event) ? b.event : null;
      if (!ev) return res.status(400).json({ error: "bad event" });
      const running = /^[0-9a-f-]{36}$/.test(String(b.task_id || "")) ? await getTask(env, b.task_id, user.userId).catch(() => null) : null;
      await recordUsageEvent({ event_type: "task_limit_hit", route: "tasks", status: ev, metadata: { user_id: user.userId, running_task_id: running ? running.id : null, running_task: running ? running.summary : null, attempted_job: String(b.attempted || "").slice(0, 300) || null, mode: ["seed", "draft", "resume"].includes(b.mode) ? b.mode : null, button: ev === "seen" ? null : ev } }, env.supabaseUrl, env.supabaseKey).catch(e => console.error("task_limit_hit log:", e && e.message));
      if (ev !== "swap") return res.status(200).json({ ok: true });
      if (running && ["running", "needs_you"].includes(running.state)) await controlTask(env, user, running.id, "pause", { apiKey, model: CHAT_MODEL });
      if (b.mode === "resume" && /^[0-9a-f-]{36}$/.test(String(b.resume_id || ""))) return res.status(200).json({ ok: true, ...(await controlTask(env, user, String(b.resume_id), "resume", { apiKey, model: CHAT_MODEL })) });
      if (b.mode === "draft" && b.draft) return res.status(200).json({ ok: true, ...(await startDraft(env, user, b.draft, { apiKey, model: CHAT_MODEL, gate: gateOf(req, user) })) });
      return res.status(200).json({ ok: true, paused: running ? running.id : null });
    }
    if (b.action === "apply") return res.status(200).json(await applyEdit(env, user, String(b.task_id || ""), b.pending || null, { apiKey, model: CHAT_MODEL }));
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
    // Probe: send one real email of a TEST task, to Sam's own address or a disposable test inbox (b.to),
    // never a real user's: the latest Sam update, or with kind "start" the first email. Test user only.
    if (b.action === "test_email" && probeOk(req) && user.test) {
      const task = await getTask(env, String(b.task_id), user.userId);
      if (!task) return res.status(404).json({ error: "no such test task" });
      const to = typeof b.to === "string" && /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(b.to) ? b.to : "feedback@goasksam.com";
      if (b.kind === "start") return res.status(200).json({ ...(await sendStartEmail(env, task, null, { to })), to });
      const up = (await taskUpdates(env, task.id)).filter(u => u.role === "sam").pop();
      if (!up) return res.status(400).json({ error: "no Sam update to send" });
      const out = await notify(env, { ...task, email: to }, up, "A car matching your Task just came up", { to });
      return res.status(200).json({ ...out, update_id: up.id, text: up.text, to });
    }
    if (b.action === "test_set" && probeOk(req)) {   // mock time: move a Task's interaction / still-looking stamps
      const patch = {}; for (const k of ["last_interaction_at", "still_looking_sent_at", "checkpoint", "state"]) if (k in b) patch[k] = b[k];
      return res.status(200).json({ task: await saveTask(env, String(b.task_id), patch) });
    }
    return res.status(400).json({ error: "unknown action" });
  } catch (e) {
    console.error("tasks failed:", (e && e.stack) || e);
    return res.status(500).json({ error: String((e && e.message) || e).slice(0, 300) });
  }
}

// Analytics (docs/analytics-events.md): an error event when this route throws or answers 5xx.
export default withTracking("/api/tasks", handler, "tasks");
