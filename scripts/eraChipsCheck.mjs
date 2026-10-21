// Buy Stage 1e item 6 (Sam, Oct 21 2026): the era chips bucket each car by the generation code its card prints, filter on
// that code, and each chip's count equals the cards that say it. OFFLINE: the 22 live "red Porsche 911" cars as read on
// Oct 21 2026 (titles and years), each labelled by the cards' own genFor, through askRule and the search's own code
// filter. Run: node scripts/eraChipsCheck.mjs
import { askRule } from "../lib/live/narrow.js";
import { genFor, listingFacts } from "../lib/live/search.js";
let fail = 0, pass = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const CARS = [[2018, "1,800-Mile 2018 Porsche 911 GT2 RS Weissach"], [1996, "31k-Mile 1996 Porsche 911 Turbo"], [2005, "19k-Mile 2005 Porsche 911 Turbo S Cabriolet 6-Speed"], [1987, "1987 Porsche 911 Carrera Targa DP935 I"], [1984, "RoW 1984 Porsche 911 Carrera Coupe"], [1990, "1990 Porsche 911 Carrera 4 Coupe 5-Speed"], [1983, "1983 Porsche 911SC Coupe With a Rebuilt 3.0-Liter Flat-Six"], [1987, "1987 Porsche 911 Carrera Coupe G50"], [1992, "39k-Mile 1992 Porsche 911 Turbo"], [1995, "24k-Mile 1995 Porsche 911 Carrera Cabriolet 6-Speed"], [2000, "29k-Mile 2000 Porsche 911 Carrera Cabriolet 6-Speed"], [2012, "28k-Mile 2012 Porsche 911 Turbo S Coupe"], [1985, "1985 Porsche 911 Carrera Targa"], [1990, "1990 Porsche 911 Carrera 4 Cabriolet 5-Speed"], [1967, "La Carrera Panamericana Class-Winning 1967 Porsche 911S Coupe"], [1987, "1987 Porsche 911 Carrera Coupe G50"], [1986, "1986 Porsche 911 Turbo Coupe"], [1996, "RoW 1996 Porsche 911 Turbo WLS2 Conversion"], [1996, "17k-Mile 1996 Porsche 911 Turbo"], [1998, "19k-Mile 1998 Porsche 911 Carrera S Coupe 6-Speed"], [2011, "8k-Mile 2011 Porsche 911 Turbo S Cabriolet"], [2005, "35k-Mile 2005 Porsche 911 Turbo S Coupe 6-Speed"]];
const xs = CARS.map(([year, title], i) => { const r = { id: i + 1, year, make: "Porsche", model: "911", listing_title: title, colour: "red" }; return { r, facts: listingFacts(r), gen: genFor("Porsche", "911", year, title), unknown: [] }; });
const v = { make: "Porsche", model: "911" }, gens = [{ code: "stand-in" }];   // gens only gates whether an era may be asked
const asks = askRule(xs, { p: { make: "Porsche", model: "911", colour: "red" }, v, gens });
const era = asks.find(a => a.dim === "generation");
ok(!!era, "the era question is asked");
const codeOf = x => x.gen && x.gen.code;
console.log("cards say:", JSON.stringify(Object.entries(xs.reduce((m, x) => (m[codeOf(x)] = (m[codeOf(x)] || 0) + 1, m), {}))));
console.log("chips:", JSON.stringify(era && era.chips.map(c => `${c.label} (${c.n}) era=${c.patch.era}`)), "| any:", era && `${era.any.label} (${era.any.n})`);
for (const c of (era && era.chips) || []) {
  const codes = String(c.patch.era).split(",");
  const say = xs.filter(x => codes.includes(codeOf(x))).length;
  ok(c.n === say, `${c.label}: the chip's count (${c.n}) equals the cards that say ${codes.join("/")} (${say})`);
  ok(!("year_min" in c.patch) && !("year_max" in c.patch), `${c.label}: the patch carries codes only, no year span`);
}
const chipFor = code => era && era.chips.find(c => String(c.patch.era).split(",").includes(code));
ok(xs.filter(x => /2005 Porsche 911 Turbo S/.test(x.r.listing_title)).every(x => codeOf(x) === "996") && chipFor("996") && chipFor("996").n === 3, "the two 2005 Turbo S cars are 996 and sit under the 996 chip (3 cars say 996)");
ok(chipFor("997") && chipFor("997").n === 1, "the 997 chip counts the one card that says 997");
ok(chipFor("991.1") && chipFor("991.1").label === "991.1" && chipFor("991.1").n === 1, "the 2012 991.1 Turbo S has its own chip");
ok(era && era.any.label === "Any 911" && era.any.n === 22, `the chips end with "Any 911 (22)" (${era && era.any.label} ${era && era.any.n})`);
ok(era && era.unstated === 0, "no car falls under no chip");
ok(!xs.some(x => codeOf(x) === "992"), "no 992 is among these cars, so no 992 chip");
// the tap: the chip's patch becomes the search's exact-code filter (samChat filtersOf: era -> f.gens) and the search keeps a
// card only when its own genFor code is in f.gens (lib/live/search.js), so the header count after the tap is the chip's count
for (const c of (era && era.chips) || []) { const gensF = String(c.patch.era).split(","); const kept = xs.filter(x => x.gen && gensF.includes(x.gen.code)).length; ok(kept === c.n, `${c.label}: the tap keeps ${kept}, the chip said ${c.n}`); }
const src = (await import("node:fs")).readFileSync(new URL("../lib/live/samChat.js", import.meta.url), "utf8");
ok(/if \(v && p\.era && !f\.gens\.length\) \{[^\n]*f\.gens = codes/.test(src), "samChat filtersOf maps an era patch to f.gens (the exact-code filter)");
// the air-cooled era, once chosen, splits into its own codes, each counted by its cards
const air = era && era.chips.find(c => /Air-cooled/.test(c.label));
if (air) { const sub = askRule(xs.filter(x => String(air.patch.era).split(",").includes(codeOf(x))), { p: { make: "Porsche", model: "911", era: air.patch.era }, v, gens }).find(a => a.dim === "generation");
  ok(!!sub && sub.chips.every(c => c.n === xs.filter(x => String(c.patch.era).split(",").includes(codeOf(x))).length), `inside Air-cooled: each code's chip counts its own cards (${JSON.stringify(sub && sub.chips.map(c => c.label + " " + c.n))})`); }
console.log(`eraChipsCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
