// Request-level retry check (Lane B, Nov 2 2026, job lane-b-archiveread, step g). No database, no network: a fake PostgREST fails chosen reads. THE CLASS: after a failed read
// the engine (oneEngineAnswer, once) and the Desk (fetchQ, up to 3 times) ran the WHOLE read again, whatever the failure. A statement timeout is the same query that just cost
// its CPU, so the retry only repeated the load that caused it. Same rule as the page retry: no retry on a timeout or an abort, ONE retry on a network blip. Must hold:
//  (1) oneEngineAnswer, a leg answered 57014: the leg is read once, not again by a second run of the answer;
//  (2) oneEngineAnswer, a leg that fails for a network blip on its first run: the answer runs once more and is served;
//  (3) the Desk fetchQ (executeDsl), a leg answered 57014: no second attempt, the query error is thrown;
//  (4) the Desk, a blip: exactly one more attempt;
//  (5) a failed read says WHY: fetchQualifying's flagged rows carry readKinds (timeout, blip, error).
//   node scripts/readRetryRequestCheck.mjs          (LIB_ROOT=<dir holding lib/> runs it against another tree to show it fails)
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.env.LIB_ROOT ? path.resolve(process.env.LIB_ROOT) : path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const E = await import(pathToFileURL(path.join(ROOT, "lib/onebox.js")).href);
const X = await import(pathToFileURL(path.join(ROOT, "lib/desk/execute.js")).href);
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const quiet = console.error; console.error = () => {};

const mk = i => {
  const raw = { id: "ocd" + i, title: `${1999 + (i % 5)} Porsche 911 Carrera ${i}`, featured_image_url: `https://img.example/${i}.jpg`, mileage: `${20000 + i * 37}`, body_style: "Coupe", modifications: null,
    currency: "USD", transmission: "Manual (6-Speed)", exterior_color: "Black", title_status: "Clean", url: `https://bat.example/${i}`, source_url: `https://src.example/${i}`, city: "Austin", state: "TX", country_code: "US", auction_end_precision: "day" };
  return { id: "uuid-" + String(i).padStart(5, "0"), source_id: raw.id, sale_price: 30000 + (i % 40) * 700, sale_date: new Date(Date.now() - (5 + i) * 864e5).toISOString().slice(0, 10), platform: "Bring a Trailer",
    listing_title: raw.title, year: 1999 + (i % 5), make: "Porsche", model: "911", vin_norm: null, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: false, raw_record: raw, vehicle_type: "car" };
};
const FIX = Array.from({ length: 60 }, (_, i) => mk(i));
const jt = v => v === null || v === undefined ? null : typeof v === "string" ? v : JSON.stringify(v);
const evalItem = (row, item) => { const ci = item.indexOf(":"); const hasAlias = ci > 0 && item[ci + 1] !== ":"; const alias = hasAlias ? item.slice(0, ci) : null; const expr = hasAlias ? item.slice(ci + 1) : item;
  if (expr.startsWith("raw_record->>")) return [alias || expr.slice(13), jt(row.raw_record[expr.slice(13)])]; const col = expr.replace(/::text$/, ""); return [alias || col, col in row ? row[col] : null]; };
// failure script for the TITLE leg (listing_title filter without a model filter): "timeout" always 57014; "blip" a dropped connection for the first N title-leg requests, then served
let failMode = null, failTarget = "title", blipFirst = 0, titleReqs = 0, modelReqs = 0; const perUrl = new Map();
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url)); const sel = u.searchParams.get("select") || "";
  if (!u.pathname.endsWith("/sales_archive") || u.searchParams.get("id") || /^model$/.test(sel)) return new Response(/^model$/.test(sel) ? JSON.stringify([{ model: "911" }, { model: "Cayman" }]) : "[]", { status: 200 });
  const byTitle = !!u.searchParams.get("listing_title") && !u.searchParams.get("model");
  const range = (init.headers || {}).Range || "0-999"; const key = u.search + "|" + range; const nth = (perUrl.get(key) || 0) + 1; perUrl.set(key, nth);
  if (byTitle) titleReqs++; else modelReqs++;
  // title target: the title leg; model target: ONLY the 911 model leg and the Desk's family read (the Desk also reads other queries, which this check does not fail)
  if (failTarget === "title" ? byTitle : (u.searchParams.get("model") === "ilike.*911*" || !!u.searchParams.get("model_family"))) {   // the Desk reads its indexed family first and falls back to the title scan
    if (failMode === "timeout") return new Response(JSON.stringify({ code: "57014" }), { status: 500 });
    if (failMode === "blip" && nth <= blipFirst) throw new TypeError("fetch failed");   // the first N requests of THIS query
  }
  const rows = FIX.map(r => Object.fromEntries(sel.split(",").map(it => evalItem(r, it))));
  return new Response(JSON.stringify(rows), { status: 200 });
};
const env = { supabaseUrl: "https://fake.example", supabaseKey: "k", poolColumns: false };
const car = { year: 2001, make: "Porsche", model: "911", raw: "2001 Porsche 911", trim: "" };
const answer = () => E.oneEngineAnswer(car, null, car.raw, { ...env, asked: 0, noStageLog: true }, null).then(r => r.raw);
const reset = (mode, n = 0, target = "title") => { failMode = mode; failTarget = target; blipFirst = n; titleReqs = 0; modelReqs = 0; perUrl.clear(); };
const maxSame = () => Math.max(0, ...perUrl.values());

// (1) engine, timeout
reset("timeout"); { const d = await answer();
  ok("oneEngineAnswer: a leg answered 57014 is read once: no page retry, and the whole answer is NOT run again", maxSame() === 1, `most requests for one query: ${maxSame()}, tier=${d && d.tier}`);
  ok("... and the answer is still-reading, never a finished one", d && d.tier === "unavailable" && d.readFailed === true); }
// (2) engine, blip: 3 attempts of the page-level retry fail, then the request-level retry serves
reset("blip", 3); { const d = await answer();
  ok("oneEngineAnswer: a dropped connection on the first run is retried ONCE at the request level and the answer is served", /^(result|thin)$/.test(String(d && d.tier)) && maxSame() === 4, `tier=${d && d.tier}, most requests for one query: ${maxSame()}`); }
// (5) why
reset("timeout"); { const rows = await E.fetchQualifying({ make: "Porsche", model: "911", trim: "", year: 2001, yearMin: 1999, yearMax: 2004, excludeVariants: [], genCode: null }, new Date(Date.now() - 1825 * 864e5).toISOString(), env, {});
  ok("a failed read says why: fetchQualifying's flagged rows carry readKinds = timeout", Array.isArray(rows.readKinds) && rows.readKinds.includes("timeout") && !rows.readKinds.includes("blip"), JSON.stringify(rows.readKinds)); }
reset("blip", 99); { const rows = await E.fetchQualifying({ make: "Porsche", model: "911", trim: "", year: 2001, yearMin: 1999, yearMax: 2004, excludeVariants: [], genCode: null }, new Date(Date.now() - 1825 * 864e5).toISOString(), env, {});
  ok("... and a dropped connection is a blip", Array.isArray(rows.readKinds) && rows.readKinds.includes("blip"), JSON.stringify(rows.readKinds)); }

// (3) + (4) the Desk
const dsl = { filters: { make: "Porsche", model: "911" }, measures: ["median"] };
const vehicle = { make: "Porsche", model: "911", year: null, trim: null, raw: "Porsche 911" };
const desk = async () => { try { const r = await X.executeDsl(dsl, env, { vehicle }); return { ok: true, r }; } catch (e) { return { ok: false, e }; } };
reset("timeout", 0, "model"); { const r = await desk();
  ok("Desk fetchQ: a leg answered 57014 is not attempted again (one read, then the query error)", maxSame() === 1 && r.ok && r.r && r.r.ok === false && r.r.reason === "query_error", `most requests for one query: ${maxSame()}, result: ${JSON.stringify(r.ok ? { ok: r.r.ok, reason: r.r.reason } : String(r.e && r.e.message))}`); }
reset("blip", 3, "model"); { const r = await desk();
  ok("Desk fetchQ: a dropped connection gets exactly one more attempt (3 page attempts, then 1 request retry)", r.ok && r.r && r.r.ok !== false && maxSame() === 4, `most requests for one query: ${maxSame()}, result: ${JSON.stringify(r.ok ? { ok: r.r.ok, reason: r.r.reason } : String(r.e && r.e.message))}`); }

console.error = quiet;
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
