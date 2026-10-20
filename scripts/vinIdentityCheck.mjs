// ONE IDENTITY FOR THE VIN SITEMAP AND THE VIN PAGE (Lane C, Oct 20 2026; the 9 VIN-sitemap redirects). The nightly
// rollout stores the identity it computed beside each address; the page and the /vin/ redirect read it first, so the
// sitemap address and the page's own slug (its canonical) are the same for every cached VIN, whatever the live resolver
// says; a VIN with no cached identity keeps today's live path. Fixture identities, no network.
//   node scripts/vinIdentityCheck.mjs     exit 1 on any failure.
import fs from "node:fs";
import { identOf, mergeIdentity } from "../api/history.js";
import { carSlug } from "../api/_historyData.js";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const SITE = "https://goasksam.com";
const mk = (year, make, family, model = family, trim = null) => { const id = { year, make, model, trim, family, genCode: null, bodyStyle: null, vehicle: { year, make, model } }; id.slug = carSlug(id); return id; };
// The nine kinds Lane E saw (the live read names the car differently from the nightly), then 30 ordinary VINs.
const NINE = [
  ["1GNFK16K2PJ402195", mk(1993, "Chevrolet", "Silverado"), mk(1993, "Chevrolet", "Suburban")],
  ["ZFFRG36A6P0095809", mk(1993, "Ferrari", "348 Speciale"), mk(1993, "Ferrari", "348 TB")],
  ["1FTHX26F0VEC47261", mk(1997, "Ford", "F250 XLT"), mk(1997, "Ford", "F-250")],
  ["1GNGR26N2LF151255", mk(1990, "Chevrolet", "Silverado"), mk(1990, "Chevrolet", "Suburban")],
  ["WDBSK76F55F091924", mk(2005, "Mercedes-Benz", "SL-Class SL600"), mk(2005, "Mercedes-Benz", "SL600")],
  ["WDDNG7DB9DA504347", mk(2013, "Mercedes-Benz", "S-Class S550"), mk(2013, "Mercedes-Benz", "S550")],
  ["1G1YY22G0X5100000", mk(1999, "Chevrolet", "Corvette"), mk(1999, "Chevrolet", "Corvette Coupe")],
  ["WP0AA2999YS621235", mk(2000, "Porsche", "911 Carrera 4"), mk(2000, "Porsche", "911")],
  ["SALME11494A157867", mk(2004, "Land Rover", "Range Rover"), mk(2004, "Land Rover", "Range Rover HSE")]
];
const THIRTY = Array.from({ length: 30 }, (_, i) => { const id = mk(1960 + i, ["Porsche", "Ford", "BMW", "Ferrari", "Chevrolet"][i % 5], ["911", "Mustang", "M3", "308 GTB", "Corvette"][i % 5]); return ["VIN" + String(1000000 + i), id, id]; });
for (const [vin, nightly, live] of [...NINE, ...THIRTY]) {
  const u = { vin, loc: `${SITE}/history/${nightly.slug}/${vin}`, ident: identOf(nightly) };   // what the nightly writes
  const page = mergeIdentity(live, u.ident, null);                                             // what the page then serves
  ok(u.loc === `${SITE}/history/${page.slug}/${vin}`, `${vin}: the sitemap address and the page's own address (its canonical) are one (${nightly.slug} vs ${live.slug})`);
  ok(page.make === nightly.make && page.family === nightly.family && page.year === nightly.year, `${vin}: the page names the car as the sitemap does`);
}
// No cached identity, or an incomplete one: today's live path, unchanged.
const live = mk(1993, "Chevrolet", "Suburban");
ok(mergeIdentity(live, null, null) === live && mergeIdentity(live, { slug: "x" }, null) === live, "no (or incomplete) cached identity: the live identity, unchanged");
ok(mergeIdentity(null, identOf(mk(1993, "Chevrolet", "Silverado")), null) === null, "the live read still decides whether the VIN is a car at all (no live identity: 404 as today)");
ok(JSON.stringify(Object.keys(identOf(live))) === JSON.stringify(["year", "make", "model", "trim", "family", "genCode", "bodyStyle", "slug"]), "the stored identity is the naming fields only (no vehicle object, no prices)");
// The wiring.
const h = fs.readFileSync(new URL("../api/history.js", import.meta.url), "utf8");
ok(/photos, ident: identOf\(id\) \};/.test(h), "the nightly rollout stores the identity beside each address");
ok(/const id = await identityFor\(env, appearances, vinNorm\);/.test(h) && /appearances\.length \? await identityFor\(env, appearances, vin\) : null/.test(h), "the VIN page and the /vin/ redirect read the cached identity first");
ok(/const IDENT_READ_MS = 1500;/.test(h) && /Promise\.race\(\[supabaseSelectSafe\(env, `vin_rollout_cache\?key=eq\.current&select=data&limit=1`\)/.test(h) && !/cachedIdent[\s\S]{0,400}rolloutCached\(|cachedIdent[\s\S]{0,400}await rollout\(/.test(h), "the cache read is capped at 1.5 s and never starts a live rollout");
const page = mergeIdentity(live, identOf(mk(1993, "Chevrolet", "Silverado")), { make: "Chevrolet", model: "Silverado", year: 1993 });
ok(page.vehicle.model === "Silverado" && page.identSource === "sitemap", "a differing stored name: the engine reads the stored name too, so title and market name the same car");
console.log(`vinIdentityCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
