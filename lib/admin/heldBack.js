// HELD BACK (Lane D, Oct 26 2026): people stopped by a daily limit, read from the limit_hit event (lib/_ceilings.js).
// Two jobs, one read: the Launch tab's "Held back" panel and the email when five or more different visitors hit the
// Market Check daily cap inside one hour. READ ONLY apart from the one email; it computes no product answer.
//
// Rules this file keeps:
//   - Visitors are counted by the analytics visitor id (anon_id) and never listed. No address, device key or account is
//     returned or put in the email. limit_hit rows that carry no visitor id are counted as hits and shown as "no id".
//   - Bots and internal (crew, test, admin) traffic are left out. The panel's include-crew switch adds internal rows back.
//   - The email goes to the ADMIN_EMAILS accounts through the existing mail path (lib/_email.js sendTaskEmail), at most
//     one an hour, with no address, name or count of anything personal in it. No new secret.
import { supabaseSelectAll } from "../_supabase.js";

const HOUR = 3600000, DAY = 24 * HOUR;
export const ALERT_VISITORS = 5;              // distinct visitors at the Market Check cap inside one hour
export const ALERT_KIND = "held_back_alert";  // the once-an-hour record, in the ceilings ledger
const TTL_MS = 60000;
const cache = new Map();

const enc = encodeURIComponent;
const PT = "America/Los_Angeles";
let dayFmt = null, hourFmt = null;
const dayKey = ts => { dayFmt = dayFmt || new Intl.DateTimeFormat("en-CA", { timeZone: PT, year: "numeric", month: "2-digit", day: "2-digit" }); return dayFmt.format(new Date(ts)); };
function hourKey(ts) {
  hourFmt = hourFmt || new Intl.DateTimeFormat("en-US", { timeZone: PT, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });
  const p = {}; for (const x of hourFmt.formatToParts(new Date(ts))) p[x.type] = x.value;
  return `${p.year}-${p.month}-${p.day} ${p.hour}:00`;
}

// Rows of limit_hit for the last `days` days: ts, product, anon_id, props. Bots out; internal out unless crew.
export async function readHeldBack(env, { crew = false, days = 7, now = Date.now() } = {}) {
  const from = new Date(now - days * DAY).toISOString();
  const rows = await supabaseSelectAll(env, `analytics_events?ts=gte.${enc(from)}&name=eq.limit_hit&is_bot=eq.false${crew ? "" : "&internal=eq.false"}&select=ts,product,anon_id,props&order=ts.asc`);
  if (rows === null) throw new Error("read failed");
  return rows;
}

const routeOf = e => { const p = e.props || {}; return p.scope ? `${e.product || "site"} ${p.scope}` : (e.product || "site"); };
const limitOf = e => (e.props || {}).limit || "?";

// The panel's numbers. rows: from readHeldBack. Counts only.
export function buildHeldBack(rows, now = Date.now()) {
  const today = dayKey(now), cut = now - 7 * DAY;
  const wk = rows.filter(e => Date.parse(e.ts) >= cut);
  const td = wk.filter(e => dayKey(e.ts) === today);
  const tally = list => { const ids = new Set(); let noId = 0; for (const e of list) { if (e.anon_id) ids.add(e.anon_id); else noId++; } return { hits: list.length, visitors: ids.size, no_id: noId }; };
  const split = f => {
    const m = new Map();
    for (const e of wk) { const k = f(e); const o = m.get(k) || { k, today: 0, week: 0 }; o.week++; if (dayKey(e.ts) === today) o.today++; m.set(k, o); }
    return [...m.values()].sort((a, b) => b.week - a.week || b.today - a.today);
  };
  const busiest = list => { const m = new Map(); for (const e of list) { const k = hourKey(e.ts); m.set(k, (m.get(k) || 0) + 1); } const top = [...m.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1))[0]; return top ? { hour: top[0], hits: top[1] } : null; };
  return { read: true, today: tally(td), week: tally(wk), by_route: split(routeOf), by_limit: split(limitOf), busiest_today: busiest(td), busiest_week: busiest(wk), tz: "Pacific" };
}
export const heldBackUnread = () => ({ read: false, today: { hits: 0, visitors: 0, no_id: 0 }, week: { hits: 0, visitors: 0, no_id: 0 }, by_route: [], by_limit: [], busiest_today: null, busiest_week: null, tz: "Pacific" });

export async function heldBackPanel(env, crew = false) {
  const key = crew ? "crew" : "visitors", hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.v;
  let v;
  try { v = buildHeldBack(await readHeldBack(env, { crew })); } catch { v = heldBackUnread(); }
  cache.set(key, { at: Date.now(), v });
  return v;
}

// ---- the alert
// Different visitors who hit the Market Check cap in the hour before `now`. Rows with no visitor id cannot be told apart,
// so they never count toward the five.
export function marketCheckBurst(rows, now = Date.now()) {
  const ids = new Set();
  for (const e of rows) {
    if (e.product !== "market_check" || !e.anon_id) continue;
    const t = Date.parse(e.ts); if (!(t > now - HOUR && t <= now + 60000)) continue;
    ids.add(e.anon_id);
  }
  return ids.size;
}

export const adminRecipients = (raw = process.env.ADMIN_EMAILS) => [...new Set(String(raw || "").toLowerCase().split(/[\s,;]+/).filter(x => x.includes("@")))];

export function heldBackEmail(visitors) {
  const subject = "Visitors are hitting the Market Check daily limit";
  const paras = [`${visitors} different visitors reached the Market Check daily limit in the last hour.`,
    "Open the Launch tab on the admin page and look at the Held back panel for the route, the limit and the busiest hour.",
    "This note is sent at most once an hour."];
  const text = paras.join("\n\n") + "\n\nGoAskSam";
  const esc = x => String(x).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1A1A1A;max-width:560px">${paras.map(p => `<p>${esc(p)}</p>`).join("")}<p>GoAskSam</p></div>`;
  return { subject, text, html };
}

// always: true sends whether Task emails are on or off (the switch is for Task mail, and an alert must never fail silently).
// seen() -> bool: an email already went in the last hour. mark(): record that one is going. Both are the ceilings ledger.
// Marked before sending so two instances send one. send defaults to the existing mail path.
export async function maybeSendHeldBackAlert({ rows, now = Date.now(), recipients = adminRecipients(), seen, mark, send }) {
  const visitors = marketCheckBurst(rows, now);
  if (visitors < ALERT_VISITORS) return { sent: null, visitors };
  if (!recipients.length) return { sent: null, visitors, skipped: "no admin accounts" };
  if (await seen()) return { sent: null, visitors, already: true };
  await mark();
  const msg = heldBackEmail(visitors);
  const sender = send || (await import("../_email.js")).sendTaskEmail;
  const results = [];
  for (const to of recipients) {
    const r = await sender({ to, subject: msg.subject, text: msg.text, html: msg.html, always: true }).catch(e => ({ ok: false, error: String(e && e.message || e) }));
    results.push(r && r.ok ? "sent" : r && r.skipped ? "skipped_" + (r.reason || "") : "failed");
  }
  return { sent: true, visitors, to: results.length, results, ...msg };
}

// The hourly cron's entry (api/admin.js refresh=hour). Never throws; returns counts and words only, no address.
export async function runHeldBackAlert(env) {
  try {
    const { countSince, record } = await import("../_ceilings.js");
    const now = Date.now();
    const rows = await readHeldBack(env, { days: 1, now });
    const r = await maybeSendHeldBackAlert({
      rows, now,
      seen: async () => ((await countSince(env, ALERT_KIND, "hour", new Date(now - HOUR).toISOString())) || 0) > 0,
      mark: () => record(env, [ALERT_KIND], "hour")
    });
    return { visitors: r.visitors, sent: !!r.sent, ...(r.skipped ? { skipped: r.skipped } : {}), ...(r.already ? { already: true } : {}), ...(r.results ? { results: r.results } : {}) };
  } catch (e) { return { error: String(e && e.message || e).slice(0, 80) }; }
}
