// A STORED BODY IS TRUSTED ONLY FOR A BODY THE MODEL CAME IN (Lane B, Nov 6 2026; Sam's call after lane-b-pills). A Cars & Bids 2023 Subaru WRX, a WRX STI and a Lancer Evolution VIII carried body "Convertible"; their titles
// name no body, so the engine took the field and the cars answered a convertible search and printed a convertible pill. The class: any consumer of the stored body (Find/Tasks/emails through listingFacts, the Market Check link,
// One Box's classifyBody, the exact-match flag) must cross-check it against the model's known bodies (lib/modelBodies.js: MODEL_RULES + bodiesForYear, then MODEL_BODY_FACTS). On a conflict the body is NOT STATED, never
// replaced by a guess; the listing's own title still wins; a model nothing is known about keeps its stored body. This check: the three cars, a sample for EVERY body value (a model that has it keeps it, a model that never had it
// loses it), title wins, no guess, the Find convertible search drops them, the Market Check link carries no body for them, classifyBody agrees.
//   node scripts/bodyTrustCheck.mjs [repo root]      --mutants proves each rule by breaking it in a copy
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { fileURLToPath, pathToFileURL } from "node:url"; import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), rootArg = args.find(a => !a.startsWith("--"));
const root = path.resolve(rootArg || path.join(here, ".."));
if (args.includes("--mutants")) {
  const muts = [
    ["lib/live/search.js", "if (body && !bodyFromTitle && storedBodyConflicts(body, r.make, r.model, r.year)) { body = null; bodyField = \"conflict\"; }", "", "listingFacts trusts a stored body the model never came in"],
    ["lib/live/search.js", "const bodyFromTitle = !!body && BODY_RE[body].test(title);", "const bodyFromTitle = false;", "the title no longer wins over a conflicting field"],
    ["lib/modelBodies.js", "return !known.some(b => sameFamily(b, stored));", "return false;", "no body ever conflicts"],
    ["lib/modelBodies.js", "if (fromRule && fromRule.length) return fromRule;", "", "the curated MODEL_RULES bodies are not read"],
    ["lib/modelBodies.js", "for (const e of MODEL_BODY_FACTS) if (e.make === mk && e.models.some(n => mo.startsWith(squash(n)))) return e.bodies.slice();", "", "the model facts table is not read"],
    ["lib/modelBodies.js", "if (!known || !known.length) return false;", "if (!known || !known.length) return true;", "a model nothing is known about loses its stored body (a guess the other way)"],
    ["lib/modelBodies.js", "if (open.includes(a) && open.includes(b)) return true;", "", "an open body is not one family (a roadster is not a convertible)"],
    ["lib/onebox.js", "if (storedBodyConflicts(stored, row.make, row.model, row.year)) return null;", "", "One Box's classifyBody trusts the conflicting field"],
    ["lib/bodyAudit.js", "if (f.bodyField === \"conflict\") { conflicts++;", "if (f.bodyField === \"conflict\") { ", "the audit does not count a conflict"],
    ["lib/_flags.js", "!storedBodyConflicts(String(top.body_style || rr.body_style), top.make, top.model, top.year) ? ", "true ? ", "the exact-match flag trusts the conflicting field"]
  ];
  let survivors = 0;
  for (const [file, from, to, want] of muts) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bodytrust-"));
    spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", root + "/", dir + "/"]);
    fs.symlinkSync(path.join(root, "node_modules"), path.join(dir, "node_modules"));
    const fp = path.join(dir, file), src = fs.readFileSync(fp, "utf8"), m = src.replace(from, to);
    if (m === src) { console.log(`MUTANT NOT APPLIED  ${want}`); survivors++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
    fs.writeFileSync(fp, m);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/bodyTrustCheck.mjs"), dir], { encoding: "utf8" });
    const killed = r.status !== 0 && /^FAIL/m.test((r.stdout || "") + (r.stderr || ""));
    console.log(`${killed ? "killed  " : "SURVIVED"}  ${want}`); if (!killed) survivors++;
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(survivors ? `\n${survivors} mutant(s) survived` : "\nall mutants killed"); process.exit(survivors ? 1 : 0);
}
process.chdir(root);
process.env.LAUNCH_STAGE = "2"; process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
const imp = f => import(pathToFileURL(path.join(root, f)).href);
let pass = 0, fail = 0; const ok = (name, c, d) => { if (c) pass++; else fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${d ? "  " + d : ""}`); };
const S = await imp("lib/live/search.js"), MB = await imp("lib/modelBodies.js"), OB = await imp("lib/onebox.js"), MC = await imp("lib/mcLink.js"), SM = await imp("lib/live/samChat.js");
const NOW = Date.now(); let id = 0;
const row = (title, make, model, year, stored, o = {}) => ({ id: ++id, source: "carsandbids", url: "https://auction.test/" + id, photo_url: "https://img.test/" + id + ".jpg", listing_title: title, year, make, model, mileage: 30000, mileage_unit: "miles", transmission: "Manual", exterior_color: "Blue", body: stored, current_bid: 30000, current_bid_usd: 30000, currency: "USD", country: "US", location: "Austin, TX", status: "live", end_time: new Date(NOW + (5 + id) * 3600e3).toISOString(), description: "", vin_norm: "VIN" + String(id).padStart(8, "0"), ...o });
// ---- the three cars Sam named, as the source stored them
const WRX = row("2023 Subaru WRX Premium", "Subaru", "WRX", 2023, "Convertible"), STI = row("2006 Subaru Impreza WRX STI", "Subaru", "Impreza WRX STI", 2006, "Convertible"), EVO = row("2005 Mitsubishi Lancer Evolution VIII", "Mitsubishi", "Lancer Evolution", 2005, "Convertible");
for (const r of [WRX, STI, EVO]) {
  const f = S.listingFacts(r);
  ok(`${r.listing_title}: the stored Convertible is not a body (the model never came open)`, f.body === null && f.bodyField === "conflict", `${f.body} ${f.bodyField}`);
  ok(`${r.listing_title}: nothing is invented in its place`, f.body === null);
  ok(`${r.listing_title}: the Market Check link carries no body for it`, !/[?&]body=/.test(MC.mcUrlOf(r, f, { query: "x" }) || ""), MC.mcUrlOf(r, f, { query: "x" }));
  ok(`${r.listing_title}: One Box's classifyBody reads no body either`, OB.classifyBody({ ...r, rtitle: r.listing_title, body: r.body }, null) === null);
}
// ---- a sample for EVERY body value: a model that came in it keeps it; a model that never did loses it
// [body, a model that has it (kept), a model that never had it (dropped)]
const SAMPLES = [
  ["coupe", ["Porsche", "911", 1995], ["Honda", "S2000", 2002]], ["cabriolet", ["BMW", "M3", 2006], ["Subaru", "WRX", 2010]], ["convertible", ["Mazda", "MX-5 Miata", 1999], ["Subaru", "WRX", 2023]],
  ["targa", ["Porsche", "911", 1987], ["Subaru", "Impreza", 2001]], ["roadster", ["Honda", "S2000", 2002], ["Honda", "Civic", 1999]], ["spyder", ["Zagato", "Foo", 1990], ["Mitsubishi", "Lancer", 2004]],
  ["spider", ["Zagato", "Foo", 1990], ["Toyota", "Camry", 1999]], ["speedster", ["Zagato", "Foo", 1990], ["Toyota", "Corolla", 1999]], ["sedan", ["Honda", "Civic", 2000], ["Ferrari", "F40", 1990]],
  ["wagon", ["Subaru", "Outback", 2005], ["Honda", "S2000", 2002]], ["hatchback", ["Volkswagen", "GTI", 2008], ["Ferrari", "Enzo", 2003]], ["shooting brake", ["Zagato", "Foo", 1990], ["Honda", "S2000", 2002]],
  ["pickup", ["Ford", "F-150", 1999], ["Subaru", "WRX", 2012]], ["suv", ["Subaru", "Forester", 2010], ["Ferrari", "F40", 1990]]
];
for (const [b, [kmk, kmo, ky], [dmk, dmo, dy]] of SAMPLES) {
  const kept = S.listingFacts(row(`${ky} ${kmk} ${kmo}`, kmk, kmo, ky, b[0].toUpperCase() + b.slice(1))), dropped = S.listingFacts(row(`${dy} ${dmk} ${dmo}`, dmk, dmo, dy, b[0].toUpperCase() + b.slice(1)));
  ok(`${b}: a model that came in it keeps the stored body (${kmk} ${kmo})`, kept.body === b, `${kept.body} ${kept.bodyField}`);
  ok(`${b}: a model that never came in it loses the stored body (${dmk} ${dmo})`, dropped.body === null && dropped.bodyField === "conflict", `${dropped.body} ${dropped.bodyField}`);
}
// ---- the title wins over the field, even when the field conflicts; a model nothing is known about keeps its field
{
  const rs4 = S.listingFacts(row("Original-Owner 2008 Audi RS4 Cabriolet", "Audi", "RS4", 2008, "Sedan")), wrxTitle = S.listingFacts(row("2004 Subaru Impreza WRX Wagon", "Subaru", "Impreza WRX", 2004, "Convertible"));
  ok("the listing's own title wins over a stored body", rs4.body === "cabriolet" && rs4.bodyField === "title", `${rs4.body} ${rs4.bodyField}`);
  ok("a title that names a body beats a conflicting field on a model with no open body", wrxTitle.body === "wagon" && wrxTitle.bodyField === "title", `${wrxTitle.body} ${wrxTitle.bodyField}`);
  const unknown = S.listingFacts(row("1990 Zagato Foo", "Zagato", "Foo", 1990, "Convertible"));
  ok("a model nothing is known about keeps its stored body (never a guess either way)", unknown.body === "convertible" && unknown.bodyField === "field", `${unknown.body} ${unknown.bodyField}`);
  ok("the model facts and the curated rules agree on a car in both (an M3 convertible is real)", MB.storedBodyConflicts("convertible", "BMW", "M3", 2006) === false && MB.storedBodyConflicts("convertible", "Subaru", "WRX", 2023) === true);
}
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
// ---- the cases each source of truth needs on its own
{
  ok("the curated rules alone decide for a model the facts table does not hold (an F80 M3 was a sedan only)", MB.storedBodyConflicts("Convertible", "BMW", "M3", 2016) === true && MB.storedBodyConflicts("Sedan", "BMW", "M3", 2016) === false);
  ok("an open body in any of its words is one family (a Speedster stored on a roadster-only car is kept)", MB.storedBodyConflicts("speedster", "Honda", "S2000", 2002) === false && MB.storedBodyConflicts("drophead", "Honda", "S2000", 2002) === false);
  ok("a model the rules cover but not in that year keeps the stored body (nothing is known for the year)", MB.knownBodiesFor("BMW", "M3", 1950) === null || MB.knownBodiesFor("BMW", "M3", 1950).length > 0);
}
// ---- the exact-match flag (a VIN found in the archive) reads the same rule
{
  const FL = await imp("lib/_flags.js");
  const archive = (make, model, year, title, stored) => ({ id: 1, vin: "JF1GR89678L123456", make, model, year, platform: "carsandbids", sale_date: "2025-05-01", sale_price: 30000, mileage: 30000, listing_title: title, raw_record: { body_style: stored } });
  const was = globalThis.fetch;
  for (const [make, model, year, title, stored, want] of [["Subaru", "WRX", 2023, "2023 Subaru WRX Premium", "Convertible", null], ["BMW", "M3", 2006, "2006 BMW M3 6-Speed", "Convertible", "Convertible"]]) {
    globalThis.fetch = async u => new Response(/sales_archive/.test(String(u)) ? JSON.stringify([archive(make, model, year, title, stored)]) : "[]", { status: 200, headers: { "content-type": "application/json" } });
    const m = await FL.findVinArchiveMatch(env, { vin: "JF1GR89678L123456" }).catch(() => null);
    const bs = m && (m.bodyStyle !== undefined ? m.bodyStyle : (m.match && m.match.bodyStyle));
    ok(`the exact-match flag: ${make} ${model} stored ${stored} reads ${want === null ? "no body" : want}`, !!m && bs === want, JSON.stringify(m && Object.keys(m).slice(0, 8)) + " " + bs);
  }
  globalThis.fetch = was;
}
// ---- Find: a convertible search over a pool that holds the three bad cars and real convertibles
const POOL = [WRX, STI, EVO, row("2006 BMW M3 Convertible 6-Speed", "BMW", "M3", 2006, "Convertible"), row("1999 Mazda MX-5 Miata 5-Speed", "Mazda", "MX-5 Miata", 1999, "Convertible"), row("Original-Owner 2008 Audi RS4 Cabriolet", "Audi", "RS4", 2008, "Cabriolet"), row("2011 Porsche 911 Carrera Coupe", "Porsche", "911", 2011, "Coupe"), row("2004 Subaru Impreza WRX Wagon", "Subaru", "Impreza WRX", 2004, "Wagon")];
globalThis.fetch = async u => new Response(/live_listings/.test(String(u)) && !/id=in\.|id=eq\./.test(String(u)) ? JSON.stringify(POOL) : "[]", { status: 200, headers: { "content-type": "application/json", "content-range": `0-${POOL.length - 1}/${POOL.length}` } });
{
  const cv = await SM.runFilters(env, { body: "convertible", gearbox: "manual" }, {}), titles = cv.cards.map(c => c.r.listing_title);
  ok("a convertible search drops the three cars", !titles.some(t => /WRX Premium|WRX STI|Lancer Evolution/.test(t)), titles.join(" | "));
  ok("a convertible search keeps the real open cars (M3, Miata, RS4 Cabriolet)", ["M3 Convertible", "Miata", "RS4 Cabriolet"].every(w => titles.some(t => t.includes(w))), titles.join(" | "));
  ok("no card in the search prints a convertible body for a car the model never had", cv.cards.every(c => !/WRX|Evolution/.test(c.r.listing_title) || c.facts.body !== "convertible"));
  const all = await SM.runFilters(env, { body: "convertible", gearbox: "manual", include_unstated: true }, {}), still = all.cards.filter(c => /WRX Premium|WRX STI|Lancer Evolution/.test(c.r.listing_title));
  ok("asked to show cars that do not state a body, the three come back as not stated (never as convertibles)", still.every(c => c.facts.body === null && (c.unknown || []).includes("body")), still.map(c => c.facts.body).join(","));
}
// ---- the audit counts what the rule does (ops task=bodyaudit uses this one function)
{
  const { auditBodies } = await imp("lib/bodyAudit.js");
  const arch = [{ listing_title: "2023 Subaru WRX Premium", make: "Subaru", model: "WRX", year: 2023, body_style: "Convertible" }, { listing_title: "2005 Mitsubishi Lancer Evolution", make: "Mitsubishi", model: "Lancer Evolution", year: 2005, body_style: "Convertible" }, { listing_title: "2006 BMW M3", make: "BMW", model: "M3", year: 2006, body_style: "Convertible" }, { listing_title: "1990 Zagato Foo", make: "Zagato", model: "Foo", year: 1990, body_style: "Convertible" }, { listing_title: "2008 Audi RS4 Cabriolet", make: "Audi", model: "RS4", year: 2008, body_style: "Sedan" }, { listing_title: "2010 Plain Car", make: "Plain", model: "Car", year: 2010, body_style: null }];
  const a = auditBodies(arch);
  ok("the audit counts the rows whose stored body the model never had (2 of 6)", a.rows === 6 && a.conflicts === 2 && a.storedFieldOnly === 4 && a.titleStatesBody === 1 && a.noBodyAtAll === 1, JSON.stringify({ rows: a.rows, conflicts: a.conflicts, fieldOnly: a.storedFieldOnly, title: a.titleStatesBody, none: a.noBodyAtAll }));
  ok("the audit sweeps every stored body value and names the models with the most conflicts", a.byStoredBody.convertible && a.byStoredBody.convertible.conflicts === 2 && a.modelsWithMostConflicts.map(m => m.model).sort().join("|") === "Mitsubishi Lancer Evolution|Subaru WRX", JSON.stringify(a.modelsWithMostConflicts.map(m => m.model)));
  ok("the audit lists the open bodies stored on models nothing is known about (the next table entries)", a.openBodiesOnModelsWithNoKnownBodies.some(m => m.model === "Zagato Foo"), JSON.stringify(a.openBodiesOnModelsWithNoKnownBodies));
}
console.log(`\nbodyTrustCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
