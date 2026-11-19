// VIN DECODE TRIM CHECK (Lane B, Nov 11 2026). VIN WP0AF2A92GS187171 is a 2016 Porsche 911 GT3 RS; vPIC decodes it as Trim "RS", lib/vehicle.js passed "RS" on, the resolver could not hold it and Market Check read a plain 2016 911 coupe ($63,000 to $85,500, 9 sales; the GT3 RS reads $194,000 to $248,000, 19 sales).
// CAUSE: vPIC's trim field is a fragment ("RS"), equipment ("Stingray 3LZ w/Z06", "Premium 2LZ w/Z06", "Preferred 2LT"), the body ("Shelby Coupe" for a GT350, a GT350R and a GT500 alike), a garble ("E63 AMG-S" read "E63 E") or blank (a 2006 Z06), and the decode handed whatever it held on.
// CLASS: scripts/fixtures/vinDecodeTrims.json holds 36 rows (35 VINs from the live pool (Porsche, Corvette Z06/ZR1/Grand Sport, Shelby, BMW M, Mercedes-AMG) with vPIC's row as fetched and the trim the car's own title names; each goes through the REAL decode and the REAL resolver
// (resolveVehicle with a VIN) and the trim that stands in the title and the pool choice must be the title's, or none where the VIN honestly does not say (a list of variants, two trims sharing one code). The car never loses its make and model.
// Offline: fetch is stubbed (vPIC rows are the fixture). `node scripts/vinDecodeTrimCheck.mjs [repo root]` (run against origin/main it fails); `--mutants` breaks one rule at a time.
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { spawnSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const args = process.argv.slice(2), here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(args.find(a => !a.startsWith("--")) || path.join(here, ".."));
if (args.includes("--mutants")) process.exit(mutants());
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2";
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) pass++; else { fail++; console.log("FAIL " + n + (d !== undefined ? " " + JSON.stringify(d) : "")); } };
const FIX = JSON.parse(fs.readFileSync(path.join(here, "fixtures/vinDecodeTrims.json"), "utf8")).rows, BY = Object.fromEntries(FIX.map(r => [r.vin, r.vpic]));
globalThis.fetch = async (url) => { const m = /DecodeVinValues\/([A-Z0-9]+)/.exec(String(url)); return new Response(m ? JSON.stringify({ Results: [BY[m[1]] || {}] }) : "[]", { status: 200 }); };
const V = await import(pathToFileURL(path.join(root, "lib/vehicle.js")).href);
const norm = s => s == null ? null : String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() || null;
for (const r of FIX) {
  const res = await V.resolveVehicle(r.vin, { vinConfirm: true }).catch(e => ({ err: String(e) })), v = (res && res.vehicle) || {};
  ok(`${r.vin} ${r.title.slice(0, 48)}: the trim that stands is ${r.expectTrim === null ? "none" : '"' + r.expectTrim + '"'} (${r.note.slice(0, 70)})`, norm(v.trim) === norm(r.expectTrim), [v.trim, v.canonicalLabel]);
  ok(`${r.vin}: the car keeps its make and model (${v.canonicalLabel})`, !!v.make && !!v.model && new RegExp(String(v.make).split(/[ -]/)[0], "i").test(String(v.canonicalLabel || "")), v.canonicalLabel);
  if (r.expectTrim) ok(`${r.vin}: the trim is in the car's name, the title and the pool choice read it (${v.canonicalLabel})`, norm(v.canonicalLabel).includes(norm(r.expectTrim)), v.canonicalLabel);
}
// the other decode path (Desk, partner page, /vin): vpicFacts reads the same rule
for (const vin of ["WP0AF2A92GS187171", "1G1YT2D65F5601347", "1FA6P8JZ6G5521499"]) { const f = V.vpicFacts(BY[vin], vin); const want = FIX.find(r => r.vin === vin).expectTrim; ok(`vpicFacts ${vin}: trim ${want}`, f.readable && f.trim === want, f.trim); }
console.log(`vinDecodeTrimCheck: ${fail ? fail + " FAIL" : "all pass"} (${pass})`); process.exit(fail ? 1 : 0);

function mutants() {
  const M = [
    ["lib/vinDecodeTrim.js", 'if (code) return { trim: code.trim, via: "vin_code" };', "", "WP0AF2A92GS187171"],
    ["lib/vinDecodeTrim.js", 'if (word) return { trim: word, via: "trim_word" };', "", "Z06"],
    ["lib/vinDecodeTrim.js", 'if (entry && entry.dropFragments && entry.dropFragments.includes(norm(cleaned))) return { trim: null, via: "fragment" };', "", "a bare RS on a 911"],
    ["lib/vinDecodeTrim.js", 'if (entry && entry.equipment) {', "if (false) {", "Preferred 2LT"],
    ["lib/vinDecodeTrim.js", 'const bare = !t || (entry.dropFragments || []).includes(norm(t));', "const bare = !t;", "the car keeps its make and model"],
    ["lib/vinDecodeTrim.js", 'd.make === "Mercedes-Benz" && d.model === "E-Class"', "false", "E63"],
    ["lib/vinDecodeTrim.js", '{ make: "Chevrolet", model: "Corvette", vin: /^1G1YY26E/', '{ make: "Chevrolet", model: "Corvette", vin: /^1G1YYXXX/', "2006 Z06"],
    ["lib/vehicle.js", "const trim = decodeTrimFor({ vin, year, make, model, raw: r.Trim, cleaned: cleanVinTrim(r.Trim) || null }).trim;", "const trim = cleanVinTrim(r.Trim) || null;", "vpicFacts"],
    ["lib/vehicle.js", "const trim = decodeTrimFor({ vin, year, make, model, raw: row.Trim, cleaned }).trim;", "const trim = cleaned;", "the trim that stands is"],
    ["lib/vinDecodeTrim.js", 'trim: "Shelby GT350", source', 'trim: "Shelby", source', "Shelby GT350"]
  ];
  let bad = 0;
  for (const [file, from, to, name] of M) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vdt-"));
    for (const d of ["lib", "api", "scripts", "public"]) fs.cpSync(path.join(root, d), path.join(tmp, d), { recursive: true, filter: s => !/node_modules/.test(s) });
    for (const f of ["vercel.json", "package.json"]) if (fs.existsSync(path.join(root, f))) fs.copyFileSync(path.join(root, f), path.join(tmp, f));
    fs.symlinkSync(path.join(root, "node_modules"), path.join(tmp, "node_modules"));
    const fp = path.join(tmp, file), src = fs.readFileSync(fp, "utf8");
    if (!src.includes(from)) { console.log("MUTANT BROKEN (text not found): " + name + " :: " + from.slice(0, 60)); bad++; continue; }
    fs.writeFileSync(fp, src.replace(from, to));
    const r = spawnSync("node", [path.join(tmp, "scripts/vinDecodeTrimCheck.mjs"), tmp], { encoding: "utf8", timeout: 120000 }), out = (r.stdout || "") + (r.stderr || "");
    const named = out.split("\n").some(l => l.startsWith("FAIL") && l.includes(name));
    if (!(r.status !== 0 && named)) { console.log(`MUTANT SURVIVED: ${name} (${file}): ${out.split("\n").filter(l => l.startsWith("FAIL")).length} fails`); bad++; }
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`vinDecodeTrimCheck mutants: ${M.length - bad} of ${M.length} killed${bad ? `, ${bad} SURVIVED` : ""}`);
  return bad ? 1 : 0;
}
