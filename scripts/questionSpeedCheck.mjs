// e95: the speed of questions. A question must not be slower than the old question by more than QUESTION_BUDGET_MS (250 ms, one stored read);
// a question the rule resolves is an ordinary answer. Measured offline with 100 ms of simulated latency on every read, cold (first ask, stored row read from
// the table) and warm (instance memory), for a bare "911" (generation), a body question and a gearbox question; the OLD column is the engine with the rule off.
//   node scripts/questionSpeedCheck.mjs [repo root]
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
const ev = (row, it) => { const ci = it.indexOf(":"); const alias = ci > 0 && it[ci + 1] !== ":" ? it.slice(0, ci) : null; const expr = alias ? it.slice(ci + 1) : it; if (expr.startsWith("raw_record->>")) { const k = expr.slice(13); const v = row.raw_record[k]; return [alias || k, v == null ? null : String(v)]; } return [alias || expr, row[expr] === undefined ? null : row[expr]]; };
const likeRe = v => new RegExp("^" + String(v).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
const rows = []; let n = 0; const day = i => new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
const sale = (make, model, year, title, price, ago, body, tx) => { n++; rows.push({ id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), source_id: "sp" + n, sale_price: price, sale_date: day(ago), platform: "Bring a Trailer", source_slug: "bringatrailer", make, model, year, listing_title: title, vin_norm: "V" + n, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: null, vehicle_type: "car", sale_price_usd: price,
  raw_record: { featured_image_url: "https://x/i.jpg", mileage: String(9000 + n * 700), body_style: body, modifications: null, title, currency: "USD", transmission: tx || null, exterior_color: null, title_status: null, url: "https://u/" + n, source_url: null, city: "Austin", state: "TX", country_code: "US", auction_end_precision: null } }); };
// 911 across generations
const gens = [[1965, 1973, 90000], [1974, 1989, 60000], [1990, 1994, 70000], [1995, 1998, 90000], [1999, 2004, 45000], [2005, 2011, 60000], [2012, 2019, 100000], [2020, 2025, 150000]];
for (const [a, b, p] of gens) for (let i = 0; i < 14; i++) sale("Porsche", "911", a + (i % (b - a + 1)), `${a + (i % (b - a + 1))} Porsche 911 Carrera ${i % 2 ? "Coupe" : "Cabriolet"}`, p + i * 1500, 10 + i * 60, i % 2 ? "Coupe" : "Convertible");
for (let i = 0; i < 6; i++) sale("Acme", "Zeta", 1972, `1972 Acme Zeta Coupe`, 20000 + i * 300, 20 + i * 40, "Coupe");
for (let i = 0; i < 6; i++) sale("Acme", "Zeta", 1972, `1972 Acme Zeta Convertible`, 70000 + i * 300, 25 + i * 40, "Convertible");
for (let i = 0; i < 6; i++) sale("Acme", "Iota", 1985, `1985 Acme Iota 5-Speed Manual`, 20000 + i * 150, 10 + i * 30, "Coupe");
for (let i = 0; i < 6; i++) sale("Acme", "Iota", 1985, `1985 Acme Iota Automatic`, 45000 + i * 150, 12 + i * 30, "Coupe");
let calls = 0; const LAT = 100; const store = new Map();
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
globalThis.fetch = async (url, opt) => {
  const u = new URL(String(url)); calls++;
  await new Promise(r => setTimeout(r, LAT));
  if (u.pathname.endsWith("/spec_market_cache")) {
    if (opt && opt.method === "POST") { for (const r of JSON.parse(opt.body)) store.set(r.spec_key, r); return new Response("", { status: 201 }); }
    const k = (u.searchParams.get("spec_key") || "").replace(/^eq\./, ""); return new Response(JSON.stringify(store.has(k) ? [{ market: store.get(k).market, computed_at: store.get(k).computed_at }] : []), { status: 200 });
  }
  if (u.pathname.endsWith("/sales_archive")) {
    const sp = u.searchParams, sel = sp.get("select"), sd = sp.getAll("sale_date");
    const ge = sd.filter(v => v.startsWith("gte.")).map(v => v.slice(4)), lt = sd.filter(v => v.startsWith("lt.")).map(v => v.slice(3));
    const ys = sp.getAll("year"), ymin = Number((ys.find(v => v.startsWith("gte.")) || "gte.0").slice(4)), ymax = Number((ys.find(v => v.startsWith("lte.")) || "lte.9999").slice(4));
    const mk = sp.get("make") && likeRe(sp.get("make").replace(/^ilike\./, "")), md = sp.get("model") && likeRe(sp.get("model").replace(/^ilike\./, "")), ti = sp.get("listing_title") && likeRe(sp.get("listing_title").replace(/^ilike\./, ""));
    const keep = rows.filter(r => (!ge.length || r.sale_date >= ge[0]) && (!lt.length || r.sale_date < lt[0]) && r.year >= ymin && r.year <= ymax && (!mk || mk.test(r.make)) && (!md || md.test(r.model)) && (!ti || ti.test(r.listing_title)));
    return new Response(JSON.stringify(keep.map(r => Object.fromEntries(sel.split(",").map(it => ev(r, it))))), { status: 200 });
  }
  return new Response("[]", { status: 200 });
};
const live = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
const warm = { ...live, qelig: "compute" };
const timed = async f => { calls = 0; const t0 = Date.now(); const r = await f(); return { ms: Date.now() - t0, reads: calls, r }; };
const gearboxQ = { tier: "gearbox_choice", gearboxOptions: ["Manual", "Automatic"], optionCounts: [6, 6], prompt: "Manual or Automatic?" };
const cases = [
  ["bare 911 (generation)", { make: "Porsche", model: "911", trim: "", year: null, bodyStyle: null }, "Porsche 911", null],
  ["Zeta (body)", { make: "Acme", model: "Zeta", trim: "", year: 1972, bodyStyle: null }, "1972 Acme Zeta", null],
  ["Iota (gearbox)", { make: "Acme", model: "Iota", trim: "", year: 1985, bodyStyle: null }, "1985 Acme Iota", gearboxQ]
];
const BUDGET = E.QUESTION_BUDGET_MS, JITTER = 60;
for (const [name, v, text, direct] of cases) {
  process.env.GAS_TEST_NO_QUESTION_RULE = "1";
  const old = await timed(async () => direct ? direct : (await E.oneEngineAnswer(v, null, text, { ...live, noQuestionRule: true }, null)).raw);
  process.env.GAS_TEST_NO_QUESTION_RULE = "";
  E.forgetEligibility();
  const first = await timed(async () => direct ? await E.questionRule(direct, v, null, text, warm, null) : (await E.oneEngineAnswer(v, null, text, warm, null)).raw);   // the warm computes and stores
  E.forgetEligibility();
  const cold = await timed(async () => direct ? await E.questionRule(direct, v, null, text, live, null) : (await E.oneEngineAnswer(v, null, text, live, null)).raw);
  const hot = await timed(async () => direct ? await E.questionRule(direct, v, null, text, live, null) : (await E.oneEngineAnswer(v, null, text, live, null)).raw);
  console.log(`${name}: OLD ${old.ms} ms ${old.reads} reads | warm computes ${first.ms} ms ${first.reads} reads | NEW live cold ${cold.ms} ms ${cold.reads} reads | NEW live warm ${hot.ms} ms ${hot.reads} reads | tier ${cold.r.tier}`);
  ok(`${name}: the warm's added cost for this question stays under 2.5 seconds (100 ms reads), ${first.ms} ms ${first.reads} reads`, first.ms <= 2500);
  if (/_choice$/.test(String(cold.r.tier))) {
    ok(`${name}: the live question is within ${BUDGET} ms of the old question, cold`, cold.ms <= old.ms + BUDGET + JITTER, `${cold.ms} against ${old.ms}`);
    ok(`${name}: the live question is within ${BUDGET} ms of the old question, warm`, hot.ms <= old.ms + BUDGET + JITTER, `${hot.ms} against ${old.ms}`);
    ok(`${name}: the live question adds at most one read`, cold.reads <= old.reads + 1, `${cold.reads} against ${old.reads}`);
  } else ok(`${name}: the question resolved to an ordinary answer`, /^(result|thin|refusal|not_tracked)$/.test(String(cold.r.tier)), `tier ${cold.r.tier}`);
}
console.log(failed ? `questionSpeedCheck: ${failed} FAIL` : "questionSpeedCheck: all PASS");
process.exit(failed ? 1 : 0);
