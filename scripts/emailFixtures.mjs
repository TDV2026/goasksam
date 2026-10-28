// THE TASK EMAIL FIXTURES (Lane D, Oct 28 2026). The REAL runDigest over an in-memory io: no network, no send. Each car's card is Find's own card in the email layout
// (lib/tasks/emailCards.js, fed by the engine's own coreOf and marketFromCore and its emailModeOf), so what is rendered is what a send would print. The engine answers are the
// repo's fixtures (scripts/fixtures) with the numbers scaled to the car; THEY ARE FIXTURE NUMBERS, NOT MARKET DATA, and the rendered pages say so.
//   Golden rows 73 to 75 (docs/golden-rules.md): 2025 Porsche 911, 1963 Corvette Split Window, 2003 Mercedes-Benz S-Class, plus a new Task whose car has options.
import fs from "node:fs";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "x";
process.env.TASK_LINK_SECRET = process.env.TASK_LINK_SECRET || "fixture-only";
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("no network in the email fixtures"); };
const rd = f => JSON.parse(fs.readFileSync("scripts/fixtures/" + f, "utf8"));
const S = await import("../lib/live/search.js"), { samLines } = await import("../api/buySearch.js"), { emailCardHtml, emailCardText } = await import("../lib/tasks/emailCards.js");
const { emailModeOf } = await import("../lib/onebox.js"), { runDigest } = await import("../lib/tasks/digest.js");
const m3 = rd("m3Answer.json"), diablo = rd("answer-diablo.json");
const OPT = (label, value, n, low, high) => ({ dimension: "variant", label, value, n, low, high });
const LN = o => `${o.label} $${o.low.toLocaleString("en-US")} to $${o.high.toLocaleString("en-US")}, ${o.n} sales`;
// scale the M3 answer's range to the car, and attach the engine's option lines for the state
function answer(low, high, state, opts) {
  const mid = Math.round((low + high) / 2 / 250) * 250;
  const a = { ...m3, cluster: [low, high], referenceFigure: { ...m3.referenceFigure, amount: mid, rangeLow: low, rangeHigh: high } };
  if (state) { a.optionsState = state; a.options = opts; a.optionLines = opts.map(LN); a.headlineLines = state === "alike" ? [] : opts.map(LN); }
  if (state === "apart") { a.cluster = null; a.referenceFigure = null; a.noCluster = true; a.trend = null; }
  return { ...a, emailMode: emailModeOf(a) };
}
const NONE = { status: "one_box", tier: "refusal", cluster: null, poolN: 0, cards: [], samLine: "Sales too spread out for a range.", refusal_line: "Sam could not verify this one, so no figures are shown." };
// each car: the live listing row, the engine answer, and the Task it belongs to
export const CARS = {
  p911:   { id: 101, title: "2025 Porsche 911 Carrera", make: "Porsche", model: "911", year: 2025, hours: 3,  d: answer(118000, 154000, "apart", [OPT("Carrera", "carrera", 9, 118000, 139000), OPT("Carrera S", "carrera-s", 11, 141000, 154000)]) },
  vette:  { id: 102, title: "1963 Chevrolet Corvette Split Window", make: "Chevrolet", model: "Corvette", year: 1963, hours: 5, d: answer(150000, 235000, "alike", [OPT("L76", "l76", 8, 160000, 230000), OPT("L84", "l84", 9, 150000, 235000), OPT("L75", "l75", 8, 152000, 220000)]) },
  sclass: { id: 103, title: "2003 Mercedes-Benz S-Class S500", make: "Mercedes-Benz", model: "S-Class", year: 2003, hours: 8, d: answer(7500, 14500, "apart", [OPT("S430", "s430", 8, 6500, 10500), OPT("S500", "s500", 12, 8500, 14500), OPT("S600", "s600", 8, 9500, 15500)]) },
  m3conv: { id: 104, title: "2001 BMW M3 Convertible", make: "BMW", model: "M3", year: 2001, hours: 6, d: answer(22500, 41000, "alike", [OPT("Convertible", "convertible", 9, 29000, 42500), OPT("Coupe", "coupe", 8, 22500, 31500)]) },
  m3plain:{ id: 105, title: "2001 BMW M3 Coupe", make: "BMW", model: "M3", year: 2001, hours: 9, d: answer(22500, 41000) },
  diablo: { id: 106, title: "2001 Lamborghini Diablo SE Coupe", make: "Lamborghini", model: "Diablo", year: 2001, hours: 12, d: { ...diablo, emailMode: emailModeOf(diablo) } },
  none:   { id: 107, title: "1987 Porsche 959", make: "Porsche", model: "959", year: 1987, hours: 14, d: { ...NONE, emailMode: emailModeOf(NONE) } }
};
// n more cars of one Task (ending in order), for the cap and the count lines
export function addCars(n, prefix = "x") { const keys = []; for (let i = 1; i <= n; i++) { const k = prefix + i; CARS[k] = { id: 200 + i, title: `19${60 + (i % 30)} Porsche 356 Speedster ${i}`, make: "Porsche", model: "356", year: 1960 + (i % 30), hours: 20 + i, d: answer(90000, 150000) }; keys.push(k); } return keys; }
export const NOW = new Date("2026-10-28T15:00:00Z");
const hoursFrom = h => new Date(NOW.getTime() + h * 3600e3).toISOString();
const rowOf = c => ({ id: c.id, end_time: hoursFrom(c.hours), status: "live", listing_title: c.title, source: "bringatrailer", url: "https://example.com/listing/" + c.id, make: c.make, year: c.year });
function listingOf(c) {
  const row = { listing_title: c.title, year: c.year, make: c.make, model: c.model };
  const spec = S.specOf(row); spec.catch(() => {});   // the same call emailModeCheck makes (the spec is read by the market only for a vehicle lookup, which these fixtures do not need)
  let market;
  if (c.d.emailMode === "none") market = { kind: "refused", emailMode: "none", refusalLine: c.d.refusal_line };
  else market = S.marketFromCore(S.coreOf(c.d, spec), row, { miles: null }, spec);
  const l = { id: c.id, title: c.title, make: c.make, year: c.year, url: "https://example.com/listing/" + c.id, source: "bringatrailer", current_bid_usd: 30000, bid_at: new Date(NOW.getTime() - 600e3).toISOString(), end_time: hoursFrom(c.hours), market };
  l.sam_lines = samLines(l, NOW.getTime());
  return l;
}
const TASKS = {
  A: { id: "00000000-0000-4000-8000-0000000000a1", summary: "Sam is looking for a 2025 Porsche 911.", filters: { make: "Porsche", model: "911" }, car: "p911" },
  B: { id: "00000000-0000-4000-8000-0000000000a2", summary: "Sam is looking for a 1963 Chevrolet Corvette Split Window.", filters: { make: "Chevrolet", model: "Corvette" }, car: "vette" },
  C: { id: "00000000-0000-4000-8000-0000000000a3", summary: "Sam is looking for a 2003 Mercedes-Benz S-Class.", filters: { make: "Mercedes-Benz", model: "S-Class" }, car: "sclass" },
  D: { id: "00000000-0000-4000-8000-0000000000a4", summary: "Sam is looking for a BMW M3 from 2001.", filters: { make: "BMW", model: "M3" }, car: "m3conv" },
  E: { id: "00000000-0000-4000-8000-0000000000a5", summary: "Sam is looking for rare Italian and Porsche exotics.", filters: { make: "Porsche" }, car: "diablo" }
};
// One send run. updates: [{ taskKey, cars: [carKey...] }]; emailedTasks: task keys that already had a match email.
export async function runMail({ updates, emailedTasks = [], every = "daily", first = false }) {
  const taskById = Object.fromEntries(Object.values(TASKS).map(t => [t.id, { id: t.id, user_id: "aaaaaaaa-0000-4000-8000-000000000001", email: "p@example.com", channels: ["inapp", "email"], summary: t.summary, filters: t.filters, state: "running", kind: "hunt" }]));
  const carsByKey = CARS, byId = {}; for (const c of Object.values(carsByKey)) byId[c.id] = c;
  const ups = updates.map((u, i) => ({ id: i + 1, task_id: TASKS[u.taskKey].id, kind: "match", email_status: "queued", created_at: hoursFrom(-1), data: { cards: u.cars.map(k => ({ id: carsByKey[k].id, title: carsByKey[k].title })) } }));
  const emailed = new Set(emailedTasks.map(k => TASKS[k].id)), sends = [];
  const io = {
    queuedUpdates: () => ups, tasks: ids => ids.map(id => taskById[id]), watchUsers: () => [], watchesFor: () => [], watches: () => [],
    prefs: () => ({ on: true, email: "p@example.com", every }), targets: () => [{ channel: "email", to: "p@example.com" }],
    lastSent: () => null, sentToday: () => 0, first: () => first, recordSent: () => {}, pendingEvents: () => [], taskEmailed: id => emailed.has(id),
    liveSlim: ids => ids.map(i => byId[i] && rowOf(byId[i])).filter(Boolean), liveRows: ids => ids.map(i => byId[i] && rowOf(byId[i])).filter(Boolean),
    blocks: (rows, cards) => cards.map(c => { const l = listingOf(byId[c.id]); return { id: c.id, car: byId[c.id].title, cardText: emailCardText(l), cardHtml: emailCardHtml(l) }; }),
    patchUpdate: () => {}, markAlert: () => {}, markWatch: () => {}, send: m => { sends.push(m); return { ok: true }; }
  };
  await runDigest({}, { io, now: NOW, withMail: true });
  return sends[0] || null;
}
// The five emails of the set.
export async function buildEmails() {
  return {
    // 1. the first email after three Tasks were created: golden rows 73 to 75, each Task's first email, a catch-up
    first: await runMail({ updates: [{ taskKey: "A", cars: ["p911"] }, { taskKey: "B", cars: ["vette"] }, { taskKey: "C", cars: ["sclass"] }], first: true }),
    // 2. a new Task whose car has options, its first email
    options: await runMail({ updates: [{ taskKey: "D", cars: ["m3conv"] }] }),
    // 3. a later email: the three Tasks each have an earlier email, only new cars
    later: await runMail({ updates: [{ taskKey: "A", cars: ["p911"] }, { taskKey: "B", cars: ["vette"] }, { taskKey: "C", cars: ["sclass"] }], emailedTasks: ["A", "B", "C"] }),
    // 4. the other modes: range, sales, none
    modes: await runMail({ updates: [{ taskKey: "D", cars: ["m3plain"] }, { taskKey: "E", cars: ["diablo", "none"] }], emailedTasks: ["D", "E"] })
  };
}
globalThis.fetch = realFetch;
