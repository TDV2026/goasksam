// THE TASK EMAIL EXAMPLE (Lane B, Nov 8 2026, crew only, not live): tasksEmailExample(env, req) hands Lane E the block the Task email template renders for one car, read from a STORED Task update and built by the template's own function
// (taskEmailBlocks), never composed or invented here. The preferred update is the 1995 BMW M3 Coupe on Bring a Trailer (last bid seen $1,000, 147,000 miles, West New York NJ, "Matches your Task: a BMW from 1995."); when it has aged out the
// most recent real match update stands in (source "latest"); with none, null.
//   (1) preferred: the block is exactly what taskEmailBlocks gives for that update (the card html and text, the bid line as of the update's time, the venue, the end), plus the email's reason line and subject
//   (2) aged out: the latest real match update whose car can be read; a car whose card cannot be read, a Task with no criteria and a listing that is gone are skipped, never filled in
//   (3) none: null. (4) crew gate and kill switch, no user, email or Task id in the answer, zero metered OldCarsData
//   node scripts/tasksEmailExampleCheck.mjs [root]      --mutants proves each rule by breaking it in a copy
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { fileURLToPath, pathToFileURL } from "node:url"; import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), rootArg = args.find(a => !a.startsWith("--")), ROOT = path.resolve(rootArg || path.join(here, ".."));
if (args.includes("--mutants")) {
  const TD = "lib/live/tasksDemo.js", FE = "lib/live/findExamples.js";
  const muts = [
    [TD, "if (process.env.TASKS_DEMO === \"0\" || !isCrewRequest(reqOrCookie)) return null;\n  const ups = await", "if (process.env.TASKS_DEMO === \"0\") return null;\n  const ups = await", "(4) no cookie: the email example"],
    [TD, "const [b] = await Promise.resolve(blocksOf(env, rows, [c], at))", "const [b] = await Promise.resolve(blocksOf(env, rows, [c], new Date()))", "(1) the bid is worded as of today, not as the email read"],
    [TD, "const c = cardsOf(u).find(EMAIL_EXAMPLE_PREFERRED);", "const c = cardsOf(u)[0];", "(1) any car is the preferred one"],
    [TD, "const why = T.matchReasonLine(task.filters, c, b.bid);", "const why = \"Matches your Task.\";", "(1) the reason line is typed, not the email's"],
    [TD, "if (!b || !b.cardHtml || !b.cardText) continue;", "if (!b) continue;", "(2) a car whose card cannot be read is shown"],
    [TD, "block: { ...b, card: c } };\n  }\n  return null;\n}", "block: { ...b, card: c } };\n  }\n  return { source: \"latest\", update: { id: 0, at: new Date().toISOString() }, subject: \"Sam found a 1995 BMW M3, live now\", why: \"Matches your Task: a BMW from 1995.\", block: { id: 1, car: \"A 1995 BMW M3.\", cardHtml: \"<table></table>\", cardText: \"1995 BMW M3\" } };\n}", "(3) an invented example when nothing is stored"],
    [TD, "update: { id: u.id, at: at.toISOString() }, subject: T.taskEmailSubject([c]), why, block: { ...b, card: c } };", "update: { id: u.id, at: at.toISOString(), task: u.task_id }, subject: T.taskEmailSubject([c]), why, block: { ...b, card: c } };", "(4) the Task's id is returned"],
    [TD, "const ups = await d.select(env, \"task_updates?kind=eq.match&role=eq.sam&", "const ups = await d.select(env, \"task_updates?kind=eq.match&role=eq.user&", "(3) the stored update is read from the wrong rows"]
  ];
  let survivors = 0;
  for (const [file, from, to, want] of muts) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tee-"));
    spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", ROOT + "/", dir + "/"]); fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"));
    const fp = path.join(dir, file), src = fs.readFileSync(fp, "utf8"), m = src.replace(from, to);
    if (m === src) { console.log(`MUTANT NOT APPLIED  ${want}`); survivors++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
    fs.writeFileSync(fp, m);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/tasksEmailExampleCheck.mjs"), dir], { encoding: "utf8" }), killed = r.status !== 0;
    console.log(`${killed ? "killed  " : "SURVIVED"}  ${want}`); if (!killed) survivors++;
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(survivors ? `\n${survivors} mutant(s) survived` : "\nall mutants killed"); process.exit(survivors ? 1 : 0);
}
process.chdir(ROOT);
process.env.CURTAIN_CREW_CODE = "tee-check-secret"; process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
let metered = 0, listings = [];
globalThis.fetch = async u => { const s = decodeURIComponent(String(u)); if (/oldcarsdata\.com\/auctions/.test(s)) metered++; const m = /live_listings\?id=in\.\(([^)]*)\)/.exec(s); if (m) { const ids = m[1].split(","); return new Response(JSON.stringify(listings.filter(r => ids.includes(String(r.id)))), { status: 200 }); } return new Response("[]", { status: 200 }); };
let failed = 0, n = 0; const ok = (name, c, d) => { n++; if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${d ? "  " + d : ""}`); };
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const TD = await imp("lib/live/tasksDemo.js"), T = await imp("lib/tasks/tasks.js"), C = await imp("lib/_crew.js");
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
const CREW = "gas_crew=" + C.mintCrewCookieValue(), AT = Date.parse("2026-11-07T18:00:00Z");
const row = (id, title, o = {}) => ({ id, source: "bringatrailer", url: "https://bringatrailer.com/listing/x" + id + "/", listing_title: title, year: Number(title.slice(0, 4)), make: title.split(" ")[1], model: title.split(" ")[2], vin_norm: "WBSAB93" + String(id).padStart(10, "0"), mileage: 147000, mileage_unit: "miles", current_bid: 1000, current_bid_usd: 1000, currency: "USD", bid_at: new Date(AT - 20 * 60e3).toISOString(), location: "West New York, NJ", country: "US", transmission: "Manual", exterior_color: "Black", photo_url: "https://img.example/m3-" + id + ".jpg", end_time: new Date(AT + 6 * 36e5).toISOString(), status: "live", ...o });
const card = (r, o = {}) => ({ id: r.id, title: r.listing_title, year: r.year, colour: "Black", gearbox: "manual", miles: r.mileage, km: null, distance_miles: null, location: r.location, house: "Bring a Trailer", url: r.url, vin: r.vin_norm, ...o });
const M3 = row(501, "1995 BMW M3 Coupe"), OTHER = row(502, "1999 Porsche 911 Carrera", { current_bid_usd: 52000, current_bid: 52000, mileage: 61000, location: "Austin, TX" }), BROKEN = row(503, "2001 Audi S4", { photo_url: null });
const upd = (id, taskId, at, c) => ({ id, task_id: taskId, created_at: new Date(at).toISOString(), data: { cards: [c] } });
const filtersBMW = { make: "BMW", year_min: 1995, year_max: 1995 }, filtersPorsche = { make: "Porsche", year_min: 1999, year_max: 2005 };
function world({ updates, tasks, rows }) {
  listings = rows;
  return { now: () => AT + 60 * 60e3, select: async (e, q) => {
    if (/^task_updates\?/.test(q)) return /kind=eq\.match/.test(q) && /role=eq\.sam/.test(q) ? updates : [];
    let m = /^tasks\?id=eq\.([^&]+)/.exec(q); if (m) return tasks[decodeURIComponent(m[1])] ? [{ filters: tasks[decodeURIComponent(m[1])] }] : [];
    m = /^live_listings\?id=eq\.([^&]+)/.exec(q); if (m) return rows.filter(r => String(r.id) === decodeURIComponent(m[1])).slice(0, 1);
    return []; } };
}
const TASKS = { tA: filtersBMW, tB: filtersPorsche };
{ // (1) preferred
  const updates = [upd("u3", "tB", AT + 3 * 36e5, card(OTHER)), upd("u2", "tA", AT, card(M3)), upd("u1", "tB", AT - 36e5, card(OTHER))];
  const w = world({ updates, tasks: TASKS, rows: [M3, OTHER] }), got = await TD.tasksEmailExample(env, CREW, w);
  ok("(1) the 1995 BMW M3 Coupe update is the example (source preferred), though a newer update exists", got && got.source === "preferred" && got.update.id === "u2", JSON.stringify(got && got.update));
  ok("(1) the email's reason line: Matches your Task: a BMW from 1995.", got && got.why === "Matches your Task: a BMW from 1995.", got && got.why);
  ok("(1) the subject is the email's: Sam found a 1995 BMW M3 Coupe, live now", got && got.subject === "Sam found a 1995 BMW M3 Coupe, live now", got && got.subject);
  const b = got && got.block;
  ok("(1) the block carries the card's html and text (Find's own card in the email's layout) and the cardHead style", b && typeof b.cardHtml === "string" && b.cardHtml.length > 200 && typeof b.cardText === "string" && b.cardText.length > 20 && b.cardHead, b && (b.cardText || "").slice(0, 120));
  ok("(1) Bring a Trailer, 147,000 miles, West New York in the block's own words", b && b.venue === "Bring a Trailer" && /147,000 miles/.test(b.car + " " + b.cardText) && /West New York/.test(b.car + " " + b.cardText), b && b.car);
  ok("(1) the bid is worded as the email read at the update's time: the last bid seen was $1,000", b && /last bid seen was \$1,000/i.test(String(b.bidLine || "") + " " + String(b.lines || "") + " " + String(b.cardText)), b && JSON.stringify([b.bidLine, b.lines]));
  const direct = (await T.taskEmailBlocks(env, [M3], [card(M3)], new Date(AT)))[0];
  ok("(1) the block is exactly what the template's own function gives for that update (no field added, none left out) plus the card", b && JSON.stringify({ ...b, card: undefined }) === JSON.stringify({ ...direct, card: undefined }) && b.card.id === 501);
  ok("(4) no user, email or Task id anywhere in the answer", got && (function walk(o) { return !o || typeof o !== "object" || Object.entries(o).every(([k, v]) => !/^(user_id|task_id|task|email|user)$/.test(k) && v !== "tA" && v !== "tB" && walk(v)); })(got), JSON.stringify(got && got.update));
}
{ // (2) aged out
  const updates = [upd("u9", "tB", AT + 2 * 36e5, card(BROKEN, { id: 777 })), upd("u8", "tB", AT + 36e5, card(OTHER)), upd("u7", "tB", AT, card(OTHER, { id: 999 }))];
  const w = world({ updates, tasks: TASKS, rows: [OTHER] }), got = await TD.tasksEmailExample(env, CREW, w);
  ok("(2) no 1995 M3 update: the most recent real update whose car can be read (source latest), skipping a gone listing", got && got.source === "latest" && got.update.id === "u8" && got.block.card.id === 502, JSON.stringify(got && [got.source, got.update]));
  ok("(2) its reason line is the email's for its own Task", got && got.why === "Matches your Task: a Porsche from 1999.", got && got.why);
  const gone = await TD.tasksEmailExample(env, CREW, world({ updates: [upd("u1", "tB", AT, card(OTHER))], tasks: {}, rows: [OTHER] }));
  ok("(2) a Task with no criteria on file is skipped, nothing filled in", gone === null);
  const noRow = await TD.tasksEmailExample(env, CREW, world({ updates: [upd("u1", "tB", AT, card(OTHER))], tasks: TASKS, rows: [] }));
  ok("(2) a listing that is gone is skipped", noRow === null);
}
{ // (3) none, (4) gates
  ok("(3) no stored update: null, nothing invented", (await TD.tasksEmailExample(env, CREW, world({ updates: [], tasks: TASKS, rows: [M3] }))) === null);
  ok("(2) a car whose email card cannot be built is skipped, never shown thin", (await TD.tasksEmailExample(env, CREW, { ...world({ updates: [upd("u2", "tA", AT, card(M3))], tasks: TASKS, rows: [M3] }), blocks: async () => [{ id: 501, car: "A 1995 BMW M3." }] })) === null);
  ok("(3) an unreadable store: null", (await TD.tasksEmailExample(env, CREW, { now: () => AT, select: async () => null })) === null);
  const w = world({ updates: [upd("u2", "tA", AT, card(M3))], tasks: TASKS, rows: [M3] });
  ok("(4) crew gate: no cookie, a plain gas_crew=ok, a forged cookie: null", (await TD.tasksEmailExample(env, "", w)) === null && (await TD.tasksEmailExample(env, "gas_crew=ok", w)) === null && (await TD.tasksEmailExample(env, "gas_crew=v1.9999999999.forged", w)) === null);
  process.env.TASKS_DEMO = "0"; ok("(4) kill switch TASKS_DEMO=0: null", (await TD.tasksEmailExample(env, CREW, w)) === null); delete process.env.TASKS_DEMO;
  ok("(4) zero metered OldCarsData", metered === 0, "calls " + metered);
}
console.log("\ntasksEmailExampleCheck: " + (n - failed) + " pass, " + failed + " FAIL"); process.exit(failed ? 1 : 0);
