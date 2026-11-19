// THE QUESTION RULE NEVER DROPS A BODY THE POOL SHOWS (Lane B, Nov 6 2026; live 1963 Chevrolet Corvette: the plain query answered "Only the Convertible has three or more sales of this car" (16 sales) while the same minute's pool held 31 Coupes and 14 Convertibles).
// CAUSE: the one-option decision is stored in spec_market_cache keyed by the engine version only, with no expiry, and decideQuestion counted an option whose answer read fewer than three sales, or did not read at all, as zero; the pool's own count (d.optionCounts) was never consulted.
// FIX: (1) a one-option decision is not made, and not served, when the pool shows a dropped option at three or more sales (stored rows carry poolCounts; older rows are held to the same test at read); (2) a decision expires with the row it is read from (ELIG_TTL_MS, 26 hours);
// (3) a failed option read is UNKNOWN, never zero: the visit gets the whole car and nothing is stored. THE CLASS: any spec whose body question can drop a body with many sales: gearbox, edition and generation questions share decideQuestion, so the same guard covers them.
// This check: two body specs (a 1963 car with 31 coupes and 14 convertibles, a 1965 car with 20 and 9) and a genuine one-option spec (2 against 12): the option counts are compared with the pool counts; a stored one-option row is replaced; an expired row is not served and a fresh one is;
// a failed read stores nothing and never drops a body; a genuine one-option still resolves; and the four products read the same pool.
//   node scripts/oneOptionPoolCheck.mjs [root]      --mutants proves each rule by breaking it in a copy
// clock: real-ok every date in the fixture is relative to the one now read at the top (days ago, hours ahead), so the verdict does not change with the day
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
if (process.argv.includes("--mutants")) {
  const { spawnSync } = await import("node:child_process"), fsm = await import("node:fs"), osm = await import("node:os");
  const R = path.resolve(process.argv.find((x, i) => i > 1 && !x.startsWith("--")) || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
  const muts = [
    ["lib/onebox.js", "} else if (valid.length === 1 && droppedBig.length) {", "} else if (false) {", "the one-option rule drops a body the pool shows at three or more"],
    ["lib/onebox.js", "if (rec && rec.action === \"one\" && Array.isArray(d.optionCounts)", "if (false && rec && rec.action === \"one\" && Array.isArray(d.optionCounts)", "a stored one-option row the pool contradicts is served"],
    ["lib/onebox.js", "const fresh = !!row && Date.now() - Date.parse(row.computed_at) < ELIG_TTL_MS;", "const fresh = !!row;", "a stored decision never expires"],
    ["lib/onebox.js", "if (answers.some(readFailedAnswer)) { rec.transient = true;", "if (false) { rec.transient = true;", "a failed option read counts as zero"],
    ["lib/onebox.js", "a.tier === \"read_failed\" || !!(a.dedup && a.dedup.queryError);", "false;", "a degraded read_failed option answer counts as zero"],
    ["lib/onebox.js", "const { keptAnswer, ...store } = rec; if (!rec.transient) await writeEligibility(env, ekey, store);\n      if (rec.action === \"one\")", "const { keptAnswer, ...store } = rec; await writeEligibility(env, ekey, store);\n      if (rec.action === \"one\")", "the warm stores a decision built on a failed read"],
    ["lib/onebox.js", "if (got && got !== \"cap\") { rec = got; const { keptAnswer, ...store } = rec; if (!rec.transient) await writeEligibility(env, ekey, store);", "if (got && got !== \"cap\") { rec = got; const { keptAnswer, ...store } = rec; await writeEligibility(env, ekey, store);", "a decision built on a failed read is stored"]
  ];
  let survivors = 0;
  for (const [file, from, to, want] of muts) {
    const dir = fsm.mkdtempSync(path.join(osm.tmpdir(), "oneopt-"));
    spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", R + "/", dir + "/"]);
    fsm.symlinkSync(path.join(R, "node_modules"), path.join(dir, "node_modules"));
    const fp = path.join(dir, file), src = fsm.readFileSync(fp, "utf8"), m = src.replace(from, to);
    if (m === src) { console.log(`MUTANT NOT APPLIED  ${want}`); survivors++; fsm.rmSync(dir, { recursive: true, force: true }); continue; }
    fsm.writeFileSync(fp, m);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/oneOptionPoolCheck.mjs"), dir], { encoding: "utf8", timeout: 590000 });
    const killed = r.status !== 0 && /^FAIL/m.test((r.stdout || "") + (r.stderr || ""));
    console.log(`${killed ? "killed  " : "SURVIVED"}  ${want}`); if (!killed) survivors++;
    fsm.rmSync(dir, { recursive: true, force: true });
  }
  console.log(survivors ? `\n${survivors} mutant(s) survived` : "\nall mutants killed"); process.exit(survivors ? 1 : 0);
}
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
const live = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
const fast = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };

const mkSpec = (name, make, model, year, nCoupe, nConv) => {
  for (let i = 0; i < nCoupe; i++) sale(make, model, year, `${year} ${make} ${model} Coupe`, 60000 + (i % 7) * 400, 15 + i * 9, "Coupe");
  for (let i = 0; i < nConv; i++) sale(make, model, year, `${year} ${make} ${model} Convertible`, 170000 + (i % 7) * 500, 18 + i * 11, "Convertible");
  return { name, v: { make, model, trim: "", year, bodyStyle: null }, text: `${year} ${make} ${model}`, nCoupe, nConv };
};
const SPECS = [mkSpec("1963 car", "Acme", "Gamma", 1963, 31, 14), mkSpec("1965 car", "Acme", "Delta", 1965, 20, 9)];
const ONE = mkSpec("a genuine one-option car", "Acme", "Omega", 1963, 2, 12);
const fast2 = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k", qelig: "compute" };
const keyOf = v => E.qeligKey(v, null, null, "body_choice");
const put = (key, market, ageH = 0) => store.set(key, { spec_key: key, market, computed_at: new Date(Date.now() - ageH * 3600e3).toISOString() });
const row = key => store.get(key);
const decided = (a) => a && a.questionResolved ? a.questionResolved : null;
for (const S of SPECS) {
  const T = S.name, key = keyOf(S.v), pool = { Coupe: S.nCoupe, Convertible: S.nConv };
  // 1 fresh compute: the question is asked with both bodies, each with at least its pool's sales; never a one-option answer
  E.forgetEligibility(); store.clear();
  const a = (await E.oneEngineAnswer(S.v, null, S.text, fast2, null)).raw;
  ok(`${T}: the plain query is not narrowed to one body (${a.tier}, ${JSON.stringify(decided(a))})`, !(decided(a) && decided(a).why === "one_option"), JSON.stringify({ tier: a.tier, qr: decided(a), counts: a.optionCounts }));
  ok(`${T}: the body question offers both bodies, and each option's count is its pool's (${S.nCoupe} and ${S.nConv})`, a.tier === "body_choice" && JSON.stringify(a.bodyOptions) === JSON.stringify(["Coupe", "Convertible"]) && a.optionCounts[0] >= pool.Coupe && a.optionCounts[1] >= pool.Convertible, JSON.stringify({ t: a.tier, o: a.bodyOptions, c: a.optionCounts }));
  // 2 a stored one-option row written by an older tree (no pool counts, the Coupe read as 1) is not served, and is replaced
  E.forgetEligibility(); store.clear();
  put(key, { kind: "qelig", engineVersion: E.ENGINE_VERSION, tier: "body_choice", dimension: "body", labels: ["Coupe", "Convertible"], counts: [1, S.nConv], valid: [1], action: "one", why: "one_option", kept: 1, builtAt: new Date().toISOString() });
  const b = (await E.oneEngineAnswer(S.v, null, S.text, fast2, null)).raw, nb = row(key) && row(key).market;
  ok(`${T}: a stored one-option row the pool contradicts is not served`, !(decided(b) && decided(b).why === "one_option") && b.tier === "body_choice", JSON.stringify({ t: b.tier, qr: decided(b) }));
  ok(`${T}: the stored row is replaced by a decision that carries the pool's counts`, !!nb && nb.action !== "one" && Array.isArray(nb.poolCounts) && nb.poolCounts[0] === pool.Coupe && nb.poolCounts[1] === pool.Convertible, JSON.stringify(nb && { a: nb.action, p: nb.poolCounts }));
  // 3 a decision expires with its row: a day-old "every" is computed again, a fresh one is served
  E.forgetEligibility(); store.clear();
  const every = { kind: "qelig", engineVersion: E.ENGINE_VERSION, tier: "body_choice", dimension: "body", labels: ["Coupe", "Convertible"], counts: [S.nCoupe, S.nConv], poolCounts: [S.nCoupe, S.nConv], valid: [0, 1], action: "every", why: "none", builtAt: new Date().toISOString() };
  put(key, every, 30);
  const c = (await E.oneEngineAnswer(S.v, null, S.text, fast2, null)).raw;
  ok(`${T}: a decision older than the row's life (30 hours) is computed again`, c.tier === "body_choice", `${c.tier} ${JSON.stringify(decided(c))}`);
  E.forgetEligibility(); store.clear(); put(key, every, 1);
  const d = (await E.oneEngineAnswer(S.v, null, S.text, fast2, null)).raw;
  ok(`${T}: a fresh decision (1 hour) is served as stored`, !!decided(d) && decided(d).why === "none", `${d.tier} ${JSON.stringify(decided(d))}`);
}
// 4 a failed option read is unknown: the whole car for this visit, nothing stored, no body dropped
{
  const S = SPECS[0], key = keyOf(S.v); E.forgetEligibility(); store.clear();
  const f1 = globalThis.fetch; let n = 0, armed = false;
  globalThis.fetch = async (u, o) => { const x = new URL(String(u)); if (armed && x.pathname.endsWith("/sales_archive")) { n++; if (n % 3 === 2) throw new Error("read failed"); } return f1(u, o); };
  armed = true; const f = await E.questionRule({ tier: "body_choice", bodyOptions: ["Coupe", "Convertible"], optionCounts: [S.nCoupe, S.nConv], prompt: "x" }, S.v, null, S.text, fast2, null); armed = false; globalThis.fetch = f1;
  ok("a failed option read is never counted as zero sales: the body is not dropped", !(f && f.questionResolved && f.questionResolved.why === "one_option"), JSON.stringify(f && f.questionResolved));
  ok("a failed option read stores no decision at all", !row(key), JSON.stringify(row(key) && row(key).market && { a: row(key).market.action, w: row(key).market.why }));
  ok("a failed option read answers the whole car, not a narrowed body, and says nothing was dropped", !!f && !!f.questionResolved && f.questionResolved.dropped.length === 0 && f.questionResolved.kept === null, JSON.stringify(f && f.questionResolved));
  ok("the failed read was exercised (reads were refused)", n >= 2, "refused around " + n + " reads");
}
{ // the same, on a visitor's ask (the miss path): nothing stored, the whole car
  const S = SPECS[1], key = keyOf(S.v); E.forgetEligibility(); store.clear();
  const f1 = globalThis.fetch; let n = 0, armed = false;
  globalThis.fetch = async (u, o) => { const x = new URL(String(u)); if (armed && x.pathname.endsWith("/sales_archive")) { n++; if (n % 3 === 2) throw new Error("read failed"); } return f1(u, o); };
  armed = true; const f = await E.questionRule({ tier: "body_choice", bodyOptions: ["Coupe", "Convertible"], optionCounts: [S.nCoupe, S.nConv], prompt: "x" }, S.v, null, S.text, fast, null); armed = false; globalThis.fetch = f1;
  await new Promise(z => setTimeout(z, 50));
  ok("a visitor's ask with a failed option read drops no body and stores no decision", !(f && f.questionResolved && f.questionResolved.why === "one_option") && !row(key), JSON.stringify(f && f.questionResolved) + " row " + !!row(key));
}
// 5 a genuine one-option still resolves: 2 coupes against 12 convertibles, the pool itself shows the dropped body under three
{
  E.forgetEligibility(); store.clear();
  const o = await E.questionRule({ tier: "body_choice", bodyOptions: ["Coupe", "Convertible"], optionCounts: [ONE.nCoupe, ONE.nConv], prompt: "x" }, ONE.v, null, ONE.text, fast2, null), qr = decided(o);
  ok("a body the pool shows at fewer than three is still dropped by the one-option rule (2 coupes, 12 convertibles)", !!qr && qr.why === "one_option" && qr.kept === "Convertible", JSON.stringify(qr));
  const st = row(keyOf(ONE.v)) && row(keyOf(ONE.v)).market;
  ok("and its stored decision carries the pool counts that justify it", !!st && st.action === "one" && st.poolCounts && st.poolCounts[0] === 2 && st.poolCounts[1] === 12, JSON.stringify(st && { a: st.action, p: st.poolCounts }));
}
// 5b the question\'s own pool count outranks a short option read: a pool that shows the Coupe at 5 is never dropped by an option read of 2
{
  E.forgetEligibility(); store.clear();
  const o = await E.questionRule({ tier: "body_choice", bodyOptions: ["Coupe", "Convertible"], optionCounts: [5, ONE.nConv], prompt: "x" }, ONE.v, null, ONE.text, fast2, null), qr = decided(o);
  ok("the pool shows the Coupe at 5 while its own read finds 2: it is not dropped as one_option", !qr || qr.why !== "one_option", JSON.stringify(qr));
}
// 6 the invariant over every spec: whenever an answer says one_option, each dropped body has fewer than three sales in the pool
for (const S of [...SPECS, ONE]) {
  E.forgetEligibility(); store.clear(); const x = (await E.oneEngineAnswer(S.v, null, S.text, fast2, null)).raw, qr = decided(x);
  const dropped = qr && qr.why === "one_option" ? (qr.dropped || []) : [];
  ok(`${S.name}: no one_option answer drops a body the pool holds at three or more`, dropped.every(l => ({ Coupe: S.nCoupe, Convertible: S.nConv })[l] < E.QUESTION_FLOOR), JSON.stringify({ qr }));
}
// 7 the four products read the same pool: Market Check, Buy, Sell and Tasks for a 1963 Chevrolet Corvette of 31 coupes and 14 convertibles (the live case, 45 sales)
{
  for (let i = 0; i < 31; i++) sale("Chevrolet", "Corvette", 1963, "1963 Chevrolet Corvette Sting Ray Split-Window Coupe", 80000 + (i % 9) * 900, 14 + i * 8, "Coupe");
  for (let i = 0; i < 14; i++) sale("Chevrolet", "Corvette", 1963, "1963 Chevrolet Corvette Sting Ray Convertible", 190000 + (i % 7) * 1500, 16 + i * 17, "Convertible");
  E.forgetEligibility(); store.clear();
  const X = await import(pathToFileURL(path.join(root, "scripts/crossProductCheck.js")).href);
  let r = await X.checkOneSpec("1963 Chevrolet Corvette", fast2);
  for (let k = 0; k < 6 && !(r.lanes && r.lanes.buy && r.lanes.buy.ok && r.lanes.tasks && r.lanes.tasks.ok); k++) { await new Promise(z => setTimeout(z, 1000)); r = await X.checkOneSpec("1963 Chevrolet Corvette", fast2); }   // Buy and Tasks read the stored market; the first ask fills it
  const L = r.lanes || {}, n45 = k => !!(L[k] && L[k].ok && (L[k].count === 45 || (L[k].counts && L[k].counts.qualifying === 45)));
  ok("THE FOUR PRODUCTS READ 45: Market Check, Buy, Sell and Tasks (" + ["marketCheck", "buy", "sell", "tasks"].map(k => k + "=" + (L[k] && (L[k].count ?? (L[k].counts && L[k].counts.qualifying)))).join(" ") + ")", ["marketCheck", "buy", "sell", "tasks"].every(n45), JSON.stringify(Object.fromEntries(["marketCheck", "buy", "sell", "tasks"].map(k => [k, L[k] && (L[k].ok ? L[k].count : L[k].err)]))));
  const cc = (r.countsCompare || []), lanes = {}; for (const c of cc) for (const m of String(c.detail || "").split(" ")) { const [k, v] = m.split("="); if (v !== undefined && /^(marketCheck|buy|sell|tasks)$/.test(k)) (lanes[c.field] = lanes[c.field] || {})[k] = v; }
  ok("the four products agree on the counts (no MISMATCH)", cc.length > 0 && !cc.some(c => c.status === "MISMATCH"), JSON.stringify(cc.map(c => [c.field, c.status, c.detail])));
  const pooled = Object.values(lanes).flatMap(o => Object.entries(o)).filter(([, v]) => v === "45");
  const mc = (await E.oneEngineAnswer({ make: "Chevrolet", model: "Corvette", trim: "", year: 1963, bodyStyle: null }, null, "1963 Chevrolet Corvette", fast2, null)).raw;
  ok("Market Check's plain answer asks the body question over the whole pool (31 and 14, 45 sales), never one body", mc.tier === "body_choice" && (mc.optionCounts || []).reduce((t, x) => t + x, 0) === 45, JSON.stringify({ t: mc.tier, c: mc.optionCounts, qr: decided(mc) }));
  ok("45 appears in the lanes' pool counts (" + pooled.map(([k]) => k).join(", ") + ")", pooled.length >= 2, JSON.stringify(lanes));
}
console.log(failed ? `oneOptionPoolCheck: ${failed} FAIL` : "oneOptionPoolCheck: all PASS");
process.exit(failed ? 1 : 0);
