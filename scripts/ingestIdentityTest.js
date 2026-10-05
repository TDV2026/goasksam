// Stubbed, no-network test for the ingest-time identity fallback (Fix 5 item 5): resolveIngestIdentity
// classifies make/model/vehicle_type from the title (and VIN) when OCD's structured fields are empty,
// before "Unknown" is ever written, and types an already-identified row by its make.
//   node scripts/ingestIdentityTest.js
import { resolveIngestIdentity } from "../lib/_unknownClassify.js";

let failures = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(`${ok ? "PASS" : "FAIL"}  ${name} (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`); if (!ok) failures++; };
const r = x => { const o = resolveIngestIdentity(x); return [o.make, o.model, o.vehicle_type]; };

// OCD structured fields EMPTY (the BaT case) -> classify from the title.
eq("empty + Ferrari 812 GTS title", r({ title: "2022 Ferrari 812 GTS", vin: "ZFF97CMA5N0280384" }), ["Ferrari", "812", "car"]);
eq("empty + BSA motorcycle title", r({ title: "1972 BSA B50T", vin: "B50TKG02127" }), ["BSA", "B50T", "motorcycle"]);
eq("empty + Honda CB750 (moto model)", r({ title: "2021 Honda CB750 Four" }), ["Honda", "CB750 Four", "motorcycle"]);
eq("empty + Mercedes-AMG", r({ title: "2016 Mercedes-AMG GT S" }), ["Mercedes-Benz", "AMG GT S", "car"]);
eq("empty + memorabilia -> Unknown/non_vehicle", r({ title: "A Mercedes-Benz radiator decanter by Ruddspeed" }), ["Unknown", "Unknown", "non_vehicle"]);
eq("empty + tractor -> other", r({ title: "1962 John Deere 4010" }), ["John Deere", "4010", "other"]);
eq("empty + junk lot opener -> non_vehicle", r({ title: "Assorted shed contents" }), ["Unknown", "Unknown", "non_vehicle"]);
eq("empty + unknown-make car -> Unknown/null", r({ title: "1975 Frobozz Magic Special" }), ["Unknown", "Unknown", null]);

// OCD already provided make+model -> keep them, type by make.
eq("identified Porsche 911 -> car", r({ ocd_make_name: "Porsche", ocd_model_name: "911", title: "2008 Porsche 911 Carrera S" }), ["Porsche", "911", "car"]);
eq("identified Harley -> motorcycle", r({ ocd_make_name: "Harley-Davidson", ocd_model_name: "Softail", title: "2015 Harley-Davidson Softail" }), ["Harley-Davidson", "Softail", "motorcycle"]);
eq("identified listing_make fallback", r({ listing_make: "Chevrolet", listing_model: "Corvette", title: "1969 Chevrolet Corvette" }), ["Chevrolet", "Corvette", "car"]);
// OCD make 'Unknown' string is treated as empty.
eq("OCD make 'Unknown' -> reclassify", r({ ocd_make_name: "Unknown", ocd_model_name: "Unknown", title: "1969 Chevrolet Corvette Stingray" }), ["Chevrolet", "Corvette Stingray", "car"]);

console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL PASS");
process.exit(failures ? 1 : 0);
