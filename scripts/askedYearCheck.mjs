// The asked year only (Oct 25 2026, the 1955 300SL Roadster): the held and set-aside sentences count and claim only rows of the
// ASKED year, so a widened window's other years never make a claim about it. The real case, from the live archive: the only
// body-matching sale near 1955 is a 1957 Broad Arrow Roadster with no photo (Carmel, 2026-08-14, $2,040,000). Fixture: the live 1953 to 1957 rows (scripts/fixtures/askedYear300SL.json). No database.
//   node scripts/askedYearCheck.mjs [repo root]      (the root lets the same check run against an older checkout)
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const { runOneBox } = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
const { findGeneration } = await import(pathToFileURL(path.join(root, "lib/generations.js")).href);
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
import fs from "fs";
const fx = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/askedYear300SL.json"), "utf8"));
// the BaT 1954 300b Cabriolet D (source id 124485) is the row the e88 correction moves out of the 300SL pool
const rows = fx.rows.map((r, i) => {
  let mods = null; try { mods = r.mods ? JSON.parse(r.mods) : null; } catch { mods = null; }
  const raw = { featured_image_url: r.has_photo ? "https://x/i.jpg" : null, mileage: r.mileage, body_style: r.body_style, modifications: mods, title: r.listing_title, currency: r.currency, transmission: null, exterior_color: null, title_status: null, url: "https://u/" + i, source_url: null, city: r.city, state: r.state, country_code: r.country_code, auction_end_precision: null };
  return { id: r.id, source_id: (r.source_slug === "bringatrailer" && r.year === 1954 && /300b cabriolet d/i.test(r.listing_title)) ? "124485" : "ay" + i, sale_price: r.sale_price, sale_date: r.sale_date, platform: r.platform, listing_title: r.listing_title, year: r.year, make: r.make, model: r.model, vin_norm: r.vin_norm, stated_mileage: null, project_flag: r.project_flag, desc_facts: null, has_reserve: null, source_slug: r.source_slug, vehicle_type: "car", sale_price_usd: r.sale_price_usd, raw_record: raw };
});
const ev = (row, it) => { const ci = it.indexOf(":"); const alias = ci > 0 && it[ci + 1] !== ":" ? it.slice(0, ci) : null; const expr = alias ? it.slice(ci + 1) : it; if (expr.startsWith("raw_record->>")) { const k = expr.slice(13); const v = row.raw_record[k]; return [alias || k, v == null ? null : typeof v === "string" ? v : Array.isArray(v) ? "[" + v.map(x => JSON.stringify(x)).join(", ") + "]" : String(v)]; } return [alias || expr, row[expr] === undefined ? null : row[expr]]; };
const likeRe = v => new RegExp("^" + String(v).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
globalThis.fetch = async (url) => {
  const u = new URL(String(url));
  if (u.pathname.endsWith("/sales_archive")) {
    const sp = u.searchParams; const sel = sp.get("select");
    const ge = sp.getAll("sale_date").map(v => v.replace(/^gte\./, "")).filter((v, i) => sp.getAll("sale_date")[i].startsWith("gte."));
    const lt = sp.getAll("sale_date").filter(v => v.startsWith("lt.")).map(v => v.slice(3));
    const ys = sp.getAll("year"), ymin = Number((ys.find(v => v.startsWith("gte.")) || "gte.0").slice(4)), ymax = Number((ys.find(v => v.startsWith("lte.")) || "lte.9999").slice(4));
    const mk = sp.get("make") && likeRe(sp.get("make").replace(/^ilike\./, "")), md = sp.get("model") && likeRe(sp.get("model").replace(/^ilike\./, "")), ti = sp.get("listing_title") && likeRe(sp.get("listing_title").replace(/^ilike\./, ""));
    const ids = sp.get("id") && new Set(sp.get("id").replace(/^in\.\(|\)$/g, "").split(","));
    const keep = rows.filter(r => (!ge.length || String(r.sale_date) >= ge[0]) && (!lt.length || String(r.sale_date) < lt[0]) && r.year >= ymin && r.year <= ymax
      && (!mk || mk.test(r.make)) && (!md || md.test(r.model || "")) && (!ti || ti.test(r.listing_title || "")) && (!ids || ids.has(r.id)));
    return new Response(JSON.stringify(keep.map(r => Object.fromEntries(sel.split(",").map(it => ev(r, it))))), { status: 200 });
  }
  if (u.hostname.includes("fake.supabase")) return new Response("[]", { status: 200 });
  throw new Error("offline");
};
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
const read = async yr => { const v = { make: "Mercedes-Benz", model: "300SL", trim: "", year: yr, bodyStyle: "Roadster" }; const g = await findGeneration(v, env).catch(() => null); return runOneBox(v, g, `${yr} Mercedes-Benz 300SL Roadster`, env, null); };
const d55 = await read(1955), d57 = await read(1957);
ok("1955: the 1957 sale makes no claim about a 1955 car", !/set aside|Only one sale/.test(d55.samLine || ""), d55.samLine);
ok("1955: the answer is the plain no-sales line", /^No sales of a 1955 Mercedes-Benz 300SL Roadster are on record in the last five years/.test(d55.samLine || ""), d55.samLine);
ok("1955: not_tracked, no cards", d55.tier === "not_tracked" && !(d55.cards || []).length);
ok("1957: a year that has Roadster sales still reads them", d57.tier !== "not_tracked" && (d57.cards || []).length > 0, d57.tier + ", " + (d57.cards || []).length + " cards");
process.exit(failed ? 1 : 0);
