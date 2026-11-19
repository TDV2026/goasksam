// ONE RETRY OF A FAILED ARCHIVE READ, AFTER A SHORT PAUSE (Lane B, lane-b-read-resilience, Nov 18 2026; order bc85 item 2).
// CAUSE it answers: the archive pool read fails in bursts (22 "archive read failed (pool read)" in 40 minutes on Nov 18, 2 of them in /api/sellChat at the minute a visitor read "This one could not be read yet."), and
// the engine retried only a dropped connection ("blip"); a statement timeout or an unclassified error went straight to "still reading". The failures in the Vercel log are one at a time (48 of 50 have no other failure
// within two seconds), so a second attempt after a pause meets a database that has recovered. The rule that no answer is built on a failed read stays: a retry that fails again is the still-reading answer, never stored.
// LOAD: a timeout is the same query that just cost its CPU, so a retry of a timeout is rationed: never for the History pages (crawlers read them cold in bulk and the visitor's Sell must not queue behind them), and
// at most RETRY_MAX_PER_WINDOW retries per instance in RETRY_WINDOW_MS with at most RETRY_MAX_CONCURRENT paused or running at once. A blip is retried within the same ration; an unclassified error is not: the page read (lib/_supabase.js fetchPageWithRetry) already tried it three times with a backoff, and another full pass only doubled the wait of a down archive (findAlwaysCardsCheck).
import { callerNow } from "./_caller.js";
export const RETRY_WINDOW_MS = 10000, RETRY_MAX_PER_WINDOW = 6, RETRY_MAX_CONCURRENT = 2, RETRY_PAUSE_MS = [400, 900];
const state = { stamps: [], inflight: 0 };
export function resetRetryState() { state.stamps = []; state.inflight = 0; }
export const retryState = () => ({ recent: state.stamps.length, inflight: state.inflight });
const BULK_CALLERS = new Set(["site", "history", "crawler", "warm", "ops", "cron", "build"])   // "site" is the History, spec and market pages (lib/_caller.js callerFor);
// kinds: the kinds noted for the failed reads ("timeout", "blip", "error"). Returns { retry, pauseMs, why }.
export function retryPlan(kinds, { caller = callerNow(), now = Date.now(), rnd = Math.random } = {}) {
  const ks = Array.isArray(kinds) ? kinds : [];
  state.stamps = state.stamps.filter(t => now - t < RETRY_WINDOW_MS);
  const pauseMs = Math.round(RETRY_PAUSE_MS[0] + rnd() * (RETRY_PAUSE_MS[1] - RETRY_PAUSE_MS[0]));
  if (BULK_CALLERS.has(String(caller || "")) && ks.some(k => k === "timeout")) return { retry: false, pauseMs: 0, why: "a bulk caller's timeout is not repeated" };
  if (ks.length && !ks.some(k => k === "timeout" || k === "blip")) return { retry: false, pauseMs: 0, why: "an unclassified error was already retried twice by the page read (lib/_supabase.js)" };
  if (state.stamps.length >= RETRY_MAX_PER_WINDOW) return { retry: false, pauseMs: 0, why: "the retry ration is used" };
  if (state.inflight >= RETRY_MAX_CONCURRENT) return { retry: false, pauseMs: 0, why: "two retries are already waiting" };
  return { retry: true, pauseMs, why: ks.includes("timeout") ? "timeout" : "blip" };
}
// the pause, counted while it waits and while the retry runs: call done() when the retry has finished
export async function startRetry(plan, sleep = ms => new Promise(r => setTimeout(r, ms))) {
  state.stamps.push(Date.now()); state.inflight++;
  let ended = false; const done = () => { if (!ended) { ended = true; state.inflight = Math.max(0, state.inflight - 1); } };
  try { await sleep(plan.pauseMs); } catch { /* the pause is best effort */ }
  return done;
}
