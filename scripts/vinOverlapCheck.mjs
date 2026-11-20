// vinOverlapCheck (Lane S, Nov 18 2026): task=vinoverlap through the REAL handler (api/usageDashboard.js) on a fake archive
// (global fetch stands in for PostgREST). Order, no VIN in any output, two sales plus a failed attempt, unknown VIN, chunking,
// short ids, each refusal, the 502, no writes. `--mutants` runs in a COPY of the worktree only (it rewrites lib/ops/vinOverlap.js).
import fs from "node:fs";
import { execFileSync } from "node:child_process";
let pass = 0, fail = 0;
const chk = (ok, name) => { if (ok) pass++; else { fail++; console.log("FAIL:", name); } };

if (process.argv.includes("--mutants")) {
  const f = "lib/ops/vinOverlap.js", orig = fs.readFileSync(f, "utf8");
  const M = [
    ["order lost (rows sorted by vin)", s => s.replace("const rows = norm.map(", "const rows = [...norm].sort().map(")],
    ["position replaced by the VIN", s => s.replace("({ position: i,", "({ position: v,")],
    ["no normalisation", s => s.replace('.toUpperCase().replace(/[^A-Z0-9]/g, "")', "")],
    ["a short id looked up", s => s.replace("MIN_ID = 11", "MIN_ID = 1")],
    ["chunk of 1000", s => s.replace("CHUNK = 150", "CHUNK = 1000")],
    ["failed chunk read as empty", s => s.replace("if (!s) return", "if (false) return")],
    ["failed attempts read as empty", s => s.replace("if (!a) return", "if (false) return")],
    ["no duplicate collapse", s => s.replace("if (!seen.has(k)) { seen.add(k); sales.push(r); }", "sales.push(r)")],
    ["last sale is the oldest", s => s.replace("const ls = sales[0]", "const ls = sales[sales.length - 1]")],
    ["more than 2000 accepted", s => s.replace("list.length > MAX_VINS", "list.length > 99999")],
    ["unsold read as sold count", s => s.replace("sales: sales.length,", "sales: sales.length + atts.length,")],
    ["a lookup on the last 6 characters", s => s.replace("const ask = [...new Set(norm.filter(", "const ask = [...new Set(norm.map(v => v.slice(-6)).filter(")],
    ["unknown VIN throws zeros away (null row)", s => s.replace("(byVin.get(v) || ZERO)", "(byVin.get(v) || {})")],
    ["a read error echoes the VINs", s => s.replace('error: "vinoverlap: a read failed, so no result. This is not an empty answer. Retry when the database is quiet." } };\n    const a', 'error: "failed " + inList } };\n    const a')],
    ["prices not rounded to USD column", s => s.replace("lastSalePriceUsd: ls ? usd(ls.sale_price_usd)", "lastSalePriceUsd: ls ? ls.sale_price")],
    ["attempt status raw", s => s.replace("statusWord(la.auction_status)", "la.auction_status")],
  ];
  let miss = 0;
  for (const [name, fn] of M) {
    const m = fn(orig);
    if (m === orig) { console.log("NOOP   ", name); miss++; continue; }
    fs.writeFileSync(f, m);
    let out = ""; try { out = execFileSync("node", ["scripts/vinOverlapCheck.mjs"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); } catch (e) { out = String(e.stdout || ""); out += "\nEXIT"; }
    const caught = /EXIT/.test(out) || /FAIL:/.test(out);
    console.log(caught ? "caught " : "MISSED ", name); if (!caught) miss++;
  }
  fs.writeFileSync(f, orig);
  console.log(`vinOverlapCheck mutants: ${miss} not caught`);
  process.exit(miss ? 1 : 0);
}

process.env.PROBE_KEY = "test-probe-key"; process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "svc"; process.env.OLDCARSDATA_API_KEY = "ocd";
const { default: handler } = await import("../api/usageDashboard.js");

const V = n => "WP0AB2A9" + String(n).padStart(9, "0");              // 17 chars, distinct
const A = V(1), B = V(2), UNKNOWN = V(3), PRE = "9113000456";          // PRE is 10 chars: short
const CH = "1E 31588", CH2 = "AB-1234.5678-901";                       // short chassis (7) and a 12 char chassis with separators
const sales = [
  { id: 1, vin_norm: A, source_slug: "bringatrailer", sale_date: "2024-03-01", sale_price_usd: 50000 },
  { id: 2, vin_norm: A, source_slug: "carsandbids", sale_date: "2025-06-10", sale_price_usd: 61000.4 },
  { id: 3, vin_norm: A, source_slug: "carsandbids", sale_date: "2025-06-10", sale_price_usd: 61000.4 },   // re-insert duplicate
  { id: 4, vin_norm: "AB12345678901", source_slug: "bonhams", sale_date: "1999-01-01", sale_price_usd: 9000 },
  { id: 5, vin_norm: "1E31588", source_slug: "bonhams", sale_date: "1999-01-01", sale_price_usd: 9 },
  { id: 6, vin_norm: PRE, source_slug: "bonhams", sale_date: "1999-01-01", sale_price_usd: 9 },
];
const attempts = [
  { chassis_vin_norm: A, source_slug: "bringatrailer", source_record_id: "x1", attempt_date: "2025-01-05", high_bid_usd: 40000, auction_status: "reserve_not_met" },
  { chassis_vin_norm: A, source_slug: "carsandbids", source_record_id: "x2", attempt_date: "2025-04-02", high_bid_usd: 48000, auction_status: "reserve_not_met" },
  { chassis_vin_norm: B, source_slug: "carsandbids", source_record_id: "x3", attempt_date: "2025-02-02", high_bid_usd: null, auction_status: "withdrawn" },
];
let calls = [], failOn = null, writes = 0, readsSeen = [];
globalThis.fetch = async (url, init = {}) => {
  const u = String(url), m = String(init.method || "GET").toUpperCase();
  if (m !== "GET") { writes++; return new Response("[]", { status: 200 }); }
  if (!u.includes("/rest/v1/")) throw new Error("outside call " + u);
  const table = /rest\/v1\/([a-z_]+)\?/.exec(u)[1], q = decodeURIComponent(u);
  const list = [...(/in\.\((.*?)\)/.exec(q)?.[1] || "").matchAll(/"([^"]+)"/g)].map(x => x[1]);
  calls.push({ table, n: list.length });
  if (failOn && failOn(table, calls.length)) return new Response("boom", { status: 500 });
  const col = table === "sales_archive" ? "vin_norm" : "chassis_vin_norm";
  let rows = (table === "sales_archive" ? sales : attempts).filter(r => list.includes(r[col]));
  rows = rows.slice().sort((a, b) => String(b.sale_date || b.attempt_date).localeCompare(String(a.sale_date || a.attempt_date)));
  const [lo, hi] = String(init.headers?.Range || "0-999").split("-").map(Number);
  return new Response(JSON.stringify(rows.slice(lo, hi + 1)), { status: 200, headers: { "content-type": "application/json" } });
};
async function call(body, { method = "POST", key = "test-probe-key", query = {} } = {}) {
  const headers = key ? { "x-ops-key": key } : {};
  const r = { method, headers, query: { view: "ops", task: "vinoverlap", ...query }, body };
  let status = 0, out = null, hdr = {};
  const res = { setHeader: (k, v) => { hdr[k] = v; }, status(c) { status = c; return this; }, json(o) { out = o; return this; }, end() { return this; }, send(o) { out = o; return this; } };
  calls = [];
  await handler(r, res);
  return { status, out, hdr, text: JSON.stringify(out) };
}

// 1. order kept, VIN replaced by its position, the joined numbers
const list = [B, A, UNKNOWN, A.toLowerCase().replace(/(.{4})/g, "$1 "), CH, CH2];
const r1 = await call({ vins: list });
chk(r1.status === 200 && r1.out.rows.length === 6, "one row per input VIN, 200");
chk(r1.out.rows.every((r, i) => r.position === i), "rows in input order, position = index");
chk(r1.out.rows[0].attempts === 1 && r1.out.rows[0].sales === 0 && r1.out.rows[0].lastAttemptStatus === "withdrawn" && r1.out.rows[0].lastHighBidUsd === null, "B: an attempt only, withdrawn, no bid");
const a = r1.out.rows[1];
chk(a.sales === 2 && a.lastSaleDate === "2025-06-10" && a.lastSalePriceUsd === 61000, "A: two sales (the re-insert duplicate counted once), last sale date and price");
chk(a.attempts === 2 && a.lastAttemptDate === "2025-04-02" && a.lastHighBidUsd === 48000 && a.lastAttemptStatus === "reserve not met", "A: two failed attempts, the latest date, bid and status");
chk(JSON.stringify(r1.out.rows[3]) === JSON.stringify({ ...a, position: 3 }), "the same car typed with spaces and lower case matches (archive normalisation)");
const u = r1.out.rows[2];
chk(u.matchable === true && u.sales === 0 && u.attempts === 0 && u.lastSaleDate === null && u.lastSalePriceUsd === null && u.lastAttemptDate === null && u.lastHighBidUsd === null && u.lastAttemptStatus === null, "an unknown VIN is zeros and nulls");
chk(r1.out.rows[4].matchable === false && r1.out.rows[4].sales === 0, "a 7 character chassis is not looked up (matchable false, zeros) though a row of that id exists");
chk(r1.out.rows[5].matchable === true && r1.out.rows[5].sales === 1, "a 12 character chassis with separators matches whole after normalising");
const rp = await call({ vins: [PRE] });
chk(rp.out.rows[0].matchable === false && rp.out.rows[0].sales === 0, "a 10 character pre 1981 style id is not looked up");
// no partial: a VIN that is only the tail of a stored one never matches
const rt = await call({ vins: [A.slice(0, 12), "X" + A] });
chk(rt.out.rows.every(r => r.sales === 0 && r.attempts === 0), "a prefix or a longer id never matches a stored VIN");

// 2. never echoes a VIN, anywhere
for (const [name, r] of [["answer", r1], ["short", rp], ["partial", rt]]) chk(![A, B, UNKNOWN, PRE, "31588", "WP0AB2A9"].some(v => r.text.includes(v) || r.text.toLowerCase().includes(v.toLowerCase())), `no VIN in the ${name} output`);
const r2 = await call({ vins: Array.from({ length: 2000 }, (_, i) => V(i + 10)) });
chk(r2.status === 200 && r2.out.rows.length === 2000 && !/WP0AB2A9/.test(r2.text), "2,000 VINs accepted, none echoed");
chk(r2.hdr["Cache-Control"] === "no-store", "answers are not cached (no-store)");

// 3. chunking: 2,000 distinct VINs are read 150 at a time, both tables, every VIN read once
const sizes = calls.filter(c => c.table === "sales_archive").map(c => c.n);
chk(sizes.length === 14 && sizes.slice(0, 13).every(n => n === 150) && sizes[13] === 50 && r2.out.chunks === 14, "2,000 VINs are 13 chunks of 150 and one of 50");
chk(calls.filter(c => c.table === "auction_attempts").length === 14, "each chunk reads the attempts too");
const rdup = await call({ vins: [A, A, A, B] });
chk(calls.filter(c => c.table === "sales_archive")[0].n === 2 && rdup.out.rows.length === 4, "a repeated VIN is read once and answered in every position");

// 4. refusals
const rk = await call({ vins: [A] }, { key: null });
chk(rk.status === 401 && calls.length === 0, "no key: refused, nothing read");
const rk2 = await call({ vins: [A] }, { key: "wrong" });
chk(rk2.status === 401 && calls.length === 0, "a wrong key: refused");
const rg = await call(undefined, { method: "GET" });
chk(rg.status === 405 && calls.length === 0, "GET refused, nothing read");
const rq = await call({ vins: [A] }, { query: { key: "test-probe-key" }, key: null });
chk(rq.status === 401 && calls.length === 0, "a key in the address is no way in");
const rbig = await call({ vins: Array.from({ length: 2001 }, (_, i) => V(i + 10)) });
chk(rbig.status === 400 && calls.length === 0 && !/WP0AB2A9/.test(rbig.text), "2,001 refused, nothing read");
for (const b of [undefined, {}, { vins: [] }, { vins: "x" }, "not json"]) { const rb = await call(b); chk(rb.status === 400 && calls.length === 0, "an empty or malformed body is refused: " + JSON.stringify(b)); }
const rn = await call({ vins: [123, null, {}, ""] });
chk(rn.status === 200 && rn.out.rows.every(r => r.matchable === false), "non string entries keep their place as not looked up");

// 5. a failed chunk is a 502, never a partial answer
for (const [name, fo] of [["sales read, first chunk", t => t === "sales_archive"], ["attempts read, first chunk", t => t === "auction_attempts"], ["a later chunk", (t, n) => n >= 3]]) {
  failOn = fo;
  const rf = await call({ vins: Array.from({ length: 400 }, (_, i) => V(i + 10)) });
  chk(rf.status === 502 && rf.out.rows === undefined && !/WP0AB2A9/.test(rf.text), "502 and no rows when " + name + " fails");
}
failOn = null;

// 6. no writes
chk(writes === 0, "no write of any kind was sent (every request was a GET)");
console.log(`vinOverlapCheck: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
