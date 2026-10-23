// enthusiastTermsCheck (Lane B, Oct 23 2026, Sam's order: "air cooled Porsche" returned all 167 Porsches): offline, no network. The
// two group terms are understood once (lib/enthusiastTerms.js) and read the same by the resolver (Market Check, Sell, Tasks ask) and
// by Buy's live search (Buy and Tasks): air-cooled = the 911 through 1998 plus the 356, 912, 914, 930, 964, 993; water-cooled = the 911
// from 1999 (996 on) plus Boxster and Cayman. A make without the term (a Ford, a VW Beetle) is untouched; an unreadable year is not counted.
globalThis.fetch = async () => { throw new Error("blocked"); };
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const { TERMS, enthusiastTermsIn, withoutTerms, termsMatch } = await import("../lib/enthusiastTerms.js");
const { resolveVehicle } = await import("../lib/vehicle.js");
const { searchLive, parseQueryResolved } = await import("../lib/live/search.js");
let bad = 0;
const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) bad++; };
const [air, wat] = TERMS;
const kind = (model, year) => { const c = { make: "Porsche", model, year, title: `${year} Porsche ${model}` }; return air.match(c) ? "air" : wat.match(c) ? "water" : null; };
const CASES = [["911", 1973, "air"], ["911", 1998, "air"], ["911", 1999, "water"], ["993", 1996, "air"], ["964", 1990, "air"], ["930", 1980, "air"], ["356", 1960, "air"], ["912", 1966, "air"], ["914", 1973, "air"],
  ["996", 2001, "water"], ["997", 2008, "water"], ["991", 2015, "water"], ["992", 2021, "water"], ["Boxster", 1999, "water"], ["Cayman", 2008, "water"], ["718 Cayman", 2020, "water"],
  ["924", 1980, null], ["944", 1987, null], ["928", 1985, null], ["968", 1993, null], ["Cayenne", 2005, null], ["Panamera", 2012, null], ["Macan", 2016, null], ["550 Spyder", 1955, null], ["Taycan", 2021, null], ["911", null, null]];
for (const [m, y, w] of CASES) ok(kind(m, y) === w, `${m} ${y == null ? "(no year)" : y}: ${w || "neither group"} (${kind(m, y) || "neither"})`);
ok(enthusiastTermsIn("air cooled Porsche", "Porsche").length === 1 && enthusiastTermsIn("Air-Cooled porsche 911", "").length === 1 && enthusiastTermsIn("watercooled Porsche", "Porsche")[0].key === "water-cooled", "the words are found (air cooled, Air-Cooled, watercooled)");
ok(enthusiastTermsIn("air cooled Ford", "Ford").length === 0 && enthusiastTermsIn("air-cooled VW Beetle", "Volkswagen").length === 0, "a make without the term (Ford, VW Beetle) is untouched");
ok(withoutTerms("2019 water cooled Porsche", enthusiastTermsIn("2019 water cooled Porsche", "Porsche")) === "2019 Porsche", "the term's words come out before the resolver reads");
// the resolver: Market Check, Sell and Tasks asks
const r = await resolveVehicle("air cooled Porsche", {});
ok(r.status === "needs_clarification" && r.vehicle.make === "Porsche" && r.vehicle.group[0] === "air-cooled" && ["911", "356", "912", "914", "930"].every(x => r.clarification.chips.includes(x)) && /Air-cooled Porsche/.test(r.clarification.question), `"air cooled Porsche" asks which model of the group (${r.clarification && r.clarification.chips.join(", ")})`);
const w = await resolveVehicle("2019 water cooled Porsche", {});
ok(w.vehicle.model !== "Water" && w.vehicle.group[0] === "water-cooled" && w.clarification.chips.includes("Boxster"), "'2019 water cooled Porsche' no longer reads the model as 'Water'");
const f = await resolveVehicle("air-cooled VW Beetle", {});
ok(!f.vehicle.group, "air-cooled VW Beetle carries no Porsche group");
// Buy and Tasks: the live search, over injected rows
const NOW = Date.now();
const row = (id, title, model, year) => ({ id, listing_title: title, make: "Porsche", model, year, end_time: new Date(NOW + 3 * 86400e3).toISOString(), current_bid_usd: 90000, price_usd: 90000, status: "live", source: "bringatrailer", photo_url: "x", mileage: 20000, vin_norm: "V" + id });
const ROWS = [row(1, "1973 Porsche 911 T", "911", 1973), row(2, "1995 Porsche 993 Carrera", "993", 1995), row(3, "1962 Porsche 356B", "356", 1962), row(4, "2008 Porsche 997 Carrera S", "997", 2008),
  row(5, "2001 Porsche Boxster S", "Boxster", 2001), row(6, "1987 Porsche 944 Turbo", "944", 1987), row(7, "2006 Porsche Cayenne", "Cayenne", 2006), row(8, "1999 Porsche 911 Carrera", "911", 1999), row(9, "1985 Porsche 911 Carrera", "911", 1985)];
async function run(q) { const p = await parseQueryResolved(q, {}); const { rows } = await searchLive({}, p.vehicle, p.filters, p.text, { rows: ROWS }); return rows.map(x => x.r.id).sort((a, b) => a - b).join(","); }
ok(await run("air cooled Porsche") === "1,2,3,9", `Buy "air cooled Porsche": only the air-cooled cars (${await run("air cooled Porsche")})`);
ok(await run("water-cooled Porsche") === "4,5,8", `Buy "water-cooled Porsche": only the water-cooled cars (${await run("water-cooled Porsche")})`);
ok((await run("Porsche")).split(",").length === 9, "Buy 'Porsche': all nine, unchanged");
// impact bumper (= G-body), long hood, ponton, fintail: the definitions Sam approved (Oct 23 2026)
const [,, bump, hood, pont, fint] = TERMS;
const K = (term, model, year, title, make = "Porsche") => term.match({ make, model, year, title: title || `${year} ${make} ${model}` });
ok(K(bump, "911", 1974) && K(bump, "911", 1988) && K(bump, "930", 1980) && K(bump, "911", 1989, "1989 Porsche 911 Carrera"), "impact bumper: the 911 and 930 Turbo, 1974 to 1989 (a 1989 car that names no 964 stays in)");
ok(!K(bump, "911", 1973) && !K(bump, "911", 1990) && !K(bump, "964", 1990) && !K(bump, "993", 1996) && !K(bump, "911", 1989, "1989 Porsche 911 Carrera 4") && !K(bump, "911", 1989, "1989 Porsche 964 Carrera"), "impact bumper: not 1973, not the 964 or 993, and the 1989 car that names 964 or Carrera 4 is the 964 (left out)");
ok(K(hood, "911", 1964) && K(hood, "912", 1967) && K(hood, "911", 1973) && !K(hood, "911", 1974) && !K(hood, "914", 1970), "long hood: the 911 and 912, 1964 to 1973");
ok(enthusiastTermsIn("G-body 911", "").map(x => x.key).join() === "impact-bumper" && enthusiastTermsIn("impact bumper Porsche", "Porsche").length === 1 && enthusiastTermsIn("G-body Monte Carlo", "").length === 0 && enthusiastTermsIn("G-body Buick Regal", "Buick").length === 0, "G-body counts only in a Porsche context (GM's G-body is left alone)");
const MBZ = (model, year, title) => ({ make: "Mercedes-Benz", model, year, title: title || `${year} Mercedes-Benz ${model}` });
ok(pont.match(MBZ("180", 1957)) && pont.match(MBZ("190", 1958)) && pont.match(MBZ("219", 1957)) && pont.match(MBZ("220S", 1957)) && !pont.match(MBZ("190SL", 1958)) && !pont.match(MBZ("190E", 1988)) && !pont.match(MBZ("220", 1962)), "ponton: 180, 190, 219, 220/220S/220SE of the 1950s; not the 190 SL, the 190 E, or a 1962 220");
ok(fint.match(MBZ("190", 1963)) && fint.match(MBZ("230S", 1966)) && fint.match(MBZ("220SE", 1963)) && fint.match(MBZ("300SE", 1963)) && fint.match(MBZ("250SE", 1967)) && !fint.match(MBZ("190", 1958)) && !fint.match(MBZ("220", 1959)) && !pont.match(MBZ("220", 1959)), "fintail: 190, 200, 220b, 230, 250, 300SE of 1959 to 1968; the 1959 220 is in neither (a gap, not a guess)");
ok(pont.match(MBZ("300", 1957, "1957 Mercedes-Benz 300 ponton")) && fint.match(MBZ("S-Class", 1962, "1962 Mercedes-Benz fintail 300SE")), "the word in the title decides first");
const gb = await resolveVehicle("G-body 911", {});
ok(gb.status === "needs_clarification" && gb.clarification.chips.includes("1980 Porsche 911") && !/1989 Porsche/.test(gb.clarification.chips.join()), "'G-body 911' asks which years of the three generations; the chips are plain years");
const pm = await resolveVehicle("ponton Mercedes", {});
ok(pm.vehicle.make === "Mercedes-Benz" && pm.clarification.chips.includes("220"), "'ponton Mercedes' asks which ponton");
console.log(bad ? `enthusiastTermsCheck: ${bad} failed` : "enthusiastTermsCheck: all passed");
process.exit(bad ? 1 : 0);
