// COUNTS ADD UP, EVERYWHERE THEY ARE PRINTED (Lane F's scratch check, adopted Oct 29 2026, with three more failures). Lane F found it on the live pages (bee760b6): an option's count and window come from its own pool while the list, the remainder and the caption come
// from the whole pool, and nothing compared them; the same cause shows on any split answer (body, gearbox, edition, mileage, year).
//   1. an option's count never exceeds the answer's total (an option on its own, longer window is the one honest exception, and then the table's caption prints NO count);
//   2. options plus the remainder line equal the total the table lists, whenever no option reaches past the window;
//   3. the sales table's caption (the engine's salesHeading) prints no total that differs from the options' sum plus the remainder;
//   4. a "Which model" list has no chip cut at a space (lib/vehicle.js askChipFaults);
//   5. Lane F's original live-page mode is kept: node scripts/countsCheck.mjs <saved live reads.json> <saved questions.json> runs the scrape check (blocks, remainder, "Show more", truncated chips, an empty NARROW BY label).
// The engine side runs on answers built from the real shapes (the 1986 Porsche 911 Carrera, 2004 BMW M3, 1995 Porsche 911, 2002 Firebird) through the real read-time path (withReadFields).
//   node scripts/countsCheck.mjs [repo root]
import fs from "node:fs";
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const a0 = process.argv[2] || "";
if (a0.endsWith(".json")) {   // Lane F's saved-read mode
  const r = JSON.parse(fs.readFileSync(a0, "utf8")), fails = [];
  for (const k in r) { const o = r[k]; if (!o.blocks || !o.blocks.length) continue;
    const opt = o.blocks.map(b => +(b.match(/(\d+) sales? since/) || b.match(/(\d+) sales?, too few/) || [])[1] || 0).reduce((a, b) => a + b, 0);
    const rem = +((o.small || []).join(" ").match(/(\d+) sales? do not/) || [])[1] || 0;
    const more = +((o.showMore || [{}])[0].more || "").match(/\((\d+)\)/)?.[1] || 0, total = 10 + more;
    if (more && opt + rem !== total) fails.push(`${k}: options ${opt} + remainder ${rem} = ${opt + rem}, sales list ${total}`);
    if (/NARROW BY\s*\n\s*Add mileage/.test(o.body || "")) fails.push(`${k}: NARROW BY label with no chips`); }
  const q = process.argv[3] ? JSON.parse(fs.readFileSync(process.argv[3], "utf8")) : {};
  for (const k in q) if (/^which/.test(k)) for (const c of q[k].chips || []) if (/^(El|Mo|Gr)\s*→/.test(c)) fails.push(`${k}: truncated chip "${c}"`);
  console.log(fails.length ? "FAIL\n" + fails.join("\n") : "PASS"); process.exit(fails.length ? 1 : 0);
}
const root = path.resolve(a0 || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2";
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href), V = await import(pathToFileURL(path.join(root, "lib/vehicle.js")).href);
const pool = (n, tx) => Array.from({ length: n }, (_, i) => ({ id: "p" + i, _usd: 40000 + i * 700, auction_end_date: "2026-0" + (1 + (i % 9)) + "-12", year: 1986, rtitle: "x", transmission: tx ? tx(i) : "Manual", mileage: 50000 + i, vin_norm: "WP0AB0911GS1" + String(1000 + i) }));
const opt = (dim, label, value, n, x) => ({ dimension: dim, label, value, n, low: 50000, high: 80000, rangeFloor: false, ownWindow: false, windowWords: "since November 2025", ...(x || {}) });
const SHAPES = [
  ["1986 Porsche 911 Carrera (Cabriolet reaches back to February 2025)", { poolN: 35, optionsState: "alike", headlineDimension: "body", cluster: [50000, 90000], windowWords: "since November 2025", options: [opt("body", "Coupe", "coupe", 16), opt("body", "Targa", "targa", 8), opt("body", "Cabriolet", "cabriolet", 14, { windowWords: "since February 2025", ownWindow: true })] }],
  ["2004 BMW M3 (Manual 33, SMG 3, 13 name no gearbox, 49)", { poolN: 49, optionsState: "split", headlineDimension: "gearbox", thinReason: "pooled_apart", headlineLines: ["a", "b"], windowWords: "since October 2025", options: [opt("gearbox", "Manual", "manual", 33), opt("gearbox", "SMG", "auto", 3, { rangeFloor: true, low: null, high: null })] }],
  ["1995 Porsche 911 (gearbox, 43)", { poolN: 43, optionsState: "alike", headlineDimension: "gearbox", cluster: [50000, 90000], windowWords: "since October 2025", options: [opt("gearbox", "Manual", "manual", 25), opt("gearbox", "Tiptronic", "auto", 18)] }],
  ["2002 Firebird (Manual 8 + Automatic 8 against 15, recounted)", { poolN: 15, optionsState: "alike", headlineDimension: "gearbox", cluster: [20000, 36000], windowWords: "since June 2025", options: [opt("gearbox", "Manual", "manual", 8), opt("gearbox", "Automatic", "auto", 8)] }]
];
const wordN = s => { const W = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }; const m = /(\d[\d,]*|one|two|three|four|five|six|seven|eight|nine|ten)\s+comparable/i.exec(String(s || "")); return m ? (W[m[1].toLowerCase()] || Number(m[1].replace(/,/g, ""))) : null; };
for (const [name, base] of SHAPES) {
  const a = { tier: "result", rawPool: pool(base.poolN, i => (i % 3 ? "Manual" : "Automatic")), freshness: { through: "2026-10-20" }, resolvedCar: { year: 1986, canonicalLabel: "1986 Porsche 911 Carrera" }, ...base };
  const d = E.withReadFields(a, "x", { year: 1986 }), opts = d.options || [], total = Number(d.poolN), sum = opts.reduce((t, o) => t + (Number(o.n) || 0), 0), rem = d.optionsRemainder ? Number(d.optionsRemainder.n) : 0;
  const reach = opts.some(o => o.windowDiffers || o.windowCapped), onWindow = opts.filter(o => !o.windowDiffers && !o.windowCapped).reduce((t, o) => t + (Number(o.n) || 0), 0);
  ok(`${name}: no option on the answer's window counts more than the total`, onWindow <= total, `${onWindow} of ${total}`);
  ok(`${name}: options plus the remainder equal the total, unless an option reaches past the window`, reach || sum + rem === total || sum === total, `options ${sum} + remainder ${rem} against ${total}`);
  const capN = wordN(d.salesHeading);
  ok(`${name}: the sales table's heading prints no total that differs from the options (plus remainder)`, capN === null || (!reach && (capN === sum + rem || capN === total) && capN === total), `${JSON.stringify(d.salesHeading)} against options ${sum} + remainder ${rem}`);
  ok(`${name}: an option that reaches past the window means a heading with no count`, !reach || capN === null, JSON.stringify(d.salesHeading));
}
// the failure the live page showed, built by hand: options print 38, the heading says 35
{ const bad = { poolN: 35, salesHeading: "All 35 comparable sales", options: [{ n: 16 }, { n: 11 }, { n: 11, windowDiffers: true }] }, sum = bad.options.reduce((t, o) => t + o.n, 0), reach = bad.options.some(o => o.windowDiffers);
  ok("the check itself sees a heading total against an option sum of 38 when an option reaches back", reach && wordN(bad.salesHeading) !== null && sum !== wordN(bad.salesHeading)); }
// Which model lists: no chip cut at a space (the live fault: "El" for El Camino)
{ const rep = (m, f, n) => Array.from({ length: n }, () => ({ model: m, model_family: f }));
  const r = V.buildAskModels([{ name: "Camaro", yearRanges: null }, { name: "El Camino", yearRanges: null }, { name: "Corvette", yearRanges: null }], [...rep("Camaro", "Camaro", 40), ...rep("El Camino", "El", 25), ...rep("Corvette", "Corvette", 30)], "Chevrolet", 1969), f = V.askChipFaults(r.models.map(m => m.model), ["Camaro", "El Camino", "Corvette"], "Chevrolet");
  ok("a Which model list has no chip cut at a space", f.cut.length === 0, JSON.stringify(r.models.map(m => m.model))); }
console.log(fail ? `countsCheck: ${fail} failure(s)` : "countsCheck: all pass");
process.exit(fail ? 1 : 0);
