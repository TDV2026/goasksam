// House sales count as sales (Lane B, Nov 2 2026, job lane-b-onevenue). No database, no network: a fake archive serves a fixture per scenario. THE CLASS: a pool whose sales came mostly from the auction houses
// (RM Sotheby's, Gooding, Barrett-Jackson, Mecum, Broad Arrow, Bonhams) was refused a range with "These sales come mostly from one place, so no range is shown." (487 stored rows: the Ferrari 250 GT, F40, Aston DB5, DB6,
// 300SL Roadster, M1, Veyron, XJ220). Sam's rule: a range needs 8 sales with the usual rules, wherever they sold. Must hold:
//  (A) 12 house sales (no photos) give a range;
//  (B) 9 house sales and 4 open-platform sales give a range;
//  (C) 5 sales give none (the count rule stays), and the line is the count line, never a venue line;
//  (D) 12 open-platform sales still give a range (unchanged);
//  (E) no answer carries thinReason house_share, the reason table has no house_share line, and the houseOnlyBody rule is gone;
//  (F) the stored rows: a row refused by house_share without houseRulesTag is read as no row (both readers); every other row keeps serving; an answer the engine computes carries the tag; the stamp did not move (e99);
//  (G) the 2/3 house test stays for the Sell page's house-first read (thin.houseSteer is still computed).
//   node scripts/houseSalesCountCheck.mjs          (LIB_ROOT=<dir holding lib/> runs it against another tree, e.g. the base commit, to show it fails)
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.env.LIB_ROOT ? path.resolve(process.env.LIB_ROOT) : path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2";
const imp = async f => { try { return await import(pathToFileURL(path.join(ROOT, f)).href); } catch (e) { return null; } };
const E = await imp("lib/onebox.js"), S = await imp("lib/live/search.js"), RW = await imp("lib/reasonWords.js");
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const quiet = console.error; console.error = () => {};
const HOUSES = ["RM Sotheby's", "Gooding & Company", "Bonhams", "Mecum", "Broad Arrow", "Barrett-Jackson"];
let FIX = [], ROW = null, n = 0;
const mk = (house, price, year) => {
  const i = n++, plat = house ? HOUSES[i % HOUSES.length] : "Bring a Trailer";
  const raw = { id: "o" + i, title: `${year} Jaguar XJ220 ${i}`, mileage: `${9000 + i * 300}`, body_style: "Coupe", currency: "USD", url: `https://x/${i}`, country_code: "US", state: "CA", city: "Monterey", auction_end_precision: "day" };
  if (!house) raw.featured_image_url = `https://img/${i}.jpg`;
  return { id: "u" + String(i).padStart(5, "0"), source_id: raw.id, sale_price: price, sale_date: `2026-0${1 + (i % 9)}-1${i % 9}`, platform: plat, listing_title: raw.title, year, make: "Jaguar", model: "XJ220", vin_norm: null, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: false, raw_record: raw, vehicle_type: "car" };
};
const jt = v => v == null ? null : typeof v === "string" ? v : JSON.stringify(v);
const ev = (row, it) => { const ci = it.indexOf(":"); const al = ci > 0 && it[ci + 1] !== ":"; const alias = al ? it.slice(0, ci) : null; const expr = al ? it.slice(ci + 1) : it; if (expr.startsWith("raw_record->>")) return [alias || expr.slice(13), jt(row.raw_record[expr.slice(13)])]; const c = expr.replace(/::text$/, ""); return [alias || c, c in row ? row[c] : null]; };
globalThis.fetch = async (url) => {
  const u = new URL(String(url)); const sel = u.searchParams.get("select") || "";
  if (u.pathname.endsWith("/spec_market_cache")) return new Response(JSON.stringify(ROW ? [ROW] : []), { status: 200 });
  if (!u.pathname.endsWith("/sales_archive") || u.searchParams.get("id") || /^model$/.test(sel)) return new Response(/^model$/.test(sel) ? JSON.stringify([{ model: "XJ220" }]) : "[]", { status: 200 });
  return new Response(JSON.stringify(FIX.map(r => Object.fromEntries(sel.split(",").map(it => ev(r, it))))), { status: 200 });
};
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k", poolColumns: false };
const answer = async () => (await E.oneEngineAnswer({ year: 1993, make: "Jaguar", model: "XJ220", raw: "1993 Jaguar XJ220", trim: null }, null, "1993 Jaguar XJ220", { ...env, asked: 0, noStageLog: true }, null)).raw;
const price = i => 380000 + (i % 7) * 9000;
const hasRange = d => d && d.tier === "result" && Array.isArray(d.cluster) && d.cluster.length === 2 && d.cluster[0] > 0;
const brief = d => `tier=${d && d.tier} poolN=${d && d.poolN} reason=${d && d.thinReason} line=${JSON.stringify(d && d.thinLine || "").slice(0, 90)}`;

FIX = Array.from({ length: 12 }, (_, i) => mk(true, price(i), 1993)); { const d = await answer();
  ok("(A) 12 house sales (no photos) give a range", hasRange(d), brief(d)); }
FIX = [...Array.from({ length: 9 }, (_, i) => mk(true, price(i), 1993)), ...Array.from({ length: 4 }, (_, i) => mk(false, price(i + 3), 1993))]; { const d = await answer();
  ok("(B) 9 house sales and 4 open-platform sales give a range", hasRange(d), brief(d)); }
FIX = Array.from({ length: 5 }, (_, i) => mk(true, price(i), 1993)); { const d = await answer();
  ok("(C) 5 sales give no range, and no venue line", !hasRange(d) && d.thinReason !== "house_share" && !/one place|house/i.test(String(d.thinLine || "")), brief(d)); }
FIX = Array.from({ length: 12 }, (_, i) => mk(false, price(i), 1993)); { const d = await answer();
  ok("(D) 12 open-platform sales give a range (unchanged)", hasRange(d), brief(d)); }

// (E) no venue reason anywhere
{ const lines = RW ? JSON.stringify(RW) : "", src = fs.readFileSync(path.join(ROOT, "lib/onebox.js"), "utf8"), rw = fs.readFileSync(path.join(ROOT, "lib/reasonWords.js"), "utf8");
  ok("(E) the reason table has no house_share line and the thin reasons have no house_share", !/"thin\.house_share"/.test(rw) && !/house_share:\s*"thin/.test(rw) && !/return "house_share"/.test(src));
  ok("(E) the houseOnlyBody rule is gone from the range path", !/rangeRuleOn\(env, "houseOnlyBody"\)/.test(src) && !(E && E.RANGE_RULES && "houseOnlyBody" in E.RANGE_RULES)); }

// (F) stored rows
{ // a stored row as the engine writes it today: every rule tag current EXCEPT the one under test (houseRulesTag), so only the house rule can overtake it (E.withCurrentTags)
  const row = raw => ({ computed_at: new Date().toISOString(), market: { raw: E.withCurrentTags(raw, ["houseRulesTag"]), engineVersion: E.ENGINE_VERSION, warmEpoch: null } });
  const rd = async raw => { ROW = row(raw); const d = await S.readWarmAnswerDetailed(env, "MCWARM:x"), p = await S.readWarmAnswer(env, "MCWARM:x"); return { d, p }; };
  const base = { tier: "thin", poolN: 9, rawPool: [{ id: "a", year: 1993 }], cluster: null, resolvedCar: { year: 1993, make: "Jaguar", model: "XJ220" } };
  { const { d, p } = await rd({ ...base, thinReason: "house_share" }); ok("(F) a row refused by house_share without the tag is read as no row, by both readers", d.raw === null && d.reason === "house_recheck" && !p, JSON.stringify([d.reason, !!p])); }
  { const { d, p } = await rd({ ...base, thinReason: "house_share", houseRulesTag: E.HOUSE_RULES_TAG }); ok("(F) the same row carrying the tag is served", !!d.raw && !!p); }
  { const a = await rd({ ...base, thinReason: "few_sales" }), b = await rd({ ...base, tier: "result", cluster: [380000, 440000] }), c = await rd({ ...base, thinReason: "few_comparable" }), c2 = await rd({ ...base, thinReason: "few_comparable", thin: { houseN: 0, totalN: 9 } }), c3 = await rd({ ...base, thinReason: "few_comparable", thin: { houseN: 5, totalN: 6 } });
    ok("(F) every other row keeps serving (few_sales, a result, few_comparable with no house sale or fewer than 8 sales in all)", !!a.d.raw && !!b.d.raw && !!c.d.raw && !!c2.d.raw && !!c3.d.raw && !!a.p && !!b.p && !!c.p && !!c2.p && !!c3.p); }
  { const { d, p } = await rd({ ...base, thinReason: "few_comparable", thin: { houseN: 4, totalN: 9 } }); ok("(F) a few_comparable row whose pool reaches 8 sales once its house sales count (4 house, 9 in all) is read as no row, by both readers", d.raw === null && d.reason === "house_recheck" && !p, JSON.stringify([d.reason, !!p])); }
  { const { d, p } = await rd({ ...base, thinReason: "few_comparable", thin: { houseN: 4, totalN: 9 }, houseRulesTag: E.HOUSE_RULES_TAG }); ok("(F) the same few_comparable row carrying the tag is served", !!d.raw && !!p); }
  ok("(F) the stamp did not move (still e99)", !!E && /^e99-/.test(String(E.ENGINE_VERSION)), E && E.ENGINE_VERSION);
  ROW = null;
  FIX = Array.from({ length: 12 }, (_, i) => mk(true, price(i), 1993)); const d = await answer();
  ok("(F) an answer the engine computes carries houseRulesTag", !!d && d.houseRulesTag === E.HOUSE_RULES_TAG, String(d && d.houseRulesTag)); }

// (G) the Sell page's house-first test is still computed
{ const src = fs.readFileSync(path.join(ROOT, "lib/onebox.js"), "utf8");
  ok("(G) the 2/3 house test (houseSteer, HT_STEER_SHARE) stays for the Sell page", /const houseSteer = denom > 0 && \(house\.length \/ denom\) >= HT_STEER_SHARE/.test(src)); }

console.error = quiet;
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
