// PARTNER ANSWER (Lane C, Oct 15 2026; closed demo, crew-only): "What these sell for, powered by GoAskSam" for a
// partner's own listing layout (/preview). ONE ENGINE: every number here is Market Check's own answer for the
// same words. This file never reads the archive for a market itself: it calls Market Check's request handler
// (api/sellerDecision.js, the oneBox branch, the same resolver, stored answer, engine call and output gate the
// Market Check page gets) in-process and only reshapes that answer. If this and Market Check ever disagree for the
// same car, this is wrong (scripts/partnerEngineMatch.mjs checks it).
//
// Input (POST JSON, or GET query): q, or year/make/model, or vin; plus the refines Market Check takes (refine:
// body, trim, variant, tx, miMin, miMax, miTarget) and asked (the question count). A VIN is named from that car's
// own records (the history page's rule, api/_historyData.js carIdentity) and those words go to Market Check.
// Output: identity (year, make, model, body, variant), the engine's identity question with what each choice sends
// next, a range only when the engine gives one, count, window, sales in price order (price, date and mileage only),
// set-aside reasons, a thin line under eight sales (words only, never a range), a trend only for quarters with
// eight or more sales, the VIN's own history (sold, or offered and not sold with the high bid), and updated (the
// shared last-ingest date, lib/asOf.js lastUpdatedDate, the one Buy and Sell show; null when unread, never made up).
// NEVER in any output: a venue name, a venue link, a listing id, a listing title.
// Gate: the signed crew cookie, the partner demo cookie (lib/_partnerAccess.js gas_partner), or the PARTNER_KEY header (x-partner-key) when that env var is set; anything else
// is a plain 404. Rate limited (lib/_ceilings.js partner_answer). Archive only: zero OldCarsData requests.
import crypto from "node:crypto";
import { isCrewRequest } from "../lib/_crew.js";
import { isPartnerRequest } from "../lib/_partnerAccess.js";
import { checkCeiling } from "../lib/_ceilings.js";
import { currentEpoch } from "../lib/_epoch.js";
import { photoId, photoUrlFor, fetchPhoto, vinPhotoKey, safeImageUrl, sizedPhotoUrl } from "../lib/_salePhoto.js";
import { supabaseEnv } from "../lib/_supabase.js";
import { vinAppearances, carIdentity, normVin } from "./_historyData.js";
import { lastUpdatedDate } from "../lib/asOf.js";
import { decodeVinFacts } from "../lib/vehicle.js";
import { sellsForCardHtml, latestQuarterRowHtml } from "../lib/sellsForCard.js";
import { mapEngineAnswer, ENGINE_VERSION } from "../lib/onebox.js";

// THE SHARED CARD (Sam, Oct 16 2026; Lane A's lib/sellsForCard.js): the "What these sell for" card is rendered here by
// the one function every product uses, from the very answer Market Check's page hands it (its raw answer), so the
// partner card and the Market Check card for the same words are the same card. The page puts its pill in PILL_SLOT,
// the card's one pill placement (directly under the range). The latest-quarter row (view d only) is the card's own
// latestQuarterRowHtml over the engine's own trendQuarters mapping (lib/onebox.js mapEngineAnswer), never recomputed.
// THE LAST GOOD ANSWER (Sam, Oct 17 2026): for the demo's own cars only, the endpoint keeps its last good answer, the
// engine's answer exactly as this file shaped it, with the engine's readAt, in app_config (key partner_last:<car>). If a
// live read fails or comes back "unavailable" (the engine's own holding card under load), that answer is shown with
// lastGood: true, only while its readAt is under a day old; past that the page says it could not read the sales. Not a
// second source: the same answer, kept, never edited.
// c9 (Sam, Oct 18 2026): the real 2014 Porsche 911 GT3 is the listing car and the page's first car.
export const DEMO_CARS = ["2014 Porsche 911 GT3", "2015 Porsche 911 GT3", "2005 Porsche 911", "1965 Ford Mustang", "1957 Porsche 356 Speedster", "1966 Ferrari 275 GTB", "2023 Porsche 911 GT3"];
const demoKey = q => { const n = String(q || "").toLowerCase().replace(/\s+/g, " ").trim(); return DEMO_CARS.some(c => c.toLowerCase() === n) ? "partner_last:" + n.replace(/[^a-z0-9]+/g, "_") : null; };
const LAST_MAX_MS = 24 * 3600e3, LAST_WRITE_EVERY_MS = 30 * 60e3;
const lastWrote = new Map();
async function readLast(env, key) {
  try {
    const r = await fetch(`${env.supabaseUrl}/rest/v1/app_config?key=eq.${encodeURIComponent(key)}&select=value&limit=1`, { headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}` }, signal: AbortSignal.timeout(3000) });
    const rows = r.ok ? await r.json() : null; const v = rows && rows[0] && rows[0].value;
    return v && typeof v === "object" ? v : (typeof v === "string" ? JSON.parse(v) : null);
  } catch { return null; }
}
// (c) (Sam's demo orders, Oct 19 2026): the demo's own store also keeps the engine's QUESTION answer (a car whose first
// answer is the body or model question, the 1965 Mustang's "Which Mustang?"), exactly as the engine returned it, stamped
// with ENGINE_VERSION and readAt like a full result, so the page serves the stored question and never computes it live.
export const questionResult = out => !!(out && out.ok === true && out.answerType === "identity_question" && out.question && Array.isArray(out.question.options) && out.question.options.length > 0 && !out.stillReading);
async function writeLast(env, key, out, { force = false } = {}) {
  if (!fullResult(out) && !questionResult(out)) return false;
  if (!force && Date.now() - (lastWrote.get(key) || 0) < LAST_WRITE_EVERY_MS) return false;
  lastWrote.set(key, Date.now());
  try {
    const w = await fetch(`${env.supabaseUrl}/rest/v1/app_config?on_conflict=key`, { method: "POST", headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ key, value: { readAt: out.readAt || new Date().toISOString(), savedAt: new Date().toISOString(), engineVersion: ENGINE_VERSION, out } }), signal: AbortSignal.timeout(3000) });
    return w.ok;
  } catch { return false; /* best effort: a missed write only means an older last good answer */ }
}
// A full result only (Sam, Oct 18 2026): the engine's finished answer for the car, a range, a thin answer (its count
// and sales without a range) or its zero-sales answer. Never a question, a still-reading answer, a refusal or a failed
// read; then the older good answer stays as it is.
export const fullResult = out => !!(out && out.ok === true && /^(range|not_enough_data|zero_result)$/.test(String(out.answerType)) && !out.stillReading);
// THE ONE WRITE PATH for partner_last:<car> (Sam, Oct 18 2026): the endpoint's own reads and task=warmDemo (api/usageDashboard.js)
// both store through here. warmDemo calls refreshDemoAnswer(env, car) for each demo car: the same in-process read the
// page gets, shaped by the same partnerShape, stored only when it is a full result. Writes nothing for any other car.
export async function refreshDemoAnswer(env, car, { host = "goasksam.com" } = {}) {
  const key = demoKey(car);
  if (!key || !env) return { car, stored: false, why: key ? "no env" : "not a demo car" };
  const t0 = Date.now();
  let r;
  try { r = await marketCheckAnswer({ headers: { host } }, car, null, 0, true); } catch (e) { return { car, stored: false, why: "read failed", ms: Date.now() - t0 }; }
  const out = partnerShape(r && r.d, car, 0, {});
  if (!fullResult(out) && !questionResult(out)) return { car, stored: false, why: out && out.stillReading ? "still reading" : (out && (out.error || out.answerType)) || "no answer", ms: Date.now() - t0 };
  if (venueLeak(out).length) return { car, stored: false, why: "blocked", ms: Date.now() - t0 };
  const ok = await writeLast(env, key, out, { force: true });
  return { car, stored: ok, readAt: out.readAt || null, answerType: out.answerType, ms: Date.now() - t0 };
}
// Lane B (Sam's demo orders, Oct 19 2026): the last good answer carries the ENGINE_VERSION it was read under and is
// never served under another version (an answer kept from before an engine push is an older engine's answer). A row
// stored before this change carries no version and is not served either; the next warm or live read stores a new one.
export async function readDemoLast(env, car) { const key = demoKey(car); return key && env ? readLast(env, key) : null; }
export function lastGoodUsable(v, nowMs = Date.now()) {
  const t = v && Date.parse(v.readAt);
  return !!(v && v.out && v.out.ok && v.engineVersion === ENGINE_VERSION && Number.isFinite(t) && nowMs - t < LAST_MAX_MS);
}

// FIX 2's one rule, pure (scripts/demoStoredCheck.mjs): a stored demo answer is served before Market Check's handler only
// when it is a full result of the current ENGINE_VERSION, under a day old, and read after the current sales epoch.
export function storedDemoServable(v, epoch, nowMs = Date.now()) {
  const epMs = epoch ? Date.parse(epoch) : NaN, readMs = v ? Date.parse(v.readAt) : NaN;
  // a stored answer made before the card carried its sale rows (cardWithRows, Oct 20 2026) is never served: the Amazon
  // tab c would draw "These are the sales we found." with no sales under it (the 08:43Z look); it reads through instead.
  // Likewise one stored before its row photos asked a width (12:32Z look: the 275 GTB's nine rows still full size).
  return !!(lastGoodUsable(v, nowMs) && fullResult(v.out) && typeof v.out.cardWithRows === "string" && !/\?photo=[^"&]+"/.test(v.out.cardWithRows) && Number.isFinite(epMs) && Number.isFinite(readMs) && readMs > epMs);
}

export const PILL_SLOT = '<div class="gas-pill-slot"></div>';
// The shared card on the partner views (Sam, Oct 19 2026, e63): the engine's line and latest-sale line as on every
// product; its sale rows are left to the page's own sales list, which every /preview view draws from the same engine
// sales right below the card (date, price, mileage, photo through the gated ?photo= path, venue-blind), so no sale
// shows twice.
export const PARTNER_CARD_OPTS = { partnerPillsHtml: PILL_SLOT, rows: false };
// THE DEMO'S COPY OF THE CARD (Sam, Oct 16 2026), two edits on the shared card's own output, nothing else: (1) the basis
// line states no month count: "Based on {count} sales, the latest in {Month Year}." (the count in words under ten, the
// latest from the engine's own sale dates; the engine's window is unchanged); (2) "How Sam decides" is plain text, not a
// link. Everything else is the card Market Check draws (scripts/partnerEngineMatch.mjs proves it byte for byte).
const WORD = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export function basisLine(d) {
  const n = countOf(d), dates = salesOf(d).map(s => s.date).filter(Boolean).sort();
  if (!n || !dates.length) return null;
  const last = dates[dates.length - 1].split("-"), mon = MONTHS[Number(last[1]) - 1];
  return "Based on " + (n < 10 ? WORD[n] : n.toLocaleString("en-US")) + " " + (n === 1 ? "sale" : "sales") + (mon ? ", the latest in " + mon + " " + last[0] : "") + ".";
}
// (3, Sam, Oct 18 2026) the set-aside line reads as one plain sentence from the engine's own numeric reason counts
// (setAsideReasons): the count in words under ten, singular and plural right, no colon ("Four sales set aside as odd
// sales.", "Five sales set aside, four as odd sales and one as modified.").
const ASIDE_AS = { "odd sale": ["an odd sale", "odd sales"], project: ["a project", "projects"], replica: ["a replica", "replicas"], modified: ["modified", "modified"] };
const numWord = n => n < 10 ? WORD[n] : n.toLocaleString("en-US");
export function asideSentence(d) {
  const r = d && d.setAsideReasons && typeof d.setAsideReasons === "object" ? d.setAsideReasons : null;
  if (!r) return null;
  const parts = Object.keys(r).map(k => [k, Number(r[k]) || 0]).filter(([, n]) => n > 0);
  const k = parts.reduce((t, [, n]) => t + n, 0);
  if (!k) return null;
  const as = ([key, n]) => "as " + (ASIDE_AS[key] ? ASIDE_AS[key][n === 1 ? 0 : 1] : key);
  const head = numWord(k) + " " + (k === 1 ? "sale" : "sales") + " set aside";
  const text = parts.length === 1 ? head + " " + as(parts[0])
    : head + ", " + parts.map(([key, n], i) => (i && i === parts.length - 1 ? "and " : "") + numWord(n) + " " + as([key, n])).join(parts.length > 2 ? ", " : " ");
  return text.charAt(0).toUpperCase() + text.slice(1) + ".";
}
const escHtml = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// (4, Sam, Oct 18 2026, demo only) the set-aside line comes off the demo's card (the set-aside group under the list
// carries it, worded by asideSentence); (5) under the footer, the plain middle-half line (a range card only).
// The shared card (lib/sellsForCard.js) and every other product keep their own lines.
export const HOW_LINE = "The range is the middle half of the sales: a quarter sold below it, a quarter above it.";
export function demoCard(html, d) {
  if (!html) return html;
  const b = basisLine(d), ranged = /class="sfc-range"/.test(html);
  return html.replace(/<p class="sfc-basis">[\s\S]*?<\/p>/, b ? '<p class="sfc-basis">' + escHtml(b) + "</p>" : "")
    .replace(/<p class="sfc-aside">[\s\S]*?<\/p>/, "")
    .replace(/<a class="sfc-footer-link"[^>]*>How Sam decides<\/a><\/div>/, '<span class="sfc-footer-link">How Sam decides</span></div>' + (ranged ? '<p class="sfc-howline">' + escHtml(HOW_LINE) + "</p>" : ""));
}

const RANGE_MIN = 8;   // the engine's own RANGE_THRESHOLD: under eight sales there is no range, only words
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
// Sam's words (Amazon demo, revision 2, item 8a, Oct 20 2026).
export const VIN_UNREADABLE_LINE = "We couldn't read that VIN. Check it, or type the year, make and model.";

function samePartnerKey(sent) {
  const want = process.env.PARTNER_KEY;
  if (!want || !sent) return false;
  const a = Buffer.from(String(sent)), b = Buffer.from(String(want));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
export function partnerAllowed(req) {
  const h = (req && req.headers) || {};
  return isCrewRequest(req) || isPartnerRequest(req) || samePartnerKey(h["x-partner-key"]);
}

// Market Check's own request handler, called in-process with the same body the Market Check page sends. The read has no
// deadline of its own (Sam, Oct 18 2026: no demo-only timeout): the engine's own whole-path bound answers "still reading"
// with its retry, and the page draws that.

export async function marketCheckAnswer(req, text, refine, asked, demo = false) {
  const { default: mc } = await import("./sellerDecision.js");
  const body = { oneBox: true, car: { raw: text }, asked: Math.max(0, Math.min(9, Number(asked) || 0)) };
  if (demo) body.demoRead = true;   // Lane B (demo2): Market Check skips the public share snapshot for the demo's own read (honoured only with the server credential)
  if (refine) body.refine = refine;
  // The read goes in as the server's own internal call (Oct 17 2026): Market Check is sealed before launch, and a partner
  // session (gas_partner, no crew cookie) was refused by its seal, so the demo drew no sales. The credential comes from
  // the environment, never leaves this process and is never printed; the partner gate and the partner_answer ceiling
  // stay in front of it. The visitor's cookies are not passed (the read is the same for every caller). With no key in
  // the environment the visitor's own headers are passed, as before. FOR LANE B: an internal-caller flag in
  // api/sellerDecision.js would be cleaner than the test-stage path.
  const internalKey = process.env.OPS_KEY || process.env.PROBE_KEY || "";
  const base = { ...(req.headers || {}) };
  // A read of one of the demo's six cars carries no visitor address or browser (Oct 18 2026): Market Check's visitor
  // ceilings counted every demo read against the founder's office address and browser (cookies are never passed, so even
  // a crew browser counted), and a cold demo load answered "Lots of reads". The six cars are bounded by this endpoint's
  // own partner_demo ceiling instead. Any other car keeps the visitor's address and browser, so Market Check's limits
  // apply to it exactly as before.
  const who = demo ? {} : { "user-agent": base["user-agent"], "x-forwarded-for": base["x-forwarded-for"] };
  const headers = internalKey ? { host: base.host, ...who, "x-ops-key": internalKey, "x-launch-stage-test": "2" } : base;
  const sub = { method: "POST", url: "/api/sellerDecision", headers, query: {}, body };
  let out = null, code = 200;
  const res = {
    statusCode: 200, headersSent: false,
    setHeader() {}, getHeader() { return undefined; }, removeHeader() {},
    status(c) { code = c; this.statusCode = c; return this; },
    json(o) { if (out == null) out = o; this.headersSent = true; return this; },
    send(o) { if (out == null) out = o; this.headersSent = true; return this; },
    end() { this.headersSent = true; return this; }
  };
  await mc(sub, res);
  return { status: code, d: out };
}

// Only the refines Market Check itself accepts, shape-checked; anything else is dropped.
function cleanRefine(r) {
  if (!r || typeof r !== "object") return null;
  const o = {};
  const word = v => typeof v === "string" && /^[A-Za-z0-9 ._/-]{1,40}$/.test(v) && !VENUE_RE.test(v);   // the engine's own option values
  if (word(r.body)) o.body = r.body;
  if (word(r.trim)) o.trim = r.trim;
  if (word(r.variant)) o.variant = r.variant;
  if (r.tx === "manual" || r.tx === "auto") o.tx = r.tx;
  if (r.docHistory === "has" || r.docHistory === "nohas") o.docHistory = r.docHistory;
  for (const k of ["miMin", "miMax", "miTarget"]) if (Number.isFinite(Number(r[k])) && r[k] !== null && r[k] !== "") o[k] = Number(r[k]);
  return Object.keys(o).length ? o : null;
}

const num = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n) : null; };
const day = v => (v ? String(v).slice(0, 10) : null);

// The sales Market Check lists for this answer, reduced to price and date, lowest first: the range tier's own
// d.cards, the thin tier's own receipts (public/js/onebox.js moreComparableSalesHtml / thinCardsFrom read the same).
// A sale row's name (Sam, Oct 18 2026): the engine row's own title; if it carries a venue word, the row's own year,
// make and model instead; never a venue, never a URL. It travels as `name`, and the archive row's own id as `photo`
// (used only by the demo's photo slot, /api/partnerAnswer?photo=<id>, which looks the photo up server side), so the
// venue-leak guard below stays exactly as it is (it refuses any key called id or title, anywhere).
export function rowTitle(r) {
  const t = String((r && r.title) || "").trim();
  if (t && !VENUE_RE.test(t)) return t;
  const f = [r && r.year, r && r.make, r && r.model].filter(Boolean).join(" ").trim();
  return f && !VENUE_RE.test(f) ? f : "";
}
const rowId = r => r && r.id != null ? photoId(r.id) : null;   // the archive's UUID (lib/_salePhoto.js photoId)
export function salesOf(d) {
  if (!d) return [];
  let rows;
  if (d.tier === "thin" && d.thin && Array.isArray(d.thin.receipts)) rows = d.thin.receipts.map(r => ({ photo: rowId(r), name: rowTitle(r), price: num(r.allIn) || num(r.hammer), date: day(r.date), miles: num(r.mileage) }));
  else rows = (Array.isArray(d.cards) ? d.cards : []).map(c => ({ photo: rowId(c), name: rowTitle(c), price: num(c.price), date: day(c.date), miles: num(c.mi) }));
  return rows.filter(r => r.price).sort((a, b) => a.price - b.price || String(a.date || "").localeCompare(String(b.date || "")));
}
// THE CAR'S PHOTO (Sam, Oct 18 2026, for the eBay showing: always a photo of the same car when there is one, never a
// wrong one). Taken only from the engine's own included sales for this answer (never a set-aside row): the engine's pool
// is already that car's generation and trim, with halo trims set aside. A sale of the same year first, newest first;
// then any included sale. No photo on any included sale means no photo. The id is served by the same ?photo= path.
export function carPhotoOf(d, year) {
  const rows = salesOf(d).filter(r => r.photo);
  if (!rows.length) return null;
  const yr = r => { const m = /^(\d{4})\b/.exec(String(r.name || "")); return m ? Number(m[1]) : null; };
  const newest = (a, b) => String(b.date || "").localeCompare(String(a.date || ""));
  const same = year ? rows.filter(r => yr(r) === Number(year)).sort(newest) : [];
  const pick = same[0] || rows.slice().sort(newest)[0];
  return { photo: pick.photo, sameYear: !!same[0] };
}
// The count Market Check's page heads its answer with (heroPoolSizeNum: poolSize, then poolN, then the facts block).
export function countOf(d) {
  if (!d) return null;
  if (Number.isFinite(d.poolSize)) return d.poolSize;
  if (Number.isFinite(Number(d.poolN)) && d.poolN !== null) return Number(d.poolN);
  if (d.factsBlock && Number.isFinite(d.factsBlock.count)) return d.factsBlock.count;
  return null;
}
// A range exactly when Market Check shows one: the result tier's cluster (the engine's 8-sale gate).
export function rangeOf(d) {
  return d && d.tier === "result" && Array.isArray(d.cluster) && d.cluster.length === 2 && num(d.cluster[0]) && num(d.cluster[1]) ? { low: num(d.cluster[0]), high: num(d.cluster[1]) } : null;
}
const cap = s => String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1);
const plural = (n, one, many) => (n === 1 ? one : many);

// The engine's question, with what each choice sends next (the Market Check page's own rules: a generation option
// carries its own words, a model or body option is added to the car's words, a gearbox / competition / documented
// history option is a refine on the same words).
function questionOf(d, text, asked) {
  if (!d) return null;
  const tier = String(d.tier || ""), next = Number(d.askIndex) || (asked + 1);
  const rc = d.resolvedCar || {};
  const base = d.baseLabel || [rc.year, rc.make, rc.model, rc.trim].filter(Boolean).join(" ") || text;
  const skip = { label: "Just show what sold", send: { q: text, asked: 2 } };
  if (tier === "generation_choice" && Array.isArray(d.generationOptions)) {
    return { dimension: "generation", text: d.prompt || "Which generation is it?", options: d.generationOptions.map(o => ({ label: o.label, send: { q: o.query, asked: next } })), skip };
  }
  if (tier === "model_choice" || tier === "body_choice") {
    const opts = d.modelOptions || d.bodyOptions || [];
    return { dimension: tier === "model_choice" ? "model" : "body", text: d.prompt || "Which one is it?", options: opts.map(o => ({ label: String(o), send: { q: base + " " + o, asked: next } })), skip };
  }
  const iq = d.identityQuestion;
  if (iq && iq.blocking && Array.isArray(iq.options)) {
    const key = { gearbox: "tx", competition: "variant", documented_history: "docHistory" }[iq.dimension];
    const val = label => iq.dimension === "gearbox" ? (/manual/i.test(label) ? "manual" : "auto")
      : iq.dimension === "competition" ? (/competition/i.test(label) ? "competition" : "standard")
      : iq.dimension === "documented_history" ? (/^has/i.test(label) ? "has" : "nohas") : null;
    if (key) return { dimension: iq.dimension, text: iq.questionText || null, options: iq.options.map(o => ({ label: o.label, count: o.count ?? null, send: { q: text, refine: { [key]: val(o.label) }, asked: next } })), skip: { label: iq.skipLabel || skip.label, send: skip.send } };
  }
  return null;
}
// THE NARROWING LINES (Sam, Oct 18 2026: "2001 bmw", M3 showed no body question on the demo while Market Check showed
// "Which M3? Convertible (9) · Coupe (3)"). Market Check's answer page draws up to four lines from the engine's own
// fields (public/js/onebox.js heroTrimLineHtml, heroBodyLineHtml, heroGearboxLineHtml, variantOptionsLineHtml); this is
// the same four, same order, same filters, same wording, each option the same refine Market Check sends. Nothing is
// computed: every label and count is the engine's. `any` is the engine's own count for the unsplit answer.
const WORDNUM = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const digitOf = n => typeof n === "string" && WORDNUM[n.toLowerCase()] != null ? WORDNUM[n.toLowerCase()] : Number(n);
function nameplateOf(d) {
  const rc = (d && d.resolvedCar) || {}, cl = rc.canonicalLabel;
  if (cl && rc.year && rc.make) { const pre = rc.year + " " + rc.make + " "; if (String(cl).indexOf(pre) === 0) return String(cl).slice(pre.length).split(" ")[0] || ""; }
  return rc.model || "";
}
export function linesOf(d) {
  if (!d || !/^(result|thin)$/.test(String(d.tier || ""))) return [];
  const out = [], any = countOf(d), np = nameplateOf(d);
  const tq = d.trimQuestion;
  if (tq && Array.isArray(tq.options)) {
    const shown = tq.options.filter(o => o && !o.thin);
    if (shown.length >= 2) out.push({ key: "trim", lead: tq.model ? "Which " + tq.model + "?" : null, any, options: shown.map(o => ({ label: String(o.label), value: String(o.value), n: digitOf(o.n) })) });
  }
  if (Array.isArray(d.bodyOptions)) {
    const shown = d.bodyOptions.filter(o => o && Number(digitOf(o.n)) > 0);
    if (shown.length >= 2) out.push({ key: "body", lead: np ? "Which " + np + "?" : null, any, options: shown.map(o => ({ label: String(o.label || o.value), value: String(o.value || o.label), n: digitOf(o.n) })) });
  }
  const gb = (Array.isArray(d.inlineSplits) ? d.inlineSplits : []).find(x => x && x.key === "gearbox");
  if (gb && Array.isArray(gb.sides)) {
    const shown = gb.sides.filter(x => x && !x.thin);
    if (shown.length >= 2) out.push({ key: "tx", lead: null, any, options: shown.map(x => { const label = String(x.label || "").replace(/s$/, ""); return { label, value: /manual/i.test(label) ? "manual" : "auto", n: digitOf(x.n) }; }) });
  }
  for (const e of Array.isArray(d.variantOptionsLine) ? d.variantOptionsLine : []) {
    if (!e || e.key === "restoration") continue;
    const real = (Array.isArray(e.options) ? e.options : []).filter(o => Number.isFinite(digitOf(o.n)) && digitOf(o.n) > 0);
    if (real.length < 2) continue;
    out.push({ key: "variant", lead: np ? "Which " + np + "?" : null, any: real.reduce((t, o) => t + digitOf(o.n), 0), options: real.map(o => ({ label: String(o.label), value: String(o.value), n: digitOf(o.n) })) });
    break;
  }
  return out;
}
// Under eight sales: words only, never a range.
// The no-range line (Sam, Oct 19 2026, e63): the engine's own thinLine, else a refusal's or a no-record answer's own
// samLine. No wording of this file's own; "too spread out" only when the engine's refusal says so.
function thinTextOf(d, count) {
  if (!d || rangeOf(d)) return null;
  const tier = String(d.tier || "");
  if (typeof d.thinLine === "string" && d.thinLine) return d.thinLine;
  if (/^(refusal|not_tracked|body_unavailable)$/.test(tier) && typeof d.samLine === "string" && d.samLine) return d.samLine;
  return null;
}
// Trend: only the quarters with eight or more sales.
function trendOf(d) {
  const q = d && d.trend && Array.isArray(d.trend.quarters) ? d.trend.quarters : [];
  const rows = q.filter(r => Number(r.count) >= RANGE_MIN && num(r.low) && num(r.high)).map(r => ({ period: r.period, low: num(r.low), high: num(r.high), count: Number(r.count) }));
  return rows.length ? rows : null;
}
// The set-aside sales themselves (Sam, Oct 18 2026): the engine's own setAsideRows, each with its own reason words
// (setAsideReasonFor: modified, project, replica, odd sale); never mixed into the sales the answer is based on.
export function asideRowsOf(d) {
  const rows = d && Array.isArray(d.setAsideRows) ? d.setAsideRows : (d && d.thin && Array.isArray(d.thin.setAsideRows) ? d.thin.setAsideRows : []);
  return rows.filter(r => r && r.setAside !== false).map(r => ({ photo: rowId(r), name: rowTitle(r), price: num(r.price) || num(r.allIn) || num(r.hammer), date: day(r.date), miles: num(r.mi) || num(r.mileage), reason: typeof r.reason === "string" && !VENUE_RE.test(r.reason) ? r.reason : null }))
    .filter(r => r.price && r.reason);
}
function setAsideOf(d) {
  const s = d && d.counts && d.counts.setAside;
  if (!s || !Number(s.total)) return null;
  const reasons = s.reasons && typeof s.reasons === "object" ? Object.fromEntries(Object.entries(s.reasons).filter(([, v]) => Number(v) > 0).map(([k, v]) => [k, Number(v)])) : null;
  return { total: Number(s.total), reasons: reasons && Object.keys(reasons).length ? reasons : null };
}
function identityOf(d, idFromVin) {
  const rc = (d && d.resolvedCar) || (idFromVin && idFromVin.vehicle) || null;
  if (!rc) return null;
  const variant = (rc.applied && rc.applied.variant) || rc.trim || null;
  return { year: num(rc.year) || null, make: rc.make || null, model: rc.model || null, generation: rc.genCode || null, body: rc.bodyStyle || null, variant };
}
// The VIN's own appearances: sold (price), or offered and not sold (high bid). Never the venue, link or title.
// The car's name from the engine's identity of a VIN (year, make, model, trim); null when it cannot name the car.
export function carNameOf(id) {
  if (!id || !id.make || !id.model) return null;
  const trim = id.trim && !String(id.model).toLowerCase().includes(String(id.trim).toLowerCase()) ? id.trim : null;
  return [id.year, id.make, id.model, trim].filter(Boolean).join(" ");
}
export function historyOf(apps, vin) {
  if (!Array.isArray(apps) || !apps.length) return null;
  // Each sale's own photo by "<VIN>-<n>" (n its place among the car's appearances), served by ?photo= (stage 4).
  const ph = (a, i) => a.image && vin ? normVin(vin) + "-" + i : null;
  const rows = apps.map((a, i) => a.kind === "sale"
    ? { result: "sold", date: day(a.date), price: num(a.priceUsd), miles: num(a.mileage), photo: ph(a, i) }
    : { result: "not_sold", date: day(a.date), highBid: num(a.bidUsd), miles: num(a.mileage), photo: ph(a, i) });
  return rows.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
}

// Market Check's answer, reshaped. Pure: no network; scripts/partnerEngineMatch.mjs runs it on fixed answers too.
// THE SHARED CARD WITH ITS SALE ROWS (Lane F's order, Oct 20 2026, the Amazon demo's tab c "sales newest first"): Market
// Check's own card call (sellsForCardHtml(d, {}) through demoCard), so the rows come in the engine's own order (newest first,
// the order Market Check draws), with two venue-safe swaps only: each row's photo goes through this endpoint's gated
// ?photo=<archive id> path (never the source image address, which names the venue), and a row title that names a venue
// reads as its own year, make and model (rowTitle, the rule the sales list already uses). Additive: the existing card,
// sales and every other field are unchanged, and the eBay page ignores this field.
export function cardWithRowsOf(d) {
  if (!d || !Array.isArray(d.cards)) return demoCard(sellsForCardHtml(d || {}, {}), d || {}) || null;
  const cards = d.cards.map(c => ({ ...c, title: rowTitle(c) }));
  const photo = c => { const id = c && c.image ? rowId(c) : null; return id ? "/api/partnerAnswer?photo=" + encodeURIComponent(id) + "&w=320" : null; };   // the smallest width the photo path serves (PHOTO_WIDTHS), for a 72 px row (Lane E's stage 5 find); a sale with no photo keeps the card's "No photo" slot, as on Market Check
  return demoCard(sellsForCardHtml({ ...d, cards }, { rowPhoto: photo }), d) || null;
}
export function partnerShape(d, text, asked, extra = {}) {
  const engineVersion = d && d.engineVersion || null;
  if (!d || d.status === "needs_clarification" || d.status === "needs_confirmation") {
    const cl = d && d.clarification;
    return { ok: true, query: text, engineVersion, answerType: "identity_question", identity: null,
      question: { dimension: "car", text: (cl && cl.question) || "Which car is it? Try the year, make and model together.", options: (cl && Array.isArray(cl.options) ? cl.options : []).map(o => { const l = typeof o === "string" ? o : (o.label || o.value || ""); return { label: l, send: { q: l, asked: 0 } }; }).filter(o => o.label) },
      range: null, count: null, window: null, sales: [], setAside: null, thin: null, trend: null, narrow: null, history: extra.history || null };
  }
  if (d.status !== "one_box") return { ok: false, query: text, error: "unavailable", history: extra.history || null };
  if (/^(unavailable|rate_limited|business_limit|non_road)$/.test(String(d.tier || ""))) {
    // The engine's still-reading answer (Lane B, Oct 18 2026: tier "unavailable", stillReading, samLine, retry,
    // retryAfterMs) passes through as it is: the page draws the engine's line and asks again after the engine's wait.
    const still = d.tier === "unavailable" && d.stillReading === true;
    return { ok: false, query: text, error: d.tier, history: extra.history || null,
      ...(still ? { stillReading: true, line: typeof d.samLine === "string" ? d.samLine : null, retryAfterMs: d.retry === true && Number.isFinite(d.retryAfterMs) && d.retryAfterMs > 0 ? d.retryAfterMs : null } : {}) };
  }
  const question = questionOf(d, text, asked);
  if (question) return { ok: true, query: text, engineVersion, answerType: "identity_question", identity: identityOf(d, extra.id), question, range: null, count: null, window: null, sales: [], setAside: null, thin: null, trend: null, narrow: null, history: extra.history || null };
  const range = rangeOf(d), count = countOf(d);
  return {
    ok: true, query: text, engineVersion, readAt: d.readAt || null,
    answerType: range ? "range" : (count ? "not_enough_data" : "zero_result"),
    identity: identityOf(d, extra.id), question: null,
    range, count, window: d.windowLabel || null,
    sales: salesOf(d), asideRows: asideRowsOf(d), asideLine: asideSentence(d), setAside: setAsideOf(d),
    thin: range ? null : thinTextOf(d, count),
    trend: range ? trendOf(d) : null,
    card: demoCard(sellsForCardHtml(d, PARTNER_CARD_OPTS), d) || null,
    cardWithRows: cardWithRowsOf(d),   // additive (Oct 20 2026, the Amazon demo's tab c): Market Check's own card WITH its sale rows
    quarter: latestQuarterRowHtml({ ...d, trendQuarters: mapEngineAnswer(d).trendQuarters }) || null,
    lines: linesOf(d),
    carPhoto: carPhotoOf(d, (identityOf(d, extra.id) || {}).year || (/^(\d{4})\b/.exec(String(text || "")) || [])[1] || null),
    history: extra.history || null
  };
}

// Belt and braces: the reshaped answer carries only fields this file wrote, but a venue name or listing link must
// never leave even if an upstream field changes shape. Any string that names a venue or a URL fails the answer.
const VENUE_RE = /bring ?a ?trailer|\bbat\b|cars ?(&|and) ?bids|pcar ?market|hagerty|gooding|rm sotheby|sotheby|bonhams|mecum|barrett|broad ?arrow|hemmings|collecting ?cars|car ?& ?classic|pistonheads|all ?collector|mb ?market|autohunter|\bthemarket\b|https?:\/\//i;
export function venueLeak(obj) {
  const hits = [];
  const walk = (v, path) => {
    if (v == null) return;
    if (path === ".query") return;
    if (typeof v === "string") { if (VENUE_RE.test(v)) hits.push(path + ": " + v.slice(0, 60)); return; }
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, path + "[" + i + "]"));
    if (typeof v === "object") for (const [k, x] of Object.entries(v)) { if (/^(url|href|link|id|listingId|listing_id|source|platform|house|venue|title)$/i.test(k)) hits.push(path + "." + k); walk(x, path + "." + k); }
  };
  walk(obj, "");
  return hits;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  if (!partnerAllowed(req)) return res.status(404).json({ error: "Not found" });
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const env = supabaseEnv();
  // A sale's photo (Sam, Oct 18 2026; demo only; lib/_salePhoto.js): GET ?photo=<archive id> and nothing else, behind the
  // same crew-or-partner gate as above, on this path so the demo cookie's paths never widen. The address is looked up
  // server side by one primary-key read and never returned; the image comes back with no venue header, name or address.
  // Its own ceiling (partner_photo), never Market Check's. Any failure is a plain 404 and the page shows its neutral tile.
  // The demo page's safety net (Sam, Oct 18 2026): after its own abort the page asks GET ?last=<demo car> for the stored
  // last good answer only (no engine read, nothing computed): the answer if under a day old, else the plain still-reading
  // state with no wait of its own, so the page offers Try again. Demo cars only; any other words get the same state.
  if (req.method === "GET" && req.query && req.query.last != null) {
    const car = String(req.query.last).replace(/\s+/g, " ").trim().slice(0, 120), lk = demoKey(car);
    const last = lk && env ? await readLast(env, lk) : null;
    if (lastGoodUsable(last)) return res.status(200).json({ ...last.out, lastGood: true });
    return res.status(200).json({ ok: false, query: car, error: "unavailable", stillReading: true, line: null, retryAfterMs: null });
  }
  if (req.method === "GET" && req.query && req.query.photo != null) {
    const vk = vinPhotoKey(req.query.photo), pid = vk ? null : photoId(req.query.photo);
    const no = () => { res.setHeader("Content-Type", "text/plain; charset=utf-8"); res.setHeader("Cache-Control", "private, no-store"); return res.status(404).send("Not found"); };
    if ((!pid && !vk) || !env) return no();
    const lim = await checkCeiling(env, req, "partner_photo", { tool: "partner" }).catch(() => ({ ok: true }));
    if (!lim.ok) return no();
    // An earlier sale of this exact car (stage 4): the car's own appearance, looked up again here; never the address out.
    const url = vk ? await vinAppearances(env, vk.vin).then(h => { const a = h && h.appearances && h.appearances[vk.n]; return a && a.image ? safeImageUrl(a.image) : null; }).catch(() => null)
      : await photoUrlFor(env, pid).catch(() => null);
    // The same photo, smaller, when the page asks a width (?w=320|640|960) and the host resizes; else, or on any failure,
    // the original (lib/_salePhoto.js sizedPhotoUrl).
    const small = url ? sizedPhotoUrl(url, Number(req.query.w)) : null;
    const img = small ? (await fetchPhoto(small)) || (await fetchPhoto(url)) : url ? await fetchPhoto(url) : null;
    if (!img) return no();
    res.setHeader("Content-Type", img.type);
    res.setHeader("Content-Length", String(img.body.length));
    res.setHeader("Cache-Control", "private, max-age=2592000, immutable");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.status(200).send(img.body);
  }
  const b = req.method === "POST" && req.body && typeof req.body === "object" ? req.body : (req.query || {});
  let refine = null;
  try { refine = cleanRefine(typeof b.refine === "string" ? JSON.parse(b.refine) : b.refine); } catch { refine = null; }
  const asked = Math.max(0, Math.min(9, Number(b.asked) || 0));
  const vinIn = normVin(b.vin || (VIN_RE.test(normVin(b.q)) ? b.q : ""));
  let text = String(b.q || [b.year, b.make, b.model].filter(Boolean).join(" ") || "").replace(/\s+/g, " ").trim().slice(0, 120);
  // ANY CAR (Sam, Oct 18 2026): every read on the demo, its six cars and any other car, is bounded by the demo's own
  // per-device ceiling (lib/_ceilings.js partner_demo) and reads Market Check's engine with no visitor address or
  // browser, so Market Check's own visitor ceilings are neither used nor changed by the demo.
  {
    const lim = await checkCeiling(env, req, "partner_demo", { tool: "partner" }).catch(() => ({ ok: true }));
    if (!lim.ok) return res.status(429).json({ ok: false, query: text, error: "rate_limited" });
  }
  let history = null, id = null, vinDecode = null;
  // A VIN THAT CANNOT BE READ (Sam's Amazon demo, revision 2, item 8a; Lane E, Oct 20 2026): a typed run of 11 to 17
  // letters and digits with three or more digits and no space is a VIN attempt; one that is not a valid 17-character VIN
  // gets Sam's line, never a silent empty page and never a car search on the raw characters.
  const typed = String(b.vin || b.q || "").replace(/\s+/g, "").toUpperCase();
  if (!(vinIn && VIN_RE.test(vinIn)) && /^[A-Z0-9]{11,17}$/.test(typed) && (typed.match(/\d/g) || []).length >= 3 && !/^(19|20)\d\d[A-Z]/.test(typed)) {
    return res.status(200).json({ ok: true, query: typed, engineVersion: null, answerType: "vin_unreadable", line: VIN_UNREADABLE_LINE, identity: null, range: null, count: null, window: null, sales: [], history: null });
  }
  if (vinIn && VIN_RE.test(vinIn)) {
    const h = env ? await vinAppearances(env, vinIn).catch(() => null) : null;
    history = historyOf(h && h.appearances, vinIn);
    id = h && h.appearances && h.appearances.length ? await carIdentity(h.appearances, vinIn).catch(() => null) : null;
    // THE VIN'S OWN DECODE (item 7): the free vPIC decode names a car the archive has never seen (a 2015 S550 coupe with no
    // auction appearance) and gives its key features, only the fields the decode holds. The archive's identity, when it
    // exists, still names the car; the decode then only adds the features.
    vinDecode = await decodeVinFacts(vinIn).catch(() => null);
    if (!id && vinDecode && vinDecode.readable && vinDecode.make && vinDecode.model) id = { year: vinDecode.year, make: vinDecode.make, model: vinDecode.model, family: vinDecode.model, trim: vinDecode.trim || null, fromDecode: true };
    if (vinDecode && vinDecode.readable === false && !id) return res.status(200).json({ ok: true, query: vinIn, engineVersion: null, answerType: "vin_unreadable", line: VIN_UNREADABLE_LINE, identity: null, range: null, count: null, window: null, sales: [], history });
    if (!text || VIN_RE.test(normVin(text))) text = id ? [id.year, id.make, id.family || id.model].filter(Boolean).join(" ") : "";
    if (!text) {
      const out = { ok: true, query: vinIn, engineVersion: null, answerType: "identity_question", identity: null,
        question: { dimension: "car", text: "There are no recorded sales or listings for this VIN yet. Type the year, make and model to see what cars like it sold for.", options: [] },
        range: null, count: null, window: null, sales: [], setAside: null, thin: null, trend: null, narrow: null, history };
      return res.status(200).json(out);
    }
  }
  if (!text) return res.status(400).json({ ok: false, error: "Type a car, or a VIN." });
  const updatedP = lastUpdatedDate(env).catch(() => null);   // the shared last-ingest date; null shows no date
  // The read goes through Market Check's own handler and its own bound; a read that throws answers from the last good
  // answer (a demo car) or the plain still-reading state.
  // (c): a demo car whose stored answer is the engine's question (current version, under a day old) is answered from that
  // store, never computed on the page (the engine never stores a question in the Market Check store).
  // FIX 2 (Sam's demo speed order, Oct 19 2026; Lane C): a demo car's stored full answer is served straight away, before
  // Market Check's handler, ONLY when it carries the current ENGINE_VERSION and is under a day old (lastGoodUsable) AND
  // was read after the current sales epoch (the last ingest that added sales, lib/_epoch.js), so it is never older than
  // what Market Check itself would serve. Anything else reads through the handler as before. A VIN view gets its own VIN
  // history and name, as the existing fallback does.
  if (!refine && !(Number(asked) > 0)) {
    const qk = demoKey(text), qlast = qk && env ? await readLast(env, qk) : null;
    if (!vinIn && lastGoodUsable(qlast) && questionResult(qlast.out)) return res.status(200).json({ ...qlast.out, history, storedQuestion: true });
    if (lastGoodUsable(qlast) && fullResult(qlast.out)) {
      if (storedDemoServable(qlast, await currentEpoch(env).catch(() => null))) {
        const out = vinIn ? { ...qlast.out, history, vin: vinIn, carName: carNameOf(id), storedDemo: true } : { ...qlast.out, storedDemo: true };
        out.updated = await updatedP;
        if (!venueLeak(out).length) return res.status(200).json(out);
      }
    }
  }
  let r;
  try { r = await marketCheckAnswer(req, text, refine, asked, true); } catch (e) {
    console.error("partnerAnswer:", (e && e.message) || e);
    const lk0 = !refine ? demoKey(text) : null, last = lk0 && env ? await readLast(env, lk0) : null;
    if (lastGoodUsable(last)) return res.status(200).json(vinIn ? { ...last.out, history, vin: vinIn, lastGood: true } : { ...last.out, lastGood: true });
    // No answer and no usable stored one: the plain still-reading state, with no wait of its own (the page offers Try again).
    return res.status(200).json({ ok: false, query: text, error: "unavailable", history, stillReading: true, line: null, retryAfterMs: null });
  }
  let out = partnerShape(r.d, text, asked, { history, id });
  // The last good answer is stored from a plain read of the car and serves the VIN views too (Oct 18 2026: the listing
  // views send the VIN, had no fallback, and showed the limit line); a VIN view keeps its own VIN history.
  const lk = !refine ? demoKey(text) : null;
  if (lk && env) {
    if (!vinIn && (fullResult(out) || (questionResult(out) && !(Number(asked) > 0)))) writeLast(env, lk, out).catch(() => {});   // (c): a question answer too
    else if (!out.ok) { const last = await readLast(env, lk); if (lastGoodUsable(last)) out = vinIn ? { ...last.out, history, lastGood: true } : { ...last.out, lastGood: true }; }
  }
  if (vinIn) {
    out.vin = vinIn;
    // The car's name for a VIN (Sam, Oct 18 2026): the engine's own identity of this VIN (carIdentity: year, make, model,
    // trim), null when it cannot name the car; the page then shows the VIN and nothing else.
    out.carName = carNameOf(id);
    // The VIN's decoded name and features for the page's title and Key features (item 7): only what the decode holds.
    out.vinDecode = vinDecode && vinDecode.readable ? { year: vinDecode.year || null, make: vinDecode.make, model: vinDecode.model || null, trim: vinDecode.trim || null, body: vinDecode.bodyStyle || null, features: vinDecode.features || {} } : null;
    // The car's identity for the pilot scope: the engine's own, else the archive's or the decode's (so a decoded car
    // outside the pilot reads "outside the pilot", never an empty page).
    if (!out.identity && id) out.identity = { year: id.year || null, make: id.make, model: id.model, variant: id.trim || null };
  }
  out.updated = await updatedP;
  const leaks = venueLeak(out);
  if (leaks.length) { console.error("partnerAnswer venue leak blocked:", leaks.slice(0, 5).join(" | ")); return res.status(500).json({ ok: false, error: "blocked" }); }
  return res.status(200).json(out);
}
