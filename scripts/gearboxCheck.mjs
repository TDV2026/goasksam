// THE GEARBOX A LISTING STATES (Lane E, Oct 20 2026; Sam's Buy Stage 1c item 3): lib/live/search.js gearboxOf on fixed
// listing texts (transmission field + title), no network. A manual car stays manual ("6-Speed" in an auction title is a
// manual), an automatic with paddles or "manual mode" never reads Manual, and no text means not stated. Exits 1 on any
// case that breaks.
//   node scripts/gearboxCheck.mjs
import { gearboxOf, listingFacts } from "../lib/live/search.js";
const cases = [
  ["Six-Speed Manual Transaxle 1995 Porsche 911 Carrera", "manual"],
  ["1995 Porsche 911 Carrera 6-Speed", "manual"],
  ["Five-Speed Manual 1972 Porsche 911T Coupe", "manual"],
  ["Eight-Speed PDK Transaxle 2018 Porsche Panamera Turbo", "auto"],
  ["Eight-Speed Dual-Clutch Transaxle 2018 Porsche Panamera Turbo", "auto"],
  ["8-Speed Dual Clutch with Manual Mode 2018 Porsche Panamera Turbo", "auto"],
  ["Eight-Speed Transmission with Manual Mode 2018 Porsche Panamera Turbo", null],
  ["Seven-Speed F1 Dual-Clutch 2015 Ferrari 458 Speciale", "auto"],
  ["Six-Speed Doppelkupplung 2013 Porsche 911 Carrera S", "auto"],
  ["Seven-Speed ISR 2014 Lamborghini Aventador", "auto"],
  ["Seven-Speed SpeedShift MCT 2012 Mercedes-Benz SL63 AMG", "auto"],
  ["Three-Speed TorqueFlite 1970 Dodge Challenger R/T", "auto"],
  ["Two-Speed Powerglide 1962 Chevrolet Corvette", "auto"],
  ["Four-Speed Hydra-Matic 1956 Cadillac Eldorado", "auto"],
  ["Tiptronic S 1999 Porsche 911 Carrera", "auto"],
  ["Five-Speed Automatic 2004 Mercedes-Benz SL500", "auto"],
  ["Six-Speed Manual Transmission with manual shift knob 2008 BMW M3", "manual"],
  ["1966 Ford Mustang Coupe", null],
  ["", null],
];
let failed = 0;
for (const [t, want] of cases) { const got = gearboxOf(t); const ok = got === want; if (!ok) failed++; console.log(`${ok ? "PASS" : "FAIL"}  ${JSON.stringify(t)} -> ${got}${ok ? "" : " (want " + want + ")"}`); }
// The listing as a whole (transmission field + title, lib/live/search.js listingFacts), from the live read of Oct 20 2026.
const rows = [
  [{ transmission: "(8-speed)", listing_title: "32k-Mile 2018 Porsche Panamera Turbo" }, null],
  [{ transmission: "(4-speed)", listing_title: "42k-Mile 1997 Porsche 911 Carrera Targa" }, null],
  [{ transmission: "(7-speed)", listing_title: "2009 BMW M3 Coupe" }, null],
  [{ transmission: "(6-speed)", listing_title: "1995 Porsche 911 Carrera 6-Speed" }, "manual"],
  [{ transmission: "Manual (3-speed)", listing_title: "1951 Ford Custom Sedan" }, "manual"],
  [{ transmission: "Six-Speed Manual Transaxle", listing_title: "2005 Porsche 911 Carrera S Coupe" }, "manual"],
  [{ transmission: "Seven-Speed PDK Transaxle", listing_title: "2019 Porsche 911 Targa 4S" }, "auto"],
  [{ transmission: "", listing_title: "1966 Ford Mustang Coupe 4-Speed" }, "manual"],
  [{ transmission: "(5-speed)", listing_title: "1974 Honda CB750" }, "manual"],
  [{ transmission: "(6-speed)", listing_title: "2000 Ducati 748" }, "manual"],
];
for (const [r, want] of rows) { let got; try { got = listingFacts({ ...r, mileage: null, currency: "USD", source: "bringatrailer" }).gearbox; } catch (e) { got = "ERROR " + e.message; } const ok = got === want; if (!ok) failed++; console.log(`${ok ? "PASS" : "FAIL"}  listing ${JSON.stringify(r.transmission)} + ${JSON.stringify(r.listing_title)} -> ${got}${ok ? "" : " (want " + want + ")"}`); }
console.log(failed ? `gearboxCheck: ${failed} FAIL` : "gearboxCheck: all pass");
process.exit(failed ? 1 : 0);
