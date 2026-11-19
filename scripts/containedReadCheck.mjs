// A read inside a window the request already holds is not read again (Lane B, Nov 3 2026, job lane-b-legs, item 2). No database: a fake archive that counts its requests.
// THE CLASS: the request's memo (diag.fetchMemo) answered only the same query string or read the OLDER part of a query held with a later start. A NARROWER window of a held query (a later start, a year range inside the held one) had no match and went back to the
// archive: the reserve walk reads the generation and the model in every year over the answer's own 12 to 24 months while the ladder holds the same model over 60 months and every year, six more legs (model, title, chassis-code alias, twice) for rows already in memory.
// Every caller that shares a diag (the ladder rungs, the trim chips, the exact-year line, the walk) gets the held rows cut to its window. Must hold:
//  (1) a narrower window (later start, years inside) of a held query issues NO archive request and answers the rows a fresh read of that window answers (same ids, same order);
//  (2) a window that is NOT inside the held one is still read: an earlier start, a year outside, a different filter;
//  (3) a row with no year or no date is left out of a year or date bounded window exactly as the database leaves it out;
//  (4) a later start of a held query with years inside still reads nothing, and an earlier start reads only what the delta read already reads (not the whole);
//  (5) the answer's own walk: its generation read over the answer's window is served from the held rows (the leg list says memo).
//   node scripts/containedReadCheck.mjs [repo root]
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const quiet = console.error; console.error = () => {};
const day = i => new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
const ev = (row, it) => { const ci = it.indexOf(":"); const alias = ci > 0 && it[ci + 1] !== ":" ? it.slice(0, ci) : null; const expr = alias ? it.slice(ci + 1) : it; if (expr.startsWith("raw_record->>")) return [alias || expr.slice(13), row.raw_record[expr.slice(13)] ?? null]; const col = expr.replace(/::text$/, ""); return [alias || col, col in row ? row[col] : null]; };
const likeRe = v => new RegExp("^" + String(v).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
const rows = [];
for (let i = 0; i < 90; i++) { const y = 1999 + (i % 10), title = `${y} Porsche 911 Carrera ${i}`;
  rows.push({ id: "00000000-0000-4000-8000-" + String(i + 1).padStart(12, "0"), source_id: "c" + i, sale_price: 30000 + i * 90, sale_date: day(5 + i * 17), platform: "Bring a Trailer", year: y, make: "Porsche", model: "911", listing_title: title, vin_norm: "V" + i,
    stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: i % 2 === 0, vehicle_type: "car", sale_price_usd: 30000 + i * 90,
    raw_record: { featured_image_url: "https://x/i.jpg", mileage: "40000", body_style: "Coupe", modifications: null, title, currency: "USD", transmission: null, exterior_color: null } }); }
rows[3].year = null; rows[7].sale_date = null;   // a row with no year, a row with no date
let reqs = 0;
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  if (!u.pathname.endsWith("/sales_archive")) return new Response("[]", { status: 200 });
  const sp = u.searchParams, sel = sp.get("select") || ""; if (/^(source_slug|model|sale_date)$/.test(sel) || sp.get("id") || sp.get("vin_norm")) return new Response("[]", { status: 200 });
  reqs++;
  const sd = sp.getAll("sale_date"), ge = sd.filter(v => v.startsWith("gte.")).map(v => v.slice(4)), lt = sd.filter(v => v.startsWith("lt.")).map(v => v.slice(3));
  const ys = sp.getAll("year"), lo = ys.find(v => v.startsWith("gte.")), hi = ys.find(v => v.startsWith("lte."));
  const mk = sp.get("make") && likeRe(sp.get("make").replace(/^ilike\./, "")), md = sp.get("model") && likeRe(sp.get("model").replace(/^ilike\./, "")), ti = sp.get("listing_title") && likeRe(sp.get("listing_title").replace(/^ilike\./, ""));
  const keep = rows.filter(r => (!ge.length || (r.sale_date && r.sale_date >= ge[0])) && (!lt.length || (r.sale_date && r.sale_date < lt[0])) && (!lo || (r.year != null && r.year >= Number(lo.slice(4)))) && (!hi || (r.year != null && r.year <= Number(hi.slice(4)))) && (!mk || mk.test(r.make)) && (!md || md.test(r.model)) && (!ti || ti.test(r.listing_title)))
    .sort((a, b) => String(b.sale_date).localeCompare(String(a.sale_date)) || a.id.localeCompare(b.id));
  const from = Number(/^(\d+)-/.exec(((init.headers || {}).Range) || "0-999")[1]);
  return new Response(JSON.stringify(keep.slice(from, from + 1000).map(r => Object.fromEntries(sel.split(",").map(it => ev(r, it))))), { status: 200 });
};
const env = { supabaseUrl: "https://fake.example", supabaseKey: "k", poolColumns: false };
const since = months => new Date(Date.now() - months * 30.4375 * 864e5).toISOString();
const spec = (o = {}) => ({ make: "Porsche", model: "911", trim: "", year: null, yearMin: null, yearMax: null, excludeVariants: [], genCode: null, ...o });
const ids = r => r.map(x => x.id).join(",");
const fresh = async (s, months) => { reqs = 0; const r = await E.fetchQualifying(s, since(months), env, { fetchMemo: new Map() }); return { r, n: reqs }; };

// (1)
{ const diag = { fetchMemo: new Map() }; await E.fetchQualifying(spec(), since(60), env, diag);
  reqs = 0; const got = await E.fetchQualifying(spec({ yearMin: 2001, yearMax: 2004 }), since(24), env, diag); const n = reqs;
  const want = (await fresh(spec({ yearMin: 2001, yearMax: 2004 }), 24)).r;
  ok("(1) a narrower window of a held query is not read again", n === 0, `requests: ${n}`);
  ok("... and answers the rows a fresh read of that window answers, in the same order", got.length > 0 && ids(got) === ids(want), `${got.length} rows vs ${want.length}`);
  // (4) a later start only
  reqs = 0; const later = await E.fetchQualifying(spec(), since(12), env, diag); const n4 = reqs; const wantL = (await fresh(spec(), 12)).r;
  ok("(4) a later start of the held query reads nothing and answers the fresh read's rows", n4 === 0 && ids(later) === ids(wantL), `requests ${n4}, ${later.length} vs ${wantL.length}`);
  // (2) not inside
  reqs = 0; await E.fetchQualifying(spec({ yearMin: 2001, yearMax: 2004 }), since(90), env, diag);
  ok("(2) an EARLIER start than the held one is read", reqs > 0, `requests: ${reqs}`);
  const diag2 = { fetchMemo: new Map() }; await E.fetchQualifying(spec({ yearMin: 2001, yearMax: 2004 }), since(60), env, diag2);
  reqs = 0; await E.fetchQualifying(spec({ yearMin: 2000, yearMax: 2004 }), since(24), env, diag2);
  ok("(2) a year outside the held range is read", reqs > 0, `requests: ${reqs}`);
  reqs = 0; await E.fetchQualifying(spec({ titleContains: "Carrera" }), since(24), env, diag);
  ok("(2) a different filter (a title word) is read", reqs > 0, `requests: ${reqs}`);
  // (3) the rows with no year or no date
  const g = await E.fetchQualifying(spec({ yearMin: 1999, yearMax: 2008 }), since(60), env, { fetchMemo: new Map([]) });
  const dq = { fetchMemo: new Map() }; await E.fetchQualifying(spec(), since(60), env, dq);
  reqs = 0; const bounded = await E.fetchQualifying(spec({ yearMin: 1999, yearMax: 2008 }), since(60), env, dq);
  ok("(3) a year bounded window leaves out the row with no year, the same rows the database returns", reqs === 0 && ids(bounded) === ids(g) && !bounded.some(r => r.id === rows[3].id), `requests ${reqs}, ${bounded.length} vs ${g.length}`); }

// (5) the answer's own walk
{ const fx = []; const sale = (y, d, p, hr) => fx.push({ ...rows[0], id: "00000000-0000-4000-9000-" + String(fx.length + 1).padStart(12, "0"), source_id: "z" + fx.length, year: y, sale_date: day(d), sale_price: p, sale_price_usd: p, has_reserve: hr, make: "Datsun", model: "240Z", listing_title: `${y} Datsun 240Z`, vin_norm: "Z" + fx.length, raw_record: { ...rows[0].raw_record, title: `${y} Datsun 240Z` } });
  for (let i = 0; i < 9; i++) sale(1972, 10 + i, 28000 + i * 100, null);
  for (let i = 0; i < 4; i++) sale(1971, 50 + i, 30000, true);
  for (let i = 0; i < 4; i++) sale(1971, 60 + i, 27000, false);
  const saved = rows.slice(); rows.length = 0; rows.push(...fx);
  const sink = []; const a = await E.oneEngineAnswer({ make: "Datsun", model: "240Z", trim: "", year: 1972, bodyStyle: null }, null, "1972 Datsun 240Z", { ...env, noStageLog: true, legSink: sink }, null);
  const walk = sink.filter(l => l.stage === "sell_fields");
  ok("(5) the walk's generation read is served from the rows the ladder holds (no archive request for it)", walk.length > 0 && walk.filter(l => /years 1970-1974/.test(l.leg)).length > 0 && walk.filter(l => /years 1970-1974/.test(l.leg)).every(l => l.from === "contained" || l.from === "held"), JSON.stringify(walk.map(l => `${l.leg} ${l.from || l.ms + "ms (archive)"}`)));
  rows.length = 0; rows.push(...saved); }

console.error = quiet;
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
