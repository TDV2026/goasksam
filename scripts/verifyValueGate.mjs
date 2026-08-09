// PowerSeller value gate with minimum tolerance (product rule, Aug 2026).
// Verifies the exact code path (imports the real exported helper).
import { powerSellerValueMet } from "../api/sellerDecision.js";
let fails = 0;
const check = (n, ok) => { console.log(`${ok ? "PASS" : "FAIL"}  ${n}`); if (!ok) fails++; };

// $50k minimum, default 20% tolerance -> floor $40k.
check("$50k min accepts $45k stated", powerSellerValueMet(null, 45000, 50000, 20) === true);
check("$50k min rejects $35k stated", powerSellerValueMet(null, 35000, 50000, 20) === false);
check("boundary: exactly the $40k floor passes", powerSellerValueMet(null, 40000, 50000, 20) === true);
check("weighs the HIGHER of estimate/asking (est 46k, ask 35k -> pass)", powerSellerValueMet(46000, 35000, 50000, 20) === true);
check("no value at all -> false", powerSellerValueMet(null, null, 50000, 20) === false);
check("tolerance 0 -> full $50k min, $45k rejected", powerSellerValueMet(null, 45000, 50000, 0) === false);
// Default prod min 75k, 20% -> floor 60k: a $45k M3 is NOT eligible (still leads
// via the separate $40k leadOnValue dial, unchanged).
check("prod min 75k @ 20% -> $45k not eligible", powerSellerValueMet(null, 45000, 75000, 20) === false);

console.log(fails ? `\n${fails} FAILURE(S)` : "\nVALUE-GATE ALL PASS");
process.exit(fails ? 1 : 0);
