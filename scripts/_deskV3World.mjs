// clock: real-ok the fixture sales are dated relative to now (days ago), no calendar date is asserted (Lane B, Nov 2026)
// THE DESK V3 TEST WORLD (Lane B, Nov 8 2026): a fake PostgREST archive for three Desk models (the 1999 Porsche 911 Carrera 996, a 1970 Corvette, a 2003 BMW M3), shared by the five desk v3 checks.
// Manual and Tiptronic 996s sell apart (manual about $6,000 more), tiers 1 to 4 are dealt by id, the newest sale is 12 days old.
export const CARS = [
  { make: "Porsche", model: "911", y0: 1999, y1: 2001, base: 28000, manualUp: 6000, n: 70, body: "Coupe", title: y => `${y} Porsche 911 Carrera`, gearbox: i => (i % 4 === 3 ? "Tiptronic" : i % 9 === 8 ? null : "Manual (6-Speed)") },
  { make: "Chevrolet", model: "Corvette", y0: 1970, y1: 1972, base: 30000, manualUp: 0, n: 60, body: "Coupe", title: y => `${y} Chevrolet Corvette`, gearbox: i => (i % 5 === 0 ? "Automatic" : "Manual (4-Speed)") },
  { make: "BMW", model: "M3", y0: 2001, y1: 2003, base: 30000, manualUp: 3000, n: 60, body: "Coupe", title: y => `${y} BMW M3`, gearbox: i => (i % 5 === 4 ? "SMG" : "Manual (6-Speed)") }
];
export const tierOf = id => { const n = Number(String(id).split("-")[1]); return n % 7 === 0 ? null : 1 + (n % 4); };
export const DAY = 864e5;
export function install(opts = {}) {
  let seed = 11; const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  const DATA = new Map();
  for (const [ci, c] of CARS.entries()) {
    DATA.set(c.model, Array.from({ length: c.n }, (_, i) => {
      const year = c.y0 + (i % (c.y1 - c.y0 + 1)), gb = c.gearbox(i), title = c.title(year), miles = 9000 + Math.round(rnd() * 90000);
      const ims = opts.ims ? opts.ims(i) : undefined, price = Math.round((c.base + (ims ? (opts.imsUp || 0) : 0) + (gb && /Manual/.test(gb) ? c.manualUp : 0) + (5 - (tierOf("x-" + i) || 3)) * 1500 - miles * 0.05) * (0.9 + rnd() * 0.2));
      const raw = { id: "ocd" + ci + "_" + i, title, featured_image_url: "https://img.example/x" + i + ".jpg", mileage: String(miles), body_style: c.body, modifications: null, currency: "USD", transmission: gb, exterior_color: "Red", title_status: "Clean", url: "https://bat.example/" + ci + "_" + i, source_url: "https://src.example/" + ci + "_" + i, city: "Austin", state: "TX", country_code: "US", auction_end_precision: "day" };
      return { id: `c${String(ci).padStart(2, "0")}-${String(i).padStart(5, "0")}`, source_id: raw.id, sale_price: price, sale_date: new Date(Date.now() - (12 + (i % 100) * 3) * DAY).toISOString().slice(0, 10), platform: i % 3 === 0 ? "Cars & Bids" : "Bring a Trailer", listing_title: title, year, make: c.make, model: c.model, vin_norm: null, stated_mileage: null, project_flag: null, desc_facts: opts.ims && ims !== undefined ? { markers: [], ims } : null, has_reserve: false, raw_record: raw, vehicle_type: "car" };
    }));
  }
  const jt = v => v === null || v === undefined ? null : typeof v === "string" ? v : JSON.stringify(v);
  const evalItem = (row, item) => { const ci = item.indexOf(":"); const hasAlias = ci > 0 && item[ci + 1] !== ":"; const alias = hasAlias ? item.slice(0, ci) : null; const expr = hasAlias ? item.slice(ci + 1) : item;
    if (expr.startsWith("raw_record->>")) return [alias || expr.slice(13), jt(row.raw_record[expr.slice(13)])]; const col = expr.replace(/::text$/, ""); return [alias || col, col in row ? row[col] : null]; };
  globalThis.fetch = async (url) => {
    const u = new URL(String(url)); const sel = u.searchParams.get("select") || "", dec = decodeURIComponent(String(url));
    if (!u.pathname.endsWith("/sales_archive")) return new Response("[]", { status: 200 });
    if (/condition_tier/.test(sel)) { const ids = (u.searchParams.get("id") || "").replace(/^in\.\(|\)$/g, "").split(",").filter(Boolean); return new Response(JSON.stringify(ids.map(id => ({ id, condition_tier: tierOf(id), condition_version: "ct3-20261105" }))), { status: 200 }); }
    if (u.searchParams.get("id")) return new Response("[]", { status: 200 });
    if (/^model$/.test(sel)) return new Response(JSON.stringify(CARS.map(c => ({ model: c.model }))), { status: 200 });
    const hit = CARS.find(c => dec.toLowerCase().includes(c.model.toLowerCase()));
    const rows = hit ? DATA.get(hit.model) : [];
    return new Response(JSON.stringify(rows.map(r => Object.fromEntries(sel.split(",").map(it => evalItem(r, it))))), { status: 200 });
  };
  const env = { supabaseUrl: "https://fake.example", supabaseKey: "k", poolColumns: false, asked: 0, noStageLog: true };
  const deps = { resolveVehicle: async (text) => { const m = /^(\d{4}) (\S+) (\S+)/.exec(text); return { status: "valid", vehicle: { year: Number(m[1]), make: m[2], model: m[3], bodyStyle: "Coupe" } }; }, decodeVin: async () => null, archiveMatch: async () => null, vinPlan: null, vinOverlay: null, liveFor: async () => ({ rows: [], total: 0 }) };
  return { env, deps, DATA };
}
export const CASES = [{ year: 1999, make: "Porsche", model: "911", label: "1999 Porsche 911 Carrera 996 manual coupe", transmission: "Manual" }, { year: 1970, make: "Chevrolet", model: "Corvette", label: "1970 Chevrolet Corvette", transmission: "Manual" }, { year: 2003, make: "BMW", model: "M3", label: "2003 BMW M3", transmission: "Manual" }];
