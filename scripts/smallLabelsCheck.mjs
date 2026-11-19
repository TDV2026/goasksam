// THREE SMALL LABEL FAULTS (Lane B, Nov 6 2026, from Lane F's live reads).
//  (1) A NUMERIC NAMEPLATE NEEDS ITS MAKE: the Delahaye 135 read "135, 1937 to 1938, ..." (rungLabel and scopeLabel). relabel() now puts the make before a nameplate that starts with a number ("135", "308 GTB", "2002 tii"); a Porsche keeps its own ("911 Carrera").
//      CLASS: every make's numeric nameplate, bare and with a year; a named nameplate (Type 57) and a Porsche are untouched.
//  (2) THE 1935 AUBURN SPEEDSTER IS ONE BODY: Speedster is a body word the engine knows (titles only, never the stored field); the nine sales of the live answer all say Speedster in the title, and the source stored Roadster for most, Convertible for one and nothing for two. The pre-war
//      rule did not miss it: there is one body, so the single pool stands. A pool whose TITLES say Speedster and Roadster is two bodies, apart.
//  (3) THE COMPARING LINE NAMES THE YEARS THE ANSWER USED: "Comparing the 1998 911 Carrera 4 Cabriolet with equivalent 1994 to 1998" sat under a title and a pool of 1997 to 1998. resolvedSpec is written before the walk from the years it MAY use; finalStamp now says the pool's years.
//      CLASS: every answer whose pool is narrower than the span the sentence was written with.
// clock: real-ok every date in the fixture is relative to the one now read at the top (days ago), so the verdict does not change with the day
//   node scripts/smallLabelsCheck.mjs [root]      --mutants proves each rule by breaking it in a copy
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { findGeneration } from "../lib/generations.js";
if (process.argv.includes("--mutants")) {
  const { spawnSync } = await import("node:child_process"), fsm = await import("node:fs"), osm = await import("node:os");
  const R = path.resolve(process.argv.find((x, i) => i > 1 && !x.startsWith("--")) || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
  const muts = [
    ["lib/onebox.js", "const labelModelOf = (make, model) => { const nm = nameModelOf(make, model); return numericNameNeedsMake(make, nm) ?", "const labelModelOf = (make, model) => { const nm = nameModelOf(make, model); return false ?", "the rung and pool labels leave the make off a numeric nameplate"],
    ["lib/onebox.js", "name = numericNameNeedsMake(spec.make, np) ? `${String(spec.make).trim()} ${np}` : np;", "name = np;", "relabel leaves the make off a numeric nameplate"],
    ["lib/onebox.js", "!/^porsche$/i.test(String(make)) && /^\\d+(?:\\s|$)/", "/^\\d+(?:\\s|$)/", "a Porsche 911 is given a make too"],
    ["lib/onebox.js", "if (m && (Number(m[1]) !== p0 || Number(m[2]) !== p1)) result.resolvedSpec =", "if (false) result.resolvedSpec =", "the comparing line keeps the generation's years"],
    ["lib/bodyWords.js", "{ style: \"speedster\", label: \"Speedster\", words: [\"speedster\"] },", "{ style: \"speedster\", label: \"Speedster\", words: [\"NEVERspeedster\"] },", "Speedster is no body word, so a Speedster and a Roadster pool is one list"]
  ];
  let survivors = 0;
  for (const [file, from, to, want] of muts) {
    const dir = fsm.mkdtempSync(path.join(osm.tmpdir(), "smalllab-"));
    spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", R + "/", dir + "/"]);
    fsm.symlinkSync(path.join(R, "node_modules"), path.join(dir, "node_modules"));
    const fp = path.join(dir, file), src = fsm.readFileSync(fp, "utf8"), m = src.replace(from, to);
    if (m === src) { console.log(`MUTANT NOT APPLIED  ${want}`); survivors++; fsm.rmSync(dir, { recursive: true, force: true }); continue; }
    fsm.writeFileSync(fp, m);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/smallLabelsCheck.mjs"), dir], { encoding: "utf8", timeout: 590000 });
    const killed = r.status !== 0 && /^FAIL/m.test((r.stdout || "") + (r.stderr || ""));
    console.log(`${killed ? "killed  " : "SURVIVED"}  ${want}`); if (!killed) survivors++;
    fsm.rmSync(dir, { recursive: true, force: true });
  }
  console.log(survivors ? `\n${survivors} mutant(s) survived` : "\nall mutants killed"); process.exit(survivors ? 1 : 0);
}
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
const { marketOf } = await import(pathToFileURL(path.join(root, "lib/live/search.js")).href);
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const ev = (row, it) => { const ci = it.indexOf(":"); const alias = ci > 0 && it[ci + 1] !== ":" ? it.slice(0, ci) : null; const expr = alias ? it.slice(ci + 1) : it; if (expr.startsWith("raw_record->>")) { const k = expr.slice(13); const v = row.raw_record[k]; return [alias || k, v == null ? null : String(v)]; } return [alias || expr, row[expr] === undefined ? null : row[expr]]; };
const likeRe = v => new RegExp("^" + String(v).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
let rows = [], n = 0; let MK = "Testmake"; const day = i => new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
const sale = (year, body, price, ago) => { n++; const CAR = globalThis.CAR || { make: "Testmake", model: "Roadrunner" }, HOUSE = globalThis.HOUSE && globalThis.HOUSE(n, body); const title = `${year} ${CAR.make} ${CAR.model} ${body}`; rows.push({ id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), source_id: "pb" + n, sale_price: price, sale_date: day(ago), platform: HOUSE ? "Gooding & Co" : "Bring a Trailer", source_slug: HOUSE ? "gooding" : "bringatrailer", make: CAR.make, model: CAR.model, year,
  listing_title: title, vin_norm: "V" + n, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: null, vehicle_type: "car", sale_price_usd: price,
  raw_record: { featured_image_url: (HOUSE || (globalThis.NOPHOTO && globalThis.NOPHOTO(n))) ? null : "https://x/i.jpg", mileage: String(30000 + n * 300), body_style: body, modifications: null, title, currency: "USD", transmission: null, exterior_color: null, title_status: null, url: "https://u/" + n, source_url: null, city: "Austin", state: "TX", country_code: "US", auction_end_precision: null } }); };
globalThis.fetch = async (url) => {
  const u = new URL(String(url));
  if (u.pathname.endsWith("/sales_archive")) {
    const sp = u.searchParams, sel = sp.get("select"), sd = sp.getAll("sale_date");
    const ge = sd.filter(v => v.startsWith("gte.")).map(v => v.slice(4)), lt = sd.filter(v => v.startsWith("lt.")).map(v => v.slice(3));
    const ys = sp.getAll("year"), ymin = Number((ys.find(v => v.startsWith("gte.")) || "gte.0").slice(4)), ymax = Number((ys.find(v => v.startsWith("lte.")) || "lte.9999").slice(4));
    const mk = sp.get("make") && likeRe(sp.get("make").replace(/^ilike\./, "")), md = sp.get("model") && likeRe(sp.get("model").replace(/^ilike\./, "")), ti = sp.get("listing_title") && likeRe(sp.get("listing_title").replace(/^ilike\./, ""));
    const keep = rows.filter(r => (!ge.length || r.sale_date >= ge[0]) && (!lt.length || r.sale_date < lt[0]) && r.year >= ymin && r.year <= ymax && (!mk || mk.test(r.make)) && (!md || md.test(r.model)) && (!ti || ti.test(r.listing_title)));
    return new Response(JSON.stringify(keep.map(r => Object.fromEntries(sel.split(",").map(it => ev(r, it))))), { status: 200 });
  }
  if (u.hostname.includes("fake.supabase")) return new Response("[]", { status: 200 });
  throw new Error("offline");
};
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k", qelig: "compute" };
const ROOT = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const build = (make, model, list) => { rows = []; globalThis.CAR = { make, model }; let i = 0; for (const [yr, body, base, cnt, stored] of list) for (let k = 0; k < cnt; k++) { sale(yr, body, base + (k % 4) * 700, 20 + ((i++) % 12) * 9); if (stored !== undefined) rows[rows.length - 1].raw_record.body_style = stored; } };
const ask = async (veh, q, gen = null) => E.withReadFields((await E.oneEngineAnswer({ ...veh, raw: q }, gen, q, { ...env, asked: 0 }, null)).raw, q, veh);
globalThis.HOUSE = null;
// ---- (1) numeric nameplates carry their make; Porsche and named nameplates do not change
const NUM = [["Delahaye", "135", 1936, [[1937, "Cabriolet", 215000, 3], [1938, "Roadster", 2095000, 2], [1938, "Coupe", 330000, 3]]], ["Ferrari", "308 GTB", 1980, [[1980, "Coupe", 90000, 5], [1981, "Coupe", 95000, 5]]], ["BMW", "2002", 1972, [[1972, "Coupe", 40000, 5], [1973, "Coupe", 42000, 5]]], ["Datsun", "510", 1971, [[1970, "Sedan", 20000, 5], [1972, "Sedan", 21000, 5]]]];
const startsWithMake = (lab, make) => new RegExp("^" + make.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(String(lab || ""));
for (const [make, model, year, list] of NUM) {
  build(make, model, list);
  for (const [kind, v, q] of [["bare", { year: null, make, model }, `${make} ${model}`], ["year", { year, make, model }, `${year} ${make} ${model}`]]) {
    const a = await ask(v, q), lab = a.rungLabel || a.scopeLabel || "";
    { const dup = [], re = new RegExp(make.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s+" + make.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"); const walk = (o, p) => { if (typeof o === "string") { if (re.test(o)) dup.push(p + ": " + o.slice(0, 80)); } else if (o && typeof o === "object") for (const k of Object.keys(o)) if (k !== "rawPool" && k !== "cards") walk(o[k], p + "." + k); }; walk(a, "");
      ok(`${make} ${model} (${kind}): no line of the answer says the make twice`, dup.length === 0, dup.slice(0, 2).join(" || ")); }
    ok(`${make} ${model} (${kind}): the comparing line names the make ("${(a.resolvedSpec || "").slice(0, 70)}")`, new RegExp("Comparing the [^.]*" + make.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&") + " " + model.split(" ")[0]).test(String(a.resolvedSpec || "")), String(a.resolvedSpec));
    ok(`${make} ${model} (${kind}): the label names the make ("${lab}")`, startsWithMake(lab, make), JSON.stringify({ rung: a.rungLabel, scope: a.scopeLabel, tier: a.tier }));
  }
}
{ build("Porsche", "911", [[1990, "Coupe", 60000, 5], [1991, "Coupe", 61000, 5]]); const a = await ask({ year: null, make: "Porsche", model: "911" }, "Porsche 911"); ok(`Porsche 911: the label keeps its own name ("${a.rungLabel}")`, /^911\b/.test(String(a.rungLabel || a.scopeLabel || "")), JSON.stringify({ rung: a.rungLabel, scope: a.scopeLabel })); }
{ build("Bugatti", "Type 57", [[1937, "Coupe", 400000, 3], [1938, "Cabriolet", 350000, 3]]); const a = await ask({ year: null, make: "Bugatti", model: "Type 57" }, "Bugatti Type 57"); ok(`Bugatti Type 57: a named nameplate is unchanged ("${a.rungLabel}")`, /^Type 57\b/.test(String(a.rungLabel || a.scopeLabel || "")), JSON.stringify({ rung: a.rungLabel })); }
ok("the rule: a numeric nameplate needs its make, Porsche and a named one do not", E.numericNameNeedsMake("Delahaye", "135") && E.numericNameNeedsMake("Ferrari", "308 GTB") && E.numericNameNeedsMake("BMW", "2002") && !E.numericNameNeedsMake("Porsche", "911 Carrera") && !E.numericNameNeedsMake("Bugatti", "Type 57") && !E.numericNameNeedsMake("", "135"));
// ---- (2) the Auburn Speedster
{
  const stored = ["Roadster", "Roadster", "Roadster", "Convertible", "Roadster", null, "Roadster", null, "Roadster"];
  build("Auburn", "851", [[1935, "Speedster", 380000, 9]]); rows.forEach((r, i) => { r.raw_record.body_style = stored[i]; });
  for (const [kind, v, q] of [["asked 1935", { year: 1935, make: "Auburn", model: "851" }, "1935 Auburn 851"], ["bare", { year: null, make: "Auburn", model: "851" }, "Auburn 851"]]) {
    const a = await ask(v, q), labs = (a.options || []).map(o => o.label);
    ok(`Auburn 851 Speedster (${kind}): nine titles say Speedster, so one body: no Roadster or Convertible option from the stored field`, !labs.some(l => /roadster|convertible/i.test(l)) && a.optionsState !== "apart", JSON.stringify({ state: a.optionsState, labs, tier: a.tier }));
  }
  build("Auburn", "851", [[1935, "Speedster", 380000, 4], [1935, "Roadster", 120000, 4]]);
  const m = await ask({ year: 1935, make: "Auburn", model: "851" }, "1935 Auburn 851"), ml = (m.options || []).map(o => o.label);
  ok("a pool whose titles say Speedster AND Roadster is two bodies, apart", m.optionsState === "apart" && ml.length === 2 && ml.some(l => /speedster/i.test(l)) && ml.some(l => /roadster/i.test(l)), JSON.stringify({ state: m.optionsState, ml }));
}
// ---- (3) the comparing line follows the pool's years
const gen993 = await findGeneration({ year: 1998, make: "Porsche", model: "911", trim: "Carrera 4" }, env).catch(() => null);
const EQ = [
  ["Porsche", "911", "Carrera 4", 1998, "cabriolet", [[1997, "Cabriolet", 52000, 6], [1998, "Cabriolet", 55000, 3]], gen993],
  ["Porsche", "911", "Carrera 4", 1996, "cabriolet", [[1995, "Cabriolet", 52000, 5], [1996, "Cabriolet", 53000, 2], [1997, "Cabriolet", 54000, 3]], gen993]
];
for (const [make, model, trim, year, body, list, gen] of EQ) {
  build(make, model, list);
  const q = `${year} ${make} ${model} ${trim} ${body[0].toUpperCase() + body.slice(1)}`, a = await ask({ year, make, model, trim, bodyStyle: body }, q, gen), py = a.poolYears || [], m = /equivalent (\d{4})(?: to (\d{4}))?/.exec(String(a.resolvedSpec || ""));
  ok(`${q}: the comparing line names the pool's years (${py.join(" to ")}), not the generation's`, !!m && Number(m[1]) === py[0] && Number(m[2] || m[1]) === py[1], JSON.stringify({ line: a.resolvedSpec, poolYears: a.poolYears, rung: a.rungLabel }));
}
console.log(failed ? `\nsmallLabelsCheck: ${failed} FAIL` : "\nsmallLabelsCheck: PASS"); process.exit(failed ? 1 : 0);
