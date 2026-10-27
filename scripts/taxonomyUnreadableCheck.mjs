// e95: the rival rule never silently loses its protection. The make's model list comes from taxonomy_models (read twice before it gives up), then
// from the archive's own model column; when neither answers, the answer is marked modelCheck "unchecked" and the output gate judges its receipts by
// their titles alone, so a Speedtail style pool (Senna receipts filed under Speedtail) is refused, never passed as clean.
// No database: a fake archive whose taxonomy and model-column reads can be switched off.   node scripts/taxonomyUnreadableCheck.mjs [repo root]
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const ev = (row, it) => { const ci = it.indexOf(":"); const alias = ci > 0 && it[ci + 1] !== ":" ? it.slice(0, ci) : null; const expr = alias ? it.slice(ci + 1) : it; if (expr.startsWith("raw_record->>")) { const k = expr.slice(13); const v = row.raw_record[k]; return [alias || k, v == null ? null : String(v)]; } return [alias || expr, row[expr] === undefined ? null : row[expr]]; };
const likeRe = v => new RegExp("^" + String(v).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
const rows = []; let n = 0; const day = i => new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
const sale = (model, year, title, price, ago, house) => { n++; rows.push({ id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), source_id: "tu" + n, sale_price: price, sale_date: day(ago), platform: house ? "RM Sotheby's" : "Bring a Trailer", source_slug: house ? "rmsothebys" : "bringatrailer", make: "McLaren", model, year,
  listing_title: title, vin_norm: "V" + n, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: null, vehicle_type: "car", sale_price_usd: price,
  raw_record: { featured_image_url: "https://x/i.jpg", mileage: "500", body_style: "Coupe", modifications: null, title, currency: "USD", transmission: null, exterior_color: null, title_status: null, url: "https://u/" + n, source_url: null, city: "Monterey", state: "CA", country_code: "US", auction_end_precision: null } }); };
for (let i = 0; i < 8; i++) sale("Speedtail", 2019, "2019 McLaren Senna", 1100000 + i * 40000, 60 + i * 80, false);   // Senna sales filed under Speedtail
for (let i = 0; i < 6; i++) sale("Speedtail", 2020, "2020 McLaren Speedtail", 2000000 + i * 60000, 40 + i * 90, true);
for (let i = 0; i < 3; i++) sale("Senna", 2018, "2018 McLaren Senna", 900000 + i * 10000, 400 + i * 30, false);          // properly filed Senna sales: the archive's own model column then names both
const mode = { taxonomy: "ok", columns: "ok" };
const TAX = [{ name: "Speedtail", year_ranges: null }, { name: "Senna", year_ranges: null }, { name: "P1", year_ranges: null }];
globalThis.fetch = async (url) => {
  const u = new URL(String(url));
  if (u.pathname.endsWith("/taxonomy_models")) { if (mode.taxonomy === "down") return new Response("boom", { status: 500 }); return new Response(JSON.stringify(mode.taxonomy === "empty" ? [] : TAX), { status: 200 }); }
  if (u.pathname.endsWith("/sales_archive")) {
    const sp = u.searchParams, sel = sp.get("select");
    if (sel === "model") { if (mode.columns === "down") return new Response("boom", { status: 500 }); return new Response(JSON.stringify(rows.map(r => ({ model: r.model }))), { status: 200 }); }
    const sd = sp.getAll("sale_date"); const ge = sd.filter(v => v.startsWith("gte.")).map(v => v.slice(4)), lt = sd.filter(v => v.startsWith("lt.")).map(v => v.slice(3));
    const ys = sp.getAll("year"), ymin = Number((ys.find(v => v.startsWith("gte.")) || "gte.0").slice(4)), ymax = Number((ys.find(v => v.startsWith("lte.")) || "lte.9999").slice(4));
    const mk = sp.get("make") && likeRe(sp.get("make").replace(/^ilike\./, "")), md = sp.get("model") && likeRe(sp.get("model").replace(/^ilike\./, "")), ti = sp.get("listing_title") && likeRe(sp.get("listing_title").replace(/^ilike\./, ""));
    const keep = rows.filter(r => (!ge.length || r.sale_date >= ge[0]) && (!lt.length || r.sale_date < lt[0]) && r.year >= ymin && r.year <= ymax && (!mk || mk.test(r.make)) && (!md || md.test(r.model)) && (!ti || ti.test(r.listing_title)));
    return new Response(JSON.stringify(keep.map(r => Object.fromEntries(sel.split(",").map(it => ev(r, it))))), { status: 200 });
  }
  return new Response("[]", { status: 200 });
};
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
const ask = async (tax, cols) => { E.forgetMakeModels(); mode.taxonomy = tax; mode.columns = cols; return (await E.oneEngineAnswer({ make: "McLaren", model: "Speedtail", trim: "", year: 2020, bodyStyle: null }, null, "2020 McLaren Speedtail", env, null)).raw; };
const sennas = a => (a.cards || []).filter(c => /senna/i.test(String(c.title || ""))).length;
const a1 = await ask("ok", "ok");
ok("taxonomy readable: no Senna receipt, checked by the taxonomy", sennas(a1) === 0 && a1.modelCheck === "taxonomy", `tier ${a1.tier}, check ${a1.modelCheck}, ${sennas(a1)} Senna`);
const a2 = await ask("empty", "ok");
ok("the make has no taxonomy list: the archive's own model column stands in, no Senna receipt", sennas(a2) === 0 && a2.modelCheck === "archive", `tier ${a2.tier}, check ${a2.modelCheck}, ${sennas(a2)} Senna`);
const a3 = await ask("down", "ok");
ok("taxonomy unreadable (retried once): the archive's model column stands in, no Senna receipt", sennas(a3) === 0 && a3.modelCheck === "archive", `tier ${a3.tier}, check ${a3.modelCheck}, ${sennas(a3)} Senna`);
const a4 = await ask("down", "down");
ok("neither readable: the answer is marked unchecked", a4.modelCheck === "unchecked", `check ${a4.modelCheck}`);
ok("neither readable: a Speedtail style pool is never passed as clean (no Senna receipt on a result)", !(a4.tier === "result" && sennas(a4) > 0), `tier ${a4.tier}, ${sennas(a4)} Senna`);
ok("neither readable: the refusal carries its line", a4.tier !== "refusal" || !!a4.refusal_line, String(a4.refusal_line || "").slice(0, 80));
{ const card = (t, y) => ({ make: "McLaren", model: "Speedtail", title: t, year: y, price: 1e6 });
  const cards = [...Array.from({ length: 5 }, () => card("2019 McLaren Senna", 2019)), ...Array.from({ length: 5 }, () => card("2020 McLaren Speedtail", 2020))];
  const gate = mc => E.runOutputInvariants({ tier: "result", rawPool: cards, cards, fallbackRung: "model", modelCheck: mc }, { make: "McLaren", model: "Speedtail" }).find(x => x.name === "receipts_carry_resolved_car");
  ok("unchecked make: half the receipts without the model's name fails the pool", gate("unchecked").ok === false, gate("unchecked").detail);
  ok("checked make: the same pool stands (the list is what would have caught it)", gate("taxonomy").ok === true); }
let reads = 0; const f0 = globalThis.fetch; globalThis.fetch = async (u, o) => { if (/taxonomy_models/.test(String(u))) reads++; return f0(u, o); };
E.forgetMakeModels(); mode.taxonomy = "down"; await E.loadMakeModels(env, "McLaren");
ok("taxonomy read is tried twice before it gives up", reads === 2, `${reads} reads`);
globalThis.fetch = f0;
console.log(failed ? `taxonomyUnreadableCheck: ${failed} FAIL` : "taxonomyUnreadableCheck: all PASS");
process.exit(failed ? 1 : 0);
