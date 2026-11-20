// clock: real-ok the fixture sales are dated relative to now (days ago); no calendar date is asserted
// A FILLER MILEAGE IS NO MILEAGE, IN THE ENGINE (Lane B, lane-b-sale-name, Nov 20 2026; order bc85, Lane D's note "FOR LANE B, TOMORROW'S BUMP"). CAUSE: lib/onebox.js took any number a person typed (999,999) or an archive sale carried (a dealer's filler) for an odometer: the typed one
// chose the highest mileage band and read that band's few sales alone (the Greenland 1965 Mustang: a spread refusal where the 1965 Mustangs printed a range); the archive one sat in a band it was never in. FIX: every reader of a mileage in the file goes through lib/placeholderMiles.js statedMiles,
// one rule: withTypedMileage, miOf, mileageNearOf, findAnswerOf, matchedOptionOf, nearBandOf, mileageBasisOf, the subject mileage, the exact sale's mileage, the card's mileage.
// CLASS: every filler the rule names (0, 1, 99,999, 111,111, 12,345, 123,456, 999,999, 1,000,000, 9,999,999) typed AND on an archive sale; a stated mileage is untouched. THE ENGINE'S REAL OUTPUT: a typed 999,999 answers exactly as no typed mileage does (same range, same pool, no band, no mileage line);
// a pool sale carrying 999,999 reads as no mileage and is in no band.   node scripts/placeholderMilesEngineCheck.mjs [repo root]   --mutants (each must fail)
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { spawnSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const args = process.argv.slice(2), here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(args.find(a => !a.startsWith("--")) || path.join(here, ".."));
if (args.includes("--mutants")) process.exit(mutants());
process.chdir(ROOT);
process.env.SUPABASE_URL = "https://fake.example"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2";
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const WLD = await import(pathToFileURL(path.join(here, "_deskOlderWorld.mjs")).href), OB = await imp("lib/onebox.js");
let pass = 0, fail = 0; const fails = []; const ok = (n, c, d) => { if (c) pass++; else { fail++; fails.push(n + (d !== undefined ? " " + JSON.stringify(d).slice(0, 300) : "")); } };
console.error = () => {};
const w = WLD.install(ROOT), DAY = 864e5; let seq = 0;
const FILLERS = [0, 1, 99999, 111111, 12345, 123456, 999999, 1000000, 9999999];
// 24 Mustang sales of 1966, 41,000 to 88,000 miles; `fillerOn` of them carry the filler instead of a mileage
const world = (fillerOn, filler) => { const rows = [];
  for (let i = 0; i < 24; i++) { const id = "pm" + (seq++), miles = i < fillerOn ? String(filler) : String(41000 + i * 2000), title = "1966 Ford Mustang";
    const raw = { id, title, featured_image_url: "https://img.example/" + id + ".jpg", mileage: miles, body_style: "Coupe", modifications: null, currency: "USD", transmission: "Manual (4-Speed)", exterior_color: "Red", title_status: "Clean", url: "https://bat.example/" + id, source_url: "https://src.example/" + id, city: "Austin", state: "TX", country_code: "US", auction_end_precision: "day" };
    rows.push({ id, source_id: id, sale_price: 30000 + i * 700, sale_date: new Date(Date.now() - (30 + i * 9) * DAY).toISOString().slice(0, 10), platform: i % 3 === 0 ? "Cars & Bids" : "Bring a Trailer", listing_title: title, year: 1966, make: "Ford", model: "Mustang", vin_norm: null, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: false, raw_record: raw, vehicle_type: "car" }); }
  return rows; };
const install = rows => { w.DATA.clear(); w.DATA.set("Mustang", rows); };
const read = async (vehicle, text) => { w.deps.resolveVehicle = async () => ({ status: "valid", vehicle: { ...vehicle } }); return (await OB.oneEngineAnswer({ ...vehicle }, null, text, { ...w.env }, OB.withTypedMileage({ ...vehicle }, null))).raw; };
const base = { year: 1966, make: "Ford", model: "Mustang" };
const DROP = new Set(["readAt", "dedup", "shape", "latencyMs", "timings"]), strip = x => JSON.stringify(x, (k, v) => DROP.has(k) ? undefined : v);
// 1. a typed filler on Market Check reads as no mileage: the answer IS the answer with no mileage typed
install(world(0, 0));
const none = await read(base, "1966 Ford Mustang");
ok("the world answers with a range and no band (the control)", none.tier === "result" && Array.isArray(none.cluster) && !none.mileageBand && !(none.queryMileage > 0), { tier: none.tier, band: none.mileageBand, q: none.queryMileage });
for (const f of FILLERS) {
  const a = await read({ ...base, mileage: f }, `1966 Ford Mustang ${f.toLocaleString("en-US")} miles`);
  ok(`a typed ${f.toLocaleString("en-US")} reads as no mileage: same range, same pool, no band, the line of no mileage`, a.tier === none.tier && JSON.stringify(a.cluster) === JSON.stringify(none.cluster) && a.poolN === none.poolN && !a.mileageBand && !(a.queryMileage > 0) && a.mileageLine === none.mileageLine, { line: a.mileageLine, cluster: a.cluster, poolN: a.poolN, band: a.mileageBand && a.mileageBand.target, q: a.queryMileage });
}
const real = await read({ ...base, mileage: 41500 }, "1966 Ford Mustang 41,500 miles");
ok("a stated 41,500 is still a mileage (the rule keeps real odometers)", real.mileageBand && Number(real.mileageBand.target) === 41500 || Number(real.queryMileage) === 41500, { band: real.mileageBand, q: real.queryMileage });
// 2. an archive sale carrying a filler reads as no mileage (a card's mi, the sales' mileage line) and sits in no band
for (const f of FILLERS) {
  install(world(4, f)); const a = await read(base, "1966 Ford Mustang"), all = [...(a.cards || []), ...(a.setAsideRows || [])];
  const atFiller = all.filter(c => Number(c.mi) === Number(f) && Number(f) > 1);
  ok(`an archive sale carrying ${f.toLocaleString("en-US")} reads as no mileage: no card prints it`, a.tier === "result" && all.length > 0 && atFiller.length === 0 && all.every(c => !(Number(c.mi) > 500000)), { mis: [...new Set(all.map(c => c.mi))].slice(0, 6) });
}
install(world(4, 999999)); { const a = await read(base, "1966 Ford Mustang"), withMi = (a.cards || []).filter(c => Number(c.mi) > 0), without = (a.cards || []).filter(c => !(Number(c.mi) > 0));
  ok("the sales carrying 999,999 are cards with no mileage (not 999,999, not zero miles)", without.length >= 1 && withMi.every(c => Number(c.mi) >= 41000 && Number(c.mi) < 100000), { without: without.length, withMi: withMi.length }); }
// 3. the readers on their own (one rule)
ok("mileageNearOf of a filler is nothing", OB.mileageNearOf([{ m: 50000, p: 30000 }], 999999, 30000) === null);
ok("nearBandOf of a filler is nothing", OB.nearBandOf({ rawPool: [], tier: "result" }, 999999) === null);
ok("mileageBasisOf: a filler query mileage and a filler live hint state no mileage", OB.mileageBasisOf({ tier: "result", queryMileage: 999999 }, { live: 999999, record: 123456 }) === null);
ok("mileageBasisOf: a stated live mileage still reads", !!OB.mileageBasisOf({ tier: "result" }, { live: 41500 }));
ok("findAnswerOf: a filler ctx.miles is dropped", (() => { try { return OB.findAnswerOf({ tier: "result", rawPool: [] }, { miles: 999999 }) !== undefined; } catch { return false; } })());
console.log(`placeholderMilesEngineCheck: ${pass} pass, ${fail} FAIL` + (fail ? "\n" + fails.map(f => "  FAIL " + f).join("\n") : ""));
process.exit(fail ? 1 : 0);

function mutants() {
  const R = path.resolve(here, ".."), me = fileURLToPath(import.meta.url);
  const M = [
    ["typed: withTypedMileage takes the number as typed", "lib/onebox.js", s => s.replace("const mi = statedMiles(vehicle && vehicle.mileage) || 0;", "const mi = Number(vehicle && vehicle.mileage);")],
    ["archive: miOf takes the number as stored", "lib/onebox.js", s => s.replace('const miOf = r => statedMiles(String(r.mileage == null ? "" : r.mileage).replace(/[^\\d]/g, "")) || 0;', 'const miOf = r => Number(String(r.mileage == null ? "" : r.mileage).replace(/[^\\d]/g, "")) || 0;')],
    ["subject: the subject mileage is the typed number", "lib/onebox.js", s => s.replace("const subject = { mileage: statedMiles(vehicle.mileage) };", "const subject = { mileage: vehicle.mileage };")],
    ["near: mileageNearOf takes a filler", "lib/onebox.js", s => s.replace("  miles = statedMiles(miles);\n", "")],
    ["band: nearBandOf takes a filler", "lib/onebox.js", s => s.replace("const m = statedMiles(miles) || 0; if (!(m > 0) || !(d &&", "const m = Number(miles); if (!(m > 0) || !(d &&")],
    ["basis: mileageBasisOf states a filler query mileage", "lib/onebox.js", s => s.replace("const typed = band ? statedMiles(band.target) : statedMiles(d.queryMileage);", "const typed = band ? Number(band.target) : (Number(d.queryMileage) > 0 ? Number(d.queryMileage) : null);")],
    ["card: the sale's card mileage takes the stored number", "lib/onebox.js", s => s.replace("const mileage = statedMiles(r.mileage);", "const mileage = Number(r.mileage) > 0 ? Number(r.mileage) : null;")],
    ["rule: the ceiling is gone (999,999 is a mileage)", "lib/placeholderMiles.js", s => s.replace("if (n > MAX_PLAUSIBLE_MILES) return true;", "")]
  ];
  let survived = 0;
  for (const [name, file, fn] of M) {
    const tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "pm-"));
    try {
      for (const d of ["lib", "api", "data", "package.json"]) spawnSync("cp", ["-R", path.join(R, d), tmp]);
      fs.mkdirSync(path.join(tmp, "scripts")); spawnSync("cp", ["-R", path.join(R, "scripts/fixtures"), path.join(tmp, "scripts/")]); spawnSync("cp", [path.join(R, "scripts/_deskOlderWorld.mjs"), path.join(tmp, "scripts/")]);
      fs.symlinkSync(path.join(R, "node_modules"), path.join(tmp, "node_modules"));
      const f = path.join(tmp, file), before = fs.readFileSync(f, "utf8"), after = fn(before); if (before === after) { console.log("SKIP (no change) " + name); survived++; continue; }
      fs.writeFileSync(f, after);
      const r = spawnSync(process.execPath, [me, tmp], { encoding: "utf8", timeout: 240000 }), killed = r.status !== 0; console.log((killed ? "killed   " : "SURVIVED ") + name); if (!killed) survived++;
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
  console.log(survived ? `${survived} mutant(s) survived` : "all mutants killed"); return survived ? 1 : 0;
}
