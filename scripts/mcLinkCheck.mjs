// The Market Check address the engine names for a card (Sam, Oct 23 2026): the exact car, no question to answer. Offline.
import { mcUrlOf } from "../lib/mcLink.js";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
ok(mcUrlOf({ vin_norm: "WBSUR9C58BC123456" }, {}, null) === "/market-check?vin=WBSUR9C58BC123456&from=card", "a full VIN opens Market Check on that VIN");
ok(mcUrlOf({ vin_norm: "12345", year: 1969, make: "Chevrolet", model: "Camaro" }, { body: "Coupe" }, null) === "/market-check?car=1969-chevrolet-camaro&body=coupe", "a short chassis number is not a VIN: the car as named, with its body style");
ok(mcUrlOf({ year: 2018, make: "Porsche", model: "911", trim: "Carrera GTS" }, {}, null) === "/market-check?car=2018-porsche-911&trim=Carrera+GTS", "the trim travels as its own field");
ok(mcUrlOf({ year: 2011, make: "BMW", model: "1M" }, {}, { query: "2011 BMW 1M Coupe" }) === "/market-check?car=2011-bmw-1m-coupe", "the market read's own query names the car when it has one");
ok(mcUrlOf({}, {}, null) === null, "nothing known, no link");
console.log(`mcLinkCheck: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
