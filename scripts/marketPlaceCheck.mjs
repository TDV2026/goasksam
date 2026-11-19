// MARKET PLACE CHECK (Lane B, Oct 25 2026), no network: a row placed by its state or city text is read from that place before the sale currency
// (lib/_classify.js marketCountry / placeOf); the USD fallback is kept only for a row with no place at all.
import { marketCountry, inMarket } from "../lib/_classify.js";
let failed = 0; const ok = (c, m) => { if (!c) failed++; console.log((c ? "ok   " : "FAIL ") + m); };
const c = r => marketCountry(r).country;
ok(c({ state: "LIECHTENSTEIN", currency: "USD", source: "RM Sotheby's" }) === "XX", "Eschen, Liechtenstein priced in USD is not a US row");
ok(c({ city: "Eschen, Liechtenstein", currency: "USD" }) === "XX", "a city with a country tail is read from the tail");
ok(c({ state: "ONTARIO, CANADA", currency: "USD" }) === "CA" && inMarket({ state: "Quebec, Canada", currency: "USD" }), "Canada written as 'Province, Canada' is Canada");
ok(c({ state: "UNITED STATES", currency: "USD", source: "RM Sotheby's" }) === "US" && c({ state: "CA, UNITED STATES", currency: "USD", source: "The Market" }) === "US", "United States as a state or tail is the US, even at a UK venue");
ok(c({ state: "Monaco, FL" }) === "US", "the country tail decides: Monaco, FL is Florida");
ok(c({ currency: "USD", source: "Gooding & Co" }) === "US", "no place at all: the USD fallback still reads US");
ok(c({ currency: "GBP", source: "Bonhams" }) === "GB", "no place: a GBP sale is still abroad");
ok(c({ cc: "DE", state: "TX" }) === "DE", "an explicit country code still comes first");
console.log(failed ? `marketPlaceCheck: ${failed} FAILED.` : "marketPlaceCheck: all passed.");
process.exit(failed ? 1 : 0);
