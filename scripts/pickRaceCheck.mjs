// clock: real-ok the fixed CLOCK below is the only time the pickers read
// THE PULL NEVER OVERWRITES A NEWER PICK (Lane B, Nov 11 2026). Lane C rebuilt the Find three (a forced build) and the next pull put the previous three back ("kept 3"). CAUSE: a refresh reads the stored pick FIRST, spends tens of seconds on the live pool, the history reads and the engine's band reads, and
// writes at the END, spreading the pick it read at the start; a pick written by someone else in between (a rebuild) was overwritten by the older one. RULE (lib/live/storeGuard.js): a refresh never overwrites or clears a pick NEWER than the one it read; it answers "superseded".
// CLASS: Find's three, the Home pick (refresh and the hourly revalidation), the Tasks demo (refresh and revalidation) and the Watching demo all keep one pick under one app_config key the same way and all go through guardedRefresh.
//   node scripts/pickRaceCheck.mjs [repo root]   (--mutants breaks one rule at a time)
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { spawnSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const args = process.argv.slice(2), here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(args.find(a => !a.startsWith("--")) || path.join(here, ".."));
if (args.includes("--mutants")) process.exit(mutants());
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) pass++; else { fail++; console.log("FAIL " + n + (d !== undefined ? " " + JSON.stringify(d) : "")); } };
const imp = f => import(pathToFileURL(path.join(root, f)).href);
const FE = await imp("lib/live/findExamples.js"), SG = await imp("lib/live/storeGuard.js"), S = await imp("lib/live/search.js");
const CLOCK = Date.parse("2026-11-10T20:00:00Z"), DAY_KEY = "2026-11-10", env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
const row = (id, make, src, hours) => ({ id, source: src, url: "https://auction.test/lot/" + id, photo_url: "https://img.test/p" + id + ".jpg", listing_title: `199${id % 10} ${make} Model${id}`, year: 1990 + (id % 10), make, model: "Model" + id, vin_norm: null, mileage: 20000, mileage_unit: "miles", current_bid: 60000, current_bid_usd: 60000, currency: "USD", country: "US", location: "Austin, TX", transmission: "Manual", exterior_color: "Red", body: null, status: "live", end_time: new Date(CLOCK + hours * 3600e3).toISOString(), description: "", first_seen: "2026-11-0" + (1 + id % 8) + "T00:00:00Z" });
const rows = [row(1, "Alfa", "bringatrailer", 30), row(2, "Bmw", "carsandbids", 31), row(3, "Chevy", "rmsothebys", 32), row(4, "Dodge", "bringatrailer", 33), row(5, "Ford", "pcarmarket", 34), row(6, "Honda", "carsandbids", 35)];
const entry = id => ({ listingId: id, sold: false, photo: "https://img.test/p" + id + ".jpg", intel: { kind: "none", line: null, url: null }, why: "stored_none" });
const OLD = { v: FE.STORE_V, entries: [entry(1), entry(2), entry(3)], pickDate: DAY_KEY, selectedAt: "2026-11-10T08:00:00.000Z", checkedAt: "2026-11-10T19:00:00.000Z" };    // the previous three, stored this morning
const REBUILT = { v: FE.STORE_V, entries: [entry(4), entry(5), entry(6)], pickDate: DAY_KEY, selectedAt: "2026-11-10T19:59:00.000Z", checkedAt: "2026-11-10T19:59:00.000Z" };   // Lane C's rebuild, a minute ago
// a refresh that is IN FLIGHT when the rebuild lands: the rebuild is written the moment the refresh checks its first stored car (after the refresh read the store)
const world = (hook) => { const w = { store: new Map([[FE.STORE_KEY, JSON.parse(JSON.stringify(OLD))]]), hooked: false };
  w.d = { now: () => CLOCK, head: async () => ({ status: 200, bytes: 1000, type: "image/jpeg" }), appearances: async () => ({ ok: false, appearances: [] }), urlStatus: async () => 200, facts: async r => S.listingFacts(r), answer: async () => null,
    select: async (e, q) => { let m = /^app_config\?key=eq\.([a-z_]+)/.exec(q); if (m) { const v = w.store.get(m[1]); return v ? [{ value: JSON.parse(JSON.stringify(v)) }] : []; }
      m = /^live_listings\?id=eq\.([^&]+)/.exec(q); if (m) { if (hook && !w.hooked) { w.hooked = true; w.store.set(FE.STORE_KEY, JSON.parse(JSON.stringify(REBUILT))); } return rows.filter(r => String(r.id) === decodeURIComponent(m[1])).slice(0, 1); }
      if (/^live_listings\?status=eq\.live/.test(q)) return rows.filter(r => r.status === "live" && Date.parse(r.end_time) > CLOCK); return []; },
    write: async (e, r) => { w.store.set(r.key, JSON.parse(JSON.stringify(r.value))); }, clear: async (e, k) => { w.store.delete(k); } };
  return w; };
// (1) the report: a pull that read the previous three is still checking them when the rebuild lands
{ const w = world(true), r = await FE.refreshFindExamples(env, w.d), st = w.store.get(FE.STORE_KEY);
  ok("(1) the pull read the previous three and the rebuild landed while it ran (the world did what it says)", w.hooked === true);
  ok("(1) the rebuild is the last write: the store still holds the rebuilt three, selectedAt unchanged", st && st.selectedAt === REBUILT.selectedAt && st.entries.map(e => e.listingId).join() === "4,5,6", st && [st.selectedAt, st.entries.map(e => e.listingId)]);
  ok("(1) the pull answers superseded and names the pick that stands, never kept", r.why === "superseded" && r.stored && r.stored.selectedAt === REBUILT.selectedAt, [r.why, r.stored && r.stored.selectedAt]); }
// (2) control: with no rebuild in between the same pull keeps the three and writes (the guard stops nothing else)
{ const w = world(false), r = await FE.refreshFindExamples(env, w.d), st = w.store.get(FE.STORE_KEY);
  ok("(2) a pull with no rebuild in between still keeps the three and refreshes checkedAt", r.why === "kept" && st.entries.map(e => e.listingId).join() === "1,2,3" && st.checkedAt > OLD.checkedAt, [r.why, st.checkedAt]); }
// (3) a rebuild that lands while the pull would CLEAR the store (a read that failed) is not wiped either
{ const w = world(true); const d2 = { ...w.d, appearances: async () => { throw new Error("boom"); } }, sel = w.d.select; w.d.select = async (e, q) => { const r = await sel(e, q); if (/^live_listings\?id=eq\./.test(q) && w.hooked) return null; return r; };
  const r = await FE.refreshFindExamples(env, w.d), st = w.store.get(FE.STORE_KEY);
  ok("(3) a pull whose live read fails does not clear a pick that landed after it read the store", st && st.selectedAt === REBUILT.selectedAt, [r.why, st && st.selectedAt]); }
// (4) the class: the guard itself, and every picker keeps its pick through it
{ let writes = 0; const store = { v: { selectedAt: "2026-11-10T10:00:00Z" } };
  const core = async (e, deps) => { await deps.select(e, "app_config?key=eq.k1&select=value&limit=1"); store.v = { selectedAt: "2026-11-10T11:00:00Z" }; await deps.write(e, { key: "k1", value: { selectedAt: "2026-11-10T10:00:00Z", checkedAt: "x" } }); return { stored: "mine", why: "kept" }; };
  const g = SG.guardedRefresh(core, { key: "k1", defaults: () => ({ select: async () => [{ value: store.v }], write: async () => { writes++; }, clear: async () => { writes++; } }) });
  const r = await g({}, {});
  ok("(4) guardedRefresh drops the write of a refresh older than the stored pick and says superseded", writes === 0 && r.why === "superseded", [writes, r.why]);
  store.v = { selectedAt: "2026-11-10T09:00:00Z" }; writes = 0;
  const core2 = async (e, deps) => { await deps.select(e, "app_config?key=eq.k1&select=value&limit=1"); await deps.write(e, { key: "k1", value: { selectedAt: "2026-11-10T12:00:00Z" } }); await deps.write(e, { key: "k1", value: { selectedAt: "2026-11-10T12:00:00Z", checkedAt: "y" } }); return { why: "selected" }; };
  const r2 = await SG.guardedRefresh(core2, { key: "k1", defaults: () => ({ select: async () => [{ value: store.v }], write: async (e, row) => { writes++; store.v = row.value; }, clear: async () => {} }) })({}, {});
  ok("(4) a refresh's own new pick, and its own later write, are never mistaken for someone else's", writes === 2 && r2.why === "selected", [writes, r2.why]);
  const rd = f => fs.readFileSync(path.join(root, f), "utf8");
  for (const [f, names] of [["lib/live/findExamples.js", ["refreshFindExamples"]], ["lib/live/featuredHistory.js", ["refreshFeaturedHistory", "revalidateFeaturedHistory"]], ["lib/live/tasksDemo.js", ["refreshTasksDemo", "revalidateTasksDemo"]], ["lib/live/watchingDemo.js", ["refreshWatchingDemo"]]])
    for (const n of names) ok(`(4) ${f} ${n} goes through guardedRefresh`, new RegExp(`export const ${n} = guardedRefresh\\(${n}Core, \\{ key: STORE_KEY, defaults: defaultDeps \\}\\)`).test(rd(f)) && !new RegExp(`export async function ${n}\\(`).test(rd(f)), f);
  for (const m of ["findExamples", "featuredHistory", "tasksDemo", "watchingDemo"]) { const mod = await imp(`lib/live/${m}.js`); ok(`(4) ${m} exports its refresh as a function`, Object.entries(mod).filter(([k]) => /^(refresh|revalidate)\w*Demo$|^refresh(FindExamples|FeaturedHistory)$|^revalidateFeaturedHistory$/.test(k)).every(([, v]) => typeof v === "function")); } }
console.log(`pickRaceCheck: ${fail ? fail + " FAIL" : "all pass"} (${pass})`); process.exit(fail ? 1 : 0);

function mutants() {
  const M = [
    ["lib/live/storeGuard.js", "if (n) { flagged = true; latest = n; return undefined; } const r = await base.write(e, row);", "const r = await base.write(e, row);", "(1) the rebuild is the last write"],
    ["lib/live/storeGuard.js", "const clear = async (e, k) => { if (k === undefined || k === key) { const n = await newer(); if (n) { flagged = true; latest = n; return undefined; } } return base.clear(e, k); };", "const clear = async (e, k) => base.clear(e, k);", "(3) a pull whose live read fails"],
    ["lib/live/storeGuard.js", "return flagged ? { stored: latest, why: \"superseded\", ...(r && r.funnel ? { funnel: r.funnel } : {}) } : r;", "return r;", "(1) the pull answers superseded"],
    ["lib/live/storeGuard.js", "if (row.value && row.value.selectedAt) seen = Math.max(seen || 0, selectedMs(row.value));", "", "(4) a refresh's own new pick"],
    ["lib/live/storeGuard.js", "return v && selectedMs(v) > seen ? v : null;", "return v && selectedMs(v) >= seen ? v : null;", "(2) a pull with no rebuild in between"],
    ["lib/live/findExamples.js", "export const refreshFindExamples = guardedRefresh(refreshFindExamplesCore, { key: STORE_KEY, defaults: defaultDeps });", "export const refreshFindExamples = refreshFindExamplesCore;", "(4) lib/live/findExamples.js refreshFindExamples"],
    ["lib/live/tasksDemo.js", "export const revalidateTasksDemo = guardedRefresh(revalidateTasksDemoCore, { key: STORE_KEY, defaults: defaultDeps });", "export const revalidateTasksDemo = revalidateTasksDemoCore;", "(4) lib/live/tasksDemo.js revalidateTasksDemo"],
  ];
  let bad = 0;
  for (const [file, from, to, name] of M) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "prc-"));
    for (const d of ["lib", "api", "scripts", "public"]) fs.cpSync(path.join(root, d), path.join(tmp, d), { recursive: true, filter: s => !/node_modules/.test(s) });
    for (const f of ["vercel.json", "package.json"]) if (fs.existsSync(path.join(root, f))) fs.copyFileSync(path.join(root, f), path.join(tmp, f));
    fs.symlinkSync(path.join(root, "node_modules"), path.join(tmp, "node_modules"));
    const fp = path.join(tmp, file), src = fs.readFileSync(fp, "utf8");
    if (!src.includes(from)) { console.log("MUTANT BROKEN (text not found): " + name + " :: " + from.slice(0, 60)); bad++; continue; }
    fs.writeFileSync(fp, src.replace(from, to));
    const r = spawnSync("node", [path.join(tmp, "scripts/pickRaceCheck.mjs"), tmp], { encoding: "utf8", timeout: 120000 }), out = (r.stdout || "") + (r.stderr || "");
    const named = out.split("\n").some(l => l.startsWith("FAIL") && l.includes(name));
    if (!(r.status !== 0 && named)) { console.log(`MUTANT SURVIVED: ${name}`); out.split("\n").slice(0, 3).forEach(l => console.log("   " + l.slice(0, 160))); bad++; }
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`pickRaceCheck mutants: ${M.length - bad} of ${M.length} killed${bad ? `, ${bad} SURVIVED` : ""}`);
  return bad ? 1 : 0;
}
