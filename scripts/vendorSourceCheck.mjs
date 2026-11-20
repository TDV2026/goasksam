// VENDOR SOURCE CHECK (Lane B, lane-b-coverage, Nov 19 2026; order: duPont Registry Live). Offline. CAUSE: a source the vendor added (duPont Registry Live, key dupontregistrylive, not dupontregistry which is the classifieds source) was in no list of ours: the nightly pull
// takes the keys of DISPLAY in scripts/ingest.js, so it was never asked for; every venue display map would have printed the raw slug. THE CLASS: any vendor source (scripts/fixtures/vendorSources.json, the source enum of the vendor's GET /auctions, read Nov 19 2026) that is
// missing from DISPLAY or from a venue display map. Must hold: (1) every vendor source is a key of DISPLAY; (2) every object of six or more venue names (any file in lib, api, scripts) names every vendor source; (3) a duPont row resolves (label to slug), is NOT a fee venue
// (hammer unchanged, not in HOUSE_SOURCES) and IS a house venue for words, joins a pool with the online sales and shows its own name on every tile and the strip, never the slug; (4) the room type of a live auction the calendar does not carry is "live".
//   node scripts/vendorSourceCheck.mjs [repo root]   (a tree without the fix shows it fail)
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { findGeneration } from "../lib/generations.js";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const ev = (row, it) => { const ci = it.indexOf(":"); const alias = ci > 0 && it[ci + 1] !== ":" ? it.slice(0, ci) : null; const expr = alias ? it.slice(ci + 1) : it; if (expr.startsWith("raw_record->>")) { const k = expr.slice(13); const v = row.raw_record[k]; return [alias || k, v == null ? null : String(v)]; } return [alias || expr, row[expr] === undefined ? null : row[expr]]; };
const likeRe = v => new RegExp("^" + String(v).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
let rows = [], n = 0; let MK = "Testmake"; const day = i => new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
const HOUSES = [["RM Sotheby's", "rmsothebys"], ["Gooding & Co", "gooding"], ["Bonhams", "bonhams"], ["Mecum", "mecum"]];
const sale = (year, body, price, ago, model = "Roadrunner", house = false) => { n++; const h = house ? HOUSES[n % HOUSES.length] : ["Bring a Trailer", "bringatrailer"], title = `${year} Testmake ${model} ${body}`; rows.push({ id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), source_id: "pb" + n, sale_price: price, sale_date: day(ago), platform: h[0], source_slug: h[1], make: "Testmake", model, year,
  listing_title: title, vin_norm: "V" + n, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: null, vehicle_type: "car", sale_price_usd: price,
  raw_record: { featured_image_url: "https://x/i.jpg", mileage: String(30000 + n * 300), body_style: body, modifications: null, title, currency: "USD", transmission: null, exterior_color: null, title_status: null, url: "https://u/" + n, source_url: null, city: "Austin", state: "TX", country_code: "US", auction_end_precision: null } }); };
globalThis.fetch = async (url) => {
  const u = new URL(String(url));
  if (u.pathname.endsWith("/sales_archive")) {
    const sp = u.searchParams, sel = sp.get("select"), sd = sp.getAll("sale_date");
    const ge = sd.filter(v => v.startsWith("gte.")).map(v => v.slice(4)), lt = sd.filter(v => v.startsWith("lt.")).map(v => v.slice(3));
    const ys = sp.getAll("year"), ymin = Number((ys.find(v => v.startsWith("gte.")) || "gte.0").slice(4)), ymax = Number((ys.find(v => v.startsWith("lte.")) || "lte.9999").slice(4));
    const mk = sp.get("make") && likeRe(sp.get("make").replace(/^ilike\./, "")), md = sp.get("model") && likeRe(sp.get("model").replace(/^ilike\./, "")), ti = sp.get("listing_title") && likeRe(sp.get("listing_title").replace(/^ilike\./, ""));
    const keep = rows.filter(r => (!ge.length || r.sale_date >= ge[0]) && (!lt.length || r.sale_date < lt[0]) && r.year >= ymin && r.year <= ymax && (!mk || mk.test(r.make)) && (!md || md.test(r.model)) && (!ti || ti.test(r.listing_title)));
    return new Response(JSON.stringify(keep.map(r => Object.fromEntries(sel.split(",").map(it => ev(r, it))))), { status: 200 });
  }
  if (u.hostname.includes("fake.supabase")) return new Response("[]", { status: 200 });
  throw new Error("offline");
};
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k", qelig: "compute" };
const read1 = async (year, model) => { const veh = { year, make: "Testmake", model }, q = `${year} Testmake ${model}`; const gen = await findGeneration(veh, env).catch(() => null); return E.withReadFields((await E.oneEngineAnswer({ ...veh, raw: q }, gen, q, { ...env, asked: 0 }, null)).raw, q, veh); };
const poolOf = d => (Array.isArray(d.rawPool) ? d.rawPool.length : 0);

import fs from "fs";
const H = await import(pathToFileURL(path.join(root, "lib/_houseComps.js")).href);
const VENDOR = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/vendorSources.json"), "utf8")).sources;
const read = f => fs.readFileSync(path.join(root, f), "utf8");
// (1) the pull list
{ const t = read("scripts/ingest.js"), blk = t.slice(t.indexOf("const DISPLAY = {"), t.indexOf("};", t.indexOf("const DISPLAY = {"))), keys = [...blk.matchAll(/\b([a-z]+):\s*"/g)].map(m => m[1]), missing = VENDOR.filter(s => !keys.includes(s));
  ok(`the pull list: all ${VENDOR.length} vendor sources are keys of DISPLAY in scripts/ingest.js`, missing.length === 0, "missing: " + missing.join(", "));
  ok('duPont Registry Live is named "duPont Registry Live" in DISPLAY', /dupontregistrylive:\s*"duPont Registry Live"/.test(blk)); }
// (2) every display map of six or more venues names every vendor source
{ const files = []; const walkDir = d => { for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) { const rel = d + "/" + e.name; if (e.isDirectory()) { if (!/node_modules|fixtures|preview/.test(e.name)) walkDir(rel); } else if (/\.(js|mjs)$/.test(e.name) && !/Check\.mjs$|Mutants\.mjs$|^prePush|^smoke/.test(e.name)) files.push(rel); } }; for (const d of ["lib", "api", "scripts"]) walkDir(d);
  const LIVE_ONLY = new Set(["autohunter"]); const PARTITIONS = new Set(["lib/ops/depthProbe.js", "scripts/pullSources.js"]); /* not display maps: depthProbe splits the sources into integrated and candidate, pullSources names the seven sources one script pulls */ const need = VENDOR.filter(s => !LIVE_ONLY.has(s)); const bad = []; let maps = 0;
  for (const f of files) { if (PARTITIONS.has(f)) continue; const t = read(f); const re = /(?:=|:)\s*\{/g; let m; while ((m = re.exec(t))) { let depth = 0, j = m.index + m[0].length - 1, k = j; for (; k < t.length; k++) { if (t[k] === "{") depth++; else if (t[k] === "}" && --depth === 0) break; } const body = t.slice(j, k + 1); if (body.length > 3000) continue;
      const keys = new Set([...body.matchAll(/(?:^|[,{\s])"?([a-z]{4,24})"?\s*:\s*"[A-Z][^"]*"/g)].map(x => x[1]).filter(x => VENDOR.includes(x))); if (keys.size < 6) continue; maps++;
      const miss = need.filter(s => !new RegExp("(?:^|[,{\\s\"])" + s + "\"?\\s*:").test(body)); if (miss.length) bad.push(`${f}:${t.slice(0, m.index).split("\n").length} lacks ${miss.join(",")}`); } }
  ok(`display maps: every object of six or more venue names names every vendor source (${maps} map starts read)`, bad.length === 0 && maps >= 5, bad.slice(0, 6).join(" | ") + ` (${maps} read)`); }
// (3) a duPont row
const LABEL = "duPont Registry Live";
ok("the label resolves to the slug", H.sourceSlugOf({ source: LABEL }) === "dupontregistrylive" && H.sourceSlugOf(LABEL) === "dupontregistrylive");
ok("no fee rule: not in HOUSE_SOURCES, not a fee house, hammer unchanged", !H.HOUSE_SOURCES.has("dupontregistrylive") && !H.isHouseSource({ source: LABEL }) && H.hammerUsd({ source: LABEL, source_slug: "dupontregistrylive", price: 855000, currency: "USD", date: "2026-06-09" }) === 855000);
ok("a house venue for words", typeof H.isHouseVenue === "function" && H.isHouseVenue({ source: LABEL }) === true && H.isHouseVenue("rmsothebys") === true && H.isHouseVenue("bringatrailer") === false);
{ const RT = await import(pathToFileURL(path.join(root, "lib/desk/roomType.js")).href); const t = RT.classifySaleType({ source: LABEL, source_slug: "dupontregistrylive", srcurl: "https://x/y", raw_title: "2003 Saleen S7", auction_end_date: "2026-08-31" }); ok("room type: a live auction the calendar does not carry reads live", t.type === "live", JSON.stringify(t)); }
const mkRow = (i, label, slug, model, price) => { n++; const t = `2004 Testmake ${model}`; rows.push({ id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), source_id: "dp" + n, sale_price: price, sale_date: day(10 + i * 9), platform: label, source_slug: slug, make: "Testmake", model, year: 2004, listing_title: t, vin_norm: "V" + n, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: null, vehicle_type: "car", sale_price_usd: price,
  raw_record: { featured_image_url: "https://x/i.jpg", mileage: String(20000 + n * 300), body_style: "Coupe", modifications: null, title: t, currency: "USD", transmission: null, exterior_color: null, title_status: null, url: "https://u/" + n, source_url: null, city: "Naples", state: "FL", country_code: "US", auction_end_precision: null } }); };
{ rows = []; n = 0; const model = "Dupont01";
  for (let i = 0; i < 9; i++) mkRow(i, "Bring a Trailer", "bringatrailer", model, 200000 + i * 2500);
  for (let i = 0; i < 3; i++) mkRow(i + 9, LABEL, "dupontregistrylive", model, 210000 + i * 4000);
  const d = await read1(2004, model), cards = d.cards || [], dp = cards.filter(c => c.platformSlug === "dupontregistrylive");
  ok("the pool: the 3 duPont sales join the 9 online sales (12)", (d.rawPool || []).length === 12 && dp.length === 3, `pool ${(d.rawPool || []).length}, duPont tiles ${dp.length}`);
  ok("the hammer is unchanged on every duPont tile (210000, 214000, 218000)", dp.map(c => Math.round(c.price)).sort().join(",") === "210000,214000,218000", JSON.stringify(dp.map(c => c.price)));
  ok("every duPont tile names \"duPont Registry Live\" (platformName) and is a house sale for its words", dp.length === 3 && dp.every(c => c.platformName === LABEL), JSON.stringify(dp.map(c => [c.platformName, c.platform])));
  const shown = JSON.stringify({ cards: d.cards, strip: d.strip, recent3: d.recent3, platforms: d.platforms, windowWords: d.windowWords, samLine: d.samLine });
  ok("no slug leaks to a page: the served display fields never carry \"dupontregistrylive\" outside the platformSlug field", dp.length === 3 && !/dupontregistrylive/i.test(shown.replace(/"platformSlug":"dupontregistrylive"/g, "")), (shown.match(/.{30}dupontregistrylive.{20}/i) || [""])[0]);
  const strip = ((d.strip && d.strip.sales) || []).map(x => x.venue); if (strip.length) ok("the sales strip names duPont Registry Live for its sales", strip.filter(v => v === LABEL).length === 3, JSON.stringify(strip)); }
// (5) ITS OWN TRUST LINE (lane-b-sale-name, order bc85 item 2): a sale from duPont Registry Live carries the engine's priceNote ("reports the hammer price"); a sale from any other venue carries none
{ const dpN = typeof E.saleNameFields === "function" ? E.saleNameFields({ year: 2006, make: "Ford", model: "GT", source: LABEL }) : {}, otherN = typeof E.saleNameFields === "function" ? E.saleNameFields({ year: 2006, make: "Ford", model: "GT", source: "Bring a Trailer" }) : {};
  ok("a duPont Registry Live sale carries its own trust line (priceNote), in the engine's words", typeof dpN.priceNote === "string" && /duPont Registry Live reports the hammer price/.test(dpN.priceNote) && !/[\u2013\u2014]/.test(dpN.priceNote), dpN.priceNote);
  ok("a sale from any other venue carries no trust line", !("priceNote" in otherN), otherN.priceNote); }
console.log(failed ? `\n${failed} FAILED` : "\nvendorSourceCheck: all pass"); process.exit(failed ? 1 : 0);
