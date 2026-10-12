// Fixtures for a stored live bid by its own time (Oct 2026, Lane C; lib/tasks/bidTime.js): one live car whose stored bid
// was last updated 10 minutes, 61 minutes or 5 hours ago, or carries no bid time, rendered whole by the real builders.
// Used by the probe api/tasks.js task_email_tests {fixture:"bid"}, which sends them to our own address only. Never read
// by a live path: nothing here touches a table, the engine or a person's Task.
import { messageFor as alertMessage } from "../live/buyAlerts.js";
import { messageFor as watchMessage } from "../live/watches.js";
import { bidBlock, taskEmailBody, taskEmailSubject, emailsOffLink } from "./tasks.js";
import { composeDigest } from "./digest.js";

export const BID_CASES = { fresh: 10, "61min": 61, "5h": 300, untimed: null };
export const BID_FIXTURE_USER = "aaaaaaaa-0000-4000-8000-000000000001";
const NAME = "2005 Mercedes-Benz CLK DTM AMG Coupe", URL = "https://bringatrailer.com/";
// The range the bid is placed against: a fixture shaped like listingMarket's, not an engine answer.
const RANGE = { kind: "range", low: 52000, high: 68000, count: 23, window: "the past year", family: "CLK DTM coupes", familyOne: "CLK DTM coupe", soldLine: "The middle half of CLK DTM coupes sold between $52,000 and $68,000 in the past year.", bodyScoped: null };

export function bidEmails(name, now = new Date()) {
  const mins = BID_CASES[name];
  const bidAt = mins == null ? null : new Date(now.getTime() - mins * 60e3).toISOString();
  // The stored row: last_seen (our last read) is recent in every case and is never used as the bid time.
  const row = { id: 101, end_time: new Date(now.getTime() + 105 * 60e3).toISOString(), url: URL, source: "bringatrailer", current_bid_usd: 61500, bid_at: bidAt, last_seen: new Date(now.getTime() - 5 * 60e3).toISOString() };
  const before = alertMessage({ name: NAME, house: "Bring a Trailer", bid: 61500, bidAt: row.bid_at || null, soldLine: RANGE.soldLine, rungLines: [], placing: "inside the range", sameCar: null, url: URL }, row, { first: false, userId: BID_FIXTURE_USER, now });
  const b = bidBlock(row, RANGE, now);
  // The block's end line in the real format (lib/tasks/tasks.js endsLine): it stays whatever the bid's age.
  const e = new Date(row.end_time), tz = { timeZone: "America/Los_Angeles" };
  const ends = `Bidding ends ${e.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", ...tz })} at ${e.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", ...tz }).replace(" AM", "am").replace(" PM", "pm")} PT.`;
  const block = { id: 101, car: `A ${NAME} is listed on Bring a Trailer.`, url: URL, venue: "Bring a Trailer", bidLine: b.rangeLine ? null : b.bidLine, ends, rangeLine: b.rangeLine, lines: b.lines, bid: b.raw };
  const task = { id: "3b9d6f10-2222-4c1d-8e2f-abcdef012345", summary: "Sam is looking for Mercedes-Benz CLK DTMs.", filters: { make: "Mercedes-Benz", model: "CLK" } };
  const body = taskEmailBody(task, [block], { section: true });
  const w = { id: "5e7a1c33-3333-4d4e-9f50-0a1b2c3d4e5f", kind: "vin", key: "WDB2093421F000000", label: "2005 Mercedes-Benz CLK DTM" };
  const keep = watchMessage(w, [{ key: "l:101", kind: "live", date: now.toISOString().slice(0, 10), bid: 61500, bidAt: row.bid_at || null, end: row.end_time, house: "Bring a Trailer", url: URL, title: NAME }], { now, section: true });
  const daily = composeDigest([{ subject: taskEmailSubject([{ title: NAME }]), text: body.text, html: body.html, cars: 1 }, { ...keep, cars: 1 }], { every: "daily", first: false, stopAll: emailsOffLink(BID_FIXTURE_USER) });
  return { daily, before, bidAt };
}
