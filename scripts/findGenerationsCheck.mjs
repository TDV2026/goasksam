// clock: real-ok the live rows end relative to the real now in this process; no calendar date is asserted
// EVERY GENERATION CODE FINDS ITS CARS AND PRINTS ONCE (Lane B, Nov 11 2026). Side finding of the Find voice job: a Find search for a BMW 3 Series with generation "E30" returned nothing and the page read "E30 E30 convertibles",
// while the same car searched by years was found. CAUSE: the resolver (lib/bareModel.js bareModelStep) reads "3 Series E30" as the model plus a leftover word, and the leftover word became a TITLE FENCE (v.trimFence = "E30"): every listing had to print
// "E30" in its title, but a live 325i is titled "1988 BMW 325i Convertible", dated into the E30 years by the generation table, never by its title. The same word, held as a trim beside the generation code, is printed twice by nounFor ("E30 E30").
// CLASS: any generation code of the curated table (lib/generations.js, 246 rows: E30, E36, 964, 993, 996, W113, C2, C3, Mk1, 100 Series, ...) is the generation, never a trim word and never a title fence. This check takes EVERY row of that table:
// a live car of its make and model dated in the middle of its years and titled WITHOUT the code, one dated in the generation before and one in the generation after; the search for the code (as stored and as typed in capitals) finds the dated car,
// never the others, and the search line, the empty line and the chips print the code once.
//   node scripts/findGenerationsCheck.mjs [repo root]   (a tree without the fix fails: run it against origin/main); --mutants breaks one rule at a time.
import fs from "node:fs"; import path from "node:path"; import { spawnSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const args = process.argv.slice(2), here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(args.find(a => !a.startsWith("--")) || path.join(here, ".."));
if (args.includes("--mutants")) process.exit(mutants());
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2"; process.env.OLDCARSDATA_API_KEY = "unused"; process.env.ANTHROPIC_API_KEY = "unused";
const imp = f => import(pathToFileURL(path.join(root, f)).href);
const { CURATED_GENERATIONS } = await imp("lib/generations.js"), sc = await imp("lib/live/samChat.js");
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
let pass = 0, fail = 0; const fails = []; const ok = (n, c, d) => { if (c) pass++; else { fail++; fails.push(n + (d !== undefined ? " " + JSON.stringify(d) : "")); } };
const NOW = Date.now(); let ROWS = [];
globalThis.fetch = async (url) => { const u = String(url); if (/api\.anthropic\.com/.test(u)) return new Response("{}", { status: 500 }); return new Response(JSON.stringify(/\/rest\/v1\/live_listings/.test(u) ? ROWS : []), { status: 200 }); };
const row = (i, g, year) => ({ id: 900 + i, source: "bringatrailer", source_listing_id: "g" + i, url: "https://auction.test/g/" + i, listing_title: `${year} ${g.make} ${String(g.model).replace(/-/g, " ")}${/\s/.test(String(g.code)) ? " " + String(g.code).replace(/\b\d{4}-\d{4}\b/, "").trim() : ""}`, make: g.make, model: g.model, year, vin_norm: null, mileage: 40000, mileage_unit: "mi", body: "coupe", transmission: "Manual", location: "Austin, TX", country: "US", currency: "USD", current_bid: 30000, current_bid_usd: 30000, end_time: new Date(NOW + (2 + i) * 3600e3 * 9).toISOString(), photo_url: "https://img.test/g" + i + ".jpg", status: "live", exterior_color: "Red", description: "", bid_at: new Date(NOW - 3600e3).toISOString(), last_seen: new Date(NOW).toISOString(), first_seen: new Date(NOW - 2 * 864e5).toISOString() });
const once = (text, code) => { const re = new RegExp("(?:^|[^a-z0-9])" + String(code).toLowerCase().replace(/[^a-z0-9]/g, "[ -]?") + "(?=[^a-z0-9]|$)", "gi"); return (String(text).match(re) || []).length; };
// a generation code that is also a model word of the same car ("996" for the 996, "100-series") is the car's own name: the noun may say it as the model once
const t0 = Date.now(); let cases = 0;
for (const g of CURATED_GENERATIONS) {
  if (!g.yearStart || !g.yearEnd || g.yearEnd - g.yearStart < 1) continue;
  const mid = Math.floor((g.yearStart + g.yearEnd) / 2), before = g.yearStart - 12, after = g.yearEnd + 12;
  ROWS = [row(1, g, mid), row(2, g, before), row(3, g, after)];
  for (const [form, code] of [["stored", g.code], ["capitals", String(g.code).toUpperCase()]]) {
    const p = { make: g.make, model: String(g.model).replace(/-/g, " "), generation: code };
    let r; try { r = await sc.runFilters(env, p, { lastUser: `${g.make} ${p.model} ${code}` }); } catch (e) { r = { err: String(e.message) }; }
    const tag = `${g.make} ${g.model} ${g.code} (${form}, ${mid})`; cases++;
    const ids = (r.cards || []).map(c => c.id || (c.listing && c.listing.id) || c.listing_id).filter(x => x != null);
    ok(`finds its live car: ${tag}`, (r.cards || []).length >= 1 && !(r.err), { cards: (r.cards || []).length, line: r.reply, err: r.err });
    ok(`only its own years: ${tag}`, (r.cards || []).length <= 1, { cards: (r.cards || []).length });
    const said = [r.reply, r.searchNote, r.meta && r.meta.note].filter(Boolean).join(" | ");
    const modelHasCode = new RegExp("(?:^|[^a-z0-9])" + String(g.code).toLowerCase().replace(/[^a-z0-9]/g, "[ -]?") + "(?:[^a-z0-9]|$)", "i").test(String(g.model));
    ok(`prints the generation once: ${tag}`, once(r.reply || "", g.code) <= (modelHasCode ? 2 : 1), { line: r.reply });
  }
}
// THE SHARED RESOLVER (Market Check, Sell, Tasks and Find all read it): the car named with its generation code never comes back with the code as a TITLE FENCE (a word every listing must print). Its trim slot is the resolver's own convention
// for a generation (One Box clears it, lib/onebox.js buildSpec), so only the fence is asserted here.
{ const { resolveVehicle } = await imp("lib/vehicle.js"); let n = 0; const sq = x => String(x || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const g of CURATED_GENERATIONS) {
    if (!g.yearStart || !g.yearEnd || /\s/.test(String(g.code))) continue;
    const model = String(g.model).replace(/-/g, " "), r = await Promise.race([resolveVehicle(`${g.make} ${model} ${g.code}`, {}).catch(() => ({})), new Promise(res => setTimeout(() => res({}), 4000))]); n++;
    const v = (r && r.vehicle) || {};
    ok(`resolver: ${g.make} ${model} ${g.code} holds no title fence on its own code`, sq(v.trimFence) !== sq(g.code), { fence: v.trimFence });
  }
  console.log(`findGenerationsCheck: ${n} resolver reads`); }
console.log(`findGenerationsCheck: ${cases} searches over ${CURATED_GENERATIONS.length} generation rows in ${Math.round((Date.now() - t0) / 1000)}s`);
for (const f of fails.slice(0, +(process.env.SHOW || 40))) console.log("FAIL " + f);
if (fails.length > 40) console.log(`... and ${fails.length - 40} more`);
console.log(`findGenerationsCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

function mutants() {
  const me = fileURLToPath(import.meta.url), R = path.resolve(args.find(a => !a.startsWith("--")) || path.join(path.dirname(me), ".."));
  const M = [
    ["the search never turns a code-trim into the generation", "lib/live/search.js", s => s.replace("  v = codeNotTrim(v, f.gens);\n  if (!v || !v.make) return { rows: [], facets: {} };", "  if (!v || !v.make) return { rows: [], facets: {} };")],
    ["the noun prints the code as a trim too", "lib/live/search.js", s => s.replace("  v = codeNotTrim(v, f && f.gens);", "")],
    ["a leftover code word stays a title fence", "lib/bareModel.js", s => s.replace("if (genRow) { car.genCode", "if (false && genRow) { car.genCode")],
    ["a multi-word code is not named", "lib/live/search.js", s => s.replace("(/[^a-z0-9]/i.test(String(g.code)) && squash(g.code).length >= 5 && whole.includes(squash(g.code)))", "false")],
    ["a generation word stays in the car's name", "lib/live/samChat.js", s => s.replace("const genWord = p.generation && !/\\d/.test(String(p.generation)) && v0GenWord(p) ? \"\" : p.generation;", "const genWord = p.generation;")],
    ["a model named like a year is read as the year", "lib/live/samChat.js", s => s.replace("if (modelIsYear) {", "if (false && modelIsYear) {")],
    ["the phrase guard drops a curated code", "lib/genPhrase.js", s => s.replace("} else if (q.generation && generationRows(p.make, p.model).some(r => squash(r.code) === squash(q.generation))) {", "} else if (false) {")],
    ["a listing is placed by the resolved model only", "lib/live/search.js", s => s.replace("|| (r.model && squash(r.model) !== squash(parent) ? genFor(v.make, r.model, r.year, title) : null))", ")")],
    ["a code word of a code with a hyphen stays a fence", "lib/genCodeTrim.js", s => s.replace("if ((gens || []).some(", "if (false && (gens || []).some(")],
    ["a trim carrying the code beside its own words stays whole", "lib/genCodeTrim.js", s => s.replace("if (tw.length < 2) return v;", "return v;")]
  ];
  let survived = 0;
  for (const [name, file, fn] of M) {
    const tmp = fs.mkdtempSync(path.join(fs.realpathSync("/tmp"), "fg-")); try {
      spawnSync("cp", ["-R", ...fs.readdirSync(R).filter(x => x !== "node_modules" && x !== ".git").map(x => path.join(R, x)), tmp]); fs.symlinkSync(path.join(R, "node_modules"), path.join(tmp, "node_modules"));
      const f = path.join(tmp, file), before = fs.readFileSync(f, "utf8"), after = fn(before); if (before === after) { console.log("SKIP (no change) " + name); survived++; continue; }
      fs.writeFileSync(f, after);
      const r = spawnSync(process.execPath, [me, tmp], { encoding: "utf8" }), killed = r.status !== 0; console.log((killed ? "killed   " : "SURVIVED ") + name); if (!killed) survived++;
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
  console.log(survived ? `${survived} mutant(s) survived` : "all mutants killed"); return survived ? 1 : 0;
}
