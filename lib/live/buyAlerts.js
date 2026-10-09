// BEFORE IT ENDS (Lane C, Oct 2026): one car, one message. From the Market Check drawer on a Buy card a
// signed-in buyer arms a car; about three hours before the auction ends (or at once when less than three
// hours are left) Sam sends ONE message: the car, the current bid, the card's own sold-prices sentence for
// its spec, one line placing the bid against that range, the same-car history line when there is one, and
// the listing link. The card's own wording helpers (soldLine, the same-car line); no figure the card would
// not show. One-off per listing, never a Task: it never takes or touches the account's Tasks slot, and it
// ends itself when the auction ends. Any number of cars can be armed.
// Storage: buy_alerts (docs/supabase-buy-alerts.sql), service role only. Delivery: the Tasks sender
// (lib/_email.js sendTaskEmail) with the same safety rules: List-Unsubscribe one-click, a signed stop
// link that only shows a confirm page on GET, the junk-folder line on a buyer's first message.
import crypto from "node:crypto";
import { supabaseSelect } from "../_supabase.js";
import { sendTaskEmail } from "../_email.js";
import { houseName, vinAppearances } from "../../api/_historyData.js";
import { listingFacts, listingMarket, liveRows } from "./search.js";
import { humanTitle } from "../carTitle.js";

const SITE = "https://goasksam.com";
const WINDOW_MS = 3 * 3600e3;          // "about three hours before it ends"
const KEEP_ENDED_MS = 7 * 864e5;       // ended cars stay in the rail for seven days
const JUNK_LINE = "If this isn't in your inbox, check your junk folder, and mark it as not junk so the next one lands.";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const usd = n => "$" + Math.round(Number(n)).toLocaleString("en-US");
const TZ = "America/Los_Angeles";
const timePT = d => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ }).replace(" AM", "am").replace(" PM", "pm");
const dayPT = d => d.toLocaleDateString("en-US", { timeZone: TZ });
function whenEnds(iso, now = new Date()) {
  const d = new Date(iso); if (isNaN(d)) return "soon";
  if (dayPT(d) === dayPT(now)) return `today at ${timePT(d)} PT`;
  const tom = new Date(now.getTime() + 864e5);
  if (dayPT(d) === dayPT(tom)) return `tomorrow at ${timePT(d)} PT`;
  return `${d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: TZ })} at ${timePT(d)} PT`;
}
const whenFull = d => { const p = String(d || "").split("-"), y = +p[0], mo = +p[1] - 1; if (!y || !(mo >= 0)) return ""; const now = new Date(), ago = (now.getFullYear() - y) * 12 + (now.getMonth() - mo); return MONTHS[mo] + (ago >= 0 && ago < 3 ? "" : " " + y); };

// ---------------------------------------------------------------- storage
class MissingTable extends Error {}
async function rest(env, path, method = "GET", body, prefer) {
  const r = await fetch(`${env.supabaseUrl}/rest/v1/${path}`, { method, headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    if (r.status === 404 || /PGRST205|42P01|does not exist|Could not find the table/i.test(t)) throw new MissingTable("buy_alerts is not set up yet (run docs/supabase-buy-alerts.sql)");
    throw new Error(`buy_alerts ${method} ${r.status}: ${t.slice(0, 200)}`);
  }
  return method === "GET" || /representation/.test(prefer || "") ? r.json() : null;
}
export const isMissingTable = e => e instanceof MissingTable;

// ---------------------------------------------------------------- signed stop link (confirm page on GET)
const SECRET = () => process.env.TASK_LINK_SECRET || process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "dev";
const sign = (id, action) => crypto.createHmac("sha256", SECRET()).update("buyalert|" + id + "|" + action).digest("base64url").slice(0, 22);
export function stopLink(userId) { return `${SITE}/api/buySearch?alert=stop&t=${userId}.${sign(userId, "stop")}`; }
export function verifyStop(token) {
  const [id, sig] = String(token || "").split("."); if (!id || !sig || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const ok = sign(id, "stop");
  return crypto.timingSafeEqual(Buffer.from(ok), Buffer.from(sig.padEnd(ok.length).slice(0, ok.length))) ? id : null;
}
const unsubscribeHeaders = userId => ({ "List-Unsubscribe": `<${stopLink(userId)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });

// ---------------------------------------------------------------- the card's own facts for a listing
// The car's name, bid and the card's sold-prices sentence (lib/live/search.js soldLine via listingMarket),
// the bid placed against that range, and the same-car line (the card's wording).
async function factsFor(env, row) {
  const facts = listingFacts(row);
  const m = await listingMarket(env, row, facts).catch(() => null);
  const market = m && m.kind !== "pending" ? m : null;
  const bid = facts.priceUsd && facts.priceState !== "suspect" && facts.priceState !== "unconverted" ? Math.round(facts.priceUsd) : null;
  let placing = null;
  if (bid && market && market.kind === "range" && market.low > 0 && market.high > 0) placing = bid < market.low ? "below the range" : bid > market.high ? "above the range" : "inside the range";
  // The same car's latest earlier appearance (never this listing), worded as the card's "This exact car" line.
  let sameCar = null;
  if (row.vin_norm && String(row.vin_norm).length >= 6) {
    const h = await vinAppearances(env, row.vin_norm).catch(() => null);
    const norm = u => String(u || "").replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "");
    const today = new Date().toISOString().slice(0, 10);
    const apps = h && h.ok ? h.appearances.filter(a => a.date && a.date < today && norm(a.url) !== norm(row.url)).sort((a, b) => a.date.localeCompare(b.date)) : [];
    const a = apps[apps.length - 1], price = a && (a.kind === "sale" ? a.priceUsd : a.bidUsd), w = a ? whenFull(a.date) : "";
    if (a && price) sameCar = a.kind === "sale" ? `This exact car sold for ${usd(price)}${w ? " in " + w : ""}.` : `This exact car was bid to ${usd(price)}${w ? " in " + w : ""} and didn't sell.`;
  }
  const name = humanTitle(String(row.listing_title || "").replace(/^.*?\b(?=(?:19|20)\d{2}\b)/, "").replace(/\s+(?:with|w\/|for|featuring)\s.*$/i, "").replace(/\s+\d-Speed.*$/i, "").trim()) || "This car";
  return { name, house: houseName(row.source), bid, bidAt: row.bid_at || row.last_seen || null, market, soldLine: market ? market.soldLine : null, placing, sameCar, url: row.url };
}

// ---------------------------------------------------------------- the one message
export function messageFor(f, row, { first, userId, now = new Date() } = {}) {
  const asOf = f.bidAt ? ` as of ${timePT(new Date(f.bidAt))} PT${dayPT(new Date(f.bidAt)) === dayPT(now) ? "" : " " + new Date(f.bidAt).toLocaleDateString("en-US", { weekday: "long", timeZone: TZ })}` : "";
  const lines = [
    `${f.name} on ${f.house} ends ${whenEnds(row.end_time, now)}.`,
    f.bid ? `The current bid is ${usd(f.bid)}${asOf}.` : "There is no bid on it yet.",
    f.soldLine || null,
    f.placing ? `The current bid is ${f.placing}.` : null,
    f.sameCar || null
  ].filter(Boolean);
  const stop = stopLink(userId);
  const text = `${lines.join("\n\n")}\n\nSee the auction: ${f.url}\n\n${first ? JUNK_LINE + "\n\n" : ""}Stop these messages: ${stop}\n\nSam, GoAskSam`;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const html = `<div style="font-family:Georgia,serif;font-size:17px;line-height:1.5;color:#1A1A1A;max-width:560px">${lines.map(l => `<p>${esc(l)}</p>`).join("")}<p style="font-family:Arial,sans-serif;font-size:15px"><a href="${esc(f.url)}" style="color:#D7262C">See the auction</a></p>${first ? `<p style="font-family:Arial,sans-serif;font-size:14px;color:#5F5A53">${esc(JUNK_LINE)}</p>` : ""}<p style="font-family:Arial,sans-serif;font-size:13px;color:#5F5A53"><a href="${stop}" style="color:#1A1A1A">Stop these messages</a></p><p style="font-family:Arial,sans-serif;font-size:13px;color:#5F5A53">Sam, GoAskSam</p></div>`;
  const subject = `Before it ends: ${f.name}`;
  return { subject, text, html };
}

// Send one armed car's message now (once): marks the row sent with its delivery status.
async function sendOne(env, alert, row, opts = {}) {
  const prior = opts.to ? [] : await rest(env, `buy_alerts?user_id=eq.${alert.user_id}&sent_at=not.is.null&select=id&limit=1`).catch(() => []);
  const f = await factsFor(env, row);
  const msg = messageFor(f, row, { first: opts.first != null ? opts.first : !(prior && prior.length), userId: alert.user_id });
  let status = "test", id = null;
  if (!opts.dry) {
    const r = await sendTaskEmail({ to: opts.to || alert.email, subject: msg.subject, text: msg.text, html: msg.html, headers: unsubscribeHeaders(alert.user_id) });
    status = r.ok ? "sent" : r.skipped ? "skipped_" + (r.reason || "") : ("failed: " + String(r.error || r.status || "unknown")).slice(0, 200);
    id = r.id || null;
    if (!r.ok && !r.skipped) console.error("buy alert send failed:", alert.id, status);
  }
  if (!opts.noMark) await rest(env, `buy_alerts?id=eq.${alert.id}`, "PATCH", { sent_at: new Date().toISOString(), send_status: status });
  return { status, resend_id: id, ...msg };
}

// Is the table there (docs/supabase-buy-alerts.sql run)? The page hides the switch until it is. Held 10 minutes.
let ready = { v: null, at: 0 };
export async function alertsReady(env) {
  if (ready.v !== null && Date.now() - ready.at < (ready.v ? 600e3 : 60e3)) return ready.v;
  let v = false;
  try { await rest(env, "buy_alerts?select=id&limit=1"); v = true; } catch (e) { v = false; }
  ready = { v, at: Date.now() }; return v;
}
// ---------------------------------------------------------------- arm / cancel / list
export async function armAlert(env, user, listingId) {
  const rows = await liveRows(env, `id=eq.${Number(listingId)}`);
  const row = rows && rows[0];
  if (!row) return { ok: false, reason: "ended" };
  const end = Date.parse(row.end_time || "");
  if (!end || end <= Date.now()) return { ok: false, reason: "ended" };
  const email = user.email || null;
  if (!email) return { ok: false, reason: "no_address" };
  const have = (await rest(env, `buy_alerts?user_id=eq.${user.userId}&listing_id=eq.${row.id}&select=*&limit=1`))[0] || null;
  let alert;
  if (have) alert = (await rest(env, `buy_alerts?id=eq.${have.id}`, "PATCH", { cancelled_at: null, email }, "return=representation"))[0];
  else alert = (await rest(env, "buy_alerts", "POST", [{ listing_id: row.id, user_id: user.userId, email }], "return=representation"))[0];
  // Under three hours left: the message goes now (once).
  let sent = null;
  if (alert && !alert.sent_at && end - Date.now() <= WINDOW_MS) sent = await sendOne(env, alert, row).catch(e => { console.error("buy alert send at arming:", e.message); return null; });
  return { ok: true, alert: shape(alert, row), sent: sent ? sent.status : null };
}
export async function cancelAlert(env, user, listingId) {
  await rest(env, `buy_alerts?user_id=eq.${user.userId}&listing_id=eq.${Number(listingId)}`, "PATCH", { cancelled_at: new Date().toISOString() });
  return { ok: true };
}
// Stop every armed car's message for this buyer (the message's stop link and one-click unsubscribe).
export async function stopAll(env, userId) {
  await rest(env, `buy_alerts?user_id=eq.${userId}&cancelled_at=is.null&sent_at=is.null`, "PATCH", { cancelled_at: new Date().toISOString() });
  return { ok: true };
}
function shape(a, row) {
  return { listing_id: a.listing_id, armed_at: a.armed_at, sent_at: a.sent_at || null, title: row ? humanTitle(String(row.listing_title || "").replace(/^.*?\b(?=(?:19|20)\d{2}\b)/, "")) : null, url: row ? row.url : null, end_time: row ? row.end_time : null, house: row ? houseName(row.source) : null, photo_url: row ? row.photo_url : null };
}
// The buyer's armed cars: still running, and the ones that ended in the last seven days with how they
// landed (hammer, or bid to and didn't sell, or not in yet) against the card's own range.
export async function listAlerts(env, user) {
  const alerts = await rest(env, `buy_alerts?user_id=eq.${user.userId}&cancelled_at=is.null&select=*&order=armed_at.desc&limit=100`);
  if (!alerts.length) return { items: [] };
  const ids = [...new Set(alerts.map(a => Number(a.listing_id)))];
  const rows = (await supabaseSelect(env, `live_listings?id=in.(${ids.join(",")})&select=id,source,url,listing_title,make,model,year,vin_norm,mileage,location,country,currency,current_bid,current_bid_usd,end_time,photo_url,status,final_price,last_seen,body,transmission`)) || [];
  const byId = Object.fromEntries(rows.map(r => [Number(r.id), r]));
  const now = Date.now(), items = [];
  for (const a of alerts) {
    const row = byId[Number(a.listing_id)]; if (!row) continue;
    const end = Date.parse(row.end_time || "");
    const ended = row.status !== "live" || (end && end < now);
    if (ended && end && now - end > KEEP_ENDED_MS) continue;
    const it = shape(a, row);
    it.ended = !!ended;
    if (ended) it.result = await endedResult(env, row).catch(() => ({ kind: "pending" }));
    items.push(it);
  }
  return { items };
}
// How an ended car landed: its hammer (the pull's final price from the archive), a bid that didn't sell
// (the car's own auction record), or not in yet. Placed against the card's own range when there is one.
async function endedResult(env, row) {
  const day = String(row.end_time || "").slice(0, 10);
  let out = { kind: "pending", date: day };
  if (row.status === "ended_sold" && Number(row.final_price) > 0) out = { kind: "sold", price: Math.round(Number(row.final_price)), date: day };
  else if (row.vin_norm) {
    const h = await vinAppearances(env, row.vin_norm).catch(() => null);
    const near = h && h.ok ? h.appearances.filter(a => a.date && day && Math.abs(Date.parse(a.date) - Date.parse(day)) <= 3 * 864e5) : [];
    const sale = near.find(a => a.kind === "sale" && a.priceUsd), att = near.find(a => a.kind !== "sale" && a.bidUsd);
    if (sale) out = { kind: "sold", price: Math.round(sale.priceUsd), date: sale.date };
    else if (att) out = { kind: "unsold", price: Math.round(att.bidUsd), date: att.date };
  }
  const price = out.price || null;
  if (price) {
    const m = await listingMarket(env, row, listingFacts(row)).catch(() => null);
    if (m && m.kind === "range" && m.low > 0 && m.high > 0) { out.placing = price < m.low ? "below" : price > m.high ? "above" : "inside"; out.family = m.family || null; }
  }
  return out;
}

// ---------------------------------------------------------------- the run (cron, every 15 minutes)
// Armed, unsent, not cancelled, and its auction ends within three hours: send. A car that has already
// ended is never sent (the arming ends itself).
export async function runAlerts(env, opts = {}) {
  const now = Date.now();
  const due = await rest(env, `buy_alerts?sent_at=is.null&cancelled_at=is.null&select=*&order=armed_at.asc&limit=500`);
  if (!due.length) return { checked: 0, sent: 0 };
  const ids = [...new Set(due.map(a => Number(a.listing_id)))];
  const rows = [];
  for (let i = 0; i < ids.length; i += 100) rows.push(...((await liveRows(env, `id=in.(${ids.slice(i, i + 100).join(",")})`)) || []));
  const byId = Object.fromEntries(rows.map(r => [Number(r.id), r]));
  let sent = 0; const report = [];
  for (const a of due) {
    const row = byId[Number(a.listing_id)];
    const end = row ? Date.parse(row.end_time || "") : NaN;
    if (!row || !end || end <= now) continue;
    if (end - now > WINDOW_MS) continue;
    const fresh = opts.freshBid ? await opts.freshBid(env, row).catch(() => row) : row;
    const r = await sendOne(env, a, fresh).catch(e => ({ status: "error: " + e.message }));
    report.push({ id: a.id, listing_id: a.listing_id, status: r.status }); if (r.status === "sent") sent++;
  }
  return { checked: due.length, sent, report };
}

// Probe only: one armed car's message to a disposable test inbox, now, whatever the time left (opts.to).
export async function testSend(env, userId, listingId, to, opts = {}) {
  const a = (await rest(env, `buy_alerts?user_id=eq.${userId}&listing_id=eq.${Number(listingId)}&select=*&limit=1`))[0];
  if (!a) return { ok: false, reason: "not armed" };
  const rows = await liveRows(env, `id=eq.${Number(listingId)}`);
  if (!rows || !rows[0]) return { ok: false, reason: "not live" };
  const row = opts.freshBid ? await opts.freshBid(env, rows[0]).catch(() => rows[0]) : rows[0];
  return { ok: true, ...(await sendOne(env, a, row, { to: to || a.email, noMark: !!opts.noMark })) };
}
