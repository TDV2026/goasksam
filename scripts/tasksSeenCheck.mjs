// CARS SHOWN AT SETUP COUNT AS SEEN (Lane C, Oct 26 2026, from Sam's Task "black manual Porsches"): a Task whose opening read shows one car must
// not report that car as new later (not under the same listing, not under a relist of the same VIN), must not put it in the combined email, and
// must still send the "Before it ends" reminder when the person asked for it. Real engine paths on the in-memory store, no network, nothing written.
// node scripts/tasksSeenCheck.mjs
globalThis.fetch = async () => new Response("[]", { status: 200 });
const T = await import("../lib/tasks/tasks.js");
const D = await import("../lib/tasks/digest.js");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL  " + m); } };
const HOUR = 3600e3, NOW = Date.now();
const iso = ms => new Date(ms).toISOString();
const car = (id, over = {}) => ({ id, source: "bringatrailer", source_listing_id: "bat-" + id, url: "https://bringatrailer.com/listing/porsche-" + id + "/", listing_title: "2010 Porsche 911 Carrera 4S Cabriolet 6-Speed", make: "Porsche", model: "911", year: 2010, vin_norm: "WP0CB2A93AS755555", mileage: 41000, transmission: "Manual", exterior_color: "Black", status: "live", end_time: iso(NOW + 30 * HOUR), first_seen: iso(NOW - 3 * HOUR), current_bid_usd: 62000, currency: "USD", country: "US", location: "Tampa, FL", photo_url: "https://example.com/p.jpg", ...over });
const user = { userId: "bbbbbbbb-0000-4000-8000-000000000001", email: null };
const env = { mem: T.memStore() };
const draft = { kind: "hunt", filters: { make: "Porsche", model: "911", gearbox: "manual", colour: "black" }, words: "black manual Porsches", summary: "Sam is looking for black manual Porsches." };
const A = car(501);
const opts = { rows: [A], testDrafts: ["Sam found 1 car that matches right now. Open the Task to see it."] };

// ---- setup: the opening read shows the car
const st = await T.startDraft(env, user, draft, opts);
ok(st.task && st.task.state === "running", "the Task starts");
const fr = await T.firstRun(env, user, st.task.id, opts);
const task0 = await T.getTask(env, st.task.id);
const ups0 = await T.taskUpdates(env, st.task.id);
const open = ups0.find(u => u.kind === "match" && u.data && u.data.opening);
ok(open && open.data.total === 1 && (open.data.cards || []).some(c => Number(c.id) === 501), "the opening read shows the car (" + (open ? open.data.total : "no opening") + ")");
ok((task0.reported_ids || []).map(Number).includes(501), "the car shown at setup is in the Task's seen set");
ok(open && open.email_status !== "queued" && !(open.data && (open.data.email_ids || open.data.email_cards)), "the opening update is not queued for email and carries no first-email car list (" + (open && open.email_status) + ")");

// ---- a later check: the same car again, then the same car relisted under a new id
const run1 = await T.runTasks(env, { taskId: st.task.id, rows: [A], now: iso(NOW + 5 * HOUR), test: false, testDrafts: opts.testDrafts });
ok(!(run1.report[0] && run1.report[0].matched), "a later check with the same listing reports no new car");
const B = car(777, { source_listing_id: "bat-777", url: "https://bringatrailer.com/listing/porsche-relist/", first_seen: iso(NOW + 4 * HOUR) });
const seenRows = [{ id: 501, vin_norm: A.vin_norm }];
const run2 = await T.runTasks(env, { taskId: st.task.id, rows: [A, B], seenRows, now: iso(NOW + 6 * HOUR), testDrafts: opts.testDrafts });
const ups2 = await T.taskUpdates(env, st.task.id);
ok(!(run2.report[0] && run2.report[0].matched) && !ups2.some(u => u.kind === "match" && !(u.data && u.data.opening)), "the same car relisted under a new id is not reported as new");
const C = car(888, { vin_norm: "WP0CB2A93AS766666", source_listing_id: "bat-888", url: "https://bringatrailer.com/listing/porsche-other/", first_seen: iso(NOW + 7 * HOUR) });
const run3 = await T.runTasks(env, { taskId: st.task.id, rows: [A, B, C], seenRows, now: iso(NOW + 8 * HOUR), testDrafts: ["Sam found 1 new car. Open the Task to see it."] });
ok(run3.report[0] && run3.report[0].matched === 1, "a different car that appears after setup is still reported (" + JSON.stringify(run3.report[0]) + ")");
ok(T.splitSeen([{ r: B }, { r: C }], seenRows).repeats.length === 1 && T.splitSeen([{ r: { id: 9, vin_norm: null } }], seenRows).fresh.length === 1, "splitSeen: a VIN match is a repeat, a car with no VIN is judged by its id alone");

// ---- the combined email
function digestIo(updates, tasks) {
  const sends = [], marks = [];
  return { sends, marks, io: { queuedUpdates: () => updates, tasks: () => tasks, watchUsers: () => [], watchesFor: () => [], watches: () => [], patchUpdate: (id, p) => { marks.push([id, p.email_status]); },
    liveSlim: ids => ids.map(id => ({ id, end_time: iso(NOW + 30 * HOUR), status: "live" })), liveRows: ids => ids.map(id => car(id)), prefs: () => ({ on: true, email: "buyer@example.com", every: "daily" }), targets: () => [{ channel: "email", to: "buyer@example.com" }],
    sentToday: () => 0, lastSent: () => null, recordSent: () => {}, blocks: (rows, cards) => cards.map(c => ({ id: c.id, car: c.title || "Car " + c.id, cardText: `Car ${c.id}\nView: https://example.com/${c.id}`, cardHtml: `<div data-car="${c.id}">Car ${c.id}</div>`, cardHead: "" })), pendingEvents: () => [], markWatch: () => {},
    first: () => false, send: m => { sends.push(m); return { ok: true }; }, armedAlerts: () => [], alertFacts: () => null, claimAlert: async () => false, finishAlert: () => {}, markAlert: () => {}, alertMessage: () => null } };
}
const taskRow = { id: st.task.id, user_id: user.userId, email: "buyer@example.com", channels: ["inapp", "email"], summary: draft.summary, filters: draft.filters, state: "running", words: draft.words, kind: "hunt" };
// 1. an opening update queued the old way (before this rule) is never emailed, and is marked
{ const q = [{ id: 1, task_id: taskRow.id, kind: "match", email_status: "queued", listing_ids: [501], created_at: iso(NOW), data: { opening: true, total: 1, cards: [{ id: 501, title: "2010 Porsche 911" }], email_ids: [501], email_cards: [{ id: 501, title: "2010 Porsche 911" }] } }];
  const d = digestIo(q, [taskRow]); const rep = await D.runDigest({}, { io: d.io, now: iso(NOW) });
  ok(d.sends.length === 0 && rep.sent === 0, "an opening update queued before this rule sends no email");
  ok(d.marks.some(m => m[0] === 1 && m[1] === "setup"), "and it is marked as shown at setup"); }
// 2. the opening plus a real new car: one email, with the new car only
{ const q = [{ id: 1, task_id: taskRow.id, kind: "match", email_status: "queued", listing_ids: [501], created_at: iso(NOW), data: { opening: true, total: 1, cards: [{ id: 501, title: "SETUPCAR" }], email_ids: [501] } },
             { id: 2, task_id: taskRow.id, kind: "match", email_status: "queued", listing_ids: [888], created_at: iso(NOW + HOUR), data: { cards: [{ id: 888, title: "NEWCAR" }] } }];
  const d = digestIo(q, [taskRow]); await D.runDigest({}, { io: d.io, now: iso(NOW) });
  const body = d.sends[0] ? d.sends[0].text + d.sends[0].html : "";
  ok(d.sends.length === 1 && /Car 888/.test(body) && !/Car 501/.test(body), "an email goes with the car that appeared after setup, and not the car shown at setup"); }
// 3. nothing new: no email
{ const d = digestIo([], [taskRow]); const rep = await D.runDigest({}, { io: d.io, now: iso(NOW) }); ok(d.sends.length === 0 && rep.sent === 0, "nothing new sends no email"); }

// ---- the status rewrite keeps the opening update's list correct
{ const e2 = { mem: T.memStore() }; const s2 = await T.startDraft(e2, { ...user, userId: "bbbbbbbb-0000-4000-8000-000000000002" }, draft, opts); await T.firstRun(e2, { ...user, userId: "bbbbbbbb-0000-4000-8000-000000000002" }, s2.task.id, opts);
  const before = (await T.taskUpdates(e2, s2.task.id)).find(u => u.data && u.data.opening);
  ok(Array.isArray(before.listing_ids) && before.listing_ids.length === 1, "before a rewrite the opening update holds its own list");
  await e2.mem.patchStatus(s2.task.id, "Nothing black yet. 3 other cars match the rest.", { opening: true, edit: false, total: 0, loose: { dropped: "colour", count: 3 } });
  const after = (await T.taskUpdates(e2, s2.task.id)).find(u => u.data && u.data.opening);
  ok(after.data.total === 0 && Array.isArray(after.listing_ids) && after.listing_ids.length === 0, "after a rewrite to a status line its list is empty too, no stale cars");
  ok(((await T.getTask(e2, s2.task.id)).reported_ids || []).map(Number).includes(501), "and the car stays in the Task's seen set"); }

// ---- the ending reminder stays: the car shown at setup, asked about before bidding ends, still gets its own email, labelled
{ const endAt = new Date(NOW + 90 * 60e3), alert = { id: 1, user_id: user.userId, email: "buyer@example.com", listing_id: 501, armed_at: iso(NOW - HOUR), sent_at: null };
  const sent = [];
  const io = { armedAlerts: () => (alert.sent_at ? [] : [alert]), liveRows: ids => ids.map(id => ({ id, end_time: endAt.toISOString(), url: "https://bringatrailer.com/listing/porsche-501/", source: "bringatrailer" })),
    prefs: () => ({ on: true, email: "buyer@example.com", every: "daily" }), targets: () => [{ channel: "email", to: "buyer@example.com" }],
    claimAlert: () => { if (alert.sent_at) return false; alert.sent_at = iso(NOW); return true; }, finishAlert: () => {}, markAlert: () => {},
    alertFacts: () => ({ name: "2010 Porsche 911 Carrera 4S Cabriolet", house: "Bring a Trailer", bid: 61500, bidAt: iso(NOW - 600e3), soldLine: null }),
    first: () => false, send: m => { sent.push(m); return { ok: true }; }, sentToday: () => 0, lastSent: () => null, recordSent: () => {} };
  await D.runBeforeItEnds({}, { io, now: new Date(NOW) });
  ok(sent.length === 1 && /^Before it ends:/.test(sent[0].subject), "the car shown at setup still gets its Before it ends email, labelled as one (" + (sent[0] && sent[0].subject) + ")"); }
console.log(`tasksSeenCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
