import puppeteer from "puppeteer-core";
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setCookie({ name: "gas_crew", value: "ok", domain: "goasksam.com", path: "/" });
await p.goto("https://goasksam.com/sell", { waitUntil: "networkidle2" });
// Raw pool for air-cooled 911 at houses via the pool probe across the 4 gens, with URLs
const gens = [[1964,1973],[1974,1988],[1990,1994],[1994,1998]];
let rows = [];
for (const [ymin,ymax] of gens) {
  const r = await p.evaluate(async (a) => (await fetch("/api/sellerDecision",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({desk:false,archiveQuery:"pool",term:"911",make:"Porsche",yearMin:a[0],yearMax:a[1],dateFrom:"2024-09-23",dateTo:"2026-09-23"})})).json(), [ymin,ymax]);
  rows = rows.concat(r.rows||[]);
}
const HOUSES = ["RM Sotheby's","Gooding & Co","Gooding Christie's","Bonhams","Broad Arrow","Barrett-Jackson","Mecum Auctions"];
const houseRows = rows.filter(r => HOUSES.includes(r.platform));
console.log("total pool rows:", rows.length, "| house rows:", houseRows.length);
console.log("\n=== G-body check: SC + Carrera 3.2 titles present? ===");
console.log("911 SC:", rows.filter(r=>/\bSC\b/i.test(r.title||"")).slice(0,3).map(r=>r.year+" "+r.title).join(" | ") || "NONE");
console.log("Carrera 3.2:", rows.filter(r=>/carrera 3\.2|3\.2 carrera/i.test(r.title||"")).slice(0,3).map(r=>r.year+" "+r.title).join(" | ") || "NONE");
console.log("\n=== house URL slug patterns (venue | url) - looking for online markers ===");
const seen = {};
for (const r of houseRows) { const key = r.platform; if (!seen[key]) seen[key]=[]; if (seen[key].length<4 && r.url) seen[key].push(r.url); }
for (const k of Object.keys(seen)) { console.log(k+":"); seen[k].forEach(u=>console.log("   ", u)); }
await b.close();
