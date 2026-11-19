// House read check (Lane B, Nov 2 2026, job lane-b-archiveread, step f). No database, no network: a fake PostgREST that fails every archive read. THE CLASS: a reader that
// answers null for a failed read gives the same value it gives for "no input" and "nothing found", so a caller read a failed read as "no house sales" (the Sell house door
// then printed the normal online pick over it) and, in the ops dashboard, a failed read printed as 0 rows. Must hold:
//  (1) houseReceiptsForVehicle and anyYearOrSiblingForVehicle answer { readFailed: true, reason } on a failed read, never null; null still means no input or nothing found;
//  (2) priceBandForVehicle, listSalesForVehicle and the reserve readers carry readFailed on their ok:false;
//  (3) every caller tests the failure: sellerDecision (decision.houseReadFailed and the engine's own line), platformPick (readFailed, no platform, no zero count), sellFlow
//      (head.houseReadFailed), sellChat's probe, the ops class-era probe;
//  (4) an ops task whose read fails answers an error, never a 200 with "0";
//  (5) STATIC: api/usageDashboard.js has no read turned into an empty list without mustRows (or a read-failure-ok: marker that says why), and every caller of the two readers
//      names readFailed within a few lines of the call.
//   node scripts/houseReadCheck.mjs          (LIB_ROOT=<dir holding lib/ and api/> runs it against another tree to show it fails)
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.env.LIB_ROOT ? path.resolve(process.env.LIB_ROOT) : path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const E = await import(pathToFileURL(path.join(ROOT, "lib/onebox.js")).href);
const PP = await import(pathToFileURL(path.join(ROOT, "lib/platformPick.js")).href);
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const quiet = console.error; console.error = () => {};

let mode = "fail";   // fail: every archive read answers a statement timeout; empty: every read answers no rows
globalThis.fetch = async (url) => {
  const u = new URL(String(url));
  if (/\/sales_archive$|\/auction_attempts$|\/app_usage_events$/.test(u.pathname)) {
    if (mode === "fail") return new Response(JSON.stringify({ code: "57014", message: "canceling statement due to statement timeout" }), { status: 500 });
    return new Response("[]", { status: 200 });
  }
  return new Response("[]", { status: 200 });
};
const env = { supabaseUrl: "https://fake.example", supabaseKey: "k", poolColumns: false };
const car = { year: 2001, make: "Porsche", model: "911", trim: "", raw: "2001 Porsche 911" };

// (1)
mode = "fail";
const hr = await E.houseReceiptsForVehicle(car, null, env), ay = await E.anyYearOrSiblingForVehicle(car, null, env);
ok("houseReceiptsForVehicle: a failed read answers { readFailed: true }, not null", !!hr && hr.readFailed === true && typeof hr.reason === "string", JSON.stringify(hr));
ok("anyYearOrSiblingForVehicle: a failed read answers { readFailed: true }, not null", !!ay && ay.readFailed === true, JSON.stringify(ay));
mode = "empty";
const hr0 = await E.houseReceiptsForVehicle(car, null, env), ay0 = await E.anyYearOrSiblingForVehicle(car, null, env);
ok("nothing found stays distinguishable: an empty archive is a result with 0 house sales, and 'no rung found' stays null", !!hr0 && !hr0.readFailed && hr0.houseN === 0 && ay0 === null, `house=${JSON.stringify(hr0 && { houseN: hr0.houseN, totalN: hr0.totalN })} anyYear=${JSON.stringify(ay0)}`);
ok("no input stays null", (await E.houseReceiptsForVehicle(null, null, env)) === null && (await E.anyYearOrSiblingForVehicle({ make: "Porsche" }, null, env)) === null);

// (2)
mode = "fail";
const pb = await E.priceBandForVehicle(car, null, env), ls = await E.listSalesForVehicle(car, null, env);
ok("priceBandForVehicle and listSalesForVehicle: ok:false carries readFailed on a failed read", pb && pb.ok === false && pb.readFailed === true && ls && ls.ok === false && ls.readFailed === true, `band=${JSON.stringify(pb)} list=${JSON.stringify(ls && { ok: ls.ok, readFailed: ls.readFailed })}`);

// (3)
mode = "fail";
const pick = await PP.pickPlatform(car, null, env, { sellerPreference: "auction_house" });
ok("platformPick: a failed house read is readFailed with no platform and no zero count", !!pick && pick.readFailed === true && pick.platform === null && pick.figures && pick.figures.totalHouse === null, JSON.stringify(pick && { mode: pick.mode, platform: pick.platform, readFailed: pick.readFailed, totalHouse: pick.figures && pick.figures.totalHouse }));
mode = "empty";
const pick0 = await PP.pickPlatform(car, null, env, { sellerPreference: "auction_house" });
ok("platformPick: an empty archive is still 'no house sales' (totalHouse 0), not readFailed", !!pick0 && !pick0.readFailed && pick0.figures && pick0.figures.totalHouse === 0);

// (4) an ops task whose read fails
{
  process.env.PROBE_KEY = "k"; process.env.OLDCARSDATA_API_KEY = "x"; process.env.SUPABASE_URL = "https://fake.example"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
  const ud = await import(pathToFileURL(path.join(ROOT, "api/usageDashboard.js")).href);
  const mkRes = () => { const r = { statusCode: 200, body: null, headers: {}, status(c) { r.statusCode = c; return r; }, json(b) { r.body = b; return r; }, setHeader(k, v) { r.headers[k] = v; }, getHeader(k) { return r.headers[k]; }, end() { return r; }, send(b) { r.body = b; return r; } }; return r; };
  mode = "fail";
  const res = mkRes();
  try { await ud.default({ method: "GET", query: { view: "ops", task: "pageviews" }, headers: { "x-ops-key": "k" }, body: {} }, res); } catch (e) { res.thrown = String(e && e.message || e); }
  const zero = res.statusCode === 200 && res.body && res.body.last24h === 0;
  ok("an ops task (pageviews) whose read fails answers an error, never a 200 with 0 rows", !zero && (res.statusCode >= 500 || !!res.thrown), `status=${res.statusCode} thrown=${res.thrown || "-"} body=${JSON.stringify(res.body).slice(0, 90)}`);
}

// (5) STATIC
const rd = f => { try { return fs.readFileSync(path.join(ROOT, f), "utf8"); } catch { return ""; } };
{ const READ_TO_EMPTY = /\bawait\s+(?:_sb)?supabaseSelect(?:All)?\s*\(.*\)\s*\)?\s*(?:\|\||\?\?)\s*\[\]/; const bad = [];
  rd("api/usageDashboard.js").split("\n").forEach((l, i) => { if (READ_TO_EMPTY.test(l) && !/read-failure-ok:/.test(l) && !/mustRows\(/.test(l)) bad.push(i + 1); });
  ok("STATIC: api/usageDashboard.js turns no read into an empty list without mustRows (or a read-failure-ok: marker)", bad.length === 0, bad.length ? `${bad.length}: ${bad.slice(0, 10).join(" ")}` : ""); }
{ const bad = [];
  for (const f of ["api/sellerDecision.js", "api/sellChat.js", "lib/platformPick.js", "api/usageDashboard.js"]) {
    const lines = rd(f).split("\n");
    lines.forEach((l, i) => { if (/await (?:houseReceiptsForVehicle|anyYearOrSiblingForVehicle)\(/.test(l) && !/^\s*\/\//.test(l)) { const win = lines.slice(i, i + 8).join("\n"); if (!/readFailed|isReadFailure/.test(win)) bad.push(`${f}:${i + 1}`); } });
  }
  ok("STATIC: every caller of houseReceiptsForVehicle and anyYearOrSiblingForVehicle tests readFailed within 8 lines", bad.length === 0, bad.join(" ")); }
ok("STATIC: sellerDecision sets houseReadFailed with the engine's own line, and sellFlow carries it to the page", /decision\.houseReadFailed = true; decision\.houseReadFailedLine = reasonLine\(/.test(rd("api/sellerDecision.js")) && /head\.houseReadFailed = true/.test(rd("lib/sell/sellFlow.js")));

console.error = quiet;
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
