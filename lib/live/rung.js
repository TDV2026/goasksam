// The engine's fallback rung, rendered (Oct 2026, Lane C). Lane B's model-first ladder adds three fields to the
// engine answer: fallbackRung (exact, year_widened, generation, model_any_year, sibling, not_enough_data), rungLabel
// (what is being shown, e.g. "CLK DTM, 2003 to 2007" or "Closest: CLK 55 AMG, 2000s", never a dollar figure) and
// siblingName (only on the sibling rung). This file is the ONE place Buy, the Task door, Task settings and Task
// emails read them, so the four always say the same thing.
// DORMANT BY DESIGN: with no rungLabel on the market object, every function here hands back exactly what it was
// given (applyRung returns the same object), so every surface renders as it did before the fields existed.
// Nothing here computes or caches a count: the count is the engine's own (m.count, the same listingMarket read).

export const RUNGS = new Set(["exact", "year_widened", "generation", "model_any_year", "sibling", "not_enough_data"]);
// Rungs a Task can be created from that task_created records (docs/analytics-events.md fallback_rung).
export const TRACKED_RUNGS = new Set(["sibling", "not_enough_data"]);

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
// A count in a sentence: one to ten as words, 11 and up as digits with a thousands separator ("3,715").
export function countText(n) {
  const x = Math.round(Number(n));
  if (!Number.isFinite(x) || x < 0) return "";
  return x >= 1 && x <= 10 ? WORDS[x] : x.toLocaleString("en-US");
}
const capFirst = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
// The label as given, made safe to print: no em or en dash (a range reads "to"), one line, a sane length.
const clean = s => typeof s === "string" ? s.replace(/\s*[–—]\s*/g, " to ").replace(/\s+/g, " ").trim().slice(0, 120) : "";

// { rung, label, sibling } when the engine named its rung, else null (today's answer: nothing changes).
export function rungOf(m) {
  if (!m || typeof m !== "object") return null;
  const label = clean(m.rungLabel);
  // A label is a name, never a price: one carrying a dollar figure is not printed at all.
  if (!label || /\$/.test(label)) return null;
  const rung = RUNGS.has(m.fallbackRung) ? m.fallbackRung : null;
  const sibling = rung === "sibling" ? (clean(m.siblingName) || null) : null;
  return { rung, label, sibling };
}
// The line(s) shown above the count or range: the label, and on the sibling rung the sibling named plainly.
export function rungLines(r) {
  if (!r) return [];
  return [r.label, r.sibling ? `These are ${r.sibling} sales, not this exact car.` : null].filter(Boolean);
}
// The not_enough_data answer: the count only, no dollar figure, no range wording, no "Only N".
export function notEnoughLine(count) {
  const n = Math.round(Number(count));
  return n > 0 ? `${capFirst(countText(n))} ${n === 1 ? "sale" : "sales"} on record. No range to show yet.` : "No range to show yet.";
}
// The name a Task door and its settings use for what the Task reports on: the sibling on the sibling rung (the
// car whose sales it will actually report), else the label.
export const doorName = r => r ? (r.sibling || r.label) : null;

// The market object a Buy card, panel or Task reads, with the rung applied. No rungLabel: the SAME object back.
// not_enough_data: count-only, every dollar-bearing field cleared, the sold-prices sentence replaced by the count.
export function applyRung(m) {
  if (!m || typeof m !== "object" || m.kind === "pending" || m.rungLines) return m;
  const r = rungOf(m);
  if (!r) return m;
  const out = { ...m, rung: r.rung, rungLabel: r.label, siblingName: r.sibling, rungLines: rungLines(r), doorName: doorName(r) };
  if (r.rung === "not_enough_data") {
    Object.assign(out, { kind: "count", low: null, high: null, span: null, spread: false, milesBand: null, miles: null, recent: [], take: null, referenceFigure: null, referenceFigureReason: null });
    out.soldLine = notEnoughLine(m.count);
  }
  return out;
}
// True when a Task built on this market should record its rung on task_created.
export const trackedRung = m => { const r = rungOf(m); return r && TRACKED_RUNGS.has(r.rung) ? r.rung : undefined; };
