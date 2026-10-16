// THE COMBINED TASK EMAIL (Oct 2026, Sam): one email per person with everything new from ALL their Tasks, on the
// person's own setting (accounts.task_email_every): once a day (the default), twice, three times, or "as soon as one
// comes". At most six match emails per person per Pacific day, whatever the setting; what is over the cap waits for
// the next email and is never dropped. Carried here: a Task's new live matches (queued by runTasks), and exact-car
// and sold-car Tasks' new events (lib/live/watches.js). NOT carried, and not counted: "Sam finished your research",
// "Still looking?", the Task start email (they go at once, as before) and Before it ends (runBeforeItEnds below:
// its own email two hours before the end, whatever the setting, never under the daily cap).
// Run by the cron GET /api/tasks?send=1 every quarter hour. A Task's car that ended before its email could go is
// left out (it stays in the Task).
import { notifyPrefs, taskEmailBlocks, taskEmailBody, taskEmailSubject, oftenLine } from "./tasks.js";
import { pendingEvents, messageFor as watchMessage, markWatchSent, fromSibling, noSalesLine } from "../live/watches.js";
import { factsFor, messageFor as alertMessage, WINDOW_MS, JUNK_LINE } from "../live/buyAlerts.js";
import { emailsOffHeaders, emailsOffLink } from "./tasks.js";
import { sendTaskEmail, firstEmailTo } from "../_email.js";
import { liveRows } from "../live/search.js";
import { supabaseSelect } from "../_supabase.js";
import { countSince, record } from "../_ceilings.js";
import { countText } from "../live/rung.js";
import { getDeliveryTargets, emailOf } from "./delivery.js";

export const MATCH_EMAILS_PER_DAY = 6;
// Send times, Pacific: "08:00" etc. "instant" has none (every run).
export const SLOTS = { daily: ["08:00"], twice: ["08:00", "17:00"], thrice: ["08:00", "12:00", "17:00"], instant: null };
const SITE = "https://goasksam.com";
const H = 3600e3;

const PTF = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const parts = t => Object.fromEntries(PTF.formatToParts(new Date(t)).map(x => [x.type, Number(x.value)]));
const offsetAt = t => { const p = parts(t); return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute) - Math.floor(t / 60e3) * 60e3; };
// The instant of a Pacific wall-clock time on the Pacific day of `t` plus `addDays`.
function ptWall(t, addDays, hh, mm) {
  const p = parts(t), g = Date.UTC(p.year, p.month - 1, p.day + addDays, hh, mm);
  return g - offsetAt(g - offsetAt(g));
}
export const ptMidnight = t => ptWall(t, 0, 0, 0);
function slotList(every, t) {
  const s = SLOTS[every] || SLOTS.daily, out = [];
  for (const d of [-1, 0, 1]) for (const hm of s) { const [h, m] = hm.split(":").map(Number); out.push(ptWall(t, d, h, m)); }
  return out.sort((a, b) => a - b);
}
// Due now: "instant" always; otherwise when no email has gone since the latest send time that has passed.
export function isDue(every, lastSentAt, now) {
  if (every === "instant") return true;
  const t = now.getTime(), last = slotList(every, t).filter(x => x <= t).pop();
  return last != null && (lastSentAt == null || lastSentAt < last);
}
// The person's next send time after now ("instant": the usual three hours, Before it ends' own window).
export function nextSend(every, now) {
  const t = now.getTime();
  if (every === "instant") return new Date(t + 3 * H);
  return new Date(slotList(every, t).find(x => x > t));
}

// Production data access; a test passes its own (no network).
// DATA PULLED (Lane D, Oct 2026, the Tasks read reductions): bytes of every body this helper reads, the same tally
// lib/_supabase.js keeps for its own reads, so a send run can report what it pulled (api/tasks.js bytesRead).
let restBytes = 0;
export function digestBytesSoFar() { return restBytes; }
async function rest(env, path, method = "GET", body) {
  const r = await fetch(`${env.supabaseUrl}/rest/v1/${path}`, { method, headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, "Content-Type": "application/json", Prefer: "return=minimal" }, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`${path.split("?")[0]} ${r.status}`);
  if (method !== "GET") return null;
  const text = await r.text(); restBytes += text.length; return JSON.parse(text);
}
// The watch columns the send path reads (lib/live/watches.js pendingEvents/markWatchSent/messageFor, fromSibling,
// noSalesLine, and the paused check here); never select=*.
const WATCH_COLS = "id,user_id,kind,key,label,spec,baseline_date,created_at,last_event_at,last_event,last_sent_at,paused_at";
export const realIo = env => ({
  queuedUpdates: () => rest(env, "task_updates?kind=eq.match&email_status=eq.queued&select=id,task_id,listing_ids,data,created_at&order=created_at.asc&limit=1000"),
  tasks: async ids => ids.length ? rest(env, `tasks?id=in.(${ids.join(",")})&select=id,user_id,email,channels,summary,filters,state,words,kind`) : [],
  // READ ONLY THE PEOPLE DUE (Lane D, Oct 2026): who has an active, unpaused watch is one small column read before
  // the due gate; a person's watch rows (named columns) are read only once they are due and under the cap.
  watchUsers: () => rest(env, "watches?stopped_at=is.null&paused_at=is.null&select=user_id&limit=2000").catch(() => []),
  // The whole-table read as it was (select=*), kept ONLY for the dry-run measurement (opts.legacy, api/tasks.js
  // &legacy=1&dry=1) so the bytes before and after can be read back to back on the same data; never the cron's path.
  watches: () => rest(env, "watches?stopped_at=is.null&select=*&order=created_at.asc&limit=2000").catch(() => []),
  watchesFor: userId => rest(env, `watches?stopped_at=is.null&paused_at=is.null&user_id=eq.${userId}&select=${WATCH_COLS}&order=created_at.asc&limit=200`).catch(() => []),
  // The armed cars' end time and status only; the full live row (description included, which the facts need) is
  // read only for the cars inside the window whose owner is getting the email.
  liveSlim: ids => supabaseSelect(env, `live_listings?id=in.(${ids.join(",")})&status=eq.live&select=id,end_time,status`),
  armedAlerts: () => rest(env, "buy_alerts?sent_at=is.null&cancelled_at=is.null&select=id,user_id,email,listing_id&order=armed_at.asc&limit=2000"),
  // The one-per-car claim: sets sent_at only while it is still empty, so two runs can never both send one car.
  claimAlert: async id => { const r = await fetch(`${env.supabaseUrl}/rest/v1/buy_alerts?id=eq.${id}&sent_at=is.null`, { method: "PATCH", headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ sent_at: new Date().toISOString(), send_status: "sending" }) }); if (!r.ok) throw new Error("claim " + r.status); return (await r.json()).length === 1; },
  finishAlert: (id, status, release) => rest(env, `buy_alerts?id=eq.${id}`, "PATCH", release ? { sent_at: null, send_status: status } : { send_status: status }),
  markAlert: (id, status) => rest(env, `buy_alerts?id=eq.${id}&sent_at=is.null`, "PATCH", { sent_at: new Date().toISOString(), send_status: status }),
  alertFacts: row => factsFor(env, row),
  patchUpdate: (id, patch) => rest(env, `task_updates?id=eq.${id}`, "PATCH", patch),
  liveRows: ids => liveRows(env, `id=in.(${ids.join(",")})`),
  prefs: userId => notifyPrefs(env, { userId }),
  // Where this person's email goes: the one delivery decision (lib/tasks/delivery.js), the sign-in address only.
  targets: userId => getDeliveryTargets(env, userId),
  sentToday: (userId, now) => countSince(env, "user:" + userId, "e:match", new Date(ptMidnight(now.getTime())).toISOString()),
  lastSent: async userId => { const r = await rest(env, `ip_rate_hits?ip=eq.${encodeURIComponent("user:" + userId)}&kind=eq.e:match&select=created_at&order=created_at.desc&limit=1`).catch(() => []); return r && r[0] ? Date.parse(r[0].created_at) : null; },
  recordSent: userId => record(env, ["user:" + userId], "e:match"),
  blocks: (rows, cards) => taskEmailBlocks(env, rows, cards),
  pendingEvents: w => pendingEvents(env, w),
  markWatch: (w, evs, status, now) => markWatchSent(env, w, evs, status, now),
  first: email => firstEmailTo(env, email),
  send: m => sendTaskEmail(m)
});

const esc = x => String(x).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// One quiet section, last in the email: a line each for the Tasks set up from a sibling answer whose own car has not
// sold yet (lib/live/watches.js noSalesLine), so the email says so and never stands the sibling in for it.
export function quietSection(lines) {
  return lines.length ? { quiet: true, subject: null, cars: 0, text: lines.join("\n"), html: lines.map(l => `<p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:15px;color:#1A1A1A">${esc(l)}</p>`).join("") } : null;
}
// Compose the one email from its sections (each { subject, text, html, cars }).
// A quiet section (quietSection: a Task with nothing new) is never counted as an update in the subject.
export function composeDigest(sections, { every, first, stopAll }) {
  const real = sections.filter(s => !s.quiet);
  const n = countText(real.length), subject = real.length === 1 ? real[0].subject : `${n.charAt(0).toUpperCase() + n.slice(1)} updates from your Tasks`;
  const foot = oftenLine(every);
  const text = sections.map(s => s.text).join("\n\n· · ·\n\n") + `\n\n${foot} ${SITE}/tasks/mine${stopAll ? `\nStop all Task emails: ${stopAll}` : ""}\n\n${first ? JUNK_LINE + "\n\n" : ""}GoAskSam`;
  const html = `<div style="max-width:560px">${sections.map(s => s.html).join('<hr style="border:0;border-top:1px solid #E6E1D8;margin:26px 0">')}<p style="font-family:Arial,sans-serif;font-size:14px;color:#5F5A53;margin-top:26px">${esc(foot)} <a href="${SITE}/tasks/mine" style="color:#1A1A1A">Open your Tasks</a>${stopAll ? ` &nbsp;·&nbsp; <a href="${esc(stopAll)}" style="color:#1A1A1A">Stop all Task emails</a>` : ""}</p>${first ? `<p style="font-family:Arial,sans-serif;font-size:13px;color:#5F5A53">${esc(JUNK_LINE)}</p>` : ""}<p style="font-family:Arial,sans-serif;font-size:13px;color:#5F5A53">GoAskSam</p></div>`;
  return { subject, text, html };
}

export async function runDigest(env, opts = {}) {
  // Every data call returns a promise, whatever the helper returns (Oct 12: a plain [] broke the first live run).
  const raw = opts.io || realIo(env), now = opts.now ? new Date(opts.now) : new Date(Date.now());
  const io0 = Object.fromEntries(Object.entries(raw).map(([k, f]) => [k, (...a) => Promise.resolve().then(() => f(...a))]));
  // A dry run reads everything and writes nothing (no status marks, no send).
  const io = opts.dry ? { ...io0, patchUpdate: async () => {}, markAlert: async () => {}, markWatch: async () => {}, recordSent: async () => {} } : io0;
  const report = { people: 0, sent: 0, capped: 0, notDue: 0, emailOff: 0, matches: 0, endedBeforeSend: 0, failed: 0, details: [] };
  const queued = (await io.queuedUpdates().catch(() => null)) || [];
  const taskRows = await io.tasks([...new Set(queued.map(u => u.task_id))]).catch(() => []);
  const taskById = new Map((taskRows || []).map(t => [t.id, t]));
  // Who has watches (one column) when the io offers the slim read; an io without it (older fixtures) hands the rows.
  const watchUsers = (io.watchUsers && !opts.legacy) ? ((await io.watchUsers().catch(() => null)) || []) : null;
  const watchesAll = watchUsers ? [] : ((await io.watches().catch(() => null)) || []);
  const people = new Map();
  const person = uid => { if (!uid) return null; if (!people.has(uid)) people.set(uid, { uid, updates: [], watches: [] }); return people.get(uid); };
  for (const u of queued) { const t = taskById.get(u.task_id); const p = t && person(t.user_id); if (p) p.updates.push({ u, t }); }
  if (watchUsers) for (const w of watchUsers) person(w.user_id);
  else for (const w of watchesAll) { const p = !w.paused_at && person(w.user_id); if (p) p.watches.push(w); }

  for (const p of people.values()) {
    report.people++;
    const prefs = (await io.prefs(p.uid).catch(() => null)) || { on: true, every: "daily" };
    const every = prefs.every || "daily", to = emailOf(await io.targets(p.uid).catch(() => []));
    const d = { user: p.uid.slice(0, 8), every };
    if (!prefs.on || !to) {
      // Email off, or no confirmed sign-in address: the Task's updates stay in the Task; nothing is emailed or held.
      for (const { u } of p.updates) await io.patchUpdate(u.id, { email_status: prefs.on ? "no_sign_in_address" : "off" }).catch(() => {});
      report.emailOff++; d.result = prefs.on ? "no sign-in address" : "email off"; report.details.push(d); continue;
    }
    if (!isDue(every, await io.lastSent(p.uid).catch(() => null), now)) { report.notDue++; d.result = "not due"; report.details.push(d); continue; }
    const today = await io.sentToday(p.uid, now).catch(() => null);
    if (today != null && today >= MATCH_EMAILS_PER_DAY) { report.capped++; d.result = `capped (${today} today), held for the next email`; report.details.push(d); continue; }
    // Due and under the cap: now this person's watch rows (named columns), never anyone else's.
    if (watchUsers) p.watches = ((await (io.watchesFor ? io.watchesFor(p.uid) : Promise.resolve([])).catch(() => null)) || []).filter(w => !w.paused_at);

    const sections = [], marks = [];
    // 1. Each Task's new live matches (cars that ended since are left out; they stay in the Task).
    const byTask = new Map(); for (const x of p.updates) { if (!byTask.has(x.t.id)) byTask.set(x.t.id, { t: x.t, ups: [] }); byTask.get(x.t.id).ups.push(x.u); }
    for (const { t, ups } of byTask.values()) {
      if (t.state === "done" || t.state === "paused") { for (const u of ups) await io.patchUpdate(u.id, { email_status: t.state === "paused" ? "paused" : "done" }).catch(() => {}); continue; }
      const seen = new Set(), cards = [];
      for (const u of ups) for (const c of (u.data && u.data.cards) || []) if (!seen.has(Number(c.id))) { seen.add(Number(c.id)); cards.push(c); }
      const rows = cards.length ? ((await io.liveRows(cards.map(c => Number(c.id))).catch(() => null)) || null) : [];
      if (rows == null) continue;   // the live read failed: these wait for the next run
      const live = cards.filter(c => rows.some(r => Number(r.id) === Number(c.id) && (!r.end_time || Date.parse(r.end_time) > now.getTime())));
      if (!live.length) { for (const u of ups) await io.patchUpdate(u.id, { email_status: "ended" }).catch(() => {}); continue; }
      const shown = live.slice(0, 10);
      const blocks = ((await io.blocks(rows, shown).catch(() => [])) || []).map(b => ({ ...b, card: shown.find(c => Number(c.id) === Number(b.id)) }));
      const body = taskEmailBody(t, blocks, { more: live.length - shown.length, section: true });
      sections.push({ subject: taskEmailSubject(live), text: body.text, html: body.html, cars: live.length, taskId: t.id });
      marks.push(st => Promise.all(ups.map(u => io.patchUpdate(u.id, { emailed_at: now.toISOString(), email_status: st }))));
    }
    // 2. Exact-car and sold-car Tasks: their new events. A Task from a sibling answer whose car has never sold gets
    // one line saying so (only in an email that is going anyway; it never sends one on its own).
    const quiet = [];
    for (const w of p.watches) {
      const evs = await io.pendingEvents(w).catch(() => null);
      if (evs && !evs.length && fromSibling(w) && !w.last_event) quiet.push(noSalesLine(w));
      if (!evs || !evs.length) continue;
      const msg = watchMessage(w, evs.slice(0, 10), { now, more: Math.max(0, evs.length - 10), oldest: evs.map(e => String(e.date || "")).filter(Boolean).sort()[0] || null, section: true });
      sections.push({ ...msg, cars: evs.length });
      marks.push(st => io.markWatch(w, evs, st, now));
    }
    if (!sections.length) { d.result = "nothing new"; report.details.push(d); continue; }
    const qs = quietSection(quiet); if (qs) sections.push(qs);

    const first = await io.first(to).catch(() => false);
    const mail = composeDigest(sections, { every, first, stopAll: emailsOffLink(p.uid) });
    const headers = emailsOffHeaders(p.uid);   // one click stops every Task email for this person, nothing else
    const r = opts.dry ? { ok: true, dry: true } : await io.send({ to, subject: mail.subject, text: mail.text, html: mail.html, headers }).catch(e => ({ ok: false, error: e.message }));
    const status = r.dry ? "dry" : r.ok ? "sent" : r.skipped ? "skipped_" + (r.reason || "") : ("failed: " + String(r.error || r.status || "unknown")).slice(0, 200);
    if (!opts.dry) { for (const m of marks) await m(status).catch(() => {}); if (r.ok) await io.recordSent(p.uid).catch(() => {}); }
    if (r.ok) { report.sent++; report.matches += sections.reduce((n, x) => n + (Number(x.cars) || 0), 0); }
    else if (!r.dry && !r.skipped) report.failed++;
    report.details.push({ ...d, result: status, sections: sections.length, subject: mail.subject, sentToday: (today || 0) + (r.ok ? 1 : 0), mail: opts.withMail ? mail : undefined });
  }
  return report;
}

// BEFORE IT ENDS (Oct 12 2026, Sam): its own email, two hours before the auction ends, whatever the person's Task
// email setting. Every quarter-hour run sends each armed car whose auction ends within two hours, so it goes in the
// first run inside the two hours (a car armed later than that goes in the next run, if it has not ended). Once per
// car per person: the row is claimed (sent_at set only while empty) before the send, so no run sends it twice and a
// later end time (extended bidding) sends nothing more. Never folded into the daily email, never counted against or
// held by the six-a-day cap. "Email updates" off: never sent (marked off). The one-click stop of all Task emails turns
// that switch off, so it stops these too. A car that ended before any run reached it is marked ended_before_send.
// A failed send gives the claim back, so the next run tries again while the car is still live.
export async function runBeforeItEnds(env, opts = {}) {
  const raw = opts.io || realIo(env), now = opts.now ? new Date(opts.now) : new Date(Date.now()), t = now.getTime();
  const io = Object.fromEntries(Object.entries(raw).map(([k, f]) => [k, (...a) => Promise.resolve().then(() => f(...a))]));
  const report = { armed: 0, sent: 0, notYet: 0, off: 0, ended: 0, failed: 0, lost: 0, details: [] };
  const armed = await io.armedAlerts().catch(() => null);
  if (!armed || !armed.length) return report;
  report.armed = armed.length;
  // PASS 1 (Lane D, Oct 2026, the read reductions): the armed cars' end time and status only (liveSlim; an io without
  // it reads its full rows, the same checks), deciding ended / not yet / email off. PASS 2 reads the full live row
  // (description included) only for the cars inside the window whose owner is getting the email.
  const ids = [...new Set(armed.map(a => Number(a.listing_id)))];
  const slimRead = (io.liveSlim && !opts.legacy) ? io.liveSlim : io.liveRows;
  const slim = [];
  for (let i = 0; i < ids.length; i += 100) {
    const r = await slimRead(ids.slice(i, i + 100)).catch(() => null);
    if (r == null) return { ...report, note: "live read failed: nothing decided this run" };
    slim.push(...r);
  }
  const slimById = new Map(slim.map(r => [Number(r.id), r]));
  const prefsOf = new Map();
  const due = [];
  for (const a of armed) {
    const srow = slimById.get(Number(a.listing_id)), end = srow ? Date.parse(srow.end_time || "") : NaN;
    const d = { alert: String(a.id).slice(0, 8), user: String(a.user_id).slice(0, 8), listing: a.listing_id };
    // The live read returns live cars only: a car missing from a good read, or past its end, has ended.
    if (!srow || (end && end <= t)) { if (!opts.dry) await io.markAlert(a.id, "ended_before_send").catch(() => {}); report.ended++; report.details.push({ ...d, result: "ended before any run reached it" }); continue; }
    if (!end || end - t > WINDOW_MS) { report.notYet++; continue; }
    if (!prefsOf.has(a.user_id)) prefsOf.set(a.user_id, { ...((await io.prefs(a.user_id).catch(() => null)) || { on: true }), to: emailOf(await io.targets(a.user_id).catch(() => [])) });
    const prefs = prefsOf.get(a.user_id), to = prefs.to;
    if (!prefs.on || !to) { if (!opts.dry) await io.markAlert(a.id, "off").catch(() => {}); report.off++; report.details.push({ ...d, result: "email updates off" }); continue; }
    due.push({ a, d, to });
  }
  const fullIds = [...new Set(due.map(x => Number(x.a.listing_id)))];
  const rows = [];
  for (let i = 0; i < fullIds.length; i += 100) {
    const r = await io.liveRows(fullIds.slice(i, i + 100)).catch(() => null);
    if (r == null) return { ...report, note: "live read failed: the cars inside the window were not decided this run" };
    rows.push(...r);
  }
  const byId = new Map(rows.map(r => [Number(r.id), r]));
  for (const { a, d, to } of due) {
    const row = byId.get(Number(a.listing_id)), end = row ? Date.parse(row.end_time || "") : NaN;
    // Ended between the two reads (or no longer live): the same outcome pass 1 gives an ended car.
    if (!row || (end && end <= t)) { if (!opts.dry) await io.markAlert(a.id, "ended_before_send").catch(() => {}); report.ended++; report.details.push({ ...d, result: "ended before any run reached it" }); continue; }
    if (!opts.dry && !(await io.claimAlert(a.id).catch(() => false))) { report.details.push({ ...d, result: "already claimed" }); continue; }
    const f = await io.alertFacts(row).catch(() => null);
    if (!f) { if (!opts.dry) await io.finishAlert(a.id, "facts failed", true).catch(() => {}); report.failed++; continue; }
    const first = await io.first(to).catch(() => false);
    const msg = alertMessage(f, row, { first, userId: a.user_id, now, stopAll: emailsOffLink(a.user_id) });
    const r = opts.dry ? { ok: true, dry: true } : await io.send({ to, subject: msg.subject, text: msg.text, html: msg.html, headers: emailsOffHeaders(a.user_id) }).catch(e => ({ ok: false, error: e.message }));
    const status = r.dry ? "dry" : r.ok ? "sent" : r.skipped ? "skipped_" + (r.reason || "") : ("failed: " + String(r.error || r.status || "unknown")).slice(0, 200);
    // A failure gives the claim back (the next run tries again while the car is live); anything else keeps it.
    if (!opts.dry) await io.finishAlert(a.id, status, !r.ok && !r.skipped).catch(() => { report.lost++; });
    if (r.ok) report.sent++; else if (!r.skipped) report.failed++;
    report.details.push({ ...d, result: status, endsInMin: Math.round((end - t) / 60e3), subject: msg.subject, mail: opts.withMail ? msg : undefined });
  }
  return report;
}
