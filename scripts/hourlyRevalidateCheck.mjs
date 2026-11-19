// THE HOURLY REVALIDATION OF EVERY CREW EXAMPLE (Lane B, Nov 8 2026, per Sam): no example ever shows an ended auction as live. The Find pick and the watching card (findPickCheck, liveExamplesCheck) and now the Tasks example and the Homepage pick are confirmed live at least hourly by KEYED READS only:
//   (1) the Tasks example (revalidateTasksDemo): live and eligible -> the stamp moves, so it is served past the 90 minute limit, overnight too; ended, withdrawn, no longer eligible or unreadable -> the pick is cleared and tasksDemoField serves the fallback (the last proved car, ended) until a pull picks a new one
//   (2) the Homepage pick (revalidateFeaturedHistory): the same; a failed pick is absent (the Homepage has no fallback card)
//   (3) a revalidation reads no matcher, no search, no archive history and no OldCarsData; the choice of a new example stays in the pull
//   (4) the cron: the first quarter of every hour, with no live pull, runs both (api/pullLive.js)
//   (5) CLASS: every crew example reader that serves a stored live car has a revalidation (a new one fails until it has one or is named as without)
//   node scripts/hourlyRevalidateCheck.mjs [root]      --mutants proves each rule by breaking it in a copy
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { fileURLToPath, pathToFileURL } from "node:url"; import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), rootArg = args.find(a => !a.startsWith("--")), ROOT = path.resolve(rootArg || path.join(here, ".."));
if (args.includes("--mutants")) {
  const TD = "lib/live/tasksDemo.js", FH = "lib/live/featuredHistory.js", PL = "api/pullLive.js";
  const muts = [
    [TD, "if (!row || !liveNow(row, now) || !(Date.parse(st.field.car && st.field.car.endsAt) > now)) return await drop(\"ended\");", "if (!row) return await drop(\"ended\");", "(1) an ended Tasks example is kept"],
    [TD, "if (!eligibleRow(row, facts, now)) return await drop(\"not_eligible\");", "", "(1) a Tasks example that is no longer eligible is kept"],
    [TD, "if (row === null) return await drop(\"live_unreadable\");\n    if (!row || !liveNow", "if (row === null) return { stored: null, why: \"live_unreadable\" };\n    if (!row || !liveNow", "(1) an unreadable Tasks example is kept on a guess"],
    [TD, "const keep = { ...st, checkedAt: iso, field: { ...st.field, checkedAt: iso } };", "const keep = { ...st, field: { ...st.field } };", "(1) a confirmed Tasks example is not stamped, so it goes stale by the next hour"],
    [TD, "const row = await liveRow(env, st.listingId, d);\n    if (row === null) return await drop(\"live_unreadable\");\n    if (!row || !liveNow(row, now) || !(Date.parse(st.field.car", "await d.match(env, {}); const row = await liveRow(env, st.listingId, d);\n    if (row === null) return await drop(\"live_unreadable\");\n    if (!row || !liveNow(row, now) || !(Date.parse(st.field.car", "(3) the Tasks revalidation runs the matcher"],
    [FH, "if (!row || !liveNow(row, now) || !(Date.parse(st.featured.current && st.featured.current.endsAt) > now)) return await drop(\"ended\");", "if (!row) return await drop(\"ended\");", "(2) an ended Homepage pick is kept"],
    [FH, "if (!genuinePhoto(row.photo_url) || !/^https:", "if (false && !/^https:", "(2) a Homepage pick with no real photo is kept"],
    [FH, "if (!Array.isArray(rows)) return await drop(\"live_unreadable\");\n    const row = rows[0];", "if (!Array.isArray(rows)) return { stored: null, why: \"live_unreadable\" };\n    const row = rows[0];", "(2) an unreadable Homepage pick is kept on a guess"],
    [FH, "const keep = { ...st, checkedAt: iso };\n    await d.write(env, { key: STORE_KEY, value: keep });\n    return { stored: keep, why: \"confirmed\" };", "return { stored: st, why: \"confirmed\" };", "(2) a confirmed Homepage pick is not stamped, so it goes stale by the next hour"],
    [FH, "const rows = await d.select(env, `live_listings?id=eq.${encodeURIComponent(st.listingId)}&select=${LIVE_COLS}&limit=1`);\n    if (!Array.isArray(rows)) return await drop(\"live_unreadable\");", "await d.appearances(env, \"x\"); const rows = await d.select(env, `live_listings?id=eq.${encodeURIComponent(st.listingId)}&select=${LIVE_COLS}&limit=1`);\n    if (!Array.isArray(rows)) return await drop(\"live_unreadable\");", "(3) the Homepage revalidation reads the archive history"],
    [PL, "revalidated = await revalidateCrewWord(env); }", "}", "(4) the hourly slot does not revalidate the Tasks example and the Homepage pick"],
    [PL, "homepagePick: await refreshFeatured(env, \"revalidate\")", "homepagePick: \"skipped\"", "(4) the hourly slot skips the Homepage pick"],
    [PL, "tasksExample: await run(\"TASKS_DEMO\", \"../lib/live/tasksDemo.js\", \"revalidateTasksDemo\")", "tasksExample: \"skipped\"", "(4) the hourly slot skips the Tasks example"]
  ];
  let survivors = 0;
  for (const [file, from, to, want] of muts) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hrc-"));
    spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", ROOT + "/", dir + "/"]); fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"));
    const fp = path.join(dir, file), src = fs.readFileSync(fp, "utf8"), m = src.replace(from, to);
    if (m === src) { console.log(`MUTANT NOT APPLIED  ${want}`); survivors++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
    fs.writeFileSync(fp, m);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/hourlyRevalidateCheck.mjs"), dir], { encoding: "utf8" }), killed = r.status !== 0;
    console.log(`${killed ? "killed  " : "SURVIVED"}  ${want}`); if (!killed) survivors++;
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(survivors ? `\n${survivors} mutant(s) survived` : "\nall mutants killed"); process.exit(survivors ? 1 : 0);
}
process.chdir(ROOT);
process.env.CURTAIN_CREW_CODE = "hrc-check-secret"; process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
let metered = 0; globalThis.fetch = async u => { if (/oldcarsdata\.com\/auctions/.test(String(u))) metered++; return new Response("[]", { status: 200 }); };
let failed = 0, n = 0; const ok = (name, c, d) => { n++; if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${d ? "  " + d : ""}`); };
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const TD = await imp("lib/live/tasksDemo.js"), FH = await imp("lib/live/featuredHistory.js"), FE = await imp("lib/live/findExamples.js"), C = await imp("lib/_crew.js"), S = await imp("lib/live/search.js");
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
const NOW = Math.floor(Date.now() / 36e5) * 36e5, H = 36e5, CREW = "gas_crew=" + C.mintCrewCookieValue();
const live = (id, o = {}) => ({ id, source: "bringatrailer", url: "https://auction.test/lot/" + id, photo_url: "https://img.test/p" + id + ".jpg", listing_title: "2007 Ferrari F430", year: 2007, make: "Ferrari", model: "F430", vin_norm: "ZFFEW59A670150000", mileage: 18500, mileage_unit: "miles", current_bid: 90000, current_bid_usd: 90000, currency: "USD", location: "Williamsburg, VA", country: "US", transmission: "Manual", exterior_color: "Red", end_time: new Date(NOW + 30 * H).toISOString(), status: "live", ...o });
function world(rows, extra = {}) {
  const w = { rows, store: new Map(), clock: NOW, calls: { match: 0, appearances: 0 }, ...extra };
  w.d = { now: () => w.clock,
    select: async (e, q) => { if (w.fail) return null; let m = /^app_config\?key=eq\.([a-z_]+)/.exec(q); if (m) { const v = w.store.get(m[1]); return v ? [{ value: v }] : []; }
      m = /^live_listings\?id=eq\.([^&]+)/.exec(q); if (m) { if (w.unreadable) return null; return w.rows.filter(r => String(r.id) === decodeURIComponent(m[1])).slice(0, 1); }
      return []; },
    write: async (e, row) => { w.store.set(row.key, row.value); }, clear: async (e, key) => { if (key) w.store.delete(key); else { w.store.delete(TD.STORE_KEY); w.store.delete(FH.STORE_KEY); } },
    appearances: async () => { w.calls.appearances++; return { ok: true, appearances: [] }; }, match: async () => { w.calls.match++; return []; }, facts: async r => S.listingFacts(r) };
  return w;
}
const tdStore = (r, at) => ({ v: TD.STORE_V, listingId: r.id, field: { request: "Find me a manual red Ferrari F430 under 115,000", shortRequest: "x", car: { title: "2007 Ferrari F430", platform: "Bring a Trailer", url: r.url, photo: r.photo_url, live: true, endsAt: r.end_time, priceLabel: "Current bid $90,000", mileage: 18500, location: "Williamsburg, VA", why: "Matches: x" }, criteria: ["manual"], whyLines: ["manual"], matchedAt: new Date(at).toISOString(), checkedAt: new Date(at).toISOString() }, filters: { make: "Ferrari", model: "F430" }, selectedAt: new Date(at).toISOString(), matchedAt: new Date(at).toISOString(), checkedAt: new Date(at).toISOString() });
const fhStore = (r, at) => ({ v: FH.STORE_V, listingId: r.id, featured: { kind: "sold", headline: FH.HEADLINE.sold, current: { title: "2007 Ferrari F430", platform: "Bring a Trailer", url: r.url, photo: r.photo_url, live: true, endsAt: r.end_time, mileage: 18500 }, previous: { kind: "sold", date: "February 2023", platform: "Bring a Trailer", mileage: 15000, price: 181888, photo: "https://img.test/old.jpg", url: "https://bringatrailer.com/listing/x/" }, findUrl: "/buy?q=2007%20Ferrari%20F430" }, selectedAt: new Date(at).toISOString(), checkedAt: new Date(at).toISOString() });
{ // (1) the Tasks example
  const r = live(1), w = world([r]); w.store.set(TD.STORE_KEY, tdStore(r, NOW));
  w.clock = NOW + 3 * H;   // three hours on, no pull: the 90 minute limit has passed
  ok("(1) before the revalidation, a pick not re-checked in 90 minutes is not served", (await TD.tasksDemo(env, CREW, w.d)) === null);
  const c = await TD.revalidateTasksDemo(env, w.d);
  ok("(1) a live, eligible Tasks example is confirmed: the stamp moves", c.why === "confirmed" && w.store.get(TD.STORE_KEY).checkedAt === new Date(NOW + 3 * H).toISOString(), c.why);
  const served = await TD.tasksDemo(env, CREW, w.d);
  ok("(1) and it is served again, through the night, until its own end", served && served.car.live === true, JSON.stringify(served && served.checkedAt));
  w.clock = NOW + 31 * H; const e = await TD.revalidateTasksDemo(env, w.d);
  ok("(1) its auction ends: the pick is cleared at the next hour, not kept", e.why === "ended" && !w.store.has(TD.STORE_KEY), e.why);
  const w2 = world([live(2, { status: "ended" })]); w2.store.set(TD.STORE_KEY, tdStore(w2.rows[0], NOW)); const e2 = await TD.revalidateTasksDemo(env, w2.d);
  ok("(1) a car whose status is ended is cleared", e2.why === "ended" && !w2.store.has(TD.STORE_KEY));
  const w3 = world([]); w3.store.set(TD.STORE_KEY, tdStore(live(3), NOW)); const e3 = await TD.revalidateTasksDemo(env, w3.d);
  ok("(1) a withdrawn listing (its row gone) is cleared", e3.why === "ended" && !w3.store.has(TD.STORE_KEY));
  const w4 = world([live(4, { photo_url: "https://img.test/placeholder.jpg" })]); w4.store.set(TD.STORE_KEY, tdStore(w4.rows[0], NOW)); const e4 = await TD.revalidateTasksDemo(env, w4.d);
  ok("(1) a car that is no longer eligible (placeholder photo) is cleared", e4.why === "not_eligible" && !w4.store.has(TD.STORE_KEY), e4.why);
  const w5 = world([live(5)]); w5.store.set(TD.STORE_KEY, tdStore(w5.rows[0], NOW)); w5.unreadable = true; const e5 = await TD.revalidateTasksDemo(env, w5.d);
  ok("(1) an unreadable row clears the pick (never kept on a guess)", e5.why === "live_unreadable" && !w5.store.has(TD.STORE_KEY), e5.why);
  // a cleared example serves the fallback: the last proved car, ended
  const w6 = world([live(6)]); w6.store.set(TD.STORE_KEY, tdStore(w6.rows[0], NOW)); w6.store.set(TD.LAST_KEY, { v: TD.LAST_V, listingId: 6, field: tdStore(w6.rows[0], NOW).field, filters: { make: "Ferrari", model: "F430" }, vin: "ZFFEW59A670150000", priceUsd: 90000, recordedAt: new Date(NOW).toISOString() });
  w6.clock = NOW + 31 * H; await TD.revalidateTasksDemo(env, w6.d);
  const fb = await TD.tasksDemoFallback(env, CREW, w6.d);
  ok("(1) once cleared the live field is null and the fallback serves the car as ended, never as live", (await TD.tasksDemo(env, CREW, w6.d)) === null && fb && fb.status === "Ended" && fb.car.live === false, JSON.stringify(fb && [fb.status, fb.car.live]));
  ok("(3) no matcher was run", w.calls.match === 0 && w6.calls.match === 0);
  process.env.TASKS_DEMO = "0"; ok("(1) kill switch TASKS_DEMO=0", (await TD.revalidateTasksDemo(env, w.d)).why === "off"); delete process.env.TASKS_DEMO;
}
{ // (2) the Homepage pick
  const r = live(11), w = world([r]); w.store.set(FH.STORE_KEY, fhStore(r, NOW)); w.clock = NOW + 3 * H;
  ok("(2) before the revalidation, a pick not re-checked in 90 minutes is not served", (await FH.readFeaturedHistory(env, CREW, w.d)) === null);
  const c = await FH.revalidateFeaturedHistory(env, w.d);
  ok("(2) a live, eligible Homepage pick is confirmed and served again", c.why === "confirmed" && (await FH.readFeaturedHistory(env, CREW, w.d)) !== null, c.why);
  w.clock = NOW + 31 * H; const e = await FH.revalidateFeaturedHistory(env, w.d);
  ok("(2) its auction ends: the pick is cleared, the field is null (the section is absent)", e.why === "ended" && !w.store.has(FH.STORE_KEY) && (await FH.readFeaturedHistory(env, CREW, w.d)) === null, e.why);
  const w2 = world([live(12, { status: "ended" })]); w2.store.set(FH.STORE_KEY, fhStore(w2.rows[0], NOW)); ok("(2) a car whose status is ended is cleared", (await FH.revalidateFeaturedHistory(env, w2.d)).why === "ended" && !w2.store.has(FH.STORE_KEY));
  const w3 = world([live(13, { photo_url: "https://img.test/placeholder.jpg" })]); w3.store.set(FH.STORE_KEY, fhStore(w3.rows[0], NOW)); ok("(2) a pick with no real photo any more is cleared", (await FH.revalidateFeaturedHistory(env, w3.d)).why === "not_eligible" && !w3.store.has(FH.STORE_KEY));
  const w4 = world([live(14)]); w4.store.set(FH.STORE_KEY, fhStore(w4.rows[0], NOW)); w4.unreadable = true; ok("(2) an unreadable row clears the pick", (await FH.revalidateFeaturedHistory(env, w4.d)).why === "live_unreadable" && !w4.store.has(FH.STORE_KEY));
  ok("(3) no archive history was read", w.calls.appearances === 0 && w2.calls.appearances === 0);
  process.env.FEATURED_HISTORY = "0"; ok("(2) kill switch FEATURED_HISTORY=0", (await FH.revalidateFeaturedHistory(env, w.d)).why === "off"); delete process.env.FEATURED_HISTORY;
  ok("(3) zero metered OldCarsData", metered === 0, "calls " + metered);
}
{ // (4) the cron, (5) the class
  const pl = fs.readFileSync(path.join(ROOT, "api/pullLive.js"), "utf8"), i = pl.indexOf("if (!slot.mode)"), seg = pl.slice(i, i + 1400);
  ok("(4) the hourly slot runs both revalidations with the examples refresh", /getUTCMinutes\(\) < 15\) \{ examplesRefresh = await refreshExamplesWord\(env\); revalidated = await revalidateCrewWord\(env\);( entryExamples = await refreshEntryWord\(env\);)? \}/.test(seg), seg.slice(0, 100));
  ok("(4) the revalidation names both (the Tasks example and the Homepage pick) and nothing else", /tasksExample: await run\("TASKS_DEMO", "\.\.\/lib\/live\/tasksDemo\.js", "revalidateTasksDemo"\)/.test(pl) && /homepagePick: await refreshFeatured\(env, "revalidate"\)/.test(pl));
  // every module that serves a stored live crew car must have a revalidation or a refresh that confirms it hourly
  const liveDir = path.join(ROOT, "lib/live"), serving = [];
  for (const f of fs.readdirSync(liveDir).filter(x => /\.js$/.test(x))) { const src = fs.readFileSync(path.join(liveDir, f), "utf8"); if (/export const STORE_KEY = "crew_/.test(src) && /isCrewRequest\(/.test(src)) serving.push(f); }
  const COVERED = { "findExamples.js": "refreshFindExamples (the daily pick and the hourly confirm: findPickCheck)", "watchingDemo.js": "refreshWatchingDemo (the examples refresh on the hourly slot: liveExamplesCheck)", "tasksDemo.js": "revalidateTasksDemo", "featuredHistory.js": "revalidateFeaturedHistory" };
  const missing = serving.filter(f => !(f in COVERED)), noFn = ["tasksDemo.js:revalidateTasksDemo", "featuredHistory.js:revalidateFeaturedHistory", "findExamples.js:refreshFindExamples", "watchingDemo.js:refreshWatchingDemo"].filter(x => { const [f, fn] = x.split(":"); const src = fs.readFileSync(path.join(liveDir, f), "utf8"); return !(src.includes("export async function " + fn + "(") || new RegExp("export const " + fn + " = guardedRefresh\\(" + fn + "Core").test(src)); });
  ok("(5) every crew example module that serves a stored live car is classified, and its confirm exists", missing.length === 0 && noFn.length === 0, "unclassified " + missing.join(", ") + " missing " + noFn.join(", ") + " found " + serving.join(", "));
}
console.log("\nhourlyRevalidateCheck: " + (n - failed) + " pass, " + failed + " FAIL"); process.exit(failed ? 1 : 0);
