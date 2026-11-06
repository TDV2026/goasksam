// DESK TWO TABS (Lane D, Nov 2026, the Hagerty dry run). The cause: a sheet save wrote the whole sheet back from whatever the server had just read, with nothing naming which version the page was looking at, so two tabs (or two
// saves in flight) were last writer wins and the first save vanished silently. Every sheet write (save, finalise) now names the version it read and lands only if that is still the stored version (compare and set in the store).
// Covers every sheet and every car alike: the rule is on the write, not on a field. Offline: the real handleSheetAction, the memory store, a stub for the database REST call.
//   node scripts/sheetVersionCheck.mjs [repo root]        (scripts/sheetVersionFailsWithout.mjs: each mutant must turn it red)
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(ROOT);
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const A = await imp("lib/desk/sheetActions.js"), SS = await imp("lib/desk/sheetStore.js"), { seed } = await imp("scripts/deskValsRender.mjs");
const LINE = "This sheet changed in another tab. Reload to see the latest.";
const org = "ver-org", store = SS.memoryStore();
const cx = (seat = "ava") => ({ now: "2026-11-06T12:00:00.000Z", env: {}, org, seat, store, orgSettings: { name: "Hagerty Marketplace", logo: null, monthlyExportCap: 50 } });
const run = (a, b, seat) => A.handleSheetAction(a, b, cx(seat));
const dec = reserve => ({ mode: "reserve", reserve, reasons: [], otherText: "", line: "", guardLines: {}, note: "" });
const reserveOf = async id => (await store.get(org, id)).state.decision.reserve;
const sh = await seed(store, { seat: "ava", org });
const tabA = await run("sheet_open", { id: sh.id }), tabB = await run("sheet_open", { id: sh.id });
const v0 = tabA.sheet.version || 0;
ok(tabB.sheet.version === tabA.sheet.version, "two tabs open the same version");
// the two-tab case
const a = await run("sheet_save", { id: sh.id, baseVersion: v0, patch: { decision: dec("60000") } });
ok(a.ok && a.sheet.version === v0 + 1, "tab A saves and the version moves: " + (a.sheet && a.sheet.version));
const b = await run("sheet_save", { id: sh.id, baseVersion: v0, patch: { decision: dec("70000") } });
ok(b.refused && b.stale && b.why === LINE, "tab B's save is refused with the exact line: " + b.why);
ok(await reserveOf(sh.id) === "60000", "...and tab A's reserve is still there, nothing lost silently");
const reload = await run("sheet_open", { id: sh.id });
ok(reload.sheet.state.decision.reserve === "60000" && reload.sheet.version === v0 + 1, "a reload shows the latest");
const b2 = await run("sheet_save", { id: sh.id, baseVersion: reload.sheet.version, patch: { decision: dec("70000") } });
ok(b2.ok && await reserveOf(sh.id) === "70000", "after the reload tab B's save lands");
// the same tab saving twice in a row keeps working (each answer carries the new version)
{ let v = b2.sheet.version; for (const r of ["71000", "72000", "73000"]) { const x = await run("sheet_save", { id: sh.id, baseVersion: v, patch: { decision: dec(r) } }); ok(x.ok, "a tab's own sequential saves land: " + r); v = x.sheet && x.sheet.version; } }
// a save with no version named is still compare-and-set against what the server just read: two in flight at once, one wins
{ const s2 = await seed(store, { seat: "ava", org }); await run("sheet_open", { id: s2.id });
  const slow = { ...store, async putIf(o, s, e) { await new Promise(r => setTimeout(r, 5)); return store.putIf(o, s, e); } };
  const two = await Promise.all(["11000", "22000"].map(r => A.handleSheetAction("sheet_save", { id: s2.id, patch: { decision: dec(r) } }, { ...cx(), store: slow })));
  ok(two.filter(r => r.ok).length === 1 && two.filter(r => r.stale).length === 1, "two saves in flight at once: exactly one lands, the other is refused (" + two.map(r => r.ok ? "ok" : "stale").join(",") + ")"); }
// finalise names the version too
{ const s3 = await seed(store, { seat: "ava", org }); const o1 = await run("sheet_open", { id: s3.id }); const w = await run("sheet_save", { id: s3.id, baseVersion: o1.sheet.version || 0, patch: { tier: 2, decision: dec("68000") } });
  const stale_ = await run("sheet_finalise", { id: s3.id, baseVersion: o1.sheet.version || 0 }); ok(stale_.refused && stale_.stale && stale_.why === LINE, "a finalise from a page that read an older version is refused: " + stale_.why);
  ok(!(await store.get(org, s3.id)).final, "...and the sheet is not finalised");
  const f = await run("sheet_finalise", { id: s3.id, baseVersion: w.sheet.version }); ok(f.ok, "the finalise from the current version lands"); }
// the database store: the write carries the version as a filter and reads back whether a row changed
{ const urls = []; const real = globalThis.fetch; let rows = [{ id: "x" }];
  globalThis.fetch = async (u, o = {}) => { urls.push({ u: String(u), method: o.method, prefer: (o.headers || {}).Prefer }); return new Response(JSON.stringify(rows), { status: 200 }); };
  const st = SS.supabaseStore({ supabaseUrl: "https://db.test", supabaseKey: "k" });
  const seatFetch = globalThis.fetch;
  try { const sheet = { id: "11111111-1111-4111-8111-111111111111", owner_seat: "11", status: "In progress", state: {}, version: 4 };
    let r; try { r = await st.putIf("hagerty", sheet, 3); } catch (e) { r = "threw " + e.message; }
    const hit = urls.find(x => x.method === "PATCH" && /sheet-%3E%3Eversion=eq\.3|sheet->>version=eq\.3/.test(x.u));
    ok(!!hit && hit.prefer === "return=representation", "the database write carries the version it read as a filter: " + (urls.find(x => x.method === "PATCH") || {}).u);
    rows = []; try { r = await st.putIf("hagerty", sheet, 3); } catch (e) { r = "threw " + e.message; }
    ok(r === false, "zero rows back means refused (false): " + r); } finally { globalThis.fetch = real; } }
// the page names the version it read
{ const page = fs.readFileSync("public/js/deskvals.js", "utf8"); ok(/sheet_save[^;]*baseVersion/.test(page) && /sheet_finalise[^;]*baseVersion/.test(page), "the page sends the version with a save and with Finalise"); }
console.log(`sheetVersionCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
