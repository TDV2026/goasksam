// WATCHING DEMO (Lane B, Nov 2026, the Tasks page "WATCHING" card, CREW ONLY, NOT LIVE until Sam says so in writing). One real live auction car for the watching card.
//   watchingDemo(env, req) -> { car: { title, platform, url, photo, live: true, endsAt, priceLabel, timeLine }, status?, checkedAt } or null. Lane E's names and shapes (docs/lane-notes.md, cf59a345).
// A DIFFERENT MAKE from the Tasks example car (the tasksDemo pick), a Ferrari or a BMW when one is eligible; the same eligibility as the Find examples (live at selection and at every serve by a keyed read, a real current photo, a real link,
// a price the trust layer states in dollars). status is "Auction ending soon" (reason table demo.ending_soon) ONLY when the auction ends within 24 hours, and is absent otherwise. THE CARD DESCRIBES A WATCH: nothing in this field says a reminder,
// an email or an alert was sent or will be, and no sentence of it can. STABLE while live (kept while it passes and its make still differs from the Tasks example's), replaced when its auction ends or a rule fails. Stored under STORE_KEY
// ("crew_watching_demo"), refreshed by the 15 minute pull (api/pullLive.js, a word never a car), ZERO OldCarsData. CREW GATE: null without the signed crew cookie. Kill switch: WATCHING_DEMO=0.
import { isCrewRequest } from "../_crew.js";
import { reasonLine } from "../reasonWords.js";
import { STORE_KEY as TASKS_DEMO_KEY } from "./tasksDemo.js";
import { defaultDeps, eligibleRow, liveRow, candidatePool, titleOf, MAX_CHECK_AGE_MS, MIN_LEFT_MS, SWEEP_EVERY_MS } from "./findExamples.js";
import { liveNow } from "./featuredHistory.js";
import { LAST_KEY as TASKS_LAST_KEY, LAST_V as TASKS_LAST_V } from "./tasksDemo.js";
import { houseName } from "../../api/_historyData.js";

export const STORE_KEY = "crew_watching_demo";
export const STORE_V = 1;
export const SOON_MS = 24 * 3600 * 1000;
const PREFERRED = /^(ferrari|bmw)$/i;
const norm = x => String(x || "").toLowerCase().replace(/[^a-z0-9]/g, "");

async function readKey(env, d, key) {
  const rows = await d.select(env, `app_config?key=eq.${key}&select=value&limit=1`);
  if (!Array.isArray(rows)) return { failed: true };
  const v = rows[0] && rows[0].value;
  return { value: v && typeof v === "object" ? v : null };
}
// the make of the Tasks example car right now (its stored pick, read live), or null when it has none
async function tasksDemoMake(env, d) {
  const s = await readKey(env, d, TASKS_DEMO_KEY);
  if (s.failed) return { failed: true };
  const id = s.value && s.value.listingId;
  if (!id) return { make: null };
  const row = await liveRow(env, id, d);
  if (row === null) return { failed: true };
  return { make: row ? norm(row.make) : null };
}
export function cardOf(row, facts, now) {
  const left = Date.parse(row.end_time) - now;
  return { car: { title: titleOf(row), platform: houseName(row.source), url: row.url, photo: row.photo_url, live: true, endsAt: new Date(row.end_time).toISOString(),
    priceLabel: reasonLine("tasks.demo_current_bid", { price: facts.priceUsd }), timeLine: reasonLine("demo.time_left", { ms: left }) }, ...(left <= SOON_MS ? { status: reasonLine("demo.ending_soon") } : {}) };
}

export async function watchingDemo(env, reqOrCookie, deps = {}) {
  const d = { ...defaultDeps(), ...deps };
  if (process.env.WATCHING_DEMO === "0" || !isCrewRequest(reqOrCookie)) return null;
  const s = await readKey(env, d, STORE_KEY), st = s.value, now = d.now();
  if (!st || st.v !== STORE_V || !st.listingId || !(Date.parse(st.checkedAt) > now - MAX_CHECK_AGE_MS)) return null;
  const row = await liveRow(env, st.listingId, d);
  if (!row || !liveNow(row, now)) return null;
  const facts = await Promise.resolve(d.facts(row));
  if (!eligibleRow(row, facts, now)) return null;
  const tm = await tasksDemoMake(env, d);
  if (tm.failed || (tm.make && tm.make === norm(row.make))) return null;   // never the same make as the Tasks example, whatever changed since the pick
  return { ...cardOf(row, facts, now), checkedAt: st.checkedAt };
}

// FALLBACK (Lane B, Nov 8 2026): the watching card never has nothing. The refresh records the car it proves (selected or kept) under LAST_KEY with the bid in dollars the trust layer stated then; a failed refresh never clears it. watchingDemoFallback(env, req) serves it
// after the live field is null: an ended car (end time passed, or a keyed read no longer finds it live) with status "Ended", label "Recent example", car.live false, priceLabel "Last bid $X" (the recorded figure) and timeLine "Ended"; a car still live by a keyed read
// is served live with its bid read again. Never the same make as the Tasks example's fallback record; unreadable and not yet past its end is null. Crew gated, same kill switch.
export const LAST_KEY = "crew_watching_demo_last";
export const LAST_V = 1;
async function recordLast(env, d, row, facts, iso) {
  try { const p = Number(facts && facts.priceUsd); if (!(p > 0)) return; await d.write(env, { key: LAST_KEY, value: { v: LAST_V, listingId: row.id, make: row.make, car: cardOf(row, facts, Date.parse(iso)).car, priceUsd: p, recordedAt: iso } }); } catch {}
}
export async function watchingDemoFallback(env, reqOrCookie, deps = {}) {
  const d = { ...defaultDeps(), ...deps };
  if (process.env.WATCHING_DEMO === "0" || !isCrewRequest(reqOrCookie)) return null;
  const s = await readKey(env, d, LAST_KEY), st = s.value;
  if (!st || st.v !== LAST_V || !st.listingId || !st.car || !(Number(st.priceUsd) > 0)) return null;
  const now = d.now(), endsAt = Date.parse(st.car.endsAt);
  if (!Number.isFinite(endsAt)) return null;
  const t = await readKey(env, d, TASKS_LAST_KEY);
  if (t.value && t.value.v === TASKS_LAST_V && t.value.field && t.value.field.car && norm(String(t.value.field.car.title).split(/\s+/)[1]) === norm(st.make)) return null;   // the same make as the Tasks card's record: neither card repeats the other
  const row = await liveRow(env, st.listingId, d);
  if (row && liveNow(row, now) && endsAt > now) {
    const facts = await Promise.resolve(d.facts(row)), bid = Number(facts && facts.priceUsd);
    if (!(bid > 0) || facts.priceState === "suspect" || facts.priceState === "unconverted") return null;
    const card = cardOf(row, facts, now);
    return { ...card, checkedAt: st.recordedAt, fallback: true };
  }
  if (row === null && endsAt > now) return null;
  return { car: { ...st.car, live: false, priceLabel: reasonLine("demo.last_bid", { price: Number(st.priceUsd) }), timeLine: reasonLine("demo.ended") }, status: reasonLine("demo.ended"), label: reasonLine("demo.recent_example"), checkedAt: st.recordedAt, fallback: true };
}

export async function refreshWatchingDemo(env, deps = {}) {
  const d = { ...defaultDeps(), ...deps }, now = d.now(), iso = new Date(now).toISOString();
  if (process.env.WATCHING_DEMO === "0") return { stored: null, why: "off" };
  const drop = async why => { await Promise.resolve(d.clear(env, STORE_KEY)).catch(() => {}); return { stored: null, why }; };
  try {
    const s = await readKey(env, d, STORE_KEY);
    if (s.failed) return await drop("store_unreadable");
    const tm = await tasksDemoMake(env, d);
    if (tm.failed) return await drop("live_unreadable");
    const st = s.value;
    if (st && st.v === STORE_V && st.listingId) {
      const row = await liveRow(env, st.listingId, d);
      if (row === null) return await drop("live_unreadable");
      if (row) { const facts = await Promise.resolve(d.facts(row)); if (eligibleRow(row, facts, now) && !(tm.make && tm.make === norm(row.make))) { const keep = { ...st, checkedAt: iso }; await d.write(env, { key: STORE_KEY, value: keep }); await recordLast(env, d, row, facts, iso); return { stored: keep, why: "kept" }; } }
    } else if (st && st.none && Date.parse(st.sweptAt) > now - SWEEP_EVERY_MS) return { stored: null, why: "swept_recently" };
    const live = await candidatePool(env, d, now);
    if (!live) return await drop("live_unreadable");
    const cands = [];
    for (const row of live) { if (tm.make && tm.make === norm(row.make)) continue; const facts = await Promise.resolve(d.facts(row)); if (eligibleRow(row, facts, now, MIN_LEFT_MS)) cands.push({ row, facts }); }
    // a Ferrari or a BMW first; then a car ending within the day (with at least three hours left); then the soonest end; id last
    const soon = c => { const left = Date.parse(c.row.end_time) - now; return left <= SOON_MS && left >= 3 * 3600 * 1000 ? 0 : 1; };
    cands.sort((a, b) => (PREFERRED.test(a.row.make) ? 0 : 1) - (PREFERRED.test(b.row.make) ? 0 : 1) || soon(a) - soon(b) || Date.parse(a.row.end_time) - Date.parse(b.row.end_time) || String(a.row.id).localeCompare(String(b.row.id)));
    const pick = cands[0];
    if (!pick) { await d.write(env, { key: STORE_KEY, value: { none: true, sweptAt: iso } }); return { stored: null, why: "none_eligible", funnel: { live: live.length, eligible: 0 } }; }
    const value = { v: STORE_V, listingId: pick.row.id, selectedAt: iso, checkedAt: iso };
    await d.write(env, { key: STORE_KEY, value });
    await recordLast(env, d, pick.row, pick.facts, iso);
    return { stored: value, why: "selected", funnel: { live: live.length, eligible: cands.length } };
  } catch (e) {
    if (process.env.FX_DEBUG) console.error(e);
    return await drop("error");
  }
}
