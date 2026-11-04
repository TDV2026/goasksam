// A lost leg in the sell_fields step (Lane B, Nov 3 2026, job lane-b-legs). No database: a fake archive that answers a statement timeout (57014) for chosen reads.
// THE CLASS: attachSellFields (best_day and reserve_split) runs AFTER the engine's read scope has closed. Its reserve walk reads the archive again (the generation, then
// the model in every year); a read that failed there came back as a flagged short pool, the walk ignored the flag, and the answer was served and stored as a finished
// result, with reserve_split built from the legs that answered (or silently null). Same rule as every other read: an answer built under a failed read is never served
// as finished and never stored. Must hold:
//  (1) healthy archive: the walk runs and the answer is a result with reserve_split (the control);
//  (2) every read of the walk answers 57014: the answer is NOT a result (still reading), and carries no reserve_split;
//  (3) ONE leg of the walk answers 57014 (the title leg; the model leg answers rows): the answer is NOT a result, even though rows came back;
//  (4) a timed-out walk read is not followed by the next read of the walk (the same load again): at most one wide read is issued;
//  (5) a dropped connection (blip) on the walk is retried once and the result is served whole;
//  (6) the failed answer is never stored: answerCacheable refuses it;
//  (7) the legs of the stage are listed with time and outcome (env.legSink), so a slow stage is read, not guessed.
//   node scripts/sellFieldsLegCheck.mjs [repo root]
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
const { oneEngineAnswer } = E;
const S = await import(pathToFileURL(path.join(root, "lib/live/search.js")).href);
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const quiet = console.error; console.error = () => {};
const ev = (row, it) => { const ci = it.indexOf(":"); const alias = ci > 0 && it[ci + 1] !== ":" ? it.slice(0, ci) : null; const expr = alias ? it.slice(ci + 1) : it; if (expr.startsWith("raw_record->>")) { const k = expr.slice(13); const v = row.raw_record[k]; return [alias || k, v == null ? null : String(v)]; } return [alias || expr, row[expr] === undefined ? null : row[expr]]; };
const likeRe = v => new RegExp("^" + String(v).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
let rows = [], n = 0;
const sale = (year, date, price, hr) => { n++; rows.push({ id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), source_id: "sf" + n, sale_price: price, sale_date: date, platform: "Bring a Trailer", source_slug: "bringatrailer", make: "Datsun", model: "240Z", year,
  listing_title: `${year} Datsun 240Z`, vin_norm: "V" + n, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: hr, vehicle_type: "car", sale_price_usd: price,
  raw_record: { featured_image_url: "https://x/i.jpg", mileage: "60000", body_style: null, modifications: null, title: `${year} Datsun 240Z`, currency: "USD", transmission: null, exterior_color: null, title_status: null, url: "https://u/" + n, source_url: null, city: "Austin", state: "TX", country_code: "US", auction_end_precision: null } }); };
const sel0 = it => it;
// failure script: the walk reads the archive over the answer's own window (12 months here); the engine's own reads use its 24 and 60 month windows. Only the reads over the 12-month start fail.
const WALK_SINCE = new Date(Date.now() - 12 * 30.4375 * 864e5).toISOString().slice(0, 10);
let mode = "ok", reqIdx = 0, blipLeft = 0; const walkLog = [];
globalThis.fetch = async (url) => {
  const u = new URL(String(url));
  if (u.pathname.endsWith("/sales_archive")) {
    const idx = ++reqIdx;
    const sp = u.searchParams, sel = sp.get("select"), sd = sp.getAll("sale_date");
    const ge = sd.filter(v => v.startsWith("gte.")).map(v => v.slice(4)), lt = sd.filter(v => v.startsWith("lt.")).map(v => v.slice(3));
    const ys = sp.getAll("year"), ymin = Number((ys.find(v => v.startsWith("gte.")) || "gte.0").slice(4)), ymax = Number((ys.find(v => v.startsWith("lte.")) || "lte.9999").slice(4));
    if (ge[0] === WALK_SINCE) { const byTitle = !!sp.get("listing_title") && !sp.get("model"); walkLog.push(`${ymin}-${ymax}${byTitle ? " title" : " model"}`);
      if (mode === "timeout") return new Response(JSON.stringify({ code: "57014" }), { status: 500 });
      if (mode === "leg" && byTitle) return new Response(JSON.stringify({ code: "57014" }), { status: 500 });
      if (mode === "blip" && blipLeft > 0) { blipLeft--; throw new TypeError("fetch failed"); } }
    const mk = sp.get("make") && likeRe(sp.get("make").replace(/^ilike\./, "")), md = sp.get("model") && likeRe(sp.get("model").replace(/^ilike\./, "")), ti = sp.get("listing_title") && likeRe(sp.get("listing_title").replace(/^ilike\./, ""));
    const keep = rows.filter(r => (!ge.length || r.sale_date >= ge[0]) && (!lt.length || r.sale_date < lt[0]) && r.year >= ymin && r.year <= ymax && (!mk || mk.test(r.make)) && (!md || md.test(r.model)) && (!ti || ti.test(r.listing_title)));
    return new Response(JSON.stringify(keep.map(r => Object.fromEntries(sel.split(",").map(it => ev(r, it))))), { status: 200 });
  }
  if (u.hostname.includes("fake.supabase")) return new Response("[]", { status: 200 });
  throw new Error("offline");
};
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
const today = new Date(); const day = i => new Date(today.getTime() - i * 864e5).toISOString().slice(0, 10);
const sets = withFlags => { rows = [];
  for (let i = 0; i < 9; i++) sale(1972, day(10 + i), 28000 + i * 100, withFlags ? (i % 2 === 0) : null);
  for (let i = 0; i < 4; i++) sale(1971, day(50 + i), 30000, true);
  for (let i = 0; i < 4; i++) sale(1971, day(60 + i), 27000, false);
  for (let i = 0; i < 9; i++) sale(1964 + (i % 3), day(70 + i), 24000 + i * 100, true);
  for (let i = 0; i < 9; i++) sale(1964 + (i % 3), day(90 + i), 20000 + i * 100, false); };
const reset = (m, b = 0) => { mode = m; reqIdx = 0; blipLeft = b; walkLog.length = 0; };
const ask = () => oneEngineAnswer({ make: "Datsun", model: "240Z", trim: "", year: 1972, bodyStyle: null }, null, "1972 Datsun 240Z", { ...env, noStageLog: true }, null);
sets(false);
reset("ok"); { const a = await ask();
  ok("(1) healthy: a result with a reserve_split from the walk", a.raw.tier === "result" && a.raw.reserve_split && a.raw.reserve_split.a.n >= 8 && a.raw.reserve_split.b.n >= 8, `tier=${a.raw.tier} split=${JSON.stringify(a.raw.reserve_split && a.raw.reserve_split.scope_label)} walk reads=${walkLog.join(', ')}`); }
reset("timeout"); { const a = await ask();
  ok("(2) every walk read answers 57014: the answer is not a result, and carries no reserve_split", a.raw.tier !== "result" && !a.raw.reserve_split, `tier=${a.raw.tier} reserve_split=${JSON.stringify(a.raw.reserve_split || null)} range=${JSON.stringify(a.raw.cluster || null)}`);
  ok("(4) after a timed-out walk read the next read of the walk is not issued (no all-years model read)", !walkLog.some(x => /^0-/.test(x)), `walk reads: ${walkLog.join(", ")}`);
  ok("(6) the failed answer is refused by the store guard", S.answerCacheable(a.raw) === false, `tier=${a.raw.tier} cacheable=${S.answerCacheable(a.raw)}`); }
reset("leg"); { const a = await ask();
  ok("(3) one leg of the walk answers 57014 (the other leg answers rows): the answer is not a result", a.raw.tier !== "result", `tier=${a.raw.tier} reserve_split=${JSON.stringify(a.raw.reserve_split && a.raw.reserve_split.scope_label)} walk reads: ${walkLog.join(", ")}`); }
reset("blip", 1); { const a = await ask();
  ok("(5) a dropped connection on the walk is retried and the result is served whole", a.raw.tier === "result" && a.raw.reserve_split && a.raw.reserve_split.a.n >= 8, `tier=${a.raw.tier} split=${JSON.stringify(a.raw.reserve_split && a.raw.reserve_split.scope_label)} walk reads: ${walkLog.join(", ")}`); }
// (7) the leg list: a caller that gives a legSink reads every leg of the sell_fields stage, with its time and outcome (ops warmwhy prints it)
reset("timeout"); { const sink = []; await oneEngineAnswer({ make: "Datsun", model: "240Z", trim: "", year: 1972, bodyStyle: null }, null, "1972 Datsun 240Z", { ...env, noStageLog: true, legSink: sink }, null);
  const sf = sink.filter(l => l.stage === "sell_fields");
  ok("(7) the leg list names the sell_fields legs with time and outcome; the timed-out leg says failed", sf.length >= 1 && sf.every(l => typeof l.ms === "number" && /^(ok|failed)$/.test(l.outcome)) && sf.some(l => l.outcome === "failed") && sink.some(l => l.stage === "engine"), JSON.stringify(sf.slice(0, 3))); }
console.error = quiet;
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
