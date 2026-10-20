// c63GenCheck (Lane B, Oct 20 2026, Sam: "C63 entry: yes"): offline, no network. The curated C63 generations (W204 2008 to 2015,
// W205 2016 to 2021) bind a typed C63 to its own body's years; the C-Class family (C300, C43) and the E63 keep their windows;
// a year past the W205 keeps the calendar window; the S-Class entries are untouched.
globalThis.fetch = async () => { throw new Error("blocked"); };
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const { resolveVehicle, sanitizeResolvedVehicle } = await import("../lib/vehicle.js");
const { findGeneration, generationsForModel } = await import("../lib/generations.js");
const { buildSpec } = await import("../lib/onebox.js");
let bad = 0;
const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) bad++; };
const spec = async t => { const r = await resolveVehicle(t, {}); const v = sanitizeResolvedVehicle(r.vehicle) || r.vehicle; const g = await findGeneration(v, null).catch(() => null); return buildSpec(v, g, t); };
const win = s => `${s.yearMin}-${s.yearMax} ${s.genCode || "calendar"}`;
for (const [t, want] of [
  ["2016 Mercedes-Benz C63 AMG", "2016-2021 w205"], ["2017 Mercedes-Benz C63 AMG", "2016-2021 w205"], ["2019 Mercedes-Benz C63 AMG", "2016-2021 w205"],
  ["2019 Mercedes-AMG C63 S", "2016-2021 w205"], ["2015 Mercedes-Benz C63 AMG Edition 507", "2008-2015 w204"], ["2012 Mercedes-Benz C63 AMG Black Series", "2008-2015 w204"],
  ["2008 Mercedes-Benz C63 AMG", "2008-2015 w204"],
  ["2017 Mercedes-Benz C300", "2015-2019 calendar"], ["2018 Mercedes-AMG C43", "2016-2020 calendar"], ["2012 Mercedes-Benz E63 AMG", "2010-2014 calendar"],
  ["2022 Mercedes-AMG C63", "2020-2024 calendar"]
]) { const s = await spec(t); ok(win(s) === want, `${t}: ${win(s)} (want ${want})`); }
ok(generationsForModel("Mercedes-Benz", "C63").map(g => g.code).join() === "w204,w205", "the C63 holds exactly two generations, w204 then w205");
ok(generationsForModel("Mercedes-Benz", "C-Class").length === 0, "the C-Class family holds no generations (C300 and C43 untouched)");
ok(generationsForModel("Mercedes-Benz", "S-Class").length === 6, "the S-Class entries are untouched");
console.log(bad ? `c63GenCheck: ${bad} failed` : "c63GenCheck: all passed");
process.exit(bad ? 1 : 0);
