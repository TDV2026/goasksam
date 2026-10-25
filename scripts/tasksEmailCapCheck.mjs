// HOW MANY CARS ONE TASK EMAIL SHOWS (Lane D, Oct 24 2026, Sam's order). The REAL runDigest over an in-memory io, no network, no send:
// a day-one Task with 45 matches (the first email shows the 5 cars ending soonest and "40 more cars match. Open the Task to see them."),
// a day-two email with 8 new cars (6 shown, ending soonest first, "2 more new cars. ..."), the sentence written once (lib/tasks/emailCaps.js),
// every email well under 100KB, the start email's Open link the same black as the others, and every send going through io.send
// (sendTaskEmail in production). node scripts/tasksEmailCapCheck.mjs
process.env.TASK_LINK_SECRET = "fixture-only";
const { runDigest } = await import("../lib/tasks/digest.js");
const { moreCarsLine, FIRST_EMAIL_CARS, LATER_EMAIL_CARS } = await import("../lib/tasks/emailCaps.js");
const { sendStartEmail, memStore } = await import("../lib/tasks/tasks.js");
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL  " + m); } };
const now = new Date("2026-10-24T15:00:00Z"), hours = h => new Date(now.getTime() + h * 3600e3).toISOString();
const TASK = { id: "00000000-0000-4000-8000-0000000000aa", user_id: "aaaaaaaa-0000-4000-8000-000000000001", email: "p@example.com", channels: ["inapp", "email"], summary: "Sam is looking for black manual BMWs.", filters: { make: "BMW" }, state: "running", kind: "hunt" };
const car = (id, h) => ({ id, end: hours(h), row: { id, end_time: hours(h), status: "live", listing_title: `Car ${id}`, source: "bringatrailer", url: "https://example.com/" + id } });
function run(updates, cars) {
  const sends = [], marks = [], reads = { slim: [], full: [] };
  const io = {
    queuedUpdates: () => updates, tasks: () => [TASK], watchUsers: () => [], watchesFor: () => [], watches: () => [],
    prefs: () => ({ on: true, email: "p@example.com", every: "daily" }), targets: () => [{ channel: "email", to: "p@example.com" }],
    lastSent: () => null, sentToday: () => 0, first: () => false, recordSent: () => {}, pendingEvents: () => [],
    liveSlim: ids => { reads.slim.push(ids.length); return ids.map(i => cars[i] && cars[i].row).filter(Boolean); },
    liveRows: ids => { reads.full.push(ids.length); return ids.map(i => cars[i] && cars[i].row).filter(Boolean); },
    // a stand-in card of a realistic size (about 8KB of markup each), so the size check is meaningful
    blocks: (rows, cards) => cards.map(c => ({ id: c.id, car: c.title || "Car " + c.id, cardText: `${c.title || "Car " + c.id}\nView on Bring a Trailer: https://example.com/${c.id}`, cardHtml: `<div data-car="${c.id}">${"x".repeat(8000)}</div>`, cardHead: "" })),
    patchUpdate: (id, p) => { marks.push([id, p.email_status]); }, markAlert: () => {}, markWatch: () => {},
    send: m => { sends.push(m); return { ok: true }; }
  };
  return runDigest({}, { io, now, withMail: true }).then(r => ({ r, sends, marks, reads }));
}
// Day one: 45 matches, ids deliberately not in end order (car 44 ends first).
const cars1 = {}; for (let i = 0; i < 45; i++) cars1[i] = car(i, 1 + (44 - i));
const opening = { id: 1, task_id: TASK.id, kind: "match", email_status: "queued", created_at: hours(-1), listing_ids: [...Array(45).keys()],
  data: { opening: true, total: 45, cards: [...Array(12).keys()].map(i => ({ id: i, title: `Car ${i}` })), email_ids: [...Array(45).keys()].sort((a, b) => b - a), email_cards: [...Array(15).keys()].map(i => ({ id: 44 - i, title: `Car ${44 - i}` })) } };
{ const { sends, reads } = await run([opening], cars1); const m = sends[0] || { text: "", html: "" };
  const shownIds = [...m.html.matchAll(/data-car="(\d+)"/g)].map(x => Number(x[1]));
  ok(sends.length === 1, "day one: one email");
  ok(shownIds.length === FIRST_EMAIL_CARS && shownIds.join() === "44,43,42,41,40", `day one: the 5 cars ending soonest, soonest first (${shownIds})`);
  ok(m.text.includes("40 more cars match. Open the Task to see them.") && m.html.includes("40 more cars match. Open the Task to see them."), "day one: the 'more' line, 40 in the text and the html");
  ok(Buffer.byteLength(m.html) < 100000 && Buffer.byteLength(m.text) < 100000, `day one: well under 100KB (${Buffer.byteLength(m.html)} bytes of html)`);
  ok(reads.full[0] === 5 && reads.slim[0] === 45, `day one: the slim read counts all 45, the full read is only the 5 shown (${reads.slim}, ${reads.full})`);
  ok(!/\s[—–]\s|—|–/.test(m.text.replace(/·/g, "")), "day one: no em or en dashes in the email text"); }
// Day two: 8 new cars in a later update.
const cars2 = {}; for (let i = 100; i < 108; i++) cars2[i] = car(i, 2 + (i - 100));
const later = { id: 2, task_id: TASK.id, kind: "match", email_status: "queued", created_at: hours(-1), data: { cards: [...Array(8).keys()].reverse().map(i => ({ id: 100 + i, title: `Car ${100 + i}` })) } };
{ const { sends } = await run([later], cars2); const m = sends[0] || { text: "", html: "" };
  const shownIds = [...m.html.matchAll(/data-car="(\d+)"/g)].map(x => Number(x[1]));
  ok(shownIds.length === LATER_EMAIL_CARS && shownIds.join() === "100,101,102,103,104,105", `day two: 6 of 8 new cars, soonest first (${shownIds})`);
  ok(m.text.includes("2 more new cars. Open the Task to see them.") && Buffer.byteLength(m.html) < 100000, "day two: the 'more' line and under 100KB"); }
// Fewer than the cap: no 'more' line; a car that ended before the send is not counted or shown.
{ const cars3 = { 100: car(100, 3), 101: car(101, -1) }; const u = { ...later, data: { cards: [{ id: 100, title: "Car 100" }, { id: 101, title: "Car 101" }] } };
  const { sends } = await run([u], cars3); const m = sends[0] || { text: "" };
  ok(!/more/.test(m.text.split("The Task")[0] || "") && (m.html.match(/data-car=/g) || []).length === 1, "an ended car is left out and nothing says more when nothing is left over"); }
ok(moreCarsLine(0, true) === "" && moreCarsLine(1, true) === "1 more car matches. Open the Task to see it." && moreCarsLine(1, false) === "1 more new car. Open the Task to see it.", "the sentence handles none and one");
// The start email: its Open link is the same black as Pause and Stop.
{ const env = { mem: memStore() }; const sent = [];
  const realFetch = globalThis.fetch; globalThis.fetch = async () => new Response("{}", { status: 200 });
  const r = await sendStartEmail(env, { ...TASK }, null, { to: "feedback@goasksam.com", test: true }).catch(e => ({ err: e.message })); globalThis.fetch = realFetch;
  const src = (await import("node:fs")).readFileSync(new URL("../lib/tasks/tasks.js", import.meta.url), "utf8");
  ok(/color:#1A1A1A;white-space:nowrap">Open the Task<\/a>/.test(src), "the start email's Open the Task link is #1A1A1A like Pause and Stop"); }
console.log(`tasksEmailCapCheck: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
