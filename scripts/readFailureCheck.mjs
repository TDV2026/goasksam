// Read-failure check (Lane B, Nov 2 2026, job lane-b-archiveread, step a). No database, no network: a fake PostgREST serves a small fixture and fails
// chosen reads. THE CLASS: an archive read that fails (statement timeout 57014, throttle, abort) came back as null and was counted as FEWER SALES at ~20
// sites. A pool with a leg or a page missing was counted, stored and served as the pool. Must hold:
//  (1) a pool leg (the title leg of three) or a page that fails: fetchQualifying returns the rows it has WITH readFailed set and diag.queryError;
//  (2) the answer built under that failure is never served as finished: oneEngineAnswer returns tier unavailable (stillReading, readFailed), not result or thin;
//  (3) the same for the non-pool reads under an answer: the project-filter descriptions and the card flaws and service history;
//  (4) answerCacheable never stores an answer that carries a failed read, whatever its tier;
//  (5) requireWholePool throws on a flagged pool (spec pages, venue pool, price band, sales list, house receipts) and passes a whole one;
//  (6) STATIC: no read result in a pool-feeding module is turned into an empty list without the failure being noted (okRows), and no unscoped fetchQualifying call
//      outside lib/onebox.js uses its rows without requireWholePool (or a read-failure-ok: marker that says why).
//   node scripts/readFailureCheck.mjs          (LIB_ROOT=<dir holding lib/ and api/> runs it against another tree, e.g. the base commit, to show it fails)
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.env.LIB_ROOT ? path.resolve(process.env.LIB_ROOT) : path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const E = await import(pathToFileURL(path.join(ROOT, "lib/onebox.js")).href);
const S = await import(pathToFileURL(path.join(ROOT, "lib/live/search.js")).href);
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const quiet = console.error; console.error = () => {};   // the engine logs every noted failure loudly; the check prints its own lines

const mk = (i, over = {}) => {
  const raw = { id: "ocd" + i, title: `${1999 + (i % 5)} Porsche 911 Carrera ${i}`, featured_image_url: `https://img.example/${i}.jpg`, mileage: `${20000 + i * 37}`, body_style: "Coupe",
    modifications: null, currency: "USD", transmission: "Manual (6-Speed)", exterior_color: "Black", title_status: "Clean", url: `https://bat.example/${i}`, source_url: `https://src.example/${i}`,
    city: "Austin", state: "TX", country_code: "US", auction_end_precision: "day", ...over };
  return { id: "uuid-" + String(i).padStart(5, "0"), source_id: raw.id, sale_price: 30000 + (i % 40) * 700, sale_date: new Date(Date.now() - (5 + i) * 864e5).toISOString().slice(0, 10), platform: "Bring a Trailer",
    listing_title: raw.title, year: 1999 + (i % 5), make: "Porsche", model: "911", vin_norm: null, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: false, raw_record: raw,
    vehicle_type: "car" };
};
const FIX = Array.from({ length: 60 }, (_, i) => mk(i));
const BIG = Array.from({ length: 1100 }, (_, i) => mk(i));   // two pages

const jt = v => v === null || v === undefined ? null : typeof v === "string" ? v : JSON.stringify(v);
const evalItem = (row, item) => {
  const ci = item.indexOf(":"); const hasAlias = ci > 0 && item[ci + 1] !== ":";
  const alias = hasAlias ? item.slice(0, ci) : null; const expr = hasAlias ? item.slice(ci + 1) : item;
  if (expr.startsWith("raw_record->>")) return [alias || expr.slice(13), jt(row.raw_record[expr.slice(13)])];
  const col = expr.replace(/::text$/, "");
  return [alias || col, col in row ? row[col] : null];
};
const state = { src: FIX, failTitleLeg: false, failPage2: false, failDesc: false, failFlaws: false, reads: [] };
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url)); const sel = u.searchParams.get("select") || "";
  const fail = () => new Response(JSON.stringify({ code: "57014", message: "canceling statement due to statement timeout" }), { status: 500 });
  if (u.pathname.endsWith("/sales_archive")) {
    const idf = u.searchParams.get("id");
    if (idf && /description/.test(sel)) { state.reads.push("desc"); if (state.failDesc) return fail(); return new Response(JSON.stringify(state.src.filter(r => idf.includes(r.id)).map(r => ({ id: r.id, d: "" }))), { status: 200 }); }
    if (idf && /known_flaws/.test(sel)) { state.reads.push("flaws"); if (state.failFlaws) return fail(); return new Response(JSON.stringify(state.src.filter(r => idf.includes(r.id)).map(r => ({ id: r.id, flaws: null, svc: null }))), { status: 200 }); }
    if (/^model$/.test(sel)) return new Response(JSON.stringify([{ model: "911" }, { model: "Cayman" }, { model: "Boxster" }]), { status: 200 });
    const byTitle = u.searchParams.get("listing_title") && !u.searchParams.get("model");
    const byModel = !!u.searchParams.get("model");
    if (!byTitle && !byModel) return new Response("[]", { status: 200 });
    if (byTitle && state.failTitleLeg) { state.reads.push("title-fail"); return fail(); }
    const m = /^(\d+)-(\d+)$/.exec((init.headers || {}).Range || "");
    const from = m ? Number(m[1]) : 0, to = m ? Number(m[2]) : 999;
    if (state.failPage2 && from >= 1000) { state.reads.push("page2-fail"); return fail(); }
    const rows = state.src.slice(from, to + 1).map(r => Object.fromEntries(sel.split(",").map(it => evalItem(r, it))));
    state.reads.push(byTitle ? "title" : "model");
    return new Response(JSON.stringify(rows), { status: from + rows.length < state.src.length ? 206 : 200 });
  }
  return new Response("[]", { status: 200 });
};
const env = { supabaseUrl: "https://fake.example", supabaseKey: "k", poolColumns: false };
const spec = () => ({ make: "Porsche", model: "911", trim: "", year: 2001, yearMin: 1999, yearMax: 2004, excludeVariants: [], genCode: null });
const since = new Date(Date.now() - 1825 * 864e5).toISOString();
const reset = (o = {}) => { Object.assign(state, { src: FIX, failTitleLeg: false, failPage2: false, failDesc: false, failFlaws: false, reads: [] }, o); };
const car = { year: 2001, make: "Porsche", model: "911", raw: "2001 Porsche 911", trim: "" };

// (1) pool legs
reset();
{ const d = {}; const rows = await E.fetchQualifying(spec(), since, env, d);
  ok("a whole read: rows, no failure flag", rows.length > 0 && !rows.readFailed && !d.queryError, `n=${rows.length}`); }
reset({ failTitleLeg: true });
{ const d = {}; const rows = await E.fetchQualifying(spec(), since, env, d);
  ok("the title leg of three fails: the rows of the other legs come back FLAGGED readFailed, never as a whole pool", rows.length > 0 && Array.isArray(rows.readFailed) && rows.readFailed.length > 0, `n=${rows.length} flag=${JSON.stringify(rows.readFailed)}`);
  ok("... and diag.queryError is set", d.queryError === true); }
reset({ src: BIG, failPage2: true });
{ const rows = await E.fetchQualifying(spec(), since, env, {});
  ok("page 2 of the model leg fails (every attempt): the read is flagged, not returned as a smaller whole pool", !rows.readFailed ? false : rows.readFailed.length > 0, `n=${rows.length}`); }

// (2) the answer
const answer = async (v = car) => (await E.oneEngineAnswer(v, null, v.raw, { ...env, asked: 0, noStageLog: true }, null)).raw;
reset();
const good = await answer();
ok("sanity: with no failure the fake archive answers as a result or thin, from the pool", /^(result|thin)$/.test(String(good && good.tier)), `tier=${good && good.tier} poolN=${good && good.poolN}`);
reset({ failTitleLeg: true });
{ const d = await answer();
  ok("the title leg fails: the answer is NOT result or thin; it is unavailable, still reading, readFailed", d && d.tier === "unavailable" && d.stillReading === true && d.readFailed === true, `tier=${d && d.tier}`); }

// (3) non-pool reads under the answer
reset({ failDesc: true });
{ const d = await answer();
  ok("the project-filter description read fails (a project car could stay in the pool): not served as finished", !/^(result|thin)$/.test(String(d && d.tier)), `tier=${d && d.tier} reads=${state.reads.filter(x => x === "desc").length}`); }
reset({ failFlaws: true });
{ const d = await answer();
  ok("the card flaws and service-history read fails (Sam's Take would silently drop): not served as finished", !/^(result|thin)$/.test(String(d && d.tier)), `tier=${d && d.tier} flawsReads=${state.reads.filter(x => x === "flaws").length}`); }

// (4) never stored
ok("answerCacheable: a result carrying a failed pool read is never stored", S.answerCacheable({ tier: "result", fallbackRung: "exact", rungLabel: "x", dedup: { queryError: true } }) === false);
ok("answerCacheable: a thin answer carrying a failed pool read is never stored", S.answerCacheable({ tier: "thin", fallbackRung: "exact", rungLabel: "x", dedup: { queryError: true } }) === false);

// (5) the strict helper
{ const flagged = Object.defineProperty([1, 2], "readFailed", { value: ["pool read"] });
  let threw = false; try { E.requireWholePool && E.requireWholePool(flagged, "x"); } catch { threw = true; }
  ok("requireWholePool throws on a pool that lost a leg", threw);
  let passed = false; try { passed = E.requireWholePool ? E.requireWholePool([1, 2], "x").length === 2 : false; } catch { passed = false; }
  ok("requireWholePool passes a whole pool", passed); }

// (6) STATIC
const rd = f => { try { return fs.readFileSync(path.join(ROOT, f), "utf8"); } catch { return ""; } };
const POOL_MODULES = ["lib/onebox.js", "lib/_classify.js", "lib/specPages.js", "lib/sell/sellFacts.js", "lib/desk/measures.js"];
const READ_TO_EMPTY = /\bawait\s+(?:_sb)?supabaseSelect(?:All)?\s*\(.*\)\s*\)?\s*(?:\|\||\?\?)\s*\[\]/;
{ const bad = [];
  for (const f of POOL_MODULES) rd(f).split("\n").forEach((line, i) => { if (READ_TO_EMPTY.test(line) && !/read-failure-ok:/.test(line) && !/okRows\(/.test(line)) bad.push(`${f}:${i + 1}`); });
  ok("STATIC: no read in a pool-feeding module becomes an empty list without okRows (or a read-failure-ok: marker)", bad.length === 0, bad.length ? `${bad.length}: ${bad.slice(0, 8).join(" ")}` : ""); }
{ const bad = [];
  for (const f of ["lib/specPages.js", "lib/sell/sellFacts.js", "lib/desk/execute.js", "api/usageDashboard.js", "lib/platformPick.js", "api/sellerDecision.js", "api/sellChat.js"])
    rd(f).split("\n").forEach((line, i) => { if (/\bfetchQualifying\s*\(/.test(line) && !/import\s*\{|requireWholePool|read-failure-ok:/.test(line) && !/^\s*\/\//.test(line)) bad.push(`${f}:${i + 1}`); });
  ok("STATIC: no unscoped fetchQualifying call outside lib/onebox.js uses its rows without requireWholePool (or a read-failure-ok: marker)", bad.length === 0, bad.length ? `${bad.length}: ${bad.slice(0, 8).join(" ")}` : ""); }
{ const src = rd("lib/onebox.js"); const bad = [];
  for (const fn of ["houseReceiptsForVehicle", "priceBandForVehicle", "listSalesForVehicle", "anyYearOrSiblingForVehicle"]) {
    const s = src.indexOf(`export async function ${fn}`); const e = src.indexOf("\n}\n", s); const body = src.slice(s, e);
    for (const line of body.split("\n")) if (/await fetchQualifying\(/.test(line) && !/requireWholePool/.test(line)) bad.push(fn);
  }
  ok("STATIC: the four exported readers that call fetchQualifying outside a runOneBox scope all wrap it in requireWholePool", bad.length === 0, bad.length ? [...new Set(bad)].join(" ") : ""); }

console.error = quiet;
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
