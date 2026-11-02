// Read abort check (Lane B, Nov 2 2026, job lane-b-archiveread, step d). No database, no network: a fake PostgREST holds each archive query open and reports which were
// aborted. THE CLASS: the callers that race the engine against a deadline (Find 25 s, the direction question 3 s, Sell's cap, Market Check's deadline) gave up on the
// answer but left its archive reads running: a Promise.race loser is not cancelled. A read nobody is waiting for kept up to 6 pages x 3 attempts of database CPU going.
// Must hold:
//  (1) a caller that passes env.signal and aborts stops the reads in flight and starts no new page;
//  (2) the engine's answer under an abort is not a finished answer (unavailable, never stored);
//  (3) a SHARED flight is not killed by one caller's abort: another caller waiting on the same answer still gets it, and no read is aborted;
//  (4) when every caller aborts, the flight's reads do stop;
//  (5) a single supabaseSelect honours env.signal too;
//  (6) STATIC: every Promise.race that gives up on oneEngineAnswer (search.js, narrow.js, sellBlock.js, sellerDecision.js) passes a signal and aborts it in its timeout, and the
//      Market Check cold-store path (the compute that keeps running after the handoff) is the one place that does not abort.
//   node scripts/readAbortCheck.mjs          (LIB_ROOT=<dir holding lib/ and api/> runs it against another tree to show it fails)
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.env.LIB_ROOT ? path.resolve(process.env.LIB_ROOT) : path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const E = await import(pathToFileURL(path.join(ROOT, "lib/onebox.js")).href);
const SB = await import(pathToFileURL(path.join(ROOT, "lib/_supabase.js")).href);
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const quiet = console.error; console.error = () => {};

const mk = i => {
  const raw = { id: "ocd" + i, title: `${1999 + (i % 5)} Porsche 911 Carrera ${i}`, featured_image_url: `https://img.example/${i}.jpg`, mileage: `${20000 + i * 37}`, body_style: "Coupe", modifications: null,
    currency: "USD", transmission: "Manual (6-Speed)", exterior_color: "Black", title_status: "Clean", url: `https://bat.example/${i}`, source_url: `https://src.example/${i}`, city: "Austin", state: "TX", country_code: "US", auction_end_precision: "day" };
  return { id: "uuid-" + String(i).padStart(5, "0"), source_id: raw.id, sale_price: 30000 + (i % 40) * 700, sale_date: new Date(Date.now() - (5 + i) * 864e5).toISOString().slice(0, 10), platform: "Bring a Trailer",
    listing_title: raw.title, year: 1999 + (i % 5), make: "Porsche", model: "911", vin_norm: null, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: false, raw_record: raw, vehicle_type: "car" };
};
const FIX = Array.from({ length: 2200 }, (_, i) => mk(i));
const jt = v => v === null || v === undefined ? null : typeof v === "string" ? v : JSON.stringify(v);
const evalItem = (row, item) => { const ci = item.indexOf(":"); const hasAlias = ci > 0 && item[ci + 1] !== ":"; const alias = hasAlias ? item.slice(0, ci) : null; const expr = hasAlias ? item.slice(ci + 1) : item;
  if (expr.startsWith("raw_record->>")) return [alias || expr.slice(13), jt(row.raw_record[expr.slice(13)])]; const col = expr.replace(/::text$/, ""); return [alias || col, col in row ? row[col] : null]; };
const log = { started: 0, aborted: 0, completed: 0, startedAfterAbort: 0 }; let abortedAt = 0; let HOLD_MS = 250;
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url)); const sel = u.searchParams.get("select") || "";
  if (!u.pathname.endsWith("/sales_archive") || u.searchParams.get("id") || /^model$/.test(sel)) return new Response(/^model$/.test(sel) ? JSON.stringify([{ model: "911" }]) : "[]", { status: 200 });
  log.started++; if (abortedAt && Date.now() > abortedAt) log.startedAfterAbort++;
  try {
    await new Promise((res, rej) => { const t = setTimeout(res, HOLD_MS); init.signal && init.signal.addEventListener("abort", () => { clearTimeout(t); rej(Object.assign(new Error("aborted"), { name: "AbortError" })); }, { once: true }); });
  } catch (e) { log.aborted++; throw e; }
  log.completed++;
  const m = /^(\d+)-(\d+)$/.exec((init.headers || {}).Range || ""); const from = m ? Number(m[1]) : 0, to = m ? Number(m[2]) : 999;
  const rows = FIX.slice(from, to + 1).map(r => Object.fromEntries(sel.split(",").map(it => evalItem(r, it))));
  return new Response(JSON.stringify(rows), { status: from + rows.length < FIX.length ? 206 : 200 });
};
const reset = () => { Object.assign(log, { started: 0, aborted: 0, completed: 0, startedAfterAbort: 0 }); abortedAt = 0; };
const base = { supabaseUrl: "https://fake.example", supabaseKey: "k", poolColumns: false, asked: 0, noStageLog: true };
const cars = [{ year: 2001, make: "Porsche", model: "911", raw: "2001 Porsche 911", trim: "" }, { year: 2002, make: "Porsche", model: "911", raw: "2002 Porsche 911", trim: "" }];
const answer = (env, n = 0) => E.oneEngineAnswer(cars[n], null, cars[n].raw, { ...base, ...env }, null).then(r => r.raw);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// (1) + (2)
reset();
{ const ac = new AbortController(); const p = answer({ signal: ac.signal }, 0);
  await sleep(80); abortedAt = Date.now(); ac.abort();
  const t0 = Date.now(); const d = await p; await sleep(HOLD_MS + 100);
  ok("a caller that aborts: the archive reads in flight are aborted", log.aborted > 0, `aborted: ${log.aborted}, completed: ${log.completed}`);
  ok("... and no new page is started after the abort", log.startedAfterAbort === 0, `started after: ${log.startedAfterAbort}`);
  ok("... and the answer under an abort is not a finished answer (never result or thin)", !/^(result|thin)$/.test(String(d && d.tier)), `tier=${d && d.tier} in ${Date.now() - t0} ms`); }

// (3) a shared flight is not killed by one caller's abort
reset();
{ const ac = new AbortController(); const a = answer({ signal: ac.signal }, 1); const b = answer({}, 1);
  await sleep(80); ac.abort();
  const [da, db] = await Promise.all([a, b]);
  ok("one caller aborts a shared flight: the other caller still gets the real answer", /^(result|thin)$/.test(String(db && db.tier)), `caller B tier=${db && db.tier}`);
  ok("... and no read of the shared flight was aborted", log.aborted === 0, `aborted: ${log.aborted}`); }

// (4) every caller aborts
reset();
{ const a1 = new AbortController(), a2 = new AbortController(); const p1 = answer({ signal: a1.signal }, 0), p2 = answer({ signal: a2.signal }, 0);
  await sleep(80); abortedAt = Date.now(); a1.abort(); await sleep(20); a2.abort(); await Promise.all([p1, p2]); await sleep(HOLD_MS + 100);
  ok("when every caller on a flight aborts, its reads stop", log.aborted > 0 && log.startedAfterAbort === 0, `aborted: ${log.aborted}, started after: ${log.startedAfterAbort}`); }

// (5) a single read
reset();
{ const ac = new AbortController(); const p = SB.supabaseSelect({ supabaseUrl: "https://fake.example", supabaseKey: "k", signal: ac.signal }, "sales_archive?select=id&limit=1");
  await sleep(40); ac.abort(); const r = await p;
  ok("a single supabaseSelect honours env.signal: aborted, returns null", r === null && log.aborted === 1, `aborted: ${log.aborted}`); }

// (6) STATIC
const rd = f => { try { return fs.readFileSync(path.join(ROOT, f), "utf8"); } catch { return ""; } };
for (const f of ["lib/live/search.js", "lib/live/narrow.js", "lib/sell/sellBlock.js", "api/sellerDecision.js"]) {
  const lines = rd(f).split("\n"); const bad = [];
  lines.forEach((l, i) => { if (/oneEngineAnswer\(/.test(l) && /Promise\.race|engineP =|const a2 = await/.test(l) && !/import /.test(l)) { const win = lines.slice(Math.max(0, i - 2), i + 10).join("\n"); if (!/signal/.test(win) || !/\.abort\(\)/.test(win)) bad.push(`${f}:${i + 1}`); } });
  const raced = lines.filter(l => /oneEngineAnswer\(/.test(l) && /Promise\.race|engineP =|const a2 = await/.test(l)).length;
  ok(`STATIC: ${f}: every race that gives up on oneEngineAnswer passes a signal and aborts it`, raced > 0 && bad.length === 0, bad.length ? bad.join(" ") : `${raced} race(s)`);
}
ok("STATIC: Market Check's cold-store path (compute continues after the handoff) is the one place that does not abort", /const engineAc = coldStore \? null : new AbortController\(\)/.test(rd("api/sellerDecision.js")));

console.error = quiet;
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
