// Pacing for the Task email runs (Nov 5 2026). The combined Task email and Before it ends used to send one person at a time with no gap and no answer to a rate limit: past the provider's per second rate every send could come back 429,
// be marked failed, and the person's queued updates were lost. Now a run that sends through a PACE:
//   - keeps at least gapMs between sends (RESEND_MIN_GAP_MS, default 600 ms, under two a second);
//   - on a 429 waits (the provider's Retry-After when it sends one, else 1 s, 2 s, 4 s) and tries again, up to `retries` times;
//   - when the retries run out, STOPS the run's sending: nothing is marked failed, the person's updates stay queued and the next run (a quarter hour later) sends them;
//   - stops sending past the run's deadline (80% of the function limit) or its send count, and defers the rest the same way.
// A run with no pace (every existing check, a probe) behaves exactly as before.
export const DEFAULT_GAP_MS = 600;
export function makePace({ deadlineAt = Infinity, maxSends = Infinity, gapMs = Number(process.env.RESEND_MIN_GAP_MS) || DEFAULT_GAP_MS, retries = 3, backoffMs = 1000, maxWaitMs = 30000, now = Date.now, sleep = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  return { deadlineAt, maxSends, gapMs, retries, backoffMs, maxWaitMs, now, sleep, sends: 0, retried: 0, lastAt: 0, stopped: false, stopReason: null };
}
const isRateLimit = r => !!r && (r.status === 429 || /rate.?limit|too many requests/i.test(String(r.error || "")));
const stop = (p, reason) => { p.stopped = true; p.stopReason = p.stopReason || reason; return { ok: false, deferred: true, reason: p.stopReason, rateLimited: p.stopReason === "rate_limited" }; };
export async function sendPaced(pace, send, msg) {
  if (!pace) return send(msg);
  if (pace.stopped) return { ok: false, deferred: true, reason: pace.stopReason, rateLimited: pace.stopReason === "rate_limited" };
  for (let attempt = 0; ; attempt++) {
    const wait = pace.lastAt ? pace.lastAt + pace.gapMs - pace.now() : 0;
    if (pace.now() + Math.max(0, wait) >= pace.deadlineAt) return stop(pace, "deadline");   // never wait past the deadline to send
    if (pace.sends >= pace.maxSends) return stop(pace, "send_budget");
    if (wait > 0) await pace.sleep(wait);
    const r = await send(msg); pace.sends++; pace.lastAt = pace.now();
    if (!isRateLimit(r)) return r;
    if (attempt >= pace.retries) return stop(pace, "rate_limited");
    pace.retried++;
    await pace.sleep(Math.min(pace.maxWaitMs, Number(r.retryAfterMs) > 0 ? Number(r.retryAfterMs) : pace.backoffMs * 2 ** attempt));
  }
}
