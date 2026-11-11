// FEATURED HISTORY (Lane B, Nov 2026, Homepage feature, CREW ONLY, NOT LIVE until Sam says so in writing).
// ONE real car that is live at auction right now and that the history match found sold or listed before, with the earlier record's own photo as the evidence. The page computes nothing: it prints this object.
//   featuredHistory = { kind: "sold" | "listed", headline, current: { title, platform, url, photo, live: true, endsAt, mileage }, previous: { date, platform, mileage, price (sold only), photo, url },
//                       mileageDelta (only when both readings are reliable), take, selectedAt, checkedAt, findUrl }
// REUSES the Find card's history detection: api/_historyData.js vinAppearances (vin_index, else the archive), the wording of lib/live/priorListing.js (sold only when a record says sold; priorTake is the take). No second matcher.
// ELIGIBLE only when ALL hold (every rule has a mutant in scripts/featuredHistoryCheck.mjs):
//   live            the listing's status is live AND its end time is in the future, at selection and again at every serve
//   same car        the earlier record carries the SAME VIN as the live listing (17 characters), or a shorter chassis number that also agrees on make, model and year; year/model/colour alone never matches
//   photos          the live photo and the earlier record's own photo are real image links (no placeholder, no logo) and neither answers 404 or 410
//   evidence        the earlier record has an http(s) link that is not the live listing and does not answer 404 or 410
//   complete        earlier date, platform and mileage; a price for a sold record (a high bid or an asking price is never a price)
//   sold            only a record whose result is a completed sale; an unsold auction, a withdrawal or a high bid is "listed"
// CHOICE (Nov 10 2026): an auction ending within 7 days first, within 3 days best, and a car more than 14 days from its end never while any car within 14 days qualifies (lib/live/endingSoon.js); then confirmed sales before listed only, then the fewest earlier appearances (easy to explain), then the longest time left inside the band; never the biggest price gap. STABLE: the stored pick is kept while it passes every rule;
// it is replaced only when its auction ends or it fails a rule. A failed refresh stores NOTHING (null), and a stored pick older than MAX_CHECK_AGE_MS is never served.
// CREW GATE: the pick is stored under STORE_KEY ("crew_featured_history", a crew-only key) and read only by readFeaturedHistory(env, reqOrCookie), which returns null without the signed crew cookie. api/featuredHistory.js is the only
// route that serves it and answers 404 without the cookie. scripts/featuredHistoryCheck.mjs fails if any other route, page, feed or cache key can return it.
import { supabaseSelect, supabaseInsert, supabaseDelete } from "../_supabase.js";
import { vinAppearances, houseName } from "../../api/_historyData.js";
import { isCrewRequest } from "../_crew.js";
import { mayRead } from "./publicAccess.js";
import { priorTake } from "./priorListing.js";
import { reasonLine } from "../reasonWords.js";
import { capPool, soonBand, endMsOf } from "./endingSoon.js";

export const STORE_KEY = "crew_featured_history";
export const STORE_V = 2;   // v2 (Nov 2026): the title carries the Find card's trim, previous.historyUrl and mileageWords exist; a stored v1 pick is never served, it is replaced on the next refresh
export const MAX_CHECK_AGE_MS = 90 * 60 * 1000;      // a stored pick not re-checked within this is never served
export const MIN_LEFT_MS = [6 * 3600 * 1000, 30 * 60 * 1000];   // time left a new pick should have: 6 hours, else 30 minutes
export const SWEEP_EVERY_MS = 30 * 60 * 1000;        // the expensive search runs at most this often
export const MAX_EVALUATED = 60;
export const HEADLINE = { sold: "This car has sold before. Would you have known?", listed: "This car has been listed before. Would you have known?" };
const MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const num = v => { const n = Number(String(v == null ? "" : v).replace(/[^\d.]/g, "")); return Number.isFinite(n) && n > 0 ? n : null; };
const squash = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const vinNorm = v => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const isHttp = u => /^https?:\/\/[^\s]+\.[^\s]+/i.test(String(u || ""));
const norm = u => String(u || "").replace(/^https?:\/\/(www\.)?/i, "").replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
// a real image link: not a placeholder, logo, blank or icon
export const genuinePhoto = u => isHttp(u) && !/(^|[\/_.=-])(placeholder|no-?image|noimage|image-?not-?found|default|coming-?soon|logo|blank|spacer|sprite|icon|avatar)([\/_.=?&-]|$)/i.test(String(u)) && !/\.(svg|gif)(\?|$)/i.test(String(u));
export const monthYear = d => { const m = /^(\d{4})-(\d{2})/.exec(String(d || "")); return m && MON[Number(m[2]) - 1] ? MON[Number(m[2]) - 1] + " " + m[1] : null; };

// The earlier record that explains the car: the latest completed sale with everything the card needs, else the latest listing with everything it needs. Returns { rec, kind } or { reject }.
export function previousOf(apps, current, today) {
  const cur = norm(current.url);
  const earlier = (apps || []).filter(a => a && a.date && a.date < today && norm(a.url) !== cur).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  if (!earlier.length) return { reject: "no_earlier" };
  const sold = a => a.kind === "sale" && num(a.priceUsd) > 0;                 // a completed sale carries a sale price; an attempt carries bidUsd and is never a sale
  const complete = a => !!a.date && !!a.house && num(a.mileage) > 0 && (a.kind !== "sale" || num(a.priceUsd) > 0);
  const photoOk = a => genuinePhoto(a.image), linkOk = a => isHttp(a.url);
  const usable = earlier.filter(a => complete(a) && photoOk(a) && linkOk(a));
  const best = usable.find(sold) || usable.find(a => a.kind !== "sale");     // a "sale" without a price is not usable as a sale and is not called a listing either
  if (best) return { rec: best, kind: sold(best) ? "sold" : "listed", n: earlier.length };
  // name the first rule the newest earlier record failed
  const a = earlier[0];
  if (!genuinePhoto(a.image)) return { reject: "no_earlier_photo" };
  if (!isHttp(a.url)) return { reject: "no_evidence_link" };
  return { reject: "incomplete" };
}
// the same vehicle: the VIN, never year, model and colour alone
export function sameVehicle(live, rec) {
  const a = vinNorm(live.vin_norm || live.vin), b = vinNorm(rec.vinNorm || rec.vin_norm || rec.vin);   // the earlier record must NAME its VIN: a record that names none is not the same car
  if (!a || a.length < 6 || a !== b) return false;
  if (rec.year && live.year && Number(rec.year) !== Number(live.year)) return false;
  if (rec.make && live.make && squash(rec.make) !== squash(live.make)) return false;
  if (a.length < 17) return !!(rec.model && live.model && squash(rec.model) === squash(live.model) && rec.year && live.year);   // a short chassis number must also agree on the model and the year
  return true;
}
export const liveNow = (live, nowMs) => !!live && String(live.status || "") === "live" && Date.parse(live.end_time) > nowMs;

// THE MILEAGE IN WORDS (Nov 2026, gap 2): the plain count behind mileageDelta, built only for a reading that went UP. A lower current reading is never worded "fewer miles": an odometer does not run backwards, so a drop is a unit or typing difference between two
// listings, an unreliable pair, and it gets no delta and no words at all (the Find card's take says "more miles" and never "fewer" for the same reason). No valuation word, no verdict: a count and the word miles.
export const groupDigits = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
export const mileageWordsOf = delta => (Number.isFinite(delta) && delta > 0 ? `${groupDigits(delta)} more miles` : null);
// the take and the words can never disagree: a take that names a mileage direction must name exactly the words, and neither may say "fewer"
export function takeAgrees(take, words) {
  const t = String(take || ""), tail = /now with ([\d,]+) more miles/.exec(t);
  if (/\bfewer miles\b/i.test(t) || /\bfewer\b/i.test(String(words || ""))) return false;
  if (tail) return words === `${tail[1]} more miles`;
  return !/\bmore miles\b/i.test(t);
}
// The Find card names a car with nameOf (api/buySearch.js: year, make, model, trim, body from the resolved spec). That name is used when it is the same car as the listing (its make and model words are in it); anything else falls back to the listing's own
// year, make and model, and NEVER an invented trim.
export function cardTitle(name, live) {
  const sq = x => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const n = sq(name), fallback = [live.year, live.make, live.model].filter(Boolean).join(" ").trim() || String(live.listing_title || "").trim();
  if (!name || !String(name).trim() || !n) return fallback;
  const makeOk = !live.make || n.includes(sq(live.make)), modelOk = !live.model || n.includes(sq(live.model));
  return makeOk && modelOk ? String(name).trim() : fallback;
}
// Find opens no card or history from an address (loadFromAddress reads q and the filters only), so findUrl is a search address for the card's own name, trim included. The history page address is what the chip's "See full history" uses (api/buySearch.js history_url).
export const findUrlFor = title => "/buy?q=" + encodeURIComponent(title);
export const historyUrlOf = vin => (vinNorm(vin).length >= 6 ? "/vin/" + encodeURIComponent(vinNorm(vin)) : null);

// Pure: one live listing + the car's earlier appearances (vinAppearances) -> { ok: true, featured } | { ok: false, reason }.
export function evaluateCandidate(live, appearances, { nowMs = Date.now(), urlStatus = {} } = {}) {
  if (!liveNow(live, nowMs)) return { ok: false, reason: "not_live" };
  if (!genuinePhoto(live.photo_url)) return { ok: false, reason: "no_current_photo" };
  if (!vinNorm(live.vin_norm || live.vin)) return { ok: false, reason: "no_vin" };
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const apps = (appearances || []).filter(a => sameVehicle(live, a));
  if ((appearances || []).length && !apps.length) return { ok: false, reason: "vin_mismatch" };
  const p = previousOf(apps, live, today);
  if (p.reject) return { ok: false, reason: p.reject };
  const bad = u => urlStatus[u] === 404 || urlStatus[u] === 410;
  if (bad(p.rec.url)) return { ok: false, reason: "no_evidence_link" };
  if (bad(p.rec.image)) return { ok: false, reason: "no_earlier_photo" };
  const miles = num(live.mileage), unit = String(live.mileage_unit || "").toLowerCase(), prevMiles = num(p.rec.mileage);
  const reliable = miles && prevMiles && !/^k/.test(unit) && miles >= prevMiles && miles - prevMiles <= 250000;
  // the take speaks of the record the headline speaks of: a sold car, its sale; a listed car, its earlier listings (never "after selling" under a "listed" headline)
  const basis = p.kind === "sold" ? [{ date: p.rec.date, result: "sold", miles: p.rec.mileage }] : apps.filter(a => a.kind !== "sale" && a.date && a.date < today).map(a => ({ date: a.date, result: "not_sold", miles: a.mileage }));
  // the words and the take come from ONE reading: the take carries the mileage tail only for the record it speaks of (a sold car: its sale; a listed car: the latest earlier listing, which must be the record shown)
  const delta = reliable ? miles - prevMiles : null, words = mileageWordsOf(delta);
  const lastBasis = basis.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).pop(), speaksOfRec = !!lastBasis && lastBasis.date === p.rec.date && Number(lastBasis.miles) === Number(p.rec.mileage);
  const take = priorTake(basis, words && speaksOfRec ? miles : null, nowMs);
  if (!take) return { ok: false, reason: "no_take" };
  if (!takeAgrees(take, words)) return { ok: false, reason: "take_mileage_disagree" };
  const title = [live.year, live.make, live.model].filter(Boolean).join(" ").trim() || String(live.listing_title || "").trim();
  const featured = {
    kind: p.kind, headline: HEADLINE[p.kind],
    current: { title, platform: houseName(live.source), url: live.url, photo: live.photo_url, live: true, endsAt: new Date(live.end_time).toISOString(), mileage: miles },
    previous: { date: monthYear(p.rec.date), platform: p.rec.house, mileage: prevMiles, ...(p.kind === "sold" ? { price: Math.round(num(p.rec.priceUsd)) } : {}), photo: p.rec.image, url: p.rec.url, historyUrl: historyUrlOf(live.vin_norm || live.vin) },
    ...(reliable ? { mileageDelta: delta, ...(words ? { mileageWords: words } : {}) } : {}),
    take, selectedAt: null, checkedAt: null, findUrl: null
  };
  if (!featured.previous.date || !featured.current.title || !isHttp(featured.current.url)) return { ok: false, reason: "incomplete" };
  return { ok: true, featured: withFigureLines(featured, nowMs), earlierCount: p.n, listingId: live.id };
}
// the nearer band first (a car over 14 days out sorts last, so it is never chosen while one within 14 days is in the list; among such far cars the nearest end), then sold before listed, then the fewest earlier appearances, then the longest time left inside the band; the id keeps ties stable
export function chooseBest(list, nowMs = Date.now()) {
  const endOf = x => Date.parse(x.featured.current.endsAt);
  return list.slice().sort((a, b) => soonBand(endOf(a), nowMs) - soonBand(endOf(b), nowMs) || (a.featured.kind === "sold" ? 0 : 1) - (b.featured.kind === "sold" ? 0 : 1) || a.earlierCount - b.earlierCount || (soonBand(endOf(a), nowMs) === 3 ? endOf(a) - endOf(b) : endOf(b) - endOf(a)) || String(a.listingId).localeCompare(String(b.listingId)))[0] || null;
}
// THE FIGURE LINES (Lane E, Nov 6 2026): every sentence that carries a number is built here from the reason table (history.miles, history.sold_for, history.now_miles); the page prints the line as given and writes none.
// Applied where the pick is built AND where it is served, so a pick stored before the lines existed carries them too.
export function withFigureLines(f, nowMs = null) {
  if (!f || !f.current || !f.previous) return f;
  const has = x => x != null && x !== "" && Number.isFinite(Number(x));
  const out = { ...f, current: { ...f.current }, previous: { ...f.previous } };
  if (has(out.current.mileage)) out.current.mileageLine = reasonLine("history.miles", { miles: out.current.mileage }); else delete out.current.mileageLine;
  if (has(out.previous.mileage)) out.previous.mileageLine = reasonLine("history.miles", { miles: out.previous.mileage }); else delete out.previous.mileageLine;
  if (out.kind === "sold" && Number(out.previous.price) > 0) out.previous.priceLine = reasonLine("history.sold_for", { price: out.previous.price }); else delete out.previous.priceLine;
  if (has(out.current.mileage) && has(out.previous.mileage) && typeof out.mileageWords === "string" && out.mileageWords.trim()) out.nowLine = reasonLine("history.now_miles", { miles: out.current.mileage, words: out.mileageWords }); else delete out.nowLine;
  // the time left, from the engine's reason line, next to the venue (Nov 10 2026); only when a clock is given (the build and the serve), so a fixture without one carries none
  if (nowMs != null && Date.parse(out.current.endsAt) > nowMs) out.current.endsLine = reasonLine("pick.ends", { endsAt: Date.parse(out.current.endsAt), now: nowMs }); else delete out.current.endsLine;
  return out;
}
export const findUrlOf = f => findUrlFor(f.current.title);

import { choosePhoto, photoCandidates, headPhoto } from "./photoRule.js";
const defaultDeps = () => ({
  now: () => Date.now(),
  select: (env, q) => supabaseSelect(env, q),
  write: (env, row) => supabaseInsert("app_config", [row], env.supabaseUrl, env.supabaseKey, "resolution=merge-duplicates,return=minimal", "?on_conflict=key"),
  clear: env => supabaseDelete(env, `app_config?key=eq.${STORE_KEY}`),
  head: headPhoto,   // the photo rule: a 200 under 600 KB at selection (lib/live/photoRule.js)
  appearances: (env, vin) => vinAppearances(env, vin),
  // the Find card's own name for a live row (api/buySearch.js nameOf, from the resolved spec) and the trim that spec carries; null on any failure (the title then falls back to year, make and model, never an invented trim)
  cardName: async (env, row) => { const [{ nameOf }, { listingFacts, specOf }] = await Promise.all([import("../../api/buySearch.js"), import("./search.js")]); const x = { r: row, facts: listingFacts(row) }; const [name, sp] = await Promise.all([nameOf(env, x), specOf(env, row, x.facts)]); return { name, trim: (sp && sp.v && sp.v.trim) || null }; },
  urlStatus: async u => { try { const c = new AbortController(), t = setTimeout(() => c.abort(), 4000); const r = await fetch(u, { method: "HEAD", redirect: "follow", signal: c.signal }); clearTimeout(t); return r.status; } catch { return null; } }
});
// vinAppearances is read BY the VIN, so each appearance it returns is that VIN's; the match rule still wants the record to name it
const withVin = h => (h && Array.isArray(h.appearances) ? { ...h, appearances: h.appearances.map(a => ({ ...a, vinNorm: h.vinNorm })) } : h);
const LIVE_COLS = "id,source,url,listing_title,year,make,model,vin_norm,mileage,mileage_unit,end_time,photo_url,status";

async function readStore(env, d) {
  const rows = await d.select(env, `app_config?key=eq.${STORE_KEY}&select=value&limit=1`);
  if (!Array.isArray(rows)) return { failed: true };
  const v = rows[0] && rows[0].value;
  return { value: v && typeof v === "object" ? v : null };
}
// One keyed read: is this listing still live right now? true / false / null (could not be read).
async function stillLive(env, id, d) {
  const rows = await d.select(env, `live_listings?id=eq.${encodeURIComponent(id)}&select=${LIVE_COLS}&limit=1`);
  if (!Array.isArray(rows)) return null;
  return rows[0] ? liveNow(rows[0], d.now()) : false;
}

// SERVE. Crew, or public when PUBLIC_EXAMPLES=1 (it only reads, so the same for both): without either there is no field (null). A stored pick is served only when it is fresh (re-checked within MAX_CHECK_AGE_MS), its auction has not ended, and a keyed read
// confirms the listing is still live right now. Anything else is null; a visitor never runs the search.
export async function readFeaturedHistory(env, reqOrCookie, deps = {}) {
  const d = { ...defaultDeps(), ...deps };
  if (process.env.FEATURED_HISTORY === "0" || !mayRead(reqOrCookie)) return null;   // crew cookie, or PUBLIC_EXAMPLES=1 (lib/live/publicAccess.js): either way this only READS the stored pick and the keyed live check
  const s = await readStore(env, d);
  const st = s.value;
  if (!st || !st.featured || !st.listingId || st.v !== STORE_V) return null;   // a pick stored before v2 is never served
  const now = d.now(), f = st.featured;
  if (!(Date.parse(st.checkedAt) > now - MAX_CHECK_AGE_MS) || !(Date.parse(f.current && f.current.endsAt) > now)) return null;
  if ((await stillLive(env, st.listingId, d)) !== true) return null;
  return { ...withFigureLines(f, now), checkedAt: st.checkedAt, selectedAt: st.selectedAt, findUrl: f.findUrl || findUrlOf(f) };
}

// REFRESH (the cron, never a visitor). Keeps the stored pick while it still passes; otherwise searches for the next verified car. Returns the stored pick or null; a failure stores nothing.
const screened_n = (vinned, has) => vinned.filter(r => has.has(vinNorm(r.vin_norm))).length;
export async function refreshFeaturedHistory(env, deps = {}) {
  const d = { ...defaultDeps(), ...deps };
  const now = d.now(), iso = new Date(now).toISOString();
  const drop = async why => { await Promise.resolve(d.clear(env)).catch(() => {}); return { stored: null, why }; };
  let fallbackKeep = null;
  try {
    const s = await readStore(env, d);
    if (s.failed) return await drop("store_unreadable");
    const st = s.value;
    if (st && st.featured && st.listingId && st.v === STORE_V) {
      const alive = await stillLive(env, st.listingId, d);
      if (alive === null) return await drop("live_unreadable");
      if (alive && Date.parse(st.featured.current.endsAt) > now) {
        // re-run every rule on the kept car (its earlier record could have changed), then keep it
        const rows = await d.select(env, `live_listings?id=eq.${encodeURIComponent(st.listingId)}&select=${LIVE_COLS}&limit=1`);
        const apps = Array.isArray(rows) && rows[0] ? withVin(await d.appearances(env, rows[0].vin_norm)) : null;
        const again = Array.isArray(rows) && rows[0] && apps && apps.ok ? evaluateCandidate(rows[0], apps.appearances, { nowMs: now }) : { ok: false };
        // a kept pick stays while it ends within 7 days; one further out is only a fallback, replaced by any better car the search finds (Nov 10 2026)
        if (again.ok) { const keep = { ...st, checkedAt: iso }; if (soonBand(Date.parse(st.featured.current.endsAt), now) <= 1) { await d.write(env, { key: STORE_KEY, value: keep }); return { stored: keep, why: "kept" }; } fallbackKeep = keep; }
      }
    } else if (st && st.sweptAt && Date.parse(st.sweptAt) > now - SWEEP_EVERY_MS && st.none) return { stored: null, why: "swept_recently" };
    // SEARCH: live cars with a VIN and a photo, screened by whether they have an earlier record, then verified by the full history read
    const live = await d.select(env, `live_listings?status=eq.live&end_time=gt.${encodeURIComponent(iso)}&vin_norm=not.is.null&photo_url=not.is.null&select=${LIVE_COLS}&order=end_time.asc&limit=1000`);
    if (!Array.isArray(live)) return await drop("live_unreadable");
    const vinned = live.filter(r => vinNorm(r.vin_norm).length >= 6);
    const hasEarlier = new Set();
    for (let i = 0; i < vinned.length; i += 80) {
      const list = vinned.slice(i, i + 80).map(r => '"' + vinNorm(r.vin_norm) + '"').join(",");
      for (const t of ["vin_index", "sales_archive"]) {
        const got = await d.select(env, `${t}?vin_norm=in.(${encodeURIComponent(list)})&select=vin_norm&limit=1000`);
        if (!Array.isArray(got)) return await drop("screen_unreadable");
        for (const g of got) hasEarlier.add(vinNorm(g.vin_norm));
      }
    }
    const screened = vinned.filter(r => hasEarlier.has(vinNorm(r.vin_norm)));
    const funnel = { live: live.length, withVin: vinned.length, withEarlierRecord: screened_n(vinned, hasEarlier), screened: 0, eligible: 0 };   // counts only (the ops task crewkeys prints them); never a car
    let best = null, eligibleAll = [];
    for (const minLeft of MIN_LEFT_MS) {
      const ok = [];
      // the nearest auctions are read first, so the evaluation cap can never cut a car ending in days in favour of one ending in months
      const reachable = screened.filter(r => Date.parse(r.end_time) - now >= minLeft).sort((a, b) => Date.parse(a.end_time) - Date.parse(b.end_time));
      for (const r of capPool(reachable, now, r => Date.parse(r.end_time)).slice(0, MAX_EVALUATED)) {
        const apps = withVin(await d.appearances(env, r.vin_norm));
        if (!apps || !apps.ok) continue;
        const pre = evaluateCandidate(r, apps.appearances, { nowMs: now });
        if (!pre.ok) continue;
        const urlStatus = {};
        for (const u of [pre.featured.previous.url, pre.featured.previous.photo]) urlStatus[u] = await d.urlStatus(u);
        const e = evaluateCandidate(r, apps.appearances, { nowMs: now, urlStatus });
        if (e.ok) ok.push(e);
      }
      // THE PHOTO RULE (Nov 8 2026): the best car's first photo is HEADed (a 200 under 600 KB), else its next, else the car is skipped and the next best is judged
      let pool = ok.slice(), tries = 0;
      best = chooseBest(pool, now);
      while (best && tries++ < 8) {
        const row = screened.find(r => String(r.id) === String(best.listingId));
        const photo = await choosePhoto(photoCandidates(row), d.head);   // the car's own photos only: an earlier appearance's photo is the card's OTHER picture, never this car's current one
        if (photo) { best.featured.current = { ...best.featured.current, photo }; break; }
        pool = pool.filter(x => x !== best); best = chooseBest(pool, now);
      }
      if (best) { eligibleAll = pool; break; }
    }
    funnel.screened = screened.length; funnel.eligible = eligibleAll.length;
    if (fallbackKeep && (!best || soonBand(Date.parse(fallbackKeep.featured.current.endsAt), now) <= soonBand(Date.parse(best.featured.current.endsAt), now))) { await d.write(env, { key: STORE_KEY, value: fallbackKeep }); return { stored: fallbackKeep, why: "kept", funnel }; }
    if (!best) { const none = { none: true, sweptAt: iso }; await d.write(env, { key: STORE_KEY, value: none }); return { stored: null, why: "none_eligible", funnel }; }
    // THE TITLE IS THE FIND CARD'S NAME, trim included (gap 1): every eligible car is named the way its card names it, so the count of cars with a trim is real; the winner's title and findUrl use that name. No trim read = the year, make and model, never an invented one.
    const rowById = new Map(screened.map(r => [String(r.id), r])), named = new Map();
    for (const e of eligibleAll) { const row = rowById.get(String(e.listingId)); if (!row) continue; let cn = null; try { const full = await d.select(env, `live_listings?id=eq.${encodeURIComponent(row.id)}&select=*&limit=1`); cn = await d.cardName(env, Array.isArray(full) && full[0] ? full[0] : row); } catch { cn = null; } named.set(String(e.listingId), { name: cn && cn.name, trim: cn && cn.trim ? String(cn.trim) : null, row }); }
    const stats = { eligible: eligibleAll.length, withTrim: [...named.values()].filter(x => x.trim).length };
    const win = named.get(String(best.listingId));
    const featured = { ...best.featured, selectedAt: iso, checkedAt: iso };
    featured.current = { ...featured.current, title: cardTitle(win && win.name, win ? win.row : { year: null, make: null, model: null, listing_title: featured.current.title }) };
    featured.findUrl = findUrlFor(featured.current.title);
    const value = { v: STORE_V, listingId: best.listingId, featured, selectedAt: iso, checkedAt: iso };
    await d.write(env, { key: STORE_KEY, value });
    return { stored: value, why: "selected", stats, funnel };
  } catch (e) {
    if (process.env.FH_DEBUG) console.error(e);
    return await drop("error");
  }
}

// THE HOURLY REVALIDATION (Lane B, Nov 8 2026): the Homepage pick is confirmed live by one KEYED READ, at least every hour, so it never shows an ended auction as live and never goes stale between pulls. No search, no archive read, no OldCarsData: the stamp moves
// when the row is live now with time left and still eligible (a real current photo, a real link); when it ended, the listing is gone, it is no longer eligible or the row cannot be read, the pick is cleared and the field is null (the Homepage has no fallback card: the section is
// absent) until the next pull selects a new one (refreshFeaturedHistory, the search). The earlier record is not re-read here: the pick's rules were proved when it was selected and at each pull.
export async function revalidateFeaturedHistory(env, deps = {}) {
  const d = { ...defaultDeps(), ...deps };
  if (process.env.FEATURED_HISTORY === "0") return { stored: null, why: "off" };
  const now = d.now(), iso = new Date(now).toISOString();
  const drop = async why => { await Promise.resolve(d.clear(env)).catch(() => {}); return { stored: null, why }; };
  try {
    const s = await readStore(env, d);
    if (s.failed) return { stored: null, why: "store_unreadable" };
    const st = s.value;
    if (!st || !st.featured || !st.listingId || st.v !== STORE_V) return { stored: null, why: "nothing_to_confirm" };
    const rows = await d.select(env, `live_listings?id=eq.${encodeURIComponent(st.listingId)}&select=${LIVE_COLS}&limit=1`);
    if (!Array.isArray(rows)) return await drop("live_unreadable");
    const row = rows[0];
    if (!row || !liveNow(row, now) || !(Date.parse(st.featured.current && st.featured.current.endsAt) > now)) return await drop("ended");
    if (!genuinePhoto(row.photo_url) || !/^https:\/\/[^\s"'<>]+$/i.test(String(row.url || ""))) return await drop("not_eligible");
    const keep = { ...st, checkedAt: iso };
    await d.write(env, { key: STORE_KEY, value: keep });
    return { stored: keep, why: "confirmed" };
  } catch (e) { return await drop("error"); }
}
