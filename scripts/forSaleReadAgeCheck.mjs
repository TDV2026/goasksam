// A DEALER OR CLASSIFIED READ LIVES 7 DAYS (Lane D, lane-d-read-age, Nov 20 2026; Sam's decision). Before: 12 hours, so at the catch up's pace the reads made first went stale before the last were made and pending would have settled near half the groups. Now: data/forsaleBudget.json prepare.read_age_hours 168;
// a read under 7 days old is served and NOT requeued, one older than 7 days is requeued, and a listing whose asking price changes has its read cleared at once (lib/forsale/sync.js; forSaleCheck proves the clearing), so the next prepare run reads it fresh.
// The reads here are the engine's real output (the real specOf and listingMarket over a real archive of Mustang sales, scripts/_mustangWorld.mjs) written by the real prepare job over a stand-in table.
//   node scripts/forSaleReadAgeCheck.mjs [repo root]
import path from "path"; import { fileURLToPath, pathToFileURL } from "url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const imp = f => import(pathToFileURL(path.join(root, f)).href);
const { world } = await imp("scripts/_mustangWorld.mjs");
const W = await world(root), unquiet = W.quiet(), WORLD = W.fetch;
const { S, P, env, vehicle } = W, SV = await imp("lib/forsale/serve.js"), E = await imp("lib/onebox.js");
const spec = await S.specOf(env, W.listing(null), S.listingFacts(W.listing(null)), vehicle);
const car = { key: spec.key, name: "1965 Ford Mustang", year: 1965, make: "Ford", model: "Mustang", engine_version: E.ENGINE_VERSION };
const TABLE = Array.from({ length: 3 }, (_, i) => ({ id: i + 1, source: "streetside", source_type: "dealer", source_listing_id: "L" + i, title: "1965 Ford Mustang", year: 1965, make: "Ford", model: "Mustang", asking_price_usd: 30000, mileage: null, location: "Greenland, NH", url: "https://x/" + i, gone: false, hidden: false, status: "active", last_seen: new Date().toISOString(), resolve_state: "resolved", car, car_key: spec.key, read: null, history: null, vin_norm: null }));
const jget = (r, p) => { const [a, b] = p.split("->>"); const v = r[a]; return b == null ? v : v == null ? null : v[b]; };
globalThis.fetch = async (url, init) => {
  const u = new URL(String(url)), method = (init && init.method) || "GET";
  if (!u.pathname.endsWith("/for_sale_listings")) return /app_usage_events|search_events/.test(u.pathname) ? new Response("[]", { status: 200 }) : WORLD(url, init);
  let out = TABLE;
  for (const [k, v] of u.searchParams) { if (["select", "order", "limit", "or"].includes(k)) continue; const m = /^(eq|neq|gt|lt|is|not\.is|in)\.(.*)$/.exec(v); if (!m) continue; const [, op, val] = m;
    out = out.filter(r => { const x = jget(r, k); if (op === "eq") return String(x) === val; if (op === "neq") return String(x) !== val; if (op === "gt") return Number(x) > Number(val); if (op === "lt") return String(x) < val; if (op === "is") return val === "null" ? x == null : String(x) === val; if (op === "not.is") return val === "null" ? x != null : true; if (op === "in") return val.replace(/^\(|\)$/g, "").split(",").includes(String(x)); return true; }); }
  const orp = decodeURIComponent(u.searchParams.get("or") || "");
  if (/^\(read\.is\.null,/.test(orp)) { const ver = /engine_version\.neq\.([^,]+),/.exec(orp)[1], lt = /at\.lt\.([^)]+)\)$/.exec(orp)[1]; out = out.filter(r => r.read == null || r.read.engine_version !== ver || String(r.read.at) < lt); }
  if (/^\(resolve_state\.is\.null,/.test(orp)) out = out.filter(r => r.resolve_state == null);
  if (method === "PATCH") { const body = JSON.parse(init.body); for (const r of out) Object.assign(r, body); return new Response("[]", { status: 200 }); }
  if (method === "HEAD") return new Response("", { status: 200, headers: { "content-range": `0-0/${out.length}` } });
  const lim = Math.min(Number(u.searchParams.get("limit")) || 1000, 1000); return new Response(JSON.stringify(out.slice().sort((a, b) => a.id - b.id).slice(0, lim)), { status: 200 });
};
const calls = { reads: 0 };
const engine = { specOf: async () => spec, listingMarket: async (e, lr, facts, o) => { calls.reads++; return S.listingMarket(e, lr, facts, { ...o, noBlock: true, notTracked: true, vehicle }); }, seenBefore: async () => null };
const run = async () => P.prepareForSale(env, { noLease: true, onePass: true, budgetMs: 20000, engine });
const settle = async () => { for (let t = 0; t < 14 && TABLE.some(r => !r.read); t++) { await run(); if (TABLE.some(r => !r.read)) await new Promise(r => setTimeout(r, 700)); } };
await settle();
const first = TABLE[0].read;
ok("the real engine's read lands on every listing of the car (one read for the group)", TABLE.every(r => r.read && r.read.sold_line && r.read.engine_version === E.ENGINE_VERSION), JSON.stringify(first && first.sold_line));
const hoursAgo = h => new Date(Date.now() - h * 3600e3).toISOString(), setAge = h => TABLE.forEach(r => { r.read = { ...r.read, at: hoursAgo(h) }; });
// a read under 7 days old: served, not requeued
for (const h of [13, 72, 160]) {
  setAge(h); calls.reads = 0; const o = await run(); const at = TABLE[0].read.at, card = SV.cardOf({ r: { _fs: TABLE[0] } });
  ok(`a read ${h} hours old is kept: no engine read, nothing requeued, the stamp untouched`, calls.reads === 0 && o.readCalls === 0 && o.reads === 0 && TABLE.every(r => r.read.at === at && Date.now() - Date.parse(r.read.at) > (h - 1) * 3600e3), JSON.stringify([calls.reads, o.readCalls]));
  ok(`a read ${h} hours old is SERVED with the engine's own words (the holding line is for a read that has not landed)`, card.readKind !== "pending" && card.read.includes(first.sold_line) && !/on its way/.test(card.read), card.read);
}
// older than 7 days: requeued and made again
setAge(24 * 8); calls.reads = 0; await settle(); await run();
const stale = TABLE.filter(r => Date.now() - Date.parse(r.read && r.read.at) > 7 * 864e5).length;
setAge(24 * 8); calls.reads = 0; for (let t = 0; t < 14 && TABLE.some(r => Date.now() - Date.parse(r.read.at) > 3600e3); t++) { await run(); if (TABLE.some(r => Date.now() - Date.parse(r.read.at) > 3600e3)) await new Promise(r => setTimeout(r, 700)); }
ok("a read 8 days old is requeued and made again by the engine (one read for the three listings of the car), the stamp fresh, the words the engine's", calls.reads >= 1 && TABLE.every(r => Date.now() - Date.parse(r.read.at) < 3600e3 && r.read.sold_line === first.sold_line), JSON.stringify([calls.reads, stale]));
// a price change: the sync clears the read (forSaleCheck proves that); the next run reads it fresh at once
TABLE[1].read = null; calls.reads = 0; await settle();
ok("a listing whose read the price change cleared is read again by the next run, without waiting for the age", !!TABLE[1].read && Date.now() - Date.parse(TABLE[1].read.at) < 3600e3 && calls.reads >= 1);
const RWm = await imp("lib/forsale/prepare.js");
ok("the age is a setting: 168 hours in data/forsaleBudget.json (prepare.read_age_hours), not a constant in the code", RWm.READ_MAX_AGE_MS === 168 * 3600e3 && /"read_age_hours": 168/.test((await import("fs")).readFileSync(path.join(root, "data/forsaleBudget.json"), "utf8")));
unquiet();
console.log(failed ? `\n${failed} FAILED` : "\nall pass"); process.exit(failed ? 1 : 0);
