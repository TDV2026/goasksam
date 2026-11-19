// THE OPENING TIME (Sam, Oct 25 2026; made a setting that starts EMPTY, Oct 29 2026): ONE setting, in this one place. Sam opens the site when the gates are green, so
// there is no fixed time. The environment variable LAUNCH_AT (Vercel, Settings, Environment Variables; no terminal) holds the moment, written with its offset, for
// example 2026-10-29T07:00:00-07:00 (Pacific Daylight Time is -07:00 until 1 November 2026, -08:00 after). Like every environment change it reaches a NEW deployment only.
// EMPTY (or anything that is not a date with an offset or Z) means "no time set": the holding page says the site is opening soon, prints no time and runs no countdown,
// and nothing anywhere prints a date. The countdown and "Opening now" at zero come back only when this is set. The holding page's words that name the date, the admin
// Launch tab and the admin's "launch" range all read it from here and nowhere else.
const HAS_ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/i;
export function launchAtMs(env = process.env) {
  const raw = String((env && env.LAUNCH_AT) || "").trim();
  if (!raw || !HAS_ZONE.test(raw)) return 0;
  const t = Date.parse(raw);
  return Number.isFinite(t) && t > Date.UTC(2026, 0, 1) ? t : 0;
}
export function launchWords(ms = launchAtMs()) {
  if (!ms) return "";
  const d = new Date(ms), f = (o) => new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", ...o }).format(d);
  return `${f({ weekday: "long" })}, ${f({ month: "long", day: "numeric", year: "numeric" })}, ${f({ hour: "numeric", minute: "2-digit" })} Pacific Time`;
}
