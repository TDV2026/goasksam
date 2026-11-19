// AMG number badge pool check (Oct 25 2026, the 2017 G63 refused with 52 sales). No DB, no network: synthetic rows built from
// real G63 and C63 titles. A resolved Mercedes badge (G63, C63) IS the AMG, so the generic make-halo must not set its own
// sales aside; only a Black Series (a genuinely higher tier) is a halo. A base C-Class query keeps its AMG halo.
//   node scripts/amgBadgeCheck.mjs
import { buildPool } from "../lib/onebox.js";

const now = Date.now(), DAY = 864e5;
const iso = days => new Date(now - days * DAY).toISOString();
const row = (title, i, usd, year) => ({ _usd: usd, raw_title: title, rtitle: title, year, auction_end_date: new Date(now - (10 + i * 9) * DAY).toISOString().slice(0, 10), source: "bringatrailer", mods: "", transmission: "Automatic", mileage: "40000" });
const base = (make, model, year) => ({ resolvedCar: { make, model, year }, resolvedSpec: null, dedup: {}, vehicle: { make, model, trim: null, year }, exactSale: null });
let failed = 0;
const ok = (name, cond, detail) => { if (!cond) failed++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`); };

const g63Titles = ["2016 Mercedes-AMG G63", "2015 Mercedes-Benz G63 AMG", "2018 Mercedes-AMG G63", "2017 Mercedes-AMG G63", "35k-Mile 2015 Mercedes-Benz G63 AMG", "2018 Mercedes-Benz AMG G63"];
const g63Rows = Array.from({ length: 24 }, (_, i) => row(g63Titles[i % g63Titles.length], i, 45000 + i * 2200, 2015 + (i % 4)));
const g63Spec = { make: "Mercedes-Benz", model: "G63", badge: "G63", trim: "", year: 2017, excludeVariants: [], genCode: null };
const p1 = buildPool({ rows: g63Rows, step: "base", windowLabel: "past 2 years" }, base("Mercedes-Benz", "G63", 2017), iso, g63Spec, null);
ok("G63 badge: its own AMG titles stay in the pool", p1.solid.length === 24, `solid ${p1.solid.length} of 24`);

const bs = [...g63Rows.slice(0, 20), row("2008 Mercedes-Benz C63 AMG Black Series", 3, 120000, 2008)];
const c63Spec = { make: "Mercedes-Benz", model: "C63", badge: "C63", trim: "", year: 2012, excludeVariants: [], genCode: null };
const p2 = buildPool({ rows: bs, step: "base", windowLabel: "past 2 years" }, base("Mercedes-Benz", "C63", 2012), iso, c63Spec, null);
ok("C63 badge: the Black Series is still set aside", p2.solid.length === 20 && p2.aside.length >= 1, `solid ${p2.solid.length}, aside ${p2.aside.length}`);

const baseSpec = { make: "Mercedes-Benz", model: "C-Class", badge: null, trim: "", year: 2012, excludeVariants: [], genCode: null };
const mixed = [...Array.from({ length: 12 }, (_, i) => row("2012 Mercedes-Benz C300 Sport", i, 20000 + i * 500, 2012)), ...Array.from({ length: 6 }, (_, i) => row("2012 Mercedes-Benz C63 AMG", i, 40000 + i * 900, 2012))];
const p3 = buildPool({ rows: mixed, step: "base", windowLabel: "past 2 years" }, base("Mercedes-Benz", "C-Class", 2012), iso, baseSpec, null);
ok("base C-Class: the AMG halo is still set aside", p3.solid.length === 12 && p3.aside.length === 6, `solid ${p3.solid.length}, aside ${p3.aside.length}`);

// A Shelby query IS the special: GT350 and GT500 sales stay in their own pool (they refused with 14 and 21 sales).
const shelbyTitles = ["1967 Shelby Mustang GT500 Fastback 4-Speed", "1969 Shelby Mustang GT500 Fastback", "1968 Shelby Mustang GT500 Fastback", "1968 Shelby Mustang GT500 Convertible 4-Speed"];
const gtRows = Array.from({ length: 21 }, (_, i) => row(shelbyTitles[i % 4], i, 120000 + i * 6000, 1967 + (i % 4)));
const gtSpec = { make: "Shelby", model: "GT500", trim: "", year: 1968, excludeVariants: [], genCode: null };
const p4 = buildPool({ rows: gtRows, step: "base", windowLabel: "past 2 years" }, base("Shelby", "GT500", 1968), iso, gtSpec, null);
ok("Shelby GT500: its own sales stay in the pool", p4.solid.length === 21, `solid ${p4.solid.length} of 21`);
const plainSpec = { make: "Ford", model: "Mustang", trim: "", year: 1968, excludeVariants: [], genCode: null };
const mus = [...Array.from({ length: 12 }, (_, i) => row("1968 Ford Mustang Fastback", i, 30000 + i * 700, 1968)), ...Array.from({ length: 5 }, (_, i) => row("1968 Shelby Mustang GT500 Fastback", i, 130000 + i * 5000, 1968))];
const p5 = buildPool({ rows: mus, step: "base", windowLabel: "past 2 years" }, base("Ford", "Mustang", 1968), iso, plainSpec, null);
ok("base Mustang: the Shelbys are still set aside", p5.solid.length === 12 && p5.aside.length === 5, `solid ${p5.solid.length}, aside ${p5.aside.length}`);
process.exit(failed ? 1 : 0);
