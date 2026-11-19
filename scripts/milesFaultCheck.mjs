// e95: the read-only ops task milesfault lists sales whose stored mileage looks like a unit or parsing fault (under 500 miles on a car older than 15 years).
// Offline: a fake archive. The task must flag the old low-mileage sales and only those, count them by source and decade, and write nothing.
//   node scripts/milesFaultCheck.mjs [repo root]
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.env.PROBE_KEY = "k"; process.env.OLDCARSDATA_API_KEY = "x"; process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "s";
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const thisYear = new Date().getUTCFullYear();
const rows = [
  { id: "a1", year: 1985, make: "Land Rover", model: "Defender", listing_title: "1985 Land Rover 110 Pickup Diesel 5-Speed", source_slug: "bringatrailer", sale_date: "2025-08-14", mileage: 151, price: 17250, vehicle_type: "car", sale_price: 17250 },
  { id: "a2", year: 1986, make: "Land Rover", model: "Defender", listing_title: "1986 Land Rover 110 Diesel", source_slug: "bringatrailer", sale_date: "2026-10-14", mileage: 400, price: 17250, vehicle_type: "car", sale_price: 17250 },
  { id: "a3", year: thisYear - 3, make: "Ford", model: "GT", listing_title: "recent car, low miles are real", source_slug: "carsandbids", sale_date: "2026-10-01", mileage: 120, price: 400000, vehicle_type: "car", sale_price: 400000 },
  { id: "a4", year: 1990, make: "Acura", model: "NSX", listing_title: "1990 Acura NSX", source_slug: "carsandbids", sale_date: "2026-09-01", mileage: 60000, price: 80000, vehicle_type: "car", sale_price: 80000 },
  { id: "a5", year: 1990, make: "Acura", model: "NSX", listing_title: "1990 Acura NSX zero miles", source_slug: "carsandbids", sale_date: "2026-09-02", mileage: 0, price: 80000, vehicle_type: "car", sale_price: 80000 },
  { id: "a6", year: 1972, make: "Datsun", model: "240Z", listing_title: "1972 Datsun 240Z", source_slug: "hemmings", sale_date: "2026-05-02", mileage: 499, price: 30000, vehicle_type: "car", sale_price: 30000 },
];
let writes = 0;
globalThis.fetch = async (url, init) => {
  const u = new URL(String(url)); if (init && init.method && init.method !== "GET") writes++;
  if (u.pathname.endsWith("/sales_archive")) {
    const gt = (u.searchParams.getAll("mileage").find(v => v.startsWith("gt.")) || "gt.-1").slice(3), lt = (u.searchParams.getAll("mileage").find(v => v.startsWith("lt.")) || "lt.1e9").slice(3);
    const ym = (u.searchParams.getAll("year").find(v => v.startsWith("lte.")) || "lte.9999").slice(4);
    const after = (u.searchParams.getAll("id").find(v => v.startsWith("gt.")) || "").slice(3);
    return new Response(JSON.stringify(rows.filter(r => r.mileage > Number(gt) && r.mileage < Number(lt) && r.year <= Number(ym) && r.id > after)), { status: 200 });
  }
  return new Response("[]", { status: 200 });
};
const H = await import(pathToFileURL(path.join(root, "api/usageDashboard.js")).href);
let body = null, code = 0; const res = { status(c) { code = c; return this; }, json(b) { body = b; return this; }, setHeader() {}, send(b) { body = b; return this; }, end() { return this; } };
await H.default({ method: "GET", query: { view: "ops", task: "milesfault" }, headers: { "x-ops-key": "k" }, body: null }, res);
ok("the task answers", code === 200 && body && body.task === "milesfault", `HTTP ${code}`);
ok("it flags the old low-mileage sales and nothing else (not a recent car, not 60,000 miles, not 0, not 499 on a 1972 that is in the list)", body && body.flagged === 3 && (body.first || []).map(x => x.id).sort().join() === "a1,a2,a6", JSON.stringify(body && body.first && body.first.map(x => x.id)));
ok("it counts by source and by decade", body && (body.bySource || {}).bringatrailer === 2 && (body.bySource || {}).hemmings === 1 && (body.byDecade || {})["1980s"] === 2 && (body.byDecade || {})["1970s"] === 1, JSON.stringify(body && [body.bySource, body.byDecade]));
ok("it names the model with the most flagged sales", body && body.topModels && body.topModels[0] && body.topModels[0].model === "Land Rover|Defender" && body.topModels[0].flagged === 2, JSON.stringify(body && body.topModels));
ok("it writes nothing and spends nothing", body && body.writes === 0 && body.ocdSpend === 0 && writes === 0, `writes ${writes}`);
console.log(failed ? `milesFaultCheck: ${failed} FAIL` : "milesFaultCheck: all PASS");
process.exit(failed ? 1 : 0);
