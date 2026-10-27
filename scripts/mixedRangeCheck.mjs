// e95: a question that cannot be settled inside the cap never prints one range over mixed bodies. A miss on a visitor's ask computes the question once (option
// reads in parallel, 1.5 seconds in total), stores the row and queues the spec for the next warm; past the cap the visitor gets the whole car, the scope says so,
// and a range is printed only when the answer passes the one set check and the price spread check, otherwise the sales themselves.
//   node scripts/mixedRangeCheck.mjs [repo root]
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
let LAT = 60; const store = new Map();
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
for (let i = 0; i < 6; i++) sale("Acme", "Narrow", 1990, `1990 Acme Narrow Coupe`, 20000 + i * 250, 20 + i * 40, "Coupe");
for (let i = 0; i < 6; i++) sale("Acme", "Narrow", 1990, `1990 Acme Narrow Convertible`, 20400 + i * 250, 25 + i * 40, "Convertible");
globalThis.fetch = async (url, opt) => {
  const u = new URL(String(url));
  if (u.pathname.endsWith("/spec_market_cache")) {
    if (opt && opt.method === "POST") { for (const r of JSON.parse(opt.body)) store.set(r.spec_key, r); return new Response("", { status: 201 }); }
    if (opt && opt.method === "DELETE") { store.delete((u.searchParams.get("spec_key") || "").replace(/^eq\./, "")); return new Response(null, { status: 204 }); }
    const k = (u.searchParams.get("spec_key") || ""); let out;
    if (k.startsWith("like.")) { const pre = k.slice(5).replace(/\*$/, ""); out = [...store.values()].filter(r => r.spec_key.startsWith(pre)); } else { const kk = k.replace(/^eq\./, ""); out = store.has(kk) ? [store.get(kk)] : []; }
    return new Response(JSON.stringify(out.map(r => ({ spec_key: r.spec_key, market: r.market, computed_at: r.computed_at }))), { status: 200 });
  }
  await new Promise(r => setTimeout(r, LAT));
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
process.env.GAS_TEST_NO_QUESTION_RULE = "";
process.env.GAS_TEST_QUESTION_CAP = "1";   // the cap is shortened to 5 ms for this check only (see scripts/noQuestionRuleCheck.mjs)
const live = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k", questionCapMs: 5 };
const fast = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
const zeta = { make: "Acme", model: "Zeta", trim: "", year: 1972, bodyStyle: null };
// 1. past the cap, coupes near 20,000 and convertibles near 70,000: no range
const a = (await E.oneEngineAnswer(zeta, null, "1972 Acme Zeta", live, null)).raw;
ok("cap: the question was not settled inside the cap, the whole car answers and says so", a.questionResolved && a.questionResolved.why === "cap_exceeded" && /every body/.test(String(a.scope_reason)), `tier ${a.tier} ${JSON.stringify(a.questionResolved || null)} reason ${a.scope_reason}`);
ok("cap: a pool of coupes and convertibles 3.5 times apart never prints one range", !a.cluster && a.thinReason === "mixed_prices" && a.poolN === 12, `cluster ${JSON.stringify(a.cluster)}, reason ${a.thinReason}, pool ${a.poolN}`);
ok("cap: the sales themselves are shown (all twelve, no range, a reason line)", a.thin_sales && a.thin_sales.count === 12 && /very different price ranges/.test(String(a.thinLine)), JSON.stringify(a.thin_sales && a.thin_sales.count));
ok("cap: the spec is queued for the next warm", [...store.keys()].some(k => k.startsWith("QELIGMISS|")), [...store.keys()].join(","));
// 2. past the cap, two bodies that price alike: the range stands
const nr = await E.questionRule({ tier: "body_choice", bodyOptions: ["Coupe", "Convertible"], optionCounts: [6, 6], prompt: "x" }, { make: "Acme", model: "Narrow", trim: "", year: 1990, bodyStyle: null }, null, "1990 Acme Narrow", live, null);
ok("cap: two bodies that price alike keep the range", nr.tier === "result" && Array.isArray(nr.cluster) && nr.cluster[1] <= 2 * nr.cluster[0], `tier ${nr.tier} cluster ${JSON.stringify(nr.cluster)}`);
// 3. the next warm drains the queue and stores the decision; the next ask is instant
LAT = 0; E.forgetEligibility();
const dr = await E.drainQuestionQueue(fast, 10);
ok("warm: the queue is drained and the decision stored", dr.read >= 1 && dr.stored >= 1 && ![...store.keys()].some(k => k.startsWith("QELIGMISS|Zeta")), JSON.stringify(dr));
E.forgetEligibility(); let reads = 0; const f0 = globalThis.fetch; globalThis.fetch = async (u, o) => { reads++; return f0(u, o); };
const b = (await E.oneEngineAnswer(zeta, null, "1972 Acme Zeta", fast, null)).raw;
ok("warm: the next ask of that spec is a question again, from the stored row", b.tier === "body_choice" && b.questionChecked === true, `tier ${b.tier}, ${reads} reads`);
globalThis.fetch = f0;
console.log(failed ? `mixedRangeCheck: ${failed} FAIL` : "mixedRangeCheck: all PASS");
process.exit(failed ? 1 : 0);
