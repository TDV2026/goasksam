// Refine key parity (Lane B, Nov 5 2026, job lane-b-onevenue stack). THE CLASS: the cache key an answer is stored under (specKeyFor, warmAnswerKeyFor) decides which stored row a refine reads. A branch that changes how any refine shape keys
// silently serves, or misses, every stored answer of that shape; the stack's old base did exactly that for a mileage-band-only refine and "refine key isolation" went red unnoticed. This pins the keys of 4 cars x 16 refine shapes (every field
// the engine reads: body, trim, variant, tx, mileage band, miTarget, year, driver, docHistory, observe, notTrims, attrsOff) in scripts/refineKeys.golden.json, written from main on Nov 5 2026.
// A change that moves a key must be deliberate: regenerate the file (node scripts/refineKeyParityCheck.mjs --write) AND say so in the report; every stored row of the moved shapes then reads as no row.
//   node scripts/refineKeyParityCheck.mjs          (LIB_ROOT=<dir holding lib/> runs it against another tree to show it fails)
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const HERE = path.dirname(new URL(import.meta.url).pathname), ROOT = process.env.LIB_ROOT ? path.resolve(process.env.LIB_ROOT) : path.resolve(HERE, "..");
const { specKeyFor, warmAnswerKeyFor } = await import(pathToFileURL(path.join(ROOT, "lib/live/search.js")).href);
const cars = { p997: [{ make: "Porsche", model: "911", trim: "", year: 2005, bodyStyle: null }, { code: "997" }], mus65: [{ make: "Ford", model: "Mustang", trim: "", year: 1965, bodyStyle: null }, { code: "first" }], pk34: [{ make: "Packard", model: "Twelve", trim: "", year: 1934, bodyStyle: null }, null], bare: [{ make: "Chevrolet", model: "Corvette", trim: "Z06", year: null, bodyStyle: "coupe" }, null] };
const refines = { plain: null, empty: {}, body: { body: "coupe" }, trim: { trim: "carrera-s" }, variant: { variant: "carrera" }, tx: { tx: "manual" }, bodyTx: { tx: "manual", body: "coupe" }, miMin: { miMin: 20000 }, miBand: { miMin: 20000, miMax: 50000 }, miTarget: { miTarget: 40000, miBand: 15000 }, year: { year: 2006 }, driver: { driver: "mileage" }, docHistory: { docHistory: "yes" }, observe: { observe: "x" }, notTrims: { notTrims: ["base"] }, attrsOff: { attrsOff: ["x"] } };
const now = {};
for (const [cn, [v, g]] of Object.entries(cars)) for (const [rn, r] of Object.entries(refines)) { try { now[`${cn}/${rn}`] = [specKeyFor(v, g, r), warmAnswerKeyFor(v, g, r)]; } catch (e) { now[`${cn}/${rn}`] = "ERR " + e.message.slice(0, 40); } }
const GOLD = path.join(HERE, "refineKeys.golden.json");
if (process.argv.includes("--write")) { fs.writeFileSync(GOLD, JSON.stringify(now, null, 1) + "\n"); console.log("written", Object.keys(now).length); process.exit(0); }
const gold = JSON.parse(fs.readFileSync(GOLD, "utf8"));
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const moved = Object.keys(gold).filter(k => JSON.stringify(gold[k]) !== JSON.stringify(now[k]));
ok(`every one of the ${Object.keys(gold).length} pinned refine keys is unchanged`, moved.length === 0, moved.slice(0, 6).join(", "));
const shapes = Object.keys(refines).filter(r => r !== "empty");
for (const cn of Object.keys(cars)) { const ks = shapes.map(r => JSON.stringify(now[`${cn}/${r}`])); ok(`${cn}: every refine shape keys its own row (${shapes.length} distinct keys, plain and empty alike)`, new Set(ks).size === ks.length && JSON.stringify(now[`${cn}/plain`]) === JSON.stringify(now[`${cn}/empty`])); }
console.log(failed ? `\n${failed} FAILED` : "\nrefineKeyParityCheck: all pass"); process.exit(failed ? 1 : 0);
