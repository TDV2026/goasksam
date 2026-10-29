// Pin the end times of an auction answer to the clock, for browser checks that read the live engine or a stored answer with real auction end times.
// The page switches the before-it-ends toggle off inside two hours and drops it once a car has ended (api/buy.js alertSwitchHtml), so a check that
// reads a real end time passes or fails by the hour it runs. Oct 29 2026: standingDrawerCheck passed at 6:50 AM Pacific and failed from 8:30 AM,
// the two hours before the real SL65 listing ended at 17:30 UTC. The earliest end time is moved to 26 hours ahead of the clock; the gaps stay.
export function freshenEndTimes(fix, now = Date.now()) {
  const each = f => (function walk(o) { if (o && typeof o === "object") for (const k of Object.keys(o)) { if (k === "end_time" && typeof o[k] === "string" && !isNaN(Date.parse(o[k]))) f(o, k); else walk(o[k]); } })(fix);
  const ts = []; each((o, k) => ts.push(Date.parse(o[k])));
  if (!ts.length) return fix;
  const shift = now + 26 * 3600e3 - Math.min(...ts);
  each((o, k) => { o[k] = new Date(Date.parse(o[k]) + shift).toISOString(); });
  return fix;
}
// The same move on the text of an answer, whether it is JSON or an event stream (the chat answer is a stream of data lines).
export function freshenEndTimesText(txt, now = Date.now()) {
  const re = /("end_time"\s*:\s*")([^"]+)(")/g, ts = [];
  for (const m of txt.matchAll(re)) if (!isNaN(Date.parse(m[2]))) ts.push(Date.parse(m[2]));
  if (!ts.length) return txt;
  const shift = now + 26 * 3600e3 - Math.min(...ts);
  return txt.replace(re, (all, a, v, c) => isNaN(Date.parse(v)) ? all : a + new Date(Date.parse(v) + shift).toISOString() + c);
}
