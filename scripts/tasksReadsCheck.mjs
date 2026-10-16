// Tasks read reductions (Lane D, Oct 2026, Sam's job): the send run reads only the people due and the cars inside
// the window. No network, no email. Over one fixture day of quarter-hour send runs (as the cron), the SAME fixture
// is run twice: through the legacy io (whole watches table, every armed car's full live row) and through the slim
// io (watchUsers + watchesFor, liveSlim + liveRows), with the real runBeforeItEnds and runDigest. Exits 1 if the two
// runs differ in any email, mark or report line, or if the slim run reads more than it should.
//   node scripts/tasksReadsCheck.mjs
// Run by scripts/prePush.mjs.
process.env.TASK_LINK_SECRET = "fixture-only";
const { runBeforeItEnds, runDigest } = await import("../lib/tasks/digest.js");

const DAY = "2026-10-14";
const pt = (hh, mm) => new Date(`${DAY}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00-07:00`);
const U = { daily: "aaaaaaaa-0000-4000-8000-000000000001", instant: "bbbbbbbb-0000-4000-8000-000000000002", off: "cccccccc-0000-4000-8000-000000000003", quiet: "dddddddd-0000-4000-8000-000000000004" };
const prefs = { [U.daily]: { on: true, email: "feedback+daily@goasksam.com", every: "daily" }, [U.instant]: { on: true, email: "feedback+instant@goasksam.com", every: "instant" }, [U.off]: { on: false, email: "feedback+off@goasksam.com", every: "daily" }, [U.quiet]: { on: true, email: "feedback+quiet@goasksam.com", every: "daily" } };
const CARS = { 101: pt(6, 30), 102: pt(9, 0), 103: pt(13, 0), 104: pt(23, 0), 105: pt(13, 30) };
const WATCH_COLS = ["id", "user_id", "kind", "key", "label", "spec", "baseline_date", "created_at", "last_event_at", "last_event", "last_sent_at", "paused_at"];

function fixture() {
  let n = 0;
  const alert = (user, listing, armedAt) => ({ id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, user_id: user, listing_id: listing, armed_at: armedAt || pt(0, 0), sent_at: null, send_status: null });
  const alerts = [alert(U.daily, 101), alert(U.daily, 102), alert(U.daily, 103), alert(U.daily, 104), alert(U.instant, 101), alert(U.instant, 103), alert(U.instant, 104), alert(U.off, 102), alert(U.off, 104), alert(U.daily, 105, pt(12, 20))];
  // Watches: the daily person (due at 08:00), the instant person (due every run), the emails-off person, and a paused one.
  const watch = (user, id, extra) => ({ id, user_id: user, email: "someone-else@example.com", kind: "spec", key: `{"k":"${id}"}`, label: `Watch ${id}`, spec: { title: `Watch ${id}` }, baseline_date: "2026-10-01", created_at: pt(0, 0).toISOString(), last_event_at: null, last_event: null, last_sent_at: null, stopped_at: null, paused_at: null, ...extra });
  const watches = [watch(U.daily, "w-daily"), watch(U.instant, "w-instant"), watch(U.off, "w-off"), watch(U.quiet, "w-quiet-paused", { paused_at: pt(0, 0).toISOString() })];
  const state = { alerts, watches, sends: [], digests: [], marks: [], watchMarks: [], reads: { liveRows: [], liveSlim: [], watchUsers: 0, watches: 0, watchesFor: [] }, clock: null, eventsSent: new Set() };
  const live = ids => ids.map(id => CARS[id] ? { id, end_time: CARS[id].toISOString() } : null).filter(c => c && Date.parse(c.end_time) > state.clock.getTime());
  const base = {
    armedAlerts: () => state.alerts.filter(a => !a.sent_at && Date.parse(a.armed_at) <= state.clock.getTime()),
    liveRows: ids => { state.reads.liveRows.push({ at: state.clock.toISOString(), ids: ids.slice() }); return live(ids).map(c => ({ ...c, url: `https://example.com/listing/${c.id}`, source: "bringatrailer", description: "x".repeat(2000) })); },
    prefs: uid => prefs[uid], targets: uid => [{ channel: "email", to: prefs[uid].email }],
    claimAlert: id => { const a = state.alerts.find(x => x.id === id); if (!a || a.sent_at) return false; a.sent_at = state.clock.toISOString(); a.send_status = "sending"; return true; },
    finishAlert: (id, status, release) => { const a = state.alerts.find(x => x.id === id); a.send_status = status; if (release) a.sent_at = null; },
    markAlert: (id, status) => { const a = state.alerts.find(x => x.id === id); if (!a.sent_at) { a.sent_at = state.clock.toISOString(); a.send_status = status; state.marks.push(`${state.clock.toISOString()} ${id} ${status}`); } },
    alertFacts: row => ({ name: `Car ${row.id}`, house: "Bring a Trailer", bid: 61500, bidAt: new Date(state.clock.getTime() - 10 * 60e3).toISOString(), soldLine: null, rungLines: [], placing: null, sameCar: null, url: row.url }),
    first: () => false,
    send: m => { state.sends.push({ at: state.clock.toISOString(), to: m.to, subject: m.subject }); return { ok: true }; },
    queuedUpdates: () => [], tasks: () => [], patchUpdate: () => {}, blocks: () => [],
    // One unsent event per watch per day, sent once (the digest marks it).
    pendingEvents: w => state.eventsSent.has(w.id) ? [] : [{ key: `${w.id}-ev1`, date: "2026-10-13", kind: "sale" }],
    markWatch: (w, evs, status) => { state.eventsSent.add(w.id); state.watchMarks.push(`${state.clock.toISOString()} ${w.id} ${status} ${evs.length}`); },
    sentToday: () => 0, lastSent: uid => { const s = state.digests.filter(d => d.to === prefs[uid].email).pop(); return s ? Date.parse(s.at) : null; }, recordSent: () => {}
  };
  const legacy = { ...base, watches: () => { state.reads.watches++; return state.watches.filter(w => !w.stopped_at); } };
  const slim = { ...base,
    watchUsers: () => { state.reads.watchUsers++; return state.watches.filter(w => !w.stopped_at && !w.paused_at).map(w => ({ user_id: w.user_id })); },
    watchesFor: uid => { state.reads.watchesFor.push(`${state.clock.toISOString()} ${uid}`); return state.watches.filter(w => !w.stopped_at && !w.paused_at && w.user_id === uid).map(w => Object.fromEntries(WATCH_COLS.map(k => [k, w[k]]))); },
    liveSlim: ids => { state.reads.liveSlim.push({ at: state.clock.toISOString(), ids: ids.slice() }); return live(ids).map(c => ({ ...c, status: "live" })); }
  };
  return { state, legacy, slim };
}
async function day(io, state, withDigest) {
  const reports = [];
  for (let h = 0; h < 24; h++) for (const m of [10, 25, 40, 55]) {
    state.clock = pt(h, m);
    const r1 = await runBeforeItEnds({}, { io, now: state.clock });
    const io2 = { ...io, send: m2 => { state.digests.push({ at: state.clock.toISOString(), to: m2.to, subject: m2.subject }); return { ok: true }; } };
    const r2 = await runDigest({}, { io: io2, now: state.clock });
    reports.push({ at: state.clock.toISOString(), bie: { sent: r1.sent, notYet: r1.notYet, off: r1.off, ended: r1.ended, failed: r1.failed }, digest: { people: r2.people, sent: r2.sent, notDue: r2.notDue, emailOff: r2.emailOff, matches: r2.matches } });
  }
  return reports;
}
const A = fixture(), B = fixture();
const ra = await day(A.legacy, A.state), rb = await day(B.slim, B.state);
let fails = 0, passes = 0;
const ok = (c, what) => { if (c) passes++; else { fails++; console.log("FAIL  " + what); } };
const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
ok(same(ra, rb), "every quarter-hour report line equal (legacy io vs slim io)");
ok(same(A.state.sends, B.state.sends), `the same Before it ends emails (${A.state.sends.length})`);
ok(same(A.state.digests, B.state.digests), `the same Task emails (${A.state.digests.length})`);
ok(same(A.state.marks, B.state.marks), `the same alert marks (${A.state.marks.length})`);
ok(same(A.state.watchMarks, B.state.watchMarks), `the same watch marks (${A.state.watchMarks.length})`);
ok(A.state.sends.length >= 5 && A.state.digests.length >= 2, "the fixture exercises both paths (emails went)");
// The slim run reads less. Every full live read is for cars inside the two-hour window, not ended, owner emailing.
const WINDOW = 2 * 3600e3;
const badFull = B.state.reads.liveRows.filter(r => r.ids.some(id => { const end = CARS[id] ? CARS[id].getTime() : 0, t = Date.parse(r.at); return !(end > t && end - t <= WINDOW); }));
ok(badFull.length === 0, `full live rows read only inside the window (${badFull.length} reads outside: ${JSON.stringify(badFull.slice(0, 2))})`);
const offIds = new Set([102, 104].filter(() => true));   // cars armed ONLY by the emails-off person: none here (102/104 are also the daily person's)
ok(B.state.reads.liveRows.every(r => r.ids.length <= 3), "each full read carries at most the cars due in that run");
const fullIdsRead = B.state.reads.liveRows.reduce((n, r) => n + r.ids.length, 0), legacyIdsRead = A.state.reads.liveRows.reduce((n, r) => n + r.ids.length, 0);
ok(fullIdsRead < legacyIdsRead / 4, `full live rows read ${fullIdsRead} ids over the day against ${legacyIdsRead} before`);
ok(B.state.reads.liveSlim.length > 0 && B.state.reads.liveSlim.every(r => r.ids.length <= 5), "the slim read carries the armed ids");
ok(B.state.reads.watches === 0 && B.state.reads.watchUsers === 96, `the whole watches table is never read (watchUsers ${B.state.reads.watchUsers} of 96 runs)`);
const forOff = B.state.reads.watchesFor.filter(x => x.endsWith(U.off) || x.endsWith(U.quiet));
ok(forOff.length === 0, `no watch rows read for the emails-off or paused person (${forOff.length})`);
// The once-a-day person is due at 00:10 (no email yet, yesterday's 08:00 slot passed), sends then, and is not due
// again until the 08:00 slot; from 08:10 on they are due at every run (nothing new to send never resets the slot),
// so their rows are read on exactly those 65 runs and never in the 31 runs between (00:25 to 07:55).
const forDaily = B.state.reads.watchesFor.filter(x => x.endsWith(U.daily));
const between = forDaily.filter(x => { const t = Date.parse(x.slice(0, 24)); return t > pt(0, 10).getTime() && t < pt(8, 10).getTime(); });
ok(forDaily.length === 65 && between.length === 0, `the once-a-day person's watch rows read only on due runs (${forDaily.length} of 96, ${between.length} while not due)`);
console.log(`tasksReadsCheck: ${passes} passed, ${fails} failed; full live ids read ${legacyIdsRead} -> ${fullIdsRead}; watch table reads ${A.state.reads.watches} -> 0, per-person watch reads ${B.state.reads.watchesFor.length}`);
process.exit(fails ? 1 : 0);
