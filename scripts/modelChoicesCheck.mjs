// MODEL CHOICES CHECK (Lane B, Oct 25 2026), no network. A fake PostgREST holds synthetic sales; modelChoicesForBrand must return up to six
// models for a brand, most-sold first, chassis codes collapsed into the base model, then "Any {make}"; the typed years filter the list; years that
// leave nothing fall back to the brand's whole list; an unknown brand returns just the Any entry.
import { modelChoicesForBrand } from "../lib/onebox.js";
const rows = [];
const add = (make, model, year, n) => { for (let i = 0; i < n; i++) rows.push({ make, model, year }); };
add("Porsche", "911", 2015, 30); add("Porsche", "996", 2001, 12); add("Porsche", "997", 2008, 14); add("Porsche", "Boxster", 2003, 20); add("Porsche", "Cayman", 2009, 9);
add("Porsche", "356", 1960, 8); add("Porsche", "944", 1987, 7); add("Porsche", "928", 1985, 6); add("Porsche", "Cayenne", 2010, 3); add("Porsche", "Unknown", 2000, 50);
add("Ford", "Mustang", 1966, 40); add("Ford", "Bronco", 1975, 10);
let seen = [];
globalThis.fetch = async (url) => {
  const u = new URL(url); seen.push(u.search);
  const make = (u.searchParams.get("make") || "").replace(/^eq\./, "");
  const gte = u.searchParams.getAll("year").find(v => v.startsWith("gte.")), lte = u.searchParams.getAll("year").find(v => v.startsWith("lte."));
  const out = rows.filter(r => r.make === make && (!gte || r.year >= Number(gte.slice(4))) && (!lte || r.year <= Number(lte.slice(4))));
  return new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json" } });
};
const env = { supabaseUrl: "http://fake", supabaseKey: "k" };
let failed = 0; const ok = (c, m) => { if (!c) failed++; console.log((c ? "ok   " : "FAIL ") + m); };
const labels = r => r.options.map(o => o.label).join(" | ");
let r = await modelChoicesForBrand(env, "Porsche");
ok(r.options.length === 7 && r.options[6].any === true && r.options[6].label === "Any Porsche" && r.options[6].value === null, "porsche: six models then Any Porsche");
ok(r.options[0].label === "911" && r.options[0].n === 56, "porsche: 911 first with the chassis codes collapsed into it (30 + 12 + 14)");
ok(!/996|997|Unknown/.test(labels(r)), "porsche: no chassis code and no Unknown in the list");
ok(r.options.slice(0, 6).every((o, i, a) => i === 0 || a[i - 1].n >= o.n), "porsche: most-sold first");
r = await modelChoicesForBrand(env, "Porsche", { yearMin: 1980, yearMax: 1989 });
ok(r.options.slice(0, -1).every(o => ["944", "928"].includes(o.label)) && r.options.length === 3, `porsche 1980 to 1989 holds only models sold in those years (${labels(r)})`);
r = await modelChoicesForBrand(env, "Porsche", { yearMin: 1930, yearMax: 1935 });
ok(r.options.length === 7, "years that leave nothing fall back to the brand's whole list");
r = await modelChoicesForBrand(env, "Ford");
ok(labels(r) === "Mustang | Bronco | Any Ford", `ford: ${labels(r)}`);
r = await modelChoicesForBrand(env, "Nonesuch");
ok(r.options.length === 1 && r.options[0].any === true, "an unknown brand returns only the Any entry");
console.log(failed ? `modelChoicesCheck: ${failed} FAILED.` : "modelChoicesCheck: all passed.");
process.exit(failed ? 1 : 0);
