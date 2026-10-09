// Watches (Lane C, Oct 2026): standing notices on real events. Unlimited, on every page that offers one, never
// a question, never the chat model. Each repeats on its own: a spec watch tells of every next sale, an
// exact-car watch of every time that car comes up again. Silence is allowed (no event, no message).
//   kind "spec": a new sale for the spec, read through the SAME engine answer Buy's cards and Market Check
//                read (lib/live/search.js engineAnswer -> lib/onebox.js runOneBox, its fences and trust rules):
//                its qualifying sales dated after the watch began. Never an estimate: only sales that happened.
//   kind "vin":  the exact car (VIN) again: a sale or an offer at auction (vinAppearances: vin_index, else the
//                archive) dated after the watch began, or a live listing first seen after it began.
// Delivery is the before-it-ends delivery (lib/live/buyAlerts.js): the same signed stop link (it stops every
// notice for the account), List-Unsubscribe one-click, the junk-folder line on the account's first message.
// watch_sends is the sent log, so nothing is sent twice; within 7 days of a message, new events wait and go
// together as one digest. Tables: docs/supabase-watches.sql (run once). Until then: ready() is false.
import { sendTaskEmail } from "../_email.js";
import { stopLink, unsubscribeHeaders, JUNK_LINE } from "./buyAlerts.js";
import { listingFacts, specOf, engineAnswer, listingMarket } from "./search.js";
import { vinAppearances, houseName } from "../../api/_historyData.js";
import { humanTitle } from "../carTitle.js";

const DIGEST_MS = 7 * 864e5;
const TZ = "America/Los_Angeles";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WORDS = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
const usd = n => "$" + Math.round(Number(n)).toLocaleString("en-US");
const num = n => Math.round(Number(n)).toLocaleString("en-US");
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ---------------------------------------------------------------- storage
class MissingTable extends Error {}
async function rest(env, path, method = "GET", body, prefer) {
  const r = await fetch(`${env.supabaseUrl}/rest/v1/${path}`, { method, headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    if (r.status === 404 || /PGRST205|42P01|does not exist|Could not find the table/i.test(t)) throw new MissingTable("watches are not set up yet (run docs/supabase-watches.sql)");
    throw new Error(`watches ${method} ${r.status}: ${t.slice(0, 200)}`);
  }
  return method === "GET" || /representation/.test(prefer || "") ? r.json() : null;
}
export const isMissingTable = e => e instanceof MissingTable;
let readyMemo = { v: null, at: 0 };
export async function ready(env) {
  if (readyMemo.v != null && Date.now() - readyMemo.at < 600e3) return readyMemo.v;
  let v = true; try { await rest(env, "watches?select=id&limit=1"); await rest(env, "watch_sends?select=id&limit=1"); } catch (e) { v = isMissingTable(e) ? false : true; }
  readyMemo = { v, at: Date.now() }; return v;
}

// ---------------------------------------------------------------- words
const todayPT = (now = new Date()) => now.toLocaleDateString("en-CA", { timeZone: TZ });   // YYYY-MM-DD
function dayWord(day, now = new Date()) {
  const d = String(day || "").slice(0, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "";
  const today = todayPT(now), yest = todayPT(new Date(now.getTime() - 864e5));
  if (d === today) return "today";
  if (d === yest) return "yesterday";
  const [y, m, dd] = d.split("-").map(Number);
  return `on ${MONTHS[m - 1]} ${dd}${String(y) === today.slice(0, 4) ? "" : ", " + y}`;
}
// A sale's own title, as a car is named everywhere (lib/carTitle.js), without the listing's mileage or gearbox
// prefix and suffix ("47k-Mile ... 6-Speed").
export function carName(t) {
  return humanTitle(String(t || "").replace(/^\s*no reserve:\s*/i, "").replace(/^\s*[\d,.]+k?-mile\s+/i, "").replace(/^\s*[\w-]+-owned,?\s+/i, "").replace(/\s+\d-speed\b.*$/i, "").trim()) || "car";
}
const article = name => (/^(8|11|18)\d*\b/.test(name) || /^[aeiou]/i.test(name) ? "An" : "A");
function saleLine(e, now) {
  const name = carName(e.title);
  return `${article(name)} ${name}${e.miles ? ` with ${num(e.miles)} miles` : ""} sold on ${e.house} ${dayWord(e.date, now)} for ${usd(e.price)}.`;
}
function vinLine(w, e, now) {
  const car = `The ${w.label} you're watching (VIN ${w.key})`;
  if (e.kind === "sale") return `${car} sold on ${e.house} ${dayWord(e.date, now)} for ${usd(e.price)}.`;
  if (e.kind === "attempt") return `${car} was offered on ${e.house} ${dayWord(e.date, now)} and did not sell${e.bid ? `. The high bid was ${usd(e.bid)}` : ""}.`;
  const end = e.end ? new Date(e.end) : null;
  const ends = end && !isNaN(end) ? `, ending ${end.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: TZ })}` : "";
  return `${car} is live on ${e.house}${ends}.${e.bid ? ` The current bid is ${usd(e.bid)}.` : ""}`;
}
// One message for one or several events (several = the digest). Facts only, third person, no dashes.
export function messageFor(w, events, { first, now = new Date() } = {}) {
  const evs = events.slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  const blocks = [];
  let subject;
  if (w.kind === "spec") {
    if (evs.length === 1) { blocks.push({ line: saleLine(evs[0], now) + " Here it is.", url: evs[0].url }); subject = `Sold: ${carName(evs[0].title)}`; }
    else {
      const since = evs[evs.length - 1].date;
      blocks.push({ line: `${WORDS[evs.length] || evs.length} ${w.label} sold ${since ? "since " + dayWord(since, now).replace(/^on /, "") : "this week"}. Here they are.` });
      for (const e of evs) blocks.push({ line: saleLine(e, now), url: e.url });
      subject = `${evs.length} sold: ${w.label}`;
    }
    blocks.push({ line: `This is from your watch on ${w.label}.` });
  } else {
    for (const e of evs) blocks.push({ line: vinLine(w, e, now) + (evs.length === 1 ? " Here it is." : ""), url: e.url });
    subject = evs.some(e => e.kind === "live") ? `Back at auction: ${w.label}` : evs.some(e => e.kind === "sale") ? `Sold again: ${w.label}` : `Offered again: ${w.label}`;
  }
  const stop = stopLink(w.user_id);
  const text = blocks.map(b => b.line + (b.url ? "\n" + b.url : "")).join("\n\n") + `\n\n${first ? JUNK_LINE + "\n\n" : ""}Stop these messages: ${stop}\n\nSam, GoAskSam`;
  const html = `<div style="font-family:Georgia,serif;font-size:17px;line-height:1.5;color:#1A1A1A;max-width:560px">${blocks.map(b => `<p>${esc(b.line)}${b.url ? `<br><a href="${esc(b.url)}" style="font-family:Arial,sans-serif;font-size:15px;color:#D7262C">${esc(b.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""))}</a>` : ""}</p>`).join("")}${first ? `<p style="font-family:Arial,sans-serif;font-size:14px;color:#5F5A53">${esc(JUNK_LINE)}</p>` : ""}<p style="font-family:Arial,sans-serif;font-size:13px;color:#5F5A53"><a href="${stop}" style="color:#1A1A1A">Stop these messages</a></p><p style="font-family:Arial,sans-serif;font-size:13px;color:#5F5A53">Sam, GoAskSam</p></div>`;
  return { subject, text, html };
}
// The rail's one line for a watch's latest event.
function railLine(w, e, now) {
  if (w.kind === "spec") return `Sold on ${e.house} ${dayWord(e.date, now).replace(/^on /, "")}, ${usd(e.price)}`;
  if (e.kind === "live") return `Live on ${e.house}`;
  return e.kind === "sale" ? `Sold on ${e.house} ${dayWord(e.date, now).replace(/^on /, "")}, ${usd(e.price)}` : `Offered on ${e.house} ${dayWord(e.date, now).replace(/^on /, "")}, did not sell`;
}

// ---------------------------------------------------------------- events
// The spec's own group, the way Buy's card reads it (lib/live/search.js ladderSteps/walkLadder): with the
// gearbox first, then any gearbox; only the engine's read of THIS cohort counts (result, thin, refusal),
// never a class or era band of other cars. undefined: a read did not come back.
async function cohortAnswer(env, sp) {
  for (const refine of sp.refine ? [sp.refine, null] : [null]) {
    const d = await engineAnswer(sp.v, sp.generation || null, sp.title || "", env, refine);
    if (d === undefined) return undefined;
    if (d && /^(result|thin|refusal)$/.test(String(d.tier || ""))) return d;
  }
  return null;
}
// A spec's qualifying sales dated after the baseline, from the engine's own answer (null: the read did not
// come back, so this run says nothing rather than "no sales").
async function specEvents(env, w) {
  const sp = w.spec || {}; if (!sp.v) return null;
  const d = await cohortAnswer(env, sp);
  if (d === undefined) return null;
  if (!d) return [];
  return (d.cards || []).filter(c => Number(c.price) > 0 && c.date && String(c.date).slice(0, 10) > String(w.baseline_date || ""))
    .map(c => ({ key: "s:" + (c.url || `${c.title}|${String(c.date).slice(0, 10)}|${c.price}`), kind: "sale", date: String(c.date).slice(0, 10), price: Number(c.price), miles: Number(c.mi) || null, house: houseName(c.platform) || c.platform || "auction", url: c.url || null, title: c.title || "" }));
}
async function vinEvents(env, w) {
  const since = String(w.created_at || "").slice(0, 10);
  const h = await vinAppearances(env, w.key).catch(() => null);
  if (!h || !h.ok) return null;
  const out = (h.appearances || []).filter(a => a.date && a.date > since).map(a => ({ key: `a:${a.date}|${a.house}|${a.url || ""}`, kind: a.kind === "sale" ? "sale" : "attempt", date: a.date, price: a.priceUsd || null, bid: a.bidUsd || null, house: a.house || "auction", url: a.url || null, title: a.title || "" }));
  const live = await rest(env, `live_listings?vin_norm=eq.${encodeURIComponent(w.key)}&status=eq.live&first_seen=gt.${encodeURIComponent(w.created_at)}&select=id,source,url,listing_title,current_bid_usd,end_time,first_seen&limit=5`).catch(() => []);
  for (const r of live || []) out.push({ key: "l:" + r.id, kind: "live", date: String(r.first_seen || "").slice(0, 10), bid: r.current_bid_usd != null ? Math.round(Number(r.current_bid_usd)) : null, end: r.end_time, house: houseName(r.source), url: r.url, title: r.listing_title || "" });
  return out;
}
const eventsFor = (env, w) => (w.kind === "spec" ? specEvents(env, w) : vinEvents(env, w));

// ---------------------------------------------------------------- arm, stop, list
async function liveRow(env, id) { const rows = await rest(env, `live_listings?id=eq.${Number(id)}&select=*&limit=1`); return rows && rows[0]; }
// Arm from a live listing (Buy's card): its spec's next sale, or this exact car. Returns { watch, first }.
export async function arm(env, user, { kind, listing_id }) {
  if (!["spec", "vin"].includes(kind)) return { error: "kind" };
  const row = Number.isFinite(Number(listing_id)) ? await liveRow(env, listing_id) : null;
  if (!row) return { error: "not found" };
  const prior = await rest(env, `watches?user_id=eq.${user.userId}&select=id&limit=1`);
  let w;
  if (kind === "vin") {
    const vin = String(row.vin_norm || "").toUpperCase(); if (vin.length < 11) return { error: "no vin" };
    w = { user_id: user.userId, email: user.email || null, kind, key: vin, label: carName(row.listing_title) };
  } else {
    const facts = listingFacts(row), spec = await specOf(env, row, facts);
    if (!spec) return { error: "no spec" };
    const m = await listingMarket(env, row, facts).catch(() => null);
    const label = (m && (m.familyBare || m.family)) || carName(spec.title);
    const d = await cohortAnswer(env, spec).catch(() => undefined);
    // The baseline: the newest sale the engine already holds (so only sales after this one count), else today.
    const latest = ((d && d.cards) || []).map(c => String(c.date || "").slice(0, 10)).filter(Boolean).sort().pop() || todayPT();
    w = { user_id: user.userId, email: user.email || null, kind, key: spec.key, label, spec: { title: spec.title, v: spec.v, generation: spec.generation || null, refine: spec.refine || null }, baseline_date: latest };
  }
  // One per spec or car per account: arming again restarts a stopped one.
  const out = await rest(env, "watches?on_conflict=user_id,kind,key", "POST", [{ ...w, stopped_at: null }], "resolution=merge-duplicates,return=representation");
  return { watch: shape(out && out[0]), first: !(prior && prior.length) };
}
export async function stop(env, user, id) {
  if (!/^[0-9a-f-]{36}$/.test(String(id || ""))) return { error: "id" };
  await rest(env, `watches?id=eq.${id}&user_id=eq.${user.userId}`, "PATCH", { stopped_at: new Date().toISOString() });
  return { ok: true };
}
export async function stopAllWatches(env, userId) {
  await rest(env, `watches?user_id=eq.${userId}&stopped_at=is.null`, "PATCH", { stopped_at: new Date().toISOString() });
  return { ok: true };
}
function shape(w) { return w ? { id: w.id, kind: w.kind, label: w.label, key: w.kind === "vin" ? w.key : null, last_event: w.last_event || null, last_event_at: w.last_event_at || null, created_at: w.created_at } : null; }
export async function list(env, user) {
  const rows = await rest(env, `watches?user_id=eq.${user.userId}&stopped_at=is.null&select=*&order=created_at.desc&limit=100`);
  return { watches: (rows || []).map(shape) };
}

// ---------------------------------------------------------------- the run (cron)
export async function run(env, opts = {}) {
  const now = opts.now ? new Date(opts.now) : new Date();
  const rows = await rest(env, `watches?stopped_at=is.null&select=*&order=created_at.asc&limit=2000`);
  const out = { checked: 0, sent: 0, held: 0, quiet: 0, unread: 0, results: [] };
  const firstSeen = new Set((rows || []).filter(w => w.last_sent_at).map(w => w.user_id));
  for (const w of rows || []) {
    out.checked++;
    const evs = await eventsFor(env, w).catch(e => { console.error("watch events:", w.id, e && e.message); return null; });
    if (evs == null) { out.unread++; continue; }
    if (!evs.length) { out.quiet++; continue; }
    const sentRows = await rest(env, `watch_sends?watch_id=eq.${w.id}&select=event_key&limit=2000`);
    const sent = new Set((sentRows || []).map(s => s.event_key));
    const fresh = evs.filter(e => !sent.has(e.key));
    if (!fresh.length) { out.quiet++; continue; }
    // The digest: within 7 days of the last message, new events wait and go together.
    if (w.last_sent_at && now - new Date(w.last_sent_at) < DIGEST_MS) { out.held++; continue; }
    const msg = messageFor(w, fresh.slice(0, 10), { first: !firstSeen.has(w.user_id), now });
    let status = "dry";
    if (!opts.dry) {
      const r = await sendTaskEmail({ to: w.email, subject: msg.subject, text: msg.text, html: msg.html, headers: unsubscribeHeaders(w.user_id) });
      status = r.ok ? "sent" : r.skipped ? "skipped_" + (r.reason || "") : ("failed: " + String(r.error || r.status || "unknown")).slice(0, 200);
      if (r.ok || r.skipped) {
        await rest(env, "watch_sends?on_conflict=watch_id,event_key", "POST", fresh.map(e => ({ watch_id: w.id, event_key: e.key, send_status: status })), "resolution=ignore-duplicates");
        const top = fresh.slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))[0];
        await rest(env, `watches?id=eq.${w.id}`, "PATCH", { last_sent_at: now.toISOString(), last_event_at: now.toISOString(), last_event: railLine(w, top, now) });
        firstSeen.add(w.user_id);
      }
    }
    out.sent++; out.results.push({ id: w.id, kind: w.kind, events: fresh.length, status, subject: msg.subject });
  }
  return out;
}

// Probe (no table needed): the real message for a listing's spec or exact car, built from real events since
// `since` (a past day, so there is something to show), sent to `to` and recorded nowhere.
export async function testSend(env, { kind, listing_id, vin, since, to, first = true, userId }) {
  const uid = /^[0-9a-f-]{36}$/.test(String(userId || "")) ? userId : "00000000-0000-0000-0000-000000000000";
  let w;
  if (kind === "vin") {
    const key = String(vin || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const h = await vinAppearances(env, key).catch(() => null);
    const t = h && h.appearances && h.appearances[0] && h.appearances[0].title;
    w = { kind, key, label: carName(t || "car"), user_id: uid, created_at: since };
  } else {
    const row = await liveRow(env, listing_id); if (!row) return { error: "not found" };
    const facts = listingFacts(row), spec = await specOf(env, row, facts); if (!spec) return { error: "no spec" };
    const m = await listingMarket(env, row, facts).catch(() => null);
    w = { kind, key: spec.key, label: (m && (m.familyBare || m.family)) || carName(spec.title), spec, baseline_date: String(since).slice(0, 10), user_id: uid };
  }
  const evs = await eventsFor(env, w);
  if (!evs || !evs.length) {
    // Why nothing (probe only): what the engine answered for this spec.
    let why = null;
    if (w.kind === "spec") { const d = await cohortAnswer(env, w.spec).catch(() => undefined); why = d === undefined ? "no read" : !d ? "no cohort read" : { tier: d.tier, cards: (d.cards || []).length, newest: (d.cards || []).map(c => String(c.date || "").slice(0, 10)).sort().pop() || null }; }
    return { events: evs ? 0 : null, label: w.label, why };
  }
  const msg = messageFor(w, evs.slice(0, 10), { first });
  const r = to ? await sendTaskEmail({ to, subject: msg.subject, text: msg.text, html: msg.html, headers: unsubscribeHeaders(w.user_id) }) : null;
  return { label: w.label, events: evs.length, sent: r ? (r.ok ? "sent" : r.reason || r.error || r.status) : null, ...msg };
}
