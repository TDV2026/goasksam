// FIND PILLS FENCE THE POOL (Lane B, Nov 6 2026; a reader's two Find addresses). The class: a filter the page shows as a pill must narrow the cars, on EVERY path into the engine. Cause found: the search
// that names no make (searchAll, lib/live/converse.js) tested body, gearbox, colour, miles, price and year but never the title word (has), the venue, "ends within", a colour or a word left out or an engine layout;
// a body word the engine did not list (truck) was dropped without a trace, a colour it did not know was dropped, and a trim, generation or era with no car resolved was read by nothing. So
// ?body=truck&has=plug-in+hybrid drew a Ferrari 365 GTC/4. This check runs a list of filtered queries through the REAL runFilters (the engine under /find, "rerun" and "more") over a fixture pool,
// and asserts that EVERY card satisfies EVERY pill, that a pill with no cars prints the no-match line and keeps its words (never the full list), and that a known car (the Audi RS4 Cabriolet) is found.
//   node scripts/pillFenceCheck.mjs [repo root]      --mutants proves each rule by breaking it in a copy
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { fileURLToPath, pathToFileURL } from "node:url"; import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), rootArg = args.find(a => !a.startsWith("--"));
const root = path.resolve(rootArg || path.join(here, ".."));
if (args.includes("--mutants")) {
  const muts = [
    ["lib/live/converse.js", "if (pillFenceReason(r, facts, f, r.listing_title || \"\", Date.now())) continue;", "", "the make-less read tests no title word, venue or ends-within"],
    ["lib/live/search.js", "if (f.has && !hasWord(title, f.has)) return \"title word\";", "", "a title word (has) is not a fence"],
    ["lib/live/search.js", "if (f.houses && f.houses.length && !f.houses.includes(r.source)) return \"venue\";", "", "a venue pill is not a fence"],
    ["lib/live/search.js", "if (f.endsWithin && (!r.end_time || Date.parse(r.end_time) > now + f.endsWithin * 864e5)) return \"ends later\";", "", "ends within is not a fence"],
    ["lib/live/search.js", "|\\btrucks?\\b/i,", "/i,", "truck is not a pickup"],
    ["lib/live/samChat.js", "if (p.body) { const b = bodyKey(p.body); if (b) f.bodies = [b]; }", "if (p.body) { const b = String(p.body).toLowerCase(); if (BODIES.includes(b)) f.bodies = [b]; }", "a body word the engine does not list is dropped"],
    ["lib/live/samChat.js", "f.colours = [c || String(p.colour).toLowerCase()];", "if (c) f.colours = [c];", "a colour the engine does not know is dropped"],
    ["lib/live/samChat.js", "[p.model, p.trim, p.generation, p.era].filter(Boolean).flatMap(namedWords)", "[p.model].filter(Boolean).flatMap(namedWords)", "a trim, generation or era with no car is read by nothing"],
    ["lib/live/samChat.js", "(!v ? `No live cars match: ${pillWords()}${whereTxt}.` :", "(false ? `` :", "no pill-named no-match line"],
    ["lib/live/samChat.js", " && ctx.searchMeta.widen.length) ctx.emptyLine += \" Here are the nearest.\";", " && false) ctx.emptyLine += \" Here are the nearest.\";", "no nearest sentence when widenings exist"]
  ];
  let survivors = 0;
  for (const [file, from, to, want] of muts) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pillfence-"));
    spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", root + "/", dir + "/"]);
    fs.symlinkSync(path.join(root, "node_modules"), path.join(dir, "node_modules"));
    const fp = path.join(dir, file), src = fs.readFileSync(fp, "utf8"), m = src.replace(from, to);
    if (m === src) { console.log(`MUTANT NOT APPLIED  ${want}`); survivors++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
    fs.writeFileSync(fp, m);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/pillFenceCheck.mjs"), dir], { encoding: "utf8" });
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
// ---- the fixture pool: the live table, served to the real reader
const NOW = Date.now(), IN = h => new Date(NOW + h * 3600e3).toISOString();
let id = 0;
const car = (title, o = {}) => ({ id: ++id, source: o.source ?? "bringatrailer", url: "https://auction.test/" + id, photo_url: "https://img.test/" + id + ".jpg", listing_title: title, year: Number((/\b(19|20)\d\d\b/.exec(title) || [])[0]) || null, make: o.make, model: o.model, mileage: o.mileage ?? 30000, mileage_unit: "miles", transmission: o.transmission ?? "Manual", exterior_color: o.colour ?? "Red", body: o.body ?? null,
  current_bid: o.bid ?? 40000, current_bid_usd: o.bid ?? 40000, currency: "USD", country: "US", location: "Austin, TX", status: "live", end_time: IN(o.h ?? 5 + id), description: "", vin_norm: "VIN" + String(id).padStart(8, "0"), ...o.more });
const POOL = [
  car("1972 Ferrari 365 GTC/4", { make: "Ferrari", model: "365 GTC/4", colour: "Red", h: 3 }),
  car("1992 Chevrolet Corvette Convertible", { make: "Chevrolet", model: "Corvette", colour: "White", body: "Convertible" }),
  car("2005 Cadillac CTS-V", { make: "Cadillac", model: "CTS-V", colour: "Black", transmission: "Manual" }),
  car("1989 Porsche 911 Carrera 2 Coupe", { make: "Porsche", model: "911", colour: "White" }),
  car("2002 ASVE Dune Buggy", { make: "ASVE", model: "Dune Buggy", colour: "Yellow" }),
  car("Original-Owner 2008 Audi RS4 Cabriolet", { make: "Audi", model: "RS4", colour: "Silver", mileage: 15000, bid: 26500, body: "Cabriolet", h: 200 }),
  car("2006 BMW M3 Convertible 6-Speed", { make: "BMW", model: "M3", colour: "Blue", body: "Convertible", mileage: 52000 }),
  car("1999 Mazda MX-5 Miata 5-Speed", { make: "Mazda", model: "MX-5", colour: "Red", body: "Convertible", mileage: 140000 }),
  car("1968 Pontiac Firebird Convertible Automatic", { make: "Pontiac", model: "Firebird", colour: "Blue", body: "Convertible", transmission: "Automatic" }),
  car("1972 Ford F-100 Pickup", { make: "Ford", model: "F-100", colour: "White", body: "Pickup", transmission: "Manual" }),
  car("1978 Dodge Power Wagon Truck", { make: "Dodge", model: "Power Wagon", colour: "Green", body: "Truck", transmission: "Manual" }),
  car("2021 Ford F-150 Raptor Truck", { make: "Ford", model: "F-150", colour: "Black", body: "Truck", transmission: "Automatic", mileage: 8000, bid: 71000 }),
  car("1965 Chevrolet C10 Turbo Pickup", { make: "Chevrolet", model: "C10", colour: "Red", body: "Pickup", transmission: "Automatic" }),
  car("2019 Porsche 911 GT3 Touring", { make: "Porsche", model: "911", colour: "White", mileage: 4000, bid: 190000, source: "carsandbids" }),
  car("2017 Porsche 718 Cayman GT4 Turbo", { make: "Porsche", model: "718", colour: "Grey", mileage: 12000, source: "pcarmarket", h: 20 }),
  car("1995 Toyota Supra Turbo", { make: "Toyota", model: "Supra", colour: "Red", source: "carsandbids", h: 60 }),
  car("2011 Nissan Leaf Hatchback", { make: "Nissan", model: "Leaf", colour: "White", transmission: "Automatic", mileage: 20000, bid: 9000 })
];
globalThis.fetch = async (u, init = {}) => {
  const url = String(u);
  if (/live_listings/.test(url)) { const rows = /\bid=in\.|id=eq\./.test(url) ? [] : POOL; return new Response(JSON.stringify(rows), { status: 200, headers: { "content-type": "application/json", "content-range": `0-${Math.max(0, rows.length - 1)}/${rows.length}` } }); }
  return new Response("[]", { status: 200, headers: { "content-type": "application/json", "content-range": "*/0" } });
};
const SM = await imp("lib/live/samChat.js");
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
const OPEN = ["convertible", "cabriolet", "roadster", "spyder", "spider", "speedster"];
// ONE oracle, written here from the pill itself: does this car satisfy this pill? (the card's own facts and the listing's own fields; the engine's answer is never used to judge itself)
const PILLS = {
  body: (c, v) => { const b = String(v).toLowerCase().replace(/s$/, ""), want = b === "truck" ? "pickup" : b, got = String(c.facts.body || ""); return want === "convertible" ? OPEN.includes(got) : got === want || (want === "pickup" && /\btruck\b/i.test(c.r.listing_title)); },
  has: (c, v) => new RegExp("(^|[^a-z0-9])" + String(v).replace(/[-\s]+/g, "[-\\s]?") + "([^a-z0-9]|$)", "i").test(c.r.listing_title),
  gearbox: (c, v) => c.facts.gearbox === (v === "manual" ? "manual" : "auto"),
  miles_max: (c, v) => c.facts.miles != null && c.facts.miles <= Number(v),
  colour: (c, v) => String(c.facts.colour || "").toLowerCase() === String(v).toLowerCase(),
  house: (c, v) => c.r.source === v,
  budget_max: (c, v) => c.facts.priceUsd != null && c.facts.priceUsd <= Number(v),
  ends_within_days: (c, v) => Date.parse(c.r.end_time) <= NOW + Number(v) * 864e5,
  year_min: (c, v) => c.r.year >= Number(v), year_max: (c, v) => c.r.year <= Number(v)
};
const run = async f => { const out = await SM.runFilters(env, f, {}); return { cards: out.cards || [], reply: out.reply, meta: out.meta || {} }; };
const NAMED = [
  ["the reader's search 1: a plug-in hybrid truck", { body: "truck", has: "plug-in hybrid" }, { empty: true }],
  ["the reader's search 2: a manual convertible under 100,000 miles", { body: "convertible", gearbox: "manual", miles_max: "100000" }, { mustHave: /RS4 Cabriolet/ }],
  ["trucks", { body: "truck" }, { min: 3 }],
  ["pickups", { body: "pickup" }, { min: 3 }],
  ["a title word", { has: "turbo" }, { min: 2 }],
  ["a title word and a body", { has: "turbo", body: "pickup" }, { min: 1 }],
  ["a venue", { house: "carsandbids" }, { min: 2 }],
  ["a venue and a title word", { house: "carsandbids", has: "turbo" }, { min: 1 }],
  ["white cars", { colour: "white" }, { min: 3 }],
  ["manual cars under 100,000 miles", { gearbox: "manual", miles_max: "100000" }, { min: 5 }],
  ["auctions ending within a day", { ends_within_days: "1" }, { min: 1 }],
  ["cars under $30,000", { budget_max: "30000" }, { min: 2 }],
  ["a title word with a gearbox and miles", { has: "turbo", gearbox: "automatic", miles_max: "100000" }, { min: 1 }]
];
for (const [name, f, want] of NAMED) {
  const r = await run(f), bad = [];
  for (const c of r.cards) for (const [k, v] of Object.entries(f)) if (PILLS[k] && !PILLS[k](c, v)) bad.push(`${c.r.listing_title} fails ${k}=${v}`);
  ok(`${name}: every card satisfies every pill (${r.cards.length} cards)`, bad.length === 0, bad.slice(0, 3).join("; "));
  if (want.min) ok(`${name}: it finds the cars it should (at least ${want.min})`, r.cards.length >= want.min, `${r.cards.length}`);
  if (want.mustHave) ok(`${name}: the known car is found (${want.mustHave})`, r.cards.some(c => want.mustHave.test(c.r.listing_title)));
  if (want.empty) {
    ok(`${name}: nothing satisfies it, so no cards at all (never the full list)`, r.cards.length === 0 && Number(r.meta.live) === 0, `${r.cards.length} cards, live ${r.meta.live}`);
    ok(`${name}: the line says no live cars match, in the pills' own words`, /^No live cars match: plug-in hybrid trucks\./.test(r.reply), r.reply);
    ok(`${name}: the nearest are offered only as counted widenings`, /Here are the nearest\.$/.test(r.reply) && (r.meta.widen || []).length > 0 && (r.meta.widen || []).every(w => w.added > 0), JSON.stringify(r.meta.widen));
  }
}
// ---- the class: every pill the page can show, with a value no car carries, fences the pool to nothing (a pill is never dropped)
for (const [k, v] of [["body", "boat"], ["body", "hovercraft"], ["colour", "plaid"], ["house", "nowhere"], ["has", "unobtainium"], ["country", "ZZ"], ["model", "Zzyzx"], ["trim", "Zzyzx"], ["generation", "Zzyzx"], ["era", "Zzyzx"]]) {
  const r = await run({ [k]: v });
  ok(`a ${k} pill no car carries (${v}) fences the pool to nothing`, r.cards.length === 0 && Number(r.meta.live) === 0, `${r.cards.length} cards, live ${r.meta.live}`);
}
// the no-match line keeps the pill's words for each of them
{ const r = await run({ body: "boat", has: "unobtainium" }); ok("a known-empty pair prints the no match line with both pills", /^No live cars match: unobtainium boats\./.test(r.reply), r.reply); }
console.log(`\npillFenceCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
