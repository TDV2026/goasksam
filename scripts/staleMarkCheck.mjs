// e99: mark stale, never delete. Ingest marks touched core rows (market.staleSince) and deletes none; a marked row serves at once as the answer and the refresh runs behind and writes the fresh row.
//   node scripts/staleMarkCheck.mjs [repo root]
import path from "path";
import fs from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import { SPEC_V } from "../lib/live/search.js";   // the stored core's version comes from the engine, never a number of this file's own
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const ev = (row, it) => { const ci = it.indexOf(":"); const alias = ci > 0 && it[ci + 1] !== ":" ? it.slice(0, ci) : null; const expr = alias ? it.slice(ci + 1) : it; if (expr.startsWith("raw_record->>")) { const k = expr.slice(13); const v = row.raw_record[k]; return [alias || k, v == null ? null : String(v)]; } return [alias || expr, row[expr] === undefined ? null : row[expr]]; };
const likeRe = v => new RegExp("^" + String(v).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
let rows = [], n = 0;
const sale = (year, date, price, hr) => { n++; rows.push({ id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), source_id: "sf" + n, sale_price: price, sale_date: date, platform: "Bring a Trailer", source_slug: "bringatrailer", make: "Datsun", model: "240Z", year,
  listing_title: `${year} Datsun 240Z`, vin_norm: "V" + n, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: hr, vehicle_type: "car", sale_price_usd: price,
  raw_record: { featured_image_url: "https://x/i.jpg", mileage: String(globalThis.__MI != null ? globalThis.__MI : 60000), body_style: null, modifications: null, title: `${year} Datsun 240Z`, currency: "USD", transmission: null, exterior_color: null, title_status: null, url: "https://u/" + n, source_url: null, city: "Austin", state: "TX", country_code: "US", auction_end_precision: null } }); };
// a stateful spec_market_cache: select, post (upsert), patch, delete
const table = new Map(); let deletes = 0, patches = 0, posts = 0, archiveReads = 0;
globalThis.fetch = async (url, init) => {
  const u = new URL(String(url)), m = (init && init.method) || "GET";
  if (u.pathname.endsWith("/sales_archive")) {
    archiveReads++;
    const sp = u.searchParams, sel = sp.get("select"), sd = sp.getAll("sale_date");
    const ge = sd.filter(v => v.startsWith("gte.")).map(v => v.slice(4)), lt = sd.filter(v => v.startsWith("lt.")).map(v => v.slice(3));
    const ys = sp.getAll("year"), ymin = Number((ys.find(v => v.startsWith("gte.")) || "gte.0").slice(4)), ymax = Number((ys.find(v => v.startsWith("lte.")) || "lte.9999").slice(4));
    const mk = sp.get("make") && likeRe(sp.get("make").replace(/^ilike\./, "")), md = sp.get("model") && likeRe(sp.get("model").replace(/^ilike\./, "")), ti = sp.get("listing_title") && likeRe(sp.get("listing_title").replace(/^ilike\./, ""));
    const keep = rows.filter(r => (!ge.length || r.sale_date >= ge[0]) && (!lt.length || r.sale_date < lt[0]) && r.year >= ymin && r.year <= ymax && (!mk || mk.test(r.make)) && (!md || md.test(r.model)) && (!ti || ti.test(r.listing_title)));
    return new Response(JSON.stringify(keep.map(r => Object.fromEntries(sel.split(",").map(it => ev(r, it))))), { status: 200 });
  }
  if (u.pathname.endsWith("/spec_market_cache")) {
    const q = decodeURIComponent(u.search);
    if (m === "DELETE") { deletes++; const k = (/spec_key=eq\.(.+?)(&|$)/.exec(q) || [])[1]; if (k) table.delete(k); return new Response(null, { status: 204 }); }
    if (m === "PATCH") { patches++; const k = (/spec_key=eq\.(.+?)(&|$)/.exec(q) || [])[1]; const body = JSON.parse(init.body); if (table.has(k)) table.set(k, { ...table.get(k), ...body }); return new Response(null, { status: 204 }); }
    if (m === "POST") { posts++; for (const r of JSON.parse(init.body)) table.set(r.spec_key, r); return new Response("[]", { status: 201 }); }
    const sel = u.searchParams.get("select") || "";
    const ein = /spec_key=in\.\((.*)\)/.exec(q), eeq = /spec_key=eq\.(.+?)(&|$)/.exec(q);
    let keys = [];
    if (ein) keys = [...ein[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(x => x[1].replace(/\\"/g, '"')); else if (eeq) keys = [eeq[1]]; else keys = [...table.keys()];
    const pick = keys.map(k => table.get(k)).filter(Boolean).map(r => Object.fromEntries(sel.split(",").filter(Boolean).map(f => [f, r[f]])));
    return new Response(JSON.stringify(pick), { status: 200 });
  }
  if (u.hostname.includes("fake.supabase")) return new Response("[]", { status: 200 });
  throw new Error("offline");
};
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
const day = i => new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
const SM = await import(pathToFileURL(path.join(root, "lib/_staleMark.js")).href).catch(() => null);
ok("lib/_staleMark.js exists", !!SM);
const S = await import(pathToFileURL(path.join(root, "lib/live/search.js")).href);
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
// 1. ingest on a fixture delta: touched rows are marked and kept, nothing is deleted, other rows are untouched
const now = new Date().toISOString();
const k1 = JSON.stringify(["Datsun", "240Z", null, null, null, null]), k2 = JSON.stringify(["Datsun", "240Z", null, 1972, null, null]), k3 = JSON.stringify(["Ford", "GT", null, 2005, null, null]), k4 = "MCWARM:" + k1;
for (const k of [k1, k2, k3, k4]) table.set(k, { spec_key: k, market: { v: SPEC_V, engineVersion: E.ENGINE_VERSION, kind: "range", low: 1, high: 2, count: 9 }, computed_at: now });
const src = fs.readFileSync(path.join(root, "scripts/ingest.js"), "utf8");
ok("ingest.js never deletes a stored answer", !/supabaseDelete|method:\s*"DELETE"/.test(src) && /markTouchedStale/.test(src));
if (SM) {
  const r = await SM.markTouchedStale(env, SM.touchedSetOf([{ make: "Datsun", model: "240Z" }]), now);
  ok("the two Datsun core rows are marked stale and kept", table.get(k1).market.staleSince === now && table.get(k2).market.staleSince === now && r.marked === 2 && r.deleted === 0, JSON.stringify({ marked: r.marked, deleted: r.deleted }));
  ok("no row was deleted", deletes === 0 && table.size === 4);
  ok("the Ford row and the Market Check row are untouched", !table.get(k3).market.staleSince && !table.get(k4).market.staleSince);
  ok("the figures of a marked row are unchanged", table.get(k1).market.low === 1 && table.get(k1).market.count === 9);
}
// 2. a marked row serves at once as the answer, the refresh runs behind and writes the fresh row
rows = []; for (let i = 0; i < 12; i++) sale(1972, day(10 + i * 9), 30000 + i * 1000, null);
const vehicle = { make: "Datsun", model: "240Z", trim: "", year: 1972, bodyStyle: null };
const lrow = { id: "l1", listing_title: "1972 Datsun 240Z", year: 1972, make: "Datsun", model: "240Z" };
const facts = S.listingFacts({ ...lrow, mileage: 50000 });
const spec = await S.specOf(env, lrow, facts, vehicle);
table.clear(); archiveReads = 0; posts = 0;
const marked = { v: SPEC_V, engineVersion: E.ENGINE_VERSION, kind: "range", low: 111000, high: 222000, count: 9, family: "1972 240Z", staleSince: now };
table.set(spec.key, { spec_key: spec.key, market: marked, computed_at: now });
const t0 = Date.now();
const m = await S.listingMarket(env, lrow, facts, { noBlock: true, notTracked: true, vehicle });
const took = Date.now() - t0;
ok("a marked row answers at once with its stored range", m && m.kind === "range" && m.low === 111000 && m.high === 222000, JSON.stringify(m && { kind: m.kind, low: m.low, high: m.high }));
ok("the answer says it is stale in the engine's words", m && m.stale === true && typeof m.staleLine === "string" && /^Sales read on .+, newer sales are being added\.$/.test(m.staleLine), String(m && m.staleLine));
ok("it answered before any pool read", archiveReads === 0 && took < 1500, `reads ${archiveReads}, ${took} ms`);
await new Promise(r => setTimeout(r, 2500));
const after = table.get(spec.key);
ok("the refresh behind the response wrote the fresh row (no mark, new figures)", !!after && !after.market.staleSince && after.market.low !== 111000, JSON.stringify(after && { stale: after.market.staleSince || null, low: after.market.low }));
ok("nothing was deleted by the serve path", deletes === 0);
process.exit(failed ? 1 : 0);
