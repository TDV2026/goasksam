import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setCookie({ name: "gas_crew", value: "ok", domain: "goasksam.com", path: "/" });
await p.goto("https://goasksam.com/sell", { waitUntil: "networkidle2" });
const run = (f) => p.evaluate(async (ff) => { const r = await fetch("/api/sellerDecision", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ desk: true, action: "run", dsl: { filters: { ...ff, window: "36mo" }, groupBy: [], measures: ["count"] } }) }); const j = await r.json(); return j.status === "ok" ? (j.answer.total + " | " + (j.receipts || []).slice(0,2).map(x=>(x.title||"").slice(0,38)).join(" ; ")) : ("[" + j.status + "]"); }, f);
const T = [
 ["8 Charger R/T", {make:"Dodge",model:"Charger",trim:"R/T",year_min:1968,year_max:1970}],
 ["9 GT350 make=Shelby", {make:"Shelby",model:"GT350",year_min:1965,year_max:1967}],
 ["9 GT350 make=Ford", {make:"Ford",model:"GT350",year_min:1965,year_max:1967}],
 ["9 GT350 make=Shelby trim", {make:"Shelby",model:"Mustang",trim:"GT350",year_min:1965,year_max:1967}],
 ["18 RS2.7 trim=Carrera RS", {make:"Porsche",model:"911",trim:"Carrera RS",year_min:1973,year_max:1973}],
 ["33 Speedster", {make:"Porsche",model:"911",trim:"Speedster",year_min:1988,year_max:1990}],
 ["35 928 GTS", {make:"Porsche",model:"928",trim:"GTS",year_min:1993,year_max:1995}],
 ["39 308 QV=Quattrovalvole", {make:"Ferrari",model:"308",trim:"Quattrovalvole",year_min:1983,year_max:1985}],
 ["50 ZR1 (no hyphen)", {make:"Chevrolet",model:"Corvette",trim:"ZR1",year_min:1990,year_max:1992}],
 ["79 SLS model=SLS", {make:"Mercedes-Benz",model:"SLS",year_min:2011,year_max:2013}],
 ["79 SLS model=SLS AMG", {make:"Mercedes-Benz",model:"SLS AMG",year_min:2011,year_max:2013}],
 ["82 Carrera T", {make:"Porsche",model:"911",trim:"Carrera T",year_min:2018,year_max:2019}],
 ["91 Huracan trim=LP610", {make:"Lamborghini",model:"Huracan",trim:"LP610",year_min:2015,year_max:2016}],
 ["91 Huracan no trim", {make:"Lamborghini",model:"Huracan",year_min:2015,year_max:2016}],
];
for (const [name, f] of T) console.log(name.padEnd(28), "=>", await run(f));
await b.close();
