// MARKET CHECK RESULT FIXES (Sam, Oct 26 2026): (2) a sales tile prints its venue whenever the engine has one: `platform` reads "others" for every house outside the four
// named online platforms (the 1974 Triumph Stag), so the tile now falls back to the engine's own platformName; no platformName, no venue (honest). (3) when the engine says why the
// years differ from the typed one (scope_reason), the page prints it under the scope line, as it comes; nothing is compared on the page. No network.   node scripts/mcResultFixesCheck.mjs
import fs from "node:fs";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const src = fs.readFileSync(new URL("../public/js/onebox.js", import.meta.url), "utf8");
const fn = (name, extra = "") => { const i = src.indexOf("  function " + name + "("); let d = 0, j = src.indexOf("{", i); for (let k = j; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}" && !--d) return src.slice(i, k + 1); } throw new Error("missing " + name); };
const venueOf = new Function(fn("venueOf") + "\nreturn venueOf;")();
ok(venueOf({ platform: "Bring a Trailer", platformName: "Bring a Trailer" }) === "Bring a Trailer", "a named online platform prints as before");
ok(venueOf({ platform: "others", platformName: "Bonhams" }) === "Bonhams", "a house outside the four prints the engine's platformName (the Stag's tile)");
ok(venueOf({ platform: "others", platformName: null }) === "" && venueOf({ platform: "others" }) === "" && venueOf({}) === "" && venueOf(null) === "", "no platformName: no venue, never 'others'");
ok(!/c\.platform !== "others"\) \? c\.platform : ""/.test(src) && (src.match(/var venue = venueOf\(c\);/g) || []).length === 4, "all four tile builders read the venue through venueOf");
ok(/esc\(venueOf\(c\)\)/.test(src) && !/<span class="dot">&middot;<\/span>' \+ esc\(c\.platform\)/.test(src), "the closest-match tile no longer prints the raw 'others'");
const heroMetaLine = new Function("heroScopeLineText", "obSourceVin", "lint", "esc", fn("heroMetaLine") + "\nreturn heroMetaLine;")(() => "1971 to 1973 · eight sales", null, x => x, x => String(x).replace(/&/g, "&amp;"));
const withWhy = heroMetaLine({ scope_reason: "No 1974 sales yet, showing 1971 to 1973" });
ok(/<p class="hero-scope" data-stage="answer">1971 to 1973 · eight sales<\/p><p class="hero-scope hero-scope-why" data-stage="answer">No 1974 sales yet, showing 1971 to 1973<\/p>/.test(withWhy), "the engine's scope_reason prints under the scope line, as it comes");
ok(!/hero-scope-why/.test(heroMetaLine({})) && !/hero-scope-why/.test(heroMetaLine({ scope_reason: "  " })) && !/hero-scope-why/.test(heroMetaLine({ scope_reason: null })), "no scope_reason: no line");
ok(/scope_reason/.test(src) && !/typed year|resolvedCar\.year/.test(fn("heroMetaLine")), "the page compares no years: heroMetaLine reads scope_reason only");
const html = fs.readFileSync(new URL("../public/onebox.html", import.meta.url), "utf8"), vj = fs.readFileSync(new URL("../vercel.json", import.meta.url), "utf8");
const tok = (/\/obx\.([0-9a-z]+)\/onebox\.js/.exec(html) || [])[1];
ok(tok && vj.includes(`"/obx.${tok}/(.*)"`) && tok === "20261027a", "the script token was bumped for this change and has its rewrite (" + tok + ")");
console.log(`mcResultFixesCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
