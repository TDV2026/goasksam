// task=foreigncars READS IN BOUNDED PAGES AND FILTERS NOTHING ON raw_record (Lane B, Nov 1 2026). The first version sorted on a column sales_archive does not have (auction_end_date) and filtered on raw_record->>currency, so every size returned nothing.
// This check runs the task against a fake archive: it pages newest-first on sale_date, never sorts or filters on raw_record, stops at a short page, reports the pound and euro cars, and names the countries of the matched sales.
//   node scripts/foreignCarsTaskCheck.mjs [repo root]
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.PROBE_KEY = "testkey"; process.env.USAGE_DASHBOARD_KEY = "testkey"; process.env.OLDCARSDATA_API_KEY = "x";
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const urls = [];
const mk = (n, start) => Array.from({ length: n }, (_, i) => ({ sale_date: new Date(Date.parse("2026-10-30") - (start + i) * 864e5 / 10).toISOString().slice(0, 10), listing_title: "t", platform: "RM Sotheby's", year: i % 2 ? 1965 : 1962, make: "Aston Martin", model: i % 2 ? "DB5" : "DB4", currency: i % 3 === 0 ? "GBP" : i % 3 === 1 ? null : "USD", rcur: i % 3 === 1 ? "EUR" : null, cc: i % 3 === 2 ? "US" : "GB" }));
globalThis.fetch = async (url) => { const u = new URL(String(url)); urls.push(decodeURIComponent(u.search)); const page = urls.length - 1; return new Response(JSON.stringify(page < 2 ? mk(1000, page * 1000) : mk(300, 2000)), { status: 200 }); };
const h = (await import(pathToFileURL(path.join(root, "api/usageDashboard.js")).href)).default;
let out; const res = { status(c) { this.c = c; return this; }, json(j) { out = j; return this; }, setHeader() {}, end() {} };
await h({ method: "GET", headers: { "x-ops-key": "testkey" }, query: { view: "ops", task: "foreigncars", pages: "8" }, url: "/api/usageDashboard?view=ops&task=foreigncars" }, res);
ok("the task answers", res.c === 200 && out && out.task === "foreigncars", JSON.stringify(out).slice(0, 120));
ok("it reads in bounded pages and stops at the short page (3 reads for 2,300 rows, not 8)", urls.length === 3 && out.scanned === 2300, urls.length + " reads");
ok("it sorts on sale_date, never on a raw_record field, and filters on no raw_record field", urls.every(u => /order=sale_date\.desc/.test(u) && !/order=[^&]*raw_record/.test(u) && !/raw_record->>[a-z_]+=(in|eq|neq|like|ilike)\./.test(u)), urls[0]);
ok("later pages continue from the oldest sale of the page before", /sale_date=lt\.\d{4}-\d{2}-\d{2}/.test(urls[1]) && !/sale_date=lt\./.test(urls[0]));
ok("pound and euro sales are found from the column or the raw field, with their countries", out.matched > 0 && out.cars.length > 0 && out.cars.every(c => c.sales > 0 && Object.keys(c.currencies).every(k => k === "GBP" || k === "EUR")) && out.countries.GB > 0, JSON.stringify(out.countries));
console.log(fail ? `foreignCarsTaskCheck: ${fail} failure(s)` : "foreignCarsTaskCheck: all pass");
process.exit(fail ? 1 : 0);
