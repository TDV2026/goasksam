// PARTNER ANSWER (Lane C, Oct 15 2026; closed demo, crew-only): "What these sell for, powered by GoAskSam" for a
// partner's own listing layout (/partner-demo). ONE ENGINE: every number here is Market Check's own answer for the
// same words. This file never reads the archive for a market itself: it calls Market Check's request handler
// (api/sellerDecision.js, the oneBox branch, the same resolver, stored answer, engine call and output gate the
// Market Check page gets) in-process and only reshapes that answer. If this and Market Check ever disagree for the
// same car, this is wrong (scripts/partnerEngineMatch.mjs checks it).
//
// Input (POST JSON, or GET query): q, or year/make/model, or vin; plus the refines Market Check takes (refine:
// body, trim, variant, tx, miMin, miMax, miTarget) and asked (the question count). A VIN is named from that car's
// own records (the history page's rule, api/_historyData.js carIdentity) and those words go to Market Check.
// Output: identity (year, make, model, body, variant), the engine's identity question with what each choice sends
// next, a range only when the engine gives one, count, window, sales in price order (price and date only),
// set-aside reasons, a thin line under eight sales (words only, never a range), a trend only for quarters with
// eight or more sales, the VIN's own history (sold, or offered and not sold with the high bid), and updated (the
// shared last-ingest date, lib/asOf.js lastUpdatedDate, the one Buy and Sell show; null when unread, never made up).
// NEVER in any output: a venue name, a venue link, a listing id, a listing title.
// Gate: the signed crew cookie, or the PARTNER_KEY header (x-partner-key) when that env var is set; anything else
// is a plain 404. Rate limited (lib/_ceilings.js partner_answer). Archive only: zero OldCarsData requests.
import crypto from "node:crypto";
import { isCrewRequest } from "../lib/_crew.js";
import { checkCeiling } from "../lib/_ceilings.js";
import { supabaseEnv } from "../lib/_supabase.js";
import { vinAppearances, carIdentity, normVin } from "./_historyData.js";
import { lastUpdatedDate } from "../lib/asOf.js";

const RANGE_MIN = 8;   // the engine's own RANGE_THRESHOLD: under eight sales there is no range, only words
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

function samePartnerKey(sent) {
  const want = process.env.PARTNER_KEY;
  if (!want || !sent) return false;
  const a = Buffer.from(String(sent)), b = Buffer.from(String(want));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
export function partnerAllowed(req) {
  const h = (req && req.headers) || {};
  return isCrewRequest(req) || samePartnerKey(h["x-partner-key"]);
}

// Market Check's own request handler, called in-process with the same body the Market Check page sends.
export async function marketCheckAnswer(req, text, refine, asked) {
  const { default: mc } = await import("./sellerDecision.js");
  const body = { oneBox: true, car: { raw: text }, asked: Math.max(0, Math.min(9, Number(asked) || 0)) };
  if (refine) body.refine = refine;
  const sub = { method: "POST", url: "/api/sellerDecision", headers: { ...(req.headers || {}) }, query: {}, body };
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
  if (typeof r.body === "string" && /^[a-z -]{2,20}$/.test(r.body)) o.body = r.body;
  if (typeof r.trim === "string" && /^[a-z0-9-]{1,30}$/.test(r.trim)) o.trim = r.trim;
  if (typeof r.variant === "string" && /^[a-z0-9_-]{1,30}$/.test(r.variant)) o.variant = r.variant;
  if (r.tx === "manual" || r.tx === "auto") o.tx = r.tx;
  if (r.docHistory === "has" || r.docHistory === "nohas") o.docHistory = r.docHistory;
  for (const k of ["miMin", "miMax", "miTarget"]) if (Number.isFinite(Number(r[k])) && r[k] !== null && r[k] !== "") o[k] = Number(r[k]);
  return Object.keys(o).length ? o : null;
}

const num = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n) : null; };
const day = v => (v ? String(v).slice(0, 10) : null);

// The sales Market Check lists for this answer, reduced to price and date, lowest first: the range tier's own
// d.cards, the thin tier's own receipts (public/js/onebox.js moreComparableSalesHtml / thinCardsFrom read the same).
export function salesOf(d) {
  if (!d) return [];
  let rows;
  if (d.tier === "thin" && d.thin && Array.isArray(d.thin.receipts)) rows = d.thin.receipts.map(r => ({ price: num(r.allIn) || num(r.hammer), date: day(r.date) }));
  else rows = (Array.isArray(d.cards) ? d.cards : []).map(c => ({ price: num(c.price), date: day(c.date) }));
  return rows.filter(r => r.price).sort((a, b) => a.price - b.price || String(a.date || "").localeCompare(String(b.date || "")));
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
// Answered, but the engine offers to narrow by body (d.bodyOptions on a result): the same body refine Market Check's
// chips send, with each option's own count.
function narrowOf(d, text) {
  const opts = d && Array.isArray(d.bodyOptions) ? d.bodyOptions : null;
  if (!opts || opts.length < 2 || !/^(result|thin)$/.test(String(d.tier || ""))) return null;
  return { dimension: "body", options: opts.filter(o => o && (o.value || o.label)).map(o => ({ label: o.label || String(o.value), count: Number.isFinite(o.n) ? o.n : null, send: { q: text, refine: { body: String(o.value || o.label).toLowerCase() } } })) };
}
// Under eight sales: words only, never a range.
function thinTextOf(d, count) {
  if (!d || rangeOf(d)) return null;
  const tier = String(d.tier || "");
  if (!/^(thin|refusal|not_tracked|body_unavailable)$/.test(tier) && count == null) return null;
  const n = Number(count) || 0, w = d.windowLabel ? " " + d.windowLabel : "";
  if (!n) return "No recorded sales of cars like this" + w + " yet, so there is no range to show.";
  if (n < RANGE_MIN) return cap(n + " " + plural(n, "recorded sale", "recorded sales") + " of cars like this" + w + ". Too few to show a range.");
  return "The recorded sales of cars like this" + w + " are too spread out to show a range.";
}
// Trend: only the quarters with eight or more sales.
function trendOf(d) {
  const q = d && d.trend && Array.isArray(d.trend.quarters) ? d.trend.quarters : [];
  const rows = q.filter(r => Number(r.count) >= RANGE_MIN && num(r.low) && num(r.high)).map(r => ({ period: r.period, low: num(r.low), high: num(r.high), count: Number(r.count) }));
  return rows.length ? rows : null;
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
export function historyOf(apps) {
  if (!Array.isArray(apps) || !apps.length) return null;
  const rows = apps.map(a => a.kind === "sale"
    ? { result: "sold", date: day(a.date), price: num(a.priceUsd), miles: num(a.mileage) }
    : { result: "not_sold", date: day(a.date), highBid: num(a.bidUsd), miles: num(a.mileage) });
  return rows.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
}

// Market Check's answer, reshaped. Pure: no network; scripts/partnerEngineMatch.mjs runs it on fixed answers too.
export function partnerShape(d, text, asked, extra = {}) {
  const engineVersion = d && d.engineVersion || null;
  if (!d || d.status === "needs_clarification" || d.status === "needs_confirmation") {
    const cl = d && d.clarification;
    return { ok: true, query: text, engineVersion, answerType: "identity_question", identity: null,
      question: { dimension: "car", text: (cl && cl.question) || "Which car is it? Try the year, make and model together.", options: (cl && Array.isArray(cl.options) ? cl.options : []).map(o => { const l = typeof o === "string" ? o : (o.label || o.value || ""); return { label: l, send: { q: l, asked: 0 } }; }).filter(o => o.label) },
      range: null, count: null, window: null, sales: [], setAside: null, thin: null, trend: null, narrow: null, history: extra.history || null };
  }
  if (d.status !== "one_box") return { ok: false, query: text, error: "unavailable", history: extra.history || null };
  if (/^(unavailable|rate_limited|business_limit|non_road)$/.test(String(d.tier || ""))) return { ok: false, query: text, error: d.tier, history: extra.history || null };
  const question = questionOf(d, text, asked);
  if (question) return { ok: true, query: text, engineVersion, answerType: "identity_question", identity: identityOf(d, extra.id), question, range: null, count: null, window: null, sales: [], setAside: null, thin: null, trend: null, narrow: null, history: extra.history || null };
  const range = rangeOf(d), count = countOf(d);
  return {
    ok: true, query: text, engineVersion,
    answerType: range ? "range" : (count ? "not_enough_data" : "zero_result"),
    identity: identityOf(d, extra.id), question: null,
    range, count, window: d.windowLabel || null,
    sales: salesOf(d), setAside: setAsideOf(d),
    thin: range ? null : thinTextOf(d, count),
    trend: range ? trendOf(d) : null,
    narrow: narrowOf(d, text),
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
  const lim = await checkCeiling(env, req, "partner_answer", { tool: "partner" }).catch(() => ({ ok: true }));
  if (!lim.ok) return res.status(429).json({ ok: false, error: "rate_limited" });
  const b = req.method === "POST" && req.body && typeof req.body === "object" ? req.body : (req.query || {});
  let refine = null;
  try { refine = cleanRefine(typeof b.refine === "string" ? JSON.parse(b.refine) : b.refine); } catch { refine = null; }
  const asked = Math.max(0, Math.min(9, Number(b.asked) || 0));
  const vinIn = normVin(b.vin || (VIN_RE.test(normVin(b.q)) ? b.q : ""));
  let text = String(b.q || [b.year, b.make, b.model].filter(Boolean).join(" ") || "").replace(/\s+/g, " ").trim().slice(0, 120);
  let history = null, id = null;
  if (vinIn && VIN_RE.test(vinIn)) {
    const h = env ? await vinAppearances(env, vinIn).catch(() => null) : null;
    history = historyOf(h && h.appearances);
    id = h && h.appearances && h.appearances.length ? await carIdentity(h.appearances, vinIn).catch(() => null) : null;
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
  let r;
  try { r = await marketCheckAnswer(req, text, refine, asked); } catch (e) { console.error("partnerAnswer:", (e && e.message) || e); return res.status(200).json({ ok: false, query: text, error: "unavailable", history }); }
  const out = partnerShape(r.d, text, asked, { history, id });
  if (vinIn) out.vin = vinIn;
  out.updated = await updatedP;
  const leaks = venueLeak(out);
  if (leaks.length) { console.error("partnerAnswer venue leak blocked:", leaks.slice(0, 5).join(" | ")); return res.status(500).json({ ok: false, error: "blocked" }); }
  return res.status(200).json(out);
}
