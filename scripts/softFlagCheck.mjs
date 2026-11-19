// SOFT FLAG CHECK (Lane B, lane-b-coverage, Nov 19 2026). Offline: a fake PostgREST. ``node scripts/softFlagCheck.mjs [repo root]`` (a tree without the fix shows it fail).
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { findGeneration } from "../lib/generations.js";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const ev = (row, it) => { const ci = it.indexOf(":"); const alias = ci > 0 && it[ci + 1] !== ":" ? it.slice(0, ci) : null; const expr = alias ? it.slice(ci + 1) : it; if (expr.startsWith("raw_record->>")) { const k = expr.slice(13); const v = row.raw_record[k]; return [alias || k, v == null ? null : String(v)]; } return [alias || expr, row[expr] === undefined ? null : row[expr]]; };
const likeRe = v => new RegExp("^" + String(v).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
let DESC_CALLS = 0; let rows = [], n = 0; let MK = "Testmake"; const day = i => new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
const HOUSES = [["RM Sotheby's", "rmsothebys"], ["Gooding & Co", "gooding"], ["Bonhams", "bonhams"], ["Mecum", "mecum"]];
const sale = (year, body, price, ago, model = "Roadrunner", house = false) => { n++; const h = house ? HOUSES[n % HOUSES.length] : ["Bring a Trailer", "bringatrailer"], title = `${year} Testmake ${model} ${body}`; rows.push({ id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), source_id: "pb" + n, sale_price: price, sale_date: day(ago), platform: h[0], source_slug: h[1], make: "Testmake", model, year,
  listing_title: title, vin_norm: "V" + n, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: null, vehicle_type: "car", sale_price_usd: price,
  raw_record: { featured_image_url: "https://x/i.jpg", mileage: String(30000 + n * 300), body_style: body, modifications: null, title, currency: "USD", transmission: null, exterior_color: null, title_status: null, url: "https://u/" + n, source_url: null, city: "Austin", state: "TX", country_code: "US", auction_end_precision: null } }); };
globalThis.fetch = async (url) => {
  const u = new URL(String(url));
  if (u.pathname.endsWith("/sales_archive") && /^in\.\(/.test(u.searchParams.get("id") || "")) { DESC_CALLS++; const ids = u.searchParams.get("id").slice(4, -1).split(","); return new Response(JSON.stringify(rows.filter(r => ids.includes(r.id)).map(r => ({ id: r.id, description: r.description }))), { status: 200 }); }
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
const read = async (year, model) => { const veh = { year, make: "Testmake", model }, q = `${year} Testmake ${model}`; const gen = await findGeneration(veh, env).catch(() => null); return E.withReadFields((await E.oneEngineAnswer({ ...veh, raw: q }, gen, q, { ...env, asked: 0 }, null)).raw, q, veh); };
const poolOf = d => (Array.isArray(d.rawPool) ? d.rawPool.length : 0);

// THE STORED SOFT FLAGS (lane-b-coverage, Nov 19 2026). Sam: three genuine 2006 Ford GTs were set aside as "project or incomplete car (tribute)". CAUSE: project_flag holds the verdict of the rule when the row was stamped; the description rule for tribute, replica
// and recreation was tightened later (e60, e65) and the stored rows were not stamped again. THE CLASS: any real car whose stored soft flag the current rule does not reproduce. The read now asks the current rule about the soft-flagged rows of a pool.
// (1) the rule, swept over every variant of every family in data/variantFamilies.json: a title naming the variant never flags on the homage wording; a plain title, a tribute in the title and the build wording still flag.
// (2) the engine: stale stored soft flags on real cars come back into the pool; a real tribute car, a hard flag and a read that fails keep their verdict.
import fs from "fs";
const C = await import(pathToFileURL(path.join(root, "lib/_classify.js")).href);
const FAM = JSON.parse(fs.readFileSync(path.join(root, "data/variantFamilies.json"), "utf8")).families;
const HOMAGE = ["This one pays tribute to the 1968 Le Mans winner.", "Built as a tribute to the original 1966 car.", "It is a tribute to the race car of the same name."];
let fams = 0, variants = 0, bad = [];
for (const f of FAM) { fams++; const model = String(f.models[0]).replace(/\*$/, "").replace(/-Series/i, " Series"), yr = (f.years[0] + f.years[1]) >> 1;
  for (const v of f.variants.filter(v => v.name && !/^(base|standard|other)$/i.test(v.name) && v.words && v.words.length)) {
    const y = v.years ? (v.years[0] + v.years[1]) >> 1 : yr; if (y < f.years[0] || y > f.years[1]) continue;
    const word = String(v.words[0]).replace(/\\b|\\s\+|\\s\?|\[\\s-\]\??|\\/g, m => (m.includes("s") ? " " : "")).replace(/[?+*()]/g, "").trim();
    const title = `${y} ${f.make} ${model} ${v.name}`, plain = `${y} ${f.make} ${model}`;
    if (!C.projectFlagReason(title, "x")) { /* the title names the variant */ } else continue;
    variants++;
    for (const d of HOMAGE) if (C.projectFlagReason(title, d)) bad.push(`${title}: "${d}" flags ${C.projectFlagReason(title, d)}`);
    if (!C.projectFlagReason(plain, "This one is a tribute to the original 1966 car.") && !require_pkg(plain)) bad.push(`${plain}: a plain title must still flag "is a tribute to"`);
    if (!C.projectFlagReason(`${title} Tribute`, HOMAGE[0])) bad.push(`${title} Tribute: a tribute in the title must flag`);
    if (!C.projectFlagReason(title, "This is a tribute car built from a base model.")) bad.push(`${title}: the build wording "tribute car" must still flag`);
  } }
function require_pkg(t) { return false; }
ok(`rule: ${fams} families, ${variants} named variants: the homage wording never flags a titled package, and a plain title, a tribute title and the build wording still flag`, bad.length === 0 && variants >= 60, `${bad.length} wrong, ${variants} variants: ` + bad.slice(0, 4).join(" | "));

// (2) the engine
const mk = (i, flag, desc, model, title) => { n++; const t = title || `2001 Testmake ${model}`; rows.push({ id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), source_id: "sf" + n, sale_price: 50000 + i * 700, sale_date: day(30 + i * 7), platform: "Bring a Trailer", source_slug: "bringatrailer", make: "Testmake", model, year: 2001, listing_title: t, vin_norm: "V" + n, stated_mileage: null, project_flag: flag, desc_facts: { markers: [] }, description: desc, has_reserve: null, vehicle_type: "car", sale_price_usd: 50000 + i * 700,
  raw_record: { featured_image_url: "https://x/i.jpg", mileage: String(30000 + n * 300), body_style: "Coupe", modifications: null, title: t, currency: "USD", transmission: null, exterior_color: null, title_status: null, url: "https://u/" + n, source_url: null, city: "Austin", state: "TX", country_code: "US", auction_end_precision: null } }); return rows[rows.length - 1].id; };
{ rows = []; n = 0; DESC_CALLS = 0; const model = "Stale01"; const ids = {};
  for (let i = 0; i < 12; i++) mk(i, null, "A clean example.", model);
  ids.stale = [mk(20, "tribute", "The livery pays tribute to the 1968 and 1969 Le Mans winning GT40.", model), mk(21, "recreation", "A clean, original, factory-built example with its books.", model), mk(22, "replica", "Its owner pays tribute to the engineers who built it.", model)];
  ids.real = mk(23, "tribute", "This is a Stale01 tribute car built on a base chassis.", model);
  ids.hard = mk(24, "shell", "Offered as a bare shell only.", model), ids.staleHard = mk(25, "salvage", "A clean, original example with its books.", model);
  const d = await read(2001, model), inPool = id => (d.rawPool || []).some(r => r.id === id);
  ok("engine: stale stored soft flags on real cars come back into the pool (3 of 3)", ids.stale.every(inPool), JSON.stringify(ids.stale.map(inPool)));
  ok("engine: a real tribute car (build wording) keeps its flag and stays out", !inPool(ids.real));
  ok("engine: a flag the current rule reproduces (a bare shell) stays, and a stale hard flag the rule does not reproduce (salvage on a clean car) comes back", !inPool(ids.hard) && inPool(ids.staleHard));
  ok("engine: the descriptions are read only for the soft-flagged rows, one call per 80", DESC_CALLS >= 1 && DESC_CALLS <= 4, "calls " + DESC_CALLS); }
{ rows = []; n = 0; const model = "Stale02"; for (let i = 0; i < 12; i++) mk(i, null, "A clean example.", model); const id = mk(20, "tribute", "The livery pays tribute to the 1968 Le Mans winner.", model);
  const f0 = globalThis.fetch; globalThis.fetch = async (url, o) => { if (/id=in\./.test(String(url))) return new Response("boom", { status: 500 }); return f0(url, o); };
  const d = await read(2001, model); globalThis.fetch = f0;
  ok("engine: when the descriptions cannot be read the stored flag stands (never a guess)", !(d.rawPool || []).some(r => r.id === id)); }
console.log(failed ? `\n${failed} FAILED` : "\nsoftFlagCheck: all pass"); process.exit(failed ? 1 : 0);
