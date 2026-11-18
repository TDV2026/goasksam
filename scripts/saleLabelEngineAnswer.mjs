// The engine's real answer for "1987 Pontiac Firebird" (Lane S, Nov 17 2026), for scripts/saleLabelCheck.mjs: the live handler api/sellerDecision.js, the crew's request, on the RECORDED FIREBIRD of Lane B's variantRowsCheck (scripts/fixtures/firebirdShape.json built as an archive: the shape production answered with). Prints the handler's JSON on stdout, nothing else.
// A child process because it borrows the process environment and the fetch (the archive is fake); the page check reads the answer from here and serves it to Chrome as it is.
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(here, "..");
process.env.SUPABASE_URL = "https://fake.example"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.SUPABASE_ANON_KEY = "k"; process.env.OLDCARSDATA_API_KEY = "x"; process.env.LAUNCH_STAGE = "2"; process.env.CURTAIN_CREW_CODE = "sale-label-code";
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const WLD = await imp("scripts/_deskOlderWorld.mjs"), OB = await imp("lib/onebox.js"), VR = await imp("lib/variantRows.js"), { mintCrewCookieValue } = await imp("lib/_crew.js");
const log = console.log; console.log = () => {}; console.error = () => {};
const w = WLD.install(ROOT), DAY = 864e5; let seq = 0;
const f = JSON.parse(fs.readFileSync(path.join(ROOT, "data/variantFamilies.json"), "utf8")).families.find(x => x.id === "pontiac-firebird-3rd"), model = f.models[0], year = 1987, name = `${year} ${f.make} ${model}`;
const TRIM = { "Firehawk": null, "20th Anniversary Turbo Trans Am": "20th Anniversary Turbo Trans Am", "GTA": "GTA", "Trans Am": "Trans Am", "Formula": "Formula" }, RES = new Map();
const mk = (text, trim) => ({ status: "valid", vehicle: { raw: text, year, make: f.make, model, trim, confidence: "high", canonicalLabel: [year, f.make, model, trim].filter(Boolean).join(" ") } });
RES.set(name, mk(name, null)); for (const v of f.variants) RES.set(`${name} ${v.ask || v.name}`, mk(`${name} ${v.ask || v.name}`, TRIM[v.name] === undefined ? null : TRIM[v.name]));
VR.__setResolver(async text => RES.get(text) || { status: "needs_clarification", vehicle: null });
const SH = JSON.parse(fs.readFileSync(path.join(here, "fixtures/firebirdShape.json"), "utf8"));
const spread = (n, [a, m, b]) => { const pts = [[0, a - (m - a) * 0.6], [0.25, a], [0.5, m], [0.75, b], [1, b + (b - m) * 0.6]]; return Array.from({ length: n }, (_, i) => { const t = n > 1 ? i / (n - 1) : 0.5; for (let k = 1; k < pts.length; k++) if (t <= pts[k][0]) { const [t0, v0] = pts[k - 1], [t1, v1] = pts[k]; return Math.round(v0 + (v1 - v0) * (t - t0) / (t1 - t0)); } return Math.round(b); }); };
const rows = []; let q = 0;
const addRow = (title, yr, price, monthsAgo) => { const id = "fb" + (seq++), t = `${yr} ${f.make} ${model}${title ? " " + title : ""}`; rows.push({ id, source_id: id, sale_price: price, sale_date: new Date(Date.now() - Math.round(monthsAgo * 30.4) * DAY).toISOString().slice(0, 10), platform: q++ % 3 === 0 ? "Cars & Bids" : "Bring a Trailer", listing_title: t, year: yr, make: f.make, model, vin_norm: null, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: false, vehicle_type: "car",
  raw_record: { id, title: t, featured_image_url: "https://img.example/" + id + ".jpg", mileage: String(20000 + (q % 9) * 4000), body_style: "Coupe", modifications: null, currency: "USD", transmission: "Manual (5-Speed)", exterior_color: "Red", title_status: "Clean", url: "https://bat.example/" + id, source_url: "https://src.example/" + id, city: "Austin", state: "TX", country_code: "US", auction_end_precision: "day" } }); };
for (const g of SH.WORLD.groups) for (const wd of g.windows) { const ps = spread(wd.n, wd.p); ps.forEach((pr, i) => addRow(g.title, wd.years[0] + (i % (wd.years[1] - wd.years[0] + 1)), pr, wd.months[0] + (wd.months[1] - wd.months[0]) * (i / Math.max(1, wd.n - 1)))); }
for (let i = 0; i < SH.WORLD.replicas.n; i++) addRow(SH.WORLD.replicas.title, 1987, SH.WORLD.replicas.price + i * 50, 3 + i);
w.DATA.clear(); w.DATA.set(model, rows);
const SD = (await imp("api/sellerDecision.js")).default; let out = null;
const res = { status(c) { this.code = c; return this; }, json(b) { out = b; return this; }, setHeader() {}, end() {}, getHeader() {} };
await SD({ method: "POST", headers: { origin: "https://goasksam.com", cookie: "gas_crew=" + mintCrewCookieValue() }, query: {}, body: { oneBox: true, search: name }, socket: { remoteAddress: "10.4.0.1" } }, res);
fs.writeSync(1, JSON.stringify(out));
process.exit(0);
