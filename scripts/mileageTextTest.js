// Unit test for lib/_mileageText.js mileageFromText. No network. Run: node scripts/mileageTextTest.js
import { mileageFromText } from "../lib/_mileageText.js";

const cases = [
  // [title, description, expectedMiles, expectedBasis]
  ["One-Owner 2011 Mercedes-Benz SLS AMG w/830 Miles", "shows 830 miles.", 830, "miles"],
  ["2000 Mercedes-Benz E55 AMG w/29k Miles", "shows only 29k miles from new.", 29000, "miles"],
  ["10k-Mile 1991 Mercedes-Benz 500SL", "a matching example.", 10000, "miles"],
  ["5k-Mile 1986 Mercedes-Benz 300SL", "powered by a 3.0L M103 Inline-6 and shows 5k miles.", 5000, "miles"],
  ["1994 Mercedes-Benz E500 Limited", "one of 951 Limited examples, 5.0L M119 V8. The car now has only 16k KMs (10k miles).", 10000, "miles"],   // both stated -> miles wins
  ["1990 Mercedes-Benz 300GD 5-Speed", "This G-wagen shows 180,000 kms on the odometer.", 111800, "km"],   // 180000*0.621371=111846.8 -> 111800? check
  ["Euro 1992 Mercedes-Benz 300CE", "Finished in Black over Black Leather (261), 3.0L 24v inline-6, 4-speed automatic. Recent service.", null, null],   // no mileage stated
  ["1986 Mercedes-Benz 560SEL", "odometer reads TMU; mileage is not known.", null, null],   // TMU -> null
  ["Restored 1980 Mercedes-Benz 280GE", "full frame-off restoration, 4-speed manual.", null, null],   // nothing -> null
  ["2023 Mercedes-AMG C43", "shows 12,345 miles.", 12345, "miles"],
  ["16k KMs car", "The odometer shows 16k KMs.", 9900, "km"],   // 16000*0.621371=9941.9 -> 9900
];

let pass = 0, fail = 0;
for (const [t, d, em, eb] of cases) {
  const r = mileageFromText(t, d);
  const gotM = r ? r.miles : null, gotB = r ? r.basis : null;
  const ok = gotM === em && gotB === eb;
  console.log(`${ok ? "PASS" : "FAIL"}  miles=${gotM} basis=${gotB} phrase=${r ? JSON.stringify(r.phrase) : "-"}  <= ${JSON.stringify((t + " " + d).slice(0, 60))}`);
  if (!ok) { console.log(`      expected miles=${em} basis=${eb}`); fail++; } else pass++;
}
console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
