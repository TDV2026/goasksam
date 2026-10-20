// gearboxStrictCheck (Lane B, Oct 20 2026, Sam's rule): the engine reads MANUAL only when the listing says manual, stick, gated,
// G50 or MT; a bare "N-speed" is not stated on every car (an F430 F1 and a Gallardo E-Gear are six-speeds too); Getrag alone is not
// manual (Getrag also makes dual-clutch gearboxes). lib/onebox.js gearboxType and lib/_descFacts.js transmissionFromText. Offline.
globalThis.fetch = async () => { throw new Error("network blocked in check"); };
const ob = await import("../lib/onebox.js");
const { transmissionFromText } = await import("../lib/_descFacts.js");
const g = ob.__specEngine.gearboxType;
let bad = 0;
const ok = (c, m) => { if (c) console.log("ok   " + m); else { bad++; console.log("FAIL " + m); } };
const row = (title, transmission = "", year = null) => ({ title, raw_title: title, rtitle: title, transmission, year });
ok(g(row("1992 Porsche 911 Carrera 2 Coupe 5-Speed", "", 1992)) === null, "a pre-2005 bare 5-Speed is not stated (the old pre-2005 rule is gone)");
ok(g(row("1992 Porsche 911 Carrera 2 Coupe", "Manual (5-speed)", 1992)) === "manual", "a stored \"Manual (5-speed)\" still reads manual");
ok(g(row("2006 Ferrari F430 Spider 6-Speed", "", 2006)) === null, "an F430 titled \"6-Speed\" is not stated");
ok(g(row("2006 Ferrari F430 Spider", "(6-speed)", 2006)) === null, "a stored bare \"(6-speed)\" is not stated");
ok(g(row("1989 Porsche 911 Carrera G50", "", 1989)) === "manual", "G50 reads manual");
ok(g(row("2003 Honda S2000 MT", "", 2003)) === "manual", "MT reads manual");
ok(g(row("1999 BMW M3 Getrag", "", 1999)) === null, "Getrag alone is not manual");
ok(g(row("1967 Ford Mustang Fastback 4-Speed Manual", "", 1967)) === "manual", "\"Manual\" in the title reads manual");
ok(g(row("2008 Ferrari F430 F1", "", 2008)) === "auto", "F1 reads automatic");
ok(transmissionFromText("1999 BMW M3", "Power goes through a Getrag five-speed.") === null, "transmissionFromText: Getrag alone is no gearbox claim");
ok(transmissionFromText("1989 Porsche 911", "The G50 gearbox was rebuilt.") === "Manual", "transmissionFromText: G50 stays manual");
console.log(bad ? `gearboxStrictCheck: ${bad} failed` : "gearboxStrictCheck: all passed");
process.exit(bad ? 1 : 0);
