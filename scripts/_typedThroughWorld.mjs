// THE TYPED-THROUGH TEST WORLD (Lane B, Nov 17 2026): a fake PostgREST that holds a sales archive for a few cars AND the stored answer rows (spec_market_cache, app_config, narration_cache),
// so the REAL handlers (api/sellerDecision.js, lib/live/search.js, lib/sell/sellFacts.js) run end to end: a first ask can store its answer, a second ask can read it back, exactly as in production.
// Nothing here is recorded: the archive is built from the cars below, the engine reads it through its own queries (make, model, title, year and sale date filters are applied to every row).
export const DAY = 864e5;
export function install(cars, opts = {}) {
  let seed = 11; const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  const rows = [], STORE = new Map(), log = [];
  for (const [ci, c] of cars.entries()) for (let k = 0; k < (c.n || 36); k++) {
    const year = c.year + (k % 5 === 4 ? 1 : 0), miles = (c.lowMiles || 15000) + Math.round(rnd() * (c.spanMiles || 70000)), price = Math.round((c.price || 20000) * (1.25 - miles / 120000 + (rnd() - 0.5) * 0.1)), title = `${year} ${c.make} ${c.title || c.model}`;
    const raw = { id: "tt" + ci + "_" + k, title, featured_image_url: "https://img.example/tt" + ci + "_" + k + ".jpg", mileage: String(miles), body_style: c.body || "Convertible", modifications: null, currency: "USD", transmission: "Automatic", exterior_color: "Silver", title_status: "Clean", url: "https://bat.example/tt" + ci + "_" + k, source_url: "https://src.example/tt" + ci + "_" + k, city: "Austin", state: "TX", country_code: "US", auction_end_precision: "day" };
    rows.push({ id: `t${String(ci).padStart(2, "0")}-${String(k).padStart(5, "0")}`, source_id: raw.id, sale_price: price, sale_date: new Date(Date.now() - (20 + k * 17) * DAY).toISOString().slice(0, 10), platform: k % 3 === 0 ? "Cars & Bids" : "Bring a Trailer", listing_title: title, year, make: c.make, model: c.model, vin_norm: null, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: false, raw_record: raw, vehicle_type: "car" });
  }
  const jt = v => v === null || v === undefined ? null : typeof v === "string" ? v : JSON.stringify(v);
  const evalItem = (row, item) => { const ci = item.indexOf(":"); const hasAlias = ci > 0 && item[ci + 1] !== ":"; const alias = hasAlias ? item.slice(0, ci) : null; const expr = hasAlias ? item.slice(ci + 1) : item;
    if (expr.startsWith("raw_record->>")) return [alias || expr.slice(13), jt(row.raw_record[expr.slice(13)])]; const col = expr.replace(/::text$/, ""); return [alias || col, col in row ? row[col] : null]; };
  const EPOCH = "2026-10-28T19:34:12.871Z";
  globalThis.fetch = async (url, init) => {
    const u = new URL(String(url)), p = u.pathname; log.push(p.split("/").pop());
    if (p.endsWith("/app_config")) return new Response(JSON.stringify([{ value: EPOCH }]), { status: 200 });
    if (p.endsWith("/spec_market_cache")) {
      const k = (u.searchParams.get("spec_key") || "").replace(/^eq\./, "");
      if (init && init.method === "POST") { for (const r of JSON.parse(init.body)) STORE.set(r.spec_key, { market: r.market, computed_at: r.computed_at }); return new Response("", { status: 201 }); }
      if (init && init.method === "PATCH") { const r = STORE.get(k); if (r) { try { Object.assign(r.market, JSON.parse(init.body).market || {}); } catch {} } return new Response("", { status: 204 }); }
      const r = STORE.get(k); return new Response(JSON.stringify(r ? [{ market: r.market, computed_at: r.computed_at }] : []), { status: 200 });
    }
    if (!p.endsWith("/sales_archive")) return new Response("[]", { status: 200 });
    const sel = u.searchParams.get("select") || "";
    if (/condition_tier/.test(sel) || u.searchParams.get("id")) return new Response("[]", { status: 200 });
    if (/^model$/.test(sel)) return new Response(JSON.stringify([...new Set(cars.map(c => c.model))].map(m => ({ model: m }))), { status: 200 });
    const tests = []; for (const [k, v] of u.searchParams) { const m = /^(ilike|gte|lte|eq)\.(.*)$/.exec(v); if (!m || !["make", "model", "year", "sale_date", "listing_title", "vehicle_type"].includes(k)) continue; tests.push([k, m[1], m[2]]); }
    const test = r => tests.every(([k, op, val]) => { const x = r[k]; if (op === "ilike") return new RegExp("^" + val.split("*").map(t => t.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$", "i").test(String(x ?? "")); if (op === "eq") return String(x) === val; if (op === "gte") return String(x) >= val; if (op === "lte") return String(x) <= val; return true; });
    return new Response(JSON.stringify(rows.filter(test).map(r => Object.fromEntries(sel.split(",").map(it => evalItem(r, it))))), { status: 200 });
  };
  return { rows, STORE, log, EPOCH };
}
export function setEnv() {
  process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.SUPABASE_ANON_KEY = "k"; process.env.OLDCARSDATA_API_KEY = "x"; process.env.LAUNCH_STAGE = "2";
}
// the real Market Check / Sell handler, called as the page calls it
export function caller(H) {
  return async (body, query) => { let out = null; const res = { status(c) { this.code = c; return this; }, json(b) { out = b; return this; }, setHeader() {}, end() {}, getHeader() {} }; await H({ method: "POST", headers: { origin: "https://goasksam.com", cookie: "" }, query: query || {}, body, socket: { remoteAddress: "10.0." + Math.floor(Math.random() * 250) + "." + Math.floor(Math.random() * 250) } }, res); return out; };
}
