// poolrowsCheck (Lane D, Nov 17 2026, lane-d-poolrows-2; order 2318): the read only ops task poolrows, through the REAL handler (api/usageDashboard.js) on a fake database (no network).
// CAUSE this guards: Lane F's variant story pull found three gaps in poolrows: sold rows had no gearbox or exterior colour (they were read from raw_record, which is empty for them), no reserve status and no way to tell one car sold twice from two cars; unsold attempts could be read only for a few families; and there was no way to read the descriptions of one flagged group.
// CLASS: every ops read that returns a row of a listing must (a) carry no seller name and no raw VIN (a car key stands for the VIN: keyed, one way, never derivable from the VIN), (b) be behind the probe key, (c) be bounded (one family, a window, a row cap), and (d) say what it covers. The class check reads every ops task that selects from sales_archive
// or auction_attempts and fails on a select that names a seller column or a seller key of raw_record, and on a poolrows output holding a raw VIN outside the one sold field it always had.
//   node scripts/poolrowsCheck.mjs [repo root]      --mutants breaks one rule at a time (each must fail)
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import crypto from "node:crypto"; import { spawnSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const args = process.argv.slice(2), here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(args.find(a => !a.startsWith("--")) || path.join(here, ".."));
if (args.includes("--mutants")) process.exit(mutants());
process.chdir(ROOT);
process.env.PROBE_KEY = "local-check-key"; process.env.OLDCARSDATA_API_KEY = "unused"; process.env.SUPABASE_URL = "https://stub.invalid"; process.env.SUPABASE_SERVICE_ROLE_KEY = "stub"; process.env.SUPABASE_ANON_KEY = "stub"; delete process.env.CAR_KEY_SECRET;
let pass = 0, fail = 0; const fails = []; const ok = (n, c, d) => { if (c) pass++; else { fail++; if (fails.length < 60) fails.push(n + (d !== undefined ? " " + JSON.stringify(d).slice(0, 280) : "")); } };
const section = async (name, fn) => { try { await fn(); } catch (e) { ok(name + " ran without throwing", false, String((e && e.stack) || e).slice(0, 300)); } };
const log = console.log, err = console.error; console.log = () => {}; console.error = () => {}; const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);

// ---- the fake database: sales_archive and auction_attempts, filtered the way PostgREST would -----------------------------------------
const VIN1 = "1G2FS87X0KL500001", VIN2 = "1G2FS87X0KL500002", VIN3 = "WBSBL93453PN12345";
const SELLER = "SELLERMARK_Jane_Doe";
const desc = (i, extra) => `Description text ${i}. ${extra || ""} DESCMARK${i}. Seller notes about the car.`;
const sold = (o) => ({ id: o.id, year: o.year || 1987, make: "Pontiac", model: "Firebird", listing_title: o.t, source_slug: o.src || "bringatrailer", platform: "Bring a Trailer", sale_date: o.d || "2026-03-10", sale_price: o.p || 30000, sale_price_usd: o.p || 30000, vin_norm: o.vin || null, project_flag: o.pf || null, vehicle_type: "car",
  transmission: o.gb || null, exterior_color: o.col || null, has_reserve: o.hr === undefined ? null : o.hr, description: o.desc || null, seller: SELLER, raw_record: { title: o.t, currency: "USD", mileage: String(o.mi || 40000), description: o.rdesc || null, seller: SELLER, seller_username: SELLER, featured_image_url: "https://img/x.jpg", transmission: null, exterior_color: null, body_style: "Coupe" } });
const att = (o) => ({ source_slug: o.src || "bringatrailer", source_record_id: o.id, chassis_vin_norm: o.vin || null, make: "Pontiac", model: "Firebird", year: o.year || 1987, attempt_date: o.d || "2026-04-10", auction_status: o.st || "reserve_not_met", high_bid: o.hb == null ? 21000 : o.hb, currency: "USD", has_reserve: o.hr === undefined ? true : o.hr, seller: SELLER,
  raw_record: { title: o.t, mileage: "52000", transmission: o.gb || "Automatic", exterior_color: o.col || "Red", description: o.desc || null, seller: SELLER, seller_username: SELLER, featured_image_url: "https://img/y.jpg", body_style: "Coupe" } });
const SOLD = [
  sold({ id: 1, t: "1987 Pontiac Firebird Trans Am GTA", vin: VIN1, gb: "Automatic", col: "Red", hr: false, desc: desc(1, "GTA package.") }),
  sold({ id: 2, t: "1987 Pontiac Firebird Trans Am", vin: VIN2, gb: "Manual", col: "Black", hr: true, desc: desc(2) }),
  sold({ id: 3, t: "1987 Pontiac Firebird Trans Am Replica", vin: null, gb: null, col: null, hr: null, desc: desc(3, "A replica of a Trans Am.") }),
  sold({ id: 4, t: "1987 Pontiac Firebird Formula tribute", vin: "", gb: "Automatic", col: "White", hr: undefined, desc: null, rdesc: desc(4, "tribute car"), d: "2026-05-02" }),
  sold({ id: 5, t: "1987 Pontiac Firebird Trans Am project", pf: "project", desc: desc(5, "a project car") }),
  sold({ id: 6, t: "1987 Pontiac Firebird Trans Am GTA", vin: VIN1, gb: "Automatic", col: "Red", hr: false, d: "2025-11-01", desc: desc(6) })   // the same car sold again (the repeat)
];
// 45 replicas for the sample cap and 3 attempts that name a replica
for (let i = 0; i < 45; i++) SOLD.push(sold({ id: 100 + i, t: `1987 Pontiac Firebird Trans Am Replica ${i}`, desc: desc(100 + i, "replica build"), d: "2026-02-" + String(1 + (i % 25)).padStart(2, "0") }));
const ATT = [
  att({ id: "A1", t: "1987 Pontiac Firebird Trans Am GTA", vin: VIN1, gb: "Automatic", col: "Red", hb: 21000, st: "reserve_not_met", d: "2026-04-10", desc: desc(201, "attempt gta") }),
  att({ id: "A2", t: "1987 Pontiac Firebird Trans Am", vin: VIN3, gb: "Manual", col: "Blue", hb: 18000, st: "withdrawn", hr: false, d: "2026-05-10", desc: desc(202) }),
  att({ id: "A3", t: "1987 Pontiac Firebird Trans Am Replica", vin: null, hb: 0, st: "reserve_not_met", d: "2026-06-10", desc: desc(203, "a replica") }),
  att({ id: "A4", t: "1987 Pontiac Firebird Formula tribute", src: "carsandbids", d: "2026-02-10", hb: 9000, desc: desc(204, "tribute") }),
  att({ id: "A5", t: "1987 Pontiac Firebird Trans Am", src: "hagerty", d: "2025-10-10", hb: 15000, desc: desc(205) })
];
const seen = [];
const itemOf = (row, it) => { const ci = it.indexOf(":"), alias = ci > 0 && !it.slice(ci).startsWith("::") ? it.slice(0, ci) : null, expr = alias ? it.slice(ci + 1) : it; if (expr.startsWith("raw_record->>")) { const k = expr.slice(13), v = row.raw_record && row.raw_record[k]; return [alias || k, v == null ? null : String(v)]; } return [alias || expr, row[expr] === undefined ? null : row[expr]]; };
const colOf = (row, c) => c.startsWith("raw_record->>") ? (row.raw_record || {})[c.slice(13)] : row[c];
const ilike = (v, pat) => new RegExp("^" + pat.split("*").map(t => t.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$", "i").test(String(v == null ? "" : v));
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url)), p = u.pathname, method = (init.method || "GET").toUpperCase(); seen.push({ method, p, qs: u.search });
  const table = p.split("/").pop(), rows = table === "sales_archive" ? SOLD : table === "auction_attempts" ? ATT : null;
  if (table === "taxonomy_makes") return new Response(JSON.stringify([{ name: "Pontiac" }, { name: "Mazda" }]), { status: 200 });   // the make list the resolver reads
  if (!rows) return new Response("[]", { status: 200 });
  let out = rows.slice(); const dateCol = table === "sales_archive" ? "sale_date" : "attempt_date";
  for (const [k, v] of u.searchParams) {
    if (["select", "order", "limit", "offset"].includes(k)) continue;
    if (k === "or") { const parts = v.slice(1, -1).split(","); out = out.filter(r => parts.some(pt => { const m = /^(.*)\.ilike\.(.*)$/.exec(pt); return m && ilike(colOf(r, m[1]), decodeURIComponent(m[2])); })); continue; }
    const m = /^(eq|ilike|gte|lte|not\.is)\.(.*)$/.exec(v); if (!m) continue; const [, op, val] = m;
    out = out.filter(r => { const x = colOf(r, k); if (op === "eq") return String(x) === val; if (op === "ilike") return ilike(x, val); if (op === "gte") return String(x) >= val; if (op === "lte") return String(x) <= val; if (op === "not.is") return x != null; return true; });
  }
  const [ord, dir] = (u.searchParams.get("order") || "").split("."); if (ord) out.sort((a, b) => dir === "asc" ? String(colOf(a, ord)).localeCompare(String(colOf(b, ord))) : String(colOf(b, ord)).localeCompare(String(colOf(a, ord))));
  const total = out.length, lim = Number(u.searchParams.get("limit")) || 1000, off = Number(u.searchParams.get("offset")) || 0; out = out.slice(off, off + lim);
  const sel = (u.searchParams.get("select") || "*").split(",").filter(Boolean);
  const body = sel[0] === "*" ? out : out.map(r => Object.fromEntries(sel.map(it => itemOf(r, it))));
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", "content-range": `${off}-${Math.max(0, off + out.length - 1)}/${total}` } });
};
const { default: handler } = await imp("api/usageDashboard.js");
const call = async (headers, query) => { let code = 200, body = null, hdrs = {}; const q = { view: "ops", task: "poolrows", ...query }; const res = { statusCode: 200, setHeader(k, v) { hdrs[String(k).toLowerCase()] = v; }, getHeader() {}, status(c) { code = c; return this; }, json(o) { body = o; return this; }, send(o) { body = o; return this; }, end() { return this; } }; await handler({ method: "GET", url: "/api/usageDashboard?" + new URLSearchParams(q), query: q, headers }, res); return { code, body, hdrs }; };
const KEY = { "x-ops-key": "local-check-key" }, FAM = { make: "Pontiac", model: "Firebird" };
const byId = (b, id) => (b && b.rows || []).find(r => String(r.id) === String(id));
const hexOf = (s, algo) => crypto.createHash(algo).update(s).digest("hex");
const secretOf = () => process.env.PROBE_KEY;

// ===== 1 THE DOOR =====
await section("door", async () => {
  for (const [n, q] of [["sold", {}], ["attempts", { table: "attempts", since: "2025-01-01" }], ["sample", { sample: "1", flag: "replica", since: "2026-01-01", until: "2026-12-31" }]]) {
    seen.length = 0; const r = await call({}, { ...FAM, ...q });
    ok(`a ${n} request without the key is refused (401) and reads nothing`, r.code === 401 && seen.length === 0, [r.code, seen.length]);
    const r2 = await call({ "x-ops-key": "wrong" }, { ...FAM, ...q }); ok(`a ${n} request with a wrong key is refused`, r2.code === 401);
    const r3 = await call({}, { ...FAM, ...q, key: "local-check-key" }); ok(`a ${n} request with the key in the address is refused (header only)`, r3.code === 401);
  }
});

// ===== 2 SOLD ROWS: gearbox, colour, reserve, car key =====
await section("sold", async () => {
  const r = await call(KEY, { ...FAM, since: "2025-01-01", limit: 500 }), b = r.body;
  ok("a sold read answers 200 with the rows", r.code === 200 && b && b.task === "poolrows" && b.rows.length > 0, [r.code, b && Object.keys(b)]);
  ok("gearbox comes from the transmission column (raw_record holds none)", byId(b, 1).gearbox === "Automatic" && byId(b, 2).gearbox === "Manual" && byId(b, 3).gearbox === null, [byId(b, 1).gearbox, byId(b, 2).gearbox]);
  ok("exterior colour comes from the exterior_color column", byId(b, 1).exterior_color === "Red" && byId(b, 2).exterior_color === "Black" && byId(b, 3).exterior_color === null);
  ok("reserve status: reserve, no_reserve, unknown", byId(b, 2).reserve === "reserve" && byId(b, 1).reserve === "no_reserve" && byId(b, 3).reserve === "unknown" && byId(b, 4).reserve === "unknown", [byId(b, 1).reserve, byId(b, 2).reserve, byId(b, 3).reserve]);
  const k1 = byId(b, 1).car_key, k2 = byId(b, 2).car_key, k6 = byId(b, 6).car_key;
  ok("a car with a VIN has a 16 character car key", /^[0-9a-f]{16}$/.test(k1) && /^[0-9a-f]{16}$/.test(k2), [k1, k2]);
  ok("the same VIN gives the same key (a repeat is found) and another VIN another key", k1 === k6 && k1 !== k2, [k1, k6, k2]);
  ok("no VIN gives an empty key (null VIN and empty VIN)", byId(b, 3).car_key === "" && byId(b, 4).car_key === "");
  for (const [vin, key] of [[VIN1, k1], [VIN2, k2]]) {
    const hashes = ["sha256", "sha1", "md5", "sha512"].map(a => hexOf(vin, a)).concat(["sha256", "sha1", "md5"].map(a => hexOf(vin.toLowerCase(), a)), [Buffer.from(vin).toString("hex"), Buffer.from(vin).toString("base64")]);
    ok(`the car key of ${vin.slice(0, 4)}... is never the VIN, never contains it, and is no plain hash or encoding of it`, key !== vin && !key.includes(vin) && !key.toLowerCase().includes(vin.toLowerCase()) && !hashes.some(h => h.startsWith(key) || h.includes(key) || key.includes(h)), key);
  }
  ok("the key depends on the server secret: the same VIN under another secret gives another key (so it cannot be derived from the VIN alone)", (() => { process.env.CAR_KEY_SECRET = "another-secret"; return true; })());
  const r2 = await call(KEY, { ...FAM, since: "2025-01-01", limit: 500 }); delete process.env.CAR_KEY_SECRET;
  ok("...and it does", byId(r2.body, 1).car_key !== k1 && /^[0-9a-f]{16}$/.test(byId(r2.body, 1).car_key), [byId(r2.body, 1).car_key, k1]);
  ok("the verdicts ride on sold rows: variant, variant family and the replica flag", byId(b, 1).variant === "GTA" && byId(b, 2).variant === "Trans Am" && byId(b, 3).replica === true && byId(b, 2).replica === false && byId(b, 1).variantFamily === "pontiac-firebird-3rd", [byId(b, 1).variant, byId(b, 2).variant, byId(b, 3).replica]);
  ok("no seller name anywhere in a sold answer", !JSON.stringify(b).includes("SELLERMARK") && !/seller/i.test(Object.keys(byId(b, 1)).join()), Object.keys(byId(b, 1)));
  ok("every existing field is still there", ["id", "year", "make", "model", "listing_title", "source_slug", "platform", "sale_date", "sale_price", "sale_price_usd", "hammerUsd", "allInUsd", "mileage", "vin_norm", "has_photo", "project_flag", "country", "inMarket", "engineVerdict"].every(k => k in byId(b, 1)), Object.keys(byId(b, 1)));
  ok("the existing caps stand: the row cap is 500", (await call(KEY, { ...FAM, limit: 9999 })).body.rows.length <= 500);
});

// ===== 3 UNSOLD ATTEMPTS: any family, the same fields plus high bid, outcome, date; the engine's verdicts; the coverage =====
await section("attempts", async () => {
  const r = await call(KEY, { ...FAM, table: "attempts", since: "2025-01-01", fence: "1", q: "1987 Pontiac Firebird Trans Am" }), b = r.body;
  ok("an attempts read answers 200 with the rows", r.code === 200 && b && b.table === "attempts" && b.rows.length === 5 && b.total === 5, [r.code, b && b.rows && b.rows.length, b && b.error]);
  const a1 = byId(b, "A1"), a2 = byId(b, "A2"), a3 = byId(b, "A3");
  ok("the high bid, the outcome and the attempt date", a1.high_bid === 21000 && a1.outcome === "reserve_not_met" && a1.attempt_date === "2026-04-10" && a2.outcome === "withdrawn" && a3.high_bid === null, [a1.high_bid, a1.outcome, a1.attempt_date, a3.high_bid]);
  ok("the same fields as a sold row: gearbox, colour, reserve, mileage, car key", a1.gearbox === "Automatic" && a1.exterior_color === "Red" && a1.reserve === "reserve" && a2.reserve === "no_reserve" && a1.mileage === "52000" && /^[0-9a-f]{16}$/.test(a1.car_key) && a3.car_key === "", a1);
  ok("the car key of an attempt is the key of the same car's sale (a repeat shows across the two tables)", a1.car_key === byId((await call(KEY, { ...FAM, since: "2025-01-01", limit: 500 })).body, 1).car_key);
  ok("the engine's verdicts: the variant and the replica flag", a1.variant === "GTA" && a2.variant === "Trans Am" && a3.replica === true && a2.replica === false && byId(b, "A4").replica === true && a1.variantFamily === "pontiac-firebird-3rd", [a1.variant, a3.replica]);
  ok("the engine's set aside reason is on the replica and not on the real car", /replica|memorabilia/i.test(String(a3.engineVerdict)) && a2.engineVerdict === null && a1.engineVerdict === null, [a3.engineVerdict, a2.engineVerdict, a1.engineVerdict]);
  const cov = b.coverage;
  ok("it states which venues the attempts cover", !!cov && JSON.stringify(cov.venuesHeld) === JSON.stringify(["bringatrailer", "carsandbids", "hagerty", "sothebysmotorsport", "mbmarket"]) && JSON.stringify(cov.venuesInThisRead) === JSON.stringify(["bringatrailer", "carsandbids", "hagerty"]), cov);
  ok("and which dates: this family's first and last attempt, the window and each venue's first and last", cov.datesInThisFamily.first === "2025-10-10" && cov.datesInThisFamily.last === "2026-06-10" && cov.tableDatesByVenue.bringatrailer.first === "2026-04-10" && cov.tableDatesByVenue.hagerty.last === "2025-10-10" && cov.datesInThisWindow.since === "2025-01-01", cov);
  ok("any family, not only BMW and Porsche: another make reads too (an empty read, a 200)", (await call(KEY, { make: "Mazda", table: "attempts", since: "2025-01-01" })).code === 200);
  ok("the window narrows the read", (await call(KEY, { ...FAM, table: "attempts", since: "2026-05-01" })).body.rows.length === 2);
  ok("an attempts read with no family or no since date is refused", (await call(KEY, { table: "attempts", since: "2025-01-01" })).code === 400 && (await call(KEY, { ...FAM, table: "attempts" })).code === 400);
  ok("no seller name, no raw VIN and no listing text in an attempts answer", !JSON.stringify(b).includes("SELLERMARK") && !JSON.stringify(b).includes("DESCMARK") && ![VIN1, VIN2, VIN3].some(v => JSON.stringify(b).includes(v)) && !/chassis_vin|vin_norm|seller|description/i.test(Object.keys(a1).join()), Object.keys(a1));
  ok("the read selects no seller column and no seller key", seen.filter(s => /auction_attempts/.test(s.p)).every(s => !/seller/i.test(decodeURIComponent(s.qs).replace(/&order=.*/, ""))), seen.filter(s => /auction_attempts/.test(s.p) && /seller/i.test(s.qs)).length);
  ok("attempts reads are GET only", seen.every(s => s.method === "GET"));
});

// ===== 4 SAMPLE MODE =====
await section("sample", async () => {
  const W = { since: "2026-01-01", until: "2026-12-31" }, S = { sample: "1", ...FAM, ...W, flag: "replica" };
  const r = await call(KEY, { ...S, limit: 40 }), b = r.body;
  ok("a sample of the replicas of one family answers 200 with at most 40 listings", r.code === 200 && b.mode === "sample" && b.count === 40 && b.rows.length === 40 && b.flag === "replica", [r.code, b && b.count, b && b.error]);
  ok("every listing is a replica or tribute and carries its description", b.rows.every(x => x.replica === true && /Description text/.test(x.description || "")), b.rows[0]);
  ok("the answer is marked do not write to disk (field, notice and header)", b.doNotWriteToDisk === true && /DO NOT WRITE TO DISK/.test(b.notice) && r.hdrs["x-do-not-write-to-disk"] === "1" && r.hdrs["cache-control"] === "no-store", [b.doNotWriteToDisk, r.hdrs]);
  ok("41 is refused (the cap is 40), and so is 0 and a negative", (await call(KEY, { ...S, limit: 41 })).code === 400 && (await call(KEY, { ...S, limit: 0 })).code === 400 && (await call(KEY, { ...S, limit: -3 })).code === 400);
  ok("the default is smaller than the cap", (await call(KEY, S)).body.count === 10);
  ok("no seller name and no raw VIN in a sample", !JSON.stringify(b).includes("SELLERMARK") && ![VIN1, VIN2, VIN3].some(v => JSON.stringify(b).includes(v)) && !/seller|vin_norm|chassis/i.test(Object.keys(b.rows[0]).join()), Object.keys(b.rows[0]));
  const at = await call(KEY, { ...S, table: "attempts" });
  ok("a sample of attempts: the replicas among the attempts, with the description", at.code === 200 && at.body.table === "attempts" && at.body.count === 2 && at.body.rows.every(x => x.replica && x.description), at.body && [at.body.count, at.body.error]);
  ok("a sample of project cars (sold)", (await call(KEY, { sample: "1", ...FAM, ...W, flag: "project" })).body.count === 1);
  ok("one flagged group only: a second flag, an unknown flag and no flag are refused", (await call(KEY, { ...S, flag: "replica,project" })).code === 400 && (await call(KEY, { ...S, flag: "x" })).code === 400 && (await call(KEY, { ...S, flag: "" })).code === 400);
  ok("one family only: no family is refused", (await call(KEY, { sample: "1", flag: "replica", ...W })).code === 400);
  ok("a window is required and is at most 366 days (the census limit)", (await call(KEY, { sample: "1", ...FAM, flag: "replica" })).code === 400 && (await call(KEY, { ...S, since: "2025-01-01", until: "2026-12-31" })).code === 400 && (await call(KEY, { ...S, since: "2026-01-01", until: "2026-12-31" })).code === 200);
  const sa = await call(KEY, { sample: "1", ...FAM, ...W, flag: "setaside", q: "1987 Pontiac Firebird Trans Am", limit: 5 });
  ok("a sample of the engine's set asides for the typed words", sa.code === 200 && sa.body.count > 0 && sa.body.rows.every(x => x.replica || /project|replica|memorabilia/i.test(x.listing_title)), sa.body && [sa.code, sa.body.count, sa.body.error]);
  ok("setaside needs the typed words", (await call(KEY, { sample: "1", ...FAM, ...W, flag: "setaside" })).code === 400);
});

// ===== 5 THE CLASS: no ops read of a listing selects a seller; the VIN never leaves except where it always did =====
await section("class", async () => {
  const dash = fs.readFileSync("api/usageDashboard.js", "utf8"), block = dash.slice(dash.indexOf('if (task === "poolrows")'), dash.indexOf("// ===================== Sam Desk Stage A"));
  const src = block + fs.readFileSync("lib/poolRowsExt.js", "utf8") + fs.readFileSync("lib/valueCensus.js", "utf8") + fs.readFileSync("lib/factMine.js", "utf8");
  const sel = [...src.matchAll(/(?:sales_archive|auction_attempts|vehicle_market_records)\?(?:[^`"']*?)select=([^&`"']+)/g)].map(m => m[1]), colsOf = [...src.matchAll(/(?:ATT_POOL_COLS|ATT_DESC_COLS|SOLD_COLS|ATT_COLS|SOLD_EXTRA_COLS) = "([^"]+)"/g)].map(m => m[1]);
  const bad = sel.concat(colsOf).filter(s => /(^|,|:)(seller|seller_name|seller_username|seller_type|owner)(,|$)|raw_record->>seller|raw_record->>owner|raw_record->>user/i.test(s));
  ok("no poolrows, census or fact mining read selects a seller column or a seller key of raw_record (" + (sel.length + colsOf.length) + " selects read)", sel.length + colsOf.length > 8 && bad.length === 0, bad);
  const sellerSel = [...dash.matchAll(/select=[^`"']*seller_username(?!s)[^`"']*/g)].map(m => m[0]);
  ok("the only other ops reads of a seller handle are the two partner premium reads (vehicle_market_records, by the partner's own handles): a new one fails here until it is reviewed", sellerSel.length === 2 && sellerSel.every(x => /make,model,year,price,auction_status/.test(x)), sellerSel.map(x => x.slice(0, 80)));
  const poolSrc = fs.readFileSync("lib/poolRowsExt.js", "utf8");
  ok("attempt and sample rows are shaped with the car key and never the raw VIN field", !/vin_norm:\s*r\.|chassis_vin_norm:\s*r\./.test(poolSrc.slice(poolSrc.indexOf("export function attemptRow"), poolSrc.indexOf("// ---- the filters"))) && !/chassis_vin_norm:|vin_norm:/.test(poolSrc.slice(poolSrc.indexOf("export function sampleRow"))));
});
console.log = log; console.error = err;
log(fails.map(f => "FAIL " + f).join("\n") + (fails.length ? "\n" : "") + `poolrowsCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);

function mutants() {
  const sub = (file, from, to, want) => ({ file, from, to, want });
  const M = [
    sub("lib/poolRowsExt.js", "export const SOLD_EXTRA_COLS = \"gearbox:transmission,color:exterior_color,has_reserve\";", "export const SOLD_EXTRA_COLS = \"gearbox:raw_record->>transmission,color:raw_record->>exterior_color,has_reserve\";", "gearbox and colour are read from raw_record again"),
    sub("lib/poolRowsExt.js", "export const reserveOf = v => v === true || v === \"true\" ? \"reserve\" : v === false || v === \"false\" ? \"no_reserve\" : \"unknown\";", "export const reserveOf = v => v === true || v === \"true\" ? \"reserve\" : \"no_reserve\";", "an unknown reserve is called no reserve"),
    sub("lib/poolRowsExt.js", "return crypto.createHmac(\"sha256\", String(secret)).update(\"carkey1:\" + v).digest(\"hex\").slice(0, 16);", "return crypto.createHash(\"sha256\").update(v).digest(\"hex\").slice(0, 16);", "the car key is a plain hash of the VIN (derivable)"),
    sub("lib/poolRowsExt.js", "return crypto.createHmac(\"sha256\", String(secret)).update(\"carkey1:\" + v).digest(\"hex\").slice(0, 16);", "return v;", "the car key is the VIN"),
    sub("lib/poolRowsExt.js", "if (!v || !secret) return \"\";", "if (!secret) return \"\";", "a missing VIN gets a key"),
    sub("lib/poolRowsExt.js", ".replace(/[^A-Z0-9]/g, \"\");\n  if (!v", ".replace(/[^A-Z0-9]/g, \"\") + Math.random();\n  if (!v", "the same VIN does not give the same key"),
    sub("lib/poolRowsExt.js", "car_key: carKeyOf(r.chassis_vin_norm, secret), variant: v.variant", "car_key: carKeyOf(r.chassis_vin_norm, secret), vin: r.chassis_vin_norm, variant: v.variant", "an attempt row carries the raw VIN"),
    sub("lib/poolRowsExt.js", "const ATT_X = 1;", "", "x"),
    sub("lib/poolRowsExt.js", "export const ATT_POOL_COLS = \"id:source_record_id,", "export const ATT_POOL_COLS = \"seller:raw_record->>seller,id:source_record_id,", "an attempts read selects the seller"),
    sub("lib/poolRowsExt.js", "export const ATT_DESC_COLS = \"id:source_record_id,", "export const ATT_DESC_COLS = \"seller:raw_record->>seller_username,id:source_record_id,", "a sample read selects the seller"),
    sub("lib/poolRowsExt.js", "export const SAMPLE_MAX = 40,", "export const SAMPLE_MAX = 400,", "a sample of more than 40 is allowed"),
    sub("lib/poolRowsExt.js", "if (days(since, until) > MAX_WINDOW_DAYS) return", "if (false) return", "a sample over a window of more than 366 days is allowed"),
    sub("lib/poolRowsExt.js", "if (!SAMPLE_FLAGS.includes(flag)) return", "if (false) return", "a sample of any or no flag is allowed"),
    sub("lib/poolRowsExt.js", "if (!get(\"make\") && !get(\"title\") && !get(\"model\")) return", "if (false) return", "a sample of no family is allowed"),
    sub("lib/poolRowsExt.js", "export const DO_NOT_WRITE = \"DO NOT WRITE TO DISK.", "export const DO_NOT_WRITE = \"Read in process.", "the sample notice does not say do not write"),
    sub("api/usageDashboard.js", "doNotWriteToDisk: true, notice: PX.DO_NOT_WRITE,", "notice: PX.DO_NOT_WRITE,", "the sample is not marked do not write to disk"),
    sub("api/usageDashboard.js", "res.setHeader(\"X-Do-Not-Write-To-Disk\", \"1\");", "", "the sample header is missing"),
    sub("api/usageDashboard.js", "setAside: fsp ? titleFenceReason(", "setAside: false ? titleFenceReason(", "attempts carry no engine set aside"),
    sub("api/usageDashboard.js", "const coverage = await PX.attemptsCoverage(qs2 => supabaseSelect(env, qs2), f, rows);", "const coverage = null;", "attempts do not say which venues and dates they cover"),
    sub("api/usageDashboard.js", "if (!since) return res.status(400).json({ task: \"poolrows\", table: \"attempts\"", "if (false) return res.status(400).json({ task: \"poolrows\", table: \"attempts\"", "an unwindowed attempts read is allowed"),
    sub("api/usageDashboard.js", "...PX.soldExtras(r, secret)", "", "sold rows carry none of the new fields"),
    sub("api/usageDashboard.js", "const rows = keep.slice(0, c.limit).map(r => PX.sampleRow(c, r, secret));", "const rows = keep.map(r => PX.sampleRow(c, r, secret));", "a sample is not cut at the limit")
  ].filter(m => m.want !== "x");
  let survivors = 0;
  for (const m of M) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prc-"));
    spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", ROOT + "/", dir + "/"]); fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"));
    const fp = path.join(dir, m.file), src = fs.readFileSync(fp, "utf8"), out = src.replace(m.from, () => m.to);
    if (out === src) { console.log(`MUTANT NOT APPLIED  ${m.want}`); survivors++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
    fs.writeFileSync(fp, out);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/poolrowsCheck.mjs"), dir], { encoding: "utf8", timeout: 600000 }), killed = r.status !== 0;
    console.log(`${killed ? "killed  " : "SURVIVED"}  ${m.want}`); if (!killed) survivors++;
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(survivors ? `\n${survivors} mutant(s) survived` : "\nall mutants killed"); return survivors ? 1 : 0;
}
