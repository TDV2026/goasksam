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
import crypto from "node:crypto";
import { trackCurrent } from "../track/log.js";
import { sendTaskEmail, firstEmailTo } from "../_email.js";
import { placingFor, __specEngine } from "../onebox.js";
import { setAsideSentence } from "../tasks/setAside.js";
import { stopLink, unsubscribeHeaders, JUNK_LINE } from "./buyAlerts.js";
import { bidState, lastBidLine } from "../tasks/bidTime.js";
import { listingFacts, specOf, engineAnswer, listingMarket } from "./search.js";
import { vinAppearances, houseName } from "../../api/_historyData.js";
import { humanTitle } from "../carTitle.js";
import { logEvent, EVENTS } from "../events.js";
import { rungOf, rungLines, doorName, askedName, countText, trackedRung } from "./rung.js";
import { getDeliveryTargets, emailOf, testInbox } from "../tasks/delivery.js";
// The engine's rung for a sold-car Task (lib/live/rung.js). A Task set up from a sibling answer follows the car asked
// about: its name, its record, its vehicle_key and year, and the sales it reports are that car's; the sibling is
// context for that day's answer only, kept with the spec so Task settings can show the rung label beneath.
export const fromSibling = w => !!(w && w.kind === "spec" && w.spec && w.spec.rung && w.spec.rung.rung === "sibling");
// What arm() writes for a spec Task from one market read: the label, the spec record, the task_created car. Pure.
export function specTaskOf(spec, m, fallbackLabel) {
  const rung = rungOf(m);
  const label = doorName(rung, askedName(spec.v)) || (m && (m.familyBare || m.family)) || fallbackLabel;
  const tcar = { make: spec.v && spec.v.make, model: spec.v && (spec.v.model || spec.v.parentModel), year: spec.v && spec.v.year, fallback_rung: trackedRung(m) };
  return { label, spec: { title: spec.title, v: spec.v, generation: spec.generation || null, refine: spec.refine || null, ...(rung ? { rung } : {}) }, tcar };
}
// A sale of the car asked about: every word of its name in the sale's own title (a CLK 55 AMG is not a CLK DTM).
export const namesCar = (title, name) => { const t = " " + String(title || "").toLowerCase().replace(/[^a-z0-9]+/g, " ") + " "; return String(name || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).every(w => t.includes(" " + w + " ")); };
// The combined daily email's one line for a sibling-answer Task with no sale of its car yet (lib/tasks/digest.js).
export const noSalesLine = w => `No ${w.label} has sold since you started this Task. Sam keeps looking.`;

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
  return humanTitle(String(t || "").replace(/^\s*no reserve:\s*/i, "").replace(/^\s*[\d,.]+k?-mile\s+/i, "").replace(/^\s*[\w-]+-owned,?\s+/i, "").replace(/\s+\d-speed\b.*$/i, "").replace(/\s+-\s+[\d,.]+k?\s*(?:miles?|mi|km)\b.*$/i, "").trim()) || "car";
}
const article = name => (/^(8|11|18)\d*\b/.test(name) || /^[aeiou]/i.test(name) ? "An" : "A");
// A venue we can name; a missing or catch-all source ("others") is left out, never printed.
const venueOf = e => e && e.house && !/^(others?|unknown|n\/a)$/i.test(String(e.house).trim()) ? e.house : null;
function saleLine(e, now) {
  const name = carName(e.title), v = venueOf(e);
  return `${article(name)} ${name}${e.miles ? ` with ${num(e.miles)} miles` : ""} sold${v ? ` on ${v}` : ""} ${dayWord(e.date, now)} for ${usd(e.price)}.`;
}
const timePT = d => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ }).replace(" AM", "am").replace(" PM", "pm");
function endsWord(iso, now) {
  const d = new Date(iso); if (isNaN(d)) return "";
  const day = todayPT(d);
  if (day === todayPT(now)) return `today at ${timePT(d)} PT`;
  if (day === todayPT(new Date(now.getTime() + 864e5))) return `tomorrow at ${timePT(d)} PT`;
  return `${d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: TZ })} at ${timePT(d)} PT`;
}
// The first event names the car and its VIN; any earlier one in the same message reads "Before that, it ...".
function vinLine(w, e, now, later) {
  const car = later ? "Before that, it" : `The ${w.label} in your Task (VIN ${w.key})`;
  if (e.kind === "sale") return `${car} sold on ${e.house} ${dayWord(e.date, now)} for ${usd(e.price)}.`;
  if (e.kind === "attempt") return `${car} was offered on ${e.house} ${dayWord(e.date, now)} and did not sell${e.bid ? `. The high bid was ${usd(e.bid)}` : ""}.`;
  const ends = e.end ? endsWord(e.end, now) : "";
  // The bid by its own time (lib/tasks/bidTime.js): within the hour as before; older, only with its time; no bid time, none.
  const st = bidState(e.bid, e.bidAt, now);
  const bid = st.kind === "fresh" ? ` The current bid is ${usd(e.bid)}.` : st.kind === "old" ? " " + lastBidLine(usd(e.bid), st.at, now) : "";
  return `${car} ${later ? "was" : "is"} live on ${e.house}${ends ? `, ending ${ends}` : ""}.${bid}`;
}
// ---------------------------------------------------------------- Pause and Stop, scoped to ONE task (Oct 2026)
// The same meaning as a live task's links: Pause stops this task's emails until the person starts it again; Stop
// ends this task only. Signed (HMAC), checked in constant time; the link opens a confirm page naming the task and
// only that page's POST (or the mail provider's one-click POST on Stop) acts. api/watch.js serves them.
const TAP_SECRET = () => process.env.TASK_LINK_SECRET || process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "dev";
const tapSig = (id, action) => crypto.createHmac("sha256", TAP_SECRET()).update("soldtask|" + id + "|" + action).digest("base64url").slice(0, 22);
// The address is /api/task-link (Oct 2026, Sam: no "watch" in a link a person reads); vercel.json rewrites it to
// api/watch.js, and links in emails already sent (/api/watch?a=...) keep working on the old path.
export function soldTaskTap(id, action) { return `https://goasksam.com/api/task-link?a=${action}&t=${id}.${tapSig(id, action)}`; }
export function verifySoldTaskTap(token, action) {
  const [id, sig] = String(token || "").split("."); if (!id || !sig || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const ok = tapSig(id, action);
  return crypto.timingSafeEqual(Buffer.from(ok), Buffer.from(sig.padEnd(ok.length).slice(0, ok.length))) ? id : null;
}
export const soldTaskHeaders = id => ({ "List-Unsubscribe": `<${soldTaskTap(id, "stop")}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
// The task's name on the confirm page: "the next 3.2 Carrera Targa sale" / "the 1988 Porsche 911 (VIN ...)".
export function soldTaskName(w) {
  if (!w) return "this Task";
  if (w.kind === "vin") return `the ${w.label} (VIN ${w.key})`;
  const one = /[a-z0-9]s$/i.test(w.label || "") && !/ss$/i.test(w.label || "") ? String(w.label).slice(0, -1) : w.label;
  return `the next ${one} sale`;
}
export async function getWatch(env, id) { const r = await rest(env, `watches?id=eq.${id}&select=*&limit=1`); return r && r[0]; }
// Pause needs watches.paused_at (docs/supabase-watches.sql). Until that line is run, pause says so plainly.
export async function setWatchState(env, id, action) {
  const now = new Date().toISOString();
  const via = { product: "tasks", surface: "email" };
  if (action === "stop") { await rest(env, `watches?id=eq.${id}`, "PATCH", { stopped_at: now }); trackCurrent("task_cancelled", { via: "email_link" }, via); return { ok: true }; }
  try { await rest(env, `watches?id=eq.${id}`, "PATCH", { paused_at: action === "pause" ? now : null }); if (action === "pause") trackCurrent("task_paused", { via: "email_link" }, via); return { ok: true }; }
  catch (e) { if (/paused_at|PGRST204|42703|column/i.test(String(e && e.message))) return { ok: false, notReady: true }; throw e; }
}

// One message for one or several events (several = the digest). Facts only, third person, no dashes. Task wording
// (Sam, Oct 2026): "You asked Sam to tell you when the next ... sells.", "View the sale on {venue}" as the link,
// one placing line from the SAME placingFor Buy uses when the engine has a range, and the one alert footer:
// Open the task, Pause and Stop (this one task each). The junk-folder line only on the address's first email.
const SITE_URL = "https://goasksam.com";
// section: this Task's part of the combined Task email (lib/tasks/digest.js), no junk-folder line, no sign-off.
export function messageFor(w, events, { first, now = new Date(), more = 0, oldest = null, section = false } = {}) {
  const evs = events.slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  const blocks = [];
  let subject;
  // A set-aside sale says why (the engine's reason) and is never placed; any other sale is placed only against a band.
  const placed = e => { if (e.setAside != null) return setAsideSentence(e.setAside); const p = e.band ? placingFor(Number(e.price), e.band) : null; return p ? `That is ${p} of recent sales.` : null; };
  if (w.kind === "spec") {
    // The rung this Task was set up from (lib/live/rung.js), first: which car's sales it reports. None: as before.
    // A sibling-answer Task reports the car asked about, so the sibling's lines are not repeated here.
    const rung = w.spec && w.spec.rung && !fromSibling(w) ? rungOf({ rungLabel: w.spec.rung.label, fallbackRung: w.spec.rung.rung, siblingName: w.spec.rung.sibling }) : null;
    for (const line of rungLines(rung)) blocks.push({ line });
    if (evs.length === 1) { blocks.push({ line: saleLine(evs[0], now), url: evs[0].url, linkText: venueOf(evs[0]) ? `View the sale on ${venueOf(evs[0])}` : "View the sale", after: placed(evs[0]) }); subject = `${article(carName(evs[0].title))} ${carName(evs[0].title)} just sold on ${evs[0].house}`; }
    else {
      // The count and the date cover every sale in the task, not only the ten shown.
      const total = evs.length + more, since = oldest || evs[evs.length - 1].date;
      const cnt = WORDS[total] || countText(total);
      blocks.push({ line: `${cnt.charAt(0).toUpperCase() + cnt.slice(1)}${rung ? "" : " " + w.label} sold ${since ? "since " + dayWord(since, now).replace(/^on /, "") : "this week"}.` });
      for (const e of evs) blocks.push({ line: saleLine(e, now), url: e.url, linkText: venueOf(e) ? `View the sale on ${venueOf(e)}` : "View the sale", after: placed(e) });
      subject = `Sam saw ${countText(evs.length + more)} sell: ${w.label}`;
    }
    // The label is the plural family ("3.2 Carrera Targas"); "the next one" reads singular.
    const one = /[a-z0-9]s$/i.test(w.label) && !/ss$/i.test(w.label) ? w.label.slice(0, -1) : w.label;
    if (more > 0) blocks.push({ line: `And ${countText(more)} more ${more === 1 ? "is" : "are"} in your Task.`, more: `${SITE_URL}/tasks/mine` });
    blocks.push({ line: rung ? `You asked Sam to tell you about the next sale of ${w.label}.` : `You asked Sam to tell you when the next ${one} sells.` });
  } else {
    evs.forEach((e, i) => blocks.push({ line: vinLine(w, e, now, i > 0), url: e.url, linkText: e.url ? `View it on ${e.house}` : null }));
    subject = evs.some(e => e.kind === "live") ? `Back at auction: ${w.label}` : evs.some(e => e.kind === "sale") ? `Sold again: ${w.label}` : `Offered again: ${w.label}`;
  }
  const open = `${SITE_URL}/tasks/mine`;
  const tid = /^[0-9a-f-]{36}$/.test(String(w.id || "")) ? w.id : "00000000-0000-4000-8000-0000000000e2";
  const pause = soldTaskTap(tid, "pause"), stop = soldTaskTap(tid, "stop");
  const text = blocks.map(b => b.more ? `${b.line} ${b.more}` : [b.line, b.url ? `${b.linkText}: ${b.url}` : null, b.after].filter(Boolean).join("\n")).join("\n\n") + `\n\nOpen the Task: ${open}\nPause: ${pause}\nStop: ${stop}` + (section ? "" : `\n\n${first ? JUNK_LINE + "\n\n" : ""}GoAskSam`);
  const html = `<div style="font-family:Georgia,serif;font-size:17px;line-height:1.5;color:#1A1A1A;max-width:560px">${blocks.map(b => b.more ? `<p style="margin:0 0 22px;font-family:Arial,sans-serif;font-size:15px"><a href="${esc(b.more)}" style="color:#1A1A1A">${esc(b.line)}</a></p>` : `<p style="margin:0 0 6px">${esc(b.line)}</p>${b.url ? `<p style="margin:0 0 6px"><a href="${esc(b.url)}" style="display:inline-block;padding:11px 18px;border-radius:8px;background:#1E4D38;color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;font-size:15px;font-weight:600">${esc(b.linkText)}</a></p>` : ""}${b.after ? `<p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:15px">${esc(b.after)}</p>` : ""}`).join('<div style="height:14px"></div>')}<p style="font-family:Arial,sans-serif;font-size:15px;margin-top:22px"><a href="${esc(open)}" style="color:#1A1A1A">Open the Task</a> &nbsp;·&nbsp; <a href="${esc(pause)}" style="color:#1A1A1A">Pause</a> &nbsp;·&nbsp; <a href="${esc(stop)}" style="color:#1A1A1A">Stop</a></p>${section ? "" : `${first ? `<p style="font-family:Arial,sans-serif;font-size:13px;color:#5F5A53">${esc(JUNK_LINE)}</p>` : ""}<p style="font-family:Arial,sans-serif;font-size:13px;color:#5F5A53">GoAskSam</p>`}</div>`;
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
  // A Task from a sibling answer reports only sales of the car asked about: none while the engine still answers it
  // with the sibling, and never a card whose own title is another car.
  const sib = fromSibling(w);
  if (sib && d.fallbackRung === "sibling") return [];
  // A sale is judged against the comparable sales as they stood BEFORE it: Market Check's own band (r4Cluster,
  // the middle half, same 8-sale floor as RANGE_THRESHOLD) over the same engine pool, restricted to the twelve
  // months before that sale. Never against a band that already includes the sale itself or later sales.
  const pool = (d.rawPool || []).filter(r => Number.isFinite(r._usd) && r.auction_end_date);
  const bandBefore = date => {
    const end = String(date).slice(0, 10), start = new Date(Date.parse(end + "T12:00:00Z") - 365 * 864e5).toISOString().slice(0, 10);
    const rows = pool.filter(r => { const x = String(r.auction_end_date).slice(0, 10); return x < end && x >= start; });
    return rows.length >= (__specEngine.RANGE_THRESHOLD || 8) ? __specEngine.r4Cluster(rows) : null;
  };
  const isNew = c => Number(c.price) > 0 && c.date && String(c.date).slice(0, 10) > String(w.baseline_date || "") && (!sib || namesCar(c.title, w.label));
  const keyOf = c => "s:" + (c.url || `${c.title}|${String(c.date).slice(0, 10)}|${c.price}`);
  const inRange = (d.cards || []).filter(isNew)
    .map(c => ({ key: keyOf(c), kind: "sale", band: d.bodyScoped === false ? null : bandBefore(c.date), bodyScoped: typeof d.bodyScoped === "boolean" ? d.bodyScoped : null, bandNow: Array.isArray(d.cluster) ? d.cluster : null, poolN: pool.length, date: String(c.date).slice(0, 10), price: Number(c.price), miles: Number(c.mi) || null, house: houseName(c.platform) || c.platform || "auction", url: c.url || null, title: c.title || "" }));
  // A sale the engine set aside (setAsideRows, each with its reason): reported with the reason, never with a band, so
  // it is never placed against the range (Sam, Oct 15 2026: set-aside sales are shown, labelled, never blended).
  const seen = new Set(inRange.map(e => e.key));
  const aside = (d.setAsideRows || []).filter(isNew).filter(c => !seen.has(keyOf(c)))
    .map(c => ({ key: keyOf(c), kind: "sale", setAside: String(c.reason || ""), band: null, bandNow: null, bodyScoped: null, poolN: pool.length, date: String(c.date).slice(0, 10), price: Number(c.price), miles: Number(c.mi) || null, house: houseName(c.platform) || c.platform || "auction", url: c.url || null, title: c.title || "" }));
  return [...inRange, ...aside];
}
async function vinEvents(env, w) {
  const since = String(w.created_at || "").slice(0, 10);
  const h = await vinAppearances(env, w.key).catch(() => null);
  if (!h || !h.ok) return null;
  const out = (h.appearances || []).filter(a => a.date && a.date > since).map(a => ({ key: `a:${a.date}|${a.house}|${a.url || ""}`, kind: a.kind === "sale" ? "sale" : "attempt", date: a.date, price: a.priceUsd || null, bid: a.bidUsd || null, house: a.house || "auction", url: a.url || null, title: a.title || "" }));
  const live = await rest(env, `live_listings?vin_norm=eq.${encodeURIComponent(w.key)}&status=eq.live&first_seen=gt.${encodeURIComponent(w.created_at)}&select=id,source,url,listing_title,current_bid_usd,end_time,first_seen,bid_at,last_seen&limit=5`).catch(() => []);
  // A listing whose end time has passed is not "live" any more, even before the next pull marks it ended.
  for (const r of (live || []).filter(r => !r.end_time || Date.parse(r.end_time) > Date.now())) out.push({ key: "l:" + r.id, kind: "live", date: String(r.first_seen || "").slice(0, 10), bid: r.current_bid_usd != null ? Math.round(Number(r.current_bid_usd)) : null, bidAt: r.bid_at || null, end: r.end_time, house: houseName(r.source), url: r.url, title: r.listing_title || "" });
  return out;
}
export const eventsFor = (env, w) => (w.kind === "spec" ? specEvents(env, w) : vinEvents(env, w));

// ---------------------------------------------------------------- arm, stop, list
async function liveRow(env, id) { const rows = await rest(env, `live_listings?id=eq.${Number(id)}&select=*&limit=1`); return rows && rows[0]; }
// Arm a watch. Three ways in, one endpoint (api/watch.js), so every page arms the same thing:
//   { kind:"spec", listing_id }  Buy's card: that listing's spec.
//   { kind:"spec", car:{ year, make, model, trim, body, gearbox } }  a car without a listing (Market Check):
//        built into a listing-shaped row and read through the SAME specOf, so it lands on the same spec key
//        a card for that car would have.
//   { kind:"vin", listing_id } or { kind:"vin", vin }  this exact car.
// Returns { watch, first } or { error }.
function rowFromCar(car) {
  const c = car || {};
  const title = [c.year, c.make, c.model, c.trim, c.body].map(x => String(x == null ? "" : x).trim()).filter(Boolean).join(" ").slice(0, 200);
  const gb = /^(manual|automatic|auto)$/i.test(String(c.gearbox || "")) ? (/^man/i.test(c.gearbox) ? "manual" : "automatic") : null;
  return title && c.make && c.model ? { listing_title: title + (gb === "manual" ? " Manual" : ""), year: Number(c.year) || null, body_style: c.body || null } : null;
}
// task_created's car (docs/analytics-events.md): make|model and year only; the VIN goes to the admin-only column.
export function taskCar(kind, c) {
  return { kind, vehicle_key: c && c.make ? `${c.make}|${c.model || ""}`.toLowerCase() : undefined, year: Number(c && c.year) || undefined, fallback_rung: (c && c.fallback_rung) || undefined };
}
export async function arm(env, user, { kind, listing_id, vin, car, visitorId }) {
  if (!["spec", "vin"].includes(kind)) return { error: "kind" };
  if (kind === "vin" && vin && !listing_id) return armVin(env, user, String(vin), visitorId);
  const row = Number.isFinite(Number(listing_id)) ? await liveRow(env, listing_id) : (kind === "spec" ? rowFromCar(car) : null);
  if (!row) return { error: "not found" };
  const prior = await rest(env, `watches?user_id=eq.${user.userId}&select=id&limit=1`);
  let w, tcar = {};
  if (kind === "vin") {
    const vin = String(row.vin_norm || "").toUpperCase(); if (vin.length < 11) return { error: "no vin" };
    tcar = { make: row.make, model: row.model_family || row.model, year: row.year, vin };
    w = { user_id: user.userId, email: user.email || null, kind, key: vin, label: carName(row.listing_title) };
  } else {
    const facts = listingFacts(row), spec = await specOf(env, row, facts);
    if (!spec) return { error: "no spec" };
    const m = await listingMarket(env, row, facts).catch(() => null);
    const st = specTaskOf(spec, m, carName(spec.title));
    tcar = st.tcar;
    const d = await cohortAnswer(env, spec).catch(() => undefined);
    // The baseline: the newest sale the engine already holds (so only sales after this one count), else today.
    const latest = ((d && d.cards) || []).map(c => String(c.date || "").slice(0, 10)).filter(Boolean).sort().pop() || todayPT();
    w = { user_id: user.userId, email: user.email || null, kind, key: spec.key, label: st.label, spec: st.spec, baseline_date: latest };
  }
  // One per spec or car per account: arming again restarts a stopped one.
  const out = await rest(env, "watches?on_conflict=user_id,kind,key", "POST", [{ ...w, stopped_at: null }], "resolution=merge-duplicates,return=representation");
  // watch_created (Oct 2026, open-search policy Part 1.3): once per successful arm, re-arming a
  // stopped watch counted again too - a known, minor imprecision, not fixed here.
  logEvent(env, { event: EVENTS.WATCH_CREATED, userId: user.userId, visitorId: visitorId || null, props: { kind: "spec" } }).catch(() => {});
  trackCurrent("task_created", taskCar(kind === "vin" ? "exact_car" : "sold_car", tcar), { product: "tasks", surface: "tasks_page", user_id: user.userId, vin: tcar.vin || null });
  return { watch: shape(out && out[0]), first: !(prior && prior.length) };
}
async function armVin(env, user, vinIn, visitorId) {
  const key = String(vinIn || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (key.length < 11) return { error: "no vin" };
  const prior = await rest(env, `watches?user_id=eq.${user.userId}&select=id&limit=1`);
  const h = await vinAppearances(env, key).catch(() => null);
  let t = h && h.appearances && (h.appearances.find(a => a.title) || {}).title;
  if (!t) { const lr = await rest(env, `live_listings?vin_norm=eq.${encodeURIComponent(key)}&select=listing_title&order=first_seen.desc&limit=1`).catch(() => null); t = lr && lr[0] && lr[0].listing_title; }
  if (!t && !(h && h.appearances && h.appearances.length)) return { error: "unknown vin" };
  const out = await rest(env, "watches?on_conflict=user_id,kind,key", "POST", [{ user_id: user.userId, email: user.email || null, kind: "vin", key, label: carName(t || "car"), stopped_at: null }], "resolution=merge-duplicates,return=representation");
  logEvent(env, { event: EVENTS.WATCH_CREATED, userId: user.userId, visitorId: visitorId || null, props: { kind: "vin" } }).catch(() => {});
  const ap = (h && h.appearances || []).find(a => a.make) || {};
  trackCurrent("task_created", taskCar("exact_car", { make: ap.make, model: ap.model, year: ap.year }), { product: "tasks", surface: "tasks_page", user_id: user.userId, vin: key });
  return { watch: shape(out && out[0]), first: !(prior && prior.length) };
}
export async function stop(env, user, id) {
  if (!/^[0-9a-f-]{36}$/.test(String(id || ""))) return { error: "id" };
  await rest(env, `watches?id=eq.${id}&user_id=eq.${user.userId}`, "PATCH", { stopped_at: new Date().toISOString() });
  trackCurrent("task_cancelled", { via: "page" }, { product: "tasks", surface: "tasks_page", user_id: user.userId });
  return { ok: true };
}
// Start a paused task again (the Tasks page rail), only the signed-in person's own.
export async function resume(env, user, id) {
  if (!/^[0-9a-f-]{36}$/.test(String(id || ""))) return { error: "id" };
  await rest(env, `watches?id=eq.${id}&user_id=eq.${user.userId}`, "PATCH", { paused_at: null });
  return { ok: true };
}
export async function stopAllWatches(env, userId) {
  await rest(env, `watches?user_id=eq.${userId}&stopped_at=is.null`, "PATCH", { stopped_at: new Date().toISOString() });
  return { ok: true };
}
export function shape(w) { return w ? { id: w.id, kind: w.kind, label: w.label, rung_label: (w.spec && w.spec.rung && w.spec.rung.label) || null, rung_sibling: fromSibling(w), key: w.kind === "vin" ? w.key : null, last_event: w.last_event || null, last_event_at: w.last_event_at || null, paused_at: w.paused_at || null, created_at: w.created_at } : null; }
export async function list(env, user) {
  const rows = await rest(env, `watches?user_id=eq.${user.userId}&stopped_at=is.null&select=*&order=created_at.desc&limit=100`);
  return { watches: (rows || []).map(shape) };
}

// ---------------------------------------------------------------- the run (cron)
// After the combined Task email carried these events (lib/tasks/digest.js): recorded once each, and the Task's rail
// line updated. status: "sent", "skipped_...", or "off" (the person turned Task emails off).
export async function markWatchSent(env, w, events, status, now = new Date()) {
  if (!events.length) return;
  await rest(env, "watch_sends?on_conflict=watch_id,event_key", "POST", events.map(e => ({ watch_id: w.id, event_key: e.key, send_status: status })), "resolution=ignore-duplicates");
  const top = events.slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))[0];
  await rest(env, `watches?id=eq.${w.id}`, "PATCH", { last_sent_at: now.toISOString(), last_event_at: now.toISOString(), last_event: railLine(w, top, now) });
}
// The events a watch has not sent yet (newest first), or null when its read did not come back.
export async function pendingEvents(env, w) {
  const evs = await eventsFor(env, w).catch(e => { console.error("watch events:", w.id, e && e.message); return null; });
  if (evs == null) return null;
  if (!evs.length) return [];
  const sentRows = await rest(env, `watch_sends?watch_id=eq.${w.id}&select=event_key&limit=2000`);
  const sent = new Set((sentRows || []).map(x => x.event_key));
  return evs.filter(e => !sent.has(e.key)).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
}
// Since the Task email frequency setting (Oct 2026) this run SENDS NOTHING by default: every watch's events go out in
// the person's combined Task email (lib/tasks/digest.js, /api/tasks?send=1). It stays as a read of what is pending
// (dry) for our own checks; opts.send keeps the old one-watch sending for a probe that asks for it explicitly.
export async function run(env, opts = {}) {
  if (!opts.send) opts = { ...opts, dry: true };
  const now = opts.now ? new Date(opts.now) : new Date();
  const rows = await rest(env, `watches?stopped_at=is.null${opts.userId ? `&user_id=eq.${opts.userId}` : ""}&select=*&order=created_at.asc&limit=2000`);
  const out = { checked: 0, sent: 0, held: 0, quiet: 0, unread: 0, results: [] };
  const firstSeen = new Set((rows || []).filter(w => w.last_sent_at).map(w => w.user_id));
  for (const w of rows || []) {
    out.checked++;
    if (w.paused_at) { out.quiet++; out.results.push({ id: w.id, paused: true }); continue; }   // paused: no emails until the person starts it again
    const evs = await eventsFor(env, w).catch(e => { console.error("watch events:", w.id, e && e.message); return null; });
    if (evs == null) { out.unread++; continue; }
    if (!evs.length) { out.quiet++; continue; }
    const sentRows = await rest(env, `watch_sends?watch_id=eq.${w.id}&select=event_key&limit=2000`);
    const sent = new Set((sentRows || []).map(s => s.event_key));
    // Newest first, so the ten an email shows are the latest; the rest are in the task.
    const fresh = evs.filter(e => !sent.has(e.key)).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    if (!fresh.length) { out.quiet++; continue; }
    // The digest: within 7 days of the last message, new events wait and go together.
    if (w.last_sent_at && now - new Date(w.last_sent_at) < DIGEST_MS) { out.held++; continue; }
    const oldest = fresh.map(e => String(e.date || "")).filter(Boolean).sort()[0] || null;
    // The owner's sign-in address only (lib/tasks/delivery.js), never the address stored on the watch row.
    const to = opts.dry ? null : emailOf(await getDeliveryTargets(env, w.user_id));
    const msg = messageFor(w, fresh.slice(0, 10), { first: to ? await firstEmailTo(env, to) : false, now, more: Math.max(0, fresh.length - 10), oldest });
    let status = "dry";
    if (!opts.dry && !to) status = "no_sign_in_address";
    else if (!opts.dry) {
      const r = await sendTaskEmail({ to, subject: msg.subject, text: msg.text, html: msg.html, headers: soldTaskHeaders(w.id) });
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
export async function testSend(env, { kind, listing_id, vin, since, to, first = true, userId, subjectPrefix = "", dry = false }) {
  const uid = /^[0-9a-f-]{36}$/.test(String(userId || "")) ? userId : "00000000-0000-0000-0000-000000000000";
  let w;
  if (kind === "vin") {
    const key = String(vin || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const h = await vinAppearances(env, key).catch(() => null);
    let t = h && h.appearances && (h.appearances.find(a => a.title) || {}).title;
    if (!t) { const lr = await rest(env, `live_listings?vin_norm=eq.${encodeURIComponent(key)}&select=listing_title&order=first_seen.desc&limit=1`).catch(() => null); t = lr && lr[0] && lr[0].listing_title; }
    w = { kind, key, label: carName(t || "car"), user_id: uid, created_at: since };
  } else {
    const row = await liveRow(env, listing_id); if (!row) return { error: "not found" };
    const facts = listingFacts(row), spec = await specOf(env, row, facts); if (!spec) return { error: "no spec" };
    const m = await listingMarket(env, row, facts).catch(() => null);
    const st = specTaskOf(spec, m, carName(spec.title));   // the same naming as arm(), so a test send reads like the real Task
    w = { kind, key: spec.key, label: st.label, spec: { ...spec, ...st.spec }, baseline_date: String(since).slice(0, 10), user_id: uid };
  }
  const evs = await eventsFor(env, w);
  if (!evs || !evs.length) {
    // Why nothing (probe only): what the engine answered for this spec.
    let why = null;
    if (w.kind === "spec") { const d = await cohortAnswer(env, w.spec).catch(() => undefined); why = d === undefined ? "no read" : !d ? "no cohort read" : { tier: d.tier, cards: (d.cards || []).length, newest: (d.cards || []).map(c => String(c.date || "").slice(0, 10)).sort().pop() || null }; }
    return { events: evs ? 0 : null, label: w.label, why };
  }
  evs.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  const msg = messageFor(w, evs.slice(0, 10), { first, more: Math.max(0, evs.length - 10), oldest: evs.map(e => String(e.date || "")).filter(Boolean).sort()[0] || null });
  if (subjectPrefix) msg.subject = subjectPrefix + msg.subject;
  // Our own test inbox only (lib/tasks/delivery.js testInbox): a probe never sends to anyone else.
  const inbox = testInbox(to);
  const r = inbox ? await sendTaskEmail({ to: inbox, subject: msg.subject, text: msg.text, html: msg.html, headers: unsubscribeHeaders(w.user_id) }) : null;
  return { label: w.label, events: evs.length, sent: r ? (r.ok ? "sent" : r.reason || r.error || r.status) : null, bands: evs.slice(0, 10).map(e => ({ date: e.date, price: e.price, house: e.house, bandBefore: e.band, bandNow: e.bandNow, poolN: e.poolN })), ...msg };
}

// Probe helpers (api/watch.js, probe key only): move a test watch's start back so a real recent event counts
// as new, and read an account's watches with their sent log.
export async function probeBackdate(env, id, { baseline_date, created_at }) {
  const patch = {}; if (baseline_date) patch.baseline_date = String(baseline_date).slice(0, 10); if (created_at) patch.created_at = new Date(created_at).toISOString();
  return rest(env, `watches?id=eq.${id}`, "PATCH", patch, "return=representation");
}
export async function probeInspect(env, userId) {
  const ws = await rest(env, `watches?user_id=eq.${userId}&select=*&order=created_at.desc&limit=50`);
  const ids = (ws || []).map(w => w.id);
  const sends = ids.length ? await rest(env, `watch_sends?watch_id=in.(${ids.join(",")})&select=*&order=sent_at.desc&limit=200`) : [];
  return { watches: ws, sends };
}
