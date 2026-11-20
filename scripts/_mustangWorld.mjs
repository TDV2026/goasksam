// THE TEST WORLD OF forSalePlaceholderMilesCheck AND forSaleHoldingCheck (Lane D, Nov 19 2026): no database, no network. An archive of 40 sales of one 1965 Mustang, the cheap ones at high mileage, behind a stand-in table API; the real engine (lib/live/search.js listingMarket) reads it.
import path from "path"; import { pathToFileURL } from "url";
export async function world(root) {
  const imp = f => import(pathToFileURL(path.join(root, f)).href);
  const ev = (row, it) => { const ci = it.indexOf(":"); const alias = ci > 0 && it[ci + 1] !== ":" ? it.slice(0, ci) : null; const expr = alias ? it.slice(ci + 1) : it; if (expr.startsWith("raw_record->>")) { const k = expr.slice(13); const v = row.raw_record[k]; return [alias || k, v == null ? null : String(v)]; } return [alias || expr, row[expr] === undefined ? null : row[expr]]; };
  const likeRe = v => new RegExp("^" + String(v).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
  const rows = []; let n = 0; const day = i => new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
  const sale = (year, title, price, ago, body, mi) => { n++; rows.push({ id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), source_id: "sp" + n, sale_price: price, sale_price_usd: price, sale_date: day(ago), platform: "Bring a Trailer", source_slug: "bringatrailer", make: "Ford", model: "Mustang", year, listing_title: title, vin_norm: "V" + n, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: null, vehicle_type: "car",
    raw_record: { featured_image_url: "https://x/i.jpg", mileage: String(mi), body_style: body, modifications: null, title, currency: "USD", transmission: null, exterior_color: null, title_status: null, url: "https://u/" + n, source_url: null, city: "Austin", state: "TX", country_code: "US", auction_end_precision: null } }); };
  for (let i = 0; i < 30; i++) { const mi = 4000 + i * 3300; sale(1965, "1965 Ford Mustang Coupe", Math.round(95000 - mi * 0.62 + (i % 3) * 700), 20 + i * 25, "Coupe", mi); }
  for (let i = 0; i < 10; i++) sale(1965, "1965 Ford Mustang Coupe", [9000, 14000, 19000, 26000, 33000, 41000, 12000, 22000, 30000, 45000][i], 40 + i * 30, "Coupe", 105000 + i * 9000);
  const store = new Map();
  globalThis.fetch = async (url, opt) => {
    const u = new URL(String(url));
    if (u.pathname.endsWith("/spec_market_cache")) {
      if (opt && opt.method === "POST") { for (const r of JSON.parse(opt.body)) store.set(r.spec_key, r); return new Response("", { status: 201 }); }
      if (opt && opt.method === "DELETE") return new Response(null, { status: 204 });
      const k = (u.searchParams.get("spec_key") || ""); let out;
      if (k.startsWith("like.")) { const pre = k.slice(5).replace(/\*$/, ""); out = [...store.values()].filter(r => r.spec_key.startsWith(pre)); } else { const kk = k.replace(/^eq\./, ""); out = store.has(kk) ? [store.get(kk)] : []; }
      return new Response(JSON.stringify(out.map(r => ({ spec_key: r.spec_key, market: r.market, computed_at: r.computed_at }))), { status: 200 });
    }
    if (u.pathname.endsWith("/sales_archive")) {
      const sp = u.searchParams, sel = sp.get("select") || "id", sd = sp.getAll("sale_date");
      const ge = sd.filter(v => v.startsWith("gte.")).map(v => v.slice(4)), lt = sd.filter(v => v.startsWith("lt.")).map(v => v.slice(3));
      const ys = sp.getAll("year"), ymin = Number((ys.find(v => v.startsWith("gte.")) || "gte.0").slice(4)), ymax = Number((ys.find(v => v.startsWith("lte.")) || "lte.9999").slice(4));
      const mk = sp.get("make") && likeRe(sp.get("make").replace(/^ilike\./, "")), md = sp.get("model") && likeRe(sp.get("model").replace(/^ilike\./, "")), ti = sp.get("listing_title") && likeRe(sp.get("listing_title").replace(/^ilike\./, ""));
      const keep = rows.filter(r => (!ge.length || r.sale_date >= ge[0]) && (!lt.length || r.sale_date < lt[0]) && r.year >= ymin && r.year <= ymax && (!mk || mk.test(r.make)) && (!md || md.test(r.model)) && (!ti || ti.test(r.listing_title)));
      return new Response(JSON.stringify(keep.map(r => Object.fromEntries(sel.split(",").map(it => ev(r, it))))), { status: 200 });
    }
    return new Response("[]", { status: 200 });
  };
  
  const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
  const S = await imp("lib/live/search.js"), P = await imp("lib/forsale/prepare.js");
  const vehicle = { make: "Ford", model: "Mustang", year: 1965, bodyStyle: null };
  const listing = mi => ({ id: 1, source: "bringatrailer", source_listing_id: "s1", url: "https://x/1", listing_title: "1965 Ford Mustang", make: "Ford", model: "Mustang", year: 1965, vin_norm: null, mileage: mi, mileage_unit: "mi", body: null, transmission: null, location: "Greenland, NH", country: "US", currency: "USD", current_bid: 30000, current_bid_usd: 30000, status: "classified", photo_url: null });
  const readFor = async mi => { const row = listing(mi), facts = S.listingFacts(row); let m = null; for (let t = 0; t < 12; t++) { m = await S.listingMarket(env, row, facts, { noBlock: true, notTracked: true, vehicle }); if (m && m.kind !== "pending") break; await new Promise(r => setTimeout(r, 700)); } return { facts, m, read: P.readOf(m, "2026-11-19T00:00:00Z") }; };
  
  return { env, S, P, vehicle, listing, readFor, fetch: globalThis.fetch, quiet: () => { const o = console.error; console.error = () => {}; return () => { console.error = o; }; } };
}
