// A TITLE FRAGMENT IS NEVER A MODEL (Lane B, Oct 29 2026, Sam's gate: zero wrong-model results).
// CAUSE: a live title opens with words about the sale ("23-Years-Owned, 350-Powered Custom 1941 Chevrolet Coupe", "Single-Family-Owned 1970 Cadillac ..."). The archive filed some of those rows under the model
// "Years" and "Single", and the resolver's archive fallback (lib/vehicle.js, lib/onebox.js archiveResolveToken) adopted the word as the car, so a card read the pool "Chevrolet Years", "Ford Years", "BMW Years", "Jaguar Years",
// "Cadillac Single", "Pontiac Single" (the invariant then refused them: "could not be checked"). Words in front of the year ("Custom", "Supercharged") were also read as the model.
// FIX (lib/titleNoise.js): ownership and engine claims are stripped before the words are read; a word that is only ever such a fragment is never a model; a model is read from the words after the make; a model read only
// from sale words in front of the year is dropped and the title read again from its year on. "Custom" after the make stays a model (the 1949 to 1951 Ford Custom).
//   node scripts/titleFragmentModelCheck.mjs [repo root]
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2";
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const TAX = { chevrolet: ["Camaro", "Corvette", "Bel Air", "Impala", "C10"], ford: ["Mustang", "Custom", "Thunderbird", "F-150"], bmw: ["2002", "M3", "3 Series"], cadillac: ["Eldorado", "DeVille"], pontiac: ["GTO", "Firebird"], jaguar: ["E-Type", "XJ6"] };
const ARCHIVE = [];   // rows the archive holds under a sale word
for (const [make, word, tails] of [["Chevrolet", "Years", ["1941 Chevrolet Coupe", "1950 Chevrolet 3800 5-Window Pickup"]], ["Ford", "Years", ["1932 Ford 5-Window Coupe", "1951 Ford Business Coupe"]], ["BMW", "Years", ["1968 BMW 2002"]], ["Jaguar", "Years", ["1948 Jaguar Mark IV"]],
  ["Cadillac", "Single", ["1970 Cadillac Fleetwood Brougham"]], ["Pontiac", "Single", ["1965 Pontiac Bonneville"]]])
  for (let i = 0; i < 8; i++) for (const t of tails) ARCHIVE.push({ make, model: word, listing_title: (word === "Years" ? `${20 + i}-Years-Owned ` : "Single-Family-Owned ") + t });
globalThis.fetch = async (url) => {
  const u = new URL(String(url)), p = u.pathname;
  if (u.hostname.includes("nhtsa")) return new Response(JSON.stringify({ Results: [] }), { status: 200 });
  if (p.endsWith("/taxonomy_makes")) return new Response(JSON.stringify(["Chevrolet", "Ford", "BMW", "Cadillac", "Pontiac", "Jaguar"].map(name => ({ name, slug: name.toLowerCase() }))), { status: 200 });
  if (p.endsWith("/taxonomy_models")) { const mk = (u.searchParams.get("make_slug") || "").replace(/^eq\./, ""); return new Response(JSON.stringify((TAX[mk] || []).map(name => ({ name, year_ranges: null }))), { status: 200 }); }
  if (p.endsWith("/sales_archive")) { const m = (u.searchParams.get("listing_title") || "").replace(/^ilike\./, "").replace(/\*/g, "").toLowerCase(); return new Response(JSON.stringify(m ? ARCHIVE.filter(r => r.listing_title.toLowerCase().includes(m)) : []), { status: 200 }); }
  if (u.hostname.includes("fake.supabase")) return new Response("[]", { status: 200 });
  throw new Error("offline");
};
const V = await import(pathToFileURL(path.join(root, "lib/vehicle.js")).href);
const N = await import(pathToFileURL(path.join(root, "lib/titleNoise.js")).href).catch(() => null);
ok("lib/titleNoise.js exists", !!N);
const JUNK = ["Years", "Single", "Owned", "Owner", "Powered", "Window"];
// 1. the live titles: the resolver never returns a sale word as the model
const TITLES = [
  "23-Years-Owned, 350-Powered Custom 1941 Chevrolet Coupe", "44-Years-Owned 1950 Chevrolet 3800 5-Window Pickup", "22-Years-Owned, Supercharged 302-Powered 1932 Ford 5-Window Coupe by Roy Brizio Street Rods",
  "34-Years-Owned 1968 BMW 2002", "48-Years-Owned 1948 Jaguar Mark IV", "Single-Family-Owned 1970 Cadillac Fleetwood Brougham", "Single-Owner 1965 Pontiac Bonneville", "One-Family-Owned 1951 Ford Business Coupe",
  "Custom 1937 Ford Pickup", "Supercharged 540ci-Powered 1990 Chevrolet 454 SS"
];
for (const t of TITLES) {
  const r = await V.resolveVehicle(t, {}), m = r.vehicle && r.vehicle.model;
  ok(`"${t.slice(0, 64)}": the model is not a sale word (${m || "none"})`, !m || (!JUNK.some(j => j.toLowerCase() === String(m).toLowerCase()) && !/^custom$/i.test(m) && !/^powered$/i.test(m)), r.status + " " + m);
}
// 2. the cars themselves still read: the model after the make is kept, Ford Custom included
for (const [t, make, model] of [["1950 Ford Custom Deluxe Tudor", "Ford", "Custom"], ["34-Years-Owned 1968 BMW 2002", "BMW", "2002"], ["1966 Ford Mustang", "Ford", "Mustang"], ["Single-Owner 1969 Chevrolet Camaro", "Chevrolet", "Camaro"], ["1969 Chevrolet Camaro", "Chevrolet", "Camaro"]]) {
  const r = await V.resolveVehicle(t, {});
  ok(`"${t}" still reads ${make} ${model}`, !!r.vehicle && r.vehicle.make === make && r.vehicle.model === model, r.vehicle && `${r.vehicle.make} ${r.vehicle.model}`);
}
// 3. the pieces
if (N) {
  ok("stripTitleNoise removes the ownership and engine claims and nothing else", N.stripTitleNoise("23-Years-Owned, 350-Powered Custom 1941 Chevrolet Coupe") === "Custom 1941 Chevrolet Coupe" && N.stripTitleNoise("Single-Family-Owned 1970 Cadillac Eldorado") === "1970 Cadillac Eldorado" && N.stripTitleNoise("1966 Ford Mustang GT") === "1966 Ford Mustang GT");
  ok("every sale word is a junk model, and a real model is not", JUNK.every(j => N.isJunkModel(j)) && !["Mustang", "Custom", "Camaro", "2002"].some(j => N.isJunkModel(j)));
  ok("a model read only in front of the year is dropped; the same word after the make is kept", N.dropFragmentPrefix("350-Powered Custom 1941 Chevrolet Coupe", "Chevrolet", "Custom") === "1941 Chevrolet Coupe" && N.dropFragmentPrefix("1950 Ford Custom Deluxe", "Ford", "Custom") === null && N.dropFragmentPrefix("Camaro 1969 Chevrolet", "Chevrolet", "Camaro") === null);
  ok("wordsAfterMake gives the words after the make", N.wordsAfterMake("23-Years-Owned 1941 Chevrolet Coupe", "Chevrolet") === "Coupe" && N.wordsAfterMake("Custom Coupe", "Ford") === "Custom Coupe");
}
// 4. the archive's own sale-word models are refused by the shared archive token read too
{ const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href); const t = await E.archiveResolveToken(["Years-Owned", "Years"], { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" }, ["Years"]).catch(() => null);
  ok("archiveResolveToken never returns a sale word as the model", !t || !JUNK.some(j => j.toLowerCase() === String(t.model).toLowerCase()), t && t.model); }
console.log(fail ? `titleFragmentModelCheck: ${fail} failure(s)` : "titleFragmentModelCheck: all pass");
process.exit(fail ? 1 : 0);
