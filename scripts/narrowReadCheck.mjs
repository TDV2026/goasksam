// THE NARROWED FAMILY READ GIVES THE SAME VERDICT AS THE FULL READ (Lane B, Nov 2 2026; Sam's decision on the 20 s read). lib/onebox.js assessThin read the whole model family for every trimmed car (the 2002 911 Carrera 4S: 2,909 rows, 20.2 s of a 23.1 s answer) to scope one trim in memory.
// Behind the existing pool_columns_enabled switch (OFF by default, this check does not change it) the read is first made with a DB title filter on the trim's first word, and is used only when the trim scope still finds two or more rows and no trim-family fence applies.
// This check runs seeded pools through the engine twice, switch off and switch on, against a fake archive that answers the same filters the real queries send (make, model, year, sale date, title), and fails on ANY difference in the answer's verdict
// (tier, cluster, count, thin reason, rung, cards); it prints the rows each read moved and the time at the measured live rate (20,246 ms for 2,909 rows).   node scripts/narrowReadCheck.mjs [repo root]
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2";
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const imp = f => import(pathToFileURL(path.join(root, f)).href);
const E = await imp("lib/onebox.js"), V = await imp("lib/vehicle.js"), G = await imp("lib/generations.js");
let DB = [], rowsMoved = 0;
const likeRe = pat => new RegExp("^" + String(pat).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
globalThis.fetch = async (url, o) => {
  const u = new URL(String(url)); if (u.hostname !== "fake.supabase.test") throw new Error("offline");
  if (!/sales_archive/.test(u.pathname)) return new Response("[]", { status: 200 });
  const q = u.searchParams; let rows = DB.slice();
  for (const [k, v] of u.searchParams.entries()) {
    if (k === "make" && v.startsWith("ilike.")) rows = rows.filter(r => likeRe(v.slice(6)).test(r.make));
    else if (k === "model" && v.startsWith("ilike.")) rows = rows.filter(r => likeRe(v.slice(6)).test(r.model));
    else if (k === "listing_title" && v.startsWith("ilike.")) rows = rows.filter(r => likeRe(v.slice(6)).test(r.raw_title));
    else if (k === "year" && v.startsWith("gte.")) rows = rows.filter(r => r.year >= Number(v.slice(4)));
    else if (k === "year" && v.startsWith("lte.")) rows = rows.filter(r => r.year <= Number(v.slice(4)));
    else if (k === "sale_date" && v.startsWith("gte.")) rows = rows.filter(r => r.auction_end_date >= v.slice(4));
    else if (k === "sale_date" && v.startsWith("lt.")) rows = rows.filter(r => r.auction_end_date < v.slice(3));
  }
  if (q.get("select") === "sale_date") return new Response(JSON.stringify([{ sale_date: "2026-10-30" }]), { status: 200 });
  rows.sort((a, b) => String(b.auction_end_date).localeCompare(String(a.auction_end_date)) || (a.id < b.id ? -1 : 1));
  const m = /^(\d+)-(\d+)$/.exec(String((o && o.headers && (o.headers.Range || o.headers.range)) || "")), page = m ? rows.slice(Number(m[1]), Number(m[2]) + 1) : rows.slice(0, 1000);
  if (q.getAll('year').length) rowsMoved += page.length; if (process.env.TRACE) console.log(`   read ${page.length} rows | title=${q.get('listing_title') || '-'} | model=${q.get('model') || '-'} | since=${q.get('sale_date') || '-'} | years=${q.getAll('year').join(',')}`);
  return new Response(JSON.stringify(page), { status: 200, headers: { "content-range": `${m ? m[1] : 0}-${(m ? Number(m[1]) : 0) + page.length - 1}/${rows.length}` } });
};
const dateOf = i => new Date(Date.UTC(2021, 10, 4) + (i * 37) % 1800 * 864e5).toISOString().slice(0, 10);
const row = (id, y, make, model, title, price, i) => ({ id, source_id: id, price, auction_end_date: dateOf(i), source: "bringatrailer", raw_title: title, rtitle: title, year: y, make, model, vin_norm: "Z" + id, image: "https://x/y.jpg", mileage: String(30000 + i * 3000), transmission: "Manual", currency: "USD", precision: "day", stated_mileage: 30000 + i * 3000 });
const pool = (y0, y1, make, model, trims) => { const out = []; let n = 0; for (const [t, base, cnt, body] of trims) for (let i = 0; i < cnt; i++) out.push(row(`${make}${model}${t}`.replace(/\W/g, "") + i, y0 + (i % (y1 - y0 + 1)), make, model, `${y0 + (i % (y1 - y0 + 1))} ${make} ${model} ${t} ${body || "Coupe"}`, base + i * 700, n++)); return out; };
const CASES = [
  ["2002 Porsche 911 Carrera 4S (a pool the size of the live one: 2,909 family rows, 591 of them Carrera 4S)", pool(1999, 2004, "Porsche", "911", [["Carrera", 30000, 1500], ["Carrera 4", 38000, 600], ["Carrera 4S", 50000, 591], ["Turbo", 90000, 218]])],
  ["2002 Porsche 911 Carrera 4S", pool(1999, 2004, "Porsche", "911", [["Carrera", 30000, 30], ["Carrera 4", 38000, 10], ["Carrera 4S", 50000, 9], ["Turbo", 90000, 17], ["GT3", 120000, 6]])],
  ["2002 Porsche 911 Carrera 4", pool(1999, 2004, "Porsche", "911", [["Carrera", 30000, 30], ["Carrera 4", 38000, 10], ["Carrera 4S", 50000, 9], ["Turbo", 90000, 17]])],
  ["2002 Porsche 911 Turbo", pool(1999, 2004, "Porsche", "911", [["Carrera", 30000, 30], ["Turbo", 90000, 17], ["Turbo S", 120000, 4]])],
  ["2002 Porsche 911 Carrera 4S", pool(1999, 2004, "Porsche", "911", [["Carrera", 30000, 30], ["Carrera 4S", 50000, 1]])],
  ["2002 Porsche 911 Carrera 4S", pool(1999, 2004, "Porsche", "911", [["Carrera", 30000, 30], ["Turbo", 90000, 17]])],
  ["1965 Ford Mustang Shelby GT350", pool(1965, 1965, "Ford", "Mustang", [["GT Fastback", 60000, 10], ["Shelby GT350 Fastback", 450000, 8], ["Coupe", 26000, 12]])],
  ["1965 Ford Mustang GT", pool(1965, 1965, "Ford", "Mustang", [["GT Fastback", 60000, 10], ["Shelby GT350 Fastback", 450000, 8], ["Coupe", 26000, 12]])],
  ["2008 Porsche 911 Carrera S", pool(2005, 2008, "Porsche", "911", [["Carrera S", 70000, 12], ["Carrera", 45000, 14], ["Carrera 4S", 80000, 10]])],
  ["2001 BMW M3", pool(2001, 2001, "BMW", "M3", [["Coupe", 30000, 14], ["Convertible", 28000, 9]])]
];
let totOff = 0, totOn = 0, bigOff = 0, bigOn = 0, caseNo = 0;
for (const [text, rows] of CASES) {
  const text0 = text, r = await V.resolveVehicle(text.replace(/ \(.*$/, ""), {}), v = r.vehicle; if (!v) { ok(`${text}: resolves`, false); continue; }
  const g = await G.findGeneration(v, { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" }).catch(() => null);
  DB = rows;
  const run = async on => { rowsMoved = 0; const a = (await E.oneEngineAnswer(v, g, text0.replace(/ \(.*$/, ""), { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k", asked: 0, poolColumns: on, ...(on ? {} : {}) }, null)).raw; return { a, moved: rowsMoved }; };
  const off = await run(false), on = await run(true);
  const V_ = a => JSON.stringify({ tier: a.tier, cluster: a.cluster ?? null, poolN: a.poolN ?? null, thin: a.thinReason ?? null, thinLine: a.thinLine ?? null, rung: a.fallbackRung ?? null, rungLabel: a.rungLabel ?? null, cards: (a.cards || []).map(c => `${c.date}|${c.price}`), q: a.trimOptions ? a.trimOptions.map(o => o.label) : null, set: a.setAsideCount ?? null });
  ok(`${text} (${rows.length} rows seeded): the verdict is the same with the switch on (${off.a.tier})`, V_(off.a) === V_(on.a), V_(off.a) === V_(on.a) ? "" : `off ${V_(off.a).slice(0, 160)} | on ${V_(on.a).slice(0, 160)}`);
  console.log(`      rows moved: switch off ${off.moved}, switch on ${on.moved}  ->  at the live rate (6.96 ms a row): ${(off.moved * 6.96 / 1000).toFixed(1)} s vs ${(on.moved * 6.96 / 1000).toFixed(1)} s`);
  totOff += off.moved; totOn += on.moved; if (caseNo++ === 0) { bigOff = off.moved; bigOn = on.moved; }
}
ok(`over all the pools the narrowed read moves fewer family-window rows (${totOn} against ${totOff})`, totOn < totOff);
ok(`the live-size pool: the narrowed read moves at least 30 percent fewer rows (${bigOn} against ${bigOff}, ${(bigOff * 6.96 / 1000).toFixed(1)} s to ${(bigOn * 6.96 / 1000).toFixed(1)} s at the measured rate)`, bigOn <= bigOff * 0.7);
{ const src = (await import("node:fs")).readFileSync(path.join(root, "lib/onebox.js"), "utf8"); ok("the narrowed read runs only when poolColumnsOn(env) is true (the switch stays off unless Sam turns it on)", /if \(narrowTok && await poolColumnsOn\(env\)\)/.test(src)); }
console.log(fail ? `narrowReadCheck: ${fail} failure(s)` : "narrowReadCheck: all pass");
process.exit(fail ? 1 : 0);
