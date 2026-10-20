// idDecodeRuleCheck (Lane B, Oct 20 2026, Lane F's rule wording for Sam): the decode-first identity rule (api/_historyData.js
// decodeIdentityFix, behind IDENTITY_RULES.decodeFirst, OFF). The decoded model wins only when the title names it; the old model
// word is dropped, never kept as a trim; the make changes only when the decoded make is in the title. Titles from the dry run.
// Offline: the pure function, no network, no database.
process.env.OLDCARSDATA_API_KEY = process.env.OLDCARSDATA_API_KEY || "";
const { decodeIdentityFix, familyOf, IDENTITY_RULES } = await import("../api/_historyData.js");
let bad = 0;
const ok = (c, m) => { if (c) console.log("ok   " + m); else { bad++; console.log("FAIL " + m); } };
const name = (v, y) => [y, v.make, familyOf(v)].join(" ");
ok(IDENTITY_RULES.decodeFirst === false, "the rule ships OFF");
const sub = decodeIdentityFix({ make: "Chevrolet", model: "Silverado", trim: "2500" }, "1990 Chevrolet Suburban 2500 Silverado 454", { make: "Chevrolet", model: "Suburban" });
ok(sub && name(sub, 1990) === "1990 Chevrolet Suburban 2500", `the Suburban: ${sub && name(sub, 1990)}`);
const dak = decodeIdentityFix({ make: "Shelby", model: "Dodge", trim: null }, "1989 Dodge Shelby Dakota Pickup", { make: "Dodge", model: "DAKOTA" });
ok(dak && name(dak, 1989) === "1989 Dodge Dakota Shelby" && !/dakota dodge|shelby dodge/i.test(name(dak, 1989)), `no junk name: ${dak && name(dak, 1989)} (never "1989 Shelby Dakota Dodge")`);
const mod = decodeIdentityFix({ make: "Shelby", model: "Modified", trim: null }, "Modified 1989 Dodge Shelby Dakota", { make: "Dodge", model: "Dakota" });
ok(mod && !/modified/i.test(familyOf(mod)), `the old model word is dropped: ${mod && name(mod, 1989)}`);
const omni = decodeIdentityFix({ make: "Dodge", model: "Dodge", trim: "GLH" }, "1986 Dodge Omni GLH", { make: "Dodge", model: "OMNI" });
ok(omni && name(omni, 1986) === "1986 Dodge Omni GLH", `a capitalised decode reads as a name: ${omni && name(omni, 1986)}`);
ok(decodeIdentityFix({ make: "Chevrolet", model: "Camaro", trim: "SS" }, "1969 Chevrolet Camaro SS", { make: "Chevrolet", model: "Nova" }) === null, "a decoded model the title does not name changes nothing");
ok(decodeIdentityFix({ make: "Chevrolet", model: "Camaro", trim: "SS" }, "1969 Chevrolet Camaro SS", { make: "Chevrolet", model: "Camaro" }) === null, "the same model changes nothing");
ok(decodeIdentityFix({ make: "Chevrolet", model: "Camaro" }, "1969 Chevrolet Camaro", null) === null, "no decode changes nothing");
const keepMake = decodeIdentityFix({ make: "Ford", model: "Mustang", trim: "Shelby" }, "1967 Shelby GT500 Mustang", { make: "Shelby", model: "GT500" });
ok(keepMake && keepMake.make === "Ford", `a make of the same group stays (Ford/Shelby): ${keepMake && name(keepMake, 1967)}`);
// cost (Oct 20 2026): with the switch on, carIdentity decodes ONLY when the title names another known model of the make
// (otherModelsNamed, the resolver's cached model list), and keeps a decode per instance by VIN (decodeVinCached).
const fs = await import("fs");
const src = fs.readFileSync(new URL("../api/_historyData.js", import.meta.url), "utf8");
const blk = src.slice(src.indexOf("if (IDENTITY_RULES.decodeFirst"), src.indexOf("// Same car = same VIN and same MAKE."));
ok(/const others = await otherModelsNamed\(v\.make, v\.model, t0\)/.test(blk) && /if \(others && others\.length\) \{ const dv = await decodeVinCached/.test(blk) && !/resolveVehicle\(/.test(blk), "the rule decodes only after the prefilter, through the per-VIN cache");
const { otherModelsNamed } = await import("../lib/vehicle.js");
const realFetch = globalThis.fetch; globalThis.fetch = async () => { throw new Error("blocked"); };
const om = await otherModelsNamed("Chevrolet", "Suburban", "1990 Chevrolet Suburban 2500");
globalThis.fetch = realFetch;
ok(om === null || Array.isArray(om), "an unreadable model list returns null (no decode), never throws");
console.log(bad ? `idDecodeRuleCheck: ${bad} failed` : "idDecodeRuleCheck: all passed");
process.exit(bad ? 1 : 0);
