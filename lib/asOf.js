// The one shared "as of [date]" for dated lead sentences (Oct 2026): /sell uses it, Market Check should
// call it too (one copy, never a second). The date is the day the page is served, in Pacific time, written
// "October 8, 2026". It says when Sam last read the sales; it is not a claim about any count.
export function asOfDate(now = new Date()) {
  return now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" });
}
