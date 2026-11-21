// forSaleVinStampCheck (Lane D, Nov 20 2026): the earlier sale line on Find's for sale cards, with the engine's own pieces (stampPass, seenMany, the real seenBefore, historyOf, cardOf) over a fake table. No network, no model.
// CAUSE (Lane F's launch census: 49 matches, 985 of 45,898 live rows stamped, none for classiccars or dupontregistry): the stamp was the LAST step of a prepare run, after the reads had used the call's time, and its queue was "the first 3,000 rows that carry a VIN, by id", stamped or not:
// the 985 stamped rows and the short chassis numbers (never stamped, never marked) filled the window for good, so no row after them was ever looked at. Each VIN was also looked up alone (three reads each).
// THE RULE: the stamp runs before the reads in every pass; its queue is the rows not looked at (or looked at over 7 days ago); rows with a VIN first, a batch of up to 2,000 VINs at once; a row with no usable VIN is MARKED looked at and never retried in a loop; a failed read stamps nothing.
// THE CLASS: every source, every row shape (full VIN, short chassis, none, VIN that arrives later), the window that does not move, the batch that fails. node scripts/forSaleVinStampCheck.mjs [root]; --mutants breaks one rule at a time in a copy (each must fail).
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { spawnSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const args = process.argv.slice(2), here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(args.find(a => !a.startsWith("--")) || path.join(here, ".."));
let pass = 0, fail = 0; const fails = []; const ok = (n, c, d) => { if (c) pass++; else { fail++; fails.push(n + (d !== undefined ? " :: " + JSON.stringify(d) : "")); } };
if (args.includes("--mutants")) process.exit(mutants());
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const origLog = console.log; console.log = () => {};
const PREP = await imp("lib/forsale/prepare.js"), SERVE = await imp("lib/forsale/serve.js"), SEARCH = await imp("lib/live/search.js"), RULES = await imp("lib/forsale/rules.js"), REP = await imp("lib/forsale/report.js"); console.log = origLog;
const ENV = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
let T = [], VI = [], SA = [], AA = [], FAIL_SA = false, LOG = [], BUSY = 0, MAXBUSY = 0, LOOKUPS = [];
const parseIn = v => [...String(v).matchAll(/"([^"]+)"/g)].map(m => m[1]);
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = new URL(String(url)), method = (init && init.method) || "GET", p = u.pathname.split("/").pop(), q = k => u.searchParams.get(k);
  const json = (b, st = 200) => new Response(JSON.stringify(b), { status: st });
  if (p === "for_sale_listings") {
    if (method === "PATCH") { const ids = (q("id") || "").replace(/^in\.\(|\)$/g, "").split(",").map(Number), b = JSON.parse(init.body); LOG.push({ ids, b }); for (const r of T) if (ids.includes(r.id)) Object.assign(r, b); return new Response("", { status: 200 }); }
    let rows = T.filter(r => (!q("gone") || String(r.gone) === q("gone").replace("eq.", "")) && (!q("hidden") || String(r.hidden) === q("hidden").replace("eq.", "")) && (!q("resolve_state") || r.resolve_state === q("resolve_state").replace("eq.", "")) && Number(r.id) > Number((q("id") || "gt.0").replace("gt.", "")));
    if (q("vin_norm") === "not.is.null") rows = rows.filter(r => r.vin_norm != null); if (q("vin_norm") === "is.null") rows = rows.filter(r => r.vin_norm == null);
    const orp = decodeURIComponent(q("or") || "");
    if (/^\(history\.is\.null,/.test(orp)) { const lt = /history->>at\.lt\.([^,)]+)/.exec(orp)[1], nv = /and\(history->>why\.eq\.no_vin/.test(orp); rows = rows.filter(r => r.history == null || String(r.history.at) < lt || (nv && r.history.why === "no_vin" && r.vin_norm != null) || (/history\.not\.is\.null/.test(orp) && r.history != null)); }
    if (method === "HEAD") return new Response("", { status: 200, headers: { "content-range": `0-0/${rows.length}` } });
    rows = rows.sort((a, b) => a.id - b.id).slice(0, Number(q("limit")) || 1000); return json(rows);
  }
  if (["vin_index", "sales_archive", "auction_attempts"].includes(p)) {
    if (FAIL_SA && p !== "vin_index") return json({}, 500);
    BUSY++; MAXBUSY = Math.max(MAXBUSY, BUSY); await new Promise(r => setTimeout(r, 1)); BUSY--;
    const col = p === "auction_attempts" ? "chassis_vin_norm" : "vin_norm", tbl = p === "vin_index" ? VI : p === "sales_archive" ? SA : AA, f = q(col) || "";
    const vs = /^in\./.test(f) ? parseIn(f) : [f.replace(/^eq\./, "")]; LOOKUPS.push([p, ...vs]);
    let rows = tbl.filter(r => vs.includes(r[col])); const lim = Number(q("limit")); if (lim && !/^in\./.test(f)) rows = rows.slice(0, lim); return json(rows);
  }
  return new Response("{}", { status: 404 });
};
const AT = new Date().toISOString(), STALE = new Date(Date.now() - 168 * 3600e3).toISOString();
const SOURCES = Object.keys(RULES.SOURCE_TABLE).filter(s => !RULES.SOURCE_TABLE[s].hold);
const row = (id, o = {}) => ({ id, source: "streetside", source_type: "dealer", gone: false, hidden: false, resolve_state: "resolved", vin_norm: null, history: null, asking_price_usd: 40000, title: "x", year: 1987, make: "Porsche", model: "911", ...o });
const V = n => "WP0AB0914HS" + String(100000 + n);
const stamp = (o = {}) => PREP.stampPass(ENV, { at: AT, stale: STALE, eng: {}, ...o });
const reset = () => { T = []; VI = []; SA = []; AA = []; FAIL_SA = false; LOG = []; MAXBUSY = 0; LOOKUPS = []; };
{ // 1. a VIN we hold at auction serves its earlier sale line after ONE stamp run, from the engine's own pieces
  reset(); T = [row(1, { vin_norm: V(1) })]; SA = [{ vin_norm: V(1), source_slug: "bringatrailer", sale_date: "2024-03-12", sale_price: 36500, sale_price_usd: 36500, mileage: 41000, platform: "Bring a Trailer" }];
  const o = await stamp();
  ok("one stamp run stamps the row with its earlier sale", o.stampedMatched === 1 && T[0].history && T[0].history.none === false, o);
  const card = SERVE.cardOf({ r: RULES.liveShape({ ...T[0], read: null, car: null, mileage: 40000 }, true) });
  ok("and the card serves the earlier sale line, in the engine's words", /sold for \$36,500 in March 2024/.test(String(card.historyLine)), card.historyLine);
}
{ // 2. the lookup says what the engine's own seenBefore says (vin_index first, then the later of sale and attempt, else none)
  reset(); const vs = [1, 2, 3, 4, 5].map(V);
  VI = [{ vin_norm: vs[0], appearance_date: "2025-01-10", source: "Cars & Bids", result: "sold", price_usd: 52000, mileage: 9000 }];
  SA = [{ vin_norm: vs[0], source_slug: "x", sale_date: "2020-01-01", sale_price: 1000, sale_price_usd: 1000, mileage: 5, platform: "x" }, { vin_norm: vs[1], source_slug: "bringatrailer", sale_date: "2023-06-02", sale_price: 61000, sale_price_usd: 61000, mileage: 5, platform: "Bring a Trailer" }, { vin_norm: vs[2], source_slug: "bringatrailer", sale_date: "2021-06-02", sale_price: 20000, sale_price_usd: 20000, mileage: 5, platform: "Bring a Trailer" }];
  AA = [{ chassis_vin_norm: vs[2], source_slug: "carsandbids", attempt_date: "2024-02-02", high_bid: 33000, high_bid_usd: 33000, mileage: "9" }, { chassis_vin_norm: vs[3], source_slug: "carsandbids", attempt_date: "2024-05-05", high_bid: 31000, high_bid_usd: 31000, mileage: "9" }];
  const many = await PREP.seenMany(ENV, vs), same = [];
  for (const v of vs) { const one = await SEARCH.seenBefore(ENV, v), a = PREP.historyOf(one, AT), b = PREP.historyOf(many.get(v) || null, AT); same.push(JSON.stringify([a.none, a.result, a.date, a.price_usd, a.line]) === JSON.stringify([b.none, b.result, b.date, b.price_usd, b.line])); }
  ok("for five VINs (vin_index, archive sale, a later attempt over an older sale, an attempt only, none) the batch gives the same finished line as the engine's one VIN lookup", same.every(Boolean), same);
}
{ // 3. the window moves: stamped rows and short chassis numbers do not hold the queue
  reset(); for (let i = 1; i <= 30; i++) T.push(row(i, { vin_norm: V(i), history: { none: true, at: AT } })); for (let i = 31; i <= 40; i++) T.push(row(i, { vin_norm: "5F08C" + i }));
  for (let i = 41; i <= 45; i++) { const r = row(i, { vin_norm: V(i), source: "classiccars", source_type: "classified" }); T.push(r); SA.push({ vin_norm: V(i), source_slug: "bringatrailer", sale_date: "2024-03-12", sale_price: 30000 + i, sale_price_usd: 30000 + i, mileage: 1, platform: "BaT" }); }
  const o = await stamp({ rowCap: 20 });
  ok("30 stamped rows and 10 short chassis numbers sit in front, the window is 20 rows: the 5 later rows with a VIN are stamped in the first run", T.filter(r => r.id > 40 && r.history && r.history.none === false).length === 5, o);
  ok("a short chassis number is marked looked at (short_id), never looked up", T.filter(r => r.id > 30 && r.id <= 40).every(r => r.history && r.history.none === true && r.history.why === "short_id") && !LOOKUPS.some(l => l.some(x => /^5F08C/.test(x))));
  ok("a classifieds row is stamped like a dealer's (the rule is not per source)", T.find(r => r.source === "classiccars").history.none === false);
}
{ // 4. a row with no VIN is marked looked at and never retried
  reset(); T = [row(1, { vin_norm: null }), row(2, { vin_norm: null }), row(3, { vin_norm: V(3) })]; SA = [{ vin_norm: V(3), source_slug: "bringatrailer", sale_date: "2024-03-12", sale_price: 30000, sale_price_usd: 30000, mileage: 1, platform: "BaT" }];
  await stamp(); ok("rows with a VIN go first: the first run stamps the VIN row and leaves the two with no VIN", T[2].history && T[2].history.none === false && T[0].history == null);
  await stamp(); ok("the next run marks the rows with no VIN: history none, why no_vin", T[0].history && T[0].history.none === true && T[0].history.why === "no_vin" && T[1].history.why === "no_vin" && !LOOKUPS.some(l => l[0] !== "sales_archive" && l[0] !== "auction_attempts" && l[0] !== "vin_index"));
  const before = LOG.length, o3 = await stamp(); ok("and a third run finds nothing to do: no patch, no lookup (never retried in a loop)", o3.histories === 0 && LOG.length === before, o3);
  const n0 = LOOKUPS.length; for (let i = 0; i < 3; i++) await stamp(); ok("run after run, still nothing", LOOKUPS.length === n0 && LOG.length === before);
  T[0].vin_norm = V(3); const o4 = await stamp(); ok("a row marked no VIN that comes to carry a VIN is looked up again", o4.histories === 1 && T[0].history.none === false, o4);
}
{ // 5. a failed read stamps nothing; a batch of 2,000 VINs, one call at a time
  reset(); T = [row(1, { vin_norm: V(1) })]; FAIL_SA = true; const o = await stamp();
  ok("a read that fails stamps NOTHING (never a none on a failed read) and says so", o.stampFailed === 1 && T[0].history == null && LOG.length === 0, o);
  FAIL_SA = false; const o2 = await stamp(); ok("the next run asks again and stamps", o2.histories === 1 && T[0].history && T[0].history.none === true);
  reset(); for (let i = 1; i <= 2500; i++) T.push(row(i, { vin_norm: V(i) })); for (let i = 1; i <= 2500; i += 7) SA.push({ vin_norm: V(i), source_slug: "bringatrailer", sale_date: "2024-03-12", sale_price: 30000, sale_price_usd: 30000, mileage: 1, platform: "BaT" });
  const a = await stamp({ rowCap: 6000 }); ok("one run takes up to 2,000 VINs (a batch), the other 500 wait for the next run", T.filter(r => r.history).length === 2000 && a.stampBatches === 1, [T.filter(r => r.history).length, a.stampBatches]);
  ok("the batch's reads go one at a time (never two lookups at once)", MAXBUSY === 1, MAXBUSY);
  await stamp({ rowCap: 6000 }); ok("the second run stamps the other 500 and the matches are the cars held at auction (358 of 2,500)", T.every(r => r.history) && T.filter(r => r.history.none === false).length === Math.ceil(2500 / 7), T.filter(r => r.history.none === false).length);
}
{ // 7. the stamp alone: every batch until nothing is left, no resolver, no engine read
  reset(); for (let i = 1; i <= 4500; i++) T.push(row(i, { vin_norm: V(i), source: SOURCES[i % SOURCES.length] })); for (let i = 4501; i <= 4600; i++) T.push(row(i)); for (let i = 1; i <= 4500; i += 9) SA.push({ vin_norm: V(i), source_slug: "bringatrailer", sale_date: "2024-03-12", sale_price: 30000, sale_price_usd: 30000, mileage: 1, platform: "BaT" });
  const eng = { specOf: async () => { throw new Error("the resolver must not run"); }, listingMarket: async () => { throw new Error("no engine read"); } };
  const o = await PREP.prepareForSale(ENV, { stampOnly: true, noLease: true, noNightlyCheck: true, engine: eng, budgetMs: 60000 });
  ok("the stamp alone runs batch after batch until every row is looked at (4,500 with a VIN in 3 batches, 100 with none marked), with no resolver call and no engine read", o.stampOnly === true && T.every(r => r.history) && o.stampBatches === 3 && o.stampedNoVin === 100 && o.stampedMatched === 500 && o.left.toHistory === 0 && o.left.toMarkNoVin === 0, [o.stampBatches, o.stampedNoVin, o.stampedMatched, o.left]);
  const bySource = {}; for (const r of T.filter(r => r.history && r.history.none === false)) bySource[r.source] = (bySource[r.source] || 0) + 1;
  ok("and every live source has its rows stamped (the rule is not per source)", SOURCES.filter(s => T.some(r => r.source === s && r.vin_norm)).every(s => T.filter(r => r.source === s && r.vin_norm).every(r => r.history)), SOURCES.length);
}
{ // 6. the report counts the stamp per source
  ok("the report has, per source, the rows that carry a VIN and the rows stamped, beside the matches", REP.CELLS.with_vin === "gone=eq.false&vin_norm=not.is.null" && REP.CELLS.history_stamped === "gone=eq.false&history=not.is.null" && !!REP.CELLS.vin_history_match);
}
globalThis.fetch = realFetch;
console.log(`forSaleVinStampCheck: ${pass} pass, ${fail} FAIL`); for (const f of fails) console.log("FAIL " + f); process.exit(fail ? 1 : 0);

function mutants() {
  const sub = (file, from, to) => [file, s => s.includes(from) ? s.replace(from, () => to) : s, from], P = "lib/forsale/prepare.js";
  const M = [
    ["the queue takes stamped rows again (the window does not move)", ...sub(P, "&or=(history.is.null,history->>at.lt.${encodeURIComponent(stale)}${withVin", "&or=(history.is.null,history.not.is.null,history->>at.lt.${encodeURIComponent(stale)}${withVin")],
    ["a short chassis number is looked up, not marked", ...sub(P, "const full = rows.filter(r => isFullVin(r.vin_norm)), short = rows.filter(r => !isFullVin(r.vin_norm));", "const full = rows, short = [];")],
    ["a row with no VIN is never marked", ...sub(P, "await patchIds(env, ids, { history: { none: true, why: \"no_vin\", at }, updated_at: at });", "")],
    ["every row stamped is in the queue again at once", ...sub(P, "history->>at.lt.${encodeURIComponent(stale)}${withVin", "history->>at.lt.${encodeURIComponent(stale)},history.not.is.null${withVin")],
    ["a failed read stamps none", ...sub(P, "} catch { out.stampFailed++; }", "} catch { out.stampFailed++; await patchIds(env, rows.map(r => r.id), { history: { none: true, at }, updated_at: at }); }")],
    ["the batch is one VIN", ...sub(P, "keys = [...byVin.keys()].slice(0, vins);", "keys = [...byVin.keys()].slice(0, 1);")],
    ["vin_index is not read first (the archive alone)", ...sub(P, "for (const v of vins) if (!out.has(v)) missing.push(v);", "missing.push(...vins); out.clear();")],
    ["the stamp alone stops after one batch", ...sub(P, "if (sp.stampFailed || sp.histories === 0 || total - (Date.now() - t0) < 15000) break;", "break;")],
    ["the stamp runs after the reads (no time left for it)", ...sub(P, "if (left() < 8000) return out;", "if (true) return out;")],
    ["rows that carry no VIN go first", ...sub(P, "let rows = await selectPages(env, HIST_Q(stale, true), rowCap);", "let rows = []; ")]
  ];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vs-")); spawnSync("rsync", ["-a", ...["lib", "api", "data", "docs", "scripts"].map(d => path.join(ROOT, d)), tmp]); try { fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(tmp, "node_modules")); } catch {}
  let killed = 0, survived = 0, skipped = 0;
  for (const [name, file, fn, from] of M) { const f = path.join(tmp, file), orig = fs.readFileSync(f, "utf8"); if (!orig.includes(from)) { skipped++; console.log("SKIP (text not found) " + name); continue; } fs.writeFileSync(f, fn(orig)); const r = spawnSync("node", [path.join(tmp, "scripts/forSaleVinStampCheck.mjs"), tmp], { encoding: "utf8" }); fs.writeFileSync(f, orig); if (r.status !== 0) { killed++; console.log("KILLED   " + name); } else { survived++; console.log("SURVIVED " + name); } }
  console.log(`forSaleVinStampCheck mutants: ${killed} of ${M.length} killed${survived ? `, ${survived} SURVIVED` : ""}${skipped ? `, ${skipped} skipped` : ""}`); fs.rmSync(tmp, { recursive: true, force: true }); return survived || skipped ? 1 : 0;
}
