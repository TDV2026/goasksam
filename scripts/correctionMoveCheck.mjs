// A corrected row that moves out of the asked make or model leaves that pool (Oct 25 2026, golden row 34: the BaT 1954 300b Cabriolet D filed
// under model "300SL"). No database, no network: a fake PostgREST serves a small fixture; the real fetchQualifying reads it.
//   node scripts/correctionMoveCheck.mjs
import { fetchQualifying } from "../lib/onebox.js";
import { SOURCE_ROW_CORRECTIONS, correctionsThatMoveRows, movedOutOf, applyRowCorrection } from "../lib/_corrections.js";
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const mk = (i, over) => ({ id: "id" + i, source_id: String(over.source_id || "s" + i), sale_price: 150000 + i * 1000, sale_date: "2026-0" + (1 + (i % 8)) + "-10", platform: over.platform || "Bring a Trailer", listing_title: over.title, year: over.year, make: over.make || "Mercedes-Benz", model: over.model, vin_norm: null, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: null, source_slug: over.slug || "bringatrailer", vehicle_type: "car", sale_price_usd: 150000 + i * 1000,
  raw_record: { title: over.title, featured_image_url: "https://x/i.jpg", currency: "USD", url: "https://u/" + i, mileage: null, body_style: null, modifications: null } });
const FIX = [
  mk(1, { title: "1957 Mercedes-Benz 300SL Roadster", year: 1957, model: "300SL" }), mk(2, { title: "1958 Mercedes-Benz 300SL Roadster", year: 1958, model: "300SL" }),
  mk(3, { title: "1954 Mercedes-Benz 300b Cabriolet D", year: 1954, model: "300SL", source_id: "124485" }),
  mk(4, { title: "1954 Mercedes-Benz 300b Cabriolet D", year: 1954, model: "300SL", source_id: "999001" }),   // same labels, NOT in the table: stays
  mk(6, { title: "1952 Mercedes-Benz 300 Cabriolet D Project", year: 1952, model: "300SL", source_id: "77029" }),
  mk(5, { title: "1987 Ford Sierra RS Cosworth", year: 1987, make: "Merkur", model: "XR4Ti", source_id: "176322" })
];
const ev = (row, it) => { const ci = it.indexOf(":"); const alias = ci > 0 && it[ci + 1] !== ":" ? it.slice(0, ci) : null; const expr = alias ? it.slice(ci + 1) : it; if (expr.startsWith("raw_record->>")) { const v = row.raw_record[expr.slice(13)]; return [alias || expr.slice(13), v == null ? null : String(v)]; } return [alias || expr, row[expr] === undefined ? null : row[expr]]; };
globalThis.fetch = async (url) => { const u = new URL(String(url)); if (u.pathname.endsWith("/sales_archive")) { const sel = u.searchParams.get("select"); return new Response(JSON.stringify(FIX.map(r => Object.fromEntries(sel.split(",").map(it => ev(r, it))))), { status: 200 }); } return new Response("[]", { status: 200 }); };
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k", poolColumns: false };
const since = new Date(Date.now() - 1825 * 864e5).toISOString();
const ids = rows => rows.map(r => r.source_id).sort().join(",");

const pool300 = await fetchQualifying({ make: "Mercedes-Benz", model: "300SL", trim: "", year: 1957, yearMin: 1952, yearMax: 1963 }, since, env, {});
ok("the corrected 300b Cabriolet D (124485) is not in the 300SL pool", !pool300.some(r => r.source_id === "124485"), ids(pool300));
ok("the second corrected row (77029) is not in the 300SL pool either", !pool300.some(r => r.source_id === "77029"));
ok("an identical row that is NOT in the table stays (the rule is the table, not a title guess)", pool300.some(r => r.source_id === "999001"));
ok("the real 300SL sales stay", pool300.filter(r => /300SL Roadster/.test(r.raw_title)).length === 2);
const poolMerkur = await fetchQualifying({ make: "Merkur", model: "XR4Ti", trim: "", year: 1987, yearMin: 1985, yearMax: 1989 }, since, env, {});
ok("the Sierra RS Cosworth filed under Merkur leaves the Merkur XR4Ti pool", !poolMerkur.some(r => r.source_id === "176322"));
const a = { source_slug: "bringatrailer", source_id: "124485", make: "Mercedes-Benz", model: "300SL" }; applyRowCorrection(a);
ok("movedOutOf: the corrected row is out of 300SL, in for its own model", movedOutOf(a, { make: "Mercedes-Benz", model: "300SL" }) && !movedOutOf(a, { make: "Mercedes-Benz", model: "300b Cabriolet D" }));
ok("movedOutOf: a row never corrected is never out", !movedOutOf({ source_slug: "bringatrailer", source_id: "1", make: "Mercedes-Benz", model: "300SL" }, { make: "Mercedes-Benz", model: "300SL" }));
const moves = correctionsThatMoveRows();
ok("the table's make-or-model corrections are the three known entries", moves.length === 3 && moves.some(m => m.key === "bringatrailer|124485" && m.model === "300b Cabriolet D") && moves.some(m => m.key === "bringatrailer|77029" && m.model === "300 Cabriolet D") && moves.some(m => m.key === "bringatrailer|176322"), JSON.stringify(moves.map(m => m.key)));
process.exit(failed ? 1 : 0);
