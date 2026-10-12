// Fixtures for the engine's fallback rung (Oct 2026, Lane C; lib/live/rung.js). Lane B's three new fields
// (fallbackRung, rungLabel, siblingName) FAKED on market objects shaped exactly like listingMarket's, so the dormant
// render path can be proven before the engine produces them. Used by scripts/rungCheck.mjs and by the probe
// api/tasks.js task_email_tests {fixture:"rung"}, which sends the rendered emails to our own address only.
// Never read by a live path: nothing here touches the engine, a table or a person's Task.
import { rungOf, doorName } from "../live/rung.js";
import { marketLines } from "../live/buyAlerts.js";
import { messageFor as alertMessage } from "../live/buyAlerts.js";
import { messageFor as watchMessage } from "../live/watches.js";
import { blockLines, taskEmailBody, taskEmailSubject, emailsOffLink } from "./tasks.js";
import { composeDigest } from "./digest.js";

export const RUNG_FIXTURES = {
  // Today: no rung fields at all.
  absent: { kind: "range", low: 52000, high: 68000, count: 23, window: "the past year", family: "CLK DTM coupes", familyOne: "CLK DTM coupe", familyBare: "CLK DTM coupes", short: "CLK DTMs", soldLine: "The middle half of CLK DTM coupe sales landed at $52,000 to $68,000 in the past year.", recent: [{ date: "2026-09-01", price: 60000 }], span: [41000, 90000], bodyScoped: null, step: "exact", query: "2005 Mercedes-Benz CLK DTM" },
  // The sibling rung: the CLK DTM has nothing to show, the engine shows the CLK 55 AMG and says so.
  sibling: { kind: "range", low: 14500, high: 23000, count: 3715, window: "the past year", family: "CLK 55 AMG coupes", familyOne: "CLK 55 AMG coupe", familyBare: "CLK 55 AMG coupes", short: "CLK 55 AMGs", soldLine: "The middle half of CLK 55 AMG coupe sales landed at $14,500 to $23,000 in the past year.", recent: [{ date: "2026-09-01", price: 19000 }], span: [8000, 41000], bodyScoped: null, step: "exact", query: "2005 Mercedes-Benz CLK DTM",
    fallbackRung: "sibling", rungLabel: "Closest: CLK 55 AMG, 2000s", siblingName: "CLK 55 AMG" },
  // not_enough_data: three sales of the car itself, no range.
  ned: { kind: "count", low: null, high: null, count: 3, window: "the past three years", family: "CLK DTM coupes", familyOne: "CLK DTM coupe", familyBare: "CLK DTM coupes", soldLine: "Not enough recent sales to show a range.", recent: [{ date: "2026-08-01", price: 260000 }], span: null, step: "exact", query: "2005 Mercedes-Benz CLK DTM",
    fallbackRung: "not_enough_data", rungLabel: "CLK DTM, all years" },
  // A widened rung with a range: the label sits above the range, nothing else changes.
  widened: { kind: "range", low: 52000, high: 68000, count: 23, window: "the past year", family: "CLK DTM coupes", familyOne: "CLK DTM coupe", familyBare: "CLK DTM coupes", soldLine: "The middle half of CLK DTM coupe sales landed at $52,000 to $68,000 in the past year.", span: [41000, 90000], bodyScoped: null, step: "exact",
    fallbackRung: "year_widened", rungLabel: "CLK DTM, 2003 to 2007" },
};
export const FIXTURE_USER = "aaaaaaaa-0000-4000-8000-000000000001";
const TASK = { id: "3b9d6f10-2222-4c1d-8e2f-abcdef012345", summary: "Sam is looking for Mercedes-Benz CLK DTMs.", filters: { make: "Mercedes-Benz", model: "CLK", trim: "DTM" } };
const BID = 61500;

// The Before it ends facts for one fixture market (the market part through the real marketLines).
export function alertFacts(m) {
  const x = marketLines(m, BID);
  return { name: "2005 Mercedes-Benz CLK DTM AMG Coupe", house: "Bring a Trailer", bid: BID, bidAt: null, market: x.market, soldLine: x.soldLine, rungLines: x.rungLines, placing: x.placing, sameCar: null, url: "https://bringatrailer.com/" };
}
// One live car's block in the daily email (the market part through the real blockLines).
export function taskBlock(m, asOf = "") {
  const bidLine = `Current bid $61,500${asOf}.`, x = blockLines(m, BID, asOf, bidLine);
  return { id: 101, car: "A 2005 Mercedes-Benz CLK DTM AMG Coupe is listed on Bring a Trailer.", url: "https://bringatrailer.com/", venue: "Bring a Trailer", bidLine: x.rangeLine ? null : bidLine, ends: null, rangeLine: x.rangeLine, lines: x.lines, bid: BID };
}
// A sold-car Task as arm() writes it from this market: named for what it reports on, the rung kept with its spec.
export function soldTask(m) {
  const r = rungOf(m);
  return { id: "5e7a1c33-3333-4d4e-9f50-0a1b2c3d4e5f", user_id: FIXTURE_USER, kind: "spec", key: "fixture", label: doorName(r) || m.familyBare, spec: { title: "2005 Mercedes-Benz CLK DTM", ...(r ? { rung: r } : {}) } };
}
export function soldEvents(m, now) {
  const t = rungOf(m) && rungOf(m).sibling ? "2004 Mercedes-Benz CLK 55 AMG Coupe" : "2005 Mercedes-Benz CLK DTM AMG Coupe";
  const day = i => new Date(now.getTime() - (i + 1) * 864e5).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  return [0, 1, 2].map(i => ({ title: t, house: "Bring a Trailer", date: day(i), price: (rungOf(m) && rungOf(m).sibling ? 18000 : 255000) + i * 1500, miles: 41000 + i * 9000, url: "https://bringatrailer.com/" }));
}
// The two Task emails, whole, for one fixture case: the combined daily email (a search Task section and a sold-car
// Task section) and Before it ends. endTime: the car's end, two hours out.
export function rungEmails(name, now = new Date()) {
  const m = RUNG_FIXTURES[name];
  const row = { id: 101, end_time: new Date(now.getTime() + 2 * 3600e3 - 5 * 60e3).toISOString() };
  const before = alertMessage(alertFacts(m), row, { first: false, userId: FIXTURE_USER, now });
  const body = taskEmailBody(TASK, [taskBlock(m)], { section: true });
  const w = soldTask(m), evs = soldEvents(m, now);
  const sections = [{ subject: taskEmailSubject([{ title: "2005 Mercedes-Benz CLK DTM AMG Coupe" }]), text: body.text, html: body.html, cars: 1 }, { ...watchMessage(w, evs, { now, section: true }), cars: evs.length }];
  const daily = composeDigest(sections, { every: "daily", first: false, stopAll: emailsOffLink(FIXTURE_USER) });
  return { daily, before };
}
