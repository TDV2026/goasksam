// Pool columns switch check (Oct 25 2026, docs/supabase-raw-columns.sql Block 5). No DB, no network: a fake PostgREST answers the
// pool read from a fixture whose real columns hold the same values as raw_record. Three things must hold:
//  (1) with the switch on, fetchQualifying returns EXACTLY the rows it returns with it off (every field of every row);
//  (2) a column read that fails (the column is not there) falls back to raw_record and still returns those same rows;
//  (3) with nothing set, or the flag read failing, the engine reads raw_record (fail closed).
//   node scripts/poolColumnsCheck.mjs
import { fetchQualifying, poolColumnsOn, POOL_RAW_COLS, POOL_COLUMN_COLS } from "../lib/onebox.js";
import assert from "node:assert/strict";

// jsonb text output, as Postgres prints it (", " and ": " separators) for ->> on an array or object
const jtext = v => v === null || v === undefined ? null : typeof v === "string" ? v : Array.isArray(v) ? "[" + v.map(x => JSON.stringify(x)).join(", ") + "]" : JSON.stringify(v);
const mk = (i, over = {}) => {
  const raw = { id: "ocd" + i, title: `${1999 + (i % 5)} Porsche 911 Carrera ${i}`, featured_image_url: `https://img.example/${i}.jpg`, mileage: i % 3 ? `${20000 + i}` : null,
    body_style: i % 2 ? "Coupe" : "Cabriolet", modifications: i % 4 === 0 ? ["Exhaust", "Tune"] : null, currency: "USD", transmission: i % 2 ? "Manual (6-Speed)" : "Automatic",
    exterior_color: "Black", title_status: "Clean", url: `https://bat.example/${i}`, source_url: `https://src.example/${i}`, city: "Austin", state: "TX", country_code: "US", auction_end_precision: "day", ...over };
  return { id: "uuid-" + String(i).padStart(4, "0"), source_id: raw.id, sale_price: 30000 + i * 700, sale_date: `2026-0${1 + (i % 9)}-1${i % 9}`, platform: "Bring a Trailer", listing_title: raw.title, year: 1999 + (i % 5),
    make: "Porsche", model: "911", vin_norm: null, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: false, raw_record: raw,
    image_url: raw.featured_image_url, mileage_text: raw.mileage, body_style: raw.body_style, modifications: raw.modifications, currency: raw.currency, transmission_text: raw.transmission,
    exterior_color: raw.exterior_color, title_status: raw.title_status, listing_url: raw.url, source_url: raw.source_url, city: raw.city, state: raw.state, country_code: raw.country_code, end_precision: raw.auction_end_precision };
};
const FIX = Array.from({ length: 24 }, (_, i) => mk(i)).concat([mk(40, { modifications: [], mileage: "" }), mk(41, { city: null, state: null, country_code: null })]);

const evalItem = (row, item) => {
  const ci = item.indexOf(":"); const hasAlias = ci > 0 && item[ci + 1] !== ":";
  const alias = hasAlias ? item.slice(0, ci) : null; const expr = hasAlias ? item.slice(ci + 1) : item;
  let val, key = alias;
  if (expr.startsWith("raw_record->>")) { const k = expr.slice(13); val = jtext(row.raw_record[k]); key = key || k; }
  else if (expr.endsWith("::text")) { const c = expr.slice(0, -6); val = row[c] === null || row[c] === undefined ? null : Array.isArray(row[c]) || typeof row[c] === "object" ? jtext(row[c]) : String(row[c]); key = key || c; }
  else { if (!(expr in row)) throw Object.assign(new Error("column " + expr + " does not exist"), { code: 400 }); val = row[expr]; key = key || expr; }
  return [key, val];
};
let missingColumns = false, lastSelect = "";
globalThis.fetch = async (url) => {
  const u = new URL(String(url)); const sel = u.searchParams.get("select");
  if (u.pathname.endsWith("/sales_archive")) {
    lastSelect = sel;
    if (missingColumns && sel.includes("image:image_url")) return new Response("{}", { status: 400 });
    const rows = FIX.map(r => Object.fromEntries(sel.split(",").map(it => evalItem(r, it))));
    return new Response(JSON.stringify(rows), { status: 200 });
  }
  if (u.pathname.endsWith("/app_config")) return new Response("[]", { status: 200 });
  return new Response("[]", { status: 200 });
};
const base = { supabaseUrl: "https://fake.example", supabaseKey: "k" };
const spec = () => ({ make: "Porsche", model: "911", trim: "", year: 2001, yearMin: 1999, yearMax: 2004, excludeVariants: [], genCode: null });
const since = new Date(Date.now() - 1825 * 864e5).toISOString();
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };

const off = await fetchQualifying(spec(), since, { ...base, poolColumns: false }, {});
const offSel = lastSelect;
const on = await fetchQualifying(spec(), since, { ...base, poolColumns: true }, {});
const onSel = lastSelect;
ok("the switch off reads raw_record", offSel === POOL_RAW_COLS);
ok("the switch on reads the columns", onSel === POOL_COLUMN_COLS);
ok("on returns rows", on.length > 0, `${on.length} rows`);
try { assert.deepEqual(on, off); ok("on and off return identical rows, every field", true, `${on.length} rows`); } catch (e) { ok("on and off return identical rows, every field", false, String(e.message).slice(0, 300)); }
ok("the array modification reads as the same text", on.some(r => r.mods === '["Exhaust", "Tune"]'));

missingColumns = true;
const dg = {};
const fb = await fetchQualifying(spec(), since, { ...base, poolColumns: true }, dg);
try { assert.deepEqual(fb, off); ok("a missing column falls back to raw_record with identical rows", dg.poolColumnsFellBack === true, "fell back"); } catch (e) { ok("a missing column falls back to raw_record with identical rows", false, String(e.message).slice(0, 200)); }
missingColumns = false;

lastSelect = "";
await fetchQualifying(spec(), since, { ...base }, {});
ok("nothing set: the engine reads raw_record", lastSelect === POOL_RAW_COLS);
globalThis.fetch = async () => { throw new Error("network down"); };
ok("a failing flag read is off", (await poolColumnsOn({ ...base })) === false);
process.exit(failed ? 1 : 0);
