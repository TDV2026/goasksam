// basisPoolCheck (Lane B, Oct 23 2026): the shared card's basis line names the pool when it differs from the car's title.
globalThis.fetch = async () => { throw new Error("blocked"); };
const { __specEngine } = await import("../lib/onebox.js");
const f = __specEngine.poolBasisPhrase;
let bad = 0;
const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) bad++; };
ok(f("911 Carrera RS models, 1992 to 1993, Touring cars", "911") === "1992 to 1993 Carrera RS Touring cars", "the Carrera RS Touring pool is named in the basis phrase");
ok(f("Boxster models, 1999 to 2004", "Boxster") === "1999 to 2004 Boxster", "a single-word model keeps its name");
ok(f("911 Carrera models, 2003 to 2004, Targa cars, 2 Cabriolet cars set aside", "911") === "2003 to 2004 Carrera Targa cars", "set-aside parentheses are left to the footnote");
ok(f("Carrera, all years", "911") === "Carrera cars from all years", "all years");
ok(f("2020 911 Carrera 4S Coupe", "911") === null, "a pool that matches the title keeps the plain basis line");
const { sellsForCardHtml } = await import("../lib/sellsForCard.js");
const html = sellsForCardHtml({ cluster: [20000, 30000], poolN: 8, basisLine: "Based on eight sales of 1992 to 1993 Carrera RS Touring cars, the latest in August 2026.", basisPool: "1992 to 1993 Carrera RS Touring cars" });
ok(/Based on eight sales of 1992 to 1993 Carrera RS Touring cars, the latest in August 2026\./.test(html) && /The typical range for cars like this\./.test(html), "the card prints the basis line and the unchanged typical-range wording");
console.log(bad ? `basisPoolCheck: ${bad} failed` : "basisPoolCheck: all passed");
process.exit(bad ? 1 : 0);
