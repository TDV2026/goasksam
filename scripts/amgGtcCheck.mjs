// amgGtcCheck (Lane B, Oct 20 2026, Sam: the Amazon demo's 2019 AMG GT C, "the range comes only from GT C sales"): "AMG GT C" and
// "AMG GTC" resolve to model AMG GT, trim "GT C"; the plain AMG GT, GT R and a Mustang "GT C-code" read as before; and the engine's
// trim title match keeps exactly the GT C sales of the real 2019 pool (6 GT R, 6 GT C, 1 base), never "GT Coupe" or a GT R.
// Offline: the resolver with the network blocked, and the engine's qualifyReason on the pool's own titles.
globalThis.fetch = async () => { throw new Error("network blocked in check"); };
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY; delete process.env.OLDCARSDATA_API_KEY;
const { resolveVehicle } = await import("../lib/vehicle.js");
const ob = await import("../lib/onebox.js");
let bad = 0;
const ok = (c, m) => { if (c) console.log("ok   " + m); else { bad++; console.log("FAIL " + m); } };
const res = async t => { const r = await resolveVehicle(t, {}); return r && r.vehicle ? { model: r.vehicle.model, trim: r.vehicle.trim || null } : null; };
for (const t of ["2019 Mercedes-AMG GT C", "2019 Mercedes-AMG GTC"]) { const v = await res(t); ok(v && v.model === "AMG GT" && v.trim === "GT C", `"${t}" reads AMG GT, trim GT C (${JSON.stringify(v)})`); }
const plain = await res("2019 Mercedes-AMG GT");
ok(plain && plain.model === "AMG GT" && !plain.trim, "the plain 2019 AMG GT keeps no trim (unchanged)");
const r = await res("2019 Mercedes-AMG GT R");
ok(r && r.trim === "R", "the GT R keeps its trim (unchanged)");
const mus = await res("1967 Ford Mustang GT C code");
ok(mus && mus.trim === "GT", `a Mustang "GT C code" keeps today's read (${JSON.stringify(mus)})`);
// the 2019 pool's own titles (read 19:07:33Z)
const pool = ["2019 Mercedes-AMG GT R", "2019 Mercedes-Benz AMG GT R", "8k-Mile 2019 Mercedes-AMG GT C", "7k-Mile 2019 Mercedes-AMG GT C", "15k-Mile 2019 Mercedes-AMG GT C Roadster", "8k-Mile 2019 Mercedes-AMG GT R", "2019 Mercedes-AMG GT C Roadster", "2019 Mercedes-AMG GT R Coupe", "2019 Mercedes-AMG GT C Roadster", "2019 Mercedes-AMG GT C Coupe", "2019 Mercedes-AMG GT Roadster", "2019 Mercedes-AMG GT R", "2019 Mercedes-AMG GT R"];
const spec = { make: "Mercedes-Benz", model: "AMG GT", trim: "GT C", titleContains: "GT C", year: 2019, houseTier: true };
const row = t => ({ title: t, raw_title: t, rtitle: t, year: 2019, make: "Mercedes-Benz", model: "AMG GT", price: 100000, sale_price: 100000, currency: "USD", image: "x" });
const kept = pool.filter(t => !ob.qualifyReason(row(t), spec));
ok(kept.length === 6 && kept.every(t => /GT C\b/.test(t)), `the GT C scope keeps exactly the 6 GT C sales of the 13 (kept ${kept.length})`);
ok(!ob.qualifyReason(row("2019 Mercedes-AMG GT C Coupe"), spec), "a GT C Coupe title matches");
ok(!!ob.qualifyReason(row("2017 Mercedes-AMG GT Coupe"), spec), "\"GT Coupe\" never matches \"GT C\"");
ok(!!ob.qualifyReason(row("2019 Mercedes-AMG GT R"), spec), "a GT R does not match");
console.log(bad ? `amgGtcCheck: ${bad} failed` : "amgGtcCheck: all passed");
process.exit(bad ? 1 : 0);
