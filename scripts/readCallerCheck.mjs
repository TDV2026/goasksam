// Read caller check (Lane B, Nov 2 2026, job lane-b-archiveread, step e). No database, no network: a fake PostgREST records the select list and the User-Agent of every
// archive read. THE CLASS: a visitor's Market Check, the nightly warm, an ops task loop and Find send the IDENTICAL sales_archive statement, so Supabase Query Performance
// (pg_stat_statements) adds them into one row and nobody can say which of them is the 27.9%. Must hold:
//  (1) a read made under a caller carries one constant alias in its select ("via_warm:id") and "User-Agent: goasksam/warm"; different callers send different statement text;
//  (2) the alias is stripped from the rows (single read and every page of the pager) and the pool is row-for-row what an untagged read returns;
//  (3) an untagged read is byte-for-byte what it was (no alias, no User-Agent change), and a table other than sales_archive never gets the alias;
//  (4) the OUTERMOST entry names the work (a partner demo that calls Market Check in-process stays "partner");
//  (5) callerFor names a cron call, a warm call (body.warm), Find, Sell and ops requests;
//  (6) STATIC: withTracking, the ops handler, partnerAnswer, sellNext, sellChat and the warm and build scripts set a caller.
//   node scripts/readCallerCheck.mjs          (LIB_ROOT=<dir holding lib/ and api/> runs it against another tree to show it fails)
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.env.LIB_ROOT ? path.resolve(process.env.LIB_ROOT) : path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const imp = async f => { try { return await import(pathToFileURL(path.join(ROOT, f)).href); } catch { return null; } };
const SB = await imp("lib/_supabase.js"), C = await imp("lib/_caller.js"), E = await imp("lib/onebox.js");
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const quiet = console.error; console.error = () => {};

const mk = i => {
  const raw = { id: "ocd" + i, title: `${1999 + (i % 5)} Porsche 911 Carrera ${i}`, featured_image_url: `https://img.example/${i}.jpg`, mileage: `${20000 + i * 37}`, body_style: "Coupe", modifications: null,
    currency: "USD", transmission: "Manual (6-Speed)", exterior_color: "Black", title_status: "Clean", url: `https://bat.example/${i}`, source_url: `https://src.example/${i}`, city: "Austin", state: "TX", country_code: "US", auction_end_precision: "day" };
  return { id: "uuid-" + String(i).padStart(5, "0"), source_id: raw.id, sale_price: 30000 + (i % 40) * 700, sale_date: new Date(Date.now() - (5 + i) * 864e5).toISOString().slice(0, 10), platform: "Bring a Trailer",
    listing_title: raw.title, year: 1999 + (i % 5), make: "Porsche", model: "911", vin_norm: null, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: false, raw_record: raw, vehicle_type: "car" };
};
const N = 1500, FIX = Array.from({ length: N }, (_, i) => mk(i));
const jt = v => v === null || v === undefined ? null : typeof v === "string" ? v : JSON.stringify(v);
const evalItem = (row, item) => { const ci = item.indexOf(":"); const hasAlias = ci > 0 && item[ci + 1] !== ":"; const alias = hasAlias ? item.slice(0, ci) : null; const expr = hasAlias ? item.slice(ci + 1) : item;
  if (expr.startsWith("raw_record->>")) return [alias || expr.slice(13), jt(row.raw_record[expr.slice(13)])]; const col = expr.replace(/::text$/, ""); return [alias || col, col in row ? row[col] : null]; };
const seen = [];   // { table, select, ua }
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url)); const sel = u.searchParams.get("select") || ""; const h = init.headers || {};
  seen.push({ table: u.pathname.split("/").pop(), select: sel, ua: h["User-Agent"] || null });
  if (!u.pathname.endsWith("/sales_archive")) return new Response("[]", { status: 200 });
  if (u.searchParams.get("id") || /^model$/.test(sel)) return new Response(/^model$/.test(sel) ? JSON.stringify([{ model: "911" }]) : "[]", { status: 200 });
  const m = /^(\d+)-(\d+)$/.exec(h.Range || ""); const from = m ? Number(m[1]) : 0, to = m ? Number(m[2]) : 999;
  const rows = FIX.slice(from, to + 1).map(r => Object.fromEntries(sel.split(",").map(it => evalItem(r, it))));
  return new Response(JSON.stringify(rows), { status: from + rows.length < N ? 206 : 200 });
};
const env = { supabaseUrl: "https://fake.example", supabaseKey: "k", poolColumns: false };
const Q = "sales_archive?select=id,source_id,price:sale_price&make=ilike.Porsche&order=id.asc";
const reads = async () => { seen.length = 0; const one = await SB.supabaseSelect(env, Q + "&limit=3"); const all = await SB.supabaseSelectAll(env, Q); return { one, all, seen: seen.slice() }; };

// (3) untagged
const plain = await reads();
ok("an untagged read is sent as before: no alias in the select, no User-Agent set", plain.seen.length > 0 && plain.seen.every(s => !/via_/.test(s.select) && !s.ua), `${plain.seen.length} requests`);

// (1) + (2)
const tagged = {};
for (const tag of ["warm", "sell", "ops"]) tagged[tag] = C ? await C.runAsCaller(tag, reads) : null;
ok("under runAsCaller('warm') the select carries one constant alias and the call carries User-Agent goasksam/warm", !!tagged.warm && tagged.warm.seen.length > 0 && tagged.warm.seen.every(s => s.select.endsWith(",via_warm:id") && s.ua === "goasksam/warm"), tagged.warm ? tagged.warm.seen[0].select : "no lib/_caller.js");
ok("different callers send different statement text (Query Performance lists them apart)", !!(tagged.warm && tagged.sell && tagged.ops) && new Set([tagged.warm.seen[0].select, tagged.sell.seen[0].select, tagged.ops.seen[0].select, plain.seen[0].select]).size === 4);
ok("the alias is stripped from a single read and from every page of the pager", !!tagged.warm && tagged.warm.one.every(r => !("via_warm" in r)) && tagged.warm.all.every(r => !("via_warm" in r)));
ok("the rows are row-for-row what an untagged read returns", !!tagged.warm && JSON.stringify(tagged.warm.one) === JSON.stringify(plain.one) && JSON.stringify(tagged.warm.all) === JSON.stringify(plain.all), `${tagged.warm && tagged.warm.all.length} rows`);
{ const spec = { make: "Porsche", model: "911", trim: "", year: 2001, yearMin: 1999, yearMax: 2004, excludeVariants: [], genCode: null }, since = new Date(Date.now() - 1825 * 864e5).toISOString();
  const a = E ? await E.fetchQualifying(spec, since, env, {}) : null, b = E && C ? await C.runAsCaller("warm", () => E.fetchQualifying(spec, since, env, {})) : null;
  ok("the engine's pool is identical tagged and untagged (fetchQualifying, every field of every row)", !!a && !!b && a.length > 0 && JSON.stringify(a) === JSON.stringify(b), `${a && a.length} rows`); }

// (3) other tables
seen.length = 0; if (C) await C.runAsCaller("warm", () => SB.supabaseSelect(env, "app_config?select=value&key=eq.x"));
ok("a table other than sales_archive never gets the alias (the User-Agent still names the caller)", !!C && seen.length === 1 && seen[0].select === "value" && seen[0].ua === "goasksam/warm");

// (4) outermost wins
{ let inner = null; if (C) await C.runAsCaller("partner", async () => C.runAsCaller("sell", async () => { inner = C.callerNow(); }));
  ok("the outermost entry names the work: partner, not sell", inner === "partner", `inner saw: ${inner}`); }

// (5) callerFor
{ const f = C && C.callerFor; const r = (route, req) => f ? f(route, req) : null;
  ok("callerFor: a vercel-cron call is cron", r("/api/pullLive", { headers: { "user-agent": "vercel-cron/1.0" } }) === "cron");
  ok("callerFor: a sellerDecision call with body.warm is warm", r("/api/sellerDecision", { headers: {}, body: { warm: true } }) === "warm");
  ok("callerFor: sellerDecision is sell, buySearch is find, usageDashboard is ops, tasks is tasks", r("/api/sellerDecision", { headers: {} }) === "sell" && r("/api/buySearch", { headers: {} }) === "find" && r("/api/usageDashboard", { headers: {} }) === "ops" && r("/api/tasks", { headers: {} }) === "tasks"); }

// (6) STATIC
const rd = f => { try { return fs.readFileSync(path.join(ROOT, f), "utf8"); } catch { return ""; } };
ok("STATIC: withTracking sets the caller for every route it wraps", /runAsCaller\(callerFor\(route, req\)/.test(rd("lib/track/log.js")));
for (const f of ["api/usageDashboard.js", "api/partnerAnswer.js", "api/sellNext.js", "api/sellChat.js"]) ok(`STATIC: ${f}'s default export names its caller`, /export default function handler\(req, res\) \{ return runAsCaller\(/.test(rd(f)));
ok("STATIC: the Market Check warm script and the spec-page build script name their caller", /runAsCaller\("warm"/.test(rd("scripts/warmMarketCheck.js")) && /runAsCaller\("build"/.test(rd("scripts/buildSpecPagesCache.js")));

console.error = quiet;
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
