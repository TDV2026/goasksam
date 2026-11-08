// FIND EXAMPLES (Lane B, Nov 2026, the Find empty state, CREW ONLY, NOT LIVE until Sam says so in writing). Up to three real live auction cars, chosen by the engine, for the Find page's empty state.
//   findExamples(env, req) -> [ { title, platform, url, photo, live: true, endsAt, findUrl, priceLabel, timeLine, soldBefore } ] (1 to 3 items) or null. Lane E's names and shapes (docs/lane-notes.md, cf59a345).
// RULES: the featuredHistory eligibility (the car is live at selection AND at every serve, by a keyed read; a real current photo; a real https link; a price the trust layer can state in dollars, never current_bid_usd on its own),
// DIFFERENT MAKES, VISUAL VARIETY (decade, colour, body), at least one soldBefore when one is available, STABLE while live (a stored car is kept while it passes every rule again and only an ended or failed car is replaced), and
// soldBefore is true ONLY when the car's VIN has a COMPLETED sale confirmed by the featuredHistory rules (the earlier record's sale link and photo are checked; a listed-only earlier record is false). The price line and the time line are
// reason table sentences (lib/reasonWords.js tasks.demo_current_bid, demo.time_left): the page prints them as sent. ZERO OldCarsData. Stored under STORE_KEY ("crew_find_examples", a crew-only key), refreshed by the 15 minute pull
// (api/pullLive.js), which answers a word, never a car. CREW GATE: null without the signed crew cookie (a plain gas_crew=ok, a forged or tester cookie included). Kill switch: FIND_EXAMPLES=0.
import { supabaseSelect, supabaseInsert, supabaseDelete } from "../_supabase.js";
import { vinAppearances, houseName } from "../../api/_historyData.js";
import { isCrewRequest } from "../_crew.js";
import { evaluateCandidate, genuinePhoto, liveNow } from "./featuredHistory.js";
import { reasonLine } from "../reasonWords.js";

export const STORE_KEY = "crew_find_examples";
export const STORE_V = 1;
export const MAX_ITEMS = 3;
export const MAX_CHECK_AGE_MS = 90 * 60 * 1000;
export const SWEEP_EVERY_MS = 30 * 60 * 1000;
export const MIN_LEFT_MS = 30 * 60 * 1000;
export const MAX_HISTORY_READS = 80;
export const LIVE_SELECT = "live_listings?status=eq.live&photo_url=not.is.null&select=*";
const norm = x => String(x || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const isHttps = u => /^https:\/\/[^\s"'<>]+$/i.test(String(u || ""));

export const defaultDeps = () => ({
  now: () => Date.now(),
  select: (env, q) => supabaseSelect(env, q),
  write: (env, row) => supabaseInsert("app_config", [row], env.supabaseUrl, env.supabaseKey, "resolution=merge-duplicates,return=minimal", "?on_conflict=key"),
  clear: (env, key) => supabaseDelete(env, `app_config?key=eq.${key}`),
  appearances: (env, vin) => vinAppearances(env, vin),
  urlStatus: async u => { try { const c = new AbortController(), t = setTimeout(() => c.abort(), 4000); const r = await fetch(u, { method: "HEAD", redirect: "follow", signal: c.signal }); clearTimeout(t); return r.status; } catch { return null; } },
  facts: async row => (await import("./search.js")).listingFacts(row)
});

// the title the Find card names the car by: year, make, model
export const titleOf = row => [row.year, row.make, row.model].filter(Boolean).join(" ").trim() || String(row.listing_title || "").trim();
// ONE eligibility for every live demo card: live (minLeftMs of auction left at selection, none at a serve), a real current photo, a real link, a make and a model, and a price the trust layer states in dollars
export function eligibleRow(row, facts, now, minLeftMs = 0) {
  if (!liveNow(row, now) || Date.parse(row.end_time) - now < minLeftMs) return false;
  if (!genuinePhoto(row.photo_url) || !isHttps(row.url)) return false;
  if (!String(row.make || "").trim() || !String(row.model || "").trim()) return false;
  const p = num(facts && facts.priceUsd);
  return p > 0 && facts.priceState !== "suspect" && facts.priceState !== "unconverted";
}
export async function liveRow(env, id, d) {
  const rows = await d.select(env, `live_listings?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
  return Array.isArray(rows) ? (rows[0] || false) : null;   // null: unreadable; false: not there
}
export async function candidatePool(env, d, now) {
  const rows = await d.select(env, LIVE_SELECT + `&end_time=gt.${encodeURIComponent(new Date(now + MIN_LEFT_MS).toISOString())}&order=end_time.desc&limit=400`);
  return Array.isArray(rows) ? rows : null;
}
// soldBefore: true ONLY on a VIN with a completed sale the featuredHistory rules confirm (their evidence link and photo checked)
export async function soldBefore(env, row, d, now) {
  if (String(row.vin_norm || "").length < 6) return false;
  const a = await d.appearances(env, row.vin_norm).catch(() => null);
  if (!a || !a.ok) return false;
  const apps = (a.appearances || []).map(x => ({ ...x, vinNorm: a.vinNorm }));
  const pre = evaluateCandidate(row, apps, { nowMs: now });
  if (!pre.ok) return false;
  const us = {}; for (const u of [pre.featured.previous.url, pre.featured.previous.photo]) us[u] = await d.urlStatus(u);
  const e = evaluateCandidate(row, apps, { nowMs: now, urlStatus: us });
  return !!(e.ok && e.featured.kind === "sold");
}
export function itemOf(row, facts, sold, now) {
  const title = titleOf(row), left = Date.parse(row.end_time) - now;
  return { title, platform: houseName(row.source), url: row.url, photo: row.photo_url, live: true, endsAt: new Date(row.end_time).toISOString(), findUrl: "/find?q=" + encodeURIComponent(title),
    priceLabel: reasonLine("tasks.demo_current_bid", { price: facts.priceUsd }), timeLine: reasonLine("demo.time_left", { ms: left }), soldBefore: !!sold };
}
async function readStore(env, d, key = STORE_KEY) {
  const rows = await d.select(env, `app_config?key=eq.${key}&select=value&limit=1`);
  if (!Array.isArray(rows)) return { failed: true };
  const v = rows[0] && rows[0].value;
  return { value: v && typeof v === "object" ? v : null };
}
// the choice among candidates: a sold-before car first while none is chosen, then the most different in decade, colour and body from what is chosen, later end first, id last (deterministic)
export function chooseNext(cands, chosen) {
  const used = { dec: new Set(chosen.map(c => Math.floor((Number(c.row.year) || 0) / 10))), col: new Set(chosen.map(c => c.facts.colour || "")), body: new Set(chosen.map(c => c.facts.body || "")) };
  const haveSold = chosen.some(c => c.sold), makes = new Set(chosen.map(c => norm(c.row.make)));
  const score = c => (!haveSold && c.sold ? 1000 : 0) + (used.dec.has(Math.floor((Number(c.row.year) || 0) / 10)) ? 0 : 10) + (c.facts.colour && !used.col.has(c.facts.colour) ? 5 : 0) + (c.facts.body && !used.body.has(c.facts.body) ? 3 : 0);
  return cands.filter(c => !makes.has(norm(c.row.make))).sort((a, b) => score(b) - score(a) || Date.parse(b.row.end_time) - Date.parse(a.row.end_time) || String(a.row.id).localeCompare(String(b.row.id)))[0] || null;
}

// SERVE. Crew only. A stored pick older than MAX_CHECK_AGE_MS is never served; each car is read again by a keyed read at the serve and dropped if it is not live right now.
export async function findExamples(env, reqOrCookie, deps = {}) {
  const d = { ...defaultDeps(), ...deps };
  if (process.env.FIND_EXAMPLES === "0" || !isCrewRequest(reqOrCookie)) return null;
  const s = await readStore(env, d), st = s.value, now = d.now();
  if (!st || st.v !== STORE_V || !Array.isArray(st.entries) || !(Date.parse(st.checkedAt) > now - MAX_CHECK_AGE_MS)) return null;
  const items = [], seen = new Set();
  for (const e of st.entries.slice(0, MAX_ITEMS)) {
    const row = await liveRow(env, e.listingId, d);
    if (!row) continue;
    const facts = await Promise.resolve(d.facts(row));
    if (!eligibleRow(row, facts, now) || seen.has(norm(row.make))) continue;
    seen.add(norm(row.make)); items.push(itemOf(row, facts, e.sold, now));
  }
  return items.length ? items : null;
}

// REFRESH (the cron, never a visitor). Keeps every stored car that passes again, replaces an ended or failed one, fills to three cars of different makes. A failure stores nothing.
export async function refreshFindExamples(env, deps = {}) {
  const d = { ...defaultDeps(), ...deps }, now = d.now(), iso = new Date(now).toISOString();
  if (process.env.FIND_EXAMPLES === "0") return { stored: null, why: "off" };
  const drop = async why => { await Promise.resolve(d.clear(env, STORE_KEY)).catch(() => {}); return { stored: null, why }; };
  try {
    const s = await readStore(env, d);
    if (s.failed) return await drop("store_unreadable");
    const st = s.value, kept = [];
    if (st && st.v === STORE_V && Array.isArray(st.entries)) {
      for (const e of st.entries.slice(0, MAX_ITEMS)) {
        const row = await liveRow(env, e.listingId, d);
        if (row === null) return await drop("live_unreadable");
        if (!row) continue;
        const facts = await Promise.resolve(d.facts(row));
        if (eligibleRow(row, facts, now) && !kept.some(k => norm(k.row.make) === norm(row.make))) kept.push({ row, facts, sold: !!e.sold });
      }
    } else if (st && st.none && Date.parse(st.sweptAt) > now - SWEEP_EVERY_MS) return { stored: null, why: "swept_recently" };
    const funnel = { live: 0, eligible: 0, withVin: 0, soldBefore: 0, kept: kept.length, chosen: 0 };
    const chosen = kept.slice();
    if (chosen.length < MAX_ITEMS) {
      const live = await candidatePool(env, d, now);
      if (!live) return await drop("live_unreadable");
      funnel.live = live.length;
      const have = new Set(chosen.map(c => String(c.row.id))), cands = [];
      for (const row of live) { if (have.has(String(row.id))) continue; const facts = await Promise.resolve(d.facts(row)); if (eligibleRow(row, facts, now, MIN_LEFT_MS)) cands.push({ row, facts, sold: false }); }
      funnel.eligible = cands.length; funnel.withVin = cands.filter(c => String(c.row.vin_norm || "").length >= 6).length;
      // the earlier sale is read for the cars with a VIN only, a bounded number of them, newest-ending first (zero OldCarsData: the archive)
      let reads = 0; for (const c of cands) { if (reads >= MAX_HISTORY_READS || String(c.row.vin_norm || "").length < 6) continue; reads++; c.sold = await soldBefore(env, c.row, d, now); if (c.sold) funnel.soldBefore++; }
      while (chosen.length < MAX_ITEMS) { const next = chooseNext(cands, chosen); if (!next) break; chosen.push(next); cands.splice(cands.indexOf(next), 1); funnel.chosen++; }
    }
    if (!chosen.length) { await d.write(env, { key: STORE_KEY, value: { none: true, sweptAt: iso } }); return { stored: null, why: "none_eligible", funnel }; }
    const value = { v: STORE_V, entries: chosen.map(c => ({ listingId: c.row.id, sold: !!c.sold })), selectedAt: (st && st.selectedAt && kept.length ? st.selectedAt : iso), checkedAt: iso };
    await d.write(env, { key: STORE_KEY, value });
    return { stored: value, why: kept.length === chosen.length && kept.length ? "kept" : "selected", funnel };
  } catch (e) {
    if (process.env.FX_DEBUG) console.error(e);
    return await drop("error");
  }
}
