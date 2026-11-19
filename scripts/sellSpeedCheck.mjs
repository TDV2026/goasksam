// Sell speed (Lane B, Oct 26 2026): a Sell visit makes ONE engine call at most, and no fetchQualifying of its own.
//   cold   no block, no stored answer: one engine call; the sales_archive reads equal one bare engine answer's
//   stored  the stored Market Check answer exists (the nightly warm wrote it): zero engine calls, zero archive reads
//   block   the car-only block exists: zero engine calls, zero archive reads, zero stored-answer reads
// No database: a fake archive and a fake spec_market_cache.   node scripts/sellSpeedCheck.mjs [repo root]
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const ev = (row, it) => { const ci = it.indexOf(":"); const alias = ci > 0 && it[ci + 1] !== ":" ? it.slice(0, ci) : null; const expr = alias ? it.slice(ci + 1) : it; if (expr.startsWith("raw_record->>")) { const k = expr.slice(13); const v = row.raw_record[k]; return [alias || k, v == null ? null : String(v)]; } return [alias || expr, row[expr] === undefined ? null : row[expr]]; };
const likeRe = v => new RegExp("^" + String(v).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
let rows = [], n = 0;
const sale = (year, date, price, hr) => { n++; rows.push({ id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), source_id: "sf" + n, sale_price: price, sale_date: date, platform: "Bring a Trailer", source_slug: "bringatrailer", make: "Datsun", model: "240Z", year,
  listing_title: `${year} Datsun 240Z`, vin_norm: "V" + n, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: hr, vehicle_type: "car", sale_price_usd: price,
  raw_record: { featured_image_url: "https://x/i.jpg", mileage: "60000", body_style: null, modifications: null, title: `${year} Datsun 240Z`, currency: "USD", transmission: null, exterior_color: null, title_status: null, url: "https://u/" + n, source_url: null, city: "Austin", state: "TX", country_code: "US", auction_end_precision: null } }); };
const store = new Map(); let archiveReads = 0;
globalThis.fetch = async (url, opts) => {
  const u = new URL(String(url));
  if (u.pathname.endsWith("/sales_archive")) {
    archiveReads++;
    const sp = u.searchParams, sel = sp.get("select"), sd = sp.getAll("sale_date");
    const ge = sd.filter(v => v.startsWith("gte.")).map(v => v.slice(4)), lt = sd.filter(v => v.startsWith("lt.")).map(v => v.slice(3));
    const ys = sp.getAll("year"), ymin = Number((ys.find(v => v.startsWith("gte.")) || "gte.0").slice(4)), ymax = Number((ys.find(v => v.startsWith("lte.")) || "lte.9999").slice(4));
    const mk = sp.get("make") && likeRe(sp.get("make").replace(/^ilike\./, "")), md = sp.get("model") && likeRe(sp.get("model").replace(/^ilike\./, "")), ti = sp.get("listing_title") && likeRe(sp.get("listing_title").replace(/^ilike\./, ""));
    const keep = rows.filter(r => (!ge.length || r.sale_date >= ge[0]) && (!lt.length || r.sale_date < lt[0]) && r.year >= ymin && r.year <= ymax && (!mk || mk.test(r.make)) && (!md || md.test(r.model)) && (!ti || ti.test(r.listing_title)));
    return new Response(JSON.stringify(keep.map(r => Object.fromEntries(sel.split(",").map(it => ev(r, it))))), { status: 200 });
  }
  if (u.hostname.includes("fake.supabase")) {
    if (u.pathname.endsWith("/spec_market_cache")) {
      if ((opts && opts.method) === "POST") { for (const r of JSON.parse(opts.body)) store.set(r.spec_key, { market: r.market, computed_at: r.computed_at }); return new Response("", { status: 201 }); }
      const k = (u.searchParams.get("spec_key") || "").replace(/^eq\./, "");
      return new Response(JSON.stringify(store.has(k) ? [store.get(k)] : []), { status: 200 });
    }
    return new Response("[]", { status: 200 });
  }
  throw new Error("offline");
};
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
const today = new Date(); const day = (i) => new Date(today.getTime() - i * 864e5).toISOString().slice(0, 10);
for (let i = 0; i < 12; i++) sale(1972, day(10 + i * 3), 30000 + i * 300, i % 2 === 0);
const { buildResult } = await import(pathToFileURL(path.join(root, "lib/sell/sellFlow.js")).href);
const text = "1972 Datsun 240Z";
// the baseline: one bare engine answer's archive reads
archiveReads = 0;
await E.oneEngineAnswer({ make: "Datsun", model: "240Z", trim: "", year: 1972, bodyStyle: null }, null, text, { ...env, asked: 0 }, null);
const baseline = archiveReads;
store.clear(); archiveReads = 0;
const cold = await buildResult(env, { carText: text, state: null, how: "unsure", rush: null });
const coldReads = archiveReads;
if (cold.error) { console.log("FAIL  the car did not resolve offline: " + JSON.stringify(cold)); process.exit(1); }
ok("cold visit: exactly one engine call", cold.timings && cold.timings.engineCalls === 1 && cold.timings.answer === "engine", JSON.stringify(cold.timings));
ok("cold visit: the archive reads are no more than one bare engine answer's (no fetchQualifying of Sell's own)", coldReads <= baseline && coldReads > 0, `sell ${coldReads} bare engine ${baseline}`);
ok("cold visit: the result carries the engine's numbers and both e91 fields", cold.marketAnswer && cold.marketAnswer.poolN > 0 && "best_day" in cold && "reserve_split" in cold, JSON.stringify({ n: cold.marketAnswer && cold.marketAnswer.poolN, rs: !!cold.reserve_split }));
ok("cold visit: timings name each piece and drop nothing", cold.timings && typeof cold.timings.total === "number" && typeof cold.timings.build === "number" && !(cold.timings.dropped || []).length, JSON.stringify(cold.timings));
await new Promise(r => setTimeout(r, 50));
const keys = [...store.keys()];
ok("the car-only block is stored under sell|v13|<stamp>|<specKey> with no day and no label", keys.some(k => k.startsWith("sell|v13|" + E.ENGINE_VERSION + "|") && !k.includes(new Date().toISOString().slice(0, 10)) && !k.includes("1972 Datsun")), keys.map(k => k.slice(0, 60)).join(" ; "));
ok("the stored Market Check answer is written too (one row per market)", keys.some(k => k.startsWith("MCWARM:")));
// block hit
archiveReads = 0;
const hit = await buildResult(env, { carText: text, state: null, how: "unsure", rush: null });
ok("block hit: zero engine calls, zero archive reads", hit.timings.answer === "block" && !hit.timings.engineCalls && archiveReads === 0, JSON.stringify(hit.timings));
ok("block hit: the same numbers as the cold visit", JSON.stringify(hit.marketAnswer) === JSON.stringify(cold.marketAnswer) && JSON.stringify(hit.recent) === JSON.stringify(cold.recent));
// stored answer only (the warm wrote the answer, no block yet)
for (const k of keys) if (k.startsWith("sell|v13")) store.delete(k);
const blk = await import(pathToFileURL(path.join(root, "lib/sell/sellBlock.js")).href);
blk.forgetBlocks(); archiveReads = 0;
const mem = await buildResult(env, { carText: text, state: null, how: "unsure", rush: null });
ok("stored answer: zero engine calls and zero archive reads", mem.timings.answer === "stored" && !mem.timings.engineCalls && archiveReads === 0, JSON.stringify(mem.timings));
ok("a visitor in a rush reads the rush pick from the block, still no engine call", (await buildResult(env, { carText: text, state: "Texas", how: "self", rush: "fast" })).timings.engineCalls === undefined);
// static: the Sell result path holds no fetchQualifying of its own
{ const fs = await import("fs"); const rd = f => fs.readFileSync(path.join(root, f), "utf8").split("\n").map(l => l.replace(/\/\/.*$/, "")).join("\n");   // code only, comments dropped
  const facts = rd("lib/sell/sellFacts.js"); const seg = (a, b) => { const i = facts.indexOf(a), j = facts.indexOf(b, i + 1); return facts.slice(i, j); };
  ok("sellFlow.js and sellBlock.js never name fetchQualifying", !/fetchQualifying/.test(rd("lib/sell/sellFlow.js")) && !/fetchQualifying/.test(rd("lib/sell/sellBlock.js")));
  ok("placesFor and tilesFor never call fetchQualifying or specPool", !/fetchQualifying|specPool\(/.test(seg("export async function placesFor", "// ---------------------------------------------------------------- the three latest sales")) );
  ok("buildResult asks the engine only through answerFor", (rd("lib/sell/sellFlow.js").match(/oneEngineAnswer|engineFirst|enginePool/g) || []).length === 0); }
process.exit(failed ? 1 : 0);
