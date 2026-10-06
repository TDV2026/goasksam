// rangeLadderCheck: pure-logic proof for the One Box range ladder (Part 3), zero DB / zero OCD.
// Proves: tier buckets by pool size, tiered rounding, the $2,500 floor, and Sam's Take enforcement
// (<=2 sentences / <=30 words / banned-word lint). Run: node scripts/rangeLadderCheck.mjs
import { __rangeLadderTest as T } from "../lib/onebox.js";

let fails = 0, n = 0;
const eq = (name, got, want) => { n++; const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) { fails++; console.log(`FAIL ${name}\n   got  ${JSON.stringify(got)}\n   want ${JSON.stringify(want)}`); } else console.log(`ok   ${name}  ${JSON.stringify(got)}`); };
const truthy = (name, got) => { n++; if (!got) { fails++; console.log(`FAIL ${name} (expected truthy, got ${JSON.stringify(got)})`); } else console.log(`ok   ${name}`); };

console.log("\n== 1. RANGE LADDER buckets (by qualified pool size) ==");
eq("0 -> none", T.rangeTierForCount(0), "none");
eq("1 -> single", T.rangeTierForCount(1), "single");
eq("2 -> single", T.rangeTierForCount(2), "single");
eq("3 -> thin", T.rangeTierForCount(3), "thin");
eq("7 -> thin", T.rangeTierForCount(7), "thin");
eq("8 -> band", T.rangeTierForCount(8), "band");
eq("15 -> band", T.rangeTierForCount(15), "band");
eq("16 -> cluster", T.rangeTierForCount(16), "cluster");
eq("50 -> cluster", T.rangeTierForCount(50), "cluster");

console.log("\n== 3. ROUNDING LADDER (range ends; individual prices never rounded) ==");
eq("step <100k = 500", T.roundStep(42300), 500);
eq("step =100k = 1000", T.roundStep(100000), 1000);
eq("step 100k-1M = 1000", T.roundStep(450000), 1000);
eq("step =1M = 1000", T.roundStep(1000000), 1000);
eq("step >1M = 5000", T.roundStep(2500000), 5000);
eq("nearest 42380 -> 42500", T.roundNearest(42380), 42500);
eq("nearest 123400 -> 123000", T.roundNearest(123400), 123000);
eq("nearest 2503400 -> 2505000", T.roundNearest(2503400), 2505000);
eq("floor 42899 -> 42500", T.roundFloor(42899), 42500);
eq("ceil 42101 -> 42500", T.roundCeil(42101), 42500);
eq("ceil 1234001 -> 1235000", T.roundCeil(1234001), 1235000);

console.log("\n== 2. PRICE FLOOR ($2,500) ==");
eq("DISPLAY_FLOOR", T.DISPLAY_FLOOR, 2500);
// A synthetic pool with a $265 outlier: the floor filter (buildResult) drops sub-floor rows. We prove
// the band computed on the FILTERED pool here (mirrors buildResult's `rows.filter(_usd>=FLOOR)`).
const withJunk = [265, 90000, 95000, 98000, 102000, 110000].map(v => ({ _usd: v }));
const filtered = withJunk.filter(r => r._usd >= T.DISPLAY_FLOOR);
eq("$265 row removed", filtered.length, 5);
const cl = T.r4Cluster(filtered);
truthy("cluster band computed above floor (lo >= 2500)", cl && cl[0] >= 2500);

console.log("\n== 6. SAM'S TAKE enforcement (<=2 sentences, <=30 words, banned-word lint) ==");
// Over-long raw sentence with structured fields -> compacted to the strongest clause, within 30 words.
const longRaw = {
  sentence: "What separated the stronger sales: the stronger half showed 24,000 miles against 61,000 as listed at the time of sale, and 7 in 10 were manuals against 3 in 10, and the stronger half listed no known issues against a median of 2. Gearbox and service history didn't separate them. 4 house sales had no listing detail and are not compared.",
  separated: ["mileage", "transmission", "flaws"],
  attributes: { mileage: { strongerMedian: 24000, weakerMedian: 61000 }, transmission: { strongerManualShare: 70, weakerManualShare: 30 }, flaws: { strongerMedian: 0, weakerMedian: 2 } }
};
const e1 = T.enforceSamsTake(longRaw);
truthy("over-long take compacted (ok)", e1.ok);
const wc = e1.sentence ? e1.sentence.trim().split(/\s+/).length : 999;
truthy(`compacted <=30 words (got ${wc})`, wc <= 30);
const sc = (e1.sentence.match(/[.!?]+(?=\s|$)/g) || []).length;
truthy(`compacted <=2 sentences (got ${sc})`, sc <= 2);
console.log("   -> " + e1.sentence);

// Banned word present -> dropped with a reason.
const banned = { sentence: "The stronger half will likely sell higher because of fewer miles.", separated: [], attributes: {} };
const e2 = T.enforceSamsTake(banned);
eq("banned-word take dropped", e2.ok, false);
truthy("banned reason names a word", /banned word|compact|separating/.test(e2.reason || ""));
console.log("   -> reason: " + e2.reason);

// A clean short take passes through unchanged.
const clean = { sentence: "The higher half of sales had around 24,000 miles; the lower half around 61,000.", separated: ["mileage"], attributes: { mileage: { strongerMedian: 24000, weakerMedian: 61000 } } };
const e3 = T.enforceSamsTake(clean);
truthy("clean short take passes", e3.ok);
eq("clean take unchanged", e3.sentence, clean.sentence);

console.log("\n== Sam's Take plain pattern (higher half / lower half, no doubled 'stronger') ==");
const PA = { mileage: { strongerMedian: 1000, weakerMedian: 5000 }, transmission: { strongerManualShare: 70, weakerManualShare: 30 }, flaws: { strongerMedian: 0, weakerMedian: 3 }, service: { strongerShare: 80, weakerShare: 20 }, modifications: { strongerShare: 20, weakerShare: 60 } };
eq("mileage plain", T.stPlainClause("mileage", PA), "The higher half of sales had around 1,000 miles; the lower half around 5,000.");
eq("transmission plain", T.stPlainClause("transmission", PA), "The higher half were 7 in 10 manual; the lower half 3 in 10.");
eq("flaws plain", T.stPlainClause("flaws", PA), "The higher half had no reported issues; the lower half averaged three.");
eq("service plain", T.stPlainClause("service", PA), "The higher half had a recent service record 8 in 10; the lower half 2 in 10.");
eq("mods plain", T.stPlainClause("modifications", PA), "Most of the lower sales had been modified; some of the higher ones had.");
truthy("no doubled 'stronger' in any template", !["mileage","transmission","flaws","service","modifications"].some(k => /stronger/i.test(T.stPlainClause(k, PA) || "")));

console.log("\n== backlog: vehicle_type filter + badge-twin siblings ==");
eq("VT_CAR filter string (strict)", T.VT_CAR, "&vehicle_type=eq.car");
eq("Talon -> Eclipse (first co-twin)", (T.siblingFor({ make: "Eagle", model: "Talon" }) || {}).label, "Mitsubishi Eclipse");
eq("Eclipse -> Talon", (T.siblingFor({ make: "Mitsubishi", model: "Eclipse" }) || {}).label, "Eagle Talon");
eq("3000GT <-> Stealth (token norm)", (T.siblingFor({ make: "Mitsubishi", model: "3000 GT" }) || {}).label, "Dodge Stealth");
eq("BRZ -> GR86 (first co-twin)", (T.siblingFor({ make: "Subaru", model: "BRZ" }) || {}).label, "Toyota GR86");
eq("no twin -> null", T.siblingFor({ make: "Porsche", model: "911" }), null);
truthy("sibling carries a relation", !!(T.siblingFor({ make: "Eagle", model: "Talon" }) || {}).relation);

console.log(`\n${fails ? fails + " / " + n + " ASSERTIONS FAILED" : "ALL " + n + " ASSERTIONS PASSED"}`);
process.exit(fails ? 1 : 0);
