// vinLooseCheck (Lane B, Oct 20 2026; Lane F: the Amazon tabs read "1971 Mercedes 280SE" as "That VIN decodes to a 2013"): the
// separator-tolerant VIN path never reads a car named in words as a VIN, still reads a VIN pasted in groups, and a contiguous VIN is
// unchanged. Offline: the resolver with every network call blocked (a VIN that IS detected tries the free decode and fails here,
// so the check reads what the resolver treats as a VIN, not the decode).
globalThis.fetch = async () => { throw new Error("network blocked in check"); };
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY; delete process.env.OLDCARSDATA_API_KEY;
const V = await import("../lib/vehicle.js");
let bad = 0;
const ok = (c, m) => { if (c) console.log("ok   " + m); else { bad++; console.log("FAIL " + m); } };
const isVin = t => typeof V.detectVinLooseForTest === "function" ? V.detectVinLooseForTest(t) : null;
ok(isVin("1971 Mercedes 280SE") === null, "\"1971 Mercedes 280SE\" is not a VIN");
ok(isVin("1971 Mercedes-Benz 280SE") === null, "\"1971 Mercedes-Benz 280SE\" is not a VIN");
ok(isVin("2013 BMW M3 Coupe E92") === null, "\"2013 BMW M3 Coupe E92\" is not a VIN");
ok(isVin("1957 Porsche 356 Speedster") === null, "\"1957 Porsche 356 Speedster\" is not a VIN (the earlier golden case)");
ok(isVin("WBS BF93 2XSE H006 21") === "WBSBF932XSEH00621", "a real VIN pasted in groups still reads (WBS BF93 2XSE H006 21)");
ok(isVin("WBSBF932XSEH00621") === "WBSBF932XSEH00621", "a contiguous VIN still reads");
ok(isVin("1GNGR26N2LF151255") === "1GNGR26N2LF151255", "a contiguous US VIN still reads");
ok(isVin("1FA-6P8CF5 J5123456") === null || V.vinCheckDigitValid("1FA6P8CF5J5123456"), "a grouped string that fails the check digit is not read as a VIN");
ok(V.vinCheckDigitValid("1GNGR26N2LF151255") && V.vinCheckDigitValid("WBSBF932XSEH00621") && !V.vinCheckDigitValid("WBSBF932XSEH0062Z"), "the check digit (49 CFR 565.15)");
console.log(bad ? `vinLooseCheck: ${bad} failed` : "vinLooseCheck: all passed");
process.exit(bad ? 1 : 0);
