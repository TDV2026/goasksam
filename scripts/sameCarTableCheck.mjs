// SAME CAR, TWO NAMES: Sam's table (Oct 29 2026) is the only place the engine learns that two names are one car.
//   Previa = Estima. Discovery = LR4 for the 2010 to 2016 Discovery 4 only. XKR is a trim of the XK. Vanagon and Bus stay separate.
// WHY IT MATTERS: the archive files the same car under both names, so a pool read under one name held only part of the sales, and a pool that held the other name's rows was refused as a swapped pool
// (receipts_carry_resolved_car: "2011 Land Rover Discovery" over LR4 cards, "2007 Jaguar XK" over XKR cards, "1995 Toyota Previa" over Estima cards: could not be checked).
// This check: (1) the table says what the rulings say, in the years the rulings name; (2) the pool read for either name reads the other name's rows, inside the years, and never a different car's; (3) the receipts invariant
// passes a pool of the other name inside the years and still fails it outside them and for a separate car; (4) Vanagon and Bus, Discovery and LR3, XK and XK8 are never joined.
//   node scripts/sameCarTableCheck.mjs [repo root]
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2";
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const T = await import(pathToFileURL(path.join(root, "lib/sameCar.js")).href).catch(() => null);
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
ok("lib/sameCar.js exists", !!T);
if (T) {
  const has = (make, model, other) => T.sameCarNames(make, model).some(n => n.toLowerCase() === other.toLowerCase());
  ok("Previa and Estima read each other", has("Toyota", "Previa", "Estima") && has("Toyota", "Estima", "Previa"));
  ok("Discovery reads LR4 and LR4 reads Discovery", has("Land Rover", "Discovery", "LR4") && has("Land Rover", "LR4", "Discovery"));
  ok("the XK reads the XKR (a trim), and the XKR does not read the whole XK", has("Jaguar", "XK", "XKR") && !has("Jaguar", "XKR", "XK"));
  ok("Vanagon and Bus stay separate; the LR3 is not an LR4 or a Discovery; the XK8 is not the XK", T.sameCarNames("Volkswagen", "Vanagon").length === 0 && T.sameCarNames("Volkswagen", "Bus").length === 0 && !has("Land Rover", "Discovery", "LR3") && !has("Jaguar", "XK", "XK8"));
  ok("every pair in SEPARATE is joined nowhere in SAME_CAR", T.SEPARATE.every(s => !T.SAME_CAR.some(e => e.make === s.make && s.names.every(n => (e.names || [e.base, ...(e.trims || [])]).includes(n)))));
  ok("an LR4 row in 2012 is a Discovery; in 2009 or 2017 it is not", T.sameCarRowOk("Land Rover", "Discovery", "LR4", 2012, "2012 Land Rover LR4") && !T.sameCarRowOk("Land Rover", "Discovery", "LR4", 2009, "2009 Land Rover LR4") && !T.sameCarRowOk("Land Rover", "Discovery", "LR4", 2017, ""));
  ok("a year read off the title when the card carries none", T.sameCarRowOk("Land Rover", "Discovery", "LR4", null, "2011 Land Rover LR4 HSE") && !T.sameCarRowOk("Land Rover", "Discovery", "LR4", null, "2008 Land Rover LR4"));
  ok("a Discovery Sport or LR3 row is not a Discovery in the table", !T.sameCarRowOk("Land Rover", "Discovery", "Discovery Sport", 2016, "2016 Land Rover Discovery Sport") && !T.sameCarRowOk("Land Rover", "Discovery", "LR3", 2008, "2008 Land Rover LR3"));
  ok("the other name's archive rows are read only inside the years", T.sameCarYearOk("Land Rover", "Discovery", "LR4", 2013) && !T.sameCarYearOk("Land Rover", "Discovery", "LR4", 2008) && T.sameCarYearOk("Toyota", "Previa", "Estima", 1995) && T.sameCarYearOk("Toyota", "Previa", "Previa-less-name", 1995));
}
// 2. the real pool read over a fake archive
const DAY = 864e5, now = Date.now(), iso = d => new Date(now - d * DAY).toISOString().slice(0, 10);
const mk = (id, make, year, model, title, price) => ({ id, source_id: id, price, auction_end_date: iso(30 + (price % 200)), source: "bringatrailer", raw_title: title, year, make, model, vin_norm: null, image: "https://img.test/" + id + ".jpg" });
const ROWS = [
  mk("d1", "Land Rover", 2011, "Discovery", "2011 Land Rover Discovery 4 HSE", 21000), mk("d2", "Land Rover", 2013, "LR4", "2013 Land Rover LR4 HSE", 24000), mk("d3", "Land Rover", 2015, "LR4", "2015 Land Rover LR4", 28000),
  mk("d4", "Land Rover", 2008, "LR4", "2008 Land Rover LR4 (a mislabelled LR3)", 9000), 
  mk("p1", "Toyota", 1995, "Previa", "1995 Toyota Previa", 7000), mk("p2", "Toyota", 1994, "Estima", "1994 Toyota Estima Emina", 7600), mk("p3", "Toyota", 1996, "Estima", "1996 Toyota Estima", 8200),
  mk("x1", "Jaguar", 2010, "XK", "2010 Jaguar XK Coupe", 30000), mk("x2", "Jaguar", 2011, "XKR", "2011 Jaguar XKR Coupe", 36000), mk("x3", "Jaguar", 2004, "XK8", "2004 Jaguar XK8", 20000),
  mk("v1", "Volkswagen", 1991, "Vanagon", "1991 Volkswagen Vanagon GL", 15000), mk("v2", "Volkswagen", 1991, "Bus", "1991 Volkswagen Bus Westfalia", 18000)
];
const wild = v => new RegExp("^" + String(v).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
globalThis.fetch = async (url, init) => {
  const u = new URL(url); let rows = ROWS;
  if (!u.pathname.endsWith("/sales_archive")) return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  for (const [k, v] of u.searchParams) { const m = /^ilike\.(.*)$/.exec(v); if (!m) continue; const re = wild(m[1]); rows = rows.filter(r => re.test(String(k === "model" ? r.model : k === "listing_title" ? r.raw_title : k === "make" ? r.make : ""))); }
  const yl = u.searchParams.getAll("year"); for (const y of yl) { const g = /^gte\.(\d+)/.exec(y), l = /^lte\.(\d+)/.exec(y); if (g) rows = rows.filter(r => r.year >= +g[1]); if (l) rows = rows.filter(r => r.year <= +l[1]); }
  const [from, to] = String((init.headers || {}).Range || "0-999").split("-").map(Number);
  return new Response(JSON.stringify(rows.slice(from, to + 1).map(r => ({ ...r, sale_date: r.auction_end_date }))), { status: 200, headers: { "content-type": "application/json" } });
};
const env = { supabaseUrl: "http://fake", supabaseKey: "k" }, since = new Date(now - 1826 * DAY).toISOString();
const pool = async (make, model, y0, y1) => ((await E.fetchQualifying({ make, model, year: y0, yearMin: y0, yearMax: y1, trim: "", excludeVariants: [], subject: model }, since, env, {})) || []).map(r => r.id).sort().join(",");
const disco = await pool("Land Rover", "Discovery", 2008, 2016), prev = await pool("Toyota", "Previa", 1990, 1998), est = await pool("Toyota", "Estima", 1990, 1998), xk = await pool("Jaguar", "XK", 2007, 2014), van = await pool("Volkswagen", "Vanagon", 1990, 1992);
ok("the Discovery pool 2010 to 2016 holds the LR4 sales", disco.includes("d1") && disco.includes("d2") && disco.includes("d3"), disco);
ok("... and not the 2008 LR4 (inside the pool's years but outside the ruling's)", !disco.includes("d4"), disco);
ok("the Previa pool holds the Estima sales and the Estima pool the Previa's", prev.includes("p1") && prev.includes("p2") && prev.includes("p3") && est.includes("p1") && est.includes("p3"), prev + " | " + est);
ok("the XK pool holds the XKR sale and not the XK8", xk.includes("x1") && xk.includes("x2") && !xk.includes("x3"), xk);
ok("the Vanagon pool does not hold the Bus", van.includes("v1") && !van.includes("v2"), van);
// 3. the receipts invariant
const card = (make, model, year, title) => ({ make, model, year, title, price: 20000, date: "2026-03-01" });
const answer = (resolved, cards) => ({ tier: "result", poolN: cards.length, soldCount: cards.length, cards, resolvedCar: resolved, cluster: [18000, 30000], rawPool: [], windowWords: "since June 2025", thinReason: null });
const inv = (resolved, cards) => { const r = E.runOutputInvariants(answer(resolved, cards), { year: resolved.year, make: resolved.make, model: resolved.model }); return (r && r.checks || r || []).find ? (r.checks || r).find(c => c.id === "receipts_carry_resolved_car" || c.name === "receipts_carry_resolved_car") : null; };
const passes = (resolved, cards) => { const c = inv(resolved, cards); return c ? (c.ok ?? c.pass) : null; };
const lr = (y, n) => Array.from({ length: n }, (_, i) => card("Land Rover", "LR4", y, `${y} Land Rover LR4 HSE`));
ok("a 2012 Discovery over LR4 cards passes the receipts check", passes({ year: 2012, make: "Land Rover", model: "Discovery" }, lr(2012, 6)) === true, JSON.stringify(inv({ year: 2012, make: "Land Rover", model: "Discovery" }, lr(2012, 6))));
ok("a 2008 Discovery over LR4 cards still fails it (not the Discovery 4)", passes({ year: 2008, make: "Land Rover", model: "Discovery" }, lr(2008, 6)) === false);
ok("a Vanagon over Bus cards still fails it", passes({ year: 1991, make: "Volkswagen", model: "Vanagon" }, Array.from({ length: 6 }, () => card("Volkswagen", "Bus", 1991, "1991 Volkswagen Bus Westfalia"))) === false);
ok("a 1995 Previa over Estima cards passes", passes({ year: 1995, make: "Toyota", model: "Previa" }, Array.from({ length: 6 }, () => card("Toyota", "Estima", 1995, "1995 Toyota Estima"))) === true);
ok("a 2010 XK over XKR cards passes, over XK8 cards fails", passes({ year: 2010, make: "Jaguar", model: "XK" }, Array.from({ length: 6 }, () => card("Jaguar", "XKR", 2010, "2010 Jaguar XKR Coupe"))) === true && passes({ year: 2010, make: "Jaguar", model: "XK" }, Array.from({ length: 6 }, () => card("Jaguar", "XK8", 2010, "2010 Jaguar XK8 Coupe"))) === false);
console.log(fail ? `sameCarTableCheck: ${fail} failure(s)` : "sameCarTableCheck: all pass");
process.exit(fail ? 1 : 0);
