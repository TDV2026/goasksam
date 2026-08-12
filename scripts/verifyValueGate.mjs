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
// Default prod min LOWERED to 40k (Aug 2026 business decision), 20% -> floor 32k:
// a $45k car IS now eligible (was not at the old 75k). The separate $40k leadOnValue
// dial (PS-forward layout) is a different number for a different purpose, unchanged.
check("prod min 40k @ 20% -> $45k IS eligible", powerSellerValueMet(null, 45000, 40000, 20) === true);
check("prod min 40k @ 20% -> $30k below the 32k floor", powerSellerValueMet(null, 30000, 40000, 20) === false);
check("prod min 40k @ 20% -> exactly the 32k floor passes", powerSellerValueMet(null, 32000, 40000, 20) === true);

console.log(fails ? `\n${fails} FAILURE(S)` : "\nVALUE-GATE ALL PASS");
process.exit(fails ? 1 : 0);
