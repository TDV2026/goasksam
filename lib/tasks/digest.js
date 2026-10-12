// THE COMBINED TASK EMAIL (Oct 2026, Sam): one email per person with everything new from ALL their Tasks, on the
// person's own setting (accounts.task_email_every): once a day (the default), twice, three times, or "as soon as one
// comes". At most six match emails per person per Pacific day, whatever the setting; what is over the cap waits for
// the next email and is never dropped. Carried here: a Task's new live matches (queued by runTasks), exact-car and
// sold-car Tasks' new events (lib/live/watches.js), and Before it ends cars (lib/live/buyAlerts.js). NOT carried, and
// not counted: "Sam finished your research", "Still looking?" and the Task start email (they go at once, as before).
// Run by the cron GET /api/tasks?send=1 every quarter hour. A car that ended before its email could go is left out
// (a Task's ended cars stay in the Task; an armed Before it ends car is marked ended_before_send).
import { notifyPrefs, taskEmailBlocks, taskEmailBody, taskEmailSubject, oftenLine } from "./tasks.js";
import { pendingEvents, messageFor as watchMessage, markWatchSent } from "../live/watches.js";
import { dueForPerson, markAlert, JUNK_LINE } from "../live/buyAlerts.js";
import { emailsOffHeaders, emailsOffLink } from "./tasks.js";
import { sendTaskEmail, firstEmailTo } from "../_email.js";
import { liveRows } from "../live/search.js";
import { countSince, record } from "../_ceilings.js";

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
async function rest(env, path, method = "GET", body) {
  const r = await fetch(`${env.supabaseUrl}/rest/v1/${path}`, { method, headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, "Content-Type": "application/json", Prefer: "return=minimal" }, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`${path.split("?")[0]} ${r.status}`);
  return method === "GET" ? r.json() : null;
}
export const realIo = env => ({
  queuedUpdates: () => rest(env, "task_updates?kind=eq.match&email_status=eq.queued&select=id,task_id,listing_ids,data,created_at&order=created_at.asc&limit=1000"),
  tasks: async ids => ids.length ? rest(env, `tasks?id=in.(${ids.join(",")})&select=id,user_id,email,channels,summary,filters,state,words,kind`) : [],
  watches: () => rest(env, "watches?stopped_at=is.null&select=*&order=created_at.asc&limit=2000").catch(() => []),
  armedUsers: () => rest(env, "buy_alerts?sent_at=is.null&cancelled_at=is.null&select=user_id&limit=2000").catch(() => []),
  patchUpdate: (id, patch) => rest(env, `task_updates?id=eq.${id}`, "PATCH", patch),
  liveRows: ids => liveRows(env, `id=in.(${ids.join(",")})`),
  prefs: (userId, email) => notifyPrefs(env, { userId, email }),
  sentToday: (userId, now) => countSince(env, "user:" + userId, "e:match", new Date(ptMidnight(now.getTime())).toISOString()),
  lastSent: async userId => { const r = await rest(env, `ip_rate_hits?ip=eq.${encodeURIComponent("user:" + userId)}&kind=eq.e:match&select=created_at&order=created_at.desc&limit=1`).catch(() => []); return r && r[0] ? Date.parse(r[0].created_at) : null; },
  recordSent: userId => record(env, ["user:" + userId], "e:match"),
  blocks: (rows, cards) => taskEmailBlocks(env, rows, cards),
  pendingEvents: w => pendingEvents(env, w),
  markWatch: (w, evs, status, now) => markWatchSent(env, w, evs, status, now),
  dueAlerts: (userId, by, now) => dueForPerson(env, userId, by, now),
  markAlert: (id, status) => markAlert(env, id, status),
  first: email => firstEmailTo(env, email),
  send: m => sendTaskEmail(m)
});

const esc = x => String(x).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// Compose the one email from its sections (each { subject, text, html, cars }).
export function composeDigest(sections, { every, first, stopAll }) {
  const subject = sections.length === 1 ? sections[0].subject : `${sections.length} updates from your Tasks`;
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
  const watches = (await io.watches().catch(() => null)) || [];
  const armed = (await io.armedUsers().catch(() => null)) || [];
  const people = new Map();
  const person = (uid, email) => { if (!uid) return null; if (!people.has(uid)) people.set(uid, { uid, email, updates: [], watches: [] }); const p = people.get(uid); p.email = p.email || email; return p; };
  for (const u of queued) { const t = taskById.get(u.task_id); const p = t && person(t.user_id, t.email); if (p) p.updates.push({ u, t }); }
  for (const w of watches) { const p = !w.paused_at && person(w.user_id, w.email); if (p) p.watches.push(w); }
  for (const a of armed) person(a.user_id, null);

  for (const p of people.values()) {
    report.people++;
    const prefs = (await io.prefs(p.uid, p.email).catch(() => null)) || { on: true, email: p.email, every: "daily" };
    const every = prefs.every || "daily", to = prefs.email || p.email;
    const d = { user: p.uid.slice(0, 8), every };
    if (!prefs.on || !to) {
      // Email off: the Task's updates stay in the Task; nothing is emailed or held.
      for (const { u } of p.updates) await io.patchUpdate(u.id, { email_status: "off" }).catch(() => {});
      report.emailOff++; d.result = "email off"; report.details.push(d); continue;
    }
    if (!isDue(every, await io.lastSent(p.uid).catch(() => null), now)) { report.notDue++; d.result = "not due"; report.details.push(d); continue; }
    const today = await io.sentToday(p.uid, now).catch(() => null);
    if (today != null && today >= MATCH_EMAILS_PER_DAY) { report.capped++; d.result = `capped (${today} today), held for the next email`; report.details.push(d); continue; }

    const sections = [], marks = [];
    // 1. Before it ends: cars that end before the person's next email.
    const al = (await io.dueAlerts(p.uid, nextSend(every, now), now).catch(() => null)) || { due: [], ended: [] };
    for (const a of al.ended) await io.markAlert(a.id, "ended_before_send").catch(() => {});
    report.endedBeforeSend += al.ended.length;
    for (const x of al.due) { sections.push({ ...x.msg, cars: 1 }); marks.push(st => io.markAlert(x.alert.id, st)); }
    // 2. Each Task's new live matches (cars that ended since are left out; they stay in the Task).
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
    // 3. Exact-car and sold-car Tasks: their new events.
    for (const w of p.watches) {
      const evs = await io.pendingEvents(w).catch(() => null);
      if (!evs || !evs.length) continue;
      const msg = watchMessage(w, evs.slice(0, 10), { now, more: Math.max(0, evs.length - 10), oldest: evs.map(e => String(e.date || "")).filter(Boolean).sort()[0] || null, section: true });
      sections.push({ ...msg, cars: evs.length });
      marks.push(st => io.markWatch(w, evs, st, now));
    }
    if (!sections.length) { d.result = "nothing new"; report.details.push(d); continue; }

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
