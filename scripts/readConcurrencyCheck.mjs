// Read concurrency check (Lane B, Nov 2 2026, job lane-b-archiveread, step c). No database, no network: a fake PostgREST counts the archive queries in flight at once.
// THE CLASS: one engine request put up to ~18 archive queries in flight (6 pages at a time, times the model, title and chassis-alias legs running together), and a
// deep OFFSET page costs more than a shallow one; a burst of requests filled the database's CPU. Must hold:
//  (1) the pager keeps at most PAGE_CONCURRENCY (default 2) pages in flight, and returns every row in order;
//  (2) one fetchQualifying call with three legs (model, title, chassis code) never has more than that many archive queries in flight in all;
//  (3) the legs run in the order the union is built, and the first leg that fails stops the rest (no query for a leg after a failed one);
//  (4) the pool is the same: each fixture row once, none invented, nearly all kept (the cross-tree equality of the ids is shown in the READY line).
//   node scripts/readConcurrencyCheck.mjs          (LIB_ROOT=<dir holding lib/> runs it against another tree to show it fails)
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.env.LIB_ROOT ? path.resolve(process.env.LIB_ROOT) : path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SB = await import(pathToFileURL(path.join(ROOT, "lib/_supabase.js")).href);
const E = await import(pathToFileURL(path.join(ROOT, "lib/onebox.js")).href);
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const quiet = console.error; console.error = () => {};
const LIMIT = SB.PAGE_CONCURRENCY ?? 6;   // the base tree has no export: it ran 6

const mk = i => {
  const raw = { id: "ocd" + i, title: `${1999 + (i % 5)} Porsche 911 Carrera ${i}`, featured_image_url: `https://img.example/${i}.jpg`, mileage: `${20000 + i * 37}`, body_style: "Coupe", modifications: null,
    currency: "USD", transmission: "Manual (6-Speed)", exterior_color: "Black", title_status: "Clean", url: `https://bat.example/${i}`, source_url: `https://src.example/${i}`, city: "Austin", state: "TX", country_code: "US", auction_end_precision: "day" };
  return { id: "uuid-" + String(i).padStart(5, "0"), source_id: raw.id, sale_price: 30000 + (i % 40) * 700, sale_date: new Date(Date.now() - (5 + i) * 864e5).toISOString().slice(0, 10), platform: "Bring a Trailer",
    listing_title: raw.title, year: 1999 + (i % 5), make: "Porsche", model: "911", vin_norm: null, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: false, raw_record: raw, vehicle_type: "car" };
};
const N = 3300;   // four pages a leg
const FIX = Array.from({ length: N }, (_, i) => mk(i));
const jt = v => v === null || v === undefined ? null : typeof v === "string" ? v : JSON.stringify(v);
const evalItem = (row, item) => { const ci = item.indexOf(":"); const hasAlias = ci > 0 && item[ci + 1] !== ":"; const alias = hasAlias ? item.slice(0, ci) : null; const expr = hasAlias ? item.slice(ci + 1) : item;
  if (expr.startsWith("raw_record->>")) return [alias || expr.slice(13), jt(row.raw_record[expr.slice(13)])]; const col = expr.replace(/::text$/, ""); return [alias || col, col in row ? row[col] : null]; };
let inflight = 0, maxInflight = 0, failLeg = null; const legsSeen = [];
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url)); const sel = u.searchParams.get("select") || "";
  if (!u.pathname.endsWith("/sales_archive") || u.searchParams.get("id") || /^model$/.test(sel)) return new Response(/^model$/.test(sel) ? JSON.stringify([{ model: "911" }, { model: "997" }]) : "[]", { status: 200 });
  const m = /^(\d+)-(\d+)$/.exec((init.headers || {}).Range || ""); const from = m ? Number(m[1]) : 0, to = m ? Number(m[2]) : 999;
  const pat = String(u.searchParams.get("model") || u.searchParams.get("listing_title") || "").replace(/^ilike\./, "");
  const leg = (u.searchParams.get("model") ? "model:" : "title:") + pat; if (from === 0) legsSeen.push(leg);
  inflight++; maxInflight = Math.max(maxInflight, inflight);
  try {
    await new Promise(r => setTimeout(r, 15));
    if (failLeg && leg === failLeg) return new Response(JSON.stringify({ code: "57014" }), { status: 500 });
    const rows = FIX.slice(from, to + 1).map(r => Object.fromEntries(sel.split(",").map(it => evalItem(r, it))));
    return new Response(JSON.stringify(rows), { status: from + rows.length < N ? 206 : 200 });
  } finally { inflight--; }
};
const env = { supabaseUrl: "https://fake.example", supabaseKey: "k", poolColumns: false };
const since = new Date(Date.now() - 1825 * 864e5).toISOString();
const spec = () => ({ make: "Porsche", model: "911", trim: "", year: 2001, yearMin: 1999, yearMax: 2004, excludeVariants: [], genCode: "997" });

// (1) the pager
maxInflight = 0;
{ const got = await SB.supabaseSelectAll(env, "sales_archive?select=id&make=ilike.Porsche&model=ilike.*911*&order=id.asc");
  ok(`the pager keeps at most ${LIMIT} pages in flight (the default is 2; the base ran 6)`, maxInflight <= 2, `max in flight: ${maxInflight}`);
  ok("... and returns every row", Array.isArray(got) && got.length === N, `rows: ${got && got.length}`); }

// (2) + (4) one fetchQualifying, three legs
maxInflight = 0; legsSeen.length = 0;
const rows = await E.fetchQualifying(spec(), since, env, {});
ok("one fetchQualifying with three legs (model, title, chassis code) never has more than 2 archive queries in flight in all", maxInflight <= 2, `max in flight: ${maxInflight}, legs: ${legsSeen.length}`);
ok("the legs ran in the order the union is built: model 911, then the title, then the chassis code", legsSeen.length === 3 && /^model:\*911\*$/.test(legsSeen[0]) && /^title:\*911\*$/.test(legsSeen[1]) && /^model:\*997\*$/.test(legsSeen[2]), legsSeen.join(" | "));
const ids = rows.map(r => r.id), known = new Set(FIX.map(r => r.id));
ok("the pool holds each fixture row at most once, every row is a fixture row, and the engine kept nearly all of them (its own dedup and fences drop a few)", ids.length === new Set(ids).size && ids.every(id => known.has(id)) && ids.length >= N * 0.99, `rows: ${ids.length} of ${N}, distinct: ${new Set(ids).size}`);

// (3) the first failed leg stops the rest
maxInflight = 0; legsSeen.length = 0; failLeg = "model:*911*";
{ const d = {}; const r = await E.fetchQualifying(spec(), since, env, d);
  ok("the model leg fails: the title and chassis-code legs are never queried", legsSeen.length === 1 && d.queryError === true, `legs queried: ${legsSeen.join(" | ")}`); }

console.error = quiet;
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
