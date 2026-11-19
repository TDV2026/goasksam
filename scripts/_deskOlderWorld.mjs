// clock: real-ok the fixture sales are dated relative to now (days ago); no calendar date is asserted (Lane B, Nov 2026)
// THE OLDER CARS TEST WORLD (Lane B, Nov 10 2026): a fake PostgREST archive built from Lane F's 24 recorded older-car answers (scripts/fixtures/deskOlderCars.json), read through the real engine path and the real sheetRead.
// For each car the archive holds what the recorded answer says it held: the sales of the car's own model year (the engine's pool was one model year wide), the recorded count in the last 12 months and in 24 months, the recorded range,
// some sales of the neighbouring model years, and older sales so the engine's own five year pool clears its threshold. No live read; the recorded answers are the fixture, the archive is rebuilt from their counts.
import fs from "node:fs"; import path from "node:path";
export const DAY = 864e5;
export const loadCars = root => JSON.parse(fs.readFileSync(path.join(root, "scripts/fixtures/deskOlderCars.json"), "utf8")).cars;
export function install(root, opts = {}) {
  const cars = opts.cars || loadCars(root); let seed = 7; const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  const DATA = new Map(), bodyWord = c => opts.bodyOf ? opts.bodyOf(c) : c.typedBody;
  for (const [ci, c] of cars.entries()) {
    const own = c.read ? c.m24 : (c.countWithoutBody || 3), pop24 = c.read ? c.c24 : own, pop12 = c.read ? c.c12 : Math.min(2, own), mid = c.read && c.range12 ? c.range12[1] : 30000;
    const rows = []; let i = 0;
    const add = (year, daysAgo, manual) => { const k = i++, price = Math.round(mid * (0.8 + rnd() * 0.4)), gb = manual ? "Manual (4-Speed)" : "Automatic", title = `${year} ${c.make} ${c.rmodel}${c.rtrim ? " " + c.rtrim : ""}`, miles = 20000 + Math.round(rnd() * 80000);
      const raw = { id: "old" + ci + "_" + k, title, featured_image_url: "https://img.example/o" + ci + "_" + k + ".jpg", mileage: String(miles), body_style: bodyWord(c), modifications: null, currency: "USD", transmission: gb, exterior_color: "Red", title_status: "Clean", url: "https://bat.example/o" + ci + "_" + k, source_url: "https://src.example/o" + ci + "_" + k, city: "Austin", state: "TX", country_code: "US", auction_end_precision: "day" };
      rows.push({ id: `o${String(ci).padStart(2, "0")}-${String(k).padStart(5, "0")}`, source_id: raw.id, sale_price: price, sale_date: new Date(Date.now() - daysAgo * DAY).toISOString().slice(0, 10), platform: k % 3 === 0 ? "Cars & Bids" : "Bring a Trailer", listing_title: title, year, make: c.make, model: c.rmodel, vin_norm: null, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: false, raw_record: raw, vehicle_type: "car" }); };
    for (let k = 0; k < own; k++) add(c.year, k < (c.read ? c.m12 : pop12) ? 20 + k * 25 : 380 + (k % 8) * 40, k < pop24 ? (k < pop12 || k >= (c.read ? c.m12 : pop12)) : false);
    for (let k = 0; k < 9; k++) add(c.year, 800 + k * 90, true);                                            // older sales of the same year, so the engine's own five year pool is deep enough
    if (!opts.oneYear) for (const dy of [-2, -1, 1, 2]) for (let k = 0; k < 4; k++) add(c.year + dy, 60 + k * 120, true);   // the neighbouring model years
    DATA.set(c.rmodel, rows);
  }
  const jt = v => v === null || v === undefined ? null : typeof v === "string" ? v : JSON.stringify(v);
  const evalItem = (row, item) => { const ci = item.indexOf(":"); const hasAlias = ci > 0 && item[ci + 1] !== ":"; const alias = hasAlias ? item.slice(0, ci) : null; const expr = hasAlias ? item.slice(ci + 1) : item;
    if (expr.startsWith("raw_record->>")) return [alias || expr.slice(13), jt(row.raw_record[expr.slice(13)])]; const col = expr.replace(/::text$/, ""); return [alias || col, col in row ? row[col] : null]; };
  globalThis.fetch = async (url) => {
    const u = new URL(String(url)); const sel = u.searchParams.get("select") || "", dec = decodeURIComponent(String(url));
    if (!u.pathname.endsWith("/sales_archive")) return new Response("[]", { status: 200 });
    if (/condition_tier/.test(sel)) return new Response("[]", { status: 200 });
    if (u.searchParams.get("id")) return new Response("[]", { status: 200 });
    if (/^model$/.test(sel)) return new Response(JSON.stringify([...new Set(cars.map(c => c.rmodel))].map(m => ({ model: m }))), { status: 200 });
    // the real filters of the request, applied to every row: make, model and title (ilike with *), year and sale date (gte, lte), vehicle type (eq)
    const tests = []; for (const [k, v] of u.searchParams) { const m = /^(ilike|gte|lte|eq)\.(.*)$/.exec(v); if (!m || !["make", "model", "year", "sale_date", "listing_title", "vehicle_type"].includes(k)) continue; tests.push([k, m[1], m[2]]); }
    const ok = r => tests.every(([k, op, val]) => { const x = r[k]; if (op === "ilike") return new RegExp("^" + val.split("*").map(t => t.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$", "i").test(String(x ?? "")); if (op === "eq") return String(x) === val; return op === "gte" ? String(x) >= val && (k !== "year" || Number(x) >= Number(val)) : String(x) <= val && (k !== "year" || Number(x) <= Number(val)); });
    const rows = [...DATA.values()].flat().filter(ok);
    return new Response(JSON.stringify(rows.map(r => Object.fromEntries(sel.split(",").map(it => evalItem(r, it))))), { status: 200 });
  };
  const env = { supabaseUrl: "https://fake.example", supabaseKey: "k", poolColumns: false, asked: 0, noStageLog: true };
  const deps = { resolveVehicle: async (text) => { const y = /\b(\d{4})\b/.exec(text), c = cars.find(c => text.toLowerCase().includes(c.make.toLowerCase()) && text.toLowerCase().includes(c.model.toLowerCase())); return c ? { status: "valid", vehicle: { year: Number(y[1]), make: c.make, model: c.rmodel, trim: c.rtrim || null } } : null; }, decodeVin: async () => null, archiveMatch: async () => null, vinPlan: null, vinOverlay: null, liveFor: async () => ({ rows: [], total: 0 }) };
  return { env, deps, DATA, cars };
}
