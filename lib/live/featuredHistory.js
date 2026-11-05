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
// CHOICE: confirmed sales before listed only, then the fewest earlier appearances (easy to explain), then the longest time left; never the biggest price gap. STABLE: the stored pick is kept while it passes every rule;
// it is replaced only when its auction ends or it fails a rule. A failed refresh stores NOTHING (null), and a stored pick older than MAX_CHECK_AGE_MS is never served.
// CREW GATE: the pick is stored under STORE_KEY ("crew_featured_history", a crew-only key) and read only by readFeaturedHistory(env, reqOrCookie), which returns null without the signed crew cookie. api/featuredHistory.js is the only
// route that serves it and answers 404 without the cookie. scripts/featuredHistoryCheck.mjs fails if any other route, page, feed or cache key can return it.
import { supabaseSelect, supabaseInsert, supabaseDelete } from "../_supabase.js";
import { vinAppearances, houseName } from "../../api/_historyData.js";
import { isCrewRequest } from "../_crew.js";
import { priorTake } from "./priorListing.js";

export const STORE_KEY = "crew_featured_history";
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
  const take = priorTake(basis, reliable ? miles : null, nowMs);
  if (!take) return { ok: false, reason: "no_take" };
  const title = [live.year, live.make, live.model].filter(Boolean).join(" ").trim() || String(live.listing_title || "").trim();
  const featured = {
    kind: p.kind, headline: HEADLINE[p.kind],
    current: { title, platform: houseName(live.source), url: live.url, photo: live.photo_url, live: true, endsAt: new Date(live.end_time).toISOString(), mileage: miles },
    previous: { date: monthYear(p.rec.date), platform: p.rec.house, mileage: prevMiles, ...(p.kind === "sold" ? { price: Math.round(num(p.rec.priceUsd)) } : {}), photo: p.rec.image, url: p.rec.url },
    ...(reliable ? { mileageDelta: miles - prevMiles } : {}),
    take, selectedAt: null, checkedAt: null, findUrl: null
  };
  if (!featured.previous.date || !featured.current.title || !isHttp(featured.current.url)) return { ok: false, reason: "incomplete" };
  return { ok: true, featured, earlierCount: p.n, listingId: live.id };
}
// sold before listed, then the fewest earlier appearances, then the longest time left; the id keeps ties stable
export function chooseBest(list) {
  return list.slice().sort((a, b) => (a.featured.kind === "sold" ? 0 : 1) - (b.featured.kind === "sold" ? 0 : 1) || a.earlierCount - b.earlierCount || Date.parse(b.featured.current.endsAt) - Date.parse(a.featured.current.endsAt) || String(a.listingId).localeCompare(String(b.listingId)))[0] || null;
}
export const findUrlOf = f => "/buy?q=" + encodeURIComponent(f.current.title);

const defaultDeps = () => ({
  now: () => Date.now(),
  select: (env, q) => supabaseSelect(env, q),
  write: (env, row) => supabaseInsert("app_config", [row], env.supabaseUrl, env.supabaseKey, "resolution=merge-duplicates,return=minimal", "?on_conflict=key"),
  clear: env => supabaseDelete(env, `app_config?key=eq.${STORE_KEY}`),
  appearances: (env, vin) => vinAppearances(env, vin),
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

// SERVE. Crew only: without the signed crew cookie there is no field (null). A stored pick is served only when it is fresh (re-checked within MAX_CHECK_AGE_MS), its auction has not ended, and a keyed read
// confirms the listing is still live right now. Anything else is null; a visitor never runs the search.
export async function readFeaturedHistory(env, reqOrCookie, deps = {}) {
  const d = { ...defaultDeps(), ...deps };
  if (process.env.FEATURED_HISTORY === "0" || !isCrewRequest(reqOrCookie)) return null;
  const s = await readStore(env, d);
  const st = s.value;
  if (!st || !st.featured || !st.listingId) return null;
  const now = d.now(), f = st.featured;
  if (!(Date.parse(st.checkedAt) > now - MAX_CHECK_AGE_MS) || !(Date.parse(f.current && f.current.endsAt) > now)) return null;
  if ((await stillLive(env, st.listingId, d)) !== true) return null;
  return { ...f, checkedAt: st.checkedAt, selectedAt: st.selectedAt, findUrl: f.findUrl || findUrlOf(f) };
}

// REFRESH (the cron, never a visitor). Keeps the stored pick while it still passes; otherwise searches for the next verified car. Returns the stored pick or null; a failure stores nothing.
export async function refreshFeaturedHistory(env, deps = {}) {
  const d = { ...defaultDeps(), ...deps };
  const now = d.now(), iso = new Date(now).toISOString();
  const drop = async why => { await Promise.resolve(d.clear(env)).catch(() => {}); return { stored: null, why }; };
  try {
    const s = await readStore(env, d);
    if (s.failed) return await drop("store_unreadable");
    const st = s.value;
    if (st && st.featured && st.listingId) {
      const alive = await stillLive(env, st.listingId, d);
      if (alive === null) return await drop("live_unreadable");
      if (alive && Date.parse(st.featured.current.endsAt) > now) {
        // re-run every rule on the kept car (its earlier record could have changed), then keep it
        const rows = await d.select(env, `live_listings?id=eq.${encodeURIComponent(st.listingId)}&select=${LIVE_COLS}&limit=1`);
        const apps = Array.isArray(rows) && rows[0] ? withVin(await d.appearances(env, rows[0].vin_norm)) : null;
        const again = Array.isArray(rows) && rows[0] && apps && apps.ok ? evaluateCandidate(rows[0], apps.appearances, { nowMs: now }) : { ok: false };
        if (again.ok) { const keep = { ...st, checkedAt: iso }; await d.write(env, { key: STORE_KEY, value: keep }); return { stored: keep, why: "kept" }; }
      }
    } else if (st && st.sweptAt && Date.parse(st.sweptAt) > now - SWEEP_EVERY_MS && st.none) return { stored: null, why: "swept_recently" };
    // SEARCH: live cars with a VIN and a photo, screened by whether they have an earlier record, then verified by the full history read
    const live = await d.select(env, `live_listings?status=eq.live&end_time=gt.${encodeURIComponent(iso)}&vin_norm=not.is.null&photo_url=not.is.null&select=${LIVE_COLS}&order=end_time.desc&limit=1000`);
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
    let best = null;
    for (const minLeft of MIN_LEFT_MS) {
      const ok = [];
      for (const r of screened.filter(r => Date.parse(r.end_time) - now >= minLeft).slice(0, MAX_EVALUATED)) {
        const apps = withVin(await d.appearances(env, r.vin_norm));
        if (!apps || !apps.ok) continue;
        const pre = evaluateCandidate(r, apps.appearances, { nowMs: now });
        if (!pre.ok) continue;
        const urlStatus = {};
        for (const u of [pre.featured.previous.url, pre.featured.previous.photo]) urlStatus[u] = await d.urlStatus(u);
        const e = evaluateCandidate(r, apps.appearances, { nowMs: now, urlStatus });
        if (e.ok) ok.push(e);
      }
      best = chooseBest(ok);
      if (best) break;
    }
    if (!best) { const none = { none: true, sweptAt: iso }; await d.write(env, { key: STORE_KEY, value: none }); return { stored: null, why: "none_eligible" }; }
    const featured = { ...best.featured, selectedAt: iso, checkedAt: iso }; featured.findUrl = findUrlOf(featured);
    const value = { listingId: best.listingId, featured, selectedAt: iso, checkedAt: iso };
    await d.write(env, { key: STORE_KEY, value });
    return { stored: value, why: "selected" };
  } catch (e) {
    if (process.env.FH_DEBUG) console.error(e);
    return await drop("error");
  }
}
